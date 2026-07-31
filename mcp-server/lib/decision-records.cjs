'use strict';

const canonical = require('./canonical-json.cjs');
const artifactRegistry = require('./artifact-registry.cjs');
const ops = require('./state-ops.cjs');
const {
  restoreManagedFile,
  snapshotManagedFile,
  writeManagedJson,
} = require('./managed-file-write.cjs');
const { readStableProjectFile } = require('./safe-project-file.cjs');

const DECISION_FIELDS = new Set([
  'id', 'scope', 'question', 'recommendation', 'selection', 'effects',
  'non_goals', 'owner', 'source', 'provenance', 'applied_refs', 'supersedes_id',
]);

class DecisionRecordError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DecisionRecordError';
    this.code = code;
    if (details) this.details = details;
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new DecisionRecordError('VALIDATION_ERROR', `${field} is required`);
  return normalized;
}

function assertExactFields(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new DecisionRecordError(
      'VALIDATION_ERROR', `${field}.${unknown[0]} is not allowed`,
    );
  }
}

function assertJsonValue(value, field, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must contain valid JSON values`);
  }
  if (typeof value !== 'object') {
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must contain valid JSON values`);
  }
  if (seen.has(value)) {
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must not contain circular references`);
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new DecisionRecordError(
        'VALIDATION_ERROR', `${field} must contain only JSON objects`,
      );
    }
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, seen));
  } else {
    Object.entries(value).forEach(([key, item]) => (
      assertJsonValue(item, `${field}.${key}`, seen)
    ));
  }
  seen.delete(value);
}

function plainObject(value, field) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must be an object`);
  }
  assertJsonValue(value, field);
  return JSON.parse(JSON.stringify(value));
}

function stringArray(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DecisionRecordError('VALIDATION_ERROR', `${field} must be an array`);
  }
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function normalizeScope(scope = {}) {
  assertExactFields(scope, new Set(['baseline_id', 'change_id']), 'scope');
  const baseline = typeof scope.baseline_id === 'string' ? scope.baseline_id.trim() : '';
  const change = typeof scope.change_id === 'string' ? scope.change_id.trim() : '';
  if (Boolean(baseline) === Boolean(change)) {
    throw new DecisionRecordError(
      'VALIDATION_ERROR',
      'decision scope must contain exactly one of baseline_id or change_id',
    );
  }
  return baseline
    ? { type: 'baseline', id: baseline }
    : { type: 'change', id: change };
}

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function rowToDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    scope: { [`${row.scope_type}_id`]: row.scope_id },
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    question: row.question,
    recommendation: row.recommendation,
    selection: row.selection,
    effects: parseJson(row.effects_json, {}),
    non_goals: parseJson(row.non_goals_json, []),
    owner: row.owner,
    source: row.source,
    provenance: parseJson(row.provenance_json, {}),
    applied_refs: parseJson(row.applied_refs_json, []),
    status: row.status,
    digest: row.digest,
    artifact_path: row.artifact_path,
    supersedes_id: row.supersedes_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function readDecision(db, id) {
  return rowToDecision(db.prepare('SELECT * FROM decision_records WHERE id = ?').get(id));
}

function decisionValue(decision) {
  return {
    schema_version: '1.0',
    id: decision.id,
    scope: { type: decision.scope_type, id: decision.scope_id },
    question: decision.question,
    recommendation: decision.recommendation,
    selection: decision.selection,
    effects: decision.effects,
    non_goals: decision.non_goals,
    owner: decision.owner,
    source: decision.source,
    provenance: decision.provenance,
    applied_refs: decision.applied_refs,
    status: decision.status,
    supersedes_id: decision.supersedes_id || null,
  };
}

