# Ultra Builder Pro v0.26 — Skill-first 重构

> 状态：**设计全部定稿并经 Owner 认可；切片 0 已落盘；切片 1 步骤 1/2/4 已落盘并验证；
> 步骤 6 阻塞于一个待定的文件契约决定（见 §0）**
> 最后更新：2026-08-01
> 当前基线：commit `8139641`（切片 1 三个 model-invoked skill 已进主线）
> 本文是本次重构的唯一施工 WIP。稳定契约进入 `docs/` 正式文档后删除本文。

---

## 0. 下一个 session 从这里开始

### 规则侧资产住哪：Owner 已定 B（2026-08-01）

**`.ultra/` 只装项目数据；`PHILOSOPHY.md` 与 `templates/×6` 是规则，随包走、被引用。**

导致这个决定的事实：五个 adapter **都不分发 `.ultra-template/`**——它今天只随 npm 包走，由
`mcp-server` 从自己的包目录读（`init-project.cjs:31`）。纯文件 init 没有 MCP，拿不到模板源。
而本文 §9b 自己写过「Goal 1 是规则，跟着 Ultra 走；north-star.md 是数据，跟着仓库走」，按这条
判据宪法与可运行参考代码都在规则侧，复制进项目等于同一份宪法在 N 个项目里 N 份各自漂移。

**落地不需要任何新机制。** skill 自己的 `references/` 就是「随插件走」的载体：五个 adapter 的
`copyTree` 已经完整分发它（`ultra-research/references/` 17 个文件就这么走的，非 `.md` 原样透传
已验证），且跨 skill 相对引用 `../<skill>/references/<file>` 是既有且被测试锁定的模式
（`ultra-init` 引用 `../ultra-think/references/interaction-boundary.md`）。因此原计划的
`{{ULTRA_ROOT}}` 占位符、host-profile 单表、adapter 分发改造**全部不需要**——步骤 6 由此消解。

新位置：

| 资产 | 位置 | 理由 |
|---|---|---|
| `templates/×6` | `skills/ultra-tdd/references/templates/` | tdd 是唯一消费者 |
| C5 判据（EXPANSION/CORRECTION/REDUCTION 表） | `skills/ultra-think/references/autonomy-boundary.md` | 三个 model-invoked skill 跨引用；think 已是决策类 reference 的既有归属 |
| `PHILOSOPHY.md` 全文 | `docs/PHILOSOPHY.md` | 它是 Ultra 自己的宪法，给 owner 与开发者读；skill 运行时只需要 C5 那一段 |

`.ultra-template/` 保留的都是数据侧：`north-star.md`、`contexts/TEMPLATE.md`、`specs/`、
`tasks/`、`changes/`、`reports/`、`docs/research/`、`templates/task-context.md`
（后者仍有活消费者 `artifact-registry.cjs:36`、`migrate.cjs:249`，属第 7 步）。

移动前已核实零活消费者：`hooks/` 下**没有** `post_edit_guard.py`（`WORKFLOW_HOOK_FILES` 九个
hook 里也无它），Contract Table 里那两行指向的是尚未恢复的 hook；`grep` 全仓无任何代码读
`PHILOSOPHY` 或 `templates/testcontainer`。

### 已完成

全部设计定稿（§1–§7、§9a）＋ 切片 0 落盘并验证（§9b）＋ **切片 1 的三个 model-invoked
skill**（步骤 1、2、4；每个都跑过完整 `npm run test:rest`）：

| commit | 内容 |
|---|---|
| `ac19ace` | 修切片 0 的接线缺口：`templates/.ultra` 才是开发仓的默认模板源，8 个文件此前只落在 `.ultra-template/` |
| `1d6efef` | `ultra-grilling` ＋ 新增 `MODEL_INVOKED_SKILLS` 类别（第三类：模型可达、owner 不可路由、无 MCP、无 command 投影） |
| `ae8c3b2` | `ultra-domain-modeling`；`CONTEXT.md` 格式内联于此，不建第九个固定文件 |
| `8139641` | `ultra-tdd`；C2「每条禁令附可运行替代」由测试机械校验 |

三条与计划的偏离，均已在对应 commit body 说明理由：

1. **`.ultra-template/CONTEXT.md` 模板不建**（§10 原列为未做）。`.ultra-template/` 下一切都会被
   复制进 `.ultra/`，而 `CONTEXT.md` 按设计在仓库根；`templates/` 又契约上只放可运行代码
   （其 README 要求「drop in, install deps, run tests」）。十四行不可运行骨架两处都不适合，
   故内联进写它的 skill，顺带消除「skill 说一套模板写一套」。已有测试双向锁定。
2. **步骤 6（host-profile）提到 3、5 之前**。纯文件 `ultra-init` 必须引用已安装包内的资产，
   这是 3 的前提。原文顺序理由只覆盖「model-invoked 先于 user-invoked」，未涉及 6 与 3 的相对
   次序。
3. **host-profile 暂不建单表**。§5 那张七字段表里，切片 1 只会用到 `rootVar` 与
   `subagentHow`；`register` 收敛属于第 7 步 adapter 重写。现在建表等于五个字段的装饰。
   本步只加资产解析所需的最小机制，表推迟到 adapter 重写时。

### 下一步

Owner 定完上面那一个决定后：步骤 6（资产解析机制）→ 3（`ultra-init`）→ 5（`ultra-change` +
`ultra-dev`）→ 7（本仓跑通真实小改动 + 跨宿主续接验证）。

步骤 3、5 会撞上 `tests/skill-authoring.test.cjs` 的
`public workflow skills use the narrow MCP kernel`——它要求每个 `CORE_PUBLIC_SKILLS` 含
`ultra.*` 调用。改写为纯文件时该断言必须迁移为「已改写的 skill 不含 MCP 调用且执行开始前三步」
的形式（只增强不弱化），并把 `ultra-review` / `ultra-think` 从 `CORE_PUBLIC_SKILLS` 重分类进
`MODEL_INVOKED_SKILLS`（§6b.0 定为 5 个 model-invoked，现只落了 3 个）。

### 旧「已完成」记录

**已落盘的实物**（8 个文件，全部新增，未改任何现有源码）：

```text
.ultra-template/PHILOSOPHY.md          4 目标 + 5 戒律 + Contract Table
.ultra-template/north-star.md          One-line + Success Metric + Hard Constraints
.ultra-template/contexts/TEMPLATE.md   含 Resume Note / Open Questions / Change Log 分类列
.ultra-template/templates/×6           testcontainer-{ts,py}、vertical-slice、
                                       persistence-real、feature-flag-audit、README
```

已验证：`mcp-server/lib/init-project.cjs:99 copyTemplate` 是无过滤递归复制，实跑输出 20 个文件，
8 个新增全部落盘——既有 `ultra-init` 路径无需改动即可分发。

**下一步＝切片 1**（§8 第 1 条），按此顺序：

1. `ultra-grilling`（model-invoked）—— 规格见 §6b.9
2. `ultra-domain-modeling`（model-invoked）—— §6b.10；同时补
   `.ultra-template/CONTEXT.md` 空模板（§10 列为未做）
3. `ultra-init`（user-invoked，消费上面两个）—— §6b.1
4. `ultra-tdd`（model-invoked）—— §6b.11
5. `ultra-change` + `ultra-dev`（user-invoked）—— §6b.3、§6b.5
6. `adapters/_shared/host-profile.cjs`（§5），装到 claude + codex
7. 在本仓自身跑通一次真实小改动，验证 claude 起 / codex 续仅凭文件成立

**顺序理由**：model-invoked 是被复用的底座，先写它们才能验证「user 调 model」这条结构约束在
五宿主上真的成立。反过来先写 user skill，纪律内容会被复制一遍然后就再也拆不开——那正是
v0.25.1 的病因。

**开工前必读**：§6b.0（三层结构、共用契约、SKILL.md 写作标准与六失败模式）、
§9a（判据必须锚在可核对的结果上）、`.ultra-template/PHILOSOPHY.md`（每条约束都要能追溯到某条戒律）。

---

## 1. Owner 确认的产品定义

Ultra 是**跨五宿主的工程方法论资产包**，本质是一个最小化脚手架的雏形：

- 决策被记录，并且**可以被调用**；
- `tasks.json` 维持状态：跨上下文、清空上下文、换宿主之后，仅凭文件即可知道任务进度；
- 可以在当前 CLI 内自由委派其他 CLI。

它不是 workflow engine、不是 project database、不是 MCP capability provider、不是常驻
orchestrator。

## 2. 现状事实（v0.25.1，已复核）

| 区域 | 行数 | 处置 |
|---|---|---|
| skills | 2,420 | 重写并扩充 |
| commands | 110 | 删（11 个文件全是 10 行重定向，零语义） |
| agents | 425 | 转 references |
| hooks | 2,981 / 9 个 py | 留 3 个 |
| mcp-server | 62,917 | 删 |
| orchestrator | 9,762 | 删（`startSessionProcess` 要求调用方传 command，仓库内无人传；daemon 默认 `auto_dispatch:false`，默认路径不可达） |
| adapters | 12,587 | 收敛到 host-profile，估算降至 ~1,500 |
| ultra-tools | 4,165 | 删（其自身注释声明「authoritative task mutations stay on the live MCP server」，MCP 删除后无职责） |

对照原版 `ultra-builder-pro` v6.9.0（commit `a82a9d7`，零 MCP / 零 DB / 零 orchestrator）：
语义资产 33,200 行 → 5,900 行（-82%），机械层 0 → 85,300 行。`commands/ultra-dev.md` 455 行
→ `skills/ultra-dev/SKILL.md` 66 行，其中过半是 MCP 调用协议。

另有 `mcp-server/lib/legacy-change-workflow.cjs` 117 KB，除测试外无人 require，但被
`package.json` 的 `files: ["mcp-server"]` 收入发布包。

## 3. 目标装载面：49 → 19

> 更正：本文首版此表合计写作「39 → 13」，是算术错误。现值为实测：
> commands 11 + skills 18（11 public + 4 internal + 3 collab）+ agents 10 + hooks 9 + MCP 1 = 49。

| | v0.25.1 | v0.26 |
|---|---|---|
| commands | 11 | 0 |
| public skills | 11 | 8（user-invoked） |
| internal skills | 4 | 5（model-invoked） |
| collab skills | 3 | 0（并入 `ultra-delegate`） |
| agents | 10 | 0（转 `ultra-review` 的 lens references） |
| router | 0 | 1 |
| hooks | 9 | 5 |
| MCP server | 1 | 0 |
| **合计** | **49** | **19** |

规格全文见 §6b。下表为速查。

### 十四个 Skill

**user-invoked（8）**——编排，只能由 owner 键入，零常驻 context load：

