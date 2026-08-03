# Ultra Builder Pro v8 架构方案

**状态**：**第一批已落地（2026-08-03，未 commit）**，见第十三节。其余待排。本文件是这轮工作的唯一落点，全部完成后折叠进正式文档并删除。

**删除条件**：第十三节 6–11 项完成，且 12.4 的场景 eval 至少跑过「换宿主接手」那一条。

**落地仓库：`ultra-builder-pro-cli` (v0.26)**。本仓 `ultra-builder-pro` 冻结后归档，README 指向 CLI，**不保留 Claude 特化分支**（否则就是两套，正好违反 3.8）。本文件应随之移入 CLI 仓库的 `docs/wip/`，不留第二份。

**文中对本仓文件的引用**（`post_edit_guard.py:693`、`README.md:209`、`.ultra-template/PHILOSOPHY.md:97` 等）保留为 **v7 问题来源的证据**，不是 CLI 的待办。CLI 侧的实际状态见第九节的复核表和第十节。

**证据约定**：带文件路径和行号的判断都已实地核过；标注「推断」的是尚未验证的设计判断。

---

## 一、定位判断：从「工程 harness」转向「意图澄清 + 自动落地」

Ultra 至今的投入几乎全在技术工程层：TDD 强制、hooks 传感、7 路并行 review、三方 AI 验证。这些都成立，但它们解决的是「代码写得对不对」。

真正稀缺的是上游：**用户说得出的需求，和他真正要的东西，不是一回事。** gstack 的 `/office-hours` 用一个例子把它讲透了——「You said daily briefing app. What you described is a personal chief of staff AI」：用户说的是**形式**，要的是**角色**。

定位调整为：**一边帮用户理清他要什么，一边选对架构技术并落地。** 前半句现在是空白，后半句已有大量积累。v8 的重心在前半句，以及前半句如何约束后半句。

参考坐标（都已实地看过）：

| 项目 | 意图澄清的形态 | 关键设计 |
|---|---|---|
| gstack | `/office-hours`：six forcing questions | 输出 design doc，作为下游所有阶段的强制输入 |
| mattpocock/skills | `/grill-me`、`/grill-with-docs` | 显式 user-invoked；后者明确针对 "communication gaps between users and agents" |
| ultra-builder-pro-cli | `ultra-grilling` | model-invoked discipline（隐式，级别偏低） |
| 本仓 | 无 | `<ask_user_format>` 是被动格式规则，不是流程阶段 |

---

## 二、流程重构：一次性的项目级 + 可重复的变更级

### 2.1 现状缺陷：整条流程是一次性的

`init → research → plan → dev → test → deliver` 线性跑完之后，进入微调迭代时：`north-star.md` 描述的是 v1 目标，`specs/*` 是 v1 设计，`tasks.json` 全部 completed，`test-report.json` 绑定的是那次的 HEAD。

此时来一个小需求，**没有任何命令可用**：init 已跑过，research 太重，plan 会重新生成 tasks。用户的实际行为必然是直接说「帮我改一下 X」，绕过整套流程——于是这次改动没有 intent、没有 spec 更新、没有 evidence。再改一次，spec 和代码又远一点。

**根因**：流程假设「项目」是工作单元，但实际的工作单元是「变更」。这就是 CLI 引入 `ultra-change` 的原因。

### 2.2 分层

```
一次性（项目级，跑一次）
  ultra-init      → north-star.md（意图边界）
  ultra-research  → specs/*（可行性边界、技术选型）

可重复（变更级，每个需求跑一轮）
  ultra-change    → changes/active/<id>/intent.md
  ultra-plan      → 本次变更的 tasks
  ultra-dev       → 实现
  ultra-test      → 验证
  ultra-deliver   → 文档对账 + 归档 change
```

每个 `intent.md` 必须声明两件事：**本次触及 north star 的哪几条边界**，以及**是否要求修改既有 spec**。后者若属于 WITHDRAWN（见 3.1），停下问 owner。

### 2.3 小改动直通路径

不是每个改动都值得跑完整 change 流程。需要一条显式的轻量通道：**改动不触及任何边界、不修改 spec、不新增公开接口** 三条同时成立时，直接进实现，但仍然留 evidence（一条 commit + 一行 change log）。三条有任一不成立，回到完整 change 流程。

判据全部机械可判定，不需要模型主观决定走哪条。

### 2.4 Init 的两个职能，以及边界要定两次

**这是你问的「边界放 Init 还是 Research」——答案是两个都要，因为边界有两类。**

- **意图边界**（不依赖外部事实）：一句话目标、成功标准、硬约束、明确不做什么、给谁用。用户心里有，问就能问出来，**不需要任何调研**。
- **可行性边界**（依赖外部事实）：「必须能离线跑」要先知道有没有离线方案；「每月不超过 $50」要先知道 API 定价。**必须调研后才能确定**。

所以：

- **Init 定意图边界**：六问在前，建目录在后，问不出来就不建。产出物正是 `north-star.md` 现有的五个槽位——One-line / Success Metric / Hard Constraints / Out of Scope / Stakeholders。**模板结构本来就是为此设计的**（见第九节，这是个从未实现的设计意图）。
- **Research 定可行性边界**：在意图边界的约束下调研；发现某条意图边界不可行时，**不许自己改 north star**，必须停下来告诉 owner「你说每月 $50，但最低方案是 $200」，由 owner 决定放宽边界还是换目标。

这个顺序解决了当前的「尾巴摇狗」：现在 init 建一个全空的 north star，立刻把用户推进 17 步搜网流水线，**调研结果反向定义了目标**。

### 2.5 提问形态：有界的重构性提问，不是穷尽式访谈

对一个说不清自己要什么的用户，**有界比穷尽更有效**。问三十个澄清细节的问题，他会崩溃并开始随便答——那比不问更糟，因为你会拿到一份看起来完整的假需求。

采用 gstack 的形态：**固定数量、上限明确的重构性提问**。「重构性」指问的不是「登录页要什么颜色」，而是「你说的这个东西，替代了用户现在正在用的什么」。

提问风格 `CLAUDE.md` 的 `<ask_user_format>` 已经写好（先 re-ground、说它 DOES 什么而不是叫什么、带推荐答案、一次一问）。缺的不是规则，是**把这条被动规则升格为该阶段的执行协议**：现在它说「当你要问的时候按这个格式」，需要变成「你必须在这里问够才能往下走」。

### 2.6 大框架的「精准」是可操作的：出口质量标准

由 3.3 可知，大框架的精准度直接决定执行期能自动化多少。所以 init 的出口不能只看「五个槽位填满了」，要看**填进去的东西能不能用来否决具体决策**。

判据只有一条：**每一条 Hard Constraint 都必须能用来否决某个具体的技术决策。写不成这样的，说明还没问清楚。**

| 反例（无法判定任何后续决策） | 正例（可判定） |
|---|---|
| 「要做得好用」 | 「首屏加载 < 2s」 |
| 「安全一点」 | 「不存明文密码；所有外部输入必须校验」 |
| 「成本可控」 | 「外部 API 月支出 < $50」 |

Success Metric 同理：`north-star.md` 模板注释里已经写对了——「Not "users like it" — "auth latency < 200ms p99" or "10 paid customers"」。这条标准要从注释提升为 init 的**出口检查**。

### 2.7 大框架单调增长，只加不改

大框架不可能一次定完，但可以定得**可增长**。`Out of Scope` 槽位正是干这个的：执行期每发现一条新边界（「原来这个也不该做」），就往里加一条。

- **加边界** → 自动，无需问人。大框架变精准是好事，且不会推翻任何既有承诺。
- **改 / 删边界** → 属于收回承诺，走 WITHDRAWN（3.1），必须问 owner。

这样大框架在迭代中单调增长，执行期的自动化比例随之单调上升——**每跑一轮，下一轮需要打断人的次数就更少**。这是 2.1「迭代中失效」的正面反转：流程不但在迭代中不失效，还应当越迭代越省人。

---

## 三、语义防漂移

### 3.1 承诺分类（治「无意识改变」）

痛点原话：「无意识的改变，用户察觉不到，产出就出问题。」

**无意识之所以无意识，是因为从来没有人在任何时刻被要求分类。** 一旦分类成为每次文档变更的**必填字段**，无意识自动变成有意识。这就是 (a) → (b) 的全部转换机制，不需要引擎。

判据只有一个问题，**按结果判，不按理由判**：

> 这次改动之后，文档已作出的每一条承诺是否都还成立？

| 回答 | 分类 | 动作 |
|---|---|---|
| 是，且现在承诺了更多 | EXPANSION | 写下，记录 |
| 是，承诺不变，只是表述更准确 | CORRECTION | 写下，记录 |
| **否，至少一条旧承诺不再成立** | **REDUCTION** | **停下，问 owner** |

一段论证充分的 rationale 不能把 REDUCTION 变成 CORRECTION；那段 rationale 是要放进呈给 owner 的问题里的。

**CLI 已完整实现**（`docs/PHILOSOPHY.md`、`ultra-think/references/autonomy-boundary.md`），无需新增。

