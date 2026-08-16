# Project North Star

> **Authority**: the accepted first-principles steering constitution for this
> repository. Research authors semantic revisions; the owner accepts them. Later
> artifacts reference stable IDs rather than copying this prose.

## Acceptance and Revision

- Schema: `north-star-v2`
- Status: `accepted`
- Revision: `north-star-v2-r2`
- Owner acceptance source: `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md#owner-record`
- Acceptance time: `not-recorded`
- Supersedes: `north-star-v2-r1`

Revision r2 projects the accepted Ultra Builder Pro 3.0 forward design
(`docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`, SHA-256
`a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`) into the
canonical constitution under the Mode B durable work-package grant
(`ubp3-mode-b-2026-08-17`). The r1 revision, its research run, and the v0.27
incident record remain historical evidence; this revision supersedes their
forward-design authority without rewriting their facts.

## Problem Reality

- Reality: an automatic coding workflow can lose the owner's purpose, run
  review and repair loops without a termination contract, over-mechanize
  semantic judgment into counters and prose locks, and leave authorization
  ambiguous across sessions and hosts. The recorded 25-hour harness-loop
  incident is the strongest evidence of this failure mode.
- Evidence: `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md` (incident
  causality), `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md` section 12 (incident
  analysis), and the accepted r1 revision's research run under
  `.ultra/research/2026-08-15-v027-north-star/`.
- Unknowns: 3.0 implementation and multi-host live drills remain delivery
  evidence; they do not become true merely because this direction is accepted.

## First-Principle Propositions

### FP-1 — Durable authority must outlive model context

- Proposition: work that must survive sessions and Hosts needs one owner-readable,
  versionable authority outside conversational memory.
- Evidence: `.ultra/project-brief.md`, `docs/ARTIFACT-AUTHORITY.md`, Git history,
  and the accepted recovery boundary of the r1 revision, restated by the 3.0
  design as the file-first Ultra Core Protocol.
- Causal consequence: canonical files plus Git carry intent, plan, evidence, and
  recovery; runtime observations remain disposable and reconstructable.
- Falsifier or revisit trigger: a real continuation drill cannot reconstruct the
  accepted boundary from canonical files and Git without hidden conversational
  state.
- Status: `accepted`

### FP-2 — Product meaning cannot be reduced to a mechanical signal

- Proposition: goals, causal claims, semantic completeness, trade-offs, and risk
  acceptance require model interpretation inside an owner-authorized frame.
- Evidence: the incident record's causal chain showing mechanical observations
  acquiring route, scope, and completion authority; the 3.0 design's automation
  boundary (facts and effects only).
- Causal consequence: code validates exact structure, identity, permissions,
  effects, evidence, and recovery; the owner and model retain meaning, strategy,
  and topology decisions.
- Falsifier or revisit trigger: an externally verifiable invariant is left
  unenforced, or a mechanical check begins accepting or rejecting a
  proposition's truth.
- Status: `accepted`

### FP-3 — Authorization is explicit and mechanically distinguishable

- Proposition: agent execution authority exists only as an explicit owner grant —
  session-local by default, or an exact durable work-package grant — and is never
  inferred from ordinary prose, status, progress, Hook output, or Resume notes.
- Evidence: the pending-activation incident and the accepted dual-mode grant
  design (3.0 design sections 5.4 and 16).
- Causal consequence: a fresh Agent may rely on a durable grant only after
  stably verifying subject, scope, topology, allowed effects, budget, expiry,
  revocation, and invalidation; any mismatch stops work and returns to the
  owner.
- Falsifier or revisit trigger: a fresh session can infer permission from stored
  files, or a denied action has no reachable retry, cancel, or abandon path.
- Status: `accepted`

### FP-4 — Review is bounded challenge, not an unbounded loop

- Proposition: independent review improves outcomes only when findings are
  evidence, only P0/P1 findings block, and the review chain terminates in at
  most three rounds with an explicit terminal outcome.
- Evidence: the 25-hour loop incident causality; the accepted three-round
  convergence contract (3.0 design section 9).
- Causal consequence: initial, delta, and aggregate reviews have separated
  scopes; delta reviews read only the direct parent and unresolved blockers;
  zero findings is never a completion condition; P2/P3 findings are reported,
  not auto-repaired.
- Falsifier or revisit trigger: a coherent work package cannot end without a
  fourth review round, or a finding count, round count, or reviewer agreement
  rate starts operating as a quality verdict.
- Status: `accepted`

