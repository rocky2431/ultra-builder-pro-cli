# ultra-builder-pro-cli — 执行计划 v0.2

**状态**：Phase 0 完成 · Phase 1 待启动
**版本**：0.2.0-plan · 2026-04-17 基于三层架构 + 双时间线重写（v0.1.0-plan 的继任版）
**范围**：最终目标 = 可落地的"跨 runtime coding 自动化工厂"。按 9 个 Phase 渐进交付。
**整体置信度**：**88%**（下调自 v0.1 的 92% — 范围扩大了，9 Phase 含执行层与智能层）
**关键变更**：从"分发器"升级为"skill + MCP + CLI 三层框架 + 规则/执行双时间线"

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
- **v0.1** = Phase 0-4（规则层可用） → 4-5 周
- **v0.2** = Phase 5-6（执行层 MVP + 监控） → +3 周
- **v0.3** = Phase 7-8（智能层 + 自动化工厂） → +4 周
- **v1.0** = Phase 9（三渠道发布） → +0.5 周

**总工期**：11-13 周 AI 协助，~250-350 工时。

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
| G2 | 状态读-改-写原子且可并发 | 两个 subprocess 同时改 tasks.json 不丢更新（压力测试） | 2 |
| G3 | `tasks.json` 与 context 文件无双写 | status 字段单源（只在 tasks.json），context 只载不变字段 | 2 |
| G4 | 每 task 独立 session，对话不污染 | executor spawn fresh session；session 结束自动 closeout | 5 |
| G5 | 跨 session 事件可订阅 | agent A commit 后 agent B 秒级可通过 MCP 读到 | 5 |
| G6 | 崩溃自动恢复，失败有熔断 | kill -9 agent 后重启能续；同一 task 重试 ≥3 次自动停 | 5 |
| G7 | RTK / code-review-graph / hindsight 作为 MCP tool 跨 runtime 共享 | 4 runtime 下都能调 `impact.*` / `memory.*` | 6, 7 |
| G8 | PRD 自动拆 task + 并行分派 | 10 task 的 PRD 一键触发，≤3 失败项，其余自动完成并合入 | 8 |
| G9 | 三渠道可装（npm / Homebrew / pip） | 干净 macOS / Ubuntu 60 秒装好 | 9 |
| G10 | 0 私人数据泄漏 | npm tarball / brew bottle / pip wheel 审计干净 | 9 |

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
| 本 PLAN | Phase 1-4 | Phase 5-8 |
| 能否脱离对方跑 | ✅ 可以（手工执行） | ❌ 不能（需要规则层做输入） |

**关键原则**：**规则层完整后，执行层才能上**。执行层是"把规则层跑起来"，
不是"重新发明规则"。跑路线：v0.1 交付纯规则层 → 用户手动跑命令 → v0.2
加执行层 → 半自动 → v0.3 加智能层 → 全自动。

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
    │                   ▼ 写 .ultra/activity-log.json (事件: project_init)
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
│   │   ├── tasks.v5.schema.json
│   │   ├── activity-log.schema.json
│   │   ├── workflow-state.v2.schema.json
│   │   └── context-file.v2.schema.json
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
| A4 | 状态机沿用 GSD 的 `readModifyWriteStateMd` 模式 | 已在 14 runtime 实战；改名 `state-machine.ts` 落 TypeScript |
| A5 | session 隔离沿用 GSD-2 的 `ctx.newSession()` 模式 | 已实战；用户明确"独立对话避污染"目标 |
| A6 | 事件流 = append-only `activity-log.json`（fs-watch） | 不要消息队列（过重）；文件就是协议，任何 runtime 能读 |
| A7 | Python hooks 沿用，Node shell out | 15 hook 重写 Node 要 2-3 周纯折腾；零价值 |
| A8 | orchestrator 是可选的常驻 Node daemon | 规则层可不依赖执行层独立跑；半自动 → 全自动平滑升级 |
| A9 | RTK / code-review-graph / hindsight 全部作为 **MCP tool** 暴露 | 不自建等价功能；它们都是 MIT + MCP 友好 |
| A10 | 规则层 v0.1 先发布；执行层 v0.2 再迭代 | 降低 v0.1 复杂度；用户早拿到价值 |

