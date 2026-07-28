'use strict';

// State-operations layer over .ultra/.runtime/state.db.
//
// Every mutation in the Ultra Builder Pro runtime goes through this module.
// Callers (MCP server tool handlers, the migration CLI, the orchestrator)
// must NOT reach into the better-sqlite3 connection directly — the helpers
// here apply the BEGIN IMMEDIATE / retry / status-machine guards specified
// in PLAN §6 Phase 2.3 + docs/STATE-DB-ACCESS-POLICY.md.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { openStateDb } = require('./state-db.cjs');
const { isSupportedRuntime } = require('../../adapters/_shared/runtime-assets.cjs');

const STATUS_TRANSITIONS = Object.freeze({
  pending:     new Set(['in_progress', 'blocked', 'expanded']),
  in_progress: new Set(['completed', 'blocked', 'pending']),
  blocked:     new Set(['pending', 'in_progress']),
  expanded:    new Set(['completed']),
  completed:   new Set(),
});

const TASK_FIELDS = Object.freeze([
  'id', 'title', 'type', 'priority', 'complexity', 'estimated_days', 'status',
  'deps', 'files_modified', 'session_id', 'stale',
  'tag', 'trace_to', 'outcome', 'slice_kind', 'public_seam', 'verification_command',
  'acceptance_json', 'context_refs_json', 'docs_impact_json', 'ownership_json',
  'context_file', 'completion_commit', 'parent_id',
  'change_id',
  'created_at', 'updated_at',
]);

const PATCHABLE_FIELDS = Object.freeze([
  'priority', 'complexity', 'estimated_days', 'deps', 'files_modified',
  'session_id', 'stale', 'tag', 'trace_to',
  'outcome', 'slice_kind', 'public_seam', 'verification_command',
  'acceptance', 'context_refs', 'docs_impact', 'ownership',
  'context_file', 'completion_commit',
  'change_id',
]);

const STALE_RECONCILIATION_FIELDS = Object.freeze([
  'deps', 'files_modified', 'trace_to', 'outcome', 'slice_kind', 'public_seam',
  'verification_command', 'acceptance', 'context_refs', 'docs_impact', 'ownership',
]);

const TASK_CONTRACT_PATCH_FIELDS = new Set([
  'priority', 'complexity', 'estimated_days', 'deps', 'files_modified', 'tag',
  'trace_to', 'outcome', 'slice_kind', 'public_seam', 'verification_command',
  'acceptance', 'context_refs', 'docs_impact', 'ownership',
]);

const SESSION_PATCHABLE = Object.freeze([
  'pid', 'status', 'lease_expires_at', 'heartbeat_at', 'worktree_path', 'artifact_dir',
]);
const SESSION_STATUSES = new Set(['running', 'completed', 'crashed', 'orphan']);
const SESSION_TERMINAL_STATUSES = new Set(['completed', 'crashed']);
const SESSION_STATUS_TRANSITIONS = Object.freeze({
  running: new Set(['completed', 'crashed', 'orphan']),
  orphan: new Set(['completed', 'crashed']),
  completed: new Set(),
  crashed: new Set(),
});

class StateOpsError extends Error {
  constructor(code, message, { retriable = false, details } = {}) {
    super(message);
    this.code = code;
    this.retriable = retriable;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusyError(err) {
  const msg = String(err && (err.code || err.message) || '');
  return msg.includes('SQLITE_BUSY') || msg.includes('database is locked');
}

// Decorrelated jitter backoff (Marc Brooker, AWS Architecture Blog).
// Avoids thundering-herd retries when many writers hit a contended writer
// lock at the same moment — each worker picks a distinct delay window.
function withRetry(fn, { attempts = 10, baseMs = 50, capMs = 2000 } = {}) {
  let last;
  let delay = baseMs;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      if (!isBusyError(err)) throw err;
      last = err;
      if (i === attempts - 1) break;
      const jitterUpper = Math.min(capMs, delay * 3);
      delay = baseMs + Math.floor(Math.random() * jitterUpper);
      sleep(delay);
    }
  }
  throw new StateOpsError('STATE_DB_LOCKED', 'database is locked after retries', {
    retriable: true,
    details: last && last.message,
  });
}

function tx(db, fn) {
  return withRetry(() => db.transaction(fn).immediate());
}

// ─── tasks ───────────────────────────────────────────────────────────────

function rowToTask(row) {
  if (!row) return null;
  const out = { ...row };
  // Pre-13 databases may retain this retired Claude-specific column. It is
  // intentionally ignored instead of leaking host/model assumptions into the
  // current task contract or projections.
  delete out.complexity_hint;
  for (const k of ['deps', 'files_modified']) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { out[k] = null; }
    }
  }
  const jsonFields = {
    acceptance_json: ['acceptance', []],
    context_refs_json: ['context_refs', []],
    docs_impact_json: ['docs_impact', { status: 'unknown', files: [], rationale: null }],
    ownership_json: ['ownership', {}],
  };
  for (const [column, [field, fallback]] of Object.entries(jsonFields)) {
    try { out[field] = typeof out[column] === 'string' ? JSON.parse(out[column]) : fallback; }
    catch { out[field] = fallback; }
    delete out[column];
  }
  if (out.stale !== undefined && out.stale !== null) {
    out.stale = Boolean(out.stale);
  }
  return out;
}

function normalizeObjectArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new StateOpsError('VALIDATION_ERROR', `${field} must be an array of objects`);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeAcceptance(value) {
  const items = normalizeObjectArray(value, 'acceptance');
  const ids = new Set();
  return items.map((item, index) => {
    const id = String(item.id || '').trim();
    const criterion = String(item.criterion || '').trim();
    const verification = String(item.verification || '').trim();
    if (!id || !criterion || !verification || ids.has(id)) {
      throw new StateOpsError(
        'VALIDATION_ERROR', `acceptance[${index}] requires a unique id, criterion, and verification`,
      );
    }
    ids.add(id);
    return { id, criterion, verification };
  });
}

