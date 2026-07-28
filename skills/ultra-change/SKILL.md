---
name: ultra-change
description: Capture or revise one bounded feature, fix, redesign, or incident contract against a ready Ultra baseline. Use when post-baseline work needs accepted intent before research, planning, or implementation.
---

# Capture accepted change intent

Change is the durable unit that connects later research, plan, implementation,
verification, review, and baseline reconciliation. Capturing a change does not start
those workflows or compile execution context.

Read `../ultra-think/references/decision-dialogue.md` before asking a material question.

## Inspect and align

1. Read `system.doctor`, `baseline.get`, active changes, breadcrumb `accepted_intent`,
   decisions, and `change.breadcrumb`.
2. Resume an existing change that matches the request. Do not duplicate authority.
3. Ordinary work requires a healthy ready baseline. An incident may use only an
   explicit `baseline_bypass` reason and approver; urgency is not approval.
4. Inspect the checkout and accepted baseline before asking the user. Resolve code and
   runtime facts yourself.
5. Convert the request into a Change Contract:
   - observable outcome and executable acceptance;
   - non-goals and public seams;
   - recovery strategy and verification;
   - unresolved material decisions;
   - documentation impact;
   - change kind and evidence-backed risk flags;
   - research disposition.

Recommend `quick`, `standard`, `major`, or `incident` from actual scope and risk,
together with the research disposition. A quick change may have no material risk,
research obligation, or more than one task. MCP may reject a profile that contradicts
hard risk invariants; it does not choose a replacement.

After `change.create` or `change.update`, read back the complete Change Contract. When
that write applies a durable decision, complete the decision thread with the change
reference in `applied_refs`.

Ask only when a choice changes accepted product intent, scope, public behavior,
compatibility, security, material cost, external effects, or recovery. Use the host's
native question UI when available. Normalize clear choices already in the user's
request. When profile or research posture remains unresolved, present the recommended
route and credible alternatives through that same UI, then stop. The user selects,
modifies, delegates, or defers the semantic route. The model owns reversible
implementation detail inside the accepted contract.

## Persist the contract

When a durable alignment checkpoint is necessary, bind it to a compact artifact and
pass its id as `alignment_thread_id`. Do not require a checkpoint for a complete,
unambiguous request that already provides current authority.

Call `change.create`. It records and completes exactly:

1. `bind-baseline`
2. `classify-change`
3. `record-intent`

The returned change workflow must be `completed`; research, plan, context, dev, test,
review, and deliver remain independent capabilities. Keep every Change-owned semantic
artifact, finding, plan, context, test result, review result, documentation update,
and progress projection below `.ultra/changes/active/<id>/`. Incidents maintain the
structured diagnosis artifact there as well.

Before planning a standard or major change, write the accepted specification updates
to the Change overlay and call `change.delta` with exact baseline id, repository
revision, specification digests, decisions, non-goals, acceptance, documentation
impact, unknowns, and mutation before/after digests. If accepted behavior truly does
not change baseline semantics, record an empty typed delta with a specific
`no_semantic_change_reason`; do not manufacture a mutation. Read back the registered
delta and deterministic `progress.md`. This records proposed authority only and must
not edit baseline specifications.

Use `change.update` when accepted intent or evidence changes. Update the Change
Contract, classification, research disposition, and docs impact together when their
meaning is coupled. Downstream task, context, test, or review evidence affected by that
change must become stale and be regenerated; never keep old evidence green by prompt
assertion.

If research is required, recommend `ultra-research` with the recorded disposition. If
the contract is sufficiently evidenced, finish the typed delta and recommend
`ultra-plan`. Direct Build skips Research only; it never skips Plan, DB-backed task
contracts, or fresh task context. Return and wait for an explicit user invocation; do
not start another workflow. `change.context` is compiled only for an actual plan,
implementation, test, or review consumer.

Stable implementation discoveries use the approval-gated specification-learning
transitions. External memory and graph providers retain their own content; Ultra stores
metadata references only.

Return the normalized contract, change id and kind, research disposition, blockers,
and `allowed_transitions`. Recommend a semantic next action from those transitions.
If current intent does not already select it, present the recommendation and credible
alternatives through the interaction protocol, then wait. MCP does not encode a
semantic next action.

Never invoke the recommended capability here; wait for an explicit user invocation.
