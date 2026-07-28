'use strict';

// Phase 5.2 — Circuit breaker:
// per-task consecutive failures ≥3 → trip; tripped tasks refused spawn.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-cb-'));
  const file = path.join(dir, 'state.db');
  const init = initStateDb(file);
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function seedTask(db, id) {
  ops.createTask(db, { id, title: 'cb target', type: 'feature', priority: 'P1' });
  return id;
}

test('isCircuitTripped: unrecorded task → false', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-1');
    assert.equal(ops.isCircuitTripped(db, 'cb-1'), false);
  } finally { teardown(dir, db); }
});

test('recordTaskFailure: 3 consecutive → trips + task_circuit_broken event', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-2');
    ops.recordTaskFailure(db, 'cb-2', { reason: 'test1' });
    assert.equal(ops.isCircuitTripped(db, 'cb-2'), false);
    ops.recordTaskFailure(db, 'cb-2', { reason: 'test2' });
    assert.equal(ops.isCircuitTripped(db, 'cb-2'), false);
    ops.recordTaskFailure(db, 'cb-2', { reason: 'test3' });
    assert.equal(ops.isCircuitTripped(db, 'cb-2'), true);

    const { events } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const brokenEvents = events.filter((e) => e.type === 'task_circuit_broken' && e.task_id === 'cb-2');
    assert.equal(brokenEvents.length, 1, 'circuit broken event should fire exactly once');
    const failures = events.filter((e) => e.type === 'task_failure' && e.task_id === 'cb-2');
    assert.equal(failures.length, 3);
  } finally { teardown(dir, db); }
});

test('recordTaskFailure: 4th + 5th failure does not re-emit task_circuit_broken', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-3');
    for (let i = 0; i < 5; i += 1) {
      ops.recordTaskFailure(db, 'cb-3', { reason: `test${i}` });
    }
    assert.equal(ops.isCircuitTripped(db, 'cb-3'), true);
    const { events } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    const brokenEvents = events.filter((e) => e.type === 'task_circuit_broken' && e.task_id === 'cb-3');
    assert.equal(brokenEvents.length, 1, 'should only emit on the trip transition');
  } finally { teardown(dir, db); }
});

test('resetCircuitBreaker: clears count and tripped_at', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-4');
    ops.recordTaskFailure(db, 'cb-4', { reason: 'x' });
    ops.recordTaskFailure(db, 'cb-4', { reason: 'x' });
    ops.recordTaskFailure(db, 'cb-4', { reason: 'x' });
    assert.equal(ops.isCircuitTripped(db, 'cb-4'), true);

    ops.resetCircuitBreaker(db, 'cb-4');
    assert.equal(ops.isCircuitTripped(db, 'cb-4'), false);

    // Next failure starts count at 1, not accumulating pre-reset.
    ops.recordTaskFailure(db, 'cb-4', { reason: 'x' });
    assert.equal(ops.isCircuitTripped(db, 'cb-4'), false);
    ops.recordTaskFailure(db, 'cb-4', { reason: 'x' });
    assert.equal(ops.isCircuitTripped(db, 'cb-4'), false);
  } finally { teardown(dir, db); }
});

test('admissionCheck: tripped task → can_spawn=false, recommended=blocked_by_breaker', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-5');
    for (let i = 0; i < 3; i += 1) ops.recordTaskFailure(db, 'cb-5', { reason: 'x' });

    const verdict = ops.admissionCheck(db, 'cb-5');
    assert.equal(verdict.can_spawn, false);
    assert.equal(verdict.recommended_action, 'blocked_by_breaker');
  } finally { teardown(dir, db); }
});

test('admissionCheck: reset after trip → can_spawn=true', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-6');
    for (let i = 0; i < 3; i += 1) ops.recordTaskFailure(db, 'cb-6', { reason: 'x' });
    ops.resetCircuitBreaker(db, 'cb-6');
    const verdict = ops.admissionCheck(db, 'cb-6');
    assert.equal(verdict.can_spawn, true);
  } finally { teardown(dir, db); }
});

test('custom threshold: fail_threshold=2 trips on 2nd failure', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-7');
    ops.recordTaskFailure(db, 'cb-7', { reason: 'x', fail_threshold: 2 });
    assert.equal(ops.isCircuitTripped(db, 'cb-7'), false);
    ops.recordTaskFailure(db, 'cb-7', { reason: 'x', fail_threshold: 2 });
    assert.equal(ops.isCircuitTripped(db, 'cb-7'), true);
  } finally { teardown(dir, db); }
});

test('crashOrphanSession atomically records one terminal transition and one failure', () => {
  const { dir, db } = freshDb();
  try {
    seedTask(db, 'cb-orphan');
    ops.createSession(db, {
      sid: 'cb-orphan-session',
      task_id: 'cb-orphan',
      runtime: 'codex',
      pid: 2147483646,
      worktree_path: '/tmp/cb-orphan-session',
      artifact_dir: '/tmp/cb-orphan-artifacts',
    });
    ops.updateSession(db, 'cb-orphan-session', { status: 'orphan' });

    const first = ops.crashOrphanSession(db, 'cb-orphan-session');
    const second = ops.crashOrphanSession(db, 'cb-orphan-session');

    assert.equal(first.changed, true);
    assert.equal(first.failure_recorded, true);
    assert.deepEqual(second, {
      changed: false,
      status: 'crashed',
      failure_recorded: false,
    });
    assert.equal(ops.readSession(db, 'cb-orphan-session').status, 'crashed');
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type = 'session_crashed'`,
      ).get('cb-orphan-session').count,
      1,
    );
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type = 'task_failure'`,
      ).get('cb-orphan-session').count,
      1,
    );
    assert.equal(
      db.prepare(
        'SELECT failure_count FROM circuit_breaker WHERE task_id = ?',
      ).get('cb-orphan').failure_count,
      1,
    );
  } finally { teardown(dir, db); }
});
