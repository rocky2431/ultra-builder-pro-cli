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
const decisions = require('../mcp-server/lib/decision-records.cjs');
const checkpoints = require('../mcp-server/lib/stage-checkpoints.cjs');
const { seedReadyBaseline } = require('../mcp-server/test-support/ready-baseline.cjs');
const statusCmd = require('./commands/status.cjs');

function freshFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-'));
  const file = path.join(dir, '.ultra', '.runtime', 'state.db');
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

test('status consumes the v0.24 Context Envelope instead of retired semantic supervisors', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'commands', 'status.cjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /workflow-state|decision-dialogue|context-spine/);
  assert.match(source, /context-envelope/);
});

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

test('status includes the canonical Context Envelope and leaves route selection to the host', () => {
  const { dir, db } = freshFixture();
  try {
    seedCalls(db, dir);
    const out = statusCmd.buildCostPanel(db, { rootDir: dir });
    assert.deepEqual(out.tasks, {
      pending: 2, in_progress: 0, completed: 0, blocked: 0, expanded: 0, stale: 0,
    });
    assert.deepEqual(out.sessions, { running: 2, completed: 0, crashed: 0, orphan: 0 });
    assert.equal(out.checkpoints.accepted, 0);
    assert.equal(out.changes.active, 0);
    assert.equal(out.artifacts.status, 'pass');
    assert.equal(out.artifacts.registered, 0);
    assert.equal(out.artifacts.managed, 0);
    assert.equal(out.artifacts.unmanaged, 0);
    assert.ok(out.context_envelope);
    assert.equal(out.context_envelope.envelope.execution.stage, 'status');
    assert.equal(out.guidance.recommendation_owner, 'host_model');
    assert.equal(out.guidance.selection_owner, 'user');
    assert.equal(out.guidance.automatic_invocation, false);
  } finally { teardown(dir, db); }
});

test('status separates managed and legacy artifact authority and fails compatibility health', () => {
  const { dir, db } = freshFixture();
  try {
    const relative = '.ultra/specs/legacy-status.md';
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Legacy status authority\n');
    const digest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(file)).digest('hex');
    db.prepare(
      `INSERT INTO artifacts
       (id, owner_type, owner_id, kind, path, digest, content_hash, after_digest,
        status, provenance_json, managed)
       VALUES ('legacy-status', 'project', 'project', 'spec', ?, ?, ?, ?,
               'terminal', '{}', 0)`,
    ).run(relative, digest, digest, digest);

    const out = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(out.artifacts.status, 'fail');
    assert.equal(out.artifacts.registered, 1);
    assert.equal(out.artifacts.managed, 0);
    assert.equal(out.artifacts.unmanaged, 1);
    assert.equal(out.artifacts.counts.ARTIFACT_COMPATIBILITY_UNMANAGED, 1);
    assert.match(statusCmd.renderHuman(out), /managed=0 unmanaged=1 health=fail/);
  } finally { teardown(dir, db); }
});

test('status exposes accepted Decision Records without recreating a hidden dialogue queue', () => {
  const { dir, db } = freshFixture();
  try {
    seedReadyBaseline(db, { rootDir: dir });
    decisions.acceptDecision(db, {
      id: 'status-api',
      scope: { baseline_id: 'test-baseline' },
      question: 'Should the public API remain compatible?',
      recommendation: 'Preserve compatibility for one release.',
      selection: 'Preserve compatibility for one release.',
      effects: { summary: 'Changes API, rollout, and recovery contracts.' },
      non_goals: [],
      owner: 'project-owner',
      source: 'explicit-owner-intent',
      provenance: { runtime: 'cli' },
      applied_refs: [],
    }, { rootDir: dir });
    const panel = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(panel.decisions.current[0].id, 'status-api');
    assert.equal(panel.decisions.accepted, 1);
    assert.match(statusCmd.renderHuman(panel), /Decision: status-api/);
  } finally { teardown(dir, db); }
});

