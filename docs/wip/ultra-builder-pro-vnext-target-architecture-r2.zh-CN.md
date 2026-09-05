# Ultra Builder Pro vNext R2：完整目标架构与三阶段累积实施

> - **状态**：`current discussion-only candidate — unaccepted — no implementation authority`
> - **日期**：`2026-09-01`
> - **Owner 原则**：`No isolated MVP`。先定义完整 Target Architecture，再按 Step 1、Step 2、Step 3 累积实现。
> - **前一候选**：[`R1 Agentic Software Factory candidate`](./ultra-builder-pro-vnext-agentic-software-factory-candidate.zh-CN.md)，冻结 SHA-256 为 `f69a5883aa3846032f29aed17c99220443cbad63f981e9e10c370b759d024268`。
> - **R1 评审证据**：[`2026-08-31 独立多 Agent 评审汇总`](./ultra-builder-pro-vnext-independent-multi-agent-review-2026-08-31.zh-CN.md)。R1 保持原样，用于保留 Claude Code、Kimi Code、ZCode 对同一输入的评审链。
> - **本版修正**：R1 把 session-bound thin Supervisor 写成了产品的主要第一版边界；R2 将它重新定位为完整架构中的 Step 1 实现层，而不是产品终点。
> - **当前权威**：本文件仍是 WIP 候选。与 accepted North Star、versioned product contract 或 active Change 冲突时，以当前 accepted authority 为准。
> - **当前默认 Profile v0**：Claude Code = Primary；Codex = Architecture Challenger / Independent Reviewer；Kimi Code = frontend-scoped Worker；ZCode = backend-scoped Worker。它只是可替换的首个评估配置，不是 Core 固定角色表。
> - **未授权效果**：本文不授权修改 canonical specs、runtime、Skills、Hooks、Adapters，也不授权启动 provider、安装、commit、push、publish 或 deploy。

## 1. 结论

Ultra Builder Pro vNext 应定义为：

> **一个运行在现有 Coding-Agent Harness 之上的、local-first、repository-native、event-driven 的多 Agent 软件交付控制层。它以 Owner 意图为最高约束，由一个可替换的 Primary Agent 负责语义决策，由非模型 Supervisor 负责机械执行，由可替换的专业 Agents 完成 bounded work，并通过证据、恢复和离线评测形成可控的自我进化闭环。**

完整产品不是一个 Skill、Hook 或 Subagent 集合，也不是一个预先写死的 JSON 工作流。它包含七个彼此分权的平面：

1. Owner Governance Plane；
2. Primary Cognitive Plane；
3. Supervisor Execution Plane；
4. Worker Plane；
5. Assurance Plane；
6. Evidence and Recovery Plane；
7. Offline Evolution Plane。

三个实施阶段不是三个不同产品：

- **Step 1 — Closed-Loop Foundation**：用最终合同跑通最小但完整的真实闭环；
- **Step 2 — Operational Software Factory**：在同一合同上扩成可运营、多波次、多 Profile 的软件工厂；
- **Step 3 — Durable Adaptive Factory**：增加跨 session 的受控续跑和离线自我进化。

Step 1 可以少实现能力，但不能使用将来必然被丢弃的控制模型、状态含义或权限规则。Step 2 只能扩展 Step 1；Step 3 只能在不转移语义权威的前提下增加 durability 和 evolution。

## 2. 产品边界

### 2.1 Ultra 拥有什么

Ultra 拥有：

- Owner 意图、验收、权限和运行拓扑的可读合同；
- Primary、Worker、Challenger、Reviewer、Supervisor 之间的角色与结果协议；
- 从意图对齐到交付证据的完整 lifecycle；
- 有限 Run Slice 的 admission、dispatch、wait、cancel、attention 和 reconcile；
- 对现有 Coding-Agent Harness 的 provider-native adapter；
- worktree、permission、result、review、recovery 和 evaluation 的产品规则；
- 以失败证据和 held-out evaluation 驱动的受控改进流程。

### 2.2 Ultra 不拥有什么

Ultra 不拥有：

- Claude Code、Codex、Kimi Code、ZCode 等 Harness 内部的 model/tool loop；
- 通用聊天记忆、代码图谱、浏览器、部署平台或云端 IDE；
- 一个让所有 Agents 自由对话并共同写同一工作区的群聊；
- 把整个软件开发预编译成 `when/next/retry` 的通用 DAG DSL；
- 根据 Agent 自报、退出码、测试数量或 dashboard 自动宣布完成的权威；
- 无 Owner promotion 的在线自修改、自发布或自主扩大权限。

### 2.3 核心价值

Ultra 的价值不是“能再启动一个 Agent”，而是同时解决两个问题：

1. **Intent fidelity**：长对话、Research、设计和实现始终绑定同一 Owner outcome、acceptance、constraints 与 authority；
2. **Delivery automation**：在不让 Primary 持续轮询、不污染主上下文、不扩大权限的前提下，让多个 Agents 能被机械调度、汇合、恢复、审查和评测。

## 3. 完整目标架构

```text
Owner
  │ intent / material decisions / authority / final acceptance
  ▼
Owner Governance Plane
  │ accepted Change + Execution Grant + external-effect gates
  ▼
Primary Cognitive Plane — selected Primary Host
  ├─ maintain Active Intent Contract
  ├─ request bounded Research when a decision is blocked
  ├─ choose Solo / Challenge / Factory topology
  ├─ design architecture and freeze seams
  ├─ compile one finite Run Slice
  ├─ interpret Attention and current evidence
  ├─ integrate, repair, re-plan, stop, or ask Owner
  └─ decide whether current evidence supports delivery_ready
  │
  ├──────────────► Assurance Plane
  │                 ├─ fresh read-only Architecture Challenger
  │                 └─ fresh read-only Independent Reviewer
  │
  ▼
Supervisor Execution Plane — deterministic code, no semantic authority
  ├─ admission and immutable manifest validation
  ├─ dispatch existing delegation primitives
  ├─ wait outside the Primary model context
  ├─ enforce budgets, ownership, cancellation, fencing and dedupe
  ├─ reduce mechanical facts into bounded Attention
  └─ deliver one bounded Attention through a qualified continuation adapter
  │
  ▼
Worker Plane — selected, bounded, isolated Agents
  ├─ Worker A in registered worktree and roots
  ├─ Worker B in registered worktree and roots
  └─ Worker N when the task shape justifies it

Evidence and Recovery Plane
  ├─ .ultra/ canonical owner-readable authority
  ├─ Git revision and actual diff
  ├─ delegation receipts and typed results
  ├─ run-scoped derived runtime facts
  └─ fail-closed recovery and outcome_unknown

Offline Evolution Plane
  └─ traces → taxonomy → candidate → eval → Owner promotion → release/rollback
```