**关于命名冲突——先前提议重命名为 WITHDRAWN，已推翻。**
冲突属实：`change-contract.md` 的 `## Planning Posture` 用 EXPAND / SELECTIVE / HOLD / **REDUCE**（gstack 式 scope mode），承诺分类用 EXPANSION / CORRECTION / **REDUCTION**。但重命名要动 9 个规则文件，并让 `.ultra/contexts/` 里 6 条已有历史记录出现新旧术语断层，而**两组词本来就出现在不同字段下**，字段名已在消歧。
**实际采用**：两处各加一句交叉说明——`change-contract.md` 的 Planning Posture 下注明「REDUCE 是少排点活，REDUCTION 是毁约」，`PHILOSOPHY.md` C5 加一段「Not to be confused with Planning Posture：一个关于未来的范围且可逆，一个关于过去的承诺且不可逆」。一行成本换同样的消歧效果。

### 3.2 边界要能被回读

`north-star.md` 的 `## Hard Constraints` 现在是自由文本，`session_context.py` 注入完就没人管，**没有任何回读检查**。spec 层至少还有 `review-ac-drift` 事后看一眼，边界层连事后都没有。

改动很小：Hard Constraints 从自由文本改成**逐条带 id**，每个 task context 声明它触及哪几条。这样「越界」从一个语义判断变成一个有具体指向的问题：

> 这次改动之后，north star 已声明的每条边界是否都还成立？有一条不成立 → 停，问 owner。**不管理由多充分。**

### 3.3 决策分层：大框架的精准度决定执行期的自动化比例

「人决策前期，剩下自动化」和「按类型划分」不是对立的两种方案，**是嵌套关系**——前者是后者能成立的前置条件。

小决策被包裹在大框架里。大框架越精准，能被**自动判定**的决策就越多：

- 大框架精准 → 执行期冒出的决策点少，且多数是「越界」型（有客观判据，读边界即可判定，不必问人）
- 大框架模糊 → 「是否越界」根本无法判定，于是**所有决策退化成 taste**（没有客观答案，只能问人）→ 失衡

所以前期把大框架定精准，目的正是让执行期的打断变少且变清晰。**但打断不会降到零**——大框架无法预见一切，剩下的按类型处理：

| 类型 | 定义 | 处理 |
|---|---|---|
| taste | 没有客观正确答案，只能由 owner 偏好决定 | 必须问 |
| 越界 / 收回承诺 | 有客观判据，但后果不可逆 | 必须问 |
| 其余 | 有客观答案（哪个库更快、测试过没过、export 有没有消费者）或可逆 | 全自动，不许问 |

gstack 给了准确的词：`/autoplan` 链式跑完所有 review，"surfacing only **taste decisions** for your approval"。

**由此得到一个可检验的「精准」定义**：大框架足够精准 = 执行期遇到的多数决策能靠读大框架自动判定。这是可测的——跑一个项目，统计执行期打断人的次数；频繁打断说明大框架不够精准，应回到 init/research 补，而不是在执行期逐个问。

参照 gstack 的表述：**"the way a CEO manages a team: check in on the decisions that matter, let the rest run."**

### 3.4 文档对账（治「活文档」）

「新决策产生后旧文档怎么同步」——gstack 用两条腿解决，**都不是实时引擎**：

- **正向链式必读**：每个阶段的产出是下个阶段的强制输入（`/office-hours` 的 design doc → `/plan-ceo-review` 读 → `/plan-eng-review` 生成 test plan → `/qa` 执行）。文档不会漂，因为下游没有别的输入源可用。
- **反向终局对账**：`/document-release` "reads every doc file, cross-references the diff, and updates everything that drifted"。一个显式批处理命令，在 ship 时读整个 diff，一次性对齐所有漂移文档。

本仓**有正向、缺反向**。`review-ac-drift` 只检测不修，且只看 spec 对 diff，不看其余文档。

**方案**：给 `ultra-deliver` 加一个对账步骤，等价于 `/document-release`。比造实时同步引擎便宜一个数量级，而且**批处理反而更准**——实时同步在一次改动没写完的中间态里对账，只会产生噪音。

### 3.5 判据修正：不是「派生 vs 权威」，是「可否确定性重建」

**先前版本的判据是错的。** 它主张把 `relations.json`、`wiki/*`、`progress/*.json` 一律移出 git，理由是「派生物进 git 会静默过时」。

但 `.ultra` 的正确定位是**跨 agent、跨会话的记忆载体**——另一个 agent 接手时，读 `.ultra` 就能无缝继续。这个定位要求信息**完整**，而「不存盘」是以损害完整性来回避过时问题。

正确的判据是**可否确定性重建**：

| 类别 | 判据 | 处理 |
|---|---|---|
| 不可重建的记录 | 丢了就永远拿不回来 | **必须进 git** |
| 可确定性重建的索引 | 能从进了 git 的源文件跑脚本还原 | **也进 git**，但带来源指纹 |
| 纯加速缓存 | 丢了不影响任何 agent 接手 | `.runtime/`，唯一 gitignore 的地方 |

**先前把 `progress/*.json` 归为可丢弃是明确的错误**：它记录的是「编辑过程中观察到的六维证据」，一旦丢失**无法从最终代码状态倒推**。它是观察记录，不是索引，必须进 git。

`relations.json` 确实可从 `tasks.json` + spec anchors 重建（`relations_sync.py` 就是干这个的），但让接手的 agent 先跑一遍脚本才能读，是没必要的摩擦。

**「派生物会过时」的解药不是「不存盘」，是「过时可被机械检测」。** 做法：每个可重建文件在头部记录生成时的来源指纹（源文件 hash + git commit）。校验时比对当前源文件——不一致就标记 stale 并重新生成。纯机械，无需语义判断。

这样既满足跨 agent 接手（信息完整、开箱可读），又不让派生物冒充权威（不一致时源文件永远赢）。

### 3.6 Wiki 不再需要

**结论：删除自动生成的 `wiki/`。**

理由：wiki 的全部内容都是 tasks + specs + relations + git 的重新排列，**不含任何新信息**。它的价值主张是「一眼看懂现状」，而这个价值只在源文件散乱到读不动时才成立——那是目录设计问题，不该用一层生成物去补。自动生成的聚合视图必然滞后于源文件，且滞后不可见。

**但「一眼看懂现状」这个需求是真的**，它被拆成两半，分别有更合适的归宿：

| 需求的一半 | 变化频率 | 归宿 |
|---|---|---|
| 术语和项目常识（这个项目里 order 指什么、为什么锁 v2） | 慢变 | `CONTEXT.md`，存盘（7.6） |
| 现在什么情况（在做哪个 change、哪个 task、测试新不新鲜） | 快变 | `ultra-status` **现算，不存盘** |

**慢变的存文件，快变的现算**——这是取代 wiki 的完整方案。wiki 的致命伤正是把快变的东西存了盘。

`wiki_generator.py` 及其 hook 注册一并删除。

### 3.7 No-MVP 断点需要一次破例

痛点：LLM 过分追求 MVP，功能写完了但没接上，形成断点。

**不能同时要 sensor-not-blocker 和「断点绝不发生」。** v7 把一切降级为 advisory 是有代价的，代价就是 advisory 可以被忽略。本仓已有三道防线（plan 拒横向切片、dev 的 `vertical_slice` 维度、test 搜 export 的真实消费者），机制不缺，缺的是牙齿。

如果「写完没接上」不可接受——判断是不可接受——它应成为 C3 五项之外的**第六项硬门**，但门开在正确位置：**不 block 编辑，block 交付**。`ultra-deliver` 在存在「没有非测试消费者的新 export」时拒绝出包。

四要素齐备：不变量（新 export 必须有真实消费者）、事实来源（grep/AST，机械可判定）、被阻断的效果（交付）、修复路径（接上，或显式声明为内部 API 并记录理由）。

它不会像编辑期硬门那样逼 agent 改测试逃逸，因为它拦的是最后一步。

### 3.8 前后端不一致 / 唯一路径

- **前后端不一致**：「哪些接口该 explore」不靠约定。**schema 文件是唯一权威，两边都从它生成，都不许手写类型。** 这是唯一路径原则在接口层的实例。
- **唯一路径**：兼容五六七八套的根因是「每次加分支都不需要为删除负责」。硬规矩：**新增兼容分支必须同时写下旧分支的删除条件或删除日期，写不出来就不许加。**

---

## 四、委派：解意图的限，不解权限的限

### 4.1 现状

`/ultra-verify` 是**固定角色 + 固定问题**：三个 AI 回答同一个问题然后投票。这把其他 CLI 当成「投票器」而不是「能干活的工程师」，确实限制了它们的能力。

### 4.2 要指出的张力

**「不设限」和「可追溯」天然冲突。** 给它完全自由，它可能做任何事；要追溯就必须知道它做了什么。

CLI 的 delegate 已经化解了这个张力，方式是：**限制的不是它想什么，而是它能碰什么。**

| 部件 | 作用 |
|---|---|
| `instruction.md` | 不可变指令——**原始意图放这里，可以任意丰富，这是解限的地方** |
| `permission.json` | 能写哪些路径、有无外部效果；不得widen 宿主原生沙箱 |
| worktree | 物理隔离，写入范围就是这个目录 |
| Git diff | **实际做了什么由 diff 说了算，不由它自己汇报说了算** |
| `result.json` | schema 约束的终态（finished / blocked / failed），**由 launcher 写，不由 worker 写** |

