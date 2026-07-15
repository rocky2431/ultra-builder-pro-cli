'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTER = path.join(REPO_ROOT, 'hooks', 'adapters', 'codex.py');

function run(feature, payload) {
  return spawnSync('python3', [ADAPTER, feature], {
    cwd: REPO_ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PLUGIN_DATA: path.join(REPO_ROOT, '.tmp-codex-hook-test') },
  });
}

test('Codex hook adapter preserves a real PreToolUse deny decision', () => {
  const result = run('block_dangerous_commands.py', {
    session_id: 'session-1',
    turn_id: 'turn-1',
    cwd: REPO_ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git reset --hard' },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /BLOCKED/);
});

test('Codex hook adapter converts unsupported PreToolUse ask into an advisory systemMessage', () => {
  const result = run('block_dangerous_commands.py', {
    session_id: 'session-2',
    turn_id: 'turn-2',
    cwd: REPO_ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'sudo apt-get update' },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.systemMessage, /WARNING/);
  assert.ok(!output.hookSpecificOutput);
});

test('Codex hook adapter maps apply_patch payloads to Edit-compatible file inputs', () => {
  const script = [
    'import importlib.util, json, pathlib',
    `p = pathlib.Path(${JSON.stringify(ADAPTER)})`,
    's = importlib.util.spec_from_file_location("codex_hook_adapter", p)',
    'm = importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    'payload = {"hook_event_name":"PostToolUse","tool_name":"apply_patch","tool_input":{"patch":"*** Begin Patch\\n*** Update File: src/a.py\\n*** Add File: src/b.py\\n*** End Patch"}}',
    'print(json.dumps(m.normalize_inputs(payload)))',
  ].join('; ');
  const result = spawnSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const outputs = JSON.parse(result.stdout);
  assert.deepEqual(outputs.map((entry) => entry.tool_input.file_path), ['src/a.py', 'src/b.py']);
  assert.ok(outputs.every((entry) => entry.tool_name === 'Edit'));
});

test('Codex hook adapter converts compact recovery context to PostCompact schema', () => {
  const script = [
    'import importlib.util, json, pathlib',
    `p = pathlib.Path(${JSON.stringify(ADAPTER)})`,
    's = importlib.util.spec_from_file_location("codex_hook_adapter", p)',
    'm = importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    'legacy = {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"restored"}}',
    'print(json.dumps(m.adapt_output(legacy, "PostCompact")))',
  ].join('; ');
  const result = spawnSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { systemMessage: 'restored' });
});
