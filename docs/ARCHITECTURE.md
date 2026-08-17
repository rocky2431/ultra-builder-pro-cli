# Ultra Builder Pro architecture

Ultra Builder Pro is a file-first workflow asset package for six coding-agent hosts,
implementing the provider-neutral **Ultra Core Protocol**: cognitive alignment,
per-fact authority, explicit work-package grants, typed evidence, bounded effects,
checkpoints, and terminal review convergence — carried entirely by Skills,
owner-readable files, Git, host adapters, and optional Hooks. The host model owns
meaning and strategy; Ultra mechanizes only portable prompts, observable files,
bounded effects, and recovery.

## System boundary

```text
Owner request
    │ explicit selection or verified execution grant (session-local / durable)
    ▼
User-invoked Skill ──────── stops at the next owner boundary
    │
    ├── model-invoked disciplines (reasoning methods)
    ├── source / tests / runtime / primary documentation
    └── canonical project files + Git
             │
             ├── optional five hooks (derived context and effect guard)
             └── optional delegate CLI (bounded external host process)
```

Ultra has no semantic runtime supervisor. Reading the files is the recovery protocol;
editing the files is the state transition; Git is the journal and rollback mechanism.

## Four planes

### Method plane

Fourteen `skills/*/SKILL.md` files carry the workflow:

- eight owner-invoked workflows;
- five model-invoked reusable disciplines;
- one read-only router.

The exact allowlists live in `adapters/_shared/runtime-assets.cjs`. Public workflows
are explicit by default. The narrow exception is an accepted Change-scoped `Execution
Grant` in one of two modes. `session-local`: Research, Plan, Dev, Test, and Deliver
reconciliation may be selected by the model only while the same session still contains
the owner's activation and approved task ledger; once that conversation activation is
lost, the work stops. `durable work-package`: a fresh Agent or host may continue one
exact work package, but only after stably verifying the recorded grant. Stored text
alone grants nothing, and neither mode grants finalization or archive; owner
checkpoints, final delivery effects, and every external effect still stop.

Research's seventeen references are workflow-owned semantic lenses. Its optional
`wayfinding.md` maps a multi-lens question without becoming a new Skill or authority.
The reusable mechanics remain separate: Grilling owns the interaction loop, Think owns
one consequential decision, and Domain Modeling owns vocabulary promotion.

### Authority plane

Canonical semantic authority consists of:

- `.ultra/project-brief.md` for raw owner intake and the initial outline;
- `.ultra/north-star.md` for the accepted direction, outcome or metric decision, hard
  constraints, and exclusions established by Research;
- `.ultra/specs/*.md` for product, architecture, discovery, and research distillate;
- `.ultra/changes/{active,archive,abandoned}/<id>/intent.md` for bounded outcomes, North
  Star Trace, and a required Execution Grant (`session-local` and inert without current-
  session activation by default) with one stable id across directory moves;
- append-only `.ultra/tasks.json` v2 rows carrying `change_id` and the sole task status,
  plus each task's status-free `context_file`;
- `.ultra/decisions/*.md`, typed `.ultra/evidence/`, `.ultra/test-report.json`, and research;
- repository-root `CONTEXT.md` for ubiquitous language;
- Git for revision identity, history, moves, diff, and rollback.

Each semantic fact has one canonical representation. A summary can point to authority,
but cannot become a second authority merely because it is convenient to read.
Task status therefore lives only in `.ultra/tasks.json`. Legacy context Status and
Complexity fields are migration observations; readers report them and the ledger wins.
Current task evidence uses `ultra-task-evidence-v2`, whose typed command, inspection,
owner-judgment, and external-observation entries retain distinct authorities. Only the
owner can supply an owner-judgment result. Structural validators report exact facts and
never decide semantic acceptance. Command and external evidence store a safe
repository-relative raw ref plus `raw_evidence_sha256`; structural validation does not
open that ref. Dev binds bounded stable ordinary non-symlink receipt bytes before record
publication, while Test, Status, and Deliver recheck the raw digest and then the exact
record `evidence_digest`. The product-worktree digest excludes `.ultra/evidence/**`, so
evidence publication cannot invalidate the freshness value it records.

One primary host model writes this authority in a worktree. Native subagents are
read-only sensors; delegated CLIs write isolated non-`.ultra` roots and return receipts.
Sequential Changes share the ledger by stable id, while current readers filter by the
one unique active Change. This keeps concurrency explicit in Git instead of adding a
semantic lock service or workflow engine. When the canonical writer itself changes
Agent, an owner-granted primary transfer moves the role exclusively — a derived
OFFER binding canonical refs/hashes, HEAD, and worktree digest; a receiver ACK that
is ready only on full stable-read match; sole-writer execution; a frozen terminal
RESULT — with receipts under `.ultra/.runtime/handoffs/` kept as rebuildable
observations and delegated workers never acquiring canonical write authority
(`skills/ultra-change/references/primary-transfer.md`).

Autonomous coding uses the host's existing model-tool loop, one canonical writer, and
the same task/evidence/review files. Ultra adds no persisted route position: budgets are
hard ceilings, while the model interprets whether acceptance and stop conditions hold.

### Adaptation plane

`adapters/*.js` translates the shared package into native host surfaces:

- skill frontmatter and Codex `agents/openai.yaml` policy;
- plugin manifests and host registries;
- hook command paths and wire normalization;
- atomic managed installation, provenance, doctor, and uninstall behavior.

