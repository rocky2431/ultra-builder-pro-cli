'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ops = require('./state-ops.cjs');

const ID = /^[a-zA-Z0-9_-]+$/;
const MODES = new Set(['guided', 'fast', 'autonomous', 'diagnostic']);
const ACTIVE_STATUSES = new Set(['active', 'checkpoint_ready']);

class DecisionDialogueError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DecisionDialogueError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new DecisionDialogueError('VALIDATION_ERROR', `${field} is required`);
  return text;
}

function parseJson(value, field, fallback) {
  if (value == null || value === '') return fallback;
  try { return JSON.parse(value); }
  catch (error) {
    throw new DecisionDialogueError('STATE_CORRUPT', `invalid ${field}: ${error.message}`);
  }
}

function stringList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new DecisionDialogueError('VALIDATION_ERROR', `${field} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function plainObject(value, field, { allowEmpty = true } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (!allowEmpty && Object.keys(value).length === 0)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', `${field} must be an object`);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) {
    throw new DecisionDialogueError('VALIDATION_ERROR', 'options must contain at most three credible alternatives');
  }
  const seen = new Set();
  return value.map((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      throw new DecisionDialogueError('VALIDATION_ERROR', `options[${index}] is invalid`);
    }
    const id = requiredText(option.id, `options[${index}].id`);
    if (!ID.test(id) || seen.has(id)) {
      throw new DecisionDialogueError('VALIDATION_ERROR', `option id is invalid or duplicated: ${id}`);
    }
    seen.add(id);
    return {
      id,
      label: requiredText(option.label, `options[${index}].label`),
      tradeoff: requiredText(option.tradeoff, `options[${index}].tradeoff`),
    };
  });
}

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    thread_id: row.thread_id,
    sequence: row.sequence,
    phase: row.phase,
    question: row.question,
    why_now: row.why_now,
    recommendation: row.recommendation,
    options: parseJson(row.options_json, 'decision_items.options_json', []),
    evidence_refs: parseJson(row.evidence_refs_json, 'decision_items.evidence_refs_json', []),
    dependency_ids: parseJson(row.dependency_ids_json, 'decision_items.dependency_ids_json', []),
    effects: parseJson(row.effects_json, 'decision_items.effects_json', {}),
    blocking: Boolean(row.blocking),
    status: row.status,
    resolution: parseJson(row.resolution_json, 'decision_items.resolution_json', {}),
    supersedes_id: row.supersedes_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  };
}

function readDecisionThread(db, id) {
  const row = db.prepare('SELECT * FROM decision_threads WHERE id = ?').get(id);
  if (!row) return null;
  const items = db.prepare(
    'SELECT * FROM decision_items WHERE thread_id = ? ORDER BY sequence ASC',
  ).all(id).map(rowToItem);
  return {
    id: row.id,
    purpose: row.purpose,
    mode: row.mode,
    status: row.status,
    baseline_id: row.baseline_id,
    change_id: row.change_id,
    workflow_run_id: row.workflow_run_id,
    summary: parseJson(row.summary_json, 'decision_threads.summary_json', {}),
    checkpoint: parseJson(row.checkpoint_json, 'decision_threads.checkpoint_json', {}),
    current_decision: items.find((item) => item.status === 'open') || null,
    items,
    started_at: row.started_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at,
  };
}

function listDecisionThreads(db, filter = {}) {
  const clauses = [];
  const params = {};
  for (const field of ['status', 'mode', 'baseline_id', 'change_id', 'workflow_run_id']) {
    if (filter[field] !== undefined && filter[field] !== null) {
      clauses.push(`${field} = @${field}`);
      params[field] = filter[field];
    }
  }
  const limit = Math.min(Math.max(Number(filter.limit || 100), 1), 500);
  const sql = `SELECT id FROM decision_threads${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, rowid DESC LIMIT @limit`;
  return db.prepare(sql).all({ ...params, limit }).map((row) => readDecisionThread(db, row.id));
}

function assertReference(db, table, id, field) {
  if (!id) return;
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', `${field} does not exist: ${id}`);
  }
}

function startDecisionThread(db, input = {}) {
  const id = requiredText(input.id, 'id');
  if (!ID.test(id)) throw new DecisionDialogueError('VALIDATION_ERROR', `invalid decision thread id: ${id}`);
  const purpose = requiredText(input.purpose, 'purpose');
  const mode = input.mode || 'guided';
  if (!MODES.has(mode)) throw new DecisionDialogueError('VALIDATION_ERROR', `unsupported decision mode: ${mode}`);
  if (!input.baseline_id && !input.change_id && !input.workflow_run_id) {
    throw new DecisionDialogueError(
      'DECISION_AUTHORITY_REQUIRED', 'decision thread requires baseline, change, or workflow authority',
    );
  }
  return ops.tx(db, () => {
    if (db.prepare('SELECT 1 FROM decision_threads WHERE id = ?').get(id)) {
      throw new DecisionDialogueError('DUPLICATE_DECISION_THREAD', `decision thread ${id} already exists`);
    }
    assertReference(db, 'baselines', input.baseline_id, 'baseline_id');
    assertReference(db, 'changes', input.change_id, 'change_id');
    assertReference(db, 'workflow_runs', input.workflow_run_id, 'workflow_run_id');
    let baselineId = input.baseline_id || null;
    let changeId = input.change_id || null;
    if (input.workflow_run_id) {
      const run = db.prepare(
        'SELECT baseline_id, change_id FROM workflow_runs WHERE id = ?',
      ).get(input.workflow_run_id);
      if (input.baseline_id && run.baseline_id && input.baseline_id !== run.baseline_id) {
        throw new DecisionDialogueError('DECISION_AUTHORITY_MISMATCH', 'thread baseline differs from workflow');
      }
      if (input.change_id && run.change_id && input.change_id !== run.change_id) {
        throw new DecisionDialogueError('DECISION_AUTHORITY_MISMATCH', 'thread change differs from workflow');
      }
      baselineId ||= run.baseline_id || null;
      changeId ||= run.change_id || null;
    }
    if (changeId) {
      const changeBaselineId = db.prepare(
        `SELECT baseline_id FROM workflow_runs
         WHERE kind = 'change' AND change_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`,
      ).get(changeId)?.baseline_id || null;
      if (baselineId && changeBaselineId && baselineId !== changeBaselineId) {
        throw new DecisionDialogueError(
          'DECISION_AUTHORITY_MISMATCH', 'thread baseline differs from the owning change workflow',
        );
      }
      baselineId ||= changeBaselineId;
    }
    const duplicate = db.prepare(
      `SELECT id, baseline_id, change_id, workflow_run_id FROM decision_threads
       WHERE status IN ('active', 'checkpoint_ready') ORDER BY updated_at ASC, rowid ASC`,
    ).all().find((thread) => (
      (changeId && thread.change_id === changeId)
      || (!changeId && baselineId && !thread.change_id && thread.baseline_id === baselineId)
      || (input.workflow_run_id && thread.workflow_run_id === input.workflow_run_id)
    ));
    if (duplicate) {
      throw new DecisionDialogueError(
        'DECISION_THREAD_IN_PROGRESS', `decision thread ${duplicate.id} already owns this alignment purpose`,
      );
    }
    const ts = nowIso();
    db.prepare(
      `INSERT INTO decision_threads
       (id, purpose, mode, status, baseline_id, change_id, workflow_run_id,
        summary_json, checkpoint_json, started_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, '{}', ?, ?)`,
    ).run(
      id, purpose, mode, baselineId, changeId,
      input.workflow_run_id || null, '{}', ts, ts,
    );
    ops.appendEventInTx(db, {
      type: 'decision_thread_started', change_id: changeId,
      payload: { thread_id: id, workflow_run_id: input.workflow_run_id || null, mode },
    });
    return readDecisionThread(db, id);
  });
}

function requireMutableThread(db, id) {
  const thread = readDecisionThread(db, id);
  if (!thread) throw new DecisionDialogueError('DECISION_THREAD_NOT_FOUND', `decision thread ${id} not found`);
  if (!ACTIVE_STATUSES.has(thread.status)) {
    throw new DecisionDialogueError('DECISION_THREAD_NOT_MUTABLE', `decision thread ${id} is ${thread.status}`);
  }
  return thread;
}

function normalizeQuestion(input, threadId) {
  const id = requiredText(input.id, 'id');
  if (!ID.test(id)) throw new DecisionDialogueError('VALIDATION_ERROR', `invalid decision id: ${id}`);
  return {
    id,
    thread_id: threadId,
    phase: requiredText(input.phase, 'phase'),
    question: requiredText(input.question, 'question'),
    why_now: requiredText(input.why_now, 'why_now'),
    recommendation: requiredText(input.recommendation, 'recommendation'),
    options: normalizeOptions(input.options),
    evidence_refs: stringList(input.evidence_refs, 'evidence_refs'),
    dependency_ids: stringList(input.dependency_ids, 'dependency_ids'),
    effects: plainObject(input.effects, 'effects', { allowEmpty: false }),
    blocking: input.blocking !== false,
  };
}

function insertQuestionInTx(db, thread, input, supersedesId = null) {
  if (thread.current_decision) {
    throw new DecisionDialogueError(
      'DECISION_ALREADY_OPEN', `answer ${thread.current_decision.id} before opening another decision`,
      { current_decision: thread.current_decision },
    );
  }
  const question = normalizeQuestion(input, thread.id);
  if (db.prepare('SELECT 1 FROM decision_items WHERE id = ?').get(question.id)) {
    throw new DecisionDialogueError('DUPLICATE_DECISION_ID', `decision ${question.id} already exists`);
  }
  for (const dependencyId of question.dependency_ids) {
    const dependency = db.prepare(
      'SELECT thread_id, status FROM decision_items WHERE id = ?',
    ).get(dependencyId);
    if (!dependency || dependency.thread_id !== thread.id || dependency.status === 'open') {
      throw new DecisionDialogueError(
        'DECISION_DEPENDENCY_UNRESOLVED', `decision dependency is missing or unresolved: ${dependencyId}`,
      );
    }
  }
  const sequence = db.prepare(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM decision_items WHERE thread_id = ?',
  ).get(thread.id).sequence;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO decision_items
     (id, thread_id, sequence, phase, question, why_now, recommendation, options_json,
      evidence_refs_json, dependency_ids_json, effects_json, blocking, status,
      resolution_json, supersedes_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', '{}', ?, ?, ?)`,
  ).run(
    question.id, thread.id, sequence, question.phase, question.question, question.why_now,
    question.recommendation, JSON.stringify(question.options), JSON.stringify(question.evidence_refs),
    JSON.stringify(question.dependency_ids), JSON.stringify(question.effects), question.blocking ? 1 : 0,
    supersedesId, ts, ts,
  );
  db.prepare(
    `UPDATE decision_threads SET status = 'active', checkpoint_json = CASE
       WHEN status = 'confirmed' THEN json_set(checkpoint_json, '$.invalidated', json('true'), '$.invalidated_at', ?)
       ELSE checkpoint_json END, confirmed_at = NULL, updated_at = ? WHERE id = ?`,
  ).run(ts, ts, thread.id);
  ops.appendEventInTx(db, {
    type: 'decision_opened', change_id: thread.change_id,
    payload: { thread_id: thread.id, decision_id: question.id, phase: question.phase },
  });
}