| Skill | 职责 | 相对 v0.25.1 |
|---|---|---|
| `ultra-init` | `ultra-grilling` 引导捕获**授权**（north-star）与**主张**（discovery §0）；建骨架；`git init` 必做；模板逐项验证 | 从「复制模板」升级为语义产出 |
| `ultra-research` | 逐条验证 Init 的主张；17 step-file just-in-time；写即落盘；架构判断引用同类项目真实实现；闸门 17→3 | 恢复原版纪律并降低打断 |
| `ultra-change` | 对账 spec ↔ 现实（四步有界 diff）→ 三桶 → 定界 | 删除 DB mutation |
| `ultra-plan` | Scope Mode →【决策 ticket 先行】→ tracer bullet 切片 →【seam 清单确认】→【wide refactor expand-contract】→ Walking Skeleton / Contract / Integration Checkpoint → Plan Verification | 恢复第一层防御 + 三项新增 |
| `ultra-dev` | 【实现计划先成文】→ `ultra-tdd` → 六维证据 → `ultra-review`；Dual-Write 反向边 | 恢复第二层防御 |
| `ultra-test` | **系统级完整性审计**：Anti-Pattern → Coverage Gap → **Wiring** → E2E → Perf → Security；永不 block | 恢复第三层防御 |
| `ultra-deliver` | `ultra-review` 六 lens →【refactor 在此】→ 文档 → 构建 → 版本 → 归档 | 吸收原版 review 编排 |
| `ultra-delegate` | 把任意一段派给另一个 CLI；后台 + wait script + 只读 `result.json`；共识置信度三档 | 取代 `cc-collab`/`codex-collab`/原 `ultra-verify` |

**model-invoked（5）**——可复用纪律，agent 与其他 user skill 均可调用：

| Skill | 职责 | 调用方 |
|---|---|---|
| `ultra-grilling` | 一次一问、每问附推荐答案、事实自查只交出决策、未确认共识前不动手 | init、change |
| `ultra-domain-modeling` | 维护 `CONTEXT.md` ubiquitous language；ADR 三条准入 | init、research、change、dev |
| `ultra-tdd` | 只在已确认 seam 上 red→green；三反模式；mock 只在系统边界；**无 refactor** | dev、change |
| `ultra-review` | 六 lens 后台并行 + Zero Context Pollution + Stall/Circuit Breaker；**refactor 归此** | dev、deliver |
| `ultra-think` | 对抗性分析四法；decision ticket / fog of war | owner、change、plan |

**router（1）**：`ultra-status` —— 只读，8 条产物路由 + 风险检测 + 安装健康（吃掉 `ultra-doctor`）。

消失的入口名：`ultra-verify`、`ultra-doctor`。`ultra-review` 从 user-invoked 降为 model-invoked。

