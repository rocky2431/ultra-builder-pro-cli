---
name: ultra-research
description: Build or refresh an evidence-backed product and architecture baseline through recommended, user-selected semantic coverage and low-load alignment. Use when initialization, brownfield adoption, or an active change has a real evidence gap.
---

# Research with adaptive coverage

The model owns investigation, synthesis, and coverage recommendations; the user owns the accepted semantic route and material deferrals.
MCP owns run state, evidence, semantic records, digests, freshness, and convergence, not a questionnaire.

Read `../ultra-think/references/decision-dialogue.md` before asking a material question.

## Bind authority

1. Read `system.doctor`, `task.ledger_get`, `baseline.get`, breadcrumb
   `accepted_intent`, active decisions, and existing research runs. Import a newer
   descendant team checkpoint before binding coverage; stop on a typed merge conflict.
2. Resume the matching active, blocked, or ready run. Do not create parallel authority.
3. If none exists, use `full` for greenfield, `adoption` for brownfield, or a bounded
   mode only for a recorded active-Change disposition. Focused baseline coverage
   remains `full` or `adoption`; `custom` is Change-bound only.
4. Before `workflow.start`, inspect current code, docs, tests, runtime, and prior
   artifacts. Recommend the smallest sufficient set of applicable catalog areas.
   Explain the net effect without dumping all 17 areas. Offer at most three credible
   routes: the recommended adaptive set, the full catalog, and a focused or custom set.
5. If current user intent does not already select a route, use the host's native
   structured question surface. The user selects, modifies, delegates, or defers.
   Treat a dismissal as unanswered, stop, and perform no route-dependent write.
6. Normalize the answer and persist the accepted coverage through `workflow.start`.
   Use `execute` for fresh evidence, `verify_existing` for source validation, `reuse`
   for current evidence, `not_applicable` with evidence and rationale, or `deferred`
   with consequence and owner acceptance when scope or material risk changes.
7. Pass the evidence-based coverage rationale as `metadata.selection_reason`. Omitted
   catalog areas create no DB step and need no ceremonial disposition.
8. Read back the created workflow and accepted coverage. When a durable decision thread
   recorded the route, complete it with the workflow reference in `applied_refs`.

`99-synthesis` must execute, verify, or reuse. A missing disposition is a coverage error only for an included area; a recorded exclusion with evidence is not incomplete.

## Coverage catalog

Load only the reference for a step that must execute, verify, or reuse:

| Area | Reference | Area | Reference |
|---|---|---|---|
| `00-problem-validation` | `references/00-problem-validation.md` | `01-opportunity-discovery` | `references/01-opportunity-discovery.md` |
| `02-market-assessment` | `references/02-market-assessment.md` | `03-competitive-landscape` | `references/03-competitive-landscape.md` |
| `04-product-strategy` | `references/04-product-strategy.md` | `05-assumptions-validation` | `references/05-assumptions-validation.md` |
| `10-user-personas` | `references/10-user-personas.md` | `11-user-scenarios` | `references/11-user-scenarios.md` |
| `20-user-stories` | `references/20-user-stories.md` | `21-features-scope` | `references/21-features-scope.md` |
| `22-success-metrics` | `references/22-success-metrics.md` | `30-architecture-context` | `references/30-architecture-context.md` |
| `31-solution-strategy` | `references/31-solution-strategy.md` | `32-building-blocks` | `references/32-building-blocks.md` |
| `40-deployment` | `references/40-deployment.md` | `41-quality-risks` | `references/41-quality-risks.md` |
| `99-synthesis` | `references/99-synthesis.md` |  |  |

## Investigate and interact

For each active area:

1. Resolve observable facts from the checkout, runtime, tests, existing specifications,
   and primary sources. Separate `Observed`, `Verified`, `Decided`, and `Unknown`.
2. Ask the user only for a material intent, scope, compatibility, risk, or recovery
   decision that evidence cannot answer. Use the host's native question UI when
   available. Present the recommendation and effect; avoid a questionnaire or a dump
   of the hidden research queue.
3. Process dependent decisions one at a time. A small group of independent,
   low-cognitive-load facts may be asked together when the host UI supports it.
4. Normalize explicit user intent without redundant confirmation. Create durable
   decision state only when a project-bound decision must survive interruption.
5. Update the smallest relevant baseline specification or active-change research
   artifact. Do not copy prompts, transcripts, provider payloads, or internal chain of
   thought.

Every required step writes `Evidence`, `Specification updates`, and `Decisions and
unknowns` to `.ultra/docs/research/<workflow-id>/<step-id>.md` for a baseline, or
`<change-root>/research/<workflow-id>/<step-id>.md` for an active Change.

Call `workflow.step` with bounded evidence, the report output, and typed semantic
records. Reused or verified evidence must still produce a current report and digest.
Block the same step when required evidence or owner authority is missing. For Change
research, keep `findings.md` and every semantic output inside the same Change root and
register them through workflow outputs; do not write baseline specifications.

At synthesis, bind the current `discovery.md`, `product.md`, `architecture.md`, and
`research-distillate.md` only for initial/adoption research. Change-bound synthesis
updates the Change findings and specification overlay, then records or refreshes
`change.delta`. It never mutates the accepted baseline.

## Baseline convergence

After `workflow.complete`, initial or adoption research calls `baseline.record` with
the current repository scope and revision, specification refs, evidence, real
verification results, unknowns, gap ledger, classification, and external provider
metadata references.

If Git is initialized but unborn, present the exact local checkpoint paths and purpose
for user authorization, then create only that local commit. Never create a remote,
tag, or push through research. If authorization or identity is missing, preserve the
run as blocked with `BASELINE_GIT_HEAD_REQUIRED`.

Call `baseline.converge` only when the user has accepted the exact baseline snapshot,
known failures, blocking gaps, and scope. Reuse an unambiguous current approval; do not
ask twice. MCP must reject stale research, drift, missing evidence, and unaccepted
failures. Successful convergence publishes the portable baseline, Changes, and tasks
to the Git team checkpoint; the receiving checkout must still revalidate a ready
baseline against its own HEAD and files.

Reuse the final research acceptance or current artifact checkpoint during baseline
convergence; do not ask for an equivalent approval again. After initial or adoption
convergence, `ultra-change` becomes an available transition. Bounded change research
returns to its owning Change authority; the next route is still `ultra-plan`, never
direct implementation.

Return a compact coverage summary by disposition, current evidence or decision blocker, baseline state, gaps, and allowed transitions.
Recommend a semantic next action from those transitions. If current intent does not already select it, present the recommendation
and credible alternatives through the interaction protocol, then wait. MCP supplies only valid and required transitions.

Never invoke the recommended capability here; wait for an explicit user invocation.
