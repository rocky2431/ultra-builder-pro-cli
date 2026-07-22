---
name: ultra-research
description: Establish or extend an evidence-backed Ultra product and architecture baseline through the complete semantic research workflow, with resumable step state and traceable outputs. Use when initialization routes to research, baseline evidence is incomplete, or the owner explicitly requests bounded research for an active change.
---

# Establish research authority without overwhelming the owner

Use host reasoning to discover facts and synthesize artifacts. Use Ultra MCP for run
position, decision authority, output digests, blockers, and convergence. Read
`../ultra-think/references/decision-dialogue.md` before asking any owner question.
Never ask MCP to generate research content.

## Bind the run

1. Call `baseline.get`. Route absent, migrated, unreadable, or corrupt authority to
   `ultra-init` or `ultra-doctor` as reported.
2. Call `workflow.list` for `kind: "research"` and the bound baseline or change. Resume
   the active, blocked, or ready run; use `workflow.get` before doing more work.
3. When no run exists:
   - start `full` for an initial greenfield baseline;
   - start `adoption` for a brownfield baseline;
   - use `product`, `feature`, `architecture`, or `custom` only when the owner
     explicitly selected that bounded scope for an active change.

Never infer an MVP, reduced product posture, skipped step, or release phase. Full and
adoption modes execute all seventeen semantic steps. A custom run records every
excluded step and its selection reason in DB.

## Preserve complete semantic coverage

Read only the reference matching `workflow.next_step.step_id`:

| Step | Reference |
|---|---|
| `00-problem-validation` | `references/00-problem-validation.md` |
| `01-opportunity-discovery` | `references/01-opportunity-discovery.md` |
| `02-market-assessment` | `references/02-market-assessment.md` |
| `03-competitive-landscape` | `references/03-competitive-landscape.md` |
| `04-product-strategy` | `references/04-product-strategy.md` |
| `05-assumptions-validation` | `references/05-assumptions-validation.md` |
| `10-user-personas` | `references/10-user-personas.md` |
| `11-user-scenarios` | `references/11-user-scenarios.md` |
| `20-user-stories` | `references/20-user-stories.md` |
| `21-features-scope` | `references/21-features-scope.md` |
| `22-success-metrics` | `references/22-success-metrics.md` |
| `30-architecture-context` | `references/30-architecture-context.md` |
| `31-solution-strategy` | `references/31-solution-strategy.md` |
| `32-building-blocks` | `references/32-building-blocks.md` |
| `40-deployment` | `references/40-deployment.md` |
| `41-quality-risks` | `references/41-quality-risks.md` |
| `99-synthesis` | `references/99-synthesis.md` |

The seventeen steps are an internal completeness contract, not a questionnaire or the
default user interface. For each selected step:

1. Read only its reference and inspect repository, specification, runtime, tests, and
   current primary-source evidence. Do not ask the owner to repeat observable facts.
2. Separate `Observed`, `Verified`, `Decided`, and `Unknown`. Resolve evidence-answerable
   unknowns autonomously and record evidence-backed `not_applicable` results.
3. If a load-bearing owner decision remains, start or resume one decision thread bound
   to this research workflow. Open the earliest dependent decision, present only that
   question, and STOP. Do not update specifications or complete the workflow step while
   its checkpoint is unconfirmed.
4. After a coherent decision cluster, prepare one checkpoint. Present the compact
   shared understanding and affected specifications, obtain approval, and apply the
   accepted decisions.
5. Update only the relevant baseline specification or active-change research artifact.
   Preserve evidence, decisions, drift, and unknowns without copying conversation text.
   Write the accepted cluster to the stable
   `.ultra/docs/decisions/<thread-id>.md` projection and confirm its checkpoint with
   that digest. Do not bind an intermediate shared specification that later research
   steps are expected to extend.
6. Write one immutable step report at
   `.ultra/docs/research/<workflow-id>/<step-id>.md`. It must have a title and the
   sections `Evidence`, `Specification updates`, and `Decisions and unknowns`. Link
   specification anchors and external sources; do not copy transcripts or provider
   payloads.
7. Call `workflow.step` with `completed`, bounded evidence references, that step report
   as `research-step-report`, material decisions, and one or more `semantic_records`.
   Each record has a stable `id`, the step-specific `kind` and `attributes` named in
   its reference, a status (`observed`, `verified`, `decided`, `accepted`, `unknown`,
   or `not_applicable`), a concise summary, evidence refs, optional typed links, and a
   project-relative `source_ref` using `path#anchor`. Use the immutable step report as
   the source when later edits could change a shared specification. MCP verifies the
   anchor and stores its digest; `not_applicable` requires an evidence-backed rationale.
8. For `99-synthesis` in `full` or `adoption` mode, also bind the current
   `discovery.md`, `product.md`, `architecture.md`, and `research-distillate.md` as
   outputs. This freezes the exact researched baseline without making the reports a
   second specification authority.
9. If evidence or owner authority is missing, call `workflow.step` with `blocked` and
   specific blocker codes. Resume that same step after resolution; never skip a
   required step to obtain a ready state.

## Converge

When all selected steps are ready, call `workflow.complete` and read the completed run
back. Missing or stale output blocks completion.

For initial or adoption research, call `baseline.record` with discovery, product, and
architecture specification refs; current repository revision and scope; bounded source,
docs, runtime, test, deployment, and external evidence; actual verification commands
and results; unknowns; the complete gap ledger; classification; and external provider
metadata references. Do not store prompts, transcripts, memory, or graph content.

Present the recorded revision, worktree snapshot, known failures, blockers, and gaps.
Only after explicit owner approval call `baseline.converge`. Reuse the final research
checkpoint approval when it names this exact recorded revision, worktree snapshot,
known failures, blockers, and gaps; do not ask for an equivalent approval again. If
that snapshot changed, prepare one refreshed checkpoint instead. Accept known-red or a
dirty worktree only when that exact snapshot was approved. Convergence must verify the
completed full/adoption research run and current output digests.

Return a compact checkpoint: workflow id, completed/selected semantic coverage,
current decision or blocker, baseline state, open gaps, approval state, and one route.
Do not print all seventeen report paths unless requested; they remain discoverable
through workflow state. A ready initial baseline routes to `ultra-change`; bounded
change research returns to its breadcrumb and then `ultra-plan` when ready.
