# Ultra Builder Pro

[English](README.md) | **简体中文**

Ultra Builder Pro 是面向 Claude Code、Codex、OpenCode、Kimi Code、Grok Build
和 ZCode 的 file-first（文件优先）工程工作流。它实现了与提供商无关的
**Ultra Core Protocol**：所有者与 Agent 的认知对齐、每项事实的规范权威、
显式的会话级或持久工作包授权、Agent 之间经过验证的独占式移交、带恢复路径的
类型化证据，以及在所有者可见预算内终止的 Review。它把产品意图、规格、任务
合同、证据、决策和恢复说明保存在仓库中，因此不同会话或 Host 可以通过读取文件
和 Git，从同一组事实继续工作。

Host 模型仍然是工程师。Ultra 提供可复用的方法和可检查的产物；它不会用工作流
引擎取代推理。每个阶段采用一个还是多个 Agent、使用哪些提供商，均由所有者决定；
默认由当前 Agent 单独继续。若要把工作包的写入权移交给另一个 Agent，必须通过
仓库文件和 Git 完成显式、可验证的转移（OFFER → ACK → RESULT）。

## Ultra Builder Pro 3.0

`3.0.2` 是 Ultra 作为真实软件工程认知对齐 Harness 的首个正式发布版本。它不是
去中心化多 Agent 平台，也不规定唯一的 Agent 拓扑。它只承诺五件事：

- 在 Research 进入计划或代码之前，先确立所有者接受的北极星（North Star）；
- 允许所有者在每个阶段选择一个或多个 Agent，以及所使用的提供商；
- 通过 `.ultra/` 下的文件与 Git，传递规范意图、决策、任务、证据和恢复信息，
  让另一个会话或 Host 能够从同一事实继续；
- 自动化可机械验证的权威、权限、外部 effect、证据、物理限制和恢复，同时把意义
  与策略留给模型和所有者；以及
- 约束 Review 与修复，使交付能够收敛，而不是把每个观察都变成下一轮自动实现循环。

可移植协议和原生安装覆盖 Claude Code、Codex、OpenCode、Kimi Code、Grok Build
和 ZCode。ZCode 插件安装已受支持；其 App 内置的 headless 委派传输仍明确标记为
`experimental`，直到官方稳定接口和恢复演练达到支持标准。

## 为什么需要它

长周期 Agent 工程变更通常以四种可重复的方式失败：

- 意图被反复转述，最终交付的产品不再符合所有者原意；
- 局部层面测试变绿，被误认为端到端路径已经可用；
- 上下文丢失后，中断任务变成考古工作；
- 安全机制开始替产品作语义决定，并把主工作流困住。

Ultra 通过简短、所有者可读的文件，渐进式 Skills，真实验证证据和 Git 恢复来解决
这些问题。产品不包含数据库、MCP server、语义状态机、生成式 prompt 投影或后台
daemon。

## 产品表面

该软件包精确安装十四个 Skills，分为三类角色。

### 所有者调用的工作流

| Skill | 结果 |
|---|---|
| `ultra-init` | 建立项目骨架和原始 Project Brief |
| `ultra-research` | 建立已接受的 North Star 和有证据支撑的基线 |
| `ultra-change` | 将一次请求的增量与已接受基线进行协调 |
| `ultra-plan` | 编写 tracer-bullet 任务、上下文、依赖与 seam |
| `ultra-dev` | 通过红/绿开发和六个证据维度实现一个任务 |
| `ultra-test` | 审计全系统接线、E2E 行为、性能和安全性 |
| `ultra-deliver` | 协调、Review、记录并归档一个已完成的 Change |
| `ultra-delegate` | 通过另一个受支持的 CLI 执行有界任务、Research 取证或聚合 Review |

### 模型调用的纪律

| Skill | 可复用方法 |
|---|---|
| `ultra-grilling` | 每次只问一个关键问题，补齐所有者未明确的意图 |
| `ultra-domain-modeling` | 在 `CONTEXT.md` 中维护精确的统一语言 |
| `ultra-tdd` | 证明一条已确认 seam 先红后绿 |
| `ultra-review` | 运行六个独立 Review lens 并综合 findings |
| `ultra-think` | 对重要决策进行压力测试并记录持久结果 |

