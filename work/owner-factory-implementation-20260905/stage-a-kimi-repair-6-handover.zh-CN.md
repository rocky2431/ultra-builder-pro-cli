# Stage A repair 6 交接 — Kimi Code

2026-09-05。写入者:Kimi Code(本轮唯一实现/测试写入者,delegation_id `822a6d00a6d34f61bd06ee0e981c6f19`)。
授权:`.ultra/decisions/2026-09-05-owner-factory-implementation.md` §「Owner 当前完整实施授权」。
任务包:`work/owner-factory-implementation-20260905/stage-a-kimi-repair-6.md`。

未提交、未推送、未安装、未改凭据、未嵌套委派、未重跑 owner journeys、未自证 Stage A 通过。
未碰 `.ultra` 权威状态、冻结源/安装器/评测器、candidate5-A2 冻结产品、caller 回执、既往 Review 报告。
在 candidate5-A1 快照里做过一次只读核对(`python3 -m unittest` 确认现状),运行只产生了两个
`__pycache__/*.pyc`(不在快照清单内),已删除;删除后对照 `candidate5-A1-snapshot-manifest.json`
逐项重算 SHA-256:**53/53 全部一致,无一不匹配**(验证脚本输出见本节末附注)。

---

## 1. 失败实证(我亲自核对回执与快照,不是复述)

来源:`/tmp/ubp-owner-journeys-ynsz0724/candidate5-A-turn1-receipt.json` 与
`candidate5-A1-timeout-snapshot/`(53 项哈希清单完整)。

真实 A1 运行的关键轨迹(回执 assistant_text 原文):T-001 被 Plan 选中、激活、实现 add/list、
4 个真实测试通过;因 Review 准入不可用(D-3:North Star 未接受 + 无已提交 HEAD,两条类型化错误
逐字记录在 intent 与 T-001 上下文),T-001 **正确地**保持 `in_progress`。同一 Primary 随后选中
T-002 并激活,得到 Hook 的 `task_in_progress_ambiguous` 咨询警告后,**错误地**宣称「本次运行携带
且仅携带一个 exact task id(T-002),因此该 invocation-local 选择在**恢复分支**下是权威的」——
即把 model-carried id 塞进了 repair5 明确保留给「explicit owner invocation」的恢复分支。

源码级死胡同(行号为修复前):
- `ultra-dev/SKILL.md:200,239`(`Close out`):任务级 Review 期间行必须保持 `in_progress`,
  只有 durable 事实齐备后才可写 `completed` —— T-001 不能完成是**设计正确**。
- `ultra-dev/SKILL.md:66` 激活要求「dependency-ready `pending` task」,但全仓唯一定义在
  `hooks/_common.py:1261`(trusted 路径依赖须**全部 `completed`**);T-002 的依赖 T-001 是
  `in_progress`,于是 T-002 永远不算 dependency-ready。
- `ultra-plan/SKILL.md:164`(repair5)只提供 model-selected id;`ultra-dev/SKILL.md:34,79`
  规定 model-selected id「never resolves an ambiguous ledger」,而歧义恢复分支只有
  Owner 精确 id 一条路。
- 结果:T-001 形式 closeout 一开,顺序任务链在提示词语义上无路可走,模型只剩违规或停摆。

## 2. 确切改动(3 个文件;无 runtime/Hook/adapter/schema/依赖改动)

| 路径 | 改动 |
|---|---|
| `skills/ultra-dev/SKILL.md` | 入口 2 增加「多 `in_progress` 行 ≠ 多写入者」的核对语义;激活段定义 dependency-ready 的实现证据口径 |
| `skills/ultra-plan/SKILL.md` | 转交段增加前沿选择的实现证据核对 |
| `tests/route-contract.test.cjs` | +1 个契约 test(17→本文件内,全套 728→729) |

### 2.1 语义补全:实现证据已满足的依赖 with 开放形式 closeout

三处改法同一条语义线,全部落在既有段落内、复用既有机制:

