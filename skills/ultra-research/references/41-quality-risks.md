# Quality scenarios and risks

Use for workflow step `41-quality-risks`.

## Objective

Turn quality goals and known failure modes into observable scenarios, mitigations,
recovery expectations, and a durable risk ledger.

## Method

- Cover only qualities material to the accepted system: correctness, availability,
  security, performance, privacy, maintainability, or others supported by evidence.
- State trigger, operating condition, expected response, measurement, and recovery.
- Separate known defect, technical debt, uncertain risk, and accepted constraint.
- Do not assign arbitrary probability or confidence scores.

## Record

Update `architecture.md` with quality scenarios, risk evidence, mitigation, owner,
verification, recovery, technical debt, and architecture decisions where needed.

Complete the step with evidence references and the updated output path.

## Report trace

In the area report, record `trigger_condition`, `expected_response`, `measurement`,
`mitigation`, `recovery`, and `owner`, then link the risk heading or decision file.
