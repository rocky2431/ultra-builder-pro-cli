# ZCode 第三轮（最终轮）：运行层操作面攻击、权限反例核查与计划收束

日期：2026-09-05。身份：三方交叉评审最终轮，ZCode（经 `agent-delegate → ACPX → ZCode`，delegation_id `ab38aebe…`，`approve-all`——本链路自身就是 §1 反例的活样本）。已读 `r2-codex-revision.zh-CN.md` 与两份第二轮报告；对 Codex 修订稿的全部关键主张做了本地一手核对，并完成 3 次定向网络检索（均为本轮新抓，不重复第一轮综述）。

## 0. 总裁决

**Codex 修订稿在运行层设计上存活本轮攻击；我背书其作为下一步计划，附加五个验收补丁（§2）。** 两命题原样保留：命题一（当前 Owner 体验整改）与命题二（现有 agent-delegation/ACPX 之上的自动化软件工厂，含任务内反馈与未来图演化）均不可拆；R2 Step 1/2/3 全量目标不动——Step 1 = W1 + 所选 Host 上资格验证的 W2（R2 §12/:623,:721），W3 属 Step 2、W4 属 Step 3；UltraGoal 保持独立，本文对其仅有模式借用。我第二轮报告有两处实质错误，在 §3 显式更正。

## 1. 场景一（正面任务）：权限反例——围栏不是 OS/网络隔离

**Codex §3 对本地 ACPX 的引用逐行属实，我独立复核：** `live-checkpoint-Gw2oGjhe.js:2414-2417`（mode 匹配：`approve-all` 直接选中 allow 项）、`:2430-2440`（解析顺序 policy→mode→read-or-prompt）、`:2418-2421`（`fail` 仅在"需要交互却无法交互"时抛 `PermissionPromptUnavailableError`）。因此 "`--non-interactive-permissions fail` 使任何权限请求失败" 为假；Kimi Q7 被正确驳回。

**但我补上比 Codex 更硬的三个事实，使反驳闭合：**
1. `:3619-3623` `isExecuteApproved`：`approve-all` 下**任意终端命令直接放行**，无路径、无网络约束；`:2178-2182` 的 `resolvePathWithinRoot` 只约束 fs 工具写，不约束 shell。
2. 环境净化是**允许清单过滤**（`host-profile.cjs:93-115` `descendantEnvViews`），防的是继承型凭据泄漏，不是进程隔离。
3. 事后核验只看仓库内：`delegate-worker.cjs:61-71` `changedFiles`＝worktree 内 `git diff` + `ls-files --others`；`unauthorized_write`（`:385-390`）只能捕获 repo 内越出 writable_roots 的差异。**repo 外写入与一切网络效果对围栏不可见。**

**[外部一手]** Claude Code 官方 sandboxing 文档（本轮实读）：权限规则/权限模式与沙箱是"complementary layers"，前者在命令运行前评估，后者"provides OS-level enforcement"；并明写"Effective sandboxing requires both filesystem and network isolation"、且"not a complete isolation boundary"。这从厂商口径确认：**权限层＋worktree＋事后 diff 的组合不是隔离边界**——三者都不在 OS 层约束运行中进程。

**为何现方案可能失处置：** Kimi Q7 的"围栏内 approve-all 风险被限定"若被接受，Step 1 无人值守资格就会被一个不存在的边界背书。Codex 修订稿自身立场正确（R2 §10.3 要求实测 effect enforcement），风险只在表述滑移：当前监督运行（含本轮三方评审链）的资格来自**人监督＋范围限于命名文件**，不来自围栏。

**最小修正/验收：** 不改设计，把 R2 §10.3 执行为硬 gate——每个所选 Host 路径在进入无人值守 Step 1 前，用探针 worker 实测"越根写入＋网络外联"在**执行点**被拦截（而非事后检出），记录进资格证据；期间一切监督运行显式标注 supervision-qualified。
**裁定：DESIGN 已覆盖（§10.3），堵的是表述滑移；实测属 IMPLEMENTATION 资格项。**

## 2. 场景二至五

### 场景二：已知额度 × writer 存活，且"存活 ≠ 在推进"

**发生什么：** CC 案例是"额度已知（文本）＋收据已发布"；矩阵较难的那格是**原因已知但 writer 树仍存活**——进程挂在等额度重置不退出，或后台孙进程仍写。**为何可能失处置：** Codex 矩阵对该格正确（"原因已知也不放行"），但缺两件事：(a) `agent_delegate.py`（759 行）**零** pid/pgid/liveness/writer 代码——CC 事故实际跑的 agent-delegation 路径上，"writer 已证停止"今天根本不可机械判定，矩阵该格在此路径不可达；(b) 存活探测（`agent-execution-driver.cjs:389-431`：`kill(pid,0)`＋pgid 探测＋PID 复用→unknown）证明的是**存在**，不是**推进**——卡死 writer 永远 alive，fence 永久持有，修订稿没有给 stalled 升级策略。

