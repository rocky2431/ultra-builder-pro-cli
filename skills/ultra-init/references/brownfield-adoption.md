# Brownfield initialization

Use this procedure only when `ultra-init` finds maintained behavior but no healthy,
complete Ultra skeleton. Init preserves the checkout and prepares an evidence route; it
does not establish the brownfield baseline.

## Bind the repository boundary

Identify the repository root, selected workspace roots, branch, `HEAD`, dirty files,
generated or vendored exclusions, manifests, maintained documents, verification
commands, and visible public entry points. Resolve these from files and Git instead of
asking the owner.

## Preserve before interpreting

- Never replace existing `.ultra` files, `CONTEXT.md`, decisions, or maintained project
  documents merely to obtain the current template shape.
- Treat source, tests, runtime configuration, and documentation as evidence candidates,
  not conclusions Init may promote.
- Keep out-of-scope dirty files visible in the report without adding them to the
  Project Brief or specification skeletons.
- Record an exact legacy one-line as raw intake only when the Project Brief is empty.

## Prepare the Research handoff

List the concrete paths and live seams that can answer each open baseline question.
`ultra-research` establishes the observed and accepted baseline from those sources. Init
does not run verification, classify delivered behavior, reconcile documentation drift,
or write product, discovery, or architecture conclusions.

Report the preserved files, repository boundary, candidate evidence, and unresolved
questions. Recommend Research and stop; public workflows never invoke one another.
