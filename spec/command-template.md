# 命令薄壳模板（Phase 3.0）

Phase 3 产物。所有 `/ultra-*` 命令文件（`commands/ultra-*.md`）必须是"薄壳"：
- **正文 ≤ 80 行**（frontmatter 不计）
- 不嵌入实现逻辑；workflow 统一放在 `skills/<name>/SKILL.md`
- 通过 `workflow-ref` frontmatter 字段指向对应 skill

这么做的原因（PLAN §6 Phase 3）：
- **跨 runtime**：OpenCode / Codex / Gemini 有各自的命令格式，薄壳好转换
- **单源真相**：每条 workflow 只有 skill 一份，避免命令文件和 skill 双写漂移
- **测试边界**：命令文件几乎无逻辑，验收只看是否正确 include skill

## frontmatter 规范

见 `spec/schemas/command-manifest.schema.json`。关键字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `description` | ✅ | 一句话触发描述（≥10 字符） |
| `argument-hint` | | Claude Code 命令面板的 args 提示 |
| `allowed-tools` | | 逗号分隔的工具白名单 |
| `model` | | `haiku` / `sonnet` / `opus` |
| `workflow-ref` | 强烈推荐 | `@skills/<name>/SKILL.md`；有此字段即表示该命令已迁为薄壳 |
| `mcp_tools_required` | | 命令运行时会调用的 MCP tool 列表（格式 `family.tool`） |
| `cli_fallback` | | MCP 不可达时回退到的 `ultra-tools` 子命令名 |

**严格模式**：`additionalProperties: false`；加字段要同步改 schema + `validate-commands.cjs`（PLAN R19 单源规则）。

## 薄壳结构（≤80 行正文）

推荐骨架（按此顺序）：

```markdown
---
description: <一句话触发描述>
argument-hint: <args 提示>
allowed-tools: Read, Write, Bash, ...
model: opus
workflow-ref: "@skills/ultra-X/SKILL.md"
mcp_tools_required: ["task.create", "task.update"]
cli_fallback: X
---

# /ultra-X

## 目标

<1-3 句话说明命令要做什么、最终交付物是什么>

## 参数

- `$1`: <含义> (缺省: <fallback>)
- `$2`: <含义> (可选)

## Workflow

完整 workflow 由 skill 提供，见 `@skills/ultra-X/SKILL.md`。

**入口做的事**：
1. 验参数 + 检测 runtime 能力（MCP 是否可达）
2. 调 `<skill>` 执行主流程
3. 主流程内部通过 `mcp_tools_required` 中列出的 MCP tool 推进状态

**MCP 不可达时**：调 `ultra-tools <cli_fallback>` 串行跑。

## 用法

```bash
/ultra-X                    # 交互模式
/ultra-X <arg1>             # 带一个参数
/ultra-X <arg1> <arg2> git  # 完整参数
```

## 下一步

完成后推荐跑：`/ultra-<next>` 做 <下一阶段>。
```

## 一个真实样例（/ultra-init，Phase 3.1 产物）

```markdown
---
description: Initialize Ultra Builder Pro project with native task management
argument-hint: <name> <type> <stack> [git]
allowed-tools: Read, Write, Bash, Grep, Glob, AskUserQuestion
model: opus
workflow-ref: "@skills/ultra-init/SKILL.md"
mcp_tools_required: ["task.create", "ask.question"]
cli_fallback: init
---

# /ultra-init

## 目标

搭 `.ultra/` 骨架；生成 `tasks.json` 空壳 + spec 模板；按需起 git。

## 参数

- `$1`: 项目名（缺省：当前目录名）
- `$2`: 类型（web / api / cli / fullstack / other；缺省：自动识别）
- `$3`: 栈（缺省：从 package 文件识别）
- `$4`: `git` 启用 git 初始化（可选）

## Workflow

见 `@skills/ultra-init/SKILL.md`。

命令入口做的事：
1. 解析 $1-$4，补全缺省
2. 检测 MCP task tool 是否可达
3. 调 skill 跑 6 步 workflow（信息收集 → 交互确认 → 建目录 → 初始化 tasks.json → 拷模板 → git）
4. MCP 不可达时：fallback `ultra-tools init`

## 用法

```bash
/ultra-init                   # 交互模式（自动识别）
/ultra-init MyProject         # 带项目名
/ultra-init MyProject api git # 带类型 + git
```

## 下一步

`/ultra-research` 跑 17 步 discovery 把 spec 填满。
```

## 硬约束

1. **正文 ≤ 80 行**（不含 frontmatter）— `validate-commands.cjs` 机检
2. **有 `workflow-ref` 就必须存在**：引用的 skill 目录必须在 `skills/` 下
3. **ultra-tools 命令存在**：若填了 `cli_fallback`，对应的 `ultra-tools/commands/<name>.cjs` 必须存在（Phase 3.1+ 实装后启用）
4. **MCP tool 名在册**：`mcp_tools_required` 里的所有 tool 名必须在 `spec/mcp-tools.yaml` 注册（Phase 3 gate 开严格）

## Phase 3 迁移顺序（参照 PLAN §6）

| Task | 命令 | 工时 | 状态 |
|------|------|------|------|
| 3.1 | `/ultra-init` | 0.5d | 模板样板 |
| 3.2 | `/ultra-research` | 1d | 17 step 继承 |
| 3.3 | `/ultra-plan` | 0.5d | |
| 3.4 | `/ultra-dev` | 1.5d | 最大头 |
| 3.5 | `/ultra-test` + `/ultra-deliver` | 1d | |
| 3.6 | `/ultra-status` + `/ultra-think` + `/learn` | 1d | 批量 |

迁完一个，`validate-commands.cjs` 的 `migrated` 计数 +1；Phase 3 gate 要求 9/9 全迁。
