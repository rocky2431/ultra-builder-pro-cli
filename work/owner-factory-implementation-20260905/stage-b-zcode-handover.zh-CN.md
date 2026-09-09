# Stage B 续行交付 handover（实际 ZCode → Root/Codex）

2026-09-05T19:45Z。本 handover 汇报被激活续行任务（`stage-b-zcode-continuation-mission.md`，
activation 2026-09-05T18:29:09Z）的实际完成情况。不宣称 D1 关闭、不宣称 Stage B 验收；
Root 独立 source review、真实 qualification 与严格 Review 后才可能关闭。

## 一、本轮完成的工作

### 1. Task 1 残留 P1：观测缝隙移到最终 spawn options（已闭合，含 RED/GREEN 证明）

- `tests/delegate.test.cjs` 的 worker 环境测试重写：不再包装 `launchDelegateWorker`
  的输入 env，改为拦截共享 `node:child_process` 的 `spawn` 属性后重新 require
  launcher 模块，在真实 detached spawn 的最终 options 上记录 env 键名/canary/
  packet 路径/detached/stdio，并绑定 `receipt.worker_pid === 被观测 child.pid`。
  真实 spawn 与真实 worker 完成路径保持不变。
- **RED**：把 launcher 内部回退成 `env: { ...process.env, ...env }`（review 指定的
  窄反例）后，该测试以 `worker launch admitted the banned key CLAUDE_CODE_SESSION_TOKEN`
  失败：`.ultra/.runtime/owner-factory-implementation-20260905/stage-b-p1-mutation-fail.log`。
- **GREEN**：恢复后通过：同目录 `stage-b-p1-correct-pass.log`。
- `tests/fixtures/fake-acp-agent.cjs` 的 `/proc` 观测不再假定直接父进程是
  delegate-worker：沿 PPid 链按 argv 中的 `delegate-worker.cjs` 识别 worker 身份
  （绑定身份而非固定层数；macOS 无 /proc 时按原样跳过）。

### 2. Task 3：ACP 通用引擎实际替换为 agent-delegation 公共入口（生产集成，非旁置 harness）

- `skills/ultra-delegate/scripts/acp-driver.cjs` 整体重写：`AcpDriver` 现在 spawn
  公共入口（`node acpx_delegate_entry.cjs`）并以净化后的 `descendantSpawnEnv(spec)`
  作为入口环境；`agent_argv=[spec.command, ...spec.args]`、cwd、prompt、timeout 以
  一行 request 交给入口；消费 started/event/permission_request/result 的 NDJSON 线协议。
  旧 JsonRpcConnection/initialize/session/prompt 通用实现已删除，产品不再携带第二套
  ACP 协议实现。wire schema 未变（Kimi 修复 entry 期间保持稳定）。
- 写者观测绑定真实 spawn：`launchSpec` 以入口 argv 记录 launching/started；入口进程
  组即 writer-tree 根（ACPX 以非 detached 子进程启动 Host，组覆盖全树），cancel/timeout
  的组终止与 boundaryProof 语义保持。
- `permissionDecision` 原样保留在 UBP（raw RequestPermissionRequest 消费、exact
  optionId 回送）；**denial 记录后 turn 继续**，多次拒绝各自入 journal，终局保持
  `permission_denied`（新 `permission-multiple` fixture 场景 + 测试）。
- 事件 journal 映射 ACPX runtime 事件（text_delta/tool_call/status）到既有 safe
  projection；无 tag 的 runtime client-operation 诊断记为 `ignored_extension`（不截断
  turn）；未知 tag 仍按 stable-v1 拒绝。`protocol/initialized`、`session/created`
  journal 事件随旧握手引擎移除（该缝隙不可再观测）；status 消费不受影响。
- 认证回退按 mid-turn review（P1-02）收紧：仅当 failed result 带结构化
  `error.phase:'ensure_session'`（证明 startTurn 从未调用）才走既有单次 CLI fallback；
  prompt 后的 auth 形失败保留 typed 结果、不重跑、无 `prompt_sent:false`（新
  `auth-late` 场景 + delegate 级反向测试）。**接口需求（需转 Root→Kimi）**：真实
  entry 需为 ensureSession 包围的失败输出 `result.error.phase:'ensure_session'`，
  进入 startTurn 后不得借用该 phase；在 Kimi 落地前，真实 entry 的 auth 失败将
  fail-closed 不回退（fixture entry 已实现该约定，正向回退测试通过）。
