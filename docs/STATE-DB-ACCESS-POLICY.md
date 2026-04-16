# `.ultra/state.db` access policy

> Phase 2.2 contract. Trace: PLAN §6 Phase 2.2, decisions D18 / D32 / D37,
> risks R21 / R25.

`.ultra/state.db` is the only authoritative state store for tasks,
events, sessions, telemetry, and spec references (D18). Every process
that touches it must follow the rules below; deviations are bugs.

## 1. Three-role write matrix

| Role                       | tasks | events | sessions | telemetry | specs_refs | migration_history |
|----------------------------|:-----:|:------:|:--------:|:---------:|:----------:|:-----------------:|
| **MCP server** (single writer for mutables) | RW | RW | RW | RW | RW | RW |
| **CLI** (`ultra-tools …`)   | R     | RW (append-only) | R | R | R | R |
| **Orchestrator daemon** (Phase 5+) | R | RW | RW | RW | RW | R |

- **R** = read-only;
- **RW** = read + write;
- A `(append-only)` qualifier means the role may execute `INSERT INTO`
  but never `UPDATE` / `DELETE`.

The CLI may indirectly mutate any table by spawning the MCP server over
stdio and calling `task.update`, `session.spawn`, etc. — but the actual
SQLite write is performed by the MCP server's writer connection. The CLI
never opens a writer connection on `tasks`, `sessions`, `telemetry`,
`specs_refs`, or `migration_history`.

The append-only carve-out for `events` exists because `events.id INTEGER
PRIMARY KEY AUTOINCREMENT` makes concurrent inserts collision-free under
WAL + `busy_timeout`. This lets hooks and short-lived CLI invocations
record audit events without paying the cost of a full MCP round trip.

## 2. Connection discipline

Every process **must**:

1. Open the database with WAL + `busy_timeout=5000` + `foreign_keys=ON`.
   Use `mcp-server/lib/state-db.cjs` `openStateDb` so the pragmas are
   applied uniformly.
2. Wrap every write in `BEGIN IMMEDIATE` (use the helper `withWrite(db,
   fn)` once Phase 2.3 lands; until then call `db.transaction(fn)()` and
   know that better-sqlite3 promotes to IMMEDIATE on the first write).
3. Retry up to **3 times** on `SQLITE_BUSY`, with exponential backoff
   starting at 25 ms. Each retry must re-issue the full transaction —
   never partially commit.
4. Close the connection in a `finally` block. WAL files (`-wal`,
   `-shm`) are reclaimed on the last writer's close.

Reads never need explicit transactions; better-sqlite3 reads observe a
consistent snapshot under WAL.

## 3. WAL fallback

WAL is **unsafe on NFS / SMB / certain Docker bind mounts** (R21). When
`.ultra/state.db` resides on such a filesystem the orchestrator must
either:

- refuse to start (preferred — surfaces the deployment problem early), or
- downgrade to `PRAGMA journal_mode = DELETE` and warn loudly. Concurrent
  writers fall back to short-burst contention; throughput drops but
  correctness holds.

Detection happens at boot: `statvfs` of `.ultra/state.db`'s mount;
`f_type` ∈ `{NFS_SUPER_MAGIC, SMB_SUPER_MAGIC}` ⇒ refuse / downgrade.

## 4. Where each table is owned

| Table              | Writer of record                                      |
|--------------------|--------------------------------------------------------|
| `tasks`            | MCP server (`task.create` / `task.update` / `task.delete`) |
| `events`           | MCP server **and** any process via append-only INSERT  |
| `sessions`         | MCP server (`session.spawn` / `session.close` / `session.heartbeat`); orchestrator may write status transitions |
| `telemetry`        | MCP server (collected from tool-call wrappers); orchestrator may dump bulk samples |
| `specs_refs`       | MCP server (rebuilt on `spec_changed` event); orchestrator may rebuild |
| `migration_history`| `ultra-tools migrate` CLI only                         |
| `schema_version`   | `ultra-tools db init` and `ultra-tools migrate` only   |

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
- Phase 2.3 will add `concurrency-update.test.cjs` — 20 worker threads
  driving `task.update` against disjoint task ids, verifying serialized
  writes through the MCP server.
