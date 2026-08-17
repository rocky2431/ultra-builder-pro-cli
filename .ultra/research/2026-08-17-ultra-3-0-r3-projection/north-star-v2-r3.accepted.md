# Project North Star

> **Authority**: the accepted first-principles steering constitution for this
> repository. Research authors semantic revisions; the owner accepts them. Later
> artifacts reference stable IDs rather than copying this prose.

## Acceptance and Revision

- Schema: `north-star-v2`
- Status: `accepted`
- Revision: `north-star-v2-r3`
- Owner acceptance source: `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md#owner-record`
- Acceptance time: `not-recorded`
- Supersedes: `north-star-v2-r2`

Revision r3 converges the constitution to the owner-directed final design
(`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`, SHA-256
`95e06a08ac9f3001bebaf7f5b2247aa8a5f4f0faba1da96ce86ef0dde582e694`) accepted
through the primary transfer recorded by the grant
`.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`. r3 keeps the
constitutional principles provider-neutral and count-free: agent counts and
topology details, Host and Skill counts, provider names, transport argv, and
exact review-round numbers move to the versioned product contract and to exact
work-package grants. The r2 revision, its decision, snapshot, and research run
remain immutable historical evidence; this revision supersedes their
forward-design authority without rewriting their facts.

## Problem Reality

- Reality: an automatic coding workflow can lose the owner's purpose, run
  review and repair loops without a termination contract, over-mechanize
  semantic judgment into counters and prose locks, leave authorization
  ambiguous across sessions and hosts, and mistake one Host's execution
  capability — agent counts, provider names, transport details — for the
  product's reason to exist. The recorded 25-hour harness-loop incident is the
  strongest evidence of the first failure mode; the r3 design's section 0
  documents the layer error in the prior r3 draft.
- Evidence: `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md` (incident
  causality), the accepted 3.0 design section 12 and r3 design sections 0 and 12
  (incident and layer-error analysis), and the research runs under
  `.ultra/research/2026-08-15-v027-north-star/` and
  `.ultra/research/2026-08-17-ultra-3-0-projection/`.
- Unknowns: multi-host live drills, transfer recovery drills, and transport
  maturity promotions remain delivery evidence; they do not become true merely
  because this direction is accepted.

## First-Principle Propositions

### FP-1 — Durable authority must outlive model context

- Proposition: work that must survive sessions, Hosts, and Agents needs one
  owner-readable, versionable authority outside conversational memory.
- Evidence: `.ultra/project-brief.md`, `docs/ARTIFACT-AUTHORITY.md`, Git history,
  and the accepted recovery boundary restated by the 3.0 and r3 designs as the
  file-first Ultra Core Protocol.
- Causal consequence: canonical files plus Git carry intent, plan, evidence,
  and recovery; handoff, progress, and review artifacts under
  `.ultra/.runtime/` are disposable derived observations that never author
  semantics and are rebuilt from canonical authority when lost.
- Falsifier or revisit trigger: a real continuation or transfer drill cannot
  reconstruct the accepted boundary from canonical files and Git without hidden
  conversational state, or a derived receipt starts operating as authority.
- Status: `accepted`

### FP-2 — Product meaning cannot be reduced to a mechanical signal

- Proposition: goals, causal claims, semantic completeness, trade-offs, and risk
  acceptance require model interpretation inside an owner-authorized frame.
- Evidence: the incident record's causal chain showing mechanical observations
  acquiring route, scope, and completion authority; the 3.0 design's automation
  boundary (facts and effects only).
- Causal consequence: code validates exact structure, identity, permissions,
  effects, evidence, and recovery; the owner and model retain meaning,
  strategy, and topology decisions. No counter, score, digest, regex over
  prose, or fixed count decides product meaning.
- Falsifier or revisit trigger: an externally verifiable invariant is left
  unenforced, or a mechanical check begins accepting or rejecting a
  proposition's truth.
- Status: `accepted`

### FP-3 — Authorization is explicit and mechanically distinguishable

- Proposition: agent execution authority exists only as an explicit owner grant
  — session-local by default, or an exact durable work-package grant — and is
  never inferred from ordinary prose, status, progress, Hook output, or Resume
  notes.
