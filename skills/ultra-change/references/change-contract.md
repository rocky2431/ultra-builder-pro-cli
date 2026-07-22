# Change Contract and profile

Create one contract before planning. Keep every field specific enough to verify and
stable enough to survive a fresh session.

## Contract

- `outcome`: one externally observable result.
- `acceptance`: stable ids with a criterion and exact verification for each accepted
  behavior.
- `non_goals`: explicit boundaries that prevent accidental scope growth.
- `public_seams`: entry points or outputs through which acceptance is observed.
- `recovery`: a bounded reversal or recovery strategy and its verification.
- `unresolved_decisions`: stable ids, summary, blocking state, and owner when known.

Resolve every blocking decision before planning. Keep non-blocking uncertainty visible
in the task and verification contracts.

## Profile

- `quick`: one low-risk task, no material risk flags, and no research dependency.
- `standard`: a bounded change with multiple tasks or ordinary integration risk.
- `major`: a broad or consequential change with material contract, migration,
  authorization, security, multi-module, external-integration, or release impact.
- `incident`: urgent diagnosis and recovery with a reproducible symptom. Baseline
  break-glass still requires a recorded approver and recovery contract.

Record a profile rationale and every applicable risk flag. Select the smallest profile
whose guarantees cover the real blast radius; never use profile labels as estimates.

## Research disposition

Use `none` with a rationale when accepted evidence is sufficient. Use `bounded` or
`required` with a supported mode and the exact selected semantic steps when product,
behavior, architecture, deployment, or risk facts remain load-bearing. The recorded
selection is the planning gate.
