'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO_ROOT, 'mcp-server', 'server.cjs');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-mcp-'));
  return { dir, dbPath: path.join(dir, '.ultra', 'state.db') };
}

async function withClient({ dir, dbPath }, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      UBP_DB_PATH: dbPath,
      UBP_ROOT_DIR: dir,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'ubp-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

function readToolPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content[0].text;
  return JSON.parse(text);
}

function expectError(result) {
  assert.equal(result.isError, true, 'expected isError result');
  return JSON.parse(result.content[0].text).error;
}

test('listTools returns the seven task.* tools with input schemas', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'task.append_event',
        'task.create',
        'task.delete',
        'task.get',
        'task.list',
        'task.subscribe_events',
        'task.update',
      ]);
      for (const t of list.tools) {
        assert.equal(typeof t.inputSchema, 'object');
        assert.equal(t.inputSchema.type, 'object');
      }
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.create + task.get round trip via MCP', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const created = await client.callTool({
        name: 'task.create',
        arguments: { id: 'mcp-1', title: 'first', type: 'feature', priority: 'P1' },
      });
      const createdData = readToolPayload(created);
      assert.equal(createdData.id, 'mcp-1');
      assert.equal(createdData.status, 'pending');

      const got = await client.callTool({ name: 'task.get', arguments: { id: 'mcp-1' } });
      const gotData = readToolPayload(got);
      assert.equal(gotData.task.id, 'mcp-1');
      assert.equal(gotData.task.title, 'first');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.update enforces the status state machine', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'sm-1', title: 'state-machine task', type: 'feature', priority: 'P0' },
      });
      const updated = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'in_progress' } },
      });
      assert.equal(readToolPayload(updated).task.status, 'in_progress');

      const completed = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'completed' } },
      });
      assert.equal(readToolPayload(completed).task.status, 'completed');

      const illegal = await client.callTool({
        name: 'task.update',
        arguments: { id: 'sm-1', patch: { status: 'pending' } },
      });
      const err = expectError(illegal);
      assert.equal(err.code, 'ILLEGAL_STATUS_TRANSITION');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.append_event + subscribe_events drive a monotonic cursor', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'sub-1', title: 'subscribe target', type: 'feature', priority: 'P1' },
      });
      // task.create already emitted event_id=1 (task_created); add 4 more.
      for (let i = 0; i < 4; i++) {
        await client.callTool({
          name: 'task.append_event',
          arguments: { type: 'task_started', task_id: 'sub-1', payload: { i } },
        });
      }

      const first = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: 0, limit: 3 },
      }));
      assert.equal(first.events.length, 3);
      assert.equal(first.events[0].id, 1);
      assert.equal(first.next_since_id, 3);

      const tail = readToolPayload(await client.callTool({
        name: 'task.subscribe_events',
        arguments: { since_id: first.next_since_id, limit: 100 },
      }));
      assert.equal(tail.events.length, 2);
      assert.equal(tail.events[0].id, 4);
      assert.equal(tail.next_since_id, 5);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.list filters by status and tag', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await client.callTool({ name: 'task.create', arguments: { id: 'l-1', title: 'list one', type: 'feature', priority: 'P0', tag: 'main' } });
      await client.callTool({ name: 'task.create', arguments: { id: 'l-2', title: 'list two', type: 'feature', priority: 'P1', tag: 'main' } });
      await client.callTool({ name: 'task.create', arguments: { id: 'l-3', title: 'list three', type: 'feature', priority: 'P2', tag: 'feat-x' } });
      await client.callTool({ name: 'task.update', arguments: { id: 'l-2', patch: { status: 'in_progress' } } });

      const inProg = readToolPayload(await client.callTool({
        name: 'task.list', arguments: { status: 'in_progress' },
      }));
      assert.equal(inProg.count, 1);
      assert.equal(inProg.tasks[0].id, 'l-2');

      const onMain = readToolPayload(await client.callTool({
        name: 'task.list', arguments: { tag: 'main' },
      }));
      assert.equal(onMain.count, 2);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.create rejects bad input via the JSON Schema validator', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const bad = await client.callTool({
        name: 'task.create',
        arguments: { title: 'no priority field', type: 'feature' },
      });
      const err = expectError(bad);
      assert.equal(err.code, 'VALIDATION_ERROR');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('mutating tools trigger the projector — tasks.json appears under .ultra/', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'pj-1', title: 'projection wired', type: 'feature', priority: 'P1' },
      });
    });
    const tasksJson = path.join(proj.dir, '.ultra', 'tasks', 'tasks.json');
    assert.ok(fs.existsSync(tasksJson), 'projector should have written tasks.json');
    const data = JSON.parse(fs.readFileSync(tasksJson, 'utf8'));
    assert.equal(data.schema_version, '4.5');
    assert.equal(data.tasks[0].id, 'pj-1');
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});
