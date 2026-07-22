-- Ultra Builder Pro — authoritative state schema
-- Phase 2 builds .ultra/state.db from this file. Source of truth for all
-- baseline / change / task / session / event / telemetry data. tasks.json and context md status
-- header are projections (PLAN §7.1, D18, D32).
--
-- Trace: docs/PLAN.zh-CN.md §7.1; decisions D18/D30/D31/D32/D37/D52/D54.
--
-- PRAGMAs are applied by mcp-server/lib/state-db.ts on connection open;
-- they cannot be persisted in CREATE statements but are documented here.
--   PRAGMA journal_mode=WAL;        -- multi-reader / single-writer (R21)
--   PRAGMA synchronous=NORMAL;      -- WAL durability vs perf
--   PRAGMA busy_timeout=5000;       -- block up to 5s on lock (R25)
--   PRAGMA foreign_keys=ON;         -- enforce FK constraints

-- ──────────────────────────── project baseline ─────────────────────────────
-- The baseline is the approved, repository-scoped snapshot that every change
-- is measured against. It stores digests and evidence references, never source,
-- prompt, transcript, memory, or code-graph payloads.
CREATE TABLE IF NOT EXISTS baselines (
  id                  TEXT PRIMARY KEY,
  project_name        TEXT NOT NULL,
  project_type        TEXT,
  stack               TEXT,
  mode                TEXT NOT NULL CHECK (mode IN ('greenfield', 'brownfield', 'migrated')),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'adopting', 'blocked', 'ready', 'superseded')),
  repository_root     TEXT NOT NULL DEFAULT '.',
  scope_json          TEXT NOT NULL DEFAULT '["."]',
  repository_revision TEXT,
  repository_branch   TEXT,
  worktree_state      TEXT NOT NULL DEFAULT 'unavailable'
                        CHECK (worktree_state IN ('clean', 'dirty', 'unavailable')),
  worktree_digest     TEXT,
  worktree_files_json TEXT NOT NULL DEFAULT '[]',
  worktree_accepted   INTEGER NOT NULL DEFAULT 0 CHECK (worktree_accepted IN (0, 1)),
  known_red_accepted  INTEGER NOT NULL DEFAULT 0 CHECK (known_red_accepted IN (0, 1)),
  spec_refs_json      TEXT NOT NULL DEFAULT '[]',
  evidence_json       TEXT NOT NULL DEFAULT '[]',
  verification_json   TEXT NOT NULL DEFAULT '[]',
  unknowns_json       TEXT NOT NULL DEFAULT '[]',
  gaps_json           TEXT NOT NULL DEFAULT '[]',
  classification_json TEXT NOT NULL DEFAULT '{}',
  provider_refs_json  TEXT NOT NULL DEFAULT '{}',
  research_run_id     TEXT,
  approved_by         TEXT,
  approval_note       TEXT,
  started_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  converged_at        TEXT
);

CREATE INDEX IF NOT EXISTS baselines_status ON baselines(status, updated_at);

-- ──────────────────────────── changes ─────────────────────────────────────
-- A project baseline is continuous; each feature, fix, incident, or redesign
-- is an independently converged change unit. Only changes become terminal.
CREATE TABLE IF NOT EXISTS changes (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('quick', 'standard', 'major', 'incident')),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'blocked', 'ready', 'archived', 'cancelled')),
  intent            TEXT NOT NULL,
  docs_impact_json  TEXT NOT NULL DEFAULT '{"status":"unknown","files":[],"rationale":null}',
  provider_refs_json TEXT NOT NULL DEFAULT '{}',
  baseline_bypass_json TEXT,
  contract_json     TEXT NOT NULL DEFAULT '{}',
  classification_json TEXT NOT NULL DEFAULT '{}',
  research_disposition_json TEXT NOT NULL DEFAULT '{}',
  alignment_thread_id TEXT REFERENCES decision_threads(id) ON DELETE SET NULL,
  base_commit       TEXT,
  artifact_root     TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at         TEXT
);

CREATE INDEX IF NOT EXISTS changes_status ON changes(status, created_at);
CREATE INDEX IF NOT EXISTS changes_kind   ON changes(kind, created_at);

