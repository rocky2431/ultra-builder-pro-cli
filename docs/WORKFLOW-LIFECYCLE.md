# Ultra Builder Pro workflow lifecycle

This document defines when Ultra writes authoritative state, how each workflow
advances, what invalidates evidence, and which decisions remain with the active
host and project owner. It is the operational companion to
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and the machine contracts under `spec/`.

## 1. Authority boundaries

| Surface | Owns | Must not own |
|---|---|---|
| Active host and owner | Product judgment, research content, implementation, review findings, and authorization for destructive or external effects | Durable workflow status or fabricated evidence digests |
| Skill | One reusable procedure and its evidence requirements | Project state, static product doctrine, host-specific tool fiction |
| MCP | IDs, valid transitions, hard recovery requirements, task contracts, evidence references, output hashes, and gate verdicts | Semantic route selection, research prose, code generation, memory, or model calls |
| `.ultra/state.db` | Baseline, change, decision, task, workflow, session, event, incident, projection, and evidence authority | Prompts, transcripts, external memory, or code-graph payloads |
| Generated JSON and Markdown | Read-only projections and durable artifacts | Independent lifecycle authority |
| Hook | Compact DB-derived lifecycle observation, minimal event metadata, and projection protection | Generic engineering judgment, prompt/transcript capture, parallel lifecycle logs, or arbitrary edit blocking |

Prompt input can supply facts, content paths, reasons, owner decisions, and
evidence references. MCP reads the current repository and DB, validates those
inputs, hashes outputs, and derives status. Prompt input cannot override a task's
public seam, verification command, context references, workflow summary, gate
verdict, output digest, or transition validity. A host recommendation is never stored
as MCP authority.

Load-bearing owner choices are normalized through `decision.*`; Prompt prose is not
durable authority. The host acquires observable facts autonomously, exposes one
current question, and stops. A workflow cannot advance while a matching decision
thread is active, waiting for checkpoint confirmation, or carrying a blocking
deferral.

Every change-bound research, plan, dev, test, review, and deliver run inherits
the baseline id from the owning change workflow. A Prompt cannot switch that
authority, and no new stage may start on an archived or cancelled change. Doctor
recovers a legacy change without this link into an explicitly blocked workflow;
it does not fabricate the missing provenance.

Ultra does not select an MVP. Product scope and material delivery posture are owner
decisions. The seventeen research areas are a coverage catalog, not a forced
questionnaire. Initial greenfield and brownfield research must disposition every area
as `execute`, `verify_existing`, `reuse`, `not_applicable`, or accepted `deferred`;
only selected necessary work executes. Bounded change research records the same
selection rationale over its smaller scope.

## 2. How `ultra-init` classifies a repository

`task.init_project` scans a bounded repository view while ignoring `.git`,
`.ultra`, dependencies, virtual environments, generated build output, and other
known non-source directories.

`auto` classification is deterministic:

- `brownfield` when delivered-system evidence exists: application source, tests,
  deployment configuration, or persisted-state/schema evidence;
- `greenfield` when none of those signals exists. A Git repository, README,
  package manifest, workspace manifest, or starter documentation alone does not
  prove delivered behavior;
- `migrated` is never inferred from source. It is a compatibility state created
  when older Ultra authority is preserved and upgraded. It requires a new
  evidence-backed brownfield adoption before normal work.

The scan also records bounded signal paths, detected verification commands,
evidence-backed project type and technology signals, monorepo markers, candidate
workspace roots, and whether the scan limit was reached. Explicit owner-supplied
project type or stack metadata overrides detection without deleting the observed
signals. In a monorepo, the owner selects the repository scope; baseline
worktree digests and accepted dirty files are restricted to that scope.

Classification and readiness are separate. Initialization immediately creates
or resumes `.ultra/state.db`, installs only the required scaffold, records the
classification, and completes an `init` workflow after read-back verification. It
does not create a research run. A later explicit `ultra-research` invocation selects
`full` for greenfield or `adoption` for brownfield, records coverage dispositions, and
works toward baseline readiness. Empty templates are not an approved baseline.