**Plan 转交段**(`Report the graph…` 段内,`Carry the one exact task id…` 之前插入):
前沿选择按「核对过的实现证据」进行——同 Change 依赖为 `completed`,**或**仍为 `in_progress`
但从其 canonical 上下文、证据与 Git/worktree 状态核实实现为当前、仅形式 closeout 开放时,
对该选择视为已满足;其行、其欠下的 task review、其开放 closeout **原样保留**并进入转交卡的
`Not done`。无当前实现证据或完成后被证伪的依赖**不**满足:不选其后续任务,改为报告缺口。
明写三禁:never write `completed` for such a row / never claim its review ran /
never declare the ledger unique to justify the selection。

**Dev 入口 2**(model-selected 归属句之后插入,该归属句**一字未动**):
多于一个 `in_progress` 行本身不证明多于一个实际活跃写入者;先把每个其他 `in_progress` 行
对照其 canonical 上下文、Resume Note 与当前 Git/worktree 证据核对,再下结论。能证明是
**同一覆盖授权下自己的先前任务**(实现证据当前、仅形式 closeout 开放)的行原样保留:
不降级、不提前写 `completed`、其欠下的 review 不变。**只有核对无法证明的行**——未知或重叠的
写入者、无关的部分工作、站不住的证据——才使账本对本次运行构成歧义。末尾条件句由
「只要多于一行就走恢复」改为「**核对后仍有无法证明的行**才不制造唯一当前任务、走显式恢复或
带 Hook 诊断停下」(守护句本身保留)。

**Dev 激活段**(首句与全部既有句子**一字未动**,在中间插入定义、在段尾追加一句):
dependency-ready = 核对过的实现证据,而非仅看状态词(口径同上);自动前沿保持更窄——
仍要求全部 `completed`;被保留行存在期间,Hook 的歧义观察正确地保持 advisory 且对本运行
task-silent,本运行的权威是它携带的 invocation-local id,不是 Hook 注入。段尾追加:
「入口核对所保留的行不是冲突行;核对无法证明的行才是」——single-writer 原句
(冲突行经恢复或 Owner 决定解决)对真实冲突**完全保留**。

### 2.2 逐条对照任务包禁止项

- **不伪造 completed 行**:Plan/Dev 均明写 `never write completed` / `never demoted, never
  written completed early`;新 test 正向钉住。
- **不冒充 Owner 引述、不伪造 accepted authority**:`A model-selected id … never attributed
  to the owner, and it never resolves an ambiguous ledger` 原句保留并被两个 test 钉住;
  North Star/Review 准入零改动,开放 closeout 继续走 `Not done`。
- **不设唯一 current-task 选择器**:无新 selector/激活位/流程状态;负断言
  `.ultra/(current-task|task-selector|active-task|selection-state)` 与伪状态词
  (`closeout-open|implementation-complete|partially-completed|quasi-completed`)均不出现。
- **保留所有未完成 canonical 行与每个必需 Review**:保留句与
  `A task-level review runs while the ledger task remains in_progress` 同存并被钉。
- **真实重叠/未证实竞争写入者、无关工作、未满足实现依赖、未覆盖效果仍不得静默准入**:
  「Only a row this reconciliation cannot prove … makes the ledger ambiguous for this run」
  +「not satisfied: do not activate; return to `ultra-plan` or report the gap」。
- **Hook 歧义保持 advisory、自动前沿保持保守;无新 hook selector/workflow state/registry/
  schema/runtime engine/statuses**:`hooks/` 零改动;新 test 直接读 `_common.py` 钉住
  trusted 路径仍要求 `by_id[dependency].get("status") == "completed"`、
  `task_in_progress_ambiguous` 诊断仍在、`never auto-activates it without the explicit
  invocation-local id` 仍在。
- **不发明「证明任意进程不存在」的不可能要求**:核对只用具体可得证据——canonical 上下文、
  Resume Note、Git/worktree 状态(与 Hook 自身 repair 文案要求的核对材料一致)。
