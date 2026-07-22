# Evidence Status

Cross-model agreement is a signal, not an authority. Classify the synthesis only after checking
consequential claims against source code, tests, runtime output, or primary documentation.

## Levels

- **Verified agreement**: both analyses agree and the consequential claims have authoritative
  supporting evidence.
- **Resolved dissent**: the analyses differ, but current evidence supports one position and explains
  the disagreement.
- **Unresolved**: available evidence cannot distinguish the positions or key assumptions remain
  untested.
- **Single source**: the advisor failed or returned no usable output; no cross-model corroboration is
  available.

## Reporting

Record which claims were verified, the evidence used, useful dissent, unsupported assertions, and
remaining uncertainty. Model agreement never upgrades a claim contradicted by tests or runtime
evidence, and a uniquely reported finding remains valid when independently verified.
