'use strict';

// Phase 8B.2 — Parallel orchestrator.
//
// Consumes the current Change-scoped plan.json (published by a Plan checkpoint) and
// drives resumable per-wave session spawning. Each wave is either parallel
// (batch Promise.all on proc exit) or serial (await per task) based on the
// file-overlap detection already done by plan-builder.
//
// Responsibilities:
//   • resolve the canonical accepted Change plan
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
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const planStore = require('../mcp-server/lib/plan-store.cjs');
const ops = require('../mcp-server/lib/state-ops.cjs');
const checkpoints = require('../mcp-server/lib/stage-checkpoints.cjs');
const workerPackets = require('../mcp-server/lib/worker-packet.cjs');
const runner = require('./session-runner.cjs');
const dispatchRules = require('./dispatch-rules.cjs');

const TERMINAL_TASK_STATUSES = new Set(['completed', 'expanded']);

function resolvePlan({ db, plan, planPath, repoRoot, changeId = null }) {
  if (plan) {
    if (!plan.change_id) {
      throw planError(
        'PLAN_CHANGE_SCOPED_REQUIRED',
        'orchestrator execution requires an accepted Change-scoped Plan checkpoint',
      );
    }
    return plan;
  }
  if (planPath) {
    throw planError(
      'PLAN_LEGACY_RETIRED',
      'explicit planPath execution is retired; migrate the project and use its accepted Change Plan',
    );
  }
  let candidates;
  if (changeId) {
    candidates = db.prepare(
      `SELECT id, artifact_root, status
       FROM changes
       WHERE id = ? AND status = 'active'`,
    ).all(changeId);
  } else {
    candidates = db.prepare(
      `SELECT id, artifact_root, status
       FROM changes WHERE status = 'active' ORDER BY updated_at DESC, id ASC`,
    ).all().filter((candidate) => checkpoints.currentCheckpoint(
      db,
      'plan',
      { change_id: candidate.id },
      { includeDraft: false },
    ));
  }
  if (candidates.length > 1) {
    throw planError(
      'PLAN_CHANGE_REQUIRED',
      'more than one current Change has an executable plan; provide changeId',
      { change_ids: candidates.map((candidate) => candidate.id).sort() },
    );
  }
  const change = candidates[0] || null;
  const loaded = change
    ? planStore.loadChangePlanArtifact(repoRoot, change, { db, strict: true })
    : null;
  if (!loaded) {
    const err = new Error(
      changeId
        ? `runPlan: no current scoped plan found for change ${changeId}`
        : 'runPlan: no current accepted Change-scoped Plan found',
    );
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
    throw planError(
      'PLAN_CHANGE_SCOPED_REQUIRED',
      'orchestrator execution requires an accepted Change-scoped Plan checkpoint',
    );
  }
  if (taskChangeIds.size > 1 || (taskChangeIds.size === 1 && !taskChangeIds.has(plan.change_id))) {
    throw planError(
      'PLAN_CHANGE_MISMATCH',
      `execution plan ${plan.change_id} contains tasks owned by another change`,
      { task_change_ids: [...taskChangeIds].sort() },
    );
  }

  const currentPlan = checkpoints.currentCheckpoint(
    db,
    'plan',
    { change_id: plan.change_id },
    { includeDraft: false },
  );
  if (!currentPlan || checkpoints.checkpointDigest(currentPlan) !== currentPlan.digest) {
    throw planError(
      'PLAN_NOT_COMPLETED',
      `change ${plan.change_id} has no current accepted Plan checkpoint`,
    );
  }
  const context = currentPlan.context_envelope_id
    ? db.prepare('SELECT * FROM context_envelopes WHERE id = ?')
      .get(currentPlan.context_envelope_id)
    : null;
  if (!context || context.stage !== 'plan' || context.scope_type !== 'change'
      || context.scope_id !== plan.change_id) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} is not bound to its Context Envelope`,
      { authority_code: 'PLAN_CONTEXT_MISMATCH' },
    );
  }
  let contextPayload;
  try {
    contextPayload = JSON.parse(context.payload_json);
  } catch {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} has a corrupt Context Envelope`,
      { authority_code: 'PLAN_CONTEXT_INVALID' },
    );
  }
  const baseline = db.prepare(
    `SELECT scope_json FROM baselines
     WHERE status <> 'superseded' ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
  ).get();
  const scope = baseline
    ? JSON.parse(baseline.scope_json || '["."]')
    : ['.'];
  const currentCheckout = require('../mcp-server/lib/baseline-workflow.cjs')
    .gitWorktreeSnapshot(repoRoot, scope);
  const plannedWorktreeDigest = contextPayload.git?.scoped_worktree_digest
    || contextPayload.git?.worktree_digest
    || null;
  if (plannedWorktreeDigest && currentCheckout.digest !== plannedWorktreeDigest) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} no longer matches the scoped checkout`,
      {
        authority_code: 'PLAN_CONTEXT_STALE',
        blockers: ['CONTEXT_WORKTREE_STALE'],
      },
    );
  }
  const staleTasks = taskRows.filter((task) => task.stale);
  if (staleTasks.length > 0) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} contains stale task contracts`,
      {
        authority_code: 'PLAN_TASK_CONTRACT_STALE',
        task_ids: staleTasks.map((task) => task.id),
      },
    );
  }
  const expected = planStore.buildPlan(taskRows, { changeId: plan.change_id });
  const { context: planContext, ...planCore } = plan;
  if (!isDeepStrictEqual(planCore, expected)) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} does not match the current DB task graph`,
    );
  }
  if (!planContext
    || planContext.snapshot_id !== context.id
    || planContext.manifest_path !== context.artifact_path
    || planContext.manifest_digest !== context.digest) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} does not match its planning context`,
      { authority_code: 'PLAN_CONTEXT_MISMATCH' },
    );
  }
  const change = db.prepare(
    'SELECT id, artifact_root FROM changes WHERE id = ?',
  ).get(plan.change_id);
  const canonicalPaths = planStore.changePlanPaths(repoRoot, change);
  const expectedPlanPath = path.relative(repoRoot, canonicalPaths.json);
  const expectedPlanMdPath = path.relative(repoRoot, canonicalPaths.md);
  const canonicalPlan = planStore.loadChangePlanArtifact(
    repoRoot,
    change,
    { db, strict: true },
  );
  if (!canonicalPlan || !isDeepStrictEqual(canonicalPlan, plan)) {
    throw planError(
      'PLAN_STALE',
      `execution plan for ${plan.change_id} differs from its canonical Change artifact`,
    );
  }
  return { mode: 'current-change', checkpoint_id: currentPlan.id };
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

function authorityBlockedResult(error, taskId, {
  sid = null,
  reservationFailed = false,
} = {}) {
  const gate = runner.findExpectedExecutionGate(error);
  if (!gate) return null;
  return {
    sid,
    task_id: taskId,
    code: -4,
    status: 'authority_blocked',
    retryable: true,
    authority_code: gate.code,
    error: error.message,
    ...(Array.isArray(gate.details?.blockers)
      ? { blockers: gate.details.blockers }
      : {}),
    ...(reservationFailed ? { _reservationFailed: true } : {}),
  };
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

function prepareTaskDispatch(task, wave, ctx) {
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
    return {
      task,
      result: { sid: null, task_id: task.id, code: -2, status: decision.action },
    };
  }

  const args = commandArgsFor ? commandArgsFor(task) : commandArgs;
  if (!Array.isArray(args)) {
    throw planError(
      'ORCHESTRATOR_COMMAND_INVALID',
      `task ${task.id} command arguments must be an array`,
    );
  }
  return { task, decision, command, args };
}

function reservePreparedTask(db, repoRoot, prepared, ctx) {
  if (prepared.result) return prepared.result;
  const {
    task, decision, command, args,
  } = prepared;
  const { onError } = ctx;
  let handle;
  let packet = null;
  try {
    if (!task.change_id) {
      throw planError(
        'TASK_CHANGE_REQUIRED',
        `orchestrator task ${task.id} must belong to the accepted Change`,
      );
    }
    packet = workerPackets.createWorkerPacket(db, {
      role: 'implement',
      task_id: task.id,
      runtime: decision.runtime,
      output_path: `.ultra/changes/active/${task.change_id}/delivery/${task.id}-outcome.json`,
      output_schema: {
        type: 'object',
        required: ['packet_digest'],
        properties: {
          packet_digest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        },
      },
    }, { rootDir: repoRoot });
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: task.id,
      runtime: decision.runtime,
      command: ctx.deferStart ? null : command,
      args: ctx.deferStart ? [] : args,
      mark_task_started: true,
      kernel_mode: true,
      packet_digest: packet.packet_digest,
    });
    handle.task_id = task.id;
    workerPackets.markWorkerPacketAssigned(db, packet.id);
    handle.packet = packet;
  } catch (err) {
    if (packet?.id) {
      workerPackets.abandonWorkerPacket(db, packet.id, err.code || err.message);
    }
    const authorityBlocked = authorityBlockedResult(err, task.id, {
      reservationFailed: true,
    });
    if (authorityBlocked) return authorityBlocked;
    if (onError) onError(err);
    recordExecutionFailure(db, task.id, {
      reason: `worker session could not be created: ${err.message}`,
    });
    return {
      sid: null,
      task_id: task.id,
      code: -3,
      status: 'spawn_failed',
      error: err.message,
      _reservationFailed: true,
    };
  }

  return {
    _pendingStart: true,
    handle,
    command,
    args,
  };
}

async function runTask(db, repoRoot, task, wave, ctx) {
  const prepared = ctx.prepared || prepareTaskDispatch(task, wave, ctx);
  const reservation = reservePreparedTask(db, repoRoot, prepared, ctx);
  if (!reservation?._pendingStart) return reservation;
  const { handle } = reservation;
  if (!handle.process) {
    handle.process = runner.startSessionProcess({
      db,
      repoRoot,
      sid: handle.sid,
      command: reservation.command,
      args: reservation.args,
    });
    handle.pid = handle.process.pid;
  }
  const execution = await awaitExit(handle.process);
  if (ctx.deferFinalize) {
    return { _pendingFinalize: true, handle, execution };
  }
  return finalizeSession(db, handle, execution, { ...ctx, repoRoot });
}

function unwindReservations(db, repoRoot, reservations, ctx) {
  const errors = [];
  for (const reservation of [...reservations].reverse()) {
    if (!reservation?._pendingStart) continue;
    const { handle } = reservation;
    try {
      runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'crashed', remove_worktree: true },
      );
    } catch (error) {
      errors.push(error);
      if (ctx.onError) ctx.onError(error);
      continue;
    }
    const task = ops.readTask(db, handle.task_id);
    if (task?.status === 'in_progress') {
      try {
        ops.updateTaskStatus(db, handle.task_id, 'pending');
      } catch (error) {
        errors.push(error);
        if (ctx.onError) ctx.onError(error);
      }
    }
  }
  if (errors.length > 0) {
    throw planError(
      'WAVE_RESERVATION_ROLLBACK_FAILED',
      `parallel wave reservation rollback failed: ${errors.map((error) => error.message).join('; ')}`,
    );
  }
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
  // Pure preparation must finish for the whole wave before any reservation
  // mutates tasks, sessions, or worktrees.
  const prepared = runnable.map((task) => prepareTaskDispatch(task, wave, ctx));

  if (prepared.length > 0) {
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
    const reservations = [];
    let reservationFailure = null;
    for (const item of prepared) {
      const reservation = reservePreparedTask(db, repoRoot, item, {
        ...ctx,
        deferStart: true,
        deferFinalize: true,
      });
      reservations.push(reservation);
      if (reservation?._reservationFailed) {
        reservationFailure = reservation;
        break;
      }
    }
    if (reservationFailure) {
      unwindReservations(db, repoRoot, reservations, ctx);
      results = reservations.map((reservation) => (
        reservation?._pendingStart
          ? {
            sid: reservation.handle.sid,
            task_id: reservation.handle.task_id,
            code: -5,
            status: 'reservation_cancelled',
          }
          : reservation
      ));
    } else {
      const executions = await Promise.all(reservations.map(async (reservation) => {
        if (!reservation?._pendingStart) return reservation;
        const { handle } = reservation;
        try {
          handle.process = runner.startSessionProcess({
            db,
            repoRoot,
            sid: handle.sid,
            command: reservation.command,
            args: reservation.args,
          });
          handle.pid = handle.process.pid;
          const execution = await awaitExit(handle.process);
          return { _pendingFinalize: true, handle, execution };
        } catch (error) {
          const authorityBlocked = authorityBlockedResult(
            error,
            handle.task_id,
            { sid: handle.sid },
          );
          if (authorityBlocked) {
            unwindReservations(db, repoRoot, [reservation], ctx);
            return authorityBlocked;
          }
          if (ctx.onError) ctx.onError(error);
          recordExecutionFailure(db, handle.task_id, {
            sessionId: handle.sid,
            reason: `worker process could not be started: ${error.message}`,
          });
          return finalizeSession(
            db,
            handle,
            { code: -1, signal: null, error },
            { ...ctx, repoRoot },
          );
        }
      }));
      // Parallel execution completes in parallel; settlement is serialized
      // only after every worker exit has been observed.
      results = executions.map((result) => (
        result?._pendingFinalize
          ? finalizeSession(db, result.handle, result.execution, { ...ctx, repoRoot })
          : result
      ));
    }
  } else {
    results = [];
    for (const item of prepared) {
      results.push(await runTask(db, repoRoot, item.task, wave, {
        ...ctx,
        prepared: item,
      }));
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
  db, repoRoot, plan, planPath, changeId = null,
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
  const resolved = validatePlanShape(resolvePlan({
    db, plan, planPath, repoRoot, changeId,
  }));
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
    plan_checkpoint_id: planAuthority.checkpoint_id || null,
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
    prepareTaskDispatch,
    reservePreparedTask,
    unwindReservations,
  },
};
