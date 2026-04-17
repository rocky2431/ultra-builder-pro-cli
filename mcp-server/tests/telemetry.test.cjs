'use strict';

// Phase 6.2 — Telemetry collectors:
//   • appendTelemetry writes to state.db.telemetry AND .ultra/telemetry/
//     {YYYY-MM-DD}.jsonl (double-write; jsonl keeps full payload the table
//     can't hold).
//   • computeCost(runtime, model, ti, to) returns USD from 2026-04 pricing.
//   • aggregateTelemetryByRuntime / byTask / bySession drive /ultra-status.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const telemetry = require('../lib/telemetry.cjs');
const pricing = require('../lib/pricing.cjs');

function freshFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-tele-'));
  const file = path.join(dir, '.ultra', 'state.db');
  const init = initStateDb(file);
  return { dir, db: init.db };
}

function teardown(dir, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function seedSession(db, { sid = 's-1', task_id = 't-1', runtime = 'claude' } = {}) {
  ops.createTask(db, { id: task_id, title: 'tele target', type: 'feature', priority: 'P1' });
  ops.createSession(db, {
    sid, task_id, runtime, pid: null,
    worktree_path: `/tmp/${sid}/wt`,
    artifact_dir: `/tmp/${sid}/art`,
  });
  return { sid, task_id, runtime };
}

// ─── pricing ──────────────────────────────────────────────────────────────

test('computeCost: claude opus produces non-zero USD for realistic tokens', () => {
  const cost = pricing.computeCost('claude', 'claude-opus-4-7', 1000, 500);
  assert.ok(cost > 0 && cost < 1, `expected reasonable cost, got ${cost}`);
});

test('computeCost: unknown runtime → null', () => {
  assert.equal(pricing.computeCost('madeup', 'model-x', 100, 100), null);
});

test('computeCost: zero tokens → zero', () => {
  assert.equal(pricing.computeCost('claude', 'claude-sonnet-4-6', 0, 0), 0);
});

// ─── appendTelemetry ─────────────────────────────────────────────────────

test('appendTelemetry writes to telemetry table', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-t1' });
    const out = telemetry.appendTelemetry(db, {
      event_type: 'tool_call',
      tool_name: 'task.list',
      session_id: 's-t1',
      rootDir: dir,
    });
    assert.ok(out.id > 0);
    const row = db.prepare('SELECT * FROM telemetry WHERE id = ?').get(out.id);
    assert.equal(row.event_type, 'tool_call');
    assert.equal(row.tool_name, 'task.list');
    assert.equal(row.session_id, 's-t1');
  } finally { teardown(dir, db); }
});

test('appendTelemetry writes a jsonl line under .ultra/telemetry/YYYY-MM-DD.jsonl', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-t2' });
    telemetry.appendTelemetry(db, {
      event_type: 'tool_call',
      tool_name: 'task.create',
      session_id: 's-t2',
      rootDir: dir,
      payload: { duration_ms: 42 },
    });
    const today = new Date().toISOString().slice(0, 10);
    const jsonl = path.join(dir, '.ultra', 'telemetry', `${today}.jsonl`);
    assert.ok(fs.existsSync(jsonl), `expected jsonl at ${jsonl}`);
    const lines = fs.readFileSync(jsonl, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.tool_name, 'task.create');
    assert.equal(parsed.payload.duration_ms, 42);
  } finally { teardown(dir, db); }
});

test('appendTelemetry auto-computes cost_usd when runtime + tokens supplied', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-t3' });
    const out = telemetry.appendTelemetry(db, {
      event_type: 'token_usage',
      tool_name: 'session.close',
      session_id: 's-t3',
      runtime: 'claude',
      tokens_input: 2000,
      tokens_output: 500,
      rootDir: dir,
      payload: { model: 'claude-sonnet-4-6' },
    });
    const row = db.prepare('SELECT cost_usd FROM telemetry WHERE id = ?').get(out.id);
    assert.ok(row.cost_usd > 0, 'cost should be computed from tokens');
  } finally { teardown(dir, db); }
});

test('appendTelemetry tolerates null session_id (pre-session CLI calls)', () => {
  const { dir, db } = freshFixture();
  try {
    const out = telemetry.appendTelemetry(db, {
      event_type: 'tool_call',
      tool_name: 'cli.task.list',
      session_id: null,
      rootDir: dir,
    });
    const row = db.prepare('SELECT * FROM telemetry WHERE id = ?').get(out.id);
    assert.equal(row.session_id, null);
  } finally { teardown(dir, db); }
});

