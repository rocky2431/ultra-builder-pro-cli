# Research Evidence

Store durable research evidence here only when it is too detailed for the baseline
specification. Baseline decisions and accepted behavior remain in `.ultra/specs/`.

## Included-area reports

Every included research area that executes, verifies, or reuses evidence writes one
immutable report at `.ultra/docs/research/<workflow-id>/<step-id>.md`. The accepted
coverage determines the report set; `full` and `adoption` describe baseline purpose,
not a requirement to execute all seventeen catalog areas. Omitted areas create no
report. The shared specifications are updated during research but do not replace these
per-area evidence records.

## Report contract

Record:

- a Markdown title and the exact sections `Evidence`, `Specification updates`, and
  `Decisions and unknowns`;
- scope and the decision the evidence informs;
- observed facts with source references and dates;
- verification commands or runtime evidence;
- accepted decisions and their owner;
- unresolved unknowns and whether they block the baseline;
- links to the product or architecture sections updated from the evidence.

Keep inference distinct from observation. Link to external provider content instead of
copying memory, code-graph payloads, or large source material into Ultra.

## Completion

Update the affected baseline specification, record the report through `workflow.step`,
include it in `baseline.record` evidence when material, and record unresolved work in
the authoritative gap ledger. The final synthesis also binds the three specifications
and research distillate. Do not create a condensed duplicate of the baseline.
