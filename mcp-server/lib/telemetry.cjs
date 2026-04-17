'use strict';

// Phase 6.2 — Telemetry collector.
//
// Double-write model: state.db.telemetry (table, queryable via state-ops
// aggregations) + .ultra/telemetry/{YYYY-MM-DD}.jsonl (full payload, easy
// grep, no schema constraint). The table is the authoritative source for
// cost panel queries; the jsonl is for human ops + audit trails + future
// Phase 6.5 SDK-usage correlation.

const fs = require('node:fs');
const path = require('node:path');

const { computeCost } = require('./pricing.cjs');

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function telemetryJsonlPath(rootDir) {
  return path.join(rootDir || '.', '.ultra', 'telemetry', `${todayStamp()}.jsonl`);
}

function appendTelemetry(db, {
  event_type,
  tool_name = null,
  session_id = null,
  runtime = null,
  tokens_input = null,
  tokens_output = null,
  cost_usd = null,
  task_id = null,
  payload = null,
  rootDir = '.',
} = {}) {
  if (!event_type) throw new Error('appendTelemetry: event_type required');

  // Auto-derive cost when tokens + runtime known and caller didn't supply one.
  let effectiveCost = cost_usd;
  if (effectiveCost === null && runtime && tokens_input !== null && tokens_output !== null) {
    effectiveCost = computeCost(runtime, payload && payload.model, tokens_input, tokens_output);
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO telemetry (session_id, event_type, tokens_input, tokens_output, tool_name, cost_usd, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(session_id, event_type, tokens_input, tokens_output, tool_name, effectiveCost, now);

  const jsonl = telemetryJsonlPath(rootDir);
  fs.mkdirSync(path.dirname(jsonl), { recursive: true });
  fs.appendFileSync(jsonl, JSON.stringify({
    id: Number(result.lastInsertRowid),
    ts: now,
    session_id,
    event_type,
    tool_name,
    runtime,
    tokens_input,
    tokens_output,
    cost_usd: effectiveCost,
    task_id,
    payload,
  }) + '\n');

  return { id: Number(result.lastInsertRowid), ts: now, cost_usd: effectiveCost };
}

module.exports = {
  appendTelemetry,
  telemetryJsonlPath,
  todayStamp,
};