- Evidence: the pending-activation incident and the accepted dual-mode grant
  design (3.0 design sections 5.4 and 16; r3 design section 4).
- Causal consequence: a fresh Agent may rely on a durable grant only after
  stably verifying subject, scope, topology, allowed effects, budget, expiry,
  revocation, and invalidation; changing the canonical writer of a work package
  additionally requires a verified primary transfer; any mismatch stops work
  and returns to the owner.
- Falsifier or revisit trigger: a fresh session can infer permission from
  stored files or receipts, or a denied action has no reachable retry, cancel,
  or abandon path.
- Status: `accepted`

### FP-4 — Review is bounded challenge, not an unbounded loop

- Proposition: independent review improves outcomes only when findings are
  evidence, only owner-designated blocker classes block, and the review chain
  terminates within an owner-visible budget that no Agent, reviewer, Hook, or
  control plane can extend.
- Evidence: the 25-hour loop incident causality; the accepted convergence
  contract (3.0 design section 9) and its r3 refinement (r3 design section 8).
- Causal consequence: initial, delta, and aggregate reviews have separated
  scopes; delta reviews read only the direct parent and unresolved blockers;
  zero findings is never a completion condition; non-blocker findings are
  reported, not auto-repaired; budget exhaustion is a terminal outcome that
  returns the choice to the owner. Exact default budgets are versioned product
  facts; exact work-package budgets are owner grants; neither is
  constitutional.
- Falsifier or revisit trigger: a coherent work package cannot end without
  another round, a budget extends itself, or a finding count, round count, or
  reviewer agreement rate starts operating as a quality verdict.
- Status: `accepted`

### FP-5 — Portability requires shared semantics and native adaptation

- Proposition: one workflow meaning can travel across Hosts only when shared
  Skills stay host-neutral and each adapter absorbs native invocation, Hook,
  permission, and CLI differences honestly, reporting declared, documented,
  verified, supported, or experimental maturity without inflation.
- Evidence: the supported Host surfaces and their differing plugin, Hook, and
  headless execution contracts recorded in `docs/RUNTIME-COMPAT-MATRIX.md`.
- Causal consequence: every supported Host consumes the same workflow meaning
  through its native surface while Doctor and the compatibility matrix report
  activation, readiness, and transport maturity honestly, including real
  limitations. Which Hosts, Skills, and Hooks exist in a release is a versioned
  product fact recorded in runtime assets and the compatibility matrix, never a
  constitutional one.
- Falsifier or revisit trigger: semantic behavior can be preserved only by
  Host-specific forks of a shared Skill, lowest-common-denominator emulation
  blocks a native path, or an adapter claims maturity its transport has not
  earned.
- Status: `accepted`

### FP-6 — Delegation must preserve provenance and least authority

- Proposition: another Agent or CLI acting as a delegated worker is untrusted
  and bounded: its inputs, writes, checks, identity, and returned delta must be
  bound to the exact authorized snapshot, and it never gains new authority.
- Evidence: the delegation contract in `skills/ultra-delegate/` and the
  snapshot, secret-boundary, and no-auto-merge requirements.
- Causal consequence: delegated work returns inspectable deltas from isolated
  worktrees without canonical `.ultra` writes, external effects, or automatic
  merge; a delegation receipt can never upgrade itself into a primary transfer
  or canonical authority.
- Falsifier or revisit trigger: a live drill copies an excluded secret or
  symlink, misses a snapshot race, runs an unapproved check, integrates a stale
  delta silently, or a worker path acquires canonical write authority.
- Status: `accepted`

### FP-7 — Cognitive alignment precedes state synchronization

- Proposition: the primary outcome of Ultra is the owner and the selected Agent
  staying aligned on why, what outcome, what is authorized, what actually
  happened, and what is next — alignment is achieved through short checkpoints
  and one material question at a time, not by synchronizing more documents.
- Evidence: the 3.0 design's alignment protocol and checkpoint semantics
  (sections 4 and 12.4), the r3 design's human–Agent balance (section 10.4),
  and the incident's drift-away-from-purpose failure.
