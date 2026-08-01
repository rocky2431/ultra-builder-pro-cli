# Ultra Builder Pro v0.26 — 仅剩外部验收

> 状态：**本地产品改造与 package 验收完成；真实双宿主模型续接未完成。**
> 最后更新：2026-08-01
> 基线：`3f99189bc68697262cd90444685ac2d4857139c4` 之上的未提交工作区。
> 删除条件：完成 §3 的真实 Claude → Codex 续接，把结果写入正式交付证据。

本文不再复制稳定产品契约。当前权威分别是：

- 产品与边界：`docs/ARCHITECTURE.md`
- 文件权威：`docs/ARTIFACT-AUTHORITY.md`
- 工作流：`docs/WORKFLOW-LIFECYCLE.md`
- 安装隔离：`docs/PLUGIN-ISOLATION-CONTRACT.md`
- 五宿主矩阵：`docs/RUNTIME-COMPAT-MATRIX.md`
- 当前项目状态：`.ultra/tasks.json`、task contexts、evidence 与
  `.ultra/test-report.json`

## 1. 已完成的本地产品边界

- 14 个 Skill：8 个 owner-invoked、5 个 model-invoked、1 个 router。
- 5 个 Hook：session context、mid-workflow recall、compact snapshot、post-edit
  observation、exact-command dangerous-effect guard。
- 原 10 个 custom Agent 不再安装为 `agents/` 投影；六个 review lens 进入
  `ultra-review/references/`，review coordination 归 parent Skill，debugger 与
  test runner 分别进入 `ultra-dev`、`ultra-tdd`。
- 删除 MCP server、SQLite authority、daemon、orchestrator、commands projection
  与旧 semantic workflow state machine；恢复只依赖 owner-readable files 与 Git。
- `.ultra-template/` 是唯一项目骨架，随 `ultra-init` Skill asset 分发；初始化只补
  missing files，不覆盖已有权威。
- 当前仓库自身已迁移到 `.ultra/tasks.json`、一 task 一 context、一 completed task
  一 evidence record、一个 current test report；旧 `.ultra/tasks/`、report templates、
  research projection 与 `state.db` authority 已退出 current layout。
- `ubp delegate` 支持 read-only 与 bounded-write 两种模式。instruction、permission、
  output schema、Git worktree 和 receipt 均有 digest 或机械校验；模型只返回 native
  structured output，父进程验证实际 Git diff 后原子发布 terminal receipt。
- Claude、Codex、OpenCode、Kimi、Grok 均有 managed install、Doctor、reinstall、
  rollback 和 ownership-safe uninstall。全新隔离根卸载后零残留；安装前已有的空
  Codex marketplace 与 Kimi registry 会保留。

## 2. 当前验证证据

2026-08-01 在当前工作区真实执行：

| 命令或验收 | 结果 |
|---|---|
| 14 次 Skill Creator `quick_validate.py` | 14/14 valid |
| Plugin Creator `validate_plugin.py <generated-codex-plugin>` | pass |
| `npm run verify:release` | exit 0；Node 106 pass / 0 fail；Hooks 8 pass；audit 0 vulnerabilities |
| `npm pack --dry-run --json` | exit 0；exact inventory 见 `.ultra/test-report.json`；无 MCP、DB、orchestrator、commands 或 agents projection |
| isolated `--all` install → Doctor → reinstall → uninstall | 5/5 healthy；Codex Hook 为 `user_review_required`；config 与 fake HOME 均 0 children |
| `node bin/install.js --all --global --doctor --json` | exit 2；只读确认真实 HOME 尚未升级 v0.26 |

真实 HOME Doctor 的事实是：

- Claude、OpenCode、Kimi、Grok 仍为 v0.25.1，因此按 v0.26 inventory 检查为 degraded；
- Codex 没有当前 v0.26 managed plugin / marketplace registration；
- 本次没有安装、修复或删除真实 HOME 的任何文件。

这组结果证明 package 和隔离安装路径已完成，不证明真实 HOME 已升级。真实安装是
独立 external effect，仍需 owner 明确授权。

## 3. 唯一未完成项：认证模型的跨宿主续接

此前已在独立 Git 测试仓与独立 Claude/Codex HOME 中安装并发现 v0.26 plugin，随后
尝试真实模型调用：

1. Claude 2.1.220 返回 `Not logged in · Please run /login`，exit 1，费用与 token 为 0；
2. Codex 0.144.4 的 WebSocket 与 HTTPS 均返回
   `401 Unauthorized: Missing bearer or basic authentication in header`，exit 1；
3. 两次失败后测试仓仍在 seed HEAD，worktree 无写入。

因此尚不能声称“Claude 开始一个真实 task，Codex 只靠 Git 和 `.ultra/` 继续并完成”
已经被认证 provider 实证。源码侧的 packet、host argv、permission、process、Git diff、
timeout、cancel 和 receipt 已由确定性 host fixture 覆盖；provider 输出质量和认证行为不
能由 fixture 代替。

完成此项需要 owner 单独授权以下最小动作之一：

- 在两个隔离 HOME 中分别登录；或
- 允许 session-only plugin 使用现有认证，并为两次模型调用设定费用上限。

随后只做一个 seed task：Claude 写 failing test 与 Resume Note 后停止；Codex 在同一
registered worktree 中读取 Git 与 `.ultra/`，完成实现、证据和双状态更新；最后核对
task/context 双写、spec trace、实际 diff、tests 与两端日志。

## 4. 仍需分别授权的外部效果

- 把 v0.26 安装到真实五宿主 HOME；
- authenticated provider drill；
- commit、push、tag、npm publish 或 GitHub Release。

这些项目不是未实现源码，也不会从“本地已完成”自动获得权限。除上述外，本 WIP 不再
保留本地实现 TODO。
