# Ultra Builder Pro — field issues

Issues observed while *using* the distributed plugin on a real project, recorded
here before they become roadmap work, tests, or fixes.

This log is not an authority. `.ultra/state.db` remains the project workflow
authority, `spec/` and `docs/DECISIONS.md` remain the contract authority, and the
in-product gap ledger records *project baseline* gaps — not defects in this
package. An entry here is a reported observation until a failing test reproduces
it.

## How an entry moves

| Status | Meaning |
|---|---|
| `reported` | Recorded from user experience; not yet reproduced |
| `reproduced` | A failing test or deterministic command sequence demonstrates it |
| `not-reproduced` | Could not be reproduced; kept with the evidence that was tried |
| `fixed` | Resolved by a commit; the reproducing test is now green and referenced |
| `wontfix` | Correct current behavior, or outside the product boundary |

## Disposition

| Disposition | Meaning | Where the fix lands |
|---|---|---|
| `defect` | Behavior contradicts the contract | Smallest authoritative source + every live consumer |
| `contract-gap` | Contract is silent or ambiguous; behavior is defensible | `spec/`, `docs/DECISIONS.md` |
| `doc-gap` | Behavior is correct but unfindable or misdescribed | `skills/*/SKILL.md`, `commands/`, `README.md` |
| `ux-friction` | Correct and documented, but costly to operate | Prompt or launcher wording, `docs/ROADMAP.md` |
| `out-of-boundary` | Belongs to a separately installed owner package | Closed with the boundary reference |

## Entry template

```markdown
### F-000 — <one-line symptom>

- **Reported**: YYYY-MM-DD
- **Surface**: <command / skill / MCP tool / hook / installer>
- **Host**: <Claude Code | Codex | OpenCode | Kimi Code> · plugin version <x.y.z>
- **Project state**: <`.ultra/state.db` present? active workflow + stage? greenfield/brownfield?>
- **Expected**: <what the contract or the prompt led the user to expect>
- **Observed**: <what happened; verbatim error text where available>
- **Status**: reported
- **Disposition**: <unset until triaged>
- **Evidence**: <repro command, test path, log excerpt>
- **Resolution**: <commit + test path once fixed>
```

## Open

### F-001 — no way to revise a research step after regretting the choice made in it

- **Reported**: 2026-07-27
- **Surface**: `ultra-research` · `workflow.step`
- **Host**: Claude Code
- **Project state**: active `research` run, one or more steps `completed`, later required
  steps still `pending`
- **Expected**: an owner who changes their mind about a choice recorded in the step just
  completed can revise it and continue, without discarding the run.
- **Observed**: every reverse path is refused while the run is still in progress. Once a
  later required step exists in `pending`, the step just completed is frozen.
- **Status**: reproduced
- **Disposition**: `defect` (primary) + `doc-gap`

**The revision window is inverted.** `allowedStepTransition`
(`mcp-server/lib/workflow-state.cjs:1047`) returns `true` for `from === to`, so
re-recording a `completed` step with revised content is *intended* to be legal. The
ordering guard immediately after it (`mcp-server/lib/workflow-state.cjs:1083`) selects the
first required step that is not `completed`/`skipped` and rejects any `step_id` that is
not that step — which is every already-completed step, for the entire run. The allowance
only becomes reachable once no required step is open, and closes again at
`workflow.complete` (`mcp-server/lib/workflow-state.cjs:1065`). Net effect: a step can be
revised only *after* every other step has been completed on top of the premise the owner
regretted, and never at the moment the regret occurs.

Observed transitions, mid-run, immediately after completing the first step:

| Attempt | Result |
|---|---|
| re-complete the step with a revised answer | `WORKFLOW_STEP_OUT_OF_ORDER` |
| reopen the step as `in_progress` | `ILLEGAL_WORKFLOW_STEP_TRANSITION` |
| mark the step `blocked` to force a revisit | `ILLEGAL_WORKFLOW_STEP_TRANSITION` |

The same three attempts once all required steps are `completed` and the run is `ready`:
re-completion is **allowed**, reopening is still refused, and after `workflow.complete`
everything is refused with `WORKFLOW_NOT_MUTABLE`.

