# Stage A repair 4 交接 — Claude Code

2026-09-05。写入者：Claude Code（本轮唯一实现/测试写入者）。授权：`.ultra/decisions/2026-09-05-owner-factory-implementation.md` §「Owner 当前完整实施授权」。
未提交、未推送、未安装、未改凭据、未调嵌套 agent、未重跑 owner journeys、未自证 Stage A 通过。

---

## 0. Followup 修正（2026-09-05，第二次调用）

### 0.1 我上一轮的 §5.4 是错的，已收回

上一轮 §5.4 原话：「其中『必须有 validated `SUMMARY.json`』是自洽可执行的（**不依赖任何缺失基线**）」。
**这句话不成立。** 原文保留在下方 §5.4 未删，此处是它的收回与更正。

实证（我本轮亲自核对源码，不是复述评审意见）：

- `skills/ultra-review/scripts/review_wait.py:855` `validate_packet_admission()` 是 Review 的唯一准入
  边界；其函数体内**从头到尾没有出现过 `mode`**（本轮新测试用切片 + `doesNotMatch(/\bmode\b/)`
  机械钉住这一点）。
- 该函数 `:900-917` 无条件读取 `.ultra/north-star.md`，送进 canonical validator，并要求报告
  `status == "accepted"`；否则返回
  `canonical North Star validator report must describe an accepted v2 authority`。
- `plan` 在 `:46` `REVIEW_MODES` 与 `:1649` 的 packet 校验中都是合法 mode，**但准入分支不给它任何豁免**。

结论：North Star 未验收时，plan-mode Review **根本不可能被准入**，`SUMMARY.json` 也就不可能存在。
于是 `ultra-plan/SKILL.md` 那句无条件的 `Require a validated current SUMMARY.json` 是一个
**被复现的假前置**——repair 4 新建的 open-closeout 分支到这里就断了，已授权的产品工作仍然交不到 Dev。

### 0.2 本轮改动（3 个文件）

| 路径 | 改动 |
|---|---|
| `skills/ultra-plan/SKILL.md`（Verify the plan 段尾） | 把单路径改成**两条路径** |
| `skills/ultra-research/references/north-star-v2.md`（`Revision boundary` 段） | 修正「Publish those answered bytes」的措辞 |
| `tests/route-contract.test.cjs` | 改钉两条路径 + 真实准入依赖；改钉新的采纳措辞 |

**`ultra-plan` 的两条路径**（正式 Review 准入契约、schema、validator 一字未动）：

- **可准入**：照旧 `Require a validated current SUMMARY.json`，照旧解决全部 blocking finding。
- **不可准入**：把 `review_wait.py` 返回的**那句 typed 准入错误原文**写进 `## Unresolved Decisions`
  与 Route Card 的 `Not done`；**不得**书写／声称／推定一份准入没产出的 `SUMMARY.json`；自己按同一套
  plan-mode 尺度审查计划文件，结果写进计划自己的章节——**不新建第二份 review artifact / schema /
  verdict**。这条不可准入**gate 的是需要它的 canonical closeout，不是这次 handoff**：North Star 验收后
  仍必须对本 Change 真跑一次 plan-mode Review，在那之前义务挂着，而不是挡住当前授权已覆盖的实现。

**`north-star-v2.md` 措辞修正**：原句「Publish those answered bytes」字面上不可能成立——转正为 canonical
accepted 文件必然改写 draft/status/acceptance-source 元数据。改为：发布**被答复候选的决策内容**，验收元
数据变化**不构成新候选**；答复后仅**执行 Owner 已明确说过的决定**（含据此修候选自身矛盾）属于**更正**，
要**援引那条确切决定作为依据并说明改了什么**，而不是把被展示文本记成未修改、也不是替一个模型本就自有
的技术选择再造一次批准；**只有决定了实质新内容**才构成新候选、走 step 3 取自己的验收。同时明写：不要求
为纠正来源归属再取一次 Owner 决定。五个记录字段与 parser **一字未改**（既有断言仍钉住）。

### 0.3 测试改法

按要求**不再用孤立字符串宣称调用链完整**：新测试直接读 `review_wait.py`，切出
`validate_packet_admission` 函数体，钉住 (a) `REVIEW_MODES` 含 `plan`、(b) 函数体含那句 accepted-v2
错误、(c) 函数体**不含** `mode`——即准入依赖本身。再钉 `ultra-plan` 的两条路径各自的句子，并
`doesNotMatch` 第二套 review 协议（`PLAN-SUMMARY.json` / `ultra-review-plan-*` / `provisional review`）。
未新增 test 数（726 不变），只在既有两个 test 内替换/追加断言；无断言被削弱或跳过。

