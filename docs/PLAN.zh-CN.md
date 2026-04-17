# ultra-builder-pro-cli — 执行计划 v0.3.1

**状态**：Phase 0 完成 · Phase 1 待启动（Codex 第二轮评审已吸收）
**版本**：0.3.1-plan · 2026-04-17 Codex 第二轮评审收尾（v0.3.0-plan 的修订）
**范围**：最终目标 = 可落地的"跨 runtime coding 自动化工厂"。12 个 Phase 渐进交付。
**整体置信度**：**86%**（同 v0.3；Phase 2 下调被 4.5/8A/8B 上调抵消）
**关键变更**（vs v0.3，基于 Codex 第二轮 R1-R7）：
- **清除旧模型残留**（R1）：4 处（§4.2、§4.3 数据流、§4.4 组件一览、§11 时间线）
- **`skill.*` 收缩为只读**（R2 + D29）：`skill.resolve` / `skill.manifest`，删 `invoke/list`
- **Phase 4.5 加 single-active-lease admission control**（R3 + D33）：takeover/resume/abandon
- **state.db 补 5 类**（R4 + D30-D32/D37）：schema_version / migration_history / events.id 游标 / 多进程访问策略 / 运维四子命令 / 消除 lease 文件双源
- **Phase 8A 加 execution-plan.json artifact**（R5 + D34）：waves + ownership 预测 + conflict
- **Phase 8A 依赖 Phase 7 软化**（R5 + D36）：memory/complexity 是加分项不是前置
- **Phase 4.6 拆 a/b**（R6 + D35）：v0.1 只跑 smoke flow，full conformance 推 v0.2
- **Codex 第二轮结论**："小改后开工"（tl;dr）；本版已完成小改

**总决策数**：D1-D37（v0.3 新增 D18-D28，v0.3.1 新增 D29-D37）
**总风险数**：R1-R32（v0.3.1 新增 R25-R32 共 8 条）

---

> **本文件为唯一权威**。范围 / 置信度 / 时间线 / 架构的任何变更，必须先在 §14
> 决策日志写明理由和日期，再落代码。所有外部事实追溯到 §14 D11 + D12 的文档
> URL 证据。

---

## 0. TL;DR

**我们要做什么**：把 Ultra Builder Pro 从 "Claude Code 的命令包" 进化成 **三层
跨 runtime 框架**（skill 说明书 + MCP 状态操作 + CLI 兜底）。再在规则层之上
加一个**执行层**：session 隔离、事件循环、并发调度、监控与智能层，最终形成
**自动化 coding 工厂**。

**最终形态**（v1.0）：
- 任何一个 coding agent CLI（Claude / OpenCode / Codex / Gemini / Cursor /
  Windsurf）都能消费同一套 Hermes 规则。
- 独立 session 执行独立 task，无对话污染；失败自动重试带熔断。
- 跨 session 的记忆、代码图、token 监控通过 MCP 共享。
- PRD → task → 独立 agent 并行执行 → 合并 → 审查 → 交付，无人值守可跑。

**分阶段**：
- **v0.1** = Phase 0-4.5（规则层 + execution-lite：会话隔离已可用） → 8 周
- **v0.2** = Phase 5-6（执行层进阶 + 监控 + 实时图谱） → +3 周
- **v0.3** = Phase 7-8A-8B（智能层 + 计划自动化 + 执行自动化） → +5-6 周
- **v1.0** = Phase 9（三渠道发布） → +1 周

**总工期**：14-18 周 AI 协助（Codex 评审后上调，原 11-13 周）。

---

## 1. 问题陈述

### 1.1 起点

Hermes（Ultra Builder Pro）是一套成熟的 agent 工程系统：
`init → research → plan → dev → test → deliver` 六命令 + `tasks.json` 任务
注册表 + `tasks/contexts/task-{id}.md` 独立上下文。它在 Claude Code 上跑得
很顺。

### 1.2 三重痛

**A. Claude 独占工具钉死**：`TaskCreate/Update/List`、`AskUserQuestion`、`Skill`、
`Agent(subagent)`、`TeamCreate/SendMessage`、`/compact` 这 6 类 API 让 Hermes
离开 Claude Code 寸步难行。其它 3 大 runtime（OpenCode / Codex / Gemini）各
有原生等价或兼容层，但今天无人对接。

**B. 单会话污染与状态不原子**：
- `tasks.json` 读-改-写无锁，两个 agent 并发会丢更新。
- `tasks.json` 与 `contexts/task-{id}.md` 状态**双写**，易半途错乱。
- `workflow-state.json` 单文件单会话——两个 agent 同跑就互相覆盖。
- 长对话积累噪音 → 决策质量下降；想独立会话交接却没机制。
- 总共识别到 12 个痛点（详见 §5）。

**C. 缺乏执行层**：
- 没有任务分派器 → agent 启动靠人工 `/ultra-dev 5`。
- 没有事件流 → agent A 完成 task B 不知道。
- 没有崩溃恢复 → agent 挂了状态永久漂移。
- 没有监控 → token / 成本 / tool call 全都黑盒。
- 这些都是 "coding 工厂" 的基础设施，今天一片空白。

### 1.3 我们追求的终点

> 一个开发者 PRD 进来，自动拆成 10 个带依赖的 task；orchestrator 按依赖
> 顺序或并行分派给 4 个不同 runtime 的 agent，每 agent 独立 session 执行
> 一个 task，共享项目记忆与代码图；agent 完成后 commit 并广播事件，触发
> 下一批；全程 token 压缩监控；失败自动熔断。开发者只需审核最后的 PR。

**非魔法**：GSD-2 的 `ctx.newSession()` + `activity-log.json` + `DISPATCH_RULES`
已证明这套架构可行。我们做的是**把它嫁接到 Hermes 的规则层上**。

---

## 2. 目标

| # | 目标 | 可验证条件 | 归属 Phase |
|---|------|-----------|----------|
| G1 | Hermes 在 Claude / OpenCode / Codex / Gemini 四 runtime 原生可用 | 每 runtime 能跑完整 `init→research→plan→dev→test` | 4 |
| G2 | 状态权威源单一、并发安全 | SQLite + WAL；20 worker 并发 updateTaskStatus 无丢失 | 2 |
| G3 | `tasks.json` / context md 降级为投影，state.db 权威 | 所有写入走 state-db；JSON/MD 自动再生成（D18） | 2 |
| G4 | 每 task 独立会话（新进程 + 独立 worktree + lease），对话不污染 | 2 并发 session 各独立 worktree；kill -9 后 lease 过期可清理 | **4.5** |
| G5 | 跨 session 事件可订阅 | MCP `session.subscribe_events` 从 state-db events 表实时推 | **4.5** |
| G6 | 崩溃自动恢复，失败有熔断 | kill -9 agent 后 orchestrator 重启能续；同 task 重试 ≥3 次自动停 | 5 |
| G7 | RTK / code-review-graph / hindsight 作为 MCP tool 跨 runtime 共享；图谱实时增量 | 4 runtime 下都能调 `impact.*` / `memory.*`；editor save → 图谱 ≤3s 更新（D24） | 6, 7 |
| G8 | PRD 自动拆 task + 并行分派（8A + 8B） | 10 task 的 PRD 一键触发，≤3 失败项，其余自动完成并合入 | **8A, 8B** |
| G9 | 三渠道可装（npm / Homebrew / pip） | 干净 macOS / Ubuntu 60 秒装好 | 9 |
| G10 | 0 私人数据泄漏 | npm tarball / brew bottle / pip wheel 审计干净 | 9 |
| **G11** | Runtime capability matrix + conformance tests | 4 runtime × 5+ 能力点的 E2E 测试全绿（D23） | **4** |
| **G12** | v0.1 = 规则层 + execution-lite 可用 | 用户能在 4 runtime 下并发跑任务，会话独立 | **4.5** |

---

## 3. 非目标

- 重写 Hermes 为独立 coding agent（那是 gsd-2 的产品线，不是我们的）。
- 抽象 LLM 提供商。runtime 自己管。
- 做 TUI / web 仪表盘。CLI 是工具，不是宿主。
- 支持 Copilot / Cursor / Windsurf / Augment / Trae / Qwen / CodeBuddy /
  Cline / Antigravity / Kilo。v0.2+ 再谈，每家 2-3 天。
- 重新设计 Hermes 的 `init→research→plan→dev→test` 业务流。这套工作流
  本身是对的，我们只换骨架。

---

## 4. 架构

### 4.1 三层模型（skill + MCP + CLI）

```
┌────────────────────────────────────────────────────────────────┐
│  Skill 层 (知识 / 说明书)                                      │
│  runtime 原生发现                                              │
│  Claude: ~/.claude/skills/       OpenCode: ~/.config/opencode  │
│  Codex: ~/.agents/skills/        Gemini: extension/skills/     │
│                                                                 │
│  ┌─ SKILL.md ──────────────────────────────┐                  │
│  │ - 何时使用                               │                  │
│  │ - workflow 步骤（调 MCP tool × 调 CLI）  │                  │
│  │ - 降级路径（MCP 不可用 → CLI；CLI 没    │                  │
│  │   → 人工）                                │                  │
│  │ - 引用的 references/ 详细文档            │                  │
│  └──────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────┘
                        │ agent 读 skill 决定调什么
                        ▼
┌────────────────────────────────────────────────────────────────┐
│  MCP 层 (结构化操作 — 主路径)                                   │
│  独立进程，各 runtime 通过 MCP protocol 调用                   │
│                                                                 │
│  ultra-builder-mcp-server                                       │
│  ├─ task.* (create/update/list/get/delete/expand/dispatch)    │
│  ├─ memory.* (retain/recall/reflect)  ← hindsight              │
│  ├─ review.* (run/verdict)  ← 替代 Claude 独占 subagent pool   │
│  ├─ impact.* (radius/changes)  ← code-review-graph             │
│  ├─ skill.* (invoke/list)  ← 跨 runtime 统一 skill 入口        │
│  ├─ session.* (new/current/activity_log)  ← GSD-2 模式         │
│  └─ ask.* (question/menu)  ← AskUserQuestion 跨 runtime        │
└────────────────────────────────────────────────────────────────┘
                        │ Bash hook / prompt shell-out
                        ▼
┌────────────────────────────────────────────────────────────────┐
│  CLI 层 (兜底 / hook / 无 MCP 环境)                             │
│  ultra-tools Bash 可调，~/.local/bin                           │
│                                                                 │
│  ├─ ultra-tools task list --json                               │
│  ├─ ultra-tools memory search "X" --limit 5                    │
│  ├─ ultra-tools ask --question "…" --options "A|B"             │
│  ├─ ultra-tools subagent run review --prompt "…"               │
│  └─ ultra-tools session new --task 5                           │
└────────────────────────────────────────────────────────────────┘
```

**三层职责（防重复）**：

| 层 | 承载 | 写在哪 | 谁调 | 典型场景 |
|---|---|---|---|---|
| Skill | workflow 知识、步骤、降级约定 | `SKILL.md` + `references/` | agent 自主阅读 | 做 research 前先读 `skills/ultra-research/SKILL.md` |
| MCP | 状态 CRUD、事件、跨 runtime 共享 tool | `mcp-server/tools/*.ts` | agent 通过 MCP protocol 调 | 创建 task、读 memory、发 review 请求 |
| CLI | Bash 兜底、hook 专用、CI 脚本 | `ultra-tools/commands/*.cjs` | Bash / prompt `!{cmd}` / hook | 没 MCP 的 runtime、PostToolUse hook、发布脚本 |

**单源同步**：三层共用一份 schema（`spec/schemas/*.json` + `spec/mcp-tools.yaml`），
Phase 1 的首要产物。skill 引用 MCP tool ID，MCP tool ID 对应 CLI 子命令名。

### 4.2 规则层 vs 执行层（双时间线）

| 维度 | 规则层（静态声明） | 执行层（运行时动态） |
|---|---|---|
| 形态 | md / JSON schema / TypeScript 类型 | Node daemon / orchestrator / watcher |
| 负责 | 数据形状、步骤、约束、降级 | session 生命周期、分派、事件、监控、恢复 |
| 本 PLAN | Phase 1-4 | Phase 4.5-8 |
| 能否脱离对方跑 | ✅ 可以（手工执行） | ❌ 不能（需要规则层做输入） |

**关键原则**：**规则层完整后，执行层才能上**。执行层是"把规则层跑起来"，
不是"重新发明规则"。跑路线：v0.1 交付**规则层 + execution-lite**（session
隔离 + 事件订阅 + 活跃会话可见）→ 用户跨 runtime 并发跑命令且会话独立 →
v0.2 加执行层进阶（recovery + 监控 + 实时图谱）→ 半自动 → v0.3 加智能层 +
工厂 → 全自动。

### 4.3 数据流（端到端）

