# ZCode 第一轮独立报告：执行可行性与最小充分架构

日期：2026-09-05。身份：三方交叉评审（Codex / ZCode / Kimi）第一轮，ZCode 独立报告。
本报告经 `agent-delegate → ACPX → ZCode` 链路执行（delegation_id `66fd0d18…`，wrapper 权限模式 `approve-all`）——这场关于委派链路的辩论本身正运行在被辩论的那条链路上，这个自反事实下文会用到。写作前未读 Kimi 的第一轮报告；Codex 的立场文件按任务要求作为待审对象阅读，不作为权威。

---

## 0. 方法与证据等级

本文区分四类陈述并逐项标注：

- **[本地观察]**：我用工具直接核对的仓库/机器事实，附 `file:line`；
- **[外部一手]**：我实际抓取并阅读的官方规范、工程记述或论文（读取程度如实声明：全文页、摘要页或 PDF 提取文本）；
- **[推断]**：由上述证据得出的我的判断；
- **[未验证]**：我没能核实的，明确列出。

我的 Round-1 角度是执行可行性与最小充分架构：ACP Skill 与 UBP 的所有权边界、真实图消费者、模型决策与机械等待、取消/并发写/重启/未知结果、任务内图变异与演化；同时攻击两命题中未经此角度检验的主张。

---

## 1. 总裁决

**两个命题的方向都存活，但都需要收窄。**

命题一（体验整改）：Codex 对原始诊断的批评成立——诊断的"系统里没有任何东西能反驳模型说'我做完了'"与现行合同和现行使用数据矛盾（§2.1，我做了量化核对）。但 Codex 的整改候选有一个未闭合的洞：它的验收标准（"Owner 能指出本轮还需决定什么"）仍然没有机械承载，且三条固定旅程的度量方案会掉进 METR 已经公开踩过的选择偏差与并发干扰陷阱（§2.2）。我引入 Bainbridge 1983 作为研究反例：**展示的改善不等于监督负担的下降**，除非进度信号自带"何时必须看"的警报语义（§2.3）。

命题二（软件工厂）：我把 Codex 的"工厂必须明确承担"收窄为一个可检验的主张——**Step 1/2 不需要图引擎，需要一个 slice 执行器**。"图"应降级为 slice 历史的派生视图；ACP Skill 的复用边界应是"注册/连接/receipt 复用，边界责任不迁移"；删除旧委派链的充分条件不是功能等价而是威胁模型等价（§3）。经我核对，Codex 提案中与此一致的部分（复用 R2 Primary/机械分工、验收器修订通道、演化需独立比较）在我找到的最强反例下仍然存活（§3.6、§5）。

---

## 2. 命题一：体验整改

### 2.1 原始诊断的哪些部分被现行源码反驳 [本地观察 + 推断]

原始诊断（`docs/wip/ultra-builder-pro-5.0-owner-experience-diagnosis.zh-CN.md` §1、§3）的核心论断是 task 里"没有任何可执行的东西"、系统没有反驳模型自报完成的原语。我核对了三层：

1. **合同层**：`skills/ultra-plan/references/task-evidence-v2.md` 定义了验收表格与四种 verification type——`command`、`inspection`、`owner-judgment`、`external-observation`，并规定 `.ultra/evidence/<task-id>/evidence.json` 为唯一完成记录，绑定 `raw_evidence_sha256` 与 freshness identity。
2. **使用层**（诊断未做的检查）：当前 `.ultra/evidence/` 下 22 个顶层任务证据目录中 16 个带 acceptance 条目；我抽样统计全部条目共 83 项，其中 **50 项为 command 型**，条目结构为 `{command, cwd, exit_code, raw_evidence_ref, raw_evidence_sha256, freshness_identity{git_head, worktree_digest, observed_at}}`——例如 `.ultra/evidence/v027-harness-loop-closure/evidence.json` 的 HL-01。这不是纸面合同，是在用的机械证据。
3. **症状层**：诊断引用的失衡仍真实存在——当前 `.ultra/` 有 333 个 `review-*` 文件对 29 个 `verification.log`、43 个 `evidence.json`。