`ultra-status` 是唯一的 router。它根据项目文件、Git 和安装健康状态推断当前 route，
不会改变工作流状态。

默认情况下，公开工作流由所有者显式选择。在一个已激活且仍有效的所有者
`Execution Grant`（会话级授权或持久工作包授权）之外，一个公开工作流可以推荐
下一个工作流，但不会自行启动它。在授权范围内，Host 模型只能选择授权覆盖的
Research、Plan、Dev、Test 和仅协调阶段的 Deliver route；Init、Change、Delegate、
Status、最终归档以及每个外部 effect 始终由所有者选择。模型调用的纪律仍可供 Host
模型使用，它们不是独立的用户 route。模型在当前任务出现相应触发条件时选择它们：
意图不完整时使用 grilling，术语冲突时使用 domain modeling，已接受的 seam 使用
TDD，证据已可 Review 时使用 review，重要且未解决的决策使用 think。具备原生有界
subagent 的 Host 可以并行运行 Review lens；其他 Host 则顺序运行同一组 lens 资产。

在 `ultra-research` 中，前六个 reference 是六个语义 lens，而不是六个额外 Skill：
问题验证、机会发现、市场评估、替代方案、产品策略和假设验证。`wayfinding.md` 会在
这些 lens 与后续证据 lens 之间选择最小且依赖顺序正确的路径。Grilling 仍负责如何
逐一追问缺失信息，Think 负责一个重要权衡，Domain Modeling 负责词汇；Research
负责整体问题图、证据收敛、所有者 checkpoint 和基线晋升。

### 原来的 Agents 去哪里了

`3.0.2` 不安装自定义 `agents/` 投影。原来的 Review workers 变成
`ultra-review/references/` 下六个聚焦文件；Review 协调和综合归属于父级
`ultra-review` Skill。原来的 debugger 流程位于
`ultra-dev/references/debugging.md`，测试执行流程位于
`ultra-tdd/references/test-execution.md`。这些都是所属 Skill 的资产，因此会随
Skill 到达全部六个 Host。它们保留了有界角色，又不会假装每个 Host 都暴露相同的
自定义 Agent API。

## 项目权威

一个项目在首次接受 Research 基线后使用以下结构。刚完成 Init 时，`CONTEXT.md`
尚不存在，North Star 和规格文件仍是空骨架。

```text
CONTEXT.md
.ultra/
├── .gitignore                  # 只忽略 Ultra 派生产物路径
├── project-brief.md
├── north-star.md
├── tasks.json
├── test-report.json
├── specs/
│   ├── product.md
│   ├── architecture.md
│   ├── discovery.md
│   └── research-distillate.md
├── changes/
│   ├── active/<change-id>/{intent.md,delivery.md}
│   ├── archive/<change-id>/{intent.md,delivery.md}
│   └── abandoned/<change-id>/intent.md  # 包含精确的 Abandonment closure
├── contexts/task-<task-id>.md
├── decisions/<decision-id>.md
├── evidence/<task-id>/...
└── research/<run-id>/{brief.md,<step-id>.md}
```

可选的 `brief.md` 是派生导航；被选中的 step report 是引用证据，而晋升后的语义事实
存在其他规范文件中。Git 提供历史、比较、回滚和归档移动。以下附加路径均为派生产物：

```text
.ultra/.runtime/
.ultra/progress/
.ultra/reviews/
```

`.ultra/.runtime/` 和 `.ultra/progress/` 可以从当前权威中删除或重建。精确保留当前
strict Review session，直到 Test 和 Deliver 都成功消费它；只有在两个消费者都
完成后，才能垃圾回收该 session。如果在两者完成前丢失，必须运行全新的 Review
和 Test，绝不能重构旧 receipt。

有关 writer、reader、promotion、staleness 和 recovery 规则，请参阅
[Artifact Authority](docs/ARTIFACT-AUTHORITY.md)。

### 哪个 route 写哪个文档