test('appendTelemetry event_type constraint: invalid value rejected', () => {
  const { dir, db } = freshFixture();
  try {
    assert.throws(
      () => telemetry.appendTelemetry(db, { event_type: 'bogus', rootDir: dir }),
      /CHECK|constraint|event_type/,
    );
  } finally { teardown(dir, db); }
});

// ─── aggregation ─────────────────────────────────────────────────────────

test('aggregateTelemetryByRuntime: groups calls + sums tokens/cost', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-a1', task_id: 't-a1', runtime: 'claude' });
    seedSession(db, { sid: 's-a2', task_id: 't-a2', runtime: 'codex' });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'x', session_id: 's-a1', runtime: 'claude', tokens_input: 1000, tokens_output: 200, rootDir: dir, payload: { model: 'claude-sonnet-4-6' } });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'y', session_id: 's-a1', runtime: 'claude', tokens_input: 500, tokens_output: 100, rootDir: dir, payload: { model: 'claude-sonnet-4-6' } });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'z', session_id: 's-a2', runtime: 'codex', tokens_input: 800, tokens_output: 300, rootDir: dir, payload: { model: 'gpt-5.4' } });

    const summary = ops.aggregateTelemetryByRuntime(db);
    const byRuntime = Object.fromEntries(summary.map((r) => [r.runtime, r]));
    assert.equal(byRuntime.claude.calls, 2);
    assert.equal(byRuntime.codex.calls, 1);
    assert.equal(byRuntime.claude.tokens_in, 1500);
    assert.equal(byRuntime.codex.tokens_in, 800);
    assert.ok(byRuntime.claude.cost_usd > 0);
  } finally { teardown(dir, db); }
});

test('aggregateTelemetryByTask: top N tasks by cost', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-b1', task_id: 't-cheap', runtime: 'claude' });
    seedSession(db, { sid: 's-b2', task_id: 't-expensive', runtime: 'claude' });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'x', session_id: 's-b1', runtime: 'claude', tokens_input: 100, tokens_output: 50, rootDir: dir, payload: { model: 'claude-sonnet-4-6' } });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'y', session_id: 's-b2', runtime: 'claude', tokens_input: 10000, tokens_output: 5000, rootDir: dir, payload: { model: 'claude-opus-4-7' } });

    const top = ops.aggregateTelemetryByTask(db, { limit: 1 });
    assert.equal(top.length, 1);
    assert.equal(top[0].task_id, 't-expensive');
    assert.ok(top[0].cost_usd > 0);
  } finally { teardown(dir, db); }
});

test('aggregateTelemetryBySession: per-session roll-up', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-c1', task_id: 't-c1', runtime: 'claude' });
    telemetry.appendTelemetry(db, { event_type: 'tool_call', tool_name: 'task.list', session_id: 's-c1', rootDir: dir });
    telemetry.appendTelemetry(db, { event_type: 'tool_call', tool_name: 'task.get', session_id: 's-c1', rootDir: dir });
    telemetry.appendTelemetry(db, { event_type: 'token_usage', tool_name: 'session.close', session_id: 's-c1', runtime: 'claude', tokens_input: 500, tokens_output: 100, rootDir: dir, payload: { model: 'claude-haiku-4-5' } });

    const summary = ops.aggregateTelemetryBySession(db, 's-c1');
    assert.equal(summary.tool_calls, 3);
    assert.equal(summary.tokens_in, 500);
    assert.equal(summary.tokens_out, 100);
    assert.ok(summary.cost_usd > 0);
  } finally { teardown(dir, db); }
});

test('aggregate filter: since cutoff excludes older rows', () => {
  const { dir, db } = freshFixture();
  try {
    seedSession(db, { sid: 's-d1', task_id: 't-d1', runtime: 'claude' });
    // Insert one row; then a cutoff in the future filters it out.
    telemetry.appendTelemetry(db, { event_type: 'tool_call', tool_name: 'x', session_id: 's-d1', rootDir: dir });
    const futureCutoff = new Date(Date.now() + 60 * 1000).toISOString();
    const summary = ops.aggregateTelemetryByRuntime(db, { since: futureCutoff });
    assert.equal(summary.length, 0);
  } finally { teardown(dir, db); }
});
