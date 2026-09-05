# Ultra Builder Pro vNext 独立多 Agent 评审汇总

> - **状态**：`discussion-only synthesis — unaccepted — no implementation authority`
> - **日期**：`2026-08-31`
> - **Owner 修订日期**：`2026-09-01`
> - **冻结评审输入 R1**：[`ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md`](./ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md)
> - **冻结 SHA-256**：`f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268`
> - **当前候选 R2**：[`完整目标架构与三阶段累积实施`](./ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md)
> - **独立评审者**：Claude Code、Kimi Code、ZCode；三方收到同一只读 mission，彼此未看到对方结论。
> - **用途**：汇总共识、分歧、代码核验和推荐启动顺序；不是 accepted decision、Change、Plan 或 Execution Grant。
> - **未授权效果**：不授权实现、测试、安装、commit、push、publish、deploy 或凭据变更。

## 0. Owner 修正与评审适用范围

三方独立评审针对的是上面冻结 SHA 的 R1，不是后续 R2。为保留可核验 provenance，R1 不再修改，三方也不被追溯描述为“评审过 R2”。

Owner 在评审后明确提出 **No isolated MVP**：可以用 Step 1 跑通最小完整闭环，但必须先定义整个产品的 Target Architecture，并说明 Step 2、Step 3 如何在同一合同上累积扩建。不能把 thin Supervisor 当作产品终点，也不能让 Step 1 使用以后会被抛弃的接口或 authority model。

因此，本汇总中的原始建议按以下规则解释：

- “MVP 不实现 durable-run”改为“Step 1 延期实现，Step 3 仍属于完整 Target Architecture”；
- “Assurance Lane 后置”只表示 Step 1 内部可以先验证 batch transport；Step 1 qualification fixture 仍必须完成 challenge/review 闭环，后续产品 route 才可按 admission 显式跳过 Challenger；
- “先 N=1、再 N=2、再异构 Profile”是验证顺序，不是三个互不相干的产品版本；
- R1 的安全发现、wake 分级、机械/语义分权和 provider-neutral role contracts 继续有效；
- 当前架构候选以 R2 为准；本文继续作为 R1 评审证据与 R2 的输入说明。

## 1. 综合结论

三方一致认可产品边界：

> **Ultra Builder Pro vNext 应是运行在现有 Coding-Agent Harness 之上的、repository-native、event-driven 多 Agent 交付控制层，而不是第二套 Agent Harness、通用 DAG 引擎或 SQLite/daemon 语义运行时。**

但冻结候选**不应原样进入实现**。它没有把完整 Target Architecture、Step 1 的实现边界和后续累积扩展清楚分层，也没有充分复用仓库已有的两个 waiter 原语。R2 应保留完整目标，同时把第一条实现路径收窄为：

```text
Primary 编译一个有限 Run Slice
  -> thin Supervisor 复用现有 delegate run/status/cancel
  -> 在模型之外等待 N 个既有 delegation
  -> barrier 到达后原子写一个 bounded attention
  -> Host 用已验证的 session-bound 机制形成一次 semantic continuation
  -> Primary 决定集成、repair、下一 slice、返回 Owner 或结束
```

Step 1 的净新增不是一次性“自动软件工厂平台”，而是：

> **使用最终 authority、role、Run Slice、Attention、Evidence 和 Recovery 合同，把现有单 delegation 的启动与非模型等待组成一个可取消、可恢复、只返回一次 attention 的完整交付闭环。**

Step 2 在相同合同上增加多 wave、多 Profile、W3 live messaging、worktree lifecycle 和运营可见性；Step 3 再增加 durable Grant、W4 fresh authorized turn、run-scoped conductor 和离线 Evolution Plane。后续阶段不能把 semantic completion 权威转给 Supervisor。

在进入任何 fan-out 实现前，还有一个当前代码的安全前置问题：delegated Worker 会继承完整
`process.env`，因此 Primary 的 wake/session/thread 控制面变量也可能进入其他 Host。这个缺陷需要
作为现行 delegation transport 的独立修复候选，不应等 vNext 顺带解决。

## 2. 评审执行与证据质量

三次委托均使用 `agent-delegate`，目标实际版本来自运行前的 target inventory：

