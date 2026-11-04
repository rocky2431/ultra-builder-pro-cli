# Ultra Builder Pro 两层循环设计稿

> **状态**：草案，待 Owner 审阅。日期 2026-10-04。
> **范围**：先整理当前设计（package `5.0.2`，宪法 `north-star-v2-r3`）作为基线，再给出下一版的两层循环设计。
> **不改变什么**：本稿不修改 `.ultra/north-star.md`、代码或任何已发布内容。需要修订宪法的地方集中在第 7 节，由 Owner 决定。
> **已定**（Owner 2026-10-04 确认）：
> - 只有两层循环：一个大循环，加上许多小循环。
> - 一个小循环对应一个 Change。
> - 下一版的核心是"活的上下文"，它的权威放在文件里，所有宿主共用。
> - Claude Code 上用 mod 做增强投递层。
> - 方向是简化：Ultra 变薄，组合 marketplace 里已经拆出去的 Skill。

## 0. 为什么要改

有三件事同时发生：

1. **外部做法在收敛。** Claude Code 的 advisor、Codex 自带的子代理、yarg119/trellis 这类方案，结构都是：一个主模型负责判断，强模型只在关键决策点出场，子代理用中等 effort 在独立上下文里干活。
2. **我们自己的数据不支持现在的多 Agent 路线。** 跨厂商的 Factory 大多比 Solo 慢，成本时高时低，没有证明可重复的收益（见 1.7）。
3. **可以独立使用的循环已经拆出来了。** Excellent-skill-Marketplace 里的 ultra-goal、deep-thinking 等插件能单独跑，也能组合。Ultra 自己又实现了一遍相近的职责。

Ultra 一直由两半组成：一半是把思路想清楚并写成文档，一半是按任务和任务上下文去执行。下一版保留前一半，执行这一半做减法，并用"大循环套小循环"重新组织。

两半之间靠上下文连接，所以下一版真正要攻克的是上下文本身。前两代上下文是"死"的：提示词、规则文件、`SKILL.md` 都是写一次、整块加载，和代码的变化脱节。下一版要做的是"活的上下文"：可以编辑，可以进化，并且和当前的修改挂钩（第 5 节）。

## 1. 当前设计基线

本节只整理现有设计，不加入新判断。路径都相对于仓库根目录。

### 1.1 North Star 与产品边界

**North Star**（`north-star-v2-r3`，见 `docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md` 第 1 节）：Ultra Builder Pro 是一套 provider-neutral、file-first 的真实软件工程 Harness。

| 谁 | 保留什么 |
|---|---|
| Owner | 目标、重大取舍、风险接受、外部和不可逆 effect 的授权 |
| 模型 | 理解、分解、策略、语义完整性、证据解释、最终表达 |
| Harness | 只机械化身份、可验证事实、权限、effect、协议安全、证据和恢复 |

工作包要么真实交付，要么在不能自动延长的边界内，进入明确且可恢复的终态。

5.0 把它落成一个产品目标（`docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md` 第 1 节）：Owner 在任何支持的宿主上，都能准确知道为什么做、接受了什么、现在在哪里、真实完成了什么、下一步是什么，并且只靠文件和 Git 就能恢复。

**五个北极星结果**（`.ultra/north-star.md`）：

| ID | 结果 |
|---|---|
| `NS-01` | Owner 与 Agent 认知对齐：从简短检查点就能看出实质偏离 |
| `NS-02` | 可恢复、可移植的续接：只靠 canonical 文件和 Git 就能恢复 |
| `NS-03` | 真实交付：实际运行路径里没有未披露的 mock、stub 或死代码 |
| `NS-04` | 有界、可恢复的 effect：每个写入和外部 effect 都在 Owner 看得见的边界内 |
| `NS-05` | 必然终止：每个工作包在预算内结束，终态是结果被接受、需要 Owner 决定、外部阻塞、预算停止或放弃，不会自动延长 |

**Ultra 负责的部分**（`CLAUDE.md`、`AGENTS.md`）：14 个 Skill、5 个可选 Hook、宿主 adapter、Skill 内部的 ACP-first 委派（带 typed CLI fallback）、`.ultra/`、`CONTEXT.md` 和 Git 里 Owner 可读的项目权威。语义推理和路由选择归宿主模型。

**明确不做的**（`docs/ARCHITECTURE.md` "Deliberate absences"，以及 `.ultra/north-star.md` "Explicit Exclusions"）：
- 不做数据库、MCP server、workflow 状态机、语义校验器、后台 daemon、prompt projection，也不做通用记忆或代码图谱。
- 不做完成度评分、自动推进阶段、自动合并、自我批准、自行扩大范围。
- 不做默认的后台编排、自动唤醒和跨 Agent 调度。
- 要新增上面任何一项，必须先有三样东西：可复现的失败、明确的权威边界、主路径回归测试。

### 1.2 第一性原理与核心原则

| ID | 原则 | 一句话 |
|---|---|---|
| `FP-1` | 持久权威要比模型上下文活得久 | canonical 文件加 Git 承载意图、计划、证据和恢复；`.ultra/.runtime/` 下的东西都是可丢弃的派生观察 |
| `FP-2` | 产品意义不能化简成机械信号 | 代码校验结构、身份、权限、effect、证据和恢复；计数、评分、digest、正则都不决定意义 |
| `FP-3` | 授权显式且能被机械区分 | 只有显式授权（默认 session-local，或精确的 durable 工作包授权），不能从文字、状态或 Hook 输出推断 |
| `FP-4` | Review 是有界挑战，不是无限循环 | 只有 Owner 指定的阻断类会阻断；非阻断问题只报告；预算耗尽是终态，把选择交还 Owner |
| `FP-5` | 可移植性要求语义共享、适配原生 | 共享 Skill 保持宿主中立，差异由 adapter 承担，如实报告成熟度 |
| `FP-6` | 委派保留来源，权限最小 | worker 不可信且有界，只返回可检查的 delta，不获得新权限 |
| `FP-7` | 认知对齐先于状态同步 | 每个检查点回答八件事：为什么、结果、边界、变化、真实状态、需要的决定、下一步、没做完的；对齐失败就停止执行 |
| `FP-8` | Agent 交接互斥、可验证、可恢复 | 换 Agent 只有两种方式：Owner 授权的 primary transfer，或有界的委派 worker |

