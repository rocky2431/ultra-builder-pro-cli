# Stage A repair 5 交接 — Claude Code

2026-09-05。写入者：Claude Code（本轮唯一实现/测试写入者）。授权：`.ultra/decisions/2026-09-05-owner-factory-implementation.md`
§「Owner 当前完整实施授权」。任务包：`work/owner-factory-implementation-20260905/stage-a-cc-repair-5.md`。

未提交、未推送、未安装、未改凭据、未嵌套委派、未重跑 owner journeys、未自证 Stage A 通过。
未碰 `.ultra` 权威状态、冻结源/安装器/评测器/真实 journey 输入与产物、评测项目、caller 回执、既往 Review 报告。

---

## 1. 两个缺陷的实证（我亲自核对源码，不是复述评审结论）

### 1.1 P1-A：Plan → Dev 在「新选中的 pending 任务」上仍然断链

改前的实际文本：

| 位置 | 原文效果 |
|---|---|
| `ultra-plan/SKILL.md:161-164` | 「Under covering authority for that exact task — the owner's current request…」允许由当前 Owner 请求授权转交，但**没说这个 exact task id 从哪来、以谁的名义传递** |
| `ultra-dev/SKILL.md:30-35` | `Without an exact task id in the owner invocation, select only the uniquely current in_progress task`；否则 `stop and ask the owner to invoke Dev naming one exact task id` |
| `ultra-dev/SKILL.md:62-64` | 激活分支只认 `When the owner invocation names a dependency-ready pending task` |
| `ultra-dev/SKILL.md:14-16` | 三个 mode 的 Entry 列都写 `Explicit task id`，未定义「谁的 explicit」 |

后果链条是可复现的：一次普通请求 → Plan 分解 → 新建的行全部是 `pending` → Dev 入口既没有
「owner invocation 里的 exact task id」（那个 id 是 Plan **在请求之后**才生成的，Owner 不可能预先说出），
也没有唯一 `in_progress` → 只能 `stop and ask the owner`。

Hook 侧确认它不会替 Dev 兜底（我读的是真实实现，不是提示词）：

- `hooks/_common.py:1184-1185` —「A `pending` row is a frontier candidate only: this selection
  never auto-activates it without the explicit invocation-local id.」
- `hooks/_common.py:1326-1329` —「No live task: `pending` rows stay frontier candidates. Hooks remain
  task-silent and progress-silent…」

同时 `hooks/_common.py:1171-1186` 的 `trusted_task_id` 在**生产路径上从未被传入**（全仓只有
`hooks/tests/test_v026_hooks.py:2685/2705/2711/2741/2766` 会传），所以本缺陷不需要任何 Hook 改动：
Dev 只要走它自己已有的 `pending → in_progress` 写入 + readback，Hook 立刻按「唯一 in_progress」正常选中。

另一个佐证：`docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md:477` 的既有契约表已经写着
「exact trusted invocation 指向一个 authorized pending task → **Dev/Plan 负责按 contract 激活并 readback**」。
也就是说「Plan 携带 id」本来就在权威文档里，缺的是两个 Skill 提示词没有把它写成可执行分支。

### 1.2 P1-B：真实冻结 B2 把「破坏性覆盖导出目标」当成技术默认

实证（只读，未改动这些冻结材料）：

- `/tmp/ubp-owner-journeys-ynsz0724/candidate3-B2-final-snapshot/.ultra/decisions/north-star-r3-acceptance.md:26-29`
  在 `Agency boundary`（「具体形态为模型选定」）里列出：
  「默认输出 `./recipes-export.md`（--out 可覆盖）…**导出目标文件允许再生覆盖**（衍生工件语义；数据文件仍绝不覆写）」。
  即：把「替换用户已有文件」写成与命名、参数同级的模型自选项，**没有问过 Owner，也没有安全的独占创建默认**。