| Target | Observed runtime | Delegation | 终态 | Transport 质量 |
|---|---|---|---|---|
| Claude | Claude Code `2.1.251` via `claude-agent-acp@0.70.0` | `bf80e3164a3447fbada0766122b27380` | `success / end_turn`，617.722s | 446 events，0 protocol errors |
| Kimi | Kimi Code `1.49.0` native ACP | `80cf037ceb784a7bac94db74784a31b4` | `success / end_turn`，1184.547s | 26,801 events，595 `Internal error` protocol errors；终稿完整，但证据权重下调 |
| ZCode | `zcode-acp 0.1.0+ultra.zcode.0.16.5` + local ZCode bundle | `cb32f3f4d6ae43d0be3bf27e12be994f` | `success / end_turn`，1038.17s | 1,621 events，0 protocol errors；transport 仍是产品矩阵中的 experimental candidate |

持久回执位于：

```text
/Users/rocky243/.local/state/agent-delegation/runs/20260831T135014Z-bf80e3164a3447fbada0766122b27380
/Users/rocky243/.local/state/agent-delegation/runs/20260831T135014Z-80cf037ceb784a7bac94db74784a31b4
/Users/rocky243/.local/state/agent-delegation/runs/20260831T135014Z-cb32f3f4d6ae43d0be3bf27e12be994f
```

`success` 只证明 delegation transport 到达合法终态，不自动证明评审结论正确。高影响争议已另外用
当前源码核验。

## 3. 三方观点

### 3.1 Claude

Claude 接受产品边界，但主张大幅收窄：

- `delegate_wait.py` 已经实现 N=1 的非模型等待，`review_wait.py` 已经提供专用 N-way barrier
  设计先例；新增代码只应补跨 Host delegation 的通用 batch/fan-in。
- session-bound 前台阻塞已经足够时，不需要 `event_seq`、通用 Wake Adapter 或
  `journal.jsonl`。
- durable-run 不应只写“以后再做”，而应明确拒绝，除非 Owner 真的要求过夜无人值守。
- 第一条真实路径先做 N=1 characterization，再做 N=2，而不是直接进入四 Host 全家桶。
- 发现完整 `process.env` 进入 Worker；扩大 fan-out 前必须先修。

Claude 的主要过度推断是建议删除 `outcome_unknown`。它忽略了当前目标 Host 子进程也是 detached，
而其 PID/session identity 没有持久化；delegate-worker 意外死亡后，旧 Host 仍可能作为孤儿进程继续
写 worktree。因此该建议不采纳。

### 3.2 Kimi

Kimi 接受候选的四项原则，并建议：

- 在 D1 之前增加 D0a wake spike，用真实 Primary Host 测一次完成通知、注入字节和 resume；
- 先做同 Host 双 Worker，再做当前异构 Profile v0，以便把 batch 缺陷与 transport 缺陷分开；
- 把 ACP `session/load` / `session/resume` 纳入 durable wake 候选，按能力位和 live smoke 资格验证；
- 把 worktree 创建最终机械化，不让 Primary 长期手工执行；
- 用 batch schema 负例拒绝 `when`、`next`、`on_result` 等 DSL 漂移。

Kimi 的终稿完整，但 ACP 回执含 595 个 protocol errors；涉及“所有 Host 都支持相同后台完成通知”
或 ACP resume 可移植性的结论，只保留为待 smoke 假设，不能写成当前产品事实。

### 3.3 ZCode

ZCode 接受产品边界，并提出最有用的 wake 分级：

- W1：前台阻塞工具返回；
- W2：同一 live session 的后台任务完成通知；
- W3：live session inbox/socket；
- W4：durable thread 上的 fresh authorized turn。

它指出 W1 是否能实现 0 idle turn 受 Host tool timeout 约束；worker 默认 1800 秒，而部分工具前台
等待上限只有 600 秒。它还发现 `outcome_unknown` 的真正缺口：当前只持久化 delegate-worker
PID，不持久化其 detached Host child PID/session，所以 Supervisor 不能机械证明旧 writer 已停。

ZCode 建议先用两个 Worker、集成与 combined E2E 隔离验证 batch transport，再接入
Challenger/Reviewer。该建议作为 Step 1 内部验证顺序采纳；Step 1 qualification fixture 的最终
exit gate 仍要求完整 Assurance Lane 与 canonical closeout，不能停在只有 batch 的孤立切片。

## 4. 三方共识与分歧

### 4.1 可直接收敛的共识