其他原则：
- **一项事实一个权威。** `tasks.json` 是 task 状态的唯一权威，摘要不能变成第二权威（`docs/ARTIFACT-AUTHORITY.md`）。
- **Hook 是传感器，不是闸门。** 唯一的硬拦截是危险命令（`docs/PHILOSOPHY.md` C3）。
- **"缩减"必须交给 Owner。** 判断标准是"spec 已经做出的承诺是否都还成立"。
- **完成的定义：** 用户接受的结果能通过真实的公共接口跑通（`docs/ARCHITECTURE.md`）。

### 1.3 硬约束

| ID | 约束 |
|---|---|
| `HC-1` | 所有支持的宿主得到相同的工作流语义 |
| `HC-2` | 授权显式，未激活时不起作用；北极星、实质范围或风险变化、外部 effect 一律回到 Owner |
| `HC-3` | 语义权威 file-first、provider 中立；关掉所有可选层后，只靠文件和 Git 仍然完整 |
| `HC-4` | 每项语义事实只有一个 canonical 表示，有明确的写者、读者、新鲜度规则和恢复路径 |
| `HC-5` | 委派和交接不产生新权限；worker 不写 canonical `.ultra`，不提交、不发布、不自动合并 |
| `HC-6` | commit、push、tag、发布、部署、真实安装、付费调用等外部 effect，每一项单独授权 |
| `HC-7` | Review 在接受的预算内终止 |
| `HC-8` | 拓扑由 Owner 选择；没有选择时，当前 Agent 单独继续，不自动派生子代理、不自动委派 |

### 1.4 组成部分

**14 个 Skill**（`adapters/_shared/runtime-assets.cjs`）：

| 分组 | Skill | 职责 |
|---|---|---|
| Owner 调用 | `ultra-init` | 建立项目骨架和原始 Project Brief |
| | `ultra-research` | 建立被接受的北极星和有证据的基线 |
| | `ultra-change` | 把一个请求和已接受的产品基线对账 |
| | `ultra-plan` | 写 task、context、依赖和集成接缝 |
| | `ultra-dev` | 实现一个 task，记录六维证据 |
| | `ultra-test` | 检查接线、E2E、性能、安全 |
| | `ultra-deliver` | Review、文档对账、结束 Change |
| | `ultra-delegate` | 把有界工作交给另一个 Agent |
| 模型调用 | `ultra-grilling` | 一次问一个关键问题，澄清意图 |
| | `ultra-domain-modeling` | 维护 `CONTEXT.md` 术语表 |
| | `ultra-tdd` | 在一个已确认的接缝上做红绿循环 |
| | `ultra-review` | 选择审查角度，在预算内汇总问题 |
| | `ultra-think` | 审视一个重大决定并记录结论 |
| 只读路由 | `ultra-status` | 从文件重建当前位置，不改任何状态 |

**5 个 Hook**（`hooks/README.md`）：

| Hook | 作用 |
|---|---|
| `session_context.py` | 会话开始时注入北极星和当前 task 的验收标准 |
| `mid_workflow_recall.py` | 读改源码前复述当前 task 的验收标准 |
| `compact_context.py` | 上下文压缩前后保存和恢复快照 |
| `post_edit_guard.py` | 编辑后记录机械证据，不判断是否完成 |
| `block_dangerous_commands.py` | 拦截历史改写和少数破坏性命令 |

**6 个宿主 adapter**：claude、opencode、codex、kimi、grok、zcode。adapter 只做宿主适配，不改写工作流的意义。Pi 是另外的实验性执行目标，不在这六个安装宿主里。

**`.ultra/` 布局**（`docs/ARTIFACT-AUTHORITY.md`）：

| 路径 | 承载的事实 |
|---|---|
| `project-brief.md` | Owner 的原始描述，不会被改写成已验证的事实 |
| `north-star.md` | 被接受的方向、结果、硬约束、排除项 |
| `specs/` | 产品行为、架构边界、未知项、研究摘要 |
| `changes/{active,archive,abandoned}/<id>/intent.md` | 一个有界结果，以及它的验收、研究处置、北极星追溯、Execution Grant |
| `tasks.json` | append-only 的 task 账本，task 状态的唯一权威 |
| `contexts/task-<id>.md` | 验收、实现、变更记录、Resume Note |
| `decisions/` | 重大的 Owner 决定 |
| `evidence/<task-id>/` | task 证据记录 |
| `test-report.json` | 全系统审计结果 |
| `.runtime/`、`progress/`、`reviews/` | 派生观察，可以丢弃 |

### 1.5 工作流与授权模式

各阶段**不是必须依次走的顺序**。一个不会让任何 spec 句子变假的小改动，直接走普通 TDD 即可（`docs/WORKFLOW-LIFECYCLE.md`）。

| 阶段 | 做什么 |
|---|---|
| Init | 只写原始 Brief 和空骨架 |
| Research | baseline 把 Brief 变成被接受的北极星；change-scoped 只回答一个问题，然后回到同一个 Change |
| Change | intake → evidence-needed → reconcile → accepted；同一时间最多一个 active Change |
| Plan | 只分解已接受的 Change，第一个切片要指明真实的使用方和数据路径 |
| Dev | 一次做一个 ready task；task review 通过后才写 `completed` |
| Test | 所有 task 完成后做一次全系统审计，它是终点传感器，不是闸门 |
| Review | 不是公开工作流，由 Dev、Test、Deliver 调用 |
| Deliver | 先对账，再 finalize（必须 Owner 显式调用）并归档；commit、push 等各是独立 effect |

**三类模式：**
- `explicit-entry`：需要 Owner 当场选择。
- `grant-continuable`：在有效的 Execution Grant 覆盖同一个 Change 时，模型可以自行续接。
- `router`：只读，不产生续接权限。

工作流图上的箭头只是建议，除非有 Owner 激活的 Execution Grant 授权了下一步。

