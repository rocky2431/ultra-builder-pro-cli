# Stage A repair 3 — ZCode 移交（A-R5 约束来源 + A-R6 当前请求权威）

日期：2026-09-05。实现者：ZCode（本会话）。审查/提交：Codex。
基线：HEAD `2e3273bf` + repair 2 未提交改动（全部保留，未回退任何已闭合的
A-R1~A-R4）。本文件按任务要求用中文撰写。

## 一、诊断复核（先核对，再动手）

我沿 candidate2 B 的真实调用链重读了冻结证据
（`/tmp/ubp-owner-journeys-ynsz0724/candidate2-B-turn1.md`、
`candidate2-B-turn1-receipt.json` 的 `assistant_text`）：

- 输入第 3 行明确"authorized implementation plus non-destructive local
  verification"，第 11 行是当前 Owner 请求（按食材过滤）。
- B 实际加载了 ultra-change 入口，读取 change-contract、execution-grant、
  route-contract、Grilling、review_wait、Deliver；**没有**加载或读取
  Research `SKILL.md:174-183`（repair 2 已写入"缺失 North Star 采纳不暂停已授权
  工作"的那段）。
- B 的结论把新功能排在三道旧关口之后（接受旧 North Star 草案、重激活旧
  session-local Grant、收尾/归档批准），并且把"食材如何表示"这一真实产品问题
  也排在这些批准之后。

因此与任务判断一致：**缺陷入口在 Change/Grant/Route 这些被实际消费的共享
seam，而不在 Research**。repair 2 写在 Research 里的提醒方向正确但入口不在
那里；本轮把同一语义落到真实调用路径上，Research 一段保留不动。

A-R5 同样先取证：`candidate2-A/.ultra/specs/product.md` 第 126 行把
"plain file, no database, **no network I/O**" 整行标为 `owner-set`，而冻结
Owner 原话只有：单人、终端、先记录/查找、名字部分匹配、存储格式由 Agent
选择、不要数据库；第 110 行把 sync 等能力写成"与单人本地框架矛盾"（永久矛盾
表述，来源是 lens 03/04 的模型判断，不是 Owner 决定）。写入路径是 Research
lens 21/22 的 `Record` 段与 99-synthesis 的读回检查——这三处原来只要求
"state owner"，没有要求**归属真实来源**。

对两处诊断我均无异议，未发现需要反驳的误判。

## 二、改动内容（7 个文件，全部为最小文本合同修补，无脚本/无新机制）

### A-R6：当前显式请求自带执行授权，与旧 Grant 自动续行区分开

1. `skills/ultra-change/SKILL.md`
   - "Before you start" 第 1 条：保留原有"model-selected 需 live grant + 各
     explicit-entry 模式停回 Owner"原句（既有测试 pin 住），追加：**当前显式
     Owner 请求本身就是它所命名工作的那次 explicit owner invocation**；执行它
     不等待 grant 重激活、不等待早前 work package 的未完成 closeout——后者只
     按各自合同 gate 自己的 review/finalization/archive/effect 步骤。
   - 适用表下方新增一段：活动 Change 存在时到达的新请求，**路由**仍按该表
     （折入活动 Change 边界 / 两个 scope 无法共享一个边界时才让 Owner 选先收
     尾或放弃），但**执行授权来自请求本身**；旧 Grant 过期、North Star 未采纳、
     closeout 未完成只 gate 那些 closeout 步骤，绝不 gate 本请求的 intake、
     reconcile、实现，以及它真正留下的产品问题（例：新概念如何表示）。这些
     问题按自身价值、带推荐地提出；不排到旧工作批准之后。
2. `skills/ultra-change/references/execution-grant.md`
   - "What a grant is not" 新增一条：grant **不是当前显式 Owner 请求的授权
     来源**；它只治理 workflow 退出后模型发起的续行。即使早前 grant 已过期、
     早前 closeout 未完成，执行 Owner 刚刚请求的工作也不需要 grant 重激活。
     同时明确保留真边界：accepted-North Star 的正式评审准入、finalization、
     archive、external effects 仍按各自合同照常 gate。
3. `skills/ultra-status/references/route-contract.md`
   - Material checkpoints：点名该 delta 的当前显式 Owner 请求**就是**该
     checkpoint 要的 Owner 当前决定——不就被刚说出的请求再要一次确认；请求
     **未**点名的 delta（悄悄削减既有承诺、扩大效果、重排未触碰工作）仍回
     Owner。
   - Continuation：当前显式请求即 Owner entry，即使存在活动 Change、过期
     grant、未完成 closeout——那些是旧工作的旧义务，进 `Not done`、只在自身
     步骤被 gate，绝不是执行当前请求的前置条件。

### A-R5：规格写入路径的事实来源归属

4. `skills/ultra-research/references/21-features-scope.md`（能力边界/排除的
   写入者）：每个 boundary/exclusion/constraint 归属真实来源——owner-stated
   （附 Owner 原话）、code-observed、或本轮选择；模型选定的技术默认与"当前
   不实现"按原样记录，**绝不记成 Owner 约束**；排除理由写明实际性质（Owner
   决定 / 当前范围选择 / 延后），不把当前范围选择升格为与产品框架的永久矛盾。
5. `skills/ultra-research/references/22-success-metrics.md`（outcomes/
   guardrails 表的写入者，即 `owner-set` 那行的产生地）：仅 Owner 真说过才记
   `owner-set`，授权范围内自选的默认记 model-owned；把技术默认升格为
   owner-set 是**虚假记录**，改归属是来源修正，不是新的 Owner 审批，也不为
   已定居的技术选择开新的接受问题。