- Causal consequence: every owner-facing checkpoint answers why, outcome,
  accepted boundary, delta, reality, decision needed, next bounded action, and
  not-done; alignment failure stops execution and review before more mechanism
  is added.
- Falsifier or revisit trigger: the owner cannot identify material drift from a
  checkpoint, or the same concept is repeatedly re-explained while execution
  continues.
- Status: `accepted`

### FP-8 — Agent handover is exclusive, verified, and recoverable

- Proposition: continuing a work package on another Agent happens in exactly
  two mutually exclusive ways — an owner-granted primary transfer that moves
  the single canonical writer role, or a delegated worker bound to a bounded
  packet — and never by inference, ambient state, or receipt forgery.
- Evidence: the r3 design's two-handover contract (section 6), the primary
  transfer executed for this work package under
  `.ultra/.runtime/handoffs/ubp3-r3-zcode/`, and the existing delegation
  contract.
- Causal consequence: a primary transfer binds canonical references, hashes,
  HEAD, and worktree digest in a derived OFFER; the receiver stable-reads,
  verifies every digest, and answers with an ACK that is ready only on full
  match; after a ready ACK the receiver is the sole canonical writer, the
  sender stops writing, and execution ends in a frozen terminal RESULT. Any
  source, grant, role, or digest mismatch yields a blocked state that is never
  auto-repaired. Lost receipts are regenerated as a fresh handoff under a new
  identity; an old ACK is never reconstructed.
- Falsifier or revisit trigger: two Agents write canonical files in one work
  package, a sender keeps writing after a ready ACK, a mismatch is silently
  absorbed, or a delegated worker writes canonical `.ultra`.
- Status: `accepted`

## Value Causal Chain

| Chain | First principle | Capability | Observable behavior | Outcome |
|---|---|---|---|---|
| VC-1 | `FP-1` | file-first canonical artifacts | another session, Host, or Agent reconstructs intent, frontier, evidence, and recovery | `NS-02` |
| VC-2 | `FP-2` | model-owned meaning with mechanical facts | no counter, regex, digest, or fixed count decides product meaning | `NS-01` |
| VC-3 | `FP-3` | explicit dual-mode grants and verified transfer activation | permission is never inferred from files or receipts; fresh Agents re-verify or stop | `NS-04` |
| VC-4 | `FP-4` | bounded review convergence under an accepted budget | every work package ends within its owner-visible budget in a terminal outcome | `NS-05` |
| VC-5 | `FP-5` | host-neutral semantics with honest native adapters | the same accepted workflow meaning continues across supported coding-agent Hosts with honest maturity reporting | `NS-02` |
| VC-6 | `FP-6` | digest-bound least-authority delegation | a permitted worker returns an inspectable delta without new authority or automatic merge | `NS-04` |
| VC-7 | `FP-7` | checkpoint-driven alignment | the owner makes informed decisions from short, truthful checkpoints | `NS-01` |
| VC-8 | `FP-7` | truthful reality reporting | the live path contains no undisclosed mock, stub, or dead scaffolding, and every stop reports remaining fakes | `NS-03` |
| VC-9 | `FP-8` | verified exclusive primary transfer | a work package changes its canonical writer only through OFFER, verified ACK, sole-writer execution, and a frozen terminal receipt | `NS-02` |

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
- Horizon: the Ultra Builder Pro 3.0 work packages and their successors.
- Anti-metric: do not optimize document count, summary length, or
  question-answer turn count as evidence of alignment.

### NS-02 — Recoverable, portable continuation

- Outcome: any owner-selected Agent and Host recovers the current work from
  canonical files and Git alone — including across a verified primary transfer
  — without hidden chat memory, Host memory, Goal state, or session identity.
- Observation method: fresh-session, cross-host, and primary-transfer
  continuation drills from canonical files plus Git, with hooks and CLI
  transport disabled.
- Baseline: v0.26 delivered file-first recovery; the authenticated cross-host
  continuation drill of 2026-08-03 and the r3 primary transfer of 2026-08-17
  are recorded evidence (transport identities live in the compatibility
  matrix and eval records, not in this constitution).
