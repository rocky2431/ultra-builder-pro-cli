# Project North Star

## Acceptance and Revision

- Schema: `north-star-v2`
- Status: `accepted`
- Revision: `expense-ledger-r1`
- Owner acceptance source: `.ultra/decisions/experiment.md#owner-record`
- Acceptance time: `not-recorded`
- Supersedes: `none`

## Problem Reality

- Reality: A small team needs deterministic local import of synthetic bank CSV and monthly totals without remote services.
- Evidence: `GOAL.md`; `acceptance.cjs`.
- Unknowns: Concurrent writers and crash-durability beyond atomic rename are outside the accepted boundary.

## First-Principle Propositions

### FP-1 — Preserve trustworthy local records
- Proposition: Invalid or conflicting input must not corrupt or partially replace an existing ledger.
- Evidence: `GOAL.md` persistence and conflict requirements.
- Causal consequence: Validate the complete transaction before same-directory atomic replacement.
- Falsifier or revisit trigger: Any malformed import changes existing ledger bytes.
- Status: `accepted`

### FP-2 — Calculate exact money by currency
- Proposition: Monetary values and totals must remain integer-exact and currencies must never be mixed.
- Evidence: `GOAL.md` money and reporting requirements.
- Causal consequence: Convert decimal text without floating point and group by currency plus category.
- Falsifier or revisit trigger: Precision loss, unsafe totals, or mixed-currency aggregation.
- Status: `accepted`

## Value Causal Chain

| Chain | Principle | Capability | Observable behavior | Outcome |
|---|---|---|---|---|
| VC-1 | FP-1 | strict CSV and ledger validation with transactional persistence | rejected imports preserve bytes | NS-1 |
| VC-2 | FP-2 | exact cents and separated aggregation | deterministic monthly JSON totals | NS-1 |

## North Star Outcomes

### NS-1 — Reliable local expense ledger
- Outcome: The two documented CLI commands import valid exports and report exact monthly totals while rejecting invalid data safely.
- Observation method: Run unchanged `acceptance.cjs`.
- Baseline: Seeded money defect and absent CLI retained in `probe/baseline.json`.
- Target or expected change: All accepted goal behaviors and checks pass on the final exact source revision.
- Horizon: This bounded implementation experiment.
- Anti-metric: Passing counts never substitute for preserved independent findings and provenance.

## Hard Constraints

### HC-1 — Isolated dependency-free sample
- Protected value or threat: Avoid external effects, dependency drift, credential exposure, and scope expansion.
- Constraint: Use Node standard library and local files only; do not publish, bump version, access network, or modify owner-fixed inputs or Ultra itself.
- Authority or evidence: owner-stated in `GOAL.md` and the current experiment instruction.
- Revisit condition: A future owner-authorized product change explicitly changes the local-only boundary.

## Explicit Exclusions

- Accounts, database, UI, concurrency locking, publication, deployment, and production data.

## Uncertainties and Revisit Triggers

- Revisit if concurrent imports, strict malformed UTF-8 rejection, or power-loss directory durability becomes required.

## Research Trace

- Project Brief: `.ultra/project-brief.md`
- Research runs: fixed synthetic fixture intent, accepted before implementation; no product research is needed.
- Sources and decisions: `GOAL.md`; `.ultra/decisions/experiment.md#owner-record`; `probe/baseline.json`.
