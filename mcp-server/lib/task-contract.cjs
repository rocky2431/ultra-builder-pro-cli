'use strict';

const TASK_DURABLE_STATUSES = Object.freeze([
  'pending',
  'completed',
  'blocked',
  'expanded',
]);

const TASK_CONTRACT_DEFINE_FIELDS = Object.freeze([
  'id',
  'title',
  'type',
  'priority',
  'complexity',
  'estimated_days',
  'deps',
  'files_modified',
  'trace_to',
  'outcome',
  'slice_kind',
  'public_seam',
  'verification_command',
  'acceptance',
  'context_refs',
  'docs_impact',
  'ownership',
  'change_id',
  'parent_id',
]);

const TASK_CONTRACT_PATCH_FIELDS = Object.freeze([
  'title',
  'type',
  'priority',
  'complexity',
  'estimated_days',
  'deps',
  'files_modified',
  'trace_to',
  'outcome',
  'slice_kind',
  'public_seam',
  'verification_command',
  'acceptance',
  'context_refs',
  'docs_impact',
  'ownership',
]);

const DURABLE_TASK_FIELDS = Object.freeze([
  'id',
  'title',
  'type',
  'priority',
  'complexity',
  'estimated_days',
  'status',
  'deps',
  'files_modified',
  'stale',
  'trace_to',
  'outcome',
  'slice_kind',
  'public_seam',
  'verification_command',
  'acceptance',
  'context_refs',
  'docs_impact',
  'ownership',
  'change_id',
  'parent_id',
]);

const DURABLE_TASK_ENTRY_FIELDS = Object.freeze([
  ...DURABLE_TASK_FIELDS,
  'revision',
  'parent_digest',
  'digest',
]);

const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

class TaskContractError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'TaskContractError';
    this.code = 'VALIDATION_ERROR';
    if (field) this.details = { field };
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(field, message) {
  throw new TaskContractError(`${field} ${message}`, field);
}

function assertObject(value, field) {
  if (!isObject(value)) fail(field, 'must be an object');
}

function assertKnownFields(value, allowed, field = 'task') {
  assertObject(value, field);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`${field}.${unknown[0]}`, 'is not allowed');
  }
}

function normalizeRequiredText(value, field, { minimum = 1, pattern = null } = {}) {
  if (typeof value !== 'string') fail(field, 'must be a string');
  const normalized = value.trim();
  if (normalized.length < minimum) {
    fail(field, `must contain at least ${minimum} characters`);
  }
  if (pattern && !pattern.test(normalized)) fail(field, 'has an invalid format');
  return normalized;
}

function normalizeOptionalText(value, field) {
  if (typeof value !== 'string') fail(field, 'must be a string');
  return value.trim();
}

function normalizeNullableText(value, field) {
  return value === null ? null : normalizeOptionalText(value, field);
}

function normalizeEnum(value, field, allowed, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(field, `must be one of ${allowed.join(', ')}${nullable ? ', or null' : ''}`);
  }
  return value;
}

function normalizeVocabulary(value, field, { nullable = false, maximum = 80 } = {}) {
  if (value === null && nullable) return null;
  const normalized = normalizeRequiredText(value, field);
  if (normalized.length > maximum) {
    fail(field, `must contain at most ${maximum} characters`);
  }
  return normalized;
}

function normalizeComplexity(value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    fail('task.complexity', 'must be an integer from 1 through 10, or null');
  }
  return value;
}

function normalizeEstimatedDays(value) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail('task.estimated_days', 'must be a finite number greater than zero, or null');
  }
  return value;
}

function normalizeStringArray(value, field) {
  if (!Array.isArray(value)) fail(field, 'must be an array of non-empty strings');
  return value.map((item, index) => (
    normalizeRequiredText(item, `${field}[${index}]`)
  ));
}

