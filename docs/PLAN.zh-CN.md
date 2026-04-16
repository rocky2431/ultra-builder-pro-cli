# ultra-builder-pro-cli — 执行计划

**状态**：Phase 0 完成 · Phase 1 可启动
**版本**：0.1.0-plan · 起草 2026-04-17
**范围**：v0.1 交付。v0.2+ 的条目明确标注延后。
**整体置信度**：**96%**（逐 Phase 拆分见 §10）

本文件是 Hermes（Ultra Builder Pro）从 Claude Code 专属转为跨 runtime
CLI 的技术契约。§6 每条任务都有一条审阅者可独立复跑的验收准则。

对照英文版 `PLAN.md`——两份文档语义等价，任何一边的修改都应同步另一边。

---

## 1. 问题陈述

Hermes 是一套完整的 agent 工程系统——9 条 slash 命令、9 个 sub-agent、
18 个 skill、15 个 hook、一层 SQLite-FTS5 记忆、一套 team 协作——全部
针对 Claude Code 的工具表面与配置格式编写。在 Claude Code 上它运转
自如；其它任何 runtime 上它不能用。

与此并行的生态（OpenCode、Codex CLI、Gemini CLI）有各自的用户群，
今天无法消费 Hermes。每一次 Hermes 的上游改进，影响半径都被锁在
Claude Code 内部。

**假设**：内容是可移植的；只有胶水层与 Claude 绑定。加一层薄薄的分发
+ adapter 层（已由 `get-shit-done` 在 14 个 runtime 上验证过的模式）
就能让 Hermes 抵达另外 3 个主流生态，而不必重写 Hermes 本体。

---

## 2. 目标

| # | 目标 | 验证方式 |
|---|------|----------|
| G1 | `npx ultra-builder-pro-cli --{runtime} --{scope}` 在 Claude / OpenCode / Codex / Gemini 得到可用的 Hermes | E2E：每个 runtime 都能跑通 `/ultra-init` |
| G2 | `--uninstall` 退回到 diff-equal 的初始状态 | 目标配置目录 `git status` 为空 |
| G3 | 单一事实源——`commands/` `agents/` `skills/` 不按 runtime 分叉 | 只有 adapter 内含 runtime 专属代码 |
| G4 | Claude 独占工具在另外 3 个 runtime 上优雅降级 | 每一处 Claude 独占调用都有 `ultra-tools` 垫片兜底 |
| G5 | **Claude 上 diff-equal 硬门**：安装结果与手写版 `~/.claude` 字节级一致 | `diff -r` 返回 0 |
| G6 | 任何发布产物都无隐私数据泄漏 | `npm pack --dry-run`、Homebrew bottle、pip wheel 全部干净 |

---

## 3. 非目标

- 把 Hermes 重写为独立的 coding agent——那是 gsd-2 的跑道。
- 抽象 LLM 提供商——runtime 自己管。
- v0.1 不支持 Copilot / Cursor / Windsurf / Augment / Trae / Qwen /
  CodeBuddy / Cline / Antigravity / Kilo。每家 adapter 约 2–3 天，
  延到 v0.2+。
- Web 仪表盘、TUI、daemon——CLI 是分发工具，不是 agent 宿主。
- 对现有 command / agent / skill 的装饰性重构。

---

## 4. 架构

### 4.1 数据流

```
                  repo（单一事实源）
                           │
           ┌───────────────┼───────────────────────────┐
           │               │                           │
      commands/        agents/  skills/  hooks/   CLAUDE.md
           │               │       │       │           │
           └───────────────┼───────┴───────┴───────────┘
                           │
                   bin/install.js（CLI 入口）
                           │
           ┌───────────────┼────────────┬──────────┐
           │               │            │          │
      adapters/        adapters/    adapters/  adapters/
      claude.js        opencode.js  codex.js   gemini.js
           │               │            │          │
           ▼               ▼            ▼          ▼
     ~/.claude/    ~/.config/     ~/.codex/    ~/.gemini/
                   opencode/
                           │
                    runtime 加载资产
                           │
                       ┌───┴────┐
                       │ Agent  │ ← 通过 Bash 调用 ultra-tools/cli.cjs
                       │   运行 │   获得 TaskCreate / AskUserQuestion /
                       │        │   Skill / Subagent / Memory 等等同能力
                       └────────┘
```

### 4.2 组件一览（Phase 1–5 完工后）