function readDecisionArtifact(db, id, { rootDir = process.cwd() } = {}) {
  const decision = readDecision(db, id);
  if (!decision) {
    throw new DecisionRecordError('DECISION_NOT_FOUND', `decision not found: ${id}`);
  }
  const computed = canonical.digest(decisionValue(decision));
  if (computed !== decision.digest) {
    throw new DecisionRecordError(
      'DECISION_DIGEST_MISMATCH',
      `Decision Record database authority is corrupt: ${id}`,
      { expected: decision.digest, actual: computed },
    );
  }
  const read = readStableProjectFile(rootDir, decision.artifact_path, { encoding: 'utf8' });
  const artifact = db.prepare(
    `SELECT digest FROM artifacts
     WHERE path = ? AND status <> 'archived'
     ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
  ).get(decision.artifact_path) || db.prepare(
    `SELECT digest FROM artifacts
     WHERE path = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
  ).get(decision.artifact_path);
  if (!artifact?.digest || artifact.digest !== read.digest) {
    throw new DecisionRecordError(
      'DECISION_FILE_DRIFT',
      `Decision Record bytes no longer match the Artifact Registry: ${id}`,
      {
        path: decision.artifact_path,
        expected: artifact?.digest || null,
        actual: read.digest,
      },
    );
  }
  let document;
  try { document = JSON.parse(read.text); }
  catch (cause) {
    throw new DecisionRecordError(
      'DECISION_ARTIFACT_INVALID',
      `Decision Record is not valid JSON: ${decision.artifact_path}`,
      { cause: cause.message },
    );
  }
  const { digest: documentDigest, ...documentValue } = document;
  if (documentDigest !== decision.digest
      || canonical.digest(documentValue) !== decision.digest) {
    throw new DecisionRecordError(
      'DECISION_DIGEST_MISMATCH',
      `Decision Record file does not match its accepted authority: ${id}`,
    );
  }
  return { ...decision, file_digest: read.digest };
}

function listAcceptedDecisions(
  db,
  scope = {},
  { limit = 100, rootDir = null, validateFiles = false } = {},
) {
  const normalized = normalizeScope(scope);
  const rows = db.prepare(
    `SELECT * FROM decision_records
     WHERE scope_type = ? AND scope_id = ? AND status = 'accepted'
     ORDER BY updated_at DESC, id ASC LIMIT ?`,
  ).all(
    normalized.type,
    normalized.id,
    Math.min(Math.max(Number(limit) || 100, 1), 500),
  ).map(rowToDecision);
  return validateFiles
    ? rows.map((row) => readDecisionArtifact(db, row.id, { rootDir }))
    : rows;
}

function normalizeAppliedRefs(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DecisionRecordError('VALIDATION_ERROR', 'applied_refs must be an array');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new DecisionRecordError('VALIDATION_ERROR', `applied_refs[${index}] must be an object`);
    }
    assertExactFields(
      item,
      new Set(['ref', 'field', 'digest']),
      `applied_refs[${index}]`,
    );
    return {
      ref: requiredText(item.ref, `applied_refs[${index}].ref`),
      ...(item.field !== undefined
        ? { field: requiredText(item.field, `applied_refs[${index}].field`) }
        : {}),
      ...(item.digest !== undefined
        ? { digest: requiredText(item.digest, `applied_refs[${index}].digest`) }
        : {}),
    };
  });
}

function artifactPath(scope, id) {
  return scope.type === 'baseline'
    ? `.ultra/decisions/baseline/${id}.json`
    : `.ultra/changes/active/${scope.id}/decisions/${id}.json`;
}

