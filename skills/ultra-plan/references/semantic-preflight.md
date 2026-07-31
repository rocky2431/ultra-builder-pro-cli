# Semantic planning preflight

Before task decomposition, read the normalized Change Contract and the current
change-bound research records.

1. Resolve every blocking `unresolved_decision` or return to `ultra-change`.
2. When research is recorded, verify one completed run has the same mode and selected
   step set. Re-run stale or missing evidence through `ultra-research`.
3. Build a coverage ledger from Change acceptance ids to task acceptance ids.
4. Bind every task to an accepted id, semantic record id, semantic source ref, or real
   Markdown anchor through `trace_to`.
5. Check that every task reaches a public consumer and owns its error, documentation,
   verification, and recovery obligations.
6. Validate dependencies. A `quick` profile normally has one vertical task, but the
   model may use the smallest evidence-backed graph that satisfies the accepted Change.

Treat the MCP result as a persistence receipt plus typed diagnostics. Structural,
digest, path, concurrency, and exact topology conflicts must be repaired. The model
owns semantic completeness, acceptance coverage, research sufficiency, and whether a
warning requires another planning revision before execution.
