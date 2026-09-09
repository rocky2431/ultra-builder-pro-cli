# Trellis 与 Ultra 的演进方向讨论

## 当前定位
- 问题：在已认可的 Trellis 借鉴方向上，Ultra 应分哪些步骤落地，各步和最终达到什么效果？
- Owner 指令：2026-09-09 明确接受八步计划，要求全部实施、每部分验收后 commit 并更新证据文档。此前暂停已结束，执行授权见 `.ultra/decisions/2026-09-09-eight-step-implementation.md`。
- 阶段：Deliver；状态：delivered。
- 产出：源码结构对照、三轮实际讨论中的修正与分歧、八步实施计划及可观察验收，见 [RESULT.md](./RESULT.md)。
- 已知：UBP A 已完成；B 未验收；C/D/E 未实施。测试与原生委派成功不代表工厂交付完成。
- Owner 判断：Trellis 的做法接近理想，但交互有规范人的负担；它似乎较少属性而 Ultra 属性更突出。具体属性含义待补充，不代替 Owner 定义。
- 已确定：Owner 认可总体方向；计划按日常开发闭环、可运营工厂、耐久运行与受控进化三个里程碑组织，保留原 R2 完整目标。
- 下一步：研究与计划已交接实施。当前执行状态只维护在 `docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`，本研究稿不复制执行账本。RESULT.md 保留接受时字节，其旧暂停文字由新的明确授权覆盖。

## 证据与边界
- Trellis 只读源码快照：/tmp/trellis-direction-20260908；不执行其安装或项目脚本。
- Firecrawl CLI 当前不可调用，改用官方 GitHub 页面与 Git 源码读取。
- 实际实现能力、文档主张和设计目标分开记录；无真实 Trellis 用户旅程评测。
- 原任务继续暂停，本讨论不授权改动任何产品实现、安装、commit、push 或发布。

## 2026-09-08 方向认可后的计划交付

Owner 要求具体步骤、每步效果和最终效果。复用三轮研究，没有再启动讨论 Agent。实时读取既有工厂状态、旧行动方案、R2 Step 1/2/3 退出条件、当前 Change/Plan/Dev/Deliver 及任务上下文模板；HEAD 仍为 b765b55，未提交工作保留。

计划分八步：行为基线、日常路径、上下文与知识往返、完整日常验收、B/C 合格委派与首条工厂、D 可运营扩展、E 耐久续跑、E 策略评测。前三步复用已存在的路径；第四步明确用户发起的恢复与后台唤醒不同；后四步保留原资格和完整交付条件。事实维护与跨任务策略晋升分开，Owner 无需为普通内部步骤反复批准。

Hindsight Core concepts 混入了早期讨论中已撤回的 AGPL 绝对阻断、zero enforcement 及数据库架构等说法，已据最终报告及 AGENTS.md 提交 correction；本计划不采用这些前提。具体晚期 Host 与候选仍待资格和比较证据，未凭讨论承诺工期或性能收益。

## Codex 独立第一轮（未读取 CC 首轮意见）

Trellis 快照为 88f4834449da9b4f607ec05e322408a0aa66f2ce，CLI/core 0.6.16。README 表达 4 段循环，实际 workflow 模板是 Plan / Execute / Finish 三阶段，Verify 是 Execute 内步骤。产品模板与其仓库自用 .trellis 分开查看。

已查明：
1. 它将 spec/<package>/<layer>、task/prd/design/implement 与 implement.jsonl/check.jsonl、workspace/journal 串联；manifest 由模型选择，Hook 注入文件，task start 拒绝已存在但未配置的空 manifest。自动注入不等于自动语义选材。
2. 交互强制确实存在于发布模板：workflow.md Request Triage 要求小任务也询问建 task；brainstorm.md 强制初始请求后至少一次回答，最终 planning summary 之后另一次批准才允许实现。仓库可查事实又明确要求 Agent 自查，所以不能概括为把所有思考都推给用户。
3. finish-work 归档与 journal 默认产生额外提交（session_auto_commit 可关闭），规范更新要求触发时七段 code-spec。Agent 负责写文档，但用户和 Agent 都承担流程切换与内容维护成本。
4. 不仅是模板集合：packages/core 有 task/channel/mem；CLI channel supervisor 持有原生 Claude/Codex 进程、stdin/inbox 与 stdout/event log，支持多轮 peer 协作。不能说 Trellis 没执行层；也不能把本地代码存在说成 UBP 所承诺的 factory qualification 已满足。
5. Ultra 同样 file-first，并已有目标/术语/证据/恢复机制，不能凭 Trellis 有目录就声称我们缺上下文。当前实现暴露八个 public Skills + router，持久授权与显式选择等规则较重；小改可推进的修复已在 A，不应重做旧诊断。

当前推断：差异可能是以任务+项目工程知识为中心，和以产品意图+验证交付为中心的重心差异；两者都高度 opinionated。最值得借鉴的是把工作做过后留下的知识用于下一次执行的明确消费链，以及让最常见请求从自然语言进入一条易懂的路径。不能把不喜欢的交互删掉就假定产品完成，也不能用更少命令掩盖更高 token/等待成本。

