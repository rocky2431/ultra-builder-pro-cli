# Owner decision: UBP v6 complete version, phases P0–P5

Date: 2026-10-31 (Asia/Shanghai).

## Owner request

> 我觉得，我认可这个按照 P0 到 P5 直接落地呗，落地完了之后，我再拿过去去试验第一个工程样本

Asked to confirm the execution contract in §8 of the plan, the Owner replied:

> 确认

The accepted plan is `thinking/back-to-essentials-20261030/RESULT.md`, SHA-256
`02d80505d23e7c8f270c8e2e7645209e145fba3d80bff045f61f89feb639447e` at acceptance.
Its research basis is in the same folder (`THOUGHTS.md`, `research/01–06`).

## What is decided

- **Core model.** Project truth has five layers: L0 direction, L1 behavior spec with
  stable IDs and executable acceptance, L2 design and invariants, L3 compiled task
  graph, L4 execution. A change at one layer invalidates only what depends on it.
  Progress is computed per requirement (green, red, unknown, stale, uncovered); the
  model never writes it. Deleting or narrowing an L1 requirement needs Owner approval.
- **Sample order.** The Owner tries the first real engineering sample after P5. The
  P2, P3 and P5 exits are therefore observed on a reference sample R that v6 builds
  itself. Passing P5 means "ready for the Owner's first real sample", not "proven on a
  real project".
- **Step 6 (operational factory) is closed: benefit not repeatable.** D-04 and D-05
  were not met after the fixed V2 ten-run comparison
  (`work/trellis-eight-step-20260909/stage-d-product-v2-comparison.zh-CN.md`). Change
  `chg-ultra-vnext-d-operational` moves to `changes/abandoned/` with its closure.
- **Step 7 (cross-session continuity) stops at the bounded implementation already
  committed.** Durable grant, machine-loss and network-outage proof are not pursued;
  the final review stays INCOMPLETE as recorded in
  `work/trellis-eight-step-20260909/stage-e-final-review-disposition.zh-CN.md`.
- **Step 8 (evaluated strategy change) rejects both candidates.** Current, candidate
  and simpler scored 2/8, 5/8 and 1/8; the candidate did not improve on the
  development set, and 5/8 vs 2/8 has a two-sided Fisher exact p ≈ 0.315
  (computed 2026-10-31). The rollback-ready patch is not applied
  (`work/trellis-eight-step-20260909/stage-e8-comparison.zh-CN.md`).
- **Hosts and run shape.** v6 supports Claude Code and Codex only. It runs inside the
  host first; unattended runs come in P5.
- **Repository and version.** Work happens on branch `v6` in its own worktree
  (`../ultra-builder-pro-cli-v6`), version 6.0.0. Factory, W3 IPC, durable grants,
  wake-up and the OpenCode, Kimi, Grok and ZCode adapters leave v6's default path and
  release gate; they remain recoverable from Git history and from 5.0.2.
- **Engine budget.** At most 2,000 lines of engine code, tests excluded.

## Effects and roles

- The main session plans, writes acceptance, splits code slices, runs checks and
  integrates. Codex implements multi-file code slices through agent-delegation with
  existing authentication; if Codex is unavailable, the Claude `implementer` subagent
  does, and the record says so. When Codex authors, the Claude `reviewer` subagent
  reviews (xhigh for architecture). After two review rounds, remaining disagreement
  goes to the Owner.
- After each phase exit is observed and reviewed, one local commit on `v6` records
  cause, scope, verification and rollback.
- Not covered: push, tag, npm publication, real-HOME installation (isolated install
  checks only), changes to `~/.claude`, changes to the three Marketplace skill
  repositories (the ultragoal Carry-over change stays a proposal), multi-writer
  parallelism before P4, and automatic adoption of method candidates.

## Stop conditions

- P5's exit observed on R: deliver, with an onboarding note for the first real sample.
- A phase exit still unobserved after two repair rounds: stop and report.
- An L0-level decision or one outside this authority: stop and ask.

## Execution record

The owner-readable current state lives in the main checkout at
`tasks/2026-10-31-ubp-v6.md`. The eight-step record
`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md` is closed by
this decision and kept as history.