**Execution Grant** 写在 Change 的 `intent.md` 里，字段包括允许的工作流、Agent 拓扑、预算、停止条件、失效条件、永不授权的事项（`skills/ultra-change/references/change-contract.md`）。它有两种模式：默认的 session-local（会话丢失、换宿主或压缩后停止）和 durable 工作包（新 Agent 先验证授权内容才能继续）。两种模式都不授权 finalize、归档或外部 effect，Agent 也不能自己扩大授权。

### 1.6 执行与委派

**三种执行路径**（`skills/ultra-delegate/references/operational-factory.md`）：

| 路径 | 适用 |
|---|---|
| Solo | 紧耦合、改动小、接口还在变 |
| Challenge | 分解或接口不确定时，引入一个只读的挑战者 |
| Factory | 接缝确实独立时，用多个限定范围的 worker |

Solo 也要保留独立的最终评估者。Factory 底层是有限的 RunSlice：控制器只负责等待并返回一次结果，不能自己选修复方案、开新一波或宣布完成。

**ACP-first：** 只有宿主的一致性检查通过、可执行文件能找到、身份探针成功时才走 ACP v1 stdio，否则同一个任务包走 typed CLI fallback，并记录原因。ACP 事件只是观察，不能决定是否完成。

**两种交接**（`FP-8`）：
- primary transfer 转移唯一写者身份，流程是 OFFER → 验证后的 ACK → 唯一写者 → 冻结的 RESULT，需要 Owner 授权。
- 委派 worker 在隔离 worktree 里工作，不写 `.ultra`，不自动合并，由主 Agent 检查 diff。

**有界收敛**（`skills/ultra-dev/SKILL.md`）：
- Dev 的 task 循环有三个出口：Converged（每条标准都有当前证据和语义处置）、Stalled（修复不再产生新证据）、Unreachable（前提或授权不可得）。原文："Do not infer semantic progress or failure from a round count"。
- 预算是硬上限，验收和停止条件是否成立由模型解释。
- Review 默认一次初审加两次只针对 P0/P1 的增量审查。
- 同一个根因修了三次还没好，就停止打补丁，报告为架构问题。

### 1.7 最近的实证

第 6 步对比的实际数据（`work/trellis-eight-step-20260909/stage-d-product-v2-comparison.zh-CN.md`）：

| 对比 | 第 1 轮 | 第 2 轮 |
|---|---|---|
| Expense：Factory 相对 Solo | 耗时 +32.87%，成本 +38.35% | 耗时 +12.67%，成本 −4.14% |
| Manifest：Factory | 源码 14/14，但缺正式 Task Review 收据，超时 | 正式交付并正常结束；同一轮的 Solo 反而被 35 分钟 watchdog 停下 |
| Factory 相对手工协调 | 耗时 −2.77%，成本 +11.06% | 耗时 +6.11% |

- Stage C 的 Factory 比 Solo 耗时多 19.69%，成本多 17.16%。
- 十次运行合计：源码验收 10/10，正式交付链 9/10，原生会话正常结束 8/10。
- 这些成本是原生会话的估算值，不是账单；样本小，而且有 provider 争用。

**结论：** Factory 大多更慢，成本时高时低，没有证明可重复的收益，第 6 步没有通过。第 7 步的最终评审是 INCOMPLETE；第 8 步的建议是 reject，Owner 还没有记录决定。

vNext 的 R2 方案想把 Ultra 做成跑在现有 Coding Agent 之上的多 Agent 交付控制层：可替换的主 Agent 负责语义决策，非模型的 Supervisor 负责机械执行，worker 负责有界工作，分三步实现（`docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`）。相关代码在 `0306a07` 入库，提交说明写明 "No strategy promotion or release is implied"。

### 1.8 与 marketplace 插件的重叠

Excellent-skill-Marketplace 有六个插件，按性质分三类：
- **自带停止条件的循环**：ultra-goal（由 gate、上限和 verify 机械判定是否停止）、deep-thinking（由人主导停止）。
- **机制**：agent-delegation（ACP 传输）、task-state-with-files（文件状态与恢复）。
- **规则和知识**：building-rules、agent-harness-design。

| Ultra Skill | 对应的插件 | 重叠 | Ultra 独有的部分 |
|---|---|---|---|
| `ultra-think` | deep-thinking | 高 | 只处理一个决定；满足三条标准才写入 `decisions/` |
| `ultra-review` | ultra-goal 的 review、critic | 高 | Owner 选择审查角度、aggregate 评审、跨模型家族复查 |
| `ultra-delegate` | agent-delegation | 高（直接依赖它） | 隔离 worktree、一致性门控、typed result、Factory |
| `ultra-grilling` | ultra-goal 访谈、deep-thinking | 中高 | 由调用方点名缺失的决定 |
| `ultra-research` | deep-thinking | 中 | 北极星修订、带引用的 specs |
| `ultra-change` | ultra-goal 的 Intent、Boundary、Acceptance | 中 | spec 与代码对账、Execution Grant、primary transfer |
| `ultra-dev`、`ultra-tdd` | task-state、building-rules | 中 | 六维证据、账本回读、Resume Note |
| `ultra-init`、`ultra-plan`、`ultra-test`、`ultra-deliver`、`ultra-status` | 部分覆盖 | 低 | 项目骨架、task 账本、全系统审计、`delivery.md`、只读路由 |
| `ultra-domain-modeling` | 无 | 无 | `CONTEXT.md` 术语表 |

### 1.9 现有文档的冲突与过时之处

1. `CLAUDE.md` 和 `AGENTS.md` 写的是 `explicit-only`，代码和其他文档写的是 `explicit-entry`。应以代码为准。
2. 3.0 设计稿写的是"最多三轮 Review"，r3 已把固定轮数移出宪法，改为产品默认值，可以被授权覆盖。
3. r3 设计稿头部仍写"canonical 是 r2"，但 `.ultra/north-star.md` 显示 r3 已被接受。
4. `docs/ARCHITECTURE.md` 没有写 Pi、RunSlice、Factory、durable checkpoint、`ubp run`、`ubp slice`，这些只出现在 `docs/USAGE.md` 和 `ultra-delegate` 里。
5. Change D 把 durable 跨会话续接列为非目标，但 durable checkpoint 在同一个提交里发布了，归属哪个 Change 没有写明。
6. R2 方案文件头写着"discussion-only candidate — unaccepted"，但八步计划后来已被接受（`.ultra/decisions/2026-09-09-eight-step-implementation.md`）。
7. 5.0 设计稿说 CLI 只负责安装和 doctor，后来新增了 `ubp run` 和 `ubp slice`。