```
ultra-builder-pro-cli/
├── bin/
│   └── install.js            CLI 入口、参数解析、adapter 路由
├── adapters/
│   ├── claude.js             ~/.claude + settings.json 合并
│   ├── opencode.js           ~/.config/opencode + opencode.json 合并
│   ├── codex.js              ~/.codex + config.toml 合并
│   ├── gemini.js             ~/.gemini（无 hook 表面）
│   ├── _shared/
│   │   ├── file-ops.js       复制 / 链接 / 哈希 / 备份
│   │   ├── frontmatter.js    YAML ↔ TOML ↔ JSON 相互转换
│   │   ├── settings-merge.js 带冲突策略的 JSON 深合并
│   │   └── path-rewrite.js   ${UBP_CONFIG_DIR} 模板展开
│   └── _shared.test.js       按模块的 vitest
├── ultra-tools/
│   ├── cli.cjs               Bash 可调用的垫片；5 个子命令
│   ├── task.cjs              TaskCreate/Update/List/Get/Delete
│   ├── ask.cjs               AskUserQuestion / text-mode 菜单
│   ├── memory.cjs            经 Python 透传的 SQLite FTS5
│   ├── skill.cjs             读 SKILL.md 实现 Skill() 调用
│   ├── subagent.cjs          经 CLI 递归或 SDK 实现 Task()
│   └── *.test.cjs            按文件的 node:test
├── hooks/
│   ├── *.py                  15 个 Claude 格式 hook（v0.1 不动）
│   ├── core/                 纯 hook 逻辑（Phase 3）
│   ├── adapters/             按 runtime 的事件读取器（Phase 3）
│   └── tests/                单元测试（不入包）
├── commands/                 9 个 *.md（Phase 4 模板化路径）
├── agents/                   9 个 *.md
├── skills/                   18 个 skill 目录
├── output-styles/            2 个 *.md（Claude 专属，其它 runtime 跳过）
├── .ultra-template/          项目初始化脚手架
├── docs/
│   ├── ROADMAP.md            5 个 Phase 时间线
│   ├── PLAN.md               英文版计划
│   ├── PLAN.zh-CN.md         本文件
│   ├── TOOL-MAPPING.md       Phase 4 产物
│   └── MIGRATION.md          Phase 5 产物
└── package.json
```

### 4.3 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 安装层语言 | Node（CJS） | 4 个目标 runtime 上都必有；`npx` 可零依赖启动。与 get-shit-done 一致。 |
| hook 语言 | Python（沿用） | 15 个 hook 已成形；用 Node 重写 = 2–3 周纯折腾、无用户可见价值。4 个 runtime 都能 shell out 调 `python3`。 |
| 配置合并策略 | 带哨兵标记的三方合并 | 用 `# UBP_MANAGED_START` / `# UBP_MANAGED_END` 包裹每一段；uninstall 只剥这块；块外的用户手写配置一律保留。 |
| 非 Claude 下 subagent 并发 | CLI 递归调用 | `codex exec` / `gemini --prompt` / Claude Agent SDK 的 `sdk` 后端。在只能串行的 runtime 上丢失真并发；作为"降级"明确记录。 |
| 记忆 DB | 沿用 SQLite-FTS5 经 `python3` | `better-sqlite3` 原生编译摩擦大；hook 本来就需要 Python，复用。 |
| text_mode 开关 | `UBP_TEXT_MODE` 环境变量 + `workflow.text_mode` 配置 | 命令内含 `<text_mode>` 分支切换 UI 原语。沿袭 gsd-cc 约定。 |

---

## 5. 工具映射矩阵

Hermes 所依赖的 12 个工具，按各 runtime 的处理方式分类。只有 `Claude 独占`
行需要降级。

| Hermes 工具 | Claude | OpenCode | Codex | Gemini | 降级手段 |
|------------|--------|----------|-------|--------|----------|
| Read | ✅ | ✅ read | ✅ read | ✅ read | 改名即可 |
| Write | ✅ | ✅ write | ✅ write | ✅ write | 改名即可 |
| Edit | ✅ | ✅ edit | ✅ edit | ✅ edit | 改名即可 |
| Bash | ✅ | ✅ bash | ✅ bash | ✅ bash | 无 |
| Grep/Glob | ✅ | ✅ | ✅ | ✅ | 无 |
| WebSearch/Fetch | ✅ | ⚠ 视情况 | ⚠ 视情况 | ✅ | 退回 Bash `curl` |
| **TaskCreate/\*** | ✅ 原生 | ❌ | ❌ | ❌ | `ultra-tools task …`（fs-lock 的文件 JSON） |
| **AskUserQuestion** | ✅ 原生 | ❌ | ❌ | ❌ | `ultra-tools ask --text-mode`（编号菜单，从 stdin 读） |
| **Skill** | ✅ 原生 | ❌ | ❌ | ❌ | `ultra-tools skill invoke <name>`（打印 SKILL.md；外层 agent 注入） |
| **Agent（subagent）** | ✅ 原生 | ⚠ 有限 | ⚠ exec | ⚠ --prompt | `ultra-tools subagent run <name> --prompt …`（CLI 递归或 SDK） |
| **TeamCreate / SendMessage** | ✅ 原生 | ❌ | ❌ | ❌ | `<unsupported_in_runtime>` 块；以串行 sub-agent 运行为替代 |
| **EnterWorktree / ExitWorktree** | ✅ 原生 | ❌ | ❌ | ❌ | `ultra-tools worktree …` shell out 调 `git worktree`（Phase 4.5 可选） |

### 5.1 降级契约

当 Claude 独占工具在非 Claude runtime 被调用时，`ultra-tools` 垫片
**必须**：

1. 产出与原生调用等价的功能结果（状态、选择、输出）。
2. 在 stdout 输出一行机器可读的 JSON，供调用方 agent 在所有 runtime
   上用同一套逻辑解析。