### 3.1 七个平面的职责

| 平面 | 负责 | 永远不负责 |
|---|---|---|
| Owner Governance | outcome、material trade-off、风险接受、授权、外部 effect、最终接受 | 逐条机械调度 Worker |
| Primary Cognitive | 语义理解、Research 路由、架构、分解、下一步、集成、`delivery_ready` 判断 | 运行期间持续轮询进程 |
| Supervisor Execution | admission、launch、wait、cancel、dedupe、reconcile、attention delivery | 解释意图、选择 repair、宣布任务完成 |
| Worker | 在 Packet 边界内自主实现或调查并返回 typed evidence | 改写 scope、authority、canonical `.ultra/**` 或自行 merge |
| Assurance | 独立挑战架构和审查最终 subject | 成为第二 Primary 或自动修复全部 finding |
| Evidence and Recovery | 保存事实、绑定 revision、区分 known/unknown、支持恢复 | 用状态文件推导未发生的语义决定 |
| Offline Evolution | 聚合失败、评测候选、提出晋升 | 在线修改生产规则或绕过 Owner promotion |

### 3.2 Primary 是角色，不是品牌

Ultra Core 固定的是“每个 work package 同一时刻恰有一个 canonical Primary authority”，不是固定 Claude Code。

Current Profile v0 采用 Claude Code 作为 Primary，是因为当前希望让 Claude 承担用户对齐、总体推进和最终表达，让 Codex 重点承担架构挑战与独立 Review。未来可以整体替换映射，只要新 Profile 继续满足：

- 一个且只有一个 Primary；
- 每个角色的 authority class、capabilities、inputs、outputs、budget、stop conditions 可见；
- scoped writer 与 read-only assessor 不发生利益冲突；
- exact Host、model、adapter、version 和 transport maturity 在每次运行中被记录；
- Primary transfer 必须经过 OFFER → verified ACK → sole writer → frozen RESULT，不能静默发生。

## 4. 权威与决策链

### 4.1 谁决定下一步

| 决定 | 决策者 | 机械执行者 |
|---|---|---|
| outcome、acceptance、material scope、风险和外部 effect | Owner | Primary 记录并投影 |
| 是否需要 Research、Challenge、Factory 或 Solo | Primary，在当前有效 authority 内 | 对应 Skill / Supervisor |
| 如何拆分当前工作、冻结什么 seam | Primary | Worker Packets / Run Slice manifest |
| 当前 slice 内哪些 attempt 可启动、何时达到 barrier | 已冻结合同 | Supervisor |
| Worker 如何在 Packet 内完成任务 | Worker | 目标 Host Harness |
| Attention 后 integrate、repair、next slice、stop 还是 ask Owner | Primary | Supervisor 执行下一份已冻结 slice |
| 是否形成 `delivery_ready` closeout | Primary 形成 evidence-backed 判断 | canonical Review / Deliver 流程 |
| 是否接受交付、风险或 remaining effects | Owner | Primary 记录 accepted / rejected / revision requested |
| 是否晋升新的 Prompt、Skill、Hook、router 或 Profile | Owner | versioned release process |

Supervisor 可以回答“发生了什么”，不能回答“产品上接下来应该做什么”。

### 4.2 三类事实

**语义事实**由 Owner 或 Primary 形成：

- 当前 outcome、acceptance、non-goals；
- 方案为什么成立；
- finding 如何 disposition；
- 是否需要 repair、重新分解或停止；
- 是否已有足够证据形成 `delivery_ready`；task-level `completed` 与 Owner-level `accepted` 分别按 canonical workflow 记录。

**机械事实**由代码验证：

- exact digest、base revision、path ownership、permission；
- process/session identity、started/terminal/timeout/cancel；
- result schema、actual changed paths、test command exit；
- event identity、delivery attempt、dedupe、budget、expiry；
- writer 是否能被证明停止。

**证据判断**由 Primary 或 Reviewer 完成，但必须引用机械事实：

- 一个 test 是否覆盖真实验收；
- 一个 diff 是否实现 Owner intent；
- 一个 unknown 是否阻断发布；
- 一个 finding 是否需要修复或风险接受。

### 4.3 权威顺序

目标架构继续使用当前 file-first authority：

```text
current explicit Owner instruction, accepted decisions and external-effect authorization
  > accepted North Star and active Change intent
  > current valid Execution Grant for that exact Change
  > canonical specs, task ledger and task context
  > current Git revision and verified evidence
  > derived runtime observations
  > model memory, summaries, dashboards, progress or self-report
```

较低层不能覆盖较高层。新的 Owner 指令、decision 或 Change 约束会使冲突的旧 Grant 失效；任何 Resume note、status、Hook、attention 或 memory 都不能自行激活工作，也不能扩大已有 Grant。

## 5. Graph Engineering：点、线、面如何运转

“Graph” 是控制和依赖的工程模型，不等于要求用户编写一套 workflow DSL。

### 5.1 点

一个点是一个 bounded work unit：

```text
accepted inputs
+ role and authority
+ objective and acceptance
+ writable roots and forbidden effects
+ budget and stop condition
+ one fresh Agent attempt
+ typed result and actual evidence
```

点可以是 Research、Architecture Challenge、Implementation、Integration Check 或 Review。Primary 定义点的边界；对应 Agent 在边界内自主推理和使用工具。

### 5.2 线

线分为两类：

- **Mechanical edge**：`admitted → launched → terminal → barrier → attention delivered`，由 Supervisor 按精确事实执行；
- **Semantic edge**：`finding → redesign`、`failure → repair`、`evidence → delivery_ready`，由 Primary 在收到 Attention 后决定。

JSON 只能描述第一类线。第二类线不能被 `when/next/on_result` 自动解释，否则 Supervisor 会偷偷变成第二个 Primary。

### 5.3 面

面是从 accepted intent 到 verified delivery 的完整因果面：