最后一条是关键。CLI 的 `docs/ARCHITECTURE.md` 明确写着 "The model never writes its own receipt"——launcher 从 native structured output 提取，验证实际 Git diff，然后原子发布 `result.json`。

这正好回答「如何监控中间过程 + evidence 留档」：stdout/stderr 落文件（诊断用，不进主上下文）；实际效果看 Git diff（客观，无法伪造）；终态是 schema 约束的 `result.json`；四件套都留在 worktree 旁边，出错时逐环节可查。

### 4.3 方案

移植 CLI 的 delegate 三件套（`host-profile.cjs` 五宿主 argv 契约 + permission 信封 + worktree/result.json），并把 instruction 的内容**从「受限的任务」改成「原始意图 + 上下文」**。

**解限解的是意图的丰富度，不是权限的范围。** 多宿主派发提升的是吞吐，不能顺带提升权限：worker 继承父级权限策略，写入范围限制在 worktree 内。

「三堂会审」不删，**降级为 delegate 的一种用法**——三方共识是 delegate 的特例（三个 worker 回答同一问题），不是唯一形态。

### 4.4 7 路 review 与 5 宿主派发是正交的，且应当串联

**修正**：先前把「本仓 7 路 review」和「CLI 五宿主」列为二选一的取舍，这是错的。两者是**不同维度**：

| 维度 | 机制 | 提供的东西 |
|---|---|---|
| 7 路 review | 同一模型多视角扇出 | **深度**——一个 diff 从 7 个角度看 |
| 5 宿主派发 | 不同模型家族独立复核 | **独立性**——不同训练、不同盲区 |

7 路扇出仍然是同一个模型家族，**有共同盲区**：七个视角都看不见的东西，加到第八个视角也看不见。真正的独立性只能来自另一个模型。

所以正确形态是**串联**：

```
diff → 7 路扇出（深度）→ coordinator 聚合去重
     → 聚合结果 delegate 给其他 CLI（独立性）→ 复核 / 反驳
     → 最终 verdict
```

第二段只传聚合结果，不传 7 路的原始输出，因此不会污染主上下文，也不会让外部 CLI 陷进本地推理细节。5.3 新增的 `review-ac-coverage` 是最适合走第二段的一路——它只需要 AC 文本和测试文件。

**对宿主能力差异的处理**：CLI v0.26 已有现成模式——Claude adapter 用原生 subagent 并行跑 lens，没有等价能力的宿主由父模型顺序跑同一批 `references/*.md`。同一套 lens 资产，两种执行方式，不必二选一。

---

## 五、并行与隔离

### 5.1 context flood 的正确表述

「占用到 60–70% 模型能力下降」——现象真实，但归因需要修正。本仓 `CLAUDE.md` 的 `<context_budget>` 已按 1M 窗口重校准（PEAK 0–30% / <60 tool calls），60–70% 在 1M 下对应极长会话。

**能力下降的机制不是窗口满，是噪音比**——上下文里无关内容占比越高，注意力越分散。这与窗口大小无关。

所以解法不是压缩，是**隔离**：让每个 sub-agent 只看它需要的东西。（对应 agents-best-practices：不要给每个 worker 完整对话、全部工具、全部密钥。）

### 5.2 graph 用在阶段内部，不用在阶段之间

本仓的 7 路并行 review **已经是一个 graph**（1 → 7 → 1，独立上下文 + coordinator 聚合）。所以问题不是「没有 graph」，而是**只在 review 这一处做了**。

按「大到一个上下文会噪 / 可独立分解 / 需独立验证」判断：

| 阶段 | 是否适合 fan-out | 说明 |
|---|---|---|
| review | 已做 ✓ | 7 路并行 |
| research | **适合，未做** | 17 步现在串行，多数步之间无依赖 |
| test | **适合，未做** | wiring / E2E / 性能 / 安全 四维独立 |
| dev | **不适合** | 实现有状态、连续，并行只会产生冲突 |

而**流程本身**（init → research → plan → dev → test → deliver）**不该做成 graph**：每一步都严格依赖前一步的完整输出，它就是一条线。把一条线画成 graph 不增加任何东西，只增加一个调度器。

一句话：**graph 用在「一个阶段内部的扇出」，不用在「阶段之间的调度」。**

（背景：CLI 的 `docs/DECISIONS.md` 首条删 state machine 的理由是「机械 supervisor 可以在内部状态自洽的同时让每条公开路径都不可达」。而 graph = nodes + edges + permissible transitions = state machine。阶段间调度器是重蹈覆辙；阶段内扇出不是。）

### 5.3 裁判员 / 运动员：分歧在这里

**共识**：审查不该由写代码的同一上下文做；测试写完之后要再走一轮独立 review，这轮 review 可以、且应该由其他 agent 承担。本仓已有 7 路独立 review agent，跨模型审查更好（gstack 的 `/codex` 就是这个）。

**唯一需要辨析的是「写」而不是「审」**：测试用例本身不应该由另一个 agent 代写。

理由是 TDD 的核心机制——**先写失败的测试，再写实现**。测试是**规格的可执行形式**，不是事后检查。如果测试由另一个 agent 写：

- 它在实现**之后**写 → 变成事后确认，TDD 死了，且测试会去迁就实现；
- 它在实现**之前**写 → 那它就是在写规格，那它才是运动员，问题只是换了个人。

真正该分离的是**「写测试的人」和「判断测试是否充分的人」**。前者是 TDD 的一部分，不可分离；后者是 review，必须独立。本仓的 `review-tests` agent 已经在做后者。

**但有一个场景原判断成立**：验收测试（acceptance test）确实该由独立方写，因为它对应 AC，而 AC 来自 north star / intent，不该由实现者解释。gstack 正是这么做的：`/plan-eng-review` 生成 test plan → `/qa` 执行。**测试计划在 plan 阶段由 review 角色生成，不由 dev 生成。**

精确划分：

| 环节 | 谁做 | 理由 / 现状 |
|---|---|---|
| 单元测试 / TDD 红绿测试 | 实现者 | 红绿循环不可分离 |
| 验收测试 / test plan | plan 阶段由独立角色生成，dev 只能执行不能改 | 对应 AC，不该由实现者解释 |
| 测试的**技术**审查（mock 违规、覆盖缺口、边界） | 独立 review agent | 已有 `review-tests` ✓ |
| 测试的**业务**审查（测的是不是用户真要的东西） | 独立 review agent | **缺口，见下** |
| 跨模型复核 | delegate 到其他 CLI | 真正的独立性来自不同模型家族 |

**关于「测试是否忠实覆盖 AC」这条边**：先前版本判定它是缺口并建议新增第 8 路 lens `review-ac-coverage`。**实地核查后撤回**——CLI 的 `ultra-review/references/tests.md` 第 3 行已经是「Map each changed behavior and **acceptance claim** to executable evidence」，`spec.md` 第 4 行从 spec 侧做同一件事。这条边**已被两个 lens 从两侧覆盖**，再加一路是重复。

本仓确实缺（`review-tests` 只看技术质量，`review-ac-drift` 只看代码对 spec），但这属于「本仓缺、CLI 有」，随迁移自动解决，不需要新设计。

**真正剩下的缺口在上游**：AC 的 verification 字段没有强制「必须可执行」，见 6.3。lens 能检查「AC 有没有对应证据」，但如果 AC 自己的验证方式写的是「人工看一眼」，检查也就到此为止。

---

## 六、目标驱动的收敛循环

### 6.1 goal-driven 抓住的那一点

