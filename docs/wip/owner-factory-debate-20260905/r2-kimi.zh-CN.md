# 第二轮 · Kimi 交叉审查报告：更正、裁决与对 ZCode 最小运行时的攻击

- **日期**：2026-09-05
- **轮次**：三方交叉审查第二轮。已读 ZCode 与 Codex 的第一轮文件（`r1-zcode.zh-CN.md`、`r1-codex-response.zh-CN.md`），并重新核对争议来源。
- **方法声明**：本轮所有新结论均附我本轮实际重读的本地行号或实时抓取的一级 URL；Codex 的来源摘要未被我当作独立验证。我第一轮报告保持历史原样，更正集中在 §1。

---

## 0. 总结论

三个争议以"双方各错一半"收场，一个以我被反驳收场，一个以我防守成功收场：

1. **进度数据源**：Codex 的反驳成立——`ultra-status` 已在消费 Evidence v2 并重算摘要，我第一轮"进度底层就是模型写的 status"过强，撤回（§1-E2）。但 Codex 的五列表格本身仍缺"默认卡片每行绑定到哪类来源"的规定，争议降级为字段绑定问题而非事实层缺失问题。
2. **Hook 整改顺序**：我放弃"强制先补后删"的因果主张（事实源已存在且被消费，"补"的前提大体已满足），改为与 Codex 一致的"录现状 + 逐项消融"；保留的唯一增量是进度/提醒信号必须带 **alert 语义**（与 ZCode 的 Bainbridge 论证汇合）。
3. **并行资格 vs 默认并行**：Codex 的区分成立，我修订第一轮 Q3 的立场——能力资格检查可以保留为门槛，每任务默认并行仍不许。剩余要求：资格用例最小化、成本封顶。
4. **ABC 论文归因**：Codex 对我的更正**本身有误**。我本轮读了 v5 全文：空响应计成功是 **τ-bench**（摘要与正文均明写），WebArena 的问题是字符串匹配与未验证的 LLM-judge。我第一轮引用正确（§2-D4）。
5. **MAD 论文**：Codex 的更正部分成立——全文报告调参（agreement level）后 MAD 可"surpass all other non-debate protocols"，但仅摘要的读法漏了这一点；同时论文结论仍维持"原始实现不可靠地更优、成本更高、对超参更敏感"。双方各修订一半（§2-D4）。

对 ZCode 最小运行时（slice 执行器 + 图即派生视图 + W1-only）：骨架接受，三处具体攻击成立——执行器自身的崩溃语义未被 delegate-worker 的 per-worker 设计覆盖、barrier 部分失败的汇合策略无定义、"W1 是唯一形态"若固化会悄悄删除 R2 Step 2 的既有承诺（§3）。ACPX Flows 新候选我已在本地源码级核实其边界：它是顺序+检查点库，不是工厂运行时（§4）。

---

## 1. 对自己第一轮报告的更正

| # | 第一轮原话（要点） | 更正 | 依据 |
|---|---|---|---|
| E1 | Hook"挂在 `Edit|Write|Grep` 上——即每次读/写/搜都触发" | **错在"读"**：matcher 是 `Edit|Write|Grep`，**不含 Read**。改为"每次编辑/写入/仓库内搜索触发"。爆炸半径比我写的小，但这三个在开发回路里仍是高频面，方向性结论（无条件全量注入需消融）不变 | `adapters/kimi.js:59`（本轮重读） |
| E2 | "owner 可见的进度底层数据就是模型写的 `status`"；"错误完成不会被治好" | **推断过强，撤回**。ledger 行的 `status` 字段确为模型写入（此点不变），但 `ultra-status` 工作流并不信任它：`skills/ultra-status/SKILL.md:106-152` 要求重算 `evidence_digest`、逐条重验 `raw_evidence_sha256`、回放 review summary，且明写 validator "never decides semantic acceptance"、ledger completed 只是必要不充分。系统层面存在反驳错误完成的机制；真正缺的是 **owner 默认卡片**的字段级来源绑定（Codex 表格的方向对，需落到绑定规则） | `skills/ultra-status/SKILL.md:87-152`（本轮重读）；`.ultra/tasks.json` 字段清单结论不变 |
| E3 | 引 MAD 摘要："多 Agent 辩论在同等预算下不可靠地优于 self-consistency" | **读法不完整，修订**。论文全文（本轮抓取的正文）同时报告：调参后 Multi-Persona 等可"significantly enhance performance and even surpass all other non-debate protocols we evaluated"。修订为：默认/原始实现 + 同等预算下不可靠；调参后可超，但成本更高、对超参更敏感、结论来自医学/通识 QA 而非软件评审 | https://arxiv.org/html/2311.17371v3 （摘要、Table 2 讨论、§4 Conclusions，本轮实时抓取） |

