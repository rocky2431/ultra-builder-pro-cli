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

## 当前版本怎样工作

先用自然语言说明目标。宿主模型选择与任务相称的路径，读取相关项目事实，然后持续
完成请求已覆盖的工作。你不需要选择内部阶段，也不需要逐个操作 Skills。

1. **理解请求。** 清楚的小修直接调查、复现、修改和验证。用途尚不明确的新产品，
   先问清必要的用途问题，再创建文件。
2. **使用项目知识。** 读取已接受的意图、共享词汇、决策、任务上下文和 Git diff；
   把新确认的事实写回原有规范文档，供后续任务使用。小改不需要额外搭建项目骨架。
3. **选择执行方式。** 默认 Solo。在所有者已授权委派的范围内，Primary 可以请
   Challenger 检查不确定的接口，也可以对独立工作使用 Factory 批次。角色、模型、
   可写范围、集成接口和有限预算由 Primary 明确选择。
4. **执行并核对真实结果。** Worker 在各自 Git worktree 中按范围工作。有限控制器
   检查准入、启动已列出的任务、等待、处理取消并返回结果。Primary 集成并验证产品，
   再判断是否值得进入下一轮已授权工作。
5. **审查、交付并保留连续性。** 按实际影响选择 Review 镜头，在约定预算内修复。
   保留真实测试和审查证据，更新相关项目文档，说明实际交付。Commit、merge、发布
   和安装分别遵循对应的所有者授权。

宿主模型负责意图、分解、集成和完成判断；Skills 提供工作方法，适配器接入原生宿主
能力，有限运行代码管理进程和效果记录。文件与 Git 让工作跨会话延续；没有另一个
语义调度器替模型决定要做什么产品。

### 这轮在 5.0 基础上增加了什么

| 方面 | 原有基础 | 当前实现 |
|---|---|---|
| 入口 | 原生 Skill 路由与文件优先的项目生命周期 | `ubp run` 将原始目标交给 Claude Code 或 Pi，由模型选择相称路径 |
| 日常开发 | Init / Research / Change / Plan / Dev / Test / Deliver 方法 | 清楚的小修可以保持普通工作；建产品的请求会在初始骨架之后继续推进 |
| 项目知识 | 规范意图、词汇、决策和恢复文件 | 任务交接与完成时明确读取、维护相关的既有事实 |
| 委派 | ACP 优先、typed CLI fallback 的有界 Agent 执行 | 已验证的 Pi 执行、角色配置、有限并行批次、工作树管理及模型决定的后续批次 |
| 等待 | 保留结果供 Primary 检查 | 阻塞返回、同会话通知、独立有限控制器消息；无需空闲模型轮询 |
| 续接 | 从项目文件和原生会话显式恢复 | 可选持久检查点在旧 Primary 与 Supervisor 停止后，发起一次新 Pi 轮次 |

### 显式续接与无人值守检查点

`--continue` 或 `--resume` 会续接宿主原有会话并重新加载 Ultra。无人值守续接是
另一条需要明确选择的路径：必须有精确的 durable work-package grant、有效期、撤销
方式、绑定输入和允许的本地写入范围。当前实现支持**每份 grant 一个检查点、最多
一次 fresh Pi 轮次**；下一个检查点需要它自身当前有效的授权与预算。

| 返回路径 | Primary 何时收到结果 |
|---|---|
| W1 | 当前工具调用等待批次结束并返回 |
| W2 | 后台等待完成后，在同一存活 Pi 会话里开始新轮次 |
| W3 | 独立有限控制器向该存活 Pi 会话发送通知 |
| W4 | 旧 Primary 和 Supervisor 均停止后，有效持久授权允许一个新 Pi 会话消费原结果 |

当前原生批次和检查点资格只覆盖已测试的 Pi runtime／policy 身份。其他宿主安装了
Skills，不等于获得同样的资格。交付状态未知时会保留事实，不自动重投。明确启用
macOS 通知时，运行代码记录一次 OS 请求；它不能证明所有者看到了通知。

精确输入和恢复规则见[有限批次](skills/ultra-delegate/references/finite-run-slice.md)、
[工厂运行方法](skills/ultra-delegate/references/operational-factory.md)与
[持久授权合同](skills/ultra-delegate/references/durable-checkpoint.md)。