[lidangzzz/goal-driven](https://github.com/lidangzzz/goal-driven) 全部内容是一个 README 加一个模板 prompt，核心是一行：

```text
while (criteria not met) { let the subagent work on solving the problem and achieving the Goal }
```

master agent 每 5 分钟对照 criteria 评估 subagent 的产出，不达标就重启，达标才停。

**它抓住的是：终止条件外置。** 「做完了」不再由干活的 agent 自己宣布，而是由一个独立的判定者拿着 criteria 反复检查。

这补上了 Ultra 的一个真实空缺。现在 Ultra 的每个阶段都是**跑一遍就结束**：`ultra-dev` 做完 task 标 completed，六维证据是 advisory；`ultra-test` 报告了红项也只是报告。**没有任何一处是「不达标就继续干」的循环。**

注意它和我们前面讨论的 review 不是一回事：

| 机制 | 形态 | 适用 |
|---|---|---|
| review（4.4、5.3） | 产出 → 审 → 提问题 → 修，一个来回 | 质量把关 |
| 收敛循环 | 产出 → 对照 criteria → 不达标 → 继续，直到达标 | **长时间自动化**（痛点 5） |

痛点 5 想要的「有机自动化」需要的是后者。

### 6.2 它粗糙在哪

四处，每一处 Ultra 都恰好有现成的解法：

| 粗糙点 | 后果 | Ultra 的解法 |
|---|---|---|
| 无外部状态（README 明说 "Does not track state externally"） | 循环中途崩溃就全丢 | `.ultra` + 第八节恢复协议 |
| criteria 是自由文本，手填在 `[[[[[...]]]]]` 里 | **master 判断达标仍是纯语义判断——只是换了个 agent 做同一件事** | 见 6.4 |
| 无预算、无停止条件 | criteria 若不可达（写错了或技术上做不到）就永远跑 | 见 6.5 |
| 整个 Goal 一个循环 | 粒度太粗，失败时不知道哪一段没收敛 | 循环挂在单个 task 上，见 6.6 |

第二条是它最根本的缺陷：**它想解决「agent 自己说做完了」，但 master 判断是否达标同样是一个 agent 在做语义判断。** 判定者换了个人，判定方式没变，所以并没有真正外置。

### 6.3 融合方案：AC 升级为循环的终止条件

**CLI 已有的一半**：`ultra-change/references/change-contract.md` 的 Acceptance 表已经是四列 `| ID | Criterion | Verification | Trace |`，字段说明写着「stable ids with a criterion and **exact verification** for each accepted behavior」。**AC 带验证方式这件事已经存在。**

**缺的一半**：没有任何地方要求 `Verification` **必须是可执行的**。填「manual check that the page loads」完全合规——于是这条 AC 就永远进不了循环终止条件，也无法被机械判定。

所以要加的不是字段，是一条出口标准：

> **`Verification` 列必须是一条能跑、能看退出码的命令。写不出命令的，它还不是 AC，是愿望。**

这条是 2.6（Hard Constraint 必须能否决具体决策）在 AC 层的同构版本。顺带把 No-MVP 也治了——「功能接上了」本身就能写成一条 grep。

现在 AC 写在 task context 里，dev 做完后由 review 检查——是**验收清单**。

改为：**AC 是 `ultra-dev` 循环的退出条件**，全部通过才允许退出。

配套一条出口标准，是 2.6 那条在 AC 层的对应版本：

> **每条 AC 必须附带一个可执行的验证命令。写不出命令的 AC，它还不是 AC，是愿望。**

这条标准顺带强化了 No-MVP（3.7）：「功能接上了」本身就可以写成一条 grep 命令——「这个 export 有非测试消费者」是可执行的。

### 6.4 criteria 必须二分

这是让循环可靠的关键，也是 goal-driven 缺的那一半：

| 类型 | 判定方式 | 能否进循环终止条件 |
|---|---|---|
| **机械可验证** | 跑命令看退出码（测试、构建、lint、grep 消费者、schema 校验） | **能**——判定不需要 agent |
| **需语义判断** | 「体验流畅」「代码优雅」 | **不能**——走 taste decision 问 owner（3.3） |

**循环的终止条件必须全部是机械可验证的。** 这样判定者不做任何语义判断，也就不存在「换个 agent 做同样的语义判断」的问题——终止条件才算真正外置。

这个二分正好接上 3.3 的决策三分类：机械可验证 = 自动放行，需判断 = taste 必须问人。同一条界线在两个层面上是一致的。

### 6.5 预算与卡死

`while (criteria not met)` 没有出口，是 `agents-best-practices` 明令禁止的形态（"Long-running goals need budgets, checkpoints, and a measurable done condition"）。

**CLI 的 `ultra-review` 已经有一套现成的**，直接复用即可，不要另发明：

> Stop when P0 + P1 does not decrease between rounds. ... If one file fails three consecutive repairs, treat it as an architecture concern. If three or more files do so, write `UNRESOLVED.md` with `ARCHITECTURAL_CONCERN` and stop.

这已经是「停滞检测 + 3-Fix Rule 机械化 + 卡死时给 owner 三条具体路径」的完整实现。**问题是它只长在 review 里，`ultra-dev` 和 `ultra-test` 没有。** 6.6 要做的就是把同一套搬过去，指标从 P0+P1 换成「通过的 AC 条数」。

补三条：

1. **轮数上限**：超出即停，报告已通过和未通过的 AC 清单，交回 owner。
2. **停滞检测**：连续 N 轮「通过的 AC 条数」没有增加 → 停。这是 `CLAUDE.md` 3-Fix Rule 的机械化版本——三次修复都没推进，问题是架构性的，不是 bug。
3. **不可达识别**：AC 的验证命令本身报错（而非断言失败）→ 说明 criteria 写错了，直接回 owner，不消耗轮数。

三条都是机械可判定的，不需要模型判断「我是不是卡住了」。

### 6.6 落点与粒度

**循环挂在单个 task 上，不挂在整个项目或 change 上。** `agents-best-practices` 的原话是：目标循环只用于「a single objective with validation and a budget」，不能用于模糊的 backlog。goal-driven 把整个 Goal 当一个循环，太粗——失败时不知道是哪一段没收敛。

两个落点：

- **`ultra-dev`**：从「实现一个 task」改为「循环直到该 task 全部 AC 的验证命令通过」。与 TDD 完全兼容——红绿本来就是循环，只是现在的退出条件是「我觉得写完了」，改成「AC 命令全绿」。
- **`ultra-test`**：从「报告红项就结束」改为「循环修复直到全绿或预算耗尽」，耗尽时按 6.5 交回 owner。

## 七、`.ultra` 目录设计

### 7.1 定位与由此推出的三条原则

**`.ultra` 是跨文件、跨 agent、跨会话的记忆载体。** 另一个 agent 接手时，读 `.ultra` 就能无缝继续。由这个定位直接推出：

1. **默认全部进 git。** 只有一个明确标注为可丢弃的目录例外。没有「本地版本」这回事——本地状态无法跨 agent 传递，那就不是记忆。
2. **入口要少。** 一个有 18 个顶层条目的记忆载体，接手者不知道从哪读起。入口数量本身就是可用性指标。
3. **只放项目数据。** 规则、模板、哲学是**产品资产**，随包分发；混进项目就会有 N 个项目 N 份副本各自漂移。

### 7.2 现状盘点：18 个顶层条目

实测（`grep` 全部 hooks / commands / agents / skills / CLAUDE.md 的 `.ultra/` 路径引用）：

`tasks/`、`specs/`、`templates/`、`docs/`、`reviews/`、`sessions/`、`collab/`、`debug/`、`memory/`、`backups/`、`wiki/`、`north-star.md`、`PHILOSOPHY.md`、`test-report.json`、`delivery-report.json`、`relations.json`、`workflow-state.json`、`compact-snapshot.md`

对照 CLI v0.26 的 9 个（+ 根 `CONTEXT.md`）：结构膨胀了一倍，而多出来的部分没有一个是新的语义。

### 7.3 目标结构

```text
CONTEXT.md                      # 根目录，术语表 + 不可推导的常识（见 7.6）
.ultra/
├── north-star.md               # 项目级意图边界（init 六问产出）
├── specs/                      # 可行性边界与设计
│   ├── product.md
│   ├── architecture.md
│   ├── discovery.md
│   └── research-distillate.md
├── changes/                    # 变更单元（新增，见 7.7）
│   ├── active/<change-id>/intent.md
│   ├── archive/<change-id>/{intent.md,delivery.md}
│   └── log.md                  # 小改动直通的留痕
├── tasks/
│   ├── tasks.json              # ledger，每个 task 带 change_id
│   ├── contexts/<task-id>.md   # 语义 + Resume Note
│   └── progress/<task-id>.json # 六维观察，不可重建
├── decisions/<decision-id>.md  # 新增：决策记录
├── evidence/<task-id>/         # 新增：证据归档
├── research/<run-id>/          # 研究报告（从 docs/research/ 上提）
├── reviews/<session-id>/       # review 结论
├── test-report.json            # 当前测试证据，绑 HEAD
├── relations.json              # 索引，带来源指纹（见 3.5）
└── .runtime/                   # 唯一 gitignore 的目录
    ├── compact-snapshot.md
    ├── delegations/<id>/
    └── debug/
```

顶层 11 个（含 `.runtime/`）。`.runtime/` 的定义严格：**丢了不影响任何 agent 接手**。

### 7.4 删除清单

| 条目 | 处置 | 理由 |
|---|---|---|
| `PHILOSOPHY.md` | **移出项目**，随包分发 | 规则不是项目数据。N 个项目 N 份副本，主版本改了旧项目不跟 |
| `templates/` | **移出项目**，随包分发 | 同上；顺带修缺陷 #6（未初始化仓库里 advisory 指向不存在路径） |
| `wiki/` | **删除** | 见 3.6，无新信息且必然滞后 |
| `workflow-state.json` | **删除** | 12 处引用却无 schema、无单一写入者。流程位置应从文件本身推断（哪个 change active、哪个 task in_progress），不该有第二个真相 |
| `memory/` | **删除** | v7.2 已废弃 |
| `backups/` | **删除** | Git 就是备份，第二套备份只会不同步 |
| `sessions/orphan-trail.md` | **并入 `changes/log.md`** | 「孤儿会话」= 没有归属的工作。引入 change 后一切工作都有归属，孤儿概念消失 |
| `collab/` | **改名 `.runtime/delegations/`** | 三方会审降级为 delegate 的一种用法（4.3） |
| `debug/` | **移入 `.runtime/`** | 诊断用，不影响接手 |
| `compact-snapshot.md` | **移入 `.runtime/`** | 纯加速缓存 |
| `delivery-report.json` | **并入 `changes/<id>/delivery.md`** | 交付是变更级的，不是项目级的 |
| `docs/` | **拆解** | `research/` 上提为顶层；`test-coverage-gaps.md` / `technical-debt.md` 归入 `evidence/` 或 `decisions/` |

**规则侧资产移出项目**这一条值得单独强调。CLI 的 `DECISIONS.md` 已明确：「`.ultra/` contains project data only」，可复用模板放 `skills/ultra-tdd/references/templates/`，随每个宿主的安装动作复制。这一条同时解决三件事：C2 的分发缺口、规则漂移、以及 `.ultra` 的入口膨胀。

### 7.5 新增清单

| 条目 | 作用 | 为什么现在没有是个问题 |
|---|---|---|
| `changes/` | 变更单元的载体 | 没有它，第二个需求无处安放，只能绕过流程（2.1） |
| `decisions/<id>.md` | 决策记录：选了什么、否决了什么、理由、取代了哪些 spec anchor | 现在决策散落在 task context、commit message、对话里，接手者拼不出来 |
| `evidence/<task-id>/` | 证据归档 | 现在证据混在 `tasks/progress/` 里，和六维计数器职责不同 |
| `CONTEXT.md`（根） | 术语表 + 不可推导的项目常识，由 `ultra-domain-modeling` 单一写入 | 现在术语只存在于对话和代码里，换个 agent 或隔两周，同一概念就会有第二个名字 |

`decisions/` 是 3.1 承诺分类的落点：每条 WITHDRAWN 必须产生一个 decision 文件，声明它取代了哪些 spec anchor。这就是「决策 → supersedes → spec anchor」那条边的物理形态。

### 7.6 `CONTEXT.md`

**修正**：先前版本主张把 ECC 的 `WORKING-CONTEXT.md`（Current Truth / Current Constraints / Active）并进来，这是错的。ECC 需要那些字段，是因为 ECC **没有** north-star、changes、tasks 这套结构化文件，它得找个地方放。Ultra 已经有了，再写一遍就是第二真相源——而且是快变的第二真相源，等于把 wiki 的毛病换个文件名重演一遍。

#### 它是什么

**项目的术语表加不可推导的常识。** 判据只有一条，也是它不会退化成 wiki 的唯一保障：

> **只写不能从 `.ultra` 其他文件推导出来的东西。**

能推导的一律不写：「在做哪个 change」（读 `changes/active/`）、「当前边界」（读 `north-star.md`）、「哪个 task 未完成」（读 `tasks.json`）——这些归 `ultra-status` 现算。

不可推导、因而必须写在这里的：

| 内容 | 例子 |
|---|---|
| 术语的确切含义 | 「order 指已支付的；未支付的叫 cart，不叫 pending order」 |
| 被否决的措辞及原因 | 「不用 user 指代买家，因为 user 在本项目指后台操作员」 |
| 已解决的歧义 | 「『同步』一律指数据同步，进程语义一律写 blocking」 |
| 踩过的坑 | 「X 库锁在 v2，v3 的 Y 行为有 bug」 |
| 多条决策合起来的当前含义 | decisions/ 存单条记录，这里存它们合起来意味着什么 |

#### 放哪

**仓库根，不在 `.ultra/`。** 术语表是项目的公共资产，不是 Ultra 的内部状态——不用 Ultra 的人、别的宿主的 agent、做 code review 的人都该读到它。`CLAUDE.md` / `AGENTS.md` 指向它。CLI v0.26 也是这么放的。

#### 谁写

**单一写入者：`ultra-domain-modeling`。** 这是 CLI 现成的 model-invoked skill，描述里写明它是 `CONTEXT.md` 的 sole focused writer。

单一写入者是硬要求——多个写入者会让粒度和格式漂移，三个月后它就变成一锅粥。

**触发时机**（不是定期维护，是事件驱动）：
- 一个术语第一次获得确定含义
- 两个词在争同一个概念
- 一个词被发现有两个意思
- 一条决策改变了某个术语的边界

**人的角色是确认，不是执笔。** 术语定义是标准的 taste decision（叫 order 还是 purchase 没有客观答案），按 3.3 必须问 owner——但问法是带推荐答案的一次一问，不是让 owner 去写文件。owner 只需要说「对」或「不，叫 X」。

这一条很关键：**要求 owner 手写维护一个文件，在本产品的用户画像下等于这个文件不会被维护。** 所有存盘的语义都必须由 agent 执笔、owner 确认。

### 7.7 Change 的设计

**Change = 一次有边界的变更**，是 project 和 task 之间缺失的那一层。

```text
changes/active/<change-id>/intent.md     # 唯一 active，创建时写
changes/archive/<change-id>/
    ├── intent.md
    └── delivery.md                       # 交付时写
changes/log.md                            # 小改动直通的一行留痕
```

`intent.md` 的必填字段：

| 字段 | 内容 | 消费者 |
|---|---|---|
| 要什么 | 本次变更的目标，一句话 | plan / dev / review |
| 验收标准 | 逐条 AC，可测 | plan、`review-ac-coverage`（5.3） |
| 触及边界 | 引用 north star 的哪几条 Hard Constraint id | 3.2 的边界回读 |
| 承诺关系 | PRESERVED-EXPANDED / CLARIFIED / **WITHDRAWN** | 3.1；WITHDRAWN 必须先问 owner 并产生 decision 文件 |
| 恢复说明 | 中断时从哪继续 | 跨会话恢复（第八节） |

规则：

1. **同一时刻只有一个 active change。** 并发 change 会让「当前边界是什么」产生歧义。要并行开发用 worktree，不是并行 change。
2. **task 归属 change**：`tasks.json` 每个 task 带 `change_id`。这让「本次变更改了什么」可机械回答。
3. **归档就是 `git mv`**：`active/<id>` → `archive/<id>`。不需要状态字段，目录位置就是状态，且 git 记录了归档时刻。
4. **小改动直通**（2.3）不创建 change，在 `changes/log.md` 加一行（时间、commit、一句话）。三条判据任一不成立就必须建 change。

**流程位置从文件推断，不设状态字段**：有没有 active change、里面有没有未完成 task、test-report 的 `git_commit` 等不等于 HEAD——这三个机械事实足以确定当前位置。这正是删掉 `workflow-state.json` 的底气。

## 八、跨会话恢复协议

一个明确、固定、任何宿主都能执行的恢复序列。按 7.3 的结构，顺序是**从大到小**：

1. `CONTEXT.md` — 现在是什么情况，术语怎么讲
2. `.ultra/north-star.md` — 目标与边界（不变的约束）
3. `.ultra/changes/active/<id>/intent.md` — 本次变更要什么、触及哪些边界
4. `.ultra/tasks/tasks.json` — 找到未完成 task
5. 该 task 的 `contexts/<task-id>.md` 及其结尾 `## Resume Note`
6. 相关 `decisions/`、`specs/`、`evidence/`、当前 Git 状态

前三步回答「我们在干嘛」，后三步回答「我停在哪」。同一序列在 compact 之后、新进程、hooks 被禁用、更换宿主时都成立——**因为这六个都是 git 里的普通文件，不依赖任何运行时状态**。

`.runtime/compact-snapshot.md` 只能加速这个序列，永远不能替代它。判断标准很简单：**删掉整个 `.runtime/`，上述六步必须仍然完整可执行。** 这是 `.runtime/` 里能放什么的唯一判据。

---

## 九、已发现待修的缺陷（本仓 v7，均已核实）

> **落地 CLI 后大部分自动清零。** 下表全部是本仓 v7 的历史债。在 CLI v0.26 上逐项复核的结果：
>
> | # | CLI 侧状态 | 依据 |
> |---|---|---|
> | 1 One-line 无人填写 | **不存在** | `ultra-init` 的「Draw out the intent」明确把 one-line 写入 `north-star.md`，且 done 定义要求逐个 read-back |
> | 2 C3 硬阻断超编 | **不存在** | CLI 的实现围绕 "irreversible effect" 组织，不是本仓那张 19 条正则表 |
> | 3 硬门无修复路径 | **不存在** | 输出含「backup or rollback path, and owner authorization before any irreversible effect」与「After explicit owner authorization, rerun with …」 |
> | 4 Contract Table 腐烂 | **不存在** | `docs/PHILOSOPHY.md` 引用的消费者与实际 6 个 hook 文件一致 |
> | 5 C4 与 ultra-test 冲突 | **不存在** | CLI PHILOSOPHY 已补 scoped exception，并声明它是 terminal sensor 而非 gate |
> | 6 C2 模板分发缺口 | **不存在** | 模板已在 `skills/ultra-tdd/references/templates/`，随包分发 |
> | 7 hook 注入粒度 | **待核** | CLI 只有 5 个 hook，matcher 配置在 `adapters/` 内，未逐个核 |
> | 8 hook 全局越界 | **不存在** | 6 个 hook 文件全部带 `.ultra` 检查 |
> | 9 文档陈旧 | **不存在** | CLI README 与实际资产数一致 |
>
> **结论：只剩 #7 需要在 CLI 上确认。** 保留本表是为了记录问题的来源，以及万一需要在本仓打补丁时有据可查——不是 CLI 的待办清单。

| # | 缺陷 | 证据 | 影响 |
|---|---|---|---|
| 1 | **One-line 无人填写** | `north-star.md` 模板注释说由 `/ultra-init` 或 `user_prompt_capture` hook 填写；init 的 6 步 workflow 无一步填它；`user_prompt_capture.py` **不存在** | 新项目 C1 结构性失效，`session_context.py` 每 session 忠实注入一个空文件 |
| 2 | **C3 自测失败** | C3 列了 5 项不可逆，`block_dangerous_commands.py:20-55` 有 **19 条** hard-block；其中 `git reset --hard`（第 40 行，**不限分支**）、`git clean -fd`、`chmod 777`、`DROP TABLE` 均可逆 | agent 撞到不该有的墙就去绕，正是 v7 要治的病 |
| 3 | **hard gate 无修复路径** | 同文件 117-125 行，deny 只输出 `[BLOCKED] {message}`，不给合法通过方式 | 违反「每个硬门必须有可达修复路径」 |
| 4 | **Contract Table 自身腐烂** | `.ultra-template/PHILOSOPHY.md:97,115` 仍为 `user_prompt_capture`、`observation_capture` 记录契约，两者均不存在；缺 v7.1/v7.2 新增的 4 个 hook | 该表开头第 88 行自称「contract drift 是 #1 失败原因」 |
| 5 | **C4 与 ultra-test 冲突** | C4 写「Final-gate audits are forbidden」，而 `/ultra-test` 就是终局 wiring 审计 | CLI PHILOSOPHY 已补 scoped exception（wiring 审计必然终局，且是 terminal sensor 非 gate），抄回即可 |
| 6 | **C2 enabling template 分发缺口** | 所有 advisory 指向 `.ultra/templates/*`（`post_edit_guard.py:693`、`review-tests.md` 8 处、`CLAUDE.md:54` 等 12 处），但该目录只有跑过 init 的项目才有 | 未初始化仓库里 advisory 指向不存在的文件，C2 失效 |
| 7 | **hook 注入粒度过粗** | `settings.json` 把 `mid_workflow_recall.py` 挂在 `PreToolUse:Write\|Edit\|Grep`，Contract Table:113 特意要求包含 `Grep` | 每次符号查找都注入一遍 AC；局部动作拖着全局目标走 |
| 8 | **hook 全局越界** | `historical_context_guard.py`、`health_check.py`、`block_dangerous_commands.py` 无 `.ultra` 存在性检查 | 对从未 opt-in 的项目收税；CLI 已固化为 `if not exists('.ultra'): exit(0)` 的代码不变量 |
| 9 | **文档陈旧** | README 徽章 17 skills（实际 16）、15 hooks（settings 注册 13）；版本号三处不一致：`CLAUDE.md` 6.9.0 / README 7.1.0 / CHANGELOG 7.2.0 | — |

---

## 十、CLI Skill 审查

### 10.1 范围

实读 CLI 14 个 `SKILL.md` 中的 5 个核心（`ultra-init`、`ultra-grilling`、`ultra-dev`、`ultra-change`、`ultra-review`）、`ultra-think/references/autonomy-boundary.md`、`ultra-change/references/change-contract.md` 的 Acceptance 定义，以及 6 个 review lens 的头部。

规模特征：`SKILL.md` 一律 61–111 行，细节压在 `references/`（research 17 个、review 9 个）。本仓对应的 `commands/` 是 58–455 行的单文件。**CLI 的 progressive disclosure 形态更省上下文**，迁移时是筛选合并，不是照搬。

### 10.2 本方案中已被 CLI 实现的条目 — 撤回或降级为「确认保留」

| 方案条目 | CLI 落点 | 评价 |
|---|---|---|
| 2.4 边界定两次 | `ultra-init`：authorization versus claim | **CLI 表述更精炼**：owner 授权的东西证据推翻不了；research 收集的是关于外部世界的主张，证据可证可否 |
| 3.1 承诺分类 | `autonomy-boundary.md` 三分类表 | 完全一致。它的 offline mode 例子比方案里写的好 |
| 3.4 文档对账 | `ultra-change` 三桶 reconciliation | **CLI 更强**：在 Change 开头做而非 deliver 结尾（避免在已不一致的 spec 上叠加），且给了可重跑的 scope 推导四步（`git log -- specs/<f>` → `git diff <那个commit>..HEAD -- <相关代码>`） |
| 2.3 小改动直通 | `ultra-change` 适用性表第三行 | **CLI 判据更本质**：方案用三条并列条件，它用一条——「if nothing the specifications say becomes untrue，就没什么可对账也没什么可记录」 |
| dev 六维证据 | `ultra-dev` 表格带 `Answered when` 列 | 本仓只有维度名，CLI 每维都有可检查规则 |
| 6.5 停滞检测 | `ultra-review`：P0+P1 不降即停、单文件三次修复失败→架构问题、三个以上→`UNRESOLVED.md` | 已完整实现，**只是没长在 dev/test 上** |
| 5.3 第 8 路 lens | `tests.md`「Map each changed behavior and acceptance claim to executable evidence」+ `spec.md` 从 spec 侧 | **建议撤回**：这条边已被两个 lens 双向覆盖 |
| AC 带验证 | `change-contract.md`：`\| ID \| Criterion \| Verification \| Trace \|` | 字段已有，缺「必须可执行」的强制 |
| 7.7 Change 设计 | `change-contract.md` | 已有，含 profile 分级（quick / standard / major） |
| Zero Context Pollution | `ultra-review`：不可变 packet + SHA-256 + `review_wait.py` 只读稳定 JSON | **比本仓 7 路更严谨**：本仓没有 packet digest，也没有「不读中间输出」的硬约束 |

**结论：方案约三分之一的条目 CLI 已经实现，个别比方案写得更好。** 迁移过去之后要做的是补剩下的，不是重建。

### 10.3 CLI 的真缺口

按价值排序：

1. **重构性提问缺失 — 最重要。** `ultra-grilling` 的四个引导问题（出错怎么办 / 哪个更容易反悔 / 故意不做什么 / done 长什么样）全是**澄清型**。它的 "Extract first, then ask" 重述的是 owner **说过的话**，不是把话**重新框定**成他真正要的东西。gstack 那句「You said daily briefing app. What you described is a personal chief of staff AI」这一步，CLI 没有。**用户认定的最高价值区，恰恰是最大的缺口。**
2. **边界出口质量标准**（2.6）。`ultra-init` 有 `[NEEDS CLARIFICATION]` 机制，但没有「每条 Hard Constraint 必须能否决某个具体技术决策」，所以写出「要好用」也能通过。
3. **`Verification` 未强制可执行**（6.3）。
4. **收敛循环只长在 review**（6.6），dev 和 test 仍是「跑一遍就结束」。
5. **边界回读缺失**（3.2）。Hard Constraints 无逐条 id，task 不声明触及哪几条。
6. **单调增长规则缺失**（2.7）。`Out of Scope` 只加不改没有写成规则。
7. **Claude 侧 7 路并行编排**。`ultra-review` 只说 "Use the host's native bounded subagents"，没有具体实现。

### 10.4 提示词本身的改进点

| # | 位置 | 问题 | 改法 |
|---|---|---|---|
| 1 | `ultra-dev` 六维 | `tests_written` 判据是「This diff changes a test file」——**改一行测试注释也算通过** | 改成「新增或修改了至少一条断言」 |
| 2 | `ultra-dev` 六维 | `feature_flags_audit` 只查「本 task 新增的 flag」，**既有的 default-off flag 被这次改动依赖时查不出来** | 扩到「本次改动执行路径上的所有 flag」 |
| 3 | `ultra-init` 降级 | 宿主无法提问时「留空 one-line 并说明它是空的」。但空 north star 会让 C1 注入、边界回读、Change 的「触及边界」**全部失效** | 升级为：north star 为空时**拒绝进入 plan/dev**，而不只是声明 |
| 4 | `ultra-grilling` | Definition of done 是「Every branch reachable from the original ask is resolved」——**「every branch reachable」不可判定**，而且 owner 不答或反复改主意时循环没有出口 | 补一个可判定的收敛条件与退出：连续 N 轮没有新决策被确认 → 记录未决项交回调用方 |
| 5 | `ultra-change` | 三桶 reconciliation 要 owner 逐个 disposition。若查出 20 条，就要答 20 次——与「只在 taste 上打断人」冲突 | 按风险排序，低风险批量给推荐一次性确认，只对触及边界或疑似 REDUCTION 的逐条问 |
| 6 | `ultra-review` | 「`review-spec` is always selected; select other lenses only when their evidence can change a verdict」——**「能否改变结论」是语义判断，且交给了想省事的一方** | 反过来：默认全选，跳过某个 lens 要写明理由并记进 SUMMARY |

第 4 条尤其值得注意：`ultra-grilling` 自己是意图澄清的核心，却是这批 skill 里唯一一个 Definition of done 不可判定的——其余几个（init 的 read-back、dev 的六维、change 的三桶）都给了可检查规则。

### 10.5 值得固化为写作规范的部分

CLI 这批 skill 有一个统一骨架，本仓的 `commands/` 没有，建议固化：

- **四段式**：`Before you start`（固定读取序列）→ `Definition of done` → 主体 → `When the owner decides` → `References`
- **每个判据给可检查的规则，不给印象**（dev 的 `Answered when` 列、change 的三行适用性表）
- **「recommend the next one and stop; do not invoke it」**反复出现，防止 skill 之间自动链式调用
- **每个 skill 都写降级路径**：宿主没有原生提问、没有 subagent 时怎么办
- **写下反直觉决定的理由**，例如 `ultra-dev` 的「Do no refactoring here — `ultra-review` owns it, because what is worth restructuring only becomes visible after several slices」

## 十一、故意不做

- **阶段间的 graph 调度器 / workflow state machine**。理由见 5.2。若日后要做，前置条件是一个复现过的、file-first 路径修不好的失败。
- **实时文档同步引擎**。用 3.4 的正向链式 + 反向对账替代。
- **多套并存的兼容层**。见 3.7。
- **自动改写 spec 语义**。机制只负责让过时无法隐形（WITHDRAWN 分类 + 对账报告），改什么、怎么改留给模型和 owner。
- **权威收敛到单文件**（3.5 末段的减法方向）。方向记录在案，本轮不动。
- **change 单元是否引入**。2.2 依赖它，但可以先只做 init 那一层——项目级边界一旦真的存在，后续偏移才有东西可对照。

---

## 十二、未决议题（尚未讨论，按「不补会不会崩」排序）

### 12.1 迁移路径 — **阻塞实施第 2 步**

目录从 18 项降到 11 项，删掉 `PHILOSOPHY.md`、`templates/`、`wiki/`、`workflow-state.json`、`memory/`、`backups/`、`sessions/`、`delivery-report.json`，新增 `changes/`、`decisions/`、`evidence/`、根 `CONTEXT.md`。

**已经在用 Ultra 的项目怎么办？** 现在没有答案。而这个空白最危险的后果不是「旧项目坏了」，是**它会直接催生「同时兼容 v7 和 v8 两套」**——正是 3.8 唯一路径原则要杜绝的东西。

需要定的：一次性迁移脚本（`ultra-doctor --migrate`，备份先行）还是手工？旧结构的读取兼容保留多久、以什么条件删除（按 3.8，加兼容分支必须同时写下删除条件）？`.ultra/` 要不要引入 `schema_version` 字段，以便下次结构变更有据可依？

### 12.2 并发写 `.ultra` — **多 agent 一上就损坏数据**

7.7 写了「同一时刻只有一个 active change，要并行用 worktree」，但**没说 worktree 里的 agent 怎么写 `.ultra`**。两个 worktree 同时追加 `tasks.json` 或 `progress/*.json`，就是直接的数据损坏。

这不是理论风险：痛点 4（跨 CLI 派任务）加痛点 6（multi-agent 自动化）合起来，并发写是**必然发生**的。第四节的 delegate 用 worktree 隔离了源码，但 `.ultra` 是共享的。

CLI v0.26 处理过这个（每个 session checkout 把自己的 `.ultra` 链接到中央权威，并拿到不可覆盖的 DB/root 绑定）。本方案是 file-first，没有 DB，需要另一套答案：`.ultra` 是否只允许主 worktree 写、worker 只读？还是每个 worker 写自己的分片文件、由父进程归并？

### 12.3 非终态的退出路径 — 具体漏洞

`changes/active/<id>` 目前只有一条出路：归档（`git mv` 到 `archive/`）。**没有「放弃」这条路。** change 做到一半发现方向错了要扔掉，怎么办？

同类的还有：delegate 失败后 worktree 怎么收；`ultra-test` 一直不过时如何带着已知红项往下走；WITHDRAWN 问了 owner、owner 说「就是要收回」之后，谁去更新所有引用了那条边界的 task。

`agents-best-practices` 的硬要求是「每个非终态都要有受支持的退出」。现在这几处都没有。

### 12.4 这套改造自己的验收标准 — 方法论上的自我矛盾

整份方案没有任何验收标准。**我们花了六轮讨论「如何让目标可验证」，而方案自己没有可验证的目标。**

按 `CLAUDE.md` 的 verification 铁律，这不成立。需要一组能跑的场景 eval：

| 场景 | 验收 |
|---|---|
| 给一个模糊需求（「做个记账 app」） | 六问能否问出符合 2.6 标准、可用来否决具体决策的边界 |
| 提一个越界改动 | 是否被 3.2 拦住并回到 owner |
| 提一次 spec 收缩 | 是否被分类为 WITHDRAWN 并停下 |
| **换一个 agent / 换一个宿主接手** | 能否只靠读 `.ultra` 继续，无需追问（**与 `ultra-v026-skill-first.md` §3 是同一件事**，见下） |
| 一个小 bug 修复 | 是否走 2.3 直通，而不是被迫跑完整 change |

第四行尤其重要：**「跨 agent 记忆载体」是整套设计的核心定位，但它从未被真正测试过。**

**它不是新工作，是 v0.26 遗留的唯一未完成项。** `ultra-v026-skill-first.md` §3 记录：2026-08-01 尝试真实模型续接时，Claude 2.1.220 返回 `Not logged in`，Codex 0.144.4 返回 `401 Unauthorized`，两次都在 exit 1 上失败，测试仓仍停在 seed HEAD。源码侧的 packet、argv、permission、Git diff、timeout、receipt 都已被确定性 fixture 覆盖，**但 provider 认证与输出质量不能由 fixture 代替**。

完成它需要 owner 单独授权其一：在两个隔离 HOME 中分别登录；或允许 session-only plugin 复用现有认证并设定两次调用的费用上限。

**这条 eval 应该在实施第 1–5 项落地之后立刻跑**——它同时验证 v0.26 的遗留项和 v8 的核心定位，一次投入两份收益。

### 12.5 适用边界 — 什么时候不该用 Ultra

一个 50 行脚本要不要跑 init 六问？没有明确的「不适用」声明，用户会在不该用的地方用，然后判定它笨重——而这个判断一旦形成就很难扭转。

需要一句能写进 README 的话，明确下界。

### 12.6 产品服务谁 — **已确定**

**用户是工程师，产出物面向真实编程。** 「10 岁 teenager」指的是**表达能力**而非技术能力：他懂技术，也知道自己大概要什么，但**说不清楚**——说出来的是形式，要的是角色（1. 的 daily briefing app 例子）。

由此确定：

- `.ultra` 的产出物形态**不变**，继续面向工程师（`specs/architecture.md`、`tasks.json`、`evidence/`、TDD 红绿都保留原样）。不需要「给人看的」和「给 agent 看的」分层。
- 需要降门槛的**只有意图澄清环节**：六问要能听懂他没说明白的意思，不能死板地按字面理解。
- 因此 2.5 的「重构性提问」是这套设计里唯一为表达能力做的让步，其余环节按工程标准来。

**这条同时给 2.4/2.5 定了一个执行原则**：意图澄清的目标不是让用户把需求说完整（他做不到），而是**由 agent 把他说的形式翻译成他要的角色，再拿回去确认**。提问是翻译的手段，不是问卷。

## 十三、实施顺序

**基准是 CLI v0.26，不是本仓。** 先前版本按本仓现状排，落地仓库定为 CLI 后已作废——第九节的缺陷批修整条消失（只剩 #7 待核），delegate 无需移植（已有），目录重构缩水为微调（CLI 已是 9 个条目）。

### ✅ 第一批：已完成（2026-08-03，未提交）

验证：`npm run test:all` → Node **106 pass / 0 fail**，Hooks **8 passed**。

| # | 内容 | 落点 |
|---|---|---|
| 1 | **`ultra-grilling` 补重构性提问** — Extract / **Reframe** / Ask 三步；框架五问；done 从「every branch reachable」（不可判定）改为「caller 声明的每个字段」；补三种退出（Resolved / Stalled / Unavailable） | `ultra-grilling/SKILL.md` 79→118 行；新建 `references/reframing.md` |
| 2 | **`ultra-init` 边界出口质量标准** — Hard Constraint 带 `HC-<n>` id 且必须能否决具体技术决策；success metric 是阈值不是愿望；空 north star 从「声明」升级为**阻断 plan/dev** | `ultra-init/SKILL.md` |
| 3 | **`Verification` 强制可执行** — 必须是有退出码的命令；新增「Why verification has to be executable」（三个下游消费者 + 判断题不进 Acceptance，走 taste） | `ultra-change/references/change-contract.md` |
| 4 | **提示词六处修正** — `tests_written` 要有断言而非碰文件；`feature_flags_audit` 扩到执行路径上所有 flag；change 三桶按风险分级、低风险批量确认；review **六 lens 默认全选**，跳过要写理由进 SUMMARY（另两处并入 1、2） | `ultra-dev`、`ultra-change`、`ultra-review` |
| 5 | **PHILOSOPHY C5 扩写** — 决策三分类表 + 「打断频率测量的是 north star 而非工作量」+ 「边界只增不改」；两处 REDUCE/REDUCTION 消歧 | `docs/PHILOSOPHY.md`、`change-contract.md` |

### ✅ 第二批：3.2 收尾 + 两个未决议题（2026-08-03，commit `<pending>`）

| 内容 | 落点 |
|---|---|
| **3.2 另一半**：task context 新增 `**Hard Constraints**` 字段；`ultra-plan` 的 done 定义要求每个 context 声明可能违反的 `HC-<n>`，验证步骤新增「解析每个 `HC-<n>`，dangling 与 dangling `trace_to` 同罪」 | `.ultra-template/contexts/TEMPLATE.md`、`ultra-plan/SKILL.md` |
| **12.3 放弃路径**：`git mv active/<id> abandoned/<id>` + 一行原因；已完成 task 保留 evidence；owner 决定 | `ultra-change/SKILL.md` |

写下判据时定的一条规则：**只要「可能违反」就要声明，不必等到「预计会违反」**——一行成本换一个可检查的问题，`none` 是合法答案。

### ✅ 12.2 并发写 `.ultra` — 已关闭（代码 + 测试）

**先前只是推荐，实际核查发现漏洞真实存在**：`writable_roots: ["."]` 在契约里被明确定义为「grants the whole isolated checkout」，而 worktree 里带着 `.ultra` 的 checkout——所以 worker 能写 `tasks.json`。写了个测试证明：worker 改 `.ultra/tasks.json` 后返回 `finished`，本该 `failed`。

**双层强制**（TDD，先红后绿）：

| 层 | 位置 | 行为 |
|---|---|---|
| 启动前 | `bin/delegate.cjs` permission 校验 | `writable_roots` 含 `.ultra` 或其子路径 → 拒绝启动 |
| 结束时 | `bin/delegate-worker.cjs` `authorized()` | 实际 diff 触及 `.ultra` → `unauthorized_write`，**`.` 授权也不例外** |

第二层是关键：第一层挡显式声明，第二层挡 `.` 和一切意外。判据是 `.ultra` 前缀匹配，纯机械。

新增测试 2 个（`tests/delegate.test.cjs`），套件 106 → 107。

### ✅ 第 6 项：收敛循环 — 只进 `ultra-dev`，**不进 `ultra-test`**

`ultra-dev` 新增 `## Converge on the acceptance set`：开发的终点是验收命令通过，不是代码看起来写完了。三个机械出口——Converged（全部退出 0）、Stalled（连续两轮通过数不变）、Unreachable（验证命令自身报错而非断言失败 → criteria 写错了，立刻交回，不再消耗轮次）。停滞检测复用 `ultra-review` 的形状，指标从 P0+P1 换成通过的 AC 条数。另加一条：本轮通过数比上轮少就是回归，要明说，不许平均进"进度"。

**推翻方案原定的「`ultra-test` 也加循环」。** 理由是 `ultra-test` 的定位：它是 C4 唯一允许的 terminal sensor，而且**它的发现是它自己产生的**（orphan、stub、coverage gap）。给自产发现加自动修复循环 = 自己出题自己答，正是 v7 那个「agent 改测试来逃脱门禁」的病换个形态。

关键区分：**`ultra-dev` 的循环盯的是外部给定的 AC**（Change intent 里 owner 确认过的），目标不是它自己定的，所以循环安全；`ultra-test` 若循环，目标就是自己定的。修复动作本来就归 dev 和 review，两者都已有停滞检测，不需要第三处。

### ✅ 第 9 项：出场对账 + 唯一交付硬门

**出场对账**（3.4）：`ultra-deliver` 第 3 步从「public behavior 变了就更新 CHANGELOG 和 README」改为「列出仓库所有文档文件，读本次 Change 的完整 diff，逐处修掉现在描述了已不存在行为的地方」。指南里过时的示例、runbook 里改过名的 flag、API 说明里废弃的字段，漂移方式相同、发现方式也相同。

并明确它**不与 `ultra-change` 的三桶重复**：进场问「这个 Change 写之前 spec 就已经和代码不一致了吗」，出场问「这个 Change 刚刚让哪些文档变错了」。一个防止 intent 继承漂移，一个防止 Change 留下新漂移。

**No-MVP 硬门**（3.7）：整套流程里唯一的 gate。

| 要素 | 内容 |
|---|---|
| 不变量 | 本次改动的每个 export，要么有非测试消费者，要么被显式声明为内部 |
| 事实来源 | `.ultra/test-report.json` 的 Wiring Verification 结果，绑定当前 HEAD——**复用审计已有的发现，不重新扫描** |
| 阻断的效果 | 打包及其后的发布效果。**本地 commit 与归档不受影响** |
| 修复路径 | 接上调用方，或在 `delivery.md` 记录 owner 处置（声明内部 API + 理由），任一即可放行 |

两条设计理由写进了 skill：一是「写完没接上」是唯一能通过其它所有检查的缺陷（测试绿、review 干净、证据齐全、功能不存在），此处用 advisory 必然在最该起作用时被忽略；二是门放在最后一步而非编辑期——**编辑期的门会被「破坏工作本身」绕过**。

不需要改 PHILOSOPHY C3：C3 的自测是「统计所有 **hook** 的 blocking 输出」，这个门在 skill 里；且打包本来就已是需单独授权的外部效果，这只是加了个前置检查。

### 需要少量代码

6. **收敛循环搬到 `ultra-dev` / `ultra-test`**（6.6）。**复用 `ultra-review` 已有的停滞检测**（P0+P1 不降即停、三次修复失败判架构问题），指标换成「通过的 AC 条数」。依赖第 3 项。
7. **目录微调**（第七节）：加 `.runtime/`、`relations.json` 来源指纹、确认 `progress/` 与 `evidence/` 归属。CLI 已接近目标结构，工作量远小于本仓。**前置：12.1 迁移路径**——CLI 有 `bin/install.js` 可承载，但迁移语义要先定。
8. **Claude 侧 7 路并行编排**（4.4）。`ultra-review` 现在只说 "use the host's native bounded subagents"，需要 Claude adapter 的具体实现；其他宿主继续顺序跑同一批 references。
9. **`ultra-deliver` 出场对账**（3.4）+ **No-MVP 交付硬门**（3.7）。
   注意与 `ultra-change` 的三桶**不重复**：change 是**进场对账**（防止在已不一致的 spec 上叠加），deliver 是**出场对账**（修掉本次改动造成的漂移）。gstack 两头都有。

### 最后

10. **review 两段串联**（4.4）：7 路聚合结果 delegate 给其他 CLI 复核。依赖 8。
11. **research / test 阶段内 fan-out**（5.2）。纯性能与隔离优化，不改语义。

**硬约束只有两条**：第 3 项先于第 6 项（没有可执行的 verification，循环就没有终止条件）；12.1 先于第 7 项。其余按人力并行。

**1–5 项加起来就能验证方案的核心假设**——意图澄清是不是真的能把「说不清的需求」变成「可判定的边界」。建议先做完这五项，跑一遍 12.4 的场景 eval，再决定 6–11 怎么排。

---

## 待 owner 决策

1. ~~落地仓库~~ — **已定：CLI v0.26**。本仓冻结后归档。见文首。
2. ~~是否接受 wiki/relations 退出 git~~ — **已否决并修正**。判据换成「可否确定性重建」（3.5）：`.ultra` 默认全部进 git，只有 `.runtime/` 例外；`relations.json` 留下但带来源指纹；`progress/*.json` 必须留（先前判断有误）；`wiki/` 直接删（3.6）。
3. ~~是否引入 change 单元~~ — **已确定引入**，且提前到实施顺序第 2 步。理由：7.7 的目录设计以它为骨架，`orphan-trail`、`delivery-report.json`、`workflow-state.json` 三处都靠它才能删干净。
4. ~~`PHILOSOPHY.md` 与 `templates/` 移出项目~~ — **CLI 已经是这样了**（模板在 `skills/ultra-tdd/references/templates/`，哲学在 `docs/PHILOSOPHY.md`，随包分发）。仅本仓需要这个动作，而本仓将归档，故此项作废。

### 尚需你定的，只剩三件

| # | 事项 | 阻塞什么 | 我的推荐 |
|---|---|---|---|
| A | **12.1 迁移路径**：已用 v0.25 及更早 `.ultra` 的项目怎么升到 v8 结构 | 实施第 7 项 | 一次性脚本挂在 `bin/install.js --migrate`，备份先行；旧结构读取兼容只保留一个 minor 版本，并把删除条件写进 CHANGELOG |
| B | **12.2 并发写 `.ultra`**：多 worker 同时写 `tasks.json` / `progress/` | delegate 的实际放量使用 | `.ultra` 只允许主 worktree 写，worker 全部只读；worker 的产出走 `result.json` 由父进程归并 |
| C | **12.3 非终态退出**：`changes/active/` 只有归档一条出路，没有「放弃」 | 一旦有人开了 change 又想扔掉 | 加 `changes/abandoned/<id>/`，`git mv` 过去并要求写一行原因 |

三件都不阻塞实施第 1–5 项。