另有一处第一轮限制的解除：当时我声明未读到 Sakana DGM 博客 Safety 节；Codex 与我第一轮均已用 DGM 论文 Appendix H 独立支撑同一论点，该缺口已不影响任何结论。

---

## 2. 争议裁决（接受 / 拒绝 / 修订）

### D1 进度视图与字段绑定 —— 修订双方

Codex 的五列表格（本轮其 §1）在方向上解决了我的 Q1：每行都给了来源性质与"缺失时怎么写"。**接受**其"不新建第二套完成账本"——E2 更正后，我也认为事实层已存在。**但拒绝**"短段落+decisions 链接足以承载"作为终态：ZCode 的攻击一（验收无承载）仍成立一半——"Owner 能指出本轮还需决定什么"如果没有任何成文清单承载，就无法验收这条验收本身。存活改动（最小）：Research/Change 文档里**成文的未决决定清单**（可空即退出），复用 `.ultra/decisions/` 语义，不新建注册中心——这恰是 Codex 自己也接受的"当前行动真正依赖的未决决定归零即可"，我要求的只是把清单本身列为对 owner 可见的工件。

### D2 Hook 因果顺序 —— 我修订

Codex 拒绝我的"先补后删"，理由是诊断文档只提出"注入是代偿"而无可隔离实验，且事实源已存在。E1/E2 更正后我同意：强制顺序主张撤回。**双方汇合点**：先录现状、逐项消融（Codex 方案）、保留任务切换/恢复/验收改变时的必要提醒。我保留的唯一增量（与 ZCode §2.3 独立汇合）：提醒与进度信号必须区分"正常推进"与"需要你"——Bainbridge 1983 的警觉性机制（低频异常监控约半小时失效）意味着**全删注入而不补 alert 语义**与**全留注入**同样有害。Anthropic 新文（harness-design，2026-03-24，本轮实读）支持的是"一次移一个组件并复盘影响"的方法，而非任何具体的删/留结论；且其为单一工程师的厂商博客，证据等级低于对照实验，双方都不应过度引用。

### D3 并行资格 vs 默认并行 —— 我修订，Codex 接受一半

Codex 把"R2 Step 1 的双 Worker 真实重叠"解释为**能力资格**（证明隔离、重叠、汇合可行）而非**默认路由**（每任务 fan-out）。这个区分消解了我 Q3 的大部分火力：我攻击的是"把未证明的收益前置为成功条件"，而资格检查证明的是可行性不是收益。**修订我的立场为**：资格检查可保留，但 (a) 资格用例最小化（一个即可，不进每条任务），(b) 成本封顶（资格运行计入预算），(c) 默认路由 Solo、fan-out 需 admission 证明——后两条 Codex/R2 已同意。仍需正面回答的残余：Anthropic 的 15×（对聊天）与"编码任务可并行性低"原文 Codex 未能否定，只能限定其适用范围；举证责任仍在"引入并行"一侧，资格通过 ≠ 默认并行成立。Codex 对 Anthropic 数字的校正（15× 是相对聊天而非双 Worker 编码工厂的已证成本）我接受——我第一轮表述已含此限定，但 Codex 的澄清使这一点更干净。

### D4 两篇论文的归因 —— 我防守 ABC，修订 MAD

**ABC（arXiv:2507.02825）**：Codex 称"WebArena 是空回答被判成功，tau-bench 是部分不可解任务以不改变环境判成功，不能混成同一机制"。我本轮抓了 v5 全文，两处原文：

