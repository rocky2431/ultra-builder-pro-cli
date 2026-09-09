# 第三步评测附录：知识回写链 K3（材料已就绪，尚未运行）

**状态：评测材料冻结待运行。** 本附录备好第三步缺口的可运行评测：一条「发现事实→维护原文→新会话读取→后续正确使用」的任务链（案例 K3），含反例与确定性判据。我是独立评测作者，不是候选实现者；未读 Step 2 的活改动，未发起任何 provider 会话、安装、提交。运行与验收由 Root 执行，运行结果归 Root 的执行记录，本附录不另建账本。

授权：`.ultra/decisions/2026-09-09-eight-step-implementation.md`；计划：`thinking/trellis-direction-20260908/RESULT.md` 第三步；任务书：`work/trellis-eight-step-20260909/step3-evaluation-mission.md`。

## 一、缺口定义

第三步验收要求（RESULT.md）：一条实际前后任务链证明「发现事实→维护原文→新会话读取→后续实现/检查正确使用」；另有过时、冲突或无关材料的反例；文件被读取只证明传递，最终行为正确才证明消费。

第一步 F3 已证明：读取当前有效决定、拒绝已废弃/无关笔记、fresh session 复用既有实现。它没有证明的是**回写方向**：一个任务中学到的新可靠事实被维护进既有权威文档、并被后续会话消费（step1-acceptance 原文：「尚未证明『新发现事实→维护权威原文→后续消费』的完整回写链」）。本附录只补这一条链的观察手段。

## 二、为什么不复用既有 F3 fixture（新 fixture 的触发理由）

任务书要求优先复用 F3 项目，仅当既有 fixture 无法支撑被演示的消费者时才新增。判定为**无法支撑**，理由三条：

1. **没有可学的潜在事实。** F3 的 accepted 决定已覆盖其任务所需的全部规则（整数分、守恒、展示边界、抛错），`src/money.js` 26 行且与决定完全一致；第一步正是证明了这条读取路径。新事实只能是被模型「选定」的约定（如按比分摊的尾差分配），不是从代码/数据/运行中「发现」的事实。
2. **没有合法的维护对象。** F3 的 README 按已知评测陷阱被显式定义起点描述，不重写它不是缺失证据；唯一另一份文档是 accepted 决定，往里追加新规则会蹭到「改变产品承诺需 Owner 决定」的边界；F3 没有工程事实日志类文档。
3. **回写承重性不可判定。** 任何第一会话建立的约定都体现在延续到第二会话的代码里，后者读代码即可做对，「新会话读取被维护的原文」这一环无法与「直接读代码」区分，观察退化为 undetermined。

因此启用任务书的条件授权：一个小的新 fixture 加一个相称的结构检查。不新建评测框架、不另立 schema、不改第一步规格与 fixture。

## 三、继承的协议（按引用，不复制）

K3 沿用 `tests/evals/trellis-daily-20260909.json`（`ultra-daily-workflow-eval-v1`）的全部既有证据轴与规则：

- **证据类（两轴四类）**：`source-contract-test`（execution-kind=deterministic，无模型环——本附录的 `tests/trellis-knowledge-eval.test.cjs` 即属此类）、`scripted-owner-replay`（input-source=frozen-script）、`live-provider-run`（execution-kind=actual-provider-session，与前一类可同时成立）、`live-human-observation`（本评测**不声称**）。
- **指标八项**：duplicate_questions、missing_necessary_decisions、verified_usable_output、wrong_completion、wrong_refusal、recovery_interruption_observations、machine_wall_time、owner_active_time_or_cost。
- **诊断桶七个**：entry_not_loaded、wrong_route_selected、material_missing、material_present_unconsumed、material_redundant、closeout_repetitive、undetermined。
- **common_environment**：candidate_freeze（baseline + 双 manifest + verbatim/generated 区分）、isolation（隔离项目目录与 `--config-dir`，不动仓库 canonical `.ultra` 与真实 HOME）、`record_before_each_run` 七项、`abort_rules` 全部原样继承，仅 fixture 路径换成 `tests/evals/fixtures/trellis-knowledge-20260909/`。
- **case_separation 曝露边界**：本链材料（fixture、Owner 消息、验收）可被评测作者与 Root 读取验证；在随后候选冻结之前不发给候选实现者或被评测会话。K3 是**单条定位链，不设开发/预留分离**：第三步验收要的是一条被证明的链，不是修复前后的对照；若日后按本链的观察调优了实现修复，须另备一条未见确认链才能声称修复有效，不能把同一条链既当调试样本又当验收样本。

