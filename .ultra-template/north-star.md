# Project North Star

> **Authority**: the owner's literal intent for this project, kept short enough to re-inject every
> session. Every task must trace back here.
>
> **Scope**: only what cannot be derived from `specs/product.md`. Success metrics,
> excluded features, actors and scenarios stay in that file — do not copy them here.

---

## One-line

<!-- ONE sentence, in the owner's own words, describing what they want.
     Captured by ultra-init, or from the owner's first request.
     Do not paraphrase into product-speak: specs/product.md holds the processed version.
     The value of this line is that it is the unprocessed baseline you check the
     processed version against. -->

_(not yet defined — run `ultra-init`, or the first owner request will populate this)_

---

## Hard Constraints

<!-- What must never happen, even when convenient. These are prohibitions, not technical
     constraints — architecture.md holds those. Examples:
     - Never store plaintext passwords
     - Cannot break backwards compatibility with API v1
     - Bundle stays under 500 KB
     - External API cost stays under $X/month -->

_(not yet defined)_

---

## Notes for agents

1. Re-anchor on the One-line — that is the literal owner request. When the spec and this line
   disagree, the spec drifted.
2. Check Hard Constraints before any "improvement". An improvement that violates a constraint is
   a regression.
3. If your current work does not trace back here, **stop and ask**. You may be building the
   wrong thing.

The One-line is injected by `session_context` at SessionStart. `mid_workflow_recall`
re-injects the active task acceptance before relevant tool use. See PHILOSOPHY C1.
