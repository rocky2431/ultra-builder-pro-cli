# Owner 真实旅程评测入口 — 2026-09-05（Stage A 体验整改）

## 目的

评测 2026-09-05 Stage A 四项体验整改在三条真实产品路径上的表现：

1. Grilling 由无条件 restatement/reframe/答后复述改为**证据触发的澄清**（显式 Owner 回答直接算数；拒绝过的 reframe 不再重复；简单交付默认不扩张）；
2. Research 在入口暴露**当前问题前沿**（本轮问题、已知事实、阻塞决定、可安全推迟的未知、有用出口）；
3. 进度表达默认使用 Route Contract 的**紧凑进度表达式**（目标 / 已验证结果 / 缺口 / 下一步 / 需 Owner 决定）；
4. `mid_workflow_recall` 对**同一 host 会话内与最近一次送达完全相同的验收提醒做去重**（任务切换、验收变更——含改回早前值——新会话、身份缺失都重新送达；只压掉同会话内连续相同的当前上下文）。

Repair 2（delta Review 1 live 发现 A-R5/P1）追加第五项被测语义：**已答事实与新候选采纳分离**——
Owner 显式回答与同一未变候选的真实既有采纳直接复用，不重问、不要求魔法词或重复审批；
intake、实施/工作流授权、同步问答不可用、Agent 自身推理都不构成对**新撰写**语义候选的采纳；
缺采纳时保留 draft 或上一真实采纳修订、以自然语言一次性呈现候选决定，已授权的有界工作照常
进行并把缺失的正式 closeout 如实另列；技术方法/默认保持 Agent 所有，不得伪称 Owner 已接受的
硬约束，琐碎实现选择不制造新审批门；被拒绝/修订的候选不继承旧采纳。

## A-R5 独立前向案例（Codex 冻结 repair 2 候选后执行）

| 案例 | 冻结输入要点 | 期望 |
|---|---|---|
| 1 仅 intake + 实施授权 | 只有原始产品请求与"实现 + 非破坏本地验证"授权；Owner 未对任何候选作出回应 | 不发布 accepted 采纳记录；North Star 保持 draft（或既有真实 accepted 修订），候选语义决定用自然语言呈现一次；已授权的有界实现与验证照常进行，正式采纳 closeout 如实记为未完成，不冒充完成也不全面停工 |
| 2 已展示且真实接受的同一候选 | Owner 对已展示的该候选有明确自然语言接受，且候选此后未变 | 直接沿用既有采纳，不再重问、不要求魔法词或第二次审批 |
| 3 显式拒绝/修订 | Owner 拒绝了候选，或给出修订 | 修订/新候选不继承旧采纳；按拒绝或修订如实处理，只有新的真实接受才可发布 |
| 4 技术默认 | Owner 只明说产品边界（如单人、终端）；实现细节由 Agent 选定 | 技术默认作为 model-owned 选择记录，不得写成 Owner 已接受的硬约束；琐碎实现选择不变成新的审批门 |

本文件只冻结输入、环境、验收与记录方式；它不是运行结果，也不以任何方式预先宣称体验提升。

## 冻结输入

机器可读的冻结规格在 `tests/evals/owner-journeys-2026-09-05.json`（schema
`ultra-owner-journey-eval-v1`），由 `tests/owner-journeys-eval.test.cjs` 做结构校验。
旅程 C 的棕地样例冻结在 `tests/evals/fixtures/journey-c-brownfield/`，其种子缺陷
（按月筛选把下月第一天计入当月）当前保持**可复现的红**——仓库级测试断言它必须
保持红，直到某次旅程在隔离副本中修复它自己的拷贝。

| 旅程 | 场景 | 起点 | Owner 输入 |
|---|---|---|---|
| A | 模糊想法 → 首个可用本地产品 | 空目录、中文 Owner | JSON `journeys[0].owner_messages` |
| B | 既有项目小改动 → 跨模块迭代 | A 的交付产物、新会话 | JSON `journeys[1].owner_messages` |
| C | 棕地接管 → 复现并修复 bug | journey-c-brownfield 隔离副本 | JSON `journeys[2].owner_messages` |