### 0.4 本轮命令与结果（原始日志见 `.ultra/.runtime/owner-factory-implementation-20260905/`）

```
TMPDIR=/tmp node --test tests/route-contract.test.cjs
  → tests 14 / pass 14 / fail 0                    …-followup-focused.log

TMPDIR=/tmp node --test tests/skill-authoring.test.cjs tests/route-contract.test.cjs \
  tests/north-star-v2.test.cjs tests/owner-journeys-eval.test.cjs \
  tests/ultra-5-journeys.test.cjs tests/v026-contract.test.cjs
  → tests 182 / pass 182 / fail 0                  …-followup-skills.log

TMPDIR=/tmp npm run verify:release   exit=0        …-followup-verify-release.log
  → test:node  tests 726 / pass 726 / fail 0 (duration_ms 148465.757875)
  → test:hooks 104 passed in 45.06s
  → npm audit --omit=dev --audit-level=high: found 0 vulnerabilities

TMPDIR=/tmp npm pack --dry-run --json  exit=0      …-followup-pack.log
  → 5.0.2, 142 files, unpackedSize 1483321
  → ultra-plan/SKILL.md 12129 / north-star-v2.md 10323 / route-contract.md 9831（均在包内）

git diff --stat -- skills tests                    …-followup-diffstat.log
  → 18 files changed, 729 insertions(+), 93 deletions(-)（含 repair 1–4 既有改动）
  → 本轮三文件：393 insertions(+), 12 deletions(-)

node bin/install.js --all --global --doctor --json  exit=2   …-followup-doctor.log
  → 六个 host 全 degraded；claude 的 issues 是 PROVENANCE_MISSING / PLUGIN_MANIFEST_MISSING /
    SKILL_MISSING×14 —— 即本机从未安装，与本轮改动无关；安装未获授权，故不修。
```

Skill 官方校验：本仓库对已改 Skill 的系统校验器是 `tests/skill-authoring.test.cjs`（结构/frontmatter）
加各自的契约测试，均已在上面跑绿。本机 `~/.claude/skills/` 下**没有** Skill Creator 校验器可调用，
故未跑该项——这是可用性事实，不是跳过。

### 0.5 本轮残余

- 仍是**纯提示词改动**：仓库测试证明契约文本在位、两条路径互不矛盾、且与真实准入依赖一致，
  **不能**证明宿主模型运行时一定照此行动。
- 未碰 `ultra-review` 的准入契约/schema/validator/runtime，未碰 hooks/adapters/依赖，未提交、未安装。
- 上一轮 §5.5（`execution-grant.md:100-105`）与 A-R7 仍开，本轮未处理。

---

## 1. 根因

### A-R6：共享原则有承诺、无可执行分支

`route-contract.md`（repair 3 加入）已经写明「当前显式 Owner 请求本身就是 Owner entry，旧的
grant/closeout 只 gate 它们自己的步骤」，`ultra-research/SKILL.md:174-177` 也承诺「缺少 North Star
验收不暂停已授权工作」。但**下游三个实际消费者从未接上这条原则**：

| 位置 | 旧文本效果 |
|---|---|
| `ultra-change/SKILL.md`（交接段） | `Invoke neither without a covering grant` — 无 grant 就到不了 Plan |
| `ultra-plan/SKILL.md:24-31` | 入口硬要求 grant，且 `intent must be accepted` + `North Star Trace current` 才能分解 |
| `ultra-plan/SKILL.md:143-146` | 交给 Dev 只认 `valid grant` |
| `ultra-dev/SKILL.md:26 / 44-50 / 247` | 入口只认 grant；缺 ID/revision/digest 一律 `stop before editing`；续行只认 grant |

于是「缺基线」这个**本该被公开挂起的收尾义务**，被当成了**执行前置条件**：一个 North Star 还是
draft 的项目，任何当前 Owner 请求都无法走到真实的 Plan/Dev。原则层没有给出「挂着继续干」的可执行
形态，各消费者只能保守 stop——这正是 wrong_refusal 的制造机制。

### A-R5：归属规则的判定单位是「条目」，而失败发生在「分句」

`21-features-scope.md:15-21`、`ultra-research/SKILL.md:180-183`、`99-synthesis.md:17-23` 三处规则都
成立，但它们只回答「**这一条**约束是不是模型默认」。A3 的 HC-2 是一条**混合条目**：`无多用户` 确实
出自 Owner 原话，`无网络`/`无账号`/`数据文件在本机` 是模型默认，四者捆在同一句 Owner 引用下。
按整条判定，规则给不出裁决；同一份文件里 HC-4 却做对了（把 Owner 的「别用数据库」与模型的「格式
你定→JSON 单文件」拆成两处标注）。所以缺口不是「有没有规则」，而是**规则的判定粒度**，且它缺在
**实际书写 `Authority or evidence` 的那个模板处**，而不在三段远端告诫里。

