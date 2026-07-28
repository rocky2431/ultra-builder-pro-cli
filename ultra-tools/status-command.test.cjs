'use strict';

// Phase 6.3 — ultra-tools status cost panel:
//   • `ultra-tools status --cost --json` prints {period, by_runtime,
//     top_tasks, total_cost_usd}.
//   • Default human-readable mode renders a summary table.
//   • --since 7d filters telemetry to the last 7 days.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../mcp-server/lib/state-db.cjs');
const ops = require('../mcp-server/lib/state-ops.cjs');
const telemetry = require('../mcp-server/lib/telemetry.cjs');
const decisions = require('../mcp-server/lib/decision-dialogue.cjs');
const { seedReadyBaseline } = require('../mcp-server/test-support/ready-baseline.cjs');
const statusCmd = require('./commands/status.cjs');

function freshFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-'));
  const file = path.join(dir, '.ultra', 'state.db');
  const init = initStateDb(file);
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function seedCalls(db, dir) {
  ops.createTask(db, { id: 't-cheap', title: 'cheap', type: 'feature', priority: 'P2' });
  ops.createTask(db, { id: 't-pricey', title: 'pricey', type: 'feature', priority: 'P1' });
  ops.createSession(db, { sid: 's-x', task_id: 't-cheap', runtime: 'claude', worktree_path: `${dir}/w1`, artifact_dir: `${dir}/a1` });
  ops.createSession(db, { sid: 's-y', task_id: 't-pricey', runtime: 'codex', worktree_path: `${dir}/w2`, artifact_dir: `${dir}/a2` });
  telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 't', session_id: 's-x', runtime: 'claude', tokens_input: 500, tokens_output: 100, rootDir: dir, payload: { model: 'claude-haiku-4-5' } });
  telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 't', session_id: 's-y', runtime: 'codex', tokens_input: 10000, tokens_output: 2000, rootDir: dir, payload: { model: 'gpt-5.4' } });
  telemetry.appendTelemetry(db, { event_type: 'tool_call', tool_name: 'task.list', session_id: null, rootDir: dir });
}

test('status --json --cost returns by_runtime + top_tasks + total_cost', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    const out = statusCmd.buildCostPanel(db, { since: null, limit: 10 });
    assert.ok(Array.isArray(out.by_runtime));
    assert.ok(Array.isArray(out.top_tasks));
    assert.ok(typeof out.total_cost_usd === 'number');
    const byR = Object.fromEntries(out.by_runtime.map((r) => [r.runtime, r]));
    assert.equal(byR.claude.calls, 1);
    assert.equal(byR.codex.calls, 1);
    assert.equal(byR.unknown.calls, 1); // CLI call with null session
    assert.equal(out.top_tasks[0].task_id, 't-pricey');
    assert.ok(out.total_cost_usd > 0);
  } finally { teardown(dir, db); }
});

test('status includes authoritative workflow, change, task, session, and valid transition summaries', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    const out = statusCmd.buildCostPanel(db, { rootDir: dir });
    assert.deepEqual(out.tasks, {
      pending: 2, in_progress: 0, completed: 0, blocked: 0, expanded: 0, stale: 0,
    });
    assert.deepEqual(out.sessions, { running: 2, completed: 0, crashed: 0, orphan: 0 });
    assert.equal(out.workflows.active, 0);
    assert.equal(out.changes.active, 0);
    assert.equal(out.transitions.required, 'ultra-init');
    assert.ok(out.transitions.allowed.includes('ultra-init'));
  } finally { teardown(dir, db); }
});

test('status exposes the current decision instead of dumping the hidden queue', () => {
  const { dir, db } = freshFixture();
  try {
    seedReadyBaseline(db, { rootDir: dir });
    decisions.startDecisionThread(db, {
      id: 'status-alignment', baseline_id: 'test-baseline',
      purpose: 'Expose one current decision.', mode: 'guided',
    });
    decisions.openDecision(db, {
      id: 'status-api', thread_id: 'status-alignment', phase: 'change-contract',
      question: 'Should the public API remain compatible?',
      why_now: 'The answer changes the plan.',
      recommendation: 'Preserve compatibility for one release.',
      effects: { summary: 'Changes API, rollout, and recovery contracts.' },
    });
    const panel = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(panel.decisions.current.id, 'status-api');
    assert.equal(panel.decisions.awaiting_owner, 1);
    assert.equal(panel.transitions.required, 'ultra-think');
    assert.match(statusCmd.renderHuman(panel), /Decision: status-api/);

    decisions.resolveDecision(db, {
      id: 'status-api',
      decision: 'Preserve compatibility for one release.',
      rationale: 'Active consumers need a migration window.',
      decided_by: 'owner',
    });
    decisions.completeDecisionThread(db, {
      id: 'status-alignment',
      summary: 'Compatibility intent is normalized without an artifact checkpoint.',
    });
    const settled = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(settled.decisions.status, 'pass');
    assert.equal(settled.decisions.active, 0);
    assert.equal(settled.decisions.completed, 1);
    assert.equal(settled.decisions.current, null);
  } finally { teardown(dir, db); }
});