function openDecision(db, input = {}) {
  const threadId = requiredText(input.thread_id, 'thread_id');
  return ops.tx(db, () => {
    const thread = requireMutableThread(db, threadId);
    if (thread.status === 'checkpoint_ready') {
      throw new DecisionDialogueError(
        'DECISION_CHECKPOINT_PENDING', `confirm or revise checkpoint ${threadId} before opening another decision`,
      );
    }
    insertQuestionInTx(db, thread, input);
    return readDecisionThread(db, threadId);
  });
}

function requireOpenItem(db, id) {
  const row = db.prepare('SELECT * FROM decision_items WHERE id = ?').get(id);
  if (!row) throw new DecisionDialogueError('DECISION_NOT_FOUND', `decision ${id} not found`);
  if (row.status !== 'open') {
    throw new DecisionDialogueError('DECISION_NOT_OPEN', `decision ${id} is ${row.status}`);
  }
  return { row, thread: requireMutableThread(db, row.thread_id) };
}

function resolveInTx(db, item, status, resolution) {
  const ts = nowIso();
  const checkpointHistory = appendCheckpointHistory(item.thread.checkpoint);
  db.prepare(
    `UPDATE decision_items SET status = ?, resolution_json = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(status, JSON.stringify(resolution), ts, ts, item.row.id);
  db.prepare(
    "UPDATE decision_threads SET status = 'active', checkpoint_json = ?, updated_at = ? WHERE id = ?",
  ).run(
    JSON.stringify(checkpointHistory.length > 0 ? { history: checkpointHistory } : {}),
    ts, item.row.thread_id,
  );
  ops.appendEventInTx(db, {
    type: 'decision_resolved', change_id: item.thread.change_id,
    payload: { thread_id: item.row.thread_id, decision_id: item.row.id, status },
  });
  return readDecisionThread(db, item.row.thread_id);
}

function resolveDecision(db, input = {}) {
  return ops.tx(db, () => {
    const item = requireOpenItem(db, requiredText(input.id, 'id'));
    return resolveInTx(db, item, 'answered', {
      authority: 'owner',
      decision: requiredText(input.decision, 'decision'),
      rationale: requiredText(input.rationale, 'rationale'),
      decided_by: requiredText(input.decided_by, 'decided_by'),
      resolved_at: nowIso(),
    });
  });
}

function delegateDecision(db, input = {}) {
  return ops.tx(db, () => {
    const item = requireOpenItem(db, requiredText(input.id, 'id'));
    const guardrails = stringList(input.guardrails, 'guardrails');
    if (guardrails.length === 0) {
      throw new DecisionDialogueError('VALIDATION_ERROR', 'delegated decisions require at least one guardrail');
    }
    return resolveInTx(db, item, 'delegated', {
      authority: 'delegated',
      delegated_to: requiredText(input.delegated_to, 'delegated_to'),
      decision: requiredText(input.decision, 'decision'),
      rationale: requiredText(input.rationale, 'rationale'),
      guardrails,
      resolved_at: nowIso(),
    });
  });
}

function deferDecision(db, input = {}) {
  return ops.tx(db, () => {
    const item = requireOpenItem(db, requiredText(input.id, 'id'));
    return resolveInTx(db, item, 'deferred', {
      authority: 'owner',
      reason: requiredText(input.reason, 'reason'),
      consequences: requiredText(input.consequences, 'consequences'),
      revisit_condition: requiredText(input.revisit_condition, 'revisit_condition'),
      resolved_at: nowIso(),
    });
  });
}

function supersedeDecision(db, input = {}) {
  return ops.tx(db, () => {
    const id = requiredText(input.id, 'id');
    const row = db.prepare('SELECT * FROM decision_items WHERE id = ?').get(id);
    if (!row) throw new DecisionDialogueError('DECISION_NOT_FOUND', `decision ${id} not found`);
    if (!['answered', 'delegated', 'deferred'].includes(row.status)) {
      throw new DecisionDialogueError('DECISION_NOT_SUPERSEDEABLE', `decision ${id} is ${row.status}`);
    }
    const thread = readDecisionThread(db, row.thread_id);
    if (thread.current_decision) {
      throw new DecisionDialogueError(
        'DECISION_ALREADY_OPEN', `answer ${thread.current_decision.id} before superseding another decision`,
      );
    }
    const replacement = plainObject(input.replacement, 'replacement', { allowEmpty: false });
    const reason = requiredText(input.reason, 'reason');
    const ts = nowIso();
    const priorResolution = parseJson(row.resolution_json, 'decision_items.resolution_json', {});
    db.prepare(
      `UPDATE decision_items SET status = 'superseded', resolution_json = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify({ ...priorResolution, superseded_by: replacement.id, supersede_reason: reason }), ts, id);
    if (thread.status === 'confirmed') {
      db.prepare(
        `UPDATE decision_threads SET status = 'active', confirmed_at = NULL,
         checkpoint_json = json_set(checkpoint_json, '$.invalidated', json('true'),
           '$.invalidated_at', ?, '$.invalidation_reason', ?), updated_at = ? WHERE id = ?`,
      ).run(ts, reason, ts, thread.id);
    }
    insertQuestionInTx(db, readDecisionThread(db, thread.id), replacement, id);
    return readDecisionThread(db, thread.id);
  });
}