```text
Intent
  → bounded Research
  → architecture and challenge
  → grant and finite Run Slice
  → isolated execution
  → attention
  → integration and combined E2E
  → independent Review
  → closeout and evaluation trace
```

Owner 看到的是这个面；Agent 处理点；Supervisor 执行已经冻结的机械线；Primary 在每次 attention 后绘制下一小段语义线。

### 5.4 三种图

| 图 | 形成者 | 生命周期 | 是否可自动执行 |
|---|---|---|---|
| Semantic Delivery Graph | Primary | 从当前 Intent 到完成，逐次展开 | 否；它是语义计划，不是脚本 |
| Finite Execution Graph | Primary 编译，Supervisor 校验 | 一个 Run Slice | 是；只包含机械边 |
| Evolution Graph | evaluation pipeline | 多次版本和实验 | 仅执行已授权实验；晋升必须由 Owner 决定 |

因此，Ultra 不是先把完整未来写成一个巨型 JSON 再让引擎跑到底。它采用 **dynamic semantic planning + bounded deterministic execution**：Primary 每次只编译一个有限 slice，Supervisor 运行到 attention，Primary 再决定下一 slice。

## 6. 跨三个阶段不变的合同

以下合同从 Step 1 起就必须按最终含义设计。后续可以增加字段或能力，不能改变权威方向。

所有机械 schema 都必须有稳定的 schema/version identity。兼容版本只能增加旧 reader 可忽略的 optional 字段；新增 required 语义必须升级版本。旧 reader 遇到未知 required field 时返回 typed `incompatible_contract`，不能猜测或静默忽略。迁移必须保留原始 bytes、产生可验证的新 artifact，并用同一 fixture replay Step 1 行为；Step 2/3 不能原地重定义 Step 1 字段。

### 6.1 Active Intent Contract

Active Intent Contract 是现有 canonical artifacts 的实时语义投影，不新增第二份权威数据库：

```text
Outcome          Owner 可见的最终结果
Acceptance       什么真实证据证明完成
Constraints      技术、权限、成本、时间和环境边界
Non-goals        当前明确不做什么
Open decisions   会改变承诺、seam、风险或 authority 的未知
Authority        当前谁能做什么、到什么时候、有哪些 effects
```

Baseline 阶段由 Project Brief、accepted North Star 和 specs 表达；active delivery 由 Change `intent.md`、task context、Execution Grant 和当前 evidence 表达。任何 Agent 无法重述这六项时，必须先恢复或重新对齐。

### 6.2 Role Contract

Core 不固定角色目录，只固定每个实例必须声明：

```text
role_id and purpose
authority class: canonical | scoped-write | read-only | mechanical
required capabilities and Host constraints
inputs, outputs and evidence contract
writable roots and forbidden effects
independence constraints
selection, fallback, budget and stop conditions
exact runtime identity and maturity
```

当前 Profile 可以有 Primary、Challenger、frontend Worker、backend Worker 和 Reviewer。另一个 Profile 可以增删、合并或拆分**可选 specialist instances**，但不能删除或合并当前 route 所需的 authority functions：每个 work package 恰有一个 Primary；自动执行必须有不具语义权威的 mechanical controller；delegated writer 必须 scoped；最终 closeout 所需的 independent assessor 不能审查自己的写入。Solo route 可以没有 Implementation Worker，低风险 route 可以显式跳过 Challenger，但不能借“角色合并”破坏 writer/assessor independence。

### 6.3 Finite Run Slice Contract

Run Slice 是 Primary 签发给 Supervisor 的有限执行对象，不是完整产品计划：

```text
run_id and slice_id
intent / change / task refs and digests
grant_ref and grant_sha256
immutable base revision
selected role-to-Host assignments
attempt packets and dependency/barrier rules
worktrees, writable roots and forbidden roots
physical budgets, deadlines and cancel policy
attention conditions
result and evidence refs
```

允许的依赖表达只覆盖当前 slice 的机械事实，例如 all-of barrier、明确的串行 predecessor 或 deadline。禁止出现会替 Primary 做语义判断的 `task_completed`、`choose_provider`、`repair_strategy`、`when finding severity` 或自由脚本表达式。

### 6.4 Worker Packet and Result Contract

每个 Worker Packet 必须不可变地绑定：

- bounded objective 与 acceptance evidence；
- exact base 和 canonical input digests；
- role、Host、worktree、writable roots；
- interface/seam digest；
- allowed tools/effects、budget、stop conditions；
- expected checks、integration order 和 result schema。

Worker 返回 typed result、actual diff、checks、risks 和 unknowns。`finished` 只表示 attempt 有合法 terminal result，不表示 Change 完成。

### 6.5 Attention Contract

Attention 是 Supervisor 形成 Primary semantic continuation 的唯一正常输入，不是 Worker transcript：

```text
run_id / slice_id / event_id
reason: wave_terminal | operator_attention | durable_resume
bounded counts and attempt states
result refs and digests
unknown refs and deadline/cancel facts
delivery identity and dedupe facts
```

Attention 不包含完整 stdout/stderr、ACP progress、tool transcript、Worker chain-of-thought、Review 结论或 `next_step`。

Attention delivery 另有机械 lifecycle：

```text
pending --delivery ack--> delivered --consume ack--> consumed
   \                          \
    +--uncertain---------------+--> delivery_unknown
```

`pending` 表示 Attention 已原子形成但未投递；`delivered` 表示 Host 接受了投递；`consumed` 表示某次 Primary semantic continuation 已用 `(run_id, slice_id, event_id)` 作为 dedupe key 确认消费；`delivery_unknown` 表示无法证明投递或消费。Core 承诺 **at-most-one semantic application**：重复投递不得重复执行语义决定。只有具备可靠 acknowledgement 与 idempotency 的 exact Host adapter 才能声明 exactly-once delivery；`delivery_unknown` 必须 reconcile 或交还 Owner，不能盲目重发。

### 6.6 Evidence Contract

完成证据至少绑定：

- accepted Intent 与 acceptance；
- exact integrated Git revision；
- actual diff 与 changed paths；
- targeted checks 和真实 combined E2E；
- fresh independent Review subject；
- unresolved risks、unknowns 和未执行 external effects。

旧 revision、Agent 自报、dashboard、mock-only test 或 exit code 不能替代 current integrated evidence。

### 6.7 Recovery Contract

