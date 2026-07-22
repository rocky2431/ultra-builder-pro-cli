---
name: ultra-research
description: Establish or extend an evidence-backed Ultra product and architecture baseline through the complete semantic research workflow, with resumable step state and traceable outputs. Use when initialization routes to research, baseline evidence is incomplete, or the owner explicitly requests bounded research for an active change.
---

# Establish research authority

Use host reasoning for evidence gathering, product judgment, questions, and artifact
content. Use Ultra MCP for run selection, state transitions, output digests, blockers,
and baseline convergence. Never ask MCP to generate research content.

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

## Execute one recoverable step at a time

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

For each selected step:

1. Inspect current repository and specification evidence before asking the owner to
   repeat known facts. Browse only for unstable or external claims, using primary
   sources where possible.
2. Separate `Observed`, `Verified`, `Decided`, and `Unknown`. Ask one concise question
   only when the answer changes scope, product intent, security, cost, or another
   load-bearing decision.
3. Update the relevant baseline specification or active change research artifact.
   Preserve citations, decisions, drift, and unresolved gaps without duplicating prose.
4. Write one immutable step report at
   `.ultra/docs/research/<workflow-id>/<step-id>.md`. It must have a title and the
   sections `Evidence`, `Specification updates`, and `Decisions and unknowns`. Link
   specification anchors and external sources; do not copy transcripts or provider
   payloads.
5. Call `workflow.step` with `completed`, bounded evidence references, that step report
   as `research-step-report`, material decisions, and one or more `semantic_records`.
   Each record has a stable `id`, the step-specific `kind` and `attributes` named in
   its reference, a status (`observed`, `verified`, `decided`, `accepted`, `unknown`,
   or `not_applicable`), a concise summary, evidence refs, optional typed links, and a
   project-relative `source_ref` using `path#anchor`. Use the immutable step report as
   the source when later edits could change a shared specification. MCP verifies the
   anchor and stores its digest; `not_applicable` requires an evidence-backed rationale.
6. For `99-synthesis` in `full` or `adoption` mode, also bind the current
   `discovery.md`, `product.md`, `architecture.md`, and `research-distillate.md` as
   outputs. This freezes the exact researched baseline without making the reports a
   second specification authority.
7. If evidence or owner authority is missing, call `workflow.step` with `blocked` and
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
Only after explicit owner approval call `baseline.converge`. Accept known-red or a
dirty worktree only when that exact snapshot was approved. Convergence must verify the
completed full/adoption research run and current output digests.

Return the workflow id, all seventeen step-report paths for full/adoption research,
the four synthesis artifacts, baseline status, open gaps, approval state, and one exact
next route. A ready initial baseline routes to `ultra-change`; bounded change research
returns to its change breadcrumb and then `ultra-plan` when the research gate is ready.
