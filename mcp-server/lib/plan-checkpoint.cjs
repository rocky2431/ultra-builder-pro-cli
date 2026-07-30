'use strict';

const path = require('node:path');

const artifacts = require('./artifact-registry.cjs');
const changes = require('./change-workflow.cjs');
const ops = require('./state-ops.cjs');
const planStore = require('./plan-store.cjs');
const taskLedger = require('./task-ledger.cjs');

class PlanCheckpointError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'PlanCheckpointError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function publishPlan(db, {
  change_id: changeId,
  context,
} = {}, {
  rootDir = process.cwd(),
  markRecoveryRequired = null,
} = {}) {
  const change = changes.readChange(db, changeId);
  if (!change) {
    throw new PlanCheckpointError('CHANGE_NOT_FOUND', `change ${changeId} not found`);
  }
  if (change.status !== 'active') {
    throw new PlanCheckpointError(
      'CHANGE_NOT_MUTABLE',
      `change ${change.id} is ${change.status}`,
    );
  }
  const tasks = ops.listTasks(db, { change_id: change.id });
  if (tasks.length === 0) {
    throw new PlanCheckpointError('NO_TASKS', 'a Plan checkpoint requires at least one task');
  }
  if (!context?.id || !context?.artifact_path || !context?.digest) {
    throw new PlanCheckpointError(
      'PLAN_CONTEXT_REQUIRED',
      'a Plan checkpoint requires one canonical Context Envelope',
    );
  }

  const plan = planStore.buildPlan(tasks, { changeId: change.id });
  const publication = planStore.prepareChangePlanPublication(plan, {
    rootDir,
    change,
    tasks,
    context: {
      snapshot_id: context.id,
      manifest_path: context.artifact_path,
      manifest_digest: context.digest,
    },
  });
  const contextArtifact = db.prepare(
    `SELECT id FROM artifacts
     WHERE path = ? AND status <> 'archived'
     ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
  ).get(context.artifact_path);
  const artifactInputs = publication.artifacts.map(({ kind, path: file, digest }) => ({
    digest,
    input: {
      owner_type: 'change',
      owner_id: change.id,
      kind,
      path: path.relative(rootDir, file).split(path.sep).join('/'),
      source_refs: [
        { type: 'change', id: change.id, relation: 'planned_for' },
        ...(contextArtifact
          ? [{ type: 'artifact', id: contextArtifact.id, relation: 'compiled_from' }]
          : []),
        ...tasks.map((task) => ({
          type: 'task',
          id: task.id,
          relation: 'compiled_from_task_contract',
        })),
      ],
      consumer_refs: [{
        type: 'external',
        id: 'ultra-dev',
        relation: 'consumed_by',
      }],
      provenance: {
        writer: 'ultra.checkpoint',
        stage: 'plan',
        publication_transaction_id: publication.transaction_id,
      },
      metadata: {
        context_envelope_id: context.id,
        context_digest: context.digest,
        terminal_role: true,
      },
    },
  }));

  try {
    ops.tx(db, () => {
      const preflight = artifactInputs.map(({ input }) => (
        artifacts.preflightArtifactPublication(db, input, { rootDir })
      ));
      publication.publish();
      artifactInputs.forEach(({ input, digest }, index) => {
        artifacts.recordArtifactInTx(db, {
          ...input,
          id: preflight[index].artifact_id || undefined,
          expected_before_digest: preflight[index].expected_before_digest,
          content_digest: digest,
        }, { rootDir });
      });
      ops.appendEventInTx(db, {
        type: 'plan_checkpoint_published',
        change_id: change.id,
        payload: {
          context_envelope_id: context.id,
          context_digest: context.digest,
          plan_path: path.relative(rootDir, publication.plan_path).split(path.sep).join('/'),
          plan_md_path: path.relative(rootDir, publication.plan_md_path).split(path.sep).join('/'),
          publication_transaction_id: publication.transaction_id,
          wave_count: plan.waves.length,
        },
      });
    });
  } catch (error) {
    const rollback = publication.rollback();
    const failure = rollback?.rolled_back === false
      ? planStore.planRecoveryRequiredError(error, rollback, publication.transaction_id)
      : error;
    if (failure.code === 'PLAN_RECOVERY_REQUIRED') {
      markRecoveryRequired?.({
        recovered: 0,
        finalized: 0,
        pending: 1,
        issues: [failure.details?.rollback_issue || {
          code: failure.cause?.code || 'PLAN_RECOVERY_FAILED',
          message: failure.cause?.message || failure.message,
        }],
      });
    }
    throw failure;
  }

  try {
    publication.commit();
  } catch (error) {
    markRecoveryRequired?.({
      recovered: 0,
      finalized: 0,
      pending: 1,
      issues: [error.details?.issue || {
        code: error.cause?.code || 'PLAN_RECOVERY_FAILED',
        message: error.cause?.message || error.message,
      }],
    });
    throw error;
  }

  return {
    plan_path: path.relative(rootDir, publication.plan_path).split(path.sep).join('/'),
    plan_md_path: path.relative(rootDir, publication.plan_md_path).split(path.sep).join('/'),
    wave_count: plan.waves.length,
    task_count: tasks.length,
    task_contract_digests: Object.fromEntries(
      tasks.map((task) => [task.id, taskLedger.durableTask(task).digest]),
    ),
    context_envelope_id: context.id,
    context_digest: context.digest,
  };
}

module.exports = {
  PlanCheckpointError,
  publishPlan,
};