**[推断]** 结论与 Codex 一致且可量化：诊断的"没有任何东西能反驳完成声明"在 ledger 字段层为真（`tasks.json` 确无命令字段），在证据合同与使用层为假；诊断把两层混在一起，得出了过强的根因结论。但诊断的三个症状描述（Research 无终结点、看不到进度、不确定产出）以及"审查压倒验证"的结构观察仍然有效——只是修法不是从零加 anchor 字段，而是让既有的四类证据合同成为 Research 与进度呈现的强制出口。我同时注意到一个未被双方指出的小事实：部分 command 证据的 `command` 字段写的是 "see the criterion receipt in the frozen verification.log" 而非命令本身（如上例 HL-01）——哈希绑定保住了不可抵赖性，但**证据的直接可读性在退化**，这恰是 owner "不确定产出是不是自己要的"的微观形态之一。

Codex 引用的其余本地主张我逐项核实：`skills/ultra-grilling/SKILL.md` 的 reframe 要求确为无条件（"It is **never skipped** because the original wording sounded clear"）；`hooks/mid_workflow_recall.py:16-41` 确在每次匹配的 PreToolUse 全量重注入 acceptance，无预算、无去重。这两处候选修改有源码依据。

### 2.2 对 Codex 整改方案的攻击点

**攻击一：验收无承载。** Codex 为整改设定的可观察验收是"已给出的答案被直接复用；Owner 能指出本轮还需决定什么和何时退出"（工作提案 §1 表格）。"被复用"可以靠 decisions 记录核查，但"还需决定什么、何时退出"没有任何工件承载它——按 Goal Skill 已经验证过的模式，这个承载是两样东西：**已答决策的显式复用记录**（equivalent of `<slug>.decisions.md` 的 Decision/Rejected/Who 四列，UBP 的 `.ultra/decisions/` 已有位置语义）和**退出条件的成文**（equivalent of `success: verified / ceiling: N`）。Codex 的提案文本没有落到任何具体文件或 schema，按它自己引用的 Goal 反模式表（"A script emitted for a runtime nobody proved"）衡量，这目前是一句"没有 runtime 的脚本"。

**攻击二：三旅程度量的 METR 陷阱。** [外部一手] 我读了 METR 的 uplift 更新（https://metr.org/blog/2026-02-24-uplift-update/）：他们原始实验发现 AI 使熟练开源开发者任务耗时增加 19%（CI +2%~+39%），而后续更大规模实验因选择效应**整个放弃**——opt-out 偏差（不愿脱离 AI 工作的开发者拒绝参加）、任务级自选（30-50% 开发者跳过提交"没有 AI 不想做"的任务）、以及"开发者并行运行多个 AI agent 使时间报告不可靠"。Codex 提案已正确引用 METR 说"初轮小样本只能定位机制"，但它的三条固定旅程要测的恰恰是"Owner 实际投入时间、重复问题数、首次可用结果时间"——同一类自报度量。**[推断]** 若不先定度量协议（谁计时、怎么隔离并发 agent、owner 中途退出怎么算），三旅程的结论无论正面负面都不可归因。这不是反对做三旅程，是把它的前置条件补上。

### 2.3 研究反例：Bainbridge 1983《Ironies of Automation》 [外部一手，PDF 全文提取阅读]

我把这篇 1983 年的经典论文（Automatica 19(6):775-779；我从 https://davidjusth.com/s/Ironies-of-Automation_Bainbridge_1983.pdf 镜像下载并提取全文，出版方版本在 https://www.sciencedirect.com/science/article/pii/0005109883900468 ）作为对"改善展示=降低负担"的研究反例。三个直接可引的结论：

1. "the more advanced a control system is, so the more crucial may be the contribution of the human operator"——自动化越先进，人的贡献越关键，而不是越可省。
2. 警觉性研究（引 Mackworth 1950）："it is impossible for even a highly motivated human being to maintain effective visual attention towards a source of information on which very little happens, for more than about half an hour"——对低频异常的监控在约半小时后失效，所以异常检测必须由带警报的机制承担，而不是靠 owner 看 RunStatus 卡片。
3. 最锋利的一条："If the human operator must monitor the details of computer decision making then, ironically, it is necessary for the computer to make these decisions using methods and criteria, and at a rate, which the operator can follow, even when this may not be the most efficient method technically... he will be unable to trace back through the system's decision sequence to see how far he does agree."——若要求人监督机器决策，机器必须以人能跟随的判据和速率决策，否则人不同意时无法回溯。

