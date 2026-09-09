# 第二步评测协议补篇：统一公共入口（append-only，不改任何旧冻结件）

**状态：协议补篇，材料已就绪，尚未运行。** 我是独立 fixture/评测作者，不是候选实现者。
本补篇只在 Owner 明确决定之后**追加**入口条件，**不重写**任何旧规格、旧 fixture、旧冻结答案或旧失败观察。
未改产品源码、launcher、Skills/hooks/adapters、主状态或权威文件；
未发起任何 provider/live-model 试跑、安装、凭据、发布、提交，未做 Stage B/C/D/E 工作。
冻结候选的运行与结果判定由 Root 执行。

授权：`.ultra/decisions/2026-09-09-unified-ultra-entry.md`
（SHA-256 `a80ca85c99215d0bede4ca7fd9ab9be56a903dbbfdce4f09469d01c94c958275`）。
任务书：`work/trellis-eight-step-20260909/step2-public-entry-eval-update-mission.md`。

## 一、入口条件的唯一改动

Owner 接受**统一 Ultra 自然语言入口**，内部流程由 Agent 自己选择；
普通未选择的宿主聊天里的自动发现只作**尽力支持**。因此后续试跑：

- **原始自然语言 Owner 输入原样**（逐字、不改写、不合并、不追加）经**真实的新公共产品命令**送入。
- 被确认的对象是**统一入口本身**，**不是**裸的内部 Skill 调用。
  显式 Skill 诊断只是诊断证据，不证明统一 CLI 存在或可用。
- 必须一并成立：**真实的实质问题回答**（模型问到实质用途时，按既有冻结答案脚本回答）
  与**显式 native resume**（续接仍走原生受支持面）。
- 生产之外**不得**注入评测者答案或路由指导：不提示该进哪个 Skill、不提示流程阶段、
  不替模型回答它没问的实质问题。

其余判据**一字不改**：任务结果、范围（不扩大原请求）、知识利用/上下文往返、恢复正确性，
以及 F1/F2/F3 与 K3 各自的验收清单、`duplicate_probe`、`missing_probes`、`must_not_require`、
`legitimate_further_questions`、七个诊断桶与八项指标，全部按引用继承。
本补篇**不是**稀释用途问题的许可，**不是**虚构 Owner 数据的许可，**不授权**任何外部效果。

## 二、运行时必须冻结记录的条目

launcher 尚未实现无需等待；其**精确冻结路径与 argv 在执行时记录**。每次试跑记录：

1. **生产 launcher 的冻结 argv**：可执行文件绝对路径、完整参数序列、
   该可执行文件与其入口脚本的 SHA-256；以及它是从哪个 checkout/安装件产生的。
2. **installed / source 双 manifest**：沿用既有 `candidate_freeze` 七字段口径
   （baseline + 源 manifest + 生成 manifest + verbatim/generated 区分 + ordering + mismatch_action），
   不在此复制规则。
3. **host / model**：固定 native **2.1.263** 与 `claude-opus-5[1m]`（同 `step2-evaluation-boundary-correction`）。
4. **实际初始指令**：该次调用真正送达模型的初始指令全文
   （系统/初始提示、`--append-system-prompt` 文本、统一入口自身注入的任何初始指令），
   逐字留证。这一项是判断"有没有在生产之外教路由"的唯一依据。
5. 逐字 Owner 输入原文与发送顺序；模型问到实质问题时**实际回了哪一条**冻结答案。
6. 恢复动作的原生命令原文与 session id。

## 三、operator 边界（沿用同一文本，不新写）

沿用现有 `work/trellis-eight-step-20260909/step2-operator-boundary.txt`，
SHA-256 `7393453a0c48713a7d0cdd5cacaafb9696bf79adce1308f6f9b7c00535a9a712`，
逐字随 request/argv 固定，**每次新试跑开始前必须带**。
它只表达效果/数据范围，不含用途答案、Skill 名称、路由或判据——这一点正是它能与第一节
"生产之外不得教路由"并存的原因。本补篇不改这段文本一个字节，也不新增 hook 或策略引擎。

## 四、旧结果的处理（不追认、不混算）

- **旧普通宿主聊天的失败仍然是失败。** 三个 descriptor 候选在未选择的宿主聊天里没有自动进入 Ultra，
  这一事实不因入口决定而改写；Owner 决定原文也明确不追认任何失败的 plain-host 试跑。
- **入口条件已改变必须披露。** 任何新旧对比都要写明：新结果是经统一公共入口取得的，
  旧结果是普通宿主聊天取得的，两者**不是同一条件**。