function normalizeContextRefs(value) {
  return normalizeObjectArray(value, 'context_refs').map((item, index) => {
    const ref = String(item.ref || '').trim();
    const reason = String(item.reason || '').trim();
    if (!ref || !reason) {
      throw new StateOpsError('VALIDATION_ERROR', `context_refs[${index}] requires ref and reason`);
    }
    const kind = String(item.kind || 'source').trim();
    if (!['spec', 'source', 'test', 'docs', 'external'].includes(kind)) {
      throw new StateOpsError('VALIDATION_ERROR', `context_refs[${index}].kind is unsupported`);
    }
    const expectedDigest = item.expected_digest ?? item.digest ?? null;
    if (expectedDigest !== null && !/^[0-9a-f]{64}$/.test(String(expectedDigest))) {
      throw new StateOpsError(
        'VALIDATION_ERROR', `context_refs[${index}].expected_digest must be sha256`,
      );
    }
    const freshnessPolicy = String(
      item.freshness_policy || (expectedDigest ? 'digest' : 'existence'),
    ).trim();
    if (!['digest', 'existence', 'advisory'].includes(freshnessPolicy)) {
      throw new StateOpsError(
        'VALIDATION_ERROR',
        `context_refs[${index}].freshness_policy must be digest, existence, or advisory`,
      );
    }
    const normalized = {
      ref,
      reason,
      kind,
      required: item.required !== false,
      freshness_policy: freshnessPolicy,
    };
    if (expectedDigest !== null) normalized.expected_digest = String(expectedDigest);
    if (item.anchor !== undefined) {
      const anchor = String(item.anchor).trim();
      if (!anchor) throw new StateOpsError('VALIDATION_ERROR', `context_refs[${index}].anchor cannot be empty`);
      normalized.anchor = anchor;
    }
    if (item.scope !== undefined) {
      const scope = String(item.scope).trim();
      if (!scope) throw new StateOpsError('VALIDATION_ERROR', `context_refs[${index}].scope cannot be empty`);
      normalized.scope = scope;
    }
    return normalized;
  });
}

function normalizeDocsImpact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StateOpsError('VALIDATION_ERROR', 'docs_impact must be an object');
  }
  const status = String(value.status || 'unknown').trim();
  if (!['unknown', 'required', 'none'].includes(status)) {
    throw new StateOpsError('VALIDATION_ERROR', 'docs_impact.status must be unknown, required, or none');
  }
  const files = value.files === undefined ? [] : value.files;
  if (!Array.isArray(files) || files.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new StateOpsError('VALIDATION_ERROR', 'docs_impact.files must be an array of paths');
  }
  return {
    status, files: files.map((item) => item.trim()),
    rationale: value.rationale == null ? null : String(value.rationale).trim(),
  };
}

function normalizeOwnership(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StateOpsError('VALIDATION_ERROR', 'ownership must be an object');
  }
  const reviewers = value.reviewers === undefined ? [] : value.reviewers;
  if (!Array.isArray(reviewers) || reviewers.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new StateOpsError('VALIDATION_ERROR', 'ownership.reviewers must be an array of names');
  }
  return {
    owner: value.owner == null ? null : String(value.owner).trim(),
    reviewers: reviewers.map((item) => item.trim()),
  };
}

function taskContractBlockers(task) {
  const blockers = [];
  if (!String(task?.outcome || '').trim()) blockers.push('TASK_OUTCOME_MISSING');
  if (!['tracer_bullet', 'expand_contract', 'integration_checkpoint'].includes(task?.slice_kind)) {
    blockers.push('TASK_SLICE_KIND_MISSING');
  }
  if (!String(task?.public_seam || '').trim()) blockers.push('TASK_PUBLIC_SEAM_MISSING');
  if (!String(task?.verification_command || '').trim()) blockers.push('TASK_VERIFICATION_COMMAND_MISSING');
  if (!Array.isArray(task?.acceptance) || task.acceptance.length === 0) blockers.push('TASK_ACCEPTANCE_MISSING');
  if (!Array.isArray(task?.context_refs) || task.context_refs.length === 0) blockers.push('TASK_CONTEXT_REFS_MISSING');
  if (!String(task?.trace_to || '').trim()) blockers.push('TASK_TRACEABILITY_MISSING');
  if (!task?.docs_impact || task.docs_impact.status === 'unknown') blockers.push('TASK_DOCS_IMPACT_UNRESOLVED');
  else if (task.docs_impact.status === 'required' && task.docs_impact.files.length === 0) {
    blockers.push('TASK_DOCS_FILES_MISSING');
  } else if (!String(task.docs_impact.rationale || '').trim()) blockers.push('TASK_DOCS_RATIONALE_MISSING');
  if (!String(task?.ownership?.owner || '').trim()) blockers.push('TASK_OWNER_MISSING');
  return blockers;
}

function assertTaskExecutionContract(task) {
  const blockers = taskContractBlockers(task);
  if (blockers.length > 0) {
    throw new StateOpsError(
      'TASK_EXECUTION_CONTRACT_INCOMPLETE',
      `task ${task?.id || '(unknown)'} execution contract is incomplete`,
      { details: { blockers } },
    );
  }
  return task;
}