| 结论 | Claude | Kimi | ZCode | 综合裁决 |
|---|---:|---:|---:|---|
| 产品是现有 Harness 上的交付控制层 | 同意 | 同意 | 同意 | 接受 |
| Primary 决定语义下一步，Supervisor 只做机械边 | 同意 | 同意 | 同意 | 接受 |
| 角色合同固定、Agent/Host mapping 可替换 | 同意 | 同意 | 同意 | 接受 |
| 先复用 `delegate.cjs` / waiter，不重写执行器 | 同意 | 同意 | 同意 | 接受 |
| 不建 DAG DSL、数据库、全局 daemon、auto-merge | 同意 | 同意 | 同意 | 接受 |
| Primary 不接收 progress/log/transcript，只收 bounded refs/digests | 同意 | 同意 | 同意 | 接受 |
| session-bound 先于 durable-run | 同意 | 同意 | 同意 | 接受 |
| 真实 wake smoke 应前置 | 同意 | 同意 | 同意 | 接受 |
| 首条 real slice 应小于当前四角色全路径 | 同意 | 同意 | 同意 | 接受 |
| Worker env 必须剥离 Primary 控制面凭据 | 同意 | 同意 | 同意 | 接受为前置安全问题 |

### 4.2 尚不能写死的分歧

| 分歧 | 裁决 |
|---|---|
| durable-run 删除还是保留 | 属于完整 Target Architecture 的 Step 3；Step 1/2 不承担其实现成本。没有 accepted unattended 场景、durable Grant 和 qualified W4 adapter 时不启用 |
| `journal.jsonl` 是否需要 | Step 1 不预建；已有 receipt/lock/result/status 足以重建时继续复用。只有 Step 3 的真实恢复证据证明缺少 transition history 时，才增加 run-scoped derived event log |
| `event_seq` 是否需要 | 单 slice、一次 W1/W2 notification 可使用最小 delivery identity；W3/W4 重投递、多 attention 或 durable resume 时必须有可验证 dedupe identity |
| `outcome_unknown` 是否需要 | 保留为 Supervisor 的派生安全分类，不加入 Worker terminal schema，不把它变成第二套状态机 |
| 首条真实切片是 N=1 还是 N=2 | N=1 作为 characterization control；同 Host N=2 证明新增 batch 价值；异构 Profile + Assurance 完成同一个 Step 1 的产品级闭环 |
| Supervisor 是否立即创建 worktree | 第一版沿用预先创建并校验的 registered worktree，避免把生命周期管理混入 batch；若 real slice 证明这是剩余 operator burden，再加机械 create/cleanup |
| ACP resume 是否是 provider-neutral durable wake | 只列为研究候选；逐 adapter `sessionCapabilities` + live load/resume smoke 前不得宣传 |

## 5. 推荐架构

### 5.1 控制链

```text
Owner
  └─ 决定 intent、material change、risk、authority、external effects
       ↓
Primary — selected Host
  └─ 对齐 intent，冻结 seam，编译一个有限 Run Slice
       ↓
Run Supervisor — code, no model, no semantic authority
  ├─ admission：grant/base/digest/roots/budget
  ├─ 调用现有 delegate run × N
  ├─ 在模型之外等待现有 result/lock/process facts
  ├─ cancel fan-out / reconcile / no duplicate launch
  └─ barrier 到达后原子发布一个 bounded attention
       ↓
Host-qualified continuation
  └─ W1 返回同一 tool turn；W2–W4 请求一个新/fresh turn
     同一 event 至多应用一次语义决定，只带 run/attention refs + digests
       ↓
Primary
  └─ integrate / repair / next slice / owner handoff / delivery_ready
```

Supervisor 的判断上限是“当前出现了什么机械事实”；它不能输出 `next_step`、`task_succeeded`、
repair packet、Review disposition 或 provider fallback。

### 5.2 Wake 分级

| Level | 机制 | 阶段定位 | 资格要求 |
|---|---|---|---|
| W1 | 一个阻塞 tool call 到 attention 后在同一 turn 返回 | Step 1 portable fallback | tool wait 上限必须覆盖 wave，且中间不触发模型 |
| W2 | live session 的后台任务完成 notification | Step 1 首选候选 | 必须 live smoke：acknowledged bounded payload、可关联 run、at-most-one semantic application |
| W3 | live inbox/socket/message | Step 2 target | session identity、credential isolation、重复投递、session 消亡行为均通过 smoke |
| W4 | resume thread/session 后启动 fresh authorized turn | Step 3 target | durable Grant、authority revalidation、turn identity、dedupe、fail-closed 全部通过 |