-- ──────────────────────────── tasks ───────────────────────────────────────
-- Authoritative task row. tasks.json is generated from this table by the
-- projector (Phase 2.6). Manual edits to tasks.json are overwritten.
CREATE TABLE IF NOT EXISTS tasks (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('architecture', 'feature', 'bugfix')),
  priority          TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  complexity        INTEGER CHECK (complexity BETWEEN 1 AND 10),
  estimated_days    REAL CHECK (estimated_days IS NULL OR estimated_days > 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'expanded')),
  deps              TEXT,                -- JSON array of task ids
  files_modified    TEXT,                -- JSON array of paths (Phase 8B conflict detection)
  session_id        TEXT,                -- current owning session (Phase 4.5)
  stale             INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0, 1)),
  tag               TEXT,                -- git branch tag (Phase 7.2)
  trace_to          TEXT,                -- spec anchor reference
  outcome           TEXT,                -- observable result owned by this task
  slice_kind        TEXT CHECK (slice_kind IS NULL OR slice_kind IN ('tracer_bullet', 'expand_contract', 'integration_checkpoint')),
  public_seam       TEXT,                -- externally observable seam exercised by the slice
  verification_command TEXT,             -- exact task-level verification command
  acceptance_json   TEXT NOT NULL DEFAULT '[]',
  context_refs_json TEXT NOT NULL DEFAULT '[]',
  docs_impact_json  TEXT NOT NULL DEFAULT '{"status":"unknown","files":[],"rationale":null}',
  ownership_json    TEXT NOT NULL DEFAULT '{}',
  context_file      TEXT,                -- projection target path
  completion_commit TEXT,                -- backfilled hash (Phase 2.8)
  change_id         TEXT REFERENCES changes(id) ON DELETE SET NULL,
  parent_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,  -- Phase 8A.1: task.expand subtask→parent
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_tag         ON tasks(tag);
CREATE INDEX IF NOT EXISTS tasks_session     ON tasks(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_stale       ON tasks(stale) WHERE stale = 1;
CREATE INDEX IF NOT EXISTS tasks_parent      ON tasks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_change      ON tasks(change_id) WHERE change_id IS NOT NULL;

-- ──────────────────────────── events ──────────────────────────────────────
-- Append-only event stream. id is the subscription cursor (D31, R26):
-- subscribers pull `id > since_id` to avoid same-ms event loss that
-- max(ts) would suffer.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  type          TEXT    NOT NULL,
  task_id       TEXT,
  change_id     TEXT,
  session_id    TEXT,
  runtime       TEXT CHECK (runtime IS NULL OR runtime IN ('claude', 'opencode', 'codex', 'kimi')),
  payload_json  TEXT
);

CREATE INDEX IF NOT EXISTS events_ts_type ON events(ts, type);
CREATE INDEX IF NOT EXISTS events_task    ON events(task_id, id);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);
CREATE INDEX IF NOT EXISTS events_change  ON events(change_id, id);

-- ──────────────────────────── sessions ────────────────────────────────────
-- Authoritative session row. lease_expires_at + heartbeat_at live ONLY here
-- (D32, R29) — no lease.json file. Worktree + artifact_dir are filesystem
-- paths owned by the session.
CREATE TABLE IF NOT EXISTS sessions (
  sid               TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL REFERENCES tasks(id),
  runtime           TEXT NOT NULL CHECK (runtime IN ('claude', 'opencode', 'codex', 'kimi')),
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

-- ──────────────────────────── circuit_breaker ─────────────────────────────
-- Per-task failure accumulator (Phase 5.2). When failure_count crosses the
-- threshold, tripped_at is stamped and `task_circuit_broken` fires. Admission
-- control refuses new spawns for tripped tasks until manually reset.
CREATE TABLE IF NOT EXISTS circuit_breaker (
  task_id             TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  failure_count       INTEGER NOT NULL DEFAULT 0,
  tripped_at          TEXT,
  last_failure_at     TEXT,
  last_failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS circuit_breaker_tripped ON circuit_breaker(tripped_at)
  WHERE tripped_at IS NOT NULL;

-- ──────────────────────────── change artifacts ────────────────────────────
CREATE TABLE IF NOT EXISTS artifacts (
  id            TEXT PRIMARY KEY,
  change_id     TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,
  path          TEXT NOT NULL,
  content_hash  TEXT,
  metadata_json TEXT,
  status        TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'archived')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(change_id, kind, path)
);

CREATE INDEX IF NOT EXISTS artifacts_change ON artifacts(change_id, kind);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id                 TEXT PRIMARY KEY,
  change_id          TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  git_head           TEXT,
  provider_refs_json TEXT NOT NULL DEFAULT '{}',
  manifest_path      TEXT NOT NULL,
  manifest_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'plan'
                       CHECK (role IN ('plan', 'implement', 'check', 'review')),
  gate               TEXT NOT NULL DEFAULT 'alignment'
                       CHECK (gate IN ('alignment', 'planning', 'implementation', 'verification', 'review', 'convergence', 'recovery')),
  next_action        TEXT NOT NULL DEFAULT 'Resolve the next Ultra workflow action.',
  readiness          TEXT NOT NULL DEFAULT 'ready'
                       CHECK (readiness IN ('ready', 'blocked')),
  blockers_json      TEXT NOT NULL DEFAULT '[]',
  context_json       TEXT NOT NULL DEFAULT '{}',
  token_estimate     INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  token_budget       INTEGER NOT NULL DEFAULT 12000 CHECK (token_budget > 0),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS context_snapshots_change ON context_snapshots(change_id, created_at);

CREATE TABLE IF NOT EXISTS spec_learning_candidates (
  id            TEXT PRIMARY KEY,
  change_id     TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  target_ref    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  resolution    TEXT,
  applied_ref   TEXT,
  before_digest TEXT,
  after_digest  TEXT,
  apply_evidence_json TEXT NOT NULL DEFAULT '[]',
  proposed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at   TEXT,
  applied_at    TEXT
);

CREATE INDEX IF NOT EXISTS spec_learning_change
  ON spec_learning_candidates(change_id, status, proposed_at);

CREATE TABLE IF NOT EXISTS trace_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id   TEXT NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  source_ref  TEXT NOT NULL,
  target_ref  TEXT NOT NULL,
  relation    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(change_id, source_ref, target_ref, relation)
);

