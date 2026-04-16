-- Ultra Builder Pro — authoritative state schema
-- Phase 2 builds .ultra/state.db from this file. Source of truth for all
-- task / session / event / telemetry data. tasks.json and context md status
-- header are projections (PLAN §7.1, D18, D32).
--
-- Trace: docs/PLAN.zh-CN.md §7.1; decisions D18/D30/D31/D32/D37.
--
-- PRAGMAs are applied by mcp-server/lib/state-db.ts on connection open;
-- they cannot be persisted in CREATE statements but are documented here.
--   PRAGMA journal_mode=WAL;        -- multi-reader / single-writer (R21)
--   PRAGMA synchronous=NORMAL;      -- WAL durability vs perf
--   PRAGMA busy_timeout=5000;       -- block up to 5s on lock (R25)
--   PRAGMA foreign_keys=ON;         -- enforce FK constraints

-- ──────────────────────────── tasks ───────────────────────────────────────
-- Authoritative task row. tasks.json is generated from this table by the
-- projector (Phase 2.6). Manual edits to tasks.json are overwritten.
CREATE TABLE IF NOT EXISTS tasks (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('architecture', 'feature', 'bugfix')),
  priority          TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  complexity        INTEGER CHECK (complexity BETWEEN 1 AND 10),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'expanded')),
  deps              TEXT,                -- JSON array of task ids
  files_modified    TEXT,                -- JSON array of paths (Phase 8B conflict detection)
  session_id        TEXT,                -- current owning session (Phase 4.5)
  stale             INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
  complexity_hint   TEXT CHECK (complexity_hint IN ('haiku', 'sonnet', 'opus')),
  tag               TEXT,                -- git branch tag (Phase 7.2)
  trace_to          TEXT,                -- spec anchor reference
  context_file      TEXT,                -- projection target path
  completion_commit TEXT,                -- backfilled hash (Phase 2.8)
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_tag         ON tasks(tag);
CREATE INDEX IF NOT EXISTS tasks_session     ON tasks(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_stale       ON tasks(stale) WHERE stale = 1;

-- ──────────────────────────── events ──────────────────────────────────────
-- Append-only event stream. id is the subscription cursor (D31, R26):
-- subscribers pull `id > since_id` to avoid same-ms event loss that
-- max(ts) would suffer.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  type          TEXT    NOT NULL,
  task_id       TEXT,
  session_id    TEXT,
  runtime       TEXT CHECK (runtime IS NULL OR runtime IN ('claude', 'opencode', 'codex', 'gemini')),
  payload_json  TEXT
);

CREATE INDEX IF NOT EXISTS events_ts_type ON events(ts, type);
CREATE INDEX IF NOT EXISTS events_task    ON events(task_id, id);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);

-- ──────────────────────────── sessions ────────────────────────────────────
-- Authoritative session row. lease_expires_at + heartbeat_at live ONLY here
-- (D32, R29) — no lease.json file. Worktree + artifact_dir are filesystem
-- paths owned by the session.
CREATE TABLE IF NOT EXISTS sessions (
  sid               TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL REFERENCES tasks(id),
  runtime           TEXT NOT NULL CHECK (runtime IN ('claude', 'opencode', 'codex', 'gemini')),
  pid               INTEGER,
  worktree_path     TEXT NOT NULL,
  artifact_dir      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'crashed', 'orphan')),
  lease_expires_at  TEXT NOT NULL,
  heartbeat_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS sessions_active ON sessions(status, task_id);
CREATE INDEX IF NOT EXISTS sessions_lease  ON sessions(lease_expires_at) WHERE status = 'running';

-- ──────────────────────────── schema_version ──────────────────────────────
-- Cross-version misread guard (D30, R27). Single row per applied version.
CREATE TABLE IF NOT EXISTS schema_version (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  description TEXT
);

-- ──────────────────────────── migration_history ───────────────────────────
-- Audit trail for every migration attempt (D30, R27).
CREATE TABLE IF NOT EXISTS migration_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_version  TEXT NOT NULL,
  to_version    TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('forward', 'rollback')),
  ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed', 'dry_run')),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS migration_history_ts ON migration_history(ts);

-- ──────────────────────────── telemetry ───────────────────────────────────
-- Token / cost / tool-call counters per session.
CREATE TABLE IF NOT EXISTS telemetry (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT REFERENCES sessions(sid),
  event_type     TEXT NOT NULL CHECK (event_type IN ('tool_call', 'token_usage', 'cost')),
  tokens_input   INTEGER,
  tokens_output  INTEGER,
  tool_name      TEXT,
  cost_usd       REAL,
  ts             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS telemetry_session ON telemetry(session_id, ts);
CREATE INDEX IF NOT EXISTS telemetry_type    ON telemetry(event_type, ts);

-- ──────────────────────────── specs_refs ──────────────────────────────────
-- Spec change tracking. Phase 5.3 staleness propagation reads this.
CREATE TABLE IF NOT EXISTS specs_refs (
  spec_file        TEXT NOT NULL,
  section          TEXT NOT NULL,
  anchor           TEXT,
  last_modified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (spec_file, section)
);

-- ──────────────────────────── seed: schema_version ────────────────────────
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('4.5', 'Phase 2 initial — tasks/events/sessions/schema_version/migration_history/telemetry/specs_refs');
