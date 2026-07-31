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

The agent never stops seeing the north-star. Every hook trigger that costs context budget injects:
the project one-liner plus the current task's acceptance criteria. The cost of repetition is
always less than the cost of drift.

> **Test**: pick a random in-progress task, ask the agent "what's the acceptance criteria?" — if
> it cannot answer in one sentence, this commandment is broken.

### C2 — Enabling > Defensive

Every prohibition ships with a runnable alternative. Prohibitions without an enabling path force
agents to find loopholes (rename `mock` to `stub`, etc.). The cheaper path must be the right path.

> **Test**: scan every prohibition in every Skill; each must reference a template that exists
> under that Skill's `references/templates/` and can be copied as-is. The templates are rules,
> so they ship with the package rather than being copied into each project.

### C3 — Sensors not Blockers

Hooks emit signal; agents and users decide. Block only the **truly irreversible**:

- `git push` to protected branches
- Funds transfer / on-chain transactions
- DB migrations / `DROP` / `TRUNCATE`
- Hardcoded secret commit
- Arbitrary code execution driven by user input

Everything else is advisory on stderr — the work stands, the signal is delivered, the agent
proceeds.

> **Why this is absolute**: hard final gates and hard pre-commit gates each produced the same
> over-correction loop in v7 — the agent weakened tests to escape the gate and drifted from the
> spec. A gate that can be escaped by damaging the work is worse than no gate.

> **Test**: count blocking outputs across all hooks; they must map 1:1 to the irreversible list.

### C4 — Incremental Validation

The agent always knows "how far from done." Each edit updates `.ultra/progress/task-{id}.json`
with evidence completeness across six dimensions. Final-gate audits are forbidden — if a gap
matters at the end, it matters mid-flight.

> **Scoped exception**: whole-system wiring audit (`ultra-test`) is necessarily terminal, because
> "this export has no non-test importer" cannot be evaluated while later tasks are still pending.
> It is a terminal **sensor**, never a gate: it reports and hands the trade-off to the owner.
> This is the only permitted end-of-flow audit.

> **Test**: at any point in a task, reading `.ultra/progress/task-{id}.json` answers "what's left."

### C5 — Bounded Autonomy

Autonomy is defined by goals, not rules. Inside the boundary the agent picks freely; crossing the
boundary surfaces to the user.

- **Inside**: choosing libraries, naming, file layout, internal abstractions, decomposition
  strategy, evidence interpretation, prioritization, final expression
- **Crossing**: weakening test assertions, modifying spec to match implementation, default-off
  feature flags, in-memory replacing real persistence, scope reduction, external or irreversible
  effects

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

> **Test**: any boundary-crossing action must trigger an owner question or an entry in
> `.ultra/drift-log.md`.

---

## When commandments conflict

Goals override commandments. Commandments override rules. Cite the higher level:

- `C2 overrides rule "no mock" → use the testcontainer template`
- `goal Intent-Fidelity overrides C5 → ask the owner before reducing scope`

---

## Modifying this file

Changes to PHILOSOPHY require:

1. A concrete failure case the change addresses, linked in `.ultra/drift-log.md`
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
| `session_context` | headings `## One-line`, `## Hard Constraints` | `.ultra-template/north-star.md` | SessionStart shows no goal; C1 dies |
| `session_context` | active `in_progress` task → `.ultra/contexts/task-{id}.md` | `tasks.json[].id` + `contexts/task-{id}.md` naming | acceptance criteria never surfaced |
| `mid_workflow_recall` | heading `## Acceptance Criteria` | `.ultra-template/contexts/TEMPLATE.md` | hook injects nothing; C1 dies silently |
| `post_edit_guard` mock advisory | path `references/templates/testcontainer-*` | `skills/ultra-tdd/references/templates/testcontainer-postgres.{ts,py}` | advisory points at a missing file → agent ignores it; C2 dies |
| `post_edit_guard` | writes `.ultra/progress/task-{id}.json` | created on demand by the hook | progress never persists; C4 dies |
| every Skill Step 4 | 6 keys: `tests_written`, `tests_passed`, `persistence_real`, `feature_flags_audit`, `vertical_slice`, `spec_trace` | `progress.json.evidence_score` | renaming one dimension breaks every reader |
| `ultra-plan` gate | marker `[NEEDS CLARIFICATION]` | `.ultra-template/specs/*.md` | planning proceeds on incomplete specs |
| `ultra-dev` / `ultra-test` | `trace_to` form `specs/file.md#anchor` | `tasks.json[].trace_to` + GFM heading slugify | every trace flagged dangling; `spec_trace` dimension unreachable |
| `ultra-deliver` / `ultra-status` | field `git_commit` | `.ultra/test-report.json` | stale test results pass as current |
| `pre_compact_context` / `post_compact_inject` | `.ultra/compact-snapshot.md` | written by `pre_compact_context` | compact recovery loses goal context |
| every hook | existence of `.ultra/` | the project directory | Ultra taxes projects that never opted in (see `docs/PLUGIN-ISOLATION-CONTRACT.md`) |
| `ultra-init` | the full template copy list | `.ultra-template/` tree | hook advisories point at missing paths; C1 and C2 both die |

### Maintenance protocol

Before editing any row's source of truth:

1. Find every consumer in this table
2. Update consumer and source together in one change
3. Re-run the end-to-end injection check
4. Update this table if the contract surface changed
