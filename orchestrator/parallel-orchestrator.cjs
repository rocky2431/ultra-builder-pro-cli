'use strict';

// Phase 8B.2 — Parallel orchestrator.
//
// Consumes an execution-plan.json (built by Phase 8A.4a plan-builder) and
// drives resumable per-wave session spawning. Each wave is either parallel
// (batch Promise.all on proc exit) or serial (await per task) based on the
// file-overlap detection already done by plan-builder.
//
// Responsibilities:
//   • load plan (object or path)
//   • for each ready wave: evaluate dispatch-rules per task → spawn sessions
//     via session-runner → wait for transport exit → preserve task-gate state
//   • stop at the first non-converged wave and resume safely on the next call
//   • emit wave_started / wave_paused|wave_completed and
//     plan_paused|plan_completed events
//
// Not responsible for:
//   • circuit breaker (Phase 5.2 recordTaskFailure owns that path)
//   • worktree lifecycle beyond what session-runner already does
//   • merge back (Phase 8B.4 layers on top of closeSession)

const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

const planStore = require('../mcp-server/lib/plan-store.cjs');
const ops = require('../mcp-server/lib/state-ops.cjs');
const workflows = require('../mcp-server/lib/workflow-state.cjs');
const runner = require('./session-runner.cjs');
const dispatchRules = require('./dispatch-rules.cjs');

const TERMINAL_TASK_STATUSES = new Set(['completed', 'expanded']);

function resolvePlan({ plan, planPath, repoRoot }) {
  if (plan) return plan;
  if (planPath) return JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const loaded = planStore.loadPlanArtifact(repoRoot);
  if (!loaded) {
    const err = new Error('runPlan: no plan found (pass plan or planPath, or pre-write artifact)');
    err.code = 'PLAN_NOT_FOUND';
    throw err;
  }
  return loaded;
}

function planError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function validatePlanShape(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw planError('PLAN_INVALID', 'execution plan must be an object');
  }
  if (plan.schema_version !== undefined && plan.schema_version !== '1.0') {
    throw planError(
      'PLAN_INVALID',
      `unsupported execution plan schema_version: ${String(plan.schema_version)}`,
    );
  }
  if (plan.change_id !== undefined && plan.change_id !== null
    && (typeof plan.change_id !== 'string' || plan.change_id.trim() === '')) {
    throw planError('PLAN_INVALID', 'execution plan change_id must be null or a non-empty string');
  }
  if (!Array.isArray(plan.waves) || plan.waves.length === 0) {
    throw planError('PLAN_INVALID', 'execution plan must contain at least one dependency wave');
  }
  if (plan.cycles !== undefined && !Array.isArray(plan.cycles)) {
    throw planError('PLAN_INVALID', 'execution plan cycles must be an array');
  }
  if (Array.isArray(plan.cycles) && plan.cycles.length > 0) {
    throw planError('PLAN_INVALID', 'execution plan contains dependency cycles', {
      cycles: plan.cycles,
    });
  }

  const waveIds = new Set();
  const taskIds = new Set();
  for (const [index, wave] of plan.waves.entries()) {
    if (!wave || typeof wave !== 'object' || Array.isArray(wave)) {
      throw planError('PLAN_INVALID', `execution plan wave ${index + 1} must be an object`);
    }
    if ((typeof wave.id !== 'string' && typeof wave.id !== 'number')
      || String(wave.id).trim() === '') {
      throw planError('PLAN_INVALID', `execution plan wave ${index + 1} requires an id`);
    }
    const waveKey = String(wave.id);
    if (waveIds.has(waveKey)) {
      throw planError('PLAN_INVALID', `execution plan contains duplicate wave id ${waveKey}`);
    }
    waveIds.add(waveKey);
    if (!Array.isArray(wave.tasks) || wave.tasks.length === 0) {
      throw planError('PLAN_INVALID', `execution plan wave ${waveKey} must contain tasks`);
    }
    if (typeof wave.parallel !== 'boolean') {
      throw planError('PLAN_INVALID', `execution plan wave ${waveKey} requires parallel boolean`);
    }
    for (const taskId of wave.tasks) {
      if (typeof taskId !== 'string' || taskId.trim() === '') {
        throw planError('PLAN_INVALID', `execution plan wave ${waveKey} has an invalid task id`);
      }
      if (taskIds.has(taskId)) {
        throw planError('PLAN_INVALID', `execution plan contains duplicate task ${taskId}`);
      }
      taskIds.add(taskId);
    }
  }
  return plan;
}