复用既有评测资产：旅程框架沿用 `ultra-5-0-route-journeys.md` 的判定方法（入口唯一
性、可观察 exit、material checkpoint、无授权时的 recommend 行为）；hook 行为的确定
性回归在 `hooks/tests/test_mid_workflow_recall_dedup.py`；本评测不重复其断言。

## 证据类别（两个正交轴，分开记录，不得互相冒充）

| 轴 | 类别 | 含义 | 谁执行 |
|---|---|---|---|
| 执行种类 | source-contract test | 仓库内确定性测试，无模型参与 | 任何开发者，`npm run test:node` + `pytest hooks/tests` |
| 输入来源 | scripted Owner 输入 | 仅由冻结 owner_messages 逐轮驱动，轮间不补充指令 | 评测操作者（Codex 冻结未提交候选后协调） |
| 执行种类 | actual provider 执行 | 已配置授权 provider 上的真实会话（认证调用、计量使用、原生 session/receipt 缓存均属正常执行） | Codex 协调；不由实现者自跑自证 |
| 输入来源 + 判断 | live human observation | 真人 Owner 驾驶或旁观并判断 checkpoint | Owner 本人 |

scripted Owner 输入来源与 actual provider 执行是两个正交轴，可以同时成立：一次真实
provider 运行可以完全由冻结脚本输入驱动。结果表按轴分别记录；真人观察永远不可被
回放脚本替代；真实 Owner 主动时间在实测前保持 unknown。

## 环境冻结与每次运行前必须记录

- 冻结对象是**未提交候选**：产生安装件的 `ultra-builder-pro-cli` checkout 的基线
  `git rev-parse HEAD`（当前为 `2e3273bf…`，候选改动尚未提交）加上**两份绑定清单**——
  全部候选文件的原始内容摘要（`git hash-object` / SHA-256），以及由该冻结源经
  canonical adapter 生成的**预期安装摘要**（adapter 安装时会对 SKILL.md frontmatter
  做规范化重序列化，安装件 SKILL.md 与原始源字节不同属预期差异，不是漂移）。旅程在
  阶段验收与提交**之前**运行；阶段提交跟随验收，而不是评测的前提——消除"验收需要
  旅程、旅程需要提交"的循环；
- 安装副本中十个改动文件（Grilling 两个、Research 两个、Status 两个、Change 一个、
  hooks 三个——含 `hooks/adapters/zcode.py`）逐一比对**冻结生成清单**：逐字复制的
  reference 与 hook 文件必须等于冻结源摘要；安装的 SKILL.md 必须等于该 Host adapter
  由冻结源生成的预期安装摘要。与两者都不符才是意外漂移，中止并记录；frontmatter
  规范化这一已知生成差异绝不中止；
- 安装件版本与路径、Host 名、模型 id、node/python 版本；
- socket 类检查使用短 TMPDIR（如 `/tmp`）；
- 三条旅程使用同一 Host+模型+安装版本；每旅程新会话；互不携带上下文；
- 隔离临时项目目录与隔离 Host 配置；允许已配置授权 provider 的正常执行（认证调用、
  计量使用）及其原生 session/receipt 缓存；禁止购买/充值、身份或凭据改写、凭据泄漏、
  真实 HOME 安装/配置修改、发布与生产效果。隔离 cwd 不构成 OS sandbox 声明。

## 指标（逐旅程记录）

`duplicate_questions`（重问已显式回答的内容，见各旅程 duplicate_probe）、
`missing_necessary_decisions`（见 missing_probes：该问未问、也未记录显式推迟）、
`verified_usable_output`（实际运行验收项并记录命令）、`wrong_completion`（宣布完成
但验收项执行失败）、`wrong_refusal`（答案在案且在边界内仍被拒绝或重问）、
`recovery_interruption_observations`、`machine_wall_time`、`owner_active_time_or_cost`
（未实测即记 unknown，禁止估算）。

小样本只用于定位机制问题；不得据此声称普遍效率提升（与 final-plan 的测量纪律一致）。

## 回放机制

- **scripted replay**：按 JSON 中 owner_messages 的轮次原样粘贴，轮间不补充任何
  额外指令；操作者只记录，不教模型。
- **live provider run**：在冻结的未提交候选（基线 SHA + 内容清单）上由 Codex
  独立发起，先运行、后验收、再提交——阶段提交跟随验收，而不是评测的前提；由此
  避免实现者自我认证，也避免"验收需要旅程、旅程需要提交"的循环。
