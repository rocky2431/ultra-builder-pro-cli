---
name: ultra-init
description: "Initialize Ultra Builder Pro project: detect context, confirm with user, scaffold .ultra/ via task.init_project, set up git."
runtime: all
mcp_tools_required:
  - task.init_project
cli_fallback: "task init-project"
---

# ultra-init — Phase 3.1

把当前工作目录（或 `--target-dir`）初始化为一个 Ultra Builder Pro 项目：拉起
`.ultra/` 骨架、写入 `tasks.json` 元数据、按需配 git。

真实的目录搭建 + 模板拷贝 + tasks.json 注入统一由 **MCP tool `task.init_project`** 完成；
MCP 不可达时回退 `ultra-tools task init-project`。

## 设计要点（对比 pre-Phase-3 行为）

- **无 Claude 独占依赖**：`task.init_project` + `ultra-tools init-project` 两条路径
  都不调 Claude 原生工具，4 个 runtime 都能走通。
- **模板内置**：`.ultra/` 骨架来自仓内 `templates/.ultra/`；不再依赖 `~/.claude/.ultra-template/`。
- **幂等**：二次 init 默认拒绝，`--overwrite` 才会备份旧 `.ultra/` 为
  `.ultra.backup.<ts>` 后重建。

## Workflow

### Step 0: 状态检测（skill 调用方做）

在调 `task.init_project` 之前，调用方（Claude / CLI / SDK）需要先判断：

- `target_dir/.ultra/` 是否已存在 → 决定是否需要 `overwrite=true`
- `target_dir/.git/` 是否已存在 → 影响 Step 3 的分支
- 读 `package.json` / `Cargo.toml` / `pyproject.toml` / `go.mod` 推断项目类型和栈
- 如果调用方是 Claude，可在此用 `TaskCreate` 跟踪 Step 0–4 的 session 内进度
  （这是 runtime 的 session-local 跟踪，不走 MCP）

### Step 1: 补全参数

入参不足时补：

| 字段 | 缺省 |
|------|------|
| `project_name` | 当前目录名（`path.basename(target_dir)`） |
| `project_type` | Step 0 识别结果；多技术栈 → `fullstack` |
| `stack` | Step 0 识别到的依赖（逗号分隔多值，如 `react,express,postgres`） |
| `git_init` | `.git/` 不存在 → 询问用户 |

### Step 1.5: 交互确认（仅当检测到模糊或重入）

触发条件：
- `target_dir/.ultra/` 已存在（重入）
- 识别到多项目类型（Web + API）
- 显式 `--interactive` 标志

交互渠道：
- **Claude runtime**：调 `AskUserQuestion`（原生）
- **其他 runtime**：调 `ultra-tools ask --question ... --options ...`（Phase 3.7 实装；
  在那之前使用 runtime 的原生菜单或回退到命令行参数）

确认 4 个问题：
1. 项目类型（可多选，`detected` 标签打在识别项）
2. 技术栈（可多选）
3. 已有 `.git/` → 保留 / 重置备份 / 不用 git
4. 已有 `.ultra/` → 覆盖（备份） / 保留 / 取消

### Step 2: 调 `task.init_project` 拉起骨架

**MCP 主路径**：
```jsonc
// call: task.init_project
{
  "target_dir": "/abs/path/to/project",
  "project_name": "my-app",
  "project_type": "fullstack",
  "stack": "react,express,postgres",
  "overwrite": false
}
// response
{
  "created_path": "/abs/path/to/project/.ultra",
  "status": "created",
  "copied_files": [
    "specs/discovery.md", "specs/product.md", "specs/architecture.md",
    "tasks/tasks.json", "tasks/contexts/TEMPLATE.md",
    "docs/research/README.md",
    "test-report.json", "delivery-report.json"
  ]
}
```

**CLI 回退路径**（`UBP_MCP=off` 或 MCP 调用返回网络错）：
```bash
ultra-tools task init-project \
  --target-dir "$TARGET" \
  --project-name "$NAME" \
  --project-type "$TYPE" \
  --stack "$STACK" \
  $([ "$OVERWRITE" = "1" ] && echo --overwrite)
```
CLI 最后一行是 `{ "ok": true, "data": { ... } }`（见 spec/cli-protocol.md §2）。

**错误处理**：
- `ULTRA_DIR_EXISTS` → Step 1.5 重新询问是否 overwrite
- `TEMPLATE_MISSING` → 致命；提示检查 `templates/.ultra/` 是否被 gitignore 吞了
- `TARGET_NOT_DIR` / `VALIDATION_ERROR` → 返回调用方，修参数
- `IO_ERROR` → retriable=true；最多重试 2 次

### Step 3: Git 集成

根据 Step 1.5 结果：

- **初始化新仓**：`git init` + 写 `.gitignore`（排除 `.ultra/backups/`、`node_modules/`、
  敏感文件等项目通用规则）+ 写基础 `README.md`（若不存在）。
- **保留现有 `.git/`**：仅追加 `.gitignore` 里的 `.ultra/backups/` 一行（若缺失）。
- **不用 git**：跳过。

提示建议第一个 commit：`git add . && git commit -m "feat: initialize Ultra Builder Pro"`，
但不代为执行（commit 是用户决策）。

### Step 4: 成功总结 + 下一步

用中文输出：
- ✅ `.ultra/` 骨架（specs / tasks / docs / reports）
- ✅ tasks.json 注入元数据（name / type / stack / created / updated）
- ✅ git 状态（按选择）
- ⚠️ **下一步**：跑 `/ultra-research` 做 17 步 discovery 填 spec；不要跳过直接 `/ultra-plan`

## 调用方式（按 runtime）

| Runtime | 调用形态 |
|---------|----------|
| Claude  | `/ultra-init [name] [type] [stack] [git]` — 命令薄壳拉起此 skill |
| OpenCode | `/ultra-init …` 同上（agent frontmatter 小写化） |
| Codex   | `codex exec "run /ultra-init …"`（Phase 4.4 adapter 接） |
| Gemini  | `gemini --prompt "run /ultra-init …"`（Phase 4.5 extension 接） |

## 输出锚点

- `target_dir/.ultra/tasks/tasks.json` — project.name / project.type / project.stack 已注入
- `target_dir/.ultra/specs/{discovery,product,architecture}.md` — 带 `[NEEDS CLARIFICATION]` 标记
- 若 `overwrite=true`：`target_dir/.ultra.backup.<ts>/` 保存旧骨架

## 不做的事

- **不**创建业务 task（业务 task 由 `/ultra-plan` 在 spec 填完后批量创建）
- **不**写入 state.db（state.db 由第一次 MCP 写操作或显式 `ultra-tools db init` 触发）
- **不**调 web：离线可执行