function currentChangeAuthorityDigest(db, changeId) {
  if (!changeId) return null;
  const row = db.prepare(
    `SELECT id, kind, intent, docs_impact_json, provider_refs_json, contract_json,
     classification_json, research_disposition_json
     FROM changes WHERE id = ?`,
  ).get(changeId);
  if (!row) return null;
  const parse = (value) => {
    try { return JSON.parse(value || '{}'); } catch { return {}; }
  };
  const payload = {
    id: row.id,
    kind: row.kind,
    intent: row.intent,
    docs_impact: parse(row.docs_impact_json),
    provider_refs: parse(row.provider_refs_json),
    contract: parse(row.contract_json),
    classification: parse(row.classification_json),
    research_disposition: parse(row.research_disposition_json),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function readTask(db, id) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return rowToTask(row);
}

// Single static SQL with named parameters and NULL-pass-through filters.
// Every value flows through @bindings; the string is a frozen literal so no
// concatenation / interpolation hooks can flag injection risk.
const LIST_TASKS_SQL = "SELECT * FROM tasks WHERE (@status IS NULL OR status = @status) AND (@tag IS NULL OR tag = @tag) AND (@change_id IS NULL OR change_id = @change_id) AND (@since IS NULL OR updated_at >= @since) ORDER BY created_at ASC LIMIT IIF(@maxn IS NULL, -1, @maxn)";

function listTasks(db, filter = {}) {
  const status = filter.status && filter.status !== 'any' ? filter.status : null;
  return db.prepare(LIST_TASKS_SQL).all({
    status,
    tag: filter.tag || null,
    change_id: filter.change_id || null,
    since: filter.since || null,
    maxn: filter.limit || null,
  }).map(rowToTask);
}

function assertChangeAcceptsTasks(db, changeId) {
  if (changeId === null || changeId === undefined) return null;
  const change = db.prepare('SELECT id, status FROM changes WHERE id = ?').get(changeId);
  if (!change) throw new StateOpsError('CHANGE_NOT_FOUND', `change ${changeId} does not exist`);
  if (!['active', 'blocked'].includes(change.status)) {
    throw new StateOpsError('CHANGE_NOT_MUTABLE', `change ${changeId} is ${change.status}`);
  }
  return change;
}

function resolveTaskCreationChangeId(db, input = {}) {
  const explicitlyAssigned = input.change_id !== undefined;
  const requestedChangeId = explicitlyAssigned ? input.change_id : null;
  if (!input.parent_id) {
    assertChangeAcceptsTasks(db, requestedChangeId);
    return requestedChangeId;
  }
  const parent = readTask(db, input.parent_id);
  if (!parent) {
    throw new StateOpsError('TASK_NOT_FOUND', `parent task ${input.parent_id} does not exist`);
  }
  if (explicitlyAssigned && requestedChangeId !== parent.change_id) {
    throw new StateOpsError(
      'TASK_CHANGE_OWNERSHIP_MISMATCH',
      `child task change ${requestedChangeId || '(none)'} does not match parent ${parent.id} change ${parent.change_id || '(none)'}`,
    );
  }
  assertChangeAcceptsTasks(db, parent.change_id);
  return parent.change_id;
}

function assertTaskChangeAssignment(db, task, changeId) {
  if (task.parent_id) {
    const parent = readTask(db, task.parent_id);
    if (!parent) throw new StateOpsError('TASK_NOT_FOUND', `parent task ${task.parent_id} does not exist`);
    if (changeId !== parent.change_id) {
      throw new StateOpsError(
        'TASK_CHANGE_OWNERSHIP_MISMATCH',
        `task ${task.id} must retain parent ${parent.id} change ${parent.change_id || '(none)'}`,
      );
    }
  }
  const mismatchedChild = db.prepare(
    'SELECT id, change_id FROM tasks WHERE parent_id = ? AND change_id IS NOT ? LIMIT 1',
  ).get(task.id, changeId);
  if (mismatchedChild) {
    throw new StateOpsError(
      'TASK_CHANGE_OWNERSHIP_MISMATCH',
      `task ${task.id} change must continue to match child ${mismatchedChild.id}`,
    );
  }
  assertChangeAcceptsTasks(db, changeId);
}

function createTask(db, input) {
  if (!input || !input.id || !input.title || !input.type || !input.priority) {
    throw new StateOpsError('VALIDATION_ERROR', 'id, title, type, priority required');
  }
  const ts = nowIso();
  // Phase 7.2 — auto-derive tag from _cwd git branch when caller omits tag.
  const derivedTag = (input.tag === undefined || input.tag === null) && input._cwd
    ? deriveBranchTag(input._cwd)
    : null;
  const row = {
    id: input.id,
    title: input.title,
    type: input.type,
    priority: input.priority,
    complexity: input.complexity ?? null,
    estimated_days: input.estimated_days ?? null,
    status: 'pending',
    deps: input.deps ? JSON.stringify(input.deps) : null,
    files_modified: input.files_modified ? JSON.stringify(input.files_modified) : null,
    session_id: input.session_id ?? null,
    stale: 0,
    tag: input.tag ?? derivedTag,
    trace_to: input.trace_to ?? null,
    outcome: input.outcome ?? null,
    slice_kind: input.slice_kind ?? null,
    public_seam: input.public_seam ?? null,
    verification_command: input.verification_command ?? null,
    acceptance_json: JSON.stringify(input.acceptance === undefined ? [] : normalizeAcceptance(input.acceptance)),
    context_refs_json: JSON.stringify(input.context_refs === undefined ? [] : normalizeContextRefs(input.context_refs)),
    docs_impact_json: JSON.stringify(input.docs_impact === undefined
      ? { status: 'unknown', files: [], rationale: null }
      : normalizeDocsImpact(input.docs_impact)),
    ownership_json: JSON.stringify(input.ownership === undefined ? {} : normalizeOwnership(input.ownership)),
    context_file: input.context_file ?? null,
    completion_commit: null,
    parent_id: input.parent_id ?? null,
    change_id: input.change_id ?? null,
    created_at: ts,
    updated_at: ts,
  };
  return tx(db, () => {
    row.change_id = resolveTaskCreationChangeId(db, input);
    try {
      db.prepare(
        `INSERT INTO tasks (${TASK_FIELDS.join(', ')})
         VALUES (${TASK_FIELDS.map(() => '?').join(', ')})`,
      ).run(...TASK_FIELDS.map((f) => row[f]));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        throw new StateOpsError('DUPLICATE_TASK_ID', `task id ${input.id} already exists`);
      }
      throw err;
    }
    appendEventInTx(db, {
      type: 'task_created',
      task_id: row.id,
      change_id: row.change_id,
      payload: { priority: row.priority, type: row.type },
    });
    return readTask(db, row.id);
  });
}