**[外部一手]** Temporal 官方故障检测文档（本轮实读）："The Temporal Server doesn't detect failures when a Worker loses communication with the Server or crashes"；heartbeat 是"making progress and the Worker has not crashed"的双信号；且"Activities that don't Heartbeat can't receive a Cancellation"——**取消依赖对方响应**，无响应 writer 只能外部信号终止。

**最小修正/验收：** 工厂执行器消费 UBP 路径已有的 writer 观察文件面（fresh reader 可独立求值）；slice 预算里预声明 stalled 策略：存活＋超 deadline 无收据 → 一次 Owner 决定（建议项＝cancel 文件→等待→按 pgid 信号→重判状态），不静默重试。验收演练必须含"额度已知＋writer 未停"与"writer 卡死"两型（后者为假设性场景，未实测）。
**裁定：IMPLEMENTATION 资格项（预算/取消策略字段 R2 §6.3 已有），设计只需把这两型写进必测清单。**

### 场景三：执行器崩溃三窗口与孤儿 writer

**发生什么：** 薄执行器（W1 形态下是 Owner 会话内前台进程）在 barrier 中途死亡。关键本地事实：两个 driver 都 **detached 启动 Host，子进程自成 process-group leader**（`agent-execution-driver.cjs:343-345`）——**worker 在执行器死亡后存活并继续写**。这不是罕见故障：W1 把工厂活性耦合在 Owner 会话活性上（Kimi A2），会话中断即触发。

**为何方案不致失处置（我核实过的持久化顺序）：** `delegate.cjs:1022` 先落盘 writer.json `not_started` → 写 spec＋摘要 → worker 在启动 Host 前重验全部摘要/fence/cancel 并以 PID＋start identity 认领锁（`delegate-worker.cjs:326-353`）；运行后还有摘要复验（`:377-384`）、越界写检测、边界证明对一切"看似安全"终态的 outcome_unknown 覆写（`:434-443`）、fence 仅在已证停止时释放（`:463-470`）。死掉的执行器无需自己写终态——fresh reader 从磁盘即可重建"谁在写、证明了什么、什么是 unknown"。

**最小修正/验收：** Codex 已要求覆盖"launch 前后＋效果已发生终态未写"窗口，我背书并加一条：恢复顺序必须显式为 **先处理孤儿（cancel→验证停止）再谈 relaunch**，且 setsid 逃逸出 pgid 的孙进程是边界证明的已知盲区（`deriveWriterState` 对其判 stopped），要进边界演练清单（假设性，未实测）。
**裁定：IMPLEMENTATION 资格项；设计（恢复合同 §6.7）已覆盖。**

### 场景四：图修订后的旧证据（Kimi O3）

**发生什么：** 运行中 Primary 合并节点/改验收，旧 revision 的 attempt 带着工件返回。**为何可能失处置：** 修订稿说重用要"检查相关输入/依赖/当前 acceptance 与工件摘要"，但没说**失效规则住在哪**（slice manifest 还是计划账本——HC-4 单一权威），也没说在飞旧 attempt 是完成还是取消。绑定机制已存在（attempt 全程携带 instruction/permission/schema 摘要并在运行中复验，`:377-384`），缺的只是规则成文。

**[外部一手]** Temporal worker versioning（本轮实读）：pinned 运行"guaranteed to complete on a single Worker Deployment Version"，被替换版本经 Draining→Drained 才关闭；auto-upgrade 必须靠 patching 保持 replay-safe。可迁移规则：**在飞 attempt 钉在其起始 revision 上完成；仅新 attempt 路由到新 revision；旧 revision 证据带版本标记，集成前必须对当前验收显式重验**（patching 纪律）。

**最小修正/验收：** 修订稿加一句：revision 声明在计划账本（唯一权威），attempt 携带输入 revision 摘要（已有），在飞 pinned 完成，旧工件无显式重验不得集成。验收＝Step 2 演练"运行中改图"，检查无未重验旧工件进入集成。
**裁定：小而真实的 DESIGN 缺口（规则位置未定），机制属 IMPLEMENTATION；不阻塞 Step 1，Step 2 前须成文。**

### 场景五：W1-only、最小公开边界，与"什么失败会推翻薄执行器"

（a）**W1-only 见 §3 更正**：实现可从 W1 起步，但 Step 1 出口合同是 W1＋所选 Host 合格 W2；把"W1 唯一形态"固化＝悄悄改阶段边界。（b）**最小公开边界我给出具体答案：就是 UBP 委派路径的文件面**——spec（带摘要）/result/cancel/writer.json/fence registry，加上 agent-delegation 的候选发现与连接。W1 阻塞等待与 Step 2 规模的通知，轮询该文件面已足；只有当真实消费者证明轮询不满足时才补事件接口（与 Codex "实际消费者需要的薄接口"一致），`failure_reason` 不先变必填枚举（§3）。

