# Architecture research

Read this reference when the system boundary, quality attributes, integration seams,
technology choice, or implementation constraints are unresolved.

## Current system evidence

Start from the current checkout:

- entry points and external interfaces;
- domain boundaries and authoritative state;
- data flows and side effects;
- existing dependencies and deployment topology;
- failure, recovery, authorization, and observability paths.

Do not design a replacement architecture before identifying the live path and the
constraint that requires change.

## Decision method

For each material architecture decision:

1. state the required capability and quality constraints;
2. identify credible options already compatible with the system when possible;
3. use official primary documentation for library or platform behavior;
4. evaluate integration cost, operability, failure modes, migration, and rollback;
5. record the selected option, rejected alternatives that may recur, and the evidence
   that would reopen the decision.

Do not compare technologies for ceremony. A single established repository pattern is
the default when it satisfies the contract.

## Record the result

Update the architecture specification with system context, boundaries, building
blocks, runtime flow, authoritative state, external contracts, quality scenarios,
deployment constraints, and accepted decisions. Connect each required behavior to a
reachable public seam and a verification approach.
