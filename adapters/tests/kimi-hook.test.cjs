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

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTER = path.join(REPO_ROOT, 'hooks', 'adapters', 'kimi.py');

function run(feature, payload, args = []) {
  return spawnSync('python3', [ADAPTER, feature, ...args], {
    cwd: REPO_ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function seedContext(project, taskId = 'task-7') {
  const state = initStateDb(path.join(project, '.ultra', 'state.db'));
  state.db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, approved_by, approval_note, converged_at)
     VALUES ('baseline', 'fixture', 'greenfield', 'ready', 'test', 'fixture', ?)`,
  ).run(new Date().toISOString());
  const { change } = createChange(state.db, {
    id: 'hook-change', title: 'Hook change', kind: 'quick',
    intent: 'Inject the authoritative task.',
    docs_impact: { status: 'none', rationale: 'fixture' },
  }, { rootDir: project });
  const task = createTask(state.db, {
    id: taskId, title: 'Hook task', type: 'bugfix', priority: 'P0', change_id: change.id,
  });
  compileRoleContext(state.db, {
    input: {
      task_id: task.id, role: 'implement', gate: 'implementation',
      execution_contract: {
        slice_kind: 'tracer_bullet', public_seam: 'hook injection',
        verification_command: 'node --test adapters/tests/kimi-hook.test.cjs',
      },
      next_action: 'Continue the authoritative hook task.',
    },
    change, tasks: [task], rootDir: project,
  });
  closeStateDb(state.db);
}

test('Kimi hook adapter rejects non-workflow policy hooks without blocking the host', () => {
  const result = run('block_dangerous_commands.py', {
    session_id: 'session-1',
    cwd: REPO_ROOT,
    hook_event_name: 'PreToolUse',
    tool_name: 'Shell',
    tool_input: { command: 'git reset --hard' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).message, /refused unknown feature/);
});

test('Kimi hook adapter translates active edit context to the native message field', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-kimi-hook-'));
  try {
    seedContext(project);
    const result = run('active_task_context.py', {
      session_id: 'session-2',
      cwd: project,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'src/a.py' },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.message, /task-7/);
    assert.equal(output.hookSpecificOutput, undefined);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Kimi hook adapter emits the native deny contract for projection writes', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-kimi-hook-deny-'));
  try {
    fs.mkdirSync(path.join(project, '.ultra'));
    const result = run('active_task_context.py', {
      session_id: 'session-deny',
      cwd: project,
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '.ultra/tasks/tasks.json' },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.hookSpecificOutput.permissionDecisionReason, /\.ultra\/state\.db/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('Kimi subagent fields are normalized for the existing lifecycle tracker', () => {
  const script = [
    'import importlib.util, json, pathlib',
    `p = pathlib.Path(${JSON.stringify(ADAPTER)})`,
    's = importlib.util.spec_from_file_location("kimi_hook_adapter", p)',
    'm = importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    'payload = {"hook_event_name":"SubagentStart","agent_name":"review-code","session_id":"s"}',
    'print(json.dumps(m.normalize_input(payload)))',
  ].join('; ');
  const result = spawnSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    hook_event_name: 'SubagentStart',
    agent_name: 'review-code',
    session_id: 's',
    agent_id: 'review-code',
    agent_type: 'review-code',
  });
});

test('Kimi adapter preserves an explicit Stop deny and recovery context schema', () => {
  const script = [
    'import importlib.util, json, pathlib',
    `p = pathlib.Path(${JSON.stringify(ADAPTER)})`,
    's = importlib.util.spec_from_file_location("kimi_hook_adapter", p)',
    'm = importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    'values = [m.adapt_output({"decision":"block","reason":"finish gates"}, "Stop"), m.adapt_output({"additionalContext":"restored"}, "PostCompact")]',
    'print(json.dumps(values))',
  ].join('; ');
  const result = spawnSync('python3', ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      hookSpecificOutput: {
        message: 'finish gates',
        permissionDecision: 'deny',
        permissionDecisionReason: 'finish gates',
      },
    },
    { message: 'restored' },
  ]);
});
