---
name: ultra-research
description: Turn a raw Project Brief or scoped evidence gap into an accepted North Star, domain language, cited product and architecture specifications, and a hash-bound synthesis. Use after initialization, for brownfield baselining, or inside an active Change whose consequential claims are not yet evidenced.
---

# Mature a project outline into an evidence-backed baseline

Research is the first semantic writer of North Star v2 and owns the first accepted
baseline plus later evidence-backed corrections. Web
search is one evidence source, not the workflow: repository files, Git, tests, runtime,
maintained documentation, owner decisions, and current primary sources all count.

## Route modes

| Mode | Entry | Observable exit | Next |
|---|---|---|---|
| `baseline` | Explicit owner invocation with a usable Project Brief and no accepted baseline for the boundary | Selected reports, synthesis, specifications, vocabulary, and accepted North Star are read back; unknowns and omissions remain explicit | Recommend `ultra-change` in `intake` mode for the next bounded request |
| `change-scoped` | Explicit invocation or a valid Execution Grant for one active Change's recorded Research Disposition | The named exit evidence exists and the selected canonical sections are refreshed without changing Change acceptance | Return to the same `ultra-change` in `reconcile` mode |

Follow `../ultra-status/references/route-contract.md`. At entry, name the mode, entry
question, selected coverage, observable stop condition, and return route. Refresh the
Route Card at each material checkpoint, pause, and exit; lens counts are navigation, not
proof that Research is semantically complete.

Expose the question frontier at entry and keep it current: the one question this run
exists to answer, the known facts already on record with their sources, the owner
decisions that block the exit, the unknowns that are safely deferrable, and the useful
exit — the caller action unlocked the moment the stop condition is met. An owner-stated
fact is reusable as-is; acceptance of a candidate this run composes is a separate open
decision until the owner accepts that displayed candidate. Reuse the run brief
(multi-lens runs) or the Change's recorded Research Disposition (change-scoped runs) as
the carrier; create no second registry, and reuse answered content instead of re-asking
it.

## Before you start

1. Resolve `baseline` or `change-scoped` from the artifacts and invocation. A
   model-selected run is valid only for `change-scoped` mode under the live execution
   grant in `../ultra-change/references/execution-grant.md` — a current session-local
   activation or a stably verified durable work-package grant covering the same Change;
   without it, stop and recommend explicit invocation. Baseline adoption is always an
   explicit-entry mode.
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

The derived brief records the entry question, selected lenses, deliberate omissions,
dependencies, source plan, material checkpoints, observable stop condition, and return
route. Read it on a fresh session instead of restarting completed evidence collection.

Map the brief and unresolved specification sections to seventeen focused evidence
lenses. Show the proposed coverage once. Pause only when it expands an accepted boundary
or creates another material checkpoint; a covering Change Research Disposition does not
need a duplicate confirmation. Load one reference at a time; the parent holds the
question map, not every step prompt.

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
3. Follow `../ultra-grilling/SKILL.md` only for decisions the current exit depends on.
   Ask when a blocking owner decision prevents the named exit evidence, reuse an answer
   the owner already gave explicitly, and record a non-blocking unknown as explicitly
   deferred instead of asking it. Technical facts and method choices inside the
   accepted scope are yours to establish; only owner-owned decisions are questions.
   Once the blocking decisions resolve, head for the exit rather than broadening.
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
planning when that contract must change. The scoped run's return route is always the
same stable Change, even when the evidence supports the original intent unchanged.

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
baseline. That acceptance is the owner responding to the displayed candidate —
plain-language acceptance, a revision, or a rejection; an acceptance on record for the
same unchanged candidate is reused, never re-approved. The Project Brief, a request to
build, permission to run this workflow, an unavailable question channel, and your own
conclusion that the candidate traces to the owner's words are not acceptance of the
candidate you composed: while it is missing, keep the draft beside the last genuinely
accepted revision and surface the open acceptance decision once in plain language
instead of publishing an acceptance record. A scoped Research run updates only its mapped specification sections and then
refreshes the distillate's three source hashes.

When an accepted revision supersedes another, preserve prior evidence and report every
active Change whose recorded revision or digest differs as a stale observation requiring
Change reconciliation. Supersession never deletes evidence, rewrites a Change silently,
or grants execution.

Load `references/99-synthesis.md` only after selected reports exist. Read every promoted
file back, verify trace anchors and source hashes, and report exact unresolved gaps.
For `baseline`, recommend `ultra-change/intake`; for `change-scoped`, return the named
evidence to `ultra-change/reconcile`. Invoke neither unless the latter continuation is
covered by the same valid Execution Grant; when it is covered, show the transition Route
Card first and let Change re-verify its own mode and grant.

## When the owner decides

The owner chooses coverage, resolves the three checkpoints, accepts a North Star and
material deferrals, and authorizes any REDUCTION. The model establishes evidence facts,
selects methods, and updates accepted files inside that frame.

A missing North Star acceptance does not suspend authorized work: implementation and
verification inside the current boundary proceed, and the missing acceptance is
reported as the open workflow closeout it is — distinct from real product progress,
never a completion claim, and never a blanket stop. A revised or rejected candidate
starts from its own acceptance; it never inherits the earlier candidate's.

Technical methods and defaults you select inside the authorized scope — storage
layout, matching rules, local-first execution — stay model-owned choices recorded as
such: never promote one into an owner-accepted hard constraint, and never turn a
trivial implementation choice into a new acceptance gate.

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
- `../ultra-status/references/route-contract.md` — owner-visible route, checkpoint, and recovery output.
- `../ultra-think/references/autonomy-boundary.md` — read before reducing authority.
