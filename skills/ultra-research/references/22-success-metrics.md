# Outcomes and measurements

Use for workflow step `22-success-metrics`.

## Objective

Define how the owner will know the accepted behavior and product outcome are working,
including signals that would reveal harmful optimization.

## Method

- Derive measurements from accepted outcomes and available instrumentation.
- State definition, source, observation window, owner, and decision use.
- Attribute every outcome, guardrail, and anti-metric to its true source: record it as
  owner-set only for a constraint or measure the owner actually stated, and as
  model-owned for defaults you selected inside the authorized scope. A technical
  default promoted into an owner-set constraint is a false record; correcting the
  attribution is a source fix, never a fresh owner approval to seek or a new
  acceptance question for a settled technical choice.
- Separate current measurements, target decisions, and unavailable telemetry.
- Propose one or more stable `NS-*` outcomes when justified by delivered value and a
  credible observation contract. Each records observation method, baseline, target or
  expected change, horizon, and anti-metric.
- Do not force a single metric, or invent baselines and targets, when guardrails plus an
  observable outcome represent the product more honestly.

## Record

Update `product.md` with supporting outcome measures, operational measures, guardrails,
evidence availability, and unresolved instrumentation needs. Propose the canonical
`NS-*` entries for `north-star.md`; they become authority only through accepted synthesis.
A metric that cannot be observed is a gap or explicit future Change.

Complete the step with evidence references and the updated output path.

## Report trace

In the area report, record `definition`, `source`, `window`, `owner`, and
`decision_use`, then link the metric heading in `product.md`.
