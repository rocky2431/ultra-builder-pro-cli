# ZCode 第二轮独立报告：交叉反驳、Q4 实证与 Flows 复用裁决

日期：2026-09-05。身份：三方交叉评审第二轮，ZCode。本轮经 `agent-delegate → ACPX → ZCode` 新鲜执行（delegation_id `e30c20f7…`，`approve-all`——仍在被辩论的链路上）。已读 R1 三份报告；对争议点做了本地一手核对与三次定向网络检索，证据分级沿用 R1（本地观察／外部一手／推断／未验证）。本轮角度：攻击 Kimi 的 owner/评估处方，以源码与收据回答其 Q4，并修订我自己的执行主张。

## 0. 总裁决

两个命题都保留且不可拆（owner 目标未变）：命题一体验整改，命题二基于现有 agent-delegation/ACPX 的全自动软件工厂——含任务内反馈与未来图演化——R2 Step 1/2/3 全量目标不动；实现顺序可以更简单，能力不可静默删除。UltraGoal 保持独立：本文所有对 Goal 的引用都是模式借用（decisions 复用、冻结分层），不是运行时并入。

经本轮验证：对 Kimi 的三个实质分歧裁为**两修一拒**；Codex 对我的两处批评**均接受并落实为修订**；另有一条双方都没说出的硬事实——本地 ACPX Flows **结构性禁止 in-flow fan-out**，Step 1 要求的双 Worker 重叠无法在一个 flow 内表达（§5）。

## 1. 争议裁决表

| # | 争议 | 提出方 | 裁决 | 核心依据 |
|---|---|---|---|---|
| D1 | 进度字段"三类之外不存在第三类" | Kimi §5-A | **修正**（接受内核，拒绝禁令） | 计划/预期是合法的带类型行，但永不计入完成账 |
| D2 | 双 Worker 重叠从 exit gate 降为对照实验 | Kimi §5-D | **拒绝** | 对照实验自身预设有资格的双 Worker 机器；gate 是机器资格，非收益主张 |
| D3 | Hook "先补后删"强制顺序 | Kimi §5-C | **修正** | "先补"事实上已满足（今日核验 ultra-status）；改为测量内消融＋质量守门 |
| D4 | typed receipt ⇒ 幂等 | 我 R1 §3.3（Codex 攻） | **让步修正** | 收据＋diff＋fence 给的是结果去重与"未知即冻结"；效果幂等是另一属性 |
| D5 | slice-only 丢失未来依赖 | Codex 攻我 R1 §3.3 | **修正** | 派生视图＝计划权威＋slice 历史双源；前沿依赖已有机械消费 |
| D6 | MAD 只引摘要 | Kimi §3.3 vs Codex | **各对一半** | 正文：调 agreement 强度使最差协议翻转为最佳；域限选择题/GPT-3.5 |

## 2. 对 Kimi 处方的攻击

**D1（三类禁令）。** Kimi 的内核我接受：每行进度绑定来源、unknown 永不绿、禁止把模型信念折叠成"语义完成率"——这与我 R1 的 attention 语义同向。但"不存在第三类——模型不得生成无来源的进度字段"作为**禁令**过宽：Codex 表格中"接下来做什么／需要你决定什么"本来就是模型生成的合法前视内容；Bainbridge 的监督可跟随性恰恰要求计划与判据以 owner 能跟随的粒度可见——禁掉计划行不降负担，反而砍掉 owner"不同意时回溯"的材料。修正案：类型学改为**三类**——机械事实／具名判断／**计划与预期（labeled，永不计入任何完成或进度计数）**。Kimi 治"错误完成"的全部力量保留，只撤对合法前视内容的禁令。