如果 W1/W2 均未通过，Host 仍可作为 Worker，但不能作为该模式的自动化 Primary。若 W3/W4 未通过，
Supervisor 只写 durable attention 并停止；下次 SessionStart/manual resume 继续。

### 5.3 Step 1 运行制品建议

```text
.ultra/.runtime/runs/<run-id>/
├── run-slice.json   # immutable finite execution manifest
└── attention.json   # atomic bounded attention
```

同时复用每个 delegation 已有的：

```text
worker-spec.json / run.lock / receipt.json / result.json / events.jsonl
```

Step 1 不新增 `journal.jsonl`、通用 durable event log 或 workflow DSL。`run-slice.json` 必须包含
`run_id`、run 内唯一 `packet_id`、`grant_ref + grant_sha256`、base、role/Host、instruction、
permission、worktree 和物理预算；schema 遇到 `when/next/on_result/auto_retry/task_completed`
等语义字段应拒绝。

`attention.json` 只包含 reason、counts、attempt state、result refs/digests 和 unknown refs；不包含
result 正文、ACP observation、stdout/stderr、transcript、progress 或下一步。

## 6. 在开始 vNext 前必须处理的两个事实缺口

### 6.1 Descendant environment 泄漏

当前代码链已核实：

- `delegate.cjs` 以完整 `process.env` 运行 driver probe，并启动 `delegate-worker`；
- `cli-driver.cjs` 和 `acp-driver.cjs` 再以 `{ ...process.env, ...spec.env }` 启动目标 Host；
- 因此 `CLAUDE_CODE_MESSAGING_SOCKET/TOKEN`、Codex session/thread/app-tools pipe 等 Primary
  控制面变量可能进入跨 Host Worker。

修复合同不是简单删除一个变量，而是在 canonical `delegate run` 边界构造一份 target-aware
sanitized descendant environment，并把同一份环境用于 probe、delegate-worker 和最终 Host；保留
该 Host 真正需要的认证变量，但绝不把完整环境写进 `worker-spec.json`。D1 必须有 fake-host 回归：
控制面变量不可见，必要 PATH/locale/Host auth 仍可用。

### 6.2 Orphan Host / false terminal

当前 delegate-worker 和目标 Host 都是 detached process；run.lock/receipt 只记录外层 worker PID。
外层 worker 若被 SIGKILL 或机器中断，内层 Host 可能继续写原 worktree。此时当前 `status` 只显示
`stalled`，当前 `cancel` 甚至可能在看不到 worker PID 时合成 `cancelled` result，但并不能证明内层
Host 已停。

因此：

- `stalled` 保留为直接观察；
- reconcile 无法证明整个 writer tree 已停时，派生 `outcome_unknown` attention；
- 冻结原 worktree/roots，禁止自动 relaunch；
- D1 先用 fake child tree 复现，再决定最小修法是持久化 child PID/session、改变 process-group
  topology，还是增强 identity/fencing；没有 RED evidence 前不先选实现。

### 6.3 Effect enforcement boundary

R1 评审主要发现了 environment 和 orphan-writer 问题；R2 进一步收紧：Packet/Prompt 不是访问控制，事后拒绝 result 也不能撤销已经发生的网络、凭据或外部 effect。Step 1 前必须对 selected Host 的真实 OS/Host sandbox、writable roots、network、secret scope、tool capability 和 point-of-use external-effect gate 做 live enforcement smoke；无法机械限制 denied effect 的 Host 不能承担该 Packet。

## 7. R2 当前累积实施结论

R2 不采用“交付一个 thin MVP 后再决定产品是什么”的路径。当前推荐顺序是：

### Step 1 — Closed-Loop Foundation

用最终合同完成一条真实 walking skeleton：Intent → bounded Research/Challenge → implementation/factory Grant → 至少两个隔离 Workers → one Attention → Primary integration → combined E2E → fresh independent Review → canonical closeout。Research/Challenge 的 provider、网络与费用必须事先被当前 session-local read-only authority 覆盖；后签的 factory Grant 不能反向授权已发生的调用。内部先做 N=1 characterization、同 Host N=2，再做异构 Profile 和 Assurance；Step 1 qualification fixture 必跑 Challenger，后续 route 才可按 admission 显式跳过。Step 1 只有在完整闭环通过后才算完成。

