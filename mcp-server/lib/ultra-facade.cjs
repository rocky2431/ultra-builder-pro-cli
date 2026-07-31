'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const artifactRegistry = require('./artifact-registry.cjs');
const baselines = require('./baseline-workflow.cjs');
const canonical = require('./canonical-json.cjs');
const changes = require('./change-workflow.cjs');
const contextEnvelope = require('./context-envelope.cjs');
const decisionRecords = require('./decision-records.cjs');
const deliveryTransaction = require('./delivery-transaction.cjs');
const doctor = require('./doctor.cjs');
const gitBootstrap = require('./git-bootstrap.cjs');
const runtimePaths = require('./runtime-paths.cjs');
const { initProject } = require('./init-project.cjs');
const ops = require('./state-ops.cjs');
const planCheckpoint = require('./plan-checkpoint.cjs');
const { readStableProjectFile } = require('./safe-project-file.cjs');
const stageCheckpoints = require('./stage-checkpoints.cjs');
const taskContract = require('./task-contract.cjs');
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
  'CHECKPOINT_EVIDENCE_AUTHORITY_MISSING',
  'CHECKPOINT_EVIDENCE_DIGEST_MISMATCH',
  'CHECKPOINT_SCOPE_MISMATCH',
  'CHECKPOINT_SCOPE_NOT_FOUND',
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
  'RECORD_FILE_ROLLBACK_REQUIRED',
  'RUNTIME_ABI_MISMATCH',
  'RUNTIME_NATIVE_MISSING',
  'SCHEMA_VERSION_MISMATCH',
  'SESSION_RECEIPT_RECOVERY_REQUIRED',
  'SESSION_STATUS_CONFLICT',
  'STATE_CORRUPT',
  'STATE_DB_ERROR',
  'STATE_DB_MISSING',
  'STATE_PERSISTENCE_FAILED',
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

function requestDigest(operation, request) {
  return canonical.digest({ operation, request });
}

function priorResult(db, {
  idempotencyKey,
  operation,
  requestDigest: expectedDigest,
}) {
  if (!db || !idempotencyKey || !expectedDigest) return { found: false };
  const rows = db.prepare(
    `SELECT payload_json FROM events
     WHERE type = 'ultra_kernel_call'
     ORDER BY id DESC`,
  ).all();
  for (const row of rows) {
    const payload = parseJson(row.payload_json, {});
    if (payload.idempotency_key !== idempotencyKey || payload.accepted !== true) continue;
    if (payload.operation === operation
        && (payload.request_digest === expectedDigest
          || typeof payload.request_digest !== 'string')) {
      return { found: true, result: payload.result };
    }
    throw Object.assign(
      new Error(`idempotency key ${idempotencyKey} was already used for another request`),
      {
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        details: {
          idempotency_key: idempotencyKey,
          prior_operation: payload.operation || null,
          requested_operation: operation,
          prior_request_digest: payload.request_digest,
          requested_request_digest: expectedDigest,
        },
      },
    );
  }
  return { found: false };
}

function rememberResultInTx(db, {
  idempotencyKey,
  operation,
  requestDigest: acceptedRequestDigest,
  result,
  changeId = null,
  taskId = null,
}) {
  if (!db || !idempotencyKey) return;
  ops.appendEventInTx(db, {
    type: 'ultra_kernel_call',
    change_id: changeId,
    task_id: taskId,
    payload: {
      idempotency_key: idempotencyKey,
      operation,
      request_digest: acceptedRequestDigest,
      accepted: true,
      result,
    },
  });
}

function rememberRejectedAttempt(db, tool, input, result) {
  if (!db || result?.accepted !== false) return result;
  const nested = Array.isArray(result.results)
    ? result.results.flatMap((item) => item.diagnostics || [])
    : [];
  const diagnostics = [...(result.diagnostics || []), ...nested]
    .map((item) => ({
      code: item.code || 'NEEDS_ATTENTION',
      severity: item.severity || 'needs_attention',
      message: item.message || null,
      ...(item.details === undefined ? {} : { details: item.details }),
    }));
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const changeIds = [...new Set(entries.flatMap((entry) => [
    entry.data?.change_id,
    entry.kind === 'change_contract' ? entry.data?.id : null,
  ]).filter(Boolean))];
  const taskIds = [...new Set(entries.flatMap((entry) => [
    entry.kind.startsWith('task_') ? entry.data?.id : null,
    input.scope?.task_id,
  ]).filter(Boolean))];
  const scopeChangeId = input.scope?.change_id || input.change_id || null;
  ops.appendEvent(db, {
    type: 'ultra_kernel_attempt',
    change_id: changeIds.length === 1 ? changeIds[0] : scopeChangeId,
    task_id: taskIds.length === 1 ? taskIds[0] : null,
    payload: {
      tool,
      accepted: false,
      mutable: result.mutable !== false,
      operations: entries.map((entry) => `${entry.kind}:${entry.action}`),
      idempotency_keys: entries.length > 0
        ? entries.map((entry) => entry.idempotency_key).filter(Boolean)
        : [input.idempotency_key].filter(Boolean),
      scope: input.scope || (input.change_id ? { change_id: input.change_id } : {}),
      blockers: result.blockers || [],
      diagnostics,
    },
  });
  return result;
}

