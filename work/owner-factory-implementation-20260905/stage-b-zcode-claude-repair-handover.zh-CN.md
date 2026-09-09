# Stage B ZCode：Claude 路径修复交接（Root REQUEST_CHANGES 后）

实际作者：ZCode（本回合，mission `stage-b-zcode-claude-repair-mission.md`，Root 于
2026-09-06T00:21:46Z 激活）。日期：2026-09-06。中文交接；实现/测试/模型面文案为英文。

## 结论

针对 `stage-b-claude-path-root-review.zh-CN.md` 的两项 P1 与生产资格消费者缺口，通过既有缝隙完成最小修复；全部检查绿；未 commit、未安装、未跑任何真实资格、未写任何 `.ultra` 权威/证据/状态文件（仅新增 `.ultra/.runtime/` 下的原始日志，旧日志与旧 attempt 一律保留未动）。

1. **P1（原生 settings schema）**：`renderClaudeNativePermissionSettings()` 成为生产配置合同
   （`host-profile.cjs`），产出 `permissions.defaultMode: "default"`（已装 adapter 实读
   `settings.permissions.defaultMode`；顶层 `defaultMode` 被移除）+ `permissions.ask: ["*"]`
   （官方全工具 glob，EndConversation 例外——覆盖当前 canonical `Agent`、MCP 与未来工具，
   不删任何工具、无 deny）+ 顶层 `disableAllHooks: true`。kit 不再自渲染，直接复用生产函数。
2. **P1（所哈希 native 路径与实际消费路径可分离）**：`claudeAcpSelection()` 返回
   `{command, args, installed}`；claude profile 新增 `resolveSelection`，`selectExecutionDriver`
   每次启动只做一次 override/registry 解析并贯穿所有消费者（command/argv/identityProbes/
   runtimeFilePath）；选择结果以 `driverSelection.acpSelection` 返回，`delegate.cjs` 构造
   `spec.env` 时以 `profile.delegateEnv(profileOptions, {selection})` 消费同一选择——普通
   registry 更新只能（a）维持原绑定 A 执行（command/argv/probe/env 全为 A），或（b）类型化
   拒绝（binding 消失 → `acp_candidate_invalid`/`acp_candidate_identity_unavailable` 回退）。
   无全局锁、无第二引擎；CLI 路由与无记录路由行为不变。
3. **生产资格消费者（原 mission 缺口）**：registry 健康时 claude profile 声明
   `executionIdentityBindings: ['native_settings', 'claude_sdk_package']`；
   `requiredExecutionIdentity` 对声明这些组件的记录额外要求
   `qualified_identity.native_settings_sha256` 与 `qualified_identity.claude_sdk_package`
   （缺 → `missing_binding` 拒绝——"仅通用四字段"的 claude 正向记录从此不可用）；
   `executionIdentityDrift` 增加两组件的 unobserved/mismatch 判定；选择时
   `observeExecutionIdentity` 在执行根（`selectExecutionDriver` 新增 `cwd`，
   `delegate.cjs` 传入已验证 worktree）用 `claudeNativeSettingsObservation()` 计算
   `.claude/settings.json` + `.claude/settings.local.json` 拼接摘要、用
   `resolveClaudeSdkPackage(adapterPath)` 从 adapter 真实目录按 Node 解析算法取 SDK
   包元数据；`launchExecutionIdentityDrift` 在 `spec.cwd` 重导出两者。kit 复用同一生产
   合同（render、文件清单、composite 摘要、SDK resolver），prepare 绑定
   `claude_native_settings_{files,sha256}`，execute 增加同源漂移行。
   worktree 缺失/变更 native policy、或同 adapter/native 版本内 SDK 包变更，均不继承
   留存正向资格（测试逐项证明）。中性 unavailable/candidate 路径已备：claude 无任何
   enforcement 记录、未预填任何正向事实或猜测哈希；无记录旧式准入不变（fixture-smoke
   全链路真跑通过）。

## 变更点（文件与设计）

- `skills/ultra-delegate/scripts/host-profile.cjs`
  - `claudeAcpSelection` 返回 `installed`（override 路由 best-effort 读一次 registry，坏
    registry 不破坏显式 override）；`renderClaudeNativePermissionSettings` +
    `CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS` 导出；claude `acp` 增加 `resolveSelection`，
    `command/argv/identityProbes/runtimeFilePath` 接受 `selection` 上下文（无 selection 时
    保持原自读，独立调用兼容）；`delegateEnv(options, {selection})` 消费线程化选择；
    `hostProfile` attach 增加 `executionIdentityBindings`；
    `requiredExecutionIdentity`/`executionIdentityDrift` 扩展（host 声明才要求，zcode 既有
    负向记录路径不变）。