function decisionDigest(items) {
  const authority = items.filter((item) => item.status !== 'superseded').map((item) => ({
    id: item.id,
    sequence: item.sequence,
    status: item.status,
    resolution: item.resolution,
    effects: item.effects,
  }));
  return crypto.createHash('sha256').update(JSON.stringify(authority)).digest('hex');
}

function appendCheckpointHistory(checkpoint) {
  const history = Array.isArray(checkpoint?.history) ? [...checkpoint.history] : [];
  if (!checkpoint?.confirmed_at) return history;
  const { history: _priorHistory, ...prior } = checkpoint;
  history.push(prior);
  return history;
}

function inspectCheckpoint(thread, { rootDir = process.cwd(), requireArtifact = false } = {}) {
  const failures = [];
  if (thread.status !== 'confirmed') {
    failures.push({ code: 'DECISION_CHECKPOINT_NOT_CONFIRMED', thread_id: thread.id });
    return { valid: false, failures };
  }
  if (thread.checkpoint.invalidated
    || thread.checkpoint.decision_digest !== decisionDigest(thread.items)) {
    failures.push({ code: 'DECISION_CHECKPOINT_STALE', thread_id: thread.id });
  }
  const artifacts = Array.isArray(thread.checkpoint.artifacts) ? thread.checkpoint.artifacts : [];
  if (requireArtifact && artifacts.length === 0) {
    failures.push({ code: 'DECISION_CHECKPOINT_ARTIFACT_REQUIRED', thread_id: thread.id });
  }
  const root = path.resolve(rootDir);
  for (const artifact of artifacts) {
    const relative = typeof artifact?.path === 'string' ? artifact.path : '';
    const file = relative ? path.resolve(root, relative) : null;
    const inside = file && (file === root || file.startsWith(`${root}${path.sep}`));
    const actual = inside && fs.existsSync(file) && fs.statSync(file).isFile()
      ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
    if (!inside || actual !== artifact.digest) {
      failures.push({
        code: 'DECISION_CHECKPOINT_ARTIFACT_STALE', thread_id: thread.id,
        path: relative || null, expected: artifact?.digest || null, actual,
      });
    }
  }
  return { valid: failures.length === 0, failures };
}