- Target or expected change: recovery remains valid with every optional layer
  disabled, and transfer recovery covers stale, revoked, interrupted, missing
  receipts, and refusal.
- Horizon: the Ultra Builder Pro 3.0 work packages and their successors.
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
- Horizon: the Ultra Builder Pro 3.0 work packages and their successors.
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
- Target or expected change: dual-mode grants and verified transfers make
  continuation authority explicit; effect classes remain owner-authorized per
  class.
- Horizon: the Ultra Builder Pro 3.0 work packages and their successors.
- Anti-metric: do not treat apparent caution or reviewer confidence as
  boundary evidence.

### NS-05 — Terminating convergence

- Outcome: every coherent work package ends, within its accepted review
  budget, in an accepted result, an owner decision, an external blocker, a
  budget stop, or an abandonment — never an automatically extended round.
- Observation method: review-chain and terminal-outcome inspection per work
  package.
- Baseline: the 25-hour incident is the recorded counterexample.
- Target or expected change: non-blocker findings are reported without
  automatic repair; review budgets are resource observations owned by the
  versioned product contract or the exact work-package grant, never by the
  reviewer or the Agent under review.
- Horizon: the Ultra Builder Pro 3.0 work packages and their successors.
- Anti-metric: do not optimize for zero findings, all-non-blocker-repaired
  history, or full historical finding replay.

## Hard Constraints

### HC-1 — Preserve semantic portability across supported Hosts

- Protected value or threat: portable workflow meaning; the threat is Host
  divergence, lowest-common-denominator behavior, or maturity inflation.
- Constraint: every Host supported by the current release receives the same
  workflow meaning through host-native plugin or bundle surfaces; the
  supported set and its transport maturity are versioned product facts
  recorded in runtime assets and the compatibility matrix, not in this
  constitution.
- Authority or evidence: accepted Change scope, `FP-5`, and
  `docs/RUNTIME-COMPAT-MATRIX.md`.
- Revisit condition: a supported Host loses a required native path, cannot
  preserve the shared Skill contract, or a transport's claimed maturity is
  contradicted by evidence.

### HC-2 — Keep authorization explicit and inert until activated

- Protected value or threat: owner authority; the threat is stored or inferred
  permission.
- Constraint: public workflows remain owner-invoked; continuation authority
  exists only as a live session-local activation, a verified durable
  work-package grant, or a verified primary transfer. North Star acceptance,
  material scope or risk changes, and external effects always return to the
  owner.
- Authority or evidence: the Mode B and r3 transfer grant records and `FP-3`.
- Revisit condition: the owner explicitly changes the authorization model and
  accepts its recovery and effect boundary.

### HC-3 — Keep semantic authority file-first and provider-neutral

- Protected value or threat: legible and recoverable project truth; the threat
  is hidden state, a duplicate semantic mirror, or a mandatory daemon, MCP
  server, database, Graph engine, or semantic state machine.
- Constraint: project truth remains owner-readable files plus Git; the Ultra
  Core Protocol must remain complete on pure files plus Git with every
  optional layer disabled.
- Authority or evidence: accepted non-goals and `FP-1` through `FP-2`.
- Revisit condition: a reproduced primary-path failure proves files, Git, and
  native Host tools insufficient and the owner accepts a smaller necessary
  mechanism.

### HC-4 — One canonical representation per semantic fact

- Protected value or threat: one current authority per fact; the threat is
  stale caches, reviews, counters, or validators becoming authority.
- Constraint: every canonical artifact has a named writer, consumer, freshness
  rule, and recovery route; generated observations remain disposable,
  deletable, and never author semantics; no prose mirror of another authority.
- Authority or evidence: accepted artifact boundary and `FP-1` through `FP-2`.
- Revisit condition: an artifact's writer, consumer, freshness, or recovery
  contract can no longer be identified.

### HC-5 — Delegation and transfer grant no new authority

- Protected value or threat: source, secret, and integration control; the
  threat is an over-broad worker, an unbound returned delta, or a worker path
  disguising itself as a primary transfer.
