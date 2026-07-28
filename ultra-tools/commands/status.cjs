'use strict';

// Ultra project status panel.
//
// Reads project authority and telemetry from state.db and renders either a
// human-readable report or a JSON envelope consumable by skills/ultra-status.
// Does not modify state.

const fs = require('node:fs');
const path = require('node:path');

const ops = require('../../mcp-server/lib/state-ops.cjs');
const baselines = require('../../mcp-server/lib/baseline-workflow.cjs');
const workflowState = require('../../mcp-server/lib/workflow-state.cjs');
const decisionDialogue = require('../../mcp-server/lib/decision-dialogue.cjs');
const { readBreadcrumb } = require('../../mcp-server/lib/context-spine.cjs');

const USAGE = `ultra-tools status [flags]

Reads .ultra/state.db and prints baseline, workflow, task, session, valid transitions, and
cost-observability status.

FLAGS:
  --cost            include per-runtime + top-tasks cost panel (default on)
  --json            emit machine-readable envelope on stdout
  --since <period>  filter to last N (e.g. 7d, 24h) or ISO8601 cutoff
  --limit <n>       top-N tasks (default 3)
  -h, --help        show this message
`;

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function fail(code, message) {
  emit({ ok: false, error: { code, message, retriable: false } });
  return 2;
}

function parseSince(value, nowMs = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(/^(\d+)([dhm])$/i);
  if (!m) throw new Error(`invalid --since value: ${value} (expected 7d, 24h, 30m, or ISO-8601)`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const ms = unit === 'd' ? n * 86400000 : unit === 'h' ? n * 3600000 : n * 60000;
  return new Date(nowMs - ms).toISOString();
}

function parseFlags(args) {
  const out = { cost: true, json: false, since: null, limit: 3 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--cost':  out.cost = true; break;
      case '--json':  out.json = true; break;
      case '--since': out.since = args[++i]; break;
      case '--limit': out.limit = Number(args[++i]); break;
      case '-h': case '--help': return { help: true };
      default:
        if (a.startsWith('--since=')) out.since = a.split('=')[1];
        else if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1]);
        else throw new Error(`unknown flag: ${a}`);
    }
  }
  if (Number.isNaN(out.limit) || out.limit <= 0) out.limit = 3;
  return out;
}

