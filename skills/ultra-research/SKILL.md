---
name: ultra-research
description: Build or refresh an evidence-backed product and architecture baseline through recommended, user-selected semantic coverage. Use when initialization, brownfield adoption, or an active Change has a real evidence gap.
---

# Research with adaptive coverage

The model owns investigation and synthesis. The owner controls material scope and
deferrals. MCP records the accepted draft and commits one durable checkpoint; it is
not a questionnaire or a step-by-step supervisor.

## Bind current context

1. Call `ultra.context { stage: research, detail: full }`.
2. If the team checkpoint is newer, call `ultra.sync { action: import }`. Stop only
   on a real ancestry or same-record conflict.
3. Inspect code, docs, tests, runtime, accepted intent, decisions, and existing
   research. Reuse current evidence and the matching mutable draft.
4. Recommend the smallest sufficient coverage. Offer the adaptive set, the full
   catalog, and a focused Change-bound set only when all are credible.
5. Use the host-native question surface only for a material unresolved route. Reuse an
   explicit owner choice without asking again.

Read `../ultra-think/references/decision-dialogue.md` before asking. Load only the
reference files for research areas that actually apply.

## Investigate

For each selected area:

- separate `Observed`, `Verified`, `Decided`, and `Unknown`;
- resolve observable facts yourself and use primary sources where needed;
- update the smallest baseline or Change-owned research artifact;
- never store transcripts, hidden reasoning, raw provider payloads, or copied prompts;
- record evidence, specification updates, decisions, deferrals, and consequences.

Use one `ultra.record` batch for durable facts such as `artifact.record`,
`decision.*`, `baseline.*`, `change.update`, or `change.delta`. Every entry needs a
stable idempotency key. A rejected entry is a mutable diagnostic: fix the draft and
retry; use `workflow.abandon` only when intentionally discarding that attempt.

## Commit one research checkpoint

Call exactly one `ultra.checkpoint` with `stage: research`. Put the selected research areas
and their report outputs in `payload.steps`; include only work actually performed,
verified, reused, deferred with owner authority, or proved not applicable. Synthesis
must always be present.

For baseline research, record and converge the accepted baseline through
`ultra.record`, then publish the team checkpoint with `ultra.sync { action: publish }`.
For Change-bound research, keep all findings and delta artifacts below the Change
root and never edit accepted baseline specs directly.

If the checkpoint returns `accepted: false`, keep the same draft mutable, repair the
reported evidence, and retry. Do not manufacture evidence or open a replacement run.

Return coverage, decisive evidence, remaining gaps, durable artifact paths, and a
model recommendation for the next explicit capability, such as `ultra-change` after a
ready baseline. Never invoke it automatically.