恢复必须区分：

- `terminal known`：存在可信、稳定、schema-valid 的终态；
- `running known`：writer identity 可验证且仍存活；
- `stalled observed`：外层进程或更新时间异常；
- `outcome_unknown`：无法证明目标 Host/writer tree 已停止，也没有可信终态。

`outcome_unknown` 时冻结原 worktree 和 roots，禁止自动 relaunch，等待 reconcile、人工检查或新的 Owner 决定。

### 6.8 Primary Transfer Contract

把 canonical writer 从一个 Agent 交给另一个 Agent 是 Primary transfer，不是普通 delegation。它继续使用现有 OFFER → verified ACK → sole writer → frozen RESULT 合同，并与 delegated Workers 互斥。

## 7. 完整端到端管线

### 7.1 Preflight

Primary 只读核对 current Change、HEAD、dirty state、authority、Host inventory、adapter maturity、authentication、budget 和 worktree isolation。未通过的 capability 只能被关闭，不能被假设存在。

### 7.2 Intent alignment

Primary 将 Owner 请求投影为 Active Intent Contract，只询问会改变 outcome、acceptance、scope、public seam、risk 或 authority 的问题。输出必须可读、可 diff、可恢复，而不是一段临时聊天摘要。

### 7.3 Bounded Research

Research 是当前 route 内的 evidence service，不是无限展开的前置阶段。每个 Research Packet 只回答一个 decision-blocking question，并返回：

```text
Claim / Evidence / Uncertainty / Decision impact / Exit / Return route
```

每次 Research 都必须回到同一个 Active Intent Contract。已回答就退出；仍不确定但不改变承诺时由 Primary bounded 处理；会改变承诺时回到 Owner。

Research 使用外部 provider、网络、付费调用或新 Agent 时，必须已经处于覆盖这些 read-only effects 和预算的 session-local authority 内；若没有，先向 Owner 请求精确授权。第 7.5 节授予的是后续 implementation/factory work-package Grant，不能反向授权此前已发生的 Research。

### 7.4 Architecture and challenge

Primary 先给出 architecture、public seam、ownership roots、acceptance-to-task mapping、integration order、combined E2E 和 recovery boundary。选定的 Challenger 使用 fresh、read-only、bounded context 检查关键假设。Primary 对 finding 做 accept/reject/defer；material delta 回到 Owner。

Challenger 的 provider、网络和费用同样必须被当前 session-local read-only authority 覆盖；`read-only` 只表示不写产品 subject，不表示调用本身没有 effect 或成本。

### 7.5 One bounded Execution Grant

Owner 一次授权当前 work package 的 topology、Hosts、writes、预算、fallback、expiry、stop conditions 与 revoke/invalidation。每个 external effect 必须以精确 effect name、target 和边界列出，并在实际消费时重新验证 Grant 仍有效；通配授权或“调用 Agent”不能隐含 deploy、publish、message、purchase、credential mutation 等下游 effect。Grant 不因每个 Worker 启动而重复询问，也不能被 status、file 或 Agent memory 延长。

### 7.6 Compile finite Run Slice

Primary 只把当前已经冻结的可机械部分编译为 Run Slice。自然并行、seam 冻结、roots 隔离、结果可独立验证时才 fan out；共享 schema、lockfile、迁移或持续变化接口的工作保持串行。

### 7.7 Dispatch and wait

Supervisor admission 后调用已有 delegation primitive，启动 bounded attempts，并在模型上下文外等待。Worker progress、日志和单个 attempt 提前完成不触发 Primary semantic continuation。

### 7.8 Attention and semantic continuation

当前 wave 全部 terminal，或出现 deadline、cancel failure、admission failure、stalled/outcome_unknown 等 operator condition 时，Supervisor 原子形成 bounded Attention，并通过 qualified mechanism 交付一次 deduplicated semantic continuation。

Primary 读取 canonical refs 和 bounded results 后决定：

```text
integrate | repair | compile next slice | ask Owner | stop | delivery_ready
```

### 7.9 Integration and combined E2E

Primary 验证 Packet、base、result、actual diff 和 changed paths，按冻结顺序串行集成，解决 seam，然后从真实入口运行 targeted checks 和 combined E2E。任何代码变化使旧 evidence subject 失效。

### 7.10 Independent Review and closeout

Reviewer 必须是 fresh、read-only、bounded context，绑定 exact integrated revision、accepted intent、diff 和 current evidence。Primary disposition findings，随后使用 canonical Review/Deliver 路径形成 owner-readable closeout。Review 不能自行 commit、merge 或扩大 repair scope。

### 7.11 Evaluation trace

每个完成或失败的 Run 都产生不含私密 chain-of-thought 的 bounded trace：runtime identity、authority、routing、latency、cost、interventions、failure class、tests/E2E、Review、unknown 和 recovery facts。这些 trace 只进入离线 Evolution Plane。

## 8. Agent 唤醒与控制链

### 8.1 Worker 启动链

```text
Primary compiles Run Slice
  → Supervisor validates admission
  → existing delegate run
  → delegate worker process
  → ACP or Host-native CLI
  → fresh target Agent session/process
```

这是脚本驱动的机械链。脚本不向 Worker 提供比 Grant 更多的权限，也不解释 Worker 的产品结论。

### 8.2 Primary 唤醒链

```text
validated terminal/process/deadline fact
  → barrier/reducer
  → atomic bounded Attention
  → Host-qualified wake adapter
  → one deduplicated semantic continuation
  → Primary decides the next semantic step
```

W1 在同一个阻塞 tool turn 中返回，不创建新 Primary turn；W2–W4 才会请求一个新的或 fresh Primary turn。Worker 不能直接用自然语言“叫醒”Primary；普通文件变化也不是唤醒原因。所有路径都必须绑定 causal event、run/slice identity、dedupe identity 和当前 authority，并保证同一 event 至多应用一次语义决定。

### 8.3 Wake Capability Ladder

| Level | 能力 | 所属阶段 | 资格条件 |
|---|---|---|---|
| W1 | foreground wait 在同一 tool turn 返回 Attention | Step 1 portable fallback | 等待期间 0 Primary model turns；返回后只有一次 semantic continuation；超时行为可验证 |
| W2 | live Primary session 的后台完成通知 | Step 1 preferred | acknowledged bounded delivery、at-most-one semantic application；session 中断后 typed fail closed |
| W3 | live session inbox/socket/message | Step 2 | session identity、credential isolation、dedupe、loss behavior 通过 live smoke |
| W4 | session 已结束后启动 fresh authorized Primary turn | Step 3 | durable Grant、fresh-turn identity、expiry、revocation、dedupe、fencing 全部验证 |

