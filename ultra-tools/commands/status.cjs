'use strict';

// Ultra project status panel.
//
// The v0.24 status surface reads the same bounded Context Envelope used by
// Skills, hooks, sessions, and agents. It reports accepted Checkpoints and
// Decision Records; it does not resurrect the retired workflow supervisor or
// infer an authorized next command.

const fs = require('node:fs');
const path = require('node:path');

const artifactRegistry = require('../../mcp-server/lib/artifact-registry.cjs');
const baselines = require('../../mcp-server/lib/baseline-workflow.cjs');
const contextEnvelope = require('../../mcp-server/lib/context-envelope.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const runtimePaths = require('../../mcp-server/lib/runtime-paths.cjs');

const USAGE = `ultra-tools status [flags]

Reads .ultra/.runtime/state.db and prints the canonical Context Envelope,
accepted Checkpoints, durable task/session state, diagnostics, and cost
observability. Route selection remains with the host model and user.

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

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function parseSince(value, nowMs = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return normalized;
  const match = normalized.match(/^(\d+)([dhm])$/i);
  if (!match) {
    throw new Error(
      `invalid --since value: ${value} (expected 7d, 24h, 30m, or ISO-8601)`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const milliseconds = unit === 'd'
    ? amount * 86400000
    : unit === 'h'
      ? amount * 3600000
      : amount * 60000;
  return new Date(nowMs - milliseconds).toISOString();
}

function parseFlags(args) {
  const out = { cost: true, json: false, since: null, limit: 3 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--cost': out.cost = true; break;
      case '--json': out.json = true; break;
      case '--since': out.since = args[++index]; break;
      case '--limit': out.limit = Number(args[++index]); break;
      case '-h':
      case '--help':
        return { help: true };
      default:
        if (argument.startsWith('--since=')) out.since = argument.split('=')[1];
        else if (argument.startsWith('--limit=')) out.limit = Number(argument.split('=')[1]);
        else throw new Error(`unknown flag: ${argument}`);
    }
  }
  if (Number.isNaN(out.limit) || out.limit <= 0) out.limit = 3;
  return out;
}

function countStatuses(db, tables, table, statuses) {
  if (!tables.has(table)) {
    return {
      status: 'unavailable',
      ...Object.fromEntries(statuses.map((status) => [status, 0])),
    };
  }
  const rows = db.prepare(
    `SELECT status, COUNT(*) AS count FROM ${table} GROUP BY status`,
  ).all();
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  for (const row of rows) {
    if (row.status in counts) counts[row.status] = Number(row.count);
  }
  return counts;
}

function readContext(db, tables, rootDir) {
  const required = [
    'baselines', 'changes', 'tasks', 'stage_checkpoints', 'decision_records',
    'context_envelopes', 'worker_packets',
  ];
  if (!required.every((table) => tables.has(table))) {
    return {
      value: null,
      error: {
        code: 'CONTEXT_SCHEMA_MIGRATION_REQUIRED',
        message: 'the v0.24 Context Envelope tables are unavailable',
      },
    };
  }
  try {
    return {
      value: contextEnvelope.buildEnvelope(
        db,
        { detail: 'summary', stage: 'status' },
        { rootDir, runtime: 'cli' },
      ),
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: {
        code: error.code || 'CONTEXT_UNAVAILABLE',
        message: error.message,
      },
    };
  }
}

function checkpointPanel(db, tables) {
  if (!tables.has('stage_checkpoints')) {
    return {
      status: 'unavailable',
      draft: 0,
      accepted: 0,
      superseded: 0,
      current: [],
      diagnostics: [],
    };
  }
  const rows = db.prepare(
    `SELECT id, stage, scope_type, scope_id, revision, status, payload_json,
            evidence_json, diagnostics_json, digest, updated_at
     FROM stage_checkpoints
     ORDER BY updated_at DESC, revision DESC, rowid DESC`,
  ).all();
  const counts = { draft: 0, accepted: 0, superseded: 0 };
  const current = [];
  const diagnostics = [];
  for (const row of rows) {
    counts[row.status] = Number(counts[row.status] || 0) + 1;
    const item = {
      id: row.id,
      stage: row.stage,
      scope_type: row.scope_type,
      scope_id: row.scope_id,
      revision: row.revision,
      status: row.status,
      payload: parseJson(row.payload_json, {}),
      evidence: parseJson(row.evidence_json, []),
      diagnostics: parseJson(row.diagnostics_json, []),
      digest: row.digest,
      updated_at: row.updated_at,
    };
    if (row.status !== 'superseded') current.push(item);
    diagnostics.push(...item.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      checkpoint_id: row.id,
      stage: row.stage,
    })));
  }
  const status = diagnostics.some((item) => item.severity === 'hard_conflict')
    ? 'fail'
    : diagnostics.some((item) => item.severity === 'needs_attention')
      ? 'warning'
      : 'pass';
  return {
    status,
    ...counts,
    current: current.slice(0, 20),
    diagnostics,
  };
}

function decisionPanel(db, tables, context) {
  if (!tables.has('decision_records')) {
    return {
      status: 'unavailable',
      accepted: 0,
      superseded: 0,
      current: [],
    };
  }
  const rows = db.prepare(
    'SELECT status, COUNT(*) AS count FROM decision_records GROUP BY status',
  ).all();
  const counts = { accepted: 0, superseded: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  const current = Array.isArray(context?.envelope?.decisions)
    ? context.envelope.decisions
    : [];
  return {
    status: 'pass',
    ...counts,
    current,
  };
}

function artifactPanel(db, tables, rootDir) {
  if (!['artifacts', 'artifact_edges'].every((table) => tables.has(table))) {
    return {
      status: 'unavailable',
      registered: 0,
      managed: 0,
      unmanaged: 0,
      issues: [],
      counts: {},
    };
  }
  try {
    return artifactRegistry.inspectArtifactHealth(db, { rootDir });
  } catch (error) {
    return {
      status: 'fail',
      registered: 0,
      managed: 0,
      unmanaged: 0,
      issues: [{ code: error.code || 'ARTIFACT_HEALTH_UNAVAILABLE', message: error.message }],
      counts: {},
    };
  }
}

function checkpointEvidence(checkpoints, stage, changeId) {
  const checkpoint = checkpoints.current.find((item) => (
    item.stage === stage
    && item.status === 'accepted'
    && (!changeId || item.scope_id === changeId || item.payload?.change_id === changeId)
  ));
  if (!checkpoint) {
    return {
      checkpoint_id: null,
      status: 'missing',
      report_path: null,
      digest: null,
    };
  }
  let status = 'accepted';
  if (stage === 'test' && typeof checkpoint.payload.passed === 'boolean') {
    status = checkpoint.payload.passed ? 'pass' : 'fail';
  } else if (stage === 'review' && checkpoint.payload.verdict) {
    status = checkpoint.payload.verdict;
  } else if (stage === 'deliver' && checkpoint.payload.archive_status) {
    status = checkpoint.payload.archive_status === 'archived' ? 'delivered' : 'incomplete';
  }
  const reference = checkpoint.payload.report_path
    || checkpoint.evidence.find((item) => item && (item.ref || item.path))?.ref
    || checkpoint.evidence.find((item) => item && item.path)?.path
    || null;
  return {
    checkpoint_id: checkpoint.id,
    status,
    report_path: reference,
    digest: checkpoint.digest,
  };
}

function buildStatusPanel(db, {
  since = null,
  limit = 3,
  rootDir = process.cwd(),
} = {}) {
  const tables = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all().map((row) => row.name));
  const byRuntime = tables.has('telemetry') && tables.has('sessions')
    ? ops.aggregateTelemetryByRuntime(db, { since })
    : [];
  const topTasks = tables.has('telemetry') && tables.has('sessions')
    ? ops.aggregateTelemetryByTask(db, { since, limit })
    : [];
  const knownTotalCost = byRuntime.reduce((sum, row) => sum + (row.cost_usd || 0), 0);
  const unpricedUsageEvents = byRuntime.reduce(
    (sum, row) => sum + Number(row.unpriced_usage_events || 0),
    0,
  );
  const pricedUsageEvents = byRuntime.reduce(
    (sum, row) => sum + Number(row.priced_usage_events || 0),
    0,
  );
  const costStatus = unpricedUsageEvents > 0
    ? (pricedUsageEvents > 0 ? 'partial' : 'unavailable')
    : (pricedUsageEvents > 0 ? 'complete' : 'none');
  const totalCost = unpricedUsageEvents > 0 ? null : knownTotalCost;

  const baselineHealth = baselines.inspectBaseline(db, { rootDir });
  const currentBaseline = baselineHealth.baseline;
  const baselineStatus = currentBaseline?.status
    || (baselineHealth.blockers.includes('BASELINE_SCHEMA_MIGRATION_REQUIRED')
      ? 'migration_required'
      : 'missing');
  const baseline = {
    id: currentBaseline?.id || null,
    mode: currentBaseline?.mode || null,
    status: baselineStatus,
    health: baselineHealth.status,
    repository_revision: currentBaseline?.repository_revision || null,
    blockers: baselineHealth.blockers,
    warnings: baselineHealth.warnings,
  };
  if (currentBaseline) {
    baseline.repository_branch = currentBaseline.repository_branch || null;
    baseline.worktree_state = currentBaseline.worktree_state || 'unavailable';
    baseline.gaps = baselines.summarizeGaps(currentBaseline.gaps);
    baseline.research_checkpoint_id = currentBaseline.research_checkpoint_id || null;
  }

  const contextResult = readContext(db, tables, rootDir);
  const context = contextResult.value;
  const authority = context?.envelope || null;
  const checkpoints = checkpointPanel(db, tables);
  const decisions = decisionPanel(db, tables, context);
  const artifacts = artifactPanel(db, tables, rootDir);
  const taskCounts = countStatuses(
    db,
    tables,
    'tasks',
    ['pending', 'in_progress', 'completed', 'blocked', 'expanded'],
  );
  taskCounts.stale = tables.has('tasks')
    ? Number(db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE stale = 1').get().count)
    : 0;
  const sessions = countStatuses(
    db,
    tables,
    'sessions',
    ['running', 'completed', 'crashed', 'orphan'],
  );
  const changes = countStatuses(
    db,
    tables,
    'changes',
    ['active', 'blocked', 'ready', 'archived', 'cancelled'],
  );
  const currentChange = authority?.change || null;
  const currentTask = authority?.task || null;
  const changeId = currentChange?.id || null;
  const evidence = {
    test: checkpointEvidence(checkpoints, 'test', changeId),
    review: checkpointEvidence(checkpoints, 'review', changeId),
    delivery: checkpointEvidence(checkpoints, 'deliver', changeId),
  };
  const diagnostics = authority?.diagnostics || {
    warnings: [],
    needs_attention: contextResult.error ? [contextResult.error] : [],
    hard_conflicts: [],
  };

  return {
    period: { since: since || 'all-time' },
    context_envelope: context,
    context_error: contextResult.error,
    baseline,
    checkpoints,
    decisions,
    artifacts,
    current_change: currentChange,
    current_task: currentTask,
    evidence,
    changes,
    tasks: taskCounts,
    sessions,
    guidance: {
      recommendation_owner: 'host_model',
      selection_owner: 'user',
      automatic_invocation: false,
      diagnostics,
    },
    by_runtime: byRuntime,
    top_tasks: topTasks,
    total_cost_usd: totalCost,
    cost: {
      status: costStatus,
      known_total_usd: knownTotalCost,
      priced_usage_events: pricedUsageEvents,
      unpriced_usage_events: unpricedUsageEvents,
    },
  };
}

// Backward-compatible internal name for cost-panel consumers.
const buildCostPanel = buildStatusPanel;

function formatCost(value) {
  if (!value) return '$0.0000';
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}

function renderHuman(panel) {
  const lines = [];
  const baseline = panel.baseline;
  lines.push(
    `Baseline: ${baseline.mode || 'none'}/${baseline.status} · `
      + `${baseline.health === 'pass' ? 'ready' : 'needs attention'}`,
  );
  if (baseline.blockers.length > 0) {
    lines.push(`Baseline blockers: ${baseline.blockers.join(', ')}`);
  }
  lines.push(
    `Checkpoints: draft=${panel.checkpoints.draft} accepted=${panel.checkpoints.accepted} `
      + `superseded=${panel.checkpoints.superseded} health=${panel.checkpoints.status}`,
  );
  lines.push(
    `Decisions: accepted=${panel.decisions.accepted} `
      + `superseded=${panel.decisions.superseded}`,
  );
  if (panel.decisions.current.length > 0) {
    const current = panel.decisions.current[0];
    lines.push(`Decision: ${current.id} — ${current.selection}`);
  }
  lines.push(
    `Artifacts: registered=${panel.artifacts.registered} managed=${panel.artifacts.managed}`
      + ` unmanaged=${panel.artifacts.unmanaged} health=${panel.artifacts.status}`
      + (panel.artifacts.issues.length > 0 ? ` issues=${panel.artifacts.issues.length}` : ''),
  );
  lines.push(
    `Changes: active=${panel.changes.active} archived=${panel.changes.archived} `
      + `cancelled=${panel.changes.cancelled}`,
  );
  lines.push(
    `Tasks: pending=${panel.tasks.pending} in_progress=${panel.tasks.in_progress} `
      + `completed=${panel.tasks.completed} blocked=${panel.tasks.blocked} stale=${panel.tasks.stale}`,
  );
  if (panel.current_change) {
    lines.push(`Current change: ${panel.current_change.id} (${panel.current_change.status})`);
  }
  if (panel.current_task) {
    lines.push(`Current task: ${panel.current_task.id} (${panel.current_task.status})`);
  }
  lines.push(
    `Sessions: running=${panel.sessions.running} crashed=${panel.sessions.crashed} `
      + `orphan=${panel.sessions.orphan}`,
  );
  lines.push(
    'Route selection: host model recommends; user explicitly selects; Ultra does not auto-chain.',
  );
  lines.push(
    `Evidence: test=${panel.evidence.test.status} review=${panel.evidence.review.status} `
      + `delivery=${panel.evidence.delivery.status}`,
  );
  lines.push(`Period: ${panel.period.since}`);
  if (panel.total_cost_usd === null) {
    lines.push(
      `Total cost: unavailable (${panel.cost.unpriced_usage_events} unpriced usage events; `
        + `known cost ${formatCost(panel.cost.known_total_usd)})`,
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
    for (const runtime of panel.by_runtime) {
      lines.push(
        `  ${runtime.runtime.padEnd(10)}`
          + `${String(runtime.calls).padStart(6)}`
          + `${String(runtime.tokens_in).padStart(12)}`
          + `${String(runtime.tokens_out).padStart(12)}`
          + `   ${formatCost(runtime.cost_usd)}`,
      );
    }
  }
  lines.push('');
  lines.push('Top tasks by cost:');
  if (panel.top_tasks.length === 0) {
    lines.push('  (no task-scoped telemetry)');
  } else {
    for (const task of panel.top_tasks) {
      lines.push(
        `  ${task.task_id.padEnd(24)}  calls=${task.calls}  cost=${formatCost(task.cost_usd)}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function resolveDbPath(rootDir = process.cwd(), env = process.env) {
  return runtimePaths.locateStateDb(rootDir, { env });
}

function resolveRootDir(dbPath) {
  if (process.env.UBP_ROOT_DIR) return path.resolve(process.env.UBP_ROOT_DIR);
  return runtimePaths.projectRootFromStateDbPath(dbPath);
}

function dispatch(args) {
  let flags;
  try { flags = parseFlags(args); } catch (error) {
    return fail('USAGE_ERROR', error.message);
  }
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const discoveryRoot = process.env.UBP_ROOT_DIR
    ? path.resolve(process.env.UBP_ROOT_DIR)
    : process.cwd();
  let dbPath;
  try {
    dbPath = resolveDbPath(discoveryRoot, process.env);
  } catch (error) {
    return fail(error.code || 'STATE_DB_PATH_INVALID', error.message);
  }
  if (!fs.existsSync(dbPath)) {
    return fail('STATE_DB_MISSING', `state.db not found at ${dbPath}`);
  }
  let since;
  try { since = parseSince(flags.since); } catch (error) {
    return fail('USAGE_ERROR', error.message);
  }

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    const rootDir = resolveRootDir(dbPath);
    const panel = buildStatusPanel(db, { since, limit: flags.limit, rootDir });
    if (flags.json) emit({ ok: true, data: panel });
    else process.stdout.write(renderHuman(panel));
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
  resolveDbPath,
  resolveRootDir,
};
