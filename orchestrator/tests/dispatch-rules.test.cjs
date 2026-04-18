'use strict';

// Phase 8B.1 — Dispatch rules declarative table.
//
// evaluate(ctx, rules) → { rule_id, action, runtime }.
// DEFAULT_RULES must reproduce Phase 5.4 routeTask behavior (ROUTE_PREFERENCES
// by complexity_hint, fall back to first available) so daemon.cjs keeps green.
// New dimensions: breaker_state / deps_ready / wave conflict / custom rules.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluate, DEFAULT_RULES, ROUTE_PREFERENCES } = require('../dispatch-rules.cjs');

function baseCtx(overrides = {}) {
  return {
    task: { id: 't1' },
    deps_ready: true,
    available_runtimes: ['claude', 'opencode', 'codex', 'gemini'],
    breaker_state: 'ok',
    wave: null,
    ...overrides,
  };
}

// ─── spawn_agent path (preference routing, 6 cases mirror routeTask) ──────

test('evaluate: opus hint + all available → claude (preference head)', () => {
  const d = evaluate(baseCtx({ task: { id: 't', complexity_hint: 'opus' } }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'claude');
});

test('evaluate: opus hint + only codex available → codex', () => {
  const d = evaluate(baseCtx({
    task: { id: 't', complexity_hint: 'opus' },
    available_runtimes: ['codex', 'opencode'],
  }));
  assert.equal(d.runtime, 'codex');
});

test('evaluate: opus hint + preference exhausted → first available fallback', () => {
  const d = evaluate(baseCtx({
    task: { id: 't', complexity_hint: 'opus' },
    available_runtimes: ['opencode', 'gemini'],
  }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'opencode');
});

test('evaluate: haiku hint + all available → opencode (cheapest preference)', () => {
  const d = evaluate(baseCtx({ task: { id: 't', complexity_hint: 'haiku' } }));
  assert.equal(d.runtime, 'opencode');
});

test('evaluate: sonnet hint + all available → claude', () => {
  const d = evaluate(baseCtx({ task: { id: 't', complexity_hint: 'sonnet' } }));
  assert.equal(d.runtime, 'claude');
});

test('evaluate: no hint → first available fallback', () => {
  const d = evaluate(baseCtx({
    task: { id: 't' },
    available_runtimes: ['gemini', 'claude'],
  }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'gemini');
});

// ─── block / defer paths (new in 8B.1) ────────────────────────────────────

test('evaluate: empty runtimes → block', () => {
  const d = evaluate(baseCtx({ available_runtimes: [] }));
  assert.equal(d.action, 'block');
  assert.equal(d.runtime, null);
});

test('evaluate: breaker tripped → block (wins over spawn rules)', () => {
  const d = evaluate(baseCtx({ breaker_state: 'tripped' }));
  assert.equal(d.action, 'block');
  assert.equal(d.rule_id, 'breaker-blocked');
});

test('evaluate: deps_ready=false → defer', () => {
  const d = evaluate(baseCtx({ deps_ready: false }));
  assert.equal(d.action, 'defer');
  assert.equal(d.rule_id, 'deps-not-ready');
});

test('evaluate: serial wave already has running task → defer', () => {
  const d = evaluate(baseCtx({
    wave: { parallel: false, running_count: 1 },
  }));
  assert.equal(d.action, 'defer');
  assert.equal(d.rule_id, 'wave-conflict');
});

// ─── composability: custom rules override defaults ────────────────────────

test('evaluate: custom high-priority rule overrides defaults', () => {
  const customRules = [
    ...DEFAULT_RULES,
    {
      id: 'force-gemini',
      priority: 999,
      when: () => true,
      action: 'spawn_agent',
      resolve: () => 'gemini',
    },
  ];
  const d = evaluate(baseCtx({ task: { id: 't', complexity_hint: 'opus' } }), customRules);
  assert.equal(d.runtime, 'gemini');
  assert.equal(d.rule_id, 'force-gemini');
});

// ─── ROUTE_PREFERENCES shape guard (regression: don't drift from Phase 5.4) ─

test('DEFAULT_RULES preserves ROUTE_PREFERENCES shape', () => {
  assert.deepEqual(Object.keys(ROUTE_PREFERENCES).sort(), ['haiku', 'opus', 'sonnet']);
  assert.equal(ROUTE_PREFERENCES.opus[0], 'claude');
  assert.equal(ROUTE_PREFERENCES.haiku[0], 'opencode');
});
