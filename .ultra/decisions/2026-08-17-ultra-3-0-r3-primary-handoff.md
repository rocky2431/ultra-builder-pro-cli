# Decision: Ultra Builder Pro 3.0 r3 primary-transfer durable work-package grant

> **Status**: accepted / active for local implementation
> **Grant ID**: `ubp3-r3-zcode-2026-08-17`
> **Date**: `2026-08-17`
> **Repository**: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`
> **Base HEAD**: `9a759003aa77d1a88e1275d70d2c887ee05da993`

## 1. Owner record

Owner direction, preserved verbatim in the records that carry it:

- Session directive to ZCode (2026-08-17, opening sentence): 「You are the sole
  implementation writer for the complete Ultra Builder Pro 3.0 r3 work package in
  this repository.」
- Owner direction as recorded by the sender in the transfer offer
  (`.ultra/.runtime/handoffs/ubp3-r3-zcode/OFFER.json`): 「Implement the complete
  Ultra Builder Pro 3.0 upgrade from the accepted r3 North Star. ZCode performs
  every implementation and coding change. Codex performs read-only review and
  returns blocker findings to the same ZCode task.」
- Accepted design, section 11: 「Owner 已授权：先由 Codex 写清本文件，然后由
  ZCode 完成所有 implementation，Codex 只读验收。」

These records accept, together:

1. the r3 North Star direction in
   `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` as the owner-directed final
   design for this projection;
2. an explicit primary transfer from Codex (design author, now read-only
   reviewer) to ZCode Desktop (sole implementation writer) for this work package,
   executed through the OFFER → ACK protocol over canonical files and Git;
3. the section 11 work-package boundary, including its twelve numbered
   requirements and its prohibition on scope growth into A2A, Graph, Multi-Agent,
   or Goal orchestration.

## 2. Accepted design binding

- Accepted r3 design authority: `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`
- Accepted SHA-256: `95e06a08ac9f3001bebaf7f5b2247aa8a5f4f0faba1da96ce86ef0dde582e694`
- Primary-transfer receipts: `.ultra/.runtime/handoffs/ubp3-r3-zcode/OFFER.json`
  and `ACK.json` (derived, reconstructable observations; never semantic authority)
- Work-package identity: `v30-north-star-r3-primary-handoff`
- Historical Mode B grant `ubp3-mode-b-2026-08-17`
  (`.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md`) remains the
  authority record for the completed Mode B task; this grant supersedes it for
  forward r3 work only and does not rewrite its facts.

Any change to the accepted r3 design bytes requires an explicit owner
reconciliation and a new binding. Implementation bytes, tests, evidence, and the
WIP checkpoint changing inside the accepted design do not by themselves
invalidate this grant.

## 3. Exact work package

### Outcome

Implement the accepted r3 work package
(`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` section 11) as one coherent
local work package: publish the r3 canonical North Star revision with its decision
and immutable snapshot; record this grant and a fresh task identity without
reopening the completed Mode B task; synchronize the genuinely affected specs,
public docs, Skills, Hooks, Adapters, CLI, and tests; move topology, provider
names, and exact review counts out of the constitutional North Star; add the
primary-transfer contract with a minimal live consumer while keeping
`ultra-delegate` a least-authority bounded worker that can never write canonical
`.ultra`; mark the ZCode app-bundled CLI/protocol experimental; add
behavior/permission/effect/recovery regressions; run the recovery drills, the
real ZCode primary readback, and the verification chain; and freeze the exact
changed paths, commands, evidence, fakes, limitations, not-done, and
external-effect report.

### Allowed writer and topology

- Sole repository implementation writer: **ZCode Desktop** (interactive session;
  app-bundled CLI 0.16.3 is a verified-local experimental surface, not a support
  commitment).
- Codex is the design author and becomes the read-only reviewer after the
  implementation freezes; it does not write product or canonical files.
- ZCode must not spawn, delegate to, or schedule another implementation Agent,
  and must not use ZCode Goal, automatic review scheduling, or unbounded
  review/fix loops. A topology change returns to the owner.

### Allowed local effects

- create, edit, and delete repository files required by the accepted r3 work
  package, including canonical `.ultra` authority, specs, public docs, Skills,
  Hooks, Adapters, CLI scripts, tests, and package metadata;
- write the derived ACK and RESULT receipts under
  `.ultra/.runtime/handoffs/ubp3-r3-zcode/`;
- run local tests, validators, package dry-runs, and isolated temporary
  HOME/config install and Doctor probes;
- run bounded worker drills against already-installed local CLIs inside
  temporary isolated worktrees, within the existing ZCode entitlement;
- replace (not append to) the single owner-facing WIP checkpoint.

### Effects not authorized

- commit, push, force-push, tag, npm publish, GitHub Release, deployment, or
  production mutation;
- installation into a real user HOME or global Host configuration outside an
  isolated temporary verification directory;
- credential, secret, PII, billing, or external-account changes;
- new paid plan, top-up, purchase, or provider spend beyond the already
  available entitlement;
- A2A, Graph, LoopX, MCP server, daemon, database, queue, registry, workflow
  engine, Goal orchestration, or any additional Agent;
- using the changing local `ultra-review` to approve this package; review is the
  owner-designated read-only reviewer's job.

## 4. Durability, budget, and invalidation

- This is an exact durable work-package grant. It survives ZCode session/Host
  handoff after stable verification of this file, the accepted design binding,
  the repository identity and base HEAD, the transfer receipts, and the current
  work-package status.
- Review budget (owner override for this package, from accepted design section
  8): at most ten total review rounds targeting completion within five; only
  blockers that violate the accepted North Star, primary path correctness, the
  authority/effect boundary, data safety, recovery, or explicit acceptance
  require another round; P2/P3 observations never auto-extend the budget; after
  three materially different failed fixes of the same root cause, stop point
  patching and report the architecture boundary; there is no automatic eleventh
  round.
- The grant expires on reviewer acceptance, owner revocation, or a terminal
  outcome below. It is not a scheduler, wake-up service, or license to extend
  itself.

This grant becomes invalid and ZCode must stop for owner direction when:

1. the accepted design identity no longer matches and no newer owner acceptance
   exists;
2. outcome, scope, material risk, topology, cost, or effect boundary must change;
3. an external or irreversible effect is required;
4. the subject, the frozen inputs, or the transfer receipts cannot be verified
   safely;
5. three materially different failed fixes reveal an architectural problem;
6. the review budget is exhausted with a remaining blocker;
7. the owner revokes, pauses, supersedes, or abandons the work.

## 5. Execution, freeze, and RESULT contract

1. ZCode verifies the transfer OFFER, writes the ready ACK, and becomes the sole
   canonical writer; Codex stops writing.
2. ZCode implements the twelve section 11 requirements with TDD for new behavior
   and reproduced bugs, deletion-first where superseded mechanisms are replaced.
3. When locally complete, ZCode freezes the implementation and writes
   `.ultra/.runtime/handoffs/ubp3-r3-zcode/RESULT.json` recording the terminal
   state, final HEAD and worktree digest, exact changed/deleted paths, exact
   commands and exit results, evidence refs, fakes, limitations, not-done items,
   external effects, and review risks, then stops writing.
4. Codex recaptures the facts from the repository read-only; reviewer findings
   return to this same ZCode task as a new owner-authorized round.

A `completed` RESULT means the receiver's sole-writer execution is complete and
frozen for read-only review; it never means the task ledger row is closed, the
review is accepted, or any delivery or release effect is authorized.

## 6. Terminal outcomes

This grant ends in exactly one of: `completed`, `blocked`, `revoked`,
`cancelled`, or `failed`, recorded in the RESULT receipt, with `blocked`
covering unresolved material owner decisions, external blockers, and
review-budget stops. No terminal outcome implies authorization for a release
effect.