- `candidate3-B2-final-snapshot/recipe.py:241`：`with open(out_path, "w", encoding="utf-8") as f:` —— 无条件截断。
- Root 独立复跑 `/tmp/ubp-owner-journeys-ynsz0724/candidate3-B2-independent/result.json`：43 tests OK，其中
  `test_export_overwrites_existing_target`（「A-04：导出目标为衍生副本——再次导出替换内容」）**正面断言静默覆盖**。
  因此一条无害的临时命令 `export … --out <与 --file 相同的路径>` 会把 JSON 数据文件改写成 Markdown 并 exit 0，
  全部 43 个测试仍然绿。

这违反的是**已冻结的 missing-decision 探针**，与后续产品 bug 无关：模型确实拥有实现选择权，但它把
「怎么做」的授权当成了「可以替换用户既有数据」的授权。

我核对过现有 Grilling/Research/Change 规则里**没有**任何相关约束：
`ultra-grilling/SKILL.md`（问什么/不问什么）、`ultra-research/references/31-solution-strategy.md`、
`41-quality-risks.md`、`ultra-change/references/execution-grant.md:107-117`、
`ultra-think/references/autonomy-boundary.md` 全文均无「破坏性默认」一节。
唯一相邻的是 `route-contract.md` 的 Material checkpoints 第 7 条（外部/不可逆效果）和紧随其后那句
**「Naming, internal design, ordinary technical choices… remain model-owned」——这句正是被过度阅读的那句**。

---

## 2. 确切改动（4 个文件；无 runtime/Hook/adapter/validator/依赖改动）

| 路径 | 改动 |
|---|---|
| `skills/ultra-dev/SKILL.md` | mode 表 Entry 列 ×3、入口 2 的任务选择段、激活段首句 |
| `skills/ultra-plan/SKILL.md` | 交给 Dev 的收尾段（`Report the graph…` 之后追加 4 行） |
| `skills/ultra-status/references/route-contract.md` | Material checkpoints 段尾新增 1 段（破坏性默认，唯一定义处） |
| `tests/route-contract.test.cjs` | +2 个契约 test |
| `tests/delegate.test.cjs` | 1 处竞态修复（**越出本轮两条路线，见 §5.1，可由 Root 撤回**） |

### 2.1 P1-A 的三处一致改法

**`ultra-dev` mode 表**：`Explicit task id` → `One exact task id carried by this invocation`（三行同改），
不再让「explicit」被读成「只能是 Owner 说的」。

**`ultra-dev` 入口 2**：把「owner invocation 里的 id」改成「**本次调用携带的**一个 exact id」，并写明它的两个诚实来源
与三条边界：

> One exact task id carried into this run supplies invocation-local selection authority for this Dev run
> only: the owner named it, or the Plan handoff that covering authority already permits selected it as the
> frontier task. **A model-selected id is reported as the model's selection and never attributed to the
> owner, and it never resolves an ambiguous ledger.**

没有 id 时的出口由「只能问 Owner」改为二选一：**问 Owner，或回 `ultra-plan` 在覆盖授权下选前沿**——
这样普通请求不会被逼着复述一个刚刚才生成的技术 id，而冷启动的 Dev 仍然会停。

**`ultra-dev` 激活段**：`When the owner invocation names…` → `When the exact task id this run carries names…`。
段内其余文字（canonical 写入 + readback、`no selector, activation flag, or workflow state`、
single-writer 边界）**一字未改**，即复用既有 `pending → in_progress` 通道，不新增任何机制。

**`ultra-plan` 收尾**：让 Plan 明确把自己选的 id 带过去，并禁止冒名：

> Carry the one exact task id you selected into that Dev run: it is this decomposition's own frontier choice,
> travels as invocation-local selection for that run, and is reported as model-selected — never written back
> as a selector and never restated as an id the owner supplied. Do not send the owner back to name a technical
> id this decomposition has only just generated.

