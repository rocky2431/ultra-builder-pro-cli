# Ultra Builder Pro vNext 候选产品架构：事件驱动、可替换角色的软件工厂

> - **状态**：`discussion-only candidate — unaccepted — no implementation authority`
> - **日期**：`2026-08-31`
> - **仓库观察点**：当前 branch HEAD 为 `adb7bfe89f40e107d0c9c490076a6e74294b9337`，另有尚未完成正式 Review 的 dirty 5.0.2 authority-reconciliation worktree；这些 dirty bytes 不是稳定产品基线。
> - **当前权威**：`.ultra/north-star.md` revision `north-star-v2-r3` 与已接受的 Ultra 5.0 产品合同。
> - **用途**：比较、讨论和收敛 vNext 产品形态；不是当前产品事实、Execution Grant、任务计划或实施授权。
> - **当前能力**：当前 Ultra 每次可启动一个 bounded delegated worker，并已有 typed terminal result、permission envelope、隔离 worktree 和 actual Git diff 验证。
> - **尚未实现或证明**：role-based orchestration、batch execution、真实 multi-worker 并发、run-level attention/reconcile、Primary wake、aggregate recovery 和完整多 Agent 交付路径。
> - **当前默认 Factory Profile v0（拓扑与映射均可替换）**：Primary = Claude Code；Architecture Challenger / Independent Reviewer = Codex；frontend-scoped Worker = Kimi Code；backend-scoped Worker = ZCode。它只是第一条评估配置，不属于 Ultra Core；以后可以更换任一 Agent，也可以增删、合并或重定义可选角色。
> - **正式接受绑定**：未来 decision 必须绑定本文精确 SHA-256 与届时 terminal 的 5.0.2 revision，不能绑定当前变化中的 dirty worktree。
> - **进入实施的条件**：Owner 明确接受候选方向；随后通过一个独立的新 Change、任务计划和 Execution Grant 投影。
> - **未授权效果**：本文不授权修改 canonical specs、启动 Agent/provider、安装、commit、push、tag、publish 或 deploy。
> - **与当前工作的关系**：本文不属于正在收尾的 `chg-ultra-5-0-2-authority-reconciliation`，不改变其 scope、task、evidence 或 release 状态。

## 1. 结论

Ultra Builder Pro vNext 应定义为：

> **一个运行在现有 Coding-Agent Harness 之上的、local-first、repository-native、event-driven 的多 Agent 交付控制层：Primary Agent 把 Owner 意图动态编译成有限 Run Slice；非模型 Run Supervisor 执行启动、等待、取消和恢复等机械边；只有形成 Attention Event 时才恢复 Primary，由它决定下一步并对最终交付负责。**

它不是：

- 一组继续增长的 Skill、Hook 和 Subagent；
- 一个静态 DAG 或可视化工作流产品；
- 一个替代 Claude Code、Codex、Kimi Code、ZCode 等现有 Harness 的新模型执行器；
- 一个常驻 daemon、云端任务平台或语义状态数据库；
- 一个让多个 Agent 自由聊天、共同修改同一工作区的 Agent 群；
- 一个根据 Agent 自报、退出码或测试数量自动宣布成功的 supervisor。

vNext 保留当前 Ultra Core 的 file-first authority、Host-native Skills、ACP-first
delegation、隔离 worktree、permission envelope、typed result 和 Git diff 验证。第一阶段只补
一项连贯能力：**把多个现有 delegation 组成一个可观察、可取消、可恢复的有限 Run Slice，并在
机械 barrier 到达时用一个 bounded Attention Envelope 因果地恢复 Primary**。

这里的 “Harness” 只表示 Ultra 为现有 Harness 补充交付协议和控制层，不表示 Ultra 再实现一套
model/tool loop。更准确的产品类别是 **Agentic Software Delivery Control Layer**。

## 2. 要解决的问题与可观察结果

### 2.1 当前问题

| 问题 | 直接表现 | vNext 需要改变什么 |
|---|---|---|
| 意图在长对话和 Research 中漂移 | 讨论积累很多材料，但没人能简洁回答当前问题、未决决定和退出条件 | 所有工作持续绑定一个 Active Intent Contract；Research 只回答阻断当前决定的问题 |
| 工作流只有方法，没有完整运行管线 | Skill 能说明怎么做，单次 delegation 能启动 Agent，但不能成组调度、恢复和取消 | 增加薄的 Run Supervisor，聚合现有 delegation lifecycle |
| Primary 等待 Worker 时反复抓状态 | 每次 status/progress 都产生模型 turn，并把日志和中间事实带进主上下文 | 等待和轮询全部移到非模型 Supervisor；一个 wave 只在 Attention Event 时恢复 Primary 一次 |
| 多 Agent 的角色和权威混淆 | Primary、worker、reviewer 都可能被误认为任务拥有者 | 每个 Run 明确一个 Primary；Challenger/Reviewer 只读；Workers 只执行 bounded Worker Packets |
| 运行状态容易被误当业务完成 | `finished`、退出码 0、测试绿色可能被升级为 task 完成 | Supervisor 只报告运行事实；Primary 根据当前代码、验收和 Review 证据决定完成 |
| “自我进化”容易变成配置漂移 | 一次失败就增加规则、Hook、角色或 Prompt | 所有 harness 改动通过失败分类、候选改动、留出评测、Owner promotion 和回滚进入产品 |

### 2.2 vNext 成功时 Owner 能看到

1. 当前要交付什么、如何验收、哪些明确不做；
2. 为什么启用或不启用多 Agent；
3. 每个 Agent 的目标、输入、写入范围、预算、停止条件和实际结果；
4. Supervisor 中断后，哪些动作发生过、哪些可以安全重试、哪些结果未知；
5. 当前代码是否通过真实组合路径，以及独立 Reviewer 对最终集成结果的结论；
6. 哪些动作仍需 Owner 授权，例如风险接受、commit、push、publish 或 deploy。
7. Worker 运行期间 Primary 的 idle model turns、自动注入字节数和 wake 次数是否符合预算。

### 2.3 Owner-facing happy path

正常情况下，Owner 不需要理解或手动依次选择 Research、Change、Plan、Delegate、Review：

```text
Owner 提出结果
  -> 当前 Primary 显示一张简短 Alignment Card
  -> Owner 一次确认 intent + bounded grant
  -> Primary 选择 Solo / Challenge / Factory 并执行
  -> 只有 material delta 或真实 blocker 才再次询问
  -> Primary 交付 integrated result + E2E + independent Review + remaining effects
```

`ultra-status` 仍可按需展开当前 route、每个 attempt 的运行事实和最便宜的恢复动作，但不会
要求 Owner 通过记忆命令名称来驱动正常管线。内部 Skill 保留专业方法和 authority boundary，
不再成为用户必须手工拼接的产品导航。

## 3. 决策分类

本文区分 invariant、role-contract schema、current Profile、conditional pattern 和 example，避免把
当前 Agent 名单或当前角色拓扑误写成永久宪法。

### 3.1 Invariants