```
  开发者           规则层                                执行层
  ─────           ─────────────────                    ────────────────
    │
    │ /ultra-init "我的 SaaS"
    ├──────────────▶ Skill: ultra-init/SKILL.md
    │                   │
    │                   ▼ 调用
    │               MCP: task.init_project
    │                   │
    │                   ▼ 写 .ultra/specs/*.md (空模板)
    │                   ▼ 写 .ultra/tasks/tasks.json (空)
    │                   ▼ append state.db events 表（type: project_init）
    │
    │ /ultra-research "市场、架构、产品"
    ├──────────────▶ Skill: ultra-research/steps/...
    │                   │
    │                   ▼ 17 step × 每步调 memory.recall + WebSearch
    │                   │                    │
    │                   │                    ▼ (Phase 7)
    │                   │                  hindsight MCP
    │                   │
    │                   ▼ 产出 specs/*.md + research-distillate.md
    │                   ▼ activity-log: research_complete
    │
    │ /ultra-plan [HOLD]  ← Phase 8 加 human gate
    ├──────────────▶ Skill: ultra-plan/SKILL.md
    │                   │
    │                   ▼ 调 task.parse_specs + task.expand (PRD 自动拆)
    │                   │       │
    │                   │       ▼ (Phase 8) DISPATCH_RULES 声明分派
    │                   │
    │                   ▼ 写 tasks.json + contexts/task-*.md
    │                   ▼ activity-log: plan_approved
    │                                         │
    │                                         ▼ (Phase 5) orchestrator 订阅
    │                                         ▼ spawn agent(runtime=X, task=1)
    │                                         │
    │                                         ▼ ctx.newSession() + worktree
    │                                         │
    │ /ultra-dev 1 (可手动；也可 orch 自动)   ▼ executor
    ├────────── or automatic ──▶ Skill: ultra-dev/SKILL.md
    │                   │
    │                   ▼ TDD RED/GREEN/REFACTOR (调 impact.radius + memory.recall)
    │                   ▼ review: MCP review.run → 5 个 subagent 并行
    │                   │                   │
    │                   │                   ▼ (Phase 6) RTK 压缩 + telemetry
    │                   │
    │                   ▼ task.update_status completed + commit
    │                   ▼ activity-log: task_complete(id=1, commit=abc)
    │                                         │
    │                                         ▼ 订阅方：trigger next pending
```

### 4.4 组件一览（v1.0 完工形态）

```
ultra-builder-pro-cli/
├── spec/                          # 单源 schema (Phase 1)
│   ├── schemas/
│   │   ├── state-db.sql           # SQLite 权威源 schema (Phase 2)
│   │   ├── state-db.migrations/   # migration 脚本目录
│   │   ├── tasks.v4.5.schema.json # 投影视图 schema（tasks.json 导出格式）
│   │   └── context-file.v4.5.schema.json
│   ├── mcp-tools.yaml             # MCP tool 接口定义（openapi 风格）
│   ├── skill-manifest.schema.json
│   └── cli-protocol.md
├── mcp-server/                    # Phase 3+4
│   ├── server.ts                  # stdio MCP server 入口
│   ├── tools/
│   │   ├── task/                  # task.* 家族
│   │   ├── memory/                # memory.* 家族 (Phase 7 接 hindsight)
│   │   ├── review/                # review.* 家族
│   │   ├── impact/                # impact.* 家族 (Phase 7 接 code-review-graph)
│   │   ├── skill/
│   │   ├── session/               # Phase 5
│   │   └── ask/
│   └── lib/
│       ├── state-machine.ts       # Phase 2 (lockable RMW)
│       ├── atomic-write.ts        # Phase 2
│       └── event-log.ts           # Phase 2
├── ultra-tools/                   # CLI 兜底 (Phase 3)
│   ├── cli.cjs
│   └── commands/                  # task/memory/ask/skill/subagent/session
├── skills/                        # Phase 3 规则层 (18+ skill)
│   ├── ultra-init/
│   ├── ultra-research/
│   ├── ultra-plan/
│   ├── ultra-dev/
│   ├── ultra-test/
│   ├── ultra-deliver/
│   ├── ultra-review/
│   └── ...  (既有 18 个保留 + 新增)
├── orchestrator/                  # Phase 5+8 执行层
│   ├── daemon.ts                  # 常驻进程
│   ├── session-manager.ts         # ctx.newSession() 模式
│   ├── dispatch-rules.ts          # Phase 8 声明式分派表
│   ├── parallel-orchestrator.ts   # Phase 8
│   ├── event-watcher.ts           # Phase 5 fs-watch activity-log
│   └── recovery.ts                # Phase 5 circuit-breaker
├── telemetry/                     # Phase 6
│   ├── collectors/                # token / tool_call / cost
│   └── rtk-integration.ts
├── adapters/                      # Phase 4 跨 runtime 分发
│   ├── claude.ts
│   ├── opencode.ts
│   ├── codex.ts
│   ├── gemini.ts
│   └── _shared/
├── hooks/                         # Python hooks 沿用
│   ├── *.py (15)
│   └── core/ adapters/            # Phase 3 三分拆
├── agents/                        # 9 subagent md (保留)
├── commands/                      # 9 薄壳命令 (Phase 3 重写为三层调用)
├── bin/
│   └── install.js                 # Phase 4 完善
├── docs/
│   ├── ROADMAP.md
│   ├── PLAN.zh-CN.md              # 本文件
│   ├── ARCHITECTURE.md            # Phase 1 产物
│   └── RUNTIME-COMPAT-MATRIX.md   # Phase 4 产物
└── package.json
```

### 4.5 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| A1 | 三层分离（skill/MCP/CLI）而非单层 | skill 只能"软指导"；MCP 提供强类型契约；CLI 做最低公约数兜底。单层满足不了 "knowledge + state + hook 兜底" 三类需求 |
| A2 | MCP server stdio 而非 HTTP | 4 runtime 全支持 stdio MCP；零端口、零防火墙问题 |
| A3 | 单源 schema（spec/）驱动三层 | 避免 "skill 说的 tool" 与 "MCP 实际的 tool" 不一致 |
| **A4** | **权威状态层 = SQLite + WAL**（`.ultra/state.db`）；tasks.json / context md / activity-log.json / workflow-state 全部降级为投影 | Codex Q1：多文件多主写入最易炸；SQLite 提供事务 + 并发读；D18 |
| **A5** | **Session 标准单元 = 新进程 + 独立 worktree + lease/heartbeat + artifact dir**；`ctx.newSession()` 仅作 Claude/GSD-2 适配优化 | Codex Q7：跨 4 runtime 通用；systemd/launchd 过重；D20 |
| A6 | 事件流 = state-db `events` 表（append-only）+ MCP subscribe | 取代 activity-log.json 文件；state-db 统一权威源（D18） |
| A7 | Python hooks 沿用，Node shell out | 15 hook 重写 Node 要 2-3 周纯折腾；零价值 |
| A8 | orchestrator 是可选的常驻 Node daemon | 规则层可不依赖执行层独立跑；半自动 → 全自动平滑升级 |
| A9 | RTK / code-review-graph / hindsight 全部作为 **MCP tool** 暴露 | 不自建等价功能；它们都是 MIT + MCP 友好 |
| **A10** | **v0.1 = 规则层 + execution-lite**（非裸规则层） | Codex Q3：用户核心诉求是"独立会话"，无执行层 v0.1 不够用；D19 |
| **A11** | **Schema v4.4 → v4.5 过渡（不直接 v5 breaking）** | Codex Q5：tasks.json 成 authoritative view，context status 降级派生，停止手写保留兼容；等命令全迁完再 v5；D21 |
| **A12** | **Runtime capability matrix + conformance tests** 代替纸面 parity | Codex Q8：4 runtime 在 hook / subagent / 权限 / usage 统计不等价；D23 |
| **A13** | **code-review-graph 实时增量**（fs-watch + tree-sitter），不是启动 build | Codex Q6：实时反馈给 agent 才有价值；D24 |
| **A14** | **hindsight wrapper 式自动记忆**（session 结束自动 retain；session 启动自动 recall），不仅是显式 API | Codex Q6：hindsight 强项是 wrapper 而非显式 CRUD；D25 |

---

## 5. 痛点 × 能力 × Phase 矩阵

### 5.1 12 个痛点 → 解决 Phase

| # | 痛点 | 来源证据 | 解决方案 | Phase |
|---|------|----------|---------|-------|
| P1 | tasks.json 读-改-写无原子 | ultra-dev.md Step 1.5 / Step 5 | **SQLite 事务（A4/D18）** | **2** |
| P2 | workflow-state.json 单会话 | ultra-dev.md Step 0/3.3/4.5/6 | 按 session_id 存 state-db sessions 表；orchestrator 管多 session | **4.5** |
| P3 | tasks.json 与 context 双写 | ultra-dev.md Step 1.5 + 5 明写 BOTH | **v4.5 过渡：state-db 权威，tasks.json/context 降级为投影**（A11/D21） | **2** |
| P4 | Git 分支硬绑 task_id → 并发冲突 | ultra-dev.md Step 2 | worktree 隔离 + files_modified 重叠检测（GSD） | **8B** |
| P5 | /compact + compact-snapshot.md Claude 专属 | ultra-dev.md Step 4.4 | 不依赖 /compact；用 Session 标准单元（A5）代替 | **4.5** |
| P6 | /ultra-review 5 subagent Claude 独占 | ultra-dev.md Step 4.5 | MCP `review.run`；跨 runtime 并行（CTM 模式） | 3 |
| P7 | Dual-Write Mode spec 改后不 invalidate | ultra-dev.md Dual-Write | events 表 `spec_changed` + task staleness 字段 | 5 |
| P8 | 无 task 间事件通知 | 整个体系 | state-db `events` 表 append-only + MCP subscribe | **4.5** |
| P9 | status 字段 tasks.json 与 context 重复 | plan + dev 都要求同步 | 同 P3（schema v4.5 过渡） | **2** |
| P10 | 无项目级事件流 | 仅 workflow-state.json 单点 | 同 P8 | **4.5** |
| P11 | commit hash 回填 amend 链非原子 | ultra-dev.md Step 6.3 | 先 commit → 读 hash → 写 context → 第二次 commit（不 amend） | 3 |
| P12 | ultra-test/deliver 顺序假设 | 命令本身结构 | DISPATCH_RULES + parallel-orch（GSD-2） | **8B** |

### 5.2 能力升级（非痛点，来自参考项目）→ Phase

| 能力 | 来源 | 加到哪 | Phase | 工时 |
|------|------|-------|-------|-----:|
| RTK Bash 命令压缩（60-90%） | RTK | `rtk init -g` + hook 注册 | 6 | 0.5d |
| 爆炸半径分析（8x 减少） | code-review-graph | MCP `impact.*` tool | 7 | 2d |
| 长期记忆（retain/recall/reflect） | hindsight | MCP `memory.*` tool | 7 | 5d |
| Skill 自动萃取 + 注入 | OMC | `/learn` 扩展；dev 起步读匹配 skill | 7 | 2d |
| Model 自适应路由（Haiku/Opus） | OMC | 每 skill frontmatter 声明 complexity | 7 | 1d |
| Human gate in /ultra-plan | OMX | plan Step 6 加 approval | 8 | 0.5d |
| AGENTS.md scope guard | OMX | 合并 CLAUDE.md → 统一注入 | 3 | 1d |
| PRD 自动解析 → task | CTM | MCP `task.parse_prd` | 8 | 2d |
| Task dependency graph + auto-expand | CTM | tasks.json v5 + MCP `task.expand` | 2, 8 | 2d |
| DISPATCH_RULES 声明式分派 | GSD-2 | orchestrator Phase 8 | 8 | 3d |
| Worktree 并发 + files_modified 重叠检测 | GSD | orchestrator Phase 8 | 8 | 2d |
| Crash 恢复 + circuit breaker | GSD-2 | orchestrator Phase 5 | 5 | 2d |

---

## 6. Phase 分解

每个 Phase 含：**目标 · 前置依赖 · 任务列表（含 AC）· 工时 · 置信度**。

> 约定：AC = Acceptance Criterion（可独立复跑的验收准则）。工时 = AI 协助下
> 单开发者。Phase 内同级任务可并行；跨 Phase 严格串行（有依赖）。

---

### Phase 0 — 骨架（✅ 完成，commit `da69a7a`）

**目标**：最小可跑的 CLI + 4 adapter stub + ultra-tools 骨架 + 3 份文档。