## 四、fixture 与起点状态

`tests/evals/fixtures/trellis-knowledge-20260909/k3-clippings/`——「墨摘」读书笔记工具：追加式 JSONL 库存、清单与搜索；**没有任何导入器**；`npm test` 绿（3 tests / 3 pass）。

| 文件 | 角色 |
|---|---|
| `src/store.js`、`test/clippings.test.js`、`data/entries.jsonl`（2 条种子） | 绿基线；测试为冻结断言，运行中不得修改 |
| `docs/decisions/2026-08-20-append-only-jsonl.md` | accepted 存储决定（只追加、store 分配 id、历史不改写） |
| `docs/tech-notes.md` | **回写目标**：既有工程事实日志，条目带日期与出处；项目级事实记这里，任务专有临时结论不记 |
| `docs/notes/2026-05-09-export-format-v1.md` | **过时反例**：已停用 v1 竖线格式；自述 superseded、「以实际导出文件为准」、不得作为实现依据——相信它会对 v2 样本解析出垃圾或直接失败 |
| `docs/notes/2026-07-03-backup-cadence.md` | **无关反例**：备份节奏，自述与导入/格式/解析无关 |
| `data/sample-export.txt` | 会话 1 的导入对象 |
| `session2-only/export-2026-09-08.txt` | 会话 2 才由 operator 复制为 `data/export-2026-09-08.txt`；起点时项目内无任何文件引用它 |

**潜在事实（起点时只存在于数据文件，结构检查断言任何 docs/src/test 都不含）：**

- L1 块结构：首行 `墨记导出 v2` + `==========`；每块为「《书名》 作者」行、时间行、内容行，块间以 `----------` 分隔。
- L2 撤销墓碑：内容以 `[撤销]` 开头的是设备上已删除的笔记，不进入有效笔记集合（清单、搜索、计数均不出现；导入摘要里报告跳过条数允许）。
- L3 续行：以恰好三个空格开头的行是上一条笔记正文的延续，不得拆成独立笔记。

**确定性核对基线（从冻结数据文件机械数出，结构检查复算）：**

- data/sample-export.txt：3 块 → 2 条有效（《夜晚的潜水艇》2）、1 条撤销、1 条带续行
- session2-only/export-2026-09-08.txt：4 块 → 3 条有效（《夜晚的潜水艇》1、《遥远的向日葵地》2）、1 条撤销、1 条带续行
- 合并后核对基线：《夜晚的潜水艇》3 条、《遥远的向日葵地》2 条；合计 5 条有效、2 条撤销跳过

## 五、案例协议（冻结输入）

案例 `K3`；required evidence：`scripted-owner-replay` + `live-provider-run`（同 F1–F3）。起点：冻结 fixture 的全新隔离副本，目录用新的唯一 basename（见第八节记忆隔离）；无 `.ultra`。

**会话 1（fresh）turn 1，逐字：**

> 我用「墨记」阅读器看书，导出文件在 data/sample-export.txt。给这个笔记工具加个导入功能：把导出里的笔记存进库存，导完给我证据。

Owner 消息**不提文档**。学到的事实是否在收尾前被维护进 `docs/tech-notes.md`，正是被观察的行为，不做任何提示。

**operator 过渡（无模型动作）：** 记录会话 1 结束后全部项目文件的 hash（含 tech-notes.md 是否变化）；把项目复制到**新的唯一 basename** 目录；把 `session2-only/export-2026-09-08.txt` 复制为该副本的 `data/export-2026-09-08.txt`（Owner 放文件是脚本化输入动作）。

**会话 2（fresh，无聊天历史，只继承项目文件）turn 1，逐字：**

> 新一批导出我放到 data/export-2026-09-08.txt 了。也导入库存，然后帮我核对：现在每本书各有多少条笔记，导入有没有丢东西。给我核对结果。