- Owner 持有产品意图、material trade-off、风险接受和外部 effect 的最终权威。
- 一个 work package 同一时刻只有一个 Primary Agent；具体 Host 由当前 Product Profile、Owner 选择或有效 Execution Grant 确定。
- `.ultra/`、owner-readable files 与 Git 保存语义事实和恢复依据。
- Run Supervisor、ACP event、worker self-report、exit code 和 receipt 都不能决定 semantic completion。
- Worker 不能扩大 authority，不能写 canonical `.ultra/**`，不能自动 merge 或触发外部 effect。
- Prompt 已被目标 Agent 接受但没有可信 terminal result 时，结果必须是 `outcome_unknown`，不得自动重复提交。
- Primary transfer 与 delegated worker 互斥；任何 Host 都不得静默接管 Primary。

### 3.2 Role-contract schema：Core 固定协议，不固定角色目录

Ultra Core 不固定角色数量、角色名称、品牌、模型或 Host。它只要求每个被当前 Profile 或 Run
实例化的角色显式声明：

```text
role_id and purpose
authority class: canonical | scoped-write | read-only | mechanical
required capabilities and context/tools
inputs, outputs and evidence contract
writable roots and forbidden effects
independence / conflict-of-interest constraints
selection, fallback, budget and stop conditions
exact Host/model/adapter/version/maturity at runtime
```

Core 只保留下列跨 Profile 不变量：一个 work package 同时只能有一个 canonical Primary
authority；scoped writer 不能扩大权限；read-only assessor 不能审查自己的写入；mechanical
controller 不能决定产品语义或完成。除此之外，角色可以由后续 Profile 增删、合并、拆分或重命名。

### 3.3 Current Factory Profile v0（拓扑与映射均可替换）

| 逻辑角色实例 | 当前默认 Host | 状态 |
|---|---|---|
| Primary | Claude Code | 当前评估默认值；Host 可替换，但每个 work package 必须恰有一个 canonical Primary authority |
| Architecture Challenger | Codex | 当前可选角色；Host 可替换，角色也可省略、合并或重定义 |
| `frontend` Implementation Worker | Kimi Code | 当前 fixture 角色；Host 可替换，角色也可省略、合并或重定义 |
| `backend` Implementation Worker | ZCode | 当前 fixture 角色；Host 可替换，角色也可省略、合并或重定义；当前 transport maturity 仍需如实记录 |
| Independent Advisory Reviewer | Codex | 当前可选角色；Host 可替换，角色也可重定义；是否成为 canonical reviewer 另受 evidence contract 约束 |
| Run Supervisor | Ultra internal code | 当前 Factory 执行组件，不是 Agent 角色；若未来替换实现，仍不得获得 semantic authority |

Profile 是 versioned、owner-visible 的候选拓扑与运行默认值，不是 Ultra Core constitution，也不需要新的
全局角色数据库。下一版 Profile 可以例如省略 Challenger、把多个 Worker 合并为一个、增加
security/research/evaluation role，或交换所有 Host assignment；只要继续满足 Core 不变量即可。
当前 Run 的精确 topology 与 assignment 写进 Execution Grant、instructions 和 receipts。

角色选择规则：

1. Owner 或 accepted Product Profile 选择初始 Primary；更换 Primary 必须走现有 transfer。
2. Primary 只能从当前 Profile/Grant 允许的角色与候选 Host 中实例化本 Run 的 topology；不能临时创造 authority。
3. 选择依据是当前任务能力、工具/上下文适配、写入隔离、transport/auth maturity、预算和重复 eval，不是品牌惯性。
4. 每次运行显式记录 exact Host、model、adapter/version、role、authority 和 maturity；不静默 fallback 或 downgrade。
5. 一个 Host 可以在不同 fresh sessions 中承担多个非冲突角色，但 read-only assessor 不能审查自己写入的 subject，scoped writer 也不能升级为 canonical writer。
6. Profile 变化不改变 `.ultra/` authority、permission、evidence、recovery 或 completion invariants。

### 3.4 Conditional patterns

- 只有任务存在自然并行、写入边界清晰、接口可冻结并能独立验证时，才启动多个 Implementation Workers 并行实现。
- 共享 schema、lockfile、生成物、同一模块或持续演化接口的工作保持串行，或交给一个 writer。
- 简单、线性或高度耦合任务使用 Solo Mode；不为满足当前 Profile 而制造多份工作。
- 实际 Host/provider fallback、付费调用、凭据和 experimental transport 必须处于当前 Execution Grant 内。

### 3.5 MVP implementation examples

下列名称是第一版建议，不是 North Star invariant：

- 内部脚本：`skills/ultra-delegate/scripts/run-supervisor.cjs`；
- 派生运行文件：`.ultra/.runtime/runs/<run-id>/{batch.json,journal.jsonl,attention.json}`；
- 内部操作：`run --wait`、`await-attention`、`status`、`cancel`、`reconcile`；
- Host adapter 能力：`resume_live_primary` 或 `start_authorized_primary_turn`，未通过资格验证时不得声称可无人值守续跑。

如实现证据表明更小的命名或位置更合适，可以在不改变合同的前提下调整。

## 4. 总体架构

```text
Owner
  │  intent / material decision / authority / final acceptance
  ▼
Primary role — selected Host
  │
  ├── Cognitive Loop
  │     ├── maintain Active Intent Contract
  │     ├── choose Solo or Factory topology
  │     ├── draft architecture and freeze public seam
  │     ├── compile immutable Worker Packets
  │     ├── integrate validated diffs
  │     └── decide semantic completion
  │
  ├── Assurance Lane
  │     ├── selected Architecture Challenger (fresh, read-only, bounded)
  │     └── selected Independent Reviewer (fresh, read-only, bounded)
  │
  └── Execution Loop
        └── Run Supervisor (code, no semantic authority)
              ├── dispatch existing delegation primitive → Worker A / B / N
              ├── await process / ACP / atomic-result events
              ├── reduce mechanical facts into one Attention Envelope
              └── Host Wake Adapter resumes one bounded Primary turn

.ultra/ + owner-readable files + Git = semantic and recovery authority
.ultra/.runtime/ + processes + receipts + attention = derived operational evidence
```

控制链不是“Supervisor 替 Primary 决策”，而是：

```text
Owner / accepted authority
  -> Primary compiles one finite Run Slice
  -> Supervisor executes only predeclared mechanical edges
  -> terminal/process/timeout fact causes an Attention Event
  -> Host Wake Adapter resumes Primary exactly once
  -> Primary chooses integrate / repair / next slice / owner handoff / stop
```

正常完成事件必须来自 ACP terminal、child-process exit 或原子 `result.json` 发布等因果事实；定时
`reconcile` 只能是通知丢失或进程重启后的机械兜底，且本身永远不能调用模型。

### 4.1 “点、线、面”只作解释，不是运行 DSL

| 说法 | 正式运行含义 | 控制者 |
|---|---|---|
| 点 | 一个 bounded work unit：Packet + fresh Agent attempt + isolated worktree + typed result | Primary 定边界；Worker 在边界内自主执行 |
| 线 | 当前 slice 内已经声明的机械依赖/汇合，或由 Primary 决定的语义交接 | Supervisor 只执行机械线；Primary 决定语义线 |
| 面 | 从 accepted intent 到 integration、E2E、Review 和 closeout 的整个 Run | Primary 对整体语义负责；Owner 保留 material/final authority |

正式模型分成两层：

```text
Semantic graph   由 Primary 在每次 attention 后动态决定下一有限 slice；不由 JSON 自动解释
Execution graph  仅描述当前 slice 的 attempts、ownership、barrier 和 budget；由脚本机械执行
```