**[推断]** 对命题一的含义：Codex 自己在第 6 节问了"上述短流程是否只让卡片更好看，而没有降低 Owner 的实际参与负担？"——我的回答是这个风险是真实的且可从上述研究推出：如果工厂自主运行数小时而 owner 只在收尾看一张卡，owner 的抽查能力会随运行时长衰减，而最需要人的恰是异常时刻。最小补救不是更多卡片，而是两条：(a) 进度信号必须区分"正常推进"与"需要你"（attention/alert 语义，而非 status 语义），并让失败"fail obviously"（Bainbridge 原话："automatic systems should fail obviously"）——这与 R2 §6.5 Attention 合同和 HC  fail-closed 规则同向，我支持把它前移到体验层；(b) 关键决策的回溯路径（为什么走这条 route、为什么跳过这个 review）必须以 owner 可跟随的粒度落盘，否则"不同意时无法回溯"成立。**限制**：Bainbridge 研究的是过程工业与驾驶舱监控，人与系统的时标（分钟级连续监控）与 owner-每周抽查不同，我引用的是其机制性结论（警觉衰减、监督可跟随性），不是其场景结论。

### 2.4 命题一幸存的主张

经上述攻击后仍然成立：先改真实对话路径而非先加状态字段（Bainbridge 反而反对用机制替代可跟随性）；复用四类证据与 Goal 的验收/独立 review 模式；逐项消融而非全删（Anthropic harness 消融的教训，Codex C2，我未重读原文故按 Codex 引用标注）。需要撤回或降级：诊断的"缺失原语"总因果链（§2.1 已驳）；Codex 验收标准里所有无工件承载的条目。

---

## 3. 命题二：执行可行性与最小充分架构

### 3.1 ACP Skill 与 UBP 的所有权边界

**[本地观察] wrapper 侧**（`/Users/rocky243/.local/bin/agent-delegate`）：
- 一次性调用：`:398-414` 构造 ACPX `exec --file -` 单次命令，`--non-interactive-permissions fail`、`--suppress-reads`；
- 环境全量透传：`:458` `child_env = os.environ.copy()`，仅追加 `AGENT_DELEGATION_*` 三个变量；
- 超时语义：`:471` `subprocess.run(..., timeout=timeout + 30)`——TimeoutExpired 只杀 ACPX 这个直接子进程；
- 成功语义：`:491` `status = "success" if return_code == 0`——transport 级退出码即成功，assistant text 原样保存进 receipt；
- 其 SKILL.md 自述：默认 `approve-all` 且带 Terminal；"`--cwd` supplies task context; it is not an operating-system sandbox"。

**[本地观察] UBP 侧**（`skills/ultra-delegate/scripts/delegate-worker.cjs`）：
- 启动前绑定：`:326-337` spec/instruction/permission/output_schema 四重 SHA-256；
- 物理围栏：`:338-343` `fenceHeldForLaunch` 失败即拒绝启动（注释明言 fence 是对抗第二 writer 的唯一屏障）；
- 独占锁：`:347-353` worker 不能绑锁就不启动；
- 写边界事后核验：`:385-390` 实际 Git diff 逃出 writable_roots 即 `unauthorized_write`；`references/delegation-contract.md:22-44` 规定 `.ultra/` 在任何 root 下对 worker 不可写；
- 未知结果：`:434-443` 任何已启动 Host 的终态发布都先过 `boundaryProof`，不能证明 writer 树停止即以 `outcome_unknown` 覆盖一切并保留 fence（`:449-471` 注释：冻结终态只有显式恢复可解）。

**[外部一手] 协议层**：我实读了 ACP v1 prompt-turn 规范（https://agentclientprotocol.com/protocol/v1/prompt-turn ）：turn 由 `session/prompt` 开始，Agent 必须以 `stopReason` 结束（`end_turn|max_tokens|max_turn_requests|refusal|cancelled`）；取消是 `session/cancel` 通知，client 应把未完成 tool call 预标 `cancelled` 且**必须**以 `cancelled` 回答挂起的 `session/request_permission`；权限由 `session/request_permission` 承载。规范页内**没有任何**工作区写者互斥或软件验收语义。这独立证实了 Codex C4 的判断（"end_turn 不是软件验收；协议不定义工作区单写入者"）。

