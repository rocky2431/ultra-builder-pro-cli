# Ultra Builder Pro 工厂交付状态

状态：**Owner 于 2026-09-09 接受八步计划并恢复全部实施，要求每部分验收后 commit、更新文档留证。步骤 1 已完成定位与验收，步骤 2 正在实施；全部尚未完成。Stage A 已验收并提交 `b765b55`；Stage B 待复验与资格；C/D/E 未实施或验收。**

## 八步计划当前执行

授权：`.ultra/decisions/2026-09-09-eight-step-implementation.md`。计划：`thinking/trellis-direction-20260908/RESULT.md`，接受时 SHA-256 `b92929fe3ec3122a4ac8349e3d58fd54b7aeb47306f534c633eddad1c5715b35`。原暂停已被 Owner 明确覆盖；不再因旧暂停停止当前范围内工作。

| 步骤 | 当前状态 | 验收与提交 |
|---|---|---|
| 1 行为基线与真实缺口 | done | 三类五次真实调用、独立验收与原始证据齐备；见 step1-acceptance.zh-CN.md，提交中 |
| 2 自然语言与相称工作路径 | in_progress | 实际 Claude `729580a7e0bb4a4cabbffaac8f356eee` 在独立工作树修复 F2 未进入入口的路径；已有正确行为不重写 |
| 3 上下文与知识往返 | pending | 须证明后续任务实际应用，并处理过时/无关材料 |
| 4 日常完整体验 | pending | 新项目、连续迭代、显式恢复与隔离安装件的独立验收 |
| 5 合格委派与首条工厂 | pending | 先接受 B，再完成 C / R2 Step 1 |
| 6 可运营工厂 | pending | 原 D / R2 Step 2 全部退出条件 |
| 7 跨会话持续运行 | pending | 原 E 耐久部分，Primary 与 Supervisor 结束后真实恢复 |
| 8 经评测的策略改进 | pending | baseline/held-out、Owner promote/reject、rollback-ready |

每个部分独立验收并 commit；Codex 协调和验收，实际 CC/Kimi/ZCode 写实现和测试。执行证据写入 `work/trellis-eight-step-20260909/`，当前状态只在本文维护。原 Stage B 未提交修改保留且不混入前四步的提交。新方向不改变 C/D/E 原验收条件，也不代表未知候选已获晋升。

步骤1已完成：三类五次 native Claude 调用，精确安装/来源、原始回合、产物和独立检查均在 `work/trellis-eight-step-20260909/step1-acceptance.zh-CN.md` 及其证据索引。F1修复6/6、F3前后9/9→12/12；F2有可用功能但漏问实质用途，且五次均没有进入Ultra Skill。因此首项修复是自然语言入口，不是重做Stage A或全量增加上下文。Root隔离完整检查738 Node/104 Hook/audit0；前置runner/yaml修复已commit `ca228b0`。原作者timeout、r1、Node/Python环境错误与所有失败仍保留。预留模型试跑尚未开始。

步骤2当前作者：`729580a7e0bb4a4cabbffaac8f356eee`，actual Claude，session `trellis-step2-entry-20260909`，2400s；独立checkout与临时禁用作者Hindsight的配置见 `step2-author-checkout.json`（base ca228b0，无Stage B及新评测资料）。任务书与开发证据在该checkout `work/step2-entry/`。只给开发案例，不给预留材料；工作树共享同一memory bank，所以仅改目录名不足隔离，已用支持的HINDSIGHT_CONFIG临时disabled配置并核对wrapper继承环境。Root负责最终冻结、隔离安装与预留验收，作者不运行评测provider、不commit、不改真实HOME。

## 目标与完成条件

完整落地 `docs/wip/owner-factory-debate-20260905/final-plan.zh-CN.md`（SHA-256 `25242b914e74958725c6780b548be5e1cb3b9632f40984c1088e50eae86b0db9`）与 `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` 的完整目标，并按新接受的八步计划累积实现。体验整改、现有 agent-delegation/ACPX 复用、D1 正向资格、R2 Step 1/2/3 的真实运行与恢复、自进化候选评测均须完成。测试、报告、回执不代替实际产品闭环。2026-09-08 的暂停和三轮讨论是历史；2026-09-09 Owner 已明确接受计划并恢复实施。八步计划原文保持接受时字节，后续执行进度以本记录及新授权为准。