| Route | 规范写入 | 下一个消费者 |
|---|---|---|
| `ultra-init` | 原始 `project-brief.md`、空的 North Star 和规格骨架、空任务/测试 ledger | research、status，以及基线前 Session Hook fallback |
| `ultra-research` | 已接受的 North Star、首个 domain baseline、被选择且有引用的报告、已协调规格和 distillate | change、plan 和 delivery |
| `ultra-change` | 一个带稳定 `change_id`、Research Disposition 且只触及增量相关已接受基线章节的 active `intent.md`；或在所有者授权移动前写入精确 Abandonment closure | active：research 到 delivery；abandoned：未来 Change 历史和 status |
| `ultra-plan` | 为 active `change_id` 追加 `tasks.json` 行、每任务一个 context，以及 active intent 中的 Planning Posture | dev 和所有 resume 路径 |
| `ultra-dev` | source/tests、类型化任务证据、只在 ledger 中保存的任务状态、Completion、Task Review 和 Resume Note | review、test、status、delivery |
| `ultra-test` | 唯一的当前 `test-report.json`，绑定 Change id、当前 task ids、intent digest、HEAD 和 product-worktree digest | status 和 delivery |
| `ultra-deliver` | 先协调 specs/docs，再在 fresh Test snapshot 后写一个 `delivery.md` 并归档 Change 目录 | 所有者和未来 Change 历史 |
| `ultra-status` | 无 | 根据当前文件推荐最小显式 route |
| `ultra-delegate` | 派生 runtime receipt 加 isolated worktree diff | primary host 检查和可选集成 |

`ultra-domain-modeling` 是 `CONTEXT.md` 唯一的聚焦 writer；`ultra-think` 只在所有者
接受后写持久决策。Review packets、Hook progress、compact snapshots 和 delegation
receipts 都是派生证据，不是额外语义文档。

## 安装

需要 Node.js 22 或更新版本。

```bash
# 当前项目，单个 Host
npx ultra-builder-pro-cli@3.0.2 --claude --local
npx ultra-builder-pro-cli@3.0.2 --codex --local

# 全局安装
npx ultra-builder-pro-cli@3.0.2 --opencode --global
npx ultra-builder-pro-cli@3.0.2 --kimi --global
npx ultra-builder-pro-cli@3.0.2 --grok --global
npx ultra-builder-pro-cli@3.0.2 --zcode --global

# 所有受支持 Host
npx ultra-builder-pro-cli@3.0.2 --all --global
```

使用 Host 原生 Skill picker 或调用语法选择一个所有者工作流。Codex 会暴露带命名空间
的条目，例如 `$ultra-builder-pro:ultra-init`。安装后的 frontmatter 和 metadata 会
保持用户 route 显式、模型 discipline 隐式。

### 诊断、更新和卸载

安装过程受管理、具备原子性，并会核验 provenance。

```bash
# 重新执行安装会更新受管理产物
npx ultra-builder-pro-cli@3.0.2 --codex --global

# 只读诊断
npx ultra-builder-pro-cli@3.0.2 --all --global --doctor --json

# 只移除受管理的 Ultra 资产
npx ultra-builder-pro-cli@3.0.2 --all --global --uninstall
```

`--config-dir <path>` 会同时隔离主配置和 Host 自有 sidecar。它是测试时的安全选择，
不会回落到真实 home 目录。选择多个 Host 时，每个 Host 会收到
`<path>/<runtime>`，避免彼此的原生布局相互覆盖。

卸载会移除受管理插件，并且只清理首次安装前不存在、当前为空的配置目录外壳。
已有 registry、目录、symlink 以及任何包含所有者数据的路径都会保留。

Kimi Code、Grok Build 和 ZCode 当前只提供用户级插件，所以 `--local` 会在任何修改
前拒绝它们。Claude Code、Codex 和 OpenCode 支持项目级安装；全部六个 Host 都支持
受管理的全局安装和隔离 `--config-dir` 验证。

## 典型工作流

1. 选择一次 `ultra-init`。它写入骨架，在 Project Brief 中保留所有者原始的一行请求
   和大致轮廓，在需要时初始化 Git，然后停止，不会开始产品 Research。
2. 选择 `ultra-research`，把 brief 转化为首个已接受的 North Star、共享词汇以及有
   证据支撑的产品和架构基线。对于不清晰的多 lens 问题，它会先写派生 Wayfinding
   brief；对于单个有界证据缺口，则跳过该额外文件。
