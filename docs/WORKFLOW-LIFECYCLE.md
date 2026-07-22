# Ultra Builder Pro workflow lifecycle

This document defines when Ultra writes authoritative state, how each workflow
advances, what invalidates evidence, and which decisions remain with the active
host and project owner. It is the operational companion to
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and the machine contracts under `spec/`.

## 1. Authority boundaries

| Surface | Owns | Must not own |
|---|---|---|
| Active host and owner | Product judgment, research content, implementation, review findings, release authorization | Durable workflow status or fabricated evidence digests |
| Skill | One reusable procedure and its evidence requirements | Project state, static product doctrine, host-specific tool fiction |
| MCP | IDs, transitions, task contracts, evidence references, output hashes, gate verdicts, next action | Research prose, code generation, memory, or model calls |
| `.ultra/state.db` | Baseline, change, task, workflow, session, event, incident, projection, and evidence authority | External memory or code-graph payloads |
| Generated JSON and Markdown | Read-only projections and durable artifacts | Independent lifecycle authority |
| Hook | Compact DB-derived lifecycle observation, minimal event metadata, and projection protection | Generic engineering judgment, prompt/transcript capture, parallel lifecycle logs, or arbitrary edit blocking |

Prompt input can supply facts, content paths, reasons, owner decisions, and
evidence references. MCP reads the current repository and DB, validates those
inputs, hashes outputs, and derives status. Prompt input cannot override a task's
public seam, verification command, context references, workflow summary, gate
verdict, output digest, or next action.

Every change-bound research, plan, dev, test, review, and deliver run inherits
the baseline id from the owning change workflow. A Prompt cannot switch that
authority, and no new stage may start on an archived or cancelled change. Doctor
recovers a legacy change without this link into an explicitly blocked workflow;
it does not fabricate the missing provenance.

Ultra does not select an MVP. Product scope and delivery posture are owner
decisions. A reduced research mode is valid only for an explicitly bounded active
change with a recorded selection reason; initial greenfield and brownfield
baselines always use all seventeen research steps.

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
classification, opens an `init` workflow, and opens `full` research for
greenfield or `adoption` research for brownfield. Empty templates are not an
approved baseline.

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

## 4. Write and verification lifecycle

| Stage | Authoritative writes | Completion verification | Next route |
|---|---|---|---|
| `init` | Baseline classification/scope, init run, research run, initialization event, projection job | DB/schema opens, scaffold/projection succeeds; baseline convergence later completes init | `research`, re-adoption, or `change` for an already-ready baseline |
| `research` | Ordered step evidence, decisions, typed semantic records with source digests, one immutable report per selected step, output paths and SHA-256 digests | Every report has the required structure; semantic kinds/attributes/source anchors are valid and current; full/adoption synthesis binds the current three specifications and distillate; all digests remain current | `baseline.record`, then approval/convergence; bounded change research returns to its change |
| baseline convergence | Spec/source/runtime refs, verification results, known failures, unknowns, gaps, branch/HEAD/worktree, approval | Full/adoption research complete; required discovery/product/architecture refs current; revision/worktree exact; blocking gaps resolved or explicitly accepted where allowed | `change` for every initial or daily outcome |
| `change` | Complete Change Contract, profile/risk rationale, research disposition, intent/delta artifacts, linked change run, initial context snapshot | Blocking decisions resolved; selected change research current; current plan task set matches DB; task-bound context is ready; one next action is derived | selected `research`, then `plan`, or `dev` for an already approved current plan |
| `plan` | Plan-step evidence, complete change-owned task rows, acceptance coverage matrix, change-bound `.ultra/execution-plan.json`, explicit plan approval | Every Change acceptance id is owned by a task; task trace targets resolve; quick has one task; ownership/dependencies valid; no cycles; exported topology and digest exactly match the current change task set | `dev` for the first dependency-ready task |
| `dev` | Task/session transitions, step evidence, immutable implementation context, completion/review references | Task completed; no live session; task contract unchanged; starting context and review artifacts valid; completion commits remain ancestors of current HEAD | Next task, then aggregate `test` |
| `test` | Immutable checking context and `.ultra/reports/tests/<workflow-id>.json` | Report change/task set, full HEAD, worktree digest, context digest, commands, public seam, blockers, and all acceptance/regression/integration/static/build/performance/security/recovery dimensions agree; every omission has a not-applicable rationale | `review` when passing, otherwise resume `dev`/`test` |
| `review` | Immutable review context, `task`/`change`/`plan` mode, worker selection provenance, two specialist axes, coordinated summary | Current diff/HEAD and context match; selected/skipped workers match recorded rationale; both axes complete; P0/P1 and axis verdicts deterministically derive final verdict | `deliver` only from approved `change` mode, otherwise resume implementation |
| `deliver` | Convergence context, verified learning resolutions, schema-validated semantic reconciliation manifest, change archive, durable release-authorization decision, immutable delivery report | Tasks/test/change-review current; every baseline update has an anchored before/after semantic record; `change.converge` derives evidence from DB and accepts no Prompt verdicts; archive and baseline transaction agree; external actions have evidence | Report completion or start the next `change` |
| `status` | None | Reads doctor, baseline, workflows, breadcrumb, tasks, sessions, Git, and DB-referenced reports | One exact current route |
| `doctor` | None by default; explicit repair writes only mechanical recovery state | Re-runs integrity, schema, workflow-output, projection, session, incident, archive, and install checks | Exact repair, restore/rebaseline decision, or workflow route |

