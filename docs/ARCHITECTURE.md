# Ultra Builder Pro CLI — Architecture

> Single-page entry point for reviewers and contributors. The detailed
> roadmap and decision log live in [`docs/PLAN.zh-CN.md`](./PLAN.zh-CN.md);
> this file freezes the architectural shape that the PLAN drives toward.
>
> Trace: PLAN §4, decisions D12 / D13 / D18 / D20 / D29 / D32 / D33.

## 1. One sentence

`ultra-builder-pro-cli` is a multi-runtime plugin suite that **distributes** the
Ultra Builder Pro engineering loop (skills + commands + workflow hooks) as
native Claude Code, OpenCode, and Codex plugins, and
**runs** that loop with isolated sessions sharing one authoritative state
store (`.ultra/state.db`).

It is not an agent and it is not a memory provider. It is the workflow substrate
the supported hosts share.

## 2. Three layers

```
                       ┌──────────────────────────┐
                       │       runtime CLI        │
                       │  (claude / opencode /    │
                       │   codex)                 │
                       └────────────┬─────────────┘
                                    │
                ┌───────────────────┼────────────────────┐
                │                   │                    │
                ▼                   ▼                    ▼
        ╔══════════════╗   ╔════════════════╗   ╔══════════════╗
        ║   skill/     ║   ║   MCP server   ║   ║ ultra-tools  ║
        ║  (knowledge) ║   ║  (state ops)   ║   ║   (Bash      ║
        ║              ║   ║                ║   ║    fallback) ║
        ╚══════╤═══════╝   ╚════════╤═══════╝   ╚══════╤═══════╝
               │                    │                  │
               │ resolve / read     │ task.* etc.      │ selected init /
               │  (D29 read-only)   │                  │ recovery / ops
               └────────────┬───────┴──────────────────┘
                            ▼
                  ┌─────────────────────┐
                  │   .ultra/state.db   │
                  │  (SQLite + WAL)     │  ← single authoritative store
                  └──────────┬──────────┘
                             │ projector (Phase 2.6)
                             ▼
              .ultra/tasks/tasks.json     (read-only view)
              .ultra/tasks/contexts/*.md  (read-only header)
              .ultra/activity-log.json    (optional dump)
```

| Layer        | Role                                         | Form                                                  |
|--------------|----------------------------------------------|-------------------------------------------------------|
| **skill**    | knowledge carrier; tells the runtime *what to do* | `skills/<name>/SKILL.md` discovered natively by all supported runtimes |
| **MCP**      | authoritative workflow-state API             | stdio MCP server exposing 29 live tools across task/session/change/system/plan families in [`spec/mcp-tools.yaml`](../spec/mcp-tools.yaml) |
| **CLI**      | explicit initialization, recovery, diagnostics, and orchestration | `ultra-tools` / `ubp-orchestrator`; only commands listed by `--help` are executable (see [`spec/cli-protocol.md`](../spec/cli-protocol.md)) |

Why three: skills give us behavior portability across runtimes; MCP gives
us a strongly-typed contract so we can refactor implementations without
rewriting prompts; the CLI supplies bounded maintenance and recovery paths when
the MCP cannot start. It is deliberately not a second change-state API:
continuous change mutations remain MCP-only and fail closed (D12).

The skill layer is **read-only by design** (D29) and is discovered directly by
each host. Ultra exposes no `skill.*` MCP family: skills are documentation, not
RPC, and host-native loaders own resolution and invocation.

## 3. Authoritative state — `.ultra/state.db`

All durable Ultra workflow state lives in one SQLite file with WAL enabled. Schema is
fixed in [`spec/schemas/state-db.sql`](../spec/schemas/state-db.sql) and
covers fifteen tables:

| Table              | Holds                                             | Phase |
|--------------------|---------------------------------------------------|-------|
| `tasks`            | task rows — id, status, deps, files_modified, …   | 2     |
| `events`           | append-only event stream; `id` is subscription cursor (D31) | 2 |
| `sessions`         | execution sessions, **including lease + heartbeat fields** (D32) | 4.5 |
| `schema_version`   | applied schema version (cross-version misread guard, D30) | 2 |
| `migration_history`| one row per migration attempt (audit trail)        | 2     |
| `telemetry`        | per-session token / cost / tool-call counters     | 6     |
| `specs_refs`       | spec change tracking → staleness propagation       | 5     |
| `circuit_breaker`  | bounded retry and halt state for failed tasks       | 5     |
| `changes`          | continuous feature/fix/incident lifecycle           | 8C    |
| `artifacts`        | intent/context/verification artifact registry       | 8C    |
| `context_snapshots`| compiled context hashes, git head, provider refs    | 8C    |
| `trace_links`      | task/spec/change traceability                        | 8C    |
| `incidents`        | structured runtime failures and resolutions         | 8C    |
| `projection_jobs` | durable projection outbox/retry state                | 8C    |
| `event_consumers` | durable monotonic consumer cursors                   | 8C    |

Two rules make this work:

1. **No double source (D32).** lease/heartbeat live only in `sessions`,
   not in a `lease.json` file. Activity log lives only in `events`, not
   in JSON files. `tasks.json` and the status header in
   `contexts/task-*.md` are **projections** generated by the projector;
   manual edits are overwritten on the next state.db change.

2. **Single writer for mutable tables, multi-writer for `events`.**
   `.ultra/state.db` opens in WAL with `busy_timeout=5000`. The MCP
   server holds the single writer connection for `tasks`, `sessions`,
   `telemetry`, `specs_refs`, and `migration_history`; the CLI calls
   those tools over stdio rather than opening its own writer. The
   `events` table is append-only and explicitly multi-writer — CLI and
   orchestrator processes append directly to it under the same WAL +
   `busy_timeout` discipline, since independent INSERTs do not conflict.
   In `spec/mcp-tools.yaml` this split is captured by `writer_role: mcp`
   (must go through the MCP server) versus `writer_role: any` (any
   process may execute). Full policy lives in
   `docs/STATE-DB-ACCESS-POLICY.md` (Phase 2.2 / R25).

Subscribers always pull `events.id > since_id` rather than `max(ts)`,
because two events may share the same millisecond timestamp (D31).

### Memory ownership is outside Ultra Builder Pro

Ultra Builder Pro does not retain prompts, transcripts, tool observations,
session summaries, or cross-session memory. It ships no `memory.*` MCP family,
no recall skill, and no memory-capture hook. A separately installed provider
such as cloud-mem/claude-mem owns persistent memory and its own lifecycle. The
only related migration surface is the explicit `ultra-tools legacy-memory`
archive/prune command for data created by older releases.

## 4. Continuous changes — the daily unit of convergence

After the initial baseline delivery, every fix, feature, redesign, or incident
is represented by a `changes` row and an inspectable packet:

```text
active -> blocked -> active -> ready -> archived
   |                              |
   ├─ intent + delta + plan       └─ verification + baseline reconciliation
   ├─ linked tasks
   └─ context-manifest (current HEAD + provider metadata references)
```

`quick`, `standard`, `major`, and `incident` kinds require different evidence,
but all require completed linked tasks, current context, declared documentation
impact, and no open incident. Memory and graph payloads never enter Ultra;
`context_snapshots.provider_refs_json` stores metadata references only.

`incident` is the canonical debug lane. Creating one also registers a durable
`diagnosis.md` artifact with five mandatory sections: reproduction, hypotheses,
root cause, regression test, and recovery. Convergence validates the artifact
structure and refreshes its content hash, so a debugger result that exists only
in chat cannot satisfy delivery. A host-native debugger may produce the bounded
analysis, but the primary agent owns the artifact, linked task, regression
evidence, and final convergence decision.

Mutating MCP calls enqueue durable `projection_jobs`. Success is exposed in MCP
response metadata; failure becomes a retryable structured incident instead of a
swallowed warning. `system.doctor` is read-only by default and performs only
backup-first mechanical recovery when explicitly requested.

## 5. Sessions — the execution unit

A **session** is the standard unit of execution across all three runtimes
(D20). One session =

- a fresh OS process for the runtime,
- an isolated `git worktree`,
- a lease + heartbeat row in `sessions` (D32),
- an `artifact_dir` under `.ultra/sessions/<sid>/` for logs and scratch.

Spawning a new session for a task is gated by `session.admission_check`
(D33). If another session already owns an active lease on the same task,
the caller must pick one of three strategies before proceeding:

- `takeover` — kill the prior process, claim the lease,
- `resume` — attach to the existing session and continue,
- `abandon` — give up and let the existing session finish.