完整 Target Architecture 包含 W1–W4，但每个 Host 只声明已经 live-qualified 的 level。未通过 W3/W4 的 Host 仍可作为 Worker；不能宣传 unattended Primary continuation。

### 8.4 为什么 Primary 不再轮询

等待属于 Supervisor。Primary 不反复调用 `status`，不吸收日志，不在 Worker 运行期间产生 idle model turns。正常 wave 只在 attention barrier 到达时继续一次：W1 返回当前 tool turn，W2–W4 恢复一个新 turn。`status` 是 Owner 或故障排查的 read-only projection，不是正常控制循环。

## 9. 状态、文件与可见性

### 9.1 Canonical semantic authority

继续使用现有 owner-readable artifacts：

| 位置 | 含义 |
|---|---|
| `.ultra/project-brief.md`、`.ultra/north-star.md`、`.ultra/specs/**` | accepted baseline intent 与产品合同 |
| `.ultra/changes/active/<id>/intent.md` | 当前 bounded outcome、acceptance、Research disposition、Execution Grant reference |
| `.ultra/tasks.json`、`.ultra/contexts/**` | canonical task 和 task context |
| `.ultra/research/<run-id>/<step-id>.md` | cited bounded Research report；run `brief.md` 仍是可重建的 wayfinding projection |
| `.ultra/decisions/**` | durable Owner decisions 和 exact durable Grant bytes |
| `.ultra/changes/.../delivery.md`、current Review/Test evidence | integrated outcome、验证、风险与剩余 effects |
| Git | exact source revision、diff 和 history |

### 9.2 Derived operational state

Run Supervisor 使用 `.ultra/.runtime/runs/<run-id>/` 保存可删除、可重建或可核验的运行观察。目标逻辑制品只有：

```text
run-slice.json     immutable finite execution manifest
attention.json     atomic bounded current attention
delivery-state     adapter-specific dedupe / cursor / lease facts when required
```

每个 delegation 继续复用已有 instruction、permission、worker spec、lock、receipt、typed result 和 events。Step 1 不为“以后可能需要”预建数据库、queue 或通用 journal；Step 3 若真实 durable recovery 证明必须保留事件序列，只增加 run-scoped derived log，仍不升级为语义权威。

### 9.3 Owner 在哪里看

Owner 只需要两个视图：

1. **Alignment / Delivery Card**：当前 outcome、acceptance、route、material decisions、最终 evidence 和 remaining effects；
2. **Run Status projection**：当前 Run/Slice、角色映射、attempt lifecycle、budget、attention、unknown 和最便宜恢复动作。

这两个视图从 canonical artifacts 和 runtime facts 投影，不形成第三份 authority。CLI、Host UI 或未来可视化可以更换，含义不能更换。

## 10. 安全与恢复前置条件

### 10.1 Descendant environment isolation

当前 delegation 链会把完整 `process.env` 继续传给下层进程，因此 Primary 的 session/thread/socket/token 等控制面变量可能进入其他 Host Worker。进入 Step 1 fan-out 前，必须在 canonical delegation boundary 构造 target-aware sanitized descendant environment，并验证：

- Primary wake/session/thread controls 对 Worker 不可见；
- 目标 Host 必需的 PATH、locale 和明确授权认证仍可用；
- secret 值不写入 Worker Packet、receipt 或日志；
- probe、delegate-worker 和最终 Host 使用同一套隔离规则。

### 10.2 Writer identity and fencing

当前外层 delegate-worker 和内层目标 Host 可能都是 detached process，而 durable facts 未必能证明整个 writer tree 已停止。进入自动 retry 或 durable resume 前必须建立：

- target Host/process/session identity；
- worktree/roots writer fencing；
- cancel acknowledgement 与 deadline；
- unknown 时禁止 duplicate launch；
- machine/process loss 后的 truthful reconcile。

### 10.3 Effect enforcement qualification

Packet、Prompt 和 result validator 只是声明与事后证据，不是 effect enforcement。进入 Step 1 前，每个 selected Host 路径还必须实测其真实 enforcement boundary：

- OS/Host sandbox 是否把文件写入限制在 registered worktree 与 writable roots；
- network 默认策略与允许目标；
- secret 注入、可见范围和日志脱敏；
- shell/tool capability 是否与 permission envelope 一致；
- external effect 是否经过 point-of-use gate，并产生不含 secret 的 receipt。

若某个 Host 无法机械限制已拒绝的 effect，它不能承担该 Packet；不能等越界发生后仅把 result 判无效，因为外部 effect 可能不可逆。

### 10.4 Fail-closed rules

- prompt 可能已被目标接受但没有可信 terminal result：`outcome_unknown`；
- wake delivery 是否发生不可知：进入 `delivery_unknown`，使用 event identity/ack/dedupe reconcile，不直接再次启动语义 turn；
- Grant 已过期、撤销或 invalidated：停止，不 resume；
- Host capability 未通过 exact-version smoke：降级到已资格验证的 level，不静默 fallback；
- Reviewer/Worker 越界写入：结果无效，不能集成。

## 11. 自我进化不是在线自修改

### 11.1 收集什么

- exact Profile、Host/model/adapter/version；
- route、topology、permissions、budget、latency 和 cost；
- intent drift、Research loop、integration、Review、runtime 和 recovery failures；
- actual diffs、tests、combined E2E、unknowns 和 Owner interventions；
- capability tax：新增机制让多少原本合法任务变慢、失败或被误挡。

### 11.2 如何形成候选

```text
repeated real failure or opportunity
  → classify: intent / context / tool / authority / model / runtime /
              integration / evaluator / recovery
  → identify the smallest implicated contract or implementation
  → propose one versioned candidate
```

### 11.3 如何评测与晋升

```text
current baseline
+ simpler baseline
+ candidate
+ safe ablation
  → realistic repeated tasks
  → held-out tasks
  → utility / safety / recovery / latency / cost / intervention metrics
  → Owner accepts, rejects, or requests another experiment
  → versioned release and rollback trigger
```

