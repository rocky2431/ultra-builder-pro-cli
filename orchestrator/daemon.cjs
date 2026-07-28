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
const runtimeState = require('../mcp-server/lib/runtime-state.cjs');
const projector = require('../mcp-server/lib/projector.cjs');
const runner = require('./session-runner.cjs');
const recovery = require('./recovery.cjs');
const { evaluate, DEFAULT_RULES } = require('./dispatch-rules.cjs');

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

function taskDependenciesReady(db, task) {
  return (task.deps || []).every((dependencyId) => {
    const dependency = ops.readTask(db, dependencyId);
    return Boolean(dependency && ['completed', 'expanded'].includes(dependency.status));
  });
}

function hasActiveFileConflict(db, task) {
  const declared = new Set(task.files_modified || []);
  if (declared.size === 0) return false;
  return ops.listActiveSessions(db).some((session) => {
    if (!session.task_id || session.task_id === task.id) return false;
    const activeTask = ops.readTask(db, session.task_id);
    return Boolean(
      activeTask
      && (activeTask.files_modified || []).some((file) => declared.has(file)),
    );
  });
}

function maintainState({ db, repoRoot, project = projector.projectAll } = {}) {
  if (!db) throw new Error('maintainState: db required');
  if (!repoRoot) throw new Error('maintainState: repoRoot required');
  const cursor = runtimeState.readConsumerCursor(db, 'spec-staleness');
  const staleness = ops.consumeSpecChangedEvents(db, { since_id: cursor, limit: 500 });
  runtimeState.writeConsumerCursor(db, 'spec-staleness', staleness.next_since_id);
  const ensured = runtimeState.ensureProjectionJob(db, { tool_name: 'orchestrator.maintenance' });
  const projections = runtimeState.processProjectionJobs(db, {
    rootDir: repoRoot, project, limit: 500,
  });
  return { staleness, ensured, projections };
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
  if (typeof command !== 'string' || command.trim() === '') {
    const error = new Error(
      'runDaemon: an explicit executable command is required; refusing to reserve empty sessions',
    );
    error.code = 'ORCHESTRATOR_COMMAND_REQUIRED';
    throw error;
  }
  if (!Array.isArray(commandArgs)) {
    const error = new Error('runDaemon: commandArgs must be an array');
    error.code = 'ORCHESTRATOR_COMMAND_INVALID';
    throw error;
  }

  let stopped = false;
  const children = [];
  let bootRecovery;
  try {
    bootRecovery = recovery.recoverOnBoot(db, { repoRoot });
  } catch (error) {
    runtimeState.recordIncident(db, {
      code: 'BOOT_RECOVERY_FAILED', severity: 'critical', retryable: true,
      message: error.message, source_kind: 'orchestrator', source_id: 'boot',
    });
    if (onError) onError(error); else throw error;
    bootRecovery = { recovered: [], count: 0, error: error.message };
  }

  function settleExecution(handle, task) {
    let settled = false;
    const stopHeartbeat = runner.attachHeartbeat(db, handle.sid);
    const settle = (rawCode, signal, spawnError = null) => {
      if (settled) return;
      settled = true;
      stopHeartbeat();
      const code = rawCode === null ? -1 : rawCode;
      const success = code === 0;
      // A caller may intentionally close the DB while leaving child processes
      // alive during shutdown. The next boot recovery owns those stale leases.
      if (!db.open) return;
      const liveSession = ops.readSession(db, handle.sid);
      // Takeover or an explicit close already owns the terminal transition.
      // The late child exit must not block the replacement task/session.
      if (!liveSession || liveSession.status !== 'running') return;
      try {
        if (!success) {
          try { ops.patchTask(db, task.id, { status: 'blocked' }); }
          catch (error) {
            runtimeState.recordIncident(db, {
              code: 'ORCHESTRATOR_TASK_BLOCK_FAILED', severity: 'error', retryable: true,
              message: error.message, source_kind: 'task', source_id: task.id,
            });
          }
          ops.recordTaskFailure(db, task.id, {
            reason: spawnError
              ? `worker spawn or runtime error: ${spawnError.message}`
              : `runtime process exited with code ${code}${signal ? ` (${signal})` : ''}`,
            session_id: handle.sid,
          });
        }
        runner.closeSession(
          { db, repoRoot, sid: handle.sid },
          { status: success ? 'completed' : 'crashed', remove_worktree: false },
        );
      } catch (error) {
        if (onError) onError(error);
        else process.stderr.write(`orchestrator settle error: ${error.message}\n`);
      }
    };
    handle.process.once('exit', settle);
    handle.process.once('error', (error) => settle(-1, null, error));
    if (handle.process.exitCode !== null && handle.process.exitCode !== undefined) {
      setImmediate(() => settle(handle.process.exitCode, handle.process.signalCode || null));
    }
  }

  function tick() {
    if (stopped) return;
    try {
      maintainState({ db, repoRoot });
    } catch (error) {
      runtimeState.recordIncident(db, {
        code: 'RUNTIME_MAINTENANCE_FAILED', severity: 'error', retryable: true,
        message: error.message, source_kind: 'orchestrator', source_id: 'maintenance',
      });
      if (onError) onError(error); else throw error;
      return;
    }
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
      if (task.stale) continue;
      if (!taskDependenciesReady(db, task)) continue;
      if (hasActiveFileConflict(db, task)) continue;
      try {
        runner.assertSessionTaskReady(db, repoRoot, task.id);
      } catch (error) {
        // A normal workflow gate is a durable pending state, not a daemon
        // failure and not an error to repeat on every poll.
        if (!runner.isExpectedExecutionGate(error) && onError) onError(error);
        continue;
      }
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
          mark_task_started: true,
        });
        handle.task_id = task.id;
        settleExecution(handle, task);
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
    get bootRecovery() { return bootRecovery; },
  };
}

module.exports = {
  runDaemon,
  routeTask,
  maintainState,
  taskDependenciesReady,
  hasActiveFileConflict,
};
