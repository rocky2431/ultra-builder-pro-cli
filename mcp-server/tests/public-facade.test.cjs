'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

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

test('0.22 fine-grained tools remain callable but are hidden from discovery', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const listed = await client.listTools();
      assert.equal(listed.tools.some((tool) => tool.name === 'task.list'), false);
      const result = await client.callTool({ name: 'task.list', arguments: {} });
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent.tasks, []);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('a failed semantic checkpoint reports blockers and leaves the draft mutable', async () => {
  const fx = fixture();
  try {
    await withClient(fx, async (client) => {
      const created = await client.callTool({
        name: 'change.create',
        arguments: completeChangeInput({
          id: 'checkpoint-draft',
          title: 'Keep a failed Plan draft editable',
          kind: 'standard',
          intent: 'A failed plan checkpoint must return diagnostics without locking authority.',
        }),
      });
      assert.equal(created.isError, undefined);

      const result = await client.callTool({
        name: 'ultra.checkpoint',
        arguments: {
          stage: 'plan',
          scope: { change_id: 'checkpoint-draft' },
          payload: {},
          idempotency_key: 'checkpoint-draft-plan-1',
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.accepted, false);
      assert.equal(result.structuredContent.mutable, true);
      assert.ok(result.structuredContent.blockers.length > 0);
    });
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
      assert.deepEqual(result.structuredContent.blockers, ['WORKFLOW_CHANGE_NOT_FOUND']);
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
      assert.equal(result.structuredContent.context, null);
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
      operation: 'change.create',
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
            operation: 'task.init_project',
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
        name: 'change.create',
        arguments: completeChangeInput({
          id: changeId,
          title: 'Checkpoint a complete Plan',
          kind: 'standard',
          intent: 'One public checkpoint replaces the eight mechanical Plan calls.',
        }),
      });
      assert.equal(change.isError, undefined);
      const task = await client.callTool({
        name: 'task.create',
        arguments: {
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
      assert.equal(result.structuredContent.workflow.status, 'completed');
      assert.equal(result.structuredContent.result.team_checkpoint.ledger.tasks.length, 1);
    });
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