- `skills/ultra-delegate/scripts/agent-execution-driver.cjs`
  - 新增 `claudeNativeSettingsObservation(root, relativePaths)`（任一文件缺失/不可读 →
    sha256 null，fail-closed）与 `resolveClaudeSdkPackage(adapterPath)`（name/version/
    package.json sha，不可解析 → null）；`observeExecutionIdentity`/`launchExecutionIdentityDrift`
    扩展；`selectExecutionDriver` 一次性 `resolveSelection`（throw → `acp_candidate_invalid`
    类型化回退，语义不变）+ 贯穿 + `cwd` + 返回 `acpSelection`。
- `skills/ultra-delegate/scripts/delegate.cjs`：`chooseExecutionDriver` 传入 `cwd: worktree`
  （worktree 在选择前已存在并验证）；`spec.env` 由
  `delegateEnv(profileOptions, {selection: driverSelection.acpSelection})` 构造。
- `skills/ultra-delegate/scripts/acp-driver.cjs`：launch 复核向
  `launchExecutionIdentityDrift` 传 `cwd: spec.cwd`。
- `skills/ultra-delegate/SKILL.md`、`references/delegation-contract.md`、
  `docs/RUNTIME-COMPAT-MATRIX.md`：如实补充一次性选择绑定与 claude 正向资格附加绑定语义。
- `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs`：
  删除 kit 本地 `resolveAdapterSdkPackage` 与本地 settings 渲染，改用生产
  `resolveClaudeSdkPackage`/`renderClaudeNativePermissionSettings`/文件清单/composite 观察；
  prepare 写入生产渲染字节并绑定 `claude_native_settings_files/sha256`（保留两份 per-file
  摘要行作诊断）；execute 增加 composite 漂移行；self-check 改验生产 schema
  （`permissions.defaultMode` 嵌套、`ask:["*"]`、无顶层 defaultMode、无 deny、composite
  观察 RED/GREEN）。wrapper/exec 行为不变，不加任何 policy shim。
- `tests/acp-driver.test.cjs`：更新 `claudeAcpSelection` 断言（installed 字段）；新增三个
  测试（生产 settings schema；一次选择绑定 vs registry 更新——原绑定执行/新选择一致为
  B/binding 消失类型化拒绝；qualified claude 记录的 native_settings+SDK 绑定——
  generic-only 拒绝、policy 变更/缺失拒绝、SDK 变更拒绝、launch 复核漂移）；既有
  "qualified claude record byte-binds the registry native file" fixture 补齐新绑定字段
  （测试主旨不变）。

## 测试与自检证据（本回合实际运行；原始输出与精确命令见
`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-claude-repair-command-index.md`）

- RED（先写测试）：`node --test tests/acp-driver.test.cjs` → 54 pass / 4 fail，失败恰为
  四项新期望（见命令索引）。
- GREEN：`UBP_TEST_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs`
  （SHA-256 f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd，与 Root 审阅
  一致）下十套件合跑：**193/193、0 skip、0 fail**（acp-driver 58、acpx-entry、delegate 65、
  skill-authoring、route-contract、package-smoke、v026-adapters、acp-conformance、install、
  ultra-5-journeys）。
- kit `--self-check`：PASS（含生产 schema 与 composite RED/GREEN 段）。
- kit `--profile fixture-smoke` 两阶段真跑（无 provider 调用）：三拒绝维度均
  attempt-and-rejection、`unmediated_completed_execute_sequences` 空、无 env 泄漏、终态
  `permission_denied`。
- kit `--profile claude --prepare-only`（离线，dispatch 前退出）：全部绑定解析成功；新增
  `claude_native_settings_sha256` = `db62bc6ad00fea5f…`（生产渲染字节 composite）、
  `claude_sdk_package` = `@anthropic-ai/claude-agent-sdk@0.3.257:f92d513a…`（SDK
  package.json sha 与上一交接一致）。该 prepared attempt 留作 plumbing 证据，**从未
  dispatch，不是资格 attempt**。
