'use strict';

const crypto = require('node:crypto');

const ops = require('./state-ops.cjs');
const canonical = require('./canonical-json.cjs');

const STAGES = new Set(['init', 'research', 'change', 'plan', 'dev', 'test', 'review', 'deliver']);
const SCOPE_KEYS = Object.freeze([
  ['task_id', 'task'],
  ['change_id', 'change'],
  ['baseline_id', 'baseline'],
  ['project_id', 'project'],
]);

class StageCheckpointError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'StageCheckpointError';
    this.code = code;
    if (details) this.details = details;
  }
}

function parseJson(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}

function normalizeScope(scope = {}) {
  const matches = SCOPE_KEYS.filter(([key]) => (
    typeof scope[key] === 'string' && scope[key].trim()
  ));
  if (matches.length !== 1) {
    throw new StageCheckpointError(
      'VALIDATION_ERROR',
      'checkpoint scope must contain exactly one of project_id, baseline_id, change_id, or task_id',
    );
  }
  const [key, type] = matches[0];
  return { type, id: scope[key].trim() };
}

function validateStage(stage) {
  if (!STAGES.has(stage)) {
    throw new StageCheckpointError('VALIDATION_ERROR', `unsupported checkpoint stage: ${stage}`);
  }
}

function normalizeDiagnostics(value) {
  if (!Array.isArray(value)) {
    throw new StageCheckpointError('VALIDATION_ERROR', 'diagnostics must be an array');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new StageCheckpointError('VALIDATION_ERROR', `diagnostics[${index}] must be an object`);
    }
    const code = String(item.code || '').trim();
    if (!code) {
      throw new StageCheckpointError('VALIDATION_ERROR', `diagnostics[${index}].code is required`);
    }
    const severity = item.severity || 'needs_attention';
    if (!['warning', 'needs_attention', 'hard_conflict'].includes(severity)) {
      throw new StageCheckpointError(
        'VALIDATION_ERROR',
        `diagnostics[${index}].severity is invalid`,
      );
    }
    return {
      code,
      severity,
      ...(item.message ? { message: String(item.message) } : {}),
      ...(item.details === undefined ? {} : { details: item.details }),
    };
  });
}

function checkpointDigest(value) {
  return canonical.digest({
    stage: value.stage,
    scope_type: value.scope_type,
    scope_id: value.scope_id,
    revision: value.revision,
    payload: value.payload,
    evidence: value.evidence,
    diagnostics: value.diagnostics,
    context_envelope_id: value.context_envelope_id || null,
    supersedes_id: value.supersedes_id || null,
  });
}

function rowToCheckpoint(row) {
  if (!row) return null;
  const checkpoint = {
    id: row.id,
    stage: row.stage,
    scope: { [`${row.scope_type}_id`]: row.scope_id },
    scope_type: row.scope_type,
    scope_id: row.scope_id,
    revision: row.revision,
    status: row.status,
    payload: parseJson(row.payload_json, {}),
    evidence: parseJson(row.evidence_json, []),
    diagnostics: parseJson(row.diagnostics_json, []),
    context_envelope_id: row.context_envelope_id,
    digest: row.digest,
    supersedes_id: row.supersedes_id,
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    accepted_at: row.accepted_at,
  };
  const actual = checkpointDigest(checkpoint);
  if (actual !== checkpoint.digest) {
    throw new StageCheckpointError(
      'CHECKPOINT_DIGEST_MISMATCH',
      `Stage Checkpoint database authority is corrupt: ${checkpoint.id}`,
      { expected: checkpoint.digest, actual },
    );
  }
  return checkpoint;
}

function readCheckpoint(db, id) {
  return rowToCheckpoint(db.prepare('SELECT * FROM stage_checkpoints WHERE id = ?').get(id));
}