---

## 5. 痛点 × 能力 × Phase 矩阵

### 5.1 12 个痛点 → 解决 Phase

| # | 痛点 | 来源证据 | 解决方案 | Phase |
|---|------|----------|---------|-------|
| P1 | tasks.json 读-改-写无原子 | ultra-dev.md Step 1.5 / Step 5 | GSD `readModifyWriteStateMd` + flock | 2 |
| P2 | workflow-state.json 单会话 | ultra-dev.md Step 0/3.3/4.5/6 | 按 session_id 分文件；orchestrator 管多 session | 5 |
| P3 | tasks.json 与 context 双写 | ultra-dev.md Step 1.5 + 5 明写 BOTH | Schema 重构：status 单源（tasks.json），context 只载不变字段 | 2 |
| P4 | Git 分支硬绑 task_id → 并发冲突 | ultra-dev.md Step 2 | worktree 隔离 + files_modified 重叠检测（GSD） | 8 |
| P5 | /compact + compact-snapshot.md Claude 专属 | ultra-dev.md Step 4.4 | 不依赖 /compact；用 ctx.newSession() 代替 | 5 |
| P6 | /ultra-review 5 subagent Claude 独占 | ultra-dev.md Step 4.5 | MCP `review.run`；跨 runtime 并行（CTM 模式） | 3 |
| P7 | Dual-Write Mode spec 改后不 invalidate | ultra-dev.md Dual-Write | activity-log 事件 + task staleness 字段 | 5 |
| P8 | 无 task 间事件通知 | 整个体系 | activity-log.json append-only（GSD-2） | 5 |
| P9 | status 字段 tasks.json 与 context 重复 | plan + dev 都要求同步 | 同 P3 Schema 重构 | 2 |
| P10 | 无项目级事件流 | 仅 workflow-state.json 单点 | 同 P8 | 5 |
| P11 | commit hash 回填 amend 链非原子 | ultra-dev.md Step 6.3 | 先 commit → 读 hash → 写 context → 第二次 commit（不 amend） | 3 |
| P12 | ultra-test/deliver 顺序假设 | 命令本身结构 | DISPATCH_RULES + slice-parallel-orch（GSD-2） | 8 |

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

### Phase 1 — 三层接口定义（规则层基础）

**目标**：把 skill / MCP tool / CLI 三层的**schema 锁死**。后续所有 Phase 只
引用 spec/，不再定义新 schema。接口先行是避免"写到一半发现 schema 不兼容"
最大的保险。

**前置**：Phase 0

**置信度**：95%（纯设计工作，风险低）

**工时**：3-4 天

#### 任务清单

**1.1 MCP tool schema**（1 天）
- 新建 `spec/mcp-tools.yaml`（openapi 3 风格）。
- 定义 7 族 tool 的 input/output schema：`task.*` / `memory.*` / `review.*`
  / `impact.*` / `skill.*` / `session.*` / `ask.*`
- 每个 tool 含：name, description, input JSON Schema, output JSON Schema,
  errors, 对应的 CLI subcommand 名。
- **AC**：pnpm `ajv validate` 所有 sample input/output 通过。

**1.2 数据 schema**（1 天）
- `spec/schemas/tasks.v5.schema.json` — 从 v4.4 升级：
  - 移除 "状态双写" 歧义；status 唯一在 tasks.json；context 文件不再有
    status header。
  - 新增 `dependencies: [taskId]` 显式依赖声明（CTM 模式）。
  - 新增 `files_modified: [path]` 并发重叠检测用（GSD 模式）。
  - 新增 `session_id` 记录最后一次 executor（Phase 5 用）。
