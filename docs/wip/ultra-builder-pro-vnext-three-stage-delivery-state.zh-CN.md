# Ultra Builder Pro 工厂交付状态

状态：**全部八步继续实施；Codex独占实现和测试，Pi仅作QA或实际样例执行者。步骤1–4日常开发闭环完成并分段提交；原Pi测试删除失败保留，candidate3新恢复与任务切换经独立QA通过。Stage B待资格，C/D/E尚未开始，全部八步尚未完成。**

## 最新作者分工

最新明确分工：全部八步继续；Codex独占代码、测试及全部实现修改，并逐步验收、commit、更新文档。允许Pi或其他Agent参与委派试验及独立QA，QA只验证并报告，修复仍由Codex负责。具体原话见`.ultra/decisions/2026-09-09-root-independent-implementation.md`追加澄清。

Owner澄清“换成pi”指当前验证阶段，不是移交后续实现。Codex先前扩大为八步实现任务的派发已撤回，Pi及其测试子进程均已停止；HEAD仍为6663a24，运行记录只包含读取、检查与诊断日志，没有产品实现修改或commit。后续实现分工不因这次Pi验证请求而改变。原错误任务书标记WITHDRAWN并只作诊断留存。

Owner 最新明确要求“接下来不用交给claude实现了 全部你自己来独立完成”。以 `.ultra/decisions/2026-09-09-root-independent-implementation.md` 为准：Codex 亲自完成后续实现与测试，不再委派实现。原Claude入口任务已cancelled/native cancelled；已有部分改动保留，由Codex检查后接着完成。下文旧分工及任务描述均为历史，不能覆盖新指令。全部八步与分段提交仍继续。

## 当前 Pi 增量（2026-09-09）

第五步现已恢复。当前组合源的完整检查为799 Node/104 Hook/audit0、pack通过；HOME只读doctor仍为既有degraded。修复了一处把真实工作区全部未提交验收材料作为输入、触发256文件物理上限的测试：复用既有隔离项目fixture，保留全部原断言，未改变产品快照上限。详情见`work/trellis-eight-step-20260909/step5-digest-isolation-acceptance.zh-CN.md`。此修复不代表Stage B验收或任何Host已qualified。

Owner再次明确委派试验/QA沿用Pi，Codex独占实现。实际Pi只读QA已成功（openai-codex/gpt-5.6-luna，71.366s），确认原生`tool_call`支持执行前阻断、现有Ultra尚缺消费接线；精确结论及限制见`step5-pi-capability-qa.zh-CN.md`。PATH中的旧agent-delegate registry无Pi目标，不代表Pi原生不可用。OpenCode临时诊断因token-refresh 401结束，无允许写入、无残留进程；已按Owner纠正停止该分支，不将诊断算资格。第五步仍须保留合法能力与逐项真实拒绝观察，之后才进入C/D/E。

第二步提交`c0371d2`，失败产物归档修正`a29415a`；步骤1–4已完成，接着实施第五步。

Owner已明确授权补Pi原生公共入口和续接，见`work/trellis-eight-step-20260909/pi-entry-authorization.md`。六Host安装/委派资格保持原边界，Pi前台入口不代表Pi ACP qualified。candidate2：F1、F2用途与功能、D2通过；Root真实浏览器操作通过；764Node/104Hook/audit0及pack/Skill通过，HOME只读doctor既有degraded。

D4实际SIGINT后同会话续接完成，但删除了一条原有回归测试；原始+新测试独立合跑51项通过不替代保留断言要求。Root拒绝独立QA对D4的误判PASS，旧产物与失败完整保留。candidate3补普通工作收尾差异核对，冻结后独立另选日期更正请求；真实中断/同会话续接、28项检查、全部原方法保持及独立操作通过。另补最终Pi D3三轮切换、26/17检查及独立操作通过。第4步现已验收，完整八步尚未完成。详见`step4-acceptance.zh-CN.md`。

## 历史阻断与恢复点（2026-09-09）

独立QA：Pi仅验证的任务已success/end_turn，原生会话`01a08461-707b-7323-8681-493be3b2f793`，实际默认模型openai-codex/gpt-5.6-luna。25/35/21项样例检查与公共操作通过，未发现确定P0/P1；Root消费日志及hash检查。F2-res和D4仍BLOCKED，QA任务完成不等于第二/第四步完成。详见`work/trellis-eight-step-20260909/pi-step2-4-qa.zh-CN.md`。

