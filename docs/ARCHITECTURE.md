# Ultra Builder Pro CLI — Architecture

> Single-page entry point for reviewers and contributors. The detailed
> roadmap and decision log live in [`docs/PLAN.zh-CN.md`](./PLAN.zh-CN.md);
> this file freezes the architectural shape that the PLAN drives toward.
>
> Trace: PLAN §4, decisions D12 / D13 / D18 / D20 / D29 / D32 / D33.

## 1. One sentence

`ultra-builder-pro-cli` is a multi-runtime plugin suite that **distributes** the
Ultra Builder Pro engineering loop (skills + commands + workflow hooks) as
native Claude Code, OpenCode, Codex, and Kimi Code plugins, and
**runs** that loop with isolated sessions sharing one authoritative state
store (`.ultra/state.db`).

It is not an agent and it is not a memory provider. It is the workflow substrate
the supported hosts share.

## 2. Three layers

```
                       ┌──────────────────────────┐
                       │       runtime CLI        │
                       │  (claude / opencode /    │
                       │   codex / kimi)          │
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
| **MCP**      | authoritative workflow-state, decision, and Context Spine API | stdio MCP server exposing 50 live tools across task/session/baseline/change/decision/workflow/system/plan families in [`spec/mcp-tools.yaml`](../spec/mcp-tools.yaml) |
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
covers twenty-one tables:

| Table              | Holds                                             | Phase |
|--------------------|---------------------------------------------------|-------|
| `baselines`        | repository classification, greenfield/brownfield adoption, explicit unborn/clean/dirty Git snapshot, specs, evidence, verification, gap ledger, persisted known-red acceptance, and approval | 12→17 |
| `tasks`            | task rows — id, status, deps, files_modified, …   | 2     |
| `events`           | append-only event stream; `id` is subscription cursor (D31) | 2 |
| `sessions`         | execution sessions, **including lease + heartbeat fields** (D32) | 4.5 |
| `schema_version`   | applied schema version (cross-version misread guard, D30) | 2 |
| `migration_history`| one row per migration attempt (audit trail)        | 2     |
| `telemetry`        | per-session token / cost / tool-call counters     | 6     |
| `specs_refs`       | spec change tracking → staleness propagation       | 5     |
| `circuit_breaker`  | bounded retry and halt state for failed tasks       | 5     |
| `changes`          | continuous feature/fix/incident lifecycle, alignment-thread link, and incident baseline bypass | 12→16 |
| `artifacts`        | intent/context/verification artifact registry       | 8C    |
| `context_snapshots`| role/gate context, readiness, budget, execution seam, hashes, git head, provider refs | 10 |
| `spec_learning_candidates` | approval-gated implementation discoveries for baseline convergence | 10 |
| `trace_links`      | task/spec/change traceability                        | 8C    |
| `incidents`        | structured runtime failures and resolutions         | 8C    |
| `projection_jobs` | durable projection outbox/retry state                | 8C    |
| `event_consumers` | durable monotonic consumer cursors                   | 8C    |
| `workflow_runs`   | init/research/plan/change/dev/test/review/deliver run authority, position, blockers, approval, and derived summary | 13 |
| `workflow_steps`  | ordered step state, evidence, decisions, immutable output paths, and recorded SHA-256 digests | 13 |
| `decision_threads` | baseline/change/workflow-bound owner-agent alignment, interaction mode, normalized summary, and checkpoint authority | 16 |
| `decision_items` | one-at-a-time owner choices, evidence, recommendations, durable effects, resolutions, delegation, deferral, and supersession history | 16 |

Two rules make this work:

1. **No double source (D32).** lease/heartbeat live only in `sessions`,
   not in a `lease.json` file. Activity log lives only in `events`, not
   in JSON files. `tasks.json` and the status header in
   `contexts/task-*.md` are **projections** generated by the projector;
   manual edits are overwritten on the next state.db change.

2. **Single writer for mutable tables, multi-writer for `events`.**
   `.ultra/state.db` opens in WAL with `busy_timeout=5000`. The MCP
   server holds the single writer connection for `baselines`, `tasks`, `sessions`,
   `changes`, `decision_threads`, `decision_items`, `workflow_runs`, `workflow_steps`, `artifacts`, `context_snapshots`,
   `spec_learning_candidates`, `incidents`, `projection_jobs`, `telemetry`,
   `specs_refs`, and `migration_history`; the CLI calls
   those tools over stdio rather than opening its own writer. The
   `events` table is append-only and explicitly multi-writer — CLI and
   orchestrator processes append directly to it under the same WAL +
   `busy_timeout` discipline, since independent INSERTs do not conflict.
   External writers and public `task.append_event` may append observations only;
   lifecycle event names are emitted by the mutation that owns the corresponding
   DB transition and no event row can substitute for that transition.
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

### Project baseline adoption

`task.init_project` classifies source, tests, deployment, persistence, package
scripts, and monorepo markers. It detects `greenfield` or `brownfield`, records
bounded classification evidence and selected repository scope, and creates the
same authoritative state shape without rewriting application code.

Initialization completes after local authority, classification, Git/scaffold setup,
and read-back verification. It does not start or complete research. An explicit
`ultra-research` invocation then records a disposition for each of the seventeen
coverage areas and executes, verifies, or reuses only the evidence needed to converge
the baseline.

Auto initialization preserves an existing Git repository and HEAD. When Git is absent,
it initializes `main`, adds the symlink-safe `.ultra` rule to `.gitignore`, and persists
the resulting `unborn` snapshot. Existing repositories keep their tracked ignore file
unchanged. It never creates a commit, remote, tag, or push. An initialized
repository cannot use a non-Git workspace hash: research must obtain approval for a
local checkpoint commit before `baseline.record`.

Projection-only v4.4 and v4.5 projects use `ultra-tools migrate` to preserve the
entire `.ultra` tree, import tasks and events, and create a `migrated/adopting`
compatibility row. Schema upgrades use `ultra-tools system doctor --repair` and
produce a pre-migration backup. Compatibility state never grants baseline approval;
`baseline.start` with `replace_migrated: true` opens the actual brownfield adoption.

`baseline.start` opens adoption, `baseline.record` captures server-hashed spec
references, bounded repository/runtime evidence, actual verification results,
known unknowns, repository branch and worktree snapshot, the categorized gap ledger,
and metadata-only external provider references, and
`baseline.converge` records explicit owner approval, including a durable
`known_red_accepted` decision when applicable. Read paths continuously revalidate
ready authority: scope, three specifications, source/runtime evidence, verification,
known-red rationale and acceptance, research provenance and output digests, repository
revision/worktree state, blocking gaps and unknowns, approver, and convergence time.
A row cannot become trusted merely because its stored status says `ready`. A ready
baseline is replaced only by an explicit re-adoption, preserving the superseded row
for recovery.
For a selected monorepo scope, the worktree digest and dirty-file list include only
that scope; out-of-scope changes remain visible repository context but cannot be
accepted implicitly by `accept_dirty_worktree`.

New ordinary changes require a healthy `ready` baseline. An active ordinary change may
continue through only the expected HEAD/worktree/spec/source drift created after its
durable `bind-baseline` step; loss of ready approval, missing evidence, blocking gaps,
or any other structural defect stops task/context/stage progression. A new incident can
start on an unhealthy baseline only with an explicit reason and approver stored in
`baseline_bypass_json`. Ordinary convergence and archive reconcile HEAD, worktree,
and tracked-spec drift atomically. Break-glass incident archive creates an open
blocking reconciliation gap, so incident recovery can finish without falsely marking
the project baseline healthy.

### Human-agent decision authority

Ultra separates autonomous evidence work from owner decision authority. The host reads
the repository, runtime, tests, and primary sources first, then exposes only the earliest
unresolved load-bearing choice. `decision.open` stores the recommendation, credible
alternatives, evidence refs, and durable effects; a partial unique index guarantees one
current question per thread. The host ends that turn and waits.

The next response becomes a normalized owner decision, explicit reversible delegation,
or consequence-bearing deferral. Prompts and transcripts are never persisted. A coherent
cluster moves through prepare/confirm checkpointing, which binds an owner-approved
decision digest to the current specification, Change Contract, alignment, or plan artifact.
Matching workflow steps and completion fail closed until the checkpoint is confirmed.
Supersession preserves prior history and reopens alignment instead of silently editing an
old decision. The shared procedure lives in
`skills/ultra-think/references/decision-dialogue.md`; status, breadcrumb, and doctor expose
only the current recovery surface.

## 4. Continuous changes — the daily unit of convergence

After the initial baseline delivery, every fix, feature, redesign, or incident
is represented by a `changes` row and an inspectable packet:

```text
active -> blocked -> active -> ready -> archived
   |                              |
   ├─ intent + delta + plan       └─ verification + baseline reconciliation
   ├─ linked tasks
   ├─ immutable context snapshots (role + gate + readiness + execution seam)
   └─ spec-learning candidates (proposed -> approved/rejected -> applied)