function assertConfirmedDecisionCheckpoint(db, id, options = {}) {
  const thread = readDecisionThread(db, requiredText(id, 'id'));
  if (!thread) {
    throw new DecisionDialogueError('DECISION_THREAD_NOT_FOUND', `decision thread ${id} not found`);
  }
  const health = inspectCheckpoint(thread, options);
  if (!health.valid) {
    throw new DecisionDialogueError(
      'DECISION_CHECKPOINT_STALE', `decision checkpoint ${id} is not current`, health,
    );
  }
  return thread;
}

function safeArtifact(rootDir, artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', 'checkpoint artifact is invalid');
  }
  const relative = requiredText(artifact.path, 'artifacts.path');
  if (path.isAbsolute(relative)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', 'checkpoint artifact path must be project-relative');
  }
  const root = path.resolve(rootDir);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', `checkpoint artifact escapes project root: ${relative}`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new DecisionDialogueError('DECISION_ARTIFACT_MISSING', `checkpoint artifact is missing: ${relative}`);
  }
  return {
    path: relative,
    kind: requiredText(artifact.kind, 'artifacts.kind'),
    digest: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  };
}

function checkpointDecisionThread(db, input = {}, { rootDir = process.cwd() } = {}) {
  const id = requiredText(input.id, 'id');
  const action = input.action;
  if (!['prepare', 'confirm'].includes(action)) {
    throw new DecisionDialogueError('VALIDATION_ERROR', 'checkpoint action must be prepare or confirm');
  }
  return ops.tx(db, () => {
    const thread = readDecisionThread(db, id);
    if (!thread) {
      throw new DecisionDialogueError('DECISION_THREAD_NOT_FOUND', `decision thread ${id} not found`);
    }
    if (thread.status === 'cancelled') {
      throw new DecisionDialogueError('DECISION_THREAD_NOT_MUTABLE', `decision thread ${id} is cancelled`);
    }
    const open = thread.items.find((item) => item.status === 'open');
    const deferredBlocking = thread.items.filter((item) => item.blocking && item.status === 'deferred');
    if (open || deferredBlocking.length > 0 || thread.items.length === 0) {
      const blockers = [
        ...(open ? [`DECISION_AWAITING_OWNER:${open.id}`] : []),
        ...deferredBlocking.map((item) => `DECISION_DEFERRED_BLOCKING:${item.id}`),
        ...(thread.items.length === 0 ? ['DECISION_THREAD_EMPTY'] : []),
      ];
      throw new DecisionDialogueError(
        'DECISION_ALIGNMENT_BLOCKING', `decision thread ${id} is not ready for checkpoint`, { blockers },
      );
    }
    const digest = decisionDigest(thread.items);
    const ts = nowIso();
    if (action === 'prepare') {
      const summary = requiredText(input.summary, 'summary');
      const history = appendCheckpointHistory(thread.checkpoint);
      db.prepare(
        `UPDATE decision_threads SET status = 'checkpoint_ready', summary_json = ?,
         checkpoint_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        JSON.stringify({ text: summary }),
        JSON.stringify({ decision_digest: digest, summary, prepared_at: ts, history }), ts, id,
      );
      ops.appendEventInTx(db, {
        type: 'decision_checkpoint_prepared', change_id: thread.change_id,
        payload: { thread_id: id, decision_digest: digest },
      });
      return readDecisionThread(db, id);
    }
    if (thread.status !== 'checkpoint_ready' || thread.checkpoint.decision_digest !== digest) {
      throw new DecisionDialogueError(
        'DECISION_CHECKPOINT_STALE', `decision checkpoint ${id} is missing or stale`,
      );
    }
    const artifacts = input.artifacts === undefined
      ? [] : input.artifacts.map((artifact) => safeArtifact(rootDir, artifact));
    const noArtifactReason = input.no_artifact_reason == null
      ? null : requiredText(input.no_artifact_reason, 'no_artifact_reason');
    if (artifacts.length === 0 && !noArtifactReason) {
      throw new DecisionDialogueError(
        'DECISION_ARTIFACT_REQUIRED', 'checkpoint confirmation requires artifacts or no_artifact_reason',
      );
    }
    if (artifacts.length === 0 && (thread.change_id || thread.workflow_run_id)) {
      throw new DecisionDialogueError(
        'DECISION_ARTIFACT_REQUIRED',
        'change- and workflow-bound checkpoints require at least one current artifact',
      );
    }
    const checkpoint = {
      ...thread.checkpoint,
      decision_digest: digest,
      approved_by: requiredText(input.approved_by, 'approved_by'),
      approval_note: requiredText(input.approval_note, 'approval_note'),
      artifacts,
      no_artifact_reason: noArtifactReason,
      confirmed_at: ts,
    };
    db.prepare(
      `UPDATE decision_threads SET status = 'confirmed', checkpoint_json = ?,
       confirmed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(checkpoint), ts, ts, id);
    ops.appendEventInTx(db, {
      type: 'decision_checkpoint_confirmed', change_id: thread.change_id,
      payload: { thread_id: id, decision_digest: digest, artifact_count: artifacts.length },
    });
    return readDecisionThread(db, id);
  });
}

function decisionGate(db, bindings = {}, { rootDir = process.cwd() } = {}) {
  const clauses = [];
  const params = {};
  if (bindings.workflow_run_id) {
    clauses.push('workflow_run_id = @workflow_run_id');
    params.workflow_run_id = bindings.workflow_run_id;
  }
  if (bindings.change_id) {
    clauses.push('change_id = @change_id');
    params.change_id = bindings.change_id;
  }
  if (bindings.baseline_id) {
    clauses.push('(baseline_id = @baseline_id AND change_id IS NULL AND workflow_run_id IS NULL)');
    params.baseline_id = bindings.baseline_id;
  }
  if (clauses.length === 0) return { ready: true, blockers: [], thread: null, current_decision: null };
  const rows = db.prepare(
    `SELECT id FROM decision_threads
     WHERE status IN ('active', 'checkpoint_ready', 'confirmed') AND (${clauses.join(' OR ')})
     ORDER BY updated_at ASC, rowid ASC`,
  ).all(params);
  const blockers = [];
  let selected = null;
  for (const row of rows) {
    const thread = readDecisionThread(db, row.id);
    if (thread.status === 'confirmed') {
      const checkpointHealth = inspectCheckpoint(thread, { rootDir });
      if (!checkpointHealth.valid) {
        selected ||= thread;
        blockers.push(`DECISION_CHECKPOINT_ARTIFACT_STALE:${thread.id}`);
      }
      continue;
    }
    selected ||= thread;
    if (thread.current_decision) blockers.push(`DECISION_AWAITING_OWNER:${thread.current_decision.id}`);
    for (const item of thread.items) {
      if (item.blocking && item.status === 'deferred') {
        blockers.push(`DECISION_DEFERRED_BLOCKING:${item.id}`);
      }
    }
    if (thread.status === 'checkpoint_ready') blockers.push(`DECISION_CHECKPOINT_CONFIRMATION_REQUIRED:${thread.id}`);
    else if (!thread.current_decision && !thread.items.some((item) => item.blocking && item.status === 'deferred')) {
      blockers.push(`DECISION_CHECKPOINT_REQUIRED:${thread.id}`);
    }
  }
  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    thread: selected,
    current_decision: selected?.current_decision || null,
  };
}