Every mutating MCP operation appends an event and enqueues projection work when
the corresponding read-only view can change. Projection failure is recorded as
a retryable incident; it does not silently convert a failed write into success.
`task.append_event` accepts only non-authoritative observations. Lifecycle events are
emitted by their owning DB mutation and never act as a substitute state transition.

## 5. Context and prompt follow-through

`change.context` compiles an immutable Context Manifest v2 snapshot. It combines:

- the bound baseline/change/task identity;
- a role and lifecycle gate;
- DB-backed task outcome, public seam, verification command, and required refs;
- local file hashes, current HEAD, branch, and worktree digest;
- optional metadata-only external memory or graph references;
- advisory file/token/context-share budgets;
- readiness blockers and one DB-derived next action.

Critical stage workflows bind a matching snapshot as a durable output:

| Workflow | Required role | Required gate |
|---|---|---|
| `change` | `plan` or `implement` | `planning` or `implementation` |
| `dev` | `implement` | `implementation` |
| `test` | `check` | `verification` |
| `review` | `review` | `review` |
| `deliver` | `check` | `convergence` |

The snapshot path and digest are then carried into test, review, and delivery
reports. This prevents a later Prompt from claiming evidence gathered under a
different context. File and token budgets warn; they do not block legitimate
work. Missing authority, required refs, task contracts, outputs, approval, or
current gate evidence do block.

## 6. Invalidation rules

- Changing a task contract invalidates contexts and gates that depended on the
  former contract.
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

## 7. Entry flows

### New project

```text
ultra-init -> full research (17 steps) -> baseline approval
-> initial change + plan -> dev per task -> test -> review -> deliver
```

### Existing project

```text
ultra-init -> brownfield adoption research (17 steps)
-> characterization and known-red evidence -> gap ledger -> owner approval
-> first selected change -> plan -> dev -> test -> review -> deliver
```

Adoption records the system that exists. It does not force the owner to recreate
market, persona, or roadmap claims that cannot be supported; those remain
`Unknown` or explicit gaps while every semantic step is still processed.

### Earlier Ultra project

```text
doctor/migrate with backup -> migrated compatibility authority
-> explicit brownfield re-adoption -> full convergence -> normal change loop
```

Migration preserves prior files and rows but never carries old approval forward.

### Daily maintenance

```text
ultra-status -> ultra-change -> plan if task contracts are absent
-> dev -> test -> review -> deliver -> reconciled baseline
```

Quick changes shorten the artifact burden only where the machine contract allows;
they do not skip task ownership, executable acceptance, current checking, review,
or baseline reconciliation. Incidents add structured diagnosis and recovery
evidence rather than bypassing them.

## 8. Recovery and diagnosis

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
