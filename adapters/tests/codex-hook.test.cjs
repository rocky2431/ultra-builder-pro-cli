'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const { createChange } = require('../../mcp-server/lib/change-workflow.cjs');
const { createTask } = require('../../mcp-server/lib/state-ops.cjs');
const { compileRoleContext } = require('../../mcp-server/lib/context-spine.cjs');
const { seedReadyBaseline } = require('../../mcp-server/test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../../mcp-server/test-support/change-contract.cjs');

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

function seedContext(project, taskId = 'task-7') {
  fs.writeFileSync(path.join(project, 'contract.md'), '# Hook contract\n');
  const state = initStateDb(path.join(project, '.ultra', 'state.db'));
  seedReadyBaseline(state.db, { rootDir: project, id: 'baseline' });
  const { change } = createChange(state.db, completeChangeInput({
    id: 'hook-change', title: 'Hook change', kind: 'quick',
    intent: 'Inject the authoritative task.',
    docs_impact: { status: 'none', rationale: 'fixture' },
  }), { rootDir: project });
  const task = createTask(state.db, {
    id: taskId, title: 'Hook task', type: 'bugfix', priority: 'P0', change_id: change.id,
    outcome: 'Expose the authoritative hook task boundary.', slice_kind: 'tracer_bullet',
    public_seam: 'hook injection',
    verification_command: 'node --test adapters/tests/codex-hook.test.cjs',
    acceptance: [{
      id: 'hook-boundary', criterion: 'The active task is injected.',
      verification: 'node --test adapters/tests/codex-hook.test.cjs',
    }],
    context_refs: [{ ref: 'contract.md', kind: 'spec', reason: 'Hook behavior contract', required: true }],
    docs_impact: { status: 'none', files: [], rationale: 'Internal test fixture.' },
    ownership: { owner: 'test-owner', reviewers: [] }, trace_to: 'contract.md#hook-contract',
  });
  compileRoleContext(state.db, {
    input: { task_id: task.id, role: 'implement', gate: 'implementation' },
    change, tasks: [task], rootDir: project,
  });
  closeStateDb(state.db);
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
    seedContext(project);
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

test('Codex hook adapter denies apply_patch writes to tasks.json during an active Ultra workflow', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-hook-deny-'));
  try {
    fs.mkdirSync(path.join(project, '.ultra'));
    const result = run('active_task_context.py', {
      session_id: 'session-deny',
      cwd: project,
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        patch: '*** Begin Patch\n*** Update File: .ultra/tasks/tasks.json\n*** End Patch',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /\.ultra\/state\.db/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
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