已分段提交：`9c7817d` 为统一入口与原生续接实现及当前实跑证据；`3bbef76` 为第三步知识回写四环验收、fixture和证据。最终隔离源码检查为761项Node测试、104项Hook测试、audit0；pack与Skill校验已通过，真实HOME doctor的既有degraded状态仍保留。提交没有改变第二、第四步的待验收状态。

Claude 已实际返回429周额度耗尽，提示2026-09-13 01:00 Asia/Shanghai恢复；不再反复调用，不购买或切换凭据。F2-res在candidate5下目标已正确进入会话，但无法执行；D4-r2在真实中断后同UUID续接中被额度打断。所有进程已结束，现场与准确命令保留在step2-4-current-evidence-index及其trial。

candidate5仅修正原生可变参数吞掉prompt：在prompt前加入`--`。确切触发为最后的`--allowedTools <tools...>`，native `--plugin-dir` 是单值；未证明无透传参数的默认命令同样会吞目标。11项窄测试通过，最终完整检查与pack单独留证。新代码是已完成的实现单元，提交不代表第二/第四步整体验收通过。第五至八步未开始；额度恢复后续接D4-r2及F2-res，不能宣称八步已完成。

## 历史实测（candidate4，2026-09-09）

Codex 完成统一 `ubp run`、原生 continue/resume 和信号退出处理；冻结候选见 `work/trellis-eight-step-20260909/step2-candidate4.json`。精确源 742 Node / 104 Hook / audit0、pack 与两处 Skill 校验通过，尚未集成或提交为步骤2完成。

公共入口实跑：F1工作副本首次修复5/5，原生resume追加ASCII兼容约束后仍5/5；K3两次新会话已完成四环，首轮维护既有tech-notes，第二轮读回并独立核对最终4/2/1共7条，原库存与断言保持。证据暂存于candidate4记录的trial_root。

F2批处理运行虽实际调用正确ultra-init，仍先构建后问个人数据来源，漏问实质用途，不接受。观察到原生print无AskUserQuestion，插件参考Read被workingDir权限拒绝，正用公共命令真实交互PTY区分运行方式与指令缺陷，未修改候选源。首个PTY因operator heredoc被stdin追加进prompt已中断并标invalid；第二个从文件runner启动，输入干净，逐次只批准被请求的插件参考只读访问。不得把交互诊断追认成原批处理通过。

最新作者可见性：Codex成为实现者之前已读旧预留材料，candidate4这些旧案例是确认而非盲测；未来步骤8继续保留真正未见集。五至八步仍须完成，当前不扩展到其运行。

## 八步计划当前执行

授权：`.ultra/decisions/2026-09-09-eight-step-implementation.md`。计划：`thinking/trellis-direction-20260908/RESULT.md`，接受时 SHA-256 `b92929fe3ec3122a4ac8349e3d58fd54b7aeb47306f534c633eddad1c5715b35`。原暂停已被 Owner 明确覆盖；不再因旧暂停停止当前范围内工作。

| 步骤 | 当前状态 | 验收与提交 |
|---|---|---|
| 1 行为基线与真实缺口 | done | 三类五次真实调用、独立验收与原始证据齐备；见 step1-acceptance.zh-CN.md，commit `47f7911` |
| 2 自然语言与相称工作路径 | done（Pi增量） | Pi candidate2真实用途澄清与产品交付、F1/D2及独立QA通过；原Claude429保留，见step2-acceptance |
| 3 上下文与知识往返 | done | candidate2及公共入口candidate4四环实证；保留现有机制，见step3-acceptance |
| 4 日常完整体验 | done（显式恢复范围） | 最终Pi D3、独立选择的新D4及QA通过；无半写/后台W4主张，见step4-acceptance |
| 5 合格委派与首条工厂 | pending | 先接受 B，再完成 C / R2 Step 1 |
| 6 可运营工厂 | pending | 原 D / R2 Step 2 全部退出条件 |
| 7 跨会话持续运行 | pending | 原 E 耐久部分，Primary 与 Supervisor 结束后真实恢复 |
| 8 经评测的策略改进 | pending | baseline/held-out、Owner promote/reject、rollback-ready |