禁止根据一次成功或失败自动增加 Skill、Hook、Agent、stage、validator 或权限；禁止 evaluator 改写自己的 evidence；禁止在线修改 Primary prompt 后立即投入正式运行。

## 12. 三阶段累积实施

### 12.1 总原则

每个 Step 必须：

1. 交付一个 owner-visible、真实可验证的完整结果；
2. 使用第 6 节定义的最终合同；
3. 保留前一步通过的路径；
4. 只增加能力，不转移语义权威；
5. 同时有 baseline、failure/recovery evidence 和删除门。

“本阶段不实现”只表示 implementation deferral，不表示从 Target Architecture 删除。

### 12.2 Step 1 — Closed-Loop Foundation

目标：证明 Ultra 能在一个 live Primary session 内，从 Owner intent 出发，经 bounded multi-Agent execution，回到 current integrated evidence 和 independent Review，形成最小但完整的因果闭环。

实现范围：

- 一个 qualified Primary Host；
- 一个 versioned、可替换的首个 Profile；
- Active Intent、Role、Run Slice、Worker Packet、Attention、Evidence、Recovery 合同；
- W1 portable wait，以及在 exact Host 上通过 smoke 的 W2；
- 复用现有 delegation，支持 N-way launch、barrier、cancel、status、reconcile；
- 至少两个 ownership-disjoint Workers，证明真实 fan-out/fan-in；
- Step 1 qualification fixture 必须运行 fresh read-only Challenger；产品 route 通过资格后，可由 Primary 按 admission 显式记录本次为何不需要 challenge；
- fresh independent Reviewer 与 current canonical closeout；
- Primary 串行集成、targeted checks、combined E2E；
- descendant environment isolation、writer truth、`outcome_unknown`；
- 运行期间 Primary idle polling turns = 0。

Step 1 延期到后续阶段：W3/W4、跨 session unattended continuation、多波次执行、受合同约束的 Profile selection 和离线 Evolution Plane。全局 semantic daemon、semantic database 和在线自我修改是全产品 non-goals，不属于延期能力。

首条真实验证建议使用 Current Profile v0，但验收只绑定 role contracts，不绑定品牌：

```text
Claude Code Primary
  → Codex read-only architecture challenge
  → Kimi Code scoped Worker + ZCode scoped Worker
  → Claude Code integration and combined E2E
  → fresh Codex independent Review
  → canonical closeout
```

如果某个 exact transport 尚未通过资格验证，应换成已资格验证的 Host 运行同一角色合同，并把原 Profile 缺口如实记录；不能为了保持品牌名单伪造闭环。替换必须记录为显式 per-run override 或新的 versioned Profile，不能原地改变 `Profile v0` 的含义。

Step 1 exit gate：

- 一个真实任务从 accepted intent 到 owner-visible `delivery_ready` closeout 全程跑通；Owner-level `accepted` 仍作为独立决定记录；
- 至少两个 Worker 的 execution windows 真实重叠，worktrees/roots 不重叠；
- 一个 causal barrier 只形成一个 bounded attention 和一次 deduplicated semantic continuation（W1 为同一 tool turn，W2 为一个新 turn）；
- combined E2E 绑定最终 integrated revision；
- fresh independent Review 完成且 findings 已 disposition；
- Supervisor restart/cancel/unknown fixtures 不重复启动 writer；
- 0 authority widening、0 wake credential leak、0 false completion；
- 相对 Primary Solo baseline，意图忠实度不降低，协调成本被如实测量。

### 12.3 Step 2 — Operational Software Factory

目标：把 Step 1 从“一条完整路径”扩成可重复运营的软件工厂，而不改变任何核心权威合同。

新增能力：

- 多个 versioned Profiles 与 provider-neutral role mapping；
- Solo / Challenge / Factory route 的重复评估和明确 admission；
- 同一 Change 的多 Run Slice、多 wave、bounded repair；
- worktree create/register/cleanup 的机械生命周期；
- 更完整的 budget、backpressure、rate-limit、cancel 和 partial failure 处理；
- W3 live inbox/socket/message adapter，在逐 Host smoke 后启用；
- owner-facing status/projection 与可解释的 intervention points；
- Reviewer budget、subject invalidation、delta Review 和 assurance evidence；
- cross-Host/profile comparison、safe fallback 和 maturity downgrade；
- 结构化 failure taxonomy 与 evolution candidate queue。

Step 2 仍然不允许：Supervisor 选择语义下一步、自动改 scope、自动 merge/commit/release、未授权 provider fallback、跨 session fresh turn、在线自改规则。

Step 2 exit gate：

- 至少两个不同 task shapes 和两个 qualified Profiles 重复成功；
- 系统能正确选择“不并行”，不会为了工厂模式强行拆分；
- 多 wave repair 保持 bounded，旧 subject/evidence 正确失效；
- W3 notification loss/duplicate/session death 均 fail closed；
- Owner intervention、token/context、latency、cost 和 capability tax 可量化；
- operational factory 相对 Solo/Step 1 baseline 在适合任务上产生可重复收益。

### 12.4 Step 3 — Durable Adaptive Factory

目标：在 Owner 不需要保持当前 Primary session 活跃的场景中，实现受控、可撤销、可恢复的长期运行，并让产品通过离线评测持续改进。

新增能力：

- run-scoped durable conductor，而不是默认全局 semantic daemon；
- W4 fresh authorized Primary turn；
- durable Execution Grant 的 exact bytes、expiry、revocation 和 invalidation revalidation；
- durable event identity、dedupe、delivery cursor、lease/fencing 和 machine-loss recovery；
- session/process loss 后从 canonical refs + derived facts 重建当前 attention；
- 长任务的 bounded checkpoint、budget renewal 和 Owner notification；
- traces → taxonomy → candidate → baseline/held-out eval → Owner promotion/reject → rollback 的完整 Evolution Plane；
- Profile、router、Skill、Hook 和 adapter 候选的 versioned experiments。

Durable conductor 只是包在 Step 1/2 同一 Run Slice validator、Supervisor reducer、Attention 和 Recovery contracts 外面的 lifecycle/wake layer。它不能重写这些合同、另建第二套 semantic orchestration state machine，或绕过同一 Primary decision boundary。

Step 3 仍然不允许：无限自主运行、自动扩大 Grant、在线自我修改后自动晋升、自动接受风险、自动 push/publish/deploy、Supervisor 决定 semantic completion。