3. 对一次请求的增量选择 `ultra-change`。它只在计划前协调该增量触及的基线章节，
   不会重建项目基线。其 Research Disposition 要么引用充分证据，要么明确必须通过
   Research 返回的有界问题和退出证据。不会让任何规格语句失真的微小编辑可以留在
   Ultra 之外；每个被接受的 Change 都会获得由真实 seam、证据、Review 和恢复需要
   所证明的最小 Plan graph。任何 profile 都不能固定任务数量。该 Change 仍 active
   时，继续协调同一个稳定 id；不要为另一个请求开启第二个 active Change。
4. 选择 `ultra-plan`，记录公开 seam，并生成可恢复的 tracer-bullet 任务。模型负责
   普通技术 seam；只有会改变公开合同或其他重大权衡的 seam 才由所有者决定。
5. 每次为一个任务选择 `ultra-dev`。`.ultra/tasks.json` 是唯一任务状态权威。Dev 在
   row 仍为 `in_progress` 时记录类型化 v2 证据并完成 Task Review；只有解决 blocking
   findings 并刷新受影响证据后，它才写入 `completed`、添加 Completion，并重写
   Resume Note。
6. 当 active Change 的任务均以当前 v2 证据和保留的 Task Review provenance 完成后，
   选择 `ultra-test`。历史 ledger rows 和旧 context Status fields 不进入该审计。本地
   测试变绿不能代替 wiring 与 E2E 证明。
7. 选择 `ultra-deliver` 运行聚合 Review 并协调文档。如果这一步改变产品或语义文件，
   需要重新运行 Test；再在 fresh snapshot 上重新进入 Deliver，写入 delivery metadata
   并归档稳定 Change id。Commit、push、tag、publication 和 deployment 始终是分别
   授权的 effects。

对于一个已接受 Change，所有者可以用两种模式激活其精确 `Execution Grant`。
`session-local` grant 只存在于当前对话：当激活状态丢失——进入新会话、切换 Host
或发生 compaction——工作会停止，等待所有者重新激活。`durable work-package`
grant 允许新的 Agent 或 Host 继续一个精确工作包，但 Agent 必须先稳定验证所记录的
grant 本身。在两种模式下，模型都可以选择授权覆盖的 Research、Plan、Dev、Test 和
仅协调阶段的 Deliver route，直到下一个语义停止点或声明预算；两种模式都不授予
finalization 或 archive 权限：写入 `delivery.md`、版本或 package posture，以及归档
始终需要所有者当前显式调用；commit、push、publication、deployment、installation
和其他任何外部 effect 也一样。

任何时候，`ultra-status` 都可以重建当前位置。新会话或不同 Host 会通过读取
`.ultra/tasks.json`、选中任务的 `context_file`、其中的 `## Resume Note`、
`CONTEXT.md`、相关 decisions、active Change 和 Git 来恢复。它首先把 append-only
ledger 过滤为 `change_id` 与唯一 active Change 匹配的任务；archive 或 abandoned
Change 中未完成的历史 rows 不是当前 frontier。

## 三层独立集成防线

工作流不会把“测试通过”等同于端到端结论。

- `ultra-plan` 拒绝横向 feature slicing，并确认可观察 seam。
- `ultra-dev` 把测试、持久化、feature flags、垂直执行和 spec trace 记录为六个独立观察。
- `ultra-test` 为 changed exports 查找真实的非测试消费者，并让最小 primary flow 穿过边界。

每层防线都可以独立报告缺陷。这些报告是 sensors，不是语义 gates；模型和所有者在
不抹除证据的前提下决定如何响应。

## Hooks

五个可选 Hooks 会加速文件读取，并保护一个狭窄的 effect 边界：

| Hook | 行为 |
|---|---|
| `session_context.py` | 注入已接受的 North Star；Research 前则注入 Project Brief fallback，并附上当前 acceptance |
| `mid_workflow_recall.py` | 在相关 source 操作前重述 acceptance |
| `compact_context.py` | 保存和恢复一次可丢弃的 Git/file snapshot |
| `post_edit_guard.py` | 在编辑后记录机械证据观察 |
| `block_dangerous_commands.py` | 对受保护分支的增量 publication 给出建议；在精确命令获授权前，拒绝改写历史和具名破坏性 shell effects |