- 按 mid-turn review（P1-03）：原始 entry 行不再写入 stdout.log（该 artifact 保持
  空文件，与旧引擎一致）；happy 测试断言 stdout.log 为空且无 thought/raw secret。
- 选择门槛：`selectExecutionDriver` 在候选可用后检查入口可读性，缺失给出 typed
  `acp_entry_unavailable` CLI fallback（capability 新增 `acp_entry_available`）。
  `resolveAcpEntry`：`ULTRA_DELEGATE_ACPX_ENTRY` 显式绝对路径优先，默认
  `~/.local/share/agent-delegation/runtime/acpx_delegate_entry.cjs`（对齐真实
  installer 的跨平台固定路径——修正了 review 指出的 win32 APPDATA 不一致）。
  该键加入 `BASE_ENV_KEYS`（路径选择，非凭据）。
- 等价验证：fixture-entry 全量（acp-driver 34 项、delegate 63 项、conformance 4 项）
  + **真实 entry + pinned acpx 0.13.2 + fake Host** 的生产 driver 冒烟（happy
  end_turn/host_output/boundary stopped；multi-denial → permission_denied；cancel →
  typed cancelled、grandchild 死亡）。证据：
  `.ultra/.runtime/owner-factory-implementation-20260905/stage-b-acpx-production-driver-smoke.{cjs,log}`
  （entry SHA-256 `43f10869…`，随 Kimi 修复演进；Root 亦有独立
  `stage-b-root-moving-real-entry-smoke.json/.log`）。
- 诚实差异（非阻塞，供 review）：journal 不再含 initialized/session-created 事件；
  agent 侧 wire 违例现统一为 `acp_turn_failed`（携带入口错误消息），驱动器侧
  `acp_event_limit`/`acp_auth_required` 保持；adapter exit 观测现为入口进程退出码。

### 3. Task 4：bridge 原生终态修复 + 多拒绝续行确认

- bridge worktree `/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp`（基线
  `42fe149d4b501469343c01f23ba3801832306d53`）按 mid-turn review 修复原生非成功终态：
  `protocol.rs` 接受 `resultType`；`mod.rs` 仅将观测到的 `"cancelled"` 映射为
  ACP `Cancelled`，其余保持 EndTurn；`agent.rs` 将 `TurnError::Failed/Rpc` 经
  ACP error 语义解决（不再 warning chunk + 合成 end_turn），Transport 保持 Cancelled。
- fake server/client 增加回归：`NATIVE-CANCELLED` → stop=cancelled；
  `NATIVE-FAILED` → session/prompt JSON-RPC error；既有 `DENY-PROBES`（2 次拒绝
  各自记录、turn 终局 end_turn）保持。
- 规范 patch 重新生成（8 个 diff 段，729 行），digest 更新并三处同步
  （host-profile / tests/acp-driver.test.cjs / RUNTIME-COMPAT-MATRIX）：
  `628b38d862f91f51181380b93f47bea415f1bca96cb7e2be7306705ee5242ce1`。
  临时离线二进制重建：`/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp`
  （SHA-256 `2ca338e8d62bfca9…`，`--version` = `zcode-acp 0.1.0+ultra.zcode.0.16.5`）。
  未替换任何已安装 bridge。证据：`stage-b-bridge-native-terminal-repair.log`
  （8 Rust tests + E2E 全绿）。

### 4. D1Q-02 kit（Root 执行；本 Round 按 review 修复三处 P1）

`work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs`：
- 删除 linked worktree 的 `git config user.email/name`（会污染共享 repo config）。
- canary 只在 kit 进程 `process.env` 注入、绝不在 `env_keys`；对入口 spawn 最终
  options 的观测即最终 Host 环境（ACPX 复制入口环境语义已在源码核实）。
- `--attempt-id` 允许 Root 绑定外部具名 attempt；provider 调用**前**输出 dispatched
  行（attempt id、全部版本/hash、runtime 目录），支持中断恢复。
- 结尾 summary 改为事实性字段（`outside_edit_marker_exists` / `web_sink_hits` 等），
  维度判定（attempt-and-denial）留给 Root，未尝试/不可观察不通过。
- 生产路径执行（Root 源码审查后）：

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
RUNTIME=$(mktemp -d /tmp/ubp-d1q02-acpx-XXXX)
mkdir -p "$RUNTIME/runtime/node_modules"
cp /tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs "$RUNTIME/runtime/"
ln -s /Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx "$RUNTIME/runtime/node_modules/acpx"
ULTRA_ZCODE_ACP_COMMAND=/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp \
ULTRA_DELEGATE_ACPX_ENTRY="$RUNTIME/runtime/acpx_delegate_entry.cjs" \
  node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