## 角色、授权与约束

- 实现及测试由实际 ZCode、Kimi 或 CC 写；Codex 只协调、审查、运行既有验证、写 Owner/证据文档并统一 commit。同一路径一名 writer。
- 当前完整授权见 `.ultra/decisions/2026-09-05-owner-factory-implementation.md`；Stage B 派发边界见 `.ultra/decisions/2026-09-06-stage-b-implementation-scope.md`。旧 research-only、旧修复轮数耗尽和未授权 commit 的记录已被当前 Owner 指令覆盖，旧失败事实仍有效。
- 不 push、发布、部署、替换真实 HOME 安装/binary、修改凭据或生产数据；保留其他 checkout 的独立工作。允许当前既有 provider/auth 读取、计费调用与原生会话缓存。
- C/D/E 不引入语义 daemon/database；模型拥有分解、路由、集成与完成判断。当前全面实施授权不等于对未知持久策略候选的提前晋升。E 的具体候选须先完成 baseline/held-out/rollback-ready，再取得 Owner 的 promote/reject 决定。
- shell 使用 RTK；English code/tests/comments/Skills/commits，中文 Owner 文档。每个接受阶段由 Codex 详细 Conventional Commit，无 AI co-author。

## 已完成：Stage A

- 基线 commit `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`；阶段 commit `b765b55cca0e1eaacebc738a68de77906bb50756`，分支 `codex/owner-factory-delivery-20260905`。
- 验收 `work/owner-factory-implementation-20260905/stage-a-final-acceptance.zh-CN.md`；独立 release 729 Node +104 Hook，六处 Skill 验证、pack142/diff 通过；真实 HOME Doctor 为既有 degraded，未安装。
- 接受范围：体验机制整改及有辅助反馈恢复。原 A/B 超时、错误来源和覆盖失败仍保留；不声称所有原始无辅助旅程可靠、继承样例 Change 全闭合或全部工厂完成。
- B 反馈实际 ZCode `38526cb9e0af4a1ea29e65db0c95fd06` success552.348s；Root40/40+15实际检查通过。原 15+10 tests、旧证据/Owner/ledger 保留。两项 P2 如实保留，不自动重开 A。
- 所有 Stage A writer/样例回合已经结束。1550files/96,690,265bytes 原始归档索引：`work/owner-factory-implementation-20260905/stage-a-journey-evidence-index.json`；结论和历史见 `docs/evals/owner-journey-eval-2026-09-05.md` 及该 work 目录的 reviews/observations。原本的长状态流水已在阶段 Git 历史和这些证据中保留，不在当前状态重复。

## 当前：Stage B

