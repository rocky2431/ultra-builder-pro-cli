# Market assessment

Use for workflow step `02-market-assessment`.

## Objective

Record only market facts that materially affect product scope, economics, regulation,
or delivery. For an internal tool or a brownfield system with no market decision, state
that boundary and retain the evidence supporting it.

## Evidence

- Prefer current primary sources, filings, official statistics, and directly observed
  commercial data.
- Preserve source date, geography, segment definition, and calculation assumptions.
- Do not manufacture TAM, growth rates, pricing, or false numeric precision.
- Separate externally verified facts from owner targets and estimates.

## Record

Update `discovery.md` with relevant segment boundaries, commercial or operational
constraints, source-backed measurements, assumptions, and unknowns. Include a sizing
model only when the decision genuinely depends on one and the inputs are defensible.

Link source references and the updated specification anchor from the immutable step
report required by the orchestrator.

## Semantic record

Use kind `market_constraint`. Record `constraint`, `decision_impact`, and `freshness`.