CREATE INDEX IF NOT EXISTS trace_links_change ON trace_links(change_id, task_id);

-- ──────────────────────────── runtime reliability ─────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('warning', 'error', 'critical')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  retryable        INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  message          TEXT NOT NULL,
  change_id        TEXT REFERENCES changes(id) ON DELETE SET NULL,
  task_id          TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  session_id       TEXT REFERENCES sessions(sid) ON DELETE SET NULL,
  source_kind      TEXT,
  source_id        TEXT,
  evidence_json    TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at      TEXT,
  resolution       TEXT
);

CREATE INDEX IF NOT EXISTS incidents_open ON incidents(status, severity, last_seen_at);
CREATE INDEX IF NOT EXISTS incidents_change ON incidents(change_id, status);

CREATE TABLE IF NOT EXISTS projection_jobs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name      TEXT NOT NULL,
  event_cursor   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  last_error     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at   TEXT
);

CREATE INDEX IF NOT EXISTS projection_jobs_status ON projection_jobs(status, id);

CREATE TABLE IF NOT EXISTS event_consumers (
  name       TEXT PRIMARY KEY,
  cursor     INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ──────────────────────────── workflow runs ───────────────────────────────
-- Skills own judgment and artifact content. MCP owns durable transitions,
-- evidence references, output digests, blockers, and recovery position.
CREATE TABLE IF NOT EXISTS workflow_runs (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL
                       CHECK (kind IN ('init', 'research', 'plan', 'change', 'dev', 'test', 'review', 'deliver')),
  mode               TEXT,
  subject            TEXT NOT NULL,
  definition_version TEXT NOT NULL DEFAULT '1.0',
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'blocked', 'ready', 'completed', 'cancelled')),
  current_step       TEXT,
  baseline_id        TEXT REFERENCES baselines(id) ON DELETE SET NULL,
  change_id          TEXT REFERENCES changes(id) ON DELETE SET NULL,
  task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  blockers_json      TEXT NOT NULL DEFAULT '[]',
  approval_json      TEXT,
  summary_json       TEXT NOT NULL DEFAULT '{}',
  started_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at       TEXT
);

CREATE INDEX IF NOT EXISTS workflow_runs_status
  ON workflow_runs(status, kind, updated_at);
CREATE INDEX IF NOT EXISTS workflow_runs_baseline
  ON workflow_runs(baseline_id, kind, updated_at);
CREATE INDEX IF NOT EXISTS workflow_runs_change
  ON workflow_runs(change_id, kind, updated_at);
CREATE INDEX IF NOT EXISTS workflow_runs_task
  ON workflow_runs(task_id, kind, updated_at);

