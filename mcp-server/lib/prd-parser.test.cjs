'use strict';

// Test Double rationale: external LLM API — deterministic fixtures prove
// parsing logic (prompt assembly, schema validation, id normalization)
// without egress cost or key dependence. Integration coverage against a
// real LLM lives behind an env gate and is exercised separately.

const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePrd, PrdParseError, TASK_LIST_SCHEMA } = require('./prd-parser.cjs');

function fakeClient(jsonFn, { usage = { input_tokens: 100, output_tokens: 50 }, model = 'claude-sonnet-4-6', provider = 'anthropic' } = {}) {
  return {
    provider,
    model,
    async completeJson({ system, user }) {
      const json = typeof jsonFn === 'function' ? await jsonFn({ system, user }) : jsonFn;
      return { json, raw: JSON.stringify(json), usage, model, provider };
    },
  };
}

const HAPPY_TASKS = {
  tasks: [
    {
      id: 'task-1',
      title: 'Design auth schema',
      type: 'architecture',
      priority: 'P1',
      complexity: 5,
      deps: [],
      files_modified: ['src/auth/schema.ts'],
    },
    {
      id: 'task-2',
      title: 'Implement login endpoint',
      type: 'feature',
      priority: 'P1',
      complexity: 6,
      deps: ['task-1'],
      files_modified: ['src/auth/login.ts'],
    },
  ],
};

test('parsePrd: happy path normalizes tasks and returns usage metadata', async () => {
  const client = fakeClient(HAPPY_TASKS);
  const result = await parsePrd('Build login', { llmClient: client, tag: 'feat-auth' });
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].id, 'task-1');
  assert.equal(result.tasks[0].tag, 'feat-auth');
  assert.deepEqual(result.tasks[1].deps, ['task-1']);
  assert.equal(result.model, 'claude-sonnet-4-6');
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.usage.input_tokens, 100);
});

test('parsePrd: empty text → NO_INPUT', async () => {
  await assert.rejects(
    parsePrd('', { llmClient: fakeClient(HAPPY_TASKS) }),
    (err) => err instanceof PrdParseError && err.code === 'NO_INPUT',
  );
  await assert.rejects(
    parsePrd('   ', { llmClient: fakeClient(HAPPY_TASKS) }),
    (err) => err instanceof PrdParseError && err.code === 'NO_INPUT',
  );
});

test('parsePrd: missing llmClient → NO_LLM_CLIENT', async () => {
  await assert.rejects(
    parsePrd('Build something', {}),
    (err) => err instanceof PrdParseError && err.code === 'NO_LLM_CLIENT',
  );
});

test('parsePrd: llmClient error bubbles up as PARSE_FAILED', async () => {
  const brokenClient = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    async completeJson() { throw new Error('upstream LLM 500'); },
  };
  await assert.rejects(
    parsePrd('Build something', { llmClient: brokenClient }),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED' && /upstream LLM 500/.test(err.message),
  );
});

test('parsePrd: invalid JSON shape rejected — missing required "priority"', async () => {
  const bad = {
    tasks: [{
      id: 'task-1', title: 'Foo', type: 'feature', // priority missing
      complexity: 3, deps: [], files_modified: [],
    }],
  };
  await assert.rejects(
    parsePrd('Build Foo', { llmClient: fakeClient(bad) }),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED' && /priority/.test(err.message),
  );
});

test('parsePrd: invalid enum value rejected — bad type', async () => {
  const bad = {
    tasks: [{
      id: 'task-1', title: 'Foo', type: 'chore', priority: 'P1',
    }],
  };
  await assert.rejects(
    parsePrd('Build Foo', { llmClient: fakeClient(bad) }),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED',
  );
});

test('parsePrd: duplicate task id rejected', async () => {
  const dup = {
    tasks: [
      { id: 'task-1', title: 'First copy', type: 'feature', priority: 'P2' },
      { id: 'task-1', title: 'Second copy', type: 'feature', priority: 'P2' },
    ],
  };
  await assert.rejects(
    parsePrd('Build dupes', { llmClient: fakeClient(dup) }),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED' && /duplicate/i.test(err.message),
  );
});

test('parsePrd: missing optional fields are normalized to defaults', async () => {
  const minimal = {
    tasks: [{
      id: 'task-1', title: 'Minimal task', type: 'feature', priority: 'P3',
    }],
  };
  const result = await parsePrd('anything', { llmClient: fakeClient(minimal) });
  assert.equal(result.tasks[0].complexity, null);
  assert.deepEqual(result.tasks[0].deps, []);
  assert.deepEqual(result.tasks[0].files_modified, []);
  assert.equal(result.tasks[0].tag, null);
});

test('parsePrd: prompt contains PRD text passed to llmClient', async () => {
  let captured;
  const client = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    async completeJson({ system, user }) {
      captured = { system, user };
      return {
        json: HAPPY_TASKS,
        raw: '',
        usage: {},
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      };
    },
  };
  await parsePrd('Build the thing with acceptance criteria X', { llmClient: client });
  assert.match(captured.system, /engineering planner/i);
  assert.match(captured.user, /Build the thing with acceptance criteria X/);
});

test('parsePrd: empty tasks array rejected (schema requires minItems:1)', async () => {
  await assert.rejects(
    parsePrd('Build nothing', { llmClient: fakeClient({ tasks: [] }) }),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED',
  );
});

test('TASK_LIST_SCHEMA: exported for downstream consumers', () => {
  assert.equal(TASK_LIST_SCHEMA.required[0], 'tasks');
  assert.equal(TASK_LIST_SCHEMA.properties.tasks.minItems, 1);
});