function assertDecisionGate(db, bindings = {}, options = {}) {
  const gate = decisionGate(db, bindings, options);
  if (!gate.ready) {
    throw new DecisionDialogueError(
      'DECISION_ALIGNMENT_BLOCKING', `decision alignment blocks workflow advancement: ${gate.blockers.join(', ')}`,
      gate,
    );
  }
  return gate;
}

function inspectDecisionHealth(db, { rootDir = process.cwd() } = {}) {
  const threads = listDecisionThreads(db, { limit: 500 });
  const active = threads.filter((thread) => thread.status === 'active');
  const checkpointReady = threads.filter((thread) => thread.status === 'checkpoint_ready');
  const awaiting = active.filter((thread) => thread.current_decision);
  const deferredBlocking = threads.flatMap((thread) => thread.items.filter(
    (item) => item.blocking && item.status === 'deferred',
  ));
  const staleArtifacts = [];
  const root = path.resolve(rootDir);
  for (const thread of threads.filter((item) => item.status === 'confirmed')) {
    if (thread.change_id) {
      const change = db.prepare('SELECT status FROM changes WHERE id = ?').get(thread.change_id);
      if (!change || !['active', 'blocked', 'ready'].includes(change.status)) continue;
    }
    for (const artifact of thread.checkpoint.artifacts || []) {
      const file = path.resolve(root, artifact.path);
      const inside = file === root || file.startsWith(`${root}${path.sep}`);
      const digest = inside && fs.existsSync(file) && fs.statSync(file).isFile()
        ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
      if (!inside || digest !== artifact.digest) {
        staleArtifacts.push({ thread_id: thread.id, path: artifact.path, expected: artifact.digest, actual: digest });
      }
    }
  }
  const currentThread = awaiting[0] || checkpointReady[0] || active[0] || null;
  const currentThreadId = currentThread?.id || staleArtifacts[0]?.thread_id || null;
  const status = staleArtifacts.length > 0
    ? 'fail'
    : (active.length > 0 || checkpointReady.length > 0 || deferredBlocking.length > 0 ? 'warning' : 'pass');
  return {
    status,
    active: active.length,
    awaiting_owner: awaiting.length,
    checkpoint_ready: checkpointReady.length,
    deferred_blocking: deferredBlocking.length,
    stale_artifacts: staleArtifacts,
    current: currentThread?.current_decision || null,
    current_thread_id: currentThreadId,
  };
}

module.exports = {
  DecisionDialogueError,
  startDecisionThread,
  readDecisionThread,
  listDecisionThreads,
  openDecision,
  resolveDecision,
  delegateDecision,
  deferDecision,
  supersedeDecision,
  checkpointDecisionThread,
  decisionGate,
  assertDecisionGate,
  assertConfirmedDecisionCheckpoint,
  inspectDecisionHealth,
};
