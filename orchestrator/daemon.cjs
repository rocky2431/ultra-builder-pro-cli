'use strict';

// Phase 5.4 — Orchestrator daemon.
//
// Polls state.db for pending tasks, runs admission + routing, and spawns
// session-runner children. This is *not* Phase 8B dispatch rules — just the
// simplest "pick a runtime, spawn one session per pending task" loop. The
// daemon never picks a task while admission says blocked_by_breaker; the
// circuit breaker (5.2) is the only gate above routing.
//
// opt-in lives in bin/orchestrator.js which reads settings.json before
// calling runDaemon — the runtime layer itself has no opt-in concept.

const ops = require('../mcp-server/lib/state-ops.cjs');
const runner = require('./session-runner.cjs');
const { evaluate, DEFAULT_RULES, ROUTE_PREFERENCES } = require('./dispatch-rules.cjs');

// Phase 8B.1 — routeTask is now a thin wrapper over evaluate() so Phase 5.4
// callers see identical behavior while the parallel orchestrator (8B.2) can
// feed richer ctx (wave, deps_ready) to the same rule engine.
function routeTask(task, availableRuntimes) {
  const d = evaluate({
    task: task || {},
    deps_ready: true,
    available_runtimes: Array.isArray(availableRuntimes) ? availableRuntimes : [],
    breaker_state: 'ok',
    wave: null,
  }, DEFAULT_RULES);
  return d.action === 'spawn_agent' ? d.runtime : null;
}

function runDaemon({
  db,
  repoRoot,
  runtimes,
  pollMs = 1000,
  command = null,
  commandArgs = [],
  onError = null,
  branchScoped = false,
} = {}) {
  if (!db) throw new Error('runDaemon: db required');
  if (!repoRoot) throw new Error('runDaemon: repoRoot required');
  if (!Array.isArray(runtimes) || runtimes.length === 0) {
    throw new Error('runDaemon: runtimes array required');
  }

  let stopped = false;
  const children = [];

  function tick() {
    if (stopped) return;
    let pending;
    try {
      const filter = { status: 'pending' };
      if (branchScoped) {
        const tag = ops.deriveBranchTag(repoRoot);
        if (tag) filter.tag = tag;
      }
      pending = ops.listTasks(db, filter);
    } catch (err) {
      if (onError) onError(err); else throw err;
      return;
    }
    for (const task of pending) {
      if (stopped) return;
      // admissionCheck catches both live-session conflicts and tripped breakers.
      let verdict;
      try { verdict = ops.admissionCheck(db, task.id); }
      catch (err) { if (onError) onError(err); continue; }
      if (!verdict.can_spawn) continue;

      const runtime = routeTask(task, runtimes);
      if (!runtime) continue;

      try {
        const handle = runner.spawnSession({
          db, repoRoot,
          task_id: task.id,
          runtime,
          command,
          args: commandArgs,
        });
        children.push(handle);
      } catch (err) {
        if (onError) onError(err);
        // Don't throw — one bad task shouldn't stop the loop.
      }
    }
  }

  const timer = setInterval(tick, pollMs);
  if (typeof timer.unref === 'function') timer.unref();
  // Fire one tick immediately so tests don't need to wait pollMs.
  setImmediate(tick);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
    get running() { return !stopped; },
    get children() { return children.slice(); },
  };
}

module.exports = {
  runDaemon,
  routeTask,
  ROUTE_PREFERENCES,
};