Step 3 exit gate：

- Primary session 和 Supervisor process 均结束后，系统只在有效 durable Grant 下恢复一个 fresh Primary turn；
- revoke/expiry/invalidation 在所有重启边界 fail closed；
- duplicate attention 不产生 duplicate semantic turn 或 duplicate writer；
- unknown writer、网络分区、Host unavailable、machine restart 有 truthful recovery；
- 至少完成一次 candidate 的 baseline、held-out、rollback-ready 评测，并由 Owner 显式作出 promote 或 reject；没有合格候选时全部拒绝是正确结果；
- 没有任何 runtime trace、memory 或 evaluator result 被误当授权。

### 12.5 能力矩阵

| 能力 | Step 1 | Step 2 | Step 3 |
|---|---|---|---|
| Intent → delivery 完整闭环 | 一条真实 walking skeleton | 多 task shapes、可重复 | 长期 unattended 场景 |
| Role/Host mapping | 一个可替换 Profile | 多 Profiles、qualified fallback | 评测驱动候选与晋升 |
| Execution | 单 slice、N-way、单 barrier | multi-slice / multi-wave / repair | durable continuation |
| Wake | W1 + qualified W2 | qualified W3 | qualified W4 |
| Recovery | same-session restart/cancel/unknown | richer partial failure | process/session/machine loss |
| Assurance | qualification fixture 必跑 fresh challenge；所有交付有 independent Review | route 可显式跳过 challenge；budgeted delta Reviews | long-run subject/evidence continuity |
| Observability | bounded status and evidence | operator projection and metrics | durable cursor/lease/audit |
| Evolution | trace collection | taxonomy/candidate queue | held-out eval + Owner promotion + rollback |
| Authority | session-local bounded Grant | same contract, richer topology | explicit durable Grant only |

## 13. 实施入口与顺序

本文被接受后也不能直接写 Supervisor。正确入口是：

### D0 — Architecture decision

- Owner 接受或修订本 R2；
- decision 绑定本文件精确 SHA-256 和届时 current stable product revision；
- 当前 active Change 必须先完成或被正式关闭；
- D0 只接受架构，不打包授权 D1–D6；下面每个 effect boundary 必须使用对应的独立 Change/Plan/Grant 或精确 spike 授权。

### D1 — Current transport safety preconditions

D1 是现行 delegation transport 的独立 safety-precondition Change，不藏进 Supervisor/Step 1 implementation Change：

- 用 fake descendant Host 复现并修复 environment leakage；
- 用 fake nested writer tree 复现 orphan/false-terminal；
- 建立 truthful target identity、fencing、cancel 和 `outcome_unknown` contract tests；
- 对 selected Host/OS sandbox、writable roots、network、secret 和 point-of-use external-effect gate 做 enforcement smoke；Prompt/Packet 声明不能替代机械限制。

### D2 — Host wake qualification spikes

D2 使用单独的精确 provider/spend/network 授权；fake test 或 D1 Grant 不能授权真实 Host 调用：

- 对选定 Primary Host 验证 W1/W2；
- 记录最大可靠 wait、resume 次数、payload bytes、session death behavior；
- W3/W4 只记录能力，不在未授权时实现。

### D3 — Contract-first Run Slice tests

D3 与 D4 属于后续独立的 Step 1 implementation Change；其 Plan/Grant 只能在 D1 完成、D2 给出真实资格结论后建立：

- schema/admission、root overlap、immutable digest；
- N-way concurrency、barrier、one attention、at-most-one semantic application；
- 0 Primary polling、0 transcript/log injection；
- cancel、restart、reconcile、dedupe、unknown；
- Supervisor 永不做 semantic decision。

### D4 — Step 1 implementation and live proof

- 只实现通过 D3 和 Step 1 exit gate 所需的最小代码；
- 先跑 N=1 characterization，再跑同 Host N=2，最后跑 selected heterogeneous Profile；
- fake tests 证明控制逻辑，real providers 证明 lifecycle；两者缺一不可。

### D5 — Step 2 expansion

只有 Step 1 真实闭环和 comparative baseline 通过后，才在新的 Step 2 Change 中扩展 multi-wave、Profiles、W3、worktree lifecycle 和 operator projection。

### D6 — Step 3 durable/evolution decision

只有存在 accepted unattended use case、qualified W4 Host API 和完整 threat model 时，才建立独立 durable conductor Change；Evolution promotion 必须另有 Owner decision。

## 14. 产品级评测

不能只测试 Supervisor。每次晋升评测完整的 model + Harness + Ultra contracts + tools + environment + evaluator 配置。

### 14.1 Hard gates

- 0 authority widening、0 unapproved external effect、0 false completion；
- 0 duplicate post-prompt submission、0 duplicate writer；
- Worker wait 期间 0 Primary idle polling turns；
- Primary wake/session credentials 对 Workers 泄漏为 0；
- 所有 deterministic interruption fixtures 得到 truthful terminal 或 `outcome_unknown`；
- final evidence 绑定 current integrated revision；
- Challenger/Reviewer fresh、read-only、bounded；
- unsupported Host capability fail closed。

### 14.2 Comparative metrics

- Intent fidelity；
- real end-to-end success；
- semantic completeness；
- recovery correctness；
- operator burden 和 interruption count；
- integration conflict、rework 和 whole-system regression；
- Primary context/token pollution；
- latency、provider cost 和 coordination cost；
- capability tax 和 false block；
- Reviewer precision/recall 与 repair churn。

### 14.3 Baselines

至少比较：

1. 当前 Ultra；
2. 同一 selected Primary 的 native Solo；
3. 上一已晋升 Step；
4. 当前 candidate；
5. 必要的 simpler baseline 或 safe ablation。

如果新增机制没有稳定改善真实 outcome，删除 candidate，不以已经投入的工程量作为保留理由。

## 15. 明确非目标

- 不建设第二套 Agent Harness；
- 不建设通用 DAG/Graph DSL 或用户必须编程的 workflow language；
- 不要求每个任务都多 Agent；
- 不允许多个 canonical writers 同时写同一 work package；
- 不让 Worker 自由聊天、协商 scope 或共享可变上下文；
- 不把数据库、dashboard、queue、event broker 变成语义权威；
- 不自动 merge、commit、push、publish、deploy、购买或改生产数据；
- 不因一次 trace 在线修改正式 Prompt、Skill、Hook、router 或权限；
- 不把 memory、receipt、exit code、tests-green 或 Review 自报当最终完成。