每个部分独立验收并 commit；Codex亲自实现和编写测试，独立QA可委派；Pi等Agent只可作QA或实际委派试验参与者。执行证据写入 `work/trellis-eight-step-20260909/`，当前状态只在本文维护。原 Stage B 未提交修改保留且不混入前四步的提交。新方向不改变 C/D/E 原验收条件，也不代表未知候选已获晋升。

步骤1已完成：三类五次 native Claude 调用，精确安装/来源、原始回合、产物和独立检查均在 `work/trellis-eight-step-20260909/step1-acceptance.zh-CN.md` 及其证据索引。F1修复6/6、F3前后9/9→12/12；F2有可用功能但漏问实质用途，且五次均没有进入Ultra Skill。因此首项修复是自然语言入口，不是重做Stage A或全量增加上下文。Root隔离完整检查738 Node/104 Hook/audit0；前置runner/yaml修复已commit `ca228b0`。原作者timeout、r1、Node/Python环境错误与所有失败仍保留。预留模型试跑尚未开始。

步骤2作者首轮 `729580a7e0bb4a4cabbffaac8f356eee` 已 success/end_turn；独立checkout、作者进程 HINDSIGHT_CONFIG disabled 及任务书见 `step2-author-checkout.json` 与该checkout `work/step2-entry/`。Root冻结候选1（`step2-candidate1.json`），窄检查、两个Skill Creator验证、隔离Doctor与原生inline discovery均通过，但真实F2调用仍未调用Skill、未解决用途就实现并宣告完成。失败详见 `step2-candidate1-observation.json`，211.295s，list-rate $0.9001915；不接受为步骤2完成。原生Claude从基线2.1.263自动更新为2.1.266，此次不能作公平成本比较；已固定原生2.1.263在新目录复核同一冻结候选，保留两次观察。作者同会话修正 `de55ad81a15e448ab46c50d46efac993`（1800s），只接收开发反馈，预留样例未暴露、未运行。

步骤2第二轮正文审查另排队同会话 `75cf9c1a6fc1417e9a56d089bf97d180`（600s）：技术方法自主不能写成永不提问未知个人数据来源/范围外效果，需保留现有边界。第四步准备由原独立fixture作者实际Claude `ae6a8103059d4f33a59eb96aa92ff0cc`（session `trellis-step1-fixtures-20260909`，900s）只写 `step4-evaluation.zh-CN.md`，复用现有旅程补实际中断、任务切换与显式resume；不改候选、不运行provider、不另建框架。

固定2.1.263复核候选1已结束（411.341s，primary-only list-rate $1.2026095，另有未合并计价的nested CLI调用），同样零Skill调用、漏问用途且加入外部提取功能。最终回执暴露真实HOME安装与Vault测试写入；Root保留证据并撤回可验证的三个新路径，详见 `step2-evaluation-boundary-correction.zh-CN.md`、`step2-candidate1-pinned263-observation.json`。原“未见Vault写入”是检查不完整的错误陈述，已纠正。下一次模型实跑前须带已冻结的operator边界文本；旧运行不充当边界已告知的资格证据，也不与新边界运行混算公平成本。作者r2已完成；边界措辞修正75cf与去掉无依据语义/长度代理测试991f97387bd3423d96c2a30e8a6c473b依次续接，不能因静态新措辞测试绿宣称产品行为通过。

第三步Kimi评测作者187bf与修正da842均已success/end_turn（900.012s、593.233s）。r1三缺陷已保留原样后修正；Root两Node版本17/17通过。K3两次native真实调用已结束并独立检查通过，见 `step3-k3-observation.zh-CN.md/json`。四环完整：实际导出→维护现有tech-notes→全新session通过Bash读回→导入与核对正确，原库存与测试保留；不需要凭阶段名新增知识机制。candidate2的F2仍失败，metadata完整可见43条列表中仍未进入Skill；作者同会话新修正 `d3db4a3a7ac644a0bfc9f71a6b3f5724`（1200s）正在处理选择触发边界。当前没有任何预留模型试跑，Step4实际中断验收未运行。