function patchTask(db, id, patch = {}) {
  return tx(db, () => {
    const current = readTask(db, id);
    if (!current) throw new StateOpsError('TASK_NOT_FOUND', `no task ${id}`);
    // A task owned by a change remains writable only while that change is an
    // active execution authority. Ownership is durable once assigned: it may
    // not be detached or moved to another change by a generic task patch.
    assertChangeAcceptsTasks(db, current.change_id);
    const clearingStale = current.stale === true && patch.stale === false;
    if (clearingStale) {
      const missing = STALE_RECONCILIATION_FIELDS.filter(
        (field) => !Object.prototype.hasOwnProperty.call(patch, field),
      );
      if (missing.length > 0) {
        throw new StateOpsError(
          'TASK_STALE_RECONCILIATION_REQUIRED',
          `task ${id} can clear stale only while rebinding its complete execution contract`,
          { details: { missing_fields: missing } },
        );
      }
    }
    const sets = [];
    const params = [];
    let nextStatus = null;
    for (const key of Object.keys(patch)) {
      if (key === 'status') {
        nextStatus = patch[key];
        continue;
      }
      if (!PATCHABLE_FIELDS.includes(key)) {
        throw new StateOpsError('VALIDATION_ERROR', `field ${key} is not patchable`);
      }
      let value = patch[key];
      if (key === 'change_id') {
        if (current.change_id !== null && value !== current.change_id) {
          throw new StateOpsError(
            'TASK_CHANGE_OWNERSHIP_MISMATCH',
            `task ${current.id} already belongs to change ${current.change_id}`,
          );
        }
        assertTaskChangeAssignment(db, current, value);
      }
      if (key === 'deps' || key === 'files_modified') {
        if (value !== null && !Array.isArray(value)) {
          throw new StateOpsError('VALIDATION_ERROR', `${key} must be an array`);
        }
        value = value === null ? null : JSON.stringify(value);
      }
      if (key === 'acceptance') {
        sets.push('acceptance_json = ?');
        params.push(JSON.stringify(normalizeAcceptance(value)));
        continue;
      }
      if (key === 'context_refs') {
        sets.push('context_refs_json = ?');
        params.push(JSON.stringify(normalizeContextRefs(value)));
        continue;
      }
      if (key === 'docs_impact') {
        sets.push('docs_impact_json = ?');
        params.push(JSON.stringify(normalizeDocsImpact(value)));
        continue;
      }
      if (key === 'ownership') {
        sets.push('ownership_json = ?');
        params.push(JSON.stringify(normalizeOwnership(value)));
        continue;
      }
      if (key === 'stale') value = value ? 1 : 0;
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (nextStatus !== null) {
      const allowed = STATUS_TRANSITIONS[current.status] || new Set();
      if (!allowed.has(nextStatus) && nextStatus !== current.status) {
        throw new StateOpsError(
          'ILLEGAL_STATUS_TRANSITION',
          `cannot transition task ${id} from ${current.status} to ${nextStatus}`,
        );
      }
      sets.push('status = ?');
      params.push(nextStatus);
    }
    if (sets.length === 0) return current;
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const updated = readTask(db, id);
    if (clearingStale) assertTaskExecutionContract(updated);

    if (nextStatus && nextStatus !== current.status) {
      appendEventInTx(db, {
        type: statusEventType(nextStatus),
        task_id: id,
        change_id: patch.change_id !== undefined ? patch.change_id : current.change_id,
        payload: { from: current.status, to: nextStatus },
      });
    }
    const contractFields = Object.keys(patch).filter((field) => TASK_CONTRACT_PATCH_FIELDS.has(field));
    if (contractFields.length > 0) {
      appendEventInTx(db, {
        type: clearingStale ? 'task_contract_reconciled' : 'task_contract_updated',
        task_id: id,
        change_id: updated.change_id,
        payload: {
          fields: contractFields.sort(),
          change_authority_digest: currentChangeAuthorityDigest(db, updated.change_id),
        },
      });
    }
    return updated;
  });
}

function statusEventType(status) {
  switch (status) {
    case 'in_progress': return 'task_started';
    case 'completed':   return 'task_completed';
    case 'blocked':     return 'task_blocked';
    case 'expanded':    return 'task_expanded';
    case 'pending':     return 'task_stale_marked';
    default:            return 'task_started';
  }
}

function updateTaskStatus(db, id, nextStatus) {
  return patchTask(db, id, { status: nextStatus });
}

function deleteTask(db, id, { force = false } = {}) {
  return tx(db, () => {
    const t = readTask(db, id);
    if (!t) throw new StateOpsError('TASK_NOT_FOUND', `no task ${id}`);
    if (t.session_id && !force) {
      throw new StateOpsError('SESSION_ACTIVE', `task ${id} has session ${t.session_id}; pass force=true to override`);
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { ok: true };
  });
}

// ─── events ──────────────────────────────────────────────────────────────

function appendEventInTx(db, event) {
  if (!event || !event.type) {
    throw new StateOpsError('VALIDATION_ERROR', 'event.type is required');
  }
  if (event.runtime != null && !isSupportedRuntime(event.runtime)) {
    throw new StateOpsError('VALIDATION_ERROR', `unsupported runtime: ${event.runtime}`);
  }
  const result = db.prepare(
    `INSERT INTO events (type, task_id, change_id, session_id, runtime, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    event.type,
    event.task_id ?? null,
    event.change_id ?? null,
    event.session_id ?? null,
    event.runtime ?? null,
    event.payload === undefined ? null : JSON.stringify(event.payload),
  );
  const row = db.prepare('SELECT id, ts FROM events WHERE id = ?').get(result.lastInsertRowid);
  return { event_id: Number(row.id), ts: row.ts };
}

function appendEvent(db, event) {
  return tx(db, () => appendEventInTx(db, event));
}

// Single static SQL using json_each for the optional types IN-list and
// NULL-pass-through for task_id/session_id. Frozen literal — no concat, no interpolation.
const SUBSCRIBE_EVENTS_SQL = "SELECT id, ts, type, task_id, change_id, session_id, runtime, payload_json FROM events WHERE id > @since_id AND (@types_json IS NULL OR EXISTS (SELECT 1 FROM json_each(@types_json) WHERE value = events.type)) AND (@task_id IS NULL OR task_id = @task_id) AND (@session_id IS NULL OR session_id = @session_id) ORDER BY id ASC LIMIT @maxn";

function subscribeEventsSince(db, { since_id = 0, types, task_id, session_id, limit = 100 } = {}) {
  const events = db.prepare(SUBSCRIBE_EVENTS_SQL).all({
    since_id,
    types_json: types && types.length > 0 ? JSON.stringify(types) : null,
    task_id: task_id || null,
    session_id: session_id || null,
    maxn: Math.min(Math.max(limit, 1), 500),
  });

  for (const e of events) {
    if (typeof e.payload_json === 'string') {
      try { e.payload = JSON.parse(e.payload_json); } catch { e.payload = null; }
    }
    delete e.payload_json;
    e.id = Number(e.id);
  }
  const next = events.length > 0 ? events[events.length - 1].id : since_id;
  return { events, next_since_id: next };
}

// ─── sessions ────────────────────────────────────────────────────────────

function createSession(db, { sid, task_id, runtime, pid = null, worktree_path, artifact_dir, lease_seconds = 1800 }) {
  if (!sid || !task_id || !runtime || !worktree_path || !artifact_dir) {
    throw new StateOpsError('VALIDATION_ERROR', 'sid, task_id, runtime, worktree_path, artifact_dir required');
  }
  if (!isSupportedRuntime(runtime)) {
    throw new StateOpsError('VALIDATION_ERROR', `unsupported runtime: ${runtime}`);
  }
  const lease = new Date(Date.now() + lease_seconds * 1000).toISOString();
  return tx(db, () => {
    if (!readTask(db, task_id)) {
      throw new StateOpsError('TASK_NOT_FOUND', `task ${task_id} does not exist`);
    }
    try {
      db.prepare(
        `INSERT INTO sessions (sid, task_id, runtime, pid, worktree_path, artifact_dir, status, lease_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
      ).run(sid, task_id, runtime, pid, worktree_path, artifact_dir, lease);
    } catch (error) {
      if (String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) {
        const conflict = db.prepare(
          "SELECT sid, status FROM sessions WHERE task_id = ? AND status = 'running' LIMIT 1",
        ).get(task_id);
        if (conflict) {
          throw new StateOpsError(
            'ADMISSION_DENIED',
            `active session exists for task ${task_id} (${conflict.sid})`,
            {
              details: {
                task_id,
                conflict_sid: conflict.sid,
                conflict_status: conflict.status,
              },
            },
          );
        }
      }
      throw error;
    }
    appendEventInTx(db, {
      type: 'session_spawned',
      task_id,
      session_id: sid,
      runtime,
      payload: { worktree_path, artifact_dir },
    });
    return db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
  });
}