function assertPlanAuthority(db, repoRoot, plan) {
  const taskIds = plan.waves.flatMap((wave) => wave.tasks);
  const taskRows = taskIds.map((id) => ops.readTask(db, id)).filter(Boolean);
  const taskChangeIds = new Set(taskRows.map((task) => task.change_id).filter(Boolean));

  if (!plan.change_id) {
    if (taskChangeIds.size > 0) {
      throw planError(
        'PLAN_NOT_COMPLETED',
        'change-owned tasks require a change-bound, completed current execution plan',
      );
    }
    return { mode: 'legacy-unbound', workflow_id: null };
  }
  if (taskChangeIds.size > 1 || (taskChangeIds.size === 1 && !taskChangeIds.has(plan.change_id))) {
    throw planError(
      'PLAN_CHANGE_MISMATCH',
      `execution plan ${plan.change_id} contains tasks owned by another change`,
      { task_change_ids: [...taskChangeIds].sort() },
    );
  }

  const completedRuns = workflows.listWorkflows(
    db,
    { kind: 'plan', status: 'completed', change_id: plan.change_id, limit: 100 },
    { rootDir: repoRoot },
  );
  if (completedRuns.length === 0) {
    throw planError(
      'PLAN_NOT_COMPLETED',
      `change ${plan.change_id} has no completed plan workflow`,
    );
  }

  let currentPlan;
  try {
    currentPlan = workflows.assertCurrentPlan(db, plan.change_id, repoRoot);
  } catch (error) {
    throw planError(
      error.code === 'WORKFLOW_PLAN_NOT_COMPLETED' ? 'PLAN_NOT_COMPLETED' : 'PLAN_STALE',
      error.message,
      { authority_code: error.code || null },
    );
  }
  const expected = planStore.buildPlan(
    currentPlan.tasks,
    { changeId: plan.change_id },
  );
  if (!isDeepStrictEqual(plan, expected)) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} does not match the current DB task graph`,
    );
  }
  return { mode: 'current-change', workflow_id: currentPlan.plan.id };
}

function awaitExit(proc) {
  return new Promise((resolve) => {
    if (!proc) {
      resolve({ code: -1, signal: null, error: new Error('worker process was not created') });
      return;
    }
    if (proc.exitCode !== null && proc.exitCode !== undefined) {
      resolve({ code: proc.exitCode, signal: proc.signalCode || null, error: null });
      return;
    }
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      proc.removeListener('exit', onExit);
      proc.removeListener('error', onError);
      resolve(result);
    };
    const onExit = (code, signal) => settle({
      code: code === null ? -1 : code,
      signal,
      error: null,
    });
    const onError = (error) => settle({ code: -1, signal: null, error });
    proc.once('exit', onExit);
    proc.once('error', onError);
  });
}

function failureReason(execution) {
  if (execution.error) return `worker spawn or runtime error: ${execution.error.message}`;
  return `runtime process exited with code ${execution.code}`
    + `${execution.signal ? ` (${execution.signal})` : ''}`;
}

function recordExecutionFailure(db, taskId, {
  sessionId = null,
  reason,
} = {}) {
  const current = ops.readTask(db, taskId);
  if (current && !TERMINAL_TASK_STATUSES.has(current.status) && current.status !== 'blocked') {
    try { ops.patchTask(db, taskId, { status: 'blocked' }); }
    catch (error) {
      process.stderr.write(
        `parallel-orchestrator: patchTask(${taskId}→blocked) failed: ${error.message}\n`,
      );
    }
  }
  try {
    ops.recordTaskFailure(db, taskId, { reason, session_id: sessionId });
  } catch (error) {
    process.stderr.write(
      `parallel-orchestrator: recordTaskFailure(${taskId}) failed: ${error.message}\n`,
    );
  }
}

function finalizeSession(db, handle, execution, ctx = {}) {
  const { code } = execution;
  const sessionStatus = code === 0 ? 'completed' : 'crashed';
  const liveSession = ops.readSession(db, handle.sid);
  if (!liveSession || liveSession.status !== 'running') {
    return {
      sid: handle.sid,
      task_id: handle.task_id,
      code,
      signal: execution.signal || null,
      error: execution.error?.message || null,
      status: liveSession?.status || 'missing',
      task_status: ops.readTask(db, handle.task_id)?.status || null,
      worktree_preserved: Boolean(
        liveSession?.worktree_path && fs.existsSync(liveSession.worktree_path),
      ),
      merge: undefined,
      close_error: null,
    };
  }
  if (code !== 0) {
    recordExecutionFailure(db, handle.task_id, {
      sessionId: handle.sid,
      reason: failureReason(execution),
    });
  }

  // Process exit is transport evidence, not Ultra task completion. The worker
  // must converge the task through the normal dev/test/review authority before
  // an explicit auto-merge may integrate it.
  let task = ops.readTask(db, handle.task_id);
  const taskConverged = Boolean(task && TERMINAL_TASK_STATUSES.has(task.status));
  let merge;
  let worktreePreserved = true;
  let closeError = null;
  try {
    const closeResult = runner.closeSession(
      { db, repoRoot: ctx.repoRoot, sid: handle.sid },
      {
        status: sessionStatus,
        autoMerge: !!ctx.autoMerge && sessionStatus === 'completed' && taskConverged,
        mergeBaseBranch: ctx.mergeBaseBranch || 'main',
      },
    );
    merge = closeResult.merge;
    worktreePreserved = closeResult.worktree_preserved;
  } catch (err) {
    closeError = err.message;
    process.stderr.write(`parallel-orchestrator: closeSession(${handle.sid}) failed: ${err.message}\n`);
    if (ctx.onError) ctx.onError(err);
  }
  task = ops.readTask(db, handle.task_id);
  return {
    sid: handle.sid,
    task_id: handle.task_id,
    code,
    signal: execution.signal || null,
    error: execution.error?.message || null,
    status: sessionStatus,
    task_status: task?.status || null,
    worktree_preserved: worktreePreserved,
    merge,
    close_error: closeError,
  };
}

async function runTask(db, repoRoot, task, wave, ctx) {
  const { runtimes, command, commandArgs, commandArgsFor, onError } = ctx;
  const decision = dispatchRules.evaluate({
    task,
    deps_ready: true,      // topo order guarantees all deps are in prior waves
    available_runtimes: runtimes,
    breaker_state: 'ok',   // admissionCheck below enforces the real gate
    wave,
  });
  if (decision.action !== 'spawn_agent') {
    if (onError) onError(new Error(`task ${task.id}: deferred/blocked by rule ${decision.rule_id}`));
    return { sid: null, task_id: task.id, code: -2, status: decision.action };
  }

  const args = commandArgsFor ? commandArgsFor(task) : commandArgs;
  let handle;
  try {
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: task.id,
      runtime: decision.runtime,
      command, args,
    });
    handle.task_id = task.id;
  } catch (err) {
    if (runner.isExpectedExecutionGate(err)) {
      return {
        sid: null,
        task_id: task.id,
        code: -4,
        status: 'authority_blocked',
        authority_code: err.code,
        error: err.message,
      };
    }
    if (onError) onError(err);
    recordExecutionFailure(db, task.id, {
      reason: `worker session could not be created: ${err.message}`,
    });
    return { sid: null, task_id: task.id, code: -3, status: 'spawn_failed' };
  }

  // The worker may converge very quickly, so re-read before transitioning and
  // never downgrade a task that already reached a terminal state.
  try {
    if (ops.readTask(db, task.id)?.status === 'pending') {
      ops.patchTask(db, task.id, { status: 'in_progress' });
    }
  }
  catch (err) {
    const latest = ops.readTask(db, task.id);
    if (!latest || !TERMINAL_TASK_STATUSES.has(latest.status)) {
      try { if (handle.process && !handle.process.killed) handle.process.kill('SIGTERM'); }
      catch (_) { /* best effort */ }
      recordExecutionFailure(db, task.id, {
        sessionId: handle.sid,
        reason: `task could not enter in_progress: ${err.message}`,
      });
      return finalizeSession(
        db,
        handle,
        { code: -1, signal: 'SIGTERM', error: err },
        { ...ctx, repoRoot },
      );
    }
  }

  const execution = await awaitExit(handle.process);
  return finalizeSession(db, handle, execution, { ...ctx, repoRoot });
}

function taskDependenciesReady(db, task) {
  return (task.deps || []).every((dependencyId) => {
    const dependency = ops.readTask(db, dependencyId);
    return Boolean(dependency && TERMINAL_TASK_STATUSES.has(dependency.status));
  });
}

async function runWave(db, repoRoot, wave, ctx) {
  const taskRows = wave.tasks.map((id) => ({ id, task: ops.readTask(db, id) }));
  const missingTaskIds = taskRows
    .filter((entry) => !entry.task)
    .map((entry) => entry.id);
  if (ctx.onError) {
    for (const id of missingTaskIds) {
      ctx.onError(new Error(`task ${id} not found in DB; wave cannot converge`));
    }
  }
  const tasks = taskRows.map((entry) => entry.task).filter(Boolean);
  const runnable = tasks.filter((task) => (
    task.status === 'pending'
    && !task.stale
    && taskDependenciesReady(db, task)
  ));

  if (runnable.length > 0) {
    ops.appendEvent(db, {
      type: 'wave_started',
      payload: {
        wave_id: wave.id,
        tasks: runnable.map((task) => task.id),
        parallel: wave.parallel,
      },
    });
  }

  let results;
  if (wave.parallel && runnable.length > 1) {
    results = await Promise.all(runnable.map((task) => runTask(db, repoRoot, task, wave, ctx)));
  } else {
    results = [];
    for (const task of runnable) {
      results.push(await runTask(db, repoRoot, task, wave, ctx));
    }
  }

  const finalTasks = tasks.map((task) => ops.readTask(db, task.id)).filter(Boolean);
  const complete = missingTaskIds.length === 0
    && finalTasks.length === tasks.length
    && finalTasks.every((task) => TERMINAL_TASK_STATUSES.has(task.status));
  const awaiting = finalTasks
    .filter((task) => !TERMINAL_TASK_STATUSES.has(task.status))
    .map((task) => ({ id: task.id, status: task.status, stale: Boolean(task.stale) }))
    .concat(missingTaskIds.map((id) => ({ id, status: 'missing', stale: false })));
  ops.appendEvent(db, {
    type: complete ? 'wave_completed' : 'wave_paused',
    payload: {
      wave_id: wave.id,
      executions_succeeded: results.filter((r) => r.status === 'completed').length,
      executions_crashed: results.filter((r) => r.status === 'crashed').length,
      deferred: results.filter((r) => r.status === 'defer' || r.status === 'block').length,
      awaiting_workflow_gates: awaiting,
    },
  });
  return { results, complete, awaiting };
}

async function runPlan({
  db, repoRoot, plan, planPath,
  runtimes,
  command = null, commandArgs = [], commandArgsFor = null,
  autoMerge = false, mergeBaseBranch = 'main',
  onError = null,
}) {
  if (!db) throw new Error('runPlan: db required');
  if (!repoRoot) throw new Error('runPlan: repoRoot required');
  if (!Array.isArray(runtimes) || runtimes.length === 0) {
    throw new Error('runPlan: runtimes array required');
  }
  if (typeof command !== 'string' || command.trim() === '') {
    const error = new Error(
      'runPlan: an explicit executable command is required; refusing to reserve empty sessions',
    );
    error.code = 'ORCHESTRATOR_COMMAND_REQUIRED';
    throw error;
  }
  if (!Array.isArray(commandArgs)) {
    const error = new Error('runPlan: commandArgs must be an array');
    error.code = 'ORCHESTRATOR_COMMAND_INVALID';
    throw error;
  }
  const resolved = validatePlanShape(resolvePlan({ plan, planPath, repoRoot }));
  const planAuthority = assertPlanAuthority(db, repoRoot, resolved);

  const ctx = {
    runtimes, command, commandArgs, commandArgsFor, onError,
    autoMerge, mergeBaseBranch,
  };
  const allResults = [];
  let completedWaves = 0;
  let pausedWave = null;
  for (const wave of resolved.waves) {
    const outcome = await runWave(db, repoRoot, wave, ctx);
    allResults.push(...outcome.results);
    if (!outcome.complete) {
      pausedWave = { id: wave.id, awaiting: outcome.awaiting };
      break;
    }
    completedWaves += 1;
  }

  const planTaskIds = [...new Set(resolved.waves.flatMap((wave) => wave.tasks))];
  const awaitingWorkflowGates = planTaskIds
    .map((id) => ops.readTask(db, id) || { id, status: 'missing', stale: false })
    .filter((task) => !TERMINAL_TASK_STATUSES.has(task.status))
    .map((task) => ({ id: task.id, status: task.status, stale: Boolean(task.stale) }));
  const completed = awaitingWorkflowGates.length === 0;
  ops.appendEvent(db, {
    type: completed ? 'plan_completed' : 'plan_paused',
    payload: {
      waves: resolved.waves.length,
      waves_completed: completedWaves,
      paused_wave_id: pausedWave?.id || null,
      executions_succeeded: allResults.filter((r) => r.status === 'completed').length,
      crashed: allResults.filter((r) => r.status === 'crashed').length,
      awaiting_workflow_gates: awaitingWorkflowGates,
    },
  });

  return {
    status: completed ? 'completed' : 'paused',
    waves: resolved.waves.length,
    waves_completed: completedWaves,
    paused_wave_id: pausedWave?.id || null,
    plan_workflow_id: planAuthority.workflow_id,
    awaiting_workflow_gates: awaitingWorkflowGates,
    results: allResults,
  };
}

module.exports = {
  runPlan,
  // exposed for targeted tests
  _internal: {
    runWave,
    runTask,
    resolvePlan,
    validatePlanShape,
    assertPlanAuthority,
    awaitExit,
    finalizeSession,
    taskDependenciesReady,
    recordExecutionFailure,
  },
};