- `spec/schemas/activity-log.schema.json` — 事件日志：
  - append-only；每行一个 JSON 事件；事件类型穷举：
    `project_init`, `research_step_complete`, `plan_approved`,
    `task_started`, `task_completed`, `task_failed`, `spec_changed`,
    `commit_pushed`, `review_verdict`, ...
- `spec/schemas/workflow-state.v2.schema.json` — 按 session_id 分片，不再
  单文件单会话。
- `spec/schemas/context-file.v2.schema.json` — 不再嵌 status 字段。
- **AC**：每个 schema 配一份合法 + 一份非法的 fixture，`ajv` 分别返回 pass / fail。

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

### Phase 2 — 原子状态机重构

**目标**：修掉 P1/P3/P9/P11 四个架构级痛点。`tasks.json` 读写带锁原子化；
状态字段单源；事件日志 append-only。

**前置**：Phase 1（schema 已定）

**置信度**：95%（GSD 代码直接参考，模式已验证）

**工时**：4-5 天

#### 任务清单

**2.1 atomic-write 库**（0.5 天）
- 移植 `get-shit-done/get-shit-done/bin/lib/core.cjs` 的 `atomicWriteFileSync`
  到 `mcp-server/lib/atomic-write.ts`（TypeScript）。
- 机制：临时文件 + `fs.rename`；跨平台保证 POSIX 原子 rename。
- **AC**：单元测试：写入过程 SIGKILL，原文件完整，临时文件可留给清理。

**2.2 state-machine（lockable RMW）**（1.5 天）
- 移植 `state.cjs::readModifyWriteStateMd(path, transformFn)` → TS，用
  `proper-lockfile` 替代 fs 自锁实现。
- 暴露 `readModifyWrite(path, transform)` 函数：拿 flock → 读 → transform →
  原子写 → 释放。
- retry：10 次 × 200ms backoff，超时报错。
- **AC**：压力测试：20 个并发 Node worker 对同一 tasks.json 做
  `status pending→in_progress`，最终必须有且只有 1 个 in_progress，其余
  19 个看到锁 busy 后成功重试。

**2.3 event-log 库**（0.5 天）
- `mcp-server/lib/event-log.ts`：append 一行 JSON 到
  `.ultra/activity-log.json`（JSONL），fs.open `a` 模式 + fcntl lock。
- 支持 tail：`watch(callback)` 用 `fs.watch` 监听新增行。
- 按 §5.1 P8 定义的事件类型枚举。
- **AC**：append 1000 条并发事件无行损坏；watch 回调按顺序收到全部 1000 条。

**2.4 MCP `task.*` 工具实装**（1.5 天）
- 用 2.1+2.2+2.3 实现：
  - `task.create` / `task.update` / `task.list` / `task.get` / `task.delete`
  - 每次改动 tasks.json 的同时 append 一个事件到 activity-log
- status 字段规范化：只在 tasks.json，不再在 context 文件 header。
- 读 context 文件时：从 tasks.json 取 status；context 只提供不变字段。
- **AC**：(a) 所有 task.* tool 通过契约测试（fixture input → 期望 output）；
  (b) 双写场景替换：Phase 3 迁移 ultra-dev 后，Step 1.5/5 只写一次 tasks.json。

**2.5 Commit hash 回填重构**（0.5 天）
- 旧流程：commit → read hash → edit context → `git commit --amend`（非原子）
- 新流程：commit (空 context) → read hash → edit context → **第二次 commit**
  "chore: record task-N completion hash"
- 修改 `skills/ultra-dev/SKILL.md` 的 Step 6 描述；Phase 3 落地。
- **AC**：`git log --oneline` 里能看到 "feat: …" 和 "chore: record hash" 两
  个 commit 并列。

#### Phase 2 gate

- 压力测试通过（见 2.2 AC）
- activity-log 并发 append 无损坏
- 所有 `task.*` MCP tool 有契约测试且全绿

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