| ID | 任务 | AC | 完成 |
|----|------|-----|------|
| 0.1 | 销毁旧 .git，main 重建 + bundle 备份 | 3 commit 在 main 上 | ✅ |
| 0.2 | package.json + bin/install.js | `--help / --all --local` 正确 | ✅ |
| 0.3 | 4 adapter stub | resolveTarget 返回正确路径 | ✅ |
| 0.4 | ultra-tools/cli.cjs 骨架 | 5 子命令 stub 打印 | ✅ |
| 0.5 | docs/ROADMAP + PLAN.zh-CN + 隐私净化 | npm pack --dry-run 无泄漏 | ✅ |

**gate**：`node bin/install.js --help` + `--all --local` 都输出预期 stub 错误。

---

### Phase 1 — 三层接口定义（规则层基础）✅ 完成，commit `926cd74`

**目标**：把 skill / MCP tool / CLI 三层的**schema 锁死**。后续所有 Phase 只
引用 spec/，不再定义新 schema。接口先行是避免"写到一半发现 schema 不兼容"
最大的保险。

**前置**：Phase 0

**置信度**：95%（纯设计工作，风险低）

**工时**：3-4 天

**完成清单**（D38）：
- 1.1 ✅ `spec/mcp-tools.yaml` — 8 族 / 30 tool，meta-schema 校验，13 sample
  fixture 全绿；CLI 子命令唯一映射
- 1.2a ✅ `spec/schemas/state-db.sql` — 7 表（含 schema_version /
  migration_history / telemetry / specs_refs），WAL/foreign_keys 已开；
  8 valid INSERT + 8 invalid INSERT（type/priority/complexity/status/NOT NULL/
  FK/runtime/direction CHECK）全绿
- 1.2b ✅ `spec/schemas/tasks.v4.5.schema.json` + `context-file.v4.5.schema.json`
  — `x-derived` 标记到 status/deps/session_id；body 禁止出现 Status section；
  4 valid + 5 invalid fixture 全绿
- 1.3 ✅ `spec/schemas/skill-manifest.schema.json` — 现有 17/17 skill 100% 通
  过（`skills/learned/` 是元目录无 SKILL.md）；不一致时落 `spec/migration-
  notes.md`
- 1.4 ✅ `spec/cli-protocol.md` — 输入/输出/退出码三段约束，30-行
  tool↔CLI 映射表；`spec/scripts/check-cli-mapping.cjs` 0 漂移
- 1.5 ✅ `docs/ARCHITECTURE.md` — 三层数据流图 + state.db 七表 + session
  标准单元 + 双时间线
- gate ✅ `npm run test:spec` → 5 validator 全绿（json-schema / mcp-tools /
  state-db / skills / cli-mapping）

#### 任务清单

**1.1 MCP tool schema**（1 天）
- 新建 `spec/mcp-tools.yaml`（openapi 3 风格）。
- 定义 7 族 tool 的 input/output schema：`task.*` / `memory.*` / `review.*`
  / `impact.*` / `skill.*` / `session.*` / `ask.*`
- `skill.*` **只含只读接口**：`skill.resolve(name) → {path, manifest}` /
  `skill.manifest(name) → frontmatter`（D29：Codex 第二轮 R2；skill 是
  知识载体不做业务 RPC，删除 skill.invoke/list）
- 每个 tool 含：name, description, input JSON Schema, output JSON Schema,
  errors, 对应的 CLI subcommand 名。
- **AC**：pnpm `ajv validate` 所有 sample input/output 通过。

**1.2 数据 schema**（1 天）
- `spec/schemas/state-db.sql` — SQLite 权威源 schema（详见 §7.1），五表
  结构 + index + migration_history + schema_version。
- `spec/schemas/tasks.v4.5.schema.json` — tasks.json **投影视图** schema
  （仅用于 export/调试；权威仍是 state-db）：
  - status 字段存在但标 "derived"；context file header 也标 "derived"
  - 新增 `dependencies: [taskId]`、`files_modified: [path]`、`session_id`
- `spec/schemas/context-file.v4.5.schema.json` — body 部分不嵌 status；
  由投影器再生成 header。
- **AC**：每 schema 配一份合法 + 一份非法 fixture，`ajv` / sqlite3 分别返
  回 pass / fail。

**1.3 Skill manifest 规范**（0.5 天）
- `spec/skill-manifest.schema.json` — 所有 skill 的 frontmatter 规范：
  - name / description / runtime（Claude/OpenCode/Codex/Gemini/all）/
    mcp_tools_required / cli_fallback / complexity_hint（Haiku/Sonnet/Opus）
- **AC**：现有 18 skill 的 frontmatter 校验通过（≥90%，其余写 migration note）。

**1.4 CLI 协议文档**（0.5 天）
- `spec/cli-protocol.md` — ultra-tools 的约定：
  - 输入：flag + positional
  - 输出：最后一行 `{ok: true/false, data/error}` JSON
  - 退出码表
- **AC**：与 MCP tool 的 output schema 一一对应（每个 CLI 子命令匹配一个 MCP tool）。

**1.5 架构文档**（0.5 天）
- `docs/ARCHITECTURE.md` — 本 §4 内容扩写；图示 skill/MCP/CLI 三层数据流。
- **AC**：reviewer 能独立从 ARCHITECTURE 理解整个系统。

#### Phase 1 gate

- 所有 spec/ 文件通过 ajv 校验
- `spec/mcp-tools.yaml` 列出每个 tool 名与 CLI 子命令的映射表
- ARCHITECTURE.md reviewer 批准

---

### Phase 2 — 权威状态层（SQLite + WAL）✅ 完成，commit `e286e41`

**目标**：建立 `.ultra/state.db` 为**唯一权威状态源**，解决 P1/P3/P8/P9/P10
五大架构级痛点。tasks.json / context md 的 status / activity-log.json /
workflow-state 全部降级为**投影（projection）**或**导出视图**。一次写，
多处派生。

**依据**：Codex Q1 评审（状态权威源不明是最大风险）+ D18 + A4 决策。

**前置**：Phase 1（schema 已定）

**置信度**：92%（下调自 95%；SQLite 工程成熟，但权威源切换 + 投影器是新工作）

**工时**：5-6 天

**完成清单**（D39）：
- 2.1 ✅ `mcp-server/lib/state-db.cjs` + `ultra-tools db init` — 7 表 +
  WAL/synchronous/busy_timeout/foreign_keys + schema_version='4.5'；
  幂等 init；4 unit tests
- 2.2 ✅ `docs/STATE-DB-ACCESS-POLICY.md` — 三角色矩阵 + BEGIN
  IMMEDIATE + 3-retry + WAL fallback；3 worker × 100 events 并发压测
  无 'database is locked' / events.id 单调
- 2.3 ✅ `mcp-server/lib/state-ops.cjs` — 完整 API（tx / readTask /
  listTasks / createTask / patchTask / updateTaskStatus / deleteTask /
  appendEvent / subscribeEventsSince / createSession / updateSession /
  listActiveSessions / listStaleTasks）+ status 状态机；decorrelated
  jitter backoff；20 worker × 50 task × 2 transition = 2000 写事务无
  丢失；14 + 1 contract tests
- 2.4 ✅ `ultra-tools migrate --from=4.4 --to=4.5` + `--dry` +
  `--rollback`；`spec/fixtures/v4.4-project/` 最小 v4.4 项目；
  tasks.json 优先（context md status 冲突时 warning）；migration_history
  含 forward+rollback；5 tests
- 2.5 ✅ `ultra-tools db checkpoint/vacuum/integrity/backup` 4 子命令；
  backup 用 wal_checkpoint + fs.copyFileSync 产生独立可打开文件；5 tests
- 2.6 ✅ `mcp-server/lib/projector.cjs` — `projectTasks` /
  `projectContext` / `projectAll`；atomic write；`generated_at` 来自
  `MAX(updated_at, ts, applied_at)` 保证 idempotent；30 task ≤1s；ajv
  v4.5 schema 校验；5 tests
- 2.7 ✅ `mcp-server/server.cjs` — `@modelcontextprotocol/sdk` low-level
  Server + StdioServerTransport；7 task.* tool 注册（input/output 都过
  ajv）；mutating tool 触发 projector；7 contract tests（spawn 子进程 +
  StdioClientTransport）
- 2.8 ✅ `docs/COMMIT-HASH-BACKFILL.md` 描述 feat→projector→chore 两
  commit 流程；2 tests with real git repo

**测试**：`npm run test:state` 44/44 全绿；`npm run test:spec` 5/5 全绿。

#### 任务清单

**2.1 SQLite schema 设计**（1 天）
- `.ultra/state.db` 七张核心表（详见 §7.1）：
  - `tasks` / `events` / `sessions` / `telemetry` / `specs_refs`
  - **`schema_version`**（D30/R4）：当前 schema 版本号 + migration
    timestamp，避免跨版本误读
  - **`migration_history`**（D30/R4）：每次迁移的 from→to + ts + status
    审计
- `events` 表主键 **`id INTEGER PRIMARY KEY AUTOINCREMENT`**（D31/R4）：
  订阅游标走单调递增 id，不用 `max(ts)`，避免同 ms 多事件丢失
- WAL 模式：`PRAGMA journal_mode=WAL` + `PRAGMA synchronous=NORMAL` +
  `PRAGMA busy_timeout=5000`（R4 多进程访问）
- 产物：`spec/schemas/state-db.sql`（CREATE 语句 + `spec/schemas/
  state-db.migrations/` 目录）
- **AC**：schema 通过 sqlite3 解析；7 表 + 索引全部创建；`schema_version`
  初始写入。

**2.2 多进程访问策略**（0.5 天，**新增 R4.1**）
- `docs/STATE-DB-ACCESS-POLICY.md`：定义谁能写哪些表
  - MCP server（单 writer 角色）：写 tasks / events / sessions / telemetry
  - CLI（读多写少）：仅写 events（append-only）；其它 table 调 MCP
  - orchestrator daemon：写 sessions / events；读全部
- 所有写操作用 `BEGIN IMMEDIATE` + `busy_timeout=5000` + 最多 3 次重试
- **AC**：3 进程（MCP / CLI / daemon）同时写压测 → 无 `database is locked`
  报错、无丢失

**2.3 state-ops 库**（1.5 天）
- `mcp-server/lib/state-db.ts`：基于 `better-sqlite3`（同步，零依赖编译）
- 暴露：`tx(fn)` 事务 / `readTask(id)` / `updateTaskStatus(id, status)`
  / `appendEvent(event) → {id}` / `subscribeEventsSince(cursorId)` /
  `createSession({task_id, runtime, ...})` / `updateSession(sid, patch)`
  / `listActiveSessions()` / `listStaleTasks()` / ...
- 所有写入在事务里；events append 原子（返回新 id 作订阅游标）
- **AC**：20 worker 并发 `updateTaskStatus` 压测无丢失；事务回滚无部分
  写入；订阅按 events.id 单调递增无漏事件

**2.4 Migration v4.4 → v4.5**（0.5 天）
- CLI 工具 `ultra-tools migrate --from=4.4 --to=4.5`：
  - 读现有 `.ultra/tasks/tasks.json` → insert into `tasks` 表
  - 读 `contexts/task-*.md` header 中的 status → merge 进 tasks（冲突时
    tasks.json 为准）
  - 读 `.ultra/activity-log.json`（若有）→ insert into `events` 表
  - 产出 backup：`.ultra/backup-v4.4/`；写 `migration_history`
- Dry-run 模式：`--dry` 打印变更计划不落盘
- **AC**：v4.4 项目跑 migration → state.db 完整；`rollback` 可还原；
  `migration_history` 含两条记录（forward + rollback）

**2.5 DB 运维例行**（0.5 天，**新增 R4.2**）
- `ultra-tools db checkpoint`：手动 `PRAGMA wal_checkpoint(TRUNCATE)`
- `ultra-tools db vacuum`：定期 VACUUM
- `ultra-tools db integrity`：`PRAGMA integrity_check`
- `ultra-tools db backup [--to <path>]`：在线 `.backup` API
- orchestrator 定时任务：每 24h 自动 checkpoint + 每 7d 自动 backup 到
  `.ultra/backups/state-db-{ts}.db`
- **AC**：四个子命令都能跑；备份文件可单独 sqlite3 打开

**2.6 投影器（projection）**（1 天）
- 每次 state.db 变更 trigger 重写 **投影文件**：
  - `.ultra/tasks/tasks.json` — 从 `tasks` 表再生成
  - `.ultra/tasks/contexts/task-*.md` 的 status header — 从 `tasks.status`
    派生；context md 的其它 body 部分不动
- 投影是**只读视图**：Phase 3+ 代码禁止手写（读走 state-db API；写走
  MCP task.* tool）
- **AC**：改 state.db 后 ≤1s 内投影同步；手改投影 → 下次 state-db 写入
  覆盖

**2.7 MCP `task.*` 实装**（1 天）
- `task.create` / `task.update` / `task.list` / `task.get` /
  `task.delete` / `task.append_event` / `task.subscribe_events`