`ultra-test` 保留原名，其 `SKILL.md` 第一行必须写死：
**「NOT for running unit tests (that's `ultra-dev`). This audits whole-system integrity before
delivery.」** —— 原版即用这一行消除误导，本次沿用。

### `ultra-change` 的新语义（本次重构的核心修复）

Owner 诊断的真问题：大流程结束后的小改动使 spec 变静态，逐步与实际功能偏移。

因果是**更新 spec 太贵**（旧路径要 change contract → typed delta → checkpoint → digest
rebind），贵到被绕过，于是漂移。加机制正是漂移的成因。

新流程是「对账优先」：

1. 定位本次改动会碰到的 spec 章节；
2. 拿 spec 与当前代码/测试/`git log`（自 spec 上次变更以来）对账；
3. 输出三桶：spec 说了代码没做 / 代码做了 spec 没说 / 两者冲突；
4. 判断改代码、改 spec、还是都改并新记一条 decision；
5. 产出 change intent 文件 + spec 补丁。

**不并入 `ultra-plan`**：`plan` 是拆 task，小改动不需要拆；`change` 是对账定界，小改动最需要。
合并会让小改动被迫走 plan 或绕过对账，重新制造漂移。

### agents 的处置与代价

六个 review lens 变为 `skills/ultra-deliver/references/review-lenses/{code,design,errors,tests,spec,comments}.md`。
`SKILL.md` 指示模型用宿主原生 subagent 机制，每个 lens 起一个，以该文件为完整指令。

- 收益：取消逐宿主 agent 格式翻译（Codex→TOML、Grok→agents/、Claude→plugin agents）；
  lens 内容成为 host-neutral 纯 Markdown。
- **代价**：宿主 agent 注册表中不再出现这些 agent，无法单独 `@code-reviewer`。工作流内为零
  损失（`deliver` 本就六 lens 全上），仅影响独立调用单个 reviewer 的场景。Owner 已知悉。

## 4. 文件契约

本节取代现版 `docs/ARTIFACT-AUTHORITY.md`（该文档描述 digest 绑定与 DB 权威提升规则，随 MCP
一并作废）。一项语义只有一个 canonical path；仓库已有 `docs/`、ADR 或其他惯例时服从仓库。

### 4.0 五条原则

1. **一个文件只有一个 writer。** 两个 skill 写同一个文件即冲突源。下表每个文件只指派一个
   writer；多个 writer 出现时必须时机互斥。
2. **流水 vs 余额。** 决定「何时改」：
   - **流水**（append-only，永不改历史）：research、decisions、evidence、drift-log
   - **余额**（覆盖式更新，只反映现状）：specs、tasks.json、north-star、contexts
   同一事实在两处出现不是重复——一个记「当时为什么这么定」，一个记「现在是什么」。
3. **确认粒度 = 撤销成本。** 影响下游多个 task 或不可逆 → 硬确认；局部可逆 → 写完告知不拦。
4. **读取分三档，没有任何文件需要全量进上下文。**
   - 常驻注入（hook）：north-star 一句话 + 当前 task 的 Acceptance
   - skill 启动必读：`tasks.json` + 当前 task 的 context
   - 按 anchor 渐进读：specs / research / decisions，经 `trace_to` 精确定位
5. **机读用 JSON，人读用 Markdown。** JSON 仅三个：`tasks.json`、`test-report.json`、
   `progress/<task-id>.json`。

### 4.1 文件总数：9 固定 + 5 模板 + 5 类可变

```text
CONTEXT.md                         # 固定 1 —— 仓库根，不在 .ultra/ 下
.ultra/
├── PHILOSOPHY.md                  # 固定 2
├── north-star.md                  # 固定 3
├── templates/                     # 模板 5：testcontainer-postgres.{ts,py}
│                                  #   vertical-slice.ts persistence-real.ts
│                                  #   feature-flag-default-audit.sh
├── specs/
│   ├── product.md                 # 固定 4
│   ├── architecture.md            # 固定 5
│   ├── discovery.md               # 固定 6
│   └── research-distillate.md     # 固定 7
├── tasks.json                     # 固定 8
├── test-report.json               # 固定 9
├── research/<run-id>/             # 可变类 1
├── decisions/<id>.md              # 可变类 2
├── changes/active/<id>/intent.md  # 可变类 3（+ plan.md 按需）
├── changes/archive/<id>/
├── contexts/<task-id>.md          # 可变类 4
├── evidence/<task-id>/            # 可变类 5
├── progress/<task-id>.json        # 派生态，git ignore
├── drift-log.md                   # 派生态
├── reviews/<session>/             # 派生态
└── .runtime/                      # 派生态：delegations、worktrees
```

相对上一版删除三个文件，理由是双权威：`specs/quality.md`（已在 `architecture.md` §1 + §10）、
`specs/gaps.md`（已在 `discovery.md` §5）、`delivery-report.json`（git tag 即交付记录）。

`PHILOSOPHY.md`、`north-star.md`、`templates/` 是 hook 与 skill 的硬依赖：`ultra-init` 复制后
必须**逐项验证存在**，缺失即停——否则 hook advisory 指向坏路径，agent 直接忽略（原版记录的
真实失效模式）。

**`CONTEXT.md` 放在仓库根而非 `.ultra/` 下**，因为它是给所有读这个仓库的人和 agent 用的项目
词汇表，不是 Ultra 的私有产物。删掉 Ultra 之后它仍然有价值。这也是它与 `.ultra/specs/` 的分工：
词汇在根，内容在 `.ultra/`。多上下文仓库用根部 `CONTEXT-MAP.md` 指向各 `src/<ctx>/CONTEXT.md`。
懒创建：第一个术语被确定时才建。

派生态判定标准只有一条：**删掉它，工作流仍能从固定文件与可变文件完整恢复。**

Git 是历史、publication 与 rollback 边界。无 digest authority、无 registry、无 projection。

### 4.2 宪法层

| | `PHILOSOPHY.md` | `north-star.md` |
|---|---|---|
| 谁写 | Ultra 随包提供；owner 可改 | owner 首句自动捕获，或 `ultra-init` 询问 |
| 依据 | 已复现的失败案例 | owner 原始意图 |
| 确认 | 改它需三样：具体失败案例、对现有 hook/skill 的影响评估、依赖约束迁移 | init 时 AskUserQuestion 一次 |
| 格式 | 4 目标 + 5 戒律，每条附自检 Test + Contract Table | `## One-line` + `## Hard Constraints`，`---` 分隔 |
| 何时改 | 极少。它是唯一传导到全部 forbidden_patterns 与 agent prompt 的文件 | 产品方向真的变了 |
| 怎么读 | agent 推理时按需；skill 每条约束须可追溯到某条戒律 | hook 每次 SessionStart 注入 One-line + 当前 task Acceptance（C1） |

### 4.2b 语言层 `CONTEXT.md`

- **谁写**：`ultra-domain-modeling`（model-invoked），唯一 writer。
- **依据**：owner 在 grilling 中使用的词；research 中确立的术语；与代码的交叉验证。
- **确认**：术语确定的当下就写入，不批量攒着。与既有词表冲突时立即向 owner 指出并请裁定。
- **格式**：`## Language`（每条：粗体术语 + 一两句「是什么」的定义 + `_Avoid_: 同义词`）、
  `## Relationships`、`## Flagged ambiguities`。**纯 glossary，零实现细节，不当 spec、不当草稿本。**
  只收本项目特有的术语——通用编程概念（超时、错误类型、工具函数模式）不进。
- **何时改**：任何时候某个术语被锐化、被更好的词取代、或与代码发现矛盾时。它是**余额**不是流水。
- **怎么读**：**读它取词汇是任何 skill 的一行习惯**（开始前三步的第 3 步），不需要调用
  `ultra-domain-modeling`；只有*改变*词表时才调用那个 skill。

它与内容层的分工：`CONTEXT.md` 装**词汇**（术语怎么叫），`specs/*.md` 装**内容**（系统是什么样），
`research-distillate.md` 装**摘要**（内容的压缩版，给 plan 用），`decisions/*.md` 装**裁定**
（当时为什么这么定）。

### 4.3 规格层 `specs/{product,architecture,discovery}.md` + `research-distillate.md`

- **谁写**：`ultra-research`（首次建立）、`ultra-change`（对账后修正）、`ultra-dev` 的
  Dual-Write（实现中发现偏差）。三个 writer，时机互斥，不并发。
- **依据**：research 的来源引用；对账时的代码/测试/git log 实证；实现中的真实发现。
- **确认**：research 每步 `[C] Continue` 闸门。Dual-Write 分三类——**EXPANSION**（新需求，
  直接写）、**CORRECTION**（纠错，直接写）、**REDUCTION**（缩范围，AskUserQuestion 硬拦）。
- **格式**：product §1-6、architecture arc42 §1-12、discovery §0-5。未填处保留
  `[NEEDS CLARIFICATION]` 标记——它是 `ultra-plan` 的 BLOCK 条件。
- **何时改**：仅 EXPANSION / CORRECTION / 已批准的 REDUCTION。**可长大、可纠错，绝不悄悄缩水。**
  每次改在对应 context 的 Change Log 留一行。
- **怎么读**：**永远按 anchor**，靠 `trace_to: specs/product.md#user-authentication`。
  distillate 仅 `ultra-plan` 读。

### 4.4 研究层 `research/<run-id>/{brief,<aspect>,99-synthesis}.md`

- **谁写**：`ultra-research`，唯一 writer。
- **依据**：强制 web search + 来源引用，无例外。
- **确认**：每步写完立即落盘，再 `[C] Continue`。**禁止同时加载多个 step 文件。**
- **格式**：brief（问题、范围、来源、处置）→ 分面报告（observation / evidence / inference /
  unknowns）→ 99-synthesis（哪些进 spec、哪些进 decision、哪些仍是 gap）。
- **何时改**：**永不改**（流水）。同一问题重研究就开新 `<run-id>`。
- **怎么读**：只读 synthesis；分面报告仅在追溯来源时按需打开。

### 4.5 决策层 `decisions/<id>.md`

Owner 已确认独立成文件（2026-07-31）。原版把决策嵌在 spec 里，无法被精确引用，也无法记录
owner 与日期。

- **谁写**：任何 skill 可起草，`ultra-think` 是主要产出者。
- **依据**：question / options / trade-offs / evidence。
- **确认**：**仅 owner 接受或明确委托后才标记 accepted**；草稿保持可改。
- **格式**：question、options 与实质取舍、accepted decision、owner、日期、evidence、
  consequences、**what would change my mind**（撤销条件）。
- **何时改**：**accepted 后永不改**。推翻即新写一条并注明 `supersedes: <旧 id>`；旧条永久保留。
- **怎么读**：每个 skill 开头一句——「读 `.ultra/decisions/` 中与本次范围相关的条目；与之冲突时
  以 accepted decision 为准，除非 owner 明确推翻并新写一条」。这一句即「决策可调用」的全部实现，
  不需要检索机制。
- **已知风险**：spec 改了技术选型却不写 decision 会出现「余额变了但没有流水」，由
  `ultra-change` 的对账兜底。若实际使用中从不引用历史决策，应退回嵌入 spec——独立文件届时只是负担。

### 4.6 交付单元层 `changes/active/<id>/intent.md` + `tasks.json` + `contexts/<task-id>.md`

- **谁写**：intent 由 `ultra-change` 写；`tasks.json` 与 contexts 由 `ultra-plan` 创建、
  `ultra-dev` 更新状态。**`tasks.json` 单写者是主 CLI**，委派出去的 worker 永不可写。
- **依据**：intent 依据对账结果；tasks 依据 specs + 代码库分析。
- **确认**：`ultra-dev` 首次运行有 **Design Approval Gate**——展示 task 总数、优先级分布、
  复杂度、依赖、Walking Skeleton 是否为 Task #1，用户确认才开工；已有 task 处于
  completed/in_progress 则跳过（说明先前已批准）。
- **格式**：

```json
{
  "id": "3",
  "title": "Implement JWT login endpoint",
  "type": "architecture | feature | bugfix",
  "priority": "P0",
  "complexity": 4,
  "status": "pending | in_progress | completed | blocked",
  "dependencies": ["1"],
  "context_file": "contexts/task-3.md",
  "trace_to": "specs/product.md#user-authentication",
  "change_ref": "changes/active/C-01/intent.md"
}
```

  `complexity` 是「≥7 必须拆」与「context budget ≈ complexity×5%」两条规则的输入；`trace_to`
  是 evidence 六维中 `spec_trace` 的来源；`type` 用于标记 Walking Skeleton 与 Contract task
  为 `architecture`。三者均不可删。相对原版仅删 `estimated_days`（AI 开发的天数估计无意义）。

- **何时改**：每次状态流转都改，且**必须双写**——`tasks.json` 与 context 头部
  `> **Status**:` 同时更新，改完各读一次确认。单写会导致 resume 时两处不一致（原版标 MANDATORY）。
- **怎么读**：**任何 skill 启动第一件事**——读 `tasks.json` → 找 in_progress 或指定 task →
  读其 context → 读 context 末尾 resume note。这是跨上下文、跨宿主续接的全部机制。

### 4.7 证据层 `evidence/<task-id>/*` + `test-report.json`

- **谁写**：`ultra-dev` 写 `test.md`；`ultra-deliver` 的六个 review lens 写 `review.md`；
  `ultra-test` 写项目级 `test-report.json`。
- **依据**：真实命令的真实输出。
- **确认**：不需要。证据是事实，不是提案。
- **格式**：evidence 用 Markdown；`test-report.json` 机读，**必须含 `git_commit` 字段**。
- **何时改**：**永不改，只追加**（流水）。
- **怎么读**：`ultra-status` 与 `ultra-deliver` 读 `test-report.json`，并执行一条关键检查——
  **`test-report.git_commit ≠ 当前 HEAD` 即判定「测试已过期」**，阻止拿旧结果发布。

### 4.8 派生态

`progress/<task-id>.json`（evidence 六维，`post_edit_guard` 每次 Edit/Write 更新）、
`drift-log.md`（C5 越界记录）、`reviews/<session>/`（review lens 的 JSON 输出）、
`.runtime/`（delegations 与 worktrees）。

全部 git ignore，全部可删可重建，全部不是权威。

## 5. Easy to loading：host-profile 机制

现状根因：路径适配是散落的字符串替换（`adapters/opencode.js` 有一串
`text.replaceAll('$CLAUDE_PLUGIN_ROOT/skills', '~/.config/opencode/skills')`），每加一个宿主
抄一遍。

收敛为单表 `adapters/_shared/host-profile.cjs`：

```js
claude: {
  skillsDir:    '~/.claude/skills/ultra-builder-pro',
  rootVar:      '${CLAUDE_PLUGIN_ROOT}',
  agentsFile:   'CLAUDE.md',
  subagentHow:  'Task tool with subagent_type',
  hookRunner:   'python3',
  register:     registerClaudePlugin,   // ~30 行
  delegateArgv: (prompt) => ['claude', '-p', prompt, '--permission-mode', 'plan', ...],
}
```

Skill 源文件只出现两个占位符：`{{ULTRA_ROOT}}`、`{{HOST_SUBAGENT}}`，安装时按 profile 替换。

**加第六个宿主 = 一行 profile + 一个 ~30 行注册函数。**

已验证前提：五个 adapter 的 `copyTree` 对非 `.md` 文件原样透传（`claude.js:133`、
`grok.js:82`），因此 skill 内携带脚本在五宿主上今天即可用。

### CLI 表面（5 个动词）

```bash
ubp install [--host all|claude|codex|opencode|kimi|grok] [--global|--project]
ubp update
ubp uninstall
ubp doctor          # 装载面体检：路径、符号链接、版本、manifest
ubp delegate run    # 唯一的运行时能力
```

## 5b. 原版能力清点：丢失了什么（2026-07-31 逐文件复核）

复核范围：原版 `commands/*.md`（1,889 行）、`skills/ultra-{research,review,verify}`、
`.ultra-template/PHILOSOPHY.md`、`settings.json` hook 装配、`CLAUDE.md` 26 个 section。
存活情况用 `grep -rlE` 在 v0.25.1 全仓（排除 tests）实测。

### 5b.1 「局部 OK、整体爆炸」原版是三层防御，现全部失效

| 层 | 机制 | 原版位置 | v0.25.1 存活 |
|---|---|---|---|
| **1 计划时结构性预防** | Walking Skeleton 恒为 Task #1（P0，必须贯穿 entry point→use case→domain→persistence，验收＝一个真实请求穿过所有层返回真实数据） | `ultra-plan` §3.1 | 仅剩名词，无机制 |
| | Contract Definition task，必须**先于**两侧实现任务 | `ultra-plan` §3.2 | grep 0 |
| | Integration Checkpoint，每 3–4 个 feature task 插一个 | `ultra-plan` §3.3 | grep 0（skills 内） |
| | 依赖分析：任何只碰一层的 task 必须拆成 vertical slice 或合并 | `ultra-plan` §4 | grep 0 |
| | 质量标准：每个 feature task 触及 ≥2 层 | `ultra-plan` Quality Standards | grep 0 |
| **2 开发时逐任务传感** | RED 阶段测试维度含 Integration：至少一个测试证明本代码连上上下游边界 | `ultra-dev` §3 | 丢失 |
| | `evidence_score` 六维：`tests_written / tests_passed / persistence_real / feature_flags_audit / vertical_slice / spec_trace` | `ultra-dev` §4 + `hook_utils.EVIDENCE_DIMENSIONS` | grep 0 |
| | Pre-Commit：新模块可从至少一个入口到达（无孤儿代码）＋跨边界代码有集成测试 | `ultra-dev` §5.5 | 丢失 |
| **3 交付前系统性审计** | **Wiring Verification**：导出符号在非测试源文件中 0 引用＝orphaned；Component→API / API→DB / Form→Handler / State→Render；Stub 检测（`return []` 无 DB/API 调用、仅 `console.log`、仅 `preventDefault`、仅 Placeholder） | `ultra-test` §2.5 | 丢失 |

`ultra-test` 原文第 33 行：**「This is NOT for running unit tests (that's `/ultra-dev`). This is
for auditing overall project quality before `/ultra-deliver`.」** 它从来不是跑单元测试，是系统级
完整性审计。本次重构第一版把它并入 `dev`/`deliver` 是误判。

### 5b.2 其他丢失的设计

| 类别 | 丢失内容 | 原版位置 |
|---|---|---|
| **设计宪法** | 4 Core Goals（Intent Fidelity / Long-term Evolvability / Production-Ready / Cognitive Coherence）＋ 5 Commandments（C1 Goal-Always-Present、C2 Enabling>Defensive、C3 Sensors not Blockers、C4 Incremental Validation、C5 Bounded Autonomy），每条附自检 Test；冲突解决顺序 Goals>Commandments>Rules；Hook↔File Contract Table | `PHILOSOPHY.md`（grep 0） |
| **反漂移** | Dual-Write Mode：EXPANSION / CORRECTION / **REDUCTION 硬闸**（缩范围必须 AskUserQuestion）；「spec 可长大、可纠正，绝不可悄悄缩水」 | `ultra-dev` Dual-Write（grep 0） |
| | `review-ac-drift` 验收标准漂移专项 agent；`drift-log.md`；`north-star.md` + C1 注入 | agents/、hooks/（grep 0–1） |
| **可行替代（C2）** | `.ultra/templates/`：`testcontainer-postgres.{ts,py}`、`vertical-slice.ts`、`persistence-real.ts`、`feature-flag-default-audit.sh`。原则：每个禁止项必须附可运行替代，否则 agent 会把 `mock` 改名叫 `stub` | `.ultra-template/templates/`（grep 0） |
| **防过度纠正** | 三处明文教训：自动 fix→retry 循环导致「改测试以逃逸、偏离 spec」；硬性 final gate 与硬性 pre-commit gate 都触发过同一个过度纠正循环 | `ultra-test` §6、`ultra-dev` §4.5/§5.5 |
| | Stall handling：比较 recheck 前后 P0+P1 计数，不下降＝停滞→写 stuck-report＋三选项交用户 | `ultra-dev` §4.5 |
| | Circuit Breaker：单文件 3 次连续修复失败＝架构问题；3+ 文件＝系统性问题→`UNRESOLVED.md` 标 `ARCHITECTURAL_CONCERN` | `ultra-review` Fix Flow |
| **上下文卫生** | Zero Context Pollution：review agent 全后台＋只写 JSON 文件；**禁止 TaskOutput**；四条 CRITICAL PROHIBITION | `ultra-review` §3 |
| | wait script 轮询模式，两个退出条件：文件非空 **且** 连续两次轮询大小不变 | `review_wait.py` / `verify_wait.py` |
| | 每 agent 最多 12 条 finding、confidence ≥75；Mid-TDD compact checkpoint（复杂度≥6）；review 前 Context Checkpoint→`/compact`→读 `compact-snapshot.md` 恢复 | `ultra-review`、`ultra-dev` §4.4 |
| **会话连续性** | `workflow-state.json` 断点续跑；`pre_compact_context` / `post_compact_inject`；未合并分支恢复（列 `feat/task-*` 对照 tasks.json，发现已完成未合并即问用户） | `ultra-dev` §0/§2 |
| **计划质量** | Scope Mode：EXPAND / SELECTIVE / HOLD / REDUCE ＋ Commitment rule（选定后不许漂移）；Dual-scale effort 展示 | `ultra-plan` §0 |
| | Plan Verification：每个 User Story 必须有 task `trace_to`；无环；trace_to 有效；复杂度≥7 / >8 文件 / >20 任务 warn；context budget 每 task ≈complexity×5%，>40% warn | `ultra-plan` §5.5 |
| **思考质量** | Fact / Inference / Speculation 三级标注；Steel Man、Pre-Mortem、Sensitivity、Second-Order 四种对抗测试；结论必带 Confidence % ＋ Key Assumptions ＋ **What would change my mind** | `ultra-think` |
| **状态路由** | 从产物推断工作流位置的 8 条路由表（无需额外状态文件）；`test-report.git_commit ≠ HEAD` 即判定测试过期；标准化 ▶ Next Up ＋ `/clear` 续接块 | `ultra-status` §5 |
| **研究纪律** | 17 个 step-file just-in-time 加载，**禁止同时加载多个 step**；每步立即写入 spec；强制 web search ＋来源；`[C] Continue` 用户闸门不自动推进；`research-distillate.md` 供 plan 消费 | `ultra-research` |
| **初始化契约** | Step 4 模板复制清单＋逐项存在性验证，缺失即停（否则 hook advisory 指向坏路径） | `ultra-init` §4 |

### 5b.3 Hook 定位修正

原版 16 个 hook、4,083 行，按 C3 只有 `block_dangerous_commands` 真 block，其余全是 stderr advisory。

本次保留 5 个（上一版文档写「保留 3 个」是在未读原版时下的判断，作废）：

| Hook | 事件 | 职责 |
|---|---|---|
| `session_context` | SessionStart | 注入 north-star ＋当前 task acceptance（C1） |
| `mid_workflow_recall` | PreToolUse: Write\|Edit\|Grep | 注入当前 task acceptance 提醒（C1） |
| `pre_compact_context` / `post_compact_inject` | PreCompact / SessionStart:compact | 保存与恢复 `compact-snapshot.md` |
| `post_edit_guard` | PostToolUse: Edit\|Write | 更新 `evidence_score`（C4）＋ enabling advisory |
| `block_dangerous_commands` | PreToolUse: Bash | 唯一真 block：受保护分支 push、资金/链上交易、DB migration/DROP/TRUNCATE、硬编码密钥、用户输入驱动的任意代码执行 |

**Owner 新增约束（必须写进 hook 契约）**：每个 hook 第一步检查 `.ultra/` 是否存在，不存在立即
`exit 0` 静默。不启动 UBP 工作流时，Ultra 对宿主主流程零影响。

### 5b.4 委派设计修正

上一版文档第 7 节把 `ubp delegate run` 定为「同步阻塞」。原版 `ultra-verify` 与 `ultra-review`
已经用**后台启动 + wait script 轮询 + 只从文件读结果**的模式解决过同一问题，且经过实战调优
（含四条防止提前合成的 CRITICAL PROHIBITION）。该模式优于同步阻塞：不占主上下文、天然支持
并行多个 worker。第 7 节的「同步」判断作废，改为采用原版已验证的后台+轮询模式；仍不引入
daemon、supervisor 与跨 session 存活。

## 6. 提示词：80% → 90%（Owner 已认可，2026-07-31）

原版 2,631 行提示词质量已高，以下是逐文件复核后可量化的九个缺陷，不是重写。

| # | 缺陷 | 证据 | 改法 |
|---|---|---|---|
| 1 | 两套进度跟踪 | 每个 command 开头 25 行 Workflow Tracking 表（TaskCreate/TaskUpdate），另有 `workflow-state.json` | 删前者；宿主 TaskCreate 是会话内的，跨会话恢复靠文件。省 8×25 行，且该工具在 Codex/Kimi/Grok 不存在 |
| 2 | 步骤编号溢出 | `ultra-dev`：0, 0.5, 1, 1.5, 2, 3, 3.1–3.3, 4, 4.4, 4.5, 5, 5.5, 6, 7 | 多次插队的痕迹。改语义标题 |
| 3 | 同一规则重复三遍且措辞不同 | 「no auto-block」在 `ultra-dev` 3 次、`ultra-test` 1 次 | 统一引用 PHILOSOPHY 戒律编号 |
| 4 | 只说做什么不说为什么 | v7 改动处都写了 why 且质量明显高，老部分是清单 | 反直觉约束一律附一句为什么 |
| 5 | 无「什么时候不用我」 | 11 个 description 全在说何时用 | description 末尾加排除条件 |
| 6 | 宿主专属假设散落 | `mcp__claude-in-chrome__*`、`/compact`、`/clear`、Task tool、AskUserQuestion、TaskCreate | 换 host-profile 占位符 `{{HOST_SUBAGENT}}` `{{HOST_ASK}}` `{{HOST_COMPACT}}` |
| 7 | 判断类规则无示例 | 「什么算 stub」「什么算 orphan」全是定义 | 每个判断点配一个最小反例 |
| 8 | 验收写在文末 | Quality Standards / Success Criteria 都在末尾 | 前置到「完成的定义」 |
| 9 | description 质量参差 | `ultra-init` 带版本号且不说何时用；`ultra-verify` 列全触发词 | 全部按 `ultra-verify` 的标准重写 |

**骨架与写作标准见 §6b.0**（读 `mattpocock/skills` 的 `writing-great-skills` 后重写，取代本节
原有的骨架与披露判据；原骨架中的 `## 不要用它做什么` 已按 Negation 反模式废除）。

### 6.1 「90%」的可测验收

1. **常驻预算**：8 个 user-invoked ≤ 100 行/个，5 个 model-invoked ≤ 80 行/个，router ≤ 80 行；
   合计 ≤ 1,280 行。
2. **可追溯**：随机抽 10 条约束，每条能指出服务于哪条 Commandment；每个禁止项都能指到一个
   真实存在的 `templates/` 文件（C2 自检）。
3. **跨宿主可读**：任一 SKILL.md 交 Codex 冷读，它能说出「何时该用、第一步读哪个文件、
   什么算完成」。
4. **六失败模式自检**：每个 SKILL.md 逐条过 §6b.0 的表，特别是 No-op 与 Negation。

## 6b. 十四个 Skill 的规格

本节是 skill 层的唯一权威，合并了原 §6b（逐 skill 差距分析）与 §6c（外部思想吸收）。
每个 skill 给四样：**差距**（原版 / v0.25.1 / 丢了什么）、**判据**（可对照文件核对的分支规则，
见 §9a）、**产出**、**降级**（宿主缺能力时怎么退化）。

### 6b.0 结构、来源与共用契约

#### 三层结构

| 层 | 数量 | Skill |
|---|---|---|
| **user-invoked**（编排；零 context load，只能由 owner 键入） | 8 | `ultra-init` `ultra-research` `ultra-change` `ultra-plan` `ultra-dev` `ultra-test` `ultra-deliver` `ultra-delegate` |
| **model-invoked**（可复用纪律；agent 与其他 skill 均可调用） | 5 | `ultra-grilling` `ultra-domain-modeling` `ultra-tdd` `ultra-review` `ultra-think` |
| **router** | 1 | `ultra-status` |

**user skill 可调 model skill，不可调另一个 user skill。** 这条约束消除了原十平级方案的复制：
`grilling` 被 init/change 共用，`tdd` 被 dev/change 共用，`review` 被 dev/deliver 共用。

`ultra-verify`（原多 AI 交叉验证）并入 `ultra-delegate`；`ultra-doctor` 并入 `ultra-status`。

#### 外部来源提炼（2026-07-31 阅读记录）

来源：`mattpocock/skills`（22 个 skill 全读，本地 clone）、`Pythagora-io/gpt-pilot` agent 流水线、
原版 Ultra v7.0。取思想不取写法。

| # | 思想 | Ultra 缺口 | 落到哪 |
|---|---|---|---|
| 1 | Ubiquitous language 文件：纯词汇表，「定义 + `_Avoid_`」+ Relationships + Flagged ambiguities，零实现细节 | 有内容层无语言层 | 新增固定文件 `CONTEXT.md`；`ultra-domain-modeling` 维护 |
| 2 | Seam 在 spec 阶段商定，不在写测试时决定；优先复用已有 seam，用最高的 seam，理想数量为 1 | RED 阶段没说在哪测 | `ultra-plan` 产出 seam 清单；`ultra-tdd` 只在已确认 seam 上写 |
| 3 | Horizontal slicing 是测试反模式 | 无此概念 | `ultra-tdd` |
| 4 | Refactor 不属于 TDD 循环，属于 review | 原版 RED→GREEN→REFACTOR | `ultra-tdd` 去掉 REFACTOR；`ultra-review` 承接 |
| 5 | Grilling：一次一问、每问附推荐答案、事实自查只交出决策、未确认共识前不动手 | init 只复制模板 | `ultra-grilling` |
| 6 | user-invoked / model-invoked 两层 + router | 10 个平级 | 见上表 |
| 7 | Wide refactor 走 expand–contract，不强塞垂直切片 | 无 | `ultra-plan` |
| 8 | ADR 三条准入：难以逆转 + 无背景会觉得奇怪 + 真实取舍的结果 | `decisions/` 无准入标准 | `ultra-think` / `ultra-domain-modeling` |
| 9 | Decision ticket / fog of war：太大且路不清时先测绘不施工 | 无 | `ultra-think`，由 change/plan 调用 |
| 10 | 实现计划先于代码（Developer 与 Code Monkey 分离） | dev 直接进 TDD | `ultra-dev` |

#### 开始前三步（每个 user-invoked SKILL.md 开头）

1. 读 `.ultra/tasks.json`
2. 读当前 task 的 `context_file`，特别是末尾 `## Resume Note`
3. 读 `CONTEXT.md` 取词汇；读 `.ultra/decisions/` 中与本次范围相关的条目

这三步替代 hook，不依赖 hook。删掉全部 hook 工作流仍完整；反过来不成立。

#### 三条降级路径

依据 `docs/RUNTIME-COMPAT-MATRIX.md` 实测能力。

| 缺失能力 | 宿主 | 降级 |
|---|---|---|
| Hook 注入（SessionStart stdout 被忽略） | Grok Build（矩阵行 43 标 DEGRADED） | skill 自己执行开始前三步，行为不变，仅多花数百 token |
| 结构化提问 | Codex（仅当 mode 暴露）、Kimi（非 auto 模式）、Grok（仅当暴露） | 退化为一句直接问题；完全禁用时**记录未决 + 停在安全点**，既不默认放行也不卡死 |
| 后台任务 | 视宿主 | 顺序执行 lens，每个写完文件再跑下一个 |

五宿主均有 subagent 等价物（Kimi 为 Agent/AgentSwarm，Grok 为 plugin agent surface），无需
无-subagent 降级。

#### Leading words（全部 SKILL.md 统一使用）

`tracer bullet`（贯穿式切片）、`seam`（测试位置）、`deep module`（小接口大实现）、
`red`（失败测试状态）、`frontier`（阻塞已清、可开工的集合）、`fog of war`（尚不可 ticket 化的部分）。

#### SKILL.md 写作标准

根本目标是 **predictability**——agent 每次走同一个*过程*，而非产出同样的结果。

**信息阶梯三层**：in-skill step（有序动作，每步结尾有**可检查**的完成判据）→ in-skill reference
（按需查阅的规则）→ external reference（推到独立文件，由上下文指针触发）。

**渐进披露判据**：每条分支都需要的内联，只有部分分支才用到的推到指针后面。

**六个失败模式**，每个 SKILL.md 写完逐条自检：

| 失败模式 | 说明 |
|---|---|
| Premature completion | 判据模糊导致提前收工。先锐化判据；判据确实无法收紧且观察到抢跑时，才拆分隐藏后续步骤 |
| Duplication | 同一含义出现在多处 |
| Sediment | 只加不删积下的陈旧层 |
| Sprawl | 每行都有效但整体过长。解法是阶梯与分支拆分 |
| No-op | 模型默认就会做的话。判据：它相对默认行为改变了什么 |
| **Negation** | 靠禁令引导会反噬。**一律正面陈述目标行为**；仅无法正面表述的硬护栏保留禁令，且必须紧跟替代做法 |

Negation 这条废除了早期骨架里的 `## 不要用它做什么` 小节：路由改由 description 中丰富的
**正面触发短语**完成。

**统一骨架**：

```text
frontmatter: name + description（正面触发短语；model-invoked 另加「when another skill needs…」）
# 一句话：这个 skill 产出什么
## 开始前
## 完成的定义        ← 前置，可检查
## 流程              ← 语义标题，非编号
## 什么时候把决定交给 owner
## 参考              ← 每条注明「什么时候读」
```

**常驻预算**：8 个 user-invoked ≤ 100 行/个，5 个 model-invoked ≤ 80 行/个，router ≤ 80 行。
合计 ≤ 1,280 行常驻 + references 按需。

---

## user-invoked（8）

### 6b.1 `ultra-init`

**差距**：原版 317 行做状态检测、收集、交互确认、建结构、复制模板并逐项验证、Git、摘要。
v0.25.1 退化为一次 `ultra.record baseline/initialize`。丢失：模板逐项验证、brownfield 检测、
既有文档惯例识别。**且原版与现版都缺一件根本的东西——语义产出。**

**定位**：Init 建骨架，Research 填充骨架。分界线是**授权 vs 主张**：

| | Init 收集 | Research 收集 |
|---|---|---|
| 来源 | owner 头脑里 | 外部世界 |
| 性质 | **授权**——不可被证据推翻 | **主张**——可被证据证实或推翻 |
| 谁说了算 | owner 说要什么就是要什么 | 证据 |

技术栈属于主张，不属于 Init。新项目根本没有配置文件可读。

**为什么 Init 必须有语义产出**：Research 的 step-00 是「验证问题是真的」，它要验证的那个问题
得先有人写下来。原版把这一环留在对话里——换宿主或清上下文，research 就没了依据。

**流程用 `ultra-grilling` 循环**，不是一次性问卷。Owner 一开始不可能说清楚自己要什么，
必须逐个引导。先从 owner 调用时已说过的话里提取，复述请确认，只补问真正缺的。

引导覆盖五件事：

| 覆盖点 | 落到 |
|---|---|
| 你想做什么（一句话，owner 原话） | `north-star.md` One-line |
| 什么算成功 | `north-star.md` Success Metric |
| 什么绝对不能发生 | `north-star.md` Hard Constraints |
| 给谁用，他们现在怎么解决 | `discovery.md §0`，标「owner 陈述，未验证」 |
| **你已经知道自己不确定什么** | `discovery.md §0` → **直接成为 Research 的优先队列** |

过程中出现的第一批领域术语调用 `ultra-domain-modeling` 落入 `CONTEXT.md`（懒创建）。

**三条路径的判据**（按顺序检查文件系统，全部可核对）：

| 检查 | 路径 | 行为 |
|---|---|---|
| 存在 `docs/` 且含 ≥2 个非 README 的 `.md`，或存在 `docs/adr/`、`doc/` | 服从既有惯例 | 不建 `.ultra/specs/`；`trace_to` 指向既有 docs |
| 存在语言配置文件但上条不成立 | Brownfield | 全套建；specs 留 `[NEEDS CLARIFICATION]`；代码扫描结论写入 `architecture.md §3` 与 `discovery.md §0`，标「未验证」 |
| 以上皆否 | Greenfield | 全套建；specs 留 `[NEEDS CLARIFICATION]` |

Brownfield 不新建 `baseline.md`——那会造成又一个固定文件和又一处双权威。

**Git 是必选项**：没有 `.git` 就 `git init`，不问。它不是偏好——`ultra-change` 的对账靠
`git log`/`git diff`，`ultra-status` 的测试过期检测靠比对 HEAD，archive 靠 `git mv`，回滚靠 git。
四个能力全部建立在它上面。

**`[NEEDS CLARIFICATION]` 谁填**：init 不填。判据——**能从仓库文件读出来的 init 填，需要调查
才知道的 research 填**。

**产出与验证**（复制后逐项验证存在，缺失即停；原版记录的真实失效模式是 hook advisory 指向坏路径
后 agent 直接忽略）：

```text
PHILOSOPHY.md   north-star.md   CONTEXT.md（懒创建）  templates/×6
specs/{product,architecture,discovery}.md    ← 「服从既有惯例」路径下跳过
tasks.json（空）  contexts/  decisions/  evidence/
.gitignore 追加：.ultra/progress/  .ultra/reviews/  .ultra/.runtime/
```

**降级**：无法提问时 One-line 留空并明确告知「north-star 未填，C1 注入为空，下次任一 skill
会再问」。不猜、不用目录名代替。

---

### 6b.2 `ultra-research`

**差距**：原版 SKILL.md 156 行 + **17 个 step 文件**，just-in-time 加载、写即落盘、强制来源、
`[C]` 闸门。v0.25.1 仅 6 处 `ultra.` 调用，**17 个 step 文件全部丢失**。

**定位**：全流程最重要的一环。前半段是产品思维，后半段才是工程。它的工作是把 Init 产出的
主张逐条验证或推翻，并填满三个 spec。

**跑哪些 step 的判据**：扫描 specs 中仍标 `[NEEDS CLARIFICATION]` 的节 → 反查对应 step →
得到推荐列表 → 一次性给 owner 确认。原版的五种 profile（Full / Product Only / Feature Only /
Architecture Change / Custom）作为推荐结果的表述方式保留。

**闸门从 17 次降到 3 次**。判据：**只有当该步结论会改变后续步骤的走法时才设闸门**。

| 闸门 | 为什么 |
|---|---|
| step-04 产品策略 | 决定 §10–22 怎么做 |
| step-21 功能范围 | 决定 §30–32 架构怎么做 |
| step-99 synthesis | 决定进不进 plan |

其余 14 步写完即继续。write-immediately 保留——中断不丢，owner 随时可从 git 回滚。

**证据标准新增一条**：架构类判断（step-31 技术栈、step-32 模块分解）**优先引用同类知名项目的
真实实现，而非观点文章**。一个跑在生产上的开源项目怎么解决这个问题，是比任何文章都硬的证据。
每个技术决定至少引用一个真实项目的实现。

**写入方式**：每个 step 对应一个明确的 spec 节（原版表格已定死映射），**覆盖该节，不追加**。
追加会在同一节堆出多个版本；历史在 git 里。

**术语持续锐化**：research 过程中每确定一个领域术语，调用 `ultra-domain-modeling` 更新
`CONTEXT.md`。重大取舍满足 ADR 三条准入时调用 `ultra-think` 落 `decisions/<id>.md`。

**distillate 失效判据**：`research-distillate.md` 头部记录生成时所读三个 spec 的 git blob hash。
`ultra-plan` 读它时比对，不一致即报「distillate 过期」并改读 specs。机械检查，非判断。

**降级**：无 web search 工具时该步标 `[UNVERIFIED: no web access]` 后继续。原版
「no search = no proceed」在缺工具的宿主上会死锁。

---

### 6b.3 `ultra-change`

**差距**：v0.25.1 是 DB mutation。原版没有这个命令（Dual-Write 在 dev 内）。新语义为对账优先。

**什么时候用它**（可核对）：

| 情况 | 走哪 |
|---|---|
| `tasks.json` 无 pending/in_progress，且要做新东西 | `ultra-change` |
| 有 in_progress task，实现中发现 spec 对不上 | 不走 change，走 `ultra-dev` 内的 Dual-Write |
| 改动不会让 specs 里任何一句话变成假的 | 都不走，直接改 |

第三条即「小到什么程度不需要 Change 文件」的判据。

**对账范围**（全仓 diff 太大，需有界）——四步全是可执行命令：

1. 定位本次请求会碰的 spec 节（模型判断）
2. 对每节，找 `trace_to` 指向它的历史 task → 相关代码文件集合
3. `git log -- specs/<file>` → 该 spec 上次变更的 commit
4. `git diff <该 commit>..HEAD -- <代码文件集合>` → 对账范围

**三桶输出**：spec 说了代码没做 / 代码做了 spec 没说 / 两者冲突。每桶附推荐处置，owner 逐桶
定向——必须确认，因为可能触发 REDUCTION。

**遇到「这事儿太大且路不清」时调用 `ultra-think` 走 decision ticket**，不要硬拆 task。

**产出**：`changes/active/<id>/intent.md` + spec 补丁 +（可能）decision + `CONTEXT.md` 术语更新。

---

### 6b.4 `ultra-plan`

**差距**：原版 368 行完整。v0.25.1 丢失 Scope Mode、Walking Skeleton、Contract task、
Integration Checkpoint、vertical-slice 校验、Plan Verification 五项。本轮再新增三样原版也没有的。

**Scope Mode**（保留原版）：EXPAND / SELECTIVE / HOLD / REDUCE 四档 + Commitment rule
（选定后不许漂移），默认 SELECTIVE。一次提问，防止模型自行扩大或缩小范围。

**新增 ①：决策 ticket 先行。** 判据——**这件事一次 session 装不下，且路径本身还不清楚** →
调用 `ultra-think` 先测绘不施工。产出的是问题（其解答是决策），不是实现切片。一次解一个，
全部解完才进 task 拆分。期间发现方向错了是正常结果，不是失败。

**新增 ②：seam 清单并确认。** 产出本次改动的测试 seam：优先复用已有 seam，用能用的最高
seam，**理想数量是 1**，与 owner 确认。`ultra-dev` 只在已确认的 seam 上写测试。

**新增 ③：wide refactor 走 expand–contract。** 判据——一个机械改动（重命名列、改共享类型）
的 blast radius 横扫全仓，单次编辑会同时打断上千个调用点，任何垂直切片都无法落绿。此时不强塞
tracer bullet，改为：expand（新旧并存，不破坏任何东西）→ 分批迁移（按包或按目录分批，每批一个
task，被 expand 阻塞，批与批之间 CI 保持绿）→ contract（删旧，被全部迁移批次阻塞）。
批次自身也无法单独落绿时，让它们共享一个集成分支，全部阻塞一个最终的集成验证 task。

**三层防御第一层**（恢复原版）：

- **Walking Skeleton**。新项目＝贯穿所有层的第一条端到端路径。**已有项目＝本次 Change 涉及的
  所有层中最短的一条真实端到端路径**，判据是这条路径的测试必须触及本次 Change 会改动的每一层
  至少一次。只涉及一层时不需要它，也不需要 Integration Checkpoint
- **Contract task**：target files 跨越 ≥2 个顶层源目录，或涉及 ≥2 个进程/服务 → 生成，且置于
  两侧实现任务之前
- **Integration Checkpoint**：每 3–4 个 feature task 插一个
- 依赖分析：任何只碰一层的 task 必须拆成 tracer bullet 或与相关任务合并

**complexity 打分锚点**：

```text
1–2   单文件、无新依赖、不跨边界
3–5   2–8 文件、单一边界、有现成模式可抄
6–7   跨边界、需要新抽象、或改动公共接口
8–10  必须拆
```

只用于两件事：>7 必须拆；context budget ≈ complexity×5%。不追求精确。

**Plan Verification 五项全保留**（需求覆盖、无环、`trace_to` 有效、范围 sanity、context budget），
全部机械可查。

**产出**：`tasks.json`（含 `trace_to`）+ `contexts/task-N.md`（含已确认 seam、Acceptance、
Implementation 计划、Definition of Drift）。

---

### 6b.5 `ultra-dev`

**差距**：原版 455 行；v0.25.1 66 行且过半是 MCP 协议。

**新增：实现计划先成文。** 进 TDD 之前，把 task context 的 Implementation 段写成人类可读的
计划（要改哪些 deep module、接口怎么变、走哪个 seam），确认后再动手。gpt-pilot 把 Developer
（写计划）与 Code Monkey（写代码）分开，是因为直接写代码会让设计决策淹没在实现细节里。

**TDD 委托给 `ultra-tdd`**，只在 plan 已确认的 seam 上写测试。

**三层防御第二层——六维证据的可核对判据**（hook 是加速，模型在收口时必须能自查）：

| 维度 | 判据 |
|---|---|
| `tests_written` | 本次 diff 含测试文件改动 |
| `tests_passed` | 最近一次测试命令 exit 0，且覆盖本次改动的文件 |
| `persistence_real` | 涉及数据存储的路径上，测试用真实存储或 testcontainer |
| `feature_flags_audit` | 本次新增开关没有 `default=false` |
| `vertical_slice` | 存在一个测试，其执行路径从入口贯穿到持久层 |
| `spec_trace` | task 的 `trace_to` 指向的 spec 锚点真实存在 |

**Dual-Write（全流程唯一的反向边）**：实现中发现 spec 与现实不符时，先分类再改。判据见
PHILOSOPHY C5——**spec 原本承诺的每一件事，改完后是否仍然全部成立**。有一件不成立即
REDUCTION，无论理由多充分，必须停下来问 owner。

**收口**：状态双写（`tasks.json` 与 context 头部同时改，改完各读一次确认）、context 补
Completion 与 Resume Note、调用 `ultra-review`。提交、合并、推送是三个独立效果，各需 owner 授权。

**不做 refactor**——见 `ultra-tdd`。

---

### 6b.6 `ultra-test`

**差距**：三层防御第三层，v0.25.1 完全丢失（`Wiring` 仅 1 处、orphan 机制为 0）。

**定位**：`SKILL.md` 第一行写死——**「NOT for running unit tests (that's `ultra-dev`).
This audits whole-system integrity before delivery.」** 原版即用这一行消除误导。

**它是 PHILOSOPHY C4「禁止终点审计」的唯一许可例外**：整体接线审计技术上无法 mid-flight
执行——「这个导出没有非测试引用者」在后续 task 还没做时无法判定。因此许可，但**只能是终点
传感器，永不成为闸门**。这条要写进 SKILL.md，防止以后有人拿 C4 来「修正」它。

**六步**：Anti-Pattern → Coverage Gap → **Wiring Verification** → E2E → Perf → Security →
汇总并交 owner 决策。

**Wiring Verification 的语言无关判据**：

1. 列出本次 Change 新增/修改的**导出符号**
2. 对每个符号，在**非测试源文件**中搜索其名字
3. 0 命中 = orphan

语言差异只在第 1 步。给一张导出语法模式表（TS/JS、Python、Go、Rust、Java），其余语言由模型推断。

**用模型 Grep 而非脚本**：脚本要覆盖 N 种语言 × M 种框架，永远写不完；「找导出、搜引用」模型
两三轮 Grep 即可。这是 C2 的例外——此处需要的是判据，不是可运行替代。

**Stub 检测四模式**（均可 grep）：空返回且无 IO 调用 / 函数体只有 log / handler 只有
`preventDefault` / 组件只返回静态占位。

**产出**：`test-report.json`，**必须含 `git_commit`**。

---

### 6b.7 `ultra-deliver`

**差距**：原版 `ultra-deliver` 196 行 + `ultra-review` 439 行。v0.25.1 丢失 Zero Context
Pollution 协议、Circuit Breaker、session index 与生命周期清理、recheck/delta 模式。

**复审委托给 `ultra-review`**（model-invoked，六 lens）。

**refactor 在这一环发生**，不在 dev 的 TDD 循环内。理由：真正值钱的重构要看过三四个 slice 之后
才知道该抽什么；放在循环里只会产生过早抽象且每次都要重跑测试。

**发布前检查**：`test-report.json` 的 `passed == true` 且 `git_commit == 当前 HEAD`。
不等即判定测试过期。

**其余步骤**（原版保留）：CHANGELOG → 技术债报告 → README（API 变更时）→ 构建 → 版本判定 →
tag → push → `changes/active/` 移入 `archive/`。每个外部效果单独授权。

---

### 6b.8 `ultra-delegate`

**差距**：全新。取代 `cc-collab`、`codex-collab`、原版 `ultra-verify`。

**定位**：它不在链条上，它是链条的**执行方式**。任何一段都可以派给另一个 CLI，带回的结果由主
Agent 按该段本来的验收标准检查。

**运行模式**（沿用原版 `ultra-verify`/`ultra-review` 已验证的做法）：后台启动 → 立即转 wait
script 轮询 → 只从 `result.json` 读结果。四条硬护栏（无法正面表述，保留为禁令并附替代做法）：

1. 启动后立即调 wait script —— 替代做法：不要先处理后台完成通知
2. 不读 lens/worker 的中间输出文件 —— 替代做法：只读 wait script 返回后的汇总
3. 忽略后台完成/空闲通知 —— 替代做法：以 wait script 的返回为唯一信号
4. 唯一信息通路是 wait → `result.json`

**完成判据**（原版实测有效）：输出文件非空**且**连续两次轮询大小不变。

**共识置信度**（从原版 `ultra-verify` 迁入）：3/3 一致 = Consensus；2/3 = Majority，
需调查异见；全异 = No Consensus，分解问题或补证据。降级运行：一个失败转两方，两个失败转单方
并明示置信度下降。**永不因外部 CLI 失败而阻塞工作流。**

**机械边界**：worker 只写自己的 worktree 与 `result.json`；**`tasks.json` 只有主 CLI 写**。
单写者是本路径唯一需要的并发保证，消解了引入 lease 的全部理由。

**刻意不做**：`--detach`、supervisor、`status`/`watch`、`needs_input` 与同 session 恢复、
多态事件流、lease/heartbeat/递归委派。解锁条件：真实复现「任务跑了 40 分钟且宿主 session 已
compact」。v1 替代路径：worker 以 `blocked` 收尾并把问题写入 `result.json`，主 Agent 问完
owner 后把答案追加进 instruction 重新委派，worker 读自己上一轮输出续接。

---

## model-invoked（5）

### 6b.9 `ultra-grilling`

**来源**：`mattpocock/skills` 的 `grilling`；Owner 记忆中的 `guide-me` 是同一概念。

**为什么需要**：owner 一开始不可能表达清楚自己想要什么（The Pragmatic Programmer：
"No-one knows exactly what they want"）。最常见的失败模式是错位——你以为对方懂了，看到成品才
发现完全没懂。

**协议**：

- 就每一个方面持续追问，走完决策树的每条分支，逐个解决决策之间的依赖
- **一次一个问题**，等回答再继续。一次问多个会让 owner 只答简单的、跳过承重的那个
- **每个问题都附上你的推荐答案，以及什么会改变它**。没有推荐的问题是把工作推回给 owner
- **事实归你，决策归 owner**：能靠翻文件、git 历史、跑工具查到的，自己去查；只把真正的决策交出去
- **未获得 owner 明确确认前不动手**——不是听起来像同意，是明确确认

**问题质量**：排序使得回答一个能解锁下一个。优先问那些答案会改变产出的问题：
错了会怎样、我们怎么发现、哪个选项更容易反悔、我们刻意不做什么、「完成」具体长什么样。
跳过能自己推导的、答案不改变工作的、owner 已经回答过的。

**收尾**：决策树走完后，把已达成的决策列成一行一条，附上被否决的选项和理由。这份清单就是记录。

**调用方**：`ultra-init`（建骨架）、`ultra-change`（定界）。

---

### 6b.10 `ultra-domain-modeling`

**来源**：DDD ubiquitous language；`mattpocock/skills` 的 `domain-modeling`。

**为什么需要**：这是「dev 阶段怎么检索前期文档」的答案——**不是更好的检索，是更少的需要检索**。
`CONTEXT.md` 是压缩器不是索引。dev 缺的不是 product.md 的内容，是词汇，好让 `trace_to` 锚点、
变量名、函数名、测试名全部对齐。

**`CONTEXT.md` 格式**：

```markdown
# {项目名}
{一两句：这是什么上下文，为什么存在}

## Language
**Order**:
{一两句定义。定义它「是什么」，不是「做什么」}
_Avoid_: Purchase, Transaction

## Relationships
- 一个 **Issue tracker** 持有多个 **Issue**

## Flagged ambiguities
- 「backlog」曾同时指工具与工作集合 —— 已定：工具叫 **Issue tracker**
```

**规则**：有主见（同一概念多词时挑最好的，其余进 `_Avoid_`）；定义收紧到一两句；
只收本项目特有的术语（通用编程概念不进）；**纯 glossary，零实现细节，不当 spec、不当草稿本**。

**主动纪律**（读 `CONTEXT.md` 取词汇是任何 skill 的一行习惯，不是本 skill；本 skill 是在
*改变*模型时用）：

- 与词表冲突时立即指出：「你的词表把 cancellation 定义为 X，但你现在说的像是 Y——是哪个？」
- 模糊词立即锐化：「你说 account——是指 Customer 还是 User？这是两个东西」
- 用具体场景压测边界
- 与代码交叉验证：「你的代码取消的是整个 Order，但你刚说可以部分取消——哪个对？」
- 术语确定的当下就写进文件，不批量攒着

**ADR 三条准入**（须同时满足，否则不写）：难以逆转 + 无背景会觉得奇怪 + 是真实取舍的结果。

**懒创建**：第一个术语被确定时才建 `CONTEXT.md`；第一条 ADR 需要时才建 `decisions/`。

**调用方**：`ultra-init`、`ultra-research`、`ultra-change`、`ultra-dev`。

---

### 6b.11 `ultra-tdd`

**为什么需要**：反馈回路。没有代码实际运行的反馈，agent 是盲飞。

**Seam 是核心概念**：seam 是可以改变行为而不必在该处编辑的位置，也就是模块接口所在之处。
**测试住在 seam 上，永不针对内部实现。** 只在 `ultra-plan` 已确认的 seam 上写测试。

**循环**：**red → green**。写失败测试，跑一次确认它真的 red，再写刚好让它通过的最小代码。
不预判后续测试，不加投机功能。一次一个切片：一个 seam、一个测试、一份最小实现。

**refactor 不在循环内**，归 `ultra-review`。

**好测试**：通过公开接口验证行为。代码可以整个换掉，测试不该改。读起来像规格说明
（"user can checkout with valid cart" 一眼看出存在什么能力），且因为不关心内部结构而能在重构
中存活。一个测试一个逻辑断言。

**三个反模式**：

| 反模式 | 识别 |
|---|---|
| Implementation-coupled | mock 内部协作者、测私有方法、断言调用次数/顺序、绕过接口从数据库验证。**判据：重构后行为没变但测试挂了** |
| Tautological | 期望值用与实现相同的方式重算，于是永远通过。期望值必须来自独立来源——已知字面量、手算样例、spec |
| **Horizontal slicing** | 先写全部测试再写全部实现。这样测的是**想象中的行为**：测到形状而非用户可见行为，对真实变化不敏感，且在理解实现之前就锁死了测试结构。解法是 tracer bullet：一个测试→一个实现→重复 |

**Mock 边界**：只在系统边界 mock——外部 API、时间与随机数、（有时）文件系统、
（宁可用测试库）数据库。不 mock 自己的类与模块、内部协作者、任何你控制的东西。
设计上让边界可 mock：依赖注入；**SDK 式接口优于通用 fetcher**（每个外部操作一个具名函数，
mock 时无需条件逻辑，且一眼看出测试触及了哪些端点）。

需要真实依赖时抄 `.ultra/templates/testcontainer-postgres.{ts,py}` 与 `vertical-slice.ts`。

**调用方**：`ultra-dev`、`ultra-change`（小改动直接进实现时）。

---

### 6b.12 `ultra-review`

**差距**：原版 439 行 `ultra-review` skill + 10 个 agent 定义。v0.25.1 丢失 Zero Context
Pollution 协议、Circuit Breaker、session index、recheck/delta。

**六个 lens**（原版 agent 转为本 skill 的 references，用宿主原生 subagent 各起一个）：
code、design、errors、tests、spec、comments。

**Zero Context Pollution**：全部后台运行，各写各的 JSON 文件，主 Agent 只读汇总。
四条硬护栏同 `ultra-delegate`。每 lens 最多 12 条 finding，confidence ≥ 75。

**修复循环的停止规则**：

- **Stall**：比较每轮 P0+P1 数量，不下降即停滞 → 写 stuck report，把「哪个约束太严」与
  「哪个修复真的不够」分开写，交 owner 三选一。不要自己循环下去
- **Circuit Breaker**：同一文件连续 3 次修复失败 = 架构问题；≥3 个文件触发 = 系统性问题，
  写 `UNRESOLVED.md` 标 `ARCHITECTURAL_CONCERN` 交 owner

**refactor 在这里发生**，不在 TDD 循环内。

**调用方**：`ultra-dev`（task 级）、`ultra-deliver`（Change 级）。

---

### 6b.13 `ultra-think`

**差距**：原版 101 行，质量已高，基本保留。新增 decision ticket 能力。

**对抗性协议**（原版保留）：Fact / Inference / Speculation 三级标注；Steel Man（推荐前先为你
倾向否决的选项建立最强论证）、Pre-Mortem（假设六个月后失败了，列三个最可能的原因）、
Sensitivity（哪个假设错了会反转结论）、Second-Order（六到十二个月后它会制造什么新问题）。
结论必带 Confidence % + Key Assumptions + **What would change my mind**。

**新增：decision ticket / fog of war。** 判据——**这件事一次 session 装不下，且路径本身还不
清楚** → 测绘而非施工。产出的是问题（其解答是一个决策），不是实现切片。一次解一个；每解一个，
「还看不清的部分」缩小一块。全部解完、没有待决之事，才交给 `ultra-plan`。
落地为 `decisions/<id>.md` 的 `status: open`，解决后转 `accepted`，不需要新文件类型。

**decision 准入**（同 ADR 三条）：难以逆转 + 无背景会觉得奇怪 + 是真实取舍的结果。
三条缺一即不写——否则 `decisions/` 会泛滥成日志。

**调用方**：owner 直接调用；`ultra-change` 与 `ultra-plan` 在遇到「这事儿太大」时调用。

---

## router（1）

### 6b.14 `ultra-status`

**差距**：原版 140 行。v0.25.1 丢失产物路由表。吃掉 `ultra-doctor`。

**定位**：user-invoked skill 多到记不住时的解药——一个 router，只读，不改任何东西。

**从产物推断工作流位置**（不需要额外状态文件）：

| 检查 | 路由到 |
|---|---|
| 无 `.ultra/` | `ultra-init` |
| `product.md` 缺失或含 `[NEEDS CLARIFICATION]` | `ultra-research` |
| `tasks.json` 缺失或为空 | `ultra-plan` |
| 有 `pending` task | `ultra-dev`（指出是哪个） |
| 全部 `completed` | `ultra-test` |
| `test-report.passed == true` 且 `git_commit == HEAD` | `ultra-deliver` |
| `test-report.passed == false` | `ultra-dev`（列出 blocking issues） |
| 已归档且有新请求 | `ultra-change` |

**安全检查**：`test-report.git_commit ≠ HEAD` → 「测试已过期」；工作区有未提交改动 → 警告。

**风险检测**（原版保留）：依赖未满足的 task、in_progress 超过 3 天、复杂度堆积。

**安装健康**（吃掉 doctor）：五宿主的路径、符号链接、版本、manifest 静态检查。

---

### 6b.15 全链条

```text
ultra-init          【ultra-grilling 循环】
  出：north-star.md（授权）+ discovery §0（主张）+ CONTEXT.md 首批术语 + 骨架 + git
  交接 → discovery §0 每条主张 = research 的待验证假设

ultra-research      【最重要一环；前半产品思维，后半工程】
  逐条验证假设；架构判断优先引用同类知名项目的真实实现
  出：三个 spec 填满 + distillate + CONTEXT.md 锐化 + decisions
  交接 → product §4 User Stories + architecture §5 Building Blocks

ultra-plan
  Scope Mode → 【太大且路不清 → ultra-think 决策 ticket 先行】
  → tracer bullet 垂直切片 + blocking edges
  → 【wide refactor 走 expand-contract】
  → 【产出 seam 清单并确认】
  → Walking Skeleton / Contract task / Integration Checkpoint → Plan Verification
  交接 → tasks.json + contexts（含已确认 seam 与 Implementation 计划）

ultra-dev（每 task）
  【实现计划先成文】→ ultra-tdd（只在已确认 seam 上，red→green，无 refactor）
  → 六维证据 → ultra-review
  ← 反向边：Dual-Write（REDUCTION 必问 owner）

ultra-test          全部 task 完成后一次；Wiring 审计；永不 block

ultra-deliver       ultra-review 六 lens →【refactor 在此发生】→ 文档 → 构建 → 版本 → 归档

ultra-change        大流程后的小改动入口；对账三桶 → 回 plan 或直接 dev

ultra-delegate      正交：把以上任意一段派给另一个 CLI
ultra-status        正交：router，从产物推断当前位置
```

## 7. 委派的 CLI 面

语义规格见 §6b.8。此处只定 CLI 契约：

```bash
ubp delegate run --to codex \
  --instruction .ultra/.runtime/delegations/<id>/instruction.md \
  --permission  .ultra/.runtime/delegations/<id>/permission.json \
  --worktree    .ultra/.runtime/worktrees/<id>
```

后台启动，stdout/stderr 落盘，返回启动收据。Driver 即 host-profile 的 `delegateArgv` 一列。
终态仅三个：`finished` / `blocked` / `failed`。

## 8. 施工顺序

**先建新路径并跑通垂直切片，再删旧机械层。** 不先删 85k 行。

0. **切片 0（先立宪法）**：恢复 `.ultra-template/PHILOSOPHY.md`（4 目标 + 5 戒律 + 自检 Test +
   冲突顺序 + Contract Table）、`north-star.md`、`templates/` 四个可行替代文件。后续每个 skill
   的每一条约束都必须能追溯到某条戒律，否则不写进去。
1. **切片 1（证明整套假设）**：先写两个 model-invoked——`ultra-grilling`、`ultra-domain-modeling`
   ——再写 `ultra-init`（它同时消费这两个），然后 `ultra-change` + `ultra-dev` + `ultra-tdd`。
   经新 host-profile 安装到 claude + codex，在本仓自身跑通一次真实小改动，并验证
   claude → codex 的跨宿主续接仅凭文件成立。
   > 顺序理由：model-invoked 是被复用的底座，先写它们才能验证「user 调 model」这条结构约束
   > 在五宿主上真的成立；反过来先写 user skill 会把纪律内容再复制一遍。
2. **切片 2（三层防御）**：`ultra-plan` 第一层（含 seam 清单、expand-contract）+ `ultra-dev`
   第二层六维 + `ultra-test` 第三层 Wiring。端到端验证一次「故意留一个孤儿导出 + 一个
   default-off 开关 + 一个只碰单层的 task」，三处各自独立命中。
3. 补齐 `ultra-research`（含 17 个 step 文件迁移）、`ultra-review`（含 6 个 lens）、
   `ultra-think`、`ultra-deliver`、`ultra-status`。
4. host-profile 扩到 opencode / kimi / grok。
5. `ubp delegate run` + wait script + 5 条 `delegateArgv`。
6. hooks 收敛到 5 个（见 §5b.3），每个 hook 首行加 `.ultra/` 存在性静默检查；同步更新
   `health_check.EXPECTED_REGISTRATIONS`。
7. 删除 mcp-server / orchestrator / ultra-tools / commands / agents，收缩 `package.json` files。
8. 重跑 `npm run verify:release`、`npm pack --dry-run --json`、`node bin/install.js --all --global --doctor --json`。

删除步骤前建立恢复点（tag 或分支）。

## 9. 完成验收

1. 十四个 skill 各有明确 canonical consumer；无 commands/agents 重复投影。
1b. **结构约束成立**：每个 model-invoked skill 至少有两个 user-invoked 调用方（否则应内联）；
   没有任何 user-invoked skill 调用另一个 user-invoked skill。
1c. **无复制**：`grilling` / `tdd` / `review` / `domain-modeling` 的纪律内容各只存在一份。
2. Fresh clone + 禁用 hooks 与 `ubp` 后，仅凭 `.ultra/` 文件与 Git 可继续任一未完成 task。
3. 同一个 task 在 claude 起、在 codex 续，进度不丢。
4. 一次真实小改动经 `ultra-change` 对账后，spec 与代码的偏移被显式列出并消解。
5. **三层防御可复现**：在测试仓故意制造一个孤儿导出 + 一个 default-off 特性开关 +
   一个只碰单层的 task，`ultra-plan` 拒绝该 task 结构、`ultra-dev` 的 evidence 六维标出缺口、
   `ultra-test` 的 Wiring Verification 报出孤儿——三处各自独立命中。
6. **每条约束可追溯**：随机抽 10 条 skill 内约束，每条能指出它服务于哪条 Commandment；
   每个 forbidden pattern 都能指到一个存在的 `templates/` 文件（C2 自检）。
7. **不启动 UBP 零影响**：无 `.ultra/` 的仓库中，五宿主全部 hook 静默 `exit 0`，主流程无任何注入。
8. 源码、安装包与真实项目均不创建或读取 Ultra `.db`；无 SQLite runtime dependency。
9. 不注册任何 MCP server；标准路径无 MCP call；安装与项目工作不启动常驻进程。
10. 五宿主 install / update / disable-enable / uninstall / 实际使用路径全通。
11. `ubp delegate run` 在至少两个目标 CLI 上返回有效 `result.json`。
12. 加一个假想第六宿主的成本可测：仅 profile 一行 + 注册函数。

## 9a. 纯 MD 下的判据规则（Owner 质询后确立，2026-07-31）

纯文件方案没有状态机。状态有三种载体，各有适用面：

| 载体 | 例子 | 转移 |
|---|---|---|
| 目录位置 | `changes/active/C-01/` ↔ `changes/archive/C-01/` | `git mv` |
| 文件内字段 | `> **Status**: pending` | 编辑 |
| 不持久化 | 模型读文件 + 看现实当场判断 | 无 |

**状态是事实（机械可验证），路线是判断（语义）。** v0.25.1 的错误是把后者做成了 DB 状态机。
取代状态机的不是状态字段，而是写在 SKILL.md 里的**判据**。

### 判据的唯一设计规则

> **判据必须锚在可对照文件检查的结果上，不能锚在模型的意图或理由上。**

模型的理由永远可以自洽；结果可以拿文件核对。写不出可核对判据的分支，说明那个分支不该存在。

**范例（Dual-Write 三分类，已写入 PHILOSOPHY C5）**：朴素定义「EXPANSION=新需求 /
CORRECTION=spec 错了 / REDUCTION=去掉」不可用，因为模型能把任何删减说成 CORRECTION——
「spec 要求离线模式但架构不合理，所以是 spec 的错误」，离线模式就此消失且不必问 owner。
REDUCTION 伪装成 CORRECTION 正是 spec 悄悄缩水的实际发生方式。

可用判据是一个可核对的问题：**「spec 原本承诺的每一件事，改完之后是否仍然全部成立？」**
有任何一件不成立即 REDUCTION，无论理由多充分。分类由结果决定，不由理由决定；理由写进给
owner 的问题里，不用来改变分类。

后续每个 skill 的每个分支点都按此标准写判据。

## 9b. 进度

### 切片 0 的两处自我修正（Owner 质询后，2026-07-31）

Owner 追问「为什么是 4 个目标 6 条戒律，不能是 8 个 10 条」与「North Star 和 Goal 1 什么区别」，
暴露了切片 0 的两个错误，均已改正：

**错误 1：C6 不该是戒律。** 我当时只是继承 v7.0 再追加，没有给出判据。补上判据后 C6 不成立——
**戒律的定义是「模型在语义冲突时需要引用的裁决规则」**，而「无 `.ultra/` 即静默退出」是
`if not exists: exit(0)`，模型永远不会引用它。它是代码不变量，归
`docs/PLUGIN-ISOLATION-CONTRACT.md`，由测试验证而非由引用生效。
→ 改回 5 条戒律，并把两条推导规则写进 PHILOSOPHY 开头：
- **目标** = 已反复发生的系统性失败，正面陈述。要加第五个，先举出第五类失败。
- **戒律** = 模型需要引用来裁决冲突的规则。模型永远用不上的，是代码不变量或废话。

**错误 2：north-star.md 与 product.md 三重重复。** 原五节中 Success Metric ↔ product §6、
Out of Scope ↔ §5、Stakeholders ↔ §2，违反本文 §4.0 原则 1（一项语义一个 canonical path）——
定完规则下一步就破了它。
→ 收缩为两节：**One-line**（owner 原话，是检查加工版有没有走样的基准）与
**Hard Constraints**（禁令，architecture 只有技术约束，无对应节）。它唯一不可替代的价值是
短到可以每次 SessionStart 注入。

**North Star 与 Goal 1 的关系**（写入 north-star.md 头部）：Goal 1 Intent Fidelity 是**规则**，
跟着 Ultra 走、所有项目共享；north-star.md 是该规则要保护的**数据**，跟着仓库走、一项目一份。

### 切片 0 交付（2026-07-31）

全部新增文件，未删未改任何现有文件。

| 文件 | 来源 | 说明 |
|---|---|---|
| `.ultra-template/PHILOSOPHY.md` | 原版 v7.0 改写 | 4 目标 + 5 戒律，实质不变；开头新增两条推导规则（目标与戒律各自凭什么存在）；C4 增列 `ultra-test` 为唯一许可的终点审计例外；C5 增列 EXPANSION/CORRECTION/REDUCTION 的可核对判据与反规避条款；Contract Table 按新文件布局重建 |
| `.ultra-template/north-star.md` | 原版迁移后收缩 | 五节收缩为 One-line + Hard Constraints 两节，消除与 product.md 的三重重复；头部写明与 Goal 1 的规则/数据关系 |
| `.ultra-template/contexts/TEMPLATE.md` | 原版 + 新增 | 补 `## Resume Note`（跨宿主续接锚点）、`## Open Questions`、Change Log 增加 Classification 列、Acceptance 增加 Integration 行、Implementation 增加 Layers touched |
| `.ultra-template/templates/` ×6 | 原版逐字复制 | `testcontainer-postgres.{ts,py}`、`vertical-slice.ts`、`persistence-real.ts`、`feature-flag-default-audit.sh`、`README.md`。均为可运行代码，未改内容；其中对 C2/C4/C5 与 `post_edit_guard` 的引用在新设计下依然成立 |

**接线验证**（真实执行，非推断）：`mcp-server/lib/init-project.cjs` 的 `copyTemplate` 是无过滤
递归复制（仅跳过 `.DS_Store`）。以真实实现对 `.ultra-template` 执行一次复制，输出 20 个文件，
8 个新增文件全部落盘，`PHILOSOPHY.md` / `north-star.md` / `contexts/TEMPLATE.md` /
`templates/*` 均存在。既有 `ultra-init` 路径无需改动即可分发。

### 规格定稿（2026-08-01，Owner 认可）

§6b 重写为十四个 skill 的完整规格，合并了原 §6b（差距分析）与 §6c（外部思想吸收）；
按 handbook「prune 而非 append」原则，两节合一，不保留重复内容。

外部来源已读并提炼：`mattpocock/skills`（22 个 skill，本地 clone 全读）、
`Pythagora-io/gpt-pilot` agent 流水线。八条净变更：

1. 新增固定文件 `CONTEXT.md`（8 → 9），置于仓库根而非 `.ultra/` 下
2. Skill 结构：10 平级 → 8 user-invoked + 5 model-invoked + 1 router（装载面 15 → 19）
3. `ultra-init` 升级为 `ultra-grilling` 循环；确立**授权 vs 主张**的 Init/Research 分界
4. `ultra-plan` 新增 seam 清单确认、wide refactor expand-contract、决策 ticket 先行
5. `ultra-dev` 去掉 REFACTOR 阶段（移交 `ultra-review`）；新增实现计划先成文、
   horizontal slicing 反模式、只在已确认 seam 上写测试
6. `decisions/` 新增三条准入判据（难以逆转 + 无背景会觉得奇怪 + 真实取舍的结果）
7. 废除所有 `## 不要用它做什么` 小节（Negation 反模式），路由改由正面触发短语完成
8. 统一 leading words：tracer bullet / seam / deep module / red / frontier / fog of war

## 10. 刻意未做（保持更新）

- **切片 1 的步骤 3、5、6、7 未做**，阻塞于 §0 那个决定。
- `ultra-review` / `ultra-think` 仍在 `CORE_PUBLIC_SKILLS`，未重分类为 model-invoked。
- 三个新 skill 尚无调用方：`ultra-grilling` 等 init/change，`ultra-domain-modeling` 等
  init/research/change/dev，`ultra-tdd` 等 dev/change。它们已安装到五宿主但还没有人调用。
- `adapters/_shared/path-rewrite.cjs` 的 `RUNTIME_SKILL_ROOT` 缺 grok 一行（既有缺口，未动）。
- 除切片 0 与上述 skill 新增外，尚未修改任何生产源码；`adapters/*.js` 全部未改
  （新 skill 的宿主适配完全走既有 `policy.userInvocable` 路径）。
- **文件布局迁移未做**：`.ultra-template/tasks/tasks.json` → `tasks.json`、
  `reports/templates/test-report.json` → `test-report.json`、删除 `delivery-report.json`
  与被取代的 `templates/task-context.md`。现在移动会先于新代码破坏既有 init 路径，
  留到第 7 步随 skills 改写一并处理。
- 新增 hook 时必须同步更新 `health_check.EXPECTED_REGISTRATIONS`（外部工具曾静默丢弃
  `settings.json` 中的 hook 注册）。
- 未迁移或删除现有 `.ultra/.runtime/state.db`。
- 未处理 `.ultra/changes/active/chg-converge/`（未跟踪，属既有 dirty worktree，保持原样）。
- **`.ultra-template/CONTEXT.md` 模板未创建**——它是懒创建文件，但仍需一份带注释的空模板供
  `ultra-domain-modeling` 首次写入时参照。
- 17 个 research step 文件的内容未迁移（原版有全文，属搬运工作量，非设计问题）。
- 6 个 review lens 的 prompt 未从原版 `agents/` 迁出。原版 `review-ac-drift` 与现版
  `review-spec` 是否同一职责，未逐条比对。
- `ultra-test` 的导出语法模式表（TS/JS、Python、Go、Rust、Java）未写。
- 原版 `hooks/post_edit_guard.py` 888 行中有多少可复用、多少需重写，未评估。
- host-profile 对 Kimi 的 `delegateArgv` 与非交互参数尚未核实。
- adapter 压缩到 ~1,500 行为估算，未实测。
- 原版 `hooks/*.py` 4,083 行中有多少可直接复用、多少需重写，未评估。