**4.6 install.js 真实装配**（0.5 天）
- 从 v0.1 PLAN 的 stub 升级为真调用 adapter。
- `--claude/--opencode/--codex/--gemini/--all` + `--local/--global` + `--uninstall`。
- 幂等：跑两次 install diff = 空。
- **AC**：4 runtime × 2 scope = 8 条安装路径全绿；uninstall 后目录干净。

#### Phase 4 gate

- 4 runtime 下 `/ultra-init` 都能跑通
- Claude diff-equal 基线通过
- 运行时兼容矩阵产出 `docs/RUNTIME-COMPAT-MATRIX.md`（哪些 skill/tool
  每 runtime 是全支持 / 降级 / 不支持）

**▶ v0.1 发布就绪点**：Phase 0-4 完工 → 用户可以 `npx ultra-builder-pro-cli
--claude --global` 装上，手动跑完整工作流。执行层（Phase 5+）是后续增值。

---

### Phase 5 — Session 隔离 + 事件循环（执行层基础）

**目标**：解决 P2/P5/P7/P8/P10 —— 多 agent 并发、对话污染、spec 变更传播、
崩溃恢复。用户明确诉求"独立 agent 独立对话不受污染"首次落地。

**前置**：Phase 4（规则层可跑）

**置信度**：85%（session 管理是新能力，需 1-2 天 spike）

**工时**：5-7 天

#### 任务清单

**5.1 Session manager**（1.5 天）
- `orchestrator/session-manager.ts`：每 task 分配唯一 `session_id`；session
  有独立的 `.ultra/sessions/<sid>/` 目录，存 workflow-state、checkpoint、
  transient context。
- 从 GSD-2 `src/resources/extensions/gsd/auto/session.ts` 移植设计。
- 对外接口：`newSession({task_id, runtime})` → sid；`closeSession(sid)` →
  合并 artifact；`getSession(sid)` → status。
- **AC**：并发起 5 个 session，状态互不干扰；closeSession 后 workflow-state
  归档。

**5.2 Event watcher**（1 天）
- `orchestrator/event-watcher.ts`：fs.watch `activity-log.json`，新事件推送
  给订阅方（Node EventEmitter 模式）。
- MCP tool `session.subscribe_events(filter)` → 阻塞返回事件流。
- **AC**：agent A 调 `task.update_status completed`，agent B 的订阅回调 < 1s
  收到。

**5.3 Recovery + circuit breaker**（1.5 天）
- `orchestrator/recovery.ts`：
  - 启动时扫 `.ultra/sessions/*/`，发现 status=running 超过心跳阈值 → 标记
    crashed → 决策重试 / 熔断。
  - `circuit-breaker.json` per task：连续失败 ≥3 次 → 熔断 → 警告给人。
- 从 GSD-2 `recovery.ts` + `circuit-breaker` 移植。
- **AC**：`kill -9` 跑 dev 的 session，orchestrator 重启后能续（或熔断）。

**5.4 Task staleness**（0.5 天）
- 当 `activity-log` 收到 `spec_changed(sections: [X])` 事件：
  - 扫 tasks.json，`trace_to` 命中 section X 的所有 pending task 标记
    `stale: true`。
  - 这些 task 的 context 文件 header 显示 "⚠️ stale: spec 已变更于 <time>"。
- **AC**：手动改 specs/product.md 后，pending task 被正确标 stale。

**5.5 ultra-dev session 化**（1 天）
- 改 `skills/ultra-dev/SKILL.md`：开始时调 `session.new`，结束时
  `session.close`。
- 移除对 `/compact` 的依赖（用 session checkpoint 代替）。
- **AC**：两个 user 同时跑 `/ultra-dev 1` 和 `/ultra-dev 2` 各自在独立 session
  下完成，互不干扰。

**5.6 /ultra-status 升级**（0.5 天）
- 读 sessions/ + activity-log.json → 显示所有活跃 session + 最近事件。
- **AC**：status 输出含"5 min 前 task 3 completed by session sid-abc"等行。

#### Phase 5 gate

- 并发 5 session 压力测试通过
- kill -9 → 重启恢复测试通过
- spec 改动触发 staleness 标记

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