function diagnostic(error, severity = 'needs_attention') {
  return {
    code: errorCode(error),
    severity,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

function validationError(message, details) {
  return Object.assign(new Error(message), {
    code: 'VALIDATION_ERROR',
    ...(details === undefined ? {} : { details }),
  });
}

function stablePersistenceError(error, operation) {
  const code = errorCode(error);
  if (!code.startsWith('SQLITE_') && code !== 'STATE_DB_ERROR') return error;
  return Object.assign(
    new Error(`${operation} could not persist its atomic receipt`),
    {
      code: 'STATE_PERSISTENCE_FAILED',
      cause: error,
      details: { cause: code },
    },
  );
}

function assertExactFields(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${field} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw validationError(`${field}.${unknown[0]} is not allowed`, {
      field: `${field}.${unknown[0]}`,
    });
  }
}

const RECORD_DATA_FIELDS = Object.freeze({
  'baseline:initialize': [
    'target_dir', 'project_name', 'project_type', 'stack', 'mode', 'scope',
    'resume', 'overwrite', 'git_mode', 'source_template',
  ],
  'baseline:start': [
    'id', 'project_name', 'project_type', 'stack', 'mode', 'repository_revision',
    'replace_migrated', 'replace_ready', 'replacement_authorization', 'scope',
    'provider_refs', 'classification',
  ],
  'baseline:observe': [
    'id', 'repository_revision', 'scope', 'spec_refs', 'evidence', 'verification',
    'unknowns', 'gaps', 'classification', 'provider_refs',
  ],
  'baseline:revise': [
    'id', 'repository_revision', 'scope', 'spec_refs', 'evidence', 'verification',
    'unknowns', 'gaps', 'classification', 'provider_refs',
  ],
  'baseline:accept': [
    'id', 'expected_revision', 'approved_by', 'approval_note',
    'accept_dirty_worktree', 'accept_known_red',
  ],
  'change_contract:open': [
    'id', 'title', 'kind', 'intent', 'docs_impact', 'provider_refs',
    'baseline_bypass', 'contract', 'classification', 'research_disposition',
    'base_commit',
  ],
  'change_contract:revise': ['id', 'patch'],
  'change_contract:cancel': ['id'],
  'change_contract:supersede': ['id', 'successor_id', 'title', 'kind', 'intent'],
  'decision:accept': [
    'id', 'scope', 'question', 'recommendation', 'selection', 'effects',
    'non_goals', 'owner', 'source', 'provenance', 'applied_refs', 'supersedes_id',
  ],
  'task_contract:define': taskContract.TASK_CONTRACT_DEFINE_FIELDS,
  'task_contract:revise': ['id', 'patch'],
  'task_contract:remove': ['id'],
  'task_outcome:start': ['id'],
  'task_outcome:complete': ['id', 'packet_digest'],
  'task_outcome:block': ['id'],
  'task_outcome:reopen': ['id'],
  'task_outcome:attest_commit': ['id', 'completion_commit'],
  'artifact:bind': [
    'id', 'owner_type', 'owner_id', 'change_id', 'task_id', 'kind', 'path',
    'status', 'source_refs', 'consumer_refs', 'provenance', 'metadata',
    'content_digest', 'expected_before_digest',
  ],
  'event:append': ['type', 'task_id', 'change_id', 'session_id', 'runtime', 'payload'],
});

function requireText(value, field, { nullable = false } = {}) {
  if (value === null && nullable) return;
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string${nullable ? ' or null' : ''}`, { field });
  }
}

function optionalText(value, key, field, options) {
  if (Object.hasOwn(value, key)) requireText(value[key], `${field}.${key}`, options);
}

function optionalBoolean(value, key, field) {
  if (Object.hasOwn(value, key) && typeof value[key] !== 'boolean') {
    throw validationError(`${field}.${key} must be a boolean`, { field: `${field}.${key}` });
  }
}

function optionalObject(value, key, field) {
  if (!Object.hasOwn(value, key)) return;
  const candidate = value[key];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw validationError(`${field}.${key} must be an object`, { field: `${field}.${key}` });
  }
}

function optionalArray(value, key, field) {
  if (Object.hasOwn(value, key) && !Array.isArray(value[key])) {
    throw validationError(`${field}.${key} must be an array`, { field: `${field}.${key}` });
  }
}

function validateStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw validationError(`${field} must be an array of strings`, { field });
  }
}

function validateObjectArray(value, field, allowed = null) {
  if (!Array.isArray(value)) {
    throw validationError(`${field} must be an array`, { field });
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw validationError(`${field}[${index}] must be an object`, {
        field: `${field}[${index}]`,
      });
    }
    if (allowed) assertExactFields(item, allowed, `${field}[${index}]`);
  });
}

function validateDocsImpact(value, field) {
  assertExactFields(value, ['status', 'files', 'rationale'], field);
  optionalText(value, 'status', field);
  if (Object.hasOwn(value, 'files')) validateStringArray(value.files, `${field}.files`);
  optionalText(value, 'rationale', field, { nullable: true });
}

function validateChangeAuthority(value, field) {
  for (const key of ['title', 'intent', 'status', 'base_commit']) {
    optionalText(value, key, field);
  }
  for (const key of [
    'docs_impact', 'provider_refs', 'baseline_bypass', 'contract',
    'classification', 'research_disposition',
  ]) {
    optionalObject(value, key, field);
  }
  if (Object.hasOwn(value, 'docs_impact')) {
    validateDocsImpact(value.docs_impact, `${field}.docs_impact`);
  }
  if (Object.hasOwn(value, 'contract')) {
    const contractField = `${field}.contract`;
    assertExactFields(
      value.contract,
      ['outcome', 'acceptance', 'non_goals', 'public_seams', 'recovery', 'unresolved_decisions'],
      contractField,
    );
    optionalText(value.contract, 'outcome', contractField);
    for (const key of ['acceptance', 'non_goals', 'public_seams', 'unresolved_decisions']) {
      optionalArray(value.contract, key, contractField);
    }
    for (const key of ['non_goals', 'public_seams']) {
      if (Object.hasOwn(value.contract, key)) {
        validateStringArray(value.contract[key], `${contractField}.${key}`);
      }
    }
    if (Object.hasOwn(value.contract, 'acceptance')) {
      validateObjectArray(
        value.contract.acceptance,
        `${contractField}.acceptance`,
        ['id', 'criterion', 'verification'],
      );
      value.contract.acceptance.forEach((item, index) => {
        for (const key of ['id', 'criterion', 'verification']) {
          optionalText(item, key, `${contractField}.acceptance[${index}]`);
        }
      });
    }
    if (Object.hasOwn(value.contract, 'recovery')) {
      assertExactFields(
        value.contract.recovery,
        ['strategy', 'verification'],
        `${contractField}.recovery`,
      );
      for (const key of ['strategy', 'verification']) {
        optionalText(value.contract.recovery, key, `${contractField}.recovery`);
      }
    }
    if (Object.hasOwn(value.contract, 'unresolved_decisions')) {
      validateObjectArray(
        value.contract.unresolved_decisions,
        `${contractField}.unresolved_decisions`,
        ['id', 'summary', 'blocking', 'owner'],
      );
      value.contract.unresolved_decisions.forEach((item, index) => {
        for (const key of ['id', 'summary']) {
          optionalText(item, key, `${contractField}.unresolved_decisions[${index}]`);
        }
        optionalBoolean(
          item,
          'blocking',
          `${contractField}.unresolved_decisions[${index}]`,
        );
        optionalText(
          item,
          'owner',
          `${contractField}.unresolved_decisions[${index}]`,
          { nullable: true },
        );
      });
    }
  }
  if (Object.hasOwn(value, 'classification')) {
    const classificationField = `${field}.classification`;
    assertExactFields(value.classification, ['rationale', 'risk_flags'], classificationField);
    optionalText(value.classification, 'rationale', classificationField);
    if (Object.hasOwn(value.classification, 'risk_flags')) {
      validateStringArray(value.classification.risk_flags, `${classificationField}.risk_flags`);
    }
  }
  if (Object.hasOwn(value, 'research_disposition')) {
    const researchField = `${field}.research_disposition`;
    assertExactFields(
      value.research_disposition,
      ['status', 'mode', 'selected_steps', 'rationale'],
      researchField,
    );
    optionalText(value.research_disposition, 'status', researchField);
    optionalText(value.research_disposition, 'mode', researchField, { nullable: true });
    optionalText(value.research_disposition, 'rationale', researchField);
    if (Object.hasOwn(value.research_disposition, 'selected_steps')) {
      validateStringArray(
        value.research_disposition.selected_steps,
        `${researchField}.selected_steps`,
      );
    }
  }
  if (Object.hasOwn(value, 'baseline_bypass')) {
    const bypassField = `${field}.baseline_bypass`;
    assertExactFields(value.baseline_bypass, ['reason', 'approved_by'], bypassField);
    optionalText(value.baseline_bypass, 'reason', bypassField);
    optionalText(value.baseline_bypass, 'approved_by', bypassField);
  }
}

function validateBaselineData(action, data, field) {
  const textFields = action === 'initialize'
    ? ['target_dir', 'project_name', 'project_type', 'stack', 'mode', 'git_mode', 'source_template']
    : action === 'start'
      ? ['id', 'project_name', 'project_type', 'stack', 'mode', 'repository_revision']
      : action === 'accept'
        ? ['id', 'expected_revision', 'approved_by', 'approval_note']
        : ['id', 'repository_revision'];
  textFields.forEach((key) => optionalText(data, key, field));
  if (action === 'initialize') {
    optionalBoolean(data, 'resume', field);
    optionalBoolean(data, 'overwrite', field);
  }
  if (action === 'start') {
    optionalBoolean(data, 'replace_migrated', field);
    optionalBoolean(data, 'replace_ready', field);
  }
  if (action === 'accept') {
    optionalBoolean(data, 'accept_dirty_worktree', field);
    optionalBoolean(data, 'accept_known_red', field);
  }
  for (const key of ['classification', 'provider_refs', 'replacement_authorization']) {
    optionalObject(data, key, field);
  }
  if (Object.hasOwn(data, 'replacement_authorization')) {
    const authorizationField = `${field}.replacement_authorization`;
    assertExactFields(
      data.replacement_authorization,
      ['approved_by', 'reason'],
      authorizationField,
    );
    optionalText(data.replacement_authorization, 'approved_by', authorizationField);
    optionalText(data.replacement_authorization, 'reason', authorizationField);
  }
  for (const key of [
    'scope', 'spec_refs', 'evidence', 'verification', 'unknowns', 'gaps',
  ]) {
    optionalArray(data, key, field);
  }
  if (Object.hasOwn(data, 'scope')) validateStringArray(data.scope, `${field}.scope`);
  if (Object.hasOwn(data, 'spec_refs')) {
    validateObjectArray(data.spec_refs, `${field}.spec_refs`, ['kind', 'path']);
    data.spec_refs.forEach((item, index) => {
      optionalText(item, 'kind', `${field}.spec_refs[${index}]`);
      optionalText(item, 'path', `${field}.spec_refs[${index}]`);
    });
  }
  if (Object.hasOwn(data, 'evidence')) {
    validateObjectArray(data.evidence, `${field}.evidence`, ['kind', 'ref', 'summary']);
    data.evidence.forEach((item, index) => {
      for (const key of ['kind', 'ref', 'summary']) {
        optionalText(item, key, `${field}.evidence[${index}]`);
      }
    });
  }
  if (Object.hasOwn(data, 'verification')) {
    validateObjectArray(
      data.verification,
      `${field}.verification`,
      ['name', 'command', 'status', 'evidence', 'rationale'],
    );
    data.verification.forEach((item, index) => {
      for (const key of ['name', 'command', 'status', 'evidence', 'rationale']) {
        optionalText(item, key, `${field}.verification[${index}]`);
      }
    });
  }
  if (Object.hasOwn(data, 'unknowns')) {
    validateObjectArray(
      data.unknowns,
      `${field}.unknowns`,
      ['summary', 'blocking', 'owner'],
    );
    data.unknowns.forEach((item, index) => {
      optionalText(item, 'summary', `${field}.unknowns[${index}]`);
      optionalBoolean(item, 'blocking', `${field}.unknowns[${index}]`);
      optionalText(item, 'owner', `${field}.unknowns[${index}]`);
    });
  }
  if (Object.hasOwn(data, 'gaps')) {
    validateObjectArray(
      data.gaps,
      `${field}.gaps`,
      ['id', 'category', 'status', 'blocking', 'summary', 'evidence_refs', 'owner', 'resolution'],
    );
    data.gaps.forEach((item, index) => {
      for (const key of ['id', 'category', 'status', 'summary']) {
        optionalText(item, key, `${field}.gaps[${index}]`);
      }
      optionalBoolean(item, 'blocking', `${field}.gaps[${index}]`);
      optionalText(item, 'owner', `${field}.gaps[${index}]`, { nullable: true });
      optionalText(item, 'resolution', `${field}.gaps[${index}]`, { nullable: true });
      if (Object.hasOwn(item, 'evidence_refs')) {
        validateStringArray(item.evidence_refs, `${field}.gaps[${index}].evidence_refs`);
      }
    });
  }
}

function validateDecisionData(data, field) {
  for (const key of ['id', 'question', 'recommendation', 'selection', 'owner', 'source']) {
    optionalText(data, key, field);
  }
  optionalText(data, 'supersedes_id', field, { nullable: true });
  optionalObject(data, 'scope', field);
  optionalObject(data, 'effects', field);
  optionalObject(data, 'provenance', field);
  optionalArray(data, 'non_goals', field);
  optionalArray(data, 'applied_refs', field);
  if (Object.hasOwn(data, 'non_goals')) {
    validateStringArray(data.non_goals, `${field}.non_goals`);
  }
  if (Object.hasOwn(data, 'scope')) {
    assertExactFields(data.scope, ['baseline_id', 'change_id'], `${field}.scope`);
    optionalText(data.scope, 'baseline_id', `${field}.scope`);
    optionalText(data.scope, 'change_id', `${field}.scope`);
  }
  if (Object.hasOwn(data, 'applied_refs')) {
    validateObjectArray(
      data.applied_refs,
      `${field}.applied_refs`,
      ['ref', 'field', 'digest'],
    );
    data.applied_refs.forEach((item, index) => {
      for (const key of ['ref', 'field', 'digest']) {
        optionalText(item, key, `${field}.applied_refs[${index}]`);
      }
    });
  }
}

function validateArtifactData(data, field) {
  for (const key of ['id', 'owner_type', 'owner_id', 'kind', 'path', 'status', 'content_digest']) {
    optionalText(data, key, field);
  }
  for (const key of ['change_id', 'task_id', 'expected_before_digest']) {
    optionalText(data, key, field, { nullable: true });
  }
  for (const key of ['source_refs', 'consumer_refs']) {
    optionalArray(data, key, field);
    if (!Object.hasOwn(data, key)) continue;
    validateObjectArray(data[key], `${field}.${key}`, ['type', 'id', 'relation']);
    data[key].forEach((item, index) => {
      for (const referenceField of ['type', 'id', 'relation']) {
        optionalText(item, referenceField, `${field}.${key}[${index}]`);
      }
    });
  }
  optionalObject(data, 'provenance', field);
  optionalObject(data, 'metadata', field);
}

function validateRecordEntry(entry) {
  const operation = `${entry.kind}:${entry.action}`;
  const allowed = RECORD_DATA_FIELDS[operation];
  if (!allowed) {
    throw validationError(`unsupported ${entry.kind} action: ${entry.action}`);
  }
  const field = `${operation}.data`;
  assertExactFields(entry.data, allowed, field);
  if (entry.kind === 'baseline') validateBaselineData(entry.action, entry.data, field);
  else if (entry.kind === 'change_contract') {
    optionalText(entry.data, 'id', field);
    if (entry.action === 'open') {
      for (const key of ['title', 'kind', 'intent']) optionalText(entry.data, key, field);
      validateChangeAuthority(entry.data, field);
    } else if (entry.action === 'revise') {
      assertExactFields(
        entry.data.patch,
        [
          'title', 'intent', 'status', 'docs_impact', 'provider_refs',
          'contract', 'classification', 'research_disposition',
        ],
        `${field}.patch`,
      );
      validateChangeAuthority(entry.data.patch, `${field}.patch`);
    } else if (entry.action === 'supersede') {
      requireNonEmptyText(entry.data.id, `${field}.id`);
      requireNonEmptyText(entry.data.successor_id, `${field}.successor_id`);
      for (const key of ['title', 'kind', 'intent']) {
        optionalText(entry.data, key, field);
      }
    }
  } else if (entry.kind === 'decision') validateDecisionData(entry.data, field);
  else if (entry.kind === 'artifact') validateArtifactData(entry.data, field);
  else if (entry.kind === 'event') {
    optionalText(entry.data, 'type', field);
    for (const key of ['task_id', 'change_id', 'session_id', 'runtime']) {
      optionalText(entry.data, key, field, { nullable: true });
    }
    optionalObject(entry.data, 'payload', field);
  }
}

function snapshotRecordFile(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { existed: false, bytes: null, mode: null };
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw Object.assign(
      new Error(`record file target is not a regular file: ${file}`),
      { code: 'PATH_AUTHORITY_VIOLATION' },
    );
  }
  return { existed: true, bytes: fs.readFileSync(file), mode: stat.mode };
}

function restoreRecordFile(file, snapshot) {
  const current = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!snapshot.existed) {
    if (!current) return;
    if (!current.isFile() && !current.isSymbolicLink()) {
      throw new Error(`record rollback target changed type: ${file}`);
    }
    fs.rmSync(file, { force: true });
    return;
  }
  if (current?.isFile() && !current.isSymbolicLink()) {
    if (fs.readFileSync(file).equals(snapshot.bytes)) return;
  } else if (current) {
    throw new Error(`record rollback target changed type: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, snapshot.bytes, { mode: snapshot.mode });
}

