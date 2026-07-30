'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { initStateDb, openStateDb, closeStateDb } = require('../lib/state-db.cjs');
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

function seedChange(db, id, status = 'active') {
  db.prepare(
    `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'quick', ?, ?, ?)`,
  ).run(id, `Change ${id}`, status, `Intent for ${id}.`, `.ultra/changes/active/${id}`);
}

test('tx acquires the SQLite writer with an immediate transaction', () => {
  let deferredCalls = 0;
  let immediateCalls = 0;
  const transaction = () => { deferredCalls += 1; return 'deferred'; };
  transaction.immediate = () => { immediateCalls += 1; return 'immediate'; };
  const db = { transaction: () => transaction };

  assert.equal(ops.tx(db, () => 'value'), 'immediate');
  assert.equal(immediateCalls, 1);
  assert.equal(deferredCalls, 0);
});

test('createTask inserts a row, preserves estimated_days, defaults status=pending, emits task_created', () => {
  const { dir, db } = freshDb();
  try {
    const out = ops.createTask(db, {
      id: 'task-001', title: 'first task', type: 'feature', priority: 'P1', estimated_days: 2.5,
    });
    assert.equal(out.id, 'task-001');
    assert.equal(out.status, 'pending');
    assert.equal(out.estimated_days, 2.5);
    const events = db.prepare('SELECT type, task_id FROM events').all();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'task_created');
    assert.equal(events[0].task_id, 'task-001');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchTask updates estimated_days', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'estimate', title: 'estimate task', type: 'feature', priority: 'P2' });
    const out = ops.patchTask(db, 'estimate', { estimated_days: 1.5 });
    assert.equal(out.estimated_days, 1.5);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('task execution contract is durable, structured, and reports missing planning authority', () => {
  const { dir, db } = freshDb();
  try {
    const incomplete = ops.createTask(db, {
      id: 'contract-draft', title: 'draft execution contract', type: 'feature', priority: 'P1',
    });
    assert.ok(ops.taskContractBlockers(incomplete).includes('TASK_OUTCOME_MISSING'));

    const complete = ops.createTask(db, {
      id: 'contract-ready', title: 'complete execution contract', type: 'feature', priority: 'P0',
      outcome: 'Users can verify one public behavior end to end.',
      slice_kind: 'tracer_bullet',
      public_seam: 'CLI: ultra status --json',
      verification_command: 'npm test -- status-contract',
      acceptance: [{
        id: 'status-visible', criterion: 'The command returns the durable status.',
        verification: 'npm test -- status-contract',
      }],
      context_refs: [{
        ref: 'spec/mcp-tools.yaml',
        reason: 'Defines the public tool contract.',
        kind: 'spec',
        required: true,
        expected_digest: 'a'.repeat(64),
        anchor: 'task.create',
        scope: 'public-tool-contract',
        freshness_policy: 'digest',
      }],
      docs_impact: { status: 'required', files: ['README.md'], rationale: 'Public behavior changes.' },
      ownership: { owner: 'runtime-maintainer', reviewers: ['spec-reviewer'] },
      trace_to: '.ultra/specs/product.md#status',
    });
    assert.deepEqual(ops.taskContractBlockers(complete), []);
    assert.equal(complete.acceptance[0].id, 'status-visible');
    assert.equal(complete.docs_impact.status, 'required');
    assert.deepEqual(complete.context_refs[0], {
      ref: 'spec/mcp-tools.yaml',
      reason: 'Defines the public tool contract.',
      kind: 'spec',
      required: true,
      expected_digest: 'a'.repeat(64),
      anchor: 'task.create',
      scope: 'public-tool-contract',
      freshness_policy: 'digest',
    });
  } finally {
    closeStateDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a stale task requires a complete contract rebind and records Change authority provenance', () => {
  const { dir, db } = freshDb();
  try {
    seedChange(db, 'reconcile-change');
    ops.createTask(db, {
      id: 'reconcile-task',
      title: 'reconcile execution contract',
      type: 'feature',
      priority: 'P1',
      change_id: 'reconcile-change',
      deps: [],
      files_modified: ['src/reconcile.js'],
      outcome: 'The reconciled behavior remains observable.',
      slice_kind: 'tracer_bullet',
      public_seam: 'CLI reconcile output',
      verification_command: 'npm test -- reconcile',
      acceptance: [{
        id: 'reconciled',
        criterion: 'The current Change intent is implemented.',
        verification: 'npm test -- reconcile',
      }],
      context_refs: [{ ref: 'src/reconcile.js', reason: 'Live behavior.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'No public documentation change.' },
      ownership: { owner: 'runtime-maintainer', reviewers: [] },
      trace_to: '.ultra/specs/product.md#reconciled',
    });
    ops.patchTask(db, 'reconcile-task', { stale: true });
    assert.throws(
      () => ops.patchTask(db, 'reconcile-task', { stale: false }),
      (error) => error.code === 'TASK_STALE_RECONCILIATION_REQUIRED'
        && error.details.missing_fields.includes('outcome'),
    );

    const current = ops.readTask(db, 'reconcile-task');
    const reconciled = ops.patchTask(db, current.id, {
      stale: false,
      deps: current.deps,
      files_modified: current.files_modified,
      trace_to: current.trace_to,
      outcome: current.outcome,
      slice_kind: current.slice_kind,
      public_seam: current.public_seam,
      verification_command: current.verification_command,
      acceptance: current.acceptance,
      context_refs: current.context_refs,
      docs_impact: current.docs_impact,
      ownership: current.ownership,
    });
    assert.equal(reconciled.stale, false);
    const events = ops.subscribeEventsSince(db, { since_id: 0 }).events;
    const event = events.find((item) => item.type === 'task_contract_reconciled');
    assert.equal(event.task_id, current.id);
    assert.match(event.payload.change_authority_digest, /^[0-9a-f]{64}$/);
    assert.ok(event.payload.fields.includes('verification_command'));
  } finally {
    closeStateDb(db);
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

test('createTask preserves parent change ownership and rejects terminal change targets', () => {
  const { dir, db } = freshDb();
  try {
    seedChange(db, 'change-a');
    seedChange(db, 'change-b');
    seedChange(db, 'change-closed', 'archived');
    ops.createTask(db, {
      id: 'parent-owned', title: 'owned parent', type: 'feature', priority: 'P1',
      change_id: 'change-a',
    });
    const inherited = ops.createTask(db, {
      id: 'child-inherited', title: 'inherited child', type: 'feature', priority: 'P1',
      parent_id: 'parent-owned',
    });
    assert.equal(inherited.change_id, 'change-a');
    assert.throws(
      () => ops.createTask(db, {
        id: 'child-mismatch', title: 'mismatched child', type: 'feature', priority: 'P1',
        parent_id: 'parent-owned', change_id: 'change-b',
      }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    assert.throws(
      () => ops.createTask(db, {
        id: 'child-orphan', title: 'orphan child', type: 'feature', priority: 'P1',
        parent_id: 'missing-parent',
      }),
      (error) => error.code === 'TASK_NOT_FOUND',
    );
    assert.throws(
      () => ops.createTask(db, {
        id: 'closed-change-task', title: 'closed change task', type: 'feature', priority: 'P1',
        change_id: 'change-closed',
      }),
      (error) => error.code === 'CHANGE_NOT_MUTABLE',
    );
  } finally {
    closeStateDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchTask keeps established ownership immutable and rejects terminal-change writes', () => {
  const { dir, db } = freshDb();
  try {
    seedChange(db, 'change-a');
    seedChange(db, 'change-b');
    seedChange(db, 'change-ready', 'ready');
    ops.createTask(db, {
      id: 'patch-parent', title: 'patch parent', type: 'feature', priority: 'P1',
      change_id: 'change-a',
    });
    ops.createTask(db, {
      id: 'patch-child', title: 'patch child', type: 'feature', priority: 'P1',
      parent_id: 'patch-parent',
    });
    assert.throws(
      () => ops.patchTask(db, 'patch-child', { change_id: null }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    assert.throws(
      () => ops.patchTask(db, 'patch-child', { change_id: 'change-b' }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    assert.throws(
      () => ops.patchTask(db, 'patch-parent', { change_id: 'change-b' }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    const root = ops.createTask(db, {
      id: 'patch-root', title: 'owned root', type: 'feature', priority: 'P1',
      change_id: 'change-a',
    });
    assert.equal(root.change_id, 'change-a');
    assert.throws(
      () => ops.patchTask(db, 'patch-root', { change_id: null }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    assert.throws(
      () => ops.patchTask(db, 'patch-root', { change_id: 'change-b' }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    const standalone = ops.createTask(db, {
      id: 'patch-standalone', title: 'patch standalone', type: 'feature', priority: 'P1',
    });
    assert.equal(standalone.change_id, null);
    assert.equal(ops.patchTask(db, 'patch-standalone', { change_id: 'change-b' }).change_id, 'change-b');
    assert.throws(
      () => ops.patchTask(db, 'patch-root', { change_id: 'change-ready' }),
      (error) => error.code === 'TASK_CHANGE_OWNERSHIP_MISMATCH',
    );
    db.prepare("UPDATE changes SET status = 'archived' WHERE id = 'change-a'").run();
    assert.throws(
      () => ops.patchTask(db, 'patch-root', { priority: 'P0' }),
      (error) => error.code === 'CHANGE_NOT_MUTABLE',
    );
  } finally {
    closeStateDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('updateTaskStatus preserves history while reopening a completed local task', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 't', title: 'x', type: 'feature', priority: 'P0' });

    // pending → in_progress allowed
    const t1 = ops.updateTaskStatus(db, 't', 'in_progress');
    assert.equal(t1.status, 'in_progress');

    // in_progress → completed allowed
    const t2 = ops.updateTaskStatus(db, 't', 'completed');
    assert.equal(t2.status, 'completed');

    assert.throws(
      () => ops.updateTaskStatus(db, 't', 'pending'),
      (error) => error.code === 'ILLEGAL_STATUS_TRANSITION',
    );
    ops.patchTask(db, 't', {
      completion_commit: '0123456789012345678901234567890123456789',
      session_id: 'completed-session',
    });
    const reopened = ops.updateTaskStatus(db, 't', 'in_progress');
    assert.equal(reopened.status, 'in_progress');
    assert.equal(reopened.completion_commit, null);
    assert.equal(reopened.session_id, null);
    const event = db.prepare(
      "SELECT payload_json FROM events WHERE task_id = 't' AND type = 'task_reopened'",
    ).get();
    assert.ok(event);
    assert.equal(
      JSON.parse(event.payload_json).previous_completion_commit,
      '0123456789012345678901234567890123456789',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an uncommitted task completion can recover while a committed completion remains terminal', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'recoverable', title: 'recoverable', type: 'feature', priority: 'P0' });
    ops.patchTask(db, 'recoverable', {
      status: 'in_progress',
      session_id: 'local-session',
    });
    ops.updateTaskStatus(db, 'recoverable', 'completed');
    assert.equal(
      ops.updateTaskStatus(db, 'recoverable', 'blocked').status,
      'blocked',
    );

    ops.updateTaskStatus(db, 'recoverable', 'in_progress');
    ops.updateTaskStatus(db, 'recoverable', 'completed');
    ops.patchTask(db, 'recoverable', {
      completion_commit: '0123456789012345678901234567890123456789',
    });
    assert.throws(
      () => ops.updateTaskStatus(db, 'recoverable', 'blocked'),
      (error) => error.code === 'ILLEGAL_STATUS_TRANSITION',
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
    assert.deepEqual(types, ['task_created', 'task_started', 'task_contract_updated']);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('patchTask status event follows the newly assigned continuous change', () => {
  const { dir, db } = freshDb();
  try {
    db.prepare(
      `INSERT INTO changes (id, title, kind, intent, artifact_root)
       VALUES ('chg-link', 'Link task', 'quick', 'Link task to change.', '.ultra/changes/active/chg-link')`,
    ).run();
    ops.createTask(db, { id: 'link-task', title: 'link me', type: 'feature', priority: 'P1' });
    ops.patchTask(db, 'link-task', { change_id: 'chg-link', status: 'in_progress' });
    const event = db.prepare(
      "SELECT change_id FROM events WHERE task_id = 'link-task' AND type = 'task_started'",
    ).get();
    assert.equal(event.change_id, 'chg-link');
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

test('runtime-bearing mutations reject unsupported runtimes before touching state', () => {
  const { dir, db } = freshDb();
  const retiredRuntime = ['gem', 'ini'].join('');
  try {
    ops.createTask(db, { id: 'runtime-guard', title: 'guard', type: 'feature', priority: 'P1' });
    assert.throws(
      () => ops.createSession(db, {
        sid: 'unsupported', task_id: 'runtime-guard', runtime: retiredRuntime,
        worktree_path: '/tmp/wt', artifact_dir: '/tmp/art',
      }),
      (error) => error.code === 'VALIDATION_ERROR' && /unsupported runtime/.test(error.message),
    );
    assert.throws(
      () => ops.appendEvent(db, { type: 'task_started', task_id: 'runtime-guard', runtime: retiredRuntime }),
      (error) => error.code === 'VALIDATION_ERROR' && /unsupported runtime/.test(error.message),
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
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
      pid: 4242, worktree_path: '/tmp/wt', artifact_dir: '/tmp/art',
    });
    const out = ops.updateSession(db, 'sx', { status: 'completed' });
    assert.equal(out.status, 'completed');
    assert.equal(out.pid, null);
    const types = db.prepare(`SELECT type FROM events WHERE session_id = 'sx' ORDER BY id`).all().map((r) => r.type);
    assert.deepEqual(types, ['session_spawned', 'session_closed']);
    const terminal = db.prepare(
      "SELECT payload_json FROM events WHERE session_id = 'sx' AND type = 'session_closed'",
    ).get();
    assert.equal(JSON.parse(terminal.payload_json).worker_pid, 4242);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('updateSession makes a terminal status single-assignment and idempotent', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, {
      id: 'terminal-once', title: 'terminal once', type: 'feature', priority: 'P1',
    });
    ops.createSession(db, {
      sid: 'terminal-once-session',
      task_id: 'terminal-once',
      runtime: 'codex',
      pid: 4343,
      worktree_path: '/tmp/terminal-once',
      artifact_dir: '/tmp/terminal-once-artifacts',
    });

    const first = ops.updateSession(db, 'terminal-once-session', { status: 'completed' });
    const second = ops.updateSession(db, 'terminal-once-session', { status: 'completed' });
    assert.equal(first.status, 'completed');
    assert.equal(second.status, 'completed');
    assert.throws(
      () => ops.updateSession(db, 'terminal-once-session', { status: 'crashed' }),
      (error) => error.code === 'SESSION_TERMINAL_CONFLICT',
    );
    assert.equal(ops.readSession(db, 'terminal-once-session').status, 'completed');
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = 'terminal-once-session'
           AND type IN ('session_closed', 'session_crashed')`,
      ).get().count,
      1,
    );
  } finally {
    closeStateDb(db);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('racing terminal session writers commit exactly one terminal authority and event', async () => {
  const { dir, file, db } = freshDb();
  const children = [];
  try {
    ops.createTask(db, {
      id: 'terminal-race', title: 'terminal race', type: 'feature', priority: 'P0',
    });
    ops.createSession(db, {
      sid: 'terminal-race-session',
      task_id: 'terminal-race',
      runtime: 'codex',
      pid: 4545,
      worktree_path: '/tmp/terminal-race',
      artifact_dir: '/tmp/terminal-race-artifacts',
    });
    closeStateDb(db);
    const start = path.join(dir, 'terminal-start');
    const moduleDir = path.resolve(__dirname, '..', 'lib');
    const childScript = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const stateDb = require(path.join(process.argv[1], "state-db.cjs"));',
      'const ops = require(path.join(process.argv[1], "state-ops.cjs"));',
      'const db = stateDb.openStateDb(process.argv[2]);',
      'while (!fs.existsSync(process.argv[3])) {',
      '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);',
      '}',
      'try {',
      '  const session = ops.updateSession(db, "terminal-race-session", {',
      '    status: process.argv[4],',
      '  });',
      '  process.stdout.write(JSON.stringify({ ok: true, status: session.status }));',
      '} catch (error) {',
      '  process.stdout.write(JSON.stringify({ ok: false, code: error.code, message: error.message }));',
      '} finally { db.close(); }',
    ].join('\n');
    const collect = (child) => new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code !== 0) reject(new Error(`terminal child exited ${code}: ${stderr}`));
        else resolve(JSON.parse(stdout));
      });
    });
    for (const status of ['completed', 'crashed']) {
      const child = spawn(
        process.execPath,
        ['-e', childScript, moduleDir, file, start, status],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      children.push(child);
    }
    const outcomes = children.map(collect);
    fs.writeFileSync(start, 'go');
    const results = await Promise.all(outcomes);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(
      results.filter((result) => result.code === 'SESSION_TERMINAL_CONFLICT').length,
      1,
    );

    const reopened = openStateDb(file);
    try {
      const session = ops.readSession(reopened, 'terminal-race-session');
      assert.ok(['completed', 'crashed'].includes(session.status));
      assert.equal(session.pid, null);
      assert.equal(
        reopened.prepare(
          `SELECT COUNT(*) AS count FROM events
           WHERE session_id = 'terminal-race-session'
             AND type IN ('session_closed', 'session_crashed')`,
        ).get().count,
        1,
      );
    } finally {
      closeStateDb(reopened);
    }
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listActiveSessions returns only running rows for a task', () => {
  const { dir, db } = freshDb();
  try {
    ops.createTask(db, { id: 'm', title: 'm', type: 'feature', priority: 'P1' });
    ops.createSession(db, { sid: 'a', task_id: 'm', runtime: 'claude', worktree_path: '/tmp/a', artifact_dir: '/tmp/a' });
    ops.updateSession(db, 'a', { status: 'completed' });
    ops.createSession(db, { sid: 'b', task_id: 'm', runtime: 'codex',  worktree_path: '/tmp/b', artifact_dir: '/tmp/b' });
    const active = ops.listActiveSessions(db, { task_id: 'm' });
    assert.equal(active.length, 1);
    assert.equal(active[0].sid, 'b');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('one active task lease is enforced across racing processes', async () => {
  const { dir, file, db } = freshDb();
  const children = [];
  try {
    ops.createTask(db, { id: 'lease-race', title: 'lease race', type: 'feature', priority: 'P0' });
    closeStateDb(db);
    const start = path.join(dir, 'start');
    const moduleDir = path.resolve(__dirname, '..', 'lib');
    const childScript = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      'const stateDb = require(path.join(process.argv[1], "state-db.cjs"));',
      'const ops = require(path.join(process.argv[1], "state-ops.cjs"));',
      'const db = stateDb.openStateDb(process.argv[2]);',
      'while (!fs.existsSync(process.argv[3])) {',
      '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);',
      '}',
      'try {',
      '  const session = ops.createSession(db, {',
      '    sid: process.argv[4], task_id: "lease-race", runtime: "codex",',
      '    worktree_path: `/tmp/${process.argv[4]}`,',
      '    artifact_dir: `/tmp/${process.argv[4]}-artifacts`,',
      '  });',
      '  process.stdout.write(JSON.stringify({ ok: true, sid: session.sid }));',
      '} catch (error) {',
      '  process.stdout.write(JSON.stringify({ ok: false, code: error.code, message: error.message }));',
      '} finally { db.close(); }',
    ].join('\n');
    const collect = (child) => new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code !== 0) reject(new Error(`lease child exited ${code}: ${stderr}`));
        else resolve(JSON.parse(stdout));
      });
    });
    for (const sid of ['lease-a', 'lease-b']) {
      const child = spawn(
        process.execPath,
        ['-e', childScript, moduleDir, file, start, sid],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      children.push(child);
    }
    const outcomes = children.map(collect);
    fs.writeFileSync(start, 'go');
    const results = await Promise.all(outcomes);
    assert.equal(results.filter((result) => result.ok).length, 1);
    const denied = results.find((result) => !result.ok);
    assert.equal(denied.code, 'ADMISSION_DENIED');

    const reopened = openStateDb(file);
    try {
      assert.equal(
        reopened.prepare(
          "SELECT COUNT(*) AS count FROM sessions WHERE task_id = 'lease-race' AND status = 'running'",
        ).get().count,
        1,
      );
    } finally {
      closeStateDb(reopened);
    }
  } finally {
    for (const child of children) {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
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