3. 绝不静默直通——缺输入就 non-zero 退出、stderr 给一条人类可读消息。

---

## 6. 逐 Phase 任务拆解

每条任务含：**ID**、**主题**、**验收准则**、**工时**（AI 协助下）。
同 Phase 内默认串行。

### Phase 0 — 骨架（✅ 完成）

| ID | 任务 | AC | 完成 |
|----|------|-----|------|
| 0.1 | 销毁旧 `.git`，在 `main` 重新 init；备份遗留历史到 bundle | bundle 可验证；3 个 commit 在线 | ✅ |
| 0.2 | 带 bin/files/engines 的 `package.json` | `npm pack --dry-run` 能跑 | ✅ |
| 0.3 | `bin/install.js` 骨架 | `--help` 和 `--all --local` 都正确回显 stub | ✅ |
| 0.4 | 4 个 adapter stub | 每个都导出 `resolveTarget/install/uninstall` 并抛 "not implemented" | ✅ |
| 0.5 | `ultra-tools/cli.cjs` 骨架 | `--help` `--version` 以及每个子命令的 stub 错误 | ✅ |
| 0.6 | `docs/ROADMAP.md` | 5 个 Phase 含 AC | ✅ |
| 0.7 | 隐私净化（`teams/` + `plugins/blocklist.json`）+ 最小 settings | npm tarball 无任何本地状态文件 | ✅ |

### Phase 1 — `ultra-tools` 状态引擎 · **5–7 天 · 置信度 98%**

Runtime 无关的 Node CLI，覆盖 5 类 Claude 独占表面。所有子命令都在
stdout 发结构化 JSON（`{ok, data, error}`），让 agent 在各 runtime 上
用同一套解析。

#### 1.1 共享工具 · 0.5 天
- 新增 `ultra-tools/_util.cjs`：基于 `proper-lockfile` 的 JSON IO、结构化
  错误发射器、stdout JSON 协议助手。
- **AC**：4 个工具函数在 `ultra-tools/_util.test.cjs` 下有 vitest 风格
  测试；工具文件覆盖率 ≥90%。

#### 1.2 `task` 子命令 · 1.5 天
- 操作：`create`、`update`、`list`、`get`、`delete`。
- 后端：`.ultra/tasks/tasks.json`（schema v5.0，见 §7.1）。
- 参数：`--subject`、`--description`、`--status`、`--owner`、`--id`、`--json`。
- 并发：每次写用 `proper-lockfile` 包住。
- **AC**：(a) 10 条单测通过（每个 op × happy + error）；(b) shell
  脚本模拟两个并发 `task create`，产出两个不同 ID 且无损坏。

#### 1.3 `ask` 子命令 · 1 天
- 参数：`--question "<q>"`、`--options "A|B|C"`、`--header`、
  `--multi-select`、`--text-mode`。
- Claude 模式：发射哨兵 JSON 块，由 Claude wrapper 解析为原生
  `AskUserQuestion`。
- Text 模式：编号菜单输出到 stderr，从 stdin 读选择，校验后 stdout
  输出 JSON。
- 非 TTY stdin：解析单行 "1" 或多选 "1,3"。
- **AC**：(a) 6 条单测（TTY / 非 TTY / 多选 / 非法 / 越界 /
  Claude 哨兵形状）；(b) shell 脚本通过 `"2\n"` 管道喂入，拿回
  第二个选项。

#### 1.4 `memory` 子命令 · 1 天
- 操作：`search <query> [--limit N]`、`save --summary "<s>"
  [--tags "a,b"]`、`prune --older-than N`。
- 后端：shell out 到 `python3 hooks/memory_db.py`，用 JSON 命令传参，
  stdout 返回。避免在 Node 里编译 sqlite。
- 回退：缺 `python3` 则打印可执行错误、退出码 3。
- **AC**：(a) 5 条单测通过垫片打 `memory_db.py`；(b) 集成测试：真调
  `python3`、在临时 DB 上录 3 条，`search` 命中 2 条、`prune` 移除 1 条。

#### 1.5 `skill` 子命令 · 0.5 天
- 操作：`invoke <name> [--args "..."]`、`list [--filter X]`。
- `invoke` 读 `skills/<name>/SKILL.md`（或 `$UBP_CONFIG_DIR/skills/…`）
  ，前置 JSON 头并打印 body。
- `list` 扫描 skills 目录，每个 skill 返回 `{ name, description, location }`。
- **AC**：(a) 4 条单测；(b) shell 脚本列出 ≥1 skill 并调用其中一个
  无报错。

#### 1.6 `subagent` 子命令 · 1.5 天
- 操作：`run <agent-name> --prompt "..." [--backend auto|claude|
  codex|gemini|sdk] [--timeout S]`。
- 后端：
  - `claude`：发射 `Task()` 哨兵 JSON。
  - `codex`：`codex exec --sandbox read-only -o <out> <prompt>`。
  - `gemini`：带管道处理的 `gemini --prompt <prompt>`。
  - `sdk`：`@anthropic-ai/claude-agent-sdk` 的 headless `query()`。
  - `auto`：按 `$UBP_RUNTIME` 分支，默认 `claude`。
