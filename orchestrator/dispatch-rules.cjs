'use strict';

// Declarative dispatch rules for deterministic priority matching.
//
// evaluate(ctx, rules) walks a priority-sorted rule array and returns the
// first matching { rule_id, action, runtime }. Actions:
//   • spawn_agent — orchestrator should spawn a session with `runtime`
//   • defer       — leave task pending, revisit next tick (deps/wave wait)
//   • block       — terminal: don't spawn (breaker, no runtimes, etc.)
//
// Runtime order is caller-owned. The orchestrator does not infer model quality,
// price, or capability from a host name because every host can be configured
// with different models. The parallel orchestrator supplies richer dimensions:
// wave state, dependency readiness, and explicit custom rules.

const { isSupportedRuntime } = require('../adapters/_shared/runtime-assets.cjs');

const DEFAULT_RULES = Object.freeze([
  {
    id: 'breaker-blocked',
    priority: 100,
    when: (ctx) => ctx.breaker_state === 'tripped',
    action: 'block',
  },
  {
    id: 'deps-not-ready',
    priority: 90,
    when: (ctx) => ctx.deps_ready === false,
    action: 'defer',
  },
  {
    id: 'no-runtimes',
    priority: 80,
    when: (ctx) => !Array.isArray(ctx.available_runtimes) || ctx.available_runtimes.length === 0,
    action: 'block',
  },
  {
    id: 'wave-conflict',
    priority: 70,
    when: (ctx) => !!(ctx.wave && ctx.wave.parallel === false && (ctx.wave.running_count || 0) > 0),
    action: 'defer',
  },
  {
    id: 'first-authorized-runtime',
    priority: 0,
    when: () => true,
    action: 'spawn_agent',
    resolve: (ctx) => ctx.available_runtimes[0],
  },
]);

function evaluate(ctx, rules = DEFAULT_RULES) {
  const normalizedCtx = {
    ...ctx,
    available_runtimes: Array.isArray(ctx && ctx.available_runtimes)
      ? [...new Set(ctx.available_runtimes.filter(isSupportedRuntime))]
      : [],
  };
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of sorted) {
    if (rule.when(normalizedCtx)) {
      let runtime = null;
      if (rule.action === 'spawn_agent') {
        runtime = rule.resolve ? rule.resolve(normalizedCtx) : (rule.runtime || null);
        if (!isSupportedRuntime(runtime)) {
          return { rule_id: rule.id, action: 'block', runtime: null };
        }
      }
      return { rule_id: rule.id, action: rule.action, runtime };
    }
  }
  return { rule_id: null, action: 'block', runtime: null };
}

module.exports = {
  evaluate,
  DEFAULT_RULES,
};
