'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseExecutePlanArgs,
  resolveDispatchCommand,
  validateOrchestratorRuntime,
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
    changeId: null,
    autoMerge: false,
    mergeBaseBranch: 'main',
  });
  assert.deepEqual(
    parseExecutePlanArgs([
      '--change', 'current-change',
      '--auto-merge',
      '--base-branch', 'trunk',
    ]),
    {
      changeId: 'current-change',
      autoMerge: true,
      mergeBaseBranch: 'trunk',
    },
  );
});

test('parseExecutePlanArgs rejects unknown or incomplete options', () => {
  assert.throws(
    () => parseExecutePlanArgs(['--plan', '.ultra/execution-plan.json']),
    (error) => error.code === 'ORCHESTRATOR_ARGUMENT_INVALID',
  );
  assert.throws(
    () => parseExecutePlanArgs(['--shell-command', 'node worker.js']),
    (error) => error.code === 'ORCHESTRATOR_ARGUMENT_INVALID',
  );
});

test('orchestrator pid and log paths are validated before direct writes', () => {
  assert.equal(typeof validateOrchestratorRuntime, 'function');
  for (const relative of [
    path.join('orchestrator', 'orchestrator.pid'),
    path.join('orchestrator', 'orchestrator.log'),
  ]) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-orch-path-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-orch-outside-'));
    try {
      const candidate = path.join(rootDir, '.ultra', '.runtime', relative);
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      const sentinel = path.join(outside, 'sentinel');
      fs.writeFileSync(sentinel, 'outside');
      fs.symlinkSync(sentinel, candidate);

      assert.throws(
        () => validateOrchestratorRuntime(rootDir, { forMutation: true }),
        /RUNTIME_PATH_UNSAFE|symlink|runtime/i,
      );
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});