function buildStatusPanel(db, { since = null, limit = 3, rootDir = process.cwd() } = {}) {
  const tables = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all().map((row) => row.name));
  const by_runtime = tables.has('telemetry') && tables.has('sessions')
    ? ops.aggregateTelemetryByRuntime(db, { since }) : [];
  const top_tasks = tables.has('telemetry') && tables.has('sessions')
    ? ops.aggregateTelemetryByTask(db, { since, limit }) : [];
  const knownTotalCost = by_runtime.reduce((acc, r) => acc + (r.cost_usd || 0), 0);
  const unpricedUsageEvents = by_runtime.reduce(
    (acc, row) => acc + Number(row.unpriced_usage_events || 0), 0,
  );
  const pricedUsageEvents = by_runtime.reduce(
    (acc, row) => acc + Number(row.priced_usage_events || 0), 0,
  );
  const costStatus = unpricedUsageEvents > 0
    ? (pricedUsageEvents > 0 ? 'partial' : 'unavailable')
    : (pricedUsageEvents > 0 ? 'complete' : 'none');
  const total_cost_usd = unpricedUsageEvents > 0 ? null : knownTotalCost;
  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  const current = baselineHealth.baseline;
  const baselineStatus = current?.status
    || (baselineHealth.blockers.includes('BASELINE_SCHEMA_MIGRATION_REQUIRED')
      ? 'migration_required' : 'missing');
  const baseline = {
    id: current?.id || null,
    mode: current?.mode || null,
    status: baselineStatus,
    health: baselineHealth.status,
    repository_revision: current?.repository_revision || null,
    blockers: baselineHealth.blockers,
    warnings: baselineHealth.warnings,
  };
  if (current) {
    baseline.repository_branch = current.repository_branch || null;
    baseline.worktree_state = current.worktree_state || 'unavailable';
    baseline.gaps = baselines.summarizeGaps(current.gaps);
    if (current.research_run_id && tables.has('workflow_runs') && tables.has('workflow_steps')) {
      const research = workflowState.readWorkflow(db, current.research_run_id, { rootDir });
      baseline.research = research ? {
        id: research.id,
        status: research.status,
        mode: research.mode,
        output_health: research.artifact_health.status,
        blockers: research.artifact_health.blockers,
      } : {
        id: current.research_run_id, status: 'missing', mode: null,
        output_health: 'fail', blockers: ['BASELINE_RESEARCH_RECORD_INVALID'],
      };
    }
  }
  const countStatuses = (table, statuses, where = '') => {
    if (!tables.has(table)) {
      return {
        status: 'unavailable',
        ...Object.fromEntries(statuses.map((status) => [status, 0])),
      };
    }
    const rows = db.prepare(
      `SELECT status, COUNT(*) AS count FROM ${table} ${where} GROUP BY status`,
    ).all();
    const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
    for (const row of rows) if (row.status in counts) counts[row.status] = Number(row.count);
    return counts;
  };
  const taskCounts = countStatuses(
    'tasks', ['pending', 'in_progress', 'completed', 'blocked', 'expanded'],
  );
  taskCounts.stale = tables.has('tasks')
    ? Number(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE stale = 1').get().count) : 0;
  const sessions = countStatuses('sessions', ['running', 'completed', 'crashed', 'orphan']);
  const changes = countStatuses('changes', ['active', 'blocked', 'ready', 'archived', 'cancelled']);
  let workflows;
  try {
    if (!tables.has('workflow_runs') || !tables.has('workflow_steps')) {
      workflows = {
        status: 'unavailable', active: 0, blocked: 0, ready: 0,
        stale_outputs: [], historical_stale_outputs: [],
        terminal_authority_runs: [], untracked_active_changes: [],
      };
    } else {
      workflows = workflowState.inspectWorkflowHealth(db, { rootDir });
      workflows.current = workflowState.listWorkflows(db, { limit: 500 }, { rootDir })
        .filter((run) => ['active', 'blocked', 'ready'].includes(run.status))
        .map((run) => ({
          id: run.id, kind: run.kind, status: run.status, current_step: run.current_step,
          baseline_id: run.baseline_id, change_id: run.change_id, task_id: run.task_id,
          blockers: run.blockers, output_health: run.artifact_health.status,
        }));
    }
  } catch (error) {
    workflows = {
      status: 'fail', active: 0, blocked: 0, ready: 0,
      stale_outputs: [], historical_stale_outputs: [],
      terminal_authority_runs: [], untracked_active_changes: [],
      error: error.code || error.message,
    };
  }
  if (!Array.isArray(workflows.current)) workflows.current = [];
  const decisions = tables.has('decision_threads') && tables.has('decision_items')
    ? decisionDialogue.inspectDecisionHealth(db, { rootDir })
    : {
      status: 'unavailable', active: 0, completed: 0, awaiting_owner: 0,
      awaiting_blocking: 0, checkpoint_ready: 0,
      deferred_blocking: 0, stale_artifacts: [], current: null, current_thread_id: null,
    };
  let transitions;
  let breadcrumb = null;
  try {
    if (!tables.has('baselines')) {
      transitions = {
        allowed: ['ultra-init', 'ultra-status'], required: 'ultra-init', readiness: 'blocked',
        blockers: ['BASELINE_SCHEMA_MIGRATION_REQUIRED'], warnings: [],
      };
    } else {
    breadcrumb = readBreadcrumb(db, {}, { rootDir });
    transitions = {
      allowed: breadcrumb.allowed_transitions,
      required: breadcrumb.required_transition,
      readiness: breadcrumb.readiness,
      blockers: breadcrumb.blockers,
      warnings: breadcrumb.warnings,
      change_id: breadcrumb.change_id || null,
      task_id: breadcrumb.task_id || null,
      workflow: breadcrumb.workflow || null,
    };
    }
  } catch (error) {
    transitions = {
      allowed: ['ultra-doctor', 'ultra-status'], required: 'ultra-doctor', readiness: 'blocked',
      blockers: [`STATUS_AUTHORITY_UNAVAILABLE:${error.code || 'unknown'}`], warnings: [],
    };
  }

  const currentChange = tables.has('changes')
    ? db.prepare(
      `SELECT id, title, kind, status, intent, base_commit, artifact_root, updated_at
       FROM changes
       WHERE status IN ('active', 'blocked', 'ready')
       ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    ).get() || null
    : null;
  const evidenceChangeId = breadcrumb?.change_id || currentChange?.id
    || (tables.has('changes') ? db.prepare(
      `SELECT id FROM changes WHERE status = 'archived'
       ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    ).get()?.id : null);
  let currentTask = null;
  if (tables.has('tasks')) {
    const taskId = breadcrumb?.task_id || (currentChange?.id ? db.prepare(
      `SELECT id FROM tasks WHERE change_id = ?
       ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1
                WHEN 'pending' THEN 2 ELSE 3 END, priority ASC, created_at ASC LIMIT 1`,
    ).get(currentChange.id)?.id : null);
    if (taskId) currentTask = ops.readTask(db, taskId);
  }
  const evidence = {};
  for (const kind of ['test', 'review', 'deliver']) {
    const run = evidenceChangeId && tables.has('workflow_runs') && tables.has('workflow_steps')
      ? workflowState.listWorkflows(
        db, { kind, status: 'completed', change_id: evidenceChangeId, limit: 1 }, { rootDir },
      )[0]
      : null;
    let status = 'missing';
    if (run && kind === 'test') status = run.summary.passed === true ? 'pass' : 'fail';
    if (run && kind === 'review') status = run.summary.verdict || 'unknown';
    if (run && kind === 'deliver') {
      status = run.summary.archive_status === 'archived' ? 'delivered' : 'incomplete';
    }
    const evidenceKey = kind === 'deliver' ? 'delivery' : kind;
    evidence[evidenceKey] = run ? {
      workflow_id: run.id, status, output_health: run.artifact_health.status,
      report_path: run.summary.report_path || null,
    } : { workflow_id: null, status: 'missing', output_health: 'missing', report_path: null };
  }
  return {
    period: { since: since || 'all-time' },
    baseline,
    workflows,
    decisions,
    current_change: currentChange,
    current_task: currentTask,
    evidence,
    changes,
    tasks: taskCounts,
    sessions,
    transitions,
    by_runtime,
    top_tasks,
    total_cost_usd,
    cost: {
      status: costStatus,
      known_total_usd: knownTotalCost,
      priced_usage_events: pricedUsageEvents,
      unpriced_usage_events: unpricedUsageEvents,
    },
  };
}

