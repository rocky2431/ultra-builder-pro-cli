'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');
const facade = require('../lib/ultra-facade.cjs');
const taskLedger = require('../lib/task-ledger.cjs');
const sessionRunner = require('../../orchestrator/session-runner.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(ROOT, 'mcp-server', 'server.cjs');
const PUBLIC_TOOLS = [
  'ultra.archive',
  'ultra.checkpoint',
  'ultra.context',
  'ultra.doctor',
  'ultra.record',
  'ultra.session',
  'ultra.sync',
];

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-public-facade-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  seedReadyBaseline(db, { rootDir });
  closeStateDb(db);
  return { rootDir, dbPath };
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
    { name: 'ubp-public-facade-test', version: '0.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

test('tools/list exposes only the narrow model-facing MCP kernel', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), PUBLIC_TOOLS);
      assert.ok(
        Buffer.byteLength(JSON.stringify(listed.tools)) <= 12_000,
        'the public MCP schema must stay below the bounded context budget',
      );
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('retired fine-grained tools are neither discoverable nor callable', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === 'task.list'), false);
      const result = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /UNKNOWN_TOOL/);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('Context and sync repair remain callable when a valid v0.23 ledger needs migration', async () => {
  const fx = fixture();
  try {
    const { db } = initStateDb(fx.dbPath);
    const current = taskLedger.publishTaskLedger(db, {
      rootDir: fx.rootDir,
      reason: 'v0.23_fixture',
    }).ledger;
    closeStateDb(db);
    const baseline = current.baseline
      ? Object.fromEntries(
        Object.entries(current.baseline)
          .filter(([key]) => key !== 'research_checkpoint_id'),
      )
      : null;
    if (baseline) {
      baseline.digest = crypto.createHash('sha256')
        .update(JSON.stringify(Object.fromEntries(
          taskLedger.DURABLE_BASELINE_FIELDS
            .filter((field) => field !== 'research_checkpoint_id')
            .filter((field) => baseline[field] !== undefined)
            .map((field) => [field, baseline[field]]),
        )))
        .digest('hex');
    }
    const legacy = {
      ...current,
      schema_version: '1.0',
      baseline,
    };
    delete legacy.decisions;
    delete legacy.checkpoints;
    legacy.state_digest = crypto.createHash('sha256')
      .update(JSON.stringify({
        baseline: legacy.baseline,
        changes: legacy.changes,
        tasks: legacy.tasks,
      }))
      .digest('hex');
    fs.writeFileSync(
      taskLedger.ledgerPath(fx.rootDir),
      `${JSON.stringify(legacy, null, 2)}\n`,
    );

    await withClient(fx, async (client) => {
      const context = await client.callTool({
        name: 'ultra.context',
        arguments: { detail: 'summary' },
      });
      assert.notEqual(context.isError, true, context.content?.[0]?.text);
      assert.equal(
        context.structuredContent.envelope.team_checkpoint.status,
        'migration_required',
      );

      const inspection = await client.callTool({
        name: 'ultra.sync',
        arguments: { action: 'inspect' },
      });
      assert.notEqual(inspection.isError, true, inspection.content?.[0]?.text);
      assert.equal(inspection.structuredContent.status, 'migration_required');

      const migrated = await client.callTool({
        name: 'ultra.sync',
        arguments: { action: 'migrate' },
      });
      assert.notEqual(migrated.isError, true, migrated.content?.[0]?.text);
      assert.equal(migrated.structuredContent.migrated, true);
      assert.equal(taskLedger.readTaskLedger(fx.rootDir).schema_version, '2.0');
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('the public façade does not import the retired workflow authorization engine', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'mcp-server', 'lib', 'ultra-facade.cjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /require\(['"]\.\/workflow-state\.cjs['"]\)/);
  assert.doesNotMatch(source, /WORKFLOW_DEFINITIONS/);
  const loaded = JSON.parse(execFileSync(
    process.execPath,
    ['-e', [
      "require('./mcp-server/lib/ultra-facade.cjs');",
      'process.stdout.write(JSON.stringify(Object.keys(require.cache)',
      ".filter((file) => /workflow-state|decision-dialogue|context-spine|spec-learning/.test(file))));",
    ].join('')],
    { cwd: ROOT, encoding: 'utf8' },
  ));
  assert.deepEqual(
    loaded,
    [],
    'loading the public kernel must not initialize retired semantic supervisors',
  );
});

test('the production Change API exposes only kernel behavior', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'mcp-server', 'lib', 'change-workflow.cjs'),
    'utf8',
  );
  const packetSource = fs.readFileSync(
    path.join(ROOT, 'mcp-server', 'lib', 'change-packet.cjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /\bkernelMode\b/);
  assert.doesNotMatch(source, /\blegacyMode\b/);
  assert.doesNotMatch(source, /loadLegacyModule|legacyWorkflows|legacyDecisions|legacyContextSpine/);
  assert.doesNotMatch(source, /compileContext|convergeChange|WORKFLOW_DEFINITIONS/);
  assert.doesNotMatch(packetSource, /workflow_runs|workflow_steps|decision_threads/);
  assert.ok(fs.existsSync(
    path.join(ROOT, 'mcp-server', 'lib', 'legacy-change-workflow.cjs'),
  ));
});