**6.4 Runtime stdout 拦截（可选）**（1 天）
- orchestrator spawn agent 时拦截 stdout，解析 Anthropic/OpenAI/Gemini
  SDK 的 usage 字段（若可达）。
- 更精准的 token 统计（不依赖 rtk 推测）。
- **AC**：对一个已知 token 数的 task 做 E2E，telemetry 与官方 usage 误差 <5%。

#### Phase 6 gate

- telemetry 覆盖率：每 MCP tool 调用 100% 有埋点
- `/ultra-status` cost panel 数字可信（与 SDK usage 对账 <5% 误差）

---

### Phase 7 — 智能层

**目标**：引入**记忆 / 代码图 / skill 学习**，让每 task 起步即有上下文。

**前置**：Phase 6（监控支持智能层的触发器与成本验证）

**置信度**：82%（hindsight 运维复杂；pgvector 是新依赖）

**工时**：8-10 天

#### 任务清单

**7.1 code-review-graph MCP 集成**（2 天）
- 装 `code-review-graph` 作为可选 MCP server（独立二进制）。
- 包装 MCP tool `impact.*`：`impact.radius(files)`、`impact.changes(range)`、
  `impact.dependents(symbol)`。
- `skills/ultra-dev/SKILL.md` 起步阶段调 `impact.radius` 决定要读哪些文件。
- `skills/ultra-review/SKILL.md` 用 `impact.*` 决定要审哪些文件。
- **AC**：`/ultra-dev 5` 启动时自动从 impact.radius 拿到"task 5 改动影响
  面"，而非读整个 repo。

**7.2 hindsight MCP 集成**（5 天）
- 内嵌 hindsight-server 启动（`HindsightServer` context manager），避免用户
  跑 Docker。
- 包装 MCP tool `memory.*`：`memory.retain(bank, content, meta)`、
  `memory.recall(bank, query, limit)`、`memory.reflect(bank, query)`。
- `skills/ultra-research/SKILL.md` 每步产出 → `memory.retain`。
- `skills/ultra-plan/SKILL.md` 起步前 → `memory.recall(bank=project)` 拿
  历史决策。
- `/learn` → `memory.retain` 同时写 skills/learned/。
- **AC**：做完 research → plan → dev 全流程后，下一个相似项目的 research
  起步能从 memory.recall 拿到 ≥3 条相关历史洞察。

**7.3 Skill 自动萃取（OMC 模式）**（2 天）
- session 结束 hook：分析 transcript → 提取"解决了什么非平凡问题" →
  草稿为 `skills/learned/<id>_unverified.md`。
- 人审通过后去掉 `_unverified` 后缀。
- **AC**：跑 5 个包含 debugging 的 task 后，skills/learned/ 下生成 ≥3 个
  unverified skill。

**7.4 Model 自适应路由（OMC 模式）**（1 天）
- skill frontmatter 新增 `complexity_hint: low|medium|high`。
- orchestrator spawn 时按 hint 选 model：low → Haiku，medium → Sonnet，
  high → Opus。
- skill 可在运行时自己升级 hint（"遇到嵌套泛型"）。
- **AC**：跑完一个典型 mixed project，Haiku:Sonnet:Opus 调用比 ≥ 60:30:10。

#### Phase 7 gate

- code-review-graph + hindsight MCP tool 契约测试全绿
- 跨 session 记忆召回 smoke test 通过（先 retain A，关会话，新会话 recall 能
  查到 A）

---

### Phase 8 — 自动化工厂

**目标**：**"PRD 一键拆任务 → 并行分派 → 自动完成 / 合并 / 审查"**。这是
用户"coding 工厂"愿景的终点。

**前置**：Phase 7（智能层提供 dispatch 输入）

**置信度**：80%（GSD-2 模式已验证，但移植到 UBP 任务重）

**工时**：8-10 天

#### 任务清单

