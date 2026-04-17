'use strict';

// Phase 6.3 — ultra-tools status cost panel.
//
// Reads telemetry aggregations from state.db (Phase 6.2) and renders either
// a human-readable table or a JSON envelope consumable by skills/ultra-status.
// Does not modify state — read-only command.

const fs = require('node:fs');
const path = require('node:path');

const ops = require('../../mcp-server/lib/state-ops.cjs');

const USAGE = `ultra-tools status [flags]

Reads telemetry from .ultra/state.db and prints a cost + activity summary.

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

function buildCostPanel(db, { since = null, limit = 3 } = {}) {
  const by_runtime = ops.aggregateTelemetryByRuntime(db, { since });
  const top_tasks = ops.aggregateTelemetryByTask(db, { since, limit });
  const total_cost_usd = by_runtime.reduce((acc, r) => acc + (r.cost_usd || 0), 0);
  return {
    period: { since: since || 'all-time' },
    by_runtime,
    top_tasks,
    total_cost_usd,
  };
}

function formatCost(n) {
  if (!n) return '$0.0000';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function renderHuman(panel) {
  const lines = [];
  lines.push(`Period: ${panel.period.since}`);
  lines.push(`Total cost: ${formatCost(panel.total_cost_usd)}`);
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
    const panel = buildCostPanel(db, { since, limit: flags.limit });
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
  buildCostPanel,
  renderHuman,
  parseSince,
  parseFlags,
};