test('status exposes current Stage Checkpoints, owned task, and evidence summaries', () => {
  const { dir, db } = freshFixture();
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('baseline', 'fixture', 'greenfield', 'ready', 'owner', 'approved', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root, updated_at)
       VALUES ('status-change', 'Status change', 'standard', 'active',
               'Expose exact durable status.', '.ultra/changes/active/status-change', ?)`,
    ).run(now);
    ops.createTask(db, {
      id: 'status-task', title: 'Status task', type: 'feature', priority: 'P0',
      status: 'blocked', change_id: 'status-change',
    });
    for (const [stage, payload] of [
      ['plan', { summary: 'Plan accepted.' }],
      ['test', { passed: true, report_path: '.ultra/changes/active/status-change/test/report.json' }],
      ['review', { verdict: 'APPROVE', report_path: '.ultra/changes/active/status-change/review/report.json' }],
    ]) {
      const draft = checkpoints.saveDraft(db, {
        stage,
        scope: { change_id: 'status-change' },
        payload,
        evidence: [],
        diagnostics: [],
        idempotency_key: `status-${stage}-draft`,
      });
      checkpoints.acceptDraft(db, {
        id: draft.id,
        idempotency_key: `status-${stage}-accept`,
      });
    }

    const out = statusCmd.buildStatusPanel(db, { rootDir: dir });
    assert.equal(out.checkpoints.accepted, 3);
    assert.equal(out.checkpoints.current.find((item) => item.stage === 'plan').status, 'accepted');
    assert.equal(out.current_change.id, 'status-change');
    assert.equal(out.current_task.id, 'status-task');
    assert.equal(out.evidence.test.status, 'pass');
    assert.equal(out.evidence.review.status, 'APPROVE');
    assert.equal(out.evidence.delivery.status, 'missing');
    assert.match(statusCmd.renderHuman(out), /Checkpoints:.*accepted=3/i);
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
    assert.match(statusCmd.renderHuman(out), /Baseline: brownfield\/adopting.*needs attention/i);
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
    assert.equal(out.checkpoints.status, 'pass');
    assert.equal(out.changes.status, 'unavailable');
    assert.equal(out.context_error.code, 'CONTEXT_SCHEMA_MIGRATION_REQUIRED');
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
    const rootBackup = process.env.UBP_ROOT_DIR;
    process.env.UBP_DB_PATH = path.join(dir, '.ultra', '.runtime', 'state.db');
    process.env.UBP_ROOT_DIR = dir;
    try {
      const code = statusCmd.dispatch(['--cost', '--json']);
      assert.equal(code, 0);
    } finally {
      process.stdout.write = origWrite;
      if (envBackup === undefined) delete process.env.UBP_DB_PATH; else process.env.UBP_DB_PATH = envBackup;
      if (rootBackup === undefined) delete process.env.UBP_ROOT_DIR;
      else process.env.UBP_ROOT_DIR = rootBackup;
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
      statusCmd.resolveRootDir('/tmp/ultra-authority/.ultra/.runtime/state.db'),
      path.resolve('/tmp/ultra-worker-checkout'),
    );
  } finally {
    if (rootBackup === undefined) delete process.env.UBP_ROOT_DIR;
    else process.env.UBP_ROOT_DIR = rootBackup;
  }
});

test('status rejects competing project DBs before honoring a configured third DB', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-conflict-'));
  const third = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-third-'));
  try {
    const legacy = path.join(project, '.ultra', 'state.db'); // runtime-path-compatibility fixture
    const runtime = path.join(project, '.ultra', '.runtime', 'state.db');
    const external = path.join(third, 'state.db');
    for (const file of [legacy, runtime, external]) {
      const initialized = initStateDb(file);
      closeStateDb(initialized.db);
    }

    assert.throws(
      () => statusCmd.resolveDbPath(project, {
        UBP_ROOT_DIR: project,
        UBP_DB_PATH: external,
      }),
      (error) => error.code === 'RUNTIME_STATE_CONFLICT',
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(third, { recursive: true, force: true });
  }
});

test('status rejects a valid but unrelated configured DB authority', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-project-'));
  const authority = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-status-authority-'));
  try {
    fs.mkdirSync(path.join(project, '.ultra'), { recursive: true });
    const external = path.join(authority, 'state.db');
    const initialized = initStateDb(external);
    closeStateDb(initialized.db);

    assert.throws(
      () => statusCmd.resolveDbPath(project, {
        UBP_ROOT_DIR: project,
        UBP_DB_PATH: external,
      }),
      (error) => error.code === 'RUNTIME_AUTHORITY_MISMATCH',
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(authority, { recursive: true, force: true });
  }
});