**逐条对照任务包的禁止项**：不把 id 记成 Owner 的（明写 model-selected）；不从文件推 grant（授权来源仍只有
「当前 Owner 请求」或「有效 grant」，未动）；不让 Hook 选任务（Hook 零改动，仍靠唯一 `in_progress`）；
不放松真实冲突写入者（single-writer 段原样，且新增一句「model-selected id **never** resolves an ambiguous
ledger」把歧义账本明确排除在外）；不向 Owner 索要冗余技术 id。

**保留项**：`### Recover one exact task from an ambiguous ledger` 全段一字未动（仍要求
`An explicit owner invocation with one exact task id`，`hooks/tests/test_v026_hooks.py:2478` 仍钉住这句）；
独立最终 Review（`A task-level review runs while the ledger task remains in_progress`）一字未动；
`ultra-status/SKILL.md:95`（只读 router 推荐 Owner 显式调用）**故意不改**——Status 是 `router` 类，
本就没有续行授权，与 Plan 的 `grant-continuable` 转交并不冲突。`docs/WORKFLOW-LIFECYCLE.md:257-258` 同理，
它描述的是 Status 那一行。

### 2.2 P1-B 的一处改法（唯一定义处）

落点选择：`route-contract.md` 的 Material checkpoints 段尾。理由是它同时满足三条——
(a) 每个 public Skill 都无条件 `Follow ../ultra-status/references/route-contract.md`，不靠触发词才被读到；
(b) 被过度阅读的那句原文就在这里；(c) 「不该问」与「该问」这条问题前沿本来就写在同一段
（`Do not ask for confirmation when Decision needed is none.`）。新增段：

> Deciding how something works stays model-owned; deciding that it destroys what someone already has does not.
> When such a choice would overwrite, truncate, delete, or replace existing bytes or state — this run's own
> write, or the behavior the delivered code will perform for its users — take the non-destructive form of the
> same choice and keep going: create exclusively, write a separate target, or refuse the collision and report
> it. That default needs no question, and an effect the owner already authorized for exactly this data stays
> authorized. Only when no non-destructive form can deliver the named outcome is the destruction a material
> trade-off, surfaced as one question with a recommendation.

**逐条对照任务包的禁止项**：不提 recipe/冻结样本/目标测试措辞（全段是通用词汇）；不加产品专用守卫；
不加新的流程/schema/daemon/validator 门禁（只是一句默认选择规则，没有产物、字段或状态）；
不堆重复告诫（只落在这一个文件，新增 test 反向断言 Grilling/Research/Change/Plan/Dev/autonomy-boundary
六个消费者里**不得**出现同一句话）；已授权的破坏性效果不再问（明写 `stays authorized`）；
默认是「能继续干活的非破坏形态」，只有在无法交付具名成果时才升为一次带推荐的提问——
不是把它变成普遍硬门禁，也不触碰 tags/grouping 那条「提问或有理由延后」的探针。

与既有文本的一致性：Material checkpoints 第 7 条（外部/不可逆效果需 checkpoint）没有被削弱——
新段的做法是**根本不做那个破坏动作**，因此不需要豁免；真的躲不开时它仍然回到 checkpoint。

### 2.3 测试（不做孤立正则声明）

`tests/route-contract.test.cjs` 新增两个 test，各自都把断言钉到**真实消费者**上：

1. `a Plan handoff carries its own exact task id into Dev and activates that pending row`
   —— 钉 Plan 的转交句、Dev 的 mode 表行 / 入口段 / 激活段首句、既有 canonical 写入与 readback 原文；
   并直接读 `hooks/_common.py`，钉住 Hook **仍然**拒绝自动激活 pending（`never auto-activates it without the
   explicit invocation-local id`）与 `trusted_task_id` 的 invocation-local 定义；
   再钉歧义账本恢复段、single-writer 段、`ultra-status` 的 router 行、任务级 Review 仍在；
   反向断言 Plan/Dev 里没有出现任何持久化选择器路径。
2. `a model-owned technical choice defaults to the non-destructive form of itself`
   —— 钉新段五句；钉 `Do not ask for confirmation when Decision needed is none.` **仍在**（证明没被改成普遍提问）；
   反向断言无 `destructive-effect gate/registry/validator/checklist`、无新增 `.ultra/` 存储路径、
   六个相邻消费者里无重复段落。