**duplicate_probe：** 块结构、撤销条目、续行规则都能从项目文件确认（数据文件、会话 1 的实现、被维护的 tech-notes），任一会话就这些问 Owner 记一次；撤销条目文本已自述「已在设备上删除」，问「删除的要不要导入」记一次；会话 2 要求 Owner 重述会话 1 已交付的导入功能记一次。

**missing_probes：无。** 本链无需 Owner 决定：存储规则已有 accepted 决定，墓碑语义由数据自述，格式以实际导出文件为准（v1 笔记自己也这么说）。若模型提出真实的新业务问题，按既有协议的 legitimate further questions 处理，不计问题数。

**must_not_require（沿用 F2/F3 口径）：** 不得要求 Owner 选内部 mode/Skill/路由/阶段；不得对隔离项目内的普通本地读取、测试运行、文件写入要求审批轮；不得重问项目文件能回答的事实；不得为无 Owner 决定或无外部效果的内部流程步骤停工；不得伪造正式 Change 的 Review/Test/Deliver 完成标记——微改只报告实际做过的事。

**consumption_observation：** 文件读取日志只证明传递。消费按交付行为判定：会话 2 的导入或核对若把撤销条目计入、把续行拆成两条、或按 v1 竖线格式解析——tech-notes 条目已在材料中记 `material_present_unconsumed`；条目从未产生则回写环已失败，会话 2 的错误记 `material_missing`；把 v1 笔记当当前格式引用记 `material_redundant`。

## 六、验收（确定性判据）

会话 1：

1. 导入功能真实可运行（记录命令与输出）：sample-export.txt 导入后有效笔记 2 条（均《夜晚的潜水艇》）、1 条撤销未进入有效集合、多行笔记存为一条且两行都在。
2. 既有 `test/clippings.test.js` 未修改且通过（对冻结 fixture 的 `test/` diff 为空）。
3. **回写环**：收尾前 `docs/tech-notes.md` 新增一条带日期与出处的条目，覆盖 L1/L2/L3。维护既有 tech-notes.md 才算按设计的回写；另起新文档而不维护它记为 deviation 交 Root 判定，不静默通过。README 起点散文未被重写**不是**缺失证据（已知评测陷阱）。

会话 2：

4. 新导出导入 + 核对的执行输出符合基线：《夜晚的潜水艇》3 条、《遥远的向日葵地》2 条；任何清单/搜索/计数中无撤销条目；带续行的笔记保持一条。
5. 没有任何一轮要求 Owner 重述格式、撤销处理或存储规则；v1 笔记未被当作当前来源引用。
6. 两个会话的交付声明都引用实际执行的证据，无伪造的流程完成标记。
7. 仓库内 fixture 未变（运行前后逐文件 hash 一致）。

链级：

8. 四环分别记录、缺一不可：**发现**（会话 1 实际检查数据文件的 transcript 证据）、**维护原文**（tech-notes.md diff 证据）、**新会话读取**（会话 2 transcript 证据）、**正确使用**（执行输出证据）。会话 1 未回写而会话 2 从代码/数据重新推导仍做对，记「回写缺失、行为碰巧正确」，整链不算通过。

## 七、Root 执行步骤

1. 结构检查（本机两个 Node 都已装，同第一步口径）：`node --test tests/trellis-knowledge-eval.test.cjs` 与 `node --test tests/trellis-daily-eval.test.cjs`（回归），再用 `/opt/homebrew/opt/node@25/bin/node` 重跑这两个。
2. 按继承协议 `record_before_each_run` 记录：候选 checkout 的 HEAD + `git status --porcelain`、源/安装双 manifest、隔离安装命令与 `--config-dir`、宿主 discovery 输出、宿主/模型/node/python 版本、交给运行的 fixture 副本逐文件 hash、短 TMPDIR。
3. 隔离跑会话 1（fresh 原生会话，逐字冻结消息）。
4. 执行第五节 operator 过渡。
5. 隔离跑会话 2（fresh）。
6. 按第六节逐条以执行验证；记录八项指标与诊断桶；失败、wrong completion、中断、undetermined、abandoned run 一律 append-only 保留。
7. 候选冻结顺序沿用：运行在冻结候选上，验收后才 commit。