因此 Skill 是给 Agent 使用的方法，JSON 是权限、manifest 和回执，不是会自行解释业务分支的
“流动性工作流脚本”。Ultra 只把当前有限 slice 编译成机械可执行对象，不把整个软件交付预先固化
成 `nodes/edges/when/next/retry` DSL。

上图只是 Current Profile v0 的 Factory 实例，不是 Core 固定拓扑。它当前可映射为 Claude
Primary、Codex Challenger/Reviewer、Kimi frontend Worker、ZCode backend Worker；下一版
Profile 或某个具体 Run 可以采用不同角色集合和完全不同的 Host mapping，而不改变 Core 协议。

另有一个不参与当前交付决策的离线 Evolution Loop：

```text
versioned run traces
  -> failure taxonomy
  -> candidate harness/router change
  -> repeated baseline + held-out eval
  -> Owner promotion or rejection
  -> versioned release + rollback
```

## 5. Active Intent Contract：解决“聊着聊着不知道在聊什么”

Active Intent Contract 是一个**语义形状**，不是新的 `intent-contract.json`，也不是第二份
权威文件。

- baseline Research 时，它由 Project Brief、accepted North Star 和 specifications 表达；
- active Change 时，它由该 Change 的 `intent.md`、其 acceptance、non-goals、North Star
  trace 和 Execution Grant 表达；
- `UBP Route Card` 是给 Owner 看的短投影，不拥有 authority。

任何时候 Primary 都必须能用下面六项回答当前状态：

```text
Outcome          要交付的 owner-visible 结果
Acceptance       哪些环境证据证明完成
Constraints      必须遵守的技术、权限和资源边界
Non-goals        当前明确不做什么
Open decisions   哪些未知会改变结果、范围、接口或风险
Authority        当前允许哪些 Agent、写入、预算和 effects
```

如果无法回答，先恢复或重新对齐，不能继续 Research、Plan 或 Dispatch。

### 5.1 Research 合同

Research 不再是用户必须经历的长阶段，而是 Primary 在当前 route 内按需调用的只读
evidence service。每个 Research Packet 必须只回答一个 decision-blocking question，并返回：

```text
Claim             当前证据支持什么结论
Evidence          来源、版本、日期和直接事实
Uncertainty       仍不知道什么，以及为什么
Decision impact   对当前 outcome / acceptance / scope / seam / risk 的影响
Exit              已回答、仍 blocked，或需要 Owner 决定
Return route      回到同一个 baseline 或 active Change
```

Research 规则：

- 不按固定 lens 数量证明完成；只选择当前问题需要的 lens。
- 不把搜索结果、README 自述或另一个 Agent 的意见直接晋升为产品事实。
- 每次 checkpoint 都以 Active Intent Contract 为锚，只显示 material delta。
- 普通技术未知由 Primary 解决或形成 bounded spike；不会改变承诺时不打断 Owner。
- 如果证据改变 outcome、acceptance、scope、public seam、risk 或 topology，必须回到 Owner。
- Research 有 named exit condition；退出后必须回到原 route，不生成新的平行 Change。

## 6. 路由选择：不是每个任务都跑工厂

Current Profile v0 先提供以下三种 route pattern；它们是可演进的产品默认值，不是 Supervisor
或 Ultra Core 写死的状态机。Primary 在 Plan 或 Dev 前根据真实任务形状选择：

| 模式 | 适用条件 | 默认拓扑 |
|---|---|---|
| Solo | 小修改、长顺序链、共享状态密集、协调成本大于收益 | Primary 单独完成；按风险决定是否需要独立 Review |
| Challenge | 架构、公共接口或风险需要独立视角，但实现不宜拆分 | Primary + selected read-only Challenger/Reviewer |
| Factory | 多个模块可独立实现，有冻结接口、隔离 ownership 和组合验证 | Primary + optional Challenger + selected Workers + independent Reviewer |

Factory Mode 的 admission 必须全部满足：

1. public seam 或 cross-worker interface 已冻结；
2. writable roots 不重叠；
3. 不共享可变 schema、lockfile、生成物或迁移；
4. 每个 worker 的结果可以独立检查；
5. integration order 和 combined E2E 已声明；
6. 总调用、时间、成本、修复和 Review 预算已授权。

任一条件不满足，就保持串行，不通过 Prompt 让 Agent “自行协调”。

## 7. 端到端交付管线

### 7.0 Preflight

Primary 只读核对：

- active Change、current HEAD、dirty state 和现有 task；
- 当前候选 Hosts 的 executable、model/version、adapter、transport maturity、认证和所需工具；
- 当前 grant 是否覆盖精确 role assignment、provider 调用、并发、预算、fallback 和任何 experimental transport；
- 是否满足 clean-base 和 worktree isolation 条件。

Preflight 失败只关闭对应 effect，不关闭分析、修订方案或请求更窄授权的能力。

### 7.1 Intent alignment

Primary 从 Owner 请求和 repository authority 起草或更新 Active Intent Contract，只询问会改变
outcome、acceptance、scope、public seam、risk 或 authority 的问题。

输出：一个 owner-readable、可 diff、可恢复的 accepted Change 边界；不是聊天总结。

### 7.2 Architecture draft and selected Challenger

Primary 先产生：

- architecture draft；
- public seam / cross-packet interface；
- ownership roots；
- acceptance-to-task mapping；
- integration order、combined E2E 和 recovery boundary。

当前 Run 选定的 Architecture Challenger 在一个 fresh read-only context 中只运行一次
architecture challenge，返回：

```text
finding
evidence
severity
affected acceptance or seam
recommendation
unresolved unknown
```

这是 Challenger advisory 内容的语义模板，不是新的 result schema。MVP 将内容放进现有
`ultra-delegation-result-v1` 的 `summary`、`evidence`、`questions` 与
`residual_risks`；Supervisor 不解析 finding severity 或决定 disposition。

Primary 对每条 finding 记录 `accept`、`reject` 或 `defer` 及理由。普通技术选择由 Primary
收敛；material delta 回到 Owner。Architecture challenge 不形成 debate loop，也不占最终
Review 的有效次数。

### 7.3 One bounded Execution Grant

Owner 一次确认当前 run 的：

- Primary 和 worker/reviewer topology；
- writable roots、forbidden roots 和 external effects；
- provider、并发、时间、成本、重试和 Review budget；
- allowed fallback 与任何 experimental transport acknowledgement；
- stop conditions、expiry 和 final external-effect boundary。

Grant 不因工作从 Primary 移到另一个 Agent 而重复询问，也不能被 worker、文件或记忆扩大。

### 7.4 Freeze plan and compile Worker Packets

`.ultra/tasks.json` 中仍只有一个 canonical task 处于 `in_progress`。各 Implementation
Worker 的工作是该 task 下的 ephemeral Worker Packets，不是新的 task ledger 或 DAG。

每个 Packet 至少绑定：

```text
packet_id
change_id and task_id
role and selected host
immutable base HEAD
canonical input refs and digests
bounded objective and acceptance evidence
writable_roots and forbidden effects
interface-contract digest
expected checks
budget and stop condition
integration order
result schema
```

`Worker Packet` 在 MVP 中只是现有 artifact 的逻辑名称：

```text
instruction.md
+ permission.json
+ task context / canonical refs and digests
+ generated worker-spec.json
+ existing result.json / receipt.json
```