同源第二处：决策记录声称「未提出任何修订」，而转正字节与被展示候选存在决策性差异（NS-1 匹配面）。
既有五字段里 `Revision boundary` 只被定义为「未来修订不继承」，没有承担「这次验收覆盖的是**哪一份**
候选」，于是「答复后又改稿」在记录层无法被表述为不实。

## 2. 确切改动路径

产品提示词（6 个文件）：

| 路径 | 改动 |
|---|---|
| `skills/ultra-status/references/route-contract.md` | 新增 `### Open closeout obligations`：给共享原则一个可执行分支（唯一定义处） |
| `skills/ultra-plan/SKILL.md` | 入口 1（grant 非唯一授权源）、入口 2（分解的诚实分支）、验证 4（无已验收 revision ≠ 停）、交给 Dev 的授权来源 |
| `skills/ultra-dev/SKILL.md` | 入口 1、入口 4（stale trace 分流：真冲突才停）、结尾续行授权来源 |
| `skills/ultra-change/SKILL.md` | 交给 Plan 的授权来源 |
| `skills/ultra-research/references/north-star-v2.md` | HC 条目**逐句归属**规则；step 3 定义「被展示的候选」；`Revision boundary` 承载被答复候选的身份 |
| `skills/ultra-research/references/99-synthesis.md` | 采纳读回改为 clause-by-clause（改写既有 bullet，未新增 bullet） |

测试（1 个文件，仅追加）：`tests/route-contract.test.cjs` +2 个 test，+~100 行。

**未改**：`21-features-scope.md`、`22-success-metrics.md`、`ultra-research/SKILL.md`、
`execution-grant.md`、`change-contract.md`、任何 runtime/validator/schema/adapter/hook/依赖、
`.ultra` 权威、冻结证据、评测项目。repair 1–3 与 CC 三处测试竞态修复全部保留。

## 3. 可观察行为变化

**A-R6（最小公共路径）**：三个消费者不再各自加例外，而是共同引用 route-contract 里**一处**新定义。

- 缺失/未验收 North Star、无法解析的 trace、过期 grant、未完成的正式 Review = **open closeout
  obligation**。它只 gate 产生它的那一步（验收/完成声明、任务收尾、finalization、archive、外部效果），
  其余时间挂在 `Not done` / `Gap` 里，当前请求覆盖的分解、实现、验证照常进行。
- Plan 入口：当前 Owner 请求即授权时可分解，缺的东西写进 `## Unresolved Decisions` 与 `Not done`，
  并明写 **不得把 intent 或 North Star 标成 accepted 来过关**。
- Dev 入口 4：由「一律 stop」改为**分流**——本任务的改动会违反**确实已被 Owner 验收**的约束才 stop
  并回 `ultra-change` 调和；否则把未解析 trace 作为公开义务带着走，实现当前授权覆盖的工作。
- 两条反向边保留：真冲突/削减既有承诺仍是 material checkpoint；**durable 授权不得从文件推断**
  （记录的 grant、旧任务、归档 Change、存档引语都是 inactive data）。
- 独立 Review 未被绕过：Plan 的 plan-mode Review（`SUMMARY.json`）与 Dev 的任务级 Review 原样保留，
  新测试显式钉住这两句。

**A-R5**：

- `north-star-v2.md` 的 HC 模板处新增「Attribution is per clause, not per entry」：`owner-stated`
  只能保留被引原话真正说了的内容，其余分句各自成条并标 `model-owned`；并说明后果是「谁有权改它」
  而不只是「这条是否生效」——这正是把模型默认误升为 Owner 硬约束会制造 wrong_refusal 的原因。
- `99-synthesis.md` 的采纳读回相应改成逐句核对（**改写**原 bullet 后半句，未在三段正确文字后再挂
  一条告诫）。
- `Revision boundary` 现在承载被答复候选的 path + byte identity；答复后的决策性改稿（**包括**修候选
  自身内部矛盾那种）构成新候选，走 step 3 展示 delta 并取得它自己的验收，而不是把改后字节记成
  「未修订」。同时明写：**不要求**对未改动候选二次批准、**不新增** validator 字段、**不要求**候选内联
  复现——链接式展示仍然合法（这是对我上一轮报告中「链接即未展示」推论的收回，Codex 的反驳成立）。

