'use strict';

const fs = require('node:fs');
const path = require('node:path');

const artifactRegistry = require('./artifact-registry.cjs');
const baselines = require('./baseline-workflow.cjs');
const changes = require('./change-workflow.cjs');
const contextEnvelope = require('./context-envelope.cjs');
const decisionRecords = require('./decision-records.cjs');
const doctor = require('./doctor.cjs');
const gitBootstrap = require('./git-bootstrap.cjs');
const { initProject } = require('./init-project.cjs');
const ops = require('./state-ops.cjs');
const planCheckpoint = require('./plan-checkpoint.cjs');
const { readStableProjectFile } = require('./safe-project-file.cjs');
const stageCheckpoints = require('./stage-checkpoints.cjs');
const taskLedger = require('./task-ledger.cjs');
const workerPacket = require('./worker-packet.cjs');
const sessionRunner = require('../../orchestrator/session-runner.cjs');

const PUBLIC_TOOLS = Object.freeze([
  'ultra.context',
  'ultra.record',
  'ultra.checkpoint',
  'ultra.sync',
  'ultra.session',
  'ultra.archive',
  'ultra.doctor',
]);

const RECORD_KINDS = Object.freeze([
  'baseline',
  'change_contract',
  'decision',
  'task_contract',
  'task_outcome',
  'artifact',
  'event',
]);

const HARD_ERROR_CODES = new Set([
  'ARCHIVE_PATH_UNSAFE',
  'ARCHIVE_RECOVERY_REQUIRED',
  'ARCHIVE_RUNTIME_UNAVAILABLE',
  'BACKUP_FAILED',
  'CHECKPOINT_DIGEST_MISMATCH',
  'CONTEXT_ENVELOPE_LIMIT_EXCEEDED',
  'CONTEXT_ENVELOPE_DIGEST_MISMATCH',
  'CONTEXT_ENVELOPE_FILE_DRIFT',
  'DECISION_DIGEST_MISMATCH',
  'DECISION_FILE_DRIFT',
  'DECISION_ID_CONFLICT',
  'DECISION_SCOPE_CONFLICT',
  'OUTPUT_SCHEMA_DRIFT',
  'PATH_AUTHORITY_VIOLATION',
  'PLAN_RECOVERY_REQUIRED',
  'RUNTIME_ABI_MISMATCH',
  'RUNTIME_NATIVE_MISSING',
  'SCHEMA_VERSION_MISMATCH',
  'SESSION_STATUS_CONFLICT',
  'STATE_CORRUPT',
  'STATE_DB_ERROR',
  'STATE_DB_MISSING',
  'TASK_LEDGER_BASELINE_CONFLICT',
  'TASK_LEDGER_CHANGE_CONFLICT',
  'TASK_LEDGER_HISTORY_CONFLICT',
  'TASK_LEDGER_TASK_CONFLICT',
  'WORKER_PACKET_DIGEST_MISMATCH',
  'WORKER_PACKET_FILE_DRIFT',
]);

function errorCode(error) {
  return String(error?.code || error?.name || 'NEEDS_ATTENTION');
}

function isHardError(error) {
  const code = errorCode(error);
  return HARD_ERROR_CODES.has(code)
    || code.startsWith('PATH_')
    || code.startsWith('SQLITE_')
    || code.startsWith('STATE_CORRUPT')
    || code.startsWith('TASK_LEDGER_') && code.endsWith('_CONFLICT')
    || code.startsWith('SESSION_CLOSE_') && code.endsWith('_CONFLICT')
    || code.startsWith('WORKTREE_') && (
      code.endsWith('_UNSAFE') || code.endsWith('_CONFLICT')
    );
}

function parseJson(value, fallback = null) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function priorResult(db, idempotencyKey, operation) {
  if (!db || !idempotencyKey) return null;
  const rows = db.prepare(
    `SELECT payload_json FROM events
     WHERE type = 'ultra_kernel_call'
     ORDER BY id DESC LIMIT 2000`,
  ).all();
  for (const row of rows) {
    const payload = parseJson(row.payload_json, {});
    if (payload.idempotency_key === idempotencyKey
      && payload.operation === operation
      && payload.accepted === true) {
      return payload.result;
    }
  }
  return null;
}

