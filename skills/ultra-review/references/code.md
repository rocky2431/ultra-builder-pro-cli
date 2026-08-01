# Code lens

Review the exact diff plus only the callers, contracts, tests and configuration needed
to establish a finding. Trace changed behavior from a production entry point to its
consumer. Check correctness, trust boundaries, state consistency, recovery,
observability, compatibility and reachability.

Resolve the exact HEAD, range, intended outcome, and repository guidance from the
Worker Packet. Report an empty or ambiguous scope instead of expanding it silently.
Trace each candidate through entry point, state, side effect, failure and real consumer;
discard it if no plausible trigger and observable impact survive that trace.

Report only evidence-backed defects with a plausible trigger and concrete impact.
Deduplicate by root cause, keep line ranges tight, and propose the smallest complete
repair. Use `axis: engineering_standards` and the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
