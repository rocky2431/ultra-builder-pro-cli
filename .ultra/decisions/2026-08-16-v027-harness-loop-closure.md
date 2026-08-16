# Decision: v0.27 Harness Loop Closure owner acceptance

> **Status**: accepted  
> **Scope**: one-time H0 bootstrap grant; it is not Execution Packet v1  
> **Date**: 2026-08-16

## Owner record

- Raw owner acceptance (verbatim): 「我接受。你把它交给 Zcode 去修复，让 Zcode 去改吧。」
- Conversation scope: the review of the H0 Harness Loop Incident Remediation proposal.
- Accepted artifact: `docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md`
- Accepted artifact SHA-256:
  `c39347ca3553175aec06629f710a8541db8a12445e5a17dd90e62e6b75bc2acb`
- The acceptance covers the incident root causes, inserting H0 before Phase 3, the
  routing-precedence ladder, terminal `APPROVE` with retained P2/P3, the
  one-initial-plus-one-delta review budget, the 4-hour cumulative ZCode active-time
  budget, the section 10.0 exact path allowlist with scope-drift stops, the
  pending-frontier-is-not-active rule, and external-manual-only review for H0.

## One-time bootstrap grant

- Task: `v027-harness-loop-closure` (H0)
- max_zcode_active_time: 4h cumulative across implementation, at most one repair, and
  prescribed closeout; waiting does not reset it
- max_initial_reviews: 1
- max_delta_reviews: 1
- max_auto_repair_sets: 1
- max_concurrent_writers: 1
- allowed_writer: ZCode
- review_mode: external_manual
- reviewer: Codex root, read-only
- Not authorized: commit, push, tag, publish, install, deploy, or any additional
  provider or external effect beyond this explicitly owner-authorized ZCode model
  execution. The authorized execution's own model usage (requests and tokens) is an
  owner-authorized provider cost recorded honestly in the task evidence; its monetary
  charge is unknown without a provider receipt and is not claimed to be zero.
- Scope drift, budget exhaustion, or a second blocking delta return to the owner.
- Recovery snapshot:
  `/Users/rocky243/.codex/backups/ultra-builder-pro-cli-h0-20260816-eYVVEB`

This record is a one-time bootstrap grant. It is not Execution Packet v1, it is not
inherited by future sessions, it does not by itself accept the implementation, and it
stops authorizing new work once H0 completes. Phase 3 must replace it with the formal
Execution Packet rather than keeping a second mechanism. The initial and delta review
budgets refer to the external manual diff review named above; H0 must not use the
local changing `ultra-review` implementation to generate a self-approval receipt.

## Addendum: Phase A scope extension (2026-08-16)

The owner authorized exactly one narrow scope extension, verbatim:
「授权这个窄任务交给 ZCode 全部搞完之后和我说呀！」 Its scope is the generic
external-manual task-review provenance branch for `ultra-task-evidence-v2` and its
consumers — a discriminated, backward-compatible alternative that binds a real
external-reviewer receipt by exact stable bytes and SHA-256 instead of fabricating a
strict `.ultra/reviews/<session>/SUMMARY.json` identity that does not exist. The
extension is generic product contract, not an H0-specific exception; no H0 task id,
reviewer, verdict, or finding count is hardcoded in product code. Codex root remains
the read-only reviewer for the resulting affected-only delta review.

## Closeout result (2026-08-16)

The Phase A affected-delta review by the read-only Codex root reviewer returned
verdict `approve` with zero findings over the reviewed coverage (mandatory default
receipt verification; exact HEAD and product-worktree subject equality; stable
real-byte binding of the reviewed contract and this authority record; managed-chain
no-follow; the exact current P0/P1 blocker set and verdict consistency; and
strict/external branch projection compatibility), with root evidence: affected
tests 21/21, full Node 574/574, Hooks 89/89, `git diff --check` clean, the Phase A
scope exactly the 12 authorized paths, and the accepted contract digest unchanged.
The exact review result is bound byte-for-byte in
`.ultra/evidence/v027-harness-loop-closure/external-review.json`; this record is the
owner-authorized reviewer-authority artifact that receipt names.