- **不要求 Owner 复述技术 id**:repair5 的 `Do not send the owner back…` 原句保留。
- **保留最终独立 Review 与全部验收标准**:Review 准入门、closeout 顺序、evidence v2 契约均未动。

### 2.3 为什么 Hook 不需要改(无可被证明的必不可少消费者)

- trusted_task_id 生产路径本就从未被传入(repair5 §1.1 已实证,本轮不变);
- 自动前沿「全部 completed 才 ready」与歧义诊断都是**设计正确的保守面**,任务包要求保持;
- 死胡同 100% 位于 Plan/Dev 提示词语义:修复后 Dev 走既有 canonical 写入,Hook 观察保持诚实
  (两行 `in_progress` → advisory 警告),运行靠 invocation-local 权威继续——二者不再矛盾。

## 3. 命令与结果(原始日志在 `.ultra/.runtime/owner-factory-implementation-20260905/`)

```
TMPDIR=/tmp node --test tests/route-contract.test.cjs
  → tests 17 / pass 17 / fail 0(含新增契约 test)   …stage-a-kimi-repair-6-focused.log
TMPDIR=/tmp node --test tests/v026-contract.test.cjs
  → tests 100 / pass 100 / fail 0                    …stage-a-kimi-repair-6-v026.log
TMPDIR=/tmp python3 -m pytest hooks/tests/ -q -k "dev or task_selection or pending or activat or ambiguous"
  → 5 passed, 99 deselected                          …stage-a-kimi-repair-6-hooks-focused.log
TMPDIR=/tmp node --test tests/skill-authoring.test.cjs tests/north-star-v2.test.cjs \
  tests/owner-journeys-eval.test.cjs tests/ultra-5-journeys.test.cjs
  → tests 68 / pass 68 / fail 0                      …stage-a-kimi-repair-6-skills.log
官方 Skill 校验器(…/.codex/skills/.system/skill-creator/scripts/quick_validate.py):
  skills/ultra-dev  → Skill is valid!  exit=0
  skills/ultra-plan → Skill is valid!  exit=0        …stage-a-kimi-repair-6-skill-validators.log
TMPDIR=/tmp npm run verify:release   exit=0          …stage-a-kimi-repair-6-verify-release.log
  → test:node   tests 729 / pass 729 / fail 0
  → test:hooks  104 passed in 47.35s
  → npm audit --omit=dev --audit-level=high: found 0 vulnerabilities
TMPDIR=/tmp npm pack --dry-run --json  exit=0        …stage-a-kimi-repair-6-pack.log
  → ultra-builder-pro-cli 5.0.2,142 files(与 repair5 一致),unpackedSize 1489373
  → ultra-dev/SKILL.md 21101 / ultra-plan/SKILL.md 13224 均在包内
rtk git diff --stat(本三文件,对 HEAD 为累计)      …stage-a-kimi-repair-6-diffstat.log
```

基线 728 Node → **729 Node**(+1 新 test),104 Hook 不变,6→2 Skill 校验器(仅跑本轮改动的
两个 Skill,repair5 基线的 6 个为其改动面)。verify:release **一次通过**,未复现
repair5 的 delegate 竞态(其修复已被 Root 接受并在位)。日志文件名均为
`stage-a-kimi-repair-6-*`,未用任何 caller 回执名。

## 4. 可观察行为变化

- **修复前**:T-001 形式 closeout 一开(Review 准入不可用),Plan→Dev 顺序链在提示词上无路可走:
  T-002 永远「不 dependency-ready」,激活段把 T-001 的行当「冲突行」只能走 Owner 恢复,
  model-carried id 又「never resolves an ambiguous ledger」→ 模型只剩违规(真实 A1 选择了违规)。
- **修复后**:同一覆盖授权下,Plan 按实现证据核对后仍可把 T-002 作为前沿携带;Dev 入口核对
  T-001 为「实现证据当前 + 仅形式 closeout 开放」的**已满足实现依赖**,原样保留其行与欠下的
  Review;T-002 经既有 canonical `pending → in_progress` 写入 + readback 激活;Hook 歧义警告
  作为预期 advisory 出现而非停止条件;两行都诚实保持 `in_progress`,D-3 解除前谁也不写
  `completed`。