当 `.ultra/` 不存在时，五个 Hooks 都静默退出。详情见
[Plugin Isolation](docs/PLUGIN-ISOLATION-CONTRACT.md)。

## 委派

委派会写入不可变的 instruction 和 permission envelope，然后在后台启动所选 CLI。
空 writable roots 选择原生只读模式；声明 roots 则选择有界写入模式。模型返回一个
受 schema 约束的最终响应；launcher 从原生结构化输出中提取它，验证真实 Git diff，
并在 instruction 旁原子发布 terminal `finished`、`blocked` 或 `failed` result。
绑定 digest 的 packet 会嵌入 worker prompt，因此严格 Host 不必从 isolated worktree
之外读取 instruction files。

```bash
ubp delegate run --to codex \
  --instruction .ultra/.runtime/delegations/D-01/instruction.md \
  --permission .ultra/.runtime/delegations/D-01/permission.json \
  --worktree .ultra/.runtime/worktrees/D-01
```

使用 `skills/ultra-delegate/scripts/delegate_wait.py` 等待 `result.json`，无需把 worker
中间输出载入父上下文。委派不会授予新权限；writable roots 仍位于 worktree 内，
permission file 必须声明零外部 effects，且不得放宽 Host sandbox。
不可变 instruction 可指定任务执行/续做、有界 Research 取证或聚合 Change
Review/verification。后两类可以只读，也不要求 task row，因此 pre-Plan Research 与
post-task 跨 family Review 不需要虚构 ledger work 也能执行。

## Host 支持

| Host | Skills | Hooks | 受管理生命周期 |
|---|---:|---:|---|
| Claude Code | 14 | 5 个直接 Hooks | install / doctor / update / uninstall |
| Codex | 14 + 原生 metadata | 5 个 wire adapter Hooks | plugin + personal marketplace |
| OpenCode | 14 | 5 个原生 JS plugin Hooks | bundle + skill directories |
| Kimi Code | 14 | 5 个 wire adapter Hooks | managed plugin registry |
| Grok Build | 14 | 5 个 wire adapter Hooks | 可用时使用原生 plugin registration |
| ZCode | 14 | 5 个 wire adapter Hooks | inline plugin + local marketplace + reversible config registration |

有关精确路径和 Host 限制，请参阅
[Runtime Compatibility](docs/RUNTIME-COMPAT-MATRIX.md)。

## 开发

```bash
# Node contracts、package smoke、Host adapters、delegation 和 Skills
npm run test:node

# File-first Hook 行为和 wire wrappers
npm run test:hooks

# 完整 release gate
npm run verify:release

# 检查精确 publish artifact
npm pack --dry-run --json
```

每个发生变化的 Skill 还会通过 Codex Skill Creator validator 验证。发生变化的 Codex
manifest 会依据 Plugin Creator schema 验证。验证变绿不代表已授权任何 release
effect；validator 成功只证明结构符合要求，不代表语义已被接受。

## 文档

- [当前权威](.ultra/north-star.md) — 本仓库已接受的 North Star
  `north-star-v2-r3` 是当前规范权威；`.ultra/tasks.json` 以及
  `.ultra/changes/active/` 或 `.ultra/changes/archive/` 下的稳定 Change 记录当前或
  已交付的工作 frontier。
- 冻结的设计历史（不可变的已接受记录，不是实时状态）：
  [3.0 North Star R3](docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md) —
  绑定 hash 的已接受 r3 设计；以及已被 r3 取代的
  [3.0 design](docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md)。
- [理念](docs/PHILOSOPHY.md)
- [架构](docs/ARCHITECTURE.md)
- [产物权威](docs/ARTIFACT-AUTHORITY.md)
- [工作流生命周期](docs/WORKFLOW-LIFECYCLE.md)
- [Skill 编写规范](docs/SKILL-AUTHORING.md)
- [插件隔离](docs/PLUGIN-ISOLATION-CONTRACT.md)
- [Runtime 兼容性](docs/RUNTIME-COMPAT-MATRIX.md)
- [对抗性 Review 评估](docs/evals/adversarial-review-2026-08-14.md)
- [ZCode 自动化评估](docs/evals/zcode-automation-2026-08-14.md)

## License

[MIT](LICENSE)