`adapters/_shared/plugin-core.cjs` owns the common copy and managed-publication
mechanics. `host-profile.cjs` owns the six non-interactive delegation argv contracts.
Adapters never rewrite workflow meaning.

### Why the old Agents are Skill assets now

The retired custom-agent files did not own product authority. They contained reusable
review lenses, debugging, test execution, and review coordination. v0.26 keeps those
methods on the common surface all six hosts actually share:

- six review workers map to `ultra-review/references/{code,design,errors,tests,spec,comments}.md`;
- review coordination and the former general code reviewer map to the parent
  `ultra-review` workflow, immutable Worker Packet, and shared schemas;
- debugging maps to `ultra-dev/references/debugging.md`;
- test execution maps to `ultra-tdd/references/test-execution.md`.

The references are copied as assets of their parent Skill. Native bounded subagents are
an execution option, not an installed Ultra authority. When a host has no equivalent,
the parent model runs the same references sequentially.

### Observation plane

Five hooks read canonical files and emit bounded context or observations. Their output
under `.ultra/.runtime/` and `.ultra/progress/`, and review artifacts under
`.ultra/reviews/`, are derived rather than semantic authority. A current strict review
session contains `WORKER-PACKET.json`, `ADMISSION.json`, every selected specialist
artifact, and `SUMMARY.json`; retain it until aggregate Test and Deliver have both consumed it
successfully, then it may be garbage-collected. Premature loss requires a fresh Review
and Test; never reconstruct the old receipt. The dangerous-command hook is the only
hard effect guard; it classifies a small named destructive set and provides an
exact-command authorization repair.
Additive protected-branch publication remains advisory when portable host wiring cannot
project a trusted owner-approval receipt; history rewrites and branch deletion remain
guarded.

## Completion and recovery

An operation is complete only when its accepted user outcome works through the real
public seam. Route/schema/UI shells, local unit green, or an edited ledger status are not
end-to-end evidence by themselves. A task remains `in_progress` through its task review;
only after blocking findings are resolved or authoritatively dispositioned and affected
v2 evidence is refreshed may the primary model write `completed` to the ledger.

Every user Skill starts by reading:

1. zero or one active `change_id`, diagnosing more than one;
2. `.ultra/tasks.json` tasks whose `change_id` matches it, treating that ledger as the
   sole task-status authority;
3. the matching frontier task's `context_file` and closing `## Resume Note`;
4. `CONTEXT.md` and relevant decisions;
5. the active Change, specifications, current v2 task evidence and retained task-review
   provenance, and current Git state.

That same sequence works after compaction, a fresh process, disabled hooks, or a host
change. Compact snapshots can accelerate recovery but never outrank the source files.

## Integration defence

Three independent Skills protect the vertical path:

1. `ultra-plan` records model-selected technical seams, asks the owner only for a
   public-contract or material trade-off, and rejects horizontal feature tasks.
2. `ultra-dev` records six separate evidence dimensions, including real persistence,
   default-on behavior, vertical execution, and spec trace.
3. `ultra-test` searches exports for real consumers, exercises the primary flow, and
   binds the result to Change id, task ids, intent, HEAD, product-worktree digest, exact
   raw receipt SHA-256 values, and the containing task-evidence digests.

These are independent sensors. None rewrites a finding into product truth.

## Delegation

`ubp delegate run` validates all paths inside the selected project, reads a bounded
instruction and permission JSON, builds argv from one host profile, and starts a
background worker. Declared writable roots must already exist inside the delegated
worktree; no readable-root or external-effect grant can widen the host's native
sandbox. Empty writable roots select native read-only mode. The model returns a
schema-constrained final response; the Node worker validates `finished`, `blocked`, or
`failed` and atomically publishes `result.json` beside the instruction. The model never
writes its own receipt; stdout, stderr, native final output, and the launch receipt
remain diagnostic files.

The instruction binds the active `change_id` and one of three semantic scopes: task
execution/continuation, scoped Research evidence, or aggregate Change
review/verification. Only task execution requires a task row. The read-only Research
and aggregate scopes preserve the same process boundary without inventing work merely
to make delegation reachable.

Delegation does not grant authority or copy semantic state into another store. The
worker reads and writes the same repository files in the specified worktree.

## Optional Graph/Loop control plane

Long-running, multi-Agent, cross-Host work can justify an external coordination
layer (for example a LoopX-style kernel) that owns goal/todo identity, claims and
leases, attention queues, quotas, human-gate records, handoff receipts, and
append-only run/effect observations. Such a layer is **optional and currently not
integrated**: no adapter, dependency, daemon, or scaffold for one ships in this
package, and the Ultra Core Protocol remains fully usable on files plus Git with
every optional layer absent.

The boundary is fixed regardless of future integration: the control plane may
observe and coordinate — it may never own the North Star, product meaning,
acceptance, semantic severity, architecture or scope decisions, a "quality is
sufficient" verdict, or the authority to start an unauthorized Agent. Enabling it
requires a real coordination problem the owner accepts (multi-session parallel
frontiers, claim/write conflicts, long external waits, explicit quotas, cross-Host
handoff) plus an adapter with a live consumer; deleting or disabling it must always
leave canonical project truth and human recovery intact.

## Deliberate absences

The architecture does not include:

- an Ultra database or SQLite dependency;
- an MCP server or tool protocol;
- a workflow state machine or semantic validator;
- a background orchestration daemon;
- command or custom-agent prompt projections;
- general memory, code graph, browser, deployment, or framework packages.

Adding one of these requires a reproduced failure that the file-first path cannot
repair, a named authority boundary, and a primary-path regression test.