### FP-5 — Portability requires shared semantics and native adaptation

- Proposition: one workflow meaning can travel across Hosts only when shared
  Skills stay host-neutral and each adapter absorbs native invocation, Hook,
  permission, and CLI differences honestly.
- Evidence: the six supported Host surfaces and their different plugin, Hook,
  and headless execution contracts recorded in `docs/RUNTIME-COMPAT-MATRIX.md`.
- Causal consequence: all six Hosts consume the same fourteen-Skill product
  while Doctor reports native activation and readiness honestly, including
  real limitations.
- Falsifier or revisit trigger: semantic behavior can be preserved only by
  Host-specific forks of a shared Skill, or lowest-common-denominator
  emulation blocks a native path.
- Status: `accepted`

### FP-6 — Delegation must preserve provenance and least authority

- Proposition: another CLI is an untrusted bounded worker whose inputs, writes,
  checks, identity, and returned delta must be bound to the exact authorized
  snapshot.
- Evidence: the delegation contract in `skills/ultra-delegate/` and the
  snapshot, secret-boundary, and no-auto-merge requirements.
- Causal consequence: delegated work returns inspectable deltas without new
  authority, canonical `.ultra` writes, or automatic merge.
- Falsifier or revisit trigger: a live drill copies an excluded secret or
  symlink, misses a snapshot race, runs an unapproved check, or integrates a
  stale delta silently.
- Status: `accepted`

### FP-7 — Cognitive alignment precedes state synchronization

- Proposition: the primary outcome of Ultra is the owner and the selected Agent
  staying aligned on why, what outcome, what is authorized, what actually
  happened, and what is next — alignment is achieved through short checkpoints
  and one material question at a time, not by synchronizing more documents.
- Evidence: the 3.0 design's alignment protocol and checkpoint semantics
  (sections 4 and 12.4), and the incident's drift-away-from-purpose failure.
- Causal consequence: every owner-facing checkpoint answers why, outcome,
  accepted boundary, delta, reality, decision needed, next bounded action, and
  not-done; alignment failure stops execution and review before more mechanism
  is added.
- Falsifier or revisit trigger: the owner cannot identify material drift from a
  checkpoint, or the same concept is repeatedly re-explained while execution
  continues.
- Status: `accepted`

## Value Causal Chain

| Chain | First principle | Capability | Observable behavior | Outcome |
|---|---|---|---|---|
| VC-1 | `FP-1` | file-first canonical artifacts | another session or Host reconstructs intent, frontier, evidence, and recovery | `NS-02` |
| VC-2 | `FP-2` | model-owned meaning with mechanical facts | no counter, regex, digest, or fixed count decides product meaning | `NS-01` |
| VC-3 | `FP-3` | explicit dual-mode grants | permission is never inferred from files; fresh Agents re-verify or stop | `NS-04` |
| VC-4 | `FP-4` | bounded review convergence | every work package ends within three review rounds in a terminal outcome | `NS-05` |
| VC-5 | `FP-5` | six native adapters | the same accepted workflow continues across six coding CLI hosts with honest limitations | `NS-02` |
| VC-6 | `FP-6` | digest-bound delegation | a permitted CLI returns an inspectable delta without new authority or automatic merge | `NS-04` |
| VC-7 | `FP-7` | checkpoint-driven alignment | the owner makes informed decisions from short, truthful checkpoints | `NS-01` |
| VC-8 | `FP-7` | truthful reality reporting | the live path contains no undisclosed mock, stub, or dead scaffolding, and every stop reports remaining fakes | `NS-03` |

## North Star Outcomes

### NS-01 — Owner–Agent cognitive alignment

- Outcome: the owner can accurately understand the current goal, accepted
  boundary, real progress, risks, unfinished items, and the next decision that
  needs them, and can identify material drift from a concise checkpoint.
- Observation method: owner judgment against checkpoint records; the owner can
  state what is real, what is fake, and what is next without reading logs.
- Baseline: v0.26/v0.27 workflows produced large, partially stale document sets
  whose relationship to live authority was not always clear.
- Target or expected change: checkpoints carry the eight fixed semantics (why,
  outcome, boundary, delta, reality, decision needed, next action, not-done)
  and alignment failure stops work.
- Horizon: the Ultra Builder Pro 3.0 work package and its successors.
- Anti-metric: do not optimize document count, summary length, or
  question-answer turn count as evidence of alignment.

### NS-02 — Recoverable, portable continuation

