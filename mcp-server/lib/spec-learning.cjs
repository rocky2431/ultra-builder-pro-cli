'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ops = require('./state-ops.cjs');

const CANDIDATE_ID = /^[a-zA-Z0-9_-]+$/;
const TRANSITIONS = Object.freeze({
  proposed: new Set(['approved', 'rejected']),
  approved: new Set(['applied', 'rejected']),
  rejected: new Set(),
  applied: new Set(),
});

class SpecLearningError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SpecLearningError';
    this.code = code;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function rowToCandidate(row) {
  if (!row) return null;
  let evidence;
  try { evidence = JSON.parse(row.evidence_json); }
  catch (error) {
    throw new SpecLearningError('STATE_CORRUPT', `invalid spec-learning evidence: ${error.message}`);
  }
  let applyEvidence;
  try { applyEvidence = JSON.parse(row.apply_evidence_json || '[]'); }
  catch (error) {
    throw new SpecLearningError('STATE_CORRUPT', `invalid spec-learning apply evidence: ${error.message}`);
  }
  const candidate = { ...row, evidence, apply_evidence: applyEvidence };
  delete candidate.evidence_json;
  delete candidate.apply_evidence_json;
  return candidate;
}

function listSpecLearning(db, changeId) {
  return db.prepare(
    'SELECT * FROM spec_learning_candidates WHERE change_id = ? ORDER BY proposed_at ASC, id ASC',
  ).all(changeId).map(rowToCandidate);
}

function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, file);
}