**No run-level escape hatch either.** `cancelled` is a member of `RUN_STATUSES`
(`mcp-server/lib/workflow-state.cjs:17`) but no tool in `spec/mcp-tools.yaml` can reach
it — there is no `workflow.cancel`, and `workflow.complete` takes only an approval. An
abandoned research run cannot be closed, so restarting is not an alternative to revising.

**The sanctioned path is unfindable.** `decision.supersede` exists for exactly this
situation — *"preserve a prior resolved decision and reopen alignment with one replacement
question when evidence or owner intent changes"* — but it revises a decision item in a
decision thread, not a choice already recorded in a completed step's evidence and semantic
records. It is mentioned once, in
`skills/ultra-think/references/decision-dialogue.md:86`. `skills/ultra-research/SKILL.md`
never mentions revision, superseding, or what to do when the owner changes their mind, so
neither the owner nor the host model is told the path exists.

- **Evidence**: reproduced against `mcp-server/lib/workflow-state.cjs` on `1d63892` with
  the seeded-baseline fixture used by `mcp-server/lib/workflow-state.test.cjs`; the
  ordering guard's effect is also visible in the existing assertion at
  `mcp-server/lib/workflow-state.test.cjs:285`. No regression test covers re-recording a
  completed step.
- **Open question for triage**: is the intended fix (a) allow same-step re-completion
  regardless of later pending steps, invalidating dependent downstream steps; (b) add an
  explicit owner-authorized reopen transition that reverts the step and its dependents; or
  (c) keep steps immutable and route all revision through `decision.supersede`, which then
  has to be reachable and documented from `ultra-research`. This changes `spec/`, so it is
  a contract decision, not an implementation detail.
- **Resolution**: _unresolved_

### F-002 — no way to ask for more alternatives when the presented options are inadequate

- **Reported**: 2026-07-27
- **Surface**: `decision.open` · `decision.supersede` · host question surface
- **Host**: Claude Code
- **Project state**: any active decision thread with one open blocking decision
- **Expected**: when none of the presented alternatives fit, the owner can ask for a
  broader set and get one, without answering a question they consider unanswerable.
- **Observed**: no transition models "the option set was inadequate." While a decision is
  open, both ways to present a different set are refused, and the only path through
  records an owner action that did not happen.
- **Status**: reproduced
- **Disposition**: `contract-gap` (primary) + `ux-friction`

**The state machine deadlocks on "show me more."** With one decision open:

| Attempt | Result |
|---|---|
| `decision.open` a replacement carrying a wider set | `DECISION_ALREADY_OPEN` |
| `decision.supersede` the open decision | `DECISION_NOT_SUPERSEDEABLE` |

`supersedeDecision` admits only `answered`, `delegated`, or `deferred`
(`mcp-server/lib/decision-dialogue.cjs:392`), and `insertQuestionInTx` refuses a second
open question (`mcp-server/lib/decision-dialogue.cjs:253`). So the sole route is to
`decision.defer` a question the owner never answered — which forces the model to invent a
`reason`, `consequences`, and `revisit_condition` for a deferral the owner did not
request — and then supersede it. Verified: `defer` then `supersede` both succeed and
produce a new open decision. The durable record then says the owner deferred a decision,
when the owner actually asked for better choices.