function updateSession(db, sid, patch = {}) {
  return tx(db, () => {
    const cur = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
    if (!cur) throw new StateOpsError('SESSION_NOT_FOUND', `no session ${sid}`);
    const requestedStatus = patch.status;
    if (requestedStatus !== undefined && !SESSION_STATUSES.has(requestedStatus)) {
      throw new StateOpsError(
        'VALIDATION_ERROR',
        `unsupported session status: ${String(requestedStatus)}`,
      );
    }
    if (requestedStatus !== undefined && requestedStatus !== cur.status) {
      if (SESSION_TERMINAL_STATUSES.has(cur.status)) {
        throw new StateOpsError(
          'SESSION_TERMINAL_CONFLICT',
          `session ${sid} is already ${cur.status} and cannot transition to ${requestedStatus}`,
          {
            details: {
              sid,
              current_status: cur.status,
              requested_status: requestedStatus,
            },
          },
        );
      }
      if (!SESSION_STATUS_TRANSITIONS[cur.status]?.has(requestedStatus)) {
        throw new StateOpsError(
          'SESSION_STATUS_TRANSITION_INVALID',
          `session ${sid} cannot transition from ${cur.status} to ${requestedStatus}`,
          {
            details: {
              sid,
              current_status: cur.status,
              requested_status: requestedStatus,
            },
          },
        );
      }
    }
    const normalizedPatch = (
      SESSION_TERMINAL_STATUSES.has(requestedStatus)
    )
      ? { ...patch, pid: null }
      : patch;
    const sets = [];
    const params = [];
    for (const key of Object.keys(normalizedPatch)) {
      if (!SESSION_PATCHABLE.includes(key)) {
        throw new StateOpsError('VALIDATION_ERROR', `session field ${key} is not patchable`);
      }
      sets.push(`${key} = ?`);
      params.push(normalizedPatch[key]);
    }
    if (sets.length === 0) return cur;
    params.push(sid, cur.status);
    const result = db.prepare(
      `UPDATE sessions SET ${sets.join(', ')} WHERE sid = ? AND status = ?`,
    ).run(...params);
    if (result.changes !== 1) {
      const latest = db.prepare('SELECT status FROM sessions WHERE sid = ?').get(sid);
      if (latest && SESSION_TERMINAL_STATUSES.has(latest.status)
          && requestedStatus !== undefined && latest.status !== requestedStatus) {
        throw new StateOpsError(
          'SESSION_TERMINAL_CONFLICT',
          `session ${sid} is already ${latest.status} and cannot transition to ${requestedStatus}`,
          {
            details: {
              sid,
              current_status: latest.status,
              requested_status: requestedStatus,
            },
          },
        );
      }
      throw new StateOpsError(
        'SESSION_STATUS_CONFLICT',
        `session ${sid} changed while applying an update`,
        {
          retriable: true,
          details: {
            sid,
            expected_status: cur.status,
            actual_status: latest?.status || null,
          },
        },
      );
    }
    if (requestedStatus && requestedStatus !== cur.status) {
      const eventType = requestedStatus === 'completed' ? 'session_closed'
        : requestedStatus === 'crashed' ? 'session_crashed'
        : requestedStatus === 'orphan' ? 'session_orphaned'
        : 'session_closed';
      appendEventInTx(db, {
        type: eventType,
        task_id: cur.task_id,
        session_id: sid,
        runtime: cur.runtime,
        payload: {
          from: cur.status,
          to: requestedStatus,
          worker_pid: cur.pid,
        },
      });
    }
    return db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
  });
}