## 2. 外部参照（2026-10-04 核实）

| 做法 | 实际是什么 | 对我们的意义 |
|---|---|---|
| Claude Code advisor | 实验功能，用 `/advisor`、`advisorModel` 或 `--advisor` 开启。何时调用由模型决定，通常在定方案前、同一错误反复出现时、宣布完成前。顾问读完整对话，不写代码，子代理会继承设置。只支持 Anthropic API。 | "定方案前"和"完成前"两个时机和 Ultra 的审查点重合，可以在支持的宿主上利用，但不能作为硬依赖 |
| Codex subagents | 内置 worker、explorer、monitor 角色，每个角色可配不同模型。`agents.max_threads` 默认 6，`max_depth` 默认 1。 | Codex 上的分工可以直接用宿主原生能力 |
| yarg119/trellis | Opus high 主会话，Sonnet medium 子代理，Fable 顾问，外加需要外部 API key 的 Jev 分类器。README 没有实测的省钱数据。契约层只有 `contract.md`、`/done` 和一个停止门。 | 结构可以参考，项目知识层很薄，这正是 Ultra 的长处 |
| 截图里的 $0.57 对 $0.22 | 比的是"顾问每轮都调用"和"需要时才调用"，不是和单个 Agent 比 | 不能拿来证明多 Agent 比单 Agent 便宜 |

这类做法省钱，靠的是三件事：强模型只在决策点出场；子代理在独立上下文里读和改，主会话只拿结论；测试和停止条件挡住没意义的重试。

**不照搬的部分：**
- **Jev 分类器。** "改哪个文件、用哪个工具"需要理解语义，应该留给主模型。"重试还是停"Ultra 已经有明确的出口（Converged / Stalled / Unreachable）和预算硬上限。而且它要为每个小决策多调一次外部模型。
- **把 advisor 当硬依赖。** 它是实验功能，只有 Claude Code 有，只支持 Anthropic API。

## 3. 已形成的设计判断

### 3.1 两半各自的取舍

| | 保留 | 改变 |
|---|---|---|
| 思路与文档 | 意图、规格、任务上下文、验收标准。外部方案都没有这一层。 | 瘦身。所有 `SKILL.md` 合计约 180KB，`ultra-dev` 和 `ultra-delegate` 各约 21KB（约 5k token），每次调用都整体加载。 |
| 执行 | 有界收敛、权限和 effect 边界、跨会话恢复 | 默认分工交给宿主原生机制。Ultra 只提供任务上下文包和机械收敛判断。跨厂商委派改为显式可选。 |

### 3.2 关于 mod（已定：做 Claude Code 上的增强投递层）

mod 是 Claude Code 新的函数式 hook 插件。和只能跑 shell 命令的 hook 相比，它能在进程内拿到工具调用、改写系统提示的某一段、显示面板、保存会话状态。Owner 决定用它来改造 Claude Code。

它的定位是**投递层，不是权威**。上下文的权威仍然在文件里，其他宿主通过 Skill 和 Hook 读写同一套文件。具体用途和约束见 5.8。需要注意三点：
- mod 只在 Claude Code 上有。
- 接口是 Early Access，每个版本都可能变，需要按版本锁定和测试。
- 改写系统提示和宪法排除的 prompt projection 冲突，需要修订（第 7 节）。

### 3.3 和 marketplace 的关系

Ultra 引用这些小循环，不再复制一份。重叠情况见 1.8，取舍见第 6 节。

### 3.4 简化后的 Ultra 由什么组成

| 部分 | 内容 | 是否 Ultra 独有 |
|---|---|---|
| 大循环约定 | 北极星、边界、终止条件、总预算，以及一轮怎么走（第 4 节） | 是 |
| 活的上下文 | 项目知识的条目、范围、层级、读写约定、升降级规则（第 5 节） | 是 |
| 小循环内部 | 澄清、调研、构建、审查、续接，组合 deep-thinking、ultra-goal、task-state、building-rules、agent-delegation | 否，引用 marketplace |
| 宿主适配 | 六个宿主的安装和 Hook；Claude Code 上额外用 mod | 是 |

除这四部分以外的东西，都是删除或冻结的候选，见第 6 节。

## 4. 两层循环设计

### 4.1 定义

**大循环**是一个很薄的框：北极星、边界、终止条件、总预算。它不做计划，只保留一个随时可改的"下一步打算"。技术细节会随着小循环推进不断变化，大循环不锁定它们。大循环要管的东西很少，但最重要。

**小循环**是交付一个可验证结果的执行单元。

**大循环是一份约定，不是一个运行时。** 它没有调度器、daemon 或后台唤醒，这些都在宪法的排除项里。推进它的是宿主里的主模型：读文件，按约定做下一步。

**和现有结构的对应：** 大循环对应 `.ultra/north-star.md`，一个小循环对应一个 Change。现有的 Change 本来就是"一个有界结果，加上它的验收和 Execution Grant"，同一时间最多一个处于 active，交付后归档，下一个请求开新的 Change。task 降为小循环内部的步骤，属于可变计划。如果 Change 和 task 都保留成独立的一层，就又变成三层了。（Owner 2026-10-04 确认小循环对应 Change。）

| | 大循环 | 小循环 |
|---|---|---|
| 控制什么 | 北极星；边界（永远不做的事）；终止条件，包括成功和放弃两种；总预算 | 这一轮要交付的一个结果、它的验收标准、技术方案 |
| 谁能改 | 只有 Owner | 模型在授权范围内可以改，改了要写决策记录 |
| 反馈信号 | 每个小循环结束时问两件事：离北极星更近了吗？剩下的路还走得通吗？ | 每次迭代的测试和构建结果 |
| 记录什么 | 北极星；已完成小循环的结果和证据；"下一步打算" | 当前进度、教训、下一步 |
| 怎么结束 | Owner 确认成功、放弃，或预算耗尽后由 Owner 决定 | 见 4.3 的五种终态 |