- Outcome: any owner-selected Agent and Host recovers the current work from
  canonical files and Git alone, without hidden chat memory, on all six
  supported Hosts.
- Observation method: fresh-session and cross-host continuation drills from
  canonical files plus Git.
- Baseline: v0.26 delivered file-first recovery; the authenticated
  Claude-to-Codex drill of 2026-08-03 is recorded evidence.
- Target or expected change: recovery remains valid with hooks and CLI
  disabled, and honest Host limitation reporting on every surface.
- Horizon: the Ultra Builder Pro 3.0 work package and its successors.
- Anti-metric: do not optimize snapshot count, digest count, or green recovery
  scripts while real continuation fails.

### NS-03 — Real, truthful delivery

- Outcome: an authorized Agent completes real narrow vertical slices of
  software whose live path contains no undisclosed mock, stub, fake interface,
  or dead integration scaffolding.
- Observation method: real consumers, end-to-end execution, runtime
  observation, and owner acceptance, each typed as such.
- Baseline: the incident record shows partial-green and self-referential
  evidence masking live-path gaps.
- Target or expected change: every remaining fake, limitation, and not-done
  item is reported explicitly at each stop.
- Horizon: the Ultra Builder Pro 3.0 work package and its successors.
- Anti-metric: do not optimize unit-test count, lines changed, or task
  completion percentage as delivery truth.

### NS-04 — Bounded, recoverable effects

- Outcome: every write, external effect, permission, cost, and failure stays
  inside an owner-visible boundary with typed diagnostics and reachable
  repair, retry, cancel, or abandon paths.
- Observation method: exact authority and effect evidence; external and
  irreversible effects verified as separately authorized.
- Baseline: v0.26/v0.27 effect classes were already separated; incidents
  showed activation ambiguity rather than effect overflow.
- Target or expected change: dual-mode grants make continuation authority
  explicit; effect classes remain owner-authorized per class.
- Horizon: the Ultra Builder Pro 3.0 work package and its successors.
- Anti-metric: do not treat apparent caution or reviewer confidence as
  boundary evidence.

### NS-05 — Terminating convergence

- Outcome: every coherent work package ends, within at most three review
  rounds, in an accepted result, an owner decision, an external blocker, a
  budget stop, or an abandonment — never an automatic fourth round.
- Observation method: review-chain and terminal-outcome inspection per work
  package.
- Baseline: the 25-hour incident is the recorded counterexample.
- Target or expected change: P2/P3 findings are reported without automatic
  repair; review budgets are resource observations, not quality verdicts.
- Horizon: the Ultra Builder Pro 3.0 work package and its successors.
- Anti-metric: do not optimize for zero findings, all-P2-repaired history, or
  full historical finding replay.

## Hard Constraints

### HC-1 — Preserve six-Host semantic portability

- Protected value or threat: portable workflow meaning; the threat is Host
  divergence or lowest-common-denominator behavior.
- Constraint: Claude Code, Codex, OpenCode, Kimi Code, Grok Build, and ZCode
  receive the same fourteen-Skill product through host-native plugin or bundle
  surfaces.
- Authority or evidence: accepted Change scope and `FP-5`.
- Revisit condition: a supported Host loses a required native path or cannot
  preserve the shared Skill contract.

### HC-2 — Keep authorization explicit and inert until activated

- Protected value or threat: owner authority; the threat is stored or inferred
  permission.
- Constraint: public workflows remain owner-invoked; continuation authority
  exists only as a live session-local activation or a verified durable
  work-package grant. North Star acceptance, material scope or risk changes,
  and external effects always return to the owner.
- Authority or evidence: the Mode B grant record and `FP-3`.
- Revisit condition: the owner explicitly changes the authorization model and
  accepts its recovery and effect boundary.

### HC-3 — Keep semantic authority file-first and provider-neutral

- Protected value or threat: legible and recoverable project truth; the threat
  is hidden state, a duplicate semantic mirror, or a mandatory daemon, MCP
  server, database, Graph engine, or semantic state machine.
- Constraint: project truth remains owner-readable files plus Git; the Ultra
  Core Protocol must remain complete on pure files plus Git with every optional
  layer disabled.
- Authority or evidence: accepted non-goals and `FP-1` through `FP-2`.
- Revisit condition: a reproduced primary-path failure proves files, Git, and
  native Host tools insufficient and the owner accepts a smaller necessary
  mechanism.

### HC-4 — One canonical representation per semantic fact

- Protected value or threat: one current authority per fact; the threat is
  stale caches, reviews, counters, or validators becoming authority.
