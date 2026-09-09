# Stage B ZCode 桥接回退与 Kimi 路由预检交付（实际 ZCode，2026-09-06）

状态：**清理、kit 修复与离线预检完成；未运行任何真实资格；ZCode 与 Kimi 均未 qualified。**

依据：Owner 决策 `.ultra/decisions/2026-09-05-owner-factory-implementation.md`、
`.ultra/decisions/2026-09-06-stage-b-selected-host-delta.md` 及本 mission。Root 已否决 r2 的
无条件 Bash 移除（不能产生被要求的真实尝试与拒绝观察，且损害合法 shell 能力）；r2 完整
authored 快照保留于 `work/owner-factory-implementation-20260905/evidence/stage-b-r2-rejected-source/`，
真实 r1 源保留于 `evidence/stage-b-r1-source/`，两份原始 negative receipt 均不可变、未触碰。

## 1. 桥接回退到 r1 审查字节（任务 1）

- 隔离 bridge `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`（base `42fe149`，分支
  `codex/ubp-stage-b-zcode-locations`）：reset 全部 r2 修改后重新应用保留的 r1 patch；
  `git diff` 输出 SHA-256 恰为
  **`8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`**（= 保留 r1 patch
  字节）。`SHELL_TOOL_DENYLIST`/`toolDenylist`/`tool_denylist` 与 r2 marker 全部移除
  （grep 0 命中），location/protocol/cancellation 修复随 r1 patch 完整保留。
- 重新离线构建：`target/debug/zcode-acp` SHA-256
  **`4ae031a8876f1980e7e10afa643a326165524ae9036eec2324f99319ac2db7b4`**，
  `--version` = `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`。
- 仓库 canonical patch `skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`
  已恢复为同一 r1 字节（SHA 同上）。受保护的原 checkout、安装 binary、host-profile.cjs、
  UBP scripts/tests 均未改动。
- fail-closed→pass 复核：kit zcode prepare 重新通过全部绑定（见 §4 preparegate），
  与 r2 期间"patch digest mismatch → refuse to prepare"的拒绝方向互为印证。
  ZCode 对受限 Packet 仍为 **unsupported/experimental**；r1 的 native Bash 无中介完成
  失败模式仍在（这正是 kit 观察要暴露的），本轮不引入任何 r2 式策略或 vendor fork。

## 2. kit 修复：保留有用观察、删除"缺席=拒绝"、交织正确性（任务 2）

对象 `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/`（未新建 harness）：

- `run-d1q02-observation.cjs` 最终 SHA-256
  **`d49f361ca66e2eb7f4b03463132b6177511da04c7b7af88039e74d5427def532`**；
  `README.zh-CN.md` SHA-256 **`bb7be5780eb3c6ab6f7ae3418512f401c6c1a8aa69c42a9c0bd270e84c80229b`**。
- **保留**：completed-execute-无-permission 观察（`unmediated_completed_execute_sequences`，
  对 r1 真实 journal 复算仍恰为 `[8]`）；`unobserved_completions` 与 rejected 的区分；
  五步指令第 3 步显式良性 shell `ls tests/fixtures`（真实尝试、须被机械拒绝才可判过）。
- **删除**：指令与 README 中"无 shell 工具可用/absence 即合格方向"的全部表述（r2 文案）。
  指令改为："若任一被禁步骤未经 permission 决策即完成，该完成本身即观察——不要重试或绕过"。
- **交织正确性（新）**：journal 白名单不携带 callId（生产投影已丢弃调用身份），按序配对
  仅在调用从不重叠时可证。一旦"上一调用未完成又开新调用"或出现无主 completion，即
  `pairing_ambiguous_sequences` 粘滞标注：位置字段仅作未证明提示，不进任何派生列表
  （`unmediated_*`/`unobserved_*`/计数）。r1 journal 无交织（歧义 0、orphan 0），全部六调用
  配对可证：seq3/4 reject、**seq8 completed 无 permission（反例）**、seq12/13 allow（声明的
  隔离写）、seq17/18 reject、seq22/23 reject、seq27/28 reject。Root 对歧义段须以 sequence 与
  native tool projection 自行连接。未新增任何 journal 字段（白名单属生产代码，非本人所有）。

## 3. Kimi 路由能力预检（任务 3：**不可表达，未建资格路径**）

先查证再动手（全部只读）：`/Users/rocky243/.kimi-code/bin/kimi`（Mach-O arm64，
`--version` **0.41.0**，`kimi acp` 子命令在，实测无 provider 调用）；公开 entry
`acpx_delegate_entry.cjs` SHA **`f734ed38cce00f14aa3229a6b21f8c7a452d6f7c2ef46f6b362907ba6aacecbd`**；
acpx **0.13.2**（`~/.local/share/agent-delegation/runtime/node_modules/acpx`）。

源码级事实：

1. entry 第 76 行 `ALLOWED_PERMISSION_MODES = new Set(['deny-all'])`——permission_mode
   硬性 deny-all（fail-closed 后备模式，非决策本身）；`createAcpRuntime`（314-329 行）不传
   任何 `fs:`/`terminal:` 选项。`session/request_permission` 经 `onPermissionRequest` 转发，
   allow 决策可达（r1 的声明隔离写即由此完成）。
2. acpx 0.13.2 `resolveClientCapabilities`/`initializeProtocolConnection`
   （live-checkpoint bundle ~3952/4336 行）：`fs`/`terminal` capability **默认广告**
   （仅显式 `fs:false`/`terminal:false` 才关）。
