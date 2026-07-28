# Original Ultra Builder Pro to CLI crosswalk

This document is the compatibility contract between the original
[`rocky2431/ultra-builder-pro`](https://github.com/rocky2431/ultra-builder-pro)
Claude Code harness and this multi-runtime CLI/MCP implementation. Comparisons and
migration rationale live here, not in runtime Skill prompts.

## Provenance

- Original baseline inspected at
  [`a82a9d73efe14a2a94a6ac6aa1fd44ba905b2159`](https://github.com/rocky2431/ultra-builder-pro/tree/a82a9d73efe14a2a94a6ac6aa1fd44ba905b2159).
- The CLI repository was bootstrapped from the original harness at `6deca47`.
- The original delivery spine is six stages:
  `init -> research -> plan -> dev -> test -> deliver`.
- `status` and `think` support that spine. The original review Skill is a mandatory
  development/release gate even though it was not a separate slash command.

The compatibility target is semantic, not file-for-file. Host-specific Claude Code
mechanics are replaced only when the replacement preserves the observable workflow
contract and adds stronger authority, recovery, or portability.

## What the CLI preserves and strengthens

| Original capability | Current implementation | Compatibility result |
|---|---|---|
| Init gathers project facts, creates Ultra files, and establishes Git | `task.init_project` performs deterministic classification, scaffold, schema, Git bootstrap, read-back verification, and then stops | Preserved and strengthened. Init has its own completion boundary and never starts research implicitly. |
| Complete product and architecture research | `ultra-research` retains the semantic reference catalog while the model recommends evidence-relevant coverage and the owner selects, modifies, delegates, or defers the route | Preserved without questionnaire overload. Accepted dispositions, necessary reports, typed semantic records, source digests, and optional material decision checkpoints add durable evidence. |
| Planning converts accepted research into executable work with dependencies | `ultra-plan` persists complete change-owned task contracts and an exact dependency graph | Preserved and strengthened with topology, acceptance coverage, public seams, verification commands, and plan digests. |
| Development uses isolated Git work, TDD, verification, review, commit, and integration | `ultra-dev`, `session.*`, and the session runner create real worktrees and retain task/review/commit evidence | Preserved and strengthened. Process exit cannot complete a task; uncommitted or unintegrated worktrees cannot be deleted. |
| Test checks wiring, acceptance, regression, build, performance, security, and failures | `ultra-test` emits a change-bound immutable report covering each applicable dimension | Preserved and strengthened with HEAD, context, task-set, and report-digest validation. |
| Review challenges specification fidelity and engineering quality | `ultra-review` is a first-class stage with independent specification and engineering axes | Strengthened. A coordinated summary cannot replace either complete axis. |
| Delivery verifies clean readiness, documentation, build, and evidence | `ultra-deliver` requires current tasks, test, review, learning resolution, reconciliation, a local archive, and an immutable report | Preserved and strengthened. Publish, deploy, push, and other external effects remain separate explicitly authorized operations. |
| Status restores the current workflow position | `ultra-status` reads DB authority, Git, sessions, artifacts, decisions, allowed transitions, and any hard recovery requirement | Strengthened. The host recommends the semantic route; projections and Prompt prose cannot override state. |
| Thinking synchronizes owner and Agent intent | `ultra-think` plus `decision.*` persists one-question dialogue, non-ceremonial completion, and optional artifact checkpoints | Strengthened. Observable facts are resolved first; only load-bearing owner choices block. |

## CLI-original capabilities

The following are deliberate extensions built on the original spine:

1. `.ultra/.runtime/state.db` as the only lifecycle and index authority; registered
   digest-bound Markdown and JSON carry semantic or evidence bodies, while generated
   views remain projections.
2. Typed MCP transitions for baseline, change, decision, workflow, task, session,
   incident, projection, and evidence state.
3. Greenfield, brownfield, monorepo-scope, migrated, restore, and rebaseline paths.
4. `ultra-change` as the continuous post-baseline delta and convergence unit.
5. `ultra-doctor` plus backup-first migration, projection repair, incident reporting,
   orphan recovery, and installed-asset provenance.
6. Context Manifest v3, Change/task authority digests, DB-derived breadcrumbs,
   adaptive transitions, advisory context budgets, and fresh-context handoffs.
7. Approval-gated specification learning and baseline reconciliation.
8. Independent two-axis review and immutable test/review/delivery evidence.
9. Native adapters for Claude Code, OpenCode, Codex, and Kimi Code.
10. Explicit worktree admission, leases, heartbeats, crash evidence, circuit breaking,
    dependency waves, and optional verified cleanup.

## Intentionally retired original baggage

These items are not compatibility losses:

- embedded prompt, transcript, observation journal, session summary, or general
  conversational cross-session memory;
- an internal code graph or memory store;
- retired model runtimes and their prompts;
- retired command-proxy integrations;
- imported browser, deployment, framework, discovery, or third-party Skills;
- model-tier routing, confidence percentages, forced option counts, forced task
  counts, automatic MVP selection, or silent scope reduction;
- handwritten `tasks.json` authority or direct specification dual-write;
- unsafe automatic push, release, merge, or worktree deletion.

External memory and graph providers own their content. Ultra may store only bounded
metadata references.

## Reference capability paths and gates

These paths show common capability order and hard prerequisites. They are not a
single mandatory pipeline: the model recommends among MCP-reported allowed
transitions, while the owner selects or delegates the semantic route. MCP requires one
route only for a unique mechanical recovery invariant.

### New repository

```text
task.init_project
  -> greenfield classification
  -> Git bootstrap when absent
  -> init read-back and completion
  -> explicit full research with a model-recommended, owner-selected route
  -> selected execute/verify/reuse work and synthesis
  -> owner-authorized local checkpoint commit when Git is unborn
  -> baseline.record
  -> baseline.converge
  -> ultra-change
  -> optional bounded research/plan -> dev tasks -> test -> review -> local deliver
```

### Existing repository

```text
task.init_project
  -> brownfield classification and selected scope
  -> preserve current Git HEAD and dirty-state evidence
  -> init read-back and completion
  -> explicit adoption research with a model-recommended, owner-selected route
  -> characterization verification + known-red/gap ledger
  -> baseline.record + owner approval
  -> baseline.converge
  -> first ultra-change
```

### Earlier Ultra authority

```text
doctor/migrate with backup
  -> migrated compatibility row
  -> explicit brownfield re-adoption
  -> current research and evidence convergence
  -> normal change loop
```

### Daily change

```text
status
  -> change intent capture
  -> material alignment only when unresolved
  -> model-recommended, owner-selected or delegated bounded research, plan,
     current dev work, think, or status
  -> session.spawn creates the real task worktree
  -> red/green/verify/review
  -> local task commit and verified integration
  -> safe session close
  -> aggregate test -> review -> deliver
  -> atomic baseline reconciliation
```

## Breakpoint closure

| Prior breakpoint | Required invariant |
|---|---|
| Init was incorrectly held open until research and baseline convergence | Init completes only after classification, Git/scaffold setup, state creation, and read-back verification; research starts explicitly and owns baseline convergence. |
| A fresh project had `.ultra` but no Git | Auto init creates `main`, adds the symlink-safe `.ultra` ignore rule, and exposes `initial_commit_required`. |
| Initialized Git had no HEAD but baseline used a workspace hash | `unborn` is a persisted state; `baseline.record` fails with `BASELINE_GIT_HEAD_REQUIRED`. |
| Resume preserved an incorrect project name/type/stack | In-progress resume refreshes corrected metadata and records the change. |
| MCP session reservation and runner session were separate | `session.spawn` creates the actual worktree and the single authoritative session row. |
| Process exit zero marked a task completed | Exit success leaves the task `in_progress` until dev/test/review evidence converges. |
| Dependency waves advanced after transport exit | The plan pauses at the first non-terminal wave and resumes only after its DB tasks converge. |
| A crafted or merely exported plan could bypass current plan authority | Change-owned dispatch requires a healthy completed plan workflow and the exact current DB graph; malformed, cyclic, stale, duplicate-task, or cross-change plans fail before session creation. |
| Direct session or daemon spawn bypassed the current plan | Every change-owned admission and spawn revalidates current task-contract digests, task set, dependencies, and staleness before takeover or worktree creation. |
| A worker launched inside a worktree could create a second `.ultra/.runtime/state.db` | Every session checkout links its ignored `.ultra` entry to central authority and receives non-overridable DB/root bindings; legacy repositories get a local `info/exclude` rule without tracked drift, while unsafe ignore or link state rolls back before worker launch. |
| Plan authority could drift between wave admission and actual spawn | The spawn-time gate converts this race into an authority pause without task-failure or circuit-breaker evidence. |
| Explicit auto-merge could integrate before workflow gates | A change-owned auto-merge requires the exact completion commit, ready dev evidence, a current task review, and clean committed Git work; otherwise the worktree is preserved. |
| Session close or auto-merge could delete uncommitted work | Close preserves by default; explicit cleanup verifies clean and integrated Git ancestry. |
| Daemon could create a worktree with no worker | Dispatch refuses to start without an explicit executable command. |
| Failure returned a task to pending without recovery evidence | Exit and spawn failures become `blocked` and record session-linked circuit-breaker evidence. |
| A late resume failure could leave refreshed DB metadata behind | Resume snapshots DB authority and generated projections, then restores both together with Git rollback. |
| A legacy schema migrated before a later resume failure | Resume restores the pre-migration backup, not the partially completed upgraded intermediate state. |

## Advancement rule

A stage advances only when its DB workflow definition reports every required step
current and the stage-specific verifier accepts the referenced outputs. A Prompt,
child-process exit, generated projection, or old document can never advance a stage.
On interruption, resume the same non-terminal workflow and current step. On authority
damage, route to doctor; on missing owner authority, route to think. Never open a
parallel run to escape a blocker.
