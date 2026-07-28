# `.ultra/state.db` access policy

> Multi-process access contract. Current authority is defined by
> [`DECISIONS.md`](./DECISIONS.md) and the live database schema.

`.ultra/state.db` is the only authoritative state store for baselines, changes,
decision threads/items, tasks, workflow runs/steps, events, sessions, incidents,
projections, telemetry, and spec references
(D18, D52, D54). Every process
that touches it must follow the rules below; deviations are bugs.

## 1. Three-role write matrix

| Role | tasks | baselines | change/workflow/artifact state | decisions | events | sessions | telemetry | specs_refs | migration_history |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **MCP server** (single writer for mutables) | RW | RW | RW | RW | RW | RW | RW | RW | RW |
| **CLI** (`ultra-tools …`) | R | RW (init only) | R | R | RW (append-only) | R | R | R | RW (migration only) |
| **Orchestrator daemon** | R | R | R | R | RW | RW | RW | RW | R |

- **R** = read-only;
- **RW** = read + write;
- A `(append-only)` qualifier means the role may execute `INSERT INTO`
  but never `UPDATE` / `DELETE`.

The CLI may indirectly mutate ordinary workflow tables by spawning the MCP server over
stdio and calling `task.update`, `session.spawn`, etc. — but the actual
SQLite write is performed by the MCP server's writer connection. The documented
exceptions are initial schema/baseline creation, migration, and explicitly
authorized backup-first doctor recovery. The CLI never provides a parallel raw
write API for normal task, change, session, or baseline lifecycle updates.

The append-only carve-out for `events` exists because `events.id INTEGER
PRIMARY KEY AUTOINCREMENT` makes concurrent inserts collision-free under
WAL + `busy_timeout`. This lets hooks and short-lived CLI invocations
record audit observations without paying the cost of a full MCP round trip.
It does not grant lifecycle authority: external writers and public
`task.append_event` use the published observation allowlist, while lifecycle event
names are emitted only inside the mutation that owns the corresponding state change.
Consumers must verify mutable rows rather than infer success from an event name.

## 2. Connection discipline

Every process **must**:

1. Open the database with WAL + `busy_timeout=5000` + `foreign_keys=ON`.
   Use `mcp-server/lib/state-db.cjs` `openStateDb` so the pragmas are
   applied uniformly.
2. Wrap every mutable state operation with `state-ops.cjs` `tx(db, fn)`. The
   helper calls better-sqlite3's immediate transaction variant, so the writer
   lock is acquired before user code runs and the whole operation rolls back on
   failure.
3. Retry the complete transaction up to **10 attempts** on `SQLITE_BUSY`, using
   decorrelated jitter from a 50 ms base with a 2 s cap. Never retry only a
   suffix of a failed transaction or preserve partial state.
4. Close the connection in a `finally` block. WAL files (`-wal`,
   `-shm`) are reclaimed on the last writer's close.

Reads never need explicit transactions; better-sqlite3 reads observe a
consistent snapshot under WAL.

## 3. WAL requirement

WAL is part of the authority contract, not an optional performance setting.
`openStateDb` asks SQLite to enable WAL and checks the actual returned mode. If
the storage layer returns anything else, startup fails with
`STATE_DB_WAL_UNAVAILABLE`. Ultra does not silently downgrade to a different
concurrency model. Move `.ultra/state.db` to storage that supports SQLite WAL or
resolve the mount/runtime constraint before retrying.

## 4. Where each table is owned

| Table              | Writer of record                                      |
|--------------------|--------------------------------------------------------|
| `baselines`        | MCP server (`baseline.start` / `baseline.record` / `baseline.converge`); initialization and legacy-projection migration may create only the first draft or compatibility row |
| `tasks`            | MCP server (`task.create` / `task.update` / `task.delete`) |
| `changes`          | MCP server (`change.create` / `change.update` / `change.converge` / `change.archive`) |
| `decision_threads`, `decision_items` | MCP server (`decision.thread_start` / `decision.open` / `decision.resolve` / `decision.delegate` / `decision.defer` / `decision.supersede` / `decision.complete` / `decision.checkpoint`); only pending questions needed for recovery, normalized choices, lifecycle completion, and optional artifact checkpoints are stored, never prompts or transcripts |
| `workflow_runs`, `workflow_steps` | MCP server (`workflow.start` / `workflow.step` / `workflow.complete`); skills provide evidence inputs but never write rows directly |
| `artifacts`, `context_snapshots`, `spec_learning_candidates`, `trace_links` | MCP server through change lifecycle tools |
| `incidents`, `projection_jobs`, `event_consumers`, `circuit_breaker` | MCP server; backup-first doctor recovery may perform only documented mechanical transitions |
| `events`           | MCP server for lifecycle events; approved processes and `task.append_event` for allowlisted append-only observations |
| `sessions`         | MCP server (`session.spawn` / `session.close` / `session.heartbeat`); orchestrator may write status transitions |
| `telemetry`        | MCP server (collected from tool-call wrappers); orchestrator may dump bulk samples |
| `specs_refs`       | MCP server (rebuilt on `spec_changed` event); orchestrator may rebuild |
| `migration_history`| schema initializer and `ultra-tools migrate` or doctor repair |
| `schema_version`   | schema initializer, `ultra-tools db init`, migration, and doctor repair |

## 5. Forbidden patterns

- **No file copies for state.** Don't `cp .ultra/state.db
  somewhere/state.db` and edit; use `ultra-tools db backup`.
- **No long-held writer connections** outside the MCP server. Pop a
  short transaction, finish, close.
- **No `PRAGMA journal_mode` toggling at runtime** by any process other
  than the orchestrator's boot-time WAL detector.
- **No raw SQL in command md files.** Commands call MCP tools or
  `ultra-tools …` subcommands; the SQL lives in `mcp-server/lib`.
- **No `vacuum` / `wal_checkpoint(TRUNCATE)` from inside a transaction.**
  Maintenance subcommands open their own connection.

## 6. Maintenance windows

`ultra-tools db checkpoint` and `ultra-tools db vacuum` are safe to run
while the MCP server is up (they take their own connection and obey the
busy timeout). `db backup` uses better-sqlite3's online `.backup` API
and produces a consistent snapshot without blocking writers.

## 7. Verification

The contract on this page is enforced by:

- `mcp-server/tests/concurrency.test.cjs` — three writer threads
  appending to `events` simultaneously; asserts no `SQLITE_BUSY` escapes
  the retry loop and the resulting `events.id` sequence has no gaps and
  no duplicates.
- `mcp-server/tests/state-ops.test.cjs` — immediate transactions, rollback,
  status transitions, task contracts, and event coupling.
- `mcp-server/lib/workflow-state.test.cjs` — ordered workflow transitions,
  evidence/output requirements, blocking/resume, and cross-stage gates.