**D2（双 Worker gate 降级）——拒绝。** 三条理由：(a) **自反**：Kimi 的替代方案（Solo vs 双 Worker 对照实验）必须先有"能安全并发跑两个 Worker"的机器才有实验组。降级 gate 不省任何构建成本，只是把同一资格检查改名后挪进 Step 2——这正是"把实现顺序悄悄变成能力删除"的形态。(b) **gate 语义是机器资格，不是收益主张**：重叠窗口恰是 fence/writable-roots/git-diff 这套机器要防的最难情形（D1 delegation-safety 的存在理由）；只做 Solo 资格化等于用单线程测试互斥锁。Kimi 引的三条证据（Anthropic 15×、编码任务可并行度低、Cognition 隐含决定冲突——前两条我 R1 已独立读过）全部作用于**默认拓扑与任务选择**，不作用于"工厂是否必须具备有资格的并发能力"；我 R1 已主张默认 Solo、fan-out 需 admission 证明，与这些证据一致。(c) 但接受 Kimi 的两个修正性要求：gate 任务族必须真可分（Codex 的筛选 UI／导出分工即此类）；每次重叠演练的 token 成本与 owner 干预必须记录，收益问题由对照实验回答。**能力资格与收益对照是两个问题、两台仪器。**

**D3（先补后删）。** Kimi 顺序主张的前提是机械事实源缺失。今日核验：`skills/ultra-status/SKILL.md:87-88` 已把"ledger completed 但 evidence 缺失/过期/结构无效"路由为修复；`:106-154` 规定 `raw_evidence_sha256` 重算与严格投影消费；`:142` 明确 validator 只报 provenance 不裁语义。加上我 R1 的使用层计数（83 项验收中 50 项 command 型），**"先补"在事实层面已满足**——剩下的是未测的经验问题：条件化注入是否掉质量。修正案：不做强制顺序，把注入条件化放进已共识的三旅程测量内做消融，配质量守门（验收回归）；"进度视图先建"不作为 hook 改动前置。

**D6（MAD 裁定）。** 我读了正文（arXiv 2311.17371v3 HTML 全文页）。Kimi 的摘要引用准确（"in their current form, do not reliably outperform"）；但正文另有：作者调 **agreement intensity**（让 devil agent 按百分比同意）使 Multi-Persona "from being the worst-performing protocol to the best-performing"，在 MedQA 上超过 Medprompt 与 Self-Consistency；收益数据集相关、K-fold 下无全局占优；域为选择题 QA（无代码）、基座 GPT-3.5。裁定：Codex 的校正成立——仅引摘要不能下"多一家 Review 默认无益"的结论；但 Kimi 的处方"Review 拓扑应是被测参数而非架构公理"被正文的机制性结论（对超参敏感、难优化）**反而加强**。幸存的具体化：按 Codex R1 的对照设计执行（同预算、随机位置、已知正负样本同测错误完成与误拒、报成本），实验结果前对跨厂商 Review **不做任何方向的默认结论**。

## 3. 回答 Kimi Q4：真实结果归一化（源码＋收据级）

**[本地观察] 收据层。** CC 失败 run 的 transport 原始收据（`~/.local/state/agent-delegation/runs/20260904T232120Z-1d59dd6edc7a4353a992fd3e24b22bc2/result.json`）：`status:"error"`、`exit_code:1`、**`stop_reason:null`**、`protocol_errors:["Internal error: You've hit your session limit · resets 9am (Asia/Shanghai)"]`、304 events、327.969s。我自己的成功收据（`work/…/r1-zcode-receipt.json`）：`status:"success"`、`exit_code:0`、`stop_reason:"end_turn"`。

**[本地观察] 代码层**（`/Users/rocky243/.local/bin/agent-delegate`）。`_extract_result`（`:275-318`）逐行扫 NDJSON 事件流：最后一个 `result.stopReason` 胜出写入 `stop_reason`；每个 JSON-RPC `error.message` **原样**追加进 `protocol_errors`。状态归一（`:490-491`）三分：`timeout`(124)／`success`(rc==0)／`error`。`_normalized_exit_code`（`:328`）把 >125 的崩溃信号压成 1。

**结论。** `cancelled`/`refusal`/`max_tokens` **是一等可判的**——只要 Agent 按协议结束 turn，`stop_reason` 就有值。额度**不可一等判定**：CC 案例中 provider 在 turn 协议之外失败——无 stopReason、exit 1、错误只存在于 JSON-RPC error 文本，"resets 9am"是散文不是结构。**崩溃与额度今天结构性不可区分**（同为 exit 1 + stop null + "Internal error: …"）。Kimi 要的四态（取消/额度/崩溃/未知）目前只有"取消"真是一等。