test('status exposes the exact current workflow, owned task, and evidence gate summaries', () => {
  const { dir, db } = freshFixture();
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, research_run_id, converged_at)
       VALUES ('baseline', 'fixture', 'greenfield', 'ready', 'owner', 'approved',
               'research-baseline', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, mode, subject, definition_version, status, baseline_id, completed_at, updated_at)
       VALUES ('research-baseline', 'research', 'full', 'Research', '1.1', 'completed',
               'baseline', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root, updated_at)
       VALUES ('status-change', 'Status change', 'standard', 'blocked',
               'Expose exact durable status.', '.ultra/changes/active/status-change', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, current_step, baseline_id, change_id,
        blockers_json, updated_at)
       VALUES ('change-status', 'change', 'Current change', '1.1', 'blocked', 'plan-change',
               'baseline', 'status-change', '["PLAN_REQUIRED"]', ?)`,
    ).run(now);
    ops.createTask(db, {
      id: 'status-task', title: 'Status task', type: 'feature', priority: 'P0',
      status: 'blocked', change_id: 'status-change',
    });
    db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, baseline_id, change_id,
        summary_json, completed_at, updated_at)
       VALUES ('test-status', 'test', 'Test gate', '1.1', 'completed', 'baseline',
               'status-change', '{"passed":true,"task_ids":["status-task"]}', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO workflow_runs
       (id, kind, subject, definition_version, status, baseline_id, change_id,
        summary_json, completed_at, updated_at)
       VALUES ('review-status', 'review', 'Review gate', '1.1', 'completed', 'baseline',
               'status-change', '{"verdict":"APPROVE","task_ids":["status-task"]}', ?, ?)`,
    ).run(now, now);

    const out = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(out.baseline.research.id, 'research-baseline');
    assert.equal(out.workflows.current[0].id, 'change-status');
    assert.equal(out.workflows.current[0].current_step, 'plan-change');
    assert.deepEqual(out.workflows.current[0].blockers, ['PLAN_REQUIRED']);
    assert.equal(out.current_change.id, 'status-change');
    assert.equal(out.current_task.id, 'status-task');
    assert.equal(out.evidence.test.status, 'pass');
    assert.equal(out.evidence.review.status, 'APPROVE');
    assert.equal(out.evidence.delivery.status, 'missing');
    assert.match(statusCmd.renderHuman(out), /Workflow: change-status.*plan-change/i);
    assert.match(statusCmd.renderHuman(out), /Evidence: test=pass.*review=APPROVE/i);
  } finally { teardown(dir, db); }
});

test('buildCostPanel: empty db → zero totals, empty arrays', () => {
  const { dir, db } = freshFixture();
  try {
    const out = statusCmd.buildCostPanel(db, {});
    assert.equal(out.total_cost_usd, 0);
    assert.equal(out.by_runtime.length, 0);
    assert.equal(out.top_tasks.length, 0);
    assert.deepEqual(out.baseline, {
      id: null, mode: null, status: 'missing', health: 'fail',
      repository_revision: null, blockers: ['BASELINE_MISSING'], warnings: [],
    });
  } finally { teardown(dir, db); }
});

test('status does not report a false total when exact-model usage is unpriced', () => {
  const { dir, db } = freshFixture();
  try {
    ops.createTask(db, { id: 't-unpriced', title: 'unpriced', type: 'feature', priority: 'P1' });
    ops.createSession(db, {
      sid: 's-unpriced', task_id: 't-unpriced', runtime: 'opencode',
      worktree_path: `${dir}/w`, artifact_dir: `${dir}/a`,
    });
    telemetry.appendTelemetry(db, {
      event_type: 'token_usage', tool_name: 'session.close', session_id: 's-unpriced',
      runtime: 'opencode', tokens_input: 500, tokens_output: 100, rootDir: dir,
      payload: { model: 'provider-specific-model' },
    });
    const out = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(out.total_cost_usd, null);
    assert.deepEqual(out.cost, {
      status: 'unavailable', known_total_usd: 0,
      priced_usage_events: 0, unpriced_usage_events: 1,
    });
    assert.match(statusCmd.renderHuman(out), /Total cost: unavailable.*1 unpriced/i);
  } finally { teardown(dir, db); }
});

