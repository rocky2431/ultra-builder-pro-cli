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
  const candidate = { ...row, evidence };
  delete candidate.evidence_json;
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
  const proposedAt = nowIso();
  return ops.tx(db, () => {
    try {
      db.prepare(
        `INSERT INTO spec_learning_candidates
         (id, change_id, task_id, target_ref, summary, evidence_json, proposed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, change.id, input.task_id || null, targetRef, summary, JSON.stringify(evidence), proposedAt);
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
  return ops.tx(db, () => {
    db.prepare(
      `UPDATE spec_learning_candidates
       SET status = ?, resolution = ?, resolved_at = ?, applied_at = ?
       WHERE id = ? AND change_id = ?`,
    ).run(
      status, resolution || null, timestamp, status === 'applied' ? timestamp : null,
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