**8.1 PRD 自动拆 task（CTM 模式）**（2 天）
- 新 MCP tool `task.parse_prd(prd_text)` → 返回 task[]（ID、title、deps、
  complexity 预估）。
- 后端：调 Anthropic/OpenAI LLM（model 可配）。
- skill `ultra-plan` 新分支："从 PRD 自动拆"。
- **AC**：给一份 2 KB PRD，产出的 tasks.json ≥ 80% 与人工拆分语义等价。

**8.2 DISPATCH_RULES 声明表（GSD-2 模式）**（2 天）
- `orchestrator/dispatch-rules.ts`：数组化规则：
  ```ts
  {
    when: (ctx) => ctx.task.status === 'pending' && deps_ready(ctx),
    action: 'spawn_agent',
    agent_kind: 'executor',
    runtime: select_runtime(ctx.complexity),
  }
  ```
- 从 `gsd-2/src/resources/extensions/gsd/auto-dispatch.ts` 移植。
- **AC**：orchestrator 在 pending task 出现时 1s 内分派对应 agent。

**8.3 Parallel orchestrator（GSD-2 模式）**（2 天）
- `orchestrator/parallel-orchestrator.ts`：多 session 并行，slice 级并发。
- 每 slice 检测 `files_modified` 重叠 → 重叠则串行（GSD 算法）。
- **AC**：10 个独立文件的 task 全部并行跑；2 个改同一文件的 task 自动串
  行化。

**8.4 Worktree 隔离（GSD 模式）**（1 天）
- `orchestrator/worktree-manager.ts`：每并发 slice 创建独立 git worktree；
  避免 .git/config.lock 竞争。
- session 结束后清理 worktree。
- **AC**：3 个并发 slice 在独立 worktree 跑，`git branch` 互不干扰。

**8.5 Human gate in /ultra-plan（OMX 模式）**（0.5 天）
- 生成 tasks.json 后调 `ask.question` 展示 plan 摘要 + estimated cost，
  等 approve 才写入最终版。
- **AC**：plan 产出一个 `ask` 对话；用户 reject 时不写 tasks.json。

**8.6 Task dependency graph + auto-expand**（1.5 天）
- `task.dependency_topo` MCP tool：返回拓扑排序 + 并行波次。
- `task.expand(task_id)` MCP tool：用 LLM 把复杂度 ≥7 的 task 自动拆
  subtasks。
- **AC**：一个 complexity=9 的 task 自动拆成 3-4 个 subtask；tasks.json
  的拓扑排序与手工一致。

#### Phase 8 gate

- 跑一个 10-task PRD → orchestrator 全自动完成率 ≥80%（少数失败人工干预）
- 并发 worktree 压力测试：5 slice 同时跑无 git 锁冲突
- Human gate 开启后，plan 不能自动进 dev（必须有用户 approve 事件）

**▶ v0.3 完工 = 自动化 coding 工厂可用**。

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

### 7.1 `tasks.v5.schema.json`（简版示例）

```jsonc
{
  "version": "5.0",
  "tasks": [
    {
      "id": "1",
      "title": "Walking skeleton: auth E2E",
      "type": "architecture",
      "priority": "P0",
      "complexity": 4,
      "status": "pending",           // 单源
      "dependencies": [],             // Phase 2
      "files_modified": [],           // Phase 8 并发检测用
      "estimated_days": 2,
      "context_file": "contexts/task-1.md",
      "trace_to": ".ultra/specs/product.md#auth",
      "session_id": null,             // Phase 5 填
      "stale": false,                 // Phase 5 填
      "complexity_hint": "medium"     // Phase 7 填
    }
  ],
  "metadata": { "totalTasks": 1 }
}
```

**注意**：没有 `context file 里再存 status` — P3/P9 修复。

### 7.2 `activity-log` 事件类型（Phase 2 枚举）

