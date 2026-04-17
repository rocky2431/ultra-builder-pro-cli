'use strict';

// Phase 7.1 — Wrapper-style memory store.
//
// Three operations the runtime layer needs:
//   • retain(entry)    — store a fact / decision / error-fix / pattern / note.
//   • recall({query})  — FTS5 ranked keyword search; optional task/tag filter.
//   • reflect({tag})   — group-by-kind counts + recent entries (no LLM).
//
// The physical store is `.ultra/state.db.memory_entries` with a FTS5 virtual
// table kept in sync via triggers. See spec/schemas/state-db.sql.

const VALID_KINDS = new Set(['fact', 'decision', 'error_fix', 'pattern', 'note']);
const DEFAULT_RECALL_LIMIT = 5;
const DEFAULT_REFLECT_LIMIT = 20;

class MemoryStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function retain(db, {
  task_id = null,
  session_id = null,
  tag = null,
  kind,
  content,
  source = null,
} = {}) {
  if (!kind) throw new MemoryStoreError('VALIDATION_ERROR', 'kind required');
  if (!VALID_KINDS.has(kind)) {
    throw new MemoryStoreError('VALIDATION_ERROR', `kind must be one of ${[...VALID_KINDS].join(', ')}`);
  }
  if (!content || typeof content !== 'string') {
    throw new MemoryStoreError('VALIDATION_ERROR', 'content required (string)');
  }

  const ts = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO memory_entries (task_id, session_id, tag, kind, content, source, ts) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(task_id, session_id, tag, kind, content, source, ts);
  return { id: Number(result.lastInsertRowid), ts };
}

// FTS5 match-string escape: trim, split words, wrap any word with non-alnum
// in quotes, drop empties. Prevents injected FTS5 operators like OR/AND/NEAR.
function buildMatchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return null;
  const words = rawQuery
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/"/g, '')) // strip stray quotes
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"`).join(' OR ');
}

// Frozen SELECTs: values bind through @placeholders. No dynamic SQL concat.
const RECALL_FTS_SQL = "SELECT m.id, m.task_id, m.session_id, m.tag, m.kind, m.content, m.source, m.ts, bm25(memory_fts) AS rank FROM memory_fts JOIN memory_entries m ON m.id = memory_fts.rowid WHERE memory_fts MATCH @match AND (@task_id IS NULL OR m.task_id = @task_id) AND (@tag IS NULL OR m.tag = @tag) AND (@session_id IS NULL OR m.session_id = @session_id) ORDER BY rank ASC LIMIT @maxn";
const RECALL_RECENT_SQL = "SELECT id, task_id, session_id, tag, kind, content, source, ts FROM memory_entries WHERE (@task_id IS NULL OR task_id = @task_id) AND (@tag IS NULL OR tag = @tag) AND (@session_id IS NULL OR session_id = @session_id) ORDER BY id DESC LIMIT @maxn";

function recall(db, {
  query = '',
  task_id = null,
  tag = null,
  session_id = null,
  limit = DEFAULT_RECALL_LIMIT,
} = {}) {
  const maxn = Math.min(Math.max(Number(limit) || DEFAULT_RECALL_LIMIT, 1), 100);
  const match = buildMatchQuery(query);
  if (!match) {
    // Empty query → return recent entries (ordered by id DESC).
    return db.prepare(RECALL_RECENT_SQL).all({ task_id, tag, session_id, maxn });
  }
  return db.prepare(RECALL_FTS_SQL).all({ match, task_id, tag, session_id, maxn });
}

const REFLECT_COUNTS_SQL = "SELECT kind, COUNT(*) AS n FROM memory_entries WHERE (@tag IS NULL OR tag = @tag) AND (@since IS NULL OR ts >= @since) GROUP BY kind";
const REFLECT_RECENT_SQL = "SELECT id, task_id, session_id, tag, kind, content, source, ts FROM memory_entries WHERE (@tag IS NULL OR tag = @tag) AND (@since IS NULL OR ts >= @since) ORDER BY id DESC LIMIT @maxn";

function reflect(db, {
  tag = null,
  since = null,
  limit = DEFAULT_REFLECT_LIMIT,
} = {}) {
  const maxn = Math.min(Math.max(Number(limit) || DEFAULT_REFLECT_LIMIT, 1), 500);
  const countsRows = db.prepare(REFLECT_COUNTS_SQL).all({ tag, since });
  const counts = {};
  for (const row of countsRows) counts[row.kind] = row.n;
  const recent = db.prepare(REFLECT_RECENT_SQL).all({ tag, since, maxn });
  return { counts, recent };
}

module.exports = {
  MemoryStoreError,
  VALID_KINDS,
  retain,
  recall,
  reflect,
};