function normalizeAcceptance(value) {
  if (!Array.isArray(value)) fail('task.acceptance', 'must be an array');
  const ids = new Set();
  return value.map((item, index) => {
    const field = `task.acceptance[${index}]`;
    assertKnownFields(item, ['id', 'criterion', 'verification'], field);
    const id = normalizeRequiredText(item.id, `${field}.id`);
    if (ids.has(id)) fail(`${field}.id`, 'must be unique');
    ids.add(id);
    return {
      id,
      criterion: normalizeRequiredText(item.criterion, `${field}.criterion`),
      verification: normalizeRequiredText(item.verification, `${field}.verification`),
    };
  });
}

function normalizeContextRefs(value) {
  if (!Array.isArray(value)) fail('task.context_refs', 'must be an array');
  return value.map((item, index) => {
    const field = `task.context_refs[${index}]`;
    assertKnownFields(item, [
      'ref',
      'reason',
      'kind',
      'required',
      'freshness_policy',
      'expected_digest',
      'digest',
      'anchor',
      'scope',
    ], field);
    const expectedDigest = item.expected_digest ?? item.digest ?? null;
    if (item.expected_digest !== undefined && item.digest !== undefined
        && item.expected_digest !== item.digest) {
      fail(`${field}.expected_digest`, 'must match digest when both are supplied');
    }
    if (expectedDigest !== null
        && (typeof expectedDigest !== 'string' || !SHA256_PATTERN.test(expectedDigest))) {
      fail(`${field}.expected_digest`, 'must be a lowercase sha256 digest');
    }
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      fail(`${field}.required`, 'must be a boolean');
    }
    const kind = item.kind === undefined
      ? 'source'
      : normalizeEnum(item.kind, `${field}.kind`, ['spec', 'source', 'test', 'docs', 'external']);
    const freshnessPolicy = item.freshness_policy === undefined
      ? (expectedDigest ? 'digest' : 'existence')
      : normalizeEnum(
        item.freshness_policy,
        `${field}.freshness_policy`,
        ['digest', 'existence', 'advisory'],
      );
    const normalized = {
      ref: normalizeRequiredText(item.ref, `${field}.ref`),
      reason: normalizeRequiredText(item.reason, `${field}.reason`),
      kind,
      required: item.required === undefined ? true : item.required,
      freshness_policy: freshnessPolicy,
    };
    if (expectedDigest !== null) normalized.expected_digest = expectedDigest;
    if (item.anchor !== undefined) {
      normalized.anchor = normalizeRequiredText(item.anchor, `${field}.anchor`);
    }
    if (item.scope !== undefined) {
      normalized.scope = normalizeRequiredText(item.scope, `${field}.scope`);
    }
    return normalized;
  });
}

function normalizeDocsImpact(value) {
  assertKnownFields(value, ['status', 'files', 'rationale'], 'task.docs_impact');
  const status = value.status === undefined
    ? 'unknown'
    : normalizeEnum(value.status, 'task.docs_impact.status', ['unknown', 'required', 'none']);
  const files = value.files === undefined
    ? []
    : normalizeStringArray(value.files, 'task.docs_impact.files');
  let rationale = null;
  if (value.rationale !== undefined) {
    rationale = value.rationale === null
      ? null
      : normalizeOptionalText(value.rationale, 'task.docs_impact.rationale');
  }
  return { status, files, rationale };
}

function normalizeOwnership(value) {
  assertKnownFields(value, ['owner', 'reviewers'], 'task.ownership');
  const owner = value.owner === undefined
    ? null
    : normalizeNullableText(value.owner, 'task.ownership.owner');
  const reviewers = value.reviewers === undefined
    ? []
    : normalizeStringArray(value.reviewers, 'task.ownership.reviewers');
  return { owner, reviewers };
}