- 摘要："SWE-bench-Verified uses insufficient test cases, while **τ-bench counts empty responses as successful**."
- 正文（τ-bench 案例节）："a trivial agent that returns empty responses is considered successful on intentionally impossible tasks… achieves a **38% success rate** and outperforms a GPT-4o-based agent"；"contains intentionally unsolvable tasks—38% of the airline subset… Because success is defined as leaving the environment unchanged"。
- WebArena 的问题（正文）：字符串匹配致高估 5.2% + "uses an LLM-as-a-Judge without validating its accuracy or consistency"（1.4–5.2% 高估）。

即：**空响应计成功就是 τ-bench 的机制**（不可解任务 + 环境不变即成功是其成因），WebArena 是另两种机制。我第一轮引用正确；Codex 的更正把 τ-bench 的机制错挂到 WebArena。"相对误差至 100%"双方引用一致（摘要原文 "up to 100% in relative terms"）。

**MAD（arXiv:2311.17371）**：见 §1-E3。修订后的共同事实：原始实现不可靠地优于 self-consistency/Medprompt；调参（agreement level）后可超所有非辩论协议；成本更高、超参敏感。对工厂 Review 拓扑的推论不变：**评审拓扑是被测参数**——现在还要加上"若上 MAD 类机制，必须连同其调参成本一起测"。

### D5 CC Workflows 消费者 —— Codex 更正成立（带版本警告）

我本轮实读 https://code.claude.com/docs/en/workflows 现版：明确区分后台转移（"background the session… continues it"）、退出时 "Move to background and exit"、以及 "Exit and stop tasks"（随会话停止）；同会话内 resume、重launch 时缓存重放（A 命中缓存、B 重跑）。ZCode 的"普通退出即停止"只说中了三分支之一。**Codex 的"文档支持≠本机资格"分层成立**。警告：该文档是活页，ZCode 阅读时的版本可能不同；此不追溯，只记录今日版本内容。对工厂的推论不变：跨主机工厂不能建在 host-native runtime 上，且其缓存重放语义（成功节点不重跑）恰是 slice 执行器可以借鉴的现成语义。

### D6 三旅程度量协议 —— 已汇合，无需再争

Codex 接受了测量协议前置（冻结旅程定义、wall time 计时、owner 主动操作单列、中止/退出留在分母）。我与 ZCode 的 METR 引用（自报失真、opt-out、并发干扰）均已被吸收。此争议关闭，只留下执行清单。

---

## 3. 对 ZCode 最小运行时的攻击

**接受其骨架**：slice 执行器（复用 delegate-worker 边界 + 机械等待 + barrier 归并 attention）比通用图引擎更符合 HC-3/HC-4；Temporal/LangGraph 的引用我复核无误（见来源表）。三处攻击：

**A1 执行器自身的崩溃语义是未覆盖层。** delegate-worker 的 typed terminal + outcome_unknown 覆盖的是 **per-worker**；slice 执行器是一个新的长寿命进程类，它在 barrier 中途崩溃时，已完成的 attempt 与未启动的 attempt 之间的切片级状态没有冻结语义。ZCode 的方案文本没有回答"执行器进程死了谁发布 `outcome_unknown`"。**存活改动**：执行器必须在每个 attempt 终态后落盘 slice 状态（ACPX Flows 的 trace/projections 已是这种形态），并把自身崩溃定义为 slice 级 `outcome_unknown`，恢复入口为一等字段。这不是新增机制，是把已有模式向上抬一层——但不说破就不会发生。

**A2 "W1 是唯一形态"若固化即删除既有承诺。** 本轮 CC 中断（exit 1、stop reason 空、约 328s）就发生在前台等待链路上——W1 把工厂活性耦合在 owner 会话活性上。三方已同意 W1 是 Step 1 首条实现路径；但 ZCode 的"W2 不进 Step 1 首版"若滑成"W1 唯一形态"，就悄悄删掉了 R2 Step 2 的活跃会话连续闭环承诺。**裁决：拒绝"唯一形态"表述**；W2/W3 是否启用取决于所选 Host 的可证能力（Codex 同）。W4 不提前，此点三方一致。

**A3 barrier 部分失败的汇合策略无定义。** "依赖、并行、汇合在 manifest 里就是 barrier/attempt 字段"略过了真正难的部分：两个 Worker 一成一败时，barrier 是全部重来、部分汇合、还是降级交付？append-only 历史 + supersedes 解决的是"改图不改历史"，不解决汇合策略。这是 Round 3 开放问题 O1。