（c）**正面回答最终问题——什么具体失败会推翻"薄执行器"选择而非 experimental Flows：** worker 侧失败（崩溃、额度、卡死、receipt 含糊）打击任何执行器，Flows 同样经过同一 ACP transport，不构成对选择的否定；Flows 0.13.2 无 fan-out、无跨进程 resume（我与 Kimi 第二轮均已在源码级核实），连 Step 1 出口的双 Worker 重叠都无法表达，**不存在任何 Step 1 级失败能把选择翻向 Flows**。唯一能推翻薄执行器的是**其承重前提本身被证伪**：文件协议的单写者纪律在并发恢复下出现可复现的 split-brain——例如 `claimWorkerLock` 的"写入→读回"窗口与另一认领交错（`delegate-worker.cjs:272-298`，B 先读旧锁、A 完成认领、B 再覆写并读回自身，两者都过——假设性竞态，未实测，fence 前置检查可能已覆盖），或 fence 释放与 relaunch 的竞态。该类失败同样击败任何 Flows 型协调，其修正方向是 OS 级单实例强制（如真互斥锁）或持久执行引擎——仍不是 Flows。**薄执行器的证伪条件与 Flows 无关；这是该选择正确的最强形式。**

**裁定：DESIGN 维持；竞态窗口属 IMPLEMENTATION 必测项（并发恢复 drill）。**

## 3. 对我第二轮报告的显式更正

1. **（material）** r2 §6(5) "W1 前台阻塞为 Step 1 唯一形态"错误且与我自己的 D2（保留双 Worker 出口 gate）不一致：W1 是**等待语义**（同一阻塞 tool turn 返回 Attention，R2 :469-476），不是 worker 数上限，更不是阶段边界；Step 1 出口含所选 Host 合格 W2。接受 Codex §6 与 Kimi A2 的驳回。
2. **（material）** 撤回 r2 §3(c) 把 `failure_reason` 枚举立即加进 result schema 的主张：本地证据（CC 案例：原因只存在于 JSON-RPC error 文本）表明今天该枚举几乎恒为 unknown，先造字段等于伪装知识。接受 Codex "ACP 层原样保留、reader 按版本已知结构码可选分类、未知就未知"；枚举留作真实消费者证明不足后的版本化扩展。
3. r2 其余裁决（D1-D6、Flows 边界、三旅程度量）本轮复核后维持，无需改动。

## 4. 我背书的下一步计划与剩余分歧

**背书 Codex r2-revision 全稿，按其 §6 顺序执行**，附加以下验收补丁：(1) §10.3 执行点拦截实测为无人值守前置（场景一）；(2) "额度已知＋writer 未停"与"writer 卡死"进必测清单（场景二）；(3) 恢复顺序显式含孤儿 cancel→验证停止，setsid 逃逸进边界演练（场景三）；(4) revision 权威落在计划账本＋pinned 完成＋显式重验，Step 2 前成文（场景四）；(5) 并发恢复 drill（claim/fence 竞态）进资格项（场景五）。最小公开边界＝UBP 文件面＋agent-delegation 发现/连接，先零新接口。

**剩余分歧：** 对 Codex 无实质分歧，仅一个保留：Flows 作为"可替换候选"保持在册即可，在对照证据出现前不投入任何接入工作。对 Kimi：Q7 的围栏主张已由本地代码＋厂商文档双重证伪，若其坚持请给出 OS 层拦截证据，而非 worktree/diff 类比；其余（进度三类、双 Worker 资格保留、W1 起步）三方已收敛。证据优先，不作置信度百分比与多数表决。

## 5. 检索轨迹与读取声明

**网络（本轮 3 次定向，均全文实读）**：① `code.claude.com/docs/en/sandboxing`（权限层 vs OS 沙箱分层、Seatbelt/bubblewrap、网络经沙箱外代理、"requires both filesystem and network isolation"）；② `docs.temporal.io/encyclopedia/detecting-activity-failures`（server 不检测 worker 失联/崩溃、heartbeat 双信号、无 heartbeat 不能收取消）；③ `docs.temporal.io/worker-versioning`（pinned 保证单一版本完成、Draining/Drained、auto-upgrade 需 patching 保 replay-safe）。

**本地核对（本轮新做）**：`live-checkpoint-Gw2oGjhe.js:2172-2182,2414-2440,3619-3623`；`delegate-worker.cjs:61-71,240-318,320-479`；`agent-execution-driver.cjs:280-431`；`delegate.cjs:263-307,653-693,911-920,1022,1064`；`host-profile.cjs:93-115`；`agent_delegate.py`（759 行，grep 零 pid/pgid/liveness/writer 命中）；R2 目标架构 `:469-484,623,721` 与 §6.3/§6.7/§10.3/§10.4。

**未验证/假设性声明**：claimWorkerLock 竞态窗口、setsid 孙进程逃逸、writer 卡死场景均为假设性，未运行任何委派或工厂代码路径；CC 案例收据结论沿用我 r2 的 transport 原始 result.json 核对，本轮未重读；Flows "无 resume" 仍为文档缺席论证。本报告仅写入指定路径；无实现改动、无安装/提交/发布效应；D1 旧 grant 保持独立且未激活。

*本轮收据：报告即交付物；三方辩论按预算终止于本轮，无自动延伸。*