**[推断] 裁决**：分层所有权可以精确化——
- **连接层**（agent 注册、doctor、session/turn、receipt 格式）：复用 ACP Skill，没有异议；
- **边界与证据层**（writable roots、worktree fence、`.ultra` 只读、git-diff 核验、outcome_unknown）：**不可迁移**。这不是偏好而是威胁模型差异：wrapper 的默认 `approve-all` + 环境全量透传 + "cwd 不是沙箱"，对"有人的、单次、caller 负责整合"的委派是自洽的；对无人值守工厂，控制面变量（session/token）会随 `os.environ.copy()` 进入每个 worker，权限模型退化为 mission prompt 的语义约束。R2 §10.1（descendant environment isolation）列的正是这个洞。
- **删除旧委派链的充分条件**：Codex 问"充分条件是什么"（提案 §6）。我的回答：**威胁模型等价，而非功能等价**——在 ACPX 路径上重放 delegate-worker 已有的失败注入族（fence 丢失、锁篡改、diff 越界、超时孤儿、boundaryProof 不可证），全部得到现有同型 typed failure 后，才允许删对应逻辑。D1 的合同测试已存在（`tests/` 下有对应 fixture），迁移的验证成本主要是换 transport 后重放，不是新建。

**[推断] 自反证据**：本次评审正在 wrapper 上运行——我的 delegation context 权限即 `approve-all`，而产品自己的 host profile 把 ZCode App-bundled transport 标为 `experimental`（AGENTS.md：runtime-assets 与 host-profile 为源）。也就是说：工厂的第一批"真实消费者"（这场辩论）已经在一条默认全权限、实验性成熟的链路上工作。这既证明链路可用，也证明 Codex L2 的警告（"wrapper 的 success 来自子进程退出码，不是产品完成"）不是理论——本次 Claude Code 中断（`01-claude-round1-incomplete.zh-CN.md`：session limit，process exit 1，stop reason 空，328 秒）就是 `error` 终态而非任何语义失败。

### 3.2 真实图消费者：存在，但只有一个主机，且生命周期=会话 [外部一手]

Goal Skill 的 `workflow.js` 附件（`agent()/pipeline()/parallel()/phase()`、`meta` 纯字面量、顶层 await、per-agent schema）要求"已验证的 consumer"却从不指名。我找到了它：**Claude Code Dynamic Workflows**（https://code.claude.com/docs/en/workflows ）——API 完全吻合（同名函数、`export const meta` 首语句纯字面量、脚本在 async 函数体内求值、`schema` 逐 `agent()` 传递）。其文档同时给出硬限制：脚本在隔离环境执行、无 import、无文件系统/Shell 直访；**确定性强制**（`Date.now()`/`Math.random()`/无参 `new Date()` 直接抛错，保证重放）；并发上限 16 agent；**无文档化的超时**；**无中途用户输入**；运行是会话内后台任务——普通退出即停止，`--resume` 可重放缓存结果，跨会话不存活。

**[推断] 三条含义**：
1. Codex"样例必须有真实已验证 consumer"成立，且现在可以具体化：consumer 存在，是 Claude Code 单主机、会话生命周期。Goal 文档自己的谨慎（"语法检查≠可用性"）是对的。
2. 跨主机工厂不能建立在 host-native workflow runtime 上——这为"工厂自有运行时"提供了真实论据（不只是 Codex 的偏好）。
3. 但"自有运行时"不等于"图引擎"——见下节，这是我对 Codex 提案最主要的收窄。

### 3.3 我的具体替代：最小充分执行面（Minimal Sufficient Execution Surface）

Codex 提案 §3 说"每次编译当前有足够依据执行的一小段图；图可以包含依赖、并行、汇合及反馈回边"。方向对，但它没有说明 Step 1 到底需要哪些机械件。我的主张：

**Step 1/2 需要的是 slice 执行器，不是图引擎。组件清单：**

