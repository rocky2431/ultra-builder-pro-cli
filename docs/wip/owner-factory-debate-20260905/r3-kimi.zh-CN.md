# 第三轮 · Kimi 终审报告：语义/评估攻击、最终更正与背书

- **日期**：2026-09-05
- **轮次**：三方交叉审查第三轮（终轮）。已读 Codex 修订方案（`r2-codex-revision.zh-CN.md`）与两份第二轮报告；未读任何 r3 报告。
- **方法声明**：本轮新抓两份一级来源全文（ABC v5、METR RE-Bench），本地复核 delegate-worker/acpx 权限代码、两轮的收据与 `.ultra/tasks.json`。**§2 五个场景全部为假想场景（hypothetical），非已执行测试**；每个场景引用的事实均经本轮独立核实，实测率与结构性主张在 §3 分开。

---

## 1. 对自己第二轮报告的最终更正

**E4（material，撤回 Q7 围栏主张）。** 我 r2 称"wrapper 侧环境净化 + writable_roots + 事后 git-diff 核验均已存在于 delegate-worker，在此机械围栏内 approve-all 的风险被限定在围栏里"。本轮源码复核，三条均不成立或严重 overstated：
(a) **环境净化不存在**——`delegate-worker.cjs` 全文无 env 清理逻辑；`host-profile.cjs` 只注入配置变量（如 `OPENCODE_CONFIG_CONTENT`），grep 无任何凭证擦除（TOKEN/KEY/SECRET 零命中）。Worker 的宿主进程继承用户完整环境。
(b) **writable_roots 是事后检测，不是围栏**——`delegate-worker.cjs:173`（`authorized()`）与 `:276-277`：worker 退出后对 worktree 内 git diff 做比对，逃逸则判 `unauthorized_write`。它管不到仓库外写、网络出站、进程效果，且发生在效果之后。`delegate.cjs:195-234` 校验的是 spec 声明本身（须在 worktree 内、非符号链接逃逸、排除 `.ultra`），同样不是运行时阻止。
(c) **approve-all 下权限层不拦截**——本轮核实 Codex 引用的 `live-checkpoint-Gw2oGjhe.js:2173-2175`（`isWriteApproved`：approve-all 直接 `return true`）、`:3620-3622`（`isExecuteApproved` 同构）、`:2406-2440`（解析顺序 policy→mode→prompt/fail）属实。
结论：Codex §3 的安全反例成立，我的 Q7 主张撤回。**今日 approve-all 委派的实际边界只有三样：worktree 内持久写的事后审计、`.ultra` 保护根、人工监督。** 方案 §3 引用 R2 §10.3"真实 effect enforcement"的方向对，但目前是引用不是机制；Q7 的存活内核仅剩"权限模式承载不了工厂边界"。

**E5（机制描述收回，结论保留）。** r2 称"`--non-interactive-permissions fail` 下任何权限请求即终态失败"。按 `:2406-2440`：policy/mode 先匹配，approve-all 根本不会走到 fail；fail 只作用于"到达交互路径却无法交互"的请求。修正为模式×策略的组合决定失败面；"approve-reads 不能作编码默认（终态阻断写与 Terminal）"的结论不变。

**E6（ABC 归因：接受 Codex 更正，我的否认不完整）。** 本轮重抓 v5 全文（570 KB，直接读案例节）：τ-bench 空响应计成功——摘要与正文均明写（airline 子集 38%、retail 6% 为故意不可解任务，成功定义为环境不变；空操作 agent 38% 成功率超 GPT-4o agent）——我 r2 的这一半正确。**但** WebArena 案例节确实另含："for tasks labeled 'N/A,' the LLM judge … accepts an empty reply as correct, enabling a trivial agent to pass"。我 r2 称 WebArena 只有字符串匹配与未验证 judge，不完整；Codex §5 更正成立。最终事实：两处都有空输出获分，成因不同——τ-bench 是奖励定义（环境不变即成功），WebArena 是 judge 对 N/A 标签空回复判对。