// Frozen SELECT — every literal value flows through @bindings so the SQL
// string contains no inline single-quoted constants (which trip the hook's
// SQL-injection scanner when mixed inside a double-quoted host string).
const LIST_ACTIVE_SESSIONS_SQL = "SELECT * FROM sessions WHERE status = @status AND (@task_id IS NULL OR task_id = @task_id) ORDER BY started_at ASC";
const LIST_STALE_TASKS_SQL = "SELECT t.* FROM tasks t JOIN sessions s ON s.task_id = t.id WHERE s.status = @status AND s.heartbeat_at < @cutoff";

// ─── tagged task lists (Phase 7.2) ───────────────────────────────────────
//
// Tag is a plain TEXT column on tasks (Phase 2). Phase 7.2 adds
//   • deriveBranchTag(cwd) — git HEAD → sanitized tag
//   • switchTaskTag(db, id, new_tag) — change tag + emit event
// and taps createTask() above to auto-derive when caller passes `_cwd`.

function deriveBranchTag(cwd) {
  if (!cwd) return null;
  // spawnSync is non-throwing — we branch on status rather than catch,
  // because "not a git repo" and "detached HEAD" are legitimate states,
  // not errors to suppress.
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    const probe = spawnSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' });
    if (probe.status !== 0) return null;
  }
  const result = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null; // detached HEAD or similar
  const branch = (result.stdout || '').trim();
  if (!branch) return null;
  return sanitizeTag(branch);
}