**工厂修正**：(a) 归类从事件流做：stopReason 在→协议终态；不在→扫 `protocol_errors`，但只有 provider 的**结构化**错误码可标"已知额度"，文本只是待核对证据（接受 Codex）；
(b) **writer 存活是正交维度**，独立判定并 gate fence 释放——已知原因不证明已停，未知原因不排除已停。接受 Codex 对我 R1 `budget_exhausted` 一维提案的批评：它应是 reason 通道的值，不是独立终态；
(c) 最小改动：result schema 加 `failure_reason` 枚举（`provider_quota|provider_auth|protocol_violation|crash|unknown`）＋保留原始文本；判定者归属留作 R3 问题（O1）。

## 4. 我的自我修正（R1 报告存档不改，此处显式更正）

1. **幂等混同（material，即 D4）。** R1 §3.3"delegate-worker 的 typed result + git-diff 校验已经是这条[typed 且幂等可重放]"是错的：收据使重启动可**检测**"该 slice 已完成"（结果去重），fence＋`outcome_unknown` 使不确定时不会盲重发（at-most-once 保护）；**效果幂等**（worker 重跑对外部世界等效）必须按效果类别单独验证，今天没有任何机制覆盖它。接受 Codex"结果去重和效果不重复必须分开验证"。
2. **CC Workflows 生命周期（material）。** R1"普通退出即停止……跨会话不存活"过粗。今日重读官方文档：agent view 下退出对话框提供 "Move to background and exit"（run 随后台会话延续）；`claude --resume` **原会话**可重放已完成的 agent() 结果（changed/failed 重跑）；**fresh session "starts the workflow over"**。修正后结论不变：持久性绑定原会话身份，无跨会话/跨主机续跑，仍不可作工厂地基。另补今日读到的硬数字：并发 16 agents、`parallel()` 单调用 4096 项、每 run 1000 agents、prompt cache 默认 5 分钟、无脚本超时（证实 R1）。
3. **轻微两处。** R1 只列了 wrapper 二元成功语义，实际三分（timeout/124）；R1"攻击一"要求新 schema 承载 Codex 验收——接受 Codex 反驳，撤回 schema 要求，保留"载体必须存在且可核查"（文档节＋decisions 链接可为载体，三旅程内检查决策复用）。

## 5. ACPX Flows 独立验证与复用裁决

**[本地观察]** 重跑 Codex 的零 Agent 探针（`node work/…/acpx-flow-probe.mjs`，新执行非转引）：3 次循环、4 步、checkpoint `waiting`、重复出边被拒、0 agent session——复现一致。源码核验（`…/acpx/dist/flows-BiRKgCnW.js`，0.13.2）：`validateFlowEdge` 对每个节点强制**至多一条出边声明**（"Flow node must not declare multiple outgoing edges"）；三处 `Promise.all` 全是 I/O（事件写盘、client 关闭），无节点级并行；持久会话 `resumePolicy:"same-session-only"`。

**[外部一手]** 上游 `docs/flows.md`（raw.githubusercontent.com 全文页）：**"Flows are an experimental, opt-in surface"**；"Steps execute in topological order"；checkpoint 是"requires something outside the runtime"的暂停点，"The runtime exits when the graph terminates or a checkpoint pauses"；run 状态持久化于 `~/.acpx/flows/runs/<runId>/`，终止后 bundle 不可变；**页面未记载任何 restart-resume 命令**，replay viewer "does not re-run the flow"；权限为 flow 级声明、缺 flag 首步前 fail-fast。上游 import 面（`defineFlow, acp, action, compute, decision`）与本地 0.13.2 导出（另有 `shell`、`FlowRunner`）确有版本差。