With `git_mode: auto`, initialization preserves an existing repository and HEAD.
When Git is absent it initializes `main` and adds the symlink-safe `.ultra` rule to
`.gitignore`; an existing repository keeps its tracked ignore file unchanged. Init
does not create a commit, remote, tag, or push. The resulting `unborn` worktree state
is durable authority, not equivalent to a non-Git workspace. Full/adoption research
must obtain explicit approval for one local checkpoint commit before
`baseline.record`; until then `BASELINE_GIT_HEAD_REQUIRED` blocks convergence.

Init completion means only that local authority, Git state, scaffold, and
classification are usable. Baseline readiness is a separate research and convergence
outcome; failure there never reopens or blocks the completed init workflow.

## 3. Durable status machines

### Baseline

```text
draft -> adopting -> ready -> superseded
            |
            -> blocked -> adopting
```

- `draft`: greenfield authority exists but has not been established.
- `adopting`: brownfield or migrated evidence is being recorded.
- `blocked`: current baseline evidence, verification, scope, or approval cannot
  converge.
- `ready`: research, evidence, repository snapshot, gaps, and approval converged.
- `superseded`: preserved historical baseline after an explicitly authorized
  replacement.

`ready` is not trusted as a label alone. Every baseline/status/doctor/change gate
revalidates its persisted fields, current files, research outputs, revision and
worktree, known-red acceptance, blocking gaps, and approval provenance. An ordinary
active change may downgrade only the expected drift created after its completed
`bind-baseline` step to warnings; it cannot downgrade adoption, migration, missing
evidence, or structural blockers. Approved incident break-glass is the only other
execution exception and creates a mandatory reconciliation gap.

### Change

```text
active <-> blocked -> ready -> archived
   \--------------------------> cancelled
```

Only a healthy `ready` baseline may authorize a new ordinary change. An incident
may bypass an unhealthy baseline only with a stored reason and approver; archive
then creates a blocking baseline-reconciliation gap.

### Task

```text
pending -> in_progress -> completed
   |            |
   v            v
 blocked <------+
   |
   -> pending

pending -> expanded -> completed
```

A task is executable only when its DB contract contains an observable outcome,
traceability, slice kind, public seam, exact verification command, acceptance
checks, context references, resolved documentation impact, owner, and valid
dependencies.

A semantic Change update marks all derived tasks stale. Clearing that marker requires
one complete execution-contract rebind through `task.update`; a marker-only clear is
rejected. MCP validates the resulting contract and appends
`task_contract_reconciled` with the current Change authority digest before a new plan
may converge.

A session process and a task have different status machines. Process exit zero closes
the execution transport but leaves the task `in_progress` until development,
integration, test, and review gates converge. Process failure marks the task `blocked`
and records failure/circuit evidence. `session.close` preserves the worktree by
default. Explicit removal succeeds only after Git proves it is clean and its commit is
integrated into the current checkout.

Dependency-wave automation advances only when every task in the current wave is
`completed` or `expanded` in the DB. A successful worker exit with open gates emits
`wave_paused` and `plan_paused`; it cannot start dependent work. Re-running the plan
resumes the first unfinished wave. Explicit auto-merge is additionally gated by task
completion, an exact completion commit, a ready dev workflow, a current task review,
clean committed work, and successful integration; otherwise the worktree remains
recoverable. Legacy tasks without change ownership retain their compatibility path,
but cannot satisfy the current change workflow contract.

Every session worktree resolves its ignored `.ultra` entry to the project authority
directory. Automated workers receive the central DB path and the isolated checkout
root separately; their supplied environment cannot override those bindings. If a
legacy `.ultra/` rule does not ignore the link itself, Ultra adds a repository-local
`info/exclude` entry without changing tracked files. A missing, tracked, still
unignored, or conflicting authority entry fails before the session row or worker is
created and the provisional worktree is removed. A process that already has
`UBP_SESSION_ID` must reuse that lease and worktree; nested spawn and worker-side close
are rejected, so the supervising parent alone settles the lease from the real process
exit. Authority drift detected after wave selection pauses the plan without recording
execution failure.

### Workflow run and step

```text
run:  active <-> blocked -> ready -> completed
                              \----> cancelled

step: pending -> in_progress -> completed
         |            |
         v            v
       blocked ------> in_progress/completed
```