```jsonc
{ "ts": "2026-04-17T...", "type": "task_started", "task_id": "1", "session_id": "sid-abc", "runtime": "claude" }
{ "ts": "...", "type": "task_completed", "task_id": "1", "commit": "abc123" }
{ "ts": "...", "type": "task_failed", "task_id": "1", "error": "..." }
{ "ts": "...", "type": "spec_changed", "sections": ["product.md#auth"] }
{ "ts": "...", "type": "review_verdict", "task_id": "1", "verdict": "APPROVE" }
```

### 7.3 MCP tool 命名约定（Phase 1 `spec/mcp-tools.yaml`）

`{family}.{verb}`：
- `task.create / update / list / get / delete / expand / parse_prd / dependency_topo`
- `memory.retain / recall / reflect`
- `review.run / verdict`
- `impact.radius / changes / dependents`
- `skill.invoke / list`
- `session.new / close / get / subscribe_events`
- `ask.question / menu`

### 7.4 Phase 依赖显式图

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 ───▶ v0.1 RELEASE
                                                  │
                                                  ▼
                                Phase 5 → Phase 6 ───▶ v0.2 RELEASE
                                              │
                                              ▼
                                    Phase 7 → Phase 8 ───▶ v0.3 RELEASE
                                                      │
                                                      ▼
                                                  Phase 9 ───▶ v1.0
```

**没有横向依赖**（同 Phase 内任务可并行，跨 Phase 严格串行）。

---

## 8. 测试策略

| 层 | 框架 | 覆盖目标 | Phase |
|---|---|---|---|
| spec schema fixtures | `ajv` | 合法 + 非法 fixture 各 ≥1 | 1 |
| atomic-write / state-machine | node:test + 20-worker 压力脚本 | ≥90% 行覆盖 + 并发无损 | 2 |
| MCP tool 契约 | fixture → tool → 期望 output | 100% tool 有契约测试 | 3 |
| adapter install / uninstall | shell E2E with tmp dir | 每 runtime diff-equal | 4 |
| session isolation | kill -9 重启测试 + 并发 5 session | 无数据腐败 | 5 |
| telemetry 准确性 | 对照官方 SDK usage | 误差 <5% | 6 |
| hindsight 召回 | retain → 关 session → recall | 命中率 ≥90% | 7 |
| PRD 拆 task | 人工 vs 自动语义对比 | ≥80% 一致 | 8 |
| 发布矩阵 | GHA 8-job 矩阵 | 全绿 | 9 |

---

## 9. 风险与对策

继承 v0.1 PLAN 的 R1-R14，新增 R15-R20：

| ID | 风险 | 概率 | 影响 | 对策 | Owner |
|----|------|------|------|------|-------|
| **R15** | MCP server stdio 在部分 runtime 有 buffer 问题（Windows/WSL） | 中 | 中 | 首版仅 macOS/Linux；Windows 加明确警告 | Phase 4 |
| **R16** | hindsight 内嵌 server 启动慢 → orchestrator 首次延迟 | 中 | 低 | 首次启动后 fork 常驻；健康检查 + 预热 | Phase 7 |
| **R17** | code-review-graph 大仓库首次 build > 2min | 中 | 低 | 后台构建 + UI "构建中" 提示；Phase 8 并发前必 build 完 | Phase 7 |
| **R18** | orchestrator daemon 崩溃但 session 还在跑 | 低 | 高 | session 自带心跳写 `.ultra/sessions/<sid>/heartbeat`；5 min 无心跳 → 自动清理 + 标记 orphan | Phase 5 |
| **R19** | 三层 schema 不同步（Phase 1 后各 Phase 漂移） | 中 | 高 | 单源生成脚本：`spec/mcp-tools.yaml` → TypeScript 类型 + skill frontmatter 校验 + CLI 参数解析 | Phase 1 |
| **R20** | v0.2 执行层复杂度爆炸 → v0.1 发布延迟 | 高 | 高 | 严格分阶段发布：v0.1 Phase 0-4 完就发；Phase 5-8 任何滑动不影响 v0.1 | 整体 |

---

## 10. 置信度拆分

| Phase | 工作 | 置信度 | 降低原因 |
|-------|------|-------:|---------|
| 0 | 骨架 | 100% | 已完成 |
| 1 | 三层接口定义 | 95% | 纯设计；R19 减分 |
| 2 | 原子状态机重构 | 95% | GSD 模式已验证 |
| 3 | 命令规则化（9 命令） | 90% | 工作量大但模式清；双写消除是关键风险 |
| 4 | 跨 runtime 分发 | 88% | R1/R10-R14 hook schema 未公开 |
| 5 | Session 隔离 + 事件循环 | 85% | 新能力，需 spike；R18 心跳设计 |
| 6 | 监控与优化 | 93% | RTK 成熟；埋点标准工程 |
| 7 | 智能层 | 82% | hindsight 重量级；R16 启动延迟；pgvector 运维 |
| 8 | 自动化工厂 | 80% | GSD-2 移植工作量大；R20 范围蔓延 |
| 9 | 发布 | 97% | 三渠道标准 |
| **综合** | | **88%** | 按工时加权；Phase 5/7/8 是主要风险 |

**残差 12%**：
- 6% = hook schema 不公开导致多次 spike 或功能丢失
- 4% = session 管理的生产级稳定性（R18 心跳 + 心跳丢失场景）
- 2% = pgvector / 内嵌 hindsight 在用户机器上不可靠

---

## 11. 时间线

```
Week 1     ████████  Phase 0 (done) + Phase 1 开工
Week 2     ████████  Phase 1 完 + Phase 2 开工
Week 3     ████████  Phase 2 完 + Phase 3 开工
Week 4     ████████  Phase 3 完
Week 5     ████████  Phase 4 + v0.1 发布内测

