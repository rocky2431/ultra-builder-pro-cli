---
name: ultra-research
description: Turn a raw Project Brief or scoped evidence gap into an accepted North Star, domain language, cited product and architecture specifications, and a hash-bound synthesis. Use after initialization, for brownfield baselining, or inside an active Change whose consequential claims are not yet evidenced.
---

# Mature a project outline into an evidence-backed baseline

Research is the first semantic writer of North Star v2 and owns the first accepted
baseline plus later evidence-backed corrections. Web
search is one evidence source, not the workflow: repository files, Git, tests, runtime,
maintained documentation, owner decisions, and current primary sources all count.

## Before you start

1. If model-selected, verify the live execution grant in `../ultra-change/references/execution-grant.md` — a current session-local activation or a stably verified durable work-package grant; without either, stop.
2. Resolve at most one active `change_id`, then read `.ultra/tasks.json` plus the
   `context_file` and `## Resume Note` of unfinished tasks whose `change_id` matches it,
   if any. Archived or abandoned unfinished rows are history, not the current frontier.
3. Read `.ultra/project-brief.md`. For a legacy project without it, treat the exact
   `.ultra/north-star.md` `## One-line` as raw intake until a brief is preserved.
4. Read existing `.ultra/north-star.md`, specifications, `CONTEXT.md`, relevant
   `.ultra/decisions/`, active Change intent, evidence, Git state, and maintained docs.
   Run `node <ultra-research-skill-dir>/scripts/validate_north_star.cjs
   .ultra/north-star.md`; this entry captures one bounded regular non-symlink snapshot
   and returns a typed repair diagnostic instead of following, blocking on, or validating
   a changing path. Treat `unresearched` as an empty destination and `legacy_unadopted`
   as preserved intake for explicit adoption, not accepted v2 truth.

## Definition of done

- Every selected lens has a cited `.ultra/research/<run-id>/<area>.md` report and its
  canonical specification section contains the current conclusion and North Star relation.
- The accepted North Star, shared vocabulary, product baseline, and architecture
  baseline are sufficient for the current planning boundary; unknowns stay explicit.
- The North Star follows `references/north-star-v2.md`; all `FP-*`, `NS-*`, and `HC-*`
  definitions and references pass the structural validator without making that result
  a semantic verdict.
- `99-synthesis.md` names what was promoted, overturned, deferred, or left blocking.
- `.ultra/specs/research-distillate.md` stores the Git blob hash of each specification
  it summarizes. A mismatch makes the distillate stale, never authoritative.

## Find the path before collecting evidence

When coverage spans several lenses or the path itself is unclear, read
`references/wayfinding.md` and write `.ultra/research/<run-id>/brief.md`. Skip that file
for one already-bounded evidence question. Wayfinding selects the smallest useful
coverage; it does not create workflow state or another semantic authority.

Map the brief and unresolved specification sections to seventeen focused evidence
lenses. Confirm the proposed coverage once with the owner. Load one reference
at a time; the parent holds the question map, not every step prompt.

The first six lenses have real semantic dependencies:

- `00-problem-validation` runs before `01-opportunity-discovery` because an opportunity must trace to a problem.
- `02-market-assessment` and `03-alternatives` are conditional lenses and may run in parallel once the boundary is known.
- `04-product-strategy` is the first owner checkpoint and consumes the relevant conclusions from `00` through `03`.
- `05-assumptions-validation` extracts load-bearing assumptions from `00` through `04` after the strategy decision.

The later groups turn that premise into product behavior (`10` through `22`), then an
architecture and operating baseline (`30` through `41`). The three owner checkpoints
remain `04-product-strategy`, `21-features-scope`, and `99-synthesis`.
At each checkpoint, use `../ultra-think/SKILL.md` for an adversarial challenge of the
working candidate before asking the owner to accept direction, scope, or synthesis.

Only areas with satisfied inputs may fan out through native bounded subagents. Never
parallelize a lens whose question depends on an unresolved earlier conclusion.

## Investigate, ask, and decide

For each selected lens:

1. Inspect reachable facts before asking. Search current primary sources when a claim
   depends on current external reality.
2. Separate Observed, Verified, Decided, Inference, and Unknown; cite external claims.
   Record `north_star_effect: supports | refines | contradicts | independent` and
   `north_star_claim: <the evidenced causal relation>` in the area report.
3. Follow `../ultra-grilling/SKILL.md` when a required owner field is missing. The lens
   supplies what to ask; Grilling supplies the one-question interaction loop.
4. Follow `../ultra-think/SKILL.md` for one consequential trade-off, not for mapping the
   whole research frontier.
5. Follow `../ultra-domain-modeling/SKILL.md` when evidence settles a shared term. The
   first such term creates `CONTEXT.md`; later calls sharpen it.
6. Write the area report, then replace the mapped specification section instead of
   appending a second version. Git retains history.

For scoped Research inside an active Change, answer only its recorded `Research
Disposition` question and produce the named exit evidence. Research writes reports and
the mapped canonical baseline sections; it does not silently rewrite Change acceptance.
Return the evidence paths so `ultra-change` can reconcile the accepted intent before
planning when that contract must change.

If web access is unavailable, record `[UNVERIFIED: no web access]` and continue with
other evidence. Missing tooling lowers confidence; it does not manufacture a blocker.

## Synthesize the accepted baseline

`04-product-strategy` proposes problem reality and falsifiable first-principle
propositions. `22-success-metrics` determines whether a
single North Star metric is justified or whether an observable outcome plus guardrails
is more honest. Follow `references/north-star-v2.md`: validate a mutable candidate while
the last accepted revision remains current, show the owner the semantic delta and
unresolved contradictions, and preserve one stable `.ultra/decisions/<id>.md` acceptance
record with the owner's exact words, conversation scope, the model's responsibility for
final wording, and no invented timestamp or inheritance by a future revision. Only after
the owner accepts the candidate, atomically replace `.ultra/north-star.md`, then update the three
specifications, domain language, qualifying decisions, and distillate for the first
baseline. A scoped Research run updates only its mapped specification sections and then
refreshes the distillate's three source hashes.

When an accepted revision supersedes another, preserve prior evidence and report every
active Change whose recorded revision or digest differs as a stale observation requiring
Change reconciliation. Supersession never deletes evidence, rewrites a Change silently,
or grants execution.

Load `references/99-synthesis.md` only after selected reports exist. Read every promoted
file back, verify trace anchors and source hashes, and report exact unresolved gaps.
Recommend the next explicit public workflow from the resulting files; do not invoke it.

## When the owner decides

The owner chooses coverage, resolves the three checkpoints, accepts a North Star and
material deferrals, and authorizes any REDUCTION. The model establishes evidence facts,
selects methods, and updates accepted files inside that frame.

## References

- `references/wayfinding.md` — read only for multi-lens or unclear research paths.
- `references/00-problem-validation.md` through `references/05-assumptions-validation.md`
  — product premise and strategy; load only a selected lens.
- `references/10-user-personas.md` through `references/22-success-metrics.md` — actors,
  behavior, scope, and measurements.
- `references/30-architecture-context.md` through `references/41-quality-risks.md` —
  system boundary, implementation evidence, operations, and risk.
- `references/99-synthesis.md` — load last, after selected reports exist.
- `references/north-star-v2.md` — exact semantic structure, adoption, validation, and
  supersession contract.
- `../ultra-change/references/execution-grant.md` — read only for grant-activated continuation.
- `../ultra-think/references/autonomy-boundary.md` — read before reducing authority.
