'use strict';

// Phase 8B.1 — Declarative dispatch rules (GSD-2 pattern).
//
// evaluate(ctx, rules) walks a priority-sorted rule array and returns the
// first matching { rule_id, action, runtime }. Actions:
//   • spawn_agent — orchestrator should spawn a session with `runtime`
//   • defer       — leave task pending, revisit next tick (deps/wave wait)
//   • block       — terminal: don't spawn (breaker, no runtimes, etc.)
//
// Phase 5.4 ROUTE_PREFERENCES lives here now. daemon.cjs's `routeTask` is a
// thin wrapper around evaluate() so Phase 5.4 tests stay green while the
// parallel orchestrator (8B.2) gets a richer decision surface: wave state,
// deps readiness, and custom rule injection.

const ROUTE_PREFERENCES = Object.freeze({
  haiku:  ['opencode', 'gemini', 'claude', 'codex'],
  sonnet: ['claude', 'codex', 'opencode', 'gemini'],
  opus:   ['claude', 'codex'],
});

function resolveByPreference(ctx) {
  const hint = ctx.task && ctx.task.complexity_hint;
  const pref = hint ? ROUTE_PREFERENCES[hint] : null;
  if (pref) {
    for (const r of pref) if (ctx.available_runtimes.includes(r)) return r;
  }
  return ctx.available_runtimes[0];
}

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
    id: 'by-preference',
    priority: 10,
    when: (ctx) => {
      const hint = ctx.task && ctx.task.complexity_hint;
      return !!(hint && ROUTE_PREFERENCES[hint]);
    },
    action: 'spawn_agent',
    resolve: resolveByPreference,
  },
  {
    id: 'fallback-first-available',
    priority: 0,
    when: () => true,
    action: 'spawn_agent',
    resolve: (ctx) => ctx.available_runtimes[0],
  },
]);

function evaluate(ctx, rules = DEFAULT_RULES) {
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of sorted) {
    if (rule.when(ctx)) {
      let runtime = null;
      if (rule.action === 'spawn_agent') {
        runtime = rule.resolve ? rule.resolve(ctx) : (rule.runtime || null);
      }
      return { rule_id: rule.id, action: rule.action, runtime };
    }
  }
  return { rule_id: null, action: 'block', runtime: null };
}

module.exports = {
  evaluate,
  DEFAULT_RULES,
  ROUTE_PREFERENCES,
};