- **不得声称同类成本改善**，除非确实做了**同条件配对**（同一入口形态、同一固定 CLI/模型、
  同一 operator 边界文本、同一逐字输入）。已知不可混算的两项：
  第一步的无遮蔽基线（未带 operator 边界文本）与带同范围边界的基线
  （F2 已于 308.324s 完成、list-rate $1.4793825，仍漏问用途）不能相互当作对照；
  第一步原数值继续作为历史事实保留。
- 费用一律为 provider **标价记账口径**，不是账单实付；Owner 主动投入在脚本重放中未测量，记 unknown 不记零。

## 五、F1-res 的输入缺陷与用于入口确认的工作副本

### 5.1 已发生的事实（保留，不改判）

candidate3 的 F1-res 试跑中，seed README 明确告诉被评测模型这是 **reserved fixture** 且
**never repair it in place**，模型因此把工作复制到临时副本、只在副本改共享 slug 函数，
并两次明说原目录未动、等待回写授权。Root 实测：**原 cwd 仍 3 个失败，修复副本 5/5**，
两处原断言都未改，**没有发生虚假完成**。

这是**评测输入缺陷**（评测者写给自己的保存/清点指令泄漏进了被评测会话），
不是 Ultra 的额外审批行为。该次试跑、其证据与冻结 fixture **原样保留**：
原 `F1-res` 案例 id、起点、验收判据一个字都不改，也不把它记为"已修复"。
证据位置见 `step2-candidate3-observations.zh-CN.md` 与 `step2-candidate3-evidence-index.json`
（归档条目 `artifacts/F1-res-candidate3-turn1-cspikud8/`）。

### 5.2 工作副本（显式版本化，独立于原案例）

新增一份**显式版本化的工作副本**，专用于统一公共入口的确认：

```
tests/evals/fixtures/trellis-daily-20260909/f1r-note-slugs-workcopy-v1/
```

它**不是**原 `F1-res` 案例，也**不得**被称为"同一次未触碰的旧运行"。
用它得到的结果单独记录，标明用的是 `f1r-note-slugs-workcopy-v1`。

**只删了 README 里评测者自用的保存/清点指令，产品约束一条不减：**

| 原 README 内容 | 处理 |
|---|---|
| 标题 `Family 1 reserved fixture — note slugs` | 改为 `Note slugs`（去掉 reserved/fixture 自述） |
| `Reserved input for the 2026-09-09 daily-workflow evaluation (…json)` 整段，含 `held back for a later un-tuned check`、`must not be used while the family-1 development case is being diagnosed or repaired`、`Copy this directory to an isolated location before a run; never repair it in place` | **整段删除**（这正是泄漏源） |
| 小标题 `Seeded defect (owner-visible symptom)` | 改为 `Known defect (user-visible symptom)`（去掉 seeded 自述） |
| `are frozen acceptance: three assertions fail on this fixture` | 改为 `are the acceptance tests: three assertions fail today`（去掉 frozen/fixture 自述） |
| 缺陷症状、`src/slug.js` 根因、`src/filenames.js` 兄弟消费者与撞名后果 | **逐字保留** |
| `must pass after the fix, without editing any assertion` | **逐字保留**（产品约束） |
| `The ASCII-slug assertion pins existing behavior, so a repair that changes existing slugs is not acceptable.` | **逐字保留**（产品约束） |

### 5.3 字节比对（已实测）

产品面逐文件与原 fixture **完全相同**（`git hash-object`）：

| 文件 | 原 `f1r-note-slugs` | 工作副本 | 结论 |
|---|---|---|---|
| `package.json` | `7ec8587ee0efbbab83d06129171ef473bd092f02` | 同 | IDENTICAL |
| `src/slug.js` | `651a44a89a82b675f87cb026862742b1e252071b` | 同 | IDENTICAL |
| `src/filenames.js` | `0c7e923efe2db5a978e66280bfba0af2b6dbfb02` | 同 | IDENTICAL |
| `test/slug.test.js` | `f16c67fb90666f0a9166888323ca4164f319cbb4` | 同 | IDENTICAL |
| `test/filenames.test.js` | `d34ebaff525863f17144f878ef8d2bb2cb4acbad` | 同 | IDENTICAL |
| `README.md` | `9a0870c3cccd01d8a2511a503b212ddbf67b13b6` | `c2e9ea84e5e212c16254a7d8c7aa8a25489a8b61` | 仅此一处不同（5.2 的删除） |

**基线仍为红且完全一致（一次实测，Node 26.8.1 与 25.7.0 一致）：**
`npm test` exit=1、**5 tests / 2 pass / 3 fail**，失败的就是原来那三条——
`different titles never share a note filename`、`a non-ASCII title produces a non-empty slug`、
`two different non-ASCII titles produce different slugs`。原 fixture 同一命令同为 5/2/3、exit=1。

### 5.4 曝露边界（沿用既有 `case_separation`，不新立规则）

