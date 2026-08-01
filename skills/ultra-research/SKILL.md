---
name: ultra-research
description: Turn owner claims and specification gaps into cited product and architecture evidence, then refresh the canonical specifications and research distillate. Use when initialization, brownfield adoption, or an active Change contains claims that must be verified before planning.
---

# Verify claims and fill the specification gaps they control

Research owns evidence and synthesis. The owner chooses material scope and accepts the
three conclusions that change what later research does. Files are written immediately,
so interruption loses no completed investigation.

## Before you start

1. Read `.ultra/tasks.json`; if it names unfinished work, read its `context_file` and
   closing `## Resume Note` before choosing research scope.
2. Read `CONTEXT.md` for vocabulary and relevant `.ultra/decisions/` entries.
3. Read `.ultra/north-star.md`, the active Change intent if any, and specification
   sections carrying `[NEEDS CLARIFICATION]`.

## Definition of done

- Every selected area has a cited report under `.ultra/research/<run-id>/` and its
  mapped specification section reflects the current conclusion.
- `99-synthesis.md` states what entered a specification or decision, and what remains
  unknown or deferred.
- `.ultra/specs/research-distillate.md` records the Git blob hash of each specification
  it summarizes; a hash mismatch makes the distillate stale, never authoritative.
- Material omissions and `[UNVERIFIED: no web access]` findings stay visible.

## Select the coverage once

Scan unresolved specification headings, map them to the seventeen focused references,
and recommend the smallest sufficient profile: Full, Product Only, Feature Only,
Architecture Change, or Custom. Confirm the list once with the owner. Load one reference
at a time; holding several step prompts together defeats progressive disclosure.

The three checkpoints are `04-product-strategy`, `21-features-scope`, and
`99-synthesis`: each conclusion changes what comes next. Present its evidence and
recommendation, wait for the owner's decision, then continue. Other areas write their
report and mapped section immediately without another ceremony.

## Investigate and write

For each selected area:

1. Search current primary sources and inspect relevant source, tests, runtime and docs.
2. Separate Observed, Evidence, Inference and Unknowns; cite every external claim.
3. For solution strategy and building blocks, cite at least one real implementation in
   a comparable maintained project, not only an opinion article.
4. Write `.ultra/research/<run-id>/<area>.md`, then replace the mapped specification
   section rather than appending a second version. Git keeps the history.
5. Follow `../ultra-domain-modeling/SKILL.md` when evidence settles a domain term. Use
   `../ultra-think/SKILL.md` when a consequential trade-off meets the decision criteria.

If web search is unavailable, write `[UNVERIFIED: no web access]` and continue. Lack of
a tool lowers confidence; it does not create a dead end.

## Synthesize

Load `references/99-synthesis.md` after the selected reports are on disk. Write which
claims were confirmed, overturned, deferred, or converted into decisions. Update the
specification balances, then write the distillate and its three source blob hashes.
Read all changed files back and report the exact unresolved headings.

Recommend the next explicit capability from the resulting files; do not invoke it.

## When the owner decides

The owner chooses coverage, resolves the three checkpoints, and accepts any material
deferral. Evidence facts are yours to establish. A conclusion that removes an existing
commitment follows the REDUCTION boundary and waits for explicit authority.

## References

- `references/00-problem-validation.md` through `references/05-assumptions-validation.md`
  — product premise and strategy; load only a selected area.
- `references/10-user-personas.md` through `references/22-success-metrics.md` — users,
  stories, scope and measurable outcomes; load only a selected area.
- `references/30-architecture-context.md` through `references/41-quality-risks.md` —
  system boundary, implementation evidence, deployment and risk.
- `references/99-synthesis.md` — load last, after selected reports exist.
- `../ultra-think/references/autonomy-boundary.md` — read before a specification shrinks.
