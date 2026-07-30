'use strict';

const path = require('node:path');

const ops = require('./state-ops.cjs');
const baselines = require('./baseline-workflow.cjs');
const changes = require('./change-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const doctor = require('./doctor.cjs');
const taskLedger = require('./task-ledger.cjs');

const PUBLIC_TOOLS = Object.freeze([
  'ultra.context',
  'ultra.record',
  'ultra.checkpoint',
  'ultra.sync',
  'ultra.session',
  'ultra.archive',
  'ultra.doctor',
]);

const RECORD_OPERATIONS = new Set([
  'task.init_project',
  'task.create',
  'task.update',
  'task.delete',
  'task.append_event',
  'baseline.start',
  'baseline.record',
  'baseline.converge',
  'change.create',
  'change.update',
  'change.delta',
  'change.documentation_reconcile',
  'change.context',
  'change.learning_propose',
  'change.learning_resolve',
  'decision.thread_start',
  'decision.open',
  'decision.resolve',
  'decision.delegate',
  'decision.defer',
  'decision.supersede',
  'decision.complete',
  'decision.checkpoint',
  'artifact.record',
]);

const STAGE_CONTEXT = Object.freeze({
  plan: { role: 'plan', gate: 'planning' },
  dev: { role: 'implement', gate: 'implementation' },
  test: { role: 'check', gate: 'verification' },
  review: { role: 'review', gate: 'review' },
  deliver: { role: 'check', gate: 'convergence' },
});

const HARD_ERROR_CODES = new Set([
  'STATE_CORRUPT',
  'STATE_DB_ERROR',
  'STATE_DB_MISSING',
  'SCHEMA_VERSION_MISMATCH',
  'PATH_AUTHORITY_VIOLATION',
  'ARCHIVE_PATH_UNSAFE',
  'ARCHIVE_RUNTIME_UNAVAILABLE',
  'PLAN_RECOVERY_REQUIRED',
  'BACKUP_FAILED',
  'OUTPUT_SCHEMA_DRIFT',
]);

function parseJson(value, fallback = null) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function errorCode(error) {
  return String(error?.code || error?.name || 'CHECKPOINT_REJECTED');
}

function isHardError(error) {
  const code = errorCode(error);
  return HARD_ERROR_CODES.has(code)
    || code.startsWith('PATH_')
    || code.startsWith('STATE_CORRUPT')
    || code.startsWith('SQLITE_');
}

function priorFacadeResult(db, idempotencyKey, operation = null) {
  if (!idempotencyKey) return null;
  const rows = db.prepare(
    `SELECT payload_json FROM events
     WHERE type = 'ultra_facade_call'
     ORDER BY id DESC LIMIT 2000`,
  ).all();
  for (const row of rows) {
    const payload = parseJson(row.payload_json, {});
    if (payload.idempotency_key === idempotencyKey
      && (operation === null || payload.operation === operation)
      && payload.accepted === true) {
      return payload.result;
    }
  }
  return null;
}

function rememberFacadeResult(db, {
  idempotencyKey,
  operation,
  result,
  changeId = null,
  taskId = null,
}) {
  ops.appendEvent(db, {
    type: 'ultra_facade_call',
    change_id: changeId,
    task_id: taskId,
    payload: {
      idempotency_key: idempotencyKey,
      operation,
      accepted: true,
      result,
    },
  });
}

function currentBaselineId(db) {
  return db.prepare(
    `SELECT id FROM baselines
     WHERE status <> 'superseded'
     ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
  ).get()?.id || null;
}

function currentWorkflow(db, stage, scope = {}, rootDir) {
  return workflows.listWorkflows(db, {
    kind: stage,
    change_id: scope.change_id || null,
    task_id: scope.task_id || null,
    limit: 100,
  }, { rootDir }).find((run) => ['active', 'blocked', 'ready'].includes(run.status)) || null;
}

function ensureWorkflow(db, stage, scope = {}, payload = {}, rootDir) {
  const existing = currentWorkflow(db, stage, scope, rootDir);
  if (existing) return existing;
  const input = {
    kind: stage,
    subject: typeof payload.subject === 'string' && payload.subject.trim()
      ? payload.subject.trim()
      : `Record the ${stage} stage for ${scope.task_id || scope.change_id || 'this project'}.`,
    baseline_id: currentBaselineId(db),
    change_id: scope.change_id || undefined,
    task_id: scope.task_id || undefined,
    metadata: { public_facade: true },
  };
  if (stage === 'research') {
    input.mode = payload.mode || 'custom';
    if (payload.coverage !== undefined) input.coverage = payload.coverage;
    if (payload.selected_steps !== undefined) input.selected_steps = payload.selected_steps;
  }
  return workflows.startWorkflow(db, input, { rootDir });
}

function contextOutput(compiled, rootDir) {
  return {
    path: path.relative(rootDir, compiled.context_manifest_path).split(path.sep).join('/'),
    kind: 'context-manifest',
  };
}

function compileStageContext(db, stage, scope, input, rootDir) {
  const expectation = STAGE_CONTEXT[stage];
  if (!expectation || !scope.change_id) return null;
  return changes.compileContext(db, {
    id: scope.change_id,
    task_id: scope.task_id,
    role: expectation.role,
    gate: expectation.gate,
    ...(Array.isArray(input.context_refs) ? { context_refs: input.context_refs } : {}),
    ...(input.budget && typeof input.budget === 'object' ? { budget: input.budget } : {}),
  }, { rootDir });
}

function readContext(db, input = {}, { rootDir = process.cwd() } = {}) {
  const stage = input.stage || 'project';
  const scope = input.scope || {};
  const health = doctor.inspectSystem(db, { rootDir });
  const baseline = baselines.inspectBaseline(db, { rootDir });
  const project = {
    health: health.status,
    baseline,
    changes: changes.listChanges(db, { limit: input.detail === 'full' ? 500 : 20 }),
    tasks: ops.listTasks(db, { status: 'any', limit: input.detail === 'full' ? 1000 : 100 }),
    workflows: workflows.listWorkflows(
      db,
      { limit: input.detail === 'full' ? 500 : 50 },
      { rootDir },
    ),
    team_checkpoint: taskLedger.inspectTaskLedger(db, { rootDir }),
  };
  const expectation = STAGE_CONTEXT[stage];
  const snapshot = expectation && scope.change_id
    ? db.prepare(
      `SELECT * FROM context_snapshots
       WHERE change_id = ? AND (? IS NULL OR task_id = ?)
         AND role = ? AND gate = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(
      scope.change_id,
      scope.task_id || null,
      scope.task_id || null,
      expectation.role,
      expectation.gate,
    )
    : null;
  const context = snapshot
    ? {
      snapshot_id: snapshot.id,
      manifest_path: snapshot.manifest_path,
      manifest_hash: snapshot.manifest_hash,
      readiness: snapshot.readiness,
      blockers: parseJson(snapshot.blockers_json, []),
      spine: parseJson(snapshot.context_json, {}),
    }
    : null;
  return {
    status: context?.readiness
      || (health.status === 'healthy' ? 'ready' : 'needs_attention'),
    warnings: baseline.warnings || [],
    blockers: [...new Set([
      ...(baseline.blockers || []),
      ...(context?.blockers || []),
    ])],
    project,
    workflow: expectation ? currentWorkflow(db, stage, scope, rootDir) : null,
    context,
  };
}

async function record(db, input = {}, {
  rootDir = process.cwd(),
  callLegacy,
} = {}) {
  const results = [];
  for (const entry of input.entries || []) {
    const cached = db
      ? priorFacadeResult(db, entry.idempotency_key, entry.operation)
      : null;
    if (cached) {
      results.push({ operation: entry.operation, accepted: true, idempotent: true, result: cached });
      continue;
    }
    if (entry.operation === 'workflow.abandon') {
      try {
        const result = workflows.abandonWorkflow(db, entry.data, { rootDir });
        rememberFacadeResult(db, {
          idempotencyKey: entry.idempotency_key,
          operation: entry.operation,
          result,
          changeId: result.change_id,
          taskId: result.task_id,
        });
        results.push({ operation: entry.operation, accepted: true, idempotent: false, result });
      } catch (error) {
        if (isHardError(error)) throw error;
        results.push({
          operation: entry.operation,
          accepted: false,
          mutable: true,
          blockers: [errorCode(error)],
          diagnostic: { code: errorCode(error), message: error.message },
        });
      }
      continue;
    }
    if (entry.operation === 'event.append') {
      const event = ops.appendEvent(db, entry.data);
      rememberFacadeResult(db, {
        idempotencyKey: entry.idempotency_key,
        operation: entry.operation,
        result: event,
        changeId: entry.data.change_id || null,
        taskId: entry.data.task_id || null,
      });
      results.push({ operation: entry.operation, accepted: true, idempotent: false, result: event });
      continue;
    }
    if (!RECORD_OPERATIONS.has(entry.operation)) {
      results.push({
        operation: entry.operation,
        accepted: false,
        mutable: true,
        blockers: ['ULTRA_RECORD_OPERATION_UNSUPPORTED'],
      });
      continue;
    }
    try {
      const result = await callLegacy(entry.operation, entry.data);
      if (db) {
        rememberFacadeResult(db, {
          idempotencyKey: entry.idempotency_key,
          operation: entry.operation,
          result,
          changeId: entry.data.change_id || entry.data.id || null,
          taskId: entry.data.task_id || null,
        });
      }
      results.push({ operation: entry.operation, accepted: true, idempotent: false, result });
    } catch (error) {
      if (isHardError(error)) throw error;
      results.push({
        operation: entry.operation,
        accepted: false,
        mutable: true,
        blockers: [errorCode(error)],
        diagnostic: { code: errorCode(error), message: error.message, details: error.details },
      });
    }
  }
  return {
    accepted: results.every((item) => item.accepted),
    mutable: true,
    results,
  };
}

function addStepOutput(steps, stepId, output) {
  const current = steps.find((step) => step.step_id === stepId);
  if (current) current.outputs = [...(current.outputs || []), output];
  else steps.push({ step_id: stepId, outputs: [output] });
}

function checkpointOutputStep(stage, output) {
  if (output.step_id) return output.step_id;
  if (stage === 'test') return 'write-report';
  if (stage === 'deliver') return 'verify-delivery';
  if (stage === 'review') {
    if (output.role === 'spec_review') return 'review-specification';
    if (output.role === 'engineering_review') return 'review-engineering';
    return 'coordinate-findings';
  }
  return null;
}

async function checkpoint(db, input = {}, {
  rootDir = process.cwd(),
  callLegacy,
} = {}) {
  const cached = priorFacadeResult(db, input.idempotency_key, `checkpoint:${input.stage}`);
  if (cached) return { ...cached, idempotent: true };
  const stage = input.stage;
  const scope = input.scope || {};
  const payload = input.payload || {};
  let run = null;
  try {
    if (stage === 'plan') {
      const taskCount = ops.listTasks(db, { change_id: scope.change_id }).length;
      if (taskCount === 0) {
        return {
          accepted: false,
          mutable: true,
          blockers: ['WORKFLOW_TASKS_REQUIRED'],
          workflow: null,
        };
      }
    }
    run = ensureWorkflow(db, stage, scope, payload, rootDir);
    const steps = Array.isArray(payload.steps)
      ? payload.steps.map((step) => ({ ...step }))
      : [];
    const compiled = STAGE_CONTEXT[stage]
      ? compileStageContext(db, stage, scope, payload, rootDir)
      : null;
    if (compiled) {
      addStepOutput(
        steps,
        stage === 'deliver' ? 'verify-candidate' : 'compile-context',
        contextOutput(compiled, rootDir),
      );
    }
    let stageResult = null;
    if (stage === 'plan') {
      stageResult = await callLegacy('plan.export', { change_id: scope.change_id });
      addStepOutput(steps, 'verify-plan', {
        path: path.relative(rootDir, stageResult.plan_path).split(path.sep).join('/'),
        kind: 'execution-plan',
      });
    }
    for (const output of Array.isArray(payload.outputs) ? payload.outputs : []) {
      const stepId = checkpointOutputStep(stage, output);
      if (!stepId) continue;
      const { step_id: _stepId, role: _role, ...normalized } = output;
      addStepOutput(steps, stepId, normalized);
    }
    const prepared = workflows.prepareWorkflowCheckpoint(db, {
      id: run.id,
      steps,
      evidence: payload.evidence,
    }, { rootDir });
    if (!prepared.ready) {
      return {
        accepted: false,
        mutable: true,
        blockers: prepared.blockers,
        workflow: prepared.workflow,
      };
    }
    const completed = workflows.completeWorkflow(db, {
      id: run.id,
      ...(payload.approval ? { approval: payload.approval } : {}),
    }, { rootDir });
    if (stage === 'plan') {
      stageResult = {
        ...stageResult,
        team_checkpoint: taskLedger.publishTaskLedger(db, {
          rootDir,
          reason: 'plan_accepted',
        }),
      };
    }
    const result = {
      accepted: true,
      mutable: false,
      blockers: [],
      workflow: completed,
      result: stageResult,
      idempotent: false,
    };
    rememberFacadeResult(db, {
      idempotencyKey: input.idempotency_key,
      operation: `checkpoint:${stage}`,
      result,
      changeId: scope.change_id || null,
      taskId: scope.task_id || null,
    });
    ops.appendEvent(db, {
      type: 'ultra_checkpoint_accepted',
      change_id: scope.change_id || null,
      task_id: scope.task_id || null,
      payload: { stage, workflow_id: completed.id, idempotency_key: input.idempotency_key },
    });
    return result;
  } catch (error) {
    if (isHardError(error)) throw error;
    if (run?.id) {
      workflows.reopenWorkflowDraft(db, {
        id: run.id,
        blocker: errorCode(error),
      }, { rootDir });
    }
    ops.appendEvent(db, {
      type: 'ultra_checkpoint_rejected',
      change_id: scope.change_id || null,
      task_id: scope.task_id || null,
      payload: {
        stage,
        workflow_id: run?.id || null,
        code: errorCode(error),
        idempotency_key: input.idempotency_key,
      },
    });
    return {
      accepted: false,
      mutable: true,
      blockers: [errorCode(error)],
      workflow: run?.id ? workflows.readWorkflow(db, run.id, { rootDir }) : null,
      diagnostic: { code: errorCode(error), message: error.message, details: error.details },
    };
  }
}

function sync(db, input = {}, { rootDir = process.cwd() } = {}) {
  if (input.action === 'inspect') return taskLedger.inspectTaskLedger(db, { rootDir });
  if (input.action === 'import') return taskLedger.importTaskLedger(db, { rootDir });
  const cached = priorFacadeResult(db, input.idempotency_key, 'sync:publish');
  if (cached) return { ...cached, idempotent: true };
  const result = taskLedger.publishTaskLedger(db, {
    rootDir,
    reason: input.reason || 'manual_checkpoint',
  });
  if (input.idempotency_key) {
    rememberFacadeResult(db, {
      idempotencyKey: input.idempotency_key,
      operation: 'sync:publish',
      result,
    });
  }
  return result;
}

async function session(db, input = {}, { callLegacy } = {}) {
  const scope = input.scope || {};
  const payload = input.payload || {};
  const operation = {
    admission: 'session.admission_check',
    acquire: 'session.spawn',
    get: 'session.get',
    list: 'session.list',
    heartbeat: 'session.heartbeat',
    release: 'session.close',
  }[input.action];
  const args = {
    ...payload,
    ...(scope.task_id ? { task_id: scope.task_id } : {}),
    ...(scope.sid ? { sid: scope.sid } : {}),
  };
  if (input.action === 'release' && args.status === undefined) args.status = 'completed';
  return callLegacy(operation, args);
}

async function archive(db, input = {}, {
  rootDir = process.cwd(),
  callLegacy,
} = {}) {
  const cached = priorFacadeResult(db, input.idempotency_key, 'archive');
  if (cached) return { ...cached, idempotent: true };
  const payload = input.payload || {};
  let run = null;
  try {
    run = ensureWorkflow(
      db,
      'deliver',
      { change_id: input.change_id },
      payload,
      rootDir,
    );
    const steps = Array.isArray(payload.steps)
      ? payload.steps.map((step) => ({ ...step }))
      : [];
    const compiled = compileStageContext(
      db,
      'deliver',
      { change_id: input.change_id },
      payload,
      rootDir,
    );
    if (compiled) {
      addStepOutput(steps, 'verify-candidate', contextOutput(compiled, rootDir));
    }
    for (const output of Array.isArray(payload.outputs) ? payload.outputs : []) {
      const stepId = checkpointOutputStep('deliver', output);
      if (!stepId) continue;
      const { step_id: _stepId, role: _role, ...normalized } = output;
      addStepOutput(steps, stepId, normalized);
    }
    const prepared = workflows.prepareWorkflowCheckpoint(db, {
      id: run.id,
      steps,
      evidence: payload.evidence,
    }, { rootDir });
    if (!prepared.ready) {
      return {
        accepted: false,
        mutable: true,
        blockers: prepared.blockers,
        workflow: prepared.workflow,
      };
    }
    const convergence = await callLegacy('change.converge', { id: input.change_id });
    if (convergence.ready !== true) {
      workflows.reopenWorkflowDraft(db, {
        id: run.id,
        blocker: 'CHANGE_NOT_READY',
      }, { rootDir });
      return {
        accepted: false,
        mutable: true,
        blockers: convergence.blockers || ['CHANGE_NOT_READY'],
        convergence,
      };
    }
    const {
      steps: _steps,
      outputs: _outputs,
      evidence: _evidence,
      context_refs: _contextRefs,
      budget: _budget,
      ...archivePayload
    } = payload;
    const result = await callLegacy('change.archive', {
      id: input.change_id,
      ...archivePayload,
    });
    const completed = workflows.completeWorkflow(db, { id: run.id }, { rootDir });
    const output = {
      accepted: true,
      mutable: false,
      blockers: [],
      workflow: completed,
      result,
      idempotent: false,
    };
    rememberFacadeResult(db, {
      idempotencyKey: input.idempotency_key,
      operation: 'archive',
      result: output,
      changeId: input.change_id,
    });
    return output;
  } catch (error) {
    if (isHardError(error)) throw error;
    if (run?.id) {
      workflows.reopenWorkflowDraft(db, {
        id: run.id,
        blocker: errorCode(error),
      }, { rootDir });
    }
    return {
      accepted: false,
      mutable: true,
      blockers: [errorCode(error)],
      diagnostic: { code: errorCode(error), message: error.message, details: error.details },
    };
  }
}

async function dispatch(name, input, db, context = {}) {
  if (name === 'ultra.context') return readContext(db, input, context);
  if (name === 'ultra.record') return record(db, input, context);
  if (name === 'ultra.checkpoint') return checkpoint(db, input, context);
  if (name === 'ultra.sync') return sync(db, input, context);
  if (name === 'ultra.session') return session(db, input, context);
  if (name === 'ultra.archive') return archive(db, input, context);
  if (name === 'ultra.doctor') {
    return doctor.runDoctor(db, {
      rootDir: context.rootDir || process.cwd(),
      repair: input.repair === true,
      project: context.projector,
    });
  }
  const error = new Error(`unhandled public tool ${name}`);
  error.code = 'UNKNOWN_TOOL';
  throw error;
}

module.exports = {
  PUBLIC_TOOLS,
  RECORD_OPERATIONS,
  dispatch,
  readContext,
  record,
  checkpoint,
  sync,
  session,
  archive,
  isHardError,
};