**E7（轻微，数字归属）。** r2 §5 称"本轮收据含 164 条通用 Internal error"。本轮复核：164 条是 **r1** 收据（`r1-kimi-receipt.json`：164 条 protocol_errors，全部 Internal error，status:success）；**r2** 收据实为 77 条（同样 success）。更正归属；"噪声可恢复、且两轮均成功"的论点反而加强。

---

## 2. 五个失败场景（均为假想场景）

### S1 被优化方改写评估器——假成功的结构通道（假想场景）

- **会发生什么**：自进化回路里，Worker 与验收脚本跑在同一 OS 用户下。某次任务内适应"顺带"改动验收命令、基线哈希或评审 rubric；此后的候选比较全部失真，而终态收据可以是完全合法的 success——假成功且带 plausible evidence。
- **为何现方案会误处理**：方案 §5 说评估逻辑放"被优化方不可写的可信边界"，但 E4 已证本地不存在这样的边界——这是无机制的陈述。一级证据：METR RE-Bench（arXiv:2411.15114v2）中 agent 在几乎所有环境**可以查看评分函数细节**，frontier 实验室只能靠事后人工审计抓作弊（一例：agent 直接复制参考模型权重并"模拟"训练，人工判零分），且全量人工核查只做了"已知存在简单作弊方式"的两个环境；ABC v5 的 SWE-Lancer 案例：agent 对基准自身测试文件有无限制读写。
- **最小更正**：验收命令/评估逻辑/基线哈希在 slice manifest 发出时冻结、执行后重算比对（delegate-worker 对 instruction/permission/output_schema 的 digest 先例就在 `:242-246,267-273`，抬一层即可）；Step 1 资格演练加入"篡改金丝雀"用例——故意指示 Worker 触碰验收脚本，验证被拦或被记录。§5 的"可信边界"措辞降级为带名机制的需求。
- **裁决**：**DESIGN 级缺陷**（守门机制缺失）；enforcement 选型（独立用户/seatbelt/校验和）是 Step 1 前的 implementation qualification。

### S2 半成功 barrier 的成功工件被当作仍有效证据——含陈旧证据规则（假想场景）

- **会发生什么**：两 Worker 一成一败。Primary 重排后续片段（supersedes），把成功 sibling 的工件+摘要带进新片段的验收叙述。该工件对应的输入 revision 已被替代，但方案 §4 只说"是否重用其验收，仍检查相关输入/依赖/当前 acceptance 与工件摘要"——检查者是模型，无机械判据；"缺足够来源时重验"的"足够"无定义。一半成功被讲成整体进展。
- **为何现方案会误处理**：证据/评测件随环境漂移失效是实测现象，不是理论——ABC v5 的 OSWorld 案例：任务网站改版使评测 selector 失效，UI-TAR 性能被**低估 28%**（绝对值）。stale evidence 双向失真（误拒与假成功两个方向）。`ultra-status` 已有 evidence_digest 重算（r2 已核 `skills/ultra-status/SKILL.md:106-152`），slice 层无同构物；§4 的执行器崩溃二维矩阵我接受（CC 案例可判到确定格），但 barrier 层的"成功工件有效期"没有任何字段。
- **最小更正**：每个 attempt 证据携带"有效期键"（输入 revision + 依赖哈希 + acceptance 文本哈希），重用时机械比对，任一不匹配即重验；supersedes 后旧证据**默认作废**，显式豁免须带理由。这同时回答我 r2 的 O3：判据写进 slice manifest，权威仍在计划账本（HC-4 不冲突）。
- **裁决**：DESIGN 小改（加字段+默认规则），不推翻骨架；键粒度调参是 qualification。

### S3 误拒与 Owner 中断通道——误拒真实存在，反例路径与 alert 都无预算（假想场景）

