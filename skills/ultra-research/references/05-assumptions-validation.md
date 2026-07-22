# Assumptions and validation

Use for workflow step `05-assumptions-validation`.

## Objective

Make load-bearing assumptions visible and define the smallest credible evidence needed
to confirm or reject them.

## Method

- Extract assumptions from problem, opportunity, market, alternative, and strategy
  claims.
- Separate already verified facts from assumptions and owner decisions.
- Prioritize by consequence and uncertainty only when prioritization affects the next
  action; do not assign arbitrary scores.
- Define a validation signal, evidence source, decision rule, owner, and recovery path.

## Record

Update `discovery.md` with the assumption ledger and validation state. Map unresolved
load-bearing assumptions to blocking unknowns or gaps. Keep non-blocking future work
out of the implementation task graph until the owner selects it.

Link evidence and the updated specification anchor from the immutable step report
required by the orchestrator.

## Semantic record

Use kind `assumption`. Record `category`, `consequence`, `validation_signal`,
`success_rule`, `failure_rule`, and `ambiguous_rule`.