Step 1 只使用 W1 和已资格验证的 W2，不实现跨 session durability；这是一项阶段性能力限制，不是 Target Architecture 删除 durable continuation。

### Step 2 — Operational Software Factory

在同一 authority、role、Run Slice、Attention、Evidence 和 Recovery 合同上增加 multi-slice/multi-wave、多个 Profiles、worktree lifecycle、W3 live messaging、budget/backpressure、operator projection、bounded repair 和跨 Profile evaluation。

### Step 3 — Durable Adaptive Factory

在 accepted unattended use case、durable Grant 和 qualified W4 adapter 同时存在时，增加 run-scoped conductor、fresh authorized Primary turn、lease/fencing/dedupe、session/machine-loss recovery，以及 traces → candidate → baseline/held-out eval → Owner promotion → rollback 的离线 Evolution Plane。

三个阶段的固定红线相同：Primary 决定语义下一步；Supervisor 只执行机械边；任何后续阶段都不能把 status、event、memory 或 evaluator 升级为 authority。

### 7.1 R1 评审形成的原始启动建议

下面 P0–P6 是三方针对冻结 R1 形成的原始实施细节，继续保留用于 provenance 和安全前置证据。若其 “MVP” 或 “以后再决定” 表述与本节或 R2 冲突，以 R2 为准。

#### Historical P0 — 冻结讨论结果，不实施

本汇总已经作为候选 R1 评审证据保留；Owner 随后要求形成完整目标架构 R2。R2 仍不授权代码。

#### Historical P1 — 当前 delegation 安全前置 Change

独立处理 descendant env 与 orphan-child truth。它们是当前 transport 的边界问题，不应藏在
vNext Supervisor 大 Change 中。先写最小 RED fixtures，再决定修法。

#### Historical P2 — D0a Host wake spike

在 Owner 选定的第一个 Primary Host 上，只验证：

1. W1 最大可靠等待时长；
2. W2 完成 notification 是否恰好触发一次新 turn；
3. 自动注入的 payload 字节与内容；
4. Primary session 中断后的实际行为；
5. W3/W4 只做握手级研究，不能因此进入 Step 1 实现。

这是少量真实 provider 调用，需要新的精确授权；fake Host 无法证明 Host wake。

#### Historical P3 — D1 contract-first fake-host tests

先获得 RED baseline：

- N-way launch 与真实并发窗口；
- writable roots overlap / same worktree active-run rejection；
- immutable batch digest 与 DSL-like unknown-field rejection；
- barrier → one bounded attention → at-most-one semantic application；
- Primary idle model polling 为 0，progress/log 自动注入为 0；
- cancel fan-out；Supervisor kill/restart reconcile；no duplicate launch；
- `stalled` 与 `outcome_unknown` 真值表；
- descendant env scrub；orphan child 不得被假报 terminal；
- Supervisor 永不 merge、改 task completion、解释 finding 或创建下一 slice。

#### Historical P4 — D2 thin session-bound Supervisor

只实现通过 P3 所需的最小内部能力：

```text
run --wait
status
cancel
reconcile
```

复用现有 `delegate.cjs`、stable-result read、Host profile 与 fake ACP fixtures。不增加公共 Skill、
数据库、daemon、queue、journal、DAG、durable wake、自动 retry、auto-merge 或 auto-release。

#### Historical P5 — 真实切片分三步

1. **N=1 characterization**：同一 Supervisor 包装现有真实 delegation，证明没有行为回退；
2. **同 Host N=2**：两个 registered worktrees、两个 disjoint roots、真实时间窗口重叠、一次
   attention、串行集成、combined E2E 红转绿；
3. **异构 Profile v0**：Claude Primary、Codex Challenger/Reviewer、Kimi/ZCode Workers 只作为
   当前评估 fixture；保留 exact versions、transport maturity 和 ZCode acknowledgement。

Assurance Lane 在 delivery batch 通过后单独加入，不让 Challenger/Reviewer 问题污染第一条
Supervisor 因果链。

#### Historical P6 — 对比评估与删除门