Required steps execute in definition order. A step that requires evidence or an
output cannot complete without it. When the final required step completes, the
run becomes `ready`; `workflow.complete` revalidates the entire stage before
making it `completed`.

### Decision thread and item

```text
thread: active -> checkpoint_ready -> confirmed
           ^              |
           |--------------+  revision/supersession

item: open -> answered | delegated | deferred | superseded
```

A thread is bound to baseline, change, or workflow authority. A partial unique index
allows only one `open` item per thread. Resolved items remain immutable history;
changed evidence or intent uses `decision.supersede` and reopens the checkpoint.
`decision.checkpoint` first freezes a normalized decision digest, then binds explicit
owner approval to current artifact digests or a justified standalone no-artifact
case. It never stores the conversation transcript.

## 4. Write and verification lifecycle

| Stage | Authoritative writes | Completion verification | Available continuation |
|---|---|---|---|
| `init` | Baseline classification/scope, Git bootstrap state, completed init run, initialization event, projection job | DB/schema opens, scaffold/projection and read-back succeed; existing Git is preserved or missing local Git is initialized | Explicitly chosen `research`, `status`, or `doctor`; an already-ready project may also enter `change` |
| `research` | Coverage dispositions, selected step evidence, material decision checkpoints, typed semantic records with source digests, immutable reports, output paths and SHA-256 digests | Every coverage area is dispositioned; only executed/verified/reused areas require work evidence; synthesis binds current specifications and distillate; all material decisions and digests are current | Baseline record/convergence for initial research; bounded change research returns to its owning change |
| baseline convergence | Spec/source/runtime refs, verification results, known failures, unknowns, gaps, branch/HEAD/worktree, approval | Full/adoption research complete; required discovery/product/architecture refs current; revision/worktree exact; blocking gaps resolved or explicitly accepted where allowed | `change` for every initial or daily outcome |
| `change` | Complete Change Contract, profile/risk rationale, research disposition, intent/delta artifacts, and a completed capture run; a decision thread only when material intent remains unresolved | Intent, acceptance, recovery, classification, and research disposition are complete and bound to the baseline | Host selects among bounded `research`, `plan`, current `dev`, `think`, or `status` using allowed transitions |
| `plan` | Selected planning evidence, complete change-owned task rows, acceptance coverage matrix, and change-bound `.ultra/execution-plan.json`; approval only for a material owner decision | Every Change acceptance id is owned by a task; trace targets, ownership, dependencies, topology, task contracts, and exported digest match current authority | Any dependency-ready task may enter `dev` |
| `dev` | Task/session transitions, real worktree, step evidence, immutable implementation context, completion/review references | Task completed; no live session; task contract unchanged; starting context and review artifacts valid; completion commits are integrated and remain ancestors of current HEAD | Next task, then aggregate `test` |
| `test` | Immutable checking context, an explicit risk-selected verification profile, and `.ultra/reports/tests/<workflow-id>.json` | Selected dimensions and acceptance pass; every excluded dimension has a rationale; report change/task set, HEAD, worktree, context, commands, blockers, and digests agree | `review` when passing, otherwise resume `dev`/`test` |
| `review` | Immutable review context, `task`/`change`/`plan` mode, risk-selected worker provenance, two mandatory specialist axes, and coordinated summary | Current diff/HEAD and context match; the complete worker roster is selected or skipped with rationale; completed workers match specialist artifacts; both axes complete; findings and axis verdicts derive the final verdict | `deliver` only from a passing `change` review, otherwise resume implementation or checking |
| `deliver` | Convergence context, verified learning resolutions, semantic reconciliation manifest, local change archive, and immutable delivery report | Tasks/test/change-review are current; baseline semantic updates are anchored; archive and baseline transaction agree; the report contains no release action | Report local completion or start the next `change`; publish/deploy/push are separate explicitly authorized operations |
| `status` | None | Reads doctor, baseline, workflows, breadcrumb, tasks, sessions, Git, and DB-referenced reports | Shows allowed transitions, any hard required transition, and a host-owned recommendation |
| `doctor` | None by default; explicit repair writes only mechanical recovery state | Re-runs integrity, schema, workflow-output, projection, session, incident, archive, and install checks | Mechanically required recovery when unique; otherwise a set of safe recovery capabilities |

