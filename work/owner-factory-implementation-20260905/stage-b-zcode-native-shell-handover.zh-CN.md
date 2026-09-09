# Stage B native Shell 越权修复交付（实际 ZCode，2026-09-06）

状态：**实现、回归与本地验证完成；等待 Root 源码审查与具名 r2 真实资格。本修复不自称 D1Q-02 已通过。**

## 根因（只读证据，App-bundled ZCode 0.16.5 `zcode.cjs` SHA256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`）

r1（`d1q02-r1-20260905t220538-5d954643`）events seq 8/9：native Bash `ls tests/fixtures`
execute→completed，其间无任何 `interaction/requestPermission`。链路（bundle 内
`PermissionService.checkPermission`，逐段提取）：

1. 默认 `permission.mode = "build"`（bridge 此前 `session/create` 不带 mode）；
2. `checkBuildMode`：`readOnly && !destructive && !needsApproval → allow`（ruleId
   `mode.build.readOnly`），不产生任何 permission 请求；
3. native 安全命令表含 `["ls",{allowAnyArgs:!0}]` → `ls tests/fixtures` 判为只读 → 自动放行；
   `rtk ls` 因 `rtk` 不在表中而非只读 → ask（seq 3-5 如实被拒）；
4. 决策顺序：yolo→全放行；auto→全拒（未实现）；config `disallowedTools`→拒；
   **project deny→拒；project ask→ask（先于一切 mode 判定）**；plan→只读放行其余拒；
   edit→edit 放行其余按 build。

## 为什么不是其它方案（原生接口表达力结论）

- `session/create`（`.strict()`）可用 per-session 字段只有 `mode∈{plan,build,edit,yolo,auto}`、
  `toolAllowlist`、`toolDenylist`；无任何字段能强制"Bash 一律 ask"。plan 与 build 都自动放行
  只读工具；runtime preferences（`MEt` schema）无权限字段；app-server 启动参数无权限项。
- project ask 规则（`rule.project.ask`）虽先于 build 自动放行，但只存在于持久 session DB
  （`getProjectPermission`/`saveProjectPermission`），经 permission 响应 `addRules` 注入既写真实
  `~/.zcode` DB、又无法覆盖会话**第一次** Bash 调用（时序洞），不能确定性闭合。
- PreToolUse hook 走 workspace 文件 + trust 授权，非 per-session 协议，且 kit 侧被禁止新增
  bootstrap/权限替代。
- `toolDenylist`（create 与 resume 均支持）是唯一确定性 per-session 原生策略：builtin 注册
  （`BL`）直接跳过该工具，模型根本拿不到 Bash；subagent 子进程继承
  `toolDisallowlist`，连带封死子代理 shell。node REPL（`js`）默认 `runtimeFeatures.nodeRepl`
  关闭，不在注册面。

## 修复内容（bridge checkout `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`，base `42fe149`）

- `src/zcode/protocol.rs`：`CreateSessionParams` 增加 `tool_denylist`（camelCase
  `toolDenylist`，空则不序列化）。
- `src/zcode/mod.rs`：`ZcodeSession::start/resume` 透传 denylist；resume params 注入
  `toolDenylist`。
- `src/agent.rs`：`SHELL_TOOL_DENYLIST = ["Bash"]`（含上述根因与限制注释），
  `new_session`/`load_session` 均应用。
- `Cargo.toml`/`Cargo.lock`：marker 升为 **`zcode-acp 0.1.0+ultra.zcode.0.16.5.r2`**。
- 测试（同一 fake seam，未引入第二 harness）：`tests/fake-app-server.cjs` 记录
  create/resume 实收 denylist、实现 `session/resume`（缺 `Bash` 即 -32602 拒绝）、新增
  `SHELL-POLICY` 场景原样回放；`tests/acp_client.py` 新增 3e/3f 断言。

**如实限制**：修复后 ACP host 无法经此 bridge 授予 shell（没有 allow_once 路径）；shell 语义
从"点用拒绝"变为"会话级不可用"。这是原生接口表达力所限的最小可行替代，非 point-of-use 中介。
其它工具（edit/fetch 等）保持原生 ask，host packet 逐次裁决不变（r1 seq 12-14/17-19/27-29 已证）。

## 回归与本地验证（可复核日志）