- 全部走 state-db（不碰文件）
- `subscribe_events(since_id=N)` 走 `events.id` cursor（D31/R4）
- **AC**：契约测试全绿

**2.8 Commit hash 回填重构**（0.5 天）
- 旧：commit → read hash → edit context → `git commit --amend`（非原子）
- 新：commit（空 hash context）→ read hash → update state-db tasks
  `completion_commit` → 投影器更新 context → **第二次 commit** "chore:
  record task-N completion hash"
- 修改 `skills/ultra-dev/SKILL.md` Step 6 描述；Phase 3 落地
- **AC**：`git log --oneline` 看到 "feat: …" + "chore: record hash" 两
  commit 并列

#### Phase 2 gate

- 20 worker 并发 `updateTaskStatus` + 3 进程（MCP/CLI/daemon）同时写压测过
- migration 可逆测试过；dry-run 预览准确
- DB 运维四子命令可用
- 投影器响应 ≤1s
- 所有 `task.*` MCP tool 契约测试全绿
- events subscribe 按 id cursor 无漏事件

---

### Phase 3 — 命令规则化（三层迁移）

**目标**：把 9 个 `/ultra-*` 命令的"厚 md 脚本"重构为"薄壳 + skill + MCP +
CLI"。消除对 Claude 独占工具的硬依赖。

**前置**：Phase 2（状态机可用）

**置信度**：90%（工作量大但模式确定；9 命令 × 0.5-1d）

**工时**：5-7 天

#### 任务清单

**3.0 命令重构模板**（0.5 天）
- 定一份"薄壳命令模板"：新 `/ultra-X` 命令文件 ≤ 80 行：
  - frontmatter（description / allowed-tools）
  - 一句话目标
  - 一个 `<workflow>` 引用对应 skill：`@skills/ultra-X/SKILL.md`
  - 一段 args 传递说明
- **AC**：模板以 `/ultra-init` 为样板走通（见 3.1）。

**3.1 `/ultra-init` 迁移**（0.5 天）
- `skills/ultra-init/SKILL.md`：workflow 从现有 ultra-init.md 迁来，其中
  所有 `TaskCreate` → 调 MCP `task.create`；`AskUserQuestion` → 调
  MCP `ask.question`；`Bash mkdir` 保留。
- `mcp-server/tools/task/init-project.ts`：新 MCP tool `task.init_project`
  做目录搭建 + 空 tasks.json 写入。
- `ultra-tools/commands/init.cjs`：CLI 兜底做同样事情。
- 三层都能完成 init → AC 对齐 CLAUDE 下今天的 init 行为。
- **AC**：在 Claude / OpenCode / Codex / Gemini 任一 runtime 下跑 init，
  产出的 `.ultra/` 目录与当前 Hermes 的 init 输出 diff-equal。

**3.2 `/ultra-research` 迁移**（1 天）
- `skills/ultra-research/SKILL.md` + 17 个 step 文件继承。
- 每步的"WebSearch + 结构化输出"保持不变；状态推进改调 `task.update`。
- 新增：每步完成后调 `memory.retain`（Phase 7 落地前是 no-op placeholder，
  先留接口）。
