# Ultra Builder PHILOSOPHY (v0.26)

**Authority**: This document defines the harness design philosophy. Every hook, Skill, template,
and CLI behavior must be justifiable by these principles. Conflicts → cite the principle, not the
rule.

**Provenance**: Goals 1–4 and Commandments C1–C5 are carried forward unchanged in substance from
Ultra Builder Pro v7.0, where they were derived from a 2026-04-30 system audit of real failures.
Do not weaken any of them without a reproduced failure case.

**Why exactly four goals and five commandments** — the counts are not sacred, the derivation
rules are:

- A **goal** is a class of systemic failure that has actually recurred, stated positively.
  A fifth goal requires naming a fifth recurring failure class that none of these four covers.
- A **commandment** is a rule the model must cite to resolve a semantic conflict. If the model
  will never face a moment where it needs to invoke the rule, the rule is not a commandment —
  it is either a code invariant (enforce and test it) or dead weight (delete it).

By that second rule, "stay silent in repositories that never opted in" is **not** a commandment:
it is `if not exists('.ultra'): exit(0)`, a mechanical invariant the model never reasons about.
It lives in `docs/PLUGIN-ISOLATION-CONTRACT.md` and is verified by test, not by citation.

---

## 4 Core Goals

The harness exists to serve these — every constraint derives its legitimacy from contributing to
one or more.

1. **Intent Fidelity** — what the user said they wanted is what gets built. No silent
   reinterpretation, no scope creep, no convenient shortcuts that drift from the original ask.
2. **Long-term Evolvability** — iteration #5 is as easy as iteration #1. Cognitive debt cannot
   accumulate; spec / task / code / doc must stay coherent.
3. **Production-Ready** — real persistence, real tests, real integration. No in-memory facades,
   no `default off` to dodge integration, no `it.skip` to dodge failures.
4. **Cognitive Coherence** — agent and user share the same picture of "what is currently true."
   Spec changes propagate. Doc rot is detected. Orphan code surfaces.

---

## 5 Commandments

### C1 — Goal-Always-Present

The agent never stops seeing the current steering contract. Before Research accepts a
baseline, the session Hook injects the raw Project Brief fallback. After Research, it
injects the accepted North Star: Project Direction, any settled North Star Outcome, and
Hard Constraints. Current task acceptance is appended in both cases. The cost of
repetition is always less than the cost of drift.

> **Test**: pick a random in-progress task, ask the agent "what's the acceptance criteria?" — if
> it cannot answer in one sentence, this commandment is broken.

### C2 — Enabling > Defensive

Every prohibition ships with a runnable alternative. Prohibitions without an enabling path force
agents to find loopholes (rename `mock` to `stub`, etc.). The cheaper path must be the right path.

> **Test**: scan every prohibition in every Skill; each must reference a template that exists
> under that Skill's `references/templates/` and can be copied as-is. The templates are rules,
> so they ship with the package rather than being copied into each project.

### C3 — Sensors not Blockers

Hooks emit signal; agents and users decide. Block only the **truly irreversible or
privileged destructive** effects for which the hook has an exact repair:

- Funds transfer / on-chain transactions
- Protected-branch history rewrite or deletion
- `DROP` / `TRUNCATE`
- Hardcoded secret commit
- Arbitrary code execution driven by user input

Additive protected-branch publication and database migrations are advisory: the former
remains recoverable through Git and the portable hook cannot receive every host's
trusted approval receipt; the latter is not mechanically classifiable as reversible or
irreversible. The work stands, the signal is delivered, and the agent proceeds inside
the owner's authorized frame.

> **Why this is absolute**: hard final gates and hard pre-commit gates each produced the same
> over-correction loop in v7 — the agent weakened tests to escape the gate and drifted from the
> spec. A gate that can be escaped by damaging the work is worse than no gate.

> **Test**: count blocking outputs across all hooks; they must map 1:1 to the irreversible list.

### C4 — Incremental Validation

The agent always knows "how far from done." Each edit updates `.ultra/progress/<task-id>.json`
with evidence completeness across six dimensions. Final-gate audits are forbidden — if a gap
matters at the end, it matters mid-flight.

> **Scoped exception**: whole-system wiring audit (`ultra-test`) is necessarily terminal, because
> "this export has no non-test importer" cannot be evaluated while later tasks are still pending.
> It is a terminal **sensor**, never a gate: it reports and hands the trade-off to the owner.
> This is the only permitted end-of-flow audit.

> **Test**: at any point in a task, reading `.ultra/progress/<task-id>.json` answers "what's left."

### C5 — Bounded Autonomy

Autonomy is defined by goals, not rules. Inside the boundary the agent picks freely; crossing the
boundary surfaces to the user.

- **Inside**: choosing libraries, naming, file layout, internal abstractions, decomposition
  strategy, evidence interpretation, prioritization, final expression
- **Crossing**: weakening test assertions, modifying spec to match implementation, default-off
  feature flags, in-memory replacing real persistence, scope reduction, external or irreversible
  effects

**Which decisions reach the owner.** Inside/Crossing above sorts actions. Read from the owner's
side, the same boundary sorts decisions into three:

| Type | Definition | Handling |
|---|---|---|
| taste | no objectively correct answer; only the owner's preference settles it | always ask |
| crossing | objectively decidable, but the consequence is irreversible | always ask |
| everything else | has an objective answer, or is cheap to reverse | decide and proceed; asking is the error |