- RED（修复前行为）：`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-shell-repair-e2e-red.log`
  —— bridge 不发 denylist 时 `AssertionError: session/create carried no Bash toolDenylist`。
- GREEN：`stage-b-shell-repair-e2e-green.log` —— 9 项全过，含
  `SHELL-POLICY (new) -> session/create toolDenylist=['Bash']` 与 resumed 拒绝契约。
- `cargo test --offline` 8/8（`stage-b-shell-repair-cargo-test.log`）；clippy 0 告警。
- 离线原生 API 探针（无 provider 调用）：`stage-b-shell-repair-native-create-probe.{cjs,log}`
  —— 真实 app-server 接受 `toolDenylist:["Bash"]`（返回 `sess_955c8f9…`），未知字段被
  -32602 拒（证明 schema `.strict()`，接受是有意义的）；create 后即 close。
- kit self-check：`stage-b-shell-repair-kit-selfcheck.log` PASS（含新增 r1 反例 RED/GREEN）。
- kit fixture-smoke 全链路（五步指令新 digest `e674634e…`）：
  `stage-b-shell-repair-smoke.log` —— `unmediated_completed_executes: []`、三拒绝维度仍真。

## D1Q-02 kit 观察增强（`work/owner-factory-implementation-20260905/stage-b-d1q02-kit/`）

- `run-d1q02-observation.cjs`：新增 `deriveToolCallAssociations`——把 journal 每个 tool call 与
  其 completion 及其前的 permission 决策逐项关联；`unmediated_completed_execute_sequences`
  暴露"completed 且无 permission"的 execute；`unobserved_completions` 显式区分"未观察到完成"与
  "被拒绝"；只用保留安全 journal 的既有白名单字段，不携带工具原始输入/输出。对 r1 真实 journal
  复算结果恰为 `[8]`，其余五个调用全部正确 mediated。观察随 `tool_call_observations` 入档并在
  stdout 摘要输出。
- 指令改为五步：新增第 3 步显式只读 shell `ls tests/fixtures`（r2 起生效；修复后应观察为"无
  shell 工具"，回归时将以 unmediated completed execute 现形）。**确切 digest 与具名 attempt 由
  Root 持有**；本 kit 不自批资格。
- `README.zh-CN.md` 同步记录关联观察、五步指令与 self-check 新 RED 用例。

## 供 Root 转移的身份事实（host-profile.cjs 本人不改——Kimi 所有）

- patch：`skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`
  SHA256 `603064df4171966ac557129832f4f7423921875434c86cd2112bed05f3f88772`（r1 为
  `8c127dba…`；对 base `42fe149` 的完整真实 diff，含此前 Stage B 已有改动 + 本修复）。
- bridge 二进制 `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp`
  SHA256 `b187f64dbefaa6530b51c42d61869f526d9562b94568c71e1b627966459bb129`；
  `--version` = `zcode-acp 0.1.0+ultra.zcode.0.16.5.r2`。
- 源 SHA256：`agent.rs` `fa1f927d…`、`zcode/mod.rs` `9d38231d…`、`zcode/protocol.rs`
  `0f57a152…`、kit `run-d1q02-observation.cjs` `3081b003…`。
- **连锁（fail-closed 已验证）**：host-profile 仍声明 r1 patch SHA 时，zcode profile prepare
  即拒（`stage-b-shell-repair-preparecheck` 输出：`canonical patch digest mismatch … refuse to
  prepare`，无任何 runtime 副作用）。Kimi/Root 更新 host-profile 的 patch SHA 与
  candidateIdentity 后方可 prepare r2。

## 邻接事实（如实保留，不属本修复范围）

- bridge `session/load` 生成新内部 ACP sessionId 而 ACP v1 `LoadSessionResponse` 无回传字段，
  恢复会话客户端不可寻址——既有缺陷，未修（超出 shell 根因）。
- initialize 仍把默认 mode 广告为 `yolo`（实际从不转发给 native）；denylist 在任何 mode 下都
  先于注册生效，不构成旁路，但广告语义失真。
- native `isPreapprovedWebFetchRequest` 对预批 URL 自动放行 WebFetch（只读网络），与 r1 网络
  维度（loopback 被拒）无冲突，未在本轮处理。
