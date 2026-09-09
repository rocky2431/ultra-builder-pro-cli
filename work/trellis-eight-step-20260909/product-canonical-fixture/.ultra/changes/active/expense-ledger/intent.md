# Change expense-ledger: Build local expense ledger

> **Status**: accepted
> **Profile**: standard
> **Profile rationale**: One CLI with exact-money and transactional local-persistence risk.
> **Risk flags**: numeric correctness, local data integrity

## Outcome
Deliver the full dependency-free local CLI defined by GOAL.md with actual canonical evidence and local delivery.

## Acceptance
| ID | Criterion | Verification type | Required evidence |
|---|---|---|---|
| AC-01 | All fixed GOAL.md behaviors are implemented and unchanged acceptance passes. | command | Current CLI E2E and exact output. |
| AC-02 | Final integrated source has independent read-only Pi Review and blocking dispositions. | external-observation | Real native identity and exact retained review receipt. |
| AC-03 | Small dependency-free implementation has documented runnable import/report examples. | inspection | Actual source, non-test callers and README. |
| AC-04 | Canonical Task Evidence, Test and Deliver are genuinely consumed for this result. | inspection | Current valid records and local archived delivery. |

## Non-goals
Network, accounts, UI, database, production data, extra dependencies and release effects.

## Public Seams
- node cli.cjs import <csv-file> <ledger-file>
- node cli.cjs report <ledger-file> <YYYY-MM>

## Reconciliation
### Promised and Missing
The CLI is absent and the known money helper is deliberately incorrect.
### Built and Unpromised
None.
### Contradictory
None.

## Research Disposition
- Disposition: none
- Question: none
- Selected lenses: none
- Existing evidence: GOAL.md and acceptance.cjs.
- Required exit evidence: actual implementation and checks.
- Rationale: Fixed synthetic product purpose needs no exploratory interview.

## North Star Trace
- First principles: FP-1 and FP-2.
- Serves: NS-1.
- Touches: HC-1.
- Evidence: GOAL.md and .ultra/specs/product.md.
- North Star revision: expense-ledger-r1
- North Star digest: 73193407962e847a74429e79cc6189b8afca80ff
- Contradictions or refinements: none.

## Execution Grant
- Grant: session-local
- Allowed workflows: plan, dev, task Review, Test, aggregate Review, Deliver reconciliation and explicitly selected local finalize.
- Agent topology: current native prompt selects Factory or Solo; Primary remains sole canonical writer and external QA is read-only.
- Allowed local effects: exact .ultra/decisions/experiment.md boundary.
- Budgets and expiry: 35-minute whole run; two post-integration repair iterations; initial task Review plus two blocking-only deltas; one aggregate Review.
- Mandatory reviews: independent current-source task Review, then canonical aggregate Review.
- Stop conditions: unresolved current P0/P1, excluded effect, exhausted budget or unknown overlapping writer.
- Invalidation: changed accepted intent or current operator revocation.
- Never granted: effects excluded in the owner fixture record.
- Activation: current experiment prompt only; files are inactive by themselves.

## Planning Posture
SELECTIVE: implement one complete small CLI, with model-selected internal boundaries.

## Recovery
Preserve original session and result facts. A file is never permission to resume or launch writers.

## Unresolved Decisions
None before implementation.
