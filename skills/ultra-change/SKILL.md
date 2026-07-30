---
name: ultra-change
description: Capture or revise one bounded feature, fix, redesign, or incident contract against a ready Ultra baseline. Use when post-baseline work needs accepted intent before research, planning, or implementation.
---

# Capture accepted Change intent

A Change is the durable unit connecting research, plan, implementation, verification,
review, documentation, and delivery. Its draft stays editable until a semantic
checkpoint accepts the downstream authority.

## Inspect and align

1. Call `ultra.context { stage: project, detail: full }`.
2. Inspect or import the team checkpoint with `ultra.sync`. Stop only on a real
   baseline, Change, task, ancestry, or active-session conflict.
3. Reuse an existing matching Change. Do not duplicate authority.
4. Convert the request into observable outcome, executable acceptance, non-goals,
   public seams, recovery, verification, documentation impact, risk, and research
   disposition.
5. Recommend `quick`, `standard`, `major`, or `incident` from evidence. Ask only when
   a choice changes accepted product intent, compatibility, security, material cost,
   external effects, or recovery.

Read `../ultra-think/references/decision-dialogue.md` before asking. MCP may report
contradictory risk fields, but the model and owner choose the semantic correction.

## Record the contract

Use one `ultra.record` batch for `change.create` or `change.update`, relevant
`decision.*`, and `change.delta` when the delta is already known. Every entry carries
a stable idempotency key. Read the result through `ultra.context`.

Keep every Change-owned semantic artifact below
`.ultra/changes/active/<change-id>/`. Standard and major Changes require a typed delta
before planning. A true no-semantic-change case records an explicit reason instead of
manufacturing a mutation.

Changing accepted intent reopens the draft and makes only genuinely dependent evidence
stale. `ready` is not an absorbing state. A semantic rejection returns diagnostics;
repair and retry the same draft. Use `workflow.abandon` only to preserve and cancel an
attempt intentionally.

Publish the durable Change contract with `ultra.sync { action: publish }` when it is a
useful team handoff. Recommend bounded `ultra-research` for a real evidence gap or
`ultra-plan` when the contract is sufficiently evidenced. Do not invoke the next
capability automatically.