- **AC**：(a) 8 条单测（每个后端 × happy + fail）；(b) 端到端测试
  用 `$PATH` 上的 dummy `codex` stub 二进制验证 shell-out 契约与返回
  JSON 形状。

#### 1.7 文档 · 0.5 天
- 写 `ultra-tools/README.md`，列每个子命令的调用、JSON schema、退出码。
  此文件入 npm tarball，也是 Phase 4 rewriter 的权威参考。
- **AC**：`ultra-tools --help` 输出与 README 目录一一对应。

**Phase 1 门槛**：所有子命令有测试、README 存在；跨 shell 集成脚本
（`scripts/phase1-smoke.sh`）把一个 5 步工作流喂过 ultra-tools，在
stdout 上产出预期的 JSON 流。

### Phase 2 — Adapters · **5–7 天 · 置信度 94%**

为 4 个 runtime 各实现 `install(ctx)` 与 `uninstall(ctx)`。每个 adapter
在热缓存下 <30 秒完成。

#### 2.1 共享 adapter 工具 · 1 天
- `adapters/_shared/file-ops.js`：复制、符号链接、哈希后跳过、覆盖前
  备份（备份存到 `${target}/.ubp-backup/`）。
- `adapters/_shared/frontmatter.js`：YAML ↔ TOML ↔ JSON。用 `yaml` 库
  + 最小 TOML writer（不引入依赖爆炸）。
- `adapters/_shared/settings-merge.js`：带哨兵块识别的深合并；冲突
  策略 = 大声失败 + 可执行提示。
- `adapters/_shared/path-rewrite.js`：跨文件体展开 `${UBP_CONFIG_DIR}`
  `${UBP_RUNTIME}` `${UBP_SCOPE}`。
- **AC**：4 个模块共 12 条单测；shared 覆盖率 ≥85%。

#### 2.2 Claude adapter · 1 天
- 目标：`~/.claude/`（global）或 `./.claude/`（local）。
- 资产：`commands/` `agents/` `skills/` `hooks/` 直接复制；`settings.json`
  经 settings-merge；`CLAUDE.md` 在哨兵块内追加。
- **AC**：**diff-equal 门槛**——`diff -r existing-claude-install
  new-claude-install` 返回 0。在空 `~/.claude/` 上 install 之后
  `--uninstall`，目录回到空。

#### 2.3 OpenCode adapter · 1.5 天
- 目标：XDG（`~/.config/opencode/`）或 `./.opencode/`。
- 变换：
  - `commands/*.md` → `commands/*.md`（YAML frontmatter 兼容）。
  - `agents/*.md` → `agents/*.md`（工具名基本兼容，局部修正在
    frontmatter 注释里记录）。
  - `skills/` → `skills/`（Phase 1 验证 SKILL.md 可用）。
  - `hooks/*.py` → `opencode.json` hook 条目指向 `${target}/hooks/*.py`。
- **AC**：install 产出合法 `opencode.json`（若有 schema 则用它校验，
  否则 JSON-parse 通过）；空项目上跑 `/ultra-init` 烟测无崩溃。

#### 2.4 Codex adapter · 1.5 天
- 目标：`$CODEX_HOME` 或 `~/.codex/`。
- 变换：
  - `commands/*.md` → `prompts/*.md`（剥掉 YAML frontmatter，保留
    内联 `$ARGUMENTS` 支持）。
  - `agents/*.md` → `config.toml` 下 `[agents.<name>]`，含 sandbox、
    model、由 frontmatter 推出的 tools。
  - `skills/` → `${target}/skills/` 下可被 Bash 寻址；agent prompt 通过
    `ultra-tools skill invoke` 引用。
  - `hooks/*.py` → `[codex_hooks]` 条目，`event = "pre_tool"` 形状
    （具体按当前 Codex TOML 参考）。
- 工具名改写：由 `frontmatter.js` 执行。
- **AC**：install 产出合法 `config.toml`（Node TOML 读取器可解析）；
  `codex exec "run /ultra-init"` 完成（CI 若无真 Codex，可用 mock 二进制
  满足契约）。

#### 2.5 Gemini adapter · 1.5 天
- 目标：`$GEMINI_CONFIG_DIR` 或 `~/.gemini/`。
- 变换：
  - `commands/*.md` → `commands/*.toml`（Gemini 命令格式，1 对 1 机械
    映射）。`$ARGUMENTS` → Gemini 的 `{{args}}` 模板。
  - `agents/*.md` → sub-agent 注册（按 2026-04 的 Gemini sub-agent 协议；
    Phase 2.0 加一天 spike 确认）。
  - `skills/` → Bash 可寻址；无原生 skill 概念。
  - **Hook：Gemini CLI 不支持**。降级：install 时剥掉 hook，在
    `.gemini/README.ubp.md` 里显眼地写一条 `# hooks-disabled` 附理由。
- **AC**：在空 `~/.gemini` 上 install 无崩溃；uninstall 目录为空；跑
  一个命令 via `gemini --prompt` 返回退出码 0。