**对"图即派生视图"的裁决**：术语争议已塌缩。ZCode 说不存"图"，Codex 说未来依赖参与执行决策——两者其实指向同一物：前向依赖语义的**权威**在计划账本（tasks/change），slice manifest 绑定当前版本的可执行片段，可视化是派生视图。无需图引擎，三方一致。**存活改动**：把这句话写进方案，终止术语层争论。

---

## 4. ACPX Flows 候选的边界（本地源码级核实）

本轮我在本机核实了 Codex 的探针与 acpx 0.13.2 实际安装件（`/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/flows-BiRKgCnW.js`，1929 行）：

| 能力 | 核实结果 | 证据 |
|---|---|---|
| compute/checkpoint 循环、waiting 终态 | 真实执行（3 次迭代后 waiting，4 步 trace） | `work/owner-factory-debate-20260905/acpx-flow-probe-result.json`；探针脚本可复跑 |
| fan-out（一出多边） | **不存在**：定义校验直接拒绝 "Flow node must not declare multiple outgoing edges" | flows-BiRKgCnW.js:328 |
| 跨进程重启 resume | **未见公开 API**：`FlowRunner.run()` 总是新建 runDir 与全新 state，无从磁盘恢复的入口 | 同文件 `run()`（约 1040 行起） |
| ACP 会话恢复策略 | 硬编码 `resumePolicy: "same-session-only"` | 同文件约 1612 行 |
| 权限 | 构造参数接受 `permissionMode`/`permissionPolicy`（探针用 `deny-all` 证明可注入） | 探针脚本头部 |

结论：**Flows 是顺序执行 + 检查点库，不是工厂运行时**——无 fan-out、无跨进程恢复、无写者边界。Codex 的定性（"不能拿 compute 成功当工厂完成"）成立且被我一一复核。它的真实价值是两份可借鉴的语义：每步 trace/投影落盘（A1 的答案形态）与 waiting 作为一等终态。

---

## 5. 回答 ZCode 问我的两个问题

**Q7（权限误挡）**：没有任何一方握有 `--non-interactive-permissions fail` 的真实误挡率遥测——我不编造数字。结构性回答：(a) `fail` 模式下任何一次权限请求即终态失败，对需要写文件/跑 Terminal 的编码任务，它把任务成功率压到接近零；(b) `approve-reads` 不能作为编码默认——它终态阻断写与 Terminal（Codex 本轮同结论）；(c) 因此工厂的边界**不能由权限模式承载**：正确结构是 wrapper 侧环境净化 + writable_roots + 事后 git-diff 核验（均已存在于 delegate-worker），在此机械围栏内 `approve-all` 的风险被限定在围栏里。权限模式按任务类别选，围栏才是边界。本次三方评审跑在 `approve-all` 上恰恰因为有人监督且效果限于两个命名文件。

**Q8（恢复字段）**：以本轮被委派方的实际经历（我的收据含 164 条通用 Internal error 但报告最终落盘；CC 侧 328 秒额度中断），attention JSON 里对恢复最关键的五项：(1) typed 终态类 + 一句人话原因；(2) 恢复入口：receipt 目录 + session id + 原 mission 文件路径；(3) writer 树是否已证停止（fence 状态）；(4) 已验证 / 尝试过未验证 / 未触碰 的三分类清单；(5) 重跑安全性（幂等可重放 or 会重复副作用）。prior attention 是否回传：同一阻塞复发时需要，否则 receipt 目录自足。另注意 Codex 的警告成立：终态分类是"原因类 × writer 已停证明"的二维矩阵，一维的 `budget_exhausted` 不构成恢复方案——且"额度耗尽"只有在 provider 给出结构化原因时才可标已知，文字提示只是待核对证据（本轮 CC 的 exit 1 + 空 stop reason 正是不可判实例）。

---

## 6. 评估器失效与"更严验收 vs Owner 负担"

