# Decision: Accept vNext R2 and activate the three-stage local delivery goal

> **Status**: accepted
> **Decision identity**: `2026-09-01-vnext-r2-three-stage-goal`
> **Date**: `2026-09-01`
> **Repository**: `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`

## Owner record

Owner 在 R2 文档修订后给出的当前执行指令是：

> 「设定成目标循环完成好了 当前这个任务 代码部分由zcode完成 你负责review给到修改意见 并且在每个阶段去和cc（claudecode）讨论当前的情况和需要优化的部分（阶段大型review需要你和cc一起 开发过程中的review你自己完成）三个阶段都需要有全部跑通……最终交付……自动化coding agent 软件工厂为止。」

当前 Goal 将该指令具体化为：完成 R2 的 Step 1、Step 2、Step 3 累积交付；
ZCode 是本仓库目标内唯一实现代码写入者，Codex 负责持续 Review、验收和修改意见，
Claude Code 在每个阶段参与架构/状态讨论并与 Codex 完成阶段大型 Review。所有阶段都必须
通过真实 E2E、权限/effect、恢复、意图对齐、模型能力与 capability-tax、鲁棒性和回归门槛。

这是一项 durable three-stage objective，不是对任何状态文件、Agent 自报或运行时 receipt 的
授权。Owner 仍保留 material intent、风险接受、外部 effect 和最终接受。

## D0 architecture acceptance

接受 `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` 的产品方向与三阶段边界，
精确 SHA-256 为：

`f50acb33cdaa023bd80e481d4cf36fa81d7d0201a574aedca78d3be7e84757e7`

接受的是：

- Ultra 是现有 Coding-Agent Harness 之上的 repository-native delivery control layer，
  不是第二套 Harness、通用 DAG DSL、数据库或全局 semantic daemon；
- Owner 保留 outcome/authority，Primary 负责语义下一步，Supervisor 只执行有限切片中的机械边；
- role contracts 是 Core，不把 Claude、Codex、Kimi 或 ZCode 写死成永久角色；
- Step 1、Step 2、Step 3 使用同一组 authority、Run Slice、Attention、Evidence 和 Recovery
  含义累积扩建；
- durable continuation 和 self-evolution 属于完整目标，但只有在真实 consumer、qualified Host
  和对应授权存在时才启用；promotion/reject 仍由 Owner 决定。

R1 候选和独立 Review 只作为 provenance：

- R1 SHA-256: `f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268`
- independent Review SHA-256: `7f628a4c6120908dc72178d4281c7ca45eba00f9afee526240a2b87d85362f63`

接受 R2 不接受其中尚未 live-qualified 的具体 wake API、Host maturity 或 provider 质量主张。

## Stable product binding

- Git HEAD: `adb7bfe89f40e107d0c9c490076a6e74294b9337`
- accepted North Star revision: `north-star-v2-r3`
- accepted North Star Git blob: `439b7838e2a672fd2d2cb6e0f11e94a61d0f76c8`
- locally finalized 5.0.2 product digest:
  `ec938773875ecc1f53ba71eae4e99c531d9fd498fc69ef51f9c1a8b0d661e528`
- archived prerequisite Change:
  `.ultra/changes/archive/chg-ultra-5-0-2-authority-reconciliation/`
- prerequisite canonical evidence digest:
  `45743f378a16fb1472f37d5a05d20a4578e84b5bb8484a51cbf627b5ef9d822a`

5.0.2 remains a local uncommitted candidate. This decision does not turn the dirty
worktree into a Git commit or authorize release effects.

## Replaceable profiles and current work-package topology

Product runtime and repository development use separate mappings:

1. `factory-profile-v0` remains the frozen evaluation default described by R2:
   Claude Code Primary, Codex Architecture Challenger / fresh Independent Reviewer,
   Kimi frontend-scoped Worker, and ZCode backend-scoped Worker. It is a benchmark
   configuration, not Core constitution.
2. Every real Run must resolve a versioned Profile plus any explicit per-run override,
   and record exact role, Host, model, adapter/version, authority class and maturity.
   Core code must branch on capabilities/contracts, not provider brands.
3. The current repository work-package topology is different and owner-selected:
   all implementation-file mutations are performed by ZCode; Codex coordinates and
   reviews but writes only workflow/decision/task/review/evidence/recovery artifacts;
   Claude Code is read-only for stage discussion and large Review. Kimi is not an
   authorized writer in this work package unless Owner later changes the topology.
4. A later Product Profile or per-run override may replace any Host mapping without
   changing Core invariants. A topology change for this work package still returns to Owner.

When Step 1 needs more than one simultaneous scoped writer, it may use multiple fresh
ZCode worker instances with disjoint worktrees and roots. That satisfies the current
sole-writer-family instruction without hard-coding ZCode into the product.