### 4.2 尺度判据

**看停止条件能不能在一个工作会话内由机器检查。** 能，就是小循环。不能，比如需要 Owner 判断，或者要好几个结果拼起来才算数，就属于大循环。

两个推论：
- 大循环的终止条件，不应该被任何单个小循环满足。
- 一个小循环如果必须由 Owner 判断才算完成，它其实是大循环的检查点，应该拆开或改写验收。

### 4.3 小循环的颗粒度

一个小循环要同时满足四个条件：

1. **只有一个可验证的结果。** 开始之前就能写出验收命令（ultra-goal 里叫 Anchor）。
2. **一个写者、一个会话内能做完并验证。** 需要两个写者并行，就拆成两个小循环。跨会话续接（Resume Note、durable 授权）是中断后的恢复手段，不是用来把小循环撑大的。
3. **做完后系统处于一致状态。** 在这里停下，不会留下做了一半的东西。
4. **产出的证据能让大循环更新判断。**

**太细：** 改一次、测一次，只是小循环里的一次迭代。它对大循环没有单独的意义，为它单独做一次判断，开销比价值大。

**太粗：** 开始前写不出验收标准；需要多个写者协调；要跨好几个会话、中途肯定要压缩上下文。遇到这些就拆。

**两种小循环：**

| 类型 | 做什么 | 验收的是什么 | 现有对应 |
|---|---|---|---|
| 构建循环 | 产出代码变更 | 测试和构建结果 | `ultra-dev`，ultra-goal |
| 学习循环 | 消除一个不确定性：调研、spike、方案比较 | 一个有证据支撑的决定 | `ultra-research`，deep-thinking |

技术路线之所以会变，主要是学习循环的结论在改大循环的"下一步打算"。

**终态**，沿用 `NS-05` 的五种：结果被接受、需要 Owner 决定、外部阻塞、预算停止、放弃。小循环不会自动延长一轮。

**小循环内部要不要多开 Agent**，沿用 ultra-goal `references/graph-topology.md` 里的三个条件：需要隔离上下文、需要并行、需要专门化。三条都不满足就一个 Agent 做。只读的探索、调研、审查可以并行；写入始终只有一个写者。

### 4.4 由谁来判断

原则：**裁判的权限跟被判断对象的层级一致。**

| 判断什么 | 谁来判 | 怎么判 |
|---|---|---|
| 这次迭代过没过，该重试还是该停 | 机器给事实和硬上限，主模型判断出口 | 机器跑验收命令、执行预算上限。属于 Converged / Stalled / Unreachable（已收敛 / 停滞 / 走不通）中的哪一种，由主模型根据证据判断，不从轮数推断（沿用现行 `ultra-dev`） |
| 一个小循环算不算完成 | 先由机器判验收命令。验收里有机器测不出的质量要求时，再加一个独立审查者 | 审查者不能是写代码的那个，只看产物和验收标准，不看写者的推理过程。担心"两个人都说没问题，其实谁都没认真查"时，再加一个 critic 去审审查者 |
| 下一个小循环做什么，计划还对不对 | 主模型 | 这是策略判断，在授权范围内做，写决策记录。支持的宿主上可以在这里问 advisor |
| 北极星达成没有，要不要停，要不要改方向 | Owner | 模型只能拿着证据提出"终止条件已满足"，不能自己宣布结束 |

审查预算沿用 `FP-4` 和 `HC-7`：只有 Owner 指定的阻断类问题会触发下一轮，非阻断问题只报告不自动修复，预算耗尽时把选择交还 Owner。具体轮数是产品合同或授权里的数字，不写进宪法。

### 4.5 冻结、停滞与上交

- **冻结项不能被模型改。** 北极星、边界、终止条件，以及小循环开始后它自己的验收标准，都属于冻结项。一旦被改，这一轮作废，回到 Owner 重新确认。ultra-goal 已经这样做："A moved goalpost closes the run"。
- **大循环也要有停滞判定。** 连续 N 个小循环都没有产生跟北极星相关的新证据，就停下来交给 Owner。N 的默认值放在产品合同或授权里。这个计数只负责触发上交，不对质量下结论，和 `FP-2`、`FP-4` 一致。没有这一条，一串"各自都合理"的小循环会慢慢偏离北极星，而每个小循环的裁判只看自己的验收，发现不了。
- **以下情况直接交给 Owner：** 小循环的结论推翻了大循环的前提；需要越过边界；碰到预算上限；需要任何外部 effect（`HC-6`，例如 commit、push、发布、安装）。

### 4.6 一轮怎么走

1. **Owner 确认大循环。** 内容是北极星、边界、成功和放弃条件、总预算、允许的分工范围。
2. **主模型提出下一个小循环。** 说明要交付的结果、验收命令、类型（构建或学习）和执行方式。显式授权的模式下由 Owner 选择；在授权范围内可以直接开始。
3. **小循环执行。** 一个写者，按需用宿主原生的子代理或顾问。编辑和测试的迭代在预算上限内进行，按 Converged / Stalled / Unreachable 三个出口结束。
4. **小循环判定。** 机器跑验收，需要时加独立审查，得到一个终态和对应证据。
5. **大循环检查点。** 主模型对照北极星更新"下一步打算"，按 `FP-7` 的八项语义给 Owner 一个简短检查点：为什么做、结果、边界、变化、真实状态、需要的决定、下一步、没做完的。
6. **判断是否终止。** 满足终止条件时由 Owner 确认；否则回到第 2 步。

### 4.7 文件落点（初稿）

一项事实只能有一个权威（`HC-4`），所以每一行只能选一个落点。

