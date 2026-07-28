# Plan: Close Context and Harness Lifecycle Gaps

1. Add regression tests that demonstrate the missing incident diagnosis contract, the
   unconsumed checkpoint snapshot, and absent cross-host provenance diagnostics.
2. Extend the incident lane with a deterministic diagnosis artifact contract while keeping
   semantic debugging judgment with the model and the debugger agent.
3. Make the compact checkpoint a validated recovery consumer and cover corrupt/stale/fallback
   behavior across native hook schemas.
4. Add a shared provenance manifest/digest implementation, integrate it with all three
   adapters, and expose a read-only `ubp doctor` command with structured and human output.
5. Synchronize public architecture, compatibility, release, and continuous-change docs.
6. Run targeted tests, complete Node/spec/hook suites, package smoke, diff audit, convergence,
   and archive reconciliation.

Rollback: revert the source changes; adapter reinstall regenerates prior host assets. The
project state schema is not migrated by this change.