6. `skills/ultra-research/references/99-synthesis.md`（读回检查）：Validate
   清单加一条——boundary/exclusion/guardrail/measurement 读回时核对真实来源；
   归属错误是"去修正"而非"升级成 closeout 阻断"，也绝不重新提交为新的
   技术选择审批。

### 测试

7. `tests/route-contract.test.cjs` 新增 2 个测试（+94 行断言载体）：
   - "a current explicit owner request carries its own execution authority
     distinct from grant continuation"——pin 上述 A-R6 三处语义，同时 pin
     真边界（North Star 评审准入/finalization/archive/effects 仍 gated），
     并反向断言没有新增 current-request registry/counter/gate、没有
     `stop all work`。
   - "specification boundaries, exclusions, and guardrails keep their true
     source"——pin lens 21/22/synthesis 三处归属规则，反向断言没有
     fact-sources/attribution-registry 之类机械机制。

未改动：`review_wait.py` 的 accepted North Star 准入检查（任务明令保留）；
Grilling/Research SKILL 正文（repair 2 已含"自然接受复用、显式答案复用、
missing acceptance 不 blanket stop"，本轮测试继续 pin 住这些）；所有 hooks
与 delegate 表面；Kimi 的 `eval-isolation/` 与一切被评测样例。

## 三、验证证据（本机实际运行）

| 命令 | 结果 |
|---|---|
| `TMPDIR=/tmp node --test tests/route-contract.test.cjs` | 12/12（repair 2 的 10 + 本轮 2） |
| `TMPDIR=/tmp node --test tests/v026-contract.test.cjs tests/north-star-v2.test.cjs tests/skill-authoring.test.cjs` | 158/158 |
| `TMPDIR=/tmp node --test --test-concurrency=1 adapters/_shared/tests/*.test.cjs tests/*.test.cjs` | **724/724 全绿**（repair 2 为 722，+2 来自本轮；串行规避 repair 2 handover 记录的 delegate 并发 flake） |
| `TMPDIR=/tmp/ubp-stagea-repair3 npm run test:hooks`（隔离 TMPDIR） | **pytest 104/104** |
| `TMPDIR=/tmp npm audit --omit=dev --audit-level=high` | 0 漏洞 |
| 官方 `quick_validate.py`（`~/.codex/skills/.system/skill-creator`） | ultra-change、ultra-status、ultra-research 均 "Skill is valid!"（本轮仅这三个 Skill 变更；四个 reference 非独立 Skill） |
| `TMPDIR=/tmp npm pack --dry-run --json` | 142 entries（与 repair 1/2 持平）；`work/`、`tests/**`、`.ultra/` 均不在包内；改动过的 skill references 在包内 |
| `git diff --check` | 干净 |
| `bin/install.js --all --global --doctor` | **未运行**（真实 HOME 效果，沿用 repair 2 的任务边界） |

既有失败/限制均未被抹除：本轮全绿不改变 review-delta-2 记录的 A-R7 真实
HOME 事故及前状态未知、B2/B3 `abandoned_after_turn1`、旧 A 伪造采纳、六 Host
只读 Doctor degraded 等历史事实。

## 四、剩余限制与如实披露

1. **本轮是合同文本修补 + 结构回归，未跑新的真实 provider 旅程。** 语义修复
   是否足以让下一个真实 candidate 在"活动 Change + 过期 grant + 未采纳 North
   Star"下直接执行当前请求，需 Codex 冻结后按计划跑独立真实评测（且在 Kimi
   的隔离验证通过之后）。我没有伪造或预填任何评测结果。
2. **"自然接受复用"沿用 repair 2 的既有语义**（Grilling/Research 的
   plain-language acceptance、同候选不二次批准），本轮只把它与
   21/22/synthesis 的来源归属拼起来；candidate2 A 已正确复用 scope 自然接受
   （「继续，把它做完。」），剩余错的是 `owner-set` 归属，本轮已从写入路径
   修复。
3. **A-R8（P2）未动**：标签/分组 probe 的 missing_necessary_decisions 记录
   仍留给 Owner 决定，未自动修复。
4. **一个语义张力点，供 Codex 裁决而非我擅改**：当新请求折入活动 Change 后，
   新任务的**正式任务评审**在 North Star 未采纳时仍会被
   `review_wait.py:914-917` 挡住（这是任务要求保留的真边界）。我的合同措辞
   是"实现与产品问题前进，正式评审/收尾步骤保持 gated 并如实报告"——与
   Research repair 2 的"missing acceptance 不是 blanket stop"一致，但意味着
   旅程后半段若 Owner 始终不采纳 North Star，产品可用与流程收尾会继续分离。
   我认为这是正确语义（收尾关口真实存在，不得伪造采纳来解锁），不是缺陷；
   真实评测若显示模型因此再次拒答产品问题，才需要回到 Owner 重新定夺。
5. 本轮未触碰 Stage B 及以后、未改项目 canonical North Star、未编辑 Codex 的
   authority/task-state/review 文件；无 commit/push/发布/依赖安装/嵌套 agent/
   危险 HOME 负面测试。

## 五、移交

候选即当前工作树（HEAD `2e3273bf` + repair 2 + 本轮 7 文件）。建议 Codex：
冻结安装清单 → 核对 Kimi 隔离验证 → 跑独立真实 provider 旅程（重点观察
B 类旅程：新功能请求在旧 Change/旧 grant/未采纳 North Star 下是否直接执行、
`owner-set` 归属是否真实、正式收尾关口是否仍被如实保留）→ 通过后统一由
Codex 创建详细 commit。