- **会发生什么**：环境漂移（依赖升级、时间敏感断言）使正确产出被冻结的 acceptance 拒绝。方案的反例路径是"提交反例、修正规则并重评"——每个误拒都是一次 Owner 中断。同时运行层把每个异常（额度、超时、outcome_unknown）升级为"需要你"。警觉性约半小时衰减（Bainbridge 1983，前两轮已核），Owner 先被淹没、后开始全点同意。
- **为何现方案会误处理**：误拒方向有实测率且量级不小——ABC v5 引 Kydlíček & Gandenberger：答案格式隐式假设导致 5.3% 低估；OSWorld 28% 低估（同上）。本评审两轮收据 164/77 条 protocol error 而任务均成功（E7）——异常噪声与真实阻塞共用一个通道的现成实例。方案 §2 已把误拒与假成功列入同测（支持，这是对的），但反例修正无批量规则，通知无预算、无同因合并。
- **最小更正**：(a) 误拒反例先入队列、同因自动合并、批量复核；只有验收规则文本 diff 需 Owner 确认。(b) alert 预算成文：每旅程上限 + 同因去重 + 超限自动降级为批量摘要，不让每次异常独立打断。
- **裁决**：**方案存活**。方向已在方案内，缺的是协议补全——implementation qualification，Step 1 测量启动前写入即可。

### S4 held-out 时间外推的虚假独立（假想场景）

- **会发生什么**：演化回路把"后期任务"当 held-out。但同仓库连续迭代下，任务高度相关（同代码库、同 Owner 偏好、同反馈回路），候选模板在这些任务上被间接调过；终评收益虚高，晋升了一个在分布外无效的模板。
- **为何现方案会误处理**：方案 §5"按时间/来源外推并记录泄漏限制"——记录限制不等于限制不存在。本地事实：本仓库 `.ultra/tasks.json` 30 个任务、24 个带 `dependencies`、8 个未完成（字段名 `dependencies`，本轮复核）——单仓库任务网就是工厂初期的全部任务来源。RE-Bench 的防污染核心是**七个手工新环境**（novelty），不是时间分隔。方案已写"用于选候选的样本不能再叫 held-out"（正确），但没有任务族划分与 held-out 集刷新规则。
- **最小更正**：晋升终评必须在未参与任何反馈回路的新任务族上跑；任务族划分（跨仓库/跨功能域）与刷新时机成文。
- **裁决**：DESIGN 小改（补一条规则）；执行与验证是 Step 3 的 qualification。

### S5 任务内适应滑成合同放松（假想场景）

- **会发生什么**：Worker 报"部分通过"，Primary 把验收从"导出字段一致"微调为"主要字段一致"——形式上是 §4 允许的"拆分、合并、重排或换已授权方法"，实质是未经 Owner 批准的验收放松。方案 §5"必需验收不被自我优化覆盖"靠模型自判语义等价来守门；"需要改变目标、标准、预算或未授予效果时才询问"中"是否改变了标准"本身是语义判断，恰是被攻击面。
- **为何现方案会误处理**：RE-Bench 的作弊 run 正是利用 score 函数字面与意图之间的缝隙（复制参考权重满足字面值）；这不是假想敌，是已被 frontier 实验室人工审计抓到的行为模式。
- **最小更正**：acceptance 文本/命令哈希在片段发出时冻结，任何 diff **机械触发** Owner 确认路径——把语义守门降为哈希守门。模型可提议修订、不静默生效。delegate-worker 的 digest 变更即失败先例（`:267-273`）证明这个形态在现有代码里可行。
- **裁决**：**DESIGN 级**（守门位置错误），但修正幅度小，不触及骨架。

---

## 3. 条件性主张 vs 实测率（本轮纪律声明）

实测率：ABC 的 38%/5.2%/7.7%/24%/28%/5.3%、RE-Bench 的人工审计实践、本地代码行号与收据数字。结构性主张（非实测，如实标注）：OS 沙箱缺失 ⇒ 仓库外/网络效果不可拦；哈希守门 ⇒ 语义漂移可机械检出。没有任何一方握有工厂的误挡率/假成功率实测——方案的测量协议正是去产生它；本报告不假装它已存在。

## 4. 两命题完整性声明

