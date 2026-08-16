# Capability and scope boundary

Use for workflow step `21-features-scope`.

## Objective

Group accepted behavior into coherent capabilities and record what is included,
excluded, deferred, or unresolved.

## Rules

- Preserve the owner's stated product and release posture.
- Never infer an MVP, reduced version, phase label, or omission from implementation
  convenience.
- Trace included capabilities to requirements and observable outcomes.
- Trace each included capability to candidate `FP-*` and `NS-*` IDs, and name every
  candidate `HC-*` it could breach, without copying North Star prose.
- Record dependencies, migrations, compatibility, and operational obligations inside
  the capability that owns them.
- Keep speculative future ideas outside the active scope unless selected.

## Record

Update `product.md` with capability boundaries, included requirements, explicit
exclusions and rationale, dependencies, and unresolved scope decisions.

Complete the step with decision evidence and the updated output path.

## Report trace

In the area report, record `requirement_ids`, `scope_status`, and `rationale`, then link
the capability heading in `product.md`.

## Adversarial challenge

Before the owner checkpoint, challenge whether every included capability causally serves
the working North Star, whether an exclusion breaks that outcome or a hard constraint,
and whether the proposed scope can optimize a proxy while missing delivered value.
