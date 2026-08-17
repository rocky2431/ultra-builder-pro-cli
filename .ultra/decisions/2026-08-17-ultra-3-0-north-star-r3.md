# Decision: Accept North Star v2 revision r3 (constitution convergence)

> **Status**: accepted
> **Decision identity**: `2026-08-17-ultra-3-0-north-star-r3`
> **Acceptance time**: `not-recorded`

## Decision

Adopt `.ultra/north-star.md` revision `north-star-v2-r3` as the current steering
constitution. The accepted semantic boundary is the owner-directed r3 final
design (`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`, SHA-256
`95e06a08ac9f3001bebaf7f5b2247aa8a5f4f0faba1da96ce86ef0dde582e694`): the
constitution keeps only provider-neutral, count-free principles — owner–Agent
cognitive alignment, model agency, file-first authority, one canonical
representation per semantic fact, explicit grants and separate effect
authorization, truthful real-path delivery, bounded convergence with reachable
recovery, honest capability reporting, and the new exclusive-and-verified
Agent-handover principle (`FP-8`). Agent counts and topology details, Host and
Skill counts, provider names, transport argv, and exact review-round numbers
move to the versioned product contract and exact work-package grants, first
among them the r3 primary-transfer grant recorded in
`.ultra/decisions/2026-08-17-ultra-3-0-r3-primary-handoff.md`.

## Owner Record

- Conversation scope: the owner directed the r3 design with Codex, accepted it
  as the owner-directed final design, and then directed ZCode to implement it
  as sole writer under a primary transfer with Codex as read-only reviewer.
  The exact quotes below are preserved verbatim in the records that carried
  them: the session directive, the transfer OFFER, and the accepted design.
- Exact raw owner acceptance: 「You are the sole implementation writer for the
  complete Ultra Builder Pro 3.0 r3 work package in this repository.」 (session
  directive, 2026-08-17); 「Implement the complete Ultra Builder Pro 3.0
  upgrade from the accepted r3 North Star. ZCode performs every implementation
  and coding change. Codex performs read-only review and returns blocker
  findings to the same ZCode task.」 (owner direction recorded in
  `.ultra/.runtime/handoffs/ubp3-r3-zcode/OFFER.json`); 「Owner 已授权：先由
  Codex 写清本文件，然后由 ZCode 完成所有 implementation，Codex 只读验收。」
  (accepted design, section 11).
- Agency boundary: the owner owns the accepted problem, principles, outcome,
  constraints, trade-offs, and external-effect boundary; the model owns
  evidence synthesis and final wording inside that accepted frame. The owner
  did not claim to have authored every sentence of the projected North Star
  document.
- Time boundary: the conversation supplied no authoritative timestamp for the
  acceptance, so this record uses `not-recorded` and invents no time.
- Revision boundary: this decision applies only to `north-star-v2-r3`; a future
  revision does not inherit acceptance, execution activation, or risk
  disposition from this record. Accepting this revision does not by itself
  authorize any external or irreversible effect, commit, publication, or
  installation.

## Accepted Artifact Binding

- North Star content SHA-256: `cfd1a9c2d19421fbe01b02bb33d94cf04485f87539edc79abb32c3c3583fc578`
- North Star Git blob digest: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- Accepted snapshot: `.ultra/research/2026-08-17-ultra-3-0-r3-projection/north-star-v2-r3.accepted.md`

These fields bind the accepted bytes mechanically. The snapshot is immutable
historical recovery evidence; `.ultra/north-star.md` remains the current
semantic authority until a new owner-accepted revision supersedes it.

## Evidence Boundary

- The raw owner quotes above are the acceptance evidence; their authoritative
  preservation is the r3 transfer grant record and the transfer OFFER cited in
  the Owner Record.
- The accepted r3 design document is the semantic source for this projection;
  its SHA-256 is bound in the transfer grant.
- The superseded `north-star-v2-r2` decision, snapshot, research run, the Mode B
  grant, and the v0.27 incident record remain historical evidence and are not
  rewritten.
- Implementation progress, tests, transfer receipts, and review results are
  separate delivery evidence; nothing here claims they are complete.

## Supersession and Recovery

`north-star-v2-r2` remains historical evidence through its own decision record
(`.ultra/decisions/2026-08-17-ultra-3-0-north-star-r2.md`) and research
snapshot. A rejected or invalid future candidate leaves this accepted revision
current. Accepting a replacement must create a new stable owner record, retain
old task/review/Test/delivery evidence, mark dependent revision/digest
observations stale, and explicitly reconcile their semantic IDs before
execution resumes.
