'use strict';

// Phase 5.3 — Task staleness consumer:
//   • markTasksStaleBySpecSections: UPDATE pending tasks whose trace_to
//     matches a changed spec section → stale=1 + task_stale_marked event.
//   • consumeSpecChangedEvents: pulls unprocessed spec_changed events from
//     the event stream and applies the rule above, advancing a cursor.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const projector = require('../lib/projector.cjs');

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-stale-'));
  const file = path.join(dir, 'state.db');
  const init = initStateDb(file);
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function seed(db, id, { trace_to, status = 'pending' } = {}) {
  ops.createTask(db, { id, title: `task ${id}`, type: 'feature', priority: 'P2', trace_to });
  if (status !== 'pending') ops.patchTask(db, id, { status });
}

test('markTasksStaleBySpecSections: marks pending tasks with matching trace_to', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-prod', { trace_to: 'product' });
    seed(db, 't-arch', { trace_to: 'arch' });
    seed(db, 't-exec', { trace_to: 'exec' });

    const result = ops.markTasksStaleBySpecSections(db, ['product']);
    assert.equal(result.marked_count, 1);
    assert.deepEqual(result.marked_ids, ['t-prod']);

    assert.equal(ops.readTask(db, 't-prod').stale, true);
    assert.equal(ops.readTask(db, 't-arch').stale, false);
    assert.equal(ops.readTask(db, 't-exec').stale, false);
  } finally { teardown(dir, db); }
});

test('markTasksStaleBySpecSections: multi-section update', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-a', { trace_to: 'product' });
    seed(db, 't-b', { trace_to: 'arch' });
    seed(db, 't-c', { trace_to: 'exec' });

    const result = ops.markTasksStaleBySpecSections(db, ['product', 'arch']);
    assert.equal(result.marked_count, 2);
    assert.ok(result.marked_ids.includes('t-a'));
    assert.ok(result.marked_ids.includes('t-b'));
    assert.equal(ops.readTask(db, 't-c').stale, false);
  } finally { teardown(dir, db); }
});

test('markTasksStaleBySpecSections: skips non-pending tasks', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-running', { trace_to: 'product' });
    ops.patchTask(db, 't-running', { status: 'in_progress' });

    seed(db, 't-done', { trace_to: 'product' });
    ops.patchTask(db, 't-done', { status: 'in_progress' });
    ops.patchTask(db, 't-done', { status: 'completed' });

    seed(db, 't-pending', { trace_to: 'product' });

    const result = ops.markTasksStaleBySpecSections(db, ['product']);
    assert.equal(result.marked_count, 1);
    assert.deepEqual(result.marked_ids, ['t-pending']);
  } finally { teardown(dir, db); }
});

test('markTasksStaleBySpecSections: emits task_stale_marked event per task', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-e1', { trace_to: 'product' });
    seed(db, 't-e2', { trace_to: 'product' });

    const { events: before } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    ops.markTasksStaleBySpecSections(db, ['product']);
    const { events: after } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });

    const marked = after.slice(before.length).filter((e) => e.type === 'task_stale_marked');
    assert.equal(marked.length, 2);
    const taskIds = marked.map((e) => e.task_id).sort();
    assert.deepEqual(taskIds, ['t-e1', 't-e2']);
  } finally { teardown(dir, db); }
});

test('markTasksStaleBySpecSections: idempotent — re-mark already-stale task does not double-emit', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-idem', { trace_to: 'product' });
    ops.markTasksStaleBySpecSections(db, ['product']);

    const { events: before } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });
    ops.markTasksStaleBySpecSections(db, ['product']);
    const { events: after } = ops.subscribeEventsSince(db, { since_id: 0, limit: 500 });

    const newEvents = after.slice(before.length);
    const marked = newEvents.filter((e) => e.type === 'task_stale_marked');
    assert.equal(marked.length, 0, 'should not re-emit for already-stale task');
  } finally { teardown(dir, db); }
});

test('consumeSpecChangedEvents: processes queued events and advances cursor', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-c1', { trace_to: 'product' });
    seed(db, 't-c2', { trace_to: 'arch' });

    ops.appendEvent(db, { type: 'spec_changed', payload: { sections: ['product'] } });
    ops.appendEvent(db, { type: 'spec_changed', payload: { sections: ['arch'] } });

    const result = ops.consumeSpecChangedEvents(db, { since_id: 0 });
    assert.equal(result.processed, 2);
    assert.ok(result.next_since_id > 0);
    assert.equal(ops.readTask(db, 't-c1').stale, true);
    assert.equal(ops.readTask(db, 't-c2').stale, true);
  } finally { teardown(dir, db); }
});

test('consumeSpecChangedEvents: cursor prevents reprocessing', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-cur', { trace_to: 'product' });
    ops.appendEvent(db, { type: 'spec_changed', payload: { sections: ['product'] } });

    const first = ops.consumeSpecChangedEvents(db, { since_id: 0 });
    assert.equal(first.processed, 1);

    // second call from the new cursor — no new spec_changed events.
    const second = ops.consumeSpecChangedEvents(db, { since_id: first.next_since_id });
    assert.equal(second.processed, 0);
    assert.equal(second.next_since_id, first.next_since_id);
  } finally { teardown(dir, db); }
});

test('consumeSpecChangedEvents: ignores non-spec_changed events', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-other', { trace_to: 'product' });
    ops.appendEvent(db, { type: 'task_failure', task_id: 't-other', payload: { reason: 'noise' } });

    const result = ops.consumeSpecChangedEvents(db, { since_id: 0 });
    assert.equal(result.processed, 0);
    assert.equal(ops.readTask(db, 't-other').stale, false);
  } finally { teardown(dir, db); }
});

test('projector: stale task context md carries STALE banner before body', () => {
  const { dir, db } = freshDb();
  const rootDir = dir;
  try {
    seed(db, 't-proj', { trace_to: 'product' });
    ops.markTasksStaleBySpecSections(db, ['product']);

    const result = projector.projectContext(db, 't-proj', {}, { rootDir });
    const text = fs.readFileSync(result.path, 'utf8');
    // Banner goes after YAML frontmatter end + blank line.
    const frontmatterEnd = text.indexOf('\n---', 3);
    assert.ok(frontmatterEnd > 0, 'frontmatter should exist');
    const body = text.slice(frontmatterEnd + 4);
    assert.match(body, /⚠️\s*STALE/, 'stale banner should render');
    assert.match(body, /spec/i, 'banner should mention spec');
  } finally { teardown(dir, db); }
});

test('projector: non-stale task context md has no STALE banner', () => {
  const { dir, db } = freshDb();
  try {
    seed(db, 't-fresh', { trace_to: 'product' });
    const result = projector.projectContext(db, 't-fresh', {}, { rootDir: dir });
    const text = fs.readFileSync(result.path, 'utf8');
    assert.doesNotMatch(text, /STALE/);
  } finally { teardown(dir, db); }
});