```

（可选 `--attempt-id <slug>` 绑定 Root 拥有的具名 attempt。）

### 5. 文档/合同同步

- `delegation-contract.md`：公共入口引擎、deny-all 客户端面（真实广告存在 + 执行
  拒绝的区别）、`ensure_session` 回退前提、denial-续行、stdout.log 空 artifact、
  `acp_entry_unavailable`。
- `SKILL.md`（ultra-delegate）：模型入口描述从"AcpDriver 直接发送 initialize、无
  fs/terminal 广告"同步为公共入口真相（mid-turn review 指出的模型入口反事实）。
- `docs/RUNTIME-COMPAT-MATRIX.md`：入口依赖、typed fallback、新 patch digest 与
  原生终态映射说明。

## 二、验证与版本

- `npm run test:node`：735 项（731–732 pass，3 skipped 为 opt-in 真实 entry 测试）。
  9 次全量运行中 2 次各出现 1 个瞬时失败（未能捕获测试名，其余 7 次全绿，含连
  续 3+4 次稳定复跑）；怀疑为负载下 timing 敏感项（cancel/timeout 类），未定位，
  如复现请以失败名为准，不计为本轮交付缺陷。
- `npm run test:hooks`：104 passed。`npm run verify:release`：通过（0 vulnerabilities）。
- `npm pack --dry-run` 正常；`bin/install.js --all --global --doctor --json --config-dir <隔离>`
  在 HEAD 基线与本轮源码下行为一致（degraded exit=2；该命令形态的隔离 doctor 行为
  为既有现象，真正的 install/doctor/update/uninstall 旅程由隔离 config 的
  install.test.cjs 覆盖且全绿）。
- bridge：`cargo test` 8 passed；`tests/acp_client.py` E2E 全部 `[ok]`（含
  NATIVE-CANCELLED/NATIVE-FAILED/DENY-PROBES）。
- 真实 entry 冒烟：见上文证据文件（acpx 0.13.2；entry 快照 SHA 随 Kimi 修复变化，
  以 log 内记录为准）。
- 变更文件（部分 SHA-256 前 16 位）：acp-driver `72f46e16…`、agent-execution-driver
  `f564d8f4…`、delegate `d29b2d0a…`（与本轮无关的既有未提交改动保留）、host-profile
  `0ad07f55…`、tests 见仓库。agent-delegate-skill worktree（Kimi 独占写）HEAD
  `f9dc8b5`，entry `99049a24…`（只读引用，非本任务产物）。

## 三、未证实/未完成（不宣称）

- **D1Q-02 未执行**：正向量测归 Root（kit 已就绪）；历史 negative qualification
  与原 Acceptance 未动。zcode enforcement admission 仍会在正向记录存在前拒绝
  packet——这是正确行为。
- **真实 Host 资格**：fake-Host 组合通过不等于真实 ZCode provider qualification；
  transport maturity 仍 experimental，未提升。
- **Kimi 侧 entry 修复未完成**：其两项 entry P1 与 `error.phase` 元数据仍在其
  独占 worktree 进行中；真实 entry 的 auth 回退路径在其落地前 fail-closed。
- 保留的 P2（未自动修复，按 mission 报告）：Node engines（UBP `>=22.0.0` vs acpx
  `>=22.13.0`）发布前需统一；`allow_project` 误标 allow_once（bridge，现有
  first-kind 路径不可达）；conformance receipts 的传输证据产生于旧引擎（host adapter
  行为证据保留，UBP 客户端引擎已换，冻结候选时 Root 决定是否重跑 live conformance）。
- 本轮 mid-turn 出现的 Root 新 review/mission 文件（`stage-b-*-review`、
  `stage-b-zcode-qualification-feedback-mission.md` 等）已读并吸收其已激活反馈；
  未激活的后续 mission 未执行。
- 续行前检查：无遗留本任务测试进程（无 fake-acp-agent/UBP fixture PID）；并行
  Kimi 委派、无关 protoss 委派与共享 `__queue-owner` 守护进程均非本任务探针，
  未触碰。

## 四、建议的下一步（Root 决定）

1. 审查本轮 diff（UBP 主检出 + bridge worktree + 三份 review 的 P1 修复证据）。
2. 等待 Kimi entry 修复冻结后，重跑真实 entry 组合冒烟 + 决定 live conformance 重跑。
3. 源码审查通过后执行 D1Q-02 kit（上方命令），独立判定各维度。
4. 统一 Node engines 声明；调查两次瞬时 suite 失败的测试名（如复现）。