Week 6     ████████  Phase 5
Week 7     ████████  Phase 5 完 + Phase 6
Week 8     ████████  Phase 6 完 + v0.2 发布内测

Week 9     ████████  Phase 7
Week 10    ████████  Phase 7 完 + Phase 8 开工
Week 11    ████████  Phase 8
Week 12    ████████  Phase 8 完 + v0.3 发布内测

Week 13    ████      Phase 9 + v1.0 正式发布
```

**总工期**：11-13 周 AI 协助，~250-350 工时。

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
| **D17** | **2026-04-17** | Phase 3 消除 **tasks.json 与 context 的 status 双写**（breaking change from v4.4 → v5.0） | 用户指痛点"异步效果不好"根因之一；schema 升级附 migration 脚本 |

---

## 15. 术语表

- **Adapter**：`adapters/` 下按 runtime 实装的模块，Phase 4 的主产物。
- **activity-log**：`.ultra/activity-log.json` append-only 事件流；P8/P10
  修复核心；Phase 2 建立，Phase 5 消费。
- **AGENTS.md**：各 runtime 原生的项目上下文文件（Claude 叫 CLAUDE.md，
  Gemini 叫 GEMINI.md）；Phase 3.7 统一注入。
- **DISPATCH_RULES**：GSD-2 的声明式分派规则表，Phase 8 移植。
- **Orchestrator**：Phase 5+ 引入的 Node daemon，负责 session 生命周期 +
  事件循环 + 分派。
- **规则层 / 执行层**：§4.2；Phase 1-4 / Phase 5-8。
- **Session**：GSD-2 模式；每 task 一个独立执行上下文，`.ultra/sessions/<sid>/`
  存状态；Phase 5 实装。
- **三层架构**：§4.1；skill（知识）+ MCP（状态操作主路径）+ CLI（兜底）。
- **staleness**：task 的 spec 被改后，未开工的 pending task 自动标记
  "需要重读 spec"；Phase 5.4。
- **Walking Skeleton**：Hermes 概念，总是 Task #1 的 E2E 最小路径，贯穿所有
  架构层。
- **${UBP_CONFIG_DIR}**：skill / 命令 md 内的路径占位符，adapter 在 install
  时按 runtime 展开。

---

*计划结束。范围 / 置信度 / 时间线 / 架构的任何改动必须先在 §14 打日期写明、
再落代码。*