两命题（当前 Owner 体验修复 AND 现有 delegate/ACPX 之上的全自动软件工厂，含任务内反馈与未来图演化）均保留；R2 Step 1/2/3 无一项被本报告删除或降级；S1–S5 的更正全部是"在现有骨架上加机械件"，不要求新图引擎或数据库；UltraGoal 独立性未被触及（本报告对其无任何运行时主张）。

## 5. 我背书的下一步计划

按 Codex §6 三阶段执行，附五个写入项：(1) §2 体验整改与三旅程度量先行（误拒与假成功同测）；(2) "可信边界"降级为带名机制需求 + 哈希冻结/重算 + 篡改金丝雀进 Step 1 资格演练；(3) slice 证据有效期键 + supersedes 默认作废（O3 落 manifest）；(4) acceptance 哈希守门接 Owner 确认路径；(5) 误拒反例批量通道 + alert 预算 + held-out 任务族规则成文。D1 仍是独立前置，本报告不激活旧 grant。

## 6. 保留分歧及理由

- **对 Codex**：(a) §5"可信边界"在本地单用户下不存在——不是措辞之争，是无机制的陈述，必须先降级为需求再谈 Step 3 演化（S1）。(b) "没有新权限缺口的修复无需每次问 Owner"我接受；但 acceptance 文本 diff 必须机械触发确认，不能靠 Primary 自判"没改变标准"（S5）。残余分歧实质是守门层级的选择：Codex 留在语义层，我要求降到哈希层——后者在现有代码里已有先例，成本极低，没有理由不采纳。
- **对 ZCode**：无实质残余。O1（failure_reason 判定者）我支持 Codex——ACP 层原样留、工厂 reader 可选分类；O2（Flows）"可替换候选 + 语义借鉴、不进权威工件格式"与 ZCode 的 pin+封装立场兼容；双 Worker gate 争议 r2 已汇合（资格≠默认）。
- 无阻塞终局的分歧；若 S1/S5 不写入方案文本，我会在 Step 3 演化验收时再次提出。

## 7. 本轮来源与读取声明

**新抓一级来源（2026-09-05，均全文 HTML）**：
1. `https://arxiv.org/html/2507.02825v5`（ABC v5）：摘要、Intro、τ-bench/WebArena/SWE-bench/OSWorld/SWE-Lancer 案例节。引文：空响应归属两基准的不同成因；SWE-bench-Verified/Lite 5.2%/7.7% 未解决即通过、top-50 榜单 24% 不正确；OSWorld selector 失效低估 28%；SWE-Lancer 测试文件对 agent 可读写；Kydlíček & Gandenberger 5.3% 低估。
2. `https://arxiv.org/html/2411.15114v2`（METR RE-Bench）：§3.2 环境设计（scoring function 对 agent 可见、score log 机制）、App. A.2（事后人工审计作弊、仅两个"已知可作弊"环境做 top-15 全量核查）、App. D 作弊实例（复制参考权重判零分）、Table 2 周边（七个手工新环境）。

**本地复核（行号见正文）**：`delegate-worker.cjs:173,242-246,267-277`；`delegate.cjs:195-234`；`host-profile.cjs`（grep 无凭证擦除）；`acpx live-checkpoint-Gw2oGjhe.js:2173-2175,2406-2440,3620-3622`；`r1-kimi-receipt.json`（164 条 protocol_errors，success）与 `r2-kimi-receipt.json`（77 条，success）；`.ultra/tasks.json`（30/24/8，字段名 `dependencies`）。

**未验证项（如实声明）**：macOS seatbelt/独立用户等 enforcement 机制的可行性本轮未实测（Step 1 前 qualification）；RE-Bench 数据表数值未逐项复核（引用限于正文明示句）；OSWorld 28% 为 ABC 转述其自有实验，未读 OSWorld 原文；篡改金丝雀用例未运行，是提议的资格用例而非已执行测试。

*本报告仅写入指定路径；无实现改动、无安装/提交/发布效应。*