function prepareRecordFileRollback(entry, rootDir) {
  const id = entry.data?.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  if (entry.kind === 'change_contract' && entry.action === 'open') {
    const directory = path.resolve(rootDir, '.ultra', 'changes', 'active', id);
    const existed = fs.existsSync(directory);
    return () => {
      if (!existed && fs.existsSync(directory)) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    };
  }
  if (entry.kind === 'change_contract' && entry.action === 'revise') {
    const file = path.resolve(
      rootDir,
      '.ultra',
      'changes',
      'active',
      id,
      'intent.md',
    );
    const snapshot = snapshotRecordFile(file);
    return () => restoreRecordFile(file, snapshot);
  }
  if (entry.kind === 'decision' && entry.action === 'accept') {
    const scope = entry.data.scope;
    let relative = null;
    if (typeof scope?.baseline_id === 'string') {
      relative = path.join('.ultra', 'decisions', 'baseline', `${id}.json`);
    } else if (typeof scope?.change_id === 'string'
        && /^[a-zA-Z0-9_-]+$/.test(scope.change_id)) {
      relative = path.join(
        '.ultra',
        'changes',
        'active',
        scope.change_id,
        'decisions',
        `${id}.json`,
      );
    }
    if (!relative) return null;
    const file = path.resolve(rootDir, relative);
    const snapshot = snapshotRecordFile(file);
    return () => restoreRecordFile(file, snapshot);
  }
  return null;
}

function rollbackRecordFiles(rollback, error) {
  if (!rollback) return;
  try {
    rollback();
  } catch (cause) {
    throw Object.assign(
      new Error(
        `record failed and managed file rollback requires recovery: `
        + `${error.message}; ${cause.message}`,
      ),
      {
        code: 'RECORD_FILE_ROLLBACK_REQUIRED',
        cause: error,
        details: {
          original_error: errorCode(error),
          rollback_error: cause.message,
        },
      },
    );
  }
}

function rejectedAttemptAudit(db) {
  return db.prepare(
    `SELECT id, ts, task_id, change_id, payload_json
     FROM events
     WHERE type = 'ultra_kernel_attempt'
     ORDER BY id DESC
     LIMIT 5`,
  ).all().map((row) => {
    const payload = parseJson(row.payload_json, {});
    return {
      event_id: row.id,
      recorded_at: row.ts,
      tool: payload.tool || null,
      task_id: row.task_id || null,
      change_id: row.change_id || null,
      operations: (payload.operations || []).slice(0, 12),
      blockers: (payload.blockers || []).slice(0, 12),
      diagnostics: (payload.diagnostics || []).slice(0, 8).map((item) => ({
        code: item.code || 'NEEDS_ATTENTION',
        severity: item.severity || 'needs_attention',
        message: typeof item.message === 'string'
          ? item.message.slice(0, 500)
          : null,
      })),
    };
  });
}

function requireNonEmptyText(value, field, { minLength = 1 } = {}) {
  requireText(value, field);
  if (value.trim().length < minLength) {
    throw validationError(`${field} must contain at least ${minLength} characters`, { field });
  }
}

function validateContextInput(input) {
  assertExactFields(input, ['stage', 'scope', 'detail'], 'context');
  if (Object.hasOwn(input, 'stage')) {
    requireText(input.stage, 'context.stage');
    if (!['project', 'research', 'plan', 'dev', 'test', 'review', 'deliver'].includes(input.stage)) {
      throw validationError(`unsupported context stage: ${input.stage}`);
    }
  }
  if (Object.hasOwn(input, 'detail')) {
    requireText(input.detail, 'context.detail');
    if (!['summary', 'full'].includes(input.detail)) {
      throw validationError(`unsupported context detail: ${input.detail}`);
    }
  }
  if (Object.hasOwn(input, 'scope')) {
    assertExactFields(input.scope, ['change_id', 'task_id'], 'context.scope');
    for (const key of ['change_id', 'task_id']) {
      if (Object.hasOwn(input.scope, key)) {
        requireNonEmptyText(input.scope[key], `context.scope.${key}`);
      }
    }
  }
}

function validateCheckpointInput(input) {
  assertExactFields(
    input,
    ['stage', 'scope', 'payload', 'idempotency_key'],
    'checkpoint',
  );
  requireText(input.stage, 'checkpoint.stage');
  if (!['research', 'plan', 'dev', 'test', 'review', 'deliver'].includes(input.stage)) {
    throw validationError(`unsupported checkpoint stage: ${input.stage}`);
  }
  assertExactFields(input.scope, ['change_id', 'task_id'], 'checkpoint.scope');
  for (const key of ['change_id', 'task_id']) {
    if (Object.hasOwn(input.scope, key)) {
      requireNonEmptyText(input.scope[key], `checkpoint.scope.${key}`);
    }
  }
  assertExactFields(
    input.payload,
    Object.keys(input.payload || {}),
    'checkpoint.payload',
  );
  requireNonEmptyText(input.idempotency_key, 'checkpoint.idempotency_key', {
    minLength: 3,
  });
  if (Object.hasOwn(input.payload, 'evidence')) {
    validateObjectArray(
      input.payload.evidence,
      'checkpoint.payload.evidence',
      ['kind', 'ref', 'summary', 'digest', 'artifact_id'],
    );
    input.payload.evidence.forEach((item, index) => {
      for (const key of ['kind', 'ref', 'summary', 'digest', 'artifact_id']) {
        optionalText(item, key, `checkpoint.payload.evidence[${index}]`);
      }
    });
  }
  if (Object.hasOwn(input.payload, 'diagnostics')) {
    validateObjectArray(
      input.payload.diagnostics,
      'checkpoint.payload.diagnostics',
      ['code', 'severity', 'message', 'details'],
    );
    input.payload.diagnostics.forEach((item, index) => {
      requireNonEmptyText(item.code, `checkpoint.payload.diagnostics[${index}].code`);
      optionalText(item, 'severity', `checkpoint.payload.diagnostics[${index}]`);
      optionalText(item, 'message', `checkpoint.payload.diagnostics[${index}]`);
    });
  }
}