### 为什么这一处改动能真正关掉这个复发失败

判定单位从「条目」下沉到「分句」，把一个需要语义权衡的问题（这条约束算谁的）变成一个逐句可核对的
机械动作（这句原话说了吗？没说就另起一条标 model-owned）。而且它落在写入者实际填 `Authority or
evidence` 的模板旁，不是三段远端告诫之一——A3 当时在同一份文件里对 HC-3/HC-4 已经标对了，说明它
不缺「规则意识」，缺的是**在下笔那一刻的判定粒度**。同理 `Revision boundary` 把「'继续'算不算验收」
这个语气判断，替换成「已发布字节 == 被答复字节」这个可复跑事实——它挡不住语气误读（我明确它不能
做什么），但把本案唯一被机械证据钉死的失败面关上了，且零新增门禁。

## 4. 命令与结果

```
TMPDIR=/tmp node --test tests/route-contract.test.cjs tests/north-star-v2.test.cjs tests/owner-journeys-eval.test.cjs
  → tests 67 / pass 67 / fail 0

TMPDIR=/tmp npm run verify:release
  → test:node  tests 726 / pass 726 / fail 0  (duration_ms 103032.879)
  → test:hooks 104 passed in 47.66s
  → npm audit --omit=dev --audit-level=high: found 0 vulnerabilities

TMPDIR=/tmp npm pack --dry-run --json
  → ultra-builder-pro-cli 5.0.2, 142 files, unpackedSize 1482068
  → 六个改动文件全部在包内（route-contract.md 9831 / north-star-v2.md 9874 /
     99-synthesis.md 3691 / plan 11325 / dev 18945 / change 11667）

git diff --stat -- skills tests
  → 18 files changed, 677 insertions(+), 90 deletions(-)（含 repair 1–3 与竞态修复的既有改动）
  → 本轮新增：skills 6 个文件 + tests/route-contract.test.cjs
```

基线 724 Node → 726 Node（+2 个新 test），104 Hook 不变。无既有断言被削弱或跳过。

新增两个 test：
- `an open closeout obligation keeps current owner-authorized work executable through Plan and Dev`
- `the North Star record binds the answered candidate and splits compound constraint sources`

覆盖要求的六个场景：普通语境验收/复用已明确答案（沿用原有 test 251/297，未改）、新/改稿未验收候选
保持诚实、模型技术默认保持 model-owned、当前有界请求在旧/缺失正式收尾下仍能到真实 Plan/Dev 且不伪造
canonical 验收、真冲突仍需调和、durable 授权不得从文件推断。另含反向断言：无 provisional workflow
state、无新增权威存储路径、无 bypass 关键词、决策记录五字段一字未改（断言其原文唯一出现一次）。

## 5. 残余限制

1. **未做真实 provider 资格验证**。本轮只有结构性 prompt 检查与仓库测试；这些**不能**替代实机评测。
   冻结最终候选由 Codex 独立评估——我不自证 Stage A、不重跑 owner journeys。
2. **未跑 `node bin/install.js --all --global --doctor --json`**。它属于安装面，本次任务明确禁止
   installation；`--doctor` 是否完全只读我未核实，故未执行。该项由 Codex 在提交/打包关口自行决定。
3. **A-R7（真实评测隔离缺口）不在本轮范围**，未处理，仍开。
4. **（已被 §0.1 收回，原文保留）Plan 的 plan-mode Review 未放宽**。A-R6 把 `Plan:137-146` 整体列为断链，但其中「必须有
   validated `SUMMARY.json`」是自洽可执行的（不依赖任何缺失基线），且它已有 Stalled 出口；删掉它属于
   削减既有承诺，是 material checkpoint，我未擅自做。本轮只修了同段里真正不可执行的那半句（只认
   grant 才能交给 Dev）。若 Owner/Codex 认为小型有界工作也不该先过一轮 plan Review，那是一个独立的
   承诺削减决定，需要单独授权。
5. **`execution-grant.md:100-105` 的 “stale trace 立即停” 未改**。grant continuation 是模型自发续行，
   在那里保守是正确的；本轮的诚实分支只覆盖「当前 Owner 请求」这条授权路径。若后续发现它同样制造
   wrong_refusal，再单独提。
6. **纯提示词改动**。语义遵守由宿主模型承担，仓库测试只能证明契约文本在位与互不矛盾，不能证明运行时
   一定按此行动。
7. 未写任何 `.ultra/.runtime/` 日志：证据即上述命令输出，全部记在本文件，不另造一份副本。