function normalizeField(field, value) {
  switch (field) {
    case 'id':
      return normalizeRequiredText(value, 'task.id', { pattern: TASK_ID_PATTERN });
    case 'title':
      return normalizeRequiredText(value, 'task.title', { minimum: 3 });
    case 'type':
      return normalizeVocabulary(value, 'task.type');
    case 'priority':
      return normalizeVocabulary(value, 'task.priority');
    case 'complexity':
      return normalizeComplexity(value);
    case 'estimated_days':
      return normalizeEstimatedDays(value);
    case 'deps':
    case 'files_modified':
      return normalizeStringArray(value, `task.${field}`);
    case 'slice_kind':
      return normalizeVocabulary(value, 'task.slice_kind', { nullable: true });
    case 'trace_to':
    case 'outcome':
    case 'public_seam':
    case 'verification_command':
      return normalizeOptionalText(value, `task.${field}`);
    case 'acceptance':
      return normalizeAcceptance(value);
    case 'context_refs':
      return normalizeContextRefs(value);
    case 'docs_impact':
      return normalizeDocsImpact(value);
    case 'ownership':
      return normalizeOwnership(value);
    case 'change_id':
    case 'parent_id':
      return normalizeRequiredText(value, `task.${field}`);
    default:
      fail(`task.${field}`, 'is not a Task Contract field');
  }
}

function normalizeFields(value, allowed, required = []) {
  assertKnownFields(value, allowed);
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      fail(`task.${field}`, 'is required');
    }
  }
  return Object.fromEntries(
    Object.entries(value).map(([field, fieldValue]) => [
      field,
      normalizeField(field, fieldValue),
    ]),
  );
}

function normalizeTaskDefinition(value) {
  return normalizeFields(
    value,
    TASK_CONTRACT_DEFINE_FIELDS,
    ['id', 'title', 'type', 'priority'],
  );
}

function normalizeTaskId(value) {
  return normalizeField('id', value);
}

function normalizeTaskPatch(value) {
  return normalizeFields(value, TASK_CONTRACT_PATCH_FIELDS);
}

function validateDurableTask(value, { metadata = true } = {}) {
  assertKnownFields(value, DURABLE_TASK_ENTRY_FIELDS, 'task ledger entry');
  for (const field of [
    'id',
    'title',
    'type',
    'priority',
    'status',
    'deps',
    'files_modified',
    'stale',
    'acceptance',
    'context_refs',
    'docs_impact',
    'ownership',
    ...(metadata ? ['revision', 'parent_digest', 'digest'] : []),
  ]) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      fail(`task.${field}`, 'is required');
    }
  }
  for (const field of DURABLE_TASK_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    if (value[field] === null
        && ['complexity', 'estimated_days', 'slice_kind'].includes(field)) {
      fail(`task.${field}`, 'must be omitted instead of null in a durable ledger entry');
    }
    if (field === 'status') {
      normalizeEnum(value.status, 'task.status', TASK_DURABLE_STATUSES);
    } else if (field === 'stale') {
      if (typeof value.stale !== 'boolean') fail('task.stale', 'must be a boolean');
    } else {
      normalizeField(field, value[field]);
    }
  }
  if (metadata) {
    if (!Number.isInteger(value.revision) || value.revision < 1) {
      fail('task.revision', 'must be an integer greater than zero');
    }
    if (value.parent_digest !== null
        && (typeof value.parent_digest !== 'string' || !SHA256_PATTERN.test(value.parent_digest))) {
      fail('task.parent_digest', 'must be null or a lowercase sha256 digest');
    }
    if (typeof value.digest !== 'string' || !SHA256_PATTERN.test(value.digest)) {
      fail('task.digest', 'must be a lowercase sha256 digest');
    }
  }
  return value;
}

module.exports = {
  DURABLE_TASK_FIELDS,
  TASK_CONTRACT_DEFINE_FIELDS,
  TASK_CONTRACT_PATCH_FIELDS,
  TASK_DURABLE_STATUSES,
  TaskContractError,
  normalizeTaskDefinition,
  normalizeTaskId,
  normalizeTaskPatch,
  validateDurableTask,
};