Every mutating MCP operation appends an event and enqueues projection work when
the corresponding read-only view can change. Projection failure is recorded as
a retryable incident; it does not silently convert a failed write into success.
`task.append_event` accepts only non-authoritative observations. Lifecycle events are
emitted by their owning DB mutation and never act as a substitute state transition.

## 5. Human-agent alignment lifecycle

The host first reads `decision.list` and resumes matching authority. It starts a new
thread only for a new material decision cluster. Before asking, it must:

1. inspect repository, runtime, tests, specifications, and primary-source evidence;
2. resolve evidence-answerable facts without asking the owner;
3. normalize an unambiguous decision already present in the current user request
   instead of asking for redundant confirmation;
4. ask only when the remaining choice changes intent, public behavior, compatibility,
   security, material cost, external effects, or recovery. Use the host-native
   question surface declared by `spec/interaction-contract.json`;
5. present the earliest dependent choice with a recommendation, credible alternatives,
   evidence refs, and durable effects. Up to three independent low-load facts may be
   grouped when that reduces inconsistency;
6. normalize the owner response with `decision.resolve`, explicit reversible
   delegation with `decision.delegate`, or a consequence-bearing deferral with
   `decision.defer`;
7. prepare a compact checkpoint only when a material decision cluster changes a
   durable contract and interruption recovery needs an artifact-bound boundary.

`ultra-think` owns this interaction protocol. `ultra-research`, `ultra-change`, and
`ultra-plan` invoke it at their decision boundaries. `ultra-dev`, `ultra-test`,
`ultra-review`, and `ultra-deliver` stop and route back to the same thread when new
owner authority is required; they never answer on the owner's behalf. `ultra-status`
shows only the current decision and transition set, while `ultra-doctor` diagnoses
stale checkpoint artifacts and recovery state.

When only a bound artifact changes, the same resolved thread is prepared and approved
again against the current digest; this is checkpoint renewal, not a fabricated decision
revision. When the owner choice itself changes, supersession preserves the old item and
opens one replacement.

## 6. Context and prompt follow-through

`change.context` compiles an immutable Context Manifest v3 snapshot. It combines:

- the bound baseline/change/task identity;
- a role and lifecycle gate;
- DB-backed task outcome, public seam, verification command, and required refs;
- local file hashes, current HEAD, branch, and worktree digest;
- optional metadata-only external memory or graph references;
- advisory file/token/context-share budgets;
- the current Change and task authority digests;
- readiness blockers, `allowed_transitions`, and a `required_transition` only for a
  unique hard-recovery path.

Critical stage workflows bind a matching snapshot as a durable output:

| Workflow | Required role | Required gate |
|---|---|---|
| `dev` | `implement` | `implementation` |
| `test` | `check` | `verification` |
| `review` | `review` | `review` |
| `deliver` | `check` | `convergence` |

The snapshot path and digest are then carried into test, review, and delivery
reports. This prevents a later Prompt from claiming evidence gathered under a
different context. File and token budgets warn; they do not block legitimate
work. Missing authority, required refs, task contracts, outputs, required owner
decisions, or
current gate evidence do block.

## 7. Invalidation rules

- Changing a task contract invalidates contexts and gates that depended on the
  former contract.
- Changing accepted Change intent, contract, classification, research disposition,
  provider evidence, or documentation impact marks all derived tasks stale and
  invalidates compiled contexts. Planning or task reconciliation must explicitly
  clear staleness before execution.
- Changing required source/spec content invalidates the recorded output or
  context digest.
- Changing a research semantic source invalidates that workflow even when its immutable
  step report remains unchanged.
- Changing full HEAD or the worktree invalidates aggregate test, review, and
  delivery evidence.
- A completed dev run remains valid across later task commits when its bound
  task contract is unchanged and its recorded commits remain ancestors of the
  current HEAD.
- Test, review, and delivery reports use workflow-id paths so a later run cannot
  overwrite historical evidence.
- `.ultra` workflow artifacts are excluded from application-worktree drift, but
  their own recorded SHA-256 digests are still authoritative.
- Generated `tasks.json` and task-context headers are projections. Manual edits
  are overwritten and never repair DB authority.