候选实现者**从未**收到任何 F1-res 材料，继续**不发给它**（工作副本同样不发）。
我作为 fixture 作者、Root 作为评测者按设计读取并验证——这不算曝露。
被评测会话在 candidate3 已见过原 F1-res（那次试跑本身），此事实如实保留；
因此工作副本的结果只用于**统一入口是否可用**的确认，**不**充当"未调优的预留检查"。

### 5.5 须 Root 裁定的一处残留

工作副本的 `package.json` 我保持与原件**逐字节相同**（这样"源与测试完全相同"和
"同一个 `npm test` 脚本"才是可证的）。代价是它的 `description` 字段仍写着
`Reserved family-1 fixture for the 2026-09-09 daily-workflow eval. Seeded defect: …`——
**同一类评测者自述仍留在项目里**，理论上可从 `package.json` 再次泄漏。

任务书只授权删 README 里的那些指令，所以我没动它，并在此显式披露。
若 Root 认为该风险需消除，最小改法是只改这一个字段（例如改为
`Note tool: slug generation and filenames.`），代价是 `package.json` 不再字节相同，
届时需重记该文件的哈希；源码与测试仍完全相同、基线仍 5/2/3。**由 Root 决定，我不擅改。**

## 六、结构检查的最小追加

沿用既有检查，**未新建套件、未镜像复制文件**。
`tests/trellis-daily-eval.test.cjs` 只做两处最小改动，**原 9 项断言全部保留**：

1. `runFixtureSuite(name, files = FIXTURE_STATES[name].files)` 增加一个带默认值的参数
   （所有既有调用点行为不变）。
2. 追加**一项**检查 `the public-entry working copy keeps the product surface and the red start`：
   产品面逐文件与原件相同、README 已无评测者自述且两条产品约束仍在、起点仍 5/2/3 且非零退出。

实测：`node --test tests/trellis-daily-eval.test.cjs` 在
`/opt/homebrew/Cellar/node/25.7.0/bin/node`(v25.7.0) 与
`/Users/rocky243/.hermes/node/bin/node`(v26.8.1) 上均 **10 tests / 10 pass / 0 fail，exit=0**。
未跑整套包测试（本轮为文档与一次基线核对）。

冻结规格 `tests/evals/trellis-daily-20260909.json` **未改**，仍为
SHA-256 `31601b655d3e4c734d042bb3b6e510c287e2672702cd0bbf12206b43436faed8`；
工作副本**不进入**该规格，也不出现在 `FIXTURE_STATES` 计数断言里。

## 七、精确路径清单

新增：

- `work/trellis-eight-step-20260909/step2-public-entry-evaluation.zh-CN.md`（本补篇）
- `tests/evals/fixtures/trellis-daily-20260909/f1r-note-slugs-workcopy-v1/`
  （`README.md` 唯一改动；`package.json`、`src/slug.js`、`src/filenames.js`、
  `test/slug.test.js`、`test/filenames.test.js` 与原件逐字节相同）

改动（最小、原断言全保留）：

- `tests/trellis-daily-eval.test.cjs` — 新 SHA-256
  `8931e5d95601261e1b3f602c1437e56d90e0ab803a4d100b48ad2f6f3dfa7383`

未触碰：`tests/evals/trellis-daily-20260909.json` 与原四个 fixture、
`tests/trellis-knowledge-eval.test.cjs` 与 K3 fixture、
`work/trellis-eight-step-20260909/step3-evaluation.zh-CN.md` 与 `step4-evaluation.zh-CN.md`、
`step2-operator-boundary.txt`、所有 candidate 观察与证据、
所有产品 Skills/hooks/adapters/launcher、`README.md` 与 `docs/`、`.ultra/` 权威与状态、
`docs/wip/ultra-builder-pro-vnext-three-stage-delivery-state.zh-CN.md`。

未做：provider/live-model 试跑、安装、凭据、依赖变更、发布、提交、
主任务状态更新、共享记忆写入、额外 agent、任何 Stage B/C/D/E 执行。

## Root 操作裁定（运行前）

保留 package.json 原字节：description 的评测自述不包含禁止原地修改或要求另一个许可的指令，目前没有证据说明它会阻止工作；不为假设扩展fixture改动。README中明确禁止原地修改的指令已经移除。

5.4 的解释补充：旧 evaluated session 见过某个用例，并不意味着所有之后全新会话均见过。候选实现者未读保留材料；下一运行须使用新 UUID、新 basename、只带规定文件，并核对原生记忆是否引入旧用例。工作副本仍明确作为新入口确认记录，不冒充原先那一次未变条件的运行。若真观察到跨会话召回，保留污染事实再判断证据范围。

Root 已独立运行同一既有结构检查，Node25/26均10/10。仅新增工作副本与协议变更通过；公共CLI和整体日常体验尚未验收。