test('semantic rejection is durably audited without claiming a semantic state commit', async () => {
  const fx = fixture();
  try {
    let result;
    let priorContext;
    let context;
    await withClient(fx, async (client) => {
      priorContext = await client.callTool({
        name: 'ultra.context',
        arguments: { detail: 'full' },
      });
      result = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'task_contract',
          action: 'define',
          data: {
            id: 'rejected-task',
            title: 'Rejected task',
            type: 'feature',
            priority: 'P1',
            change_id: 'missing-change',
          },
          idempotency_key: 'rejected-task:define',
        }] },
      });
      context = await client.callTool({
        name: 'ultra.context',
        arguments: { detail: 'full' },
      });
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.accepted, false);
    assert.equal(result._meta.ultra.projection_commit, 'committed');
    assert.equal(Object.hasOwn(result._meta.ultra, 'state_commit'), false);

    const { db } = initStateDb(fx.dbPath);
    const attempt = db.prepare(
      `SELECT payload_json FROM events
       WHERE type = 'ultra_kernel_attempt'
       ORDER BY id DESC LIMIT 1`,
    ).get();
    assert.ok(attempt, 'the rejected semantic attempt must remain inspectable');
    const payload = JSON.parse(attempt.payload_json);
    assert.equal(payload.accepted, false);
    assert.equal(payload.tool, 'ultra.record');
    assert.deepEqual(payload.idempotency_keys, ['rejected-task:define']);
    assert.deepEqual(payload.diagnostics.map((item) => item.code), ['CHANGE_NOT_FOUND']);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = 'rejected-task'").get().count, 0);
    assert.equal(
      context.structuredContent.audit.rejected_attempts[0].diagnostics[0].code,
      'CHANGE_NOT_FOUND',
    );
    assert.equal(
      context.structuredContent.digest,
      priorContext.structuredContent.digest,
      'audit history must not churn the semantic Context Envelope digest',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('the public kernel cannot create new authority owned by retired workflows', async () => {
  const fx = fixture();
  try {
    const artifactPath = path.join(
      fx.rootDir,
      '.ultra',
      'changes',
      'active',
      'legacy-owner',
      'plan.md',
    );
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, '# Plan\n');

    let result;
    await withClient(fx, async (client) => {
      result = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'artifact',
          action: 'bind',
          data: {
            id: 'legacy-workflow-artifact',
            owner_type: 'workflow',
            owner_id: 'retired-run',
            kind: 'execution_plan_markdown',
            path: '.ultra/changes/active/legacy-owner/plan.md',
            provenance: { writer: 'test' },
            source_refs: [],
            consumer_refs: [],
          },
          idempotency_key: 'legacy-workflow-artifact:bind',
        }] },
      });
    });

    assert.equal(result.structuredContent.accepted, false);
    assert.deepEqual(
      result.structuredContent.results[0].diagnostics.map((item) => item.code),
      ['LEGACY_AUTHORITY_READ_ONLY'],
    );
    const { db } = initStateDb(fx.dbPath);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM artifacts WHERE id = 'legacy-workflow-artifact'",
      ).get().count,
      0,
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('semantic checkpoint diagnostics remain advisory and do not reject caller acceptance', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const created = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'change_contract',
          action: 'open',
          data: completeChangeInput({
            id: 'checkpoint-draft',
            title: 'Keep a failed Plan draft editable',
            kind: 'standard',
            intent: 'A failed plan checkpoint must return diagnostics without locking authority.',
          }),
          idempotency_key: 'checkpoint-draft-change',
        }] },
      });
      assert.equal(created.isError, undefined);

      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: { change_id: 'checkpoint-draft' },
          payload: { verdict: 'request_changes' },
          idempotency_key: 'checkpoint-draft-review-1',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, true);
      assert.equal(result.structuredContent.mutable, false);
      assert.deepEqual(result.structuredContent.blockers, []);
      assert.deepEqual(
        result.structuredContent.diagnostics.map((item) => [item.code, item.severity]),
        [
          ['REVIEW_VERDICT_RECORDED', 'warning'],
          ['REVIEW_EVIDENCE_MISSING', 'warning'],
        ],
      );
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint rejects explicit task and Change scopes that do not exist', async () => {
  const fx = fixture();
  try {
    const beforeDb = initStateDb(fx.dbPath).db;
    const before = {
      checkpoints: beforeDb.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      contexts: beforeDb.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    };
    closeStateDb(beforeDb);
    await withClient(fx, async (client) => {
      const missingTask = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'dev',
          scope: { task_id: 'missing-task' },
          payload: { summary: 'This scope must not create ghost authority.' },
          idempotency_key: 'missing-task-checkpoint',
        },
      });
      assert.equal(missingTask.isError, true);
      assert.match(missingTask.content[0].text, /CHECKPOINT_SCOPE_NOT_FOUND/);

      const missingChange = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: { change_id: 'missing-change' },
          payload: { verdict: 'approve' },
          idempotency_key: 'missing-change-checkpoint',
        },
      });
      assert.equal(missingChange.isError, true);
      assert.match(missingChange.content[0].text, /CHECKPOINT_SCOPE_NOT_FOUND/);
    });
    const afterDb = initStateDb(fx.dbPath).db;
    assert.equal(
      afterDb.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      before.checkpoints,
    );
    assert.equal(
      afterDb.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      before.contexts,
    );
    closeStateDb(afterDb);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint rejects a Task scope paired with a different Change authority', async () => {
  const fx = fixture();
  try {
    const beforeDb = initStateDb(fx.dbPath).db;
    const before = {
      checkpoints: beforeDb.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      contexts: beforeDb.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
    };
    closeStateDb(beforeDb);
    await withClient(fx, async (client) => {
      const firstChangeId = 'checkpoint-scope-owner';
      const secondChangeId = 'checkpoint-scope-other';
      const taskId = `${firstChangeId}-task`;
      const recorded = await client.callTool({
        name: 'ultra.record',
        arguments: {
          entries: [{
            kind: 'change_contract',
            action: 'open',
            data: completeChangeInput({
              id: firstChangeId,
              title: 'Own the checkpoint task',
              kind: 'quick',
              intent: 'The Task checkpoint must retain its durable Change owner.',
            }),
            idempotency_key: `${firstChangeId}:open`,
          }, {
            kind: 'change_contract',
            action: 'open',
            data: completeChangeInput({
              id: secondChangeId,
              title: 'Remain a separate checkpoint scope',
              kind: 'quick',
              intent: 'A separate Change must not claim another Change task.',
            }),
            idempotency_key: `${secondChangeId}:open`,
          }, {
            kind: 'task_contract',
            action: 'define',
            data: {
              id: taskId,
              title: 'Retain checkpoint scope ownership',
              type: 'feature',
              priority: 'P1',
              change_id: firstChangeId,
            },
            idempotency_key: `${taskId}:define`,
          }],
        },
      });
      assert.equal(recorded.structuredContent.accepted, true);

      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'dev',
          scope: { task_id: taskId, change_id: secondChangeId },
          payload: { summary: 'A mismatched scope must not be persisted.' },
          idempotency_key: `${taskId}:mismatched-checkpoint`,
        },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /CHECKPOINT_SCOPE_MISMATCH/);
    });
    const afterDb = initStateDb(fx.dbPath).db;
    assert.equal(
      afterDb.prepare('SELECT COUNT(*) AS count FROM stage_checkpoints').get().count,
      before.checkpoints,
    );
    assert.equal(
      afterDb.prepare('SELECT COUNT(*) AS count FROM context_envelopes').get().count,
      before.contexts,
    );
    closeStateDb(afterDb);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint evidence rejects local byte drift instead of judging the semantic verdict', async () => {
  const fx = fixture();
  try {
    const report = path.join(fx.rootDir, '.ultra', 'changes', 'review-report.json');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, '{"verdict":"request_changes"}\n');
    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: {},
          payload: {
            verdict: 'request_changes',
            evidence: [{
              kind: 'review_report',
              ref: '.ultra/changes/review-report.json',
              digest: '0'.repeat(64),
            }],
          },
          idempotency_key: 'checkpoint-review-drift-1',
        },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /CHECKPOINT_EVIDENCE_DIGEST_MISMATCH/);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint evidence rejects an explicit digest that contradicts managed artifact authority', async () => {
  const fx = fixture();
  try {
    const changeId = 'checkpoint-managed-evidence';
    const relative = `.ultra/changes/active/${changeId}/review/summary.json`;
    const report = path.join(fx.rootDir, relative);
    await withClient(fx, async (client) => {
      const opened = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'change_contract',
          action: 'open',
          data: completeChangeInput({
            id: changeId,
            title: 'Bind managed checkpoint evidence',
            kind: 'quick',
            intent: 'Managed evidence must not silently override a contradictory caller digest.',
          }),
          idempotency_key: `${changeId}:open`,
        }] },
      });
      assert.equal(opened.structuredContent.accepted, true);
      fs.mkdirSync(path.dirname(report), { recursive: true });
      fs.writeFileSync(report, '{"verdict":"request_changes"}\n');

      const recorded = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'artifact',
          action: 'bind',
          data: {
            id: `${changeId}-review`,
            owner_type: 'change',
            owner_id: changeId,
            change_id: changeId,
            kind: 'review_report',
            path: relative,
            source_refs: [{
              type: 'change',
              id: changeId,
              relation: 'produced_for',
            }],
            consumer_refs: [],
            provenance: { writer: 'public-facade-test' },
            metadata: { terminal_role: true },
          },
          idempotency_key: `${changeId}:artifact`,
        }] },
      });
      assert.equal(recorded.structuredContent.accepted, true);

      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: { change_id: changeId },
          payload: {
            verdict: 'request_changes',
            evidence: [{
              kind: 'review_report',
              artifact_id: `${changeId}-review`,
              ref: relative,
              digest: '0'.repeat(64),
            }],
          },
          idempotency_key: `${changeId}:checkpoint`,
        },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /CHECKPOINT_EVIDENCE_DIGEST_MISMATCH/);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint evidence reports a missing managed artifact through the public authority error', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: {},
          payload: {
            verdict: 'request_changes',
            evidence: [{
              kind: 'review_report',
              artifact_id: 'missing-review-artifact',
            }],
          },
          idempotency_key: 'checkpoint-review-missing-artifact',
        },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /CHECKPOINT_EVIDENCE_AUTHORITY_MISSING/);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('checkpoint keeps undigested evidence visible as an advisory declaration', async () => {
  const fx = fixture();
  try {
    fs.mkdirSync(path.join(fx.rootDir, '.ultra', 'changes'), { recursive: true });
    fs.writeFileSync(
      path.join(fx.rootDir, '.ultra', 'changes', 'declared-review.md'),
      '# Review declaration\n',
    );
    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'review',
          scope: {},
          payload: {
            verdict: 'approve',
            evidence: [{
              kind: 'review_report',
              ref: '.ultra/changes/declared-review.md',
            }],
          },
          idempotency_key: 'checkpoint-review-undigested-1',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, true);
      assert.ok(result.structuredContent.diagnostics.some((item) => (
        item.code === 'CHECKPOINT_EVIDENCE_UNBOUND' && item.severity === 'warning'
      )));
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('the public task outcome action can reopen a completed task without erasing history', async () => {
  const fx = fixture();
  try {
    const { db } = initStateDb(fx.dbPath);
    ops.createTask(db, {
      id: 'reopen-public-task',
      title: 'Reopen completed public task',
      type: 'feature',
      priority: 'P1',
    });
    ops.updateTaskStatus(db, 'reopen-public-task', 'in_progress');
    ops.updateTaskStatus(db, 'reopen-public-task', 'completed');
    ops.patchTask(db, 'reopen-public-task', {
      completion_commit: '0123456789012345678901234567890123456789',
      session_id: 'prior-session',
    });
    closeStateDb(db);

    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.record',
        arguments: {
          entries: [{
            kind: 'task_outcome',
            action: 'reopen',
            data: { id: 'reopen-public-task' },
            idempotency_key: 'reopen-public-task:reopen',
          }],
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, true);
      const task = result.structuredContent.results[0].result.task;
      assert.equal(task.status, 'in_progress');
      assert.equal(task.completion_commit, null);
      assert.equal(task.session_id, null);
    });

    const reopened = initStateDb(fx.dbPath).db;
    const event = reopened.prepare(
      `SELECT payload_json FROM events
       WHERE task_id = 'reopen-public-task' AND type = 'task_reopened'`,
    ).get();
    assert.equal(
      JSON.parse(event.payload_json).previous_completion_commit,
      '0123456789012345678901234567890123456789',
    );
    closeStateDb(reopened);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('a failed archive preflight reports diagnostics instead of a transport error', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.archive',
        arguments: {
          change_id: 'missing-change',
          payload: { summary: 'No archive should be created.' },
          idempotency_key: 'missing-archive-1',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, false);
      assert.equal(result.structuredContent.mutable, true);
      assert.deepEqual(result.structuredContent.blockers, ['CHANGE_NOT_FOUND']);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('archive trusts the explicit caller handoff instead of requiring a fixed semantic stage sequence', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const changeId = 'adaptive-archive';
      const created = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'change_contract',
          action: 'open',
          data: completeChangeInput({
            id: changeId,
            title: 'Archive an intentionally bounded documentation Change',
            kind: 'quick',
            intent: 'Archive an explicitly accepted Change without a fixed stage recipe.',
          }),
          idempotency_key: `${changeId}:open`,
        }] },
      });
      assert.equal(created.structuredContent.accepted, true);

      const archived = await client.callTool({
        name: 'ultra.archive',
        arguments: {
          change_id: changeId,
          payload: {
            summary: 'The caller accepts the bounded Change for local archive.',
            baseline_updates: [],
            no_baseline_change_reason: 'This fixture changes no baseline semantic file.',
          },
          idempotency_key: `${changeId}:archive`,
        },
      });
      assert.equal(archived.isError, undefined);
      assert.equal(
        archived.structuredContent.accepted,
        true,
        JSON.stringify(archived.structuredContent),
      );
      assert.equal(archived.structuredContent.result.change.status, 'archived');
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('ultra.context is a side-effect-free read of the complete project spine', async () => {
  const fx = fixture();
  try {
    const beforeDb = initStateDb(fx.dbPath).db;
    const before = {
      workflows: beforeDb.prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count,
      contexts: beforeDb.prepare('SELECT COUNT(*) AS count FROM context_snapshots').get().count,
    };
    closeStateDb(beforeDb);
    await withClient(fx, async (client) => {
      const result = await client.callTool({
        name: 'ultra.context',
        arguments: {
          stage: 'plan',
          scope: { change_id: 'not-created' },
          detail: 'summary',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.envelope.change, null);
    });
    const { db } = initStateDb(fx.dbPath);
    try {
      assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM workflow_runs').get().count,
        before.workflows,
      );
      assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM context_snapshots').get().count,
        before.contexts,
      );
    } finally {
      closeStateDb(db);
    }
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('ultra.context does not initialize authority in an uninitialized project', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-public-context-empty-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  try {
    await withClient({ rootDir, dbPath }, async (client) => {
      const result = await client.callTool({
        name: 'ultra.context',
        arguments: { stage: 'project', detail: 'summary' },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /STATE_DB_MISSING/);
    });
    assert.equal(fs.existsSync(path.join(rootDir, '.ultra')), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('ultra.record batches draft mutations and makes retries idempotent', async () => {
  const fx = fixture();
  try {
    const entry = {
      kind: 'change_contract',
      action: 'open',
      data: completeChangeInput({
        id: 'record-batch',
        title: 'Record a draft through the narrow façade',
        kind: 'standard',
        intent: 'One model call records this accepted Change contract.',
      }),
      idempotency_key: 'record-batch-change-1',
    };
    await withClient(fx, async (client) => {
      const first = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [entry] },
      });
      assert.equal(first.isError, undefined);
      assert.equal(first.structuredContent.results[0].accepted, true);
      assert.equal(first.structuredContent.results[0].idempotent, false);

      const second = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [entry] },
      });
      assert.equal(second.isError, undefined);
      assert.equal(second.structuredContent.results[0].accepted, true);
      assert.equal(second.structuredContent.results[0].idempotent, true);
    });
    const { db } = initStateDb(fx.dbPath);
    try {
      assert.equal(
        db.prepare("SELECT COUNT(*) AS count FROM changes WHERE id = 'record-batch'").get().count,
        1,
      );
    } finally {
      closeStateDb(db);
    }
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('ultra.record can initialize a fresh project without pre-creating state authority', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-public-init-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  try {
    assert.equal(fs.existsSync(dbPath), false);
    await withClient({ rootDir, dbPath }, async (client) => {
      const result = await client.callTool({
        name: 'ultra.record',
        arguments: {
          entries: [{
            kind: 'baseline',
            action: 'initialize',
            data: {
              target_dir: rootDir,
              project_name: 'public-init',
              mode: 'greenfield',
              git_mode: 'initialize',
            },
            idempotency_key: 'public-init-1',
          }],
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, true);
      assert.equal(result.structuredContent.results[0].accepted, true);
    });
    assert.equal(fs.existsSync(dbPath), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('one plan checkpoint compiles context, validates authority, and publishes the team ledger', async () => {
  const fx = fixture();
  try {
    const changeId = 'checkpoint-plan';
    const acceptanceId = `${changeId}-acceptance`;
    await withClient(fx, async (client) => {
      const change = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'change_contract',
          action: 'open',
          data: completeChangeInput({
            id: changeId,
            title: 'Checkpoint a complete Plan',
            kind: 'standard',
            intent: 'One public checkpoint replaces the eight mechanical Plan calls.',
          }),
          idempotency_key: 'checkpoint-plan-change',
        }] },
      });
      assert.equal(change.isError, undefined);
      const task = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [{
          kind: 'task_contract',
          action: 'define',
          data: {
            id: 'checkpoint-plan-task',
            title: 'Implement the checkpoint seam',
            type: 'feature',
            priority: 'P1',
            change_id: changeId,
            outcome: 'The Plan becomes accepted in one public call.',
            slice_kind: 'tracer_bullet',
            public_seam: 'ultra.checkpoint',
            verification_command: 'node --test mcp-server/tests/public-facade.test.cjs',
            acceptance: [{
              id: acceptanceId,
              criterion: 'The complete plan is accepted.',
              verification: 'node --test mcp-server/tests/public-facade.test.cjs',
            }],
            context_refs: [{
              ref: '.ultra/specs/product.md',
              reason: 'Current accepted product authority.',
              required: true,
            }],
            docs_impact: {
              status: 'none',
              files: [],
              rationale: 'No public documentation changes are required.',
            },
            ownership: { owner: 'test-owner', reviewers: [] },
            trace_to: acceptanceId,
          },
          idempotency_key: 'checkpoint-plan-task',
        }] },
      });
      assert.equal(task.isError, undefined);

      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'plan',
          scope: { change_id: changeId },
          payload: {},
          idempotency_key: 'checkpoint-plan-accepted-1',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, true);
      assert.equal(result.structuredContent.checkpoint.status, 'accepted');
      assert.equal(result.structuredContent.result.team_checkpoint.ledger.tasks.length, 1);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('failed session acquisition abandons its prepared packet without active lease authority', async () => {
  const fx = fixture();
  const { db } = initStateDb(fx.dbPath);
  const originalSpawn = sessionRunner.spawnSession;
  try {
    const changeId = 'failed-session';
    const taskId = `${changeId}-task`;
    await facade.dispatch('ultra.record', { entries: [{
      kind: 'change_contract',
      action: 'open',
      data: completeChangeInput({
        id: changeId,
        title: 'Recover failed session acquisition',
        kind: 'quick',
        intent: 'A failed session must leave no active packet or lease authority.',
      }),
      idempotency_key: `${changeId}:open`,
    }, {
      kind: 'task_contract',
      action: 'define',
      data: {
        id: taskId,
        title: 'Exercise failed acquisition',
        type: 'feature',
        priority: 'P0',
        change_id: changeId,
        outcome: 'The failed packet is explicitly abandoned.',
        slice_kind: 'tracer_bullet',
        public_seam: 'ultra.session',
        verification_command: 'node --test mcp-server/tests/public-facade.test.cjs',
        acceptance: [{
          id: `${changeId}-acceptance`,
          criterion: 'No active lease or packet remains.',
          verification: 'node --test mcp-server/tests/public-facade.test.cjs',
        }],
        context_refs: [],
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
    const planned = await facade.dispatch('ultra.checkpoint', {
      stage: 'plan',
      scope: { change_id: changeId },
      payload: { summary: 'Prepare one bounded task.' },
      idempotency_key: `${changeId}:plan`,
    }, db, { rootDir: fx.rootDir, runtime: 'test' });
    assert.equal(planned.accepted, true);

    sessionRunner.spawnSession = () => {
      const error = new Error('injected worktree allocation failure');
      error.code = 'WORKTREE_CREATE_FAILED';
      throw error;
    };
    const result = await facade.dispatch('ultra.session', {
      action: 'acquire',
      scope: { task_id: taskId },
      payload: { runtime: 'codex', role: 'implement' },
      idempotency_key: `${taskId}:acquire`,
    }, db, { rootDir: fx.rootDir, runtime: 'codex' });
    assert.equal(result.accepted, false);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM worker_packets WHERE status IN ('pending','assigned')",
      ).get().count,
      0,
    );
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM worker_packets WHERE status = 'abandoned'",
      ).get().count,
      1,
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally {
    sessionRunner.spawnSession = originalSpawn;
    closeStateDb(db);
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
