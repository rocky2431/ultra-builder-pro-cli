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

async function withClientNoLlmKey({ dir, dbPath }, fn) {
  const env = { ...process.env, UBP_DB_PATH: dbPath, UBP_ROOT_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'ubp-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try { await fn(client); } finally { await client.close(); }
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

test('listTools returns the registered task.* + session.* + memory.* tools with input schemas', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const list = await client.listTools();
      const names = list.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'memory.recall',
        'memory.reflect',
        'memory.retain',
        'plan.export',
        'plan.get',
        'session.admission_check',
        'session.close',
        'session.get',
        'session.heartbeat',
        'session.list',
        'session.spawn',
        'session.subscribe_events',
        'task.append_event',
        'task.create',
        'task.delete',
        'task.dependency_topo',
        'task.expand',
        'task.get',
        'task.init_project',
        'task.list',
        'task.parse_prd',
        'task.subscribe_events',
        'task.switch_tag',
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

test('task.init_project creates .ultra/ skeleton in a fresh target directory', async () => {
  const proj = tmpProject();
  const freshTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-target-'));
  try {
    await withClient(proj, async (client) => {
      const res = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'mcp-init', project_type: 'cli' },
      });
      const payload = readToolPayload(res);
      assert.equal(payload.status, 'created');
      assert.equal(payload.created_path, path.join(freshTarget, '.ultra'));
      assert.ok(payload.copied_files.includes('tasks/tasks.json'));
      const tasksJson = JSON.parse(fs.readFileSync(path.join(payload.created_path, 'tasks', 'tasks.json'), 'utf8'));
      assert.equal(tasksJson.project.name, 'mcp-init');
      assert.equal(tasksJson.project.type, 'cli');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(freshTarget, { recursive: true, force: true });
  }
});

test('task.init_project returns ULTRA_DIR_EXISTS on re-init without overwrite', async () => {
  const proj = tmpProject();
  const freshTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-init-target-'));
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'once' },
      });
      const second = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: freshTarget, project_name: 'twice' },
      });
      const err = expectError(second);
      assert.equal(err.code, 'ULTRA_DIR_EXISTS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
    fs.rmSync(freshTarget, { recursive: true, force: true });
  }
});

async function seedTask(client, id = 's-1') {
  await client.callTool({
    name: 'task.create',
    arguments: { id, title: 'session target', type: 'feature', priority: 'P1' },
  });
}