| 内容 | 层级 | 现有落点 | 状态 |
|---|---|---|---|
| 北极星、边界 | 大循环，冻结 | `.ultra/north-star.md` | 已有 |
| 项目层的成功和放弃条件、总预算、允许的分工范围 | 大循环，冻结 | 暂无专门位置 | 待定：在 `north-star.md` 增加一节，或作为 `decisions/` 里的授权记录 |
| 已完成小循环的结果和证据 | 大循环，记录 | `changes/archive/<id>/delivery.md`、`evidence/` | 已有 |
| 下一步打算（候选的下一个 Change） | 大循环，可变 | 暂无专门位置 | 待定 |
| 小循环合同：结果、验收、边界、授权 | 小循环，冻结 | `changes/active/<id>/intent.md` | 随"小循环对应 Change"确定。冻结项和 ultra-goal 的 Frozen 条款对齐；不再另建 goal 文件，避免同一合同有两份 |
| 小循环内部的步骤 | 小循环，可变 | 现在是 `tasks.json` 加 `contexts/` | 建议降为可变计划 |
| 小循环进度、教训、下一步 | 小循环，可变 | task context 的 Resume Note；或 goal 的 Carry-over | 跟随合同那一行 |

### 4.8 多 Agent 与多宿主

- **默认单宿主**，用宿主原生的子代理，协调成本最低。
- **多宿主只在三种情况下值得用**：需要独立性（换一家模型来审查）、某家模型在某类任务上明显更强、配额或成本的考虑。
- 跨厂商委派继续遵守 `FP-6` 和 `HC-5`：worker 不获得新权限，不写 canonical `.ultra`，只返回可以检查的 delta，不自动合并。
- 和 `HC-8`（拓扑由 Owner 选择）的关系见第 7 节。

## 5. 活的上下文

### 5.1 死的和活的

**死的上下文**写一次，每次整块加载，不管当前在改什么。代码变了，它不会跟着变；过时了也没有人知道。提示词工程、规则文件，以及 Ultra 现在的 `SKILL.md`，都属于这一类。

**活的上下文**有三个性质：
1. **和修改挂钩。** 按当前 Change 动到的范围挑选加载；改完之后，标出可能已经过时的条目。
2. **可编辑。** 小循环在工作过程中把新知道的东西写回去，不需要人专门整理。
3. **可进化。** 有证据才升级，被推翻就降级或退役，每一次变化都能追溯。

### 5.2 两种上下文分开处理

| | 项目上下文 | 方法上下文 |
|---|---|---|
| 内容 | specs、决策、约定、术语、教训 | Skill、工作流、提示词 |
| 跟什么挂钩 | 具体的代码和 Change | 跨项目的经验 |
| 怎么判断改得对不对 | 和代码对账：这些说法现在还成立吗 | 在留出的任务上做对比 |
| 改动频率 | 每个 Change 都可能改 | 慢，要攒够证据 |

两者混在一起，最常见的问题是把一个项目的教训自动升级成通用规则。ultra-goal 已经明确禁止这样做。

**先做项目上下文。** 它直接挂在 Change 上，也是 Ultra 独有的部分。方法上下文的进化放到下一阶段，做法见 5.7。

### 5.3 权威放在文件里（已定）

- 所有宿主读写同一套文件。Git 记录它的全部历史。
- 注入到模型的内容都从文件派生，可以随时丢弃，永远不能当作权威（`HC-4`）。
- Claude Code 上由 mod 负责投递（5.8）。其他宿主用 Skill 和 Hook。现有的 `session_context.py` 和 `mid_workflow_recall.py` 已经能按 task 注入验收标准，可以看作雏形。

### 5.4 一个上下文条目由什么组成

| 字段 | 说明 |
|---|---|
| 内容 | 一个说法，比如一条约定、一个决定或一个教训 |
| 范围 | 它覆盖哪些路径、模块或术语。"和修改挂钩"就靠这个字段 |
| 层级 | Frozen、Firm 或 Fluid，见 5.6 |
| 来源 | 哪个 Change、哪条证据让它成立 |

"可能过时"不写进条目。它是派生观察，由机器拿 Change 的 diff 和条目范围求交集算出来，随时可以重算。

**不另建一个集中存储。** 条目就是现有文件里的段落，包括 `specs/`、`CONTEXT.md`、`decisions/`、Change 记录里的教训。只要在每段旁边加上范围和来源。范围写在内容旁边，而不是放进一张单独的索引表，因为单独的索引会和内容慢慢脱节。具体格式待定（第 9 节）。

### 5.5 读写约定：循环之间只通过文件耦合

| 时机 | 读或写什么 |
|---|---|
| 小循环开始时读 | 大循环的冻结条款，加上范围和这个 Change 有交集的 Firm、Fluid 条目 |
| 小循环进行中 | 编辑某个文件时，按范围补充相关条目（Claude Code 上由 mod 做，其他宿主由 Hook 做） |
| 小循环结束时写 | 原始证据；本 Change 范围内 Firm 条目的修改，必须附证据；新的 Fluid 教训；可能过时条目的处理结果；交付记录里列出本次新增、修改、退役了哪些条目 |
| 大循环检查点 | 决定是否接受跨范围的修改提议和 Fluid 升级，再更新"下一步打算" |

小循环对各层的权限：
- **Frozen**：只读。
- **Firm**：在本 Change 的范围内可以改，改动跟 Change 一起审查、一起交付。超出范围的只能提修改建议。
- **Fluid**：可以自由写，但写的都只是候选。

这就是循环之间全部的耦合。没有共享的运行时，也没有后台进程。

### 5.6 稳定与灵活：三层和升降级

| 层级 | 内容 | 谁能改 | 怎么改 |
|---|---|---|---|
| Frozen | 北极星、边界、终止条件 | 只有 Owner | 修订北极星 |
| Firm | 已接受的 specs、决策、约定、术语 | 小循环在自己的范围内 | 通过 Change 带证据修改，经过审查 |
| Fluid | 教训、观察、猜测 | 任何小循环 | 改写当前摘要，而不是不断追加；保留证据指针 |

- **升级**：Fluid 升到 Firm，需要证据（被后续 Change 验证过，或者多次独立出现），并在大循环检查点被接受，由 Owner 或独立审查决定。
- **降级和退役**：证据被推翻，或者范围内的代码被删掉，就把条目标为退役。内容留在 Git 历史里，不再加载。