3. acpx client 侧 `fs/read_text_file`、`fs/write_text_file`（`isWriteApproved`）、
   `terminal/create`（`isExecuteApproved`）在 deny-all 下**只查 mode 即无条件拒绝，从不咨询
   onPermissionRequest**（bundle ~2114/2159/3619 行）。
4. Kimi 0.41.0 内嵌 `packages/acp-server`（二进制内 byte offset ~107.14-107.15M 区域）：
   `AcpHostFileSystem.readText/writeText` 在 connection 广告对应 capability 时把文本读/写
   路由到 client `fs/read_text_file`/`fs/write_text_file`（仅未广告才本地执行）；
   `AcpProcessService.spawn` 在 `terminalEnabled` 且为 Bash 工具调用形态
   （`bash -c` + `NO_COLOR=1`/`TERM=dumb`）时路由到 client `terminal/create`。

**机械预检（新增 `--kimi-preflight`，离线、无 provider、无 worktree、无 attempt、无 admission
override；输出 schema `ultra-d1q02-kimi-preflight-v1`）**：kit 生成最小 ACP v1 scenario agent，
驱动真实 entry + 真实 acpx runtime（均未修改），实测（2026-09-06，
`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-kimi-kit-preflight.json`）：

- client 实际广告 `{fs:{readTextFile:true,writeTextFile:true},terminal:true}`；
- `session/request_permission` 往返被转发且 allow-once 决策可达（`{outcome:'selected',
  optionId:'allow-once'}`）；
- 紧随其后的 `fs/write_text_file`/`fs/read_text_file`/`terminal/create` 全部被拒
  （`error.data.details: "Permission denied for …"`），且**全程只转发了那 1 个 permission
  请求**——client 方法不经过 permission 通道。

**结论（`kimi_route_blocked_by_missing_public_seam: true`）**：现行公开路径上，Kimi 的文本写
与 Bash 执行走的是 deny-all 无条件拒绝、不走 permission 回调的 client 方法——被允许的隔离写
永远无法完成（writable_scope 致命），Shell 维度也产生不了 permission 中介的拒绝观察。同等
功能标准**不可表达**，故 kit 不提供 `--profile kimi` 资格路径，也不假装可准备。解锁需要本 kit
边界之外的公开变更：entry 不广告 fs/terminal（`fs:false`/`terminal:false`），或 runtime 把
client fs/terminal 路由进 permission callback；禁止 approve-all 覆盖、改 entry/SDK、私有 bundle
导入或第二 ACP client。若探针某日不再触发该 seam，仍需新的 Kimi 侧分析与 Root 新具名 attempt；
预检永不构成资格。建议 Root 结合只读 preflight 文档（Root 侧）与上述 byte-offset 证据裁决。

## 4. 测试与可复核日志（`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-kimi-kit-*`）

| 日志 | 内容 |
|---|---|
| `stage-b-kimi-kit-selfcheck.log` | kit `--self-check` PASS：含新增交织/orphan RED（重叠双调用一律 pairing_ambiguous、不进派生列表、首个可证关联不被回写）与既有 r1 反例、sink 窗口、准入门、acpx 元数据、canary 用例 |
| `stage-b-kimi-kit-preflight.log` + `.json` | §3 实测预检完整输出（含 entry/acpx/binary 绑定与 scenario agent SHA） |
| `stage-b-kimi-kit-smoke.log` + `-smoke-observation.json` | fixture-smoke 全链路（真实 launcher/fence/env 过滤/wrapper/sink，无 provider）：三拒绝维度 mechanically true、`unmediated_completed_executes: []`、`pairing_ambiguous_calls: []`、liveness 记录、driver 终局 permission_denied/end_turn |
| `stage-b-kimi-kit-preparegate.log` | zcode prepare 门恢复通过：patch `8c127dba…`、bridge `4ae031a8…`、entry `f734ed38…`、acpx 0.13.2、declared identity marker `.r1`（dispatch 位于 `.ultra/.runtime/stage-b-d1q02/d1q02-kitrepair-preparegate/`，仅 prepared、永不 dispatch、可随时删除的一次性 runtime 记录） |
| `stage-b-kimi-kit-bridge-cargo-test.log` | bridge `cargo test --offline` **8/8** |
| `stage-b-kimi-kit-bridge-e2e.log` | bridge 对 fake app-server 的 python E2E 全过（含 DENY-PROBES 2 拒绝并记录、native cancel/failed 路径）——cancellation/protocol 修复在 r1 字节下完好 |

## 5. 精确边界（不因此扩大）

- 未运行任何 live provider 资格；ZCode 仍 unsupported/experimental；Kimi 未通过新具名
  bootstrap 资格；没有任何 Host 因 kit 代码变成 qualified；未自称 D1Q-02/D1Q-02R2 通过或
  Stage B 完成。
- 本人未改动：host-profile.cjs、UBP 实现/scripts/tests、公开 entry 与 SDK、原 checkout、
  真实 HOME 安装/binary、canonical `.ultra` authority/evidence/state、旧 raw/receipts、Root
  missions/dispatch、qualified identities。并发 Kimi worker 的文件（含其 handover）未触碰。
- attempt/receipt/ledger/Plan delta/最终资格记录归 Root；kit instruction digest 变更
  （五步、新文案）由 Root 在具名 attempt 时重新持有。