方向候选：继续现计划仅改善表达；用 Trellis 作底座加 Ultra 方法；保留 Ultra 产品边界但重新组织常用任务/context/experience 消费路径，并把强保证作用域按执行路径限定。三者需第二轮比对。所谓我们的“属性”尚未获 Owner 明确补充，暂按意图澄清/质量判断与连续交付主张讨论。

实际 CC 首轮 delegation_id=9f73a151f5954929a8fc3d9fd5baeefc，session=trellis-direction-20260908；尚在执行。

## 待交叉检验的实质分歧

- “没有属性”不宜作事实：Trellis 有强制规划、分角色实现/自修复检查、code-spec institutional memory 等工程主张。Ultra 的差异应转化为用户可感知行为，不能只列更多名词。
- 现行 UBP Change 已写明明确自然语言请求就是当前 invocation（skills/ultra-change/SKILL.md:32），Stage A 已取消无条件重问。后续建议不得把这个既有能力当作新设计成果。
- Trellis 的 Task 是执行/上下文/会话的集合中心，但 parent/child 明确不是依赖系统（workflow.md）。UBP 的 Change + task ledger/context + Evidence 本来就覆盖更强的意图追溯。应优先改善现有文件的消费，不先迁目录或新增 manifest。
- Trellis 的 bootstrap 会从已有代码归纳项目规范，0→1 与已有项目迭代均有路径，不宜只贴 greenfield 标签。
- Trellis 跨平台安装覆盖与 channel runtime 覆盖是两码事：channel/adapters/index.ts registry 当前只有 claude/codex；workflow 其余平台有 Hook push 或 Agent pull。
- Native Claude channel 启动参数默认 bypassPermissions（adapters/claude.ts:278），Codex 默认 workspace-write/approvalPolicy never（adapters/codex.ts:697）。它以操作者信任启动的进程为前提，不能直接替代 UBP D1 效果边界；这不否定它作为可信本地协作工具的价值。
- 经验回写至少分开：已确认事实/项目约定维护，和改变跨任务执行策略的候选。后者不能把一次成功直接写成通用默认；前者也不应无条件等整个 E 完成才有消费者。具体接法尚未接受。

## 补充事实与提案边界

- UBP Change 已主动读取本区 archive/abandoned 的 delivery、verification、intent 和上下文（skills/ultra-change/SKILL.md:44-47）。因此“我们没有跨任务经验消费”过强；应检验归纳后的工程约定是否被下一次 implement/check 稳定消费、是否减少返工，而不是再建记忆系统。
- Trellis 对 task start 的 session-identity 缺失已改成 degraded 并继续更新任务状态（task.py:238 起），workflow 文档仍有“失败”表述。报告按执行代码说明，不将文档字面當已运行效果。
- 需要保留的差异是同一用户目标从澄清到结果不漂移、必要判断有独立审查、真正不确定时可恢复；不是审批次数、文档厚度或运行时 schema 数量。
- 候选架构只能作为建议，原 A/B/C/D/E 退出条件未被此次讨论删除或降格。若推荐改变顺序/边界，应写出具体旧承诺与新承诺，由 Owner 决定，不能通过“轻量模式”暗中换完成定义。

## 第一轮实际交换

CC 首轮 9f73a151f5954929a8fc3d9fd5baeefc：success/end_turn，606.596s；原生 session d03e6e63-8f25-47fe-97f5-3d3b0b9288c1。runtime 实际 CLI 2.1.263，adapter 0.75.1，ACPX 0.13.2；list 的旧观察 2.1.261 不作为启动版本。

CC 建议先做项目编码约定回流，再讨论按效果类型拆分资格前置；不搬 channel，提出 .ultra/conventions 和 transcript 检索。Codex 采纳经验消费链与流程可改性值得检验，反对“无学习/只防假完成/零可改性/近乎零成本”的绝对化，以及未证实隔离即可等价解耦 D1 的捷径。第二轮明确要求以既有消费者和失败为依据，避免新知识库、双权威或降低现行承诺。完整原始结果在该 native delegation receipt，以及 /tmp/trellis-round1-result.md。

## 第二轮等待期间的候选形状（Codex 提议，未接受）

整体仍是一个工作流产品。Owner 表达结果与必要取舍；主 Agent 负责技术调查、任务拆分、上下文选择、集成和下一步。项目文件保存稳定方向/规范、当前任务/证据、可复用历史；运行层在确需独立 Worker 或跨 session 时承担机械执行和恢复。这个分层不要求迁目录或增加新中心。

