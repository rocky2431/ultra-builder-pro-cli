# Research Evidence

Store durable research evidence here only when it is too detailed for the baseline
specification. Baseline decisions and accepted behavior remain in `.ultra/specs/`.

## When to create a report

Create a report for external facts, repository investigations, experiments, runtime
observations, or decision evidence that must remain inspectable. Use a descriptive
file name and include the observation date when freshness matters.

## Report contract

Record:

- scope and the decision the evidence informs;
- observed facts with source references and dates;
- verification commands or runtime evidence;
- accepted decisions and their owner;
- unresolved unknowns and whether they block the baseline;
- links to the product or architecture sections updated from the evidence.

Keep inference distinct from observation. Link to external provider content instead of
copying memory, code-graph payloads, or large source material into Ultra.

## Completion

Update the affected baseline specification, include the report in `baseline.record`
evidence when material, and record unresolved work in the authoritative gap ledger.
Do not create a condensed duplicate of the baseline.
