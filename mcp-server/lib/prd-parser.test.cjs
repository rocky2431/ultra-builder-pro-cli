'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePrd, PrdParseError, TASK_LIST_SCHEMA } = require('./prd-parser.cjs');

const HAPPY_TASKS = [
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
];

test('parsePrd validates and normalizes host-derived tasks without a provider client', () => {
  const result = parsePrd(HAPPY_TASKS, { tag: 'feat-auth', changeId: 'auth-change' });
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].tag, 'feat-auth');
  assert.equal(result.tasks[0].change_id, 'auth-change');
  assert.deepEqual(result.tasks[1].deps, ['task-1']);
  assert.equal(Object.hasOwn(result, 'model'), false);
  assert.equal(Object.hasOwn(result, 'provider'), false);
  assert.equal(Object.hasOwn(result, 'usage'), false);
});

test('parsePrd requires at least one host-derived task', () => {
  for (const value of [undefined, null, [], 'not-an-array']) {
    assert.throws(
      () => parsePrd(value),
      (err) => err instanceof PrdParseError && err.code === 'NO_INPUT',
    );
  }
});

test('parsePrd rejects an invalid task shape', () => {
  assert.throws(
    () => parsePrd([{
      id: 'task-1', title: 'Missing priority', type: 'feature',
    }]),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED' && /priority/.test(err.message),
  );
});

test('parsePrd rejects duplicate task ids', () => {
  assert.throws(
    () => parsePrd([
      { id: 'task-1', title: 'First copy', type: 'feature', priority: 'P2' },
      { id: 'task-1', title: 'Second copy', type: 'feature', priority: 'P2' },
    ]),
    (err) => err instanceof PrdParseError && err.code === 'PARSE_FAILED' && /duplicate/i.test(err.message),
  );
});

test('parsePrd normalizes optional fields', () => {
  const result = parsePrd([{
    id: 'task-1', title: 'Minimal task', type: 'feature', priority: 'P3',
  }]);
  assert.equal(result.tasks[0].complexity, null);
  assert.deepEqual(result.tasks[0].deps, []);
  assert.deepEqual(result.tasks[0].files_modified, []);
  assert.equal(result.tasks[0].tag, null);
  assert.equal(result.tasks[0].change_id, null);
});

test('parsePrd preserves bounded repository-defined task vocabulary', () => {
  const result = parsePrd([{
    id: 'task-1',
    title: 'Prepare the security migration',
    type: 'security_migration',
    priority: 'urgent-owner-review',
  }]);
  assert.equal(result.tasks[0].type, 'security_migration');
  assert.equal(result.tasks[0].priority, 'urgent-owner-review');
});

test('TASK_LIST_SCHEMA remains available to MCP contract consumers', () => {
  assert.equal(TASK_LIST_SCHEMA.required[0], 'tasks');
  assert.equal(TASK_LIST_SCHEMA.properties.tasks.minItems, 1);
});