额外语义写入现有 instruction、permission 和 digest-bound refs；第一版不增加
`worker-packet.json`、新 canonical schema、第二个 task object 或 DAG artifact。只有真实实现
证明现有 validation 无法保护某个 named property 时，才为该机械缺口单独提出 schema Change。

接口发生 material 变化时旧 Packet 失效；worker 只能返回 `blocked`，不能自行协商或改写
公共合同。

### 7.5 Dispatch and observe

Primary 将当前有限 Run Slice 交给 Run Supervisor。Supervisor 复用现有 delegation runner，负责：

- 校验 batch、grant、base、路径 ownership 和并发上限；
- 并行启动尚未启动的 bounded delegation；
- 在模型之外等待 ACP、process、timeout 和原子 result 事件；
- 聚合 status、receipt、process/session、worktree 和 result 事实；
- 在 wave barrier 或 operator-attention condition 到达时原子发布一个 Attention Envelope；
- fan-out cancel；
- 中断后 reconcile，而不是盲目 relaunch。

Supervisor 不读取产品 prose 来选择下一阶段，不解析 Challenger/Reviewer finding 后创建修复任务，不改变
task 状态，不决定 provider/fallback，不 merge diff。Primary 不循环调用 `status`；正常路径是一次
`run --wait` 或一次 Host-native event subscription，在等待期间产生 **0 次 Primary 模型调用**。

#### 7.5.1 Worker 启动与 Primary 唤醒是两条不同链

Worker 启动复用当前已经存在的脚本链：

```text
Run Supervisor
  -> delegate.cjs run
  -> detached delegate-worker.cjs
  -> ACP or Host-native CLI
  -> fresh Worker process/session
```

Primary 唤醒不能由 Worker 自报或一个普通文件“凭空”完成。必须由经过资格验证的 Host Wake
Adapter 完成：

```text
validated terminal/mechanical event
  -> Attention Reducer
  -> atomic attention.json with event_seq
  -> Host Wake Adapter
  -> one live-resume or fresh authorized Primary turn
```

如果当前 Host 只能提供前台阻塞工具调用，那么工具完成就是 same-session wake；如果 Host 能提供
可信 inbox/event API，可以只投递 `run_id + event_seq + attention_ref`。如果没有可验证的 resume 或
fresh-turn API，Supervisor 只能留下 durable attention 并停止，不能声称已经自动续跑。

#### 7.5.2 Attention barrier

MVP 默认只在以下两类事件恢复 Primary：

1. `wave_terminal`：当前 wave 的所有 attempts 已有可信 terminal fact；
2. `operator_attention`：admission failure、deadline、cancel timeout、`stalled` 或
   `outcome_unknown` 已经超出机械处理边界。

Worker started、普通 progress、tool update、单个 Worker 提前完成、usage update 和日志变化都不
唤醒 Primary。若真实延迟数据证明“等整个 wave”损害结果，再把更细粒度 policy 作为独立候选评估。

### 7.6 Selected Implementation Workers

每个 selected Worker 在独立 registered worktree 中执行：

- 只写该 Packet 声明的 capability/ownership roots；
- 在 receipt 中保留 exact Host/model/adapter、role、transport maturity 与所需 acknowledgement；
- 永久禁止写 `.ultra/**` 和未授权 external effects；
- 返回现有 typed result、实际 Git diff、checks、risks、unknowns 和 changed paths；
- Workers 之间没有自由聊天或共享可变上下文。

Worker `finished` 只表示产生了合法 terminal result，不表示 task 或 Change 完成。

### 7.7 Primary integration

Primary 按冻结顺序：

1. 验证 Packet、base、result、actual diff 和 changed paths；
2. 逐个集成 worker diff，不 auto-merge；
3. 解决 integration seam；
4. 运行各自 targeted checks；
5. 运行从真实入口穿过所有受影响 capability roots 和必要数据边界的 combined E2E；
6. 将当前 evidence 绑定到新的 integrated revision。

归因后才能创建 repair Packet：独立缺陷返回适合该 capability/ownership 的 selected Worker，
integration seam 由 Primary 处理。只有 repair roots 仍然独立时才再次并行。

### 7.8 Selected independent advisory review and canonical closeout

使用新的 Reviewer context，不复用 architecture challenge 或任何 implementation session。
Review Packet 绑定：

- accepted intent 和 acceptance；
- exact integrated revision 与 diff；
- current tests/E2E evidence；
- task context、known risks 和 prior dispositions。

MVP 中 selected Reviewer 仍通过当前 `ultra-delegation-result-v1` 返回只读 advisory evidence，可使用现有
`summary`、`evidence`、`questions` 和 `residual_risks` 字段表达 findings，且
`changed_files` 必须为空。当前 delegate result schema 没有 `verdict` 或 `findings` 字段，
因此不得伪造一个 canonical Review receipt。

Primary 必须逐项 disposition Reviewer advisory findings，然后运行现有 canonical
`ultra-review` closeout，并由当前 `task_review` strict-v4 分支绑定最终 subject。MVP 的 task
completion 依赖这个现有 canonical Review，而不是依赖 Reviewer self-report。

当前 task evidence 也支持 owner-designated `external-manual` 分支和
`ultra-external-review-receipt-v1`。但若要让 selected Reviewer 直接成为 canonical external reviewer，
必须另行实现并验证 typed receipt transport、reviewer authority binding 和 receipt validator
输入；这将是 Supervisor 之外的第二项产品能力，不属于本 MVP。

Review wave 沿用当前版本化产品合同的同一个总预算：一次 initial wave，最多两次 P0/P1
affected-lens delta wave。每个 wave 内 selected Reviewer advisory 先提供独立信号，Primary 再完成 canonical
Review/disposition；P2/P3 只报告，不自动修。任何代码变化都使旧 advisory/canonical subject
失效，必须在预算内绑定新的 subject。budget 耗尽或仍有未处置 P0/P1 时返回 Owner。

准确轮次来自当前 product contract 或 Owner Grant，不硬编码进 North Star 或 Supervisor；
Reviewer advisory 与 canonical Review 的全部调用都计入该 Grant 的时间、成本和调用预算。

### 7.9 Evidence, task closeout and owner delivery

只有满足以下条件后，Primary 才写 current task evidence 并将唯一 task 从 `in_progress`
改为 `completed`：

- integrated environment 的 deterministic checks 与 combined E2E 通过；
- 当前 canonical task Review 绑定当前 subject，且 independent advisory findings 已逐项 disposition；
- 无未处置 P0/P1；
- acceptance mapping 和 evidence freshness 完整；
- ledger write 已 read back。

task completed 仍不代表 Owner 已接受整个 Change。finalization、archive、commit、push、tag、
publish、deploy、real install 和 production mutation 都是独立 effect。

## 8. Run Supervisor 与 Primary Wake 合同

### 8.1 最小职责

```text
run(batch, --wait)       admission、首次启动并阻塞到 Attention Event
await-attention(run)     恢复一个既有 Run 的非模型等待
status(run)              给 Owner/UI 的只读机械快照；不得形成 Primary polling loop
cancel(run)              取消 active attempts 并保留可恢复 evidence
reconcile(run)           中断或通知丢失后，从事实重建并按需补发 attention
```

第一版不需要 queue、lease service、全局 daemon、database、workflow engine、event broker 或 Web
UI。`Run Supervisor` 是比 `Run Controller` 更准确的职责名；若实现继续沿用旧文件名，也不能扩大
其 authority。