- **AC**：17 步跑完产出的 specs/*.md 与现有行为 diff-equal。

**3.3 `/ultra-plan` 迁移**（0.5 天）
- `skills/ultra-plan/SKILL.md`：workflow 保留；所有 tasks.json 写入改调
  MCP `task.create_batch`；scope mode 选择改调 MCP `ask.question`。
- **AC**：给一份完整 specs，生成的 tasks.json + contexts 与当前行为一致。

**3.4 `/ultra-dev` 迁移**（1.5 天，最大头）
- `skills/ultra-dev/SKILL.md`：7 大 step 的 workflow 保留。
- 双写消除：Step 1.5 / Step 5 只调 `task.update_status`，不再手改 context
  header。
- 子 agent 调用改 MCP `review.run` → 后端 Phase 3 用 MCP pool 跑；无 MCP 的
  runtime 退回 CLI `ultra-tools subagent run`（串行）。
- Step 4.4 `/compact` 依赖**移除**；改为 session.checkpoint 存状态（Phase 5
  实装；此处先留接口）。
- **AC**：单 task 完整 TDD 周期在 4 runtime 上都能跑通（跑不通的记入
  Phase 4 runtime-specific issue）。

**3.5 `/ultra-test` + `/ultra-deliver` 迁移**（1 天）
- 类似 3.3，workflow 保留，状态写入和工具调用改 MCP/CLI。
- **AC**：两命令在 Claude 下端到端跑通。

**3.6 `/ultra-status` + `/ultra-think` + `/learn` 迁移**（1 天）
- 辅助命令，逻辑简单，批量迁。
- **AC**：全 9 命令迁完。

**3.7 AGENTS.md 统一上下文**（1 天）
- 合并 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 为统一 **规则注入文件**
  （命名：每 runtime 的原生 context 文件，但内容相同）。
- 内容：三层架构说明 + 关键 MCP tool 清单 + CLI 命令表 + skill 发现路径。
- 这是 OMX "scope guard" 能力（§5.2）。
- **AC**：新装的项目自动生成对应 runtime 的 context 文件，内容一致。

**3.8 Python hooks 三分拆**（1 天）
- 按原 PLAN v0.1 的 Phase 3 做：core/ + adapters/（claude / opencode /
  codex / gemini.py）
- **AC**：Claude hooks 行为字节级一致；OpenCode/Codex 只接 2 个可达事件
  （§5.4）；Gemini 降级 prompt guard（文档化）。

#### Phase 3 gate

- 全 9 命令在 Claude 下行为 diff-equal 对照 pre-Phase-3 基线
- 命令 .md 文件平均长度从当前 300+ 行降到 ≤ 80 行（薄壳）
- MCP 7 族 tool 全部有 ≥1 个命令实际调用

---

### Phase 4 — 跨 runtime 分发

**目标**：让 skill/MCP/CLI 三层正确安装到 Claude / OpenCode / Codex / Gemini
四 runtime。包含 MCP server 注册、skill 拷贝、CLI PATH、runtime-specific 转换。

**前置**：Phase 3（三层可用）

**置信度**：88%（runtime 细节风险：hook schema 未完全公开，见 R10-R14）

**工时**：6-8 天

#### 任务清单

**4.1 共享 adapter 工具**（1 天）
- `adapters/_shared/file-ops.ts` / `frontmatter.ts` / `settings-merge.ts` /
  `path-rewrite.ts` / `md-to-toml.ts` — 从 v0.1 PLAN §6.2.1 继承。
- **AC**：5 模块共 15 单元测试，覆盖率 ≥85%。

**4.2 Claude adapter**（1 天）
- `~/.claude/{skills,commands,agents,hooks}` 直接拷贝。
- `settings.json` 注入 hook 配置 + MCP server 注册（`claudeSettingsMcpServers`
  字段）。
- **AC**：diff-equal 门槛（对 pre-Phase-4 基线）。

**4.3 OpenCode adapter**（1.5 天）
- 目标：`~/.config/opencode/{skills,agents,commands}` + `opencode.json` 注
  入 `mcp` 字段。
- agent frontmatter 小写化（PLAN §5 已核验）。
- hook 降级到 2 可达事件。
- **AC**：opencode.json 合法；跑 `/ultra-init` 烟测成功。

**4.4 Codex adapter**（2 天，含 0.5 天 spike）
- spike：抓 `hooks.json` 实际 wire format（under development，见 R11）。
- agent 拆成 `agents/<name>.toml` + 主 config 引用。
- skill 装到 `~/.agents/skills/`（open agent skills standard）。
- 命令转 `prompts/*.md`（或 AGENTS.md 语境内联，待 spike）。
- MCP server 注册到 `config.toml [mcp_servers]`。
- **AC**：config.toml 合法；`codex exec "run /ultra-init"` 成功。

**4.5 Gemini adapter**（2 天，含 0.5 天 spike）
- spike：抓 `hooks/hooks.json` + subagent frontmatter。
- **整体打包成 Gemini extension**（`~/.gemini/extensions/ultra-builder-pro/`）。
- 命令 md → toml（`md-to-toml.ts`）。
- MCP server 在 extension manifest 里声明。
- **AC**：extension 目录合法；gemini 启动识别；`gemini --prompt` 烟测成功。

**4.6a Runtime capability matrix + v0.1 smoke flow**（1 天，**D33 收敛**）
- `docs/RUNTIME-COMPAT-MATRIX.md`：列 4 runtime × ~25 能力点：
  - 问答：AskUserQuestion / CLI menu / MCP `ask.question`
  - Hook 事件：每 runtime 的可用事件名单 + payload 形状
  - Subagent：Claude Task / Codex spawn_agent / Gemini preview / OpenCode @mention
  - Usage 统计：token / cost 能否拿到
  - MCP：stdio 稳定性 / HTTP 支持
  - Skill 发现路径
  - Worktree 兼容性
  - 权限/审批模型
- `tests/conformance/<runtime>/` v0.1 基线：**每 runtime 1-2 条 smoke flow**
  - Flow 1: `install → /ultra-init → task.create → 读投影 tasks.json → uninstall`
  - Flow 2: `/ultra-dev 1` 通过 session.spawn 起 session → 关
- **AC**：matrix 文档完整；4 runtime × 2 smoke = 8 testcase 全绿

**4.6b Full conformance suite**（1 天，**推迟到 v0.2**）
- 每 runtime 5 capability 完整测试 = 20 testcase
- CI 矩阵 + 每周定跑
- 不作为 v0.1 gate；v0.2 Phase 5 结束前完成
- **AC**（v0.2 验收）：20 testcase 全绿

**4.7 install.js 真实装配**（0.5 天）
- 从 Phase 0 stub 升级为真调用 adapter。
- `--claude/--opencode/--codex/--gemini/--all` + `--local/--global` + `--uninstall`。
- 幂等：跑两次 install diff = 空。
- **AC**：4 runtime × 2 scope = 8 条安装路径全绿；uninstall 后目录干净。

#### Phase 4 gate

- 4 runtime 下 `/ultra-init` 都能跑通
- Claude diff-equal 基线通过
- runtime-compat-matrix 20 conformance testcase 全绿
- `docs/RUNTIME-COMPAT-MATRIX.md` 完整产出

---

### Phase 4.5 — Execution-lite（新增；Codex Q3）

**目标**：让 **v0.1 带最小执行层**，解决用户核心诉求"独立会话不污染"。
不等 Phase 5 全量执行层；先把 Session 标准单元（D20）+ 事件订阅 + 活跃
会话可见这三件最核心的能力落地。

**依据**：Codex Q3 + D19 + A10。

**前置**：Phase 4（规则层完整）

**置信度**：82%（session 进程化是新抽象；不复用 Claude `/compact`）

**工时**：5-6 天

#### 任务清单

**4.5.1 Session 标准单元**（2 天）
- `orchestrator/session-runner.ts`：session = 新进程 + 独立 worktree +
  **state-db `sessions` 表作为 lease/heartbeat 权威**（R4/R1：不再有
  `.ultra/sessions/<sid>/lease.json` 文件）
- 架构原则（**D32**）：lease/heartbeat 存**state.db `sessions` 表字段**，
  `.ultra/sessions/<sid>/` 只放 artifact（不含 lease 文件）；消除文件+表
  双源
- API：
  - `spawn({task_id, runtime})` → 创建 worktree `.ultra/worktrees/<sid>/`
    + 写 `sessions` 表 + 启动 runtime CLI 子进程
  - 子进程每 30s 调 MCP `session.heartbeat(sid)` → 更新 `sessions.
    heartbeat_at`
  - `closeSession(sid)` 合并 artifact（Phase 8B 强化冲突检测）
- **AC**：
  - spawn 一个 `/ultra-dev 1`，进程隔离、worktree 独立、artifact 写入
    `.ultra/sessions/<sid>/`
  - kill -9 子进程 → lease_expires_at 过期（无 heartbeat 更新）可被识别

**4.5.2 Single-active-lease admission control**（1 天，**新增 R3**）
- spawn 前先查 `sessions` 表：同 task_id 已有 status=running + lease 未
  过期 → 三选一策略：
  - `--takeover`：强杀老 session + 新 session 接管
  - `--resume`：复用老 session（若 heartbeat 新鲜）
  - `--abandon`：放弃 spawn 报错
- 默认策略可配（`workflow.admission_policy`），默认 abandon 保守
- MCP tool `session.admission_check(task_id) → {has_active, lease_info}`
- **AC**：
  - 同 task 已有 active session 时，spawn 默认被拒
  - `--takeover` 能清掉旧 session 启动新的
  - 并发 spawn 同 task → 只有 1 个成功

**4.5.3 Event subscribe 接口**（0.5 天）
- MCP tool `session.subscribe_events(since_id=N, filter)` → 走 `events.id`
  cursor（D31；不用 `max(ts)`）
- 实时推送：polling + id cursor，≤1s latency
- **AC**：session A 调 `task.update_status completed` → session B 按
  events.id 订阅回调 ≤1s 收到；跨 ms 多事件无漏

**4.5.4 `/ultra-status` 基础版**（1 天）
- 读 state-db `sessions` + `events`（按 id DESC limit 20）→ 文本面板：
  活跃 session 列表 + 最近事件 + 疑似 orphan 警告
- **AC**：status 输出 "2 active sessions: sid-abc (task 1, claude), sid-def
  (task 3, codex); last event: task-1 completed 2min ago"

**4.5.5 `/ultra-dev` session 化**（1 天）
- 改 `skills/ultra-dev/SKILL.md`：开始调 `session.admission_check` + `
  session.spawn`，结束调 `session.close`
- 移除对 `/compact` 依赖（D19）；用 artifact dir 暂存代替
- **AC**：两 user 同机并发 `/ultra-dev 1` + `/ultra-dev 2` 独立 worktree
  / session，commit 分别记录

**4.5.6 Orphan lease 清理**（0.5 天）
- 启动时 / 定时扫 `sessions` 表：status=running + `lease_expires_at < now()`
  + `heartbeat_at` 过期 → 标记 `status=orphan`（不删；Phase 5 接管 recovery）
- **AC**：orphan 被打标；不被误当成 active

#### Phase 4.5 gate

- 2 并发 session 隔离测试过
- 同 task 并发 spawn → 单活 admission 测试过
- kill -9 → lease 过期识别测试过
- event subscribe 按 id cursor latency ≤1s
- 无文件+表双源（grep 代码无 `lease.json`）

**▶ v0.1 发布就绪点**：Phase 0-4.5 完工 → 用户 `npx ultra-builder-pro-cli
--claude --global` 装上，即可跨 4 runtime 手动并发跑任务、会话独立、事件
订阅、活跃会话可见。真·可用的最小单元。

---

### Phase 5 — 执行层进阶（recovery + staleness + 自动分派）

**目标**：在 Phase 4.5 的基础单元上加 recovery + 熔断 + staleness +
runtime 自动路由。

**前置**：Phase 4.5

**置信度**：85%

**工时**：4-5 天

#### 任务清单

**5.1 Recovery**（2 天）
- `orchestrator/recovery.ts`：
  - 启动时扫 `sessions` 表：status=running + lease 过期 + 无 heartbeat
    → 标记 crashed → 决策重试 / 熔断
  - 从 GSD-2 `recovery.ts` 移植策略
- **AC**：`kill -9` 跑 dev 的 session，orchestrator 重启后能续（或按策略熔断）

**5.2 Circuit breaker**（0.5 天）
- `circuit-breaker` 表：per task 连续失败 ≥3 次 → 熔断 → 事件 + 警告
- **AC**：故意 make test 必失败，跑 3 次自动停止

**5.3 Task staleness**（0.5 天）
- events 表收到 `spec_changed(sections: [X])`：扫 tasks.trace_to 命中的
  pending task → 设 `stale=true`
- 投影器更新 context md header 显示 "⚠️ stale since <ts>"
- **AC**：手动改 specs/product.md 后，pending task 被正确标 stale

**5.4 Runtime 自动路由（orchestrator daemon）**（1.5 天）
- `orchestrator/daemon.ts`：常驻监听 events 流，pending task 出现时按
  `complexity_hint` + runtime 可用性分派
- 注意：**不是 dispatch rules**（那是 Phase 8B），只是最简单的按 tag /
  runtime 选择
- **AC**：tasks.json 新增 pending → daemon 1s 内 spawn 对应 session

#### Phase 5 gate

- kill -9 恢复 + 熔断 + staleness 三组测试过
- daemon 自动分派可开关（opt-in）

**▶ v0.2 发布就绪点**：Phase 5 完工 → 半自动协作可能。用户可以起多个
agent 并行，orchestrator 负责 session 隔离和状态一致。

---

### Phase 6 — 监控与优化

**目标**：token 压缩、成本埋点、可观测性。让 agent 的"黑盒行为"变可见。

**前置**：Phase 5（session 是监控的归属单位）

**置信度**：93%（RTK 成熟；埋点是标准工程）

**工时**：3-4 天

#### 任务清单

**6.1 RTK 集成**（0.5 天）
- install.js 完工时检测 rtk 二进制 → 调 `rtk init -g` 注册 PreToolUse hook。
- 无 rtk → 提示安装 + 跳过（不硬依赖）。
- **AC**：Claude 下 `cargo test` 输出 token 压缩 60%+。

**6.2 Telemetry collectors**（1.5 天）
- `telemetry/collectors/token.ts`：从 activity-log + session log 抽 token
  使用量；按 task / session / runtime 聚合。
- `telemetry/collectors/tool-call.ts`：每次 MCP tool 调用 + 每次 CLI 调用
  打点。
- `telemetry/collectors/cost.ts`：按 runtime 的 pricing 推算。
- 写 `.ultra/telemetry/{date}.jsonl`。
- **AC**：跑一个完整 task 后，telemetry 含该 task 的 token / cost / tool
  count。

**6.3 /ultra-status 深化**（1 天）
- 读 telemetry → 展示 "本周 token 消耗"、"每 runtime 成本分布"、"最贵的
  task top 3"。
- **AC**：status 输出含 cost 面板。

**6.4 code-review-graph 实时增量 watcher**（2 天，**新增 D24**）
- 不是 "Phase 启动时 build"；而是 daemon 模式：
  - `orchestrator/code-graph-watcher.ts`：fs-watch 项目代码路径 +
    debounce 500ms
  - 每次 editor save / git commit → 增量 tree-sitter 解析 → 更新
    `.code-review-graph/graph.db`
  - 大改（>50 文件）触发后台 full rebuild，不阻塞 agent
- MCP tool `impact.*`（`impact.radius` / `impact.changes` /
  `impact.dependents`）从最新 graph.db 查询
- agent session 启动时调 `impact.radius(target_files)` 获得最小必读集
- **AC**：editor save → graph.db ≤3s 更新（小改 ≤1s）；impact.radius
  返回准确依赖集（10 文件项目的命中率 ≥95%）

**6.5 Runtime stdout 拦截（可选）**（1 天）
- orchestrator spawn agent 时拦截 stdout，解析 Anthropic/OpenAI/Gemini
  SDK 的 usage 字段（若可达）。
- 更精准的 token 统计（不依赖 rtk 推测）。
- **AC**：对一个已知 token 数的 task 做 E2E，telemetry 与官方 usage 误差 <5%。

#### Phase 6 gate

- telemetry 覆盖率：每 MCP tool 调用 100% 有埋点
- `/ultra-status` cost panel 数字可信（与 SDK usage 对账 <5% 误差）
- code-review-graph watcher 实时增量测试过

---

### Phase 7 — 智能层（记忆 + tagged + skill 学习）

**目标**：引入**wrapper 式自动记忆 + tagged task 分区 + skill 自动萃取**，
让每 task 起步即有上下文，分支并发无混乱。

> 变更：原 Phase 7.1（code-review-graph）已移至 Phase 6.4（实时增量 watcher）。
> 原 Phase 7.4（模型自适应路由）后移到 v0.2+（D27）。
> 新增 Phase 7.2（Task Master tagged lists）（D26）。
> hindsight 升级为 wrapper 式（D25）。

**前置**：Phase 6（监控 + 实时图谱）

**置信度**：80%（hindsight wrapper 自定义实现；tagged 迁移 schema）

**工时**：7-8 天

#### 任务清单

**7.1 Hindsight wrapper 式自动记忆**（3 天，**D25**）
- 不仅暴露 `memory.retain` / `memory.recall` / `memory.reflect` 三个 MCP tool。
- **Wrapper 自动化**：
  - session 结束 hook：自动从 session 的 events + transcript 中提取结构化
    事实 → 自动 `memory.retain` 到 bank=project
  - session 启动前：自动 `memory.recall(query=当前 task title + 上下文)`
    → prefetch 到 session prompt 注入
- 内嵌 hindsight-server（`HindsightServer` context manager），避免 Docker
- **AC**：
  - 跑 3 个相关 task 后，第 4 个 task 起步自动 prefetch ≥2 条相关历史
  - MCP 显式调用也能用（兜底）

**7.2 Task Master tagged task lists**（2 天，**D26**）
- tasks 表新增 `tag` 字段 + index
- `/ultra-plan` 支持 `--tag <name>`；`/ultra-dev --tag` 限定任务列表
- 分支并发场景：每 git branch 自动关联一个 tag（首次进入该分支时交互
  创建）
- MCP `task.list --tag X` / `task.switch_tag`
- **AC**：在 branch `feat/auth` 下运行 `/ultra-dev` 只看到 auth tag 的任务
  列表，切到 `feat/billing` 立刻切上下文

**7.3 Skill 自动萃取（OMC 模式）**（2 天）
- session 结束 hook：分析 transcript → 提取"解决了什么非平凡问题" →
  草稿为 `skills/learned/<id>_unverified.md`
- 人审通过后去掉 `_unverified` 后缀
- **AC**：跑 5 个包含 debugging 的 task 后，skills/learned/ 下生成 ≥3 个
  unverified skill

#### Phase 7 gate

- hindsight wrapper 自动 retain + prefetch smoke test 通过
- tagged task list 分支切换测试通过
- skill 萃取至少 3 条 unverified 产出

---

### Phase 8A — 计划自动化（planner 线）

**目标**：PRD → task 分解 → 依赖拓扑 → 自动 expand → **execution plan
artifact** → human gate 批准。这是 "coding 工厂" 的**前端**（决定做什么 /
做的顺序 / 谁跟谁冲突 / 哪些能并行）。

**依据**：Codex Q4 + D22（拆分）+ Codex 第二轮 R5（artifact + 依赖软化）

**前置**：Phase 4.5（session 标准单元） + Phase 6（监控） — **Phase 7
是可选增强**（memory / complexity_hint 是加分项，不是正确性前置 **D34**）

**置信度**：88%（PRD 解析成熟；human gate 简单；依赖拓扑算法标准）

**工时**：4-5 天（原 3-4 天 + artifact 1 天）

#### 任务清单

**8A.1 PRD 自动拆 task（CTM 模式）**（2 天）
- 新 MCP tool `task.parse_prd(prd_text)` → 返回 task[]（ID、title、deps、
  complexity 预估、files_modified 预测）
- 后端：调 Anthropic/OpenAI LLM（model 可配）
- skill `ultra-plan` 新分支："从 PRD 自动拆"
- **AC**：给一份 2 KB PRD，产出的 tasks.json ≥80% 与人工拆分语义等价

**8A.2 Dependency graph + 拓扑**（1 天）
- `task.dependency_topo` MCP tool：返回拓扑排序 + 可并行的 wave 分组
- 循环检测：若有 cycle 直接报错
- **AC**：环任务被拒绝；无环 tasks 输出正确 wave 分组

**8A.3 Auto-expand**（1 天）
- `task.expand(task_id)` MCP tool：用 LLM 把 complexity ≥7 的 task 自动
  拆 subtasks
- 输出保留原 task 为 "parent"，新增 subtasks 插入 tasks 表
- Phase 7 的 `complexity_hint` 存在时精度更高；**不存在也能跑**（fallback
  到 LLM 直接估）
- **AC**：complexity=9 的 task 自动拆成 3-4 subtask；parent status 变
  "expanded"

**8A.4 Execution Plan artifact**（1 天，**新增 Codex R5**）
- 生成 `.ultra/execution-plan.json`：
  ```jsonc
  {
    "waves": [
      { "id": 1, "tasks": [...], "parallel": true },
      { "id": 2, "tasks": [...], "parallel": false, "reason": "shared file X" }
    ],
    "ownership_forecast": { "task_1": ["src/auth.ts"], ... },
    "conflict_surface": [
      { "files": ["src/utils.ts"], "tasks": ["3", "7"], "recommend": "sequentialize" }
    ],
    "estimated_cost_usd": 2.4,
    "estimated_duration_min": 90
  }
  ```
- 8B orchestrator 读此 artifact 做分派，不在运行时才判并发
- MCP tool `plan.export` / `plan.get`
- **AC**：一个有 5 task 的 tasks.json → artifact 含完整 waves + conflict
  分析；人工审阅 ownership 预测与实际代码改动 ≥70% 一致

**8A.5 Human gate in /ultra-plan（OMX 模式）**（0.5 天）
- 生成 execution-plan.json 后调 MCP `ask.question` 展示 plan 摘要 +
  estimated cost → 等用户 approve 才 commit 到 state-db
- **AC**：plan 产出一个 `ask` 对话；用户 reject 时不写 state-db

#### Phase 8A gate

- PRD 解析准确率 ≥80%
- 拓扑算法正确性（5 组 fixture 测试）
- auto-expand 可开关
- human gate 强制 gate

---

### Phase 8B — 执行自动化（executor 线）

**目标**：dispatch rules + 并行 orchestrator + worktree 并发 +
files_modified 重叠检测 + 自动合并。这是 "coding 工厂" 的**后端**
（怎么把 8A 的任务跑完）。

**依据**：Codex Q4 + D22

**前置**：Phase 8A（计划自动化提供队列输入）+ Phase 4.5（session 标准单元）

**置信度**：78%（GSD-2 模式移植量大；并发 worktree + merge back 是最高
风险点）

**工时**：5-6 天

#### 任务清单

**8B.1 DISPATCH_RULES 声明表（GSD-2 模式）**（2 天）
- `orchestrator/dispatch-rules.ts`：数组化规则：
  ```ts
  {
    when: (ctx) => ctx.task.status === 'pending' && deps_ready(ctx),
    action: 'spawn_agent',
    runtime: select_runtime(ctx.complexity),
  }
  ```
- 从 `gsd-2/src/resources/extensions/gsd/auto-dispatch.ts` 移植
- 比 Phase 5.4 的"最简路由"强：规则可组合、可观测、可回放
- **AC**：规则表能在不改代码的情况下调整分派行为；10 规则 fixture 测试
  全绿

**8B.2 Parallel orchestrator**（2 天）
- `orchestrator/parallel-orchestrator.ts`：多 session 并行，slice 级并发
- 每 slice 检测 `files_modified` 重叠 → 重叠则串行（GSD 算法）
- **AC**：10 个独立文件的 task 全部并行跑；2 个改同一文件的 task 自动
  串行化

**8B.3 Worktree 并发管理**（1 天）
- `orchestrator/worktree-manager.ts`：每并发 slice 创建独立 git worktree
  （Phase 4.5 已有单 session worktree；此处是 N 并发 worktree 调度）
- session 结束后清理 worktree
- **AC**：3 slice 并发独立 worktree；`git branch` 互不干扰；`.git/config.lock`
  不竞争

**8B.4 Auto-merge back**（1 天）
- session.close 时：
  - 检查 files_modified 与主分支最新状态是否冲突
  - 无冲突 → 自动 merge；有冲突 → 标记事件 `merge_conflict` 等人
- **AC**：3 slice 各改独立文件 → 自动全部 merge；2 slice 改同文件 →
  一个 merge 一个等

#### Phase 8B gate

- 跑一个 10-task PRD（8A 产出）→ 8B 自动完成率 ≥80%
- 并发 worktree 压力测试：5 slice 同时跑无 git 锁冲突
- merge back 冲突被正确识别

**▶ v0.3 完工 = 自动化 coding 工厂可用**（8A+8B 合并里程碑）。

---

### Phase 9 — 发布

**目标**：三渠道上架；CI 矩阵绿；README 重写。

**前置**：Phase 8

**置信度**：97%（发布流水线是标准工程）

**工时**：2-3 天

#### 任务清单

**9.1 CI 矩阵**（1 天）
- GitHub Actions：`{claude, opencode, codex, gemini} × {local, global}`
  = 8 jobs + `rtk / code-review-graph / hindsight` 可选集成测试。
- **AC**：所有矩阵单元绿，每周定时跑一次（catch runtime 上游变更）。

**9.2 README 重写**（0.5 天）
- 从 57 KB 旧 Hermes 文档 → 8 KB CLI README：
  - 一张 30 秒 demo gif
  - 四 runtime quickstart
  - skill/MCP/CLI 三层速查表
  - 功能矩阵（哪 runtime 支持什么）
  - troubleshooting
- 旧内容搬 `docs/LEGACY-HERMES.md`。

**9.3 发布流水线**（1 天）
- **npm**：tag 触发 `npm publish`。
- **Homebrew**：`rocky2431/homebrew-tap`，formula + action 自动同步。
- **pip**：瘦 wrapper 包 `ultra-builder-pro` on PyPI；shell out 到 npx。
- **AC**：三渠道安装同一 commit SHA；新 macOS 60 秒装完。

**9.4 CHANGELOG + release notes**（0.5 天）
- v0.1.0 / v0.2.0 / v0.3.0 / v1.0.0 分别记录 Phase 0-4 / 5-6 / 7-8 / 9 的
  增量。
- 每版写"known issues"清单。

#### Phase 9 gate

- 三渠道 live；`brew install rocky2431/tap/ultra-builder-pro-cli` 能装
- `pip install ultra-builder-pro` 能装
- `npx ultra-builder-pro-cli@latest` 能装

---

## 7. 跨 Phase 契约（核心接口）

### 7.1 `.ultra/state.db` SQLite schema（Phase 2 权威源）

```sql
-- tasks 表（权威 task 状态）
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,                       -- architecture|feature|bugfix
  priority TEXT,                   -- P0-P3
  complexity INTEGER,              -- 1-10
  status TEXT NOT NULL,            -- pending|in_progress|completed|blocked|expanded
  deps JSON,                       -- [task_id]
  files_modified JSON,             -- [path] (Phase 8B 并发检测)
  session_id TEXT,                 -- 当前执行方（Phase 4.5）
  stale BOOLEAN DEFAULT 0,         -- spec 改动标记（Phase 5.3）
  complexity_hint TEXT,            -- low|medium|high（Phase 7）
  tag TEXT,                        -- Phase 7.2 分支分区
  trace_to TEXT,                   -- spec 引用
  context_file TEXT,               -- 投影文件路径
  completion_commit TEXT,          -- Phase 2.6 hash 回填
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- events 表（append-only 事件流；id 作为 subscribe 游标，D31）
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- 单调递增，订阅用 since_id=N
  ts TIMESTAMP NOT NULL,
  type TEXT NOT NULL,              -- task_started|task_completed|spec_changed|...
  task_id TEXT,
  session_id TEXT,
  runtime TEXT,
  payload_json JSON
);
CREATE INDEX events_ts_type ON events(ts, type);
CREATE INDEX events_task ON events(task_id, id);

-- sessions 表（执行单元 — 权威 lease/heartbeat，D32；不再有 lease.json 文件）
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  task_id TEXT,
  runtime TEXT,                    -- claude|opencode|codex|gemini
  pid INTEGER,
  worktree_path TEXT,
  artifact_dir TEXT,
  status TEXT,                     -- running|completed|crashed|orphan
  lease_expires_at TIMESTAMP,
  heartbeat_at TIMESTAMP,
  started_at TIMESTAMP
);
CREATE INDEX sessions_active ON sessions(status, task_id);

-- schema_version 表（D30/R4：跨版本误读防护）
CREATE TABLE schema_version (
  version TEXT PRIMARY KEY,        -- '4.5', '5.0', ...
  applied_at TIMESTAMP NOT NULL,
  description TEXT
);

-- migration_history 表（D30/R4：迁移审计）
CREATE TABLE migration_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_version TEXT,
  to_version TEXT,
  direction TEXT,                  -- forward|rollback
  ts TIMESTAMP NOT NULL,
  status TEXT,                     -- success|failed|dry_run
  notes TEXT
);

-- telemetry 表（监控）
CREATE TABLE telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event_type TEXT,                 -- tool_call|token_usage|cost
  tokens_input INTEGER,
  tokens_output INTEGER,
  tool_name TEXT,
  cost_usd REAL,
  ts TIMESTAMP
);

-- specs_refs 表（spec 变更追踪）
CREATE TABLE specs_refs (
  spec_file TEXT,
  section TEXT,
  anchor TEXT,
  last_modified_at TIMESTAMP,
  PRIMARY KEY (spec_file, section)
);

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA busy_timeout=5000;         -- 多进程访问容忍（R4.1）
```

**投影（projection）**：
- `.ultra/tasks/tasks.json` 由 `tasks` 表再生成（v4.5 过渡保留；Codex 第二
  轮 R1 指出：v4.5 是过渡期名称，不是 v5）
- `.ultra/tasks/contexts/task-*.md` 的 Status header 由 `tasks.status` 派生
- `.ultra/activity-log.json`（可选 JSONL 导出）由 `events` 表 dump

**权威路径**：所有读写走 MCP `task.*` / `session.*` / `memory.*` tool →
state-db。手工改 JSON/MD **不生效**（投影覆盖）。

**无双源原则（D32）**：
- lease / heartbeat **只在 `sessions` 表**（不再有 `lease.json` 文件）
- activity-log **只在 `events` 表**（JSONL 导出是只读 snapshot）
- 任何新模块引入 `.ultra/` 下新文件前，先检查是否可用既有表 + 字段表达

### 7.2 `events` 表事件类型枚举

```
-- 状态生命周期
task_created / task_started / task_completed / task_failed / task_blocked
task_expanded / task_stale_marked

-- 会话生命周期
session_spawned / session_closed / session_crashed / session_orphaned
session_heartbeat_lost

-- spec / 内容变更
spec_changed / context_updated / plan_approved

-- 外部动作
commit_pushed / review_verdict / merge_conflict / auto_merged

-- 监控
cost_alert / token_alert / circuit_open
```

### 7.3 MCP tool 命名约定（Phase 1 `spec/mcp-tools.yaml`）

`{family}.{verb}`：
- `task.create / update / list / get / delete / expand / parse_prd / dependency_topo / append_event / subscribe_events`
- `memory.retain / recall / reflect`
- `review.run / verdict`
- `impact.radius / changes / dependents`
- `skill.resolve / skill.manifest`（**只读**；Codex 第二轮 R2/D29 —
  删除 `skill.invoke / list`，skill 由命令薄壳 + agent 读 SKILL.md
  完成，不做业务 RPC）
- `session.spawn / close / get / admission_check / heartbeat / subscribe_events`
- `ask.question / menu`
- `plan.export / plan.get`（8A 新增，execution-plan artifact）

### 7.4 Phase 依赖显式图（v0.3）

```
Phase 0 (done)
   │
   ▼
Phase 1 (三层接口定义)
   │
   ▼
Phase 2 (权威状态层 SQLite)
   │
   ▼
Phase 3 (命令规则化)
   │
   ▼
Phase 4 (跨 runtime 分发 + 4.6 capability matrix)
   │
   ▼
Phase 4.5 (execution-lite: session + event subscribe + status)
   │
   └─────────────────────────▶ v0.1 RELEASE（规则层 + execution-lite）
   │
   ▼
Phase 5 (执行层进阶: recovery + staleness + 自动路由)
   │
   ▼
Phase 6 (监控 + code-review-graph 实时 watcher)
   │
   └─────────────────────────▶ v0.2 RELEASE（半自动 + 监控）
   │
   ▼
Phase 7 (hindsight wrapper + tagged lists + skill 萃取)
   │
   ▼
Phase 8A (计划自动化: PRD → topo → expand → human gate)
   │
   ▼
Phase 8B (执行自动化: dispatch rules + parallel worktree + merge)
   │
   └─────────────────────────▶ v0.3 RELEASE（自动化 coding 工厂）
   │
   ▼
Phase 9 (发布: npm + Homebrew + pip)
   │
   └─────────────────────────▶ v1.0 RELEASE
```

**依赖性**：
- 同 Phase 内任务可并行
- 跨 Phase 严格串行
- **例外**：Phase 8B 依赖 **Phase 8A + Phase 4.5**（两个前置）

---

## 8. 测试策略

| 层 | 框架 | 覆盖目标 | Phase |
|---|---|---|---|
| spec schema fixtures | `ajv` + sqlite CLI | 合法 + 非法 fixture 各 ≥1 | 1 |
| SQLite 并发写 | node:test + 20-worker 压力脚本 | 并发无丢失、事务回滚正确 | 2 |
| migration v4.4→v4.5→rollback | node:test + tmp fixture 项目 | 双向无损 | 2 |
| 投影器响应时间 | fs-watch + 时间采样 | ≤1s | 2 |
| MCP tool 契约 | fixture → tool → 期望 state-db 变化 | 100% tool 契约测试 | 3 |
| adapter install / uninstall | shell E2E with tmp dir | 每 runtime diff-equal | 4 |
| **conformance tests** | **per-runtime E2E (mocked CLI binary 兜底)** | **4 runtime × 5 能力全绿** | **4.6** |
| session isolation | kill -9 lease 过期测试 + 2 并发独立 worktree | 无数据腐败 | 4.5 |
| event subscribe latency | fixture 发事件 + 订阅端时间采样 | ≤1s | 4.5 |
| recovery + circuit breaker | 故意 kill / 故意 fail 3 次 | 正确续 / 正确熔断 | 5 |
| telemetry 准确性 | 对照官方 SDK usage | 误差 <5% | 6 |
| code-review-graph 增量 | editor save 时间采样 | ≤3s 更新 | 6.4 |
| hindsight wrapper 自动化 | 跑 3 task → 第 4 task 起步 prefetch | ≥2 条相关 | 7.1 |
| tagged task list 切换 | git branch 切换 + task.list | 上下文隔离 | 7.2 |
| PRD 拆 task | 人工 vs 自动语义对比 | ≥80% 一致 | 8A |
| 并发 worktree | 5 slice 并发 | 无 git 锁冲突 | 8B |
| merge back 冲突检测 | 2 slice 改同文件 | 一 merge 一 等 | 8B |
| 发布矩阵 | GHA 8-job 矩阵 | 全绿 | 9 |

---

## 9. 风险与对策

继承 v0.2 PLAN 的 R1-R20（见 git 历史），v0.3 新增 R21-R24：

| ID | 风险 | 概率 | 影响 | 对策 | Owner |
|----|------|------|------|------|-------|
| R15 | MCP server stdio 在部分 runtime 有 buffer 问题（Windows/WSL） | 中 | 中 | 首版仅 macOS/Linux；Windows 加明确警告 | Phase 4 |
| R16 | hindsight 内嵌 server 启动慢 → orchestrator 首次延迟 | 中 | 低 | 首次启动后 fork 常驻；健康检查 + 预热 | Phase 7 |
| R17 | code-review-graph 大仓库首次 build > 2min | 中 | 低 | 后台构建 + UI "构建中" 提示；Phase 8 并发前必 build 完 | Phase 6 |
| R18 | orchestrator daemon 崩溃但 session 还在跑 | 低 | 高 | session 自带 heartbeat；lease 过期 5 min 无心跳 → 自动清理 + 标记 orphan | Phase 5 |
| R19 | 三层 schema 不同步（Phase 1 后各 Phase 漂移） | 中 | 高 | 单源生成脚本：`spec/mcp-tools.yaml` → TypeScript 类型 + skill frontmatter 校验 + CLI 参数解析 | Phase 1 |
| R20 | v0.2 执行层复杂度爆炸 → v0.1 发布延迟 | 高 | 高 | 严格分阶段发布：Phase 0-4.5 完就发 v0.1 | 整体 |
| **R21** | **SQLite WAL 模式在 NFS / SMB / Docker mount 不可靠** | 中 | 高 | 首版仅本地文件系统；`.ultra` 在网络盘时给警告；fallback 到 DELETE 模式（降级并发能力）| Phase 2 |
| **R22** | **v4.4 → v4.5 migration 在异常项目上失败**（已有 context 文件手改过 / 字段缺失 / 编码问题） | 中 | 中 | migration 前自动备份；跑 dry-run 模式；手动修复 path 可选；跑错可 rollback | Phase 2.3 |
| **R23** | **conformance tests 基础设施投入过重** | 中 | 中 | 用 mock runtime 二进制覆盖 CI；真 runtime 只在 release 前跑一次；不阻塞日常 PR | Phase 4.6 |
| **R24** | **Phase 4.5 execution-lite 把 v0.1 工期从 5 周推到 8 周** | **高** | **中** | 接受（D19 已决）；作为 v0.1 的最大价值点；任何 Phase 5+ 的滑动不影响 v0.1 | Phase 4.5 |
| **R25** | **多进程（MCP/CLI/orchestrator）同时写 state.db 引发 `database is locked`**（Codex R2 第二轮 R4.1） | 中 | 高 | `docs/STATE-DB-ACCESS-POLICY.md` 定义单 writer 角色；`BEGIN IMMEDIATE` + `busy_timeout=5000` + 3 次重试；3 进程并发压测 | Phase 2.2 |
| **R26** | **events 订阅用 `max(ts)` 在同 ms 多事件下漏事件**（Codex R4） | 中 | 高 | 改用 `events.id AUTOINCREMENT` 单调游标；`subscribe_events(since_id=N)` 接口；D31 | Phase 2.3 |
| **R27** | **缺 schema_version / migration_history → 跨版本误读 / 迁移无审计**（Codex R4） | 低 | 高 | Phase 2.1 schema 直接含两表；每次 migration 写一条记录；D30 | Phase 2.1 |
| **R28** | **缺 WAL checkpoint / VACUUM / integrity_check / 在线备份**（Codex R4） | 中 | 中 | `ultra-tools db checkpoint/vacuum/integrity/backup` 四子命令；orchestrator 定时任务每 24h/7d | Phase 2.5 |
| **R29** | **sessions 表 + lease.json/heartbeat 文件双源**（Codex R1 / R4） | 中 | 高 | lease/heartbeat 只在 `sessions` 表字段；`.ultra/sessions/<sid>/` 只存 artifact；D32 | Phase 4.5.1 |
| **R30** | **同 task 并发 spawn → 双开**（Codex R3） | 中 | 高 | `session.admission_check` 强制前置；三策略 takeover/resume/abandon；D33 single-active-lease | Phase 4.5.2 |
| **R31** | **8A 未产出可审计 artifact，8B 运行时才判并发 → 决策过晚**（Codex R5） | 中 | 中 | 8A.4 产 `.ultra/execution-plan.json`（waves + ownership + conflict）；8B 读此文件分派；D34 | Phase 8A.4 |
| **R32** | **4.6 full conformance 作为 v0.1 gate → runtime 兼容实验室先于核心价值**（Codex R6） | 中 | 中 | 拆 4.6a（v0.1：smoke flow 每 runtime 1-2 条）+ 4.6b（v0.2：full 20 testcase + 周跑）；D35 | Phase 4.6a/b |

---

## 10. 置信度拆分

| Phase | 工作 | 置信度 | 降低原因 |
|-------|------|-------:|---------|
| 0 | 骨架 | 100% | 已完成 |
| 1 | 三层接口定义 | 95% | 纯设计；R19 单源生成减分 |
| 2 | **权威状态层（SQLite + WAL + 多进程策略 + migration + 运维）** | **90%** | 下调自 92%；R25/R26/R27/R28 加五类新投入 |
| 3 | 命令规则化（9 命令薄壳化） | 90% | 状态源统一后反而简化 |
| 4 | 跨 runtime 分发 | 86% | hook schema 不公开（R1/R10-R14） |
| **4.5** | **Execution-lite（session + admission + event + status）** | **84%** | 上调自 82%；admission control（R30）降低并发歧义；lease 权威单源化（R29） |
| 4.6a | v0.1 smoke flow + capability matrix | 92% | gate 降级；仅 8 testcase |
| 4.6b | Full conformance suite（v0.2） | 85% | 完整 20 testcase + 周跑 |
| 5 | 执行层进阶（recovery + staleness + 自动路由） | 85% | 规模减小；R18 心跳 |
| 6 | 监控 + code-review-graph 实时增量 | 88% | fs-watch 增量比启动 build 复杂 |
| 7 | 智能层（hindsight wrapper + tagged + skill 萃取） | 80% | hindsight wrapper 自定义；tagged schema 迁移 |
| 8A | 计划自动化（parse/topo/expand + **artifact** + human gate） | 86% | 下调自 88%；新增 artifact +1 天；但 8B 并发更稳 |
| 8B | 执行自动化（dispatch/parallel/worktree/merge） | 80% | 上调自 78%；8A 的 artifact 降低运行时决策歧义 |
| 9 | 发布 | 97% | 三渠道标准 |
| **综合** | | **86%** | v0.3.1 与 v0.3 综合持平；Phase 2 下调被 4.5 + 8A/8B 上调抵消 |

**残差 14%**（加权）：
- 4% = 4 runtime hook schema 不公开（Phase 4/R1/R10-R14）
- 3% = session 管理生产稳定性（Phase 4.5/5 / R18/R29/R30）
- 3% = SQLite 运维（R21/R25/R28）
- 2% = hindsight wrapper 召回质量（Phase 7.1）
- 3% = 并发 merge back 复杂度（Phase 8B）

---

## 11. 时间线（14-18 周，Codex 第一轮 Q9 + 第二轮 R6 修订）

```
Week 1       Phase 1 三层接口定义（含 skill.resolve/manifest 精简 D29）
Week 2-3     Phase 2 权威状态层
             （SQLite + schema_version + migration + 运维四子命令）
Week 4-5     Phase 3 命令规则化（9 命令薄壳化）
Week 6-7     Phase 4 跨 runtime 分发 + 4.6a v0.1 smoke flow
Week 8       Phase 4.5 execution-lite（含 admission control D33）
            ──────────── v0.1 RELEASE ────────────
Week 9-10    Phase 5 执行层进阶
Week 10      Phase 4.6b full conformance suite（并行跑）
Week 11      Phase 6 监控 + code-review-graph 实时 watcher
            ──────────── v0.2 RELEASE ────────────
Week 12-13   Phase 7 智能层（hindsight wrapper + tagged + skill 萃取）
Week 14      Phase 8A 计划自动化（含 execution-plan artifact D34）
Week 15-16   Phase 8B 执行自动化
            ──────────── v0.3 RELEASE ────────────
Week 17      Phase 9 发布流水线（npm + Homebrew + pip）
            ──────────── v1.0 RELEASE ────────────
Week 18      buffer（ship 中任何 Phase 的 25% 滑动吃掉）
```

**关键里程碑**（可独立对外交付）：
- **Week 8 · v0.1**：规则层 + 独立会话隔离 + single-active-lease +
  活跃会话可见（用户最核心诉求完整落地）
- **Week 11 · v0.2**：自动恢复 + 监控 + 实时图谱 + full conformance
  （半自动协作）
- **Week 16 · v0.3**：PRD → execution-plan artifact → 自动并行分派 /
  合并（coding 工厂）
- **Week 17-18 · v1.0**：三渠道发布

**总工时**：14-18 周 AI 协助，~300-400 工时。

**关键里程碑**：
- v0.1（Week 5）：规则层可用 — 跨 runtime 手动跑
- v0.2（Week 8）：半自动 — session 隔离 + 监控
- v0.3（Week 12）：自动工厂 — PRD → task → 并行
- v1.0（Week 13）：三渠道发布

**slack buffer**：Phase 5 / 7 / 8 各 25% 保险；如 hook spike 失败追加 2-3
天。

---

## 12. 成功度量（v1.0 发布时核查）

1. **多 runtime 可用**：4 runtime × 2 scope = 8 安装路径全绿。
2. **并发无损**：20-worker 压力测试对 tasks.json 无丢更新。
3. **独立会话**：两 agent 同跑 `/ultra-dev 1` 和 `/ultra-dev 2`，互不污染，
   最终 commit 独立。
4. **事件传播**：agent A 完成 task 1 后，≤1s 内 agent B 通过 MCP 看到。
5. **崩溃恢复**：kill -9 跑 dev 的 agent，重启后能续或熔断。
6. **Token 压缩**：RTK 启用后 Bash 命令 token 减少 ≥60%。
7. **记忆召回**：跨 session retain → recall 命中率 ≥90%。
8. **PRD 自动拆**：2KB PRD 自动拆与人工 ≥80% 一致。
9. **并行工厂**：10 task PRD 自动完成率 ≥80%。
10. **隐私**：三渠道 tarball / bottle / wheel 无私人数据。

---

## 13. v0.2+ 范围外

| 条目 | 工时 | 延后理由 |
|------|------|----------|
| Copilot / Cursor / Windsurf / Augment / Trae / Qwen / CodeBuddy / Cline / Antigravity / Kilo 10 个 runtime | 各 2-3 天 | 长尾；v1.0 后按用户需求加 |
| Web 仪表盘 / TUI | 2+ 周 | CLI 是分发工具不是宿主 |
| LLM provider 抽象层 | 1 周 | runtime 自己管；我们不重造 |
| 团队协作服务端（共享 memory/graph） | 3-4 周 | 单机 pgvector 够用；服务端是 enterprise SKU |
| Plugin 市场 / marketplace 集成 | 1 周 | Claude 特色；等其它 runtime 做了再跟 |

---

## 14. 决策日志

| # | 日期 | 决策 | 证据 |
|---|------|------|------|
| D1 | 2026-04-17 | 分发-adapter 路线（不自建 agent） | 用户选；get-shit-done 14 runtime 验证 |
| D2 | 2026-04-17 | 首发 runtime：Claude + OpenCode + Codex + Gemini | 用户选 |
| D3 | 2026-04-17 | 包名 `ultra-builder-pro-cli`，短名 `ubp` | 用户选 |
| D4 | 2026-04-17 | 发布渠道：npm + Homebrew + pip | 用户选 |
| D5 | 2026-04-17 | 销毁旧 git，main 重建 | 用户选；历史存 bundle |
| D6 | 2026-04-17 | hook 沿用 Python，Node shell out | 重写 Node 无价值 |
| D7 | 2026-04-17 | 配置合并用哨兵块 + manifest | 比文本重写安全 |
| D8 | 2026-04-17 | settings.json 精简为最小合并模板 | 隐私安全 |
| D9 | 2026-04-17 | README 改写延 Phase 9 | 不阻塞开发 |
| D10 | 2026-04-17 | `hooks/tests/` 不入 npm tarball | 包体精简 |
| D11 | 2026-04-17 | 基于官方文档重做 §5 + Phase 2/3 + §9 + §10 | [OpenCode Commands](https://opencode.ai/docs/commands/) · [OpenCode Agents](https://opencode.ai/docs/agents/) · [OpenCode Config](https://opencode.ai/docs/config/) · [Codex Config Reference](https://developers.openai.com/codex/config-reference) · [Codex Agent Skills](https://developers.openai.com/codex/skills) · [Gemini Custom Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md) · [Gemini Extensions](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md) · [Claude Code Hooks](https://code.claude.com/docs/en/hooks) · [Claude Code Sub-agents](https://code.claude.com/docs/en/sub-agents) |
| **D12** | **2026-04-17** | **采用 skill + MCP + CLI 三层架构**，skill=说明书、MCP=状态操作主路径、CLI=Bash 兜底 | 参考 CTM（MCP 模式）+ OMC/OMX（skill 模式）+ get-shit-done（CLI 模式）；三层分工覆盖 "knowledge / state / hook" 三类需求 |
| **D13** | **2026-04-17** | **规则层 / 执行层双时间线交付**（Phase 1-4 规则层 → v0.1；Phase 5-8 执行层 → v0.2-v0.3） | 用户明确"规则 vs 自动化执行"的维度；降低单次发布复杂度；早让用户拿到可用价值 |
| **D14** | **2026-04-17** | **范围从"分发器"扩展到"自动化 coding 工厂"**，总工时从 4-5 周扩到 11-13 周 | 用户诉求：跨 agent 上下文共享 + 独立对话避污染 + 监控 + 实时代码图 + 记忆系统；不只是 distribution tool |
| **D15** | **2026-04-17** | 集成 RTK / code-review-graph / hindsight 作为 **MCP tool 包装**（不自建等价） | 三者都 MIT + MCP 友好；自建等价 = 4-8 周纯折腾无价值 |
| **D16** | **2026-04-17** | GSD / GSD-2 的 **atomic-write / state-machine / ctx.newSession / DISPATCH_RULES** 直接移植（不自建） | 已在 14 runtime 实战；用户确认"可以先集成，混合" |
| **D17** | **2026-04-17** | Phase 3 消除 **tasks.json 与 context 的 status 双写**（原 v4.4 → v5.0，**后被 D21 覆盖为 v4.5 过渡**） | 用户指痛点"异步效果不好"根因之一 |
| **D18** | **2026-04-17** | **权威状态层 = `.ultra/state.db` SQLite + WAL**，md/json 降级为投影/导出视图 | Codex Q1：多主写入是最大架构风险；SQLite 提供事务 + 并发读；tasks.json/activity-log/sessions/workflow-state 多文件各管一摊易炸 |
| **D19** | **2026-04-17** | **v0.1 带 execution-lite**（session + event subscribe + 活跃会话可见），不裸发规则层 | Codex Q3：用户核心诉求是"独立会话不污染"，规则层没 session 不算解决问题；新增 Phase 4.5 |
| **D20** | **2026-04-17** | **Session 标准单元 = 新进程 + 独立 worktree + lease/heartbeat + artifact dir**；`ctx.newSession()` 仅作 Claude/GSD-2 适配优化 | Codex Q7：跨 4 runtime 通用定义；systemd/launchd 过重；单纯复用 Claude 会话切换不够 |
| **D21** | **2026-04-17** | **Schema v4.4 → v4.5 过渡**（tasks.json 成 authoritative view + context status 降级派生 + 停止手写保留读兼容），不直接 v5 breaking（覆盖 D17） | Codex Q5：直接 breaking 迁移风险大；过渡期让老代码还能读；等命令全迁完再物理删除字段 |
| **D22** | **2026-04-17** | **Phase 8 拆 8A（计划自动化）+ 8B（执行自动化）** | Codex Q4：现在绑太死；分开后 8A 可先交付 v0.3 早期内测，8B 晚些跟上 |
| **D23** | **2026-04-17** | **Phase 4 新增 4.6 Runtime capability matrix + conformance tests** | Codex Q8：同一 skill 文本 + 同名 MCP tool ≠ 一致行为；4 runtime 在权限 / hook / subagent / usage 不等价 |
| **D24** | **2026-04-17** | **code-review-graph 实时增量 watcher**（fs-watch + tree-sitter），不是启动时 build；移到 Phase 6.4 | Codex Q6：实时反馈给 agent 才有价值；用户原话"需要做到实时的变更，能够及时的反馈给到 agent，而不是改完填坑" |
| **D25** | **2026-04-17** | **hindsight 用法升级为 wrapper 式自动记忆**（session 结束自动 retain + session 启动自动 prefetch），不仅是显式 MCP retain/recall | Codex Q6：hindsight 强项是 wrapper，agent 不需要手工调 |
| **D26** | **2026-04-17** | **Phase 7 新增 Task Master tagged task lists**（per git branch 上下文分区） | Codex Q6：分支并发场景没有 tagged 会 context 混乱 |
| **D27** | **2026-04-17** | **模型自适应路由（原 Phase 7.4）后移到 v0.2+** | Codex Q10：v0.3 前不紧；Phase 7 已经重 |
| **D28** | **2026-04-17** | **总工期 11-13 周 → 14-18 周** | Codex Q9：4 runtime 兼容 + session/recovery + 并发 worktree + 外部工具整合会吞大量集成调试时间 |
| **D29** | **2026-04-17** | **`skill.*` 收缩为只读 `skill.resolve` / `skill.manifest`**，删除 `skill.invoke / list` | Codex 第二轮 R2：skill 是知识载体不做业务 RPC；保留三层但砍凑层接口；用户批准 |
| **D30** | **2026-04-17** | **state.db 新增 `schema_version` + `migration_history` 表** | Codex 第二轮 R4：跨版本误读防护 + migration 审计；R27 |
| **D31** | **2026-04-17** | **events 订阅用 `events.id` AUTOINCREMENT 单调游标**，不用 `max(ts)` | Codex 第二轮 R4：同 ms 多事件会漏事件；R26 |
| **D32** | **2026-04-17** | **lease / heartbeat 只在 `sessions` 表**（不再有 lease.json 文件）；`.ultra/sessions/<sid>/` 只存 artifact | Codex 第二轮 R1 + R4：file + db 双源是新风险；R29 |
| **D33** | **2026-04-17** | **Phase 4.5 新增 single-active-lease admission control**（takeover/resume/abandon 三策略） | Codex 第二轮 R3：spawn 时未检查 active lease → 同 task 双开；admission 不该延到 Phase 5；R30 |
| **D34** | **2026-04-17** | **Phase 8A 新增 `.ultra/execution-plan.json` artifact**（waves + ownership 预测 + conflict 面） | Codex 第二轮 R5：8B 不应运行时才判并发；artifact 可审计；用户批准；R31 |
| **D35** | **2026-04-17** | **Phase 4.6 拆 4.6a（v0.1 smoke flow）+ 4.6b（v0.2 full conformance）** | Codex 第二轮 R6：v0.1 先交付核心价值，full conformance 推迟到 v0.2；R32 |
| **D36** | **2026-04-17** | **Phase 8A 对 Phase 7 的依赖从"强前置"软化为"加分项"** | Codex 第二轮 R5：memory/complexity 是 enhancement，不是正确性前置；8A 可单独跑 |
| **D37** | **2026-04-17** | **新增多进程访问策略文档 `docs/STATE-DB-ACCESS-POLICY.md`** | Codex 第二轮 R4：MCP / CLI / orchestrator 同时写谁写哪；R25 |
| **D38** | **2026-04-17** | **Phase 1 完成** — `spec/` 锁死三层契约：30 个 MCP tool / 7 表 SQLite schema / tasks 与 context 投影 schema / skill manifest / CLI 协议 + 映射表；`npm run test:spec` 5 validator 全绿；新增 `docs/ARCHITECTURE.md` | Phase 1 gate 全过；后续 Phase 只引用 spec/，不再发明 schema |
| **D39** | **2026-04-17** | **Phase 2 完成** — 权威状态层落地：`.ultra/state.db` (7 表 WAL+busy_timeout)、`mcp-server/lib/{state-db,state-ops,projector}.cjs`、`mcp-server/server.cjs`（@modelcontextprotocol/sdk stdio + 7 task.*）、`ultra-tools {db,migrate}` 子命令、`STATE-DB-ACCESS-POLICY.md` + `COMMIT-HASH-BACKFILL.md`；6 gate 全过（20 worker / 3 进程并发 / migration 可逆 / DB 运维 4 子命令 / 投影 ≤1s / task.* MCP 契约 + events.id 无漏）；`npm run test:state` 44/44 + `npm run test:spec` 5/5 | Phase 2 gate 全过；spec → state-ops → MCP 写路径成形，Phase 3 命令薄壳化可以基于 task.* MCP tool 重写 |
| **D40** | **2026-04-17** | **Phase 3 完成** — 命令规则化三层迁移：9/9 命令薄壳化（36-54 行，平均 41 行）+ 7 个新 skill (`skills/ultra-{init,plan,dev,test,deliver,status,think,learn}/SKILL.md` 148-340 行) + `skills/ultra-research/SKILL.md` frontmatter 升级；新 MCP tool `task.init_project` + 内置 `templates/.ultra/` 骨架 + `ultra-tools task init-project` CLI；`spec/command-template.md` + `command-manifest.schema.json` + `validate-commands.cjs`（UBP_COMMAND_STRICT=1 9/9 通过）；`docs/AGENT-CONTEXT.md` canonical runtime 规则源；`hooks/{adapters,core}/` 骨架 + 4 个 runtime adapter stub；`test:state` 54/54 (+10) + `test:spec` 6/6 (+1) + strict-mode command gate 9/9 migrated 0 failed | Phase 3 gate 全过；skill+MCP+CLI 三层模式在 9 命令全部闭环；Phase 4 adapter 阶段可以直接基于 `docs/AGENT-CONTEXT.md` canonical + hooks/adapters/ stub 展开 |

---

## 15. 术语表

- **Adapter**：`adapters/` 下按 runtime 实装的模块，Phase 4 的主产物。
- **Admission Control**：spawn 新 session 前的前置检查，保证同 task 只有
  一个 active lease；三策略 takeover/resume/abandon；Phase 4.5.2 / D33。
- **activity-log**：**state.db `events` 表**（v0.3 起不再是文件）；append-
  only 事件流；Phase 2 建立，全程消费；`.ultra/activity-log.json` 是可选
  只读导出。
- **AGENTS.md**：各 runtime 原生的项目上下文文件（Claude 叫 CLAUDE.md，
  Gemini 叫 GEMINI.md）；Phase 3.7 统一注入。
- **DISPATCH_RULES**：GSD-2 的声明式分派规则表，Phase 8B 移植。
- **Execution-lite**：v0.1 发布的最小执行层 = session 标准单元 + admission
  + event subscribe + 活跃会话可见；Phase 4.5 / D19。
- **execution-plan.json**：8A 产出的可审计规划 artifact（waves + ownership
  + conflict），驱动 8B 分派；D34。
- **Orchestrator**：Phase 5+ 引入的 Node daemon，负责 session 生命周期 +
  事件循环 + 分派。
- **规则层 / 执行层**：§4.2；Phase 1-4 / Phase 4.5-8。
- **Session**：GSD-2 模式升级版（D20）：新进程 + 独立 worktree + lease/
  heartbeat（存 sessions 表） + artifact dir；Phase 4.5 实装。
- **state.db**：`.ultra/state.db` SQLite + WAL 数据库，所有状态的权威源；
  七表（tasks/events/sessions/telemetry/specs_refs/schema_version/
  migration_history）；Phase 2 建立。
- **三层架构**：§4.1；skill（知识，只读发现）+ MCP（状态操作主路径）+
  CLI（兜底）。
- **staleness**：task 的 spec 被改后，未开工的 pending task 自动标记
  "需要重读 spec"；Phase 5.3。
- **投影（projection）**：tasks.json / context md 的 status header 从 state.db
  派生的只读视图；手改不生效；Phase 2.6。
- **Walking Skeleton**：Hermes 概念，总是 Task #1 的 E2E 最小路径，贯穿所有
  架构层。
- **${UBP_CONFIG_DIR}**：skill / 命令 md 内的路径占位符，adapter 在 install
  时按 runtime 展开。

---

*计划结束。范围 / 置信度 / 时间线 / 架构的任何改动必须先在 §14 打日期写明、
再落代码。*