CREATE TABLE IF NOT EXISTS workflow_steps (
  run_id          TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id         TEXT NOT NULL,
  position        INTEGER NOT NULL CHECK (position >= 0),
  title           TEXT NOT NULL,
  required        INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  evidence_json   TEXT NOT NULL DEFAULT '[]',
  outputs_json    TEXT NOT NULL DEFAULT '[]',
  decisions_json  TEXT NOT NULL DEFAULT '[]',
  semantic_records_json TEXT NOT NULL DEFAULT '[]',
  blockers_json   TEXT NOT NULL DEFAULT '[]',
  skip_reason     TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (run_id, step_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_steps_position
  ON workflow_steps(run_id, position);
CREATE INDEX IF NOT EXISTS workflow_steps_status
  ON workflow_steps(run_id, status, position);

-- ──────────────────────────── decision dialogue ─────────────────────────
-- The host owns reasoning and normalized decision content. MCP owns one-at-a-
-- time presentation, durable authority, checkpoints, and recovery. Raw prompts
-- and transcripts never belong in these tables.
CREATE TABLE IF NOT EXISTS decision_threads (
  id                 TEXT PRIMARY KEY,
  purpose            TEXT NOT NULL,
  mode               TEXT NOT NULL DEFAULT 'guided'
                       CHECK (mode IN ('guided', 'fast', 'autonomous', 'diagnostic')),
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'checkpoint_ready', 'confirmed', 'cancelled')),
  baseline_id        TEXT REFERENCES baselines(id) ON DELETE SET NULL,
  change_id          TEXT REFERENCES changes(id) ON DELETE CASCADE,
  workflow_run_id    TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
  summary_json       TEXT NOT NULL DEFAULT '{}',
  checkpoint_json    TEXT NOT NULL DEFAULT '{}',
  started_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  confirmed_at       TEXT,
  CHECK (baseline_id IS NOT NULL OR change_id IS NOT NULL OR workflow_run_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS decision_threads_status
  ON decision_threads(status, updated_at);
CREATE INDEX IF NOT EXISTS decision_threads_authority
  ON decision_threads(baseline_id, change_id, workflow_run_id, status);

CREATE TABLE IF NOT EXISTS decision_items (
  id                 TEXT PRIMARY KEY,
  thread_id          TEXT NOT NULL REFERENCES decision_threads(id) ON DELETE CASCADE,
  sequence           INTEGER NOT NULL CHECK (sequence > 0),
  phase              TEXT NOT NULL,
  question           TEXT NOT NULL,
  why_now            TEXT NOT NULL,
  recommendation     TEXT NOT NULL,
  options_json       TEXT NOT NULL DEFAULT '[]',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  dependency_ids_json TEXT NOT NULL DEFAULT '[]',
  effects_json       TEXT NOT NULL DEFAULT '{}',
  blocking           INTEGER NOT NULL DEFAULT 1 CHECK (blocking IN (0, 1)),
  status             TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'answered', 'delegated', 'deferred', 'superseded')),
  resolution_json    TEXT NOT NULL DEFAULT '{}',
  supersedes_id      TEXT REFERENCES decision_items(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at        TEXT,
  UNIQUE (thread_id, sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS decision_items_one_open
  ON decision_items(thread_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS decision_items_status
  ON decision_items(thread_id, status, sequence);

-- ──────────────────────────── seed: schema_version ────────────────────────
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('4.5', 'Phase 2 initial — tasks/events/sessions/schema_version/migration_history/telemetry/specs_refs');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('5.2', 'Phase 5.2 — circuit_breaker table for per-task trip tracking');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('8A.1', 'Phase 8A.1 — tasks.parent_id for task.expand parent→children');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('8A.2', 'Phase 8A.2 — tasks.estimated_days preserved across MCP and v4.4 migration');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('9.0', 'Continuous change units, context snapshots, trace links, incidents, projection outbox, and durable consumers');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('9.1', 'Kimi runtime support in durable events and sessions');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('10.0', 'Role-scoped context snapshots, deterministic breadcrumbs, and approval-gated specification learning');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('11.0', 'Greenfield and brownfield baseline adoption, convergence, and drift authority');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('12.0', 'Evidence-backed repository snapshots, gap ledger, safe re-adoption, and incident break-glass governance');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('13.0', 'Durable cross-stage workflow runs, step evidence, output digests, blockers, and recovery');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('14.0', 'Continuously revalidated baseline authority and persisted known-red acceptance');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('15.0', 'Typed research semantics, complete change contracts, verified learning application, and reconciliation provenance');
INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('16.0', 'Durable one-question decision dialogue, owner checkpoints, and workflow alignment gates');