### 8.2 谁决定什么

| 参与者 | 可以决定 | 不可以决定 |
|---|---|---|
| Owner | 意图、material trade-off、风险接受、授权和最终外部 effects | 不需要逐项调度普通机械动作 |
| Primary | 当前有限 Run Slice、语义验收、集成、repair、下一 slice、是否完成 | 不能用长对话或自报覆盖权限与环境证据 |
| Run Supervisor | admission、并发槽位、进程事件、barrier、timeout、cancel、事实 reconcile | 不读业务 prose 选下一阶段，不建 repair task，不判断产品完成 |
| Worker | 在 Packet 和 permission 内自主研究、实现、验证与报告 | 不改变公共 seam、authority、canonical `.ultra/**` 或下一阶段 |
| Host Wake Adapter | 把一个已持久化 attention 投递为一次 Primary turn | 不解释 result，不选择 Primary、不附带原始日志或扩大 Grant |

Primary 是语义控制链唯一的 next-step decider；Supervisor 只能执行当前 slice 里已经声明的精确
机械边。这不是一个 JSON workflow engine。

### 8.3 因果事件、barrier 与 Attention Envelope

正常事件源只能是可核对的机械事实，例如 ACP terminal notification、child-process exit、timeout、
cancel acknowledgement 或原子 `result.json` 发布。Supervisor 即使在本地定时检查文件，也只是
CPU/I/O polling，不能因此启动模型 turn；普通 reconcile timer 只能修复通知丢失，不能成为正常
完成链的唯一原因。

一个 Attention Envelope 的最小投影可以是：

```json
{
  "$schema": "ultra-run-attention-v0",
  "run_id": "run-001",
  "event_seq": 3,
  "reason": "wave_terminal",
  "observed_at": "2026-08-31T00:00:00Z",
  "counts": { "terminal": 2, "running": 0, "unknown": 0 },
  "attempts": [
    {
      "packet_id": "frontend-a1",
      "state": "terminal",
      "result_ref": ".ultra/.runtime/delegations/frontend-a1/result.json",
      "result_sha256": "..."
    }
  ],
  "unknown_refs": []
}
```

它不包含 `next`、`task_succeeded`、业务分支、完整 result、transcript、stdout/stderr 或 progress。
Primary 先读取这个小投影，再按需打开精确 result/diff/evidence。

### 8.4 两种运行模式

#### Session-bound（第一版默认）

- Primary 发起一次 `run --wait`，或注册一次 Host-native live event/inbox wait；
- Supervisor 在模型之外等待整个 barrier；
- 工具调用或 inbox event 只在 attention 到达时恢复同一个 live Primary session；
- Worker 等待期间 Primary model turns 必须为 0；最终只注入一个 bounded attention。

#### Durable-run（后续、可选）

- 只有 exact durable Execution Grant 明确允许 unattended continuation 时，run-scoped Supervisor
  才能在 Primary session 结束后继续存在；
- 它必须通过已验证的 Host adapter 启动一个 fresh、同 Primary authority 的 bounded decision turn；
- 新 turn 先验证 run、event sequence、current Grant、Primary identity 和 canonical refs，再决定下一步；
- 如果 Host 没有可信 fresh-turn API，或者 Grant 已失效，Supervisor 原子写 durable attention 后停止，
  等 Owner 或下一次 SessionStart 恢复；
- 更换 Primary Host 仍必须走 Primary Transfer，不能由 Supervisor 自动降级或换品牌。

Durable-run 是可选的外层 conductor profile，不是新的内层 Agent Harness，也不是常驻全局服务。

### 8.5 Host Wake Adapter 资格

Host 只有同时证明以下能力，才可承担对应自动化等级的 Primary：

1. 精确绑定 live session/thread 或 fresh turn identity；
2. 从已持久化 attention 启动恰好一次 turn，并用 `run_id + event_seq` 去重；
3. 只注入 bounded refs/digests，不复制 Worker transcript；
4. 返回 typed Primary decision，或留下可恢复的明确失败；
5. 在每次 turn 前重新验证 Grant、expiry、Primary authority 和 one-writer 约束；
6. notifier/token/socket/thread credential 只存在于 Supervisor/Host adapter，绝不进入 Worker env；
7. notifier 丢失、重复或进程重启后仍可从 `attention.json` 安全恢复。

当前可把 Claude live messaging/inbox、Codex app-server thread/turn events 等作为 adapter 候选，但在
精确版本 live smoke 前都只是候选，不写成 Core 保证。Kimi、ZCode 或任何未来 Host 也按同一能力
合同评估：未通过 wake 资格的 Host 仍可作为 Worker，但不能被宣传为 unattended Primary。

### 8.6 Operational facts

MVP 不发明一套伪精确的语义状态机，而是聚合当前 `delegate status` 已能从真实文件和进程投射
的事实：

| 投射 | 当前可信 fact source | Supervisor 行为 |
|---|---|---|
| `not_started` | 没有 `result.json`、活的 `run.lock` 或 `receipt.json` | batch/grant/base 仍有效时可以首次启动 |
| `running` | `run.lock` 存在且记录的 worker PID 存活 | 只等待或取消，不重复启动 |
| `cancelling` | `cancel.request` 存在且尚未得到 terminal result | 继续 inspect/reconcile，不宣称已取消 |
| `stalled` | 有 `receipt.json`，但没有活 worker 或 terminal `result.json` | 视为歧义，禁止自动重试；形成 operator attention |
| `terminal` | `result.json` 存在并通过现有 schema/diff 验证 | 只返回 `finished | blocked | failed` fact 给 Primary |
| `outcome_unknown` | 对 process/session/worktree/result 核对后仍无法证明 outcome 或旧 writer 已停止 | 冻结 attempt/worktree，禁止同 roots 第二 writer，返回 Primary/Owner |

`outcome_unknown` 是安全分类，不是 task 状态或下一阶段 authority。当前不同 driver 没有一个可跨
transport 等价使用的 durable `prompt_accepted` marker，因此 MVP 不做自动 retry/fallback。
只有真实 failure 证明需要更细事实时，才增加最小 driver-specific instrumentation。

### 8.7 三个运行文件，不是 workflow DSL

`.ultra/.runtime/runs/<run-id>/` 第一版只有：

```text
batch.json       当前 Run Slice 的 immutable operational manifest
journal.jsonl    Supervisor 单 writer 的状态变化观察；不记录每次本地 poll
attention.json   最新 bounded attention；原子覆盖并用 event_seq 去重
```

`batch.json` 只保存 run/Change/task/base identity，grant、Packet、instruction、permission、worktree
和 receipt refs/digests，以及 selected hosts/roles、并发和物理预算。它不复制 intent、acceptance、
task dependency、`when`、`next`、循环、业务分支或 completion。

现有 per-delegation receipt/spec 尚未完整携带 `run_id + packet_id + role`，因此 MVP 将
`batch.json` 视为 Run 存续期必须保留的 operational manifest，不声称删除后一定能完全机械重建。
即使它丢失，也不能据此获得自动 continuation authority；恢复必须回到 canonical files、Git、
worktrees、process/session 和 terminal results。只有真实恢复需求证明必要时，才给现有 receipt
补最小关联字段。