**要防的四种失败：**

| 失败 | 对策 |
|---|---|
| 膨胀：只加不删 | Fluid 只能改写、不能追加；退役的条目不再加载 |
| 改写丢细节 | 改写时保留证据指针；Firm 的修改必须是能审查的 diff |
| 错误教训被升级 | 升级需要证据和独立判断；项目教训不会自动变成方法规则 |
| 一个事实两份权威 | 每个条目只在一个文件里；注入的内容都是派生的 |

### 5.7 进化轨迹

- **项目上下文**：用 Git 加 Change 归档就能得到完整轨迹，不另建存储。只要求两件事：上下文的修改和引起它的 Change 一起交付；`delivery.md` 列出这次新增、修改、退役了哪些条目。
- **方法上下文**（下一阶段）：参照 Google WikiSkill 和微软 SkillOpt。目前只看了二手报道，没读论文原文。它们的共同做法有三条：
  1. 原始执行记录不能改。
  2. 一次只提一处修改，在留出的任务上胜过当前版本才接受。
  3. 保留被拒绝的候选和拒绝原因。

  我们第 8 步的方案对比，已经是这个做法的手工版。

### 5.8 mod 在 Claude Code 上做什么

| 用途 | 用到的 mod 能力 | 说明 |
|---|---|---|
| 编辑文件时补充相关条目 | `tool.call` hook | 按范围选出相关条目送进上下文，比 `mid_workflow_recall.py` 更精确 |
| 把当前小循环的冻结条款放进系统提示 | `prompt.compose` | 替换固定的一段，而不是每轮追加 |
| 显示当前状态 | 面板或状态行 | 显示当前 Change、已加载的条目、可能过时的条目 |
| 小循环结束时提醒写回 | `turn.complete` 等事件 | 只提醒，不自动写，也不自动接受 |

约束：
- 只投递，不裁决。
- 注入的内容从文件派生，可以随时丢弃。
- 不在后台自动运行维护任务，宪法排除了自动编排。
- 接口是 Early Access，按 Claude Code 版本锁定，用 `claude plugin validate` 和 `claude plugin test` 检查。
- 去掉 mod 之后，Claude Code 应该退回到 Skill 加 Hook 的方式，仍然完整可用（`HC-3`）。

## 6. 与现有设计的对照

下表把现有组成部分放进两层结构，并给出建议的处理方式。"建议"都需要 Owner 确认，本稿没有改动任何代码。

| 现有部分 | 在两层设计里的位置 | 建议 |
|---|---|---|
| `.ultra/north-star.md` | 大循环的冻结部分 | 保留，补上项目层的终止条件（第 7 节） |
| `specs/`、`CONTEXT.md`、`decisions/` | 活的上下文里的 Firm 条目 | 保留内容，给每段加上范围和来源（5.4） |
| `ultra-init` | 建立大循环 | 保留。`.ultra/` 骨架和保留原话的 Project Brief 是 Ultra 独有的 |
| `ultra-research`、`ultra-think`、`ultra-grilling` | 学习循环 | 通用的澄清和调研流程改为引用 deep-thinking。保留 Ultra 独有的写入规则：North Star 修订、带引用的 specs、`decisions/` 写入标准 |
| `ultra-domain-modeling` | 跨循环共享的项目知识 | 保留，marketplace 没有对应 |
| `ultra-change` | 开启一个小循环，写它的合同 | 保留 spec 与代码对账的语义。合同里的冻结项和 ultra-goal 的 Frozen 条款对齐 |
| `ultra-plan` | 小循环内部的步骤，以及大循环的"下一步打算" | 改变：不再为每个 Change 排一张固定的 task 表。小循环内部的步骤是可变计划，大循环只保留候选的下一个 Change |
| `ultra-dev`、`ultra-tdd` | 构建循环 | 保留 Converged / Stalled / Unreachable 出口和六维证据。通用工程纪律和 building-rules 重叠，考虑改为引用 |
| `ultra-review` | 小循环判定中的独立审查 | 和 ultra-goal 的 review、critic 高度重叠，只保留一套实现。要保留 Ultra 独有的部分：Owner 选择审查角度、aggregate 评审、跨模型家族复查。现行默认审查者就是当前 Agent（`skills/ultra-review/SKILL.md`），这和 4.4 "审查者不能是写者"冲突，见第 7 节 |
| `tasks.json` 账本 | 小循环内部 | 不再作为 task 状态的唯一权威层级。是保留为小循环内的可选记录，还是并入 Change 的 Resume Note，待定 |
| `ultra-test` | 大循环检查点上的全系统审计 | 保留，marketplace 没有对应 |
| `ultra-deliver` | 大循环的结果记录；外部 effect 交给 Owner | 保留 |
| `ultra-delegate` | 多宿主执行 | 降为显式可选。它的 stdio 引擎本来就调用 agent-delegation。Factory、RunSlice、durable checkpoint 不进入默认路径，去留等第 8 步 Owner 的 promote/reject 决定 |
| `ultra-status` | 大循环状态视图 | 保留。以后如果在 Claude adapter 里做只读面板，可以复用它 |
| 5 个 Hook | 机械事实、权限、恢复 | 保留。`session_context.py` 和 `mid_workflow_recall.py` 扩展为按范围注入上下文条目（5.5）；Claude Code 上由 mod 承担更精确的投递 |

## 7. 需要 Owner 决定的宪法修订