```

`quick`, `standard`, `major`, and `incident` kinds require different evidence,
but all require completed linked tasks, current context, declared documentation
impact, and no open incident. Memory and graph payloads never enter Ultra;
`context_snapshots.provider_refs_json` stores metadata references only.

### Context Spine

Context Manifest v3 is the immutable handoff contract between planning,
implementation, checking, review, convergence, and recovery. Each snapshot records:

- one role (`plan`, `implement`, `check`, or `review`) and lifecycle gate;
- required context references with local digests and reasons;
- readiness blockers for missing/stale required references or an incomplete
  execution contract;
- advisory attention budgets (12 files / about 12k tokens / 40% by default);
- a DB-derived execution contract (`slice_kind`, public seam, exact verification command);
- mechanically valid `allowed_transitions` and a `required_transition` only when a
  hard invariant leaves one recovery route;
- a digest of the accepted Change authority so semantic updates invalidate the
  snapshot.

Prompt input may identify the intended role/gate, add bounded reference candidates,
and lower advisory budgets. It cannot supply or override the task seam, verification
command, task context references, evidence digest, gate verdict, workflow summary, or
machine transitions. A host may attach a clearly non-authoritative recommendation.
Critical dev/test/review/deliver workflow steps record the matching
snapshot as an output; test, review, and delivery reports carry its digest forward.

`change.breadcrumb` derives the compact current position from state.db. Session,
edit, resume, and OpenCode lifecycle hooks invoke one bundled read-only reader
and inject only this breadcrumb, never the intent body,
provider content, or a conversation summary. A changed Git HEAD, task contract, or
Change semantic authority marks the snapshot stale and permits recompilation through
`change.context`.

PRD decomposition and complex-task subdivision use the active host model. The
MCP accepts the resulting structured tasks, validates schema, topology,
baseline/change ownership, and transaction boundaries, then persists them. It
does not call Anthropic, OpenAI, or another model provider and needs no separate
model API credential.

File count, token estimate, and context-share overflow produce warnings, never a
refusal. The agent may narrow reads, load files lazily, or split a slice when that
preserves correctness; it must not raise a threshold merely to clear a gate or
drop required incident evidence.

`change.learning_propose` records a durable implementation discovery without
silently rewriting the baseline. `change.learning_resolve` enforces approval,
rejection, and applied transitions. Proposed or merely approved candidates block
convergence, so daily work cannot leave accepted behavior stranded in chat or a
delta packet.

`incident` is the canonical debug lane. Creating one also registers a durable
`diagnosis.md` artifact with five mandatory sections: reproduction, hypotheses,
root cause, regression test, and recovery. Convergence validates the artifact
structure and refreshes its content hash, so a debugger result that exists only
in chat cannot satisfy delivery. A host-native debugger may produce the bounded
analysis, but the primary agent owns the artifact, linked task, regression
evidence, and final convergence decision.

Mutating MCP calls enqueue durable `projection_jobs`. Success is exposed in MCP
response metadata; failure becomes a retryable structured incident instead of a
swallowed warning. `system.doctor` is read-only by default. Explicit repair performs
backup-first schema upgrade, archive-journal recovery, session and projection
recovery, and regenerated projections. It cannot approve a baseline or replace a
corrupt SQLite file silently. `system restore` accepts only a verified SQLite backup
inside `.ultra/backups`, quarantines the corrupt authority, and rolls back on failure.
When no valid backup exists, confirmed `system rebaseline` preserves both corrupt
authority and the legacy task projection before creating a new brownfield adoption.

## 5. Sessions — the execution unit

A **session** is the standard unit of execution across all four runtimes
(D20). One session =

- one authoritative task/runtime lease;
- an isolated `git worktree` created by `session.spawn`,
- an ignored `.ultra` link from that checkout to the one central authority,
- a lease + heartbeat row in `sessions` (D32),
- an `artifact_dir` under `.ultra/sessions/<sid>/` for logs and scratch;
- either the active host operating in that exact worktree or an explicitly configured
  worker process.

Spawning a new session for a task is gated by `session.admission_check`
(D33). If another session already owns an active lease on the same task,
the caller must pick one of three strategies before proceeding:

- `takeover` — kill the prior process, claim the lease,
- `resume` — attach to the existing session and continue,
- `abandon` — give up and let the existing session finish.

This admission gate is the smallest piece that prevents two agents from
silently double-writing the same task — it is part of the v0.1 minimum
execution layer, not deferred to Phase 5.

Process status is not task status. Exit zero closes transport evidence but leaves the
task `in_progress` until workflow gates pass; failure blocks the task and records
circuit evidence. `session.close` preserves its worktree by default. Explicit cleanup
is allowed only when the worktree is clean and its commit is an ancestor of the
current checkout.

The optional `ubp-orchestrator` daemon requires both `auto_dispatch: true` and an
explicit executable plus argument array. It refuses to create a session when no real
worker can consume it. Before launch, the runner verifies that Git ignores the
symlink itself. When a legacy repository has only the directory-specific `.ultra/`
rule, the runner adds `.ultra` to the repository-local `info/exclude` file without
changing a tracked file. It then binds the checkout to the central `.ultra` and rolls
the worktree back if the ignore rule or binding cannot be established safely. The
executable is launched without a shell and receives
the session, task, runtime, worktree, artifact, central DB, checkout root, and
authority-root paths through reserved `UBP_*` environment variables that caller
configuration cannot override.
Pending tasks are skipped while stale, dependency-blocked, circuit-broken, leased, or
overlapping the declared files of an active task.

`execute-plan` is a resumable dispatcher, not a second workflow authority. It runs
only the exact current DB task graph whose change-bound `plan` workflow is completed,
healthy, and current. Empty, cyclic, duplicate-task, cross-change, stale, and merely
exported plans fail before session creation. Owner approval is present only when a
material planning choice required it. The dispatcher then runs only pending tasks whose
dependencies are DB-terminal and re-reads task state. If a
worker exits before the task converges, the current wave and plan become `paused`;
later waves remain pending. Re-running the command skips completed waves and resumes
the first unfinished one. `wave_completed` and `plan_completed` therefore describe
Ultra task convergence, while `wave_paused` and `plan_paused` preserve unfinished
gate state. Even with explicit auto-merge, integration is attempted only when the
change task is `completed`, its completion commit matches the session HEAD, its dev
workflow is ready, and its task review is current; process exit zero is insufficient.
If task or plan authority changes after wave selection but before worktree creation,
dispatch reports an authority pause without recording a worker failure or incrementing
the circuit breaker.

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

Every Claude Code, OpenCode, Codex, and Kimi Code adapter writes a normalized
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
| When does each workflow write, invalidate, and converge state? | [`docs/WORKFLOW-LIFECYCLE.md`](./WORKFLOW-LIFECYCLE.md) |

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