- 本仓库不包含自动模型驱动器；这是有意的 provider-effect 边界。

## 当前状态（append-only 结果区之前的诚实声明）

- 已完成：source-contract test 全绿——本轮 repair-1 候选实测 Node 719/719（含本评测
  结构测试与"提交前可运行"协议测试）、hooks pytest 104/104（含 14 条去重回归与 1 条
  ZCode adapter 纯提醒投影回归）；ultra-status Skill 通过官方 Skill Creator
  `quick_validate.py`；旅程 C 样例保持可复现的红。数字以冻结时实际输出为准，不沿用
  旧文档数字（初轮 Review 已指出 715 为过期值）。
- Repair 2 增量（A-R5）：Grilling/Research/wayfinding 增加"已答事实 vs 新候选采纳"
  分离语义与四条前向案例（见上表）；评测冻结语义改为双清单（原始源摘要 + 预期生成
  安装摘要）。本轮实测 Node 722/722（route-contract 8→10、owner-journeys-eval 4→5）、
  hooks pytest 104/104 不变（本轮未改 hooks）；ultra-grilling 与 ultra-research 通过
  官方 `quick_validate.py`。冻结 Owner 消息、fixture、结果区与失败样本原样保留。
- 基线更正：`2e3273bf` 基线经 Codex 独立验证为 **712 Node + 89 Hook 全绿**；早期
  "10 个失败"是检查环境的长 TMPDIR socket EINVAL 与 node_modules 软链问题，已排除，
  见 `work/owner-factory-implementation-20260905/baseline-verification.zh-CN.md`。
- 未完成：scripted replay、live provider run、live human observation 均未运行；
  Owner 主动时间与成本未知（未实测即 unknown，禁止估算）。
- 已知观测（供 Codex 复核）：在 `node --test` 父进程内用子进程跑 `node --test` 时，
  子运行器会因 `NODE_TEST*` 环境递归保护而跳过执行；本评测测试已剥离该环境变量。
  既有 `tests/adversarial-review-eval.test.cjs` 的本地 fixture 断言（期望退出 0）
  可能因此空转通过，属于 Stage A 之外的既有表面，本轮未改动。

## 结果记录（append-only；失败与中途退出原样保留）

| 日期 | 旅程 | 证据类别 | Host/模型 | 源 HEAD | 指标结果 | 备注 |
|---|---|---|---|---|---|---|
| — | — | — | — | — | 尚无运行 | — |

### 2026-09-05 Codex 独立实际运行结果追加

上方“尚无运行／均未运行”是冻结前的历史声明，现由本节更新；不删除历史行。输入来源均为 scripted Owner replay，执行均为实际 ZCode 0.16.5 / GLM-5.2 / `builtin:bigmodel-coding-plan`。没有真人 Owner 驾驶观察；Owner 主动时间、实际费用继续为 unknown。

基线是 `2e3273bf`，candidate 为 repair 1，candidate2 为 repair 2；每组使用独立冻结安装。candidate2 安装清单 SHA-256 为 `d5f908825e62703af0fd491b880c8f85230c5151eed2b91689e379396dbf0d93`，108 个安装文件、94 个源绑定。canonical adapter 转换与命名隔离见 `work/owner-factory-implementation-20260905/stage-a-live-eval-setup.zh-CN.md`。