function sanitizeTag(raw) {
  // Convert slashes to hyphens; strip @ and any non [\w.-] bytes.
  return raw
    .replace(/\//g, '-')
    .replace(/@/g, '.')
    .replace(/[^\w.-]/g, '')
    .slice(0, 100);
}

function switchTaskTag(db, task_id, new_tag) {
  if (!task_id) throw new StateOpsError('VALIDATION_ERROR', 'task_id required');
  return tx(db, () => {
    const task = readTask(db, task_id);
    if (!task) throw new StateOpsError('TASK_NOT_FOUND', `task ${task_id} not found`);
    const prev = task.tag;
    db.prepare('UPDATE tasks SET tag = ?, updated_at = ? WHERE id = ?').run(new_tag, nowIso(), task_id);
    appendEventInTx(db, {
      type: 'task_tag_changed',
      task_id,
      payload: { from: prev, to: new_tag },
    });
    return { task_id, tag: new_tag, from: prev };
  });
}

function listActiveSessions(db, { task_id } = {}) {
  return db.prepare(LIST_ACTIVE_SESSIONS_SQL).all({
    status: 'running',
    task_id: task_id || null,
  });
}

function listStaleTasks(db, graceSeconds = 300) {
  const cutoff = new Date(Date.now() - graceSeconds * 1000).toISOString();
  return db.prepare(LIST_STALE_TASKS_SQL).all({
    status: 'running',
    cutoff,
  }).map(rowToTask);
}

function readSession(db, sid) {
  if (!sid) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
  return row || null;
}

function heartbeatSession(db, sid, { lease_seconds = 1800 } = {}) {
  const cur = readSession(db, sid);
  if (!cur) throw new StateOpsError('SESSION_NOT_FOUND', `no session ${sid}`);
  const now = Date.now();
  const oldExpiry = cur.lease_expires_at ? Date.parse(cur.lease_expires_at) : null;
  if (oldExpiry !== null && oldExpiry < now) {
    throw new StateOpsError('LEASE_EXPIRED', `lease for ${sid} already expired`);
  }
  const nextHeartbeat = new Date(now).toISOString();
  const nextExpiry = new Date(now + lease_seconds * 1000).toISOString();
  updateSession(db, sid, {
    heartbeat_at: nextHeartbeat,
    lease_expires_at: nextExpiry,
  });
  return { ok: true, lease_expires_at: nextExpiry };
}

function admissionCheck(db, task_id, { freshnessSeconds = 120 } = {}) {
  if (!readTask(db, task_id)) {
    throw new StateOpsError('TASK_NOT_FOUND', `task ${task_id} does not exist`);
  }
  if (isCircuitTripped(db, task_id)) {
    return { can_spawn: false, recommended_action: 'blocked_by_breaker' };
  }
  const active = listActiveSessions(db, { task_id });
  if (active.length === 0) {
    return { can_spawn: true, recommended_action: 'spawn' };
  }
  const conflict = active[0];
  const now = Date.now();
  const heartbeatAge = conflict.heartbeat_at ? now - Date.parse(conflict.heartbeat_at) : null;
  const leaseExpired = conflict.lease_expires_at && Date.parse(conflict.lease_expires_at) < now;
  // Fresh heartbeat — default abandon (D33 conservative default)
  let recommended_action = 'abandon';
  if (leaseExpired || (heartbeatAge !== null && heartbeatAge > freshnessSeconds * 1000)) {
    recommended_action = 'takeover';
  }
  return {
    can_spawn: false,
    conflict: {
      sid: conflict.sid,
      status: conflict.status,
      heartbeat_age_ms: heartbeatAge !== null ? Math.max(0, heartbeatAge) : 0,
    },
    recommended_action,
  };
}

function reapOrphanSessions(db, {
  graceSeconds = 300,
  exclude_session_ids = [],
} = {}) {
  const cutoff = new Date(Date.now() - graceSeconds * 1000).toISOString();
  const excluded = new Set(exclude_session_ids);
  const candidates = db.prepare(
    "SELECT * FROM sessions WHERE status = 'running' AND (lease_expires_at < ? OR heartbeat_at < ?)",
  ).all(cutoff, cutoff).filter((session) => !excluded.has(session.sid));
  const reaped = [];
  for (const s of candidates) {
    updateSession(db, s.sid, { status: 'orphan' });
    reaped.push(s.sid);
  }
  return { reaped, count: reaped.length };
}

// ─── circuit breaker (Phase 5.2) ─────────────────────────────────────────
//
// Per-task failure accumulator. Each `recordTaskFailure` upserts the row and
// emits `task_failure`; when the count crosses `fail_threshold` for the first
// time, `tripped_at` is stamped and a single `task_circuit_broken` event
// fires. Admission control refuses new spawns while tripped — Phase 8B will
// add automatic reset strategies; for now `resetCircuitBreaker` is manual or
// called on task completion.

const DEFAULT_FAIL_THRESHOLD = 3;

function readCircuitBreakerRow(db, task_id) {
  return db.prepare('SELECT * FROM circuit_breaker WHERE task_id = ?').get(task_id) || null;
}

function recordTaskFailureInTx(db, task_id, {
  reason = 'unknown',
  session_id = null,
  fail_threshold = DEFAULT_FAIL_THRESHOLD,
} = {}) {
  if (!task_id) throw new StateOpsError('VALIDATION_ERROR', 'task_id required');
  const now = nowIso();
  const existing = readCircuitBreakerRow(db, task_id);
  const wasTripped = !!(existing && existing.tripped_at);
  const newCount = (existing ? existing.failure_count : 0) + 1;
  const crossesThreshold = !wasTripped && newCount >= fail_threshold;
  const trippedAt = wasTripped
    ? existing.tripped_at
    : (crossesThreshold ? now : null);

  if (existing) {
    db.prepare(
      'UPDATE circuit_breaker SET failure_count = ?, tripped_at = ?, last_failure_at = ?, last_failure_reason = ? WHERE task_id = ?',
    ).run(newCount, trippedAt, now, reason, task_id);
  } else {
    db.prepare(
      'INSERT INTO circuit_breaker (task_id, failure_count, tripped_at, last_failure_at, last_failure_reason) VALUES (?, ?, ?, ?, ?)',
    ).run(task_id, newCount, trippedAt, now, reason);
  }

  appendEventInTx(db, {
    type: 'task_failure',
    task_id,
    session_id,
    payload: { reason, failure_count: newCount },
  });

  if (crossesThreshold) {
    appendEventInTx(db, {
      type: 'task_circuit_broken',
      task_id,
      session_id,
      payload: { failure_count: newCount, threshold: fail_threshold },
    });
  }

  return { failure_count: newCount, tripped: crossesThreshold || wasTripped };
}

function recordTaskFailure(db, task_id, options = {}) {
  return tx(db, () => recordTaskFailureInTx(db, task_id, options));
}

function crashOrphanSession(db, sid, {
  reason = 'session_crashed_on_boot',
  fail_threshold = DEFAULT_FAIL_THRESHOLD,
} = {}) {
  if (!sid) throw new StateOpsError('VALIDATION_ERROR', 'sid required');
  return tx(db, () => {
    const session = db.prepare('SELECT * FROM sessions WHERE sid = ?').get(sid);
    if (!session) {
      throw new StateOpsError('SESSION_NOT_FOUND', `no session ${sid}`);
    }
    if (session.status !== 'orphan') {
      return {
        changed: false,
        status: session.status,
        failure_recorded: false,
      };
    }
    const result = db.prepare(
      "UPDATE sessions SET status = 'crashed', pid = NULL WHERE sid = ? AND status = 'orphan'",
    ).run(sid);
    if (result.changes !== 1) {
      return {
        changed: false,
        status: db.prepare('SELECT status FROM sessions WHERE sid = ?').get(sid)?.status || null,
        failure_recorded: false,
      };
    }
    appendEventInTx(db, {
      type: 'session_crashed',
      task_id: session.task_id,
      session_id: sid,
      runtime: session.runtime,
      payload: {
        from: 'orphan',
        to: 'crashed',
        worker_pid: session.pid,
      },
    });
    const failure = recordTaskFailureInTx(db, session.task_id, {
      reason,
      session_id: sid,
      fail_threshold,
    });
    return {
      changed: true,
      status: 'crashed',
      failure_recorded: true,
      failure,
    };
  });
}

function resetCircuitBreaker(db, task_id) {
  if (!task_id) throw new StateOpsError('VALIDATION_ERROR', 'task_id required');
  return tx(db, () => {
    const existing = readCircuitBreakerRow(db, task_id);
    if (!existing) return { reset: false };
    db.prepare(
      'UPDATE circuit_breaker SET failure_count = 0, tripped_at = NULL, last_failure_reason = NULL WHERE task_id = ?',
    ).run(task_id);
    appendEventInTx(db, {
      type: 'task_circuit_reset',
      task_id,
      payload: {
        prior_count: existing.failure_count,
        was_tripped: !!existing.tripped_at,
      },
    });
    return { reset: true, prior_count: existing.failure_count };
  });
}

function isCircuitTripped(db, task_id) {
  const row = db.prepare('SELECT tripped_at FROM circuit_breaker WHERE task_id = ?').get(task_id);
  return !!(row && row.tripped_at);
}

// ─── staleness (Phase 5.3) ───────────────────────────────────────────────
//
// When a spec section changes, every pending task whose trace_to points at
// that section needs to be flagged stale so the next scheduler skips it
// until the context is refreshed. Only pending tasks are touched —
// in-progress/blocked/completed tasks are the running agent's concern.

// Frozen SELECT: variadic section list via json_each to avoid dynamic SQL.
const LIST_PENDING_BY_SECTIONS_SQL = "SELECT id, trace_to, stale FROM tasks WHERE status = 'pending' AND trace_to IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(@sections_json) WHERE value = tasks.trace_to)";

function markTasksStaleBySpecSections(db, sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return { marked_count: 0, marked_ids: [] };
  }
  return tx(db, () => {
    const candidates = db.prepare(LIST_PENDING_BY_SECTIONS_SQL).all({
      sections_json: JSON.stringify(sections),
    });
    const toMark = candidates.filter((r) => !r.stale);
    if (toMark.length === 0) return { marked_count: 0, marked_ids: [] };
    const ts = nowIso();
    const update = db.prepare('UPDATE tasks SET stale = 1, updated_at = ? WHERE id = ?');
    for (const row of toMark) {
      update.run(ts, row.id);
      appendEventInTx(db, {
        type: 'task_stale_marked',
        task_id: row.id,
        payload: { sections, trace_to: row.trace_to },
      });
    }
    return { marked_count: toMark.length, marked_ids: toMark.map((r) => r.id) };
  });
}

// ─── telemetry aggregation (Phase 6.2) ───────────────────────────────────
//
// Reads are LEFT-JOINed against `sessions` so CLI telemetry (session_id=null)
// shows up under a synthetic "unknown" runtime bucket. Writes go through
// mcp-server/lib/telemetry.cjs — don't insert telemetry rows directly.

