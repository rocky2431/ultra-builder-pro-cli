'use strict';

// Phase 8B.1 — Dispatch rules declarative table.
//
// evaluate(ctx, rules) → { rule_id, action, runtime }.
// Runtime selection follows the caller's explicit supported-runtime order.
// New dimensions: breaker_state / deps_ready / wave conflict / custom rules.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluate, DEFAULT_RULES } = require('../dispatch-rules.cjs');
const RETIRED_RUNTIME = ['gem', 'ini'].join('');

function baseCtx(overrides = {}) {
  return {
    task: { id: 't1' },
    deps_ready: true,
    available_runtimes: ['claude', 'opencode', 'codex'],
    breaker_state: 'ok',
    wave: null,
    ...overrides,
  };
}

// ─── spawn_agent path ────────────────────────────────────────────────────

test('evaluate: explicit runtime order is authoritative', () => {
  const d = evaluate(baseCtx({
    available_runtimes: ['kimi', 'codex', 'claude', 'opencode'],
  }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'kimi');
});

test('evaluate: legacy model-tier hints cannot override runtime order', () => {
  const d = evaluate(baseCtx({
    task: { id: 't', complexity_hint: 'opus' },
    available_runtimes: ['kimi', 'opencode', 'codex', 'claude'],
  }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'kimi');
});

test('evaluate: retired runtimes are discarded before fallback routing', () => {
  const d = evaluate(baseCtx({
    task: { id: 't' },
    available_runtimes: [RETIRED_RUNTIME, 'claude'],
  }));
  assert.equal(d.action, 'spawn_agent');
  assert.equal(d.runtime, 'claude');
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

test('evaluate: custom rules cannot select an unsupported runtime', () => {
  const customRules = [
    ...DEFAULT_RULES,
    {
      id: 'force-retired-runtime',
      priority: 999,
      when: () => true,
      action: 'spawn_agent',
      resolve: () => RETIRED_RUNTIME,
    },
  ];
  const d = evaluate(baseCtx(), customRules);
  assert.equal(d.action, 'block');
  assert.equal(d.runtime, null);
  assert.equal(d.rule_id, 'force-retired-runtime');
});