Owner 已明确接受统一 Ultra 自然语言入口（例如 `ubp run`），内部流程由 Agent 决定，普通宿主聊天自动发现为尽力支持。精确问答与新边界见 `.ultra/decisions/2026-09-09-unified-ultra-entry.md`。不降低用途/交付判据、不把旧失败改判通过；后续冻结实际公共入口重新验收。实际Kimi诊断 fd0ba 已 success/end_turn421.335s；显式诊断先问用途，但只到brief与未提供个人数据来源，未交付产品。下一实现转向现有CLI的薄入口，停止descriptor迭代。实际Claude同作者会话 `2f264c631bcb4a3c803197aae6226fde`（1800s）已开始薄入口实现；独立fixture作者同会话 `077526b57e1a4a9d9b1a86b96c570451`（900s）只补新入口评测条件与F1可写副本，不改旧冻结样例/失败。

步骤2最新观察（2026-09-09 01:14 UTC）：candidate3冻结patch `e11fc674b391a786d7971dd1d154eba5eb785bb020d8855866df8399497e4a30` 后，F2仍零Skill调用、漏问用途；第三次descriptor修订未被接受。停止继续调措辞，独立实际Kimi只读诊断 `fd0ba4e0628048f8981bbaa60b480bce`（600s、禁用共享Hindsight）检查自然对话、显式选择与CLI入口合同，不读任何reserved材料。另启动显式 `/ultra-builder-pro:ultra-init` 诊断，只定位加载后的行为，改变过输入，绝不计入原F2自动入口验收。

F1/F3的开发路径在Step1已接受为无需修复，因此candidate3冻结后首次开展其reserved：F1-res首轮原cwd未改，模型遵从fixture README的“never repair in place”在另一临时副本修复5/5，等待是否回写；这是评测夹具说明泄漏引起的输入限制，不能算原cwd已修复。按冻结第二条消息原样续接中。F3-res首轮9/9，显式时区按天统计；第二阶段只复制项目文件到全新basename与session，正在运行。以上reserved从未发给候选作者；不能再说全部reserved尚未开始。D1–D4仍待最终候选。

第五步只读预检实际Claude `452722586ef14f6e91aac94fb765285e` 已 success/end_turn，见 `step5-readonly-preflight.zh-CN.md`。当前事实覆盖下文旧快照：agent-delegation原checkout已到0a81753且clean；Goal原checkout7210d3a/2.16.0已采用plugin-only布局，原Goal隔离工作树及分支不在，旧2.15.4验收不得直接算当前交付；Claude默认路径已到2.1.266，原候选2.1.261仍在，可按既有冻结选择显式绑定。StageB最新9源SHA与修复作者交接一致但尚无Root独立复验；旧run的state.json停running而result.json terminal且pid已不在，以结果为终态并保留状态缺陷。不提前运行资格或C/D/E；步骤1–4完成后重新适配已推进依赖，再消费原资格标准。这些技术适配在已有授权范围内，不新增Owner逐步审批。

后续只读恢复补查已定位 Goal 旧备份 Git 对象 ff9aa2a（并非源已不可恢复）；上游 ea2dfb0 已提交相应八路径 graph/review 修正，当前7210d3a保留 advisory 及相关测试。agent-delegation运行相关差异仅版本0.4.0→0.4.1，实际依赖未换。见 `step5-readonly-recovery-correction.zh-CN.md/json`；不重复实现，不借此算当前资格通过。入口决定与96文件诊断证据已commit `5c2031e`，不是Step2交付。

## 目标与完成条件

完整落地 `docs/wip/owner-factory-debate-20260905/final-plan.zh-CN.md`（SHA-256 `25242b914e74958725c6780b548be5e1cb3b9632f40984c1088e50eae86b0db9`）与 `docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md` 的完整目标，并按新接受的八步计划累积实现。体验整改、现有 agent-delegation/ACPX 复用、D1 正向资格、R2 Step 1/2/3 的真实运行与恢复、自进化候选评测均须完成。测试、报告、回执不代替实际产品闭环。2026-09-08 的暂停和三轮讨论是历史；2026-09-09 Owner 已明确接受计划并恢复实施。八步计划原文保持接受时字节，后续执行进度以本记录及新授权为准。

## 角色、授权与约束

- 最新Owner指令：Codex亲自完成全部实现及测试；允许独立QA与实际Agent试验。下文旧作者任务仅保留历史，不授权新的实现委派。同一路径一名writer。
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