#### 2.6 路径重写集成 · 0.5 天
- 在 install 对每个复制的文件体应用 `path-rewrite.js`。源 token：
  `${UBP_CONFIG_DIR}`、`${UBP_SKILLS_DIR}`、`${UBP_HOOKS_DIR}`。
- 回填 ROADMAP §Phase 2 登记的 6 处硬编码 `~/.claude/`（CLAUDE.md
  ×2、commands/learn.md ×3、commands/ultra-init.md ×1）。
- **AC**：回填后源码 `git grep "~/.claude/"` 零命中；各 adapter 输出的
  token 均正确展开。

**Phase 2 门槛**：4 个 adapter 各自 AC 通过；矩阵安装（4 runtime × 2
scope）uninstall 后宿主文件系统回到 diff-equal 预安装态。

### Phase 3 — Python hooks 三分拆 · **3–5 天 · 置信度 92%**

把每个 hook 拆成"纯逻辑 core + 薄 runtime adapter"。一次改 core 4 个
runtime 同时生效。

#### 3.1 Core 抽取 · 1 天
- 把业务逻辑迁到 `hooks/core/<name>.py`（纯函数，不解析 stdin、不读
  env、不 print）。
- **AC**：`python3 -c "from hooks.core import memory_db; …"` 可行；
  每个 `hooks/core/*.py` 在 `hooks/tests/core/` 下有 pytest 文件。

#### 3.2 Claude adapter · 0.5 天
- `hooks/adapters/claude.py`：读当前 stdin JSON 形状，调 core，打印
  预期响应。今天的行为原样保留。
- **AC**：录制当前 hook payload 跑出来字节级一致。

#### 3.3 OpenCode adapter · 1 天
- `hooks/adapters/opencode.py`：按官方 schema 将 OpenCode hook JSON
  事件翻译成 core 输入并翻译回去。
- **AC**：以规格测试驱动——每个 hook 给一条 OpenCode 事件样本，被转换
  后调 core、输出匹配 OpenCode hook response envelope。

#### 3.4 Codex adapter · 1 天
- `hooks/adapters/codex.py`：读 Codex TOML hook payload 形状（编码前
  先 0.5 天 spike 核实线缆格式）。
- **AC**：同 OpenCode；另外 `codex exec` 针对小 fixture 项目跑 hook
  后产出预期副作用。