三条用户路径：
- 明确小改：原请求已给足行为与范围 → 读取受影响实现与既有约定 → 实现与相称验证 → 给结果及限制。若原规范冲突或出现材料取舍，才询问。TDD 的 micro-edit 例外与 A 的请求复用已存在；要测现实路径是否走通，不再“新增”一次。
- 模糊 0→1：澄清真正改变产品的选择；工程事实自己查；把原话、已定结果、待定业务选择维护在当前产品/Change 中；交付第一条真实用户路径，同时保留整体目标与连续迭代。不能用几个技术绿灯替用户路径可用。
- 持续迭代：加载上次相关决定与教训，理解新增要求影响哪些已承诺路径；先复用符合当前证据的经验，有矛盾则核对；本次发现已确认工程事实写回其原有文档。是否默认改变以后任务策略，作为候选单列，不能以规范更新代替策略晋升。

方案取舍候选：
- 继续旧顺序：改动最少，D1 如顺利可快推工厂，但暂无证据日常负担自然消失。
- Trellis 底座 + Ultra 方法层：现成 task/context/channel 能力；双方法/双任务权威、已有 ACPX 重叠、迁移维护与能力保证差异需要代价。仅凭 README 不足以选它。
- Ultra 保留，重整常用任务/context/feedback 消费（当前倾向）：复用已有权威与传输，完整工厂继续；具体新机制必须由对照旅程暴露缺口后才决定。反例是只改文案/文件名，后端维护与等待成本不降。

最有区分力的后续验证（尚未执行）：使用相同 owner 请求、仓库和模型配置，对照当前 UBP、Trellis 默认路径、以及建议路径的纸面/后续实现；区分纸面交互推演与真实运行。至少明确小改、模糊新项目、旧项目跨 session 迭代三个任务族；看重复问题、必要问题遗漏、首次可用结果、错误完成、规范误用、恢复、Owner 主动时间、模型/检查耗时成本。若差距只在提示展示，优先修消费表达；若上下文漏读才补运输；若真正错误知识被推广，才加相应候选评测。具体实测规模按决策需要确定，不从三份故事推导普遍收益。

## 第二轮实际交换与修正

CC 第二轮 8c889ccf89a5401492fec7a61504e8df：success/end_turn，265.832s；同一原生 session。撤回固定六 lens、无学习、零可改性、200 行阈值、另建 conventions，以及隔离 worktree 可绕 D1 的即刻可用推论。接受日常 Primary 路径与未资格 worker 路径分开，D1 与全目标保留。

CC 对 Codex 的有效反驳：统一视图可能只是重复 A，应检验 Next 与实际路由是否引导不必要的重流程。Codex 接受这个约束，不把视图当新机制或证据。

第三轮待纠正：CC 仍称事实性知识无合法生产者（Deliver/Dev 实际允许文档与Tech Notes）；把 AGPL + 双账本风险推成 Trellis 底座绝对不可行；把注入等同子 Agent 零阅读成本，把两条旅程/两次对话当充分判据；含糊新项目直接实现的草图没有尊重未定产品选择。第三轮以具体消费链、适用任务与不降低验收的证据收敛。

## Codex 对“不是又一轮 A”的具体约束

后续如果有实施，应落到实际消费时刻而非展示风格：Plan/当前任务是否选到必要项目资料 → Dev 与 Check 是否真的收到并使用 → 本次事实变更是否在最终审查前同步其原文 → Next 是否在已有授权/意图内选择合适路径。现有 Deliver 会在收尾修文档，任何这时改变的内容又需回 Test（skills/ultra-deliver/SKILL.md:93-114）；因此把已知必要文档维护放进本次实现与最终冻结前，有望减少末端反复，但必须用路径数据验证。最后发现的新事实仍应刷新受影响证据，不能用“提早维护”掩盖 stale。

拟议评测复用已建立的观测维度，选择新的/未见请求；不重跑已验收 A 的原始旅程，不把少问题或少文件当质量通过。两个诊断案例可定位原因，推广结论仍需重复与更广任务形状。

当前 CC 第三轮 delegation_id=99f729bda39647ec84f2450c5af7c0b6，原生会话沿用，状态待完成。

## 第三轮与最终裁决

CC 第三轮 99f729bda39647ec84f2450c5af7c0b6：success/end_turn，147.520s；同一原生 session。三轮均已完成，无第四轮、无待运行讨论作者。CC 撤回没有合法知识写者、依据许可证断言底座不可行、文件数/两轮阈值判可用性、全局改 Next，以及含糊产品应先写代码的结论。

双方支持保留 Ultra 产品、借鉴任务上下文与及时经验消费，先按具体路径区分路由/可达性/上下文/收尾原因，不更改 D1、不重复造传输或知识库。对照/收益仍未实测。

Codex 最终仍不采纳 CC 的绝对化：不能从源码推断任务2经验一定到不了任务3；不能用两个宿主默认参数推出保障差一个数量级或必然退化；不能把三个不同任务的不同故障视为必须全部不改；不能将小修复描述为不得作任何完成声明。应保留实际任务完成与正式 Change 交付的区别，对不同任务分别定位，无法区分原因时才暂停对应修改。Trellis 底座的迁移成本大于收益尚未量化，因此结论是当前不推荐，而非证明不可行。

最终产出 RESULT.md。原实施继续暂停。只改本讨论文件与原状态文件的暂停说明，未改产品代码、安装、运行资格、commit 或发布。Owner 未接受新方向。