function validateSyncInput(input) {
  requireText(input.action, 'sync.action');
  const allowed = {
    inspect: ['action'],
    import: ['action'],
    migrate: ['action'],
    publish: ['action', 'reason', 'idempotency_key'],
  }[input.action];
  if (!allowed) throw validationError(`unsupported sync action: ${input.action}`);
  assertExactFields(input, allowed, `sync:${input.action}`);
  if (input.action === 'publish') {
    optionalText(input, 'reason', 'sync:publish');
    requireNonEmptyText(input.idempotency_key, 'sync:publish.idempotency_key', {
      minLength: 3,
    });
  }
}

const SESSION_PAYLOAD_FIELDS = Object.freeze({
  admission: [],
  acquire: [
    'role', 'runtime', 'output_path', 'output_schema', 'evidence_refs',
    'diff_range', 'changed_files', 'takeover', 'worktree_base',
  ],
  get: [],
  list: [],
  heartbeat: [],
  release: ['status', 'remove_worktree'],
});

function validateSessionInput(input) {
  requireText(input.action, 'session.action');
  const payloadFields = SESSION_PAYLOAD_FIELDS[input.action];
  if (!payloadFields) throw validationError(`unsupported session action: ${input.action}`);
  const mutating = ['acquire', 'heartbeat', 'release'].includes(input.action);
  assertExactFields(
    input,
    mutating
      ? ['action', 'scope', 'payload', 'idempotency_key']
      : ['action', 'scope', 'payload'],
    `session:${input.action}`,
  );
  const scope = input.scope || {};
  const payload = input.payload || {};
  const scopeFields = ['get', 'heartbeat', 'release'].includes(input.action)
    ? ['sid']
    : ['task_id'];
  assertExactFields(scope, scopeFields, `session:${input.action}.scope`);
  assertExactFields(payload, payloadFields, `session:${input.action}.payload`);
  if (input.action !== 'list' || Object.hasOwn(scope, 'task_id')) {
    const key = scopeFields[0];
    requireNonEmptyText(scope[key], `session:${input.action}.scope.${key}`);
  }
  if (mutating) {
    requireNonEmptyText(
      input.idempotency_key,
      `session:${input.action}.idempotency_key`,
      { minLength: 3 },
    );
  }
  if (input.action === 'release') {
    if (Object.hasOwn(payload, 'status')) {
      requireText(payload.status, 'session:release.payload.status');
      if (!['completed', 'crashed'].includes(payload.status)) {
        throw validationError(`unsupported session release status: ${payload.status}`);
      }
    }
    optionalBoolean(payload, 'remove_worktree', 'session:release.payload');
  }
  if (input.action === 'acquire') {
    for (const key of ['role', 'runtime', 'output_path', 'diff_range', 'worktree_base']) {
      optionalText(payload, key, 'session:acquire.payload');
    }
    optionalObject(payload, 'output_schema', 'session:acquire.payload');
    optionalArray(payload, 'evidence_refs', 'session:acquire.payload');
    optionalArray(payload, 'changed_files', 'session:acquire.payload');
    optionalBoolean(payload, 'takeover', 'session:acquire.payload');
    if (Object.hasOwn(payload, 'changed_files')) {
      validateStringArray(payload.changed_files, 'session:acquire.payload.changed_files');
    }
    if (Object.hasOwn(payload, 'evidence_refs')) {
      payload.evidence_refs.forEach((item, index) => {
        if (typeof item === 'string') return;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw validationError(
            `session:acquire.payload.evidence_refs[${index}] must be a string or object`,
          );
        }
      });
    }
  }
}

function validateArchiveInput(input) {
  assertExactFields(input, ['change_id', 'payload', 'idempotency_key'], 'archive');
  requireNonEmptyText(input.change_id, 'archive.change_id');
  requireNonEmptyText(input.idempotency_key, 'archive.idempotency_key', { minLength: 3 });
  assertExactFields(
    input.payload,
    [
      'summary', 'baseline_updates', 'no_baseline_change_reason',
      'reconciliation_path',
    ],
    'archive.payload',
  );
  for (const key of ['summary', 'no_baseline_change_reason', 'reconciliation_path']) {
    optionalText(input.payload, key, 'archive.payload');
  }
  if (Object.hasOwn(input.payload, 'baseline_updates')) {
    validateStringArray(input.payload.baseline_updates, 'archive.payload.baseline_updates');
  }
}

function validateRecordInput(input) {
  assertExactFields(input, ['entries'], 'record');
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw validationError('record.entries must be a non-empty array', {
      field: 'record.entries',
    });
  }
  input.entries.forEach((entry, index) => {
    const field = `record.entries[${index}]`;
    assertExactFields(entry, ['kind', 'action', 'data', 'idempotency_key'], field);
    requireNonEmptyText(entry.kind, `${field}.kind`);
    requireNonEmptyText(entry.action, `${field}.action`);
    assertExactFields(
      entry.data,
      Object.keys(entry.data || {}),
      `${field}.data`,
    );
    requireNonEmptyText(entry.idempotency_key, `${field}.idempotency_key`, {
      minLength: 3,
    });
  });
}

function validateDoctorInput(input) {
  assertExactFields(input, ['repair'], 'doctor');
  optionalBoolean(input, 'repair', 'doctor');
}

function selectedScope(db, input = {}) {
  const scope = input.scope || {};
  const task = scope.task_id ? ops.readTask(db, scope.task_id) : null;
  if (scope.task_id && !task) {
    throw Object.assign(
      new Error(`checkpoint task scope does not exist: ${scope.task_id}`),
      {
        code: 'CHECKPOINT_SCOPE_NOT_FOUND',
        details: { scope_type: 'task', scope_id: scope.task_id },
      },
    );
  }
  const changeId = scope.change_id || task?.change_id || null;
  const change = changeId ? changes.readChange(db, changeId) : null;
  if (changeId && !change) {
    throw Object.assign(
      new Error(`checkpoint Change scope does not exist: ${changeId}`),
      {
        code: 'CHECKPOINT_SCOPE_NOT_FOUND',
        details: { scope_type: 'change', scope_id: changeId },
      },
    );
  }
  if (task && scope.change_id && task.change_id !== scope.change_id) {
    throw Object.assign(
      new Error(
        `checkpoint task ${task.id} belongs to Change ${task.change_id || '(none)'}, not ${scope.change_id}`,
      ),
      {
        code: 'CHECKPOINT_SCOPE_MISMATCH',
        details: {
          task_id: task.id,
          task_change_id: task.change_id || null,
          requested_change_id: scope.change_id,
        },
      },
    );
  }
  if (task) {
    return {
      ...(changeId ? { change_id: changeId } : {}),
      task_id: task.id,
    };
  }
  if (change) return { change_id: change.id };
  const baseline = baselines.readBaseline(db);
  return baseline ? { baseline_id: baseline.id } : { project_id: 'project' };
}