| 项目 | 现状 | 建议 |
|---|---|---|
| `HC-8` 拓扑选择 | Owner 为每个阶段和工作包选择 Agent、角色和拓扑；未选择时当前 Agent 单独继续，不自动派生子代理 | Owner 在大循环授权里给出分工范围（允许的角色、宿主、预算），主模型在范围内为每个小循环选择具体分工。没有给范围时，仍按单 Agent 默认 |
| 项目层终止条件 | `NS-05` 约束的是工作包的终止，项目层的成功和放弃条件没有专门字段 | 增加大循环的成功条件、放弃条件和总预算，由 Owner 接受 |
| 大循环停滞判定 | 暂无 | 增加"连续 N 个小循环无北极星相关新证据即上交"的规则，N 放产品合同 |
| 开启下一个小循环 | 打开新 Change 是 `explicit-entry`，必须 Owner 当场选择 | 两种做法任选：保持现状，每个小循环都由 Owner 开启（最安全，但 Owner 介入多）；或允许大循环的 durable 授权覆盖"在边界内开启下一个 Change"，范围和预算写在授权里。后者要对照 `HC-2` 确认不算"实质范围变化" |
| 小循环的审查者 | 现行 `ultra-review` 默认由当前 Agent 审查 | 小循环验收里有机器测不出的质量项时，审查者不能是写者，用另一个上下文或另一个模型。纯机器验收的小循环可以不审查 |
| 版本命名 | 仓库已有 3.0（2026-08-17）和 5.0（2026-08-26）设计稿，package 为 `5.0.2` | 本稿暂不用 "v3" 这个名字，版本号由 Owner 定 |
| prompt projection 排除项 | 宪法和 ARCHITECTURE 都排除了 prompt projection | 改为有条件允许：注入的内容必须从文件派生、可以随时丢弃、永远不能当作权威；关掉投递层后，只靠文件仍然完整（`HC-3`） |

## 8. 验证计划

- **沿用第 6 步现有的对比框架**：同一模型、同样预算，跑小修复、需要分工的功能、中断恢复三类任务。
- **对比三组**：纯 Solo；现在的 Factory；两层循环加宿主原生子代理（支持时加顾问）。
- **指标**：最终验收结果、总消耗、Owner 介入次数，以及偏离北极星时多快被发现。
- **证伪条件**：如果两层循环在验收相同的情况下，总消耗不低于 Solo，Owner 介入也没有减少，就不推广。

**活的上下文另外要验证：**
- 小循环开始时，相关条目有没有被选中，有没有混进不相关的。
- 代码改了之后，过时的条目有没有被标出来，多久之后被处理。
- 同一件事需要你重复解释的次数有没有下降（`NS-01`）。
- 加载的上下文体积有没有下降，同时验收结果不变差。
- 关掉 mod 以后，Claude Code 上同样的任务仍然能完成。

## 9. 未决问题与不做清单

**未决问题：**
1. 大循环的"下一步打算"和项目层终止条件放在哪里（4.7）。
2. 上下文条目的范围和来源用什么格式写在段落旁边（5.4）。
3. Fluid 升级到 Firm 的门槛：需要什么样的证据，由 Owner 还是独立审查决定（5.6）。
4. 停滞阈值 N 的默认值。
5. 第 7 节的几项修订：`HC-8`、项目层终止条件、开启下一个小循环的权限、审查者、prompt projection。
6. mod 先做 5.8 里的哪几项。
7. 方法上下文的进化什么时候开始（5.7）。
8. 版本号。

**已经定下的：**
- 两层循环；小循环对应 Change，task 降为小循环内部步骤（Owner 2026-10-04 确认）。
- 小循环合同就是 Change 的 `intent.md`，不再另建 goal 文件。这一条随上一条确定。
- 活的上下文的权威放在文件里，所有宿主共用；mod 只是 Claude Code 上的投递层（Owner 2026-10-04 确认）。

**本稿没有做的：**
- 没有改代码、`north-star.md` 或任何已发布内容。
- 没有验证 Claude Code 的子代理定义能否单独设置 effort。
- 没有验证六个宿主是否都支持插件之间的依赖声明。这会影响 Ultra 能不能"装一个就带上小循环"。
- 第 6 节的重叠关系来自对 `SKILL.md` 描述的比对，没有逐个跑实际任务验证。
- WikiSkill 和 SkillOpt 只看了二手报道，没读论文原文。
- 5.8 里列出的 mod 能力（`tool.call`、`prompt.compose`、面板、`turn.complete`），来自 Claude Code 2.1.288 的类型文件和文档，还没有写过实际的 mod 来验证。

## 来源

- `.ultra/north-star.md`（`north-star-v2-r3`）
- `docs/ARCHITECTURE.md`、`docs/PHILOSOPHY.md`、`docs/ARTIFACT-AUTHORITY.md`、`docs/WORKFLOW-LIFECYCLE.md`、`docs/USAGE.md`
- `docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md`、`docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md`、`docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`
- `skills/ultra-dev/SKILL.md`、`skills/ultra-change/references/`、`skills/ultra-delegate/references/`、`hooks/README.md`、`adapters/_shared/runtime-assets.cjs`
- `work/trellis-eight-step-20260909/stage-d-product-v2-comparison.zh-CN.md`、`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`、`docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md`
- Excellent-skill-Marketplace：`docs/skill-composition.md`、`docs/research/2026-09-14-skill-composition-validation.md`
- ultra-goal-skill：`plugins/ultra-goal/skills/ultragoal/SKILL.md`、`references/graph-topology.md`、`references/adversarial-review.md`、`references/loop-primitives.md`
- [Claude Code advisor 文档](https://code.claude.com/docs/en/advisor)（2026-10-04 查阅）
- [Codex subagents 文档](https://developers.openai.com/codex/subagents)（2026-10-04 查阅）
- [yarg119/trellis](https://github.com/yarg119/trellis)（2026-10-04 查阅）
- Google WikiSkill 二手报道：[eesel.ai](https://www.eesel.ai/blog/wikiskill)、[reworked.co](https://www.reworked.co/knowledge-findability/google-researchers-give-ai-agents-a-wiki-so-they-stop-repeating-mistakes/)、[papers.cool arXiv 2606.16523](https://papers.cool/arxiv/2606.16523)（2026-10-04 查阅）
- 微软 SkillOpt 二手报道：[Pebblous](https://blog.pebblous.ai/report/microsoft-skillopt-self-evolving-agents/en/)、[dailyaiworld](https://dailyaiworld.com/blogs/skillopt-self-evolving-agent-skills-guide-2026)（2026-10-04 查阅）
- Claude Code mod API：本机 Claude Code 2.1.288 的 plugin-authoring 类型文件（`claude-code.d.ts`）
