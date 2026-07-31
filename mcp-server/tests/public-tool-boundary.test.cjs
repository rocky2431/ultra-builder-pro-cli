'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const changes = require('../lib/change-workflow.cjs');
const ops = require('../lib/state-ops.cjs');
const stageCheckpoints = require('../lib/stage-checkpoints.cjs');
const sessionRunner = require('../../orchestrator/session-runner.cjs');
const ultraFacade = require('../lib/ultra-facade.cjs');
const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'mcp-server', 'server.cjs');
const STABLE_PERSISTENCE_ERRORS = new Set([
  'STATE_DB_ERROR',
  'STATE_CORRUPT',
  'STATE_PERSISTENCE_FAILED',
]);

function fixture({ git = false, readyBaseline = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-public-tool-boundary-'));
  if (git) {
    childProcess.execFileSync('git', ['init', '-q'], { cwd: rootDir });
    childProcess.execFileSync(
      'git',
      ['config', 'user.email', 'public-tool-boundary@example.invalid'],
      { cwd: rootDir },
    );
    childProcess.execFileSync(
      'git',
      ['config', 'user.name', 'Public Tool Boundary'],
      { cwd: rootDir },
    );
    fs.writeFileSync(path.join(rootDir, 'README.md'), 'public tool boundary\n');
    childProcess.execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    childProcess.execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: rootDir });
  }
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  if (readyBaseline) seedReadyBaseline(db, { rootDir });
  closeStateDb(db);
  return { rootDir, dbPath };
}