function acceptDecision(db, input = {}, { rootDir = process.cwd() } = {}) {
  assertExactFields(input, DECISION_FIELDS, 'decision');
  const scope = normalizeScope(input.scope);
  const supersedesId = input.supersedes_id === undefined || input.supersedes_id === null
    ? null
    : requiredText(input.supersedes_id, 'supersedes_id');
  const value = {
    schema_version: '1.0',
    id: requiredText(input.id, 'id'),
    scope: { type: scope.type, id: scope.id },
    question: requiredText(input.question, 'question'),
    recommendation: requiredText(input.recommendation, 'recommendation'),
    selection: requiredText(input.selection, 'selection'),
    effects: plainObject(input.effects, 'effects'),
    non_goals: stringArray(input.non_goals, 'non_goals'),
    owner: requiredText(input.owner, 'owner'),
    source: requiredText(input.source, 'source'),
    provenance: plainObject(input.provenance, 'provenance'),
    applied_refs: normalizeAppliedRefs(input.applied_refs),
    status: 'accepted',
    supersedes_id: supersedesId,
  };
  const digest = canonical.digest(value);
  const document = { ...value, digest };
  const relative = artifactPath(scope, value.id);
  const existing = readDecision(db, value.id);
  if (existing) {
    if (existing.digest !== digest) {
      throw new DecisionRecordError(
        'DECISION_ID_CONFLICT',
        `decision ${value.id} already exists with different content`,
      );
    }
    return existing;
  }
  if (value.supersedes_id) {
    const prior = readDecision(db, value.supersedes_id);
    if (!prior) {
      throw new DecisionRecordError(
        'DECISION_NOT_FOUND',
        `superseded decision not found: ${value.supersedes_id}`,
      );
    }
    if (prior.scope_type !== scope.type || prior.scope_id !== scope.id) {
      throw new DecisionRecordError(
        'DECISION_SCOPE_CONFLICT',
        'a decision can only supersede another decision in the same scope',
      );
    }
    if (prior.status !== 'accepted') {
      throw new DecisionRecordError(
        'DECISION_NOT_SUPERSEDEABLE',
        `decision ${value.supersedes_id} is ${prior.status}`,
      );
    }
  }
  artifactRegistry.assertArtifactOwner(db, scope.type, scope.id);
  const snapshot = snapshotManagedFile(rootDir, relative);
  const published = writeManagedJson(rootDir, relative, document);
  try {
    return ops.tx(db, () => {
      if (value.supersedes_id) {
        db.prepare(
          `UPDATE decision_records SET status = 'superseded',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND status = 'accepted'`,
        ).run(value.supersedes_id);
      }
      db.prepare(
        `INSERT INTO decision_records
         (id, scope_type, scope_id, question, recommendation, selection,
          effects_json, non_goals_json, owner, source, provenance_json,
          applied_refs_json, status, digest, artifact_path, supersedes_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?)`,
      ).run(
        value.id,
        scope.type,
        scope.id,
        value.question,
        value.recommendation,
        value.selection,
        JSON.stringify(value.effects),
        JSON.stringify(value.non_goals),
        value.owner,
        value.source,
        JSON.stringify(value.provenance),
        JSON.stringify(value.applied_refs),
        digest,
        relative,
        value.supersedes_id,
      );
      artifactRegistry.recordArtifactInTx(db, {
        id: `artifact-decision-${value.id}`,
        owner_type: scope.type,
        owner_id: scope.id,
        change_id: scope.type === 'change' ? scope.id : null,
        kind: 'decision_record',
        path: relative,
        content_digest: published.digest,
        source_refs: [{
          type: scope.type,
          id: scope.id,
          relation: 'decided_for',
        }],
        consumer_refs: [{
          type: 'external',
          id: 'ultra-context-consumer',
          relation: 'consumed_by',
        }],
        provenance: {
          writer: 'decision-records',
          decision_digest: digest,
          owner: value.owner,
          source: value.source,
        },
        metadata: {
          decision_id: value.id,
          status: value.status,
          supersedes_id: value.supersedes_id,
        },
      }, { rootDir });
      ops.appendEventInTx(db, {
        type: 'decision_recorded',
        change_id: scope.type === 'change' ? scope.id : null,
        payload: {
          decision_id: value.id,
          scope_type: scope.type,
          scope_id: scope.id,
          digest,
          artifact_path: relative,
          supersedes_id: value.supersedes_id,
        },
      });
      return readDecision(db, value.id);
    });
  } catch (error) {
    try {
      restoreManagedFile(rootDir, snapshot);
    } catch (rollbackError) {
      throw new DecisionRecordError(
        'RECORD_FILE_ROLLBACK_REQUIRED',
        `decision database mutation failed and managed file recovery also failed: ${relative}`,
        { cause: error.message, rollback_error: rollbackError.message },
      );
    }
    throw error;
  }
}

module.exports = {
  DecisionRecordError,
  normalizeScope,
  readDecision,
  readDecisionArtifact,
  decisionValue,
  listAcceptedDecisions,
  acceptDecision,
};