### 工程实现与运行验收状态

当前源码已包含有界工作流和检查点实现、回归检查及隔离安装支持。真实 Pi 运行已
覆盖并行工作、会话续接、撤销、进程退出及重复事件处理。工程实现、运行验收和发布
分别记录：

- 在已评测任务上，Factory 相对公平 Solo／手工基线的可重复收益**尚未建立**。
  按任务是否适合分工决定委派，不宣称普遍更快或更省钱。
- 完整机器重启与网络分区覆盖、Stage E 正式交付仍未闭合。追加的最终评审返回
  `INCOMPLETE`，未报告新 P0/P1；这不是验收批准。
- 已评测策略候选尚未采用，所有者 promote/reject 决定仍待完成；评测不会自行改变默认策略。
- Package 仍声明 `5.0.2`。这些源码变化不代表已经发布新 npm 包，也不代表已有宿主
  安装已更新。

## Ultra Builder Pro 5.0

`5.0.2` 是 Ultra 作为真实软件工程认知对齐 Harness 的当前实现。它保留已接受的
3.0 file-first 与 model-agency 宪法，再让工作流位置、恢复和跨 Agent 执行变得可直接
观察。它不是去中心化多 Agent 平台，也不规定唯一的 Agent 拓扑。它只承诺五件事：

- 在 Research 进入计划或代码之前，先确立所有者接受的北极星（North Star）；
- 允许所有者在每个阶段选择一个或多个 Agent，以及所使用的提供商；
- 通过 `.ultra/` 下的文件与 Git，传递规范意图、决策、任务、证据和恢复信息，
  让另一个会话或 Host 能够从同一事实继续；
- 自动化可机械验证的权威、权限、外部 effect、证据、物理限制和恢复，同时把意义
  与策略留给模型和所有者；以及
- 约束 Review 与修复，使交付能够收敛，而不是把每个观察都变成下一轮自动实现循环。

5.0 通过一个 Route Contract、明确的 Init/Research/Change/Plan 职责、只依赖文件的
新会话恢复、installed Skill-local delegation runtime 和可替换的
`AgentExecutionDriver` 来兑现这些承诺。只有某个 Host 通过有记录的 conformance
drill 后，才优先选择 stable ACP v1；否则同一 result contract 使用明确报告原因的 CLI
fallback。可移植协议和原生安装覆盖 Claude Code、Codex、OpenCode、Kimi Code、
Grok Build 和 ZCode。六个 profile 都暴露 stable ACP v1 candidate，也都有各自当前的
真实 provider receipt。只有对应 executable、protocol/receipt binding，以及该 profile
的 candidate identity probe（如有声明）仍匹配时才选择 ACP；否则返回 typed CLI fallback。
ZCode 使用独立安装且锁定源码的 bridge，并保持
`experimental`。

5.0 明确不加入全局 daemon、workflow service、语义状态机、A2A 网络、Team Pack、remote
marketplace 或共享权威存储。Package publication 和真实用户安装仍是需要独立核验的
effects；仅凭 source version 不能证明任一 effect 已经发生。

## 为什么需要它

长周期 Agent 工程变更通常以四种可重复的方式失败：

- 意图被反复转述，最终交付的产品不再符合所有者原意；
- 局部层面测试变绿，被误认为端到端路径已经可用；
- 上下文丢失后，中断任务变成考古工作；
- 安全机制开始替产品作语义决定，并把主工作流困住。

Ultra 通过简短、所有者可读的文件，渐进式 Skills，真实验证证据和 Git 恢复来解决
这些问题。产品不包含数据库、MCP server、语义状态机、生成式 prompt 投影或默认
全局 daemon。明确激活的批次与持久检查点使用有限本地进程。

## 产品表面

该软件包精确安装十四个 Skills，分为三类角色。

### 所有者调用的工作流

