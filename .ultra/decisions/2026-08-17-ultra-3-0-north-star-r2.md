# Decision: Accept North Star v2 revision r2 (Ultra Builder Pro 3.0 projection)

> **Status**: accepted
> **Decision identity**: `2026-08-17-ultra-3-0-north-star-r2`
> **Acceptance time**: `not-recorded`

## Decision

Adopt `.ultra/north-star.md` revision `north-star-v2-r2` as the current steering
constitution. The accepted semantic boundary is the Ultra Builder Pro 3.0 forward
design (`docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`, SHA-256
`a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f`) projected
into the v2 schema: owner–Agent cognitive alignment as the primary outcome
(`NS-01` through `NS-05`), the file-first provider-neutral Ultra Core Protocol,
explicit dual-mode authorization (`FP-3`, `HC-2`), bounded three-round review
convergence (`FP-4`, `HC-7`), owner-selected topology with a single-Agent
default (`HC-8`), and the retained portability, delegation, and effect
boundaries.

## Owner Record

- Conversation scope: the owner reviewed the 3.0 forward-design discussion with
  Codex and accepted the design plus the Mode B implementation experiment; the
  exact quotes below are preserved verbatim in the durable Mode B grant record
  `.ultra/decisions/2026-08-17-ultra-builder-pro-3.0-mode-b.md#1-owner-record`.
- Exact raw owner acceptance: 「我接受这个建议先改文档，然后我们按照模式 B 把这个落地。」
- Exact raw implementation authorization: 「就是说，这个工作允许 Zcode 在本地完成，完了之后你 Codex 就负责检验和验收，我们可以试验一下」
- Acceptance meaning: the owner accepted the 3.0 forward design, the `Ultra
  Core Protocol` naming, the dual-mode authorization design, and selected Mode B
  for this work package: ZCode implements locally, Codex reviews read-only
  after the implementation is frozen. The owner did not claim to have authored
  every sentence of the projected North Star document.
- Agency boundary: the owner owns the accepted problem, principles, outcome,
  constraints, trade-offs, and external-effect boundary; the model owns
  evidence synthesis and final wording inside that accepted frame.
- Time boundary: the conversation supplied no authoritative timestamp for the
  acceptance, so this record uses `not-recorded` and invents no time.
- Revision boundary: this decision applies only to `north-star-v2-r2`; a future
  revision does not inherit acceptance, execution activation, or risk
  disposition from this record. Accepting this revision does not by itself
  authorize any external or irreversible effect.

## Accepted Artifact Binding

- North Star content SHA-256: `18cf6dfb32df2db2428781fd5e85c46a6024e7b5e3a6b4d061d324786f98f71c`
- North Star Git blob digest: `8c0382c22bdabd5b98bdc5a332f48245a22d8aff`
- Accepted snapshot: `.ultra/research/2026-08-17-ultra-3-0-projection/north-star-v2-r2.accepted.md`

These fields bind the accepted bytes mechanically. The snapshot is immutable
historical recovery evidence; `.ultra/north-star.md` remains the current
semantic authority until a new owner-accepted revision supersedes it.

## Evidence Boundary

- The raw owner quotes above are the acceptance evidence; their authoritative
  preservation is the Mode B grant record cited in the Owner Record.
- The accepted forward design document is the semantic source for this
  projection; its SHA-256 is bound in the grant.
- The superseded `north-star-v2-r1` decision, its research run, and the v0.27
  incident record remain historical evidence and are not rewritten.
- Implementation progress, tests, and review receipts are separate delivery
  evidence; nothing here claims they are complete.

## Supersession and Recovery

`north-star-v2-r1` remains historical evidence through its own decision record
and research snapshot. A rejected or invalid future candidate leaves this
accepted revision current. Accepting a replacement must create a new stable
owner record, retain old task/review/Test/delivery evidence, mark dependent
revision/digest observations stale, and explicitly reconcile their semantic IDs
before execution resumes.