未削弱、未跳过任何既有断言。既有 `tests/v026-contract.test.cjs:648/884` 对 `ultra-dev` 的两条跨行正则
在我第一版重排后失配，我**恢复了那段原有换行**（未改测试），复跑通过。

---

## 3. 命令与结果（原始输出保留在 `.ultra/.runtime/owner-factory-implementation-20260905/`）

```
TMPDIR=/tmp node --test tests/route-contract.test.cjs
  → tests 16 / pass 16 / fail 0                      …stage-a-cc-repair-5-focused.log

TMPDIR=/tmp python3 -m pytest hooks/tests/ -q -k "dev or task_selection or pending or activat"
  → 4 passed, 100 deselected                         …stage-a-cc-repair-5-hooks-focused.log

TMPDIR=/tmp node --test tests/skill-authoring.test.cjs tests/north-star-v2.test.cjs \
  tests/owner-journeys-eval.test.cjs tests/ultra-5-journeys.test.cjs \
  tests/v026-contract.test.cjs tests/route-contract.test.cjs
  → tests 184 / pass 184 / fail 0                    …stage-a-cc-repair-5-skills.log

官方 Skill 校验器（skill-creator/scripts/quick_validate.py），逐个改动 Skill：
  skills/ultra-dev    → Skill is valid!  exit=0
  skills/ultra-plan   → Skill is valid!  exit=0
  skills/ultra-status → Skill is valid!  exit=0      …stage-a-cc-repair-5-skill-validators.log

TMPDIR=/tmp npm run verify:release   exit=0          …stage-a-cc-repair-5-verify-release-3.log
  → test:node   tests 728 / pass 728 / fail 0
  → test:hooks  104 passed in 55.61s
  → npm audit --omit=dev --audit-level=high: found 0 vulnerabilities

TMPDIR=/tmp npm pack --dry-run --json  exit=0        …stage-a-cc-repair-5-pack.log
  → ultra-builder-pro-cli 5.0.2, 142 files, unpackedSize 1486260
  → 改动文件全部在包内：ultra-dev/SKILL.md 19383 / ultra-plan/SKILL.md 12502 /
    ultra-status/references/route-contract.md 10539

git diff --stat -- skills tests                      …stage-a-cc-repair-5-diffstat.log
  → 18 files changed, 833 insertions(+), 105 deletions(-)（含 repair 1–4 既有改动）
```

基线 726 Node → **728 Node**（+2 个新 test），104 Hook 不变。
`.ultra/.runtime/` 日志文件名均使用 `stage-a-cc-repair-5-*`，未使用任何 caller 回执名。

### 3.1 前两次 verify:release 是红的 —— 完整披露

```
run 1  exit=1  tests 728 / pass 727 / fail 1   …stage-a-cc-repair-5-verify-release.log
run 2  exit=1  tests 728 / pass 727 / fail 1   …stage-a-cc-repair-5-verify-release-2.log
  两次都是同一处：tests/delegate.test.cjs:2369
  `post-spawn launcher loss retains a bound lock and never trusts the launcher pid`
  断言点 tests/delegate.test.cjs:2426（fence registry 应为空），run 1 seam=lock-rewrite，run 2 seam=receipt-write
```

诊断（用最便宜的可区分检查，不臆断）：

- 单独跑该 test ×3 → 3/3 pass（`…-delegate-repeat.log`）
- 单独跑整个 `tests/delegate.test.cjs` → 58/58 pass，exit 0（`…-delegate-file.log`）
- 当时机器 `load average: 24.66`，另有一个 zcode 委派在别的仓库并发运行
- 根因就写在同一个文件的既有注释 `tests/delegate.test.cjs:184-188`：worker 在 `try` 里发布 `result.json`，
  在 `finally` 里才 unlink lock 并释放 fence，所以「可读的 result.json 是终止证明，不是释放证明」；
  该文件为此已有 helper `waitForWorkerFinalized`。而 2423-2426 这一处读到 `result.json` 后**直接**断言
  registry 为空，是这条已知竞态**尚未修到的最后一处**。