#### 3.5 Gemini adapter · 0.5 天
- 无 hook 表面。产物改为 `hooks/adapters/gemini.md` 文档——说明每个
  守卫被丢弃的原因以及如何以"agent 必须在 prompt 调 `ultra-tools
  verify …`"等手段替代。
- **AC**：审阅者确认 15 个 hook 均给出处置结论（"drop"、"挪到
  prompt guard"、"挪到 pre-commit 垫片"）。

**Phase 3 门槛**：Claude 下 hook 输出字节级一致；OpenCode + Codex
通过 adapter AC；Gemini 覆盖表已审。

### Phase 4 — Prompt 改写 · **3–5 天 · 置信度 95%**

给每条 command / agent 注入 `<text_mode>` 分支，把 Claude 独占工具
引用替换成 `ultra-tools` 等价调用。

#### 4.1 基于生成器的改写器 · 1 天
- `adapters/_shared/prompt-rewrite.js` —— 一个确定性变换：拿 command /
  agent markdown，吐出 runtime 专属版本。install 时在 adapter 里跑，
  源码不被烘烤。
- 规则（机器可读放 `adapters/_shared/rewrite-rules.json`）：
  ```
  AskUserQuestion(…)  → ultra-tools ask …     （text-mode 分支）
  TaskCreate(…)       → ultra-tools task create …
  TaskUpdate(…)       → ultra-tools task update …
  TaskList()          → ultra-tools task list
  Skill(name=X)       → ultra-tools skill invoke X
  Agent(subagent=X)   → ultra-tools subagent run X
  TeamCreate(…)       → <unsupported_in_runtime> 块 + 串行替代
  SendMessage(…)      → <unsupported_in_runtime> 块
  ```
- **AC**：golden-file 测试——每条（9 命令 + 9 agent）按 runtime 各有
  一个 `.golden.md`；rewriter 输出精确匹配。

#### 4.2 命令内容更新 · 1 天
- 9 条命令逐个核验 `<text_mode>` 分支的渲染干净。若某原生调用没有
  干净垫片，加 `<!-- ubp:warn -->` 注记。
- **AC**：人工审阅——每条命令在每个 runtime 都渲染、无断引用。

#### 4.3 Agent 内容更新 · 1 天
- 对 9 个 sub-agent 做同样处理。
- **AC**：rewrite 后每个 sub-agent 的工具列表 frontmatter 仅列
  runtime 支持工具。

#### 4.4 Skill 内容更新 · 0.5 天
- Skill 多数不依赖 Claude 独占工具；对少数（如 `recall`、
  `ultra-review`）做局部修正。
- **AC**：`grep -l "TaskCreate\|Skill(\|Agent("` skills/ 下 rewrite 后
  对非 Claude 目标返回 0。

#### 4.5 CLAUDE.md 模板化 · 0.5 天
- 把 2 处硬编码 `~/.claude/` 替换为 `${UBP_CONFIG_DIR}` token。与 2.6
  路径重写衔接。
- **AC**：源码 `git grep "~/.claude/"` → 0；安装后文件显示 runtime
  正确路径。

**Phase 4 门槛**：4 个 runtime 上 `/ultra-init` 端到端跑通，产出的
`.ultra/` 结构与 Claude 基线一致。

### Phase 5 — 发布 · **2–3 天 · 置信度 98%**

#### 5.1 集成测试 · 1 天
- `tests/e2e/install-<runtime>.sh` × 4：起一个干净 temp dir、install、
  跑 `/ultra-init`、断言文件存在、uninstall、断言目录干净。
- GitHub Actions 矩阵：`{claude, opencode, codex, gemini}` ×
  `{local, global}` = 8 个 job。真 CLI 在 CI 不可用时用 mock 二进制。
- **AC**：`main` 上 8 个矩阵单元全绿。

#### 5.2 README 重写 · 0.5 天
- 替换旧 57 KB Hermes 文档为 ~8 KB 的 CLI README：各 runtime quickstart、
  工具映射表、降级矩阵、常见问题。旧内容搬到 `docs/LEGACY-HERMES.md`。
- **AC**：README 在 GitHub 仓库顶部"About"一屏内显示完；每个 runtime
  3 行 quickstart。

#### 5.3 发布流水线 · 1 天
- **npm**：`v*` 标签推送触发 `npm publish`。PR 上 `npm pack --dry-run`
  作为合并门槛。
- **Homebrew**：`homebrew-ultra-builder-pro-cli` tap 拉取 GitHub Release
  tarball 的 formula，`homebrew-releaser` action 自动同步。
- **pip**：PyPI 上 `ultra-builder-pro` 瘦 wrapper 包，shell out 到
  `npx ultra-builder-pro-cli`。给 Python 为主的团队一个单命令入口。
- **AC**：3 个渠道 `ultra-builder-pro-cli@0.1.0` 解析到同一个 commit
  SHA；干净 macOS VM 从 3 个渠道任意一个装都能 <60 秒完成。

#### 5.4 发布说明 · 0.5 天
- `CHANGELOG.md` 写 v0.1.0：范围、runtime 覆盖、已知限制、从旧 Hermes
  迁移。
- **AC**：`known issues` 段落列出所有延到 v0.2 的条目。

**Phase 5 门槛**：`v0.1.0` 打 tag、3 个渠道上线、干净机器上 4 个 runtime
都能装。

---

## 7. 接口与契约

### 7.1 `.ultra/tasks/tasks.json` schema（v5.0）

```jsonc
{
  "version": "5.0",
  "created": "2026-04-17T03:45:12Z",
  "updated": "2026-04-17T03:45:12Z",
  "tasks": [
    {
      "id": "1",
      "subject": "Write failing test for auth flow",
      "description": "Cover invalid credentials path; expect 401.",
      "status": "pending",        // pending | in_progress | completed | deleted
      "owner": "",                 // 空 = 未认领；agent 认领时填名字
      "blockedBy": [],             // 任务 ID 数组
      "blocks": [],
      "activeForm": "Writing test",
      "created": "2026-04-17T03:45:12Z",
      "updated": "2026-04-17T03:45:12Z",
      "metadata": {}               // 自由格式
    }
  ]
}
```

- **不变量**：`id` 是单调递增字符串；`status` 只允许
  `pending → in_progress → completed`（`deleted` 是终态）。并发写冲突
  由 `proper-lockfile` 阻断。

### 7.2 `ultra-tools` stdout 协议

每个子命令最后在 stdout 发一行 JSON：

```json
{"ok": true,  "command": "task.create", "data": { "id": "1", … }}
{"ok": false, "command": "task.create", "error": { "code": "EIO", "message": "…" }}
```

退出码：

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 用户输入错误（标志错、缺必填） |
| 2 | 未实现（仅 stub 阶段） |
| 3 | 环境缺失（如 memory 无 python3） |
| 4 | IO / 锁失败 |
| 5 | 下游工具失败（如 codex exec 非 0） |

### 7.3 Adapter 签名

```ts
// 概念版——实际文件是 CJS
type AdapterContext = {
  repoRoot: string;
  scope: 'local' | 'global';
  configDir: string | null;   // 来自 --config-dir 的覆盖
  homeDir: string;
};