**[推断] 裁决。** (1) 新硬事实：本地 Flows 结构性禁止 in-flow fan-out（单出边＋单游标），故 R2 Step 1 exit gate 的"两个 Worker 真实重叠"**无法在一个 flow 内表达**——要么两个并发 flow run 由外层 CLI 协调（协调与安全都在厂内，Flows 只当顺序控制循环），要么改上游。这给我 R1"边界留厂"一个具体边界，也给 Codex"先比较复用能力"一个硬约束。(2) 复用价值真实：checkpoint/waiting、typed decision edges、run 工件（flow.json/trace.ndjson/manifest）恰是 slice 控制循环需要的形状；但 experimental＋API 漂移＋无 restart-resume 意味着：若采用必须 pin 版本，且 Flows 不得进入权威工件格式（HC-4/HC-5 精神）。(3) 我 R1 的"普通 CLI 执行器"与"复用 Flows"是真实取舍（O2）。

## 6. 幸存的具体修改

**命题一**：(1) 进度/attention 行三类类型学（机械事实／具名判断／计划与预期-不计账），unknown≠绿，无语义完成率合并；(2) Research 退出＝行动阻塞的未决决定清零＋显式推迟记录，decisions 复用检查进三旅程；(3) Hook 注入条件化＝三旅程内消融＋质量守门，无"先建视图"前置；(4) 度量协议前置（计时者、并发隔离、退出计入分母、感知与实测分离）。

**命题二**：(5) 执行面＝slice 执行器（W1 前台阻塞为 Step 1 唯一形态），图＝派生视图且**双源**（计划权威＋slice 历史）；Flows 按 §5 边界作控制循环候选；(6) 恢复收据：`failure_reason` 通道（仅结构化证据标因，文本为线索）× 正交 writer 存活维度 gate fence 释放；`budget_exhausted` 降为 reason 值；(7) 双 Worker 重叠保留为 Step 1 exit gate（机器资格），默认拓扑 Solo，gate 任务族须真可分，成本与干预记录，收益由对照实验回答；(8) 演化三联比较＋evaluator 不可写不可见＋held-out 时间/来源外推（本轮无新分歧，保留）。

## 7. 留给第三轮的三个决定性问题

- **O1**：`failure_reason` 的判定者与最小 schema——wrapper（消费事件流）、工厂执行器（消费收据），还是在 agent-delegation 公开边界加结构化错误通道（Codex 的"最薄受测接口"）？provider 结构化额度错误今天不存在于 ACP 协议。
- **O2**：工厂执行器是否允许依赖 experimental 上游（Flows，pin＋可替换封装），还是自写普通 CLI 循环？鉴于结构性无 fan-out、无 restart-resume，两案在 Step 1 的实际差异比"复用 vs 自写"小——什么证据能促成选择？
- **O3**：双 Worker gate 的任务族与成本记录协议；若 Kimi 坚持降级，请正面回应 §2-D2(a) 的自反论证（对照实验自身预设有资格的机器）。

## 8. 检索轨迹与读取声明

**网络（3 次定向，均全文页）**：① `code.claude.com/docs/en/workflows`（问生命周期/后台/resume/超时/并发，得到逐句引文）；② `raw.githubusercontent.com/openclaw/acpx/main/docs/flows.md`（问实验状态/节点类型/执行模型/checkpoint/权限/版本差）；③ `arxiv.org/html/2311.17371v3`（问 MAD 结论/调参/域/何时有用）。

**本地核对**：wrapper `_extract_result` 与状态归一（`:275-329,:458,:471,:488-491`）；CC 失败 transport 收据全套（result/request/events 头部；stderr 为空）；`r1-zcode-receipt.json`；`claude-round1-research-receipt.json`（该文件是 Codex 从原生 transcript 重构的研究记录，我仅交叉定位；分类依据以 transport 原始 result.json 为准）；`acpx-flow-probe.mjs` 重跑（零 Agent，仅写 work 下 artifacts）＋ `flows-BiRKgCnW.js` 源码核验；`.ultra/tasks.json`（30 任务、24 带依赖、8 未完成——计划权威的未来依赖已在）；`skills/ultra-status/SKILL.md:80-154`。

**未验证**：provider 结构化额度错误是否存在（ACP 规范无此概念，归 O1）；上游 main 分支源码未逐行读（仅 docs＋本地 0.13.2 产物）；Flows "无 restart-resume"是文档缺席论证，非代码穷尽证明。未运行任何委派/工厂代码路径（探针为确定性 compute，无 Agent）。

*本报告仅写入指定路径；无实现改动、无安装/提交/发布效应。*
