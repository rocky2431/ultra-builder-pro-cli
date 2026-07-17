'use strict';

const { randomUUID } = require('node:crypto');

const ops = require('./state-ops.cjs');
const defaultProjector = require('./projector.cjs');

class RuntimeStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeStateError';
    this.code = code;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value) {
  if (value == null) return null;
  try { return JSON.parse(value); }
  catch (error) {
    throw new RuntimeStateError('STATE_CORRUPT', `invalid runtime JSON: ${error.message}`);
  }
}

function rowToIncident(row) {
  if (!row) return null;
  return {
    ...row,
    retryable: Boolean(row.retryable),
    evidence: parseJson(row.evidence_json),
  };
}

function recordIncident(db, input) {
  if (!input || !input.code || !input.message) {
    throw new RuntimeStateError('VALIDATION_ERROR', 'incident code and message required');
  }
  return ops.tx(db, () => {
    const existing = db.prepare(
      `SELECT * FROM incidents
       WHERE status = 'open' AND code = ?
         AND change_id IS ? AND task_id IS ? AND session_id IS ?
         AND source_kind IS ? AND source_id IS ?
       ORDER BY first_seen_at ASC LIMIT 1`,
    ).get(
      input.code, input.change_id ?? null, input.task_id ?? null, input.session_id ?? null,
      input.source_kind ?? null, input.source_id ?? null,
    );
    const ts = nowIso();
    if (existing) {
      db.prepare(
        `UPDATE incidents SET message = ?, severity = ?, retryable = ?, evidence_json = ?,
         occurrence_count = occurrence_count + 1, last_seen_at = ? WHERE id = ?`,
      ).run(
        input.message, input.severity || 'error', input.retryable ? 1 : 0,
        input.evidence === undefined ? existing.evidence_json : JSON.stringify(input.evidence),
        ts, existing.id,
      );
      return rowToIncident(db.prepare('SELECT * FROM incidents WHERE id = ?').get(existing.id));
    }
    const id = `inc-${randomUUID().slice(0, 12)}`;
    db.prepare(
      `INSERT INTO incidents
       (id, code, severity, retryable, message, change_id, task_id, session_id,
        source_kind, source_id, evidence_json, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, input.code, input.severity || 'error', input.retryable ? 1 : 0, input.message,
      input.change_id ?? null, input.task_id ?? null, input.session_id ?? null,
      input.source_kind ?? null, input.source_id ?? null,
      input.evidence === undefined ? null : JSON.stringify(input.evidence), ts, ts,
    );
    return rowToIncident(db.prepare('SELECT * FROM incidents WHERE id = ?').get(id));
  });
}

function resolveIncident(db, id, resolution) {
  const result = db.prepare(
    `UPDATE incidents SET status = 'resolved', resolved_at = ?, resolution = ?
     WHERE id = ? AND status = 'open'`,
  ).run(nowIso(), resolution || 'resolved', id);
  return { resolved: result.changes > 0 };
}

const LIST_INCIDENTS_SQL = "SELECT * FROM incidents WHERE (@status IS NULL OR status = @status) AND (@change_id IS NULL OR change_id = @change_id) AND (@task_id IS NULL OR task_id = @task_id) ORDER BY last_seen_at DESC LIMIT @maxn";

function listIncidents(db, { status = null, change_id = null, task_id = null, limit = 100 } = {}) {
  return db.prepare(LIST_INCIDENTS_SQL).all({
    status, change_id, task_id, maxn: Math.min(Math.max(limit, 1), 500),
  }).map(rowToIncident);
}

function enqueueProjection(db, { tool_name, event_cursor, max_attempts = 3 } = {}) {
  if (!tool_name) throw new RuntimeStateError('VALIDATION_ERROR', 'projection tool_name required');
  const cursor = Number.isInteger(event_cursor)
    ? event_cursor
    : Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events').get().id);
  const result = db.prepare(
    `INSERT INTO projection_jobs (tool_name, event_cursor, max_attempts)
     VALUES (?, ?, ?)`,
  ).run(tool_name, cursor, max_attempts);
  return readProjectionJob(db, Number(result.lastInsertRowid));
}

function readProjectionJob(db, id) {
  return db.prepare('SELECT * FROM projection_jobs WHERE id = ?').get(id) || null;
}

const LIST_PROJECTION_JOBS_SQL = "SELECT * FROM projection_jobs WHERE (@status IS NULL OR status = @status) ORDER BY id ASC LIMIT @maxn";

function listProjectionJobs(db, { status = null, limit = 100 } = {}) {
  return db.prepare(LIST_PROJECTION_JOBS_SQL).all({
    status, maxn: Math.min(Math.max(limit, 1), 500),
  });
}

function processProjectionJobs(db, {
  rootDir = '.', project = defaultProjector.projectAll, limit = 10,
} = {}) {
  const pending = listProjectionJobs(db, { status: 'pending', limit });
  const jobs = [];
  for (const row of pending) {
    const claimed = db.prepare(
      "UPDATE projection_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'",
    ).run(nowIso(), row.id);
    if (claimed.changes === 0) continue;
    const active = readProjectionJob(db, row.id);
    try {
      const projection = project(db, { rootDir });
      const ts = nowIso();
      db.prepare(
        `UPDATE projection_jobs SET status = 'completed', attempts = attempts + 1,
         last_error = NULL, updated_at = ?, completed_at = ? WHERE id = ?`,
      ).run(ts, ts, row.id);
      const related = db.prepare(
        "SELECT id FROM incidents WHERE status = 'open' AND source_kind = 'projection_job' AND source_id = ?",
      ).all(String(row.id));
      for (const incident of related) resolveIncident(db, incident.id, 'projection completed on retry');
      jobs.push({ id: row.id, status: 'completed', projection });
    } catch (error) {
      const attempts = active.attempts + 1;
      const status = attempts >= active.max_attempts ? 'failed' : 'pending';
      db.prepare(
        `UPDATE projection_jobs SET status = ?, attempts = ?, last_error = ?, updated_at = ?
         WHERE id = ?`,
      ).run(status, attempts, error.message, nowIso(), row.id);
      const incident = recordIncident(db, {
        code: 'PROJECTION_FAILED', severity: 'error', retryable: true,
        message: error.message, source_kind: 'projection_job', source_id: String(row.id),
        evidence: { tool_name: row.tool_name, event_cursor: row.event_cursor, attempts },
      });
      jobs.push({ id: row.id, status: status === 'pending' ? 'retrying' : 'failed', error: error.message, incident_id: incident.id });
    }
  }
  return { processed: jobs.length, jobs };
}

function requeueInterruptedProjections(db, { staleBefore } = {}) {
  const cutoff = staleBefore || new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (typeof cutoff !== 'string' || Number.isNaN(Date.parse(cutoff))) {
    throw new RuntimeStateError('VALIDATION_ERROR', 'staleBefore must be an ISO date-time');
  }
  const result = db.prepare(
    `UPDATE projection_jobs
     SET status = 'pending', last_error = 'interrupted projection requeued by doctor',
         updated_at = ?, completed_at = NULL
     WHERE status = 'running' AND updated_at < ?`,
  ).run(nowIso(), cutoff);
  return { requeued: result.changes, stale_before: cutoff };
}

function requeueFailedProjections(db) {
  const result = db.prepare(
    "UPDATE projection_jobs SET status = 'pending', attempts = 0, updated_at = ? WHERE status = 'failed'",
  ).run(nowIso());
  return { requeued: result.changes };
}

function ensureProjectionJob(db, { tool_name = 'runtime.reconcile' } = {}) {
  const eventCursor = Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events').get().id);
  const projectedCursor = Number(db.prepare(
    "SELECT COALESCE(MAX(event_cursor), 0) AS id FROM projection_jobs WHERE status IN ('pending', 'running', 'completed')",
  ).get().id);
  if (eventCursor <= projectedCursor) return { enqueued: false, event_cursor: eventCursor };
  return { enqueued: true, job: enqueueProjection(db, { tool_name, event_cursor: eventCursor }) };
}

function readConsumerCursor(db, name) {
  const row = db.prepare('SELECT cursor FROM event_consumers WHERE name = ?').get(name);
  return row ? Number(row.cursor) : 0;
}

function writeConsumerCursor(db, name, cursor) {
  if (!name || !Number.isInteger(cursor) || cursor < 0) {
    throw new RuntimeStateError('VALIDATION_ERROR', 'consumer name and non-negative cursor required');
  }
  db.prepare(
    `INSERT INTO event_consumers (name, cursor, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       cursor = MAX(event_consumers.cursor, excluded.cursor), updated_at = excluded.updated_at`,
  ).run(name, cursor, nowIso());
  return { name, cursor: readConsumerCursor(db, name) };
}

module.exports = {
  RuntimeStateError,
  recordIncident,
  resolveIncident,
  listIncidents,
  enqueueProjection,
  readProjectionJob,
  listProjectionJobs,
  processProjectionJobs,
  requeueInterruptedProjections,
  requeueFailedProjections,
  ensureProjectionJob,
  readConsumerCursor,
  writeConsumerCursor,
};
