# Design lens

Trace changed types and modules through constructors, callers, state, side effects and
consumers. Look for bypassable invariants, ambiguous ownership, leaking boundaries and
coupling that makes an accepted change unsafe.

Treat length, nesting, parameter count and primitive data as investigation signals,
not defects. Report complexity only when it creates a concrete correctness, testing,
recovery or maintenance cost. Prefer a focused before/after repair over a speculative
framework. Use `axis: engineering_standards` and the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