- Constraint: delegated instructions, permissions, snapshot inputs, writes,
  checks, receipts, timeout, cancellation, and recovery remain exact and
  inspectable; workers do not write canonical `.ultra`, commit, publish,
  deploy, install, or auto-merge; only an owner-granted, ACK-verified primary
  transfer moves canonical write authority, and the two modes stay mutually
  exclusive.
- Authority or evidence: accepted delegation and transfer boundaries, `FP-6`,
  and `FP-8`.
- Revisit condition: a named provider cannot meet the exact snapshot and
  receipt contract, a narrower native mechanism becomes available, or a live
  drill shows the exclusivity boundary failing.

### HC-6 — Authorize every external effect separately

- Protected value or threat: accountable spend, credentials, supply chain, and
  external state; the threat is capability or readiness being mistaken for
  permission.
- Constraint: commit, push, tag, publication, deployment, real-HOME
  installation, authenticated provider calls, and incremental spend each
  require their applicable current owner authorization; durable grants and
  transfer receipts do not inherit them by default.
- Authority or evidence: accepted execution approval and `FP-3`.
- Revisit condition: an effect is proven reversible, internal, and already
  covered by an exact current grant, or the owner explicitly changes the
  boundary.

### HC-7 — Terminate review within the accepted budget

- Protected value or threat: owner control over convergence; the threat is an
  unbounded review-repair loop or a self-extended budget.
- Constraint: each coherent work package receives a review budget recorded in
  the versioned product contract or its exact owner grant; only the
  owner-designated blocker classes require another round; non-blocker findings
  are reported without automatic repair or a fresh review; budget exhaustion
  with a remaining blocker returns the choice to the owner.
- Authority or evidence: the accepted convergence contract and `FP-4`.
- Revisit condition: the owner explicitly changes the default budget or the
  blocker classes for named work packages.

### HC-8 — Owner-selected topology with verified primary transfer

- Protected value or threat: owner control over execution arrangement; the
  threat is automatic spawning, delegation, orchestration, or writer
  multiplication without a decision.
- Constraint: the owner selects Agents, roles, and topology per stage and work
  package, and may transfer primary writership only through the verified
  transfer protocol; when the owner has not selected otherwise, the current
  Agent continues alone under that product-contract default — no automatic
  spawn, delegation, or control-plane enablement, and provider roles are never
  hard-bound to workflow stages.
- Authority or evidence: the accepted topology and transfer design, `FP-3`, and
  `FP-8`.
- Revisit condition: the owner explicitly selects a different topology or
  completes a new verified transfer for a stage or work package.

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
- No default background orchestration, auto-wake, cross-agent scheduling,
  self-extended review budget, or receipt that becomes authority.
- This constitution records no agent, Host, Skill, Hook, or reviewer counts, no
  provider or product names as constitutional facts, no transport argv, and no
  fixed review-round number; those live in the versioned product contract and
  exact work-package grants.

## Uncertainties and Revisit Triggers

- Revisit `FP-4` when independent adversarial evals show whether native
  isolation or a cross-family probe materially changes defect detection.
- Revisit `FP-5` when a Host changes its plugin, Hook, permission, or headless
  contract, or when an experimental transport's documented support bar is met
  or definitively failed.
- Revisit `FP-8` when a real cross-machine or concurrent-writer requirement
  proves files, Git, and native Host tools insufficient; A2A, Graph, or lease
  mechanisms are separate owner decisions, not completion prerequisites.
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
- Accepted r3 design: `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`
  (owner-directed final design, hash-bound in the r3 grant)
- r3 transfer grant: `.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`
- r3 acceptance decision: `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r3.md`
- Accepted snapshot: `.ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md`
  (immutable historical recovery; `.ultra/north-star.md` remains current
  authority)
- Superseded revision design and grant: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`,
  `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`, decision
  `.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`, research run
  `.ultra/research/2026-08-17-ultra-3-0-projection/`, and the superseded r1 run
  `.ultra/research/2026-08-15-v027-north-star/99-synthesis.md`
- Incident evidence: `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`,
  `docs/V027-LIFECYCLE-CLOSURE.zh-CN.md`
