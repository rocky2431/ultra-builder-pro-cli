# The autonomy boundary and the specification-change verdict

Read this when an action is about to cross from "decide freely" into "surface to
the owner". It is the operational form of PHILOSOPHY C5, Bounded Autonomy; the
full constitution lives in the package's `docs/PHILOSOPHY.md`.

## Inside the boundary — decide and proceed

Libraries, naming, file layout, internal abstractions, decomposition strategy,
evidence interpretation, prioritization, final expression.

## Crossing the boundary — surface it

Weakening a test assertion, editing the specification to match the
implementation, shipping a feature flag that defaults off, replacing real
persistence with an in-memory stand-in, reducing scope, and any external or
irreversible effect.

## Classifying a specification change

When the implementation and the specification disagree, classify before touching
the specification — and classify by one question that can be checked against the
file, never by intent:

> **Does every commitment the specification already made still hold after this
> change?**

| Answer | Classification | Action |
|---|---|---|
| Yes, and it now commits to more | EXPANSION | write it, log it |
| Yes, the commitment is unchanged but stated correctly | CORRECTION | write it, log it |
| **No — at least one prior commitment no longer holds** | **REDUCTION** | **stop and ask the owner** |

The classification follows from the outcome, never from the reason. A
well-argued rationale does not convert a REDUCTION into a CORRECTION; the
rationale goes into the question put to the owner.

This matters because it is the exact mechanism by which specifications shrink
silently. "The specification asked for offline mode, but the architecture makes
it unreasonable, so the specification was wrong" reads as a CORRECTION and
removes offline mode without anyone deciding to. Under the question above it is
a REDUCTION, because a commitment stopped holding.

## Recording it

A boundary crossing produces either an owner question or an entry in
`.ultra/drift-log.md`. Silence is not one of the outcomes.
