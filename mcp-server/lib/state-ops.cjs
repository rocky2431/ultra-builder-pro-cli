'use strict';

// State-operations layer over .ultra/state.db.
//
// Every mutation in the Ultra Builder Pro runtime goes through this module.
// Callers (MCP server tool handlers, the migration CLI, the orchestrator)
// must NOT reach into the better-sqlite3 connection directly — the helpers
// here apply the BEGIN IMMEDIATE / retry / status-machine guards specified
// in PLAN §6 Phase 2.3 + docs/STATE-DB-ACCESS-POLICY.md.

const { openStateDb } = require('./state-db.cjs');

const STATUS_TRANSITIONS = Object.freeze({
  pending:     new Set(['in_progress', 'blocked', 'expanded']),
  in_progress: new Set(['completed', 'blocked', 'pending']),
  blocked:     new Set(['pending', 'in_progress']),
  expanded:    new Set(['completed']),
  completed:   new Set(),
});

const TASK_FIELDS = Object.freeze([
  'id', 'title', 'type', 'priority', 'complexity', 'status',
  'deps', 'files_modified', 'session_id', 'stale', 'complexity_hint',
  'tag', 'trace_to', 'context_file', 'completion_commit',
  'created_at', 'updated_at',
]);

const PATCHABLE_FIELDS = Object.freeze([
  'priority', 'complexity', 'deps', 'files_modified',
  'session_id', 'stale', 'complexity_hint', 'tag', 'trace_to',
  'context_file', 'completion_commit',
]);

const SESSION_PATCHABLE = Object.freeze([
  'pid', 'status', 'lease_expires_at', 'heartbeat_at', 'worktree_path', 'artifact_dir',
]);

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
  return withRetry(() => db.transaction(fn)());
}

// ─── tasks ───────────────────────────────────────────────────────────────

function rowToTask(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of ['deps', 'files_modified']) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { out[k] = null; }
    }
  }
  if (out.stale !== undefined && out.stale !== null) {
    out.stale = Boolean(out.stale);
  }
  return out;
}

function readTask(db, id) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return rowToTask(row);
}

// Single static SQL with named parameters and NULL-pass-through filters.
// Every value flows through @bindings; the string is a frozen literal so no
// concatenation / interpolation hooks can flag injection risk.
const LIST_TASKS_SQL = "SELECT * FROM tasks WHERE (@status IS NULL OR status = @status) AND (@tag IS NULL OR tag = @tag) AND (@since IS NULL OR updated_at >= @since) ORDER BY created_at ASC LIMIT IIF(@maxn IS NULL, -1, @maxn)";

function listTasks(db, filter = {}) {
  const status = filter.status && filter.status !== 'any' ? filter.status : null;
  return db.prepare(LIST_TASKS_SQL).all({
    status,
    tag: filter.tag || null,
    since: filter.since || null,
    maxn: filter.limit || null,
  }).map(rowToTask);
}

function createTask(db, input) {
  if (!input || !input.id || !input.title || !input.type || !input.priority) {
    throw new StateOpsError('VALIDATION_ERROR', 'id, title, type, priority required');
  }
  const ts = nowIso();
  const row = {
    id: input.id,
    title: input.title,
    type: input.type,
    priority: input.priority,
    complexity: input.complexity ?? null,
    status: 'pending',
    deps: input.deps ? JSON.stringify(input.deps) : null,
    files_modified: input.files_modified ? JSON.stringify(input.files_modified) : null,
    session_id: input.session_id ?? null,
    stale: 0,
    complexity_hint: input.complexity_hint ?? null,
    tag: input.tag ?? null,
    trace_to: input.trace_to ?? null,
    context_file: input.context_file ?? null,
    completion_commit: null,
    created_at: ts,
    updated_at: ts,
  };
  return tx(db, () => {
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
      payload: { priority: row.priority, type: row.type },
    });
    return readTask(db, row.id);
  });
}