function rememberResult(db, {
  idempotencyKey,
  operation,
  result,
  changeId = null,
  taskId = null,
}) {
  if (!db || !idempotencyKey) return;
  ops.appendEvent(db, {
    type: 'ultra_kernel_call',
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

function diagnostic(error, severity = 'needs_attention') {
  return {
    code: errorCode(error),
    severity,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

function selectedScope(db, input = {}) {
  const scope = input.scope || {};
  if (scope.task_id) {
    const task = ops.readTask(db, scope.task_id);
    if (!task) return { task_id: scope.task_id };
    return {
      change_id: scope.change_id || task.change_id || undefined,
      task_id: task.id,
    };
  }
  if (scope.change_id) return { change_id: scope.change_id };
  const baseline = baselines.readBaseline(db);
  return baseline ? { baseline_id: baseline.id } : { project_id: 'project' };
}

function readContext(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
} = {}) {
  return contextEnvelope.buildEnvelope(db, input, { rootDir, runtime });
}

function initializeProject(data = {}) {
  const targetDir = path.resolve(data.target_dir || process.cwd());
  const alreadyInitialized = fs.existsSync(path.join(targetDir, '.ultra'));
  return initProject({
    ...data,
    target_dir: targetDir,
    resume: alreadyInitialized || data.resume === true,
  });
}

function baselineRecord(db, action, data, rootDir) {
  if (action === 'initialize') return initializeProject(data);
  if (action === 'start') {
    return { baseline: baselines.startBaseline(db, data, { rootDir }) };
  }
  if (action === 'observe' || action === 'revise') {
    return { baseline: baselines.recordBaseline(db, data, { rootDir }) };
  }
  if (action === 'accept') {
    const result = baselines.convergeBaseline(db, data, { rootDir });
    return {
      ...result,
      diagnostics: result.ready
        ? []
        : (result.blockers || []).map((code) => ({
          code,
          severity: 'needs_attention',
        })),
    };
  }
  throw Object.assign(new Error(`unsupported baseline action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function changeContractRecord(db, action, data, rootDir) {
  if (action === 'open') {
    return changes.createChange(db, data, { rootDir, kernelMode: true });
  }
  if (action === 'revise') {
    return {
      change: changes.updateChange(
        db,
        data.id,
        data.patch || {},
        { rootDir, kernelMode: true },
      ),
    };
  }
  if (action === 'cancel') {
    return {
      change: changes.updateChange(
        db,
        data.id,
        { status: 'cancelled' },
        { rootDir, kernelMode: true },
      ),
    };
  }
  throw Object.assign(new Error(`unsupported change_contract action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function taskContractRecord(db, action, data) {
  if (action === 'define') return { task: ops.createTask(db, data) };
  if (action === 'revise') return { task: ops.patchTask(db, data.id, data.patch || {}) };
  if (action === 'remove') return ops.deleteTask(db, data.id, { force: data.force === true });
  throw Object.assign(new Error(`unsupported task_contract action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function taskOutcomeRecord(db, action, data, rootDir) {
  const status = {
    start: 'in_progress',
    complete: 'completed',
    block: 'blocked',
    reopen: 'in_progress',
  }[action];
  if (!status) {
    throw Object.assign(new Error(`unsupported task_outcome action: ${action}`), {
      code: 'VALIDATION_ERROR',
    });
  }
  if (action === 'complete') {
    const packet = db.prepare(
      `SELECT id, packet_digest, packet_path, output_path
       FROM worker_packets
       WHERE scope_type = 'task' AND scope_id = ? AND status = 'assigned'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get(data.id);
    if (!packet) {
      throw Object.assign(
        new Error(`task ${data.id} has no assigned Worker Packet`),
        { code: 'WORKER_PACKET_REQUIRED' },
      );
    }
    const packetDocument = workerPacket.readWorkerPacket(
      db,
      packet.id,
      { rootDir },
    );
    if (data.packet_digest !== packet.packet_digest) {
      throw Object.assign(
        new Error('task outcome does not reference the exact assigned Worker Packet'),
        { code: 'WORKER_PACKET_DIGEST_MISMATCH' },
      );
    }
    const output = readStableProjectFile(rootDir, packet.output_path, { encoding: 'utf8' });
    let result;
    try {
      result = JSON.parse(output.text);
    } catch (cause) {
      throw Object.assign(
        new Error(`worker output is not valid JSON: ${packet.output_path}`),
        { code: 'WORKER_OUTPUT_INVALID', cause },
      );
    }
    workerPacket.verifyWorkerResult(packetDocument, result);
    artifactRegistry.recordArtifact(db, {
      id: `artifact-worker-outcome-${packet.id}`,
      owner_type: 'task',
      owner_id: data.id,
      task_id: data.id,
      change_id: ops.readTask(db, data.id)?.change_id || null,
      kind: 'task_outcome',
      path: packet.output_path,
      content_digest: output.digest,
      source_refs: [{
        type: 'external',
        id: `worker-packet:${packet.id}`,
        relation: 'produced_from_packet',
      }],
      consumer_refs: [{
        type: 'external',
        id: 'ultra-test',
        relation: 'consumed_by',
      }],
      provenance: {
        writer: 'worker-result',
        packet_digest: packet.packet_digest,
      },
      metadata: {
        worker_packet_id: packet.id,
        packet_path: packet.packet_path,
      },
    }, { rootDir });
  }
  if (data.patch && Object.keys(data.patch).length > 0) {
    ops.patchTask(db, data.id, data.patch);
  }
  return { task: ops.updateTaskStatus(db, data.id, status) };
}

function applyRecord(db, entry, { rootDir }) {
  const { kind, action, data = {} } = entry;
  if (!RECORD_KINDS.includes(kind)) {
    throw Object.assign(new Error(`unsupported record kind: ${kind}`), {
      code: 'VALIDATION_ERROR',
    });
  }
  if (kind === 'baseline') return baselineRecord(db, action, data, rootDir);
  if (kind === 'change_contract') return changeContractRecord(db, action, data, rootDir);
  if (kind === 'decision' && action === 'accept') {
    return { decision: decisionRecords.acceptDecision(db, data, { rootDir }) };
  }
  if (kind === 'task_contract') return taskContractRecord(db, action, data);
  if (kind === 'task_outcome') return taskOutcomeRecord(db, action, data, rootDir);
  if (kind === 'artifact' && action === 'bind') {
    return artifactRegistry.recordArtifact(db, data, { rootDir });
  }
  if (kind === 'event' && action === 'append') {
    return ops.appendEvent(db, data);
  }
  throw Object.assign(
    new Error(`unsupported ${kind} action: ${action}`),
    { code: 'VALIDATION_ERROR' },
  );
}

async function record(db, input = {}, {
  rootDir = process.cwd(),
} = {}) {
  const results = [];
  for (const entry of input.entries || []) {
    const operation = `${entry.kind}:${entry.action}`;
    const cached = priorResult(db, entry.idempotency_key, operation);
    if (cached) {
      results.push({
        kind: entry.kind,
        action: entry.action,
        accepted: true,
        idempotent: true,
        result: cached,
      });
      continue;
    }
    try {
      const result = applyRecord(db, entry, { rootDir });
      rememberResult(db, {
        idempotencyKey: entry.idempotency_key,
        operation,
        result,
        changeId: entry.data?.change_id || entry.data?.id || null,
        taskId: entry.kind.startsWith('task_') ? entry.data?.id || null : null,
      });
      results.push({
        kind: entry.kind,
        action: entry.action,
        accepted: true,
        idempotent: false,
        result,
        diagnostics: result?.diagnostics || [],
      });
    } catch (error) {
      if (isHardError(error)) throw error;
      results.push({
        kind: entry.kind,
        action: entry.action,
        accepted: false,
        mutable: true,
        diagnostics: [diagnostic(error)],
      });
    }
  }
  return {
    accepted: results.every((item) => item.accepted),
    mutable: true,
    results,
  };
}

function checkpointDiagnostics(input, context) {
  const supplied = Array.isArray(input.payload?.diagnostics)
    ? input.payload.diagnostics
    : [];
  const derived = [
    ...(context.envelope?.diagnostics?.warnings || []).map((item) => ({
      ...item,
      severity: 'warning',
    })),
    ...(context.envelope?.diagnostics?.needs_attention || []).map((item) => ({
      ...item,
      severity: 'warning',
    })),
    ...(context.envelope?.diagnostics?.hard_conflicts || []).map((item) => ({
      ...item,
      severity: 'hard_conflict',
    })),
  ];
  return [...supplied, ...derived]
    .filter((item) => item && typeof item === 'object' && item.code)
    .map((item) => ({
      code: String(item.code),
      severity: item.severity || 'needs_attention',
      ...(item.message ? { message: String(item.message) } : {}),
      ...(item.details === undefined ? {} : { details: item.details }),
    }));
}

function stageReadinessDiagnostics(db, input, scope) {
  const payload = input.payload || {};
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const needs = (code, message) => ({ code, severity: 'needs_attention', message });
  if (input.stage === 'research') {
    return evidence.length > 0
      ? []
      : [needs('RESEARCH_EVIDENCE_REQUIRED', 'Research checkpoint requires at least one evidence reference.')];
  }
  if (input.stage === 'dev') {
    const task = scope.task_id ? ops.readTask(db, scope.task_id) : null;
    const outcome = task
      ? db.prepare(
        `SELECT id FROM artifacts
         WHERE task_id = ? AND kind = 'task_outcome' AND status = 'current'
         ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
      ).get(task.id)
      : null;
    const diagnostics = [];
    if (!task) diagnostics.push(needs('TASK_NOT_FOUND', 'Dev checkpoint requires a task scope.'));
    else if (task.status !== 'completed') {
      diagnostics.push(needs('TASK_OUTCOME_INCOMPLETE', `Task ${task.id} is not completed.`));
    }
    if (task && !outcome) {
      diagnostics.push(needs(
        'WORKER_OUTCOME_REQUIRED',
        `Task ${task.id} requires an artifact bound to its exact Worker Packet.`,
      ));
    }
    return diagnostics;
  }
  if (input.stage === 'test') {
    const result = String(payload.result || '').toLowerCase();
    const diagnostics = [];
    if (!['pass', 'known_red'].includes(result)) {
      diagnostics.push(needs('TEST_RESULT_REQUIRED', 'Test checkpoint requires result=pass or known_red.'));
    }
    if (evidence.length === 0) {
      diagnostics.push(needs('TEST_EVIDENCE_REQUIRED', 'Test checkpoint requires evidence.'));
    }
    return diagnostics;
  }
  if (input.stage === 'review') {
    const verdict = String(payload.verdict || '').toLowerCase();
    const diagnostics = [];
    if (!['approve', 'pass'].includes(verdict)) {
      diagnostics.push(needs('REVIEW_VERDICT_REQUIRED', 'Review checkpoint requires an approved verdict.'));
    }
    if (evidence.length === 0) {
      diagnostics.push(needs('REVIEW_EVIDENCE_REQUIRED', 'Review checkpoint requires evidence.'));
    }
    return diagnostics;
  }
  if (input.stage === 'deliver') {
    const diagnostics = [];
    for (const stage of ['test', 'review']) {
      if (!stageCheckpoints.currentCheckpoint(
        db,
        stage,
        { change_id: scope.change_id },
        { includeDraft: false },
      )) {
        diagnostics.push(needs(
          `${stage.toUpperCase()}_CHECKPOINT_REQUIRED`,
          `Deliver checkpoint requires an accepted ${stage} checkpoint.`,
        ));
      }
    }
    if (String(payload.summary || '').trim().length < 3) {
      diagnostics.push(needs('DELIVERY_SUMMARY_REQUIRED', 'Deliver checkpoint requires a summary.'));
    }
    if (evidence.length === 0) {
      diagnostics.push(needs('DELIVERY_EVIDENCE_REQUIRED', 'Deliver checkpoint requires evidence.'));
    }
    return diagnostics;
  }
  return [];
}

async function checkpoint(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
  markPlanRecoveryRequired = null,
} = {}) {
  const scope = selectedScope(db, input);
  const context = contextEnvelope.persistEnvelope(db, {
    stage: input.stage,
    scope,
  }, { rootDir, runtime });
  const view = contextEnvelope.buildEnvelope(db, {
    stage: input.stage,
    scope,
    detail: 'summary',
  }, { rootDir, runtime });
  const diagnostics = [
    ...checkpointDiagnostics(input, view),
    ...stageReadinessDiagnostics(db, input, scope),
  ];
  let result = null;

  if (input.stage === 'plan'
      && !diagnostics.some((item) => item.severity !== 'warning')) {
    try {
      result = planCheckpoint.publishPlan(db, {
        change_id: scope.change_id,
        context,
      }, { rootDir, markRecoveryRequired: markPlanRecoveryRequired });
    } catch (error) {
      if (isHardError(error)) throw error;
      diagnostics.push(diagnostic(error));
    }
  }

  const draft = stageCheckpoints.saveDraft(db, {
    stage: input.stage,
    scope: scope.task_id
      ? { task_id: scope.task_id }
      : scope.change_id
        ? { change_id: scope.change_id }
        : scope.baseline_id
          ? { baseline_id: scope.baseline_id }
          : { project_id: 'project' },
    payload: input.stage === 'plan' && result
      ? { ...(input.payload || {}), plan: result }
      : (input.payload || {}),
    evidence: Array.isArray(input.payload?.evidence) ? input.payload.evidence : [],
    diagnostics,
    context_envelope_id: context.id,
    idempotency_key: `${input.idempotency_key}:draft`,
  });
  if (diagnostics.some((item) => item.severity !== 'warning')) {
    return {
      accepted: false,
      mutable: true,
      diagnostics,
      blockers: diagnostics.map((item) => item.code),
      checkpoint: draft,
      context,
      result,
    };
  }
  const accepted = stageCheckpoints.acceptDraft(db, {
    id: draft.id,
    idempotency_key: `${input.idempotency_key}:accept`,
  });
  if (input.stage === 'plan') {
    result = {
      ...result,
      team_checkpoint: taskLedger.publishTaskLedger(db, {
        rootDir,
        reason: 'plan_checkpoint_accepted',
      }),
    };
  }
  return {
    accepted: true,
    mutable: false,
    diagnostics,
    blockers: [],
    checkpoint: accepted,
    context,
    result,
  };
}

function sync(db, input = {}, { rootDir = process.cwd() } = {}) {
  gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
  if (input.action === 'inspect') {
    try {
      return taskLedger.inspectTaskLedger(db, { rootDir });
    } catch (error) {
      return {
        status: 'migration_required',
        migration: {
          required: true,
          code: errorCode(error),
          action: 'ultra.sync migrate',
        },
      };
    }
  }
  if (input.action === 'import') return taskLedger.importTaskLedger(db, { rootDir });
  if (input.action === 'migrate') {
    const published = taskLedger.publishTaskLedger(db, {
      rootDir,
      reason: 'legacy_authority_migrated',
    });
    return {
      migrated: Boolean(published.migrated_legacy_projection),
      ...published,
    };
  }
  if (input.action === 'publish') {
    const cached = priorResult(db, input.idempotency_key, 'sync:publish');
    if (cached) return { ...cached, idempotent: true };
    const result = taskLedger.publishTaskLedger(db, {
      rootDir,
      reason: input.reason || 'manual_checkpoint',
    });
    rememberResult(db, {
      idempotencyKey: input.idempotency_key,
      operation: 'sync:publish',
      result,
    });
    return result;
  }
  throw Object.assign(new Error(`unsupported sync action: ${input.action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function sessionDiagnostic(error) {
  if (isHardError(error)) throw error;
  return {
    accepted: false,
    mutable: true,
    can_acquire: false,
    diagnostics: [diagnostic(error)],
  };
}

async function session(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
  sessionId = null,
} = {}) {
  const scope = input.scope || {};
  const payload = input.payload || {};
  if (input.action === 'get') {
    return { session: ops.readSession(db, scope.sid) };
  }
  if (input.action === 'list') {
    const sessions = ops.listActiveSessions(db, { task_id: scope.task_id });
    return { sessions, count: sessions.length };
  }
  if (input.action === 'heartbeat') return ops.heartbeatSession(db, scope.sid);
  if (input.action === 'release') {
    if (sessionId) {
      return sessionDiagnostic(Object.assign(
        new Error('a worker session is settled by its parent host'),
        { code: 'WORKER_SESSION_PARENT_OWNED' },
      ));
    }
    return sessionRunner.closeSession(
      { db, repoRoot: rootDir, sid: scope.sid },
      {
        status: payload.status || 'completed',
        remove_worktree: payload.remove_worktree === true,
      },
    );
  }
  const taskId = scope.task_id;
  if (input.action === 'admission') {
    try {
      const task = ops.readTask(db, taskId);
      if (!task) throw Object.assign(new Error(`task ${taskId} not found`), { code: 'TASK_NOT_FOUND' });
      const attention = ops.taskContractBlockers(task).map((code) => ({
        code,
        severity: 'needs_attention',
      }));
      const lease = ops.admissionCheck(db, taskId);
      return {
        accepted: attention.length === 0 && lease.can_spawn,
        mutable: true,
        can_acquire: attention.length === 0 && lease.can_spawn,
        diagnostics: [
          ...attention,
          ...(lease.can_spawn ? [] : [{
            code: 'ACTIVE_SESSION_LEASE_CONFLICT',
            severity: 'hard_conflict',
            details: lease.conflict,
          }]),
        ],
        lease,
      };
    } catch (error) {
      return sessionDiagnostic(error);
    }
  }
  if (input.action !== 'acquire') {
    throw Object.assign(new Error(`unsupported session action: ${input.action}`), {
      code: 'VALIDATION_ERROR',
    });
  }
  let packet = null;
  try {
    packet = workerPacket.createWorkerPacket(db, {
      role: payload.role || 'implement',
      task_id: taskId,
      runtime: payload.runtime || runtime,
      output_path: payload.output_path
        || `.ultra/changes/active/${ops.readTask(db, taskId)?.change_id}/delivery/${taskId}-outcome.json`,
      output_schema: payload.output_schema,
      evidence_refs: payload.evidence_refs,
      diff_range: payload.diff_range,
      changed_files: payload.changed_files,
    }, { rootDir });
    const handle = sessionRunner.spawnSession({
      db,
      repoRoot: rootDir,
      task_id: taskId,
      runtime: payload.runtime || runtime,
      takeover: payload.takeover === true,
      worktree_base: payload.worktree_base,
      kernel_mode: true,
      mark_task_started: true,
      packet_digest: packet.packet_digest,
    });
    workerPacket.markWorkerPacketAssigned(db, packet.id);
    return {
      accepted: true,
      sid: handle.sid,
      worktree_path: handle.worktree_path,
      artifact_dir: handle.artifact_dir,
      lease_expires_at: handle.lease_expires_at,
      packet,
    };
  } catch (error) {
    if (packet?.id) {
      workerPacket.abandonWorkerPacket(db, packet.id, error.code || error.message);
    }
    return sessionDiagnostic(error);
  }
}

async function archive(db, input = {}, {
  rootDir = process.cwd(),
} = {}) {
  const cached = priorResult(db, input.idempotency_key, 'archive');
  if (cached) return { ...cached, idempotent: true };
  const change = changes.readChange(db, input.change_id);
  if (!change) {
    return {
      accepted: false,
      mutable: true,
      blockers: ['CHANGE_NOT_FOUND'],
      diagnostics: [{
        code: 'CHANGE_NOT_FOUND',
        severity: 'needs_attention',
        message: `change ${input.change_id} not found`,
      }],
    };
  }
  try {
    const result = changes.archiveChange(
      db,
      { id: input.change_id, ...(input.payload || {}) },
      { rootDir, kernelMode: true },
    );
    const output = {
      accepted: true,
      mutable: false,
      blockers: [],
      diagnostics: [],
      result,
      team_checkpoint: taskLedger.publishTaskLedger(db, {
        rootDir,
        reason: 'change_archived',
      }),
    };
    rememberResult(db, {
      idempotencyKey: input.idempotency_key,
      operation: 'archive',
      result: output,
      changeId: input.change_id,
    });
    return output;
  } catch (error) {
    if (isHardError(error)) throw error;
    return {
      accepted: false,
      mutable: true,
      blockers: [errorCode(error)],
      diagnostics: [diagnostic(error)],
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
  RECORD_KINDS,
  dispatch,
  readContext,
  record,
  checkpoint,
  sync,
  session,
  archive,
  isHardError,
};