test('status exposes an in-progress brownfield baseline from authoritative state', () => {
  const { dir, db } = freshFixture();
  try {
    db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('adoption', 'legacy', 'brownfield', 'adopting')`,
    ).run();
    const out = statusCmd.buildCostPanel(db, { rootDir: dir });
    assert.equal(out.baseline.id, 'adoption');
    assert.equal(out.baseline.mode, 'brownfield');
    assert.equal(out.baseline.status, 'adopting');
    assert.deepEqual(out.baseline.blockers, ['BASELINE_NOT_READY:adopting']);
    assert.match(statusCmd.renderHuman(out), /Baseline: brownfield\/adopting.*blocked/i);
  } finally { teardown(dir, db); }
});

test('status reports a legacy schema as migration-required instead of throwing SQLite errors', () => {
  const { dir, db } = freshFixture();
  try {
    db.pragma('foreign_keys = OFF');
    db.exec(
      'DROP TABLE decision_items; DROP TABLE decision_threads; DROP TABLE workflow_steps; '
      + 'DROP TABLE workflow_runs; DROP TABLE changes; DROP TABLE baselines',
    );
    db.pragma('foreign_keys = ON');
    const out = statusCmd.buildCostPanel(db, { rootDir: dir });
    assert.equal(out.baseline.status, 'migration_required');
    assert.deepEqual(out.baseline.blockers, ['BASELINE_SCHEMA_MIGRATION_REQUIRED']);
    assert.equal(out.workflows.status, 'unavailable');
    assert.equal(out.changes.status, 'unavailable');
    assert.equal(out.transitions.required, 'ultra-init');
    assert.match(statusCmd.renderHuman(out), /migration_required/i);
  } finally { teardown(dir, db); }
});

test('status summarizes the authoritative baseline gap ledger', () => {
  const { dir, db } = freshFixture();
  try {
    db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status, gaps_json)
       VALUES ('adoption', 'legacy', 'brownfield', 'adopting', ?)`,
    ).run(JSON.stringify([
      { id: 'blocker', category: 'baseline_blocker', status: 'open', blocking: true, summary: 'Missing proof', evidence_refs: [] },
      { id: 'debt', category: 'technical_debt', status: 'accepted', blocking: false, summary: 'Slow test', evidence_refs: [] },
    ]));
    const out = statusCmd.buildCostPanel(db, { rootDir: dir });
    assert.deepEqual(out.baseline.gaps, {
      total: 2, open: 1, blocking: 1,
      by_category: { baseline_blocker: 1, technical_debt: 1 },
    });
  } finally { teardown(dir, db); }
});

test('buildCostPanel: since cutoff in future → all filtered out', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    const out = statusCmd.buildCostPanel(db, { since: future });
    assert.equal(out.by_runtime.length, 0);
    assert.equal(out.top_tasks.length, 0);
  } finally { teardown(dir, db); }
});

test('parseSince: 7d / 24h / iso passthrough', () => {
  const now = Date.parse('2026-04-17T12:00:00Z');
  const sevenDaysAgo = statusCmd.parseSince('7d', now);
  const expectedDayCutoff = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  assert.equal(sevenDaysAgo, expectedDayCutoff);
  assert.equal(statusCmd.parseSince('24h', now), new Date(now - 24 * 3600 * 1000).toISOString());
  assert.equal(statusCmd.parseSince('2026-04-10T00:00:00Z'), '2026-04-10T00:00:00Z');
  assert.equal(statusCmd.parseSince(null), null);
});

test('parseSince: invalid → throws', () => {
  assert.throws(() => statusCmd.parseSince('bogus'), /since/i);
});

test('renderHuman: includes key section headers', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    const panel = statusCmd.buildCostPanel(db, {});
    const text = statusCmd.renderHuman(panel);
    assert.match(text, /Cost by runtime/i);
    assert.match(text, /Top tasks/i);
    assert.match(text, /claude/);
    assert.match(text, /codex/);
  } finally { teardown(dir, db); }
});

test('dispatch: --json echoes buildCostPanel output shape', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    closeStateDb(db);
    const captured = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { captured.push(String(chunk)); return true; };
    const envBackup = process.env.UBP_DB_PATH;
    process.env.UBP_DB_PATH = path.join(dir, '.ultra', 'state.db');
    try {
      const code = statusCmd.dispatch(['--cost', '--json']);
      assert.equal(code, 0);
    } finally {
      process.stdout.write = origWrite;
      if (envBackup === undefined) delete process.env.UBP_DB_PATH; else process.env.UBP_DB_PATH = envBackup;
    }
    const joined = captured.join('');
    const parsed = JSON.parse(joined);
    assert.ok(parsed.ok);
    assert.ok(parsed.data.by_runtime);
    assert.ok(parsed.data.top_tasks);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
});

test('status keeps a worker checkout separate from its central DB path', () => {
  const rootBackup = process.env.UBP_ROOT_DIR;
  try {
    process.env.UBP_ROOT_DIR = '/tmp/ultra-worker-checkout';
    assert.equal(
      statusCmd.resolveRootDir('/tmp/ultra-authority/.ultra/state.db'),
      path.resolve('/tmp/ultra-worker-checkout'),
    );
  } finally {
    if (rootBackup === undefined) delete process.env.UBP_ROOT_DIR;
    else process.env.UBP_ROOT_DIR = rootBackup;
  }
});
