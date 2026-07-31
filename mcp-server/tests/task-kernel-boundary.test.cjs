'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const facade = require('../lib/ultra-facade.cjs');
const taskLedger = require('../lib/task-ledger.cjs');
const workerPackets = require('../lib/worker-packet.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-task-kernel-boundary-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  return {
    rootDir,
    dbPath,
    db,
    cleanup() {
      closeStateDb(db);
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function validTask(id, overrides = {}) {
  return {
    id,
    title: `Deliver ${id}`,
    type: 'feature',
    priority: 'P1',
    outcome: `${id} is verifiably complete`,
    slice_kind: 'tracer_bullet',
    public_seam: `cli:${id}`,
    verification_command: `node --test ${id}.test.cjs`,
    acceptance: [{
      id: `${id}-acceptance`,
      criterion: `${id} works`,
      verification: `node --test ${id}.test.cjs`,
    }],
    context_refs: [],
    docs_impact: {
      status: 'none',
      files: [],
      rationale: 'No public documentation change.',
    },
    ownership: { owner: 'task-kernel-boundary-test', reviewers: [] },
    trace_to: `.ultra/specs/product.md#${id}`,
    ...overrides,
  };
}

function recordEntry(kind, action, data, idempotencyKey) {
  return {
    kind,
    action,
    data,
    idempotency_key: idempotencyKey,
  };
}

async function dispatchRecord(fx, entries) {
  return facade.dispatch('ultra.record', { entries }, fx.db, {
    rootDir: fx.rootDir,
  });
}

function attemptEvents(db) {
  return db.prepare(
    `SELECT payload_json FROM events
     WHERE type = 'ultra_kernel_attempt'
     ORDER BY id`,
  ).all().map((row) => JSON.parse(row.payload_json));
}

function copyLedger(source, target) {
  const sourcePath = taskLedger.ledgerPath(source.rootDir);
  const targetPath = taskLedger.ledgerPath(target.rootDir);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function createChange(db, id) {
  db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'quick', 'active', ?, ?)`,
  ).run(
    id,
    `Change ${id}`,
    `Complete ${id} safely.`,
    `.ultra/changes/active/${id}`,
  );
}

function prepareCompletableTask(fx, id) {
  const changeId = `${id}-change`;
  createChange(fx.db, changeId);
  ops.createTask(fx.db, validTask(id, { change_id: changeId }));
  ops.updateTaskStatus(fx.db, id, 'in_progress');
  const packet = workerPackets.createWorkerPacket(fx.db, {
    role: 'implement',
    task_id: id,
    runtime: 'codex',
    output_path: `.ultra/changes/active/${changeId}/delivery/${id}.json`,
  }, { rootDir: fx.rootDir });
  workerPackets.markWorkerPacketAssigned(fx.db, packet.id);
  const outputFile = path.join(fx.rootDir, packet.output.path);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(
    outputFile,
    `${JSON.stringify({ packet_digest: packet.packet_digest }, null, 2)}\n`,
  );
  return packet;
}

test('task_contract revise cannot bypass runtime status and Worker Packet ownership', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, validTask('status-owned'));

    const result = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'revise',
        { id: 'status-owned', patch: { status: 'completed' } },
        'status-owned:revise',
      ),
    ]);

    assert.equal(result.accepted, false);
    assert.equal(ops.readTask(fx.db, 'status-owned').status, 'pending');
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM worker_packets').get().count,
      0,
    );
    assert.ok(
      result.results[0].diagnostics.some(
        (item) => ['TASK_FIELD_OWNERSHIP', 'VALIDATION_ERROR'].includes(item.code),
      ),
      JSON.stringify(result, null, 2),
    );
  } finally {
    fx.cleanup();
  }
});

test('task_contract revise keeps semantic drafts mutable for title and type corrections', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, validTask('semantic-draft'));

    const result = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'revise',
        {
          id: 'semantic-draft',
          patch: { title: 'Corrected task title', type: 'bugfix' },
        },
        'semantic-draft:revise',
      ),
    ]);

    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    const task = ops.readTask(fx.db, 'semantic-draft');
    assert.equal(task.title, 'Corrected task title');
    assert.equal(task.type, 'bugfix');
  } finally {
    fx.cleanup();
  }
});

test('Task semantic vocabulary is open while identifiers and scalar types remain exact', async () => {
  const fx = fixture();
  try {
    const result = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'define',
        {
          id: 'open-vocabulary',
          title: 'Document a security migration',
          type: 'security_migration',
          priority: 'urgent-owner-review',
          slice_kind: 'documentation_checkpoint',
        },
        'open-vocabulary:define',
      ),
    ]);
    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    const task = ops.readTask(fx.db, 'open-vocabulary');
    assert.equal(task.type, 'security_migration');
    assert.equal(task.priority, 'urgent-owner-review');
    assert.equal(task.slice_kind, 'documentation_checkpoint');
  } finally {
    fx.cleanup();
  }
});

test('incomplete Task semantics are advisory and do not deny a mechanically safe admission', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'advisory-contract',
      title: 'Keep the semantic draft editable',
      type: 'feature',
      priority: 'P2',
    });
    const result = await facade.dispatch('ultra.session', {
      action: 'admission',
      scope: { task_id: 'advisory-contract' },
    }, fx.db, { rootDir: fx.rootDir, runtime: 'codex' });
    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    assert.equal(result.can_acquire, true);
    assert.ok(
      result.diagnostics.some((item) => item.code === 'TASK_OUTCOME_MISSING'),
      JSON.stringify(result, null, 2),
    );
    assert.ok(
      result.diagnostics
        .filter((item) => item.code.startsWith('TASK_'))
        .every((item) => item.severity === 'warning'),
      JSON.stringify(result, null, 2),
    );
  } finally {
    fx.cleanup();
  }
});

test('a minimal Change draft persists before acceptance, recovery, and routing are complete', async () => {
  const fx = fixture();
  try {
    const result = await dispatchRecord(fx, [
      recordEntry(
        'change_contract',
        'open',
        {
          id: 'mutable-change-draft',
          title: 'Keep an early Change draft',
          kind: 'security_migration',
          intent: 'Preserve accepted intent before the model finishes semantic refinement.',
        },
        'mutable-change-draft:open',
      ),
    ]);
    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    const change = fx.db.prepare(
      "SELECT kind, contract_json, classification_json, research_disposition_json FROM changes WHERE id = 'mutable-change-draft'",
    ).get();
    assert.equal(change.kind, 'security_migration');
    assert.deepEqual(JSON.parse(change.contract_json).acceptance, []);
    assert.deepEqual(JSON.parse(change.classification_json).risk_flags, []);
    assert.equal(JSON.parse(change.research_disposition_json).status, 'unresolved');
  } finally {
    fx.cleanup();
  }
});

test('Change semantic vocabulary is open while the public contract remains structurally exact', async () => {
  const fx = fixture();
  try {
    const result = await dispatchRecord(fx, [
      recordEntry(
        'change_contract',
        'open',
        {
          id: 'open-change-vocabulary',
          title: 'Prepare a regulated migration',
          kind: 'regulated_migration',
          intent: 'Keep repository-specific planning language under model ownership.',
          classification: {
            rationale: 'The repository requires a named compliance review.',
            risk_flags: ['regulated_deployment'],
          },
          research_disposition: {
            status: 'owner_deferred',
            mode: 'compliance_review',
            selected_steps: ['confirm_external_obligations'],
            rationale: 'The owner will select the exact evidence depth.',
          },
        },
        'open-change-vocabulary:open',
      ),
    ]);
    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    const change = fx.db.prepare(
      `SELECT kind, classification_json, research_disposition_json
       FROM changes WHERE id = 'open-change-vocabulary'`,
    ).get();
    assert.equal(change.kind, 'regulated_migration');
    assert.deepEqual(
      JSON.parse(change.classification_json).risk_flags,
      ['regulated_deployment'],
    );
    assert.equal(
      JSON.parse(change.research_disposition_json).mode,
      'compliance_review',
    );
  } finally {
    fx.cleanup();
  }
});

test('an immutable archived Change can create a linked active successor', async () => {
  const fx = fixture();
  try {
    createChange(fx.db, 'archived-source');
    fx.db.prepare(
      "UPDATE changes SET status = 'archived', artifact_root = '.ultra/changes/archive/archived-source' WHERE id = 'archived-source'",
    ).run();
    const result = await dispatchRecord(fx, [
      recordEntry(
        'change_contract',
        'supersede',
        {
          id: 'archived-source',
          successor_id: 'archived-successor',
          title: 'Continue the archived intent safely',
          intent: 'Preserve the archive and continue in a new mutable Change.',
        },
        'archived-source:supersede',
      ),
    ]);
    assert.equal(result.accepted, true, JSON.stringify(result, null, 2));
    const source = fx.db.prepare(
      "SELECT status FROM changes WHERE id = 'archived-source'",
    ).get();
    const successor = fx.db.prepare(
      "SELECT status, supersedes_id FROM changes WHERE id = 'archived-successor'",
    ).get();
    assert.equal(source.status, 'archived');
    assert.deepEqual(successor, {
      status: 'active',
      supersedes_id: 'archived-source',
    });
  } finally {
    fx.cleanup();
  }
});

test('task contract rejects string boolean coercion in context_refs.required', async () => {
  const fx = fixture();
  try {
    const result = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'define',
        validTask('string-boolean', {
          context_refs: [{
            ref: 'package.json',
            reason: 'Current package contract.',
            freshness: 'existence',
            required: 'false',
          }],
        }),
        'string-boolean:define',
      ),
    ]);

    assert.equal(result.accepted, false);
    assert.equal(ops.readTask(fx.db, 'string-boolean'), null);
    assert.ok(
      result.results[0].diagnostics.some((item) => item.code === 'VALIDATION_ERROR'),
      JSON.stringify(result, null, 2),
    );
  } finally {
    fx.cleanup();
  }
});

test('idempotency binds a key to the exact payload beyond the event history horizon', async () => {
  const fx = fixture();
  try {
    const original = recordEntry(
      'task_contract',
      'define',
      validTask('idempotent-original'),
      'durable-idempotency-key',
    );
    const first = await dispatchRecord(fx, [original]);
    assert.equal(first.accepted, true);

    const mismatched = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'define',
        validTask('idempotent-different'),
        'durable-idempotency-key',
      ),
    ]);
    assert.equal(mismatched.accepted, false);
    assert.ok(
      mismatched.results[0].diagnostics.some(
        (item) => item.code === 'IDEMPOTENCY_KEY_CONFLICT',
      ),
      JSON.stringify(mismatched, null, 2),
    );
    assert.equal(ops.readTask(fx.db, 'idempotent-different'), null);
    assert.ok(
      attemptEvents(fx.db).some((event) => (
        event.operations.includes('task_contract:define')
        && event.diagnostics.some(
          (item) => item.code === 'IDEMPOTENCY_KEY_CONFLICT',
        )
      )),
      'the rejected exact-request conflict must remain visible in audit history',
    );

    const insertNoise = fx.db.prepare(
      `INSERT INTO events (type, payload_json)
       VALUES ('ultra_kernel_call', ?)`,
    );
    const fillHistory = fx.db.transaction(() => {
      for (let index = 0; index < 2001; index += 1) {
        insertNoise.run(JSON.stringify({
          idempotency_key: `noise-${index}`,
          operation: 'event:append',
          accepted: true,
          result: { index },
        }));
      }
    });
    fillHistory();

    const retry = await dispatchRecord(fx, [original]);
    assert.equal(retry.accepted, true, JSON.stringify(retry, null, 2));
    assert.equal(retry.results[0].idempotent, true);
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'idempotent-original'")
        .get().count,
      1,
    );
  } finally {
    fx.cleanup();
  }
});

test('task mutation and idempotency receipt commit or roll back together', async () => {
  const fx = fixture();
  try {
    fx.db.exec(
      `CREATE TRIGGER reject_kernel_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'receipt write failed');
       END`,
    );

    await assert.rejects(
      dispatchRecord(fx, [
        recordEntry(
          'task_contract',
          'define',
          validTask('atomic-receipt'),
          'atomic-receipt:define',
        ),
      ]),
    );
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'atomic-receipt'")
        .get().count,
      0,
      'a failed receipt must not leave the mutation committed',
    );
  } finally {
    fx.cleanup();
  }
});

test('pending stale Task Ledger import preserves the durable stale flag', () => {
  const source = fixture();
  const target = fixture();
  try {
    ops.createTask(source.db, validTask('pending-stale'));
    ops.patchTask(source.db, 'pending-stale', { stale: true });
    taskLedger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'pending_stale_fixture',
    });
    copyLedger(source, target);

    taskLedger.importTaskLedger(target.db, { rootDir: target.rootDir });

    assert.equal(ops.readTask(target.db, 'pending-stale').status, 'pending');
    assert.equal(ops.readTask(target.db, 'pending-stale').stale, true);
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('Task Ledger import rejects changed Git authority while any local session is running', () => {
  const source = fixture();
  const target = fixture();
  try {
    ops.createTask(source.db, validTask('leased-pending'));
    taskLedger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'shared_initial_task',
    });
    copyLedger(source, target);
    taskLedger.importTaskLedger(target.db, { rootDir: target.rootDir });

    ops.createSession(target.db, {
      sid: 'leased-pending-session',
      task_id: 'leased-pending',
      runtime: 'codex',
      worktree_path: path.join(target.rootDir, '.ultra', '.runtime', 'worktrees', 'leased'),
      artifact_dir: path.join(target.rootDir, '.ultra', '.runtime', 'artifacts', 'leased'),
    });
    ops.patchTask(target.db, 'leased-pending', {
      session_id: 'leased-pending-session',
    });
    assert.equal(ops.readTask(target.db, 'leased-pending').status, 'pending');

    ops.patchTask(source.db, 'leased-pending', { priority: 'P2' });
    taskLedger.publishTaskLedger(source.db, {
      rootDir: source.rootDir,
      reason: 'shared_task_changed',
    });
    copyLedger(source, target);

    assert.throws(
      () => taskLedger.importTaskLedger(target.db, { rootDir: target.rootDir }),
      (error) => error?.code === 'TASK_LEDGER_ACTIVE_TASK_CONFLICT',
    );
    const task = ops.readTask(target.db, 'leased-pending');
    assert.equal(task.priority, 'P1');
    assert.equal(task.session_id, 'leased-pending-session');
    assert.equal(
      target.db.prepare("SELECT status FROM sessions WHERE sid = 'leased-pending-session'")
        .get().status,
      'running',
    );
  } finally {
    source.cleanup();
    target.cleanup();
  }
});

test('public task remove rejects force and preserves completed evidence with typed audit', async () => {
  const fx = fixture();
  try {
    const packet = prepareCompletableTask(fx, 'referenced-task');
    const completed = await dispatchRecord(fx, [
      recordEntry(
        'task_outcome',
        'complete',
        { id: 'referenced-task', packet_digest: packet.packet_digest },
        'referenced-task:complete',
      ),
    ]);
    assert.equal(completed.accepted, true, JSON.stringify(completed, null, 2));

    const beforeAttempts = attemptEvents(fx.db).length;
    const forced = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'remove',
        { id: 'referenced-task', force: true },
        'referenced-task:remove',
      ),
    ]);
    assert.equal(forced.accepted, false);
    assert.equal(forced.results[0].diagnostics[0].code, 'VALIDATION_ERROR');
    assert.equal(ops.readTask(fx.db, 'referenced-task').status, 'completed');
    assert.equal(attemptEvents(fx.db).length, beforeAttempts + 1);

    const removed = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'remove',
        { id: 'referenced-task' },
        'referenced-task:remove-without-force',
      ),
    ]);
    assert.equal(removed.accepted, false);
    const diagnostic = removed.results[0].diagnostics[0];
    assert.ok(
      ['TASK_DELETE_NOT_DRAFT', 'TASK_DELETE_REFERENCED'].includes(diagnostic.code),
      JSON.stringify(removed, null, 2),
    );
    assert.doesNotMatch(diagnostic.code, /^SQLITE_/);
    assert.equal(ops.readTask(fx.db, 'referenced-task').status, 'completed');
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE task_id = ?')
        .get('referenced-task').count,
      1,
    );
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM worker_packets WHERE scope_id = ?')
        .get('referenced-task').count,
      1,
    );
    assert.equal(attemptEvents(fx.db).length, beforeAttempts + 2);
  } finally {
    fx.cleanup();
  }
});

test('public task remove rejects session history without relying on a foreign-key error', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, validTask('historical-session'));
    ops.createSession(fx.db, {
      sid: 'historical-session-id',
      task_id: 'historical-session',
      runtime: 'codex',
      worktree_path: path.join(fx.rootDir, '.ultra', '.runtime', 'worktrees', 'history'),
      artifact_dir: path.join(fx.rootDir, '.ultra', '.runtime', 'artifacts', 'history'),
    });
    ops.updateSession(fx.db, 'historical-session-id', { status: 'completed' });

    const result = await dispatchRecord(fx, [
      recordEntry(
        'task_contract',
        'remove',
        { id: 'historical-session' },
        'historical-session:remove',
      ),
    ]);

    assert.equal(result.accepted, false);
    assert.equal(result.results[0].diagnostics[0].code, 'TASK_DELETE_REFERENCED');
    assert.equal(ops.readTask(fx.db, 'historical-session').status, 'pending');
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE task_id = 'historical-session'")
        .get().count,
      1,
    );
    assert.equal(attemptEvents(fx.db).length, 1);
  } finally {
    fx.cleanup();
  }
});

test('task_outcome completion rolls back artifact, status, and receipt as one unit', async () => {
  const fx = fixture();
  try {
    const packet = prepareCompletableTask(fx, 'atomic-completion');
    fx.db.exec(
      `CREATE TRIGGER reject_completion_receipt
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'completion receipt write failed');
       END`,
    );

    await assert.rejects(
      dispatchRecord(fx, [
        recordEntry(
          'task_outcome',
          'complete',
          { id: 'atomic-completion', packet_digest: packet.packet_digest },
          'atomic-completion:complete',
        ),
      ]),
    );

    assert.equal(ops.readTask(fx.db, 'atomic-completion').status, 'in_progress');
    assert.equal(
      fx.db.prepare('SELECT COUNT(*) AS count FROM artifacts WHERE task_id = ?')
        .get('atomic-completion').count,
      0,
    );
    assert.equal(
      fx.db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'ultra_kernel_call'
           AND task_id = 'atomic-completion'`,
      ).get().count,
      0,
    );
  } finally {
    fx.cleanup();
  }
});