| Skill | 结果 |
|---|---|
| `ultra-init` | 建立项目骨架和原始 Project Brief |
| `ultra-research` | 建立已接受的 North Star 和有证据支撑的基线 |
| `ultra-change` | 将一次请求的增量与已接受基线进行协调 |
| `ultra-plan` | 编写 tracer-bullet 任务、上下文、依赖与 seam |
| `ultra-dev` | 通过红/绿开发和六个证据维度 `tests_written`、`tests_passed`、`persistence_real`、`feature_flags_audit`、`vertical_slice`、`spec_trace` 实现一个任务 |
| `ultra-test` | 审计全系统接线、E2E 行为、性能和安全性 |
| `ultra-deliver` | 协调、Review、记录并归档一个已完成的 Change |
| `ultra-delegate` | 通过 ACP-first stable v1 把有界任务、Research 取证或聚合 Review 派给另一个 installed Agent runtime，并保留 typed CLI fallback |

### 模型调用的纪律

| Skill | 可复用方法 |
|---|---|
| `ultra-grilling` | 每次只问一个关键问题，补齐所有者未明确的意图 |
| `ultra-domain-modeling` | 在 `CONTEXT.md` 中维护精确的统一语言 |
| `ultra-tdd` | 证明一条已确认 seam 先红后绿 |
| `ultra-review` | 按当前变更选择独立 Review 镜头，在预算内综合 findings |
| `ultra-think` | 对重要决策进行压力测试并记录持久结果 |

`ultra-status` 是唯一的 router。它根据项目文件、Git 和安装健康状态推断当前 route，
不会改变工作流状态。

默认情况下，公开工作流由所有者显式选择。在一个已激活且仍有效的所有者
`Execution Grant`（会话级授权或持久工作包授权）之外，一个公开工作流可以推荐
下一个工作流，但不会自行启动它。在授权范围内，Host 模型只能选择授权覆盖的
Change-scoped Research、同一 Change 的 reconcile、Plan、Dev、Test 和仅协调阶段的
Deliver route；Init、Change intake/evidence/acceptance/abandonment 或 primary transfer、
Delegate、Deliver finalization、最终归档以及每个外部 effect 始终由所有者选择；
Status 同样由所有者选择、保持只读且不授予 continuation。每次 public transition 都先显示 derived
`UBP Route Card`；Host invocation metadata 只负责粗粒度发现，加载后的 Skill 会重新
验证精确 Mode 与 Grant，而不会创建 route state。模型调用的纪律仍可供 Host
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

`5.0.2` 不安装自定义 `agents/` 投影。原来的 Review workers 变成
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

这些路径是派生观察，不是执行授权。只有保留证据足够时才能重建；删除运行中的记录
可能留下执行未知状态，不能因此重启任务。`.ultra/evidence/durable/` 中的持久 activation／
event claim 保留已发生事实，不授予重投权限。精确保留当前 strict Review session，
直到 Test 和 Deliver 都成功消费它；只有在两个消费者都
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
以下安装命令请求指定版本，不会安装这个源码目录中尚未发布的改动。使用已经安装的
Pi 试用当前源码时，在本 checkout 中执行：

```bash
node bin/install.js run --host pi --cwd /path/to/project "说明你的目标"
```

```bash
# 当前项目，单个 Host
npx ultra-builder-pro-cli@5.0.2 --claude --local
npx ultra-builder-pro-cli@5.0.2 --codex --local

# 全局安装
npx ultra-builder-pro-cli@5.0.2 --opencode --global
npx ultra-builder-pro-cli@5.0.2 --kimi --global
npx ultra-builder-pro-cli@5.0.2 --grok --global
npx ultra-builder-pro-cli@5.0.2 --zcode --global

# 所有受支持 Host
npx ultra-builder-pro-cli@5.0.2 --all --global
```

把任务通过 ACP 派给 ZCode 还需要独立构建的 bridge 和已安装的 ZCode Desktop。
Ultra 会随 Skill 提供 ZCode CLI 0.16.5 所需的小型 source patch，但不安装这两个依赖，
也不会把 provider 凭据写入项目证据：

```bash
git clone https://github.com/jpalmae/zcode-acp
git -C zcode-acp checkout 42fe149d4b501469343c01f23ba3801832306d53
git -C zcode-acp apply \
  /path/to/installed/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch
cargo test --locked --manifest-path zcode-acp/Cargo.toml
cargo install --locked --path zcode-acp
```