interface Adapter {
  name: string;
  resolveTarget(ctx: AdapterContext): string;
  install(ctx: AdapterContext): Promise<void>;
  uninstall(ctx: AdapterContext): Promise<void>;
}
```

所有 IO 走 `adapters/_shared/file-ops.js`；adapter 不直接调 `fs.*`。
这样 dry-run 模式（`--dry`）只需加一个 flag。

### 7.4 哨兵块格式

CLI 修改任何用户自有配置都包在哨兵块里，uninstall 可以无损剥离：

```jsonc
// ~/.claude/settings.json
{
  "permissions": { /* 用户自有 */ },

  // UBP_MANAGED_START (ultra-builder-pro-cli 0.1.0)
  "hooks": {
    "PostToolUse": [ /* Hermes 的 */ ]
  }
  // UBP_MANAGED_END
}
```

JSON 与 TOML 里注释不便表达时，改用镜像 manifest
（`~/.claude/.ubp-manifest.json`）记录我们插入的每个 key，uninstall
时据此回退。

---

## 8. 测试策略

| 层 | 框架 | 覆盖目标 | Phase |
|----|------|----------|-------|
| ultra-tools 单测 | `node --test`（原生） | ≥85% | 1 |
| adapter 共享库 | `node --test` | ≥85% | 2 |
| adapter install/uninstall | 带 tmp dir 的 shell E2E | 每个 runtime 的路径覆盖 | 2 |
| hook core（Python） | `pytest` | ≥80% | 3 |
| hook adapter 翻译器 | pytest | ≥80% | 3 |
| prompt rewriter | golden-file（`tests/goldens/`） | 100% 命令 × runtime | 4 |
| E2E CI 矩阵 | GitHub Actions | 全绿、无 flaky | 5 |

**fixture**：`tests/fixtures/` 含录制 stdin payload、mock 配置文件、
CI 下 mock `codex`/`gemini` 二进制——当真 CLI 不可用时使用。

---

## 9. 风险与对策

| ID | 风险 | 概率 | 影响 | 对策 | Owner |
|----|------|------|------|------|-------|
| R1 | Codex hook payload 格式无文档 / 改动 | 中 | 高 | Phase 3 先做半天 spike 记录当前线缆格式；adapter 是薄翻译层，恢复成本低 | Phase 3.4 |
| R2 | Gemini sub-agent 协议不稳定 | 中 | 中 | §5 写明"Gemini 仅串行"；降级矩阵标"并发退化"；加 `--gemini-agent-backend=flat` 作为逃生口 | Phase 2.5 |
| R3 | settings-merge 破坏用户手写配置 | 低 | 高 | 三重防护：(a) 每次写前备份到 `.ubp-backup/`；(b) 哨兵块隔离；(c) `--dry` 打印 diff 不落盘 | Phase 2.1 |
| R4 | `hooks/*.py` 依赖 Claude 专属 env 变量 | 中 | 中 | Phase 3.1 盘点每个 `os.environ.get(...)`；adapter 翻译 | Phase 3.1 |
| R5 | `proper-lockfile` 跨平台抖动 | 低 | 中 | 用库自带 `retries` + 失效锁识别；加 lock-timeout 集成测试 | Phase 1.1 |
| R6 | 慢网下 `npx` 启动延迟 | 低 | 低 | 用 esbuild 输出预打包单文件 ESM（`build:bin` 脚本）给高级用户 | Phase 5.1 |
| R7 | diff-equal 门槛因现 `~/.claude` 有杂项改动而失败 | 高 | 中 | 精确定义"基线"：pre-CLI git tag 的 Hermes 全新安装，而非用户当前工作树 | Phase 2.2 |
| R8 | formula 坏掉后 Homebrew tap 无人照管 | 低 | 低 | 每个 release tag CI 跑 `brew install --build-from-source`；formula 自动生成 | Phase 5.3 |
| R9 | pip wrapper 令 Python-only 用户困惑 | 中 | 低 | wrapper `--help` 显式写"需 Node 22+"；缺 Node 时优雅报错 | Phase 5.3 |

---

## 10. 置信度拆分

| Phase | 工作 | 置信度 | 为何没更高 |
|-------|------|-------:|------------|
| 0 | 骨架 | 100% | 已完成 |
| 1 | ultra-tools | 98% | 直白的状态引擎；唯一残留风险是 `proper-lockfile` 边界情况（R5） |
| 2 | Adapters | 94% | runtime 细节后现：R1（Codex hook 格式）、R7（基线定义） |
| 3 | Hook 三分拆 | 92% | Codex 与 OpenCode 的 hook 线缆格式公开度不高；各自可能要一天 spike |
| 4 | Prompt 改写 | 95% | 确定性变换；golden-file 能捕漂移 |
| 5 | 发布流水线 | 98% | 3 个标准渠道；Homebrew tap 是变量（R8） |
| **综合** | | **96%** | 按工时加权；Phase 2+3 权重最大 |

**残差 4%**：Codex / OpenCode hook 协议里冒出真正的新东西，被迫重新
架构。对策：两家都开源，文档不够就读 hook 处理器源码。

---

## 11. 时间线

日历目标（AI 协助、单开发者）：

```
Week 1     ████████████████████████  Phase 0 (done) + Phase 1
Week 2     ████████████████████████  Phase 1 (finish) + Phase 2 start
Week 3     ████████████████████████  Phase 2 (finish) + Phase 3 + Phase 4
Week 4     ████████████████████████  Phase 5 + buffer
```

- Phase 1：5–7 工作日（~30–40 小时）
- Phase 2：5–7 工作日（~30–40 小时）
- Phase 3：3–5 工作日（~15–25 小时）
- Phase 4：3–5 工作日（~15–25 小时）
- Phase 5：2–3 工作日（~10–15 小时）

**合计**：18–27 工作日；~100–145 AI 协助小时。日历 4 周 + Phase 2+3
上 25% slack。

---

## 12. 成功度量

客观可测、v0.1.0 发布时核查：

1. **可安装性**：4 runtime × 2 scope = 8 条安装路径在干净 macOS 与干净
   Ubuntu runner 上全部成功。
2. **可回退性**：`--uninstall` 让每个 runtime 的配置目录回到 diff-equal
   的初始态（测试：`git init && install && uninstall && git status` 干净）。
3. **内容等价**：每个 runtime 上 `/ultra-init` 产出同一份 `.ultra/
   tasks/tasks.json` schema 与同一套 spec 初始产物（模 runtime 专属路径）。
4. **隐私**：`npm pack --dry-run`、Homebrew bottle、pip wheel 在
   `teams/` `memory/` `sessions/` `usage-data/` `backups/` `.ultra/`
   下条目数为 0。
5. **性能**：install 在热缓存 <30 秒、冷 <2 分钟。
6. **覆盖率**：单测 + 集成测试 ≥80% 行覆盖，公开 API 表面 100%。

---

## 13. v0.1 范围外（通往 v0.2 的路线）

| 条目 | 工时 | 延后理由 |
|------|------|----------|
| Copilot adapter | 2 天 | 符合既定降级模式（工具名改写）；先聚焦 |
| Cursor / Windsurf / Augment / Trae / Qwen / CodeBuddy / Cline / Antigravity / Kilo | 各 2–3 天 | 长尾；先看用户需求再投入 |
| Worktree 垫片（`ultra-tools worktree`） | 2 天 | 锦上添花；Git 本身原生 `worktree` 在各 runtime 都可用 |
| 基于 Claude Agent SDK 的 TypeScript SDK | 1 周 | 与多 runtime 分发并不阻塞 |
| TUI 仪表盘 | 2 周 | 分发工具不需要 UI |
| 插件市场集成 | 1 周 | Claude 专属；等 OpenCode 有对应再做 |

---

## 14. 决策日志

规划期做出的决策，无新证据不得复议。任何变更必须引新证据。

| # | 日期 | 决策 | 证据 |
|---|------|------|------|
| D1 | 2026-04-17 | 走分发-adapter 路线（A），不走独立 agent（B）或混合 SDK（C） | 用户选择；get-shit-done 在 14 runtime 上验证过 |
| D2 | 2026-04-17 | 首发 runtime：Claude + OpenCode + Codex + Gemini | 用户选择；覆盖 2026-04 非 Claude CLI agent 用户约 80% |
| D3 | 2026-04-17 | 包名 `ultra-builder-pro-cli`，短名 `ubp` | 用户选择 |
| D4 | 2026-04-17 | 发布渠道：npm + Homebrew + pip | 用户选择 |
| D5 | 2026-04-17 | 销毁遗留 git、在 main 重建 | 用户选择；历史存在 bundle |
| D6 | 2026-04-17 | hook 沿用 Python，Node shell out 到 `python3` | 15 个 hook 用 Node 重写 = 2–3 周纯折腾；4 个 runtime 都能 shell 到 Python |
| D7 | 2026-04-17 | 配置合并用哨兵块 + manifest 文件 | 比文本重写安全；与 get-shit-done 一致 |
| D8 | 2026-04-17 | `settings.json` 精简为最小合并模板 | 隐私安全；用户同意 |
| D9 | 2026-04-17 | `README.md` 改写延到 Phase 5 | 用户同意；不阻塞开发 |
| D10 | 2026-04-17 | `hooks/tests/` 不入 npm tarball | 与 get-shit-done 一致；保持包体精简 |

---

## 15. 术语表

- **Adapter**：`adapters/` 下按 runtime 实装的模块，负责 Hermes 在该
  runtime 上的 install / uninstall。
- **AC（Acceptance Criterion）验收准则**：任务完成的可核验条件。§6
  每条任务都有。
- **基线（Baseline）**：Claude diff-equal 门槛的比对目标。定义为
  "pre-CLI git tag 的 Hermes 全新安装"，而非用户当前工作树。
- **CLI**（本文）：`ultra-builder-pro-cli`，npm 包。
- **降级（Downgrade）**：把 Claude 独占工具替换为 `ultra-tools` 的
  可移植等价。
- **门槛（Gate）**：Phase 末的校验步骤，未过则下一 Phase 不可启动。
- **Runtime**：AI coding agent 宿主——v0.1 指 Claude Code / OpenCode /
  Codex CLI / Gemini CLI。
- **哨兵块（Sentinel Block）**：用户配置文件内由 `UBP_MANAGED_START`/
  `END` 包裹的区域，用于干净 uninstall。
- **垫片（Shim）**：`ultra-tools/cli.cjs`——Bash 可调桥，让任何
  runtime 的 agent 都能模拟 Claude 独占工具调用。
- **text_mode**：每条 command/agent 内的一个分支，把 `AskUserQuestion`
  换成文本编号菜单。`$UBP_TEXT_MODE=1` 或非 Claude runtime 时启用。
- **Token（frontmatter 内）**：`${UBP_CONFIG_DIR}` 等占位符，install
  时由 `adapters/_shared/path-rewrite.js` 展开。

---

*计划结束。范围 / 置信度 / 时间线的任何改动必须先在 §14 打日期写明、
再落代码。*