function cleanup(fx) {
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function openFixture(fx) {
  return initStateDb(fx.dbPath).db;
}

function readFixture(fx, read) {
  const db = openFixture(fx);
  try {
    return read(db);
  } finally {
    closeStateDb(db);
  }
}

function createChange(db, rootDir, id) {
  return changes.createChange(
    db,
    completeChangeInput({
      id,
      title: `Boundary ${id}`,
      intent: `Exercise the public boundary for ${id}.`,
      kind: 'standard',
    }),
    { rootDir },
  );
}

function createTask(db, {
  id,
  changeId = null,
} = {}) {
  return ops.createTask(db, {
    id,
    title: `Boundary task ${id}`,
    type: 'feature',
    priority: 'P1',
    ...(changeId ? { change_id: changeId } : {}),
  });
}

function createRunningSession(db, fx, {
  sid,
  taskId,
} = {}) {
  const worktreePath = path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', sid);
  const artifactDir = path.join(fx.rootDir, '.ultra', '.runtime', 'sessions', sid);
  fs.mkdirSync(worktreePath, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  return ops.createSession(db, {
    sid,
    task_id: taskId,
    runtime: 'codex',
    worktree_path: worktreePath,
    artifact_dir: artifactDir,
  });
}

async function withClient(fx, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      UBP_ROOT_DIR: fx.rootDir,
      UBP_DB_PATH: fx.dbPath,
    },
    stderr: 'pipe',
  });
  const client = new Client(
    { name: 'ubp-public-tool-boundary-test', version: '0.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function callTool(client, name, args) {
  return client.callTool({ name, arguments: args });
}

function parsedToolError(result) {
  assert.equal(result.isError, true, JSON.stringify(result, null, 2));
  const document = JSON.parse(result.content[0].text);
  return document.error;
}

function assertValidationError(result) {
  const error = parsedToolError(result);
  assert.equal(error.code, 'VALIDATION_ERROR', JSON.stringify(error, null, 2));
  return error;
}

function assertStablePersistenceError(result) {
  const error = parsedToolError(result);
  assert.equal(
    STABLE_PERSISTENCE_ERRORS.has(error.code),
    true,
    `unexpected public persistence error: ${JSON.stringify(error)}`,
  );
  assert.equal(error.code.startsWith('SQLITE_'), false);
  return error;
}

function captureFacadeCode(run) {
  try {
    const value = run();
    return Promise.resolve(value).then(
      (result) => ({
        code: result?.diagnostics?.[0]?.code || null,
        result,
      }),
      (error) => ({ code: error.code || null, error }),
    );
  } catch (error) {
    return Promise.resolve({ code: error.code || null, error });
  }
}

test('direct dispatch enforces exact record and doctor request shells', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  const entry = {
    kind: 'event',
    action: 'append',
    data: { type: 'direct_shell_boundary_probe' },
    idempotency_key: 'direct-shell-boundary',
  };
  try {
    const invalidRequests = [
      ['ultra.record', { entries: [entry], extra: true }],
      ['ultra.record', { entries: [] }],
      ['ultra.record', { entries: [{ ...entry, extra: true }] }],
      ['ultra.record', { entries: [{ ...entry, idempotency_key: 'x' }] }],
      ['ultra.doctor', { repair: 'true' }],
      ['ultra.doctor', { repair: false, extra: true }],
    ];
    for (const [tool, input] of invalidRequests) {
      const rejected = await captureFacadeCode(
        () => ultraFacade.dispatch(tool, input, db, { rootDir: fx.rootDir }),
      );
      assert.equal(
        rejected.code,
        'VALIDATION_ERROR',
        rejected.error?.stack || JSON.stringify(rejected.result),
      );
    }
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'direct_shell_boundary_probe'`,
      ).get().count,
      0,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('checkpoint evidence rejects unknown fields before any Context or checkpoint is persisted', async () => {
  const fx = fixture({ readyBaseline: false });
  const db = openFixture(fx);
  try {
    const rejected = await captureFacadeCode(
      () => ultraFacade.dispatch('ultra.checkpoint', {
        stage: 'research',
        scope: {},
        payload: {
          summary: 'Reject an evidence object that exceeds the public contract.',
          evidence: [{
            kind: 'docs',
            ref: '.ultra/specs/product.md',
            unexpected: 'must-not-persist',
          }],
        },
        idempotency_key: 'checkpoint-evidence-exact',
      }, db, { rootDir: fx.rootDir, runtime: 'test' }),
    );
    assert.equal(rejected.code, 'VALIDATION_ERROR');
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      0,
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      0,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('checkpoint exact retry reuses the accepted checkpoint and Context Envelope', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  const request = {
    stage: 'research',
    scope: {},
    payload: { summary: 'Persist one exact research checkpoint.' },
    idempotency_key: 'checkpoint-exact-retry',
  };
  try {
    const initialContextCount = db.prepare(
      'SELECT COUNT(*) AS count FROM context_envelopes',
    ).get().count;
    const initialCheckpointCount = db.prepare(
      'SELECT COUNT(*) AS count FROM stage_checkpoints',
    ).get().count;
    const first = await ultraFacade.dispatch(
      'ultra.checkpoint',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'test' },
    );
    const second = await ultraFacade.dispatch(
      'ultra.checkpoint',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'test' },
    );
    assert.equal(first.accepted, true);
    assert.equal(second.accepted, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.checkpoint.id, first.checkpoint.id);
    assert.equal(second.context.id, first.context.id);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      initialContextCount + 1,
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      initialCheckpointCount + 1,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('plan checkpoint retry publishes the ledger after a post-accept publication failure', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  const changeId = 'plan-ledger-retry-change';
  const taskId = 'plan-ledger-retry-task';
  try {
    createChange(db, fx.rootDir, changeId);
    createTask(db, { id: taskId, changeId });
    const before = {
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      checkpoints: db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
    };
    db.exec(
      `CREATE TRIGGER fail_plan_ledger_publication
       BEFORE INSERT ON events
       WHEN NEW.type = 'task_ledger_published'
       BEGIN
         SELECT RAISE(ABORT, 'injected plan ledger publication failure');
       END`,
    );
    const request = {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Publish the accepted Plan and team checkpoint.' },
      idempotency_key: 'plan-ledger-retry',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch(
        'ultra.checkpoint',
        request,
        db,
        { rootDir: fx.rootDir, runtime: 'test' },
      ),
    );
    assert.equal(failed.code, 'STATE_PERSISTENCE_FAILED');
    const accepted = db.prepare(
      `SELECT id, status FROM stage_checkpoints
       WHERE stage = 'plan' AND scope_type = 'change' AND scope_id = ?`,
    ).get(changeId);
    assert.equal(accepted.status, 'accepted');
    assert.equal(
      fs.existsSync(path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json')),
      false,
    );

    db.exec('DROP TRIGGER fail_plan_ledger_publication');
    const retried = await ultraFacade.dispatch(
      'ultra.checkpoint',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'test' },
    );
    assert.equal(retried.accepted, true);
    assert.equal(retried.idempotent, true);
    assert.equal(retried.checkpoint.id, accepted.id);
    assert.equal(retried.result.team_checkpoint.changed, true);
    assert.equal(
      fs.existsSync(path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json')),
      true,
    );
    assert.deepEqual({
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      checkpoints: db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
    }, {
      contexts: before.contexts + 1,
      checkpoints: before.checkpoints + 1,
    });
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('legacy idempotency receipts suppress effect replay after an upgrade', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  const request = {
    entries: [{
      kind: 'event',
      action: 'append',
      data: { type: 'legacy_receipt_effect' },
      idempotency_key: 'legacy-receipt-key',
    }],
  };
  try {
    ops.appendEvent(db, { type: 'legacy_receipt_effect' });
    ops.appendEvent(db, {
      type: 'ultra_kernel_call',
      payload: {
        idempotency_key: 'legacy-receipt-key',
        operation: 'event:append',
        accepted: true,
        result: { event_id: 1, ts: 'legacy' },
      },
    });
    const result = await ultraFacade.dispatch(
      'ultra.record',
      request,
      db,
      { rootDir: fx.rootDir },
    );
    assert.equal(result.accepted, true);
    assert.equal(result.results[0].idempotent, true);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'legacy_receipt_effect'",
      ).get().count,
      1,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('direct record receipt failure exposes a stable persistence error, not raw SQLite', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    db.exec(
      `CREATE TRIGGER fail_direct_record_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected direct record receipt failure');
       END`,
    );
    const request = {
      entries: [{
        kind: 'event',
        action: 'append',
        data: { type: 'direct_record_effect' },
        idempotency_key: 'direct-record-receipt',
      }],
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch('ultra.record', request, db, { rootDir: fx.rootDir }),
    );
    assert.equal(failed.code, 'STATE_PERSISTENCE_FAILED');
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type IN ('direct_record_effect', 'ultra_kernel_call')",
      ).get().count,
      0,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('Stage Checkpoint internals reject scalar diagnostic fields without coercion', () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    for (const diagnostics of [
      [{ code: 42, severity: 'warning' }],
      [{ code: 'DIAGNOSTIC_CODE', severity: 'warning', message: 42 }],
    ]) {
      assert.throws(
        () => stageCheckpoints.saveDraft(db, {
          stage: 'research',
          scope: { baseline_id: 'test-baseline' },
          payload: { summary: 'Reject scalar diagnostics.' },
          evidence: [],
          diagnostics,
          idempotency_key: `diagnostic-type-${JSON.stringify(diagnostics)}`,
        }),
        (error) => error.code === 'VALIDATION_ERROR',
      );
    }
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('Stage Checkpoint accept idempotency binds checkpoint id and digest', () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    const first = stageCheckpoints.saveDraft(db, {
      stage: 'plan',
      scope: { baseline_id: 'test-baseline' },
      payload: { summary: 'Bind accept authority.' },
      evidence: [],
      diagnostics: [],
      idempotency_key: 'accept-idempotency-draft',
    });
    const accepted = stageCheckpoints.acceptDraft(db, {
      id: first.id,
      idempotency_key: 'accept-idempotency-key',
    });
    assert.equal(
      stageCheckpoints.acceptDraft(db, {
        id: first.id,
        idempotency_key: 'accept-idempotency-key',
      }).id,
      accepted.id,
    );
    assert.throws(
      () => stageCheckpoints.acceptDraft(db, {
        id: first.id,
        idempotency_key: 'accept-different-key',
      }),
      (error) => error.code === 'IDEMPOTENCY_KEY_CONFLICT',
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('ultra.archive cannot let payload.id override the caller-declared Change', async () => {
  const fx = fixture({ git: true });
  const db = openFixture(fx);
  try {
    createChange(db, fx.rootDir, 'archive-A');
    createChange(db, fx.rootDir, 'archive-B');
  } finally {
    closeStateDb(db);
  }

  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.archive', {
      change_id: 'archive-A',
      payload: {
        id: 'archive-B',
        summary: 'Archive the caller-declared Change.',
        no_baseline_change_reason: 'No baseline semantic change.',
      },
      idempotency_key: 'archive-target-boundary',
    }));
    const states = readFixture(fx, (state) => ({
      a: changes.readChange(state, 'archive-A').status,
      b: changes.readChange(state, 'archive-B').status,
    }));
    assert.equal(states.b, 'active', JSON.stringify(result, null, 2));
    if (result.isError !== true) {
      assert.notEqual(result.structuredContent?.result?.change?.id, 'archive-B');
    }
  } finally {
    cleanup(fx);
  }
});

test('ultra.context rejects an explicit missing task instead of falling back', async () => {
  const fx = fixture();
  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.context', {
      scope: { task_id: 'missing-task' },
    }));
    const error = parsedToolError(result);
    assert.equal(error.code, 'CONTEXT_SCOPE_NOT_FOUND');
  } finally {
    cleanup(fx);
  }
});

test('ultra.context rejects a Task and Change that do not belong together', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    createChange(db, fx.rootDir, 'context-A');
    createChange(db, fx.rootDir, 'context-B');
    createTask(db, { id: 'context-task-A', changeId: 'context-A' });
  } finally {
    closeStateDb(db);
  }

  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.context', {
      scope: {
        task_id: 'context-task-A',
        change_id: 'context-B',
      },
    }));
    const error = parsedToolError(result);
    assert.equal(error.code, 'CONTEXT_SCOPE_MISMATCH');
  } finally {
    cleanup(fx);
  }
});

test('ultra.session rejects action-specific wrong types and unknown fields before release', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    createTask(db, { id: 'session-shape-task' });
    createRunningSession(db, fx, {
      sid: 'session-shape-sid',
      taskId: 'session-shape-task',
    });
  } finally {
    closeStateDb(db);
  }

  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.session', {
      action: 'release',
      scope: {
        sid: 'session-shape-sid',
        ignored_scope_field: true,
      },
      payload: {
        status: 0,
        remove_worktree: 'true',
        ignored_payload_field: true,
      },
      idempotency_key: 'session-shape-boundary',
    }));
    assertValidationError(result);
    assert.equal(
      readFixture(fx, (state) => ops.readSession(state, 'session-shape-sid').status),
      'running',
    );
  } finally {
    cleanup(fx);
  }
});

test('ultra.session heartbeat binds an idempotency key to the exact request', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    for (const suffix of ['A', 'B']) {
      createTask(db, { id: `heartbeat-task-${suffix}` });
      createRunningSession(db, fx, {
        sid: `heartbeat-sid-${suffix}`,
        taskId: `heartbeat-task-${suffix}`,
      });
    }
    await ultraFacade.dispatch('ultra.session', {
      action: 'heartbeat',
      scope: { sid: 'heartbeat-sid-A' },
      idempotency_key: 'heartbeat-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' });
    const replay = await captureFacadeCode(() => ultraFacade.dispatch('ultra.session', {
      action: 'heartbeat',
      scope: { sid: 'heartbeat-sid-B' },
      idempotency_key: 'heartbeat-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' }));
    assert.equal(replay.code, 'IDEMPOTENCY_KEY_CONFLICT');
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('ultra.session release binds an idempotency key to the exact request', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    for (const suffix of ['A', 'B']) {
      createTask(db, { id: `release-task-${suffix}` });
      createRunningSession(db, fx, {
        sid: `release-sid-${suffix}`,
        taskId: `release-task-${suffix}`,
      });
    }
    await ultraFacade.dispatch('ultra.session', {
      action: 'release',
      scope: { sid: 'release-sid-A' },
      payload: { status: 'completed', remove_worktree: false },
      idempotency_key: 'release-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' });
    const replay = await captureFacadeCode(() => ultraFacade.dispatch('ultra.session', {
      action: 'release',
      scope: { sid: 'release-sid-B' },
      payload: { status: 'crashed', remove_worktree: false },
      idempotency_key: 'release-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' }));
    assert.equal(replay.code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal(ops.readSession(db, 'release-sid-B').status, 'running');
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('ultra.session acquire binds an idempotency key before allocating a second packet', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  const originalSpawn = sessionRunner.spawnSession;
  let sequence = 0;
  try {
    const changeId = 'acquire-boundary-change';
    createChange(db, fx.rootDir, changeId);
    for (const suffix of ['A', 'B']) {
      createTask(db, {
        id: `acquire-task-${suffix}`,
        changeId,
      });
    }
    await ultraFacade.dispatch('ultra.checkpoint', {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Prepare acquire idempotency tasks.' },
      idempotency_key: 'acquire-plan-boundary',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' });

    sessionRunner.spawnSession = ({ task_id }) => {
      sequence += 1;
      return {
        sid: `stub-session-${sequence}`,
        task_id,
        worktree_path: path.join(fx.rootDir, 'stub-worktree', String(sequence)),
        artifact_dir: path.join(fx.rootDir, 'stub-artifacts', String(sequence)),
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    };
    const first = await ultraFacade.dispatch('ultra.session', {
      action: 'acquire',
      scope: { task_id: 'acquire-task-A' },
      payload: { runtime: 'codex', role: 'implement' },
      idempotency_key: 'acquire-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' });
    assert.equal(first.accepted, true);
    const replay = await captureFacadeCode(() => ultraFacade.dispatch('ultra.session', {
      action: 'acquire',
      scope: { task_id: 'acquire-task-B' },
      payload: { runtime: 'codex', role: 'implement' },
      idempotency_key: 'acquire-shared-key',
    }, db, { rootDir: fx.rootDir, runtime: 'codex' }));
    assert.equal(replay.code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal(sequence, 1);
  } finally {
    sessionRunner.spawnSession = originalSpawn;
    closeStateDb(db);
    cleanup(fx);
  }
});

for (const [field, invalid] of [
  ['evidence', { ref: '.ultra/specs/product.md' }],
  ['diagnostics', 'not-an-array'],
]) {
  test(`ultra.checkpoint rejects a wrong-type ${field} field`, async () => {
    const fx = fixture();
    const before = readFixture(
      fx,
      (db) => db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
    );
    try {
      const result = await withClient(fx, (client) => callTool(client, 'ultra.checkpoint', {
        stage: 'research',
        scope: {},
        payload: {
          summary: 'Reject malformed checkpoint payloads.',
          [field]: invalid,
        },
        idempotency_key: `checkpoint-wrong-${field}`,
      }));
      assertValidationError(result);
      assert.equal(
        readFixture(
          fx,
          (db) => db.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
        ),
        before,
      );
    } finally {
      cleanup(fx);
    }
  });
}

test('ultra.checkpoint rejects reuse of one idempotency key for a different request', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const first = await callTool(client, 'ultra.checkpoint', {
        stage: 'research',
        scope: {},
        payload: { summary: 'First checkpoint request.' },
        idempotency_key: 'checkpoint-shared-request-key',
      });
      assert.notEqual(first.isError, true, first.content?.[0]?.text);
      const second = await callTool(client, 'ultra.checkpoint', {
        stage: 'research',
        scope: {},
        payload: { summary: 'Different checkpoint request.' },
        idempotency_key: 'checkpoint-shared-request-key',
      });
      const error = parsedToolError(second);
      assert.equal(error.code, 'IDEMPOTENCY_KEY_CONFLICT');
    });
  } finally {
    cleanup(fx);
  }
});

test('checkpoint context publication rolls back its file when the DB insert fails', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    db.exec(
      `CREATE TRIGGER fail_context_envelope_insert
       BEFORE INSERT ON context_envelopes
       BEGIN
         SELECT RAISE(ABORT, 'injected context insert failure');
       END`,
    );
  } finally {
    closeStateDb(db);
  }

  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.checkpoint', {
      stage: 'research',
      scope: {},
      payload: { summary: 'Exercise context publication rollback.' },
      idempotency_key: 'checkpoint-context-rollback',
    }));
    assertStablePersistenceError(result);
    const contextDir = path.join(
      fx.rootDir,
      '.ultra',
      '.runtime',
      'projections',
      'contexts',
    );
    assert.deepEqual(fs.existsSync(contextDir) ? fs.readdirSync(contextDir) : [], []);
    assert.equal(
      readFixture(
        fx,
        (state) => state.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      ),
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('sync publication rolls back the ledger file when its receipt fails', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    db.exec(
      `CREATE TRIGGER fail_sync_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected sync receipt failure');
       END`,
    );
  } finally {
    closeStateDb(db);
  }

  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.sync', {
      action: 'publish',
      reason: 'Exercise ledger publication rollback.',
      idempotency_key: 'sync-receipt-rollback',
    }));
    assertStablePersistenceError(result);
    assert.equal(
      fs.existsSync(path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json')),
      false,
    );
    const eventCounts = readFixture(fx, (state) => ({
      published: state.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'task_ledger_published'",
      ).get().count,
      receipt: state.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'ultra_kernel_call'",
      ).get().count,
    }));
    assert.deepEqual(eventCounts, { published: 0, receipt: 0 });
  } finally {
    cleanup(fx);
  }
});

test('sync inspect reports corrupt authority with an executable doctor or restore recovery', async () => {
  const fx = fixture();
  const ledger = path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, 'not-json\n');
  try {
    const result = await withClient(fx, (client) => callTool(client, 'ultra.sync', {
      action: 'inspect',
    }));
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const output = result.structuredContent;
    assert.notEqual(output.status, 'migration_required', JSON.stringify(output, null, 2));
    assert.notEqual(output.migration?.action, 'ultra.sync migrate');
    assert.match(JSON.stringify(output), /(doctor|restore)/i);
    assert.match(JSON.stringify(output), /TASK_LEDGER_INVALID/);
  } finally {
    cleanup(fx);
  }
});

test('archive receipt failure restores Change, ledger, and active artifact bytes', async () => {
  const fx = fixture({ git: true });
  const db = openFixture(fx);
  const changeId = 'archive-receipt-rollback';
  try {
    createChange(db, fx.rootDir, changeId);
    const activeRoot = path.join(fx.rootDir, '.ultra', 'changes', 'active', changeId);
    const before = fs.readFileSync(path.join(activeRoot, 'intent.md'));
    db.exec(
      `CREATE TRIGGER fail_archive_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected archive receipt failure');
       END`,
    );

    const failed = await captureFacadeCode(() => ultraFacade.dispatch('ultra.archive', {
      change_id: changeId,
      payload: {
        summary: 'Exercise archive receipt rollback.',
        no_baseline_change_reason: 'No baseline semantic change.',
      },
      idempotency_key: 'archive-receipt-rollback-key',
    }, db, { rootDir: fx.rootDir }));

    assert.equal(
      STABLE_PERSISTENCE_ERRORS.has(failed.code),
      true,
      failed.error?.stack || JSON.stringify(failed.result),
    );
    assert.equal(changes.readChange(db, changeId).status, 'active');
    assert.deepEqual(fs.readFileSync(path.join(activeRoot, 'intent.md')), before);
    const archiveRoot = path.join(fx.rootDir, '.ultra', 'changes', 'archive');
    assert.deepEqual(
      fs.existsSync(archiveRoot)
        ? fs.readdirSync(archiveRoot).filter((name) => name.endsWith(`-${changeId}`))
        : [],
      [],
    );
    assert.equal(fs.existsSync(path.join(fx.rootDir, '.ultra', 'tasks', 'tasks.json')), false);
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE type IN ('change_archived', 'task_ledger_published', 'ultra_kernel_call')`,
      ).get().count,
      0,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('heartbeat receipt failure rolls back and the exact request can be retried', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    createTask(db, { id: 'heartbeat-receipt-task' });
    createRunningSession(db, fx, {
      sid: 'heartbeat-receipt-sid',
      taskId: 'heartbeat-receipt-task',
    });
    const before = ops.readSession(db, 'heartbeat-receipt-sid');
    db.exec(
      `CREATE TRIGGER fail_heartbeat_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected heartbeat receipt failure');
       END`,
    );
    const request = {
      action: 'heartbeat',
      scope: { sid: 'heartbeat-receipt-sid' },
      idempotency_key: 'heartbeat-receipt-key',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch('ultra.session', request, db, { rootDir: fx.rootDir }),
    );
    assert.equal(STABLE_PERSISTENCE_ERRORS.has(failed.code), true);
    const rolledBack = ops.readSession(db, 'heartbeat-receipt-sid');
    assert.equal(rolledBack.heartbeat_at, before.heartbeat_at);
    assert.equal(rolledBack.lease_expires_at, before.lease_expires_at);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'ultra_kernel_call'").get().count,
      0,
    );

    db.exec('DROP TRIGGER fail_heartbeat_receipt');
    const retried = await ultraFacade.dispatch(
      'ultra.session',
      request,
      db,
      { rootDir: fx.rootDir },
    );
    assert.equal(retried.ok, true);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'ultra_kernel_call'").get().count,
      1,
    );
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('release receipt failure preserves a retryable running session', async () => {
  const fx = fixture();
  const db = openFixture(fx);
  try {
    createTask(db, { id: 'release-receipt-task' });
    createRunningSession(db, fx, {
      sid: 'release-receipt-sid',
      taskId: 'release-receipt-task',
    });
    const worktreePath = ops.readSession(db, 'release-receipt-sid').worktree_path;
    db.exec(
      `CREATE TRIGGER fail_release_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected release receipt failure');
       END`,
    );
    const request = {
      action: 'release',
      scope: { sid: 'release-receipt-sid' },
      payload: { status: 'completed', remove_worktree: false },
      idempotency_key: 'release-receipt-key',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch('ultra.session', request, db, { rootDir: fx.rootDir }),
    );
    assert.equal(STABLE_PERSISTENCE_ERRORS.has(failed.code), true);
    assert.equal(ops.readSession(db, 'release-receipt-sid').status, 'running');
    assert.equal(fs.existsSync(worktreePath), true);

    db.exec('DROP TRIGGER fail_release_receipt');
    const retried = await ultraFacade.dispatch(
      'ultra.session',
      request,
      db,
      { rootDir: fx.rootDir },
    );
    assert.equal(retried.status, 'completed');
    assert.equal(retried.worktree_preserved, true);
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('acquire receipt failure leaves no packet, session, or worktree and can retry', async () => {
  const fx = fixture({ git: true });
  const db = openFixture(fx);
  const changeId = 'acquire-receipt-change';
  const taskId = 'acquire-receipt-task';
  try {
    const recorded = await ultraFacade.dispatch('ultra.record', { entries: [{
      kind: 'change_contract',
      action: 'open',
      data: completeChangeInput({
        id: changeId,
        title: 'Exercise acquire receipt rollback',
        kind: 'quick',
        intent: 'Acquisition must not outlive its exact public receipt.',
      }),
      idempotency_key: `${changeId}:open`,
    }, {
      kind: 'task_contract',
      action: 'define',
      data: {
        id: taskId,
        title: 'Exercise acquire receipt rollback',
        type: 'feature',
        priority: 'P0',
        change_id: changeId,
        outcome: 'Acquisition either commits with its receipt or leaves no execution authority.',
        slice_kind: 'tracer_bullet',
        public_seam: 'ultra.session',
        verification_command: 'node --test mcp-server/tests/public-tool-boundary.test.cjs',
        acceptance: [{
          id: `${changeId}-acceptance`,
          criterion: 'Receipt failure leaves no packet, session, or worktree.',
          verification: 'node --test mcp-server/tests/public-tool-boundary.test.cjs',
        }],
        context_refs: [{
          ref: '.ultra/specs/product.md',
          kind: 'spec',
          reason: 'Accepted product behavior.',
          required: true,
        }],
        docs_impact: {
          status: 'none',
          files: [],
          rationale: 'No public documentation change.',
        },
        ownership: { owner: 'test-owner', reviewers: [] },
        trace_to: `${changeId}-acceptance`,
      },
      idempotency_key: `${taskId}:define`,
    }] }, db, { rootDir: fx.rootDir, runtime: 'test' });
    assert.equal(recorded.accepted, true);
    const planned = await ultraFacade.dispatch('ultra.checkpoint', {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Prepare the receipt rollback task.' },
      idempotency_key: `${changeId}:plan`,
    }, db, { rootDir: fx.rootDir, runtime: 'test' });
    assert.equal(planned.accepted, true);

    const before = {
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    };
    db.exec(
      `CREATE TRIGGER fail_acquire_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected acquire receipt failure');
       END`,
    );
    const request = {
      action: 'acquire',
      scope: { task_id: taskId },
      payload: { runtime: 'codex', role: 'implement' },
      idempotency_key: 'acquire-receipt-key',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch(
        'ultra.session',
        request,
        db,
        { rootDir: fx.rootDir, runtime: 'codex' },
      ),
    );
    assert.equal(
      STABLE_PERSISTENCE_ERRORS.has(failed.code),
      true,
      failed.error?.stack || JSON.stringify(failed.result),
    );
    assert.deepEqual({
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    }, before);
    for (const relative of [
      ['.ultra', '.runtime', 'worker-packets'],
      ['.ultra', '.runtime', 'worktrees'],
      ['.ultra', '.runtime', 'sessions'],
    ]) {
      const directory = path.join(fx.rootDir, ...relative);
      assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []);
    }
    assert.equal(ops.readTask(db, taskId).status, 'pending');

    db.exec('DROP TRIGGER fail_acquire_receipt');
    const retried = await ultraFacade.dispatch(
      'ultra.session',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'codex' },
    );
    assert.equal(retried.accepted, true);
    assert.ok(ops.readSession(db, retried.sid));
    assert.ok(fs.existsSync(retried.worktree_path));
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('acquire mid-effect failure preserves unrelated events and leaves no execution residue', async () => {
  const fx = fixture({ git: true });
  const db = openFixture(fx);
  const changeId = 'acquire-effect-change';
  const taskId = 'acquire-effect-task';
  try {
    createChange(db, fx.rootDir, changeId);
    createTask(db, { id: taskId, changeId });
    const planned = await ultraFacade.dispatch('ultra.checkpoint', {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Prepare the mid-effect rollback task.' },
      idempotency_key: `${changeId}:plan`,
    }, db, { rootDir: fx.rootDir, runtime: 'test' });
    assert.equal(planned.accepted, true);
    const unrelated = ops.appendEvent(db, {
      type: 'unrelated_acquire_evidence',
      payload: { preserved: true },
    });
    const before = {
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    };
    db.exec(
      `CREATE TRIGGER fail_acquire_mid_effect
       BEFORE INSERT ON events
       WHEN NEW.type = 'session_spawned'
       BEGIN
         SELECT RAISE(ABORT, 'injected acquire mid-effect failure');
       END`,
    );
    const request = {
      action: 'acquire',
      scope: { task_id: taskId },
      payload: { runtime: 'codex', role: 'implement' },
      idempotency_key: 'acquire-mid-effect-key',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch(
        'ultra.session',
        request,
        db,
        { rootDir: fx.rootDir, runtime: 'codex' },
      ),
    );
    assert.equal(STABLE_PERSISTENCE_ERRORS.has(failed.code), true);
    assert.deepEqual({
      packets: db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      contexts: db.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    }, before);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM events WHERE id = ?')
        .get(unrelated.event_id).count,
      1,
    );
    assert.equal(ops.readTask(db, taskId).status, 'pending');
    for (const relative of [
      ['.ultra', '.runtime', 'worker-packets'],
      ['.ultra', '.runtime', 'worktrees'],
      ['.ultra', '.runtime', 'sessions'],
    ]) {
      const directory = path.join(fx.rootDir, ...relative);
      assert.deepEqual(fs.existsSync(directory) ? fs.readdirSync(directory) : [], []);
    }

    db.exec('DROP TRIGGER fail_acquire_mid_effect');
    const retried = await ultraFacade.dispatch(
      'ultra.session',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'codex' },
    );
    assert.equal(retried.accepted, true);
    assert.ok(ops.readSession(db, retried.sid));
  } finally {
    closeStateDb(db);
    cleanup(fx);
  }
});

test('takeover receipt failure never restores a terminated lease as running', async () => {
  const fx = fixture({ git: true });
  const db = openFixture(fx);
  const changeId = 'takeover-receipt-change';
  const taskId = 'takeover-receipt-task';
  let priorProcess = null;
  try {
    createChange(db, fx.rootDir, changeId);
    createTask(db, { id: taskId, changeId });
    ops.patchTask(db, taskId, {
      outcome: 'Explicit takeover never leaves a terminated lease marked running.',
      slice_kind: 'takeover-recovery',
      public_seam: 'ultra.session takeover',
      verification_command: 'node --test mcp-server/tests/public-tool-boundary.test.cjs',
      acceptance: [{
        id: `${changeId}-acceptance`,
        criterion: 'Receipt failure reconciles the terminated lease.',
        verification: 'node --test mcp-server/tests/public-tool-boundary.test.cjs',
      }],
      context_refs: [{
        ref: '.ultra/specs/product.md',
        reason: 'Accepted product behavior.',
        required: true,
      }],
      docs_impact: { status: 'none', files: [], rationale: 'No documentation change.' },
      ownership: { owner: 'test-owner', reviewers: [] },
      trace_to: `${changeId}-acceptance`,
    });
    await ultraFacade.dispatch('ultra.checkpoint', {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Prepare explicit takeover recovery.' },
      idempotency_key: `${changeId}:plan`,
    }, db, { rootDir: fx.rootDir, runtime: 'test' });
    let initial;
    try {
      initial = await ultraFacade.dispatch('ultra.session', {
        action: 'acquire',
        scope: { task_id: taskId },
        payload: { runtime: 'codex', role: 'implement' },
        idempotency_key: 'takeover-initial-acquire',
      }, db, { rootDir: fx.rootDir, runtime: 'codex' });
    } catch (error) {
      assert.fail(error.cause?.message || error.message);
    }
    priorProcess = sessionRunner.startSessionProcess({
      db,
      repoRoot: fx.rootDir,
      sid: initial.sid,
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    });
    assert.equal(ops.readSession(db, initial.sid).status, 'running');
    db.exec(
      `CREATE TRIGGER fail_takeover_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected takeover receipt failure');
       END`,
    );
    const request = {
      action: 'acquire',
      scope: { task_id: taskId },
      payload: { runtime: 'codex', role: 'implement', takeover: true },
      idempotency_key: 'takeover-receipt-retry',
    };

    const failed = await captureFacadeCode(
      () => ultraFacade.dispatch(
        'ultra.session',
        request,
        db,
        { rootDir: fx.rootDir, runtime: 'codex' },
      ),
    );
    assert.equal(STABLE_PERSISTENCE_ERRORS.has(failed.code), true);
    assert.equal(ops.readSession(db, initial.sid).status, 'crashed');
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'").get().count,
      0,
    );

    db.exec('DROP TRIGGER fail_takeover_receipt');
    const retried = await ultraFacade.dispatch(
      'ultra.session',
      request,
      db,
      { rootDir: fx.rootDir, runtime: 'codex' },
    );
    assert.equal(retried.accepted, true);
    assert.equal(ops.readSession(db, retried.sid).status, 'running');
  } finally {
    try {
      if (priorProcess && sessionRunner._internal.processIsExecuting(priorProcess.pid)) {
        priorProcess.kill('SIGKILL');
      }
    } catch { /* fixture cleanup */ }
    closeStateDb(db);
    cleanup(fx);
  }
});