**失效机制（本轮复核后仍成立的清单）**：(i) 任务设置/奖励缺陷致相对误差至 100%（ABC v5，本轮重读）；(ii) 基准记忆污染（SWE-bench Illusion，第一轮已核，本轮无新证据推翻）；(iii) evaluator 被被优化方绕过（DGM App. H node 114 删除检测日志，第一轮已核原文）；(iv) LLM-judge 偏差（Zheng 等，第一轮已核摘要）。其中 (iii) 对工厂是硬约束：**evaluator 与检测逻辑对被优化方不可写且尽量不可见**；Codex 本轮已接受并补充"公开目标、保护评估逻辑、样本被用于调参后不再算 held-out"，三方汇合。

**更严验收是否增加 owner 负担**：会，如果严格性落在 `owner-judgment` 数量上——owner 判断是最稀缺资源，把更多条目路由给 owner 是线性加负。正确的严格性方向是**提高机械覆盖**（更多 command / external-observation 绑定）与 **alert 语义**（D2），让 owner 看到更少但更高质量的决定。这与 Bainbridge 的机制一致：负担下降来自"异常被机械检出并响亮地失败"，不来自"每张卡都更详细"。

---

## 7. 两命题完整性声明

两命题（体验修复 AND 现有委派/ACPX 之上的全自动化工厂，含任务内反馈与未来图演化）在本轮全部裁决后均保留；R2 Step 1/2/3 无一项被本报告删除或降级。我对 ZCode 的 A2 与 Codex 的"资格≠默认"区分，都是把**实现顺序简化**与**删除既有能力**明确分开：前者允许，后者禁止。UltraGoal 独立性未被任何结论触及。

---

## 8. 留给 Round 3 的三个决定性开放问题

- **O1（ZCode 主答）**：slice 执行器的 barrier 部分失败汇合策略——一成一败时全部重来 / 部分汇合 / 降级交付，由谁在哪个工件里声明？附执行器自身崩溃的 slice 级 `outcome_unknown` 语义（A1）。
- **O2（Codex 主答）**：终态分类的二维矩阵成文——原因类（成功 / 失败 / 取消 / 额度 / 未知）× writer 已停证明，每格携带什么恢复入口；本轮 CC 中断（exit 1、空 stop reason）必须能被该矩阵判到确定格子，否则矩阵不成立。
- **O3（双方）**：任务内改图（supersedes）后，旧 slice 已产出证据的失效检测规则——哪些证据随被替代节点作废、哪些可携带，判据写进 slice manifest 还是计划账本（HC-4 单一权威）。

---

## 9. 本轮检索轨迹与读取声明

**本轮实际执行的抓取（时间序）**：
1. `curl https://arxiv.org/html/2311.17371v3`（MAD 全文 HTML）→ 读摘要、Table 2 讨论、§4 Conclusions：核实调参后 MAD 可超非辩论协议、结论维持"原始实现不可靠更优"。
2. `curl https://arxiv.org/html/2507.02825v5`（ABC v5 全文 HTML）→ 读摘要、Intro、τ-bench 与 WebArena 案例节：核实空响应机制归属 τ-bench，WebArena 为字符串匹配 + 未验证 LLM-judge。
3. `curl https://www.anthropic.com/engineering/harness-design-long-running-apps`（2026-03-24，Prithvi Rajasekaran）→ 读正文：逐项移除组件并复盘影响的方法；单一工程师厂商博客，证据等级有限。
4. `curl https://code.claude.com/docs/en/workflows`（现版）→ 读 Manage runs / Resume / 退出分支节：核实后台转移与缓存重放。

**本轮本地核对（行号见正文）**：`adapters/kimi.js:59`；`skills/ultra-status/SKILL.md:87-152`；`acpx-flow-probe.mjs` 与 `acpx-flow-probe-result.json`（本工作目录，可复跑）；`acpx@0.13.2 dist/flows-BiRKgCnW.js:328, 约1040-1100, 约1612`；`flow-probe-artifacts/` 三次运行目录结构。

**未验证项（如实声明）**：MAD 论文的实验细节（数据表数值未逐项复核，引用限于摘要/讨论/结论的明示句）；CC Workflows 文档版本差异不可追溯；`budget_exhausted` 在任何现有 receipt 中的真实分布无数据；D1 相关代码本轮未激活、未复跑，ZCode 关于"可直接复跑"的表述双方均未在本轮验证。