- 未跑全量 `verify:release`（主体修复归 Root 终验）；未做 Skill Creator 插件面验证之外
  的任何发布动作；`tests/skill-authoring` 对改动后 SKILL.md 通过（frontmatter 未动）。

## 精确源绑定（本回合结束时 SHA-256）

- skills/ultra-delegate/scripts/host-profile.cjs
  `b85184c90a6ae56d6c3a90f84fe76971345c5649cacd22a859a2ebb76357ca5b`
- skills/ultra-delegate/scripts/agent-execution-driver.cjs
  `f6fb6b8a8bf158522f29de157125cac4d45f58f86bdb7b5adbb9963d58bcf289`
- skills/ultra-delegate/scripts/delegate.cjs
  `f15ec7a1255eb4e71a8c91e9f1d6d5deca2097484aef8272bbe30e75c419b50b`
- skills/ultra-delegate/scripts/acp-driver.cjs
  `8e5fb511f0b5834d6e1fcef998a6d3e14d64f3c2ae3d0e74ee199fcceb839059`
- skills/ultra-delegate/SKILL.md
  `c4857bf545102746abedc62ee9f19bcde7192c19adad1c1d731321e73007ee1e`
- skills/ultra-delegate/references/delegation-contract.md
  `c6fc807d5d880a2a6ea555fbf78920618767d3a1e3d33ab775d8525ed8e94605`
- docs/RUNTIME-COMPAT-MATRIX.md
  `9c19ace37b54a9f98694a66061e72db01948a46d7ba5f7c9d0587474712a1e72`
- tests/acp-driver.test.cjs
  `a4cdff5e69c5c0ca1febd7afe14f6db58cbff9d26be07f3749317291fbadc039`
- work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs
  `55586266b571929e6b9187a95597992bbbb70b94da04dc5c09ec90c73ac1cfc6`

原始日志索引：`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-claude-repair-command-index.md`
（RED/GREEN/kit/prepare 全部精确命令与日志文件名；最终 SHA 清单在同目录
`stage-b-claude-repair-final-sha256.txt`）。

## Root 复查入口（建议命令）

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
export UBP_TEST_ACPX_ENTRY=/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs
node --test tests/acp-driver.test.cjs tests/acpx-entry.test.cjs tests/delegate.test.cjs \
  tests/skill-authoring.test.cjs tests/route-contract.test.cjs tests/package-smoke.test.cjs \
  tests/v026-adapters.test.cjs tests/acp-conformance.test.cjs tests/install.test.cjs \
  tests/ultra-5-journeys.test.cjs
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --self-check --output /tmp/d1q02-selfcheck-observation.json
```

## 诚实限制与未解决事实

1. **未做真实资格**：本回合零 provider 调用；真实 attempt-and-denial（含首个 tool 与许可
   Write/各独立拒绝探针）仍归 Root 一次单独具名 attempt。配置 JSON 正确、测试绿、prepare
   绑定成功都不替代真实观察。
2. **`ask: ["*"]` 的判定依据**是官方 permissions 文档的全工具 glob（EndConversation 例外）
   与 Root 补查记录；是否足以让本机 native 实际把每个 effect 工具送入 ACP permission
   回调，只能由真实资格观察判定，此处不预设。
3. Linked-worktree `settings.local.json` 解析歧义（官方 v2.1.211+）与 HOME 保留的既有
   限制不变：kit 双文件同字节 + 主 checkout 只读前后观察仍是缓解；native 是否消费隔离
   设置只由观察到的 permission 事件判定。
4. `claude_native_settings_sha256` 绑定的是两文件字节拼接摘要（内容/包元数据范围，非
   node_modules 完整性）；registry 本身仍以 kit 的 `claude_registry_sha256` 行绑定，生产
   选择不锁 registry 文件字节（选择绑定的是其解析结果，registry 更新走 refuse-or-原绑定
   语义，这是本修复的主旨而非遗漏）。
5. 未重取 0.75.1 安装路由的 conformance 回执（compat matrix 既有如实注明不变）。
6. ZCode 原负向记录、r2 拒绝快照、Kimi 静态阻碍结论及全部旧失败事实未动；
   `.ultra/contexts`、`tasks.json`、其他既有未提交改动均为此前轮次遗留，本回合未触碰。
7. 上一作者清理 plumbing 的教训已吸收：本回合新增的 fixture-smoke/claude prepare 运行
   目录与日志全部保留，未做清理；若 Root 复制证据后希望清理，由 Root 决定。