- Constraint: every canonical artifact has a named writer, consumer, freshness
  rule, and recovery route; generated observations remain disposable, deletable,
  and never author semantics; no prose mirror of another authority.
- Authority or evidence: accepted artifact boundary and `FP-1` through `FP-2`.
- Revisit condition: an artifact's writer, consumer, freshness, or recovery
  contract can no longer be identified.

### HC-5 — Delegation grants no new authority

- Protected value or threat: source, secret, and integration control; the
  threat is an over-broad worker or an unbound returned delta.
- Constraint: delegated instructions, permissions, snapshot inputs, writes,
  checks, receipts, timeout, cancellation, and recovery remain exact and
  inspectable; workers do not write canonical `.ultra`, commit, publish,
  deploy, install, or auto-merge.
- Authority or evidence: accepted delegation boundary and `FP-6`.
- Revisit condition: a named provider cannot meet the exact snapshot and
  receipt contract, or a narrower native mechanism becomes available.

### HC-6 — Authorize every external effect separately

- Protected value or threat: accountable spend, credentials, supply chain, and
  external state; the threat is capability or readiness being mistaken for
  permission.
- Constraint: commit, push, tag, publication, deployment, real-HOME
  installation, authenticated provider calls, and incremental spend each
  require their applicable current owner authorization; durable grants do not
  inherit them by default.
- Authority or evidence: accepted execution approval and `FP-3`.
- Revisit condition: an effect is proven reversible, internal, and already
  covered by an exact current grant, or the owner explicitly changes the
  boundary.

### HC-7 — Terminate review within three rounds

- Protected value or threat: owner control over convergence; the threat is an
  unbounded review-repair loop.
- Constraint: one coherent work package receives at most one initial review
  plus two P0/P1 delta reviews; only P0/P1 findings block; P2/P3 findings are
  reported to the owner without automatic repair or a fresh review; a third
  round with a remaining blocker returns the choice to the owner.
- Authority or evidence: the accepted convergence contract and `FP-4`.
- Revisit condition: the owner explicitly changes the review budget for a named
  work package.

### HC-8 — Owner-selected topology, single-Agent default

- Protected value or threat: owner control over execution topology; the threat
  is automatic spawning, delegation, or orchestration without a decision.
- Constraint: the owner selects single- or multi-Agent topology and providers
  per stage; when unspecified, the current Agent continues alone with no
  automatic spawn, delegation, or control-plane enablement; provider roles are
  never hard-bound to workflow stages.
- Authority or evidence: the accepted topology design and `FP-3`.
- Revisit condition: the owner explicitly selects a different topology for a
  stage or work package.

## Explicit Exclusions

- No Ultra-owned general conversation memory, code graph, deployment provider,
  framework guidance, persistent stage marker, workflow daemon, or new continue
  command.
- No mandatory daemon, database, MCP server, Graph engine, hidden executor, or
  semantic state machine; optional coordination layers own observations and
  effects only, never product meaning or acceptance.
- No mechanical truth, strategy, quality, finding-disposition, or
  risk-acceptance verdict; no fixed finding, lens, task, or question counts as
  completeness.
- No automatic merge of delegated work, silent activation inheritance, or
  shared Skill fork whose only purpose is one Host's syntax.
- No default background orchestration, auto-wake, or cross-agent scheduling
  without an explicit owner decision.

## Uncertainties and Revisit Triggers

- Revisit `FP-4` when independent adversarial evals show whether native
  isolation or a cross-family probe materially changes defect detection.
- Revisit `FP-5` when a Host changes its plugin, Hook, permission, or headless
  contract.
- Revisit `FP-7` when checkpoints demonstrably fail to surface material drift
  in real work packages.
- Return to Research when live evidence contradicts a causal chain, an
  anti-metric becomes the operational target, or the owner changes the desired
  outcome or protected value.
- Treat any accepted North Star replacement as a new revision: preserve old
  evidence, mark dependent Change traces stale, reconcile them explicitly, and
  never infer that the replacement approves execution.

## Research Trace

- Project Brief: `.ultra/project-brief.md`
- Accepted forward design: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`
- Owner grant: `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`
- Superseded revision research: `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md`
- Accepted snapshot: `.ultra/research/2026-08-17-ultra-3-0-projection/north-star-v2-r2.accepted.md`
  (immutable historical recovery; `.ultra/north-star.md` remains current authority)
- Incident evidence: `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`,
  `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
