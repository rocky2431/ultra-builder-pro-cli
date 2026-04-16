'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-ops-'));
  return { dir, file: path.join(dir, 'state.db') };
}

function freshDb() {
  const t = tmpDb();
  const init = initStateDb(t.file);
  return { ...t, db: init.db };
}

test('createTask inserts a row, defaults status=pending, emits task_created', () => {
  const { dir, db } = freshDb();
  try {
    const out = ops.createTask(db, {
      id: 'task-001', title: 'first task', type: 'feature', priority: 'P1',
    });
    assert.equal(out.id, 'task-001');
    assert.equal(out.status, 'pending');
    const events = db.prepare('SELECT type, task_id FROM events').all();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'task_created');
    assert.equal(events[0].task_id, 'task-001');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createTask rejects duplicates with DUPLICATE_TASK_ID', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'dup', title: 'one', type: 'feature', priority: 'P0' });
    assert.throws(
      () => ops.createTask(db, { id: 'dup', title: 'two', type: 'feature', priority: 'P0' }),
      (e) => e.code === 'DUPLICATE_TASK_ID',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('updateTaskStatus enforces the legal transition graph', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't', title: 'x', type: 'feature', priority: 'P0' });

    // pending → in_progress allowed
    const t1 = ops.updateTaskStatus(db, 't', 'in_progress');
    assert.equal(t1.status, 'in_progress');

    // in_progress → completed allowed
    const t2 = ops.updateTaskStatus(db, 't', 'completed');
    assert.equal(t2.status, 'completed');

    // completed → pending forbidden
    assert.throws(
      () => ops.updateTaskStatus(db, 't', 'pending'),
      (e) => e.code === 'ILLEGAL_STATUS_TRANSITION',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchTask updates JSON arrays + flags + status atomically', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'p1', title: 'patch me', type: 'feature', priority: 'P2' });
    const out = ops.patchTask(db, 'p1', {
      files_modified: ['a.ts', 'b.ts'],
      session_id: 'ses_1',
      stale: true,
      status: 'in_progress',
    });
    assert.deepEqual(out.files_modified, ['a.ts', 'b.ts']);
    assert.equal(out.session_id, 'ses_1');
    assert.equal(out.stale, true);
    assert.equal(out.status, 'in_progress');

    const types = db.prepare('SELECT type FROM events ORDER BY id').all().map((r) => r.type);
    assert.deepEqual(types, ['task_created', 'task_started']);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchTask rejects unknown fields', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'r', title: 'r', type: 'feature', priority: 'P1' });
    assert.throws(
      () => ops.patchTask(db, 'r', { mystery: 1 }),
      (e) => e.code === 'VALIDATION_ERROR',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendEvent + subscribeEventsSince produces monotonic cursor with no gaps', () => {
  const { dir, db } = freshDb();
  try {
    for (let i = 0; i < 10; i++) {
      ops.appendEvent(db, {
        type: 'task_created', task_id: `t-${i}`, payload: { i },
      });
    }
    const first = ops.subscribeEventsSince(db, { since_id: 0, limit: 4 });
    assert.equal(first.events.length, 4);
    assert.equal(first.events[0].id, 1);
    assert.equal(first.next_since_id, 4);

    const second = ops.subscribeEventsSince(db, { since_id: first.next_since_id, limit: 100 });
    assert.equal(second.events.length, 6);
    assert.equal(second.events[0].id, 5);
    assert.equal(second.next_since_id, 10);

    const empty = ops.subscribeEventsSince(db, { since_id: second.next_since_id });
    assert.equal(empty.events.length, 0);
    assert.equal(empty.next_since_id, second.next_since_id);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('subscribeEventsSince filters by type', () => {
  const { dir, db } = freshDb();
  try {
    ops.appendEvent(db, { type: 'task_created', task_id: 'a' });
    ops.appendEvent(db, { type: 'task_started', task_id: 'a' });
    ops.appendEvent(db, { type: 'task_completed', task_id: 'a' });
    const r = ops.subscribeEventsSince(db, { since_id: 0, types: ['task_completed'] });
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].type, 'task_completed');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createSession requires existing task and emits session_spawned', () => {
  const { dir, db } = freshDb();
  try {
    assert.throws(
      () => ops.createSession(db, {
        sid: 's', task_id: 'missing', runtime: 'claude',
        worktree_path: '/tmp/wt', artifact_dir: '/tmp/art',
      }),
      (e) => e.code === 'TASK_NOT_FOUND',
    );

    ops.createTask(db, { id: 'have', title: 'h', type: 'feature', priority: 'P1' });
    const ses = ops.createSession(db, {
      sid: 's1', task_id: 'have', runtime: 'claude',
      worktree_path: '/tmp/wt', artifact_dir: '/tmp/art', lease_seconds: 60,
    });
    assert.equal(ses.sid, 's1');
    assert.equal(ses.status, 'running');
    const evt = db.prepare(`SELECT type FROM events WHERE session_id = 's1'`).get();
    assert.equal(evt.type, 'session_spawned');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('updateSession status=completed emits session_closed', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'k', title: 'k', type: 'feature', priority: 'P1' });
    ops.createSession(db, {
      sid: 'sx', task_id: 'k', runtime: 'codex',
      worktree_path: '/tmp/wt', artifact_dir: '/tmp/art',
    });
    const out = ops.updateSession(db, 'sx', { status: 'completed' });
    assert.equal(out.status, 'completed');
    const types = db.prepare(`SELECT type FROM events WHERE session_id = 'sx' ORDER BY id`).all().map((r) => r.type);
    assert.deepEqual(types, ['session_spawned', 'session_closed']);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listActiveSessions returns only running rows for a task', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'm', title: 'm', type: 'feature', priority: 'P1' });
    ops.createSession(db, { sid: 'a', task_id: 'm', runtime: 'claude', worktree_path: '/tmp/a', artifact_dir: '/tmp/a' });
    ops.createSession(db, { sid: 'b', task_id: 'm', runtime: 'codex',  worktree_path: '/tmp/b', artifact_dir: '/tmp/b' });
    ops.updateSession(db, 'a', { status: 'completed' });
    const active = ops.listActiveSessions(db, { task_id: 'm' });
    assert.equal(active.length, 1);
    assert.equal(active[0].sid, 'b');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleteTask refuses when a session is bound unless force=true', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'dl', title: 'd', type: 'feature', priority: 'P1' });
    ops.patchTask(db, 'dl', { session_id: 'ses_x' });
    assert.throws(
      () => ops.deleteTask(db, 'dl'),
      (e) => e.code === 'SESSION_ACTIVE',
    );
    const r = ops.deleteTask(db, 'dl', { force: true });
    assert.equal(r.ok, true);
    assert.equal(ops.readTask(db, 'dl'), null);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listTasks filters by status / tag', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'a', title: 'a', type: 'feature', priority: 'P0', tag: 'main' });
    ops.createTask(db, { id: 'b', title: 'b', type: 'bugfix',  priority: 'P1', tag: 'feat-x' });
    ops.createTask(db, { id: 'c', title: 'c', type: 'feature', priority: 'P2', tag: 'main' });
    ops.updateTaskStatus(db, 'a', 'in_progress');

    const inProg = ops.listTasks(db, { status: 'in_progress' });
    assert.equal(inProg.length, 1);
    assert.equal(inProg[0].id, 'a');

    const onMain = ops.listTasks(db, { tag: 'main' });
    assert.equal(onMain.length, 2);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tx() rolls back on error so events are not partially written', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'r', title: 'r', type: 'feature', priority: 'P1' });
    const before = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    assert.throws(() => ops.tx(db, () => {
      db.prepare(`INSERT INTO events (type) VALUES ('task_created')`).run();
      throw new Error('boom');
    }));
    const after = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
    assert.equal(after, before, 'rollback must remove the partial event row');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listStaleTasks finds running sessions whose heartbeat is older than grace', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'k', title: 'k', type: 'feature', priority: 'P0' });
    ops.createSession(db, { sid: 'old', task_id: 'k', runtime: 'claude', worktree_path: '/tmp/o', artifact_dir: '/tmp/o' });
    db.prepare(`UPDATE sessions SET heartbeat_at = '2000-01-01T00:00:00.000Z' WHERE sid = 'old'`).run();
    const stale = ops.listStaleTasks(db, 60);
    assert.equal(stale.length, 1);
    assert.equal(stale[0].id, 'k');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