// Backward-compatible internal export for consumers that used the old name.
const buildCostPanel = buildStatusPanel;

function formatCost(n) {
  if (!n) return '$0.0000';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function renderHuman(panel) {
  const lines = [];
  const baseline = panel.baseline;
  lines.push(
    `Baseline: ${baseline.mode || 'none'}/${baseline.status} · ${baseline.health === 'pass' ? 'ready' : 'blocked'}`
      + (baseline.research ? ` · research=${baseline.research.id}/${baseline.research.status}/${baseline.research.output_health}` : ''),
  );
  if (baseline.blockers.length > 0) lines.push(`Baseline blockers: ${baseline.blockers.join(', ')}`);
  lines.push(
    `Workflows: active=${panel.workflows.active} blocked=${panel.workflows.blocked} ready=${panel.workflows.ready} health=${panel.workflows.status}`,
  );
  if (panel.workflows.current.length > 0) {
    const current = panel.workflows.current[0];
    lines.push(
      `Workflow: ${current.id} (${current.kind}/${current.status}) · step=${current.current_step || 'finalize'} · outputs=${current.output_health}`,
    );
  }
  if (panel.decisions.current) {
    lines.push(
      `Decision: ${panel.decisions.current.id} (${panel.decisions.current.phase}) — ${panel.decisions.current.question}`,
    );
  } else if (panel.decisions.checkpoint_ready > 0) {
    lines.push(`Decision checkpoint: ${panel.decisions.current_thread_id} awaits confirmation`);
  }
  lines.push(
    `Changes: active=${panel.changes.active} blocked=${panel.changes.blocked} ready=${panel.changes.ready} archived=${panel.changes.archived}`,
  );
  lines.push(
    `Tasks: pending=${panel.tasks.pending} in_progress=${panel.tasks.in_progress} completed=${panel.tasks.completed} blocked=${panel.tasks.blocked} stale=${panel.tasks.stale}`,
  );
  if (panel.current_change) {
    lines.push(`Current change: ${panel.current_change.id} (${panel.current_change.status})`);
  }
  if (panel.current_task) lines.push(`Current task: ${panel.current_task.id} (${panel.current_task.status})`);
  lines.push(
    `Sessions: running=${panel.sessions.running} crashed=${panel.sessions.crashed} orphan=${panel.sessions.orphan}`,
  );
  lines.push(`Allowed transitions: ${panel.transitions.allowed.join(', ') || 'none'}`);
  if (panel.transitions.required) lines.push(`Required transition: ${panel.transitions.required}`);
  lines.push(
    `Evidence: test=${panel.evidence.test.status} review=${panel.evidence.review.status} delivery=${panel.evidence.delivery.status}`,
  );
  lines.push(`Period: ${panel.period.since}`);
  if (panel.total_cost_usd === null) {
    lines.push(
      `Total cost: unavailable (${panel.cost.unpriced_usage_events} unpriced usage events; known cost ${formatCost(panel.cost.known_total_usd)})`,
    );
  } else {
    lines.push(`Total cost: ${formatCost(panel.total_cost_usd)}`);
  }
  lines.push('');
  lines.push('Cost by runtime:');
  if (panel.by_runtime.length === 0) {
    lines.push('  (no telemetry)');
  } else {
    lines.push('  runtime     calls   tokens_in  tokens_out   cost');
    for (const r of panel.by_runtime) {
      lines.push(
        '  ' + r.runtime.padEnd(10) +
        String(r.calls).padStart(6) +
        String(r.tokens_in).padStart(12) +
        String(r.tokens_out).padStart(12) +
        '   ' + formatCost(r.cost_usd),
      );
    }
  }
  lines.push('');
  lines.push('Top tasks by cost:');
  if (panel.top_tasks.length === 0) {
    lines.push('  (no task-scoped telemetry)');
  } else {
    for (const t of panel.top_tasks) {
      lines.push(`  ${t.task_id.padEnd(24)}  calls=${t.calls}  cost=${formatCost(t.cost_usd)}`);
    }
  }
  return lines.join('\n') + '\n';
}

function resolveDbPath() {
  if (process.env.UBP_DB_PATH) return path.resolve(process.env.UBP_DB_PATH);
  return path.resolve('.ultra', 'state.db');
}

function resolveRootDir(dbPath) {
  if (process.env.UBP_ROOT_DIR) return path.resolve(process.env.UBP_ROOT_DIR);
  return path.dirname(path.dirname(dbPath));
}

function dispatch(args) {
  let flags;
  try { flags = parseFlags(args); } catch (err) { return fail('USAGE_ERROR', err.message); }
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    return fail('STATE_DB_MISSING', `state.db not found at ${dbPath}`);
  }
  let since;
  try { since = parseSince(flags.since); } catch (err) { return fail('USAGE_ERROR', err.message); }

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    const rootDir = resolveRootDir(dbPath);
    const panel = buildStatusPanel(db, { since, limit: flags.limit, rootDir });
    if (flags.json) {
      emit({ ok: true, data: panel });
    } else {
      process.stdout.write(renderHuman(panel));
    }
    return 0;
  } finally {
    db.close();
  }
}

module.exports = {
  USAGE,
  dispatch,
  buildStatusPanel,
  buildCostPanel,
  renderHuman,
  parseSince,
  parseFlags,
  resolveRootDir,
};