test('session.admission_check + session.spawn: happy path returns sid and paths', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-happy');

      const admission = await client.callTool({
        name: 'session.admission_check',
        arguments: { task_id: 's-happy' },
      });
      const verdict = readToolPayload(admission);
      assert.equal(verdict.can_spawn, true);
      assert.equal(verdict.recommended_action, 'spawn');

      const spawn = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-happy', runtime: 'claude' },
      });
      const session = readToolPayload(spawn);
      assert.match(session.sid, /^sess-/);
      assert.ok(session.worktree_path.includes(session.sid));
      assert.ok(session.artifact_dir.endsWith(path.join('.ultra', 'sessions', session.sid)));
      assert.ok(session.lease_expires_at);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.spawn refuses second session for same task without takeover (ADMISSION_DENIED)', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-conflict');
      await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-conflict', runtime: 'claude' },
      });

      const admissionAgain = await client.callTool({
        name: 'session.admission_check',
        arguments: { task_id: 's-conflict' },
      });
      const verdict = readToolPayload(admissionAgain);
      assert.equal(verdict.can_spawn, false);
      assert.ok(verdict.conflict);

      const second = await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-conflict', runtime: 'opencode' },
      });
      const err = expectError(second);
      assert.equal(err.code, 'ADMISSION_DENIED');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.spawn with takeover=true crashes the old session and succeeds', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-takeover');
      const first = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-takeover', runtime: 'claude' },
      }));

      const second = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-takeover', runtime: 'codex', takeover: true },
      }));
      assert.notEqual(second.sid, first.sid);

      const firstAfter = readToolPayload(await client.callTool({
        name: 'session.get', arguments: { sid: first.sid },
      }));
      assert.equal(firstAfter.session.status, 'crashed');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.subscribe_events sees task events with ≤1s latency (D31 id cursor)', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-sub');

      // pin cursor before any writes
      const before = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: 0 },
      }));
      const cursor = before.next_since_id;

      const t0 = Date.now();
      await client.callTool({
        name: 'task.update',
        arguments: { id: 's-sub', patch: { status: 'in_progress' } },
      });

      const after = readToolPayload(await client.callTool({
        name: 'session.subscribe_events',
        arguments: { since_id: cursor },
      }));
      const elapsedMs = Date.now() - t0;
      assert.ok(after.events.length >= 1, 'expected at least one new event');
      const types = after.events.map((e) => e.type);
      const sawTransition = types.some((t) => t === 'task_started' || t === 'task_status_changed');
      assert.ok(sawTransition, `got event types ${JSON.stringify(types)}`);
      assert.ok(elapsedMs < 1000, `latency ${elapsedMs}ms exceeds 1s budget`);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('session.heartbeat refreshes lease; session.close marks completed', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await seedTask(client, 's-heart');
      const spawn = readToolPayload(await client.callTool({
        name: 'session.spawn',
        arguments: { task_id: 's-heart', runtime: 'claude' },
      }));
      const firstLease = spawn.lease_expires_at;

      // heartbeat extends the lease
      await new Promise((r) => setTimeout(r, 5));
      const hb = readToolPayload(await client.callTool({
        name: 'session.heartbeat', arguments: { sid: spawn.sid },
      }));
      assert.equal(hb.ok, true);
      assert.ok(Date.parse(hb.lease_expires_at) >= Date.parse(firstLease));

      // close flips status
      const closed = readToolPayload(await client.callTool({
        name: 'session.close',
        arguments: { sid: spawn.sid, status: 'completed' },
      }));
      assert.equal(closed.ok, true);

      const got = readToolPayload(await client.callTool({
        name: 'session.get', arguments: { sid: spawn.sid },
      }));
      assert.equal(got.session.status, 'completed');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

// Phase 7.1 — memory.* MCP round-trip: retain → recall → reflect all via MCP client
test('memory.retain → memory.recall → memory.reflect round-trip via MCP', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const r1 = readToolPayload(await client.callTool({
        name: 'memory.retain',
        arguments: { kind: 'decision', content: 'Chose PostgreSQL over MySQL for strict typing', tag: 'arch' },
      }));
      assert.ok(r1.id > 0);

      const r2 = readToolPayload(await client.callTool({
        name: 'memory.retain',
        arguments: { kind: 'error_fix', content: 'Fixed auth race by locking session table', tag: 'auth' },
      }));
      assert.ok(r2.id > r1.id);

      const recallOut = readToolPayload(await client.callTool({
        name: 'memory.recall',
        arguments: { query: 'PostgreSQL', limit: 3 },
      }));
      assert.ok(Array.isArray(recallOut.hits));
      assert.ok(recallOut.hits.some((h) => /PostgreSQL/.test(h.content)));

      const filtered = readToolPayload(await client.callTool({
        name: 'memory.recall',
        arguments: { query: 'auth', tag: 'auth' },
      }));
      assert.equal(filtered.hits.length, 1);

      const reflected = readToolPayload(await client.callTool({
        name: 'memory.reflect', arguments: {},
      }));
      assert.ok(reflected.counts);
      assert.equal(reflected.counts.decision, 1);
      assert.equal(reflected.counts.error_fix, 1);
      assert.ok(Array.isArray(reflected.recent));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.dependency_topo: happy path groups tasks into correct waves', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      for (const [id, deps] of [['A', []], ['B', ['A']], ['C', ['A']]]) {
        await client.callTool({
          name: 'task.create',
          arguments: { id, title: `task ${id}`, type: 'feature', priority: 'P2', deps },
        });
      }
      const resp = await client.callTool({
        name: 'task.dependency_topo',
        arguments: { task_ids: ['A', 'B', 'C'] },
      });
      const data = readToolPayload(resp);
      assert.equal(data.waves.length, 2);
      assert.deepEqual(new Set(data.waves[0]), new Set(['A']));
      assert.deepEqual(new Set(data.waves[1]), new Set(['B', 'C']));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.parse_prd: neither prd_path nor prd_text → NO_INPUT', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const resp = await client.callTool({ name: 'task.parse_prd', arguments: {} });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_INPUT');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.parse_prd: missing LLM credentials → NO_LLM_CREDENTIALS', async () => {
  const proj = tmpProject();
  try {
    await withClientNoLlmKey(proj, async (client) => {
      const resp = await client.callTool({
        name: 'task.parse_prd',
        arguments: { prd_text: 'Build a login feature with email and password.' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_LLM_CREDENTIALS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.expand: unknown parent → TASK_NOT_FOUND (no LLM call needed)', async () => {
  const proj = tmpProject();
  try {
    await withClientNoLlmKey(proj, async (client) => {
      const resp = await client.callTool({
        name: 'task.expand',
        arguments: { id: 'nonexistent-parent' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'TASK_NOT_FOUND');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.expand: missing LLM credentials on valid parent → NO_LLM_CREDENTIALS', async () => {
  const proj = tmpProject();
  try {
    await withClientNoLlmKey(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'parent-1', title: 'Build something complex', type: 'feature', priority: 'P1', complexity: 9 },
      });
      const resp = await client.callTool({
        name: 'task.expand',
        arguments: { id: 'parent-1' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_LLM_CREDENTIALS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export: no tasks → NO_TASKS', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const resp = await client.callTool({
        name: 'plan.export',
        arguments: { out_path: '.ultra/execution-plan.json' },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_TASKS');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.export → plan.get round trip: artifact on disk + retrievable', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      for (const [id, deps, files] of [
        ['p-a', [], ['src/a.ts']],
        ['p-b', ['p-a'], ['src/b.ts']],
        ['p-c', ['p-a'], ['src/c.ts']],
      ]) {
        await client.callTool({
          name: 'task.create',
          arguments: { id, title: `task ${id}`, type: 'feature', priority: 'P2', complexity: 3, deps, files_modified: files },
        });
      }
      const exp = await client.callTool({
        name: 'plan.export',
        arguments: { out_path: '.ultra/execution-plan.json', format: 'json' },
      });
      const expData = readToolPayload(exp);
      assert.equal(expData.wave_count, 2);
      assert.ok(fs.existsSync(expData.plan_path), 'artifact file must exist');

      const got = await client.callTool({ name: 'plan.get', arguments: { section: 'topo' } });
      const gotData = readToolPayload(got);
      assert.ok(Array.isArray(gotData.plan.waves));
      assert.equal(gotData.plan.waves.length, 2);
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('plan.get: no plan written yet → NO_PLAN', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      const resp = await client.callTool({ name: 'plan.get', arguments: {} });
      const err = expectError(resp);
      assert.equal(err.code, 'NO_PLAN');
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});

test('task.dependency_topo: cycle returns CYCLE_DETECTED with cycles in details', async () => {
  const proj = tmpProject();
  try {
    await withClient(proj, async (client) => {
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'X', title: 'task X', type: 'feature', priority: 'P2', deps: ['Y'] },
      });
      await client.callTool({
        name: 'task.create',
        arguments: { id: 'Y', title: 'task Y', type: 'feature', priority: 'P2', deps: ['X'] },
      });
      const resp = await client.callTool({
        name: 'task.dependency_topo',
        arguments: { task_ids: ['X', 'Y'] },
      });
      const err = expectError(resp);
      assert.equal(err.code, 'CYCLE_DETECTED');
      assert.ok(err.details && Array.isArray(err.details.cycles));
      assert.equal(err.details.cycles.length, 1);
      assert.deepEqual(new Set(err.details.cycles[0]), new Set(['X', 'Y']));
    });
  } finally {
    fs.rmSync(proj.dir, { recursive: true, force: true });
  }
});