1. `run-slice.json`（R2 §6.3 已定义：attempt packets、barrier 规则、budget、cancel 策略）；
2. 一个普通 CLI 执行器：启动 delegate 原语（复用 delegate-worker 全部边界）、以**进程句柄/文件轮询**等待（不是模型回合）、barrier 归并成一份 `attention.json`；
3. 唤醒机制只用 **W1**：Primary 在一次前台 tool call 中调用执行器，执行器阻塞运行并在同一 tool call 返回 attention JSON——等待期间 0 模型回合，R2 §8.3 的 W1 本来就是这么定义的；
4. "图"是**派生视图**：从 slice 序列投影出的依赖/并行描述，仅用于 owner 可读展示与事后归因，不存储、不执行、不成为权威（符合 HC-4 一次语义一份权威——避免 run-slice 与"图"两份合同）。

依赖、并行、汇合、反馈在 slice manifest 里就是 barrier/attempt 字段；反馈回边就是 Primary 读了 attention 后编译下一个 slice。没有任何一步需要一个能"走图"的通用引擎。

**两个支持这一收窄的外部证据**：
- **LangGraph 的隐藏成本** [外部一手，https://docs.langchain.com/oss/python/langgraph/interrupts ]：`interrupt()` 暂停靠抛异常，恢复靠 `Command(resume=...)`，且文档明言 "The node restarts from the beginning of the node where the interrupt was called when resumed"——所以暂停/恢复机制把**幂等性责任转嫁给每个节点作者**（文档警告 pre-interrupt 副作用必须幂等、interrupt 调用严格按索引匹配）。CC Workflows 同理：确定性靠禁止 `Date.now()` 强制实现，代价是所有时间输入必须走 `args`。**[推断]** 通用暂停-恢复引擎的代价不是代码量，是每个节点被迫满足的约束；slice 执行器把同样的约束收敛到"worker 结果必须 typed 且幂等可重放"一条——delegate-worker 的 typed result + git-diff 校验已经是这条。
- **Temporal 反例** [外部一手，https://docs.temporal.io/temporal-explained/introduction ]：行业级的"记忆外等待+任意故障下完成"答案是 event sourcing + Temporal Server + 数据库 + worker 进程，换来 "exactly once and to completion"。**[推断]** 这正是 HC-3 禁止的必备 daemon/数据库形态；它的存在证明全耐久是重机制而非免费默认。Step 1/2 的最小充分替代是已有的：typed terminal + 未知即冻结 + owner reconcile。W4/持久事件日志应等到有真实 unattended 用例（R2 §12.4 自己也是这么排的）。

**对我自己方案的诚实检验**（任务要求"challeng whether your own execution solution creates more burden"）：
- W1 占用 Primary 一次 tool call 直到 barrier——受 host 对单次 tool call 的时长上限约束、会话必须活着。CC 本次额度中断说明这在真实世界里会发生。所以 Step 1 的 slice 必须按"一次会话内可完成"切粒度，且**额度耗尽必须成为一等终态**：`budget_exhausted`（已知、可恢复、保存恢复入口、不自动重试），而不是现在 wrapper 口径的 `error`。这直接回应 Codex"接通 Agent 和一次任务成功是不同事实"。
- Bainbridge 同样打击我的方案：执行器再机械，attention 若不带警报语义，owner 负担不降反升（§2.3）。

### 3.4 取消、并发写、重启、未知结果

- **取消**：ACP 规范的 cancel 语义（预标 cancelled、回答挂起权限、`stopReason: cancelled`）我已实读；但协议管不到进程树。wrapper 超时只杀 ACPX 直接子进程（`:465-482`），目标 Host 的后代进程可能成为孤儿 writer。delegate-worker 的 `boundaryProof` + 冻结 fence 正是补这个洞的——**[推断]** 所以迁移 ACP 时这部分不是"优先复用已存在逻辑"级别的建议，而是不可削减项；Codex 表格把它列对了，但"优先复用"的措辞弱于事实。
- **并发写**：`.ultra` 永不可写 + writable roots + git-diff 核验（`delegation-contract.md:22-44`、`delegate-worker.cjs:385-390`）已经构成写者互斥的机械承载；R2 Step 1 要求的"两个 ownership-disjoint worker 真实重叠窗口"是可以直接复跑的既有能力（D1 曾是独立预算，本轮不激活，仅指出代码在）。
- **重启/未知结果**：`outcome_unknown` 的冻结语义（保留 fence 与锁身份，等显式恢复）是我见过的最小正确设计——比 Temporal 轻一个数量级，比"重发一次试试"安全。唯一要补的是上一条的 `budget_exhausted` 终态与"恢复入口"作为 receipt 一等字段（Codex 已提出保存未完成原因，我把它落到 terminal 分类学）。

### 3.5 任务内图变异与跨任务演化

**任务内变异 [推断，机械承载]**：Codex 问"怎样既保留自主性，又防止把已执行事实和依赖悄悄改写"（§6）。我的答案：**append-only slice 历史**。已执行 slice 是不可变事实（含 base revision 与各节点结果摘要）；变异=Primary 编译新 slice 时显式声明 `supersedes`（指向旧 slice 及被替代的未执行节点）并重查受影响下游条件；"图"作为派生视图随之自然更新，无需改写任何历史。这等价于 Goal 的三层冻结（Frozen/Firm/Fluid）在 slice 粒度的投影：已执行=Frozen，未执行计划=Fluid，方法与角色=Firm（记 decisions 行）。Goal 2.14 的 `## Challenges from the run` 通道（运行方对条款的异议落到 decisions 记录、owner 裁决）是"自主性不改写事实"的已验证先例，值得工厂在 attention 里带一个同型字段。

**跨任务演化**：我独立读了三篇 Codex 未用来支撑演化层最小化的论文摘要，结论一致指向"先小后大"：
- MAST（arXiv:2503.13657，摘要页）：1600+ 轨迹、7 框架、14 类失败归 3 组（系统设计/Agent 间错位/任务验证），kappa 0.88；摘要明言多 Agent 系统在流行基准上的收益"often minimal"。**演化层的第一批候选应该来自失败分类，而不是搜索**——MAST 恰好提供了分类起点。
- AFlow（arXiv:2410.10762，摘要页）：workflow 即代码 + MCTS + 执行反馈，6 个基准平均 +5.7%、小模型以 4.55% 成本超 GPT-4o（特定任务）。但它是**有精确评分函数的基准**搜索——Codex 的限制声明（"不等于开放软件项目全自动演化成立"）经我读摘要后成立。
- AgentVerse（arXiv:2308.10848，摘要页）：动态组合多 Agent 团队是活跃研究方向，评估在基准任务上——支持"动态拓扑可行"，不支持"在真实仓库+权限+写者互斥下已验证"。
- 防误引声明：**"More Agents Is All You Need"（arXiv:2402.05120，摘要页）的 scaling 结论是 sampling-and-voting（同题多次采样+投票，即 self-consistency 集成），不是多 Agent 分工协作**——任何把它引为"图/多 Agent 协作收益随规模上升"的论证都是类别错误。它的"收益与任务难度相关"表述也不含饱和点结论（摘要未报）。

**[推断] 最小演化面**：失败分类（MAST 式）→ 人工/半自动生成候选 → 隔离样本与较简单基线比较 → owner 晋升。把 MCTS 式自动搜索推迟到存在可信 held-out 评测集之后——不是因为搜索没用，而是 AFlow 的收益前提（精确评分函数）在本案尚不存在，Codex 自己也是这么写的（§4"较简单基线"），我支持并加一条：演化层的每次比较必须包含"当前模板+更简单基线"，防止机制单向棘轮。

### 3.6 反例总检验：更多机制/更多 Agent 自动改善交付？

我找到的最强三件反例证据（均已实读）：

1. **Cognition《Don't Build Multi-Agents》**（https://cognition.com/blog/dont-build-multi-agents ，2025-06，Walden Yan）：两条原则——"Share context, and share full agent traces, not just individual messages"、"Actions carry implicit decisions, and conflicting decisions carry bad results"；推荐单线程线性 Agent + 上下文压缩模型。**限制（我读原文核实）**：全文**没有量化数据**（我的记忆里有 SWE-bench 数字，读后证伪——这正是必须读原文的原因）；作者公司销售单线程产品 Devin，立场相关；观察止于 2025 年中。
2. **Anthropic 多 Agent 研究系统**（https://www.anthropic.com/engineering/built-multi-agent-research-system ）：多 Agent 约用 15× chat token（单 Agent 约 4×）；内部研究评测上较单 Agent 提升 90.2%（相对值）；BrowseComp 上 token 用量单独解释 80% 方差；并行 3-5 个 subagent 使研究时间最多降 90%；并明确说**需要共享上下文或 Agent 间多依赖的领域"not a good fit for multi-agent systems today"，且多数编码任务的可并行度低于研究**。
3. **MAST**（见上）：流行基准收益"often minimal"，失败集中在设计/错位/验证三类。

**[推断] 幸存的主张**（不强行对抗的部分）：
- "多 Agent 有真实收益"幸存但被收窄到：上下文隔离、真并行可分、专业化的任务（Anthropic 的收益场景 + Goal graph-topology.md 自己的三条件——该文件与 Anthropic 数字同向，含"多 Agent 3-10× token、orchestrator-worker 约 15×"的量级引用，与 Anthropic 原文一致）。
- Codex"高耦合任务允许串行，不强制多 Agent"与 R2"系统能正确选择不并行"经反例后**更**成立。
- **我的加码**：工厂 Step 1 fan-out 的第一价值不是速度，是**证据边界的机械化**——隔离工作区+独立验证+"你写的必须等于你声明的 diff"。速度收益（Anthropic 的 90%）属于研究型可分任务，不应作为编码工厂的默认预期。
- 同样被反例约束的还有我自己：slice 执行器方案若默认每任务 fan-out，就撞上同一堵墙；默认拓扑应是 Solo，fan-out 是被 admission 证明的选择（R2 本来就这么写，我支持）。

---

## 4. 必须由 Codex 与 Kimi 回答的问题

**问 Codex：**
1. wrapper 的 `approve-all` + `os.environ.copy()`（`:458`）与工厂无人值守威胁模型直接冲突。你说的"以现有 ACP Skill 为复用入口"精确到哪一层——只复用注册/doctor/receipt 格式，还是连 exec 路径也复用？若后者，环境净化与权限收紧由谁实现、在哪个仓库？
2. 删除旧委派链的门槛：你是否接受把"威胁模型等价"（§3.1 的失败注入重放清单）作为充分条件，而不是功能等价？若不接受，你的等价定义是什么？
3. 三条固定旅程的度量协议：谁计时、如何隔离并发 agent 干扰、owner 中途放弃如何计入？METR 已示范自报时间不可靠——你是否接受把度量协议作为整改的前置交付物？
4. 你提案 §1 的五条验收里，"Owner 能指出还需决定什么/何时退出"落到哪个文件、什么 schema？若答案是无，是否接受引入 decisions 复用记录+成文退出条件（Goal 同型）作为最小新机制？
5. `budget_exhausted` 是否应进入 delegation/result 的 terminal 分类（本次 CC 中断的教训）？若是，它属于 wrapper、delegate-worker 还是 slice 执行器？
6. Step 1 的第一条真实任务是什么？若答不出，工厂 CLI 是否正落在 Goal 反模式表里"A script emitted for a runtime nobody proved"？

**问 Kimi（管理 Worker 视角）：**
7. `--non-interactive-permissions fail` 在真实非交互任务中的误挡率如何（多少次本可继续的任务因一次权限请求而终态失败）？Step 1 worker 默认用 `approve-reads` 是否可用？
8. 从被委派方看，attention JSON 里最影响 worker 侧恢复的字段是什么——恢复入口（原 receipt 目录）够不够，还是需要 caller 显式传回 prior attention？

---

## 5. 幸存/让步清单

**经我反例后仍成立（我不为对抗而对抗）：**
- Codex 对原始诊断的修正（四类证据已在、Goal 2.14 合同成熟、"不能拿旧版 anchor-only 说法代表现状"）——我以使用层数据独立加强。
- 复用 R2 Primary/机械分工，不新建第二个语义调度器。
- 验收器保留"符合意图却被拒"的反例通道（Sakana DGM 的教训方向正确；该来源我未重读，按 Codex 引用标注）。
- 演化必须候选+独立比较+可回退，机制复杂度增长不是收益。
- ACP `end_turn`/退出码不裁决产品完成。

**我撤回或降级的（相对我自己初始倾向）：**
- 我原倾向"迁移后统一到 ACP Skill 一条链"；读 wrapper 源码后降级为"连接复用、边界留厂"。
- 我记忆中 Cognition 文有 SWE-bench 量化数据——读原文后撤回（无数据）。
- 我原以为 LangGraph 式 checkpoint 是任务内变异的现成参照；读 interrupts 文档后确认其幂等代价，改为 append-only slice 的论据。

**坚持的分歧（留待第二轮）：**
- Step 1 不需要存储"图"——图是派生视图（Codex 提案 §3 的 mermaid 可保留为视图，不可保留为执行对象）。
- W2（后台通知）不应进 Step 1 首版：W1 前台阻塞已满足"等待期 0 模型回合"，W2 的会话死亡分支是额外故障面（R2 允许 W1 为 portable fallback，我主张它是 Step 1 唯一形态）。

---

## 6. 检索轨迹与来源清单

**实际执行的检索（时间序）：**
1. WebFetch `agentclientprotocol.com/protocol/v1/lifecycle` → 404（该路径不存在）；
2. WebFetch `code.claude.com/docs/en/workflows` → 全文页，读；
3. WebFetch `agentclientprotocol.com/protocol/v1/prompt-turn` → 全文页，读；
4. WebFetch `agentclientprotocol.com/` → 首页+llms.txt 指引；
5. WebFetch `cognition.ai/blog/dont-build-multi-agents` → 301 → `cognition.com/...` → 全文页，读；
6. WebFetch `anthropic.com/engineering/built-multi-agent-research-system` → 全文页，读；
7. WebFetch `docs.temporal.io/temporal-explained/introduction` → 全文页，读；
8. WebFetch `langchain-ai.github.io/langgraph/concepts/human_in_the_loop/` → 仅 "Redirecting..."（不可用）；
9. WebSearch `Bainbridge "Ironies of Automation" 1983 Automatica PDF full text` → 定位镜像；
10. WebFetch `arxiv.org/abs/2402.05120` → 摘要页，读；
11. WebFetch `docs.langchain.com/oss/python/langgraph/human_in_the_loop` → 404；改 `…/langgraph/interrupts` → 全文页，读；
12. curl 下载 Bainbridge PDF（davidjusth.com → squarespace 镜像）→ `pdftotext` 提取全文，读关键节（§1.1.1-1.1.3、§2.1）；
13. WebFetch `metr.org/blog/2026-02-24-uplift-update/` → 全文页，读；
14. WebFetch `arxiv.org/abs/2308.10848`、`arxiv.org/abs/2503.13657`、`arxiv.org/abs/2410.10762` → 摘要页，读。

**本地核对（file:line 见正文）**：`/Users/rocky243/.local/bin/agent-delegate`；`skills/ultra-delegate/scripts/delegate-worker.cjs`；`skills/ultra-delegate/references/delegation-contract.md`；`skills/ultra-plan/references/task-evidence-v2.md`；`skills/ultra-grilling/SKILL.md`；`hooks/mid_workflow_recall.py`；`ultra-goal-skill/.../SKILL.md`、`references/graph-topology.md`、`assets/workflow-script.js`；`.ultra/evidence/**` 计数与抽样（脚本可重跑：`find .ultra -name "evidence.json" | wc -l` 等）。

**读取程度与未验证项（如实声明）：**
- 全文页阅读的引用句均经抓取工具的正文提取；未逐字比对原文全文，引用以提取文本为准。
- 四篇 arXiv（More-Agents、AgentVerse、MAST、AFlow）只读了摘要页，未读方法与实验细节；对它们的引用均限于摘要明示内容。
- LangGraph 的 checkpoint/time-travel API（`get_state_history`）未在所读页面覆盖，未验证。
- 未读：GEPA 全文、Sakana DGM 原文、ADK graphs 页（这三处按 Codex 引用标注，不作为我的独立证据）。
- 未验证：ZCode 自身是否具备 workflow runtime（我的 host 帮助输出未查）；`ubp --all --global -d` 装机状态（本轮授权不含安装类操作，沿用诊断 §2.2 的历史结论但不背书其现值）。
- 我未运行任何委派/工厂代码；对 delegate-worker 行为的描述来自源码阅读与合同文档，非本轮实测。

---

*本报告仅写入指定路径；无实现改动、无安装/提交/发布效应。Round 2 我将回应 Codex 与 Kimi 对本文的攻击，并保留修订权利。*