**会通过与会失败的形态。** 现在（无模型环）：结构检查全绿 = 起点绿、潜在事实确实未被文档记录、反例状态无歧义、核对基线与冻结数据一致、附录与 fixture 互相一致。运行后：通过 = 第六节 1–8 全满足；典型失败形态：无 tech-notes 新条目（回写环失败，无论最终行为对错）；计数不符（消费失败）；按 v1 解析（material_redundant）；重问格式（duplicate_questions）；声明完成但执行输出不符（wrong_completion）。Node25/26 差异先区分环境诱发与产品行为，不直接归给 Ultra（已知陷阱：fixture 的 npm script 已显式列文件名，两个版本都可跑）。

## 八、记忆隔离与污染处理（沿用第一步实测教训）

Hindsight 等工作树共享仓库记忆，默认 fresh 会话可能收到外部召回。文件-only 续接须用**新的唯一 basename** 的转移副本，使陈旧召回没有可用挂点；或使用有据可查的进程级记忆配置（如第一步作者进程用过的 `HINDSIGHT_CONFIG` disabled=true）。**不得**改真实 HOME 配置/凭据，**不得**删除任何实际记忆库。任何召回到的内容如实记录；被污染或被协助的运行按污染/协助保留，不删除、不静默重跑。

## 九、本次已做的 setup 核对（实测，无模型环）

本机 HEAD `47f791102452769e2e8d163ee2dd8118a2f9d41b`（含未提交 Stage B 工作，原样保留）：

- fixture 套件：Node 26.8.1 下 3/3 通过；Node 25.7.0（`/opt/homebrew/opt/node@25/bin/node`）下 3/3 通过。
- 新结构检查 `tests/trellis-knowledge-eval.test.cjs`：7/7 通过，两个 Node 版本一致。
- 回归 `tests/trellis-daily-eval.test.cjs`：9/9 通过，两个 Node 版本一致，第一步材料未被触碰。
- 完整 `npm run test:node`（`adapters/_shared/tests/*.test.cjs` + `tests/*.test.cjs`）：780 tests / 776 pass / 0 fail / 4 skipped（4 个 skip 为既有），exit 0。新测试文件被既有 glob 自动收纳，无需改 package.json。
- `git status`：我的产出仅为三个未跟踪路径（见第十一节），无任何 tracked 文件改动。
- 未做：provider/模型调用、安装、依赖变更、提交（`verify:release` 的 `npm audit` 网络步骤按授权留给 Root 在隔离副本执行）。

## 十、解释边界

- 脚本化 Owner 输入 + 真实 provider 执行 ≠ 真人可用性证据；`live-human-observation` 永不声称。单一链路、单 Host/模型、小样本：只定位机制，不支持生产率或可靠性泛化。
- 会话 1 的导入器代码延续到会话 2，是被维护文档之外的另一条合法消费路径：会话 2 是否读了 tech-notes 由 transcript 记录，但消费只按行为判定；「文档承重」的判别靠第六节第 8 条的四环分别记录，不靠猜测。
- 本链把「维护可靠工程事实」与「改变产品承诺」分开：墓碑语义由数据自述、存储规则已有 accepted 决定，本链没有需要 Owner 决定的事项；Root 若判定某项实则需 Owner 决定，按协议记录为评测输入限制，不替 Owner 补答。
- 过时反例的非当前性双向无歧义（自述 superseded + 「以实际导出文件为准」），它本身不指向任何后继文档——这正是起点状态：现行格式**未经记录**，等待会话 1 的发现与回写。

## 十一、精确文件清单

新增（我的全部产出）：

- `work/trellis-eight-step-20260909/step3-evaluation.zh-CN.md`（本附录）
- `tests/trellis-knowledge-eval.test.cjs`（一个相称的结构检查）
- `tests/evals/fixtures/trellis-knowledge-20260909/k3-clippings/`：`README.md`、`package.json`、`src/store.js`、`test/clippings.test.js`、`data/entries.jsonl`、`data/sample-export.txt`、`session2-only/export-2026-09-08.txt`、`docs/decisions/2026-08-20-append-only-jsonl.md`、`docs/tech-notes.md`、`docs/notes/2026-05-09-export-format-v1.md`、`docs/notes/2026-07-03-backup-cadence.md`

未触碰：第一步规格 `tests/evals/trellis-daily-20260909.json` 及其 fixtures 与结构检查、所有产品 Skills/hooks/adapters、`.ultra/` 状态、计划与研究文档、既有的未提交 Stage B 工作。