This admission gate is the smallest piece that prevents two agents from
silently double-writing the same task — it is part of the v0.1 minimum
execution layer, not deferred to Phase 5.

## 6. Compaction recovery — checkpoint as a validated consumer

`workflow_checkpoint.py` validates the current non-terminal workflow and writes
a schema-versioned checkpoint atomically before compaction. On resume,
`workflow_resume.py` reads both the live workflow and checkpoint defensively,
rejects corrupt, non-object, schema-mismatched, or terminal candidates, and
selects the newest valid state. A newer live state wins; a newer checkpoint can
atomically restore a missing or older live state before context is re-injected.
The checkpoint is therefore a recovery artifact and consumer, never a second
durable authority alongside `.ultra/state.db`.

## 7. Installation provenance — read-only cross-host diagnosis

Every Claude Code, OpenCode, and Codex adapter writes a normalized
`provenance.json` for the assets it owns. The manifest records adapter/package
identity, source metadata, per-file SHA-256 hashes, an aggregate digest, and the
host-specific plugin, MCP, hook, launcher, and runtime contracts expected at
that install scope. It never attributes a package to an enclosing consumer
repository commit.

`ubp --doctor [--json]` is read-only: it recomputes hashes and validates those
entry points, returning a non-zero degraded result for missing/corrupt
provenance, content drift, or broken host wiring. This is separate from
`system.doctor`, which diagnoses project state, projection, incidents, sessions,
and backup-first workflow recovery.

## 8. Two timelines — rule layer vs execution layer

The roadmap separates two concerns that compete for the same surface
area (D13):

```
┌─ Rule layer (Phase 1-4.5) ────────────────────────────────┐
│  contracts, state schema, command shells, runtime         │
│  installers, smoke flow, execution-lite                   │
│                                                            │
│  v0.1 (Week 8)  = rule layer fully wired + execution-lite │
└────────────────────────────────────────────────────────────┘

┌─ Execution layer (Phase 4.5-8B) ───────────────────────────┐
│  recovery, staleness, monitoring, intelligence, planning   │
│  automation, parallel worktree dispatch                    │
│                                                            │
│  v0.2 (Week 11) = recovery + monitoring + full conformance │
│  v0.3 (Week 16) = PRD → execution-plan → parallel factory  │
│  v1.0 (Week 17-18) = npm + Homebrew + pip distribution     │
└────────────────────────────────────────────────────────────┘
```

The rule layer is shipped before the execution layer because users get
value from "skills + tasks survive across sessions" long before they get
value from "ten agents in parallel." Each milestone is independently
shippable; downstream slip never blocks an earlier release.

## 9. Where to look next

| Question                                           | File                                                |
|----------------------------------------------------|-----------------------------------------------------|
| What does each MCP tool accept and return?         | [`spec/mcp-tools.yaml`](../spec/mcp-tools.yaml)     |
| How do CLI subcommands map to MCP tools?           | [`spec/cli-protocol.md`](../spec/cli-protocol.md)   |
| Exact SQLite schema?                               | [`spec/schemas/state-db.sql`](../spec/schemas/state-db.sql) |
| What does a tasks.json look like after projection? | [`spec/fixtures/valid/tasks.v4.5.json`](../spec/fixtures/valid/tasks.v4.5.json) |
| Phase-by-phase work breakdown + decision log       | [`docs/PLAN.zh-CN.md`](./PLAN.zh-CN.md)             |

## 10. Verifying the architecture

Every contract on this page is enforced by `npm run test:spec`:

- `validate-mcp-tools.cjs` — meta-schema for the tool manifest, plus
  per-tool sample input/output fixtures.
- `validate-state-db.cjs` — schema applies cleanly to a fresh in-memory
  SQLite, valid fixtures insert, invalid fixtures are rejected by
  CHECK / NOT NULL / FK constraints.
- `validate-json-schemas.cjs` — projection schemas for `tasks.json` and
  `contexts/task-*.md`.
- `validate-skills.cjs` — every existing skill passes the manifest
  contract; failures are recorded in `spec/migration-notes.md`.
- `check-cli-mapping.cjs` — every MCP tool has exactly one CLI
  subcommand and the doc table never drifts from the YAML manifest.

If any of these fails, the architecture is no longer the architecture.