5.0 已验证 base commit、patch SHA-256
`174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d`、locked tests、
fake E2E、release build 和真实 ZCode 0.16.5 session。需确保 binary 位于 `PATH`；非
macOS 环境使用该平台实际安装的 ZCode CLI path。`--version` 必须返回
`zcode-acp 0.1.0+ultra.zcode.0.16.5`。

Host 与 provider 是两个概念：ZCode Desktop 是 runtime，模型账号可以是国内智谱
BigModel、国际 Z.AI 或其他已配置 provider。当前模型连接应通过 ZCode UI 或
`~/.zcode/v2/config.json` 配置；`~/.zcode/cli/config.json` 管理 CLI plugin、Hooks、
MCP 和其他 headless-runtime 设置，不是模型账号的规范配置文件。BigModel 账号授权
不需要手工填写 URL；BigModel Coding Plan 的 API Key 使用 OpenAI-compatible coding
endpoint `https://open.bigmodel.cn/api/coding/paas/v4`。Anthropic-compatible endpoint
`https://open.bigmodel.cn/api/anthropic` 适用于另一个资源包或预付费余额路径。请以当前
[ZCode 模型配置文档](https://zcode.z.ai/en/docs/configuration)、
[ZCode provider Q&A](https://zcode.z.ai/en/docs/qa) 和
[智谱 Claude API 兼容文档](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)
为准。带日期的 ZCode 0.16.5 conformance drill 使用了
`builtin:bigmodel-coding-plan/GLM-5.2` 及其锁定的 headless 配置；该 receipt 是历史
兼容性证据，不是通用安装说明。

由于 ZCode transport 仍为 `experimental`，每次真实派送都必须显式确认这个边界：

```bash
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to zcode \
  --ack-experimental --instruction <file> --permission <file> --worktree <dir>
```

这些固定版本的 `npx` 命令在发布后解析 registry 中不可变的版本。需要避免修改真实
用户安装时，源码验证使用 `node bin/install.js --config-dir <isolated-path>`；独立的
5.0 release drill 还在六个真实 Host home 中验证了 ownership-safe install、Doctor、
ZCode uninstall 与 reinstall。

### 用一句目标启动 Ultra

```bash
# 直接说要什么，路由由宿主模型自己选
ubp run "把报表导出的 CSV 中文乱码修好"
ubp run "帮我做个能整理会议记录的小东西"

# 只看将要执行的命令和首条 prompt，不真正启动
ubp run --dry-run "..."
```

`ubp run` 会解析宿主将要加载的受管插件，把该插件自己的入口指令加上**原样未改**的目标
交给宿主会话，然后把会话交回宿主。你不需要选择任何 Ultra mode、阶段或 Skill 名称。
停止与退出保持原生。用 `ubp run --continue "继续刚才的改动"` 或
`ubp run --resume <session-id> "完成刚才中断的改动"` 续接，同时重新加载插件；
保留同一工作目录和插件选择。

常用参数：`--config-dir <dir>`（Claude）或 `--plugin-dir <dir>` 为本次会话绑定指定的受管插件，
`--cwd <dir>` 换工作目录，
`--host-arg <arg>` 透传一个原生宿主参数，`-` 从 stdin 读取目标。`ubp run --help` 列出全部。

用途尚待回答时，使用上面的交互终端形式。Claude 原生 `--print` 模式没有交互提问工具，
批处理跑完不能证明用途澄清成功；管道输入也不提供后续回答所需的终端。
宿主可能要求确认读取所选插件目录里的参考文件，这是原生文件访问确认，
与决定产品用途是两件事。

交互式启动支持 Claude Code 和 Pi。`ubp run --host pi "帮我整理收据"` 会为当前会话
加载包内现有 Skills；需要本机有 `pi`，无需另给 Pi 安装 Ultra。用
`ubp run --host pi --continue "继续"` 或
`ubp run --host pi --resume <session-id-or-path> "完成刚才中断的改动"`
续接并重新加载同一组 Skills。`--plugin-dir` 也可选择已有的生成插件目录。
入口同时加载原生 `ultra_slice` 和 `ultra_attention_ack` 工具，用于当前明确授权的有限并行批次。
可在当前工具轮等待（W1），或完成后在同一原生会话的新轮次接收通知（W2），无需空闲模型轮询。
还可通过独立有限控制进程向当前 Pi 会话返回消息（W3）。模型选择是否分工、角色配置和下一轮，工作树与预算按当前授权处理；不自动新建会话，也不承诺并行总是更快。
详见[有限批次契约](skills/ultra-delegate/references/finite-run-slice.md)和[运营工厂方法](skills/ultra-delegate/references/operational-factory.md)。
明确选择 durable work-package 后，可用 `ultra_durable` 注册[一个长期检查点](skills/ultra-delegate/references/durable-checkpoint.md)：旧会话退出后最多启动一个新 Pi 轮次，受期限、撤销和本地写入范围约束；发送结果未知时不自动重投。
Pi 不加载 Ultra 的可选 Claude hooks。Pi 是额外的会话入口与已验证原生执行路径，
不是第七个受管理安装适配器；下文六个适配器仍各自保留精确的兼容性和权限边界。

使用 Host 原生 Skill picker 或调用语法选择一个所有者工作流。Codex 会暴露带命名空间
的条目，例如 `$ultra-builder-pro:ultra-init`。普通宿主聊天的自动发现属于尽力支持；
使用统一入口即可明确进入 Ultra，无须点名内部 route。工作流随后自行核对入口、
Mode、Grant 和效果再动手。
安装后的 frontmatter 和 metadata 只把必须由你点名的两个 route 保持为所有者调用——
只读的 `ultra-status` 诊断与 `ultra-delegate` worker 拓扑——并把模型 discipline
保持在工作流内部。

### 诊断、更新和卸载

安装过程受管理、具备原子性，并会核验 provenance。

```bash
# 重新执行安装会更新受管理产物
npx ultra-builder-pro-cli@5.0.2 --codex --global

# 只读诊断
npx ultra-builder-pro-cli@5.0.2 --all --global --doctor --json

# 只移除受管理的 Ultra 资产
npx ultra-builder-pro-cli@5.0.2 --all --global --uninstall
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

以下路由描述完整项目生命周期。统一入口只选择当前请求需要的部分；普通有界小修
不需要重新建立基线，也不必走完全部七个路由。

已有项目的日常工作中，改变已接受产品或规格承诺的请求从 `ultra-change` 开始。
只有建立首个 baseline，或回答同一 active Change 已记录的有界证据问题时，才直接进入
`ultra-research`。每次 public transition 都先展示派生的 Route Card，明确当前 Mode、
Position、可观察 Exit condition、material checkpoint 和 Next route。

下文的“选择”既指点名该 route，也指直接提出它存在的那件事：你当前的消息就是它所指
工作的入口；而不会让任何规格句子失真的普通有界改动仍属普通仓库工作，不产生任何
`.ultra/` 产物。

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
4. 选择 `ultra-plan`，记录公开 seam，并生成可恢复的 tracer-bullet 任务。最早的可观察
   slice 必须穿过真实 consumer 和真实 data path，并写明所有者能观察到的结果。模型负责
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
grant 本身。在两种模式下，模型都可以选择授权覆盖的 Change-scoped Research、同一
Change 的 reconcile、Plan、Dev、Test 和仅协调阶段的 Deliver route，直到下一个语义
停止点或声明预算；两种模式都不授予
finalization 或 archive 权限：写入 `delivery.md`、版本或 package posture，以及归档
始终需要所有者当前显式调用；commit、push、publication、deployment、installation
和其他任何外部 effect 也一样。

任何时候，`ultra-status` 都可以重建当前位置。新会话先从 repository root 和 `HEAD`
开始，唯一解析 active Change，再读取 `.ultra/tasks.json`、匹配任务的 `context_file`
和其中的 `## Resume Note`、`CONTEXT.md`、相关 decisions、specifications、evidence 与
当前 Git diff；不会因为聊天记忆丢失而重跑已完成的 Research。如果 active authority
歧义或不可读，Status 转入只读 recovery，指出最早的不安全事实，并给出最便宜的
repair、retry、cancel、abandon 或 fresh-session 路径，不选择 intent，也不写语义文件。
archive 或 abandoned Change 中未完成的历史 rows 仍不是当前 frontier。

## 三层独立集成防线

工作流不会把“测试通过”等同于端到端结论。

- `ultra-plan` 拒绝横向 feature slicing，并确认可观察 seam。
- `ultra-dev` 记录六个独立观察：`tests_written`、`tests_passed`、
  `persistence_real`、`feature_flags_audit`、`vertical_slice`、`spec_trace`。
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

委派会写入不可变的 instruction 和 permission envelope，然后选择一个 Host-local
`AgentExecutionDriver` 并在后台启动。只有 executable stdio endpoint 能协商 stable
ACP v1，且该 Host 有带 evidence 的 passed conformance record 时才选择 ACP；否则使用
相同 result contract 的 `CliDriver`，并报告精确 fallback reason。当前六个 Host row
都已有各自真实 provider 的 passing receipt；executable 缺失、candidate identity
probe（如有声明）不匹配，或 receipt 缺失/过期时，仍返回 typed CLI fallback。只有在
`session/prompt` 之前识别到 `acp_auth_required` 时，才会执行一次有界 CLI path；其他
ACP failure 一律不重试，因此不会重复派送 provider task。空
writable roots 选择原生只读模式；声明 roots 则
选择有界写入模式。模型返回一个
受 schema 约束的最终响应；launcher 从原生结构化输出中提取它，验证真实 Git diff，
并在 instruction 旁原子发布 terminal `finished`、`blocked` 或 `failed` result。
绑定 digest 的 packet 会嵌入 worker prompt，因此严格 Host 不必从 isolated worktree
之外读取 instruction files。

```bash
node <loaded-ultra-delegate-skill-dir>/scripts/delegate.cjs run --to codex \
  --instruction .ultra/.runtime/delegations/D-01/instruction.md \
  --permission .ultra/.runtime/delegations/D-01/permission.json \
  --worktree .ultra/.runtime/worktrees/D-01
```

loaded Skill path 是 canonical runtime；clean `npx` plugin install 后不需要全局 `ubp`，
也不会通过 `npx` 查找 Ultra；固定版本的 Claude/Codex ACP adapter 本身可以经 `npx`
运行。`ubp delegate` 只保留一个版本周期的薄兼容
wrapper。使用 installed Skill 内的 `scripts/delegate_wait.py` 等待 `result.json`，无需把
worker 中间输出载入父上下文。委派不会授予新权限；writable roots 仍位于 worktree 内，
permission file 必须声明零外部 effects，且不得放宽 Host sandbox。
不可变 instruction 可指定任务执行/续做、有界 Research 取证或聚合 Change
Review/verification。后两类可以只读，也不要求 task row，因此 pre-Plan Research 与
post-task 跨 family Review 不需要虚构 ledger work 也能执行。
ZCode 通过独立安装的 `zcode-acp` bridge 只解析 installed Desktop runtime（macOS
优先 App-bundled CLI，之后才是 `PATH` fallback），并保持 `experimental`。当前
capability、read-only、permission、cancel/no-orphan、cwd/diff、result parity 与
redaction drill 均已通过；提升 maturity 仍需要 App-internal runtime 的官方稳定性承诺。
Doctor 分开报告 runner health、ACP capability、candidate identity（如有声明）、
selected driver、fallback reason 与 ZCode maturity。

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

- [5.0 设计与验收合同](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-5.0.zh-CN.md) — 5.0.2 已实现的
  Route、Skill 职责、continuation、ACP/CLI execution、migration 与 journey 边界。
- [5.0 journey 结果](docs/evals/ultra-5-0-journey-results.md) — 可观察的 source、
  isolated-runtime、real-provider、real-HOME 与跨平台结果，以及明确排除的服务部署边界。
- [当前权威](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/.ultra/north-star.md) — 本仓库已接受的 North Star
  `north-star-v2-r3` 是当前规范权威；`.ultra/tasks.json` 以及
  `.ultra/changes/active/` 或 `.ultra/changes/archive/` 下的稳定 Change 记录当前或
  已交付的工作 frontier。
- 冻结的设计历史（不可变的已接受记录，不是实时状态）：
  [3.0 North Star R3](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0-NORTH-STAR-R3.zh-CN.md) —
  绑定 hash 的已接受 r3 设计；以及已被 r3 取代的
  [3.0 design](https://github.com/rocky2431/ultra-builder-pro-cli/blob/main/docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md)。
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