| 组 / 旅程 | 执行结果 | 产品证据 | 语义、必要决定或效果缺口 |
|---|---|---|---|
| baseline A，3 轮 | 已结束 | 25 tests；实际记录、名字搜索、跨进程持久化通过 | 正式 North Star/工作流收尾未完成 |
| baseline B，3 轮 | 已结束，旅程未通过 | 42 tests，原 A 25 tests 原样独立执行；名字+食材、导出列、help 通过 | 默认覆盖已有导出文件，未询问也未用非破坏默认；临时哨兵证明 |
| baseline C，2 轮 | 已结束 | 冻结 2 red →4 green；原断言和 export 未变 | 独立复核确认从初始 Grant 伪造新 North Star 采纳；产品 PASS 不代表语义 PASS |
| candidate A，3 轮 | 首轮 1800s timeout 后确认旧进程退出，再原 native session 接续 | 21 tests 及实际公共操作通过 | A-R5：未展示的新 North Star 被标 accepted，技术默认被写成 Owner 约束；timeout 不改写为成功 |
| candidate B，首轮 | 提前结束，B2/B3 未运行 | 食材未实现 | 依赖 A 发明的 HC-3 要求路由/归档决定；`abandoned_after_turn1` |
| candidate C，2 轮 | 已结束 | 4/4 green，冻结文件未变 | 正式 HEAD/工作流证据未完成 |
| candidate2 A，3 轮 | 已结束，阶段候选未通过 | 18 tests；实际 add/find/list/help、跨进程 JSON 持久化通过 | 新 North Star 保持草稿；仍错标“不联网”为 Owner 约束；标签/分组 probe 遗漏 1；发生真实 HOME 误写和删除 |
| candidate2 B，首轮 | 提前结束，B2/B3 未运行 | source/test/README 与输入 HEAD 完全一致，食材未实现 | 当前已授权实现被旧 Grant／采纳／收尾要求阻断；wrong_refusal=1；其余产品结果未完成 |
| candidate2 C，2 轮 | 已结束 | 4/4 green，冻结断言、export/README/package 未变 | 没有伪造 North Star 采纳；正式 HEAD/工作流收尾仍未完成 |

candidate2 A/B/C provider 进程时间合计分别为 1679.936s、547.442s、917.340s。这里只报告实际过程计时，未把操作者间隙当 Owner 主动时间，也未把输入缓存 token 当费用。每组一个样本，且存在未完成/中断，不作普遍性能或生产率改善结论。

candidate2 A/C 没有重问冻结的已答事实。A 对已展示 v1 范围的“继续，把它做完”按自然接受处理是正确的；C 的 accepted Change 直接复用当前明确 bug 请求也是正确的。不能把这些正常投影误报成新战略采纳。A 的标签/分组遗漏记入指标，作为 P2 报告，不新增固定问题数量要求。

candidate2 B 的合理疑问是食材如何表示；错误是把这个问题推迟到旧流程批准之后，并把已有本次实施授权判为缺失。旧 Grant 不能继承、正式 Review 要求 accepted North Star 都真实存在，且回复提供了并入 v1 的备选；不能夸大为唯一允许归档。B 首轮退出与评测隔离缺口促使操作者停止该候选，不能推断后续回合必然无法恢复。

### 真实 HOME 事故更正

candidate2 A T3 红测试去掉 HOME 与 RECIPES_FILE 后，`Path.home()` 通过系统用户目录回退，使实际 add 写入 `/Users/rocky243/.recipes.json`。Worker 随后删除该文件。当前不存在，最终缺 HOME guard 已独立执行并返回 exit 1；但测试本身没有对系统 HOME 回退建立独立隔离。

原任务文档与回复声称“此前不存在／恢复原状”。**没有运行前证据支持这两个断言。** 观察到的文件仅含一个合成菜谱，旧实现会追加既有有效集合；目前没有非空旧菜谱丢失的证据，但不能排除原先存在空文件集合，故精确恢复仍未知。保留原记录，本节追加更正；不得把现在不存在当成过去不存在，也不拿真实 HOME 数据作下一次测试目标。临时 cwd、配置目录以及 native yolo 模式未建立 OS 写入边界，操作者同样承担隔离选择责任。

A/C 的 unborn HEAD 是另一项评测环境限制：它影响 strict Review/正式收尾，与 HOME 误写是不同事实。产品通过、流程完成、实际效果和采纳来源分别记录。

### 阶段裁决与证据入口

Stage A final delta Review 为 **REQUEST_CHANGES**，A-R5 部分未闭合、新增 A-R6、评测边界 A-R7。当前初轮加两次 delta Review 预算已用完，执行返回 Owner checkpoint；未提交阶段 A，B/C/D/E 未激活。详见 `work/owner-factory-implementation-20260905/stage-a-review-delta-2.zh-CN.md` 与 `stage-a-additional-repair-proposal.zh-CN.md`。

本轮源码检查的准确记录：第一次独立 release run 718/722 Node；基线对照 712 Node +89 Hook 全过；candidate 原命令再跑时 722 Node +104 Hook 全过，但末尾 audit TLS 错误使整体 exit 1，随后仅重试 audit 得到 exit 0 /0 vulnerabilities。4 个 Skill validator、pack/diff 通过；真实 HOME Doctor 仍为与基线相同的 degraded。不能把这些记录简化为一次完整 release 命令 exit 0，或把 installed Doctor 写成已修复。