**And the replacement is capped at the same width.** Options are limited to three in both
the contract (`spec/mcp-tools.yaml:1639`, `:1772`) and the runtime
(`mcp-server/lib/decision-dialogue.cjs:59`, *"options must contain at most three credible
alternatives"*). Superseding therefore yields a *different* three, never a *wider* set —
so even the workaround does not deliver what was asked for. Claude Code's own
`AskUserQuestion` surface accepts four options plus an automatic "Other", so the cap is
Ultra's, not the host's.

The three-option cap is a defensible cognitive-load choice and is probably right as a
default for *presentation*. The gap is that rejecting the set is not a modeled owner
action. `adapters/_shared/interaction-contract.cjs` describes the question surface
(`SURFACES`, `dependent_decisions`, `independent_low_load_questions`) but has no
affordance for expanding alternatives, so no host can offer the button the owner wants.

Native "Other" free text is today's real escape hatch on Claude Code, but nothing in
`skills/ultra-think/references/decision-dialogue.md` tells the model whether "Other" text
is a final answer to normalize via `decision.resolve` or a request for a broader set.
Both readings are plausible and they produce different durable records.

- **Evidence**: reproduced against `mcp-server/lib/decision-dialogue.cjs` on `1d63892`
  with a seeded ready baseline and one `guided` thread. No test covers rejection of an
  option set.
- **Open question for triage**: (a) add a first-class transition — e.g. `decision.expand`
  or a `reopen_with_options` action — that replaces the open question's option set in
  place, preserving the rejected set as provenance; (b) permit `supersede` from `open`
  with an explicit `rejected_option_set` reason, which is a smaller contract change; or
  (c) keep the state machine and define "Other" handling plus a raised cap in the
  interaction contract. (a) and (b) change `spec/mcp-tools.yaml`; whether the three-option
  cap should rise for a *re-ask* is a separate call.
- **Resolution**: _unresolved_

### F-003 — past selections are durably recorded but have no user-facing read surface

- **Reported**: 2026-07-27
- **Surface**: `ultra-status` · `decision.get` · `decision.list` · `ultra-tools`
- **Host**: Claude Code
- **Project state**: any project with a decision thread containing resolved decisions
- **Expected**: an owner can review the choices they already made — the question, the
  options offered, what they picked, and why.
- **Observed**: the history is complete and durable, but nothing presents it. Every
  available route requires knowing a thread id and reading raw tool output.
- **Status**: reproduced
- **Disposition**: `ux-friction` (primary) + `doc-gap`

**The record is complete.** `rowToItem` (`mcp-server/lib/decision-dialogue.cjs:80`) retains
per decision: `question`, `options` (the exact set presented), `recommendation`,
`resolution`, `status`, `evidence_refs`, `effects`, `supersedes_id`, and
`created_at`/`resolved_at`. `readDecisionThread` returns every item in sequence order.
Superseded decisions are preserved and chained, so the full history — including choices
later revised — is recoverable. Nothing needs to be rebuilt; this is purely a presentation
gap.

**No surface presents it.**

| Route | Why it does not answer the question |
|---|---|
| `/ultra-status` | Reports one line, `Decision: <current\|checkpoint\|none>`. The report template (`skills/ultra-status/SKILL.md:44`) has no history panel, and step 3 (`:16`) scopes it to *current* decision state. |
| `decision.get` | Returns the full item list, but requires a thread id the owner does not have and emits raw JSON. |
| `decision.list` | Returns threads and a count, not the decisions inside them. |
| `ultra-tools` CLI | No `decision` subcommand exists — only `db`, `migrate`, `task`, `session`, `status`, `legacy-memory`, `system` (`ultra-tools/cli.cjs:63`). |
| `.ultra/` projections | The scaffold has `specs/`, `docs/research/`, `changes/`, `tasks/`, `reports/` (`.ultra-template/`) and no decision projection. |

The practical path today is to ask the host model to call `decision.list`, pick the thread,
call `decision.get`, and summarize. That works, but it is not discoverable, and no Skill
tells the owner or the model that it is the way to answer "what did I choose?".

**Minor contract tension.** `spec/cli-protocol.md:118` marks `decision.get` and
`decision.list` as `any` (CLI permitted), while the prose at `:137` states that "all
`change` and `decision` lifecycle verbs are not CLI fallbacks." Whether read-only `get`
and `list` count as lifecycle verbs is ambiguous; either way `ultra-tools` implements
neither, so the table currently over-promises.

- **Evidence**: read against `1d63892`. `decision.get`'s retained fields confirmed in
  `mcp-server/lib/decision-dialogue.cjs:80-125`; absence of a CLI subcommand confirmed in
  `ultra-tools/cli.cjs`.
- **Open question for triage**: (a) add a decision-history panel to `ultra-status` — the
  cheapest fix, and it needs a bound on how much history to print; (b) expose read-only
  `decision get|list` through `ultra-tools`, which requires settling the
  `spec/cli-protocol.md` ambiguity above; or (c) write a `.ultra/docs/decisions.md`
  projection, which adds a generated artifact and a freshness obligation. (a) plus a line
  in `skills/ultra-status/SKILL.md` probably closes the reported pain.
- **Relates to**: F-001 and F-002 — revising a past choice presupposes being able to find
  it first.
- **Resolution**: _unresolved_

### F-004 — six hours of greenfield work with no runnable demo

- **Reported**: 2026-07-27
- **Surface**: `ultra-init` → `ultra-research` → `ultra-change` → `ultra-plan` → `ultra-dev`
- **Host**: Claude Code
- **Project state**: greenfield game-theory game (`game_theory_simulator`); >6 hours
  elapsed; work still on an unconsumed "computational core"; nothing playable
- **Expected**: normal development reaches a thin runnable demo early, then deepens it.
- **Observed**: the loop drove depth-first into an engine that no consumer calls, and
  nothing in the workflow flagged the absence of a working increment.
- **Status**: reported (both mechanisms below verified in source; the six-hour session
  itself is not reproduced here)
- **Disposition**: `contract-gap` (primary) + `ux-friction`

**Two independent mechanisms produce this, and they compound.**

*1. No code is reachable before a full baseline converges.* `change.create` requires
`baselineHealth.status === 'pass'` and rejects anything else with `BASELINE_NOT_READY`
(`mcp-server/lib/change-workflow.cjs:667`). Task creation enforces the same
(`:834`). The only bypass is `kind: 'incident'` with a `baseline_bypass` break-glass
record. So on greenfield the entire sequence — init, research across the selected catalog
areas, `baseline.record`, `baseline.converge` — must finish before the *first* change
exists, and therefore before the first line of feature code. Even `kind: 'quick'`, which
is capped at one executable task (`WORKFLOW_QUICK_PLAN_TOO_LARGE`), is behind this gate.
There is no prototype, spike, or exploratory classification: `CHANGE_KINDS` is
`quick | standard | major | incident` (`mcp-server/lib/change-workflow.cjs:38`).
"I want something playable first" has no legitimate route — only misclassifying the work
as an incident.

*2. The walking-skeleton rule is unenforced prose.* `skills/ultra-plan/SKILL.md:44` says
*"Design a walking skeleton and subsequent vertical slices... Avoid unconsumed horizontal
scaffolding"* — exactly the rule that was violated. Nothing checks it:

- `slice_kind` is nullable (`spec/schemas/state-db.sql:100`) and no gate requires the
  first slice to be `tracer_bullet`;
- `task.dependency_topo` validates that the graph is acyclic, not that early tasks
  deliver observable value;
- `public_seam` must be *present* on an executable contract, but nothing verifies it is
  reachable by a real user-facing entry point rather than an internal module boundary.

A plan consisting entirely of horizontal `expand_contract` tasks against an unconsumed
core passes every gate. The guidance most likely to prevent this failure is the one
instruction with no runtime backing.

**Aggravating factor observed in the same session.** The reporting session was at 98%
context occupancy (~980k cached). Ultra's own context discipline cannot counteract this:
`context-spine.cjs` records budget overruns as *warnings* only —
`CONTEXT_FILE_BUDGET_EXCEEDED`, `CONTEXT_TOKEN_BUDGET_EXCEEDED`,
`EXECUTION_CONTEXT_BUDGET_ADVISORY` are pushed to `warnings` and never block
(`mcp-server/lib/context-spine.cjs:464-473`), against a 12k-token / 12-file default
(`:18`). This is a deliberate contract choice (`CLAUDE.md`: context guidance is advisory),
and it is defensible — but it means a session can thrash near its window limit for hours
while every Ultra gate reports healthy.

- **Evidence**: gates read in `mcp-server/lib/change-workflow.cjs:657-690` and `:830-845`;
  slice guidance in `skills/ultra-plan/SKILL.md:44-46`; nullable `slice_kind` in
  `spec/schemas/state-db.sql:100`; advisory-only budgets in
  `mcp-server/lib/context-spine.cjs:464-473`. All on `1d63892`.
- **Open question for triage**: (a) add a first-class exploratory/prototype change kind
  that reaches code on a provisional baseline and owes baseline convergence later —
  the largest change, and it touches the authority model; (b) require the first executable
  slice of a plan to be `tracer_bullet` with a user-reachable `public_seam`, making
  `ultra-plan:44` enforceable — smaller, and it directly targets the reported symptom;
  (c) surface elapsed-work-without-a-runnable-increment as an `ultra-status` warning,
  which changes no gate but makes the stall visible. (b) is the cheapest real fix; (a) is
  the one that answers "demo first" as a workflow.
- **Relates to**: this is the first reported issue where the cost is measured in hours
  rather than friction.
- **Resolution**: _unresolved_

### F-005 — a session can run to context exhaustion while every Ultra gate reports healthy

- **Reported**: 2026-07-27
- **Surface**: `context-spine` budgets · compaction hooks · `ultra-status`
- **Host**: Claude Code
- **Project state**: `game_theory_simulator`, single long-running session, 98% context
  occupancy (~980k cached), work ongoing
- **Expected**: the workflow notices that the session it is running in has degraded, and
  says so — a long build should be told to resume in a fresh session.
- **Observed**: nothing surfaces context pressure. Budget overruns are advisory, health
  reporting is silent on it, and the owner discovered the 98% figure by reading the
  status line.
- **Status**: reported
- **Disposition**: `contract-gap`

**Compaction is handled for state, not for cost.** The plumbing exists and is sound:
`hooks/workflow_checkpoint.py` writes a recovery projection before compaction and
`hooks/workflow_resume.py` re-injects live DB authority after it, treating the checkpoint
as advisory. So authority survives compaction correctly — that is not the gap.

The gap is that repeated compaction is treated as a recoverable event rather than a
**signal that the session should end**. Each cycle re-derives context that the DB could
supply cheaply to a fresh session, and Ultra is architecturally well placed to say so:
`.ultra/state.db` is the authority, so restarting costs almost nothing. Nothing says it.

**Budgets are advisory by contract.** `CONTEXT_FILE_BUDGET_EXCEEDED`,
`CONTEXT_TOKEN_BUDGET_EXCEEDED`, and `EXECUTION_CONTEXT_BUDGET_ADVISORY` are pushed to
`warnings` and never block (`mcp-server/lib/context-spine.cjs:464-473`), against a 12k
token / 12 file default (`:18`). `CLAUDE.md` states this deliberately: *"Context-size
guidance is advisory; authority, security, irreversible effects, and evidence integrity
may block."* That boundary is correct — context size is not an integrity risk and should
not block a gate. But advisory currently means *invisible*: those warnings concern one
compiled task context, not the health of the live session, and `ultra-status` has no
context panel at all (`skills/ultra-status/SKILL.md:40-52`).

- **Evidence**: advisory-only budgets at `mcp-server/lib/context-spine.cjs:464-473`;
  compaction hooks at `hooks/workflow_checkpoint.py` and `hooks/workflow_resume.py`;
  absent context line in the `ultra-status` report template. All on `1d63892`.
- **Open question for triage**: (a) add a session-hygiene line to the `ultra-status`
  report and to `workflow_resume.py`'s injected text — "this session has compacted N
  times; `.ultra/state.db` holds full authority, consider resuming fresh" — advisory,
  cheap, no gate change; (b) record compaction counts per session so the advice is
  evidence-based rather than a guess, which needs a state change; (c) leave it to the
  host, on the grounds that context management is not Ultra's boundary. (c) is a
  defensible reading of the product boundary and should be decided explicitly rather than
  by omission.
- **Relates to**: F-004 — context thrash is one reason six hours produced no demo.
- **Resolution**: _unresolved_

### F-006 — `ultra-deliver` blocked by baseline blockers that ordinary development creates

- **Reported**: 2026-07-27
- **Surface**: `ultra-deliver` · `change.converge` · `baselineGateForChange`
- **Host**: Claude Code
- **Project state**: active change with implementation done, delivery repeatedly refused
  on baseline blockers
- **Expected**: delivery reconciles the baseline it was built against; making the change
  should not disqualify the change from being delivered.
- **Observed**: baseline blockers persist and delivery cannot proceed.
- **Status**: reported (mechanism identified in source; the reporter's exact blocker codes
  are not yet captured — see below)
- **Disposition**: unset pending the exact codes; candidate `defect` on the
  `_MISSING`/`_STALE` asymmetry

**The tolerance design is sound.** `inspectBaseline`
(`mcp-server/lib/baseline-workflow.cjs:822`) compares the recorded baseline against the
live checkout, so ordinary development necessarily makes it fail — you moved HEAD, you
dirtied the worktree. `baselineGateForChange` (`mcp-server/lib/context-spine.cjs:72`)
exists precisely to forgive that, downgrading expected drift to warnings via
`ACTIVE_CHANGE_BASELINE_DRIFT` (`:25`):

```
BASELINE_HEAD_STALE      BASELINE_BRANCH_STALE     BASELINE_WORKSPACE_STALE
BASELINE_WORKTREE_STALE  BASELINE_WORKTREE_DIRTY
BASELINE_SPEC_STALE:<path>   BASELINE_EVIDENCE_STALE:<ref>
```

Three ways a change falls outside that tolerance, all reachable through normal work:

*1. Only `_STALE` is forgiven; `_MISSING` is fatal.* Editing a file the baseline
references yields `BASELINE_SPEC_STALE:` — tolerated. **Moving, renaming, or deleting**
that same file yields `BASELINE_SPEC_MISSING:` (`mcp-server/lib/baseline-workflow.cjs:601`)
or `BASELINE_EVIDENCE_MISSING:` (`:617`), neither of which is in the drift list, so both
block delivery permanently. Renaming a spec during implementation is routine, and the
asymmetry means a rename is treated as more dangerous than a rewrite. Same for
`BASELINE_SCOPE_MISSING:` when a scope directory is restructured. This is the strongest
candidate for a genuine defect rather than a policy choice.

*2. Tolerance silently switches off if the baseline identity changed.* Drift is forgiven
only when `boundFromReadyAuthority` holds (`mcp-server/lib/context-spine.cjs:99`): the
change's most recent `change`-kind run must have a completed `bind-baseline` step whose
evidence ref equals the **current** baseline id. `change.create` records that correctly
(`mcp-server/lib/change-workflow.cjs:791`), but if research re-converged a *new* baseline
after the change was created, `binding.baseline_id !== baseline.id`, the gate returns mode
`baseline_binding_required`, and **every** drift code becomes blocking again. Nothing
reports that the change is now bound to a superseded baseline; it presents as an unrelated
pile of staleness.

*3. Two codes are never tolerated in any mode.* `BASELINE_GIT_HEAD_REQUIRED` (unborn Git,
`mcp-server/lib/baseline-workflow.cjs:854`) and `BASELINE_DIRTY_WORKTREE_NOT_ACCEPTED`
(`:870`) are absent from the drift list. A greenfield project that never made its first
commit therefore cannot deliver at all, and the message names Git state rather than the
delivery gate that actually refused.

**Common shape with F-001 and F-002.** The escape hatch exists and is well designed; it is
reachable only on a precondition the owner cannot see and was never told about.

- **Evidence**: `mcp-server/lib/baseline-workflow.cjs:822-877` and `:599-621`;
  `mcp-server/lib/context-spine.cjs:25-33` and `:72-112`;
  `mcp-server/lib/change-workflow.cjs:784-796` and `:971-973`. All on `1d63892`.
- **Needed to finish triage**: the exact blocker codes from the reporting project, via
  `/ultra-status` (Blockers line) or `system.doctor`. The three mechanisms above have
  different fixes and cannot be distinguished without them.
- **Open question for triage**: (a) treat `_MISSING` as tolerated drift when the missing
  path is inside the active change's declared scope — targets mechanism 1 directly;
  (b) report `baseline_binding_required` as its own named blocker instead of re-raising
  drift codes, so mechanism 2 is legible; (c) have `ultra-status` print the gate *mode*
  (`healthy` / `active_change_drift` / `baseline_binding_required` / `baseline_invalid`)
  rather than raw codes — cheap, and it makes all three self-diagnosing.
- **Resolution**: _unresolved_

### F-007 — a blocked baseline also disables the review gate that would justify unblocking it

- **Reported**: 2026-07-27
- **Surface**: `ultra-review` · `change.context` · `baselineGateForChange`
- **Host**: Claude Code
- **Project state**: `game_theory_simulator`; `project-baseline` intact at `3041d23`;
  `gts-baseline-v2` blocked at `ced0383`; accepted scope delivered, 81 tests passing;
  the operating session recommended abandoning the remaining Ultra bookkeeping
- **Expected**: when workflow authority degrades, the read-only capabilities that assess
  the work remain available — diagnosis should not depend on the thing being diagnosed.
- **Observed**: with the baseline gate outside tolerance, `ultra-review` cannot record its
  `compile-context` step, so the independent review gate is unreachable exactly when the
  project most needs an outside read.
- **Status**: reproduced (mechanism); the project state is reported
- **Disposition**: `defect`

**Recovery is gated behind the failure.** `compileChangeContext` pushes
`baselineGate.blockers` straight into the context blockers
(`mcp-server/lib/context-spine.cjs:457-458`) and sets `readiness = 'blocked'` when any
remain (`:476`). `skills/ultra-review/SKILL.md:23` requires compiling `change.context` for
`review` and recording the immutable manifest under `compile-context`, and `workflow.step`
rejects a mismatched stage readiness with `WORKFLOW_CONTEXT_MISMATCH`. So a project whose
baseline drifted out of tolerance cannot complete a review workflow — including the
`spec_fidelity` axis that would establish whether the delivered work is sound.

Review is read-only. It edits nothing, releases nothing, and asserts nothing about
baseline freshness. Gating it on baseline health buys no integrity and removes the one
capability that helps an owner decide what to do about the blocked state.

**Observed consequence.** The operating session concluded that finishing the Ultra rebuild
would "buy a green checkmark over work that's already done," recommended leaving both
baselines as they are, and separately identified *independent review* as the top
outstanding gap — noting that nothing in the project has been read by anything other than
the context that wrote it, and naming `src/gts/equilibrium.py` as where a shared wrong
assumption would hurt most. Both judgments are individually sound. Together they describe
a workflow whose most valuable remaining capability was unreachable through the workflow
itself, so the rational move became abandoning the process. That is the strongest
available evidence for theme 2 below.

The `ultra-builder-pro:review-*` subagents remain directly invocable by the host and do
not need Ultra authority, so an independent read is still obtainable — but it produces no
recorded gate, and nothing tells the owner this fallback exists.

- **Evidence**: `mcp-server/lib/context-spine.cjs:455-476`; `skills/ultra-review/SKILL.md:20-24`;
  `WORKFLOW_CONTEXT_MISMATCH` in `spec/mcp-tools.yaml`. All on `1d63892`.
- **Open question for triage**: (a) exempt read-only stages — `review`, and arguably
  `test` — from baseline-gate blockers, downgrading them to warnings on the manifest, so
  diagnosis always stays reachable; (b) allow `compile-context` to record a `blocked`
  readiness for review specifically, preserving the evidence that the review ran against a
  degraded baseline; (c) document the direct-subagent fallback in
  `skills/ultra-review/SKILL.md` and `skills/ultra-doctor/SKILL.md`. (a) is the principled
  fix; (c) is worth doing regardless.
- **Relates to**: F-006 (same tolerance mechanism), F-004 (both are process cost with no
  gate objecting).
- **Resolution**: _unresolved_

## Cross-cutting themes

Recorded after F-001 through F-006; revisit as entries are added or resolved.

**1. Ultra models the project's state but not the owner's.** State transitions are
rigorous and well guarded. Owner-side events — *I changed my mind* (F-001), *these
options are wrong* (F-002), *what did I choose before?* (F-003) — have no modeled
transitions. Where a path exists it is reachable only by recording something the owner
did not do, such as deferring an unanswered question.

**1b. Escape hatches exist but are invisible.** `decision.supersede` (F-002),
same-step re-completion (F-001), and `baselineGateForChange`'s drift tolerance (F-006)
are all deliberate, well-designed accommodations. Each is gated on a precondition the
owner cannot observe and no Skill explains, so in practice each reads as an arbitrary
refusal. Making existing accommodations legible may close more reported pain than adding
new transitions.

**2. The guarantees are strongest on integrity and weakest on time.** Evidence,
provenance, and digests are enforced. The instructions that protect the owner's hours —
walking skeleton first, avoid unconsumed scaffolding, keep context bounded — are prose or
warnings that no gate checks (F-004, F-005). The most expensive observed failure passed
every gate cleanly.

**3. Several fixes are one contract decision, not five patches.** F-001 and F-002 both
need a revision transition; F-003 needs the read surface that makes revision usable;
F-004 and F-005 both need advisory signals promoted to something visible. Fixing these
one at a time risks five inconsistent escape hatches.

## Resolved

_None yet._