- 真实竞争写入者/无关工作/未满足或已证伪依赖/未覆盖效果:路径与修复前完全一致——
  停止、Owner 精确 id 恢复、或 Owner 决定。

## 5. Root 定向 resume qualification 的可恢复起点事实(非合成成功工件)

资格验证起点 = 原样保留的失败检查点 `/tmp/ubp-owner-journeys-ynsz0724/candidate5-A1-timeout-snapshot/`
(完整性:manifest 53 项哈希本轮重算全部匹配)。确切事实:

1. **账本**(`.ultra/tasks.json`,schema v2):T-001 `in_progress` deps `[]`;T-002 `in_progress`
   deps `[T-001]`;T-003 `pending` deps `[T-001]`;T-004 `pending` deps `[T-002,T-003]`;
   全部 `change_id: 001-recipe-capture-retrieve`。
2. **T-001**:实现完成(add/list),证据 6 件保留于 `.ultra/evidence/T-001/`
   (baseline/red-01/green-01/green-02/ac-01-add/ac-02-list),六维已记录;closeout 开放——
   上下文 `## Task Review` 逐字记录两条类型化准入错误(`canonical North Star validator report
   must describe an accepted v2 authority`;无 `git rev-parse HEAD`),Resume Note 明写
   「do not set `completed` until a validated strict review SUMMARY.json exists」。
3. **T-002**:已激活;worktree 里 `recipe.py` 的 `cmd_search`(113 行)/`cmd_show`(138 行)已定义
   且解析器已接线(169 行),快照字节下 `python3 -m unittest` **10/10 通过**;但
   `.ultra/evidence/T-002/` 只有 `red-01.txt`(无 green 回执),Resume Note 仍是
   「(not started)」,六维未记录——实现在工作树里、证据未记录,这正是 resume 要核对和补齐的。
4. **intent**:`## Unresolved Decisions` 携 D-1(North Star 接受待 Owner)、D-2、D-3
   (准入不可用,两条类型化错误逐字)。仓库**零提交**(无 HEAD);提交是 Owner 门控效果。
5. **Hook 面**:两行 `in_progress` → `task_in_progress_ambiguous` advisory 会出现,属预期。

修复后提示词下的合格行为(判定要点):resume 运行携带 T-002(invocation-local、如实标注
model-selected、不冒充 Owner 恢复分支)→ 核对 T-001 为已满足实现依赖并原样保留 → 把 Hook 歧义
警告当 advisory 继续 → 从 worktree 现状补齐 T-002 的 green 证据与六维记录 → T-001/T-002 的
canonical closeout 在 D-3 解除前保持开放,不写 `completed`、不伪造 `SUMMARY.json`。
不需要为这一条分支重建或重放整个 A1。

## 6. 残余限制

1. **纯提示词改动**(同 repair5 §5.2.1):仓库测试证明契约文本在位、互不矛盾、与真实 Hook 一致,
   不证明宿主模型运行时必照此行动;真实 qualification 由 Root 从 §5 检查点执行。
2. **ultra-status 路由表与 `docs/WORKFLOW-LIFECYCLE.md` 故意未改**:Status 是只读 router,
   对多 `in_progress` 行本来就只给诊断(其 196 行),无续行授权,与本修复不冲突。
3. **未做真实 provider 资格验证**,未重跑 owner journeys,Stage A 通过与否由 Root 独立评估。
4. repair 4/5 交接中已记录的其余残余(A-R7 评测隔离、stale-trace 立即停等)不在本轮范围,仍开。

---

附注:快照完整性核对脚本输出 —— `manifest entries: 53`,`mismatches: none`,
`files not in manifest`(运行 unittest 产生的两个 .pyc)已删除,删除后复算保持一致。