比较现有 Ultra、Primary Solo、session-bound batch，以及必要的 safe ablation。只有 intent fidelity、
真实 E2E、恢复正确性和 operator burden 改善，且 capability tax 可接受，才晋升；否则删除
Supervisor，保留现有单 delegation 与 Host-native 能力。

## 8. R1 第一实现层的 defer list，不是 Target 删除项

以下列表原本混合了“后续阶段能力”和“全产品 non-goals”。R2 现已拆清：

**Step 1 暂不实现、但 Target Architecture 保留：**

- run-scoped durable conductor、W3/W4 qualified adapters；
- 多 attention replay 与 durable delivery sequence；
- 受合同约束的 Profile selection、multi-wave execution 和离线 Evolution Plane。

**全产品 non-goals：**

- 通用 DAG/Graph DSL、canvas 或 semantic scheduler；
- SQLite/workflow database、全局 daemon、queue 或 event broker；
- Supervisor-driven 或未授权的 provider selection、fallback、retry，以及任何自动 merge、commit、release 或 deploy；Primary 只可在当前 Grant + Role Contract 内作显式选择或降级；
- Reviewer canonical external receipt transport；
- 在同一 Change 中同时改 Research、路由、Supervisor、Review 与 self-evolution；
- 根据一次 trace 自动修改 Prompt/Skill/Hook/router。

## 9. Owner 修正后剩余的决策门

Owner 已明确选择 **完整 Target Architecture + 三阶段累积实现**，并拒绝孤立 MVP。当前仍需按顺序决定：

1. 是否接受 R2 的七平面产品架构、固定合同与 Step 1–3 边界；
2. 若接受，是否先另行授权独立 safety-precondition Change 处理 environment/orphan/effect enforcement，再用精确 provider 授权做 wake spike，最后才建立 Step 1 implementation Change；
3. 到 Step 3 之前，再决定哪些 accepted unattended use cases 值得引入 durable conductor 和 W4。

第 1 项只接受架构方向；不授权第 2 项的代码、provider 调用或其他 effect。第 3 项不再改变产品边界，但会决定 durable capability 是否具备真实 consumer、选择哪一种 Host API，以及相应威胁模型和评测成本。

## 10. 置信度

| 结论 | 置信度 | 依据 |
|---|---:|---|
| 不应建设第二 Harness、通用 DAG 或语义数据库 | 99% | 三方一致、当前权威边界与外部 donor 对照 |
| 应先定义完整 Target Architecture，再用最终合同实现 Step 1 闭环 | 98.5% | Owner 修正、三方对控制边界的共识、避免一次性 MVP 合同 |
| Primary 语义决策 / Supervisor 机械执行 | 99% | 当前 authority model、代码事实、三方一致 |
| 完整环境进入 Worker 是真实缺陷 | 99.9% | 四处当前源码链 + 独立复核 |
| `outcome_unknown` 当前仍需 fail-closed | 99% | nested detached Host + 缺失 child identity + 当前 cancel 行为 |
| 某个具体 Host 能以 W2/W3/W4 实现可靠 wake | 暂不高于 80% | 机制存在，但 exact version/live lifecycle 尚未统一 smoke |
| durable-run 应最终采用哪种 Host/API | 暂不高于 60% | 需求尚未接受，ACP/private API 能力均未完成逐 Host 验证 |

因此可以给出 98% 以上置信度的结论是**产品边界、Primary/Supervisor 分权和三阶段累积方法**，不能诚实地给某个尚未 live 验证的 wake adapter 或 durable transport 98% 置信度。

## 11. 外部参考

- [Claude Code Dynamic Workflows](https://code.claude.com/docs/en/workflows)
- [Claude Code cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Codex app-server](https://developers.openai.com/codex/app-server)
- [OpenAI Symphony](https://github.com/openai/symphony) 与 [SPEC](https://github.com/openai/symphony/blob/main/SPEC.md)
- [GSD Pi](https://github.com/open-gsd/gsd-pi)、[Auto mode](https://github.com/open-gsd/gsd-pi/blob/main/docs/user-docs/auto-mode.md)、[Subagents](https://github.com/open-gsd/gsd-pi/blob/main/docs/user-docs/subagents.md)
- [Open Dynamic Workflows](https://github.com/Suraj1235/open-dynamic-workflows)

这些项目只作为机制 donor。正式能力声明必须绑定 exact version 和当次 live smoke，不能从 README、
协议存在或一次 delegation success 推导生产可用。
