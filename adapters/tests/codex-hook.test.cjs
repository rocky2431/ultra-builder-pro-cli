'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

test('Codex hook adapter rejects retired generic policy hooks', () => {
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
  assert.match(output.systemMessage, /refused unknown feature/);
});

test('Codex hook adapter injects only an active Ultra task boundary before edits', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-hook-'));
  try {
    fs.mkdirSync(path.join(project, '.ultra'));
    fs.writeFileSync(path.join(project, '.ultra', 'workflow-state.json'), JSON.stringify({
      command: 'ultra-dev', task_id: 'task-7', step: '4.5', status: 'review_pending',
    }));
    const result = run('active_task_context.py', {
      session_id: 'session-2',
      cwd: project,
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: { command: '*** Begin Patch\n*** Update File: src/a.py\n*** End Patch' },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(output.hookSpecificOutput.additionalContext, /task-7/);
    assert.doesNotMatch(JSON.stringify(output), /memory|recall|journal/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
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