- Stage B 尚未接受或提交。Runtime Task1 已 completed；Host qualification Task2 仍 in_progress；旧 aggregate 三个 P1 尚未经过新的 aggregate disposition。
- 协议修复及更早的 ZCode、Kimi 实现回合和原生 Review lenses 已结束；r1 反例后的三个独立修复任务均已结束；两个后续任务也已结束，最新接续见“下一步”。Root 不写实现和测试；曾有 Review lens 编写 5 个临时内存探针越过作者分工，已叫停、向 Owner 披露并排除为验收依据。实现/提交测试仍由实际 ZCode、Kimi 编写。
- 协议修复实际 ZCode `cc0b2147488e48ff8a84192ab4f03a38` success/end_turn1307.582s，0 errors；最终 public entry SHA f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd。实际观察 v1 后才提交 prompt；session/new 可能已经发生，auth 未观察版本保持 null。
- Root 独立 105/105 委派检查、agent-delegation 58/58 全套通过；最终 verify:release 737 Node +104 Hook/audit0 通过133.639s，172源前后不变，raw SHA cce32146954c41a2fd5fe5e4221b2a471d0eb3448245be5d880a3276afcabeb5；pack142/Skill/diff 通过。只读 HOME Doctor 既有 degraded，无安装。
- 两个新完整失败仍保留：Root 证据归档未列inventory且嵌套目录已仅调整记录/存储；review-wait 一个 status:null 根因未确认，同断言定向及最后默认并发全套通过，不说无害。作者 observation 时间与真实调用不符，不用作 freshness。详见 `work/owner-factory-implementation-20260905/stage-b-protocol-version-root-review.zh-CN.md`。
- 新严格 Task1 Review `vnext-d1-runtime-stage-b-protocol-delta-review-20260906` 为 APPROVE，P0=0/P1=0/P2=3；SUMMARY SHA702e50fd4f7329c3eb00da7e586c9fd73911373650abe3390a30e7d2042e440f，直接父级为协议错误失败 Review c98b0af…，两个同根 P1 已 disposition。Task1 v2 SHA61b076aa5d9541511cc8b8c3587ff726280cf765fc97b1117eaf3c85c40bf6ac，projection、context及 ledger completion回读通过。Task1 acceptance SHA5d8cda45…未变。
- 独立工作树 `/tmp/ubp-factory-stage-b-l7dd0y3s/`：agent-delegation已接到独立0.4.0/772929d（installer冲突已由实际作者解决并经Root70项复验），Goal基于独立2.15.4/b477722，bridge基于42fe149且旧原checkout脏不动。关联源尚未commit/合入原checkout；原checkout可能并发推进，合入前重核。最新只读核对：agent-delegation原checkout仍772929d且clean；Goal原checkout仍b477722但正有独立大量未提交改动（含skills/ultra-goal→ultragoal重命名），绝不覆盖或直接合入其活跃文件；隔离工作树保留已审查版本，待该独立提交后再适配。备份stash保留。当前PATH委派0.4.0，由独立任务更新；本任务未安装。
- Goal实际Kimi八路径修改经Root源码及最终447检查（446pass/1Windows-only skip），8源前后未变；官方Skill validator旧/新均拒绝既有when_to_use，不自动改兼容字段。验收与完整演进证据在stage-b-goal-acceptance.zh-CN.md、stage-b-goal-2.15.4-*，不把图文档修正当自动工厂已运行。
- 原负向资格 `d1q-61ca5157911e4f61866cff5452bc942d` 原attempt SHA87b71b64…及receipt SHA936c7794…原样保留；wrong-version原始反例和所有先前失败/纠正都保留在任务 evidence、work/evidence 和各 mission/receipt/review 中。

## 下一步

真实 r1 `d1q02-r1-20260905t220538-5d954643` 已消费/terminal，135.809s；native Bash ls 无permission却完成，D1Q-02失败。两份旧/新负向不可变receipt并存，新SHA04c53544528b7f35c38fbaf6ef6f3666ecc1c9d4b936024e7825467fb1f6846e，GLM-5.2/session原始tool投影及完整输入/版本均保留。原 r1 source在work/.../evidence/stage-b-r1-source/。

r1后的三个实际作者都已结束：ZCode a24ce801… success1437.417s/0errors；Kimi17b86b5… success1368.518s/410tool-scope errors（0protocol）；Kimi installer b653c69… success723.213s/216tool-scope errors（0protocol）。精确terminals/SHAs在stage-b-post-r1-dispatch.json。Root独立复验installer0.4.0整合70/70pass，81.8895s，6源稳定；入口f734不变。尚未commit/安装。

Root拒绝ZCode r2无条件删除Bash的修复：损害合法工具且不能满足真实attempt-and-denial；未进行r2真实资格，作者源已保留于work/.../evidence/stage-b-r2-rejected-source/。一致性审查支持在原功能/观察强度不变时显式替换Host。已记录 .ultra/decisions/2026-09-06-stage-b-selected-host-delta.md，旧D1Q-02失败历史保留；新D1Q-02R2要求同强度独立具名验证，任何新Host尚未qualified。Kimi0.41.0前查证实publicSDK deny-all固定拒绝client Write，未进行Kimi资格；已显式把下一候选改为现有CC managed adapter0.75.1/native SDK0.3.257/native2.1.261。D1Q-02R2 Acceptance SHA为999f4e7bb49e848377b40a1be4acdc3c7bbb7ac12c9c2f79b1ce4f511be4e8ef；CC尚未prepare/qualified。源码证据与旧runtime0.70更正在stage-b-kimi-native-capability-preflight.zh-CN.md。

