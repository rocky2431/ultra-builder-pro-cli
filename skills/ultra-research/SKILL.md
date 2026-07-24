---
name: ultra-research
description: Build or refresh an evidence-backed product and architecture baseline with model-selected semantic coverage and low-load user alignment. Use when initialization, brownfield adoption, or an active change has a real evidence gap.
---

# Research with adaptive coverage

The host model owns investigation, synthesis, and coverage judgment. Ultra MCP owns the
run, evidence references, semantic records, artifact digests, freshness, and
convergence. The reference areas are an optional coverage catalog, not a mandatory
questionnaire or a fixed sequence of user conversations.

Read `../ultra-think/references/decision-dialogue.md` before asking a material question.

## Bind authority

1. Read `system.doctor`, `baseline.get`, active decisions, and existing research runs.
2. Resume the matching active, blocked, or ready run. Do not create parallel authority.
3. If none exists, select:
   - `full` for a greenfield baseline;
   - `adoption` for a brownfield baseline;
   - a bounded mode only for a recorded active-change research disposition.
4. Before `workflow.start`, inspect current code, docs, tests, runtime, and prior
   artifacts. Select the smallest sufficient set of applicable catalog areas. Include
   only areas that need work or whose exclusion must remain auditable:
   - `execute`: produce fresh evidence;
   - `verify_existing`: verify a current artifact against its source;
   - `reuse`: reuse evidence that is still current;
   - `not_applicable`: exclude with an evidence reference and rationale;
   - `deferred`: record the consequence and owner acceptance when deferral changes the
     accepted scope or leaves material risk.
5. Pass the evidence-based coverage rationale as `metadata.selection_reason`. Omitted
   catalog areas create no DB step and need no ceremonial disposition.

`99-synthesis` must execute, verify, or reuse. A missing disposition is a coverage
error only for an included area; a recorded exclusion with evidence is not incomplete.

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

For every required workflow step, write
`.ultra/docs/research/<workflow-id>/<step-id>.md` with `Evidence`,
`Specification updates`, and `Decisions and unknowns`. Call `workflow.step` with
bounded evidence, the report output, and typed semantic records. Reused or verified
evidence must still produce a current report and digest. Block the same step when
required evidence or owner authority is missing.

At synthesis, bind the current `discovery.md`, `product.md`, `architecture.md`, and
`research-distillate.md` for initial/adoption research.

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
failures.

Reuse the final research checkpoint approval during baseline convergence; do not ask
for an equivalent approval again. After initial or adoption convergence,
`ultra-change` becomes an available transition. Bounded change research returns to
its owning Change authority.

Return a compact coverage summary by disposition, current evidence or decision
blocker, baseline state, gaps, and allowed transitions. The host chooses the semantic
recommendation; MCP supplies only valid and required transitions.