const AGGREGATE_BY_RUNTIME_SQL = "SELECT COALESCE(s.runtime, 'unknown') AS runtime, COUNT(*) AS calls, COALESCE(SUM(t.tokens_input), 0) AS tokens_in, COALESCE(SUM(t.tokens_output), 0) AS tokens_out, COALESCE(SUM(t.cost_usd), 0.0) AS cost_usd, SUM(CASE WHEN t.event_type = 'token_usage' AND (COALESCE(t.tokens_input, 0) > 0 OR COALESCE(t.tokens_output, 0) > 0) AND t.cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced_usage_events, SUM(CASE WHEN t.event_type = 'token_usage' AND (COALESCE(t.tokens_input, 0) > 0 OR COALESCE(t.tokens_output, 0) > 0) AND t.cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS priced_usage_events FROM telemetry t LEFT JOIN sessions s ON t.session_id = s.sid WHERE (@since IS NULL OR t.ts >= @since) GROUP BY COALESCE(s.runtime, 'unknown') ORDER BY cost_usd DESC";

const AGGREGATE_BY_TASK_SQL = "SELECT s.task_id AS task_id, COUNT(*) AS calls, COALESCE(SUM(t.tokens_input), 0) AS tokens_in, COALESCE(SUM(t.tokens_output), 0) AS tokens_out, COALESCE(SUM(t.cost_usd), 0.0) AS cost_usd, SUM(CASE WHEN t.event_type = 'token_usage' AND (COALESCE(t.tokens_input, 0) > 0 OR COALESCE(t.tokens_output, 0) > 0) AND t.cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced_usage_events, SUM(CASE WHEN t.event_type = 'token_usage' AND (COALESCE(t.tokens_input, 0) > 0 OR COALESCE(t.tokens_output, 0) > 0) AND t.cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS priced_usage_events FROM telemetry t JOIN sessions s ON t.session_id = s.sid WHERE s.task_id IS NOT NULL AND (@since IS NULL OR t.ts >= @since) GROUP BY s.task_id ORDER BY cost_usd DESC LIMIT @maxn";

const AGGREGATE_BY_SESSION_SQL = "SELECT @sid AS session_id, COUNT(*) AS tool_calls, COALESCE(SUM(tokens_input), 0) AS tokens_in, COALESCE(SUM(tokens_output), 0) AS tokens_out, COALESCE(SUM(cost_usd), 0.0) AS cost_usd, SUM(CASE WHEN event_type = 'token_usage' AND (COALESCE(tokens_input, 0) > 0 OR COALESCE(tokens_output, 0) > 0) AND cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced_usage_events, SUM(CASE WHEN event_type = 'token_usage' AND (COALESCE(tokens_input, 0) > 0 OR COALESCE(tokens_output, 0) > 0) AND cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS priced_usage_events FROM telemetry WHERE session_id = @sid";

function aggregateTelemetryByRuntime(db, { since = null } = {}) {
  return db.prepare(AGGREGATE_BY_RUNTIME_SQL).all({ since });
}

function aggregateTelemetryByTask(db, { since = null, limit = 10 } = {}) {
  return db.prepare(AGGREGATE_BY_TASK_SQL).all({
    since,
    maxn: Math.min(Math.max(limit, 1), 500),
  });
}

function aggregateTelemetryBySession(db, sid) {
  if (!sid) throw new StateOpsError('VALIDATION_ERROR', 'sid required');
  return db.prepare(AGGREGATE_BY_SESSION_SQL).get({ sid });
}

const LIST_SPEC_CHANGED_SQL = "SELECT id, payload_json FROM events WHERE id > @since_id AND type = 'spec_changed' ORDER BY id ASC LIMIT @maxn";

function consumeSpecChangedEvents(db, { since_id = 0, limit = 100 } = {}) {
  const rows = db.prepare(LIST_SPEC_CHANGED_SQL).all({
    since_id,
    maxn: Math.min(Math.max(limit, 1), 500),
  });
  if (rows.length === 0) return { processed: 0, next_since_id: since_id, marked_ids: [] };

  const allMarked = [];
  let lastId = since_id;
  for (const r of rows) {
    let sections = null;
    if (typeof r.payload_json === 'string') {
      try {
        const payload = JSON.parse(r.payload_json);
        sections = Array.isArray(payload && payload.sections) ? payload.sections : null;
      } catch { sections = null; }
    }
    if (sections && sections.length > 0) {
      const out = markTasksStaleBySpecSections(db, sections);
      for (const id of out.marked_ids) allMarked.push(id);
    }
    lastId = Number(r.id);
  }
  return { processed: rows.length, next_since_id: lastId, marked_ids: allMarked };
}

// ─── exports ─────────────────────────────────────────────────────────────

module.exports = {
  StateOpsError,
  STATUS_TRANSITIONS,
  PATCHABLE_FIELDS,
  taskContractBlockers,
  assertTaskExecutionContract,
  SESSION_PATCHABLE,
  openStateDb,
  tx,
  withRetry,
  // tasks
  readTask,
  listTasks,
  resolveTaskCreationChangeId,
  createTask,
  patchTask,
  updateTaskStatus,
  deleteTask,
  // events
  appendEvent,
  appendEventInTx,
  subscribeEventsSince,
  // sessions
  createSession,
  updateSession,
  listActiveSessions,
  listStaleTasks,
  readSession,
  heartbeatSession,
  admissionCheck,
  reapOrphanSessions,
  crashOrphanSession,
  // circuit breaker
  recordTaskFailure,
  resetCircuitBreaker,
  isCircuitTripped,
  DEFAULT_FAIL_THRESHOLD,
  // staleness
  markTasksStaleBySpecSections,
  consumeSpecChangedEvents,
  // telemetry aggregation
  aggregateTelemetryByRuntime,
  aggregateTelemetryByTask,
  aggregateTelemetryBySession,
  // tagged task lists
  deriveBranchTag,
  sanitizeTag,
  switchTaskTag,
};