## Cumulative delivery sequence

- D1 is one independent safety-precondition Change for descendant environment isolation,
  writer-tree truth/cancel/fencing, `outcome_unknown`, and bounded effect-enforcement evidence.
- D2 separately qualifies W1/W2 on the selected Primary Host using bounded existing-provider
  calls; no new login, purchase or credential mutation is implied.
- D3/D4 implement and prove the Step 1 closed loop only after D1/D2 evidence exists.
- Step 2 and Step 3 each use a new Change so later capabilities cannot silently widen an
  earlier Grant.
- Every stage retains Solo/current Ultra and the previous accepted stage as baselines;
  unsupported machinery is deleted or held rather than promoted by sunk cost.

## Local authority and external-effect boundary

Authorized for this long goal:

- local owner-readable design/decision/Change/task/review/evidence/recovery artifacts;
- local implementation code and tests written by ZCode under an exact active Change;
- Codex read-only source Review, local validation, and coordination-artifact writes;
- bounded ZCode and Claude Code calls using already configured local authentication and
  existing entitlements, including one D1 selected-Host no-production enforcement
  qualification call and later Change-scoped real E2E calls, with no purchase/top-up or
  identity change;
- isolated local worktrees, temporary fixtures, package dry-runs and read-only Doctor checks.

Not authorized:

- commit, push, force-push, tag, npm publish, GitHub Release, deploy, production mutation,
  real HOME installation, credential access/export/replacement, login, purchase/top-up,
  external messaging or any other irreversible effect;
- online self-modification or automatic promotion of a Profile, Prompt, Skill, Hook,
  router or adapter;
- a second simultaneous active Change, silent fallback, or any Agent-created authority.

Each Change must record its own exact durable work-package Grant. This decision supplies
the Owner record but does not let a stored intent widen scope, start a new Change after the
current one, finalize/archive, or consume an external effect without its normal gate.

## D1 durable work-package grant

> **Grant ID**: `ubp-vnext-d1-zcode-safety-2026-09-01`
> **Change**: `chg-ultra-vnext-d1-delegation-safety`
> **Complete per-task budget set**: `vnext-d1-runtime-safety-boundary`,
> `vnext-d1-host-enforcement-qualification` — no current or later ledger row is covered
> unless the Owner names it in a new exact grant.

- Allowed workflows: Change reconciliation, Plan, Dev, Test, task/aggregate Review and
  Deliver reconciliation without finalization for this exact D1 Change.
- Writer topology: one active ZCode implementation attempt at a time; Codex is the
  coordinator and reviewer; Claude Code may perform one fresh read-only Step 1 architecture
  discussion. Neither Codex nor Claude writes implementation code.
- Provider budget: one initial ZCode implementation attempt for each task in the complete
  per-task budget set above plus at
  most two Codex-requested P0/P1 repair attempts for that same task, each bounded to two
  active hours; one Claude discussion bounded to one hour; one selected-Host enforcement
  qualification call bounded to thirty minutes and an isolated no-production fixture; one
  active ZCode attempt at a time and no automatic retry, fallback, purchase or top-up.
- Review budget: one initial Plan Review plus one P0/P1-only delta Review; for each task in
  the complete per-task budget set, one initial Codex task Review plus at most two P0/P1-only
  delta Reviews; one aggregate
  D1 Review plus at most two P0/P1-only delta Reviews. P2/P3 are reported and are not
  auto-repaired.
- Owner checkpoint extension (2026-09-01): one additional delta may resolve only the direct
  parent's remaining `review-spec-001` by binding the two exact task ids above. Its semantic
  scope is spec-only; because strict Review v4 cannot produce a complete summary without
  both axes, `review-design` may run only as the minimum engineering-axis witness for these
  same grant bytes. This extension creates no adjacent repair or further delta budget.
- Persistence: recoverable test, transport, tool or process accidents are diagnosed and
  reconciled within the applicable named budget instead of abandoning the three-stage goal.
  This does not override authority/effect stops or authorize commit, release, credentials,
  production, real-HOME mutation or any unnamed external effect.
- Expiry: aggregate D1 Review `APPROVE`, Owner revocation, scope/topology/effect drift,
  the same root cause surviving three failed fixes, or any applicable budget exhaustion.
- Never granted: D2/Step 1 implementation, a later Change, finalization/archive, release,
  real-HOME mutation, credentials, production, or other external effects.

## Recovery and supersession

The decision is additive and does not rewrite R1, its Review, the archived 5.0.2 Change,
or the accepted North Star. If R2 bytes, the North Star blob, repository identity, active
Change identity, topology or effect boundary drift, execution stops and returns to Owner.
Rejecting a later Profile or stage candidate leaves this D0 architecture direction and the
last accepted product stage intact; local file changes remain ordinary inspectable Git diff.