function patchTask(db, id, patch = {}) {
  return tx(db, () => {
    const current = readTask(db, id);
    if (!current) throw new StateOpsError('TASK_NOT_FOUND', `no task ${id}`);
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
      if (key === 'deps' || key === 'files_modified') {
        if (value !== null && !Array.isArray(value)) {
          throw new StateOpsError('VALIDATION_ERROR', `${key} must be an array`);
        }
        value = value === null ? null : JSON.stringify(value);
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

    if (nextStatus && nextStatus !== current.status) {
      appendEventInTx(db, {
        type: statusEventType(nextStatus),
        task_id: id,
        payload: { from: current.status, to: nextStatus },
      });
    }
    return readTask(db, id);
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
  const result = db.prepare(
    `INSERT INTO events (type, task_id, session_id, runtime, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    event.type,
    event.task_id ?? null,
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
// NULL-pass-through for task_id. Frozen literal — no concat, no interpolation.
const SUBSCRIBE_EVENTS_SQL = "SELECT id, ts, type, task_id, session_id, runtime, payload_json FROM events WHERE id > @since_id AND (@types_json IS NULL OR EXISTS (SELECT 1 FROM json_each(@types_json) WHERE value = events.type)) AND (@task_id IS NULL OR task_id = @task_id) ORDER BY id ASC LIMIT @maxn";

function subscribeEventsSince(db, { since_id = 0, types, task_id, limit = 100 } = {}) {
  const events = db.prepare(SUBSCRIBE_EVENTS_SQL).all({
    since_id,
    types_json: types && types.length > 0 ? JSON.stringify(types) : null,
    task_id: task_id || null,
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
  const lease = new Date(Date.now() + lease_seconds * 1000).toISOString();
  return tx(db, () => {
    if (!readTask(db, task_id)) {
      throw new StateOpsError('TASK_NOT_FOUND', `task ${task_id} does not exist`);
    }
    db.prepare(
      `INSERT INTO sessions (sid, task_id, runtime, pid, worktree_path, artifact_dir, status, lease_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
    ).run(sid, task_id, runtime, pid, worktree_path, artifact_dir, lease);
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
    const sets = [];
    const params = [];
    for (const key of Object.keys(patch)) {
      if (!SESSION_PATCHABLE.includes(key)) {
        throw new StateOpsError('VALIDATION_ERROR', `session field ${key} is not patchable`);
      }
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
    if (sets.length === 0) return cur;
    params.push(sid);
    db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE sid = ?`).run(...params);
    if (patch.status && patch.status !== cur.status) {
      const eventType = patch.status === 'completed' ? 'session_closed'
        : patch.status === 'crashed' ? 'session_crashed'
        : patch.status === 'orphan' ? 'session_orphaned'
        : 'session_closed';
      appendEventInTx(db, {
        type: eventType,
        task_id: cur.task_id,
        session_id: sid,
        runtime: cur.runtime,
        payload: { from: cur.status, to: patch.status },
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

function reapOrphanSessions(db, { graceSeconds = 300 } = {}) {
  const cutoff = new Date(Date.now() - graceSeconds * 1000).toISOString();
  const candidates = db.prepare(
    "SELECT * FROM sessions WHERE status = 'running' AND (lease_expires_at < ? OR heartbeat_at < ?)",
  ).all(cutoff, cutoff);
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

function recordTaskFailure(db, task_id, {
  reason = 'unknown',
  session_id = null,
  fail_threshold = DEFAULT_FAIL_THRESHOLD,
} = {}) {
  if (!task_id) throw new StateOpsError('VALIDATION_ERROR', 'task_id required');
  return tx(db, () => {
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
  SESSION_PATCHABLE,
  openStateDb,
  tx,
  withRetry,
  // tasks
  readTask,
  listTasks,
  createTask,
  patchTask,
  updateTaskStatus,
  deleteTask,
  // events
  appendEvent,
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
  // circuit breaker
  recordTaskFailure,
  resetCircuitBreaker,
  isCircuitTripped,
  DEFAULT_FAIL_THRESHOLD,
  // staleness
  markTasksStaleBySpecSections,
  consumeSpecChangedEvents,
};
