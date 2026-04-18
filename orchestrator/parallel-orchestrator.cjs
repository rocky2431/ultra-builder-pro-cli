'use strict';

// Phase 8B.2 — Parallel orchestrator.
//
// Consumes an execution-plan.json (built by Phase 8A.4a plan-builder) and
// drives per-wave session spawning. Each wave is either parallel (batch
// Promise.all on proc exit) or serial (await per task) based on the
// file-overlap detection already done by plan-builder.
//
// Responsibilities:
//   • load plan (object or path)
//   • for each wave: evaluate dispatch-rules per task → spawn sessions via
//     session-runner → wait for exit → flip session status → task status
//   • emit wave_started / wave_completed / plan_completed events
//
// Not responsible for:
//   • circuit breaker (Phase 5.2 recordTaskFailure owns that path)
//   • worktree lifecycle beyond what session-runner already does
//   • merge back (Phase 8B.4 layers on top of closeSession)

const fs = require('node:fs');

const planStore = require('../mcp-server/lib/plan-store.cjs');
const ops = require('../mcp-server/lib/state-ops.cjs');
const runner = require('./session-runner.cjs');
const dispatchRules = require('./dispatch-rules.cjs');

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

function awaitExit(proc) {
  return new Promise((resolve) => {
    if (!proc) { resolve({ code: 0, signal: null }); return; }
    if (proc.exitCode !== null && proc.exitCode !== undefined) {
      resolve({ code: proc.exitCode, signal: proc.signalCode || null });
      return;
    }
    proc.on('exit', (code, signal) => resolve({ code: code === null ? -1 : code, signal }));
  });
}

function finalizeSession(db, handle, code, ctx = {}) {
  const sessionStatus = code === 0 ? 'completed' : 'crashed';
  // Task status: success → completed; failure → revert to pending so the
  // recovery layer (Phase 5.1) / circuit breaker can take over next tick.
  const taskStatus = code === 0 ? 'completed' : 'pending';
  try { ops.patchTask(db, handle.task_id, { status: taskStatus }); }
  catch (err) {
    process.stderr.write(`parallel-orchestrator: patchTask(${handle.task_id}→${taskStatus}) failed: ${err.message}\n`);
  }
  // closeSession flips session row status, removes worktree, and (opt-in)
  // runs auto-merge. For crashed sessions we skip auto-merge — there's
  // nothing to merge back from a broken run.
  let merge;
  try {
    const closeResult = runner.closeSession(
      { db, repoRoot: ctx.repoRoot, sid: handle.sid },
      {
        status: sessionStatus,
        autoMerge: !!ctx.autoMerge && sessionStatus === 'completed',
        mergeBaseBranch: ctx.mergeBaseBranch || 'main',
      },
    );
    merge = closeResult.merge;
  } catch (err) {
    process.stderr.write(`parallel-orchestrator: closeSession(${handle.sid}) failed: ${err.message}\n`);
  }
  return { sid: handle.sid, task_id: handle.task_id, code, status: sessionStatus, merge };
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
    if (onError) onError(err);
    return { sid: null, task_id: task.id, code: -3, status: 'spawn_failed' };
  }

  // Required transition: pending → in_progress before the child's exit may
  // flip it to completed. STATUS_TRANSITIONS forbids pending → completed.
  try { ops.patchTask(db, task.id, { status: 'in_progress' }); }
  catch (err) {
    process.stderr.write(`parallel-orchestrator: patchTask(${task.id}→in_progress) failed: ${err.message}\n`);
  }

  const { code } = await awaitExit(handle.process);
  return finalizeSession(db, handle, code, { ...ctx, repoRoot });
}

async function runWave(db, repoRoot, wave, ctx) {
  ops.appendEvent(db, {
    type: 'wave_started',
    payload: { wave_id: wave.id, tasks: wave.tasks, parallel: wave.parallel },
  });

  const tasks = wave.tasks
    .map((id) => ops.readTask(db, id))
    .filter((t) => {
      if (!t && ctx.onError) ctx.onError(new Error(`task not found in db (skipped)`));
      return !!t;
    });

  let results;
  if (wave.parallel && tasks.length > 1) {
    results = await Promise.all(tasks.map((task) => runTask(db, repoRoot, task, wave, ctx)));
  } else {
    results = [];
    for (const task of tasks) {
      results.push(await runTask(db, repoRoot, task, wave, ctx));
    }
  }

  ops.appendEvent(db, {
    type: 'wave_completed',
    payload: {
      wave_id: wave.id,
      completed: results.filter((r) => r.status === 'completed').length,
      crashed: results.filter((r) => r.status === 'crashed').length,
      deferred: results.filter((r) => r.status === 'defer' || r.status === 'block').length,
    },
  });
  return results;
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
  const resolved = resolvePlan({ plan, planPath, repoRoot });

  const ctx = {
    runtimes, command, commandArgs, commandArgsFor, onError,
    autoMerge, mergeBaseBranch,
  };
  const allResults = [];
  for (const wave of resolved.waves) {
    const results = await runWave(db, repoRoot, wave, ctx);
    allResults.push(...results);
  }

  ops.appendEvent(db, {
    type: 'plan_completed',
    payload: {
      waves: resolved.waves.length,
      completed: allResults.filter((r) => r.status === 'completed').length,
      crashed: allResults.filter((r) => r.status === 'crashed').length,
    },
  });

  return { waves: resolved.waves.length, results: allResults };
}

module.exports = {
  runPlan,
  // exposed for targeted tests
  _internal: { runWave, runTask, resolvePlan, awaitExit, finalizeSession },
};