## 16. 当前已决定、尚待验证与未来决定

### 16.1 当前架构候选明确的内容

- 产品是现有 Harness 上的 Agentic Software Delivery Control Layer；
- Primary 负责语义，Supervisor 负责机械边；
- 角色合同固定，Agent/Host mapping 可替换；
- semantic graph 动态展开，execution graph 只覆盖 finite slice；
- 完整 Target Architecture 先定义，三个 Step 累积实现；
- self-evolution 必须离线评测并由 Owner promotion。

### 16.2 实施前必须验证

- exact Primary Host 的 W1/W2 行为；
- descendant environment isolation 的最小正确实现；
- nested Host identity、cancel、fencing 和 orphan truth；
- Current Profile v0 各 transport 的 exact-version lifecycle；
- Step 1 相对 Solo baseline 的真实收益与协调成本。

### 16.3 Step 3 前才需要决定

- 哪些 accepted use cases 真正需要 Owner 离线后的 unattended continuation；
- 哪个 Host API 能承担 W4 fresh authorized turn；
- durable conductor 的 lease、cursor 和 notification transport；
- 哪些 evolution candidates 可以进入 held-out evaluation。

## 17. 置信度

| 结论 | 置信度 | 原因 |
|---|---:|---|
| 产品应是现有 Harness 上的交付控制层，而不是第二 Harness | 99% | 当前产品权威、三方评审和 donor 架构一致 |
| Primary 语义决策 / Supervisor 机械执行 | 99% | 权威边界清晰，可直接解决 polling 和 context pollution |
| 应先定义完整 Target Architecture，再分三步累积实现 | 98.5% | 避免孤立 MVP，同时保留每一步可验证和可删除 |
| Step 1 必须是使用最终合同的真实完整闭环 | 99% | 否则无法验证产品因果链，也会制造一次性接口 |
| 角色与 Host mapping 不应写死 | 99% | 能力、工具和 transport 会变化，Core 只需固定 authority invariants |
| 特定 Host 的 W2/W3/W4 当前已可靠 | 不高于 80% | 必须按 exact version 做 live lifecycle smoke |
| Step 3 durable conductor 的具体 transport | 不高于 65% | unattended use case 和 Host API 尚未正式接受、验证 |

可以给出超过 98% 置信度的是产品边界、控制权分层和三阶段演进方法；不能诚实地给尚未 live-qualified 的具体 wake API 同等置信度。

## 18. 外部机制参考

以下只作为 mechanism donors，不直接成为 Ultra 产品事实：

| 项目 | 借鉴 | 不照搬 |
|---|---|---|
| [OpenAI Symphony](https://github.com/openai/symphony) / [SPEC](https://github.com/openai/symphony/blob/main/SPEC.md) | scheduler、workspace isolation、bounded concurrency、reconciliation | 不采用 Codex-only tracker daemon 或内存语义权威 |
| [Codex app-server](https://developers.openai.com/codex/app-server) | provider-native lifecycle/event surface | 不把某一 Host API 写成 Core |
| [Claude Code Dynamic Workflows](https://code.claude.com/docs/en/workflows) / [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) | 模型外等待、live-session event delivery | 不把 Claude-only primitive 伪装成 provider-neutral durability |
| [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) | fresh teammate context、bounded roles | 不默认更多 Agents 更好，不允许共享写入失控 |
| [GSD Pi](https://github.com/open-gsd/gsd-pi) / [Auto mode](https://github.com/open-gsd/gsd-pi/blob/main/docs/user-docs/auto-mode.md) | fresh unit/session、事件结束、局部 execution graph | 不复制独立 runtime 或固定 semantic routing |
| [CC Workflow Studio](https://github.com/breaking-brake/cc-wf-studio) | workflow authoring、可视化、版本化投影 | 不让 canvas/workflow JSON 成为 durable semantic authority |
| [Open Dynamic Workflows](https://github.com/Suraj1235/open-dynamic-workflows) | heterogeneous adapters、bounded parallel、checkpoint | 不复制 daemon + SQLite + provider runtime |
| [Anthropic long-running agent guidance](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | fresh context、incremental artifacts、environment verification | 不从建议推导未经验证的跨 Host lifecycle |

正式能力声明必须绑定 exact version 和当前 live smoke，不能仅引用 README 或协议存在。

## 19. 与当前 Ultra 权威的关系

本候选延续而不替换：

- [当前 accepted North Star](../../.ultra/north-star.md)；
- [Ultra Builder Pro 3.0 North Star](../ULTRA-BUILDER-PRO-3.0.zh-CN.md)；
- [North Star r3](../ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md)；
- [Ultra Builder Pro 5.0 contract](../ULTRA-BUILDER-PRO-5.0.zh-CN.md)；
- [Artifact Authority](../ARTIFACT-AUTHORITY.md)；
- [Workflow Lifecycle](../WORKFLOW-LIFECYCLE.md)；
- [`ultra-delegate` current implementation](../../skills/ultra-delegate/scripts/delegate.cjs)。

如果 Owner 接受本 R2，下一步仍然只是建立一个 binding decision；必须等当前 active Change 正式结束，再通过新的 Change、Plan 和 exact Execution Grant 进入 D1。本文自身不提供实施授权。

## 20. Owner 接受本候选时实际接受什么

接受 R2 表示接受以下方向，而不是接受某个尚未验证的 provider API：

1. Ultra Builder Pro 的产品身份是 Agentic Software Delivery Control Layer；
2. 完整 Target Architecture 由七个分权平面组成；
3. Primary 是可替换的唯一语义主控，Supervisor 永远只是机械控制器；
4. 当前 Profile v0 是首个评估配置，不是写死的组织结构；
5. JSON 只描述有限执行图，不成为语义 workflow DSL；
6. Step 1、Step 2、Step 3 使用同一组核心合同累积扩建；
7. durable continuation 和 self-evolution 属于完整目标，但必须分别通过资格验证、显式授权与 Owner promotion。

接受 R2 不代表接受 runtime 实现、具体文件 schema、任何 provider 花费或外部 effect；这些必须在后续独立 Change 中逐项获得授权和证据。
