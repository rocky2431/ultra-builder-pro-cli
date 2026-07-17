# Design boundary evidence

Read this reference only when the diff changes ownership, invariants, public contracts,
module boundaries, or a recurring variation point.

## Questions grounded in the live path

- Which module owns the invariant and can callers bypass it?
- Does one authoritative representation exist, or can state diverge across layers?
- Is the dependency direction compatible with the repository's established boundary?
- Does a public contract expose implementation details that block a required consumer?
- Does the change duplicate a domain rule or scatter one accepted change across
  unrelated owners?
- Is an abstraction justified by current callers and variants, or only hypothetical
  future work?
- Can the behavior be tested and recovered at its public seam?

File size, method length, inheritance, primitive values, data-only types, and branch
counts are investigation signals. Report them only when they produce a concrete
correctness, compatibility, testing, recovery, or maintenance cost in this change.

## Remediation

Prefer the smallest boundary correction that restores ownership and the accepted
contract. Do not prescribe a design pattern, framework, or broad rewrite without
showing why the existing repository structure cannot satisfy the requirement.