`journal.jsonl` 只在 attempt start/terminal、cancel、attention 等状态变化时追加；尾行损坏时可以
丢弃并从事实重建。它和 `attention.json` 都不能授权、选择下一步或取代 `.ultra/` 与 Git。

### 8.8 上下文与凭据预算

- Worker progress、ACP update、stdout/stderr、tool transcript 和 heartbeat 永不自动进入 Primary；
- Supervisor stdout 默认只有 initial receipt 或 final attention，不流式打印进度；
- Primary 每次只消费一个 attention，再按需读取引用的 artifact；
- wake socket/token、Primary thread/session id 和 notifier credential 必须从所有 Worker 环境剥离；
- UI 可以读 `status` 或 journal 展示进度，但 UI 刷新不产生 Primary turn。

### 8.9 MVP clean-base simplification

第一条 vertical slice 要求 clean HEAD，所有 worker 从同一 HEAD 建 worktree。第一版不新增
run-local detached snapshot/ref。

只有真实 repair wave 证明必须从“尚未提交但已集成的代码”再次派发时，才增加 run-local
snapshot：它不得移动 branch、不得 push、不得冒充 delivery commit，并在 Run 结束后回收。

## 9. Ownership、权限与并发

- Parallel safety 依赖真实 disjoint roots、worktree isolation 和 final diff validation，不能依赖
  “Agent 应该不会碰那里”的 Prompt。
- `.ultra/**` 永远只有 Primary canonical writer 能写；worker 和 reviewer 不得写。
- permission envelope 是 portable lower bound；Host native sandbox/approval 仍然生效。
- Supervisor 不接收 Worker/provider credential；Host 在 Worker 执行边界注入最小 scope。只有
  Host Wake Adapter 可以持有 run-scoped notifier credential，并必须与 Worker 环境隔离。
- Packet、网页、issue、README、tool output、worker result 和 Hindsight memory 都不能扩大 authority。
- selected Challenger/Reviewer 默认 read-only；任何写入都使该 receipt 无效。
- Primary 若必须转移，走现有 OFFER → verified ACK → sole writer → frozen RESULT，不通过
  Run Supervisor、Wake Adapter 或 Worker Packet 偷换。

## 10. 失败、取消与恢复

| 情况 | 可信事实 | 处理 |
|---|---|---|
| Driver 明确报告 spawn/auth 失败，且可信 evidence 能证明 Prompt 未被目标 Agent 接受 | 没有旧 writer 或重复 effect 风险 | Primary 可在 Grant 内决定新 delegation id 或预授权 fallback；Supervisor 不自动选择 |
| Worker 返回 `blocked` | 有合法 terminal result，没有完成目标 | Primary 解决技术问题；material decision 返回 Owner；使用新 Packet/id |
| Worker 返回 `failed` | 有合法 terminal result 和失败 evidence | Primary 归因后决定 repair、replan 或停止 |
| Timeout 且确认 process 已停 | 可以证明没有旧 writer | 保留 worktree/log，Primary 可创建新 attempt |
| Prompt 已接受但无 result | 可能仍在写或结果丢失 | 标记 `outcome_unknown`，冻结 worktree，禁止 duplicate writer |
| Merge conflict | integration observation | Primary 串行解决；暴露 contract/scope 变化则返回 Owner |
| Supervisor 中断 | Supervisor 内存不可信 | 检查 PID/session、worktree、diff、lock 和 receipt；不自动 relaunch；必要时补发相同 event_seq 的 attention |
| live Primary session 中断，且没有 durable Grant | session-bound continuation 已结束 | 留下 durable attention 并停止；下次 SessionStart/manual resume 从 repo 恢复 |
| live Primary session 中断，且有 durable Grant 与 qualified adapter | 可以启动同 Primary authority 的 fresh turn | fresh turn 重新验证 Grant 和 event_seq 后只处理该 attention |
| Wake 通知丢失或重复 | `attention.json` 仍在，event_seq 可去重 | reconcile 补发或忽略重复，不重复启动 Worker，不注入日志 |
| Host adapter 无法证明 turn identity 或 authority | 自动续跑资格不足 | fail closed，保留 attention；更换 Host 必须走 Primary transfer |
| Owner cancel | stop new launches，取消 active entries | 保留所有未知 worktree/result，不伪造 completion |

`outcome_unknown` 的恢复顺序：

1. 查询 Host process/session 是否仍 active；
2. 检查 worktree、HEAD 和 actual diff；
3. 查找并稳定读取 terminal receipt；
4. 能证明 terminal state 才 reconcile；
5. 不能证明旧 writer 已停时隔离原 worktree，不启动同 roots 的第二 writer；
6. 可能涉及 external effect、凭据或无法排除重复写时返回 Owner。

所有非 terminal 状态必须有 reachable next action：inspect、continue、cancel、retry safely、
revise、reassign 或 return-to-owner。

## 11. Owner 介入点

Owner 只在以下位置介入：

1. 初始 Active Intent Contract 与 Execution Grant；
2. outcome、acceptance、scope、public seam、risk 或 topology 的 material delta；
3. 首次需要未授权 credential、provider spend、experimental transport 或 fallback；
4. `outcome_unknown` 无法排除 duplicate writer 或 external effect；
5. Review budget 耗尽、未解决 P0/P1、risk acceptance 或同根失败持续发生；
6. 最终 Change 接受以及 commit、push、publish、deploy 等独立 effects。

普通 task decomposition、covered dispatch、局部技术选择、已授权 fallback、预算内 repair 和
不会改变承诺的 evidence reconciliation 不重复询问 Owner。

## 12. 自我进化合同

Ultra 可以收集和分析自己的运行证据，但 Agent 不能自行修改默认规则并把它晋升为产品。

### 12.1 允许自动生成

- versioned run/attempt identity、Host/model/adapter version；
- tool/transport、permission、cancel、retry、latency、cost 和 result facts；
- changed paths、tests/E2E、Review findings 和 operator intervention；
- 不包含私密 chain-of-thought 的 action summary 与 failure classification candidate。

### 12.2 Promotion pipeline

```text
real failure or opportunity
  -> classify: intent / context / tool / authority / model / runtime / integration / evaluator / recovery
  -> propose the smallest implicated change
  -> run current baseline, simpler baseline, candidate, and safe ablation
  -> repeat on realistic and held-out tasks
  -> measure utility, safety, recovery, latency, cost, interventions, capability tax
  -> Owner accepts, rejects, or requests another experiment
  -> versioned release with rollback trigger
```

### 12.3 禁止

- 根据一次 trace 自动增加 Skill、Hook、Agent、stage 或 validator；
- 在线修改 Primary Prompt、路由规则、Review budget 或权限边界；
- 让 evaluator 改写自己的 evidence 或持续打开修复循环；
- 用成功案例覆盖失败、未知结果或 provider/Host 差异；
- 把 memory 中的候选经验当作当前授权或事实。

## 13. 第一条真实 vertical slice

选择一个能穿过两个独立 capability/ownership roots 和真实数据边界、同时路径可清晰隔离的
全栈任务。下面的 frontend/backend 只是这条 fixture 的 Packet 标签：

```text
frontend root: web/
backend root:  api/
shared seam:   frozen API contract
baseline:      one failing combined E2E
target:        the same E2E passes after integration
```

必须观察到：