function readContext(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
} = {}) {
  validateContextInput(input);
  const result = contextEnvelope.buildEnvelope(db, input, { rootDir, runtime });
  const rejectedAttempts = rejectedAttemptAudit(db);
  let visible = {
    ...result,
    audit: {
      rejected_attempts: rejectedAttempts,
    },
  };
  delete visible.bytes;
  const limit = input.detail === 'full'
    ? contextEnvelope.FULL_LIMIT
    : contextEnvelope.SUMMARY_LIMIT;
  while (Buffer.byteLength(JSON.stringify(visible)) > limit
      && rejectedAttempts.length > 0) {
    rejectedAttempts.pop();
  }
  if (Buffer.byteLength(JSON.stringify(visible)) > limit) {
    visible = { ...result };
    delete visible.bytes;
  }
  visible.bytes = Buffer.byteLength(JSON.stringify(visible));
  return visible;
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
      diagnostics: [
        ...(result.blockers || []).map((code) => ({
          code,
          severity: 'needs_attention',
        })),
        ...(result.warnings || []).map((code) => ({
          code,
          severity: 'warning',
        })),
      ],
    };
  }
  throw Object.assign(new Error(`unsupported baseline action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function changeContractRecord(db, action, data, rootDir) {
  if (action === 'open') {
    return changes.createChange(db, data, { rootDir });
  }
  if (action === 'revise') {
    return {
      change: changes.updateChange(
        db,
        data.id,
        data.patch,
        { rootDir },
      ),
    };
  }
  if (action === 'cancel') {
    return {
      change: changes.updateChange(
        db,
        data.id,
        { status: 'cancelled' },
        { rootDir },
      ),
    };
  }
  if (action === 'supersede') {
    return changes.supersedeChange(db, data, { rootDir });
  }
  throw Object.assign(new Error(`unsupported change_contract action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function taskContractRecord(db, action, data, rootDir) {
  if (action === 'define') {
    return { task: ops.createTask(db, taskContract.normalizeTaskDefinition(data)) };
  }
  if (action === 'revise') {
    assertExactFields(data, ['id', 'patch'], 'task_contract.revise.data');
    const id = taskContract.normalizeTaskId(data.id);
    return {
      task: ops.patchTask(db, id, taskContract.normalizeTaskPatch(data.patch)),
    };
  }
  if (action === 'remove') {
    assertExactFields(data, ['id'], 'task_contract.remove.data');
    return ops.deleteTask(
      db,
      taskContract.normalizeTaskId(data.id),
      { rootDir },
    );
  }
  throw Object.assign(new Error(`unsupported task_contract action: ${action}`), {
    code: 'VALIDATION_ERROR',
  });
}

function resolveIntegratedCommit(rootDir, completionCommit) {
  if (typeof completionCommit !== 'string'
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(completionCommit)) {
    throw Object.assign(
      new Error('completion_commit must be a lowercase Git commit SHA'),
      { code: 'COMPLETION_COMMIT_INVALID' },
    );
  }
  const resolved = spawnSync(
    'git',
    ['rev-parse', '--verify', `${completionCommit}^{commit}`],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (resolved.status !== 0) {
    throw Object.assign(
      new Error(`completion commit ${completionCommit} was not found in this repository`),
      { code: 'COMPLETION_COMMIT_NOT_FOUND' },
    );
  }
  const commit = String(resolved.stdout || '').trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
    throw Object.assign(
      new Error(`completion commit ${completionCommit} could not be resolved`),
      { code: 'COMPLETION_COMMIT_NOT_FOUND' },
    );
  }
  const integrated = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', commit, 'HEAD'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (integrated.status !== 0) {
    throw Object.assign(
      new Error(`completion commit ${commit} is not an ancestor of the current HEAD`),
      { code: 'COMPLETION_COMMIT_NOT_INTEGRATED' },
    );
  }
  return commit;
}

function attestTaskCompletionCommit(db, data, rootDir) {
  assertExactFields(data, ['id', 'completion_commit'], 'task_outcome.attest_commit.data');
  const id = taskContract.normalizeTaskId(data.id);
  const task = ops.readTask(db, id);
  if (!task) {
    throw Object.assign(new Error(`task ${id} does not exist`), { code: 'TASK_NOT_FOUND' });
  }
  if (task.status !== 'completed') {
    throw Object.assign(
      new Error(`task ${id} must be completed before its commit can be attested`),
      {
        code: 'TASK_NOT_COMPLETED',
        details: { task_id: id, status: task.status },
      },
    );
  }
  const commit = resolveIntegratedCommit(rootDir, data.completion_commit);
  if (task.completion_commit) {
    if (task.completion_commit === commit) return { task };
    throw Object.assign(
      new Error(`task ${id} already attests completion commit ${task.completion_commit}`),
      {
        code: 'COMPLETION_COMMIT_CONFLICT',
        details: {
          task_id: id,
          existing_commit: task.completion_commit,
          requested_commit: commit,
        },
      },
    );
  }
  return { task: ops.patchTask(db, id, { completion_commit: commit }) };
}

function taskOutcomeRecord(db, action, data, rootDir) {
  if (action === 'attest_commit') {
    return attestTaskCompletionCommit(db, data, rootDir);
  }
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
    assertExactFields(data, ['id', 'packet_digest'], 'task_outcome.complete.data');
    taskContract.normalizeTaskId(data.id);
    if (typeof data.packet_digest !== 'string' || !data.packet_digest) {
      throw validationError('task_outcome.complete.data.packet_digest must be a string');
    }
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
  } else {
    assertExactFields(data, ['id'], `task_outcome.${action}.data`);
    taskContract.normalizeTaskId(data.id);
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
  validateRecordEntry({ kind, action, data });
  if (kind === 'baseline') return baselineRecord(db, action, data, rootDir);
  if (kind === 'change_contract') return changeContractRecord(db, action, data, rootDir);
  if (kind === 'decision' && action === 'accept') {
    return { decision: decisionRecords.acceptDecision(db, data, { rootDir }) };
  }
  if (kind === 'task_contract') return taskContractRecord(db, action, data, rootDir);
  if (kind === 'task_outcome') return taskOutcomeRecord(db, action, data, rootDir);
  if (kind === 'artifact' && action === 'bind') {
    const legacyWorkflowReference = data.owner_type === 'workflow'
      || [...(data.source_refs || []), ...(data.consumer_refs || [])]
        .some((reference) => reference?.type === 'workflow');
    if (legacyWorkflowReference) {
      throw Object.assign(
        new Error(
          'workflow-owned artifact authority is retired and remains read-only history',
        ),
        { code: 'LEGACY_AUTHORITY_READ_ONLY' },
      );
    }
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
  validateRecordInput(input);
  const entries = input.entries;
  const runEntry = (entry) => {
    const data = entry.data === undefined ? {} : entry.data;
    const normalizedEntry = { ...entry, data };
    validateRecordEntry(normalizedEntry);
    const operation = `${entry.kind}:${entry.action}`;
    const acceptedRequestDigest = requestDigest(operation, {
      kind: entry.kind,
      action: entry.action,
      data,
    });
    const cached = priorResult(db, {
      idempotencyKey: entry.idempotency_key,
      operation,
      requestDigest: acceptedRequestDigest,
    });
    if (cached.found) {
      return {
        kind: entry.kind,
        action: entry.action,
        accepted: true,
        idempotent: true,
        result: cached.result,
      };
    }
    const rollbackFiles = prepareRecordFileRollback(normalizedEntry, rootDir);
    try {
      const result = applyRecord(db, normalizedEntry, { rootDir });
      rememberResultInTx(db, {
        idempotencyKey: entry.idempotency_key,
        operation,
        requestDigest: acceptedRequestDigest,
        result,
        changeId: data.change_id || data.id || null,
        taskId: entry.kind.startsWith('task_') ? data.id || null : null,
      });
      return {
        kind: entry.kind,
        action: entry.action,
        accepted: true,
        idempotent: false,
        result,
        diagnostics: result?.diagnostics || [],
      };
    } catch (error) {
      rollbackRecordFiles(rollbackFiles, error);
      throw error;
    }
  };

  if (!db) {
    const results = entries.map((entry) => {
      try {
        return runEntry(entry);
      } catch (error) {
        if (isHardError(error)) throw error;
        return {
          kind: entry.kind,
          action: entry.action,
          accepted: false,
          mutable: true,
          diagnostics: [diagnostic(error)],
        };
      }
    });
    return {
      accepted: results.every((item) => item.accepted),
      mutable: true,
      results,
    };
  }

  const attempted = entries.map((entry) => {
    try {
      return ops.tx(db, () => runEntry(entry));
    } catch (error) {
      const persistenceError = stablePersistenceError(
        error,
        `${entry.kind}:${entry.action} record`,
      );
      if (persistenceError !== error) throw persistenceError;
      if (isHardError(error)) throw error;
      return {
        kind: entry.kind,
        action: entry.action,
        accepted: false,
        mutable: true,
        diagnostics: [diagnostic(error)],
      };
    }
  });
  return {
    accepted: attempted.every((item) => item.accepted),
    mutable: true,
    results: attempted,
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

function stageAdvisoryDiagnostics(db, input, scope) {
  const payload = input.payload || {};
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const warning = (code, message) => ({ code, severity: 'warning', message });
  if (input.stage === 'research') {
    return evidence.length > 0
      ? []
      : [warning(
        'RESEARCH_EVIDENCE_MISSING',
        'No research evidence was declared; the caller remains responsible for semantic sufficiency.',
      )];
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
    if (!task) diagnostics.push(warning('TASK_NOT_FOUND', 'No task scope was found for this Dev checkpoint.'));
    else if (task.status !== 'completed') {
      diagnostics.push(warning('TASK_OUTCOME_INCOMPLETE', `Task ${task.id} is not completed.`));
    }
    if (task && !outcome) {
      diagnostics.push(warning(
        'WORKER_OUTCOME_MISSING',
        `Task ${task.id} has no current Worker Packet outcome artifact.`,
      ));
    }
    return diagnostics;
  }
  if (input.stage === 'test') {
    const result = String(payload.result || '').toLowerCase();
    const diagnostics = [];
    if (!result) {
      diagnostics.push(warning('TEST_RESULT_MISSING', 'No test result was declared.'));
    } else if (!['pass', 'known_red'].includes(result)) {
      diagnostics.push(warning(
        'TEST_RESULT_RECORDED',
        `The caller recorded test result ${result}; MCP does not reinterpret it.`,
      ));
    }
    if (evidence.length === 0) {
      diagnostics.push(warning('TEST_EVIDENCE_MISSING', 'No test evidence was declared.'));
    }
    return diagnostics;
  }
  if (input.stage === 'review') {
    const verdict = String(payload.verdict || '').toLowerCase();
    const diagnostics = [];
    if (!verdict) {
      diagnostics.push(warning('REVIEW_VERDICT_MISSING', 'No review verdict was declared.'));
    } else if (!['approve', 'pass'].includes(verdict)) {
      diagnostics.push(warning(
        'REVIEW_VERDICT_RECORDED',
        `The caller recorded review verdict ${verdict}; MCP does not reinterpret it.`,
      ));
    }
    if (evidence.length === 0) {
      diagnostics.push(warning('REVIEW_EVIDENCE_MISSING', 'No review evidence was declared.'));
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
        diagnostics.push(warning(
          `${stage.toUpperCase()}_CHECKPOINT_MISSING`,
          `No accepted ${stage} checkpoint was found; the caller owns the delivery decision.`,
        ));
      }
    }
    if (String(payload.summary || '').trim().length < 3) {
      diagnostics.push(warning('DELIVERY_SUMMARY_MISSING', 'No durable delivery summary was declared.'));
    }
    if (evidence.length === 0) {
      diagnostics.push(warning('DELIVERY_EVIDENCE_MISSING', 'No delivery evidence was declared.'));
    }
    return diagnostics;
  }
  return [];
}

function normalizeCheckpointEvidence(db, input, rootDir) {
  const evidence = Array.isArray(input.payload?.evidence) ? input.payload.evidence : [];
  return evidence.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      const error = new Error(`checkpoint evidence[${index}] must be an object`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const normalized = { ...item };
    let relative = typeof item.ref === 'string' ? item.ref.trim() : '';
    let artifact = null;
    if (item.artifact_id) {
      try {
        artifact = artifactRegistry.getArtifact(db, { id: String(item.artifact_id) });
      } catch (error) {
        if (error?.code !== 'ARTIFACT_NOT_FOUND') throw error;
      }
      if (!artifact || artifact.status !== 'current') {
        const error = new Error(`checkpoint evidence artifact is not current: ${item.artifact_id}`);
        error.code = 'CHECKPOINT_EVIDENCE_AUTHORITY_MISSING';
        throw error;
      }
      if (relative && artifact.path !== relative) {
        const error = new Error(`checkpoint evidence path does not match artifact ${item.artifact_id}`);
        error.code = 'CHECKPOINT_EVIDENCE_AUTHORITY_MISSING';
        throw error;
      }
      relative = artifact.path;
      normalized.artifact_id = artifact.id;
      if (item.digest && String(item.digest) !== artifact.digest) {
        const error = new Error(
          `checkpoint evidence digest contradicts artifact ${item.artifact_id}`,
        );
        error.code = 'CHECKPOINT_EVIDENCE_DIGEST_MISMATCH';
        error.details = {
          path: relative,
          expected: artifact.digest,
          actual: String(item.digest),
        };
        throw error;
      }
    }
    if (!item.digest && !item.artifact_id) return normalized;
    if (!relative) {
      const error = new Error(`checkpoint evidence[${index}] requires ref when digest is supplied`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const read = readStableProjectFile(rootDir, relative);
    const expected = item.artifact_id
      ? artifact.digest
      : String(item.digest);
    if (read.digest !== expected) {
      const error = new Error(`checkpoint evidence digest mismatch: ${relative}`);
      error.code = 'CHECKPOINT_EVIDENCE_DIGEST_MISMATCH';
      error.details = { path: relative, expected, actual: read.digest };
      throw error;
    }
    normalized.ref = relative;
    normalized.digest = read.digest;
    return normalized;
  });
}

function checkpointMutation(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
  markPlanRecoveryRequired = null,
} = {}) {
  const scope = selectedScope(db, input);
  const checkpointScope = scope.task_id
    ? { task_id: scope.task_id }
    : scope.change_id
      ? { change_id: scope.change_id }
      : scope.baseline_id
        ? { baseline_id: scope.baseline_id }
        : { project_id: 'project' };
  const retry = stageCheckpoints.findIdempotentDraft(db, {
    stage: input.stage,
    scope: checkpointScope,
    payload: input.payload || {},
    idempotency_key: `${input.idempotency_key}:draft`,
  });
  if (retry) {
    const hasHardConflict = retry.diagnostics.some(
      (item) => item.severity === 'hard_conflict',
    );
    const accepted = retry.status === 'draft' && !hasHardConflict
      ? stageCheckpoints.acceptDraft(db, {
        id: retry.id,
        idempotency_key: `${input.idempotency_key}:accept`,
      })
      : retry;
    let result = retry.payload?.plan || null;
    if (input.stage === 'plan' && accepted.status === 'accepted') {
      result = {
        ...result,
        team_checkpoint: taskLedger.publishTaskLedger(db, {
          rootDir,
          reason: 'plan_checkpoint_retry',
        }),
      };
    }
    return {
      accepted: accepted.status === 'accepted',
      mutable: accepted.status !== 'accepted',
      idempotent: true,
      diagnostics: accepted.diagnostics,
      blockers: accepted.diagnostics
        .filter((item) => item.severity === 'hard_conflict')
        .map((item) => item.code),
      checkpoint: accepted,
      context: accepted.context_envelope_id
        ? contextEnvelope.readEnvelope(db, accepted.context_envelope_id, { rootDir })
        : null,
      result,
    };
  }
  const context = contextEnvelope.persistEnvelope(db, {
    stage: input.stage,
    scope,
  }, { rootDir, runtime });
  const view = contextEnvelope.buildEnvelope(db, {
    stage: input.stage,
    scope,
    detail: 'summary',
  }, { rootDir, runtime });
  const evidence = normalizeCheckpointEvidence(db, input, rootDir);
  const diagnostics = [
    ...checkpointDiagnostics(input, view),
    ...stageAdvisoryDiagnostics(db, input, scope),
    ...evidence
      .filter((item) => !item.digest && !item.artifact_id)
      .map((item, index) => ({
        code: 'CHECKPOINT_EVIDENCE_UNBOUND',
        severity: 'warning',
        message: `Evidence declaration ${item.ref || item.kind || index} has no current digest or managed artifact binding.`,
      })),
  ];
  let result = null;

  if (input.stage === 'plan'
      && !diagnostics.some((item) => item.severity === 'hard_conflict')) {
    try {
      result = planCheckpoint.publishPlan(db, {
        change_id: scope.change_id,
        context,
      }, { rootDir, markRecoveryRequired: markPlanRecoveryRequired });
    } catch (error) {
      if (isHardError(error)) throw error;
      diagnostics.push(diagnostic(error, 'hard_conflict'));
    }
  }

  const draft = stageCheckpoints.saveDraft(db, {
    stage: input.stage,
    scope: checkpointScope,
    payload: input.stage === 'plan' && result
      ? { ...(input.payload || {}), plan: result }
      : (input.payload || {}),
    evidence,
    diagnostics,
    context_envelope_id: context.id,
    idempotency_key: `${input.idempotency_key}:draft`,
  });
  if (diagnostics.some((item) => item.severity === 'hard_conflict')) {
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

function checkpoint(db, input = {}, options = {}) {
  validateCheckpointInput(input);
  try {
    return checkpointMutation(db, input, options);
  } catch (error) {
    throw stablePersistenceError(error, 'checkpoint publication');
  }
}

function migrationRequired(error) {
  return {
    status: 'migration_required',
    migration: {
      required: true,
      code: errorCode(error),
      action: 'ultra.sync migrate',
    },
  };
}

function corruptLedgerInspection(error, rootDir) {
  return {
    status: 'corrupt',
    path: taskLedger.ledgerPath(rootDir),
    diagnostics: [diagnostic(error, 'hard_conflict')],
    recovery: {
      actions: [
        {
          action: 'doctor',
          command: 'ultra.doctor',
          description: 'Inspect the managed authority and its deterministic repairs.',
        },
        {
          action: 'restore',
          path: taskLedger.LEDGER_RELATIVE_PATH,
          description: 'Restore the last trusted ledger bytes from version control or backup.',
        },
      ],
    },
  };
}

function sync(db, input = {}, { rootDir = process.cwd() } = {}) {
  validateSyncInput(input);
  gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
  if (input.action === 'inspect') {
    try {
      return taskLedger.inspectTaskLedger(db, { rootDir });
    } catch (error) {
      if (errorCode(error) === 'TASK_LEDGER_SCHEMA_MIGRATION_REQUIRED') {
        return migrationRequired(error);
      }
      if (['TASK_LEDGER_INVALID', 'TASK_LEDGER_DIGEST_MISMATCH'].includes(errorCode(error))) {
        try {
          const legacy = taskLedger.syncTaskLedger(db, { rootDir });
          if (legacy.status === 'legacy') return migrationRequired(error);
        } catch {
          // Keep the original validated read error as the public diagnostic.
        }
        return corruptLedgerInspection(error, rootDir);
      }
      throw error;
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
    const operation = 'sync:publish';
    const reason = input.reason || 'manual_checkpoint';
    const acceptedRequestDigest = requestDigest(operation, {
      action: input.action,
      reason,
    });
    let publication = null;
    try {
      return ops.tx(db, () => {
        const cached = priorResult(db, {
          idempotencyKey: input.idempotency_key,
          operation,
          requestDigest: acceptedRequestDigest,
        });
        if (cached.found) return { ...cached.result, idempotent: true };
        publication = taskLedger.publishTaskLedger(db, { rootDir, reason });
        rememberResultInTx(db, {
          idempotencyKey: input.idempotency_key,
          operation,
          requestDigest: acceptedRequestDigest,
          result: publication,
        });
        return publication;
      });
    } catch (error) {
      if (publication) {
        try {
          taskLedger.rollbackTaskLedgerPublication(publication);
        } catch (rollbackError) {
          throw Object.assign(
            new Error(
              `sync publication failed and the team ledger could not be restored: `
              + `${error.message}; ${rollbackError.message}`,
            ),
            {
              code: 'STATE_CORRUPT',
              cause: error,
              details: {
                original_error: errorCode(error),
                rollback_error: errorCode(rollbackError),
                path: taskLedger.LEDGER_RELATIVE_PATH,
              },
            },
          );
        }
      }
      throw stablePersistenceError(error, 'sync publication');
    }
  }
  throw validationError(`unsupported sync action: ${input.action}`);
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

function attachRecovery(error, recovery) {
  if (!recovery) return error;
  error.details = {
    ...(error.details || {}),
    recovery,
  };
  return error;
}

function idempotentSessionMutation(db, input, mutate, {
  rollbackEffect = null,
  prepareEffect = null,
} = {}) {
  const operation = `session:${input.action}`;
  const request = Object.fromEntries(
    ['action', 'scope', 'payload']
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, input[key]]),
  );
  const acceptedRequestDigest = requestDigest(operation, request);
  let mutationCompleted = false;
  let effectPrepared = false;
  let result = null;
  try {
    const transactionalMutation = () => {
      const cached = priorResult(db, {
        idempotencyKey: input.idempotency_key,
        operation,
        requestDigest: acceptedRequestDigest,
      });
      if (cached.found) return { ...cached.result, idempotent: true };
      if (prepareEffect) {
        prepareEffect();
        effectPrepared = true;
      }
      result = mutate();
      mutationCompleted = true;
      rememberResultInTx(db, {
        idempotencyKey: input.idempotency_key,
        operation,
        requestDigest: acceptedRequestDigest,
        result,
        taskId: input.scope?.task_id || null,
      });
      return result;
    };
    return ops.tx(db, transactionalMutation);
  } catch (error) {
    let recovery = null;
    if ((effectPrepared || mutationCompleted) && rollbackEffect) {
      recovery = rollbackEffect(result, error);
    }
    const recovered = attachRecovery(
      stablePersistenceError(error, `${operation} receipt`),
      recovery,
    );
    if (recovered !== error || isHardError(recovered)) throw recovered;
    return sessionDiagnostic(recovered);
  }
}

function removeRolledBackManagedFile(db, {
  rootDir,
  table,
  idField,
  id,
  relative,
  expectedPrefix,
  expectedBasename,
}) {
  if (!relative || db.prepare(
    `SELECT 1 FROM ${table} WHERE ${idField} = ?`,
  ).get(id)) return;
  if (path.isAbsolute(relative)) {
    throw validationError(`managed rollback path must be project-relative: ${relative}`);
  }
  const absolute = path.resolve(rootDir, relative);
  const prefix = path.resolve(rootDir, expectedPrefix);
  if (!absolute.startsWith(`${prefix}${path.sep}`)
      || path.basename(absolute) !== expectedBasename) {
    throw Object.assign(
      new Error(`managed rollback path escaped its authority: ${relative}`),
      { code: 'PATH_AUTHORITY_VIOLATION' },
    );
  }
  restoreRecordFile(absolute, { existed: false, bytes: null, mode: null });
}

function snapshotAcquisitionEffect(db, taskId) {
  return {
    context_ids: new Set(db.prepare(
      `SELECT * FROM context_envelopes
       WHERE scope_type = 'task' AND scope_id = ?`,
    ).all(taskId).map((row) => row.id)),
    prior_session: db.prepare(
      `SELECT * FROM sessions
       WHERE task_id = ? AND status = 'running'
       ORDER BY rowid DESC LIMIT 1`,
    ).get(taskId) || null,
  };
}

function rollbackAcquisitionEffect(db, rootDir, acquisition, error) {
  const issues = [];
  let priorSessionReconciled = false;
  const attempt = (action, run) => {
    try { run(); }
    catch (cause) {
      issues.push({
        action,
        code: errorCode(cause),
        message: cause.message,
      });
    }
  };
  if (acquisition.handle?.sid && acquisition.handle?.worktree_path) {
    attempt('remove_worktree', () => {
      sessionRunner._internal.reconcileRemovedWorktree(
        rootDir,
        acquisition.handle.worktree_path,
        { sid: acquisition.handle.sid },
      );
    });
  }
  if (acquisition.handle?.sid && acquisition.handle?.artifact_dir) {
    attempt('remove_artifact_dir', () => {
      const expected = path.resolve(
        rootDir,
        '.ultra',
        '.runtime',
        'sessions',
        acquisition.handle.sid,
      );
      const actual = path.resolve(acquisition.handle.artifact_dir);
      if (actual !== expected) {
        throw Object.assign(
          new Error(`session artifact rollback escaped its authority: ${actual}`),
          { code: 'PATH_AUTHORITY_VIOLATION' },
        );
      }
      const stat = fs.lstatSync(actual, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink() || stat && !stat.isDirectory()) {
        throw Object.assign(
          new Error(`session artifact rollback target is unsafe: ${actual}`),
          { code: 'PATH_AUTHORITY_VIOLATION' },
        );
      }
      if (stat) fs.rmSync(actual, { recursive: true });
    });
  }
  if (acquisition.packet?.created) {
    const packet = acquisition.packet;
    attempt('remove_worker_packet', () => removeRolledBackManagedFile(db, {
      rootDir,
      table: 'worker_packets',
      idField: 'id',
      id: packet.id,
      relative: packet.packet_path,
      expectedPrefix: path.join('.ultra', '.runtime', 'worker-packets'),
      expectedBasename: `${packet.id}.json`,
    }));
  }
  const context = acquisition.packet?.context_envelope;
  if (context?.id && !acquisition.snapshot?.context_ids.has(context.id)) {
    attempt('remove_context_envelope', () => removeRolledBackManagedFile(db, {
      rootDir,
      table: 'context_envelopes',
      idField: 'id',
      id: context.id,
      relative: context.path,
      expectedPrefix: '.ultra',
      expectedBasename: `${context.id}.json`,
    }));
  }
  const priorSession = acquisition.snapshot?.prior_session;
  if (priorSession?.pid
      && !sessionRunner._internal.processIsExecuting(priorSession.pid)) {
    attempt('reconcile_terminated_prior_session', () => {
      const current = ops.readSession(db, priorSession.sid);
      if (current?.status === 'running' && current.pid === priorSession.pid) {
        ops.updateSession(db, priorSession.sid, { status: 'crashed', pid: null });
        priorSessionReconciled = true;
      }
    });
  }
  if (issues.length > 0) {
    throw Object.assign(
      new Error(
        `session acquisition receipt failed and effect rollback requires recovery: `
        + `${error.message}`,
      ),
      {
        code: 'SESSION_RECEIPT_RECOVERY_REQUIRED',
        cause: error,
        details: {
          issues,
          retry: 'Run ultra.doctor with repair=true, then retry the exact ultra.session request.',
        },
      },
    );
  }
  return {
    status: 'rolled_back',
    prior_session_reconciled: priorSessionReconciled,
    retry: 'Retry the exact ultra.session request with the same idempotency_key.',
  };
}

function recoverReleaseReceiptFailure(db, rootDir, session, payload, error) {
  if (!session) {
    throw Object.assign(
      new Error('session release receipt failed after its session authority disappeared'),
      {
        code: 'SESSION_RECEIPT_RECOVERY_REQUIRED',
        cause: error,
        details: { retry: 'Run ultra.doctor with repair=true before retrying release.' },
      },
    );
  }
  const requestedStatus = payload.status || 'completed';
  const removedWorktree = payload.remove_worktree === true;
  if (!removedWorktree && !session.pid) {
    return {
      status: 'rolled_back',
      retry: 'Retry the exact ultra.session release request with the same idempotency_key.',
    };
  }
  const closeJournal = sessionRunner._internal.closeJournal;
  try {
    if (removedWorktree) {
      closeJournal.prepare(rootDir, {
        sid: session.sid,
        task_id: session.task_id,
        requested_status: requestedStatus,
        worktree_path: session.worktree_path,
      });
      sessionRunner._internal.reconcileRemovedWorktree(
        rootDir,
        session.worktree_path,
        { sid: session.sid },
      );
      closeJournal.update(rootDir, session.sid, {
        phase: 'worktree_removed',
        error: null,
      });
    }
    ops.updateSession(db, session.sid, { status: requestedStatus, pid: null });
    if (removedWorktree) closeJournal.discard(rootDir, session.sid);
  } catch (cause) {
    throw Object.assign(
      new Error(
        `session release receipt failed and close recovery requires attention: `
        + `${error.message}; ${cause.message}`,
      ),
      {
        code: 'SESSION_RECEIPT_RECOVERY_REQUIRED',
        cause: error,
        details: {
          recovery_error: errorCode(cause),
          sid: session.sid,
          retry: 'Run ultra.doctor with repair=true, then retry the exact release request.',
        },
      },
    );
  }
  return {
    status: 'terminal_recovered',
    sid: session.sid,
    session_status: requestedStatus,
    retry: 'Retry the exact ultra.session release request to persist its receipt.',
  };
}

async function session(db, input = {}, {
  rootDir = process.cwd(),
  runtime = 'unknown',
  sessionId = null,
} = {}) {
  validateSessionInput(input);
  const scope = input.scope || {};
  const payload = input.payload || {};
  if (input.action === 'get') {
    return { session: ops.readSession(db, scope.sid) };
  }
  if (input.action === 'list') {
    const sessions = ops.listActiveSessions(db, { task_id: scope.task_id });
    return { sessions, count: sessions.length };
  }
  if (input.action === 'heartbeat') {
    return idempotentSessionMutation(
      db,
      input,
      () => ops.heartbeatSession(db, scope.sid),
    );
  }
  if (input.action === 'release') {
    const releasingSession = ops.readSession(db, scope.sid);
    return idempotentSessionMutation(db, input, () => {
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
    }, {
      rollbackEffect: (result, error) => (
        result?.accepted === false
          ? null
          : recoverReleaseReceiptFailure(db, rootDir, releasingSession, payload, error)
      ),
    });
  }
  const taskId = scope.task_id;
  if (input.action === 'admission') {
    try {
      const task = ops.readTask(db, taskId);
      if (!task) throw Object.assign(new Error(`task ${taskId} not found`), { code: 'TASK_NOT_FOUND' });
      const attention = ops.taskContractBlockers(task).map((code) => ({
        code,
        severity: 'warning',
      }));
      const lease = ops.admissionCheck(db, taskId);
      return {
        accepted: lease.can_spawn,
        mutable: true,
        can_acquire: lease.can_spawn,
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
  const acquisition = {
    task_id: taskId,
    packet: null,
    handle: null,
    snapshot: null,
    authority: null,
  };
  try {
    acquisition.authority = runtimePaths.ensureRuntimeState(rootDir, {
      admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(rootDir),
    });
  } catch (error) {
    return sessionDiagnostic(error);
  }
  return idempotentSessionMutation(db, input, () => {
    try {
      acquisition.packet = workerPacket.createWorkerPacket(db, {
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
      acquisition.handle = sessionRunner.spawnSession({
        db,
        repoRoot: rootDir,
        task_id: taskId,
        runtime: payload.runtime || runtime,
        authority: acquisition.authority,
        takeover: payload.takeover === true,
        worktree_base: payload.worktree_base,
        kernel_mode: true,
        mark_task_started: true,
        packet_digest: acquisition.packet.packet_digest,
      });
      workerPacket.markWorkerPacketAssigned(db, acquisition.packet.id);
      return {
        accepted: true,
        sid: acquisition.handle.sid,
        worktree_path: acquisition.handle.worktree_path,
        artifact_dir: acquisition.handle.artifact_dir,
        lease_expires_at: acquisition.handle.lease_expires_at,
        packet: acquisition.packet,
      };
    } catch (error) {
      if (acquisition.packet?.id) {
        throw error;
      }
      return sessionDiagnostic(error);
    }
  }, {
    prepareEffect: () => {
      acquisition.snapshot = snapshotAcquisitionEffect(db, taskId);
    },
    rollbackEffect: (_result, error) => rollbackAcquisitionEffect(
      db,
      rootDir,
      acquisition,
      error,
    ),
  });
}

function snapshotManagedDirectory(directory) {
  const rootStat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw Object.assign(
      new Error(`archive source must be a managed directory: ${directory}`),
      { code: 'ARCHIVE_PATH_UNSAFE' },
    );
  }
  const entries = [];
  const walk = (parent, relativeParent = '') => {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      const relative = path.join(relativeParent, entry.name);
      const absolute = path.join(parent, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw Object.assign(
          new Error(`archive source contains a symbolic link: ${relative}`),
          { code: 'ARCHIVE_PATH_UNSAFE' },
        );
      }
      if (stat.isDirectory()) {
        entries.push({ type: 'directory', relative, mode: stat.mode });
        walk(absolute, relative);
      } else if (stat.isFile()) {
        entries.push({
          type: 'file',
          relative,
          mode: stat.mode,
          bytes: fs.readFileSync(absolute),
        });
      } else {
        throw Object.assign(
          new Error(`archive source contains an unsupported entry: ${relative}`),
          { code: 'ARCHIVE_PATH_UNSAFE' },
        );
      }
    }
  };
  walk(directory);
  return {
    source: directory,
    mode: rootStat.mode,
    entries,
    destination: null,
  };
}

function prepareArchiveDirectoryRollback(change, rootDir) {
  if (!change || change.status === 'archived') return null;
  const expected = path.resolve(
    rootDir,
    '.ultra',
    'changes',
    'active',
    change.id,
  );
  const actual = path.resolve(rootDir, change.artifact_root);
  if (actual !== expected) {
    throw Object.assign(
      new Error(`active Change artifact root escaped its authority: ${change.artifact_root}`),
      { code: 'ARCHIVE_PATH_UNSAFE' },
    );
  }
  return snapshotManagedDirectory(actual);
}

function restoreArchiveDirectory(rootDir, changeId, rollback) {
  if (!rollback?.destination) return;
  const archiveRoot = path.resolve(rootDir, '.ultra', 'changes', 'archive');
  const destination = path.resolve(rollback.destination);
  if (path.dirname(destination) !== archiveRoot
      || !path.basename(destination).endsWith(`-${changeId}`)) {
    throw Object.assign(
      new Error(`archive rollback destination escaped its authority: ${destination}`),
      { code: 'ARCHIVE_PATH_UNSAFE' },
    );
  }
  const destinationStat = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (!destinationStat || destinationStat.isSymbolicLink() || !destinationStat.isDirectory()) {
    throw Object.assign(
      new Error(`archive rollback destination is unavailable or unsafe: ${destination}`),
      { code: 'ARCHIVE_RECOVERY_REQUIRED' },
    );
  }
  if (fs.lstatSync(rollback.source, { throwIfNoEntry: false })) {
    throw Object.assign(
      new Error(`archive rollback source already exists: ${rollback.source}`),
      { code: 'ARCHIVE_RECOVERY_REQUIRED' },
    );
  }
  fs.renameSync(destination, rollback.source);
  for (const entry of fs.readdirSync(rollback.source)) {
    fs.rmSync(path.join(rollback.source, entry), { recursive: true });
  }
  const directories = rollback.entries
    .filter((entry) => entry.type === 'directory')
    .sort((left, right) => left.relative.length - right.relative.length);
  for (const entry of directories) {
    const target = path.join(rollback.source, entry.relative);
    fs.mkdirSync(target, { recursive: true, mode: entry.mode });
  }
  for (const entry of rollback.entries.filter((item) => item.type === 'file')) {
    const target = path.join(rollback.source, entry.relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.bytes, { mode: entry.mode });
  }
  fs.chmodSync(rollback.source, rollback.mode);
}

function rollbackArchivePublication({
  publication,
  directory,
  rootDir,
  changeId,
}, error) {
  const issues = [];
  try {
    deliveryTransaction.rollbackDeliveryTransaction({
      rootDir,
      changeId,
    });
  } catch (cause) {
    issues.push({
      action: 'restore_baseline_delivery',
      code: errorCode(cause),
      message: cause.message,
    });
  }
  if (publication) {
    try { taskLedger.rollbackTaskLedgerPublication(publication); }
    catch (cause) {
      issues.push({
        action: 'restore_team_ledger',
        code: errorCode(cause),
        message: cause.message,
      });
    }
  }
  if (directory?.destination) {
    try { restoreArchiveDirectory(rootDir, changeId, directory); }
    catch (cause) {
      issues.push({
        action: 'restore_active_change',
        code: errorCode(cause),
        message: cause.message,
      });
    }
  }
  if (issues.length > 0) {
    throw Object.assign(
      new Error(
        `archive publication failed and filesystem recovery requires attention: `
        + `${error.message}`,
      ),
      {
        code: 'ARCHIVE_RECOVERY_REQUIRED',
        cause: error,
        details: {
          change_id: changeId,
          issues,
          recovery: 'Run ultra.doctor with repair=true before retrying archive.',
        },
      },
    );
  }
}

function finishArchiveDeliveryReceipt(rootDir, changeId, output) {
  try {
    deliveryTransaction.completeDeliveryTransaction({
      rootDir,
      changeId,
    });
    return output;
  } catch (error) {
    return {
      ...output,
      recovery_warning: [
        output.recovery_warning,
        `DELIVERY_JOURNAL_CLEANUP_PENDING:${error.message}`,
      ].filter(Boolean).join(';'),
    };
  }
}

async function archive(db, input = {}, {
  rootDir = process.cwd(),
} = {}) {
  validateArchiveInput(input);
  const operation = 'archive';
  const acceptedRequestDigest = requestDigest(operation, {
    change_id: input.change_id,
    payload: input.payload,
  });
  let publication = null;
  const existing = priorResult(db, {
    idempotencyKey: input.idempotency_key,
    operation,
    requestDigest: acceptedRequestDigest,
  });
  if (existing.found) {
    return finishArchiveDeliveryReceipt(
      rootDir,
      input.change_id,
      { ...existing.result, idempotent: true },
    );
  }
  const directoryRollback = prepareArchiveDirectoryRollback(
    changes.readChange(db, input.change_id),
    rootDir,
  );
  try {
    const output = ops.tx(db, () => {
      const cached = priorResult(db, {
        idempotencyKey: input.idempotency_key,
        operation,
        requestDigest: acceptedRequestDigest,
      });
      if (cached.found) return { ...cached.result, idempotent: true };
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
      const result = changes.archiveChange(
        db,
        { ...input.payload, id: input.change_id },
        { rootDir, deferDeliveryCleanup: true },
      );
      if (directoryRollback) directoryRollback.destination = result.archive_path;
      const output = {
        accepted: true,
        mutable: false,
        blockers: [],
        diagnostics: [],
        result,
        team_checkpoint: (publication = taskLedger.publishTaskLedger(db, {
          rootDir,
          reason: 'change_archived',
        })),
      };
      rememberResultInTx(db, {
        idempotencyKey: input.idempotency_key,
        operation,
        requestDigest: acceptedRequestDigest,
        result: output,
        changeId: input.change_id,
      });
      return output;
    });
    return finishArchiveDeliveryReceipt(rootDir, input.change_id, output);
  } catch (error) {
    rollbackArchivePublication({
      publication,
      directory: directoryRollback,
      rootDir,
      changeId: input.change_id,
    }, error);
    const persistenceError = stablePersistenceError(error, 'archive publication');
    if (persistenceError !== error) throw persistenceError;
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
  let result;
  if (name === 'ultra.context') result = readContext(db, input, context);
  else if (name === 'ultra.record') result = await record(db, input, context);
  else if (name === 'ultra.checkpoint') result = await checkpoint(db, input, context);
  else if (name === 'ultra.sync') result = sync(db, input, context);
  else if (name === 'ultra.session') result = await session(db, input, context);
  else if (name === 'ultra.archive') result = await archive(db, input, context);
  if (name === 'ultra.doctor') {
    validateDoctorInput(input);
    result = doctor.runDoctor(db, {
      rootDir: context.rootDir || process.cwd(),
      repair: input.repair === true,
      project: context.projector,
    });
  }
  if (result === undefined) {
    const error = new Error(`unhandled public tool ${name}`);
    error.code = 'UNKNOWN_TOOL';
    throw error;
  }
  return rememberRejectedAttempt(db, name, input, result);
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