上一轮两个实际作者已结束：Kimi `6f427666c99c4a86804642a1c49f7d8f` timeout1804.95s、无end_turn；已有8源/交接，Root已确认wrapper46848/native46987不在。ZCode `e2ee0fa454a84eb4875baeb2f610d674` success/end_turn1424.286s、0errors，恢复exact r1 patch，修正kit歧义观察。Root独立4套件126/126、0skip、39.614s，15源不变，日志SHA06cd6109655da1edc7c8ccd93f3f641f5bb4aa5b95459918d0619b3d1c3cfddd。全套758中Task Review缺正文是Root记录错误，已补真实in_progress正文，原断言定向1/1通过，未改测试。补充Codex源码审查因账户额度失败、没有最终通过结论，不计作验收。

已激活实际ZCode Claude路径任务书stage-b-zcode-claude-path-mission.md：独占相关UBP/既有kit源码，2400s有限执行；复用现有registry、native permissions.ask和共享入口，不替换已安装runtime，不做真实资格调用。首轮28122586…取消205.634s/exit130，无end_turn且原因未知；Root确认22075/22215不在、15源未改。已由独立实际ZCode `10f28c0195a64f44aed7bc5fd0776065` 于2026-09-05T23:53:09Z接续，同2400s范围，记录stage-b-claude-path-dispatch.json。官方native settings worktree/local差异补查见stage-b-claude-native-settings-root-review.zh-CN.md。Stage B仍未接受。

Claude初版实际ZCode10f28…已success/end_turn1483.512s。Root独立129/129、0skip、43.921s、10源稳定，但REQUEST_CHANGES：native defaultMode字段层级错误；native/adapter选择与spec.env重新读registry可分离；生产资格还缺native policy/Claude SDK必要输入消费。已激活stage-b-zcode-claude-repair-mission.md，1800s单writer，实际dispatch `4c7065bddd2b45cf9d65e5e6b486f2b2` 于2026-09-06T00:21:46Z开始，记录stage-b-claude-repair-dispatch.json。尚未真实Claude资格，未commit。

共享UBP审查找出三项P1：native runtime启动前未复核；conformance实际caller可绕过optional绑定；symlink entry令所哈希SDK与Node实际加载SDK不一致。已给Kimi同一个共享边界修复mission，不新增引擎。独立旧双文件检查104pass/1fail/1skip，唯一失败是已拒绝r2 patch与r1profile SHA暂不一致；不要改断言掩盖，ZCode恢复r1后复验。详细证据stage-b-admission-root-source-review.zh-CN.md、stage-b-r2-shell-kit-root-review.zh-CN.md。实际positive观察及consumer同步后才做Task2 strictReview→v2/readback→aggregate→Test/Deliver真实consumer→Root Stage B commits，之后继续C/D/E。

只读准备：实际Kimi `26a858dddfec405a9e79f648b990ab16` 于2026-09-06T00:02:27Z、900s核查旧wake预查的进程父子关系论证及clientId回显限制，已success/end_turn697.920s，输出stage-c-wake-preflight-challenge.zh-CN.md并经Root追加采纳边界；纠正进程父级拒绝和echo=一次语义应用的过强论断，消费后失败不能撤销已确认消费。未启动C代码、Provider/Primary session或app-server，不影响ZCode唯一实现writer。

## 后续 C/D/E（必须继续）

- C/Step1：有限RunSlice、至少两个实际Worker重叠、W1+真实qualifiedW2、0 Primary idle model polling；真实失败→修复→当前集成E2E→freshReview→delivery_ready，与公平Solo比较。
- D/Step2：至少两个taskshapes/两个qualifiedProfiles重复；multiwave与worktrees、W3丢失/重复/sessiondeath、正确Solo选择、可量化且重复的适用任务收益。
- E/Step3：Primary及Supervisor均结束后的freshW4；durableGrant expiry/revoke/invalidation/dedupe/fencing/machine-loss；candidate→baseline/held-out→Owner明确promote/reject→rollback-ready。
- 具体消费者与不得过度搭建的边界见 `work/owner-factory-implementation-20260905/stage-cde-runtime-seams-preflight.zh-CN.md`。已有研究三轮及 wake API 只读预查不重做；API存在和clientId回显不是真实生命周期/至多一次证明。

## 不要重做或误报

Stage A及三轮研究已完成；不要重新跑原 A1/B/C 旅程。不要复活旧审批暂停，不以新状态覆盖历史失败。不要把当前 Goal 修正文档和绿色测试说成工厂运行时已完成，也不要在 Stage B 通过前启动 C/D/E 代码。
