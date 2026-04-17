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

test('buildCostPanel: empty db → zero totals, empty arrays', () => {
  const { dir, db } = freshFixture();
  try {
    const out = statusCmd.buildCostPanel(db, {});
    assert.equal(out.total_cost_usd, 0);
    assert.equal(out.by_runtime.length, 0);
    assert.equal(out.top_tasks.length, 0);
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