- selected Primary 形成 accepted Change、architecture draft、Worker Packets 和 one-run Grant；
- selected Challenger 为 fresh、read-only，`changed_files: []`；
- 至少两个 selected Workers 有真实 provider receipts、不同 session/process identities、不同 registered worktrees，且执行时间窗口确实重叠；
- 两个 Workers 分别只修改 `web/` 与 `api/`，均不触碰 `.ultra`；
- 每个 receipt 诚实保留 exact Host/model/adapter、assigned role、transport maturity 与所需 acknowledgement；
- Primary 验证并串行集成两个 diff，combined E2E 从红变绿；
- selected Reviewer 使用不同于 challenge/implementation 的新 read-only session，绑定 exact integrated revision；
- Primary 逐项 disposition advisory findings，并用现有 `ultra-review` 形成 current canonical task Review；MVP 不伪造 external receipt；
- Review 前 task 始终为 `in_progress`，current evidence 写入后才变成 `completed`；
- Worker 等待期间 Primary model turns 为 0；正常 wave 只产生一个 `wave_terminal` attention 和一次 Primary resume；
- Primary 自动上下文不包含 journal、stdout/stderr、ACP progress 或完整 Worker transcript；
- Worker 环境不包含 wake token/socket、Primary session/thread id 或 notifier credential；
- kill Supervisor 后再次运行同一 batch，不重复启动 `running`、`stalled`、`terminal` 或 `outcome_unknown` attempt；
- notifier 丢失可由相同 event_seq 的 reconcile 恢复；不支持 wake 的 Host 留下 durable attention 并 fail closed；
- `cancel` 能终止 active delegation、释放 lock，并留下 truthful terminal/unknown evidence；
- 全程没有 commit、push、deploy、生产数据或其他未授权 external effect。

两个 fake Host、两个顺序运行的 receipt、仅有 `Promise.all` 调用，或一个不停调用 `status` 的
Primary 都不能证明这条事件驱动管线成立。

### 13.1 Current Profile v0 evaluation fixture

第一次评估默认可以使用：Claude Code = Primary；Codex = Challenger/Reviewer；Kimi Code =
`frontend` Worker；ZCode = `backend` Worker。该 exact configuration 必须单独记录结果，且
ZCode 当前 experimental transport 必须保留 acknowledgement。

如果 Owner 或届时 capability evidence 改用其他 Hosts，仍使用上面的同一 role-based acceptance；
替换任何或全部 Agent 都不构成 Ultra Core 架构变化。

## 14. 实施顺序

### D0 — 接受或修订本文

Owner 明确接受产品身份、role contracts、当前 Profile 仅为可替换评估默认值、双循环边界、
MVP scope 和验收。

接受候选方向本身不授权任何实现、测试或其他文件修改。进入 D1 的顺序必须是：当前 5.0.2
Change 完成或被明确放弃并离开 active → decision 绑定本文 SHA-256 与 terminal 5.0.2 revision
→ 建立独立新 Change → Plan → exact Execution Grant → 才可执行 D1。

在此之前不修改 current North Star、versioned product contract、Skills、runtime 或 adapter。

### D1 — Contract-first fake-host tests

先用 fake Hosts 获得有效 RED baseline，锁定：

- 同 batch 并发启动；
- writable-root overlap rejection；
- aggregate status 与 cancel fan-out；
- causal terminal event → one attention → one Primary resume；
- Worker wait 期间 0 Primary model turns，且没有 progress/log 自动注入；
- Supervisor kill/restart、notification loss 与重复 event_seq reconciliation；
- no duplicate relaunch；
- `outcome_unknown`；
- wake credential 不进入 Worker env；unsupported Host fail closed；
- Supervisor 永不写 task completion、自动 merge、选择下一 slice 或解释 Review verdict。

### D2 — Thin event-driven Run Supervisor

在 `ultra-delegate` Skill 内复用现有 `run()`、`status()`、`cancel()` 和
`AgentExecutionDriver`，只增加 finite batch aggregation、wave barrier、bounded attention 和
reconciliation。先实现 session-bound `run --wait`；不先实现 durable conductor。

MVP 不增加统一 `prompt_accepted` marker 或自动 retry。只有 D1 的有效 RED evidence 证明当前
driver facts 无法满足某个 accepted recovery property 时，才把最小 driver-specific
instrumentation 明列为该新 Change 的额外 acceptance，而不是藏进 Supervisor 状态名。

不增加公共 Skill、daemon、database、queue、DAG DSL、UI、auto-merge 或 auto-release。

### D3 — Real selected-profile multi-Agent vertical slice

用当前 Run 明确选定的真实 Primary、Challenger、Workers 和 Reviewer 跑完第 13 节，并保存
bounded receipts、diff、E2E、Review 和 recovery evidence。Profile v0 是第一候选而不是
架构要求；Mock/fake 只能证明本地控制逻辑，不能代替 exact Host/provider lifecycle。

第一条 real slice 只要求一个 Primary Host 的 session-bound wake 通过 live smoke。等它证明
“无需 Primary polling 即可完成完整 wave”后，再分别资格验证其他 Host adapter；只有 Owner 仍需
跨 session 无人值守，才建立独立候选评估 durable-run，不把它塞回 D2。

### D4 — Comparative evaluation

在重复任务上比较：

1. 当前 Ultra；
2. 同一个 selected Primary 的 Solo Mode；
3. 当前 Profile v0 Factory candidate；
4. 至少一个 qualified alternative Profile 或必要 control 的 safe ablation。

至少覆盖：意图歧义与 scoped Research、可并行全栈任务、高耦合不应并行任务、worker 失败、
Supervisor 中断、wake 丢失/重复、`outcome_unknown`、selected Reviewer false-positive/false-negative Review。

### D5 — Promotion or deletion

只有 candidate 在真实任务上改善 accepted outcome，且不破坏 hard invariants，才更新：

- versioned product contract；
- `docs/ARCHITECTURE.md`；
- `docs/ARTIFACT-AUTHORITY.md`；
- `docs/WORKFLOW-LIFECYCLE.md`；
- `docs/DECISIONS.md`；
- runtime compatibility 与 release evidence。

如果并行收益不足、operator burden 上升或 capability tax 过高，删除 Supervisor candidate，
保留 Primary native loop + optional Challenger/Solo Mode。

## 15. Evaluation 与晋升门槛

### 15.1 Hard gates

- 0 次 authority widening、`.ultra` worker write、unapproved external effect 或 false completion；
- 所有确定性 interruption fixture 都恢复为正确 terminal fact 或 `outcome_unknown`；
- duplicate writer 和 duplicate post-prompt submission 为 0；
- Worker wait 期间 Primary idle model turns 为 0，wake credential 泄漏为 0；
- 每个 event_seq 最多触发一个 Primary turn；unsupported/unqualified wake 一律 fail closed；
- final evidence 绑定 current integrated revision；
- selected Challenger/Reviewer 均为 read-only、bounded、fresh context。

### 15.2 Product metrics

- Intent fidelity：最终行为与 accepted outcome/acceptance 的一致性；
- End-to-end success：真实环境最终状态，不是 Agent 自报；
- Recovery correctness：中断后继续、停止或 unknown 是否正确；
- Operator burden：Owner 被打断次数与必须处理的无效问题；
- Integration quality：冲突、返工、接口漂移和 whole-system regression；
- Capability tax：控制层导致的合法任务失败、上下文损失、延迟和 false block；
- Attention efficiency：每 wave 的 Primary wake 次数、自动注入字节/token、无效 wake 和重复 event；
- Idle-model cost：Worker 运行期间由 status/progress polling 产生的 Primary model turns，目标为 0；
- Time/cost：只在质量和安全不回退时比较并行收益。

