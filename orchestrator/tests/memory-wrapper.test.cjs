'use strict';

// Phase 7.1 — Memory wrapper:
//   • autoRecallOnSpawn: task.title + task.trace_to → recall → prefetch.md
//   • autoRetainOnClose: session's events → retain facts/decisions/patterns

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const memory = require('../../mcp-server/lib/memory-store.cjs');
const wrapper = require('../memory-wrapper.cjs');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mw-'));
  const init = initStateDb(path.join(dir, 'state.db'));
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

test('autoRecallOnSpawn: writes prefetch.md with recalled entries', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't-1', title: 'Build auth flow', type: 'feature', priority: 'P1', trace_to: 'product#auth' });
    // Seed memory with relevant + irrelevant entries
    memory.retain(db, { kind: 'decision', content: 'JWT auth chosen over cookies', tag: null });
    memory.retain(db, { kind: 'decision', content: 'auth flow uses bcrypt for password hashing' });
    memory.retain(db, { kind: 'fact', content: 'billing uses Stripe checkout' }); // irrelevant

    const artifactDir = path.join(dir, 'artifacts', 'sess-x');
    const out = wrapper.autoRecallOnSpawn(db, { task_id: 't-1', artifact_dir: artifactDir });
    assert.ok(out.recalled >= 2, `expected ≥2 recalls, got ${out.recalled}`);
    const prefetch = path.join(artifactDir, 'prefetch.md');
    assert.ok(fs.existsSync(prefetch));
    const text = fs.readFileSync(prefetch, 'utf8');
    assert.match(text, /Prefetch for task t-1/);
    assert.match(text, /auth|JWT|bcrypt/);
  } finally { teardown(dir, db); }
});

test('autoRecallOnSpawn: missing task → no-op', () => {
  const { dir, db } = freshDb();
  try {
    const out = wrapper.autoRecallOnSpawn(db, { task_id: 'nope', artifact_dir: path.join(dir, 'a') });
    assert.equal(out.recalled, 0);
  } finally { teardown(dir, db); }
});

test('autoRecallOnSpawn: no matching memory → no prefetch.md', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't-empty', title: 'Quantum compute unit', type: 'feature', priority: 'P3' });
    memory.retain(db, { kind: 'fact', content: 'unrelated chat about cats' });
    const artifactDir = path.join(dir, 'art', 'sess-empty');
    const out = wrapper.autoRecallOnSpawn(db, { task_id: 't-empty', artifact_dir: artifactDir });
    assert.equal(out.recalled, 0);
    assert.ok(!fs.existsSync(path.join(artifactDir, 'prefetch.md')));
  } finally { teardown(dir, db); }
});

test('autoRetainOnClose: task_completed event → retained as decision', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't-c', title: 'Ship billing', type: 'feature', priority: 'P1' });
    ops.createSession(db, {
      sid: 'sess-c', task_id: 't-c', runtime: 'claude', pid: null,
      worktree_path: '/tmp/wt', artifact_dir: '/tmp/art',
    });
    ops.patchTask(db, 't-c', { status: 'in_progress' });
    // Simulate in-session completion via patch (emits task_completed + session_id context)
    ops.appendEvent(db, { type: 'task_completed', task_id: 't-c', session_id: 'sess-c', payload: { to: 'completed' } });

    const out = wrapper.autoRetainOnClose(db, 'sess-c');
    assert.ok(out.retained >= 1);

    const recalled = memory.recall(db, { query: 'completed', session_id: 'sess-c' });
    assert.ok(recalled.length >= 1);
    assert.match(recalled[0].content, /t-c|completed/i);
  } finally { teardown(dir, db); }
});

test('autoRetainOnClose: session_crashed → pattern; task_circuit_broken → error_fix', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't-x', title: 'Flaky task', type: 'bugfix', priority: 'P1' });
    ops.createSession(db, {
      sid: 'sess-x', task_id: 't-x', runtime: 'claude',
      worktree_path: '/tmp/w2', artifact_dir: '/tmp/a2',
    });
    ops.appendEvent(db, { type: 'session_crashed', task_id: 't-x', session_id: 'sess-x', payload: { from: 'running', to: 'crashed' } });
    ops.appendEvent(db, { type: 'task_circuit_broken', task_id: 't-x', session_id: 'sess-x', payload: { threshold: 3 } });

    const out = wrapper.autoRetainOnClose(db, 'sess-x');
    assert.ok(out.retained >= 2);

    const patterns = memory.recall(db, { query: 'crashed', session_id: 'sess-x' });
    assert.ok(patterns.some((p) => p.kind === 'pattern'));
    const fixes = memory.recall(db, { query: 'circuit', session_id: 'sess-x' });
    assert.ok(fixes.some((f) => f.kind === 'error_fix'));
  } finally { teardown(dir, db); }
});

test('autoRetainOnClose: missing session → no-op', () => {
  const { dir, db } = freshDb();
  try {
    const out = wrapper.autoRetainOnClose(db, 'sess-nope');
    assert.equal(out.retained, 0);
  } finally { teardown(dir, db); }
});

test('AC flow: 3 related sessions retained → 4th session autoRecall prefetches ≥2', () => {
  const { dir, db } = freshDb();
  try {
    // Three "auth" tasks complete
    for (let i = 1; i <= 3; i += 1) {
      const id = `auth-${i}`;
      ops.createTask(db, { id, title: `Auth task ${i}`, type: 'feature', priority: 'P1', trace_to: 'product#auth' });
      ops.createSession(db, {
        sid: `sess-a${i}`, task_id: id, runtime: 'claude',
        worktree_path: `/tmp/w${i}`, artifact_dir: `/tmp/a${i}`,
      });
      ops.patchTask(db, id, { status: 'in_progress' });
      ops.appendEvent(db, { type: 'task_completed', task_id: id, session_id: `sess-a${i}`, payload: { to: 'completed' } });
      wrapper.autoRetainOnClose(db, `sess-a${i}`);
    }
    // 4th task on same trace_to
    ops.createTask(db, { id: 'auth-4', title: 'New auth piece', type: 'feature', priority: 'P1', trace_to: 'product#auth' });
    const out = wrapper.autoRecallOnSpawn(db, {
      task_id: 'auth-4',
      artifact_dir: path.join(dir, 'art', 'sess-a4'),
    });
    assert.ok(out.recalled >= 2, `expected ≥2 prefetches from 3 prior sessions, got ${out.recalled}`);
  } finally { teardown(dir, db); }
});
