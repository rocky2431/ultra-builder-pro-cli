'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseExecutePlanArgs,
  resolveDispatchCommand,
} = require('../../bin/orchestrator.js');

test('resolveDispatchCommand requires an explicit executable', () => {
  assert.throws(
    () => resolveDispatchCommand({}, {}),
    (error) => error.code === 'ORCHESTRATOR_COMMAND_REQUIRED',
  );
});

test('resolveDispatchCommand reads a shell-free command contract from settings', () => {
  assert.deepEqual(
    resolveDispatchCommand({
      orchestrator: {
        command: '/usr/local/bin/ultra-worker',
        command_args: ['--mode', 'task'],
      },
    }, {}),
    {
      command: '/usr/local/bin/ultra-worker',
      commandArgs: ['--mode', 'task'],
      source: 'settings',
    },
  );
});

test('resolveDispatchCommand accepts an environment override with JSON arguments', () => {
  assert.deepEqual(
    resolveDispatchCommand({
      orchestrator: { command: 'settings-worker', command_args: ['settings'] },
    }, {
      UBP_ORCH_COMMAND: 'env-worker',
      UBP_ORCH_ARGS_JSON: '["--task","current"]',
    }),
    {
      command: 'env-worker',
      commandArgs: ['--task', 'current'],
      source: 'environment',
    },
  );
});

test('resolveDispatchCommand rejects shell strings and malformed argument payloads', () => {
  assert.throws(
    () => resolveDispatchCommand({
      orchestrator: { command: 'node worker.js', command_args: [] },
    }, {}),
    (error) => error.code === 'ORCHESTRATOR_COMMAND_INVALID',
  );
  assert.throws(
    () => resolveDispatchCommand({}, {
      UBP_ORCH_COMMAND: 'node',
      UBP_ORCH_ARGS_JSON: '{"not":"an-array"}',
    }),
    (error) => error.code === 'ORCHESTRATOR_COMMAND_INVALID',
  );
});

test('parseExecutePlanArgs keeps merge disabled unless explicitly requested', () => {
  assert.deepEqual(parseExecutePlanArgs([]), {
    planPath: null,
    autoMerge: false,
    mergeBaseBranch: 'main',
  });
  assert.deepEqual(
    parseExecutePlanArgs([
      '--plan', '.ultra/custom-plan.json',
      '--auto-merge',
      '--base-branch', 'trunk',
    ]),
    {
      planPath: '.ultra/custom-plan.json',
      autoMerge: true,
      mergeBaseBranch: 'trunk',
    },
  );
});

test('parseExecutePlanArgs rejects unknown or incomplete options', () => {
  assert.throws(
    () => parseExecutePlanArgs(['--plan']),
    (error) => error.code === 'ORCHESTRATOR_ARGUMENT_INVALID',
  );
  assert.throws(
    () => parseExecutePlanArgs(['--shell-command', 'node worker.js']),
    (error) => error.code === 'ORCHESTRATOR_ARGUMENT_INVALID',
  );
});
