# Specification lens

Keep this axis independent from general engineering quality. Map every accepted
criterion to current executable or source evidence. Check for omitted behavior,
unintended scope, stale specification or operational documentation, and incompatible
public contracts.

Read the packet's `North Star Trace`. Verify that its ids and recorded revision resolve,
then challenge whether the Change's claimed causal contribution has supporting evidence
and survives the diff. A stale revision is a freshness limitation, not automatic proof
of semantic misalignment.

Report only a concrete mismatch between accepted intent and delivered behavior. Style,
generic maintainability and a preferred architecture do not belong on this axis.
Calibrate severity to user-visible or delivery impact. Use `axis: spec_fidelity` and
the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