How much lands in the third row is a function of how sharp the north star is. With constraints
that can veto a concrete decision, most execution-time questions are answered by reading them.
With vague ones, "does this cross a boundary?" cannot be decided at all, so every question
degrades into taste and reaches the owner. **Interrupt frequency measures the north star, not
the work.** Frequent interruptions mean going back to sharpen constraints, not asking faster.

**Boundaries grow; they do not change.** Adding a hard constraint or a non-goal mid-flight is
routine and needs no permission — the frame got sharper and no prior promise broke. Editing or
deleting one is a REDUCTION under the test below. This is what makes iteration five cheaper than
iteration one: the frame accumulates, and the share of decisions the model settles alone rises
with it.

**Operational test for spec changes.** When implementation and spec disagree, classify the change
before touching the spec. Do not classify by intent — classify by asking one question that can be
checked against the file:

> **Does every commitment the spec already made still hold after this change?**

| Answer | Classification | Action |
|---|---|---|
| Yes, and it now commits to more | EXPANSION | write it, log it |
| Yes, the commitment is unchanged but stated correctly | CORRECTION | write it, log it |
| **No — at least one prior commitment no longer holds** | **REDUCTION** | **stop and ask the owner** |

The classification follows from the outcome, never from the reason. A well-argued rationale does
not convert a REDUCTION into a CORRECTION; the rationale goes into the question put to the owner.
This is the mechanism by which specs shrink silently, so it is the one place the model must not
be allowed to self-certify.

**Not to be confused with Planning Posture.** A Change's `## Planning Posture` uses
EXPAND / SELECTIVE / HOLD / REDUCE to say how much work to plan right now. That is a scope
decision about the future and is freely reversible. The classification above is about the past:
whether a promise already made still holds. `REDUCE` the plan is routine; a `REDUCTION` of
commitments stops the work and goes to the owner.

> **Test**: any boundary-crossing action must trigger an owner question, an active task
> `## Change Log` entry, or an accepted `.ultra/decisions/<id>.md`.

---

## When commandments conflict

Goals override commandments. Commandments override rules. Cite the higher level:

- `C2 overrides rule "no mock" → use the testcontainer template`
- `goal Intent-Fidelity overrides C5 → ask the owner before reducing scope`

---

## Modifying this file

Changes to PHILOSOPHY require:

1. A concrete failure case the change addresses, linked in the active Change or evidence
2. An impact assessment on every dependent hook and Skill
3. Migration of any dependent constraint

PHILOSOPHY is the only file whose changes propagate to every prohibition, template reference, and
Skill instruction. Do not touch it casually.

---

## Contract Table

> Each row is a hardcoded contract between two parts of the system. Changing one side **without**
> the other was the v7 audit's #1 cause of silently broken Goal-Always-Present injection. Update
> this table BEFORE editing either side.

| Consumer | Reads | Source of truth | Failure mode if drifted |
|---|---|---|---|
| `session_context` | North Star headings `## Project Direction`, `## North Star Outcome`, `## Hard Constraints`; Project Brief `## One-line`, or legacy North Star `## One-line` | `.ultra-template/north-star.md`, `.ultra-template/project-brief.md`, and the Hook's legacy-read branch | SessionStart shows no accepted North Star or Project Brief fallback; C1 dies |
| `session_context` | unique active `change_id` → one matching `in_progress` task, else first dependency-ready `pending` task → its context | active Change directory plus `tasks.json[].change_id`, dependencies, status, and `context_file` | abandoned or blocked acceptance is injected, or current acceptance never surfaces |
| `mid_workflow_recall` | heading `## Acceptance Criteria` | `.ultra-template/contexts/TEMPLATE.md` | hook injects nothing; C1 dies silently |
| `ultra-tdd` | path `references/templates/*` | `skills/ultra-tdd/references/templates/` | guidance points at a missing runnable alternative; C2 dies |
| `post_edit_guard` | writes `.ultra/progress/<task-id>.json` for the active Change's current task | active Change directory plus `tasks.json[].change_id` and `id`, created on demand | historical work receives current observations; C4 weakens |
| `ultra-dev` and `post_edit_guard` | 6 keys: `tests_written`, `tests_passed`, `persistence_real`, `feature_flags_audit`, `vertical_slice`, `spec_trace` | the six-dimension table in `skills/ultra-dev/SKILL.md` | sensor and workflow report different evidence |
| planning and status | marker `[NEEDS CLARIFICATION]` | `.ultra-template/specs/*.md` | unresolved product truth is hidden |
| `ultra-plan` / `ultra-dev` / hooks | `trace_to` form `.ultra/specs/file.md#anchor` | `tasks.json[].trace_to` + GFM heading slugify | traces appear resolved when their heading is absent |
| `ultra-deliver` / `ultra-status` | fields `change_id`, `task_ids`, `intent_digest`, `git_commit`, and `worktree.diff_digest` | `.ultra/test-report.json` plus `worktree_digest.cjs` | stale Change, intent, task set, or product results pass as current |
| `compact_context` | `.ultra/.runtime/compact-snapshot.md` | derived from canonical files and Git | compact recovery loses acceleration, not authority |
| every hook | existence of `.ultra/` | the project directory | Ultra taxes projects that never opted in (see `docs/PLUGIN-ISOLATION-CONTRACT.md`) |
| `ultra-init` | the project data skeleton | `.ultra-template/` and the exact file list in its Skill | later Skills read missing authority paths; C1 dies |

### Maintenance protocol

Before editing any row's source of truth:

1. Find every consumer in this table
2. Update consumer and source together in one change
3. Re-run the end-to-end injection check
4. Update this table if the contract surface changed