function upsertProjectionArtifact(db, change, rootDir, candidates) {
  const file = path.resolve(rootDir, change.artifact_root, 'spec-learning.json');
  const generatedAt = candidates.reduce((latest, candidate) => (
    [candidate.applied_at, candidate.resolved_at, candidate.proposed_at]
      .filter(Boolean)
      .reduce((value, timestamp) => (timestamp > value ? timestamp : value), latest)
  ), '1970-01-01T00:00:00.000Z');
  const payload = {
    schema_version: '1.0',
    source: '.ultra/state.db',
    change_id: change.id,
    generated_at: generatedAt,
    candidates,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  writeAtomic(file, serialized);
  const relative = path.relative(rootDir, file);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  db.prepare(
    `INSERT INTO artifacts (id, change_id, kind, path, content_hash, metadata_json)
     VALUES (?, ?, 'spec_learning', ?, ?, ?)
     ON CONFLICT(change_id, kind, path) DO UPDATE SET
       content_hash = excluded.content_hash,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`,
  ).run(
    `art-${crypto.randomUUID().slice(0, 12)}`, change.id, relative, hash,
    JSON.stringify({ candidates: candidates.length }),
  );
  return { path: file, hash };
}

function mutableChange(db, changeId) {
  const change = db.prepare('SELECT * FROM changes WHERE id = ?').get(changeId);
  if (!change) throw new SpecLearningError('CHANGE_NOT_FOUND', `change ${changeId} not found`);
  if (!['active', 'blocked'].includes(change.status)) {
    throw new SpecLearningError(
      'CHANGE_NOT_MUTABLE', `change ${changeId} is ${change.status}; learning must resolve before convergence`,
    );
  }
  return change;
}

function normalizeEvidence(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new SpecLearningError('VALIDATION_ERROR', 'spec-learning evidence must be non-empty strings');
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function targetFile(rootDir, targetRef) {
  const separator = String(targetRef || '').lastIndexOf('#');
  if (separator <= 0 || separator === targetRef.length - 1) {
    throw new SpecLearningError('VALIDATION_ERROR', 'target_ref must use project-relative path#anchor');
  }
  const relative = targetRef.slice(0, separator);
  if (path.isAbsolute(relative)) {
    throw new SpecLearningError('VALIDATION_ERROR', 'target_ref must be project-relative');
  }
  const root = path.resolve(rootDir);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new SpecLearningError('VALIDATION_ERROR', 'target_ref escapes the project root');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new SpecLearningError('LEARNING_TARGET_MISSING', `target file does not exist: ${relative}`);
  }
  return { file, relative };
}

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyApplyEvidence(input, current, rootDir) {
  const appliedRef = typeof input.applied_ref === 'string' ? input.applied_ref.trim() : '';
  const beforeDigest = typeof input.before_digest === 'string' ? input.before_digest.trim() : '';
  const afterDigest = typeof input.after_digest === 'string' ? input.after_digest.trim() : '';
  const evidence = normalizeEvidence(input.apply_evidence);
  if (appliedRef !== current.target_ref || !/^[0-9a-f]{64}$/.test(beforeDigest)
    || !/^[0-9a-f]{64}$/.test(afterDigest) || beforeDigest === afterDigest
    || evidence.length === 0) {
    throw new SpecLearningError(
      'LEARNING_APPLY_EVIDENCE_REQUIRED',
      'apply requires the exact target ref, distinct before/after digests, and durable evidence refs',
    );
  }
  if (current.before_digest && current.before_digest !== beforeDigest) {
    throw new SpecLearningError(
      'LEARNING_APPLY_EVIDENCE_MISMATCH', 'before_digest does not match the proposed target state',
    );
  }
  const target = targetFile(rootDir, appliedRef);
  if (digestFile(target.file) !== afterDigest) {
    throw new SpecLearningError(
      'LEARNING_APPLY_EVIDENCE_MISMATCH', 'after_digest does not match the current target file',
    );
  }
  const workflows = require('./workflow-state.cjs');
  try {
    workflows.resolveProjectSourceRef(rootDir, appliedRef, 'applied_ref');
    for (const ref of evidence) workflows.resolveProjectSourceRef(rootDir, ref, 'apply_evidence');
  } catch (error) {
    throw new SpecLearningError(
      'LEARNING_APPLY_EVIDENCE_MISMATCH', `applied target or evidence anchor is invalid: ${error.message}`,
    );
  }
  return { appliedRef, beforeDigest, afterDigest, evidence };
}

function proposeSpecLearning(db, input, { rootDir = process.cwd() } = {}) {
  const change = mutableChange(db, input.change_id);
  const id = String(input.id || `learning-${crypto.randomUUID().slice(0, 12)}`).trim();
  if (!CANDIDATE_ID.test(id)) {
    throw new SpecLearningError('VALIDATION_ERROR', `invalid spec-learning candidate id: ${id}`);
  }
  const targetRef = typeof input.target_ref === 'string' ? input.target_ref.trim() : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
  if (!targetRef || !summary) {
    throw new SpecLearningError('VALIDATION_ERROR', 'target_ref and summary are required');
  }
  if (input.task_id) {
    const task = db.prepare('SELECT change_id FROM tasks WHERE id = ?').get(input.task_id);
    if (!task || task.change_id !== change.id) {
      throw new SpecLearningError('TASK_NOT_FOUND', `task ${input.task_id} is not linked to change ${change.id}`);
    }
  }
  const evidence = normalizeEvidence(input.evidence);
  const proposedTarget = targetFile(rootDir, targetRef);
  const proposedDigest = digestFile(proposedTarget.file);
  const proposedAt = nowIso();
  return ops.tx(db, () => {
    try {
      db.prepare(
        `INSERT INTO spec_learning_candidates
         (id, change_id, task_id, target_ref, summary, evidence_json, proposed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, change.id, input.task_id || null, targetRef, summary, JSON.stringify(evidence), proposedAt);
      db.prepare(
        'UPDATE spec_learning_candidates SET before_digest = ? WHERE id = ? AND change_id = ?',
      ).run(proposedDigest, id, change.id);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw new SpecLearningError('DUPLICATE_LEARNING_ID', `spec-learning candidate ${id} exists`);
      }
      throw error;
    }
    ops.appendEventInTx(db, {
      type: 'spec_learning_proposed', change_id: change.id, task_id: input.task_id || null,
      payload: { candidate_id: id, target_ref: targetRef },
    });
    const candidates = listSpecLearning(db, change.id);
    upsertProjectionArtifact(db, change, rootDir, candidates);
    return candidates.find((candidate) => candidate.id === id);
  });
}

function resolveSpecLearning(db, input, { rootDir = process.cwd() } = {}) {
  const change = mutableChange(db, input.change_id);
  const current = rowToCandidate(db.prepare(
    'SELECT * FROM spec_learning_candidates WHERE id = ? AND change_id = ?',
  ).get(input.candidate_id, change.id));
  if (!current) {
    throw new SpecLearningError('LEARNING_NOT_FOUND', `candidate ${input.candidate_id} not found`);
  }
  const status = { approve: 'approved', reject: 'rejected', apply: 'applied' }[input.decision];
  if (!status) throw new SpecLearningError('VALIDATION_ERROR', `invalid learning decision: ${input.decision}`);
  if (!TRANSITIONS[current.status].has(status)) {
    throw new SpecLearningError(
      'ILLEGAL_LEARNING_TRANSITION', `cannot move candidate ${current.id} from ${current.status} to ${status}`,
    );
  }
  const resolution = typeof input.resolution === 'string' ? input.resolution.trim() : '';
  if (['rejected', 'applied'].includes(status) && !resolution) {
    throw new SpecLearningError('VALIDATION_ERROR', `${input.decision} requires a resolution`);
  }
  const timestamp = nowIso();
  const application = status === 'applied'
    ? verifyApplyEvidence(input, current, rootDir)
    : null;
  return ops.tx(db, () => {
    db.prepare(
      `UPDATE spec_learning_candidates
       SET status = ?, resolution = ?, resolved_at = ?, applied_at = ?, applied_ref = ?,
       before_digest = COALESCE(?, before_digest), after_digest = ?, apply_evidence_json = ?
       WHERE id = ? AND change_id = ?`,
    ).run(
      status, resolution || null, timestamp, status === 'applied' ? timestamp : null,
      application?.appliedRef || null, application?.beforeDigest || null,
      application?.afterDigest || null, JSON.stringify(application?.evidence || []),
      current.id, change.id,
    );
    ops.appendEventInTx(db, {
      type: 'spec_learning_resolved', change_id: change.id, task_id: current.task_id,
      payload: { candidate_id: current.id, decision: input.decision, status },
    });
    const candidates = listSpecLearning(db, change.id);
    upsertProjectionArtifact(db, change, rootDir, candidates);
    return candidates.find((candidate) => candidate.id === current.id);
  });
}

module.exports = {
  SpecLearningError,
  listSpecLearning,
  proposeSpecLearning,
  resolveSpecLearning,
};