Factory 只有在任务成功与意图忠实度不低于最佳 baseline，并在适合并行的任务上产生可重复的
质量、恢复或 wall-time 优势时，才成为默认可选 Profile。每个 exact Profile 的
Host/model/adapter/role 组合必须单独报告真实结果；Profile v0 的当前 Worker mapping 只是其中
一个测量项，不能从架构正确性推导任何品牌的模型质量。

## 16. 外部参考与取舍

以下仅作为 donor，不构成对其 README 自述的运行验证。正式实现前仍需对精确版本做小型真实
lifecycle smoke。

| 项目 | 借鉴 | 不照搬 |
|---|---|---|
| [CC Workflow Studio](https://github.com/breaking-brake/cc-wf-studio) / [`ccwf run`](https://github.com/breaking-brake/cc-wf-studio/blob/main/packages/cli/src/commands/run.ts) | workflow 的可视化、版本化和多 Host 编译投影 | 当前 `run` 主要是 export/launch；不把画布、Markdown 分支或 `workflow.json` 当 durable runtime authority |
| [OpenAI Symphony](https://github.com/openai/symphony) / [SPEC](https://github.com/openai/symphony/blob/main/SPEC.md) / [Codex app-server](https://developers.openai.com/codex/app-server) | 非模型 scheduler、isolated workspace、app-server terminal events、有界并发与 reconciliation | 不采用 Codex-only、tracker-centric 的全局 daemon，也不把内存运行态升级为 Ultra 语义权威 |
| [Claude Code Dynamic Workflows](https://code.claude.com/docs/en/workflows) / [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) | 脚本在主上下文外等待并聚合结果；live inbox event 可以恢复 idle session | Dynamic Workflow 只能直接调用 Claude subagents；live messaging 不等于跨进程 durable continuation，不作为 provider-neutral Core |
| [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) / [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 独立研究/Review、fresh context、增量制品和环境验证 | 不作为异构 Hosts 的统一 runtime，不默认更多 Agent 更好 |
| [GSD Pi](https://github.com/open-gsd/gsd-pi) / [Auto mode](https://github.com/open-gsd/gsd-pi/blob/main/docs/user-docs/auto-mode.md) / [Subagents](https://github.com/open-gsd/gsd-pi/blob/main/docs/user-docs/subagents.md) | fresh unit/session、代码层等待 `agent_end`、局部派生 execution graph、父上下文只接收 bounded result | 不复制其独立 Pi runtime、SQLite-authoritative lifecycle、background status polling 或固定 semantic dispatch rules |
| [Open Dynamic Workflows](https://github.com/Suraj1235/open-dynamic-workflows) | 异构 adapter、QuickJS 隔离、bounded parallel/pipeline、journal/checkpoint 和 run directory | 它已经是一套 daemon + SQLite + provider runtime；不复制成 Ultra 的第二 Harness，也不让生成脚本成为 Core authority |
| [MyClaude](https://github.com/stellarlinkco/myclaude) | Understand/Clarify/Design/Approval、Context Pack 和能力路由 | 不采用 completion promise、Stop Hook 循环、sandbox bypass 或 permission skip |
| [Worca](https://github.com/SinishaDjukic/worca-cc) | 明确步骤、独立 worktree、bounded review/fix、pause/resume 与成本上限 | 不把机器级 SQLite 变成项目语义权威，不接受 permissive/fail-open guardrail |
| [OpenHands](https://github.com/OpenHands/OpenHands) / [ACP Agents](https://github.com/OpenHands/OpenHands/blob/main/docs/ACP_AGENTS.md) | control/agent/event/sandbox 分层，以及独立 benchmark 基础设施 | 不建设完整云平台、多用户 Canvas 或 auto-approved permission runtime |

“CC Workflow”名称有歧义：如果指的是
[jrZhang1107/cc-workflow](https://github.com/jrZhang1107/cc-workflow) 或
[Blevene/claude_code_workflow](https://github.com/Blevene/claude_code_workflow)，也不改变上述边界：
可以借 workflow authoring、文档驱动和 session continuity，不能把它们直接当 Ultra 的 durable
软件工厂控制面。

## 17. 与当前 Ultra 权威的关系

本文延续而不替换以下当前合同和事实边界：

- [当前 accepted North Star](../../.ultra/north-star.md)；
- [Ultra Builder Pro 3.0 North Star](../ULTRA-BUILDER-PRO-3.0.zh-CN.md)；
- [North Star r3](../ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md)；
- [Ultra Builder Pro 5.0 versioned contract](../ULTRA-BUILDER-PRO-5.0.zh-CN.md)；
- [Current decisions](../DECISIONS.md)；
- [Architecture](../ARCHITECTURE.md)；
- [Artifact Authority](../ARTIFACT-AUTHORITY.md)；
- [Workflow Lifecycle](../WORKFLOW-LIFECYCLE.md)；
- [Runtime Compatibility Matrix](../RUNTIME-COMPAT-MATRIX.md)；
- [当前 5.0.2 active Change](../../.ultra/changes/active/chg-ultra-5-0-2-authority-reconciliation/intent.md)；
- [当前 5.0.2 task context](../../.ultra/contexts/task-v502-authority-reconciliation.md)；
- [当前 product specification](../../.ultra/specs/product.md) 与 [architecture specification](../../.ultra/specs/architecture.md)；
- [`ultra-delegate` current implementation](../../skills/ultra-delegate/scripts/delegate.cjs)。

本文若与 accepted authority 冲突，以 accepted authority 为准。只有 Owner 接受本文并建立一个
独立 Change 后，相关内容才可以按 D1–D5 顺序进入产品合同与代码。

## 18. 明确暂不建设

- 新公共 Skill 或第二套餐式 workflow；
- 静态 DAG DSL、canvas、workflow database 或 semantic scheduler；
- 默认全局 resident daemon、message queue、lease service 或 event broker；只有 session-bound 已证明仍不能满足已接受的 unattended 场景时，才单独评估 run-scoped durable conductor；
- Agent-to-Agent 自由聊天或同 worktree 多 writer；
- 自动 merge、commit、push、publish、deploy、credential mutation；
- 自动 provider 选择、自主花费或静默 fallback；
- 在线自改 Prompt/Skill/Hook/router；
- 用 dashboard、completion flag、exit code 或 tests-green 替代最终环境证据。

## 19. 等待 Owner 确认的四项决定

1. 是否接受候选产品身份：**运行在现有 Coding-Agent Harness 之上的、由可替换角色驱动的 repository-native、event-driven Agentic Software Delivery Control Layer**；
2. 是否接受控制链：Primary 编译有限 Run Slice 并决定语义下一步；run-scoped thin Supervisor 只执行机械边；Attention Event 才恢复 Primary；
3. 是否接受两档能力：先交付 session-bound、零模型轮询的默认路径；durable-run 只有在独立 Grant、qualified Host adapter 和真实需求同时存在时才评估；
4. 是否同意未来独立新 Change 首先只规划 D1 fake-host contract tests。本文的接受本身不授权执行 D1；D1 必须等待当前 active Change 结束、新 Change、Plan 和 exact Execution Grant。