- A changed checkpoint artifact digest or superseded decision invalidates the linked
  decision checkpoint and blocks matching workflow advancement until reconfirmed.

## 8. Entry flows

### New project

```text
ultra-init -> Git/scaffold/authority verification -> init completed
-> explicit ultra-research -> disposition 17 coverage areas -> selected evidence work
-> local checkpoint when Git is unborn -> baseline approval
-> ultra-change -> optional bounded research/plan -> dev -> risk-selected test/review
-> local deliver/archive
```

### Existing project

```text
ultra-init -> preserve Git/classify brownfield -> init completed
-> explicit adoption research -> disposition 17 coverage areas
-> selected characterization/known-red evidence -> gap ledger -> owner approval
-> first ultra-change -> optional bounded research/plan -> dev -> test/review -> deliver
```

Adoption records the system that exists. It does not force the owner to recreate
market, persona, or roadmap claims that cannot be supported; those remain
`Unknown`, `not_applicable`, accepted `deferred`, or explicit gaps with evidence.

### Earlier Ultra project

```text
doctor/migrate with backup -> migrated compatibility authority
-> explicit brownfield re-adoption -> full convergence -> normal change loop
```

Migration preserves prior files and rows but never carries old approval forward.

### Daily maintenance

```text
ultra-status -> ultra-change intent capture
-> host chooses bounded research, plan, current task, think, or status
-> dev -> risk-selected test -> review -> deliver -> reconciled baseline
```

Quick changes shorten the artifact burden only where the machine contract allows;
they do not skip task ownership, executable acceptance, current checking, review,
or baseline reconciliation. Incidents add structured diagnosis and recovery
evidence rather than bypassing them.

### Command handoff graph

| Entry | Owns | Normal handoff |
|---|---|---|
| `ultra-init` | classification, scope, Git/scaffold bootstrap, and init verification | stops completed; exposes research/status/doctor and any already-valid change capability |
| `ultra-research` | coverage disposition, selected evidence acquisition, synthesis, and material research decisions | baseline convergence or return to the owning change |
| `ultra-think` | one material owner decision or read-only diagnosis | returns to the invoking capability after any needed checkpoint |
| `ultra-change` | outcome capture, Change Contract, risk/research routing | host selects research, plan, current dev work, think, or status |
| `ultra-plan` | task contracts, dependencies, acceptance coverage, optional material approval | any dependency-ready task through `ultra-dev` |
| `ultra-dev` | one task/session vertical slice and focused review | next `ultra-dev` task or aggregate `ultra-test` |
| `ultra-test` | risk-selected change acceptance and verification profile | `ultra-review` on pass, `ultra-dev`/`ultra-test` on failure |
| `ultra-review` | independent specification and engineering axes plus risk-selected workers | `ultra-deliver` on approval; otherwise implementation or checking |
| `ultra-deliver` | convergence, reconciliation, local archive, and delivery evidence | `ultra-status` or the next `ultra-change`; external release is separate |
| `ultra-status` | read-only authority and transition set | host recommendation among allowed transitions |
| `ultra-doctor` | read-only diagnosis and authorized mechanical recovery | required recovery only when unique; otherwise safe alternatives |

Every row permits `ultra-think` when material owner authority is missing and permits
`ultra-doctor` when state or installed-runtime authority is unhealthy. MCP makes one
of them required only when no safe alternative exists. Neither capability creates a
parallel workflow or substitutes a Prompt summary for DB state.

## 9. Recovery and diagnosis

Use `system.doctor` for project authority and `ubp --doctor` for installed host
assets. Both are read-only unless an explicit project repair command is chosen.

During an explicit repair, a legacy active change that predates durable workflows gets
one blocked change run at `bind-baseline` with
`LEGACY_CHANGE_PROVENANCE_REQUIRED`; repair does not invent its evidence. Rebind it to
the re-adopted baseline and resume the same run before planning. Every plan must use
the exact baseline id stored by its owning change run; only an approved break-glass
incident may legitimately bind no baseline id.

Resume the same blocked workflow and current step after resolving its blocker.
Do not create parallel runs to escape state. Supported schema and projection
repairs are backup-first. A corrupt DB is preserved and requires an explicit
restore or rebaseline decision; neither action can manufacture research,
verification, or owner approval.
