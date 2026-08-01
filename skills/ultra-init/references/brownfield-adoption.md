# Brownfield adoption

Use this procedure only when `ultra-init` detects an existing codebase without a
healthy `.ultra/` authority surface. Initialization records the observable baseline;
it does not redesign the application or accept claims the repository cannot support.

## Bind the repository boundary

Record the repository root, selected workspace roots, branch, `HEAD`, dirty files,
generated and vendored exclusions, manifests, verification commands, and public
seams. Keep out-of-scope dirty files visible as context without treating them as part
of the selected baseline.

## Inspect the maintained system

Trace product behavior through real entry points, runtime consumers, persistence,
integrations, permissions, failure paths, tests, deployment, observability, and
recovery. Classify every material statement as `Observed`, `Verified`, `Decided`, or
`Unknown`. Record maintained-document conflicts as drift.

## Write the baseline once

- Update `.ultra/specs/product.md` with delivered behavior and acceptance.
- Update `.ultra/specs/architecture.md` with boundaries, authority, consumers,
  permissions, failures, and recovery.
- Update `.ultra/specs/discovery.md` with scope evidence, known defects, drift, and
  unresolved questions.
- Initialize `.ultra/tasks.json` and `.ultra/test-report.json` from the packaged
  templates without manufacturing passing results.

Use the specifications as the canonical representation. Do not create a second
baseline ledger, database projection, or generated semantic mirror.

## Characterize verification

Run the repository's existing verification commands. Record each result as `pass`,
`known_red`, or `not_run`; a missing command is not a pass. A critical public seam
without a stable signal is an explicit gap, not an excuse to invent completion.

## Converge

Read every written file back, show the owner the selected scope, observed behavior,
drift, known-red verification, unknowns, and material decisions, and leave unresolved
items marked `[NEEDS CLARIFICATION]`. Adoption is ready when the file set is complete,
the recorded revision matches the inspected checkout, and every material gap remains
visible with its evidence and owner decision where one exists.

Recommend `ultra-change` for subsequent work and stop; public skills do not invoke one
another.