与本轮改动的因果关系：我的 diff 只有 3 个 `.md` 与 `tests/route-contract.test.cjs`，
`tests/delegate.test.cjs` 不读这些文件；该 test 单跑全绿、只在全套并发下失败。

---

## 4. 可观察行为变化

- **P1-A**：一次普通请求 → Plan 分解 → Plan 在转交 Route Card 上给出它自己选的 exact task id（标注 model-selected）
  → Dev 接受它作为 invocation-local 选择 → 走既有 canonical `pending → in_progress` 写入 + readback
  → Hook 从此按唯一 `in_progress` 正常注入。全程没有把 id 记成 Owner 的话、没有从文件推 grant、
  没有新增选择器/激活位/流程状态、没有让 Hook 选任务。
- 歧义账本（多个 `in_progress`）仍然只能由 Owner 的精确调用恢复；model-selected id 被明确排除。
- **P1-B**：模型仍自主决定形态；当这个形态会替换既有字节/状态时，默认取同一选择的非破坏形态
  （独占创建 / 另写目标 / 拒绝碰撞并报告）并继续推进，不消耗 Owner 的提问预算；
  只有当非破坏形态无法交付具名成果时，才作为一次带推荐的实质权衡提问。
  Owner 已授权的破坏性效果不重复批准。

---

## 5. 残余限制与需要 Root 裁决的事项

### 5.1 我越出了「本轮两条路线」的写入范围一处 —— 请 Root 明确接受或撤回

`tests/delegate.test.cjs:2423-2426` 加了 3 行（1 行 `waitForExit(claimed.pid, 15000)` + 2 行注释），
用该文件**自身既有**的同类做法同步 worker 退出后再断言 fence 已释放。**没有削弱或跳过任何断言**
（断言本身仍是 registry 必须为空）。

我这么做的理由：任务包要求我跑 `npm run verify:release`，而它连续两次因这一处变红；
根因已被该文件自己的注释诊断清楚、修法也已在同文件确立。但它确实不属于本轮两条路线，
所以我在这里显式披露：**Root 若认为超范围，撤回这 3 行即可，此时 verify:release 会回到 727/728 并 exit=1**，
且那不是 P1-A/P1-B 的回归。

### 5.2 其余限制

1. **纯提示词改动**。仓库测试只能证明契约文本在位、彼此不矛盾、并与真实 Hook/文档契约一致，
   **不能**证明宿主模型运行时一定照此行动。P1-B 尤其如此：它改的是判断默认，不是机械门禁。
2. **未做真实 provider 资格验证**，未重跑 owner journeys，不自证 Stage A 通过。
   冻结候选与真实评测由 Root 独立评估。
3. **未碰 Hook/adapter/validator/schema/依赖**。P1-A 经核对不需要它们（理由见 §1.1）；
   若 Root 认为 `trusted_task_id` 在生产路径上也应被 Dev/Plan 真正传入，那是一个独立的 runtime 改动，
   需要新的授权与新的被证明消费者，本轮未做、也未臆断。
4. **`ultra-status/SKILL.md:95` 与 `docs/WORKFLOW-LIFECYCLE.md:257-258` 故意未改**（理由见 §2.1）。
   若 Root 认为 Status 那一行也应提到「Plan 覆盖授权下可直接转交」，那是措辞取舍，不是矛盾，我可另开一处小改。
5. **repair 4 §0.5 的两项残余仍开**：`execution-grant.md:100-105` 的 stale-trace 立即停未改；A-R7（真实评测隔离缺口）不在本轮范围。
6. **未跑 `node bin/install.js --all --global --doctor --json`**：安装面本轮未获授权，且 repair 4 已记录本机六 host 全 degraded
   源于「从未安装」，与本轮改动无关。