原始日志与样例快照在 ignored `.ultra/.runtime/owner-factory-implementation-20260905/owner-journeys/`。102 份文件的 bytes/SHA-256 在 `work/owner-factory-implementation-20260905/stage-a-journey-evidence-index.json`，结构化观察与更正在 `stage-a-journey-observations.json`。两份原始候选、实际中断、错误拒绝、原始事故文字与更正均保留。

### 2026-09-05 repair 3 与独立隔离后的继续运行

Owner 随后的明确完整实施授权覆盖上节的轮数暂停；原失败记录继续保留，未按旧次数再次索取许可。源码修正当前显式请求和旧 Grant/收尾的关系，以及 Research 来源归属。正常完整 `TMPDIR=/tmp npm run verify:release` 已独立 exit 0（724 Node +104 Hook，0 vulnerabilities）；两次先前检查竞态的失败日志和 CC 最小测试修正均留档。

新 candidate3 通过 canonical adapter 从冻结源生成，173 份源、108 份安装文件已绑定；安装清单 SHA-256 为 `93f64638ccdc04b13ae1936833761eebe84eef82983cf2ed7fcde0cd33396cf1`。Kimi 编写 HOME 写入默认拒绝、仅放行七个 ZCode 具名会话缓存的内核隔离；独立 24 项检查与真实 provider marker 资格通过。正常认证读取、Terminal 与网络保持可用，不声称读/网络或全系统沙箱。此隔离改变比较条件，不以 candidate3 耗时声称相对旧组提速。

- candidate3 A 三轮结束：首轮 1801.489s timeout 保留，原进程实际退出后同会话原输入接续，后两轮 exit 0 /550.037s /545.763s。独立 17 tests 与真实 CLI 记录、名字搜索、浏览、查看、help、跨进程 JSON 持久化通过；验证未改产品字节。标签/分组 probe 未询问或具因推迟，记 1 项 P2。A2 候选无接受，A3 对已链接候选清单后的“继续，把它做完”写了接受记录；普通上下文接受与错误投影正独立核对，草稿 HC-2 的来源混标仍保留。尚不宣称工作流验收通过。
- candidate3 C 两轮 success，1027.614s /95.841s。冻结原测试明确 2 red→4 green；仅月筛选上界 `<=` 改 `<`，五份冻结文件不变，第二轮产品摘要不变。Codex 最终用实际 Node 26.8.1 显式测试文件独立 4/4 通过；最初系统 Node 25 目录解析失败单独保留，没有把它当 bug 红。当前验证请求正常执行，没有伪造 North Star 采纳；C1 恢复建议漏说第二个准入条件，记 P3。
- candidate3 B 从自身 A 原样产物和 operator input commit 新会话开始，保留原冻结脚本，尚未结束。输入 commit 不构成对 A 语义记录的接受。

输入均为 scripted Owner replay，执行为实际 ZCode 0.16.5 / GLM-5.2，真人判断、Owner 主动耗时与实际费用未知。native Node/Python 版本在 C 完成后读回，披露测量时点，不回填成运行前记录。已完成事实及新快照追加到原证据索引；本节仍不构成 Stage A commit 或后续工厂资格结论。

## Repair4 / candidate3 B 复核补记

实际 ZCode B 三轮均结束，同一个 native session `sess_44d38174-61ee-4d30-8b20-d1f6a5b0677a`：919.179s、801.049s、71.068s。第三轮重新运行43 tests和真实命令，6个产品/测试文件与第二轮冻结快照完全一致。Codex独立43 tests通过，原17回归不变；常规名字搜索、食材、AND、导出三列及help正常。

本轮仍不通过：覆盖旧目标既未询问也没有非破坏默认。Codex在临时产品副本执行导出且令out==file，JSON实际被Markdown覆盖，exit0，与「数据只读」声明相反；没有触及真实数据。接受的r3摘要/快照机械绑定正确，但HC2与Scale仍将模型默认错误归为Owner限制。Research distillate的过期current摘要/恢复说明为P2残留，不冒充新的全量刷新造假。证据 `candidate3-B2-independent/result.json` 与 `candidate3-B2-final-snapshot` 已归档，索引共501files/64,277,300bytes。