function listCheckpoints(db, { stage, scope, status, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (stage) { validateStage(stage); clauses.push('stage = ?'); params.push(stage); }
  if (scope) {
    const normalized = normalizeScope(scope);
    clauses.push('scope_type = ?', 'scope_id = ?');
    params.push(normalized.type, normalized.id);
  }
  if (status) { clauses.push('status = ?'); params.push(status); }
  const bounded = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return db.prepare(
    `SELECT * FROM stage_checkpoints
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY stage, scope_type, scope_id, revision DESC
     LIMIT ?`,
  ).all(...params, bounded).map(rowToCheckpoint);
}

function existingByIdempotency(db, idempotencyKey) {
  if (!idempotencyKey) return null;
  return rowToCheckpoint(
    db.prepare('SELECT * FROM stage_checkpoints WHERE idempotency_key = ?').get(idempotencyKey),
  );
}

function saveDraft(db, input = {}) {
  validateStage(input.stage);
  const scope = normalizeScope(input.scope);
  const idempotencyKey = String(input.idempotency_key || '').trim();
  if (!idempotencyKey) {
    throw new StageCheckpointError('VALIDATION_ERROR', 'idempotency_key is required');
  }
  const existingRetry = existingByIdempotency(db, idempotencyKey);
  if (existingRetry) return existingRetry;
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload : {};
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const diagnostics = normalizeDiagnostics(input.diagnostics || []);
  return ops.tx(db, () => {
    const draft = db.prepare(
      `SELECT * FROM stage_checkpoints
       WHERE stage = ? AND scope_type = ? AND scope_id = ? AND status = 'draft'
       ORDER BY revision DESC LIMIT 1`,
    ).get(input.stage, scope.type, scope.id);
    if (draft) {
      const value = {
        stage: input.stage,
        scope_type: scope.type,
        scope_id: scope.id,
        revision: draft.revision,
        payload,
        evidence,
        diagnostics,
        context_envelope_id: input.context_envelope_id || null,
        supersedes_id: draft.supersedes_id,
      };
      const digest = checkpointDigest(value);
      db.prepare(
        `UPDATE stage_checkpoints
         SET payload_json = ?, evidence_json = ?, diagnostics_json = ?,
             context_envelope_id = ?, digest = ?, idempotency_key = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      ).run(
        JSON.stringify(payload),
        JSON.stringify(evidence),
        JSON.stringify(diagnostics),
        input.context_envelope_id || null,
        digest,
        idempotencyKey,
        draft.id,
      );
      return readCheckpoint(db, draft.id);
    }
    const accepted = db.prepare(
      `SELECT id, revision FROM stage_checkpoints
       WHERE stage = ? AND scope_type = ? AND scope_id = ? AND status = 'accepted'
       ORDER BY revision DESC LIMIT 1`,
    ).get(input.stage, scope.type, scope.id);
    const revision = (accepted?.revision || 0) + 1;
    const id = `checkpoint-${crypto.randomUUID()}`;
    const value = {
      stage: input.stage,
      scope_type: scope.type,
      scope_id: scope.id,
      revision,
      payload,
      evidence,
      diagnostics,
      context_envelope_id: input.context_envelope_id || null,
      supersedes_id: accepted?.id || null,
    };
    db.prepare(
      `INSERT INTO stage_checkpoints
       (id, stage, scope_type, scope_id, revision, payload_json, evidence_json,
        diagnostics_json, context_envelope_id, digest, supersedes_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.stage,
      scope.type,
      scope.id,
      revision,
      JSON.stringify(payload),
      JSON.stringify(evidence),
      JSON.stringify(diagnostics),
      input.context_envelope_id || null,
      checkpointDigest(value),
      accepted?.id || null,
      idempotencyKey,
    );
    return readCheckpoint(db, id);
  });
}

function acceptDraft(db, input = {}) {
  const idempotencyKey = String(input.idempotency_key || '').trim();
  if (!idempotencyKey) {
    throw new StageCheckpointError('VALIDATION_ERROR', 'idempotency_key is required');
  }
  return ops.tx(db, () => {
    const row = db.prepare('SELECT * FROM stage_checkpoints WHERE id = ?').get(input.id);
    if (!row) throw new StageCheckpointError('CHECKPOINT_NOT_FOUND', `checkpoint not found: ${input.id}`);
    if (row.status === 'accepted') return rowToCheckpoint(row);
    if (row.status !== 'draft') {
      throw new StageCheckpointError(
        'CHECKPOINT_NOT_MUTABLE',
        `checkpoint ${input.id} is ${row.status}`,
      );
    }
    if (row.supersedes_id) {
      db.prepare(
        `UPDATE stage_checkpoints SET status = 'superseded',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND status = 'accepted'`,
      ).run(row.supersedes_id);
    }
    db.prepare(
      `UPDATE stage_checkpoints
       SET status = 'accepted', accepted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).run(row.id);
    const accepted = readCheckpoint(db, row.id);
    ops.appendEventInTx(db, {
      type: 'ultra_checkpoint_accepted',
      change_id: accepted.scope_type === 'change' ? accepted.scope_id : null,
      task_id: accepted.scope_type === 'task' ? accepted.scope_id : null,
      payload: {
        checkpoint_id: accepted.id,
        stage: accepted.stage,
        revision: accepted.revision,
        digest: accepted.digest,
      },
    });
    return accepted;
  });
}

function currentCheckpoint(db, stage, scope, { includeDraft = true } = {}) {
  validateStage(stage);
  const normalized = normalizeScope(scope);
  const statuses = includeDraft ? "('draft','accepted')" : "('accepted')";
  return rowToCheckpoint(db.prepare(
    `SELECT * FROM stage_checkpoints
     WHERE stage = ? AND scope_type = ? AND scope_id = ? AND status IN ${statuses}
     ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, revision DESC LIMIT 1`,
  ).get(stage, normalized.type, normalized.id));
}

module.exports = {
  StageCheckpointError,
  STAGES,
  normalizeScope,
  readCheckpoint,
  listCheckpoints,
  saveDraft,
  acceptDraft,
  currentCheckpoint,
  checkpointDigest,
};