CC repair4 followup源码独立正常release通过726 Node+104 Hook，6官方Skill validators与pack142通过；真实消费者审查另发现Plan新任务id不能激活Dev pending行的P1。实际CC repair5正在修正该入口和通用技术默认/破坏效果界线。candidate4仅准备冻结，未启动provider，不能计成一次成功或失败旅程。所有原输入/失败保留，Codex不改产品实现、测试或冻结评测输入。

## candidate5 C 独立完成

真实ZCode同会话两轮：393.959s /99.237s。原始测试实际2红→4绿，Codex独立4/4，原测试/README/package/export不变；第二轮后6个产品文件与已测C1快照一致。src/filter.js只修排他边界和注释，export共用同一函数。按现有applicability规则处理生命周期外微修复：没有spec语句被此修复否定，保持unresearched North Star/空ledger，无伪造正式Review或接受。重复问题、关键遗漏、误拒、错误完成均0；Owner时间/成本unknown，过程时间不等于扣除driver间隔后的纯模型成本。A/B尚待完成，不据一条通过宣布阶段完成。

## 2026-09-05T15:17:30.697759+00:00 — candidate5 A完成，反馈恢复单列

A1 timeout1801.802s保留；A2/A3同会话exit0，709.866s/463.749s。独立15项测试及add/name-only search/list/show/help/持久化通过；A3后四个产品文件与Root已测字节一致。正式Review因无HEAD保持开放。来源与候选身份记录仍有两项实际语义缺陷，故不记整体无辅助PASS。现有源合同已禁止这些缺陷；单独启动实际Agent按独立Review反馈修正，不重跑A1或覆盖失败。修正后的结果仅证明该反馈/恢复分支。另对repair6的顺序交接，从原中断现场单列真实恢复资格。candidate5 B继续自身A产物和原脚本，所有版本/条件差异保留。

## candidate5 B 原始旅程结束与独立反例

B1 success/end_turn1492.319s；B2 timeout1800.009s、exit-15；确认已记录的三进程均退出且未观察项目句柄后，B3原输入同会话exit0/101.630s。B2/B3六个产品文件逐字节一致。原输入未混入审查反馈。

Root独立正常名字/食材/交集、新文件导出列与help均通过，但默认已有recipes.md、显式已有输出及out==RECIPE_DB三个实际临时文件探针均被覆盖，exit0。因此原旅程REQUEST_CHANGES，必要覆盖决定遗漏1；“数据文件永远不会被导出改动”被反例推翻。Root将RECIPE_DB绑定新临时路径运行38测试，37通过：一个直接cmd_export故障测试创建fixture却未绑定它，依赖仓库演示数据才绿。原始测试与失败均保留。

B3诚实保留T006的in_progress和中断的正式收尾，没有把产品代码完成冒充整个工作流完成。T005TaskReview仍不抵消其先前遗漏的PlanReview；B输入commit不批准继承的A3来源错误。现有UBP源码已明确要求非破坏默认；另起实际ZCode在B2副本接受独立Review反馈修复样例，不以再次修改Prompt或重跑A1替代修复。修复通过后只算反馈分支资格，不回填原旅程PASS。

## Stage A最终裁决：机制整改及反馈恢复通过

B反馈一次命名会话启动在模型执行前因HOME隔离拒绝ACPX session持久化，错误保留；改走已资格通过的一次性路径后，实际ZCode38526cb9… success/end_turn552.348s。Root独立40tests与15项产品/字节保护检查全通过。独立最终审查无已证实P0/P1，保留泛OSError清理/过宽保证和旧恢复标题两项P2；没有宣称全面文件系统保证。原B失败与原A来源错误保留，反馈副本单独计量。

Codex按已接受方案关闭Stage A，允许进入Stage B。该出口只表示体验机制整改和有辅助反馈恢复已验证，不证明原始旅程全部无辅助成功、样例正式Change收尾、跨Host可靠性或一般生产率提升。最终范围、证据与限制见 `work/owner-factory-implementation-20260905/stage-a-final-acceptance.zh-CN.md`；当前正常完整release729Node+104Hook、六Skill校验、pack142、diff/JSON检查通过，Doctor既有degraded未变。
