# Stage B D1Q-02 真实正向资格观察 kit（Root 执行，两阶段）

本目录只准备资格观察；不构成授权、不代替 Codex 的独立审查与 attempt/receipt/ledger 记录。
历史 negative qualification（`d1q-61ca5157911e4f61866cff5452bc942d`，writable_scope unsupported、
其余维度 unobserved/unsupported）保持原样，不得改写。绿色 harness 或干净 packet 本身不是 D1 验收。

## 生产路径与唯一 override

kit 驱动**真实 launcher**（`skills/ultra-delegate/scripts/delegate.cjs run()`）：真实环境过滤
（`descendantEnvViews`）、真实 fence、真实 worker-spec digest、真实 detached delegate-worker
spawn、入口式 ACP driver、`permissionDecision`、boundaryProof 与 typed result 全部是被测生产代码。
唯一 override：解析的 zcode host profile 中**删除 enforcement qualification 记录**——正向记录尚
不存在，admission 会正确拒绝 packet；该 override 明确记录在 dispatch/observation 中，不复检。

最终 Host 进程边界环境由 wrapper 观测：kit 把 `ULTRA_ZCODE_ACP_COMMAND` 指向生成的
`host-boundary-wrapper.sh`，后者在 exec 真实 bridge 前用 `env | cut -d= -f1 | sort` 直接枚举
**键名**（绝不保留值），观察点是入口把环境复制给 Host 的实际进程边界，不是任何手工过滤的 env
对象。合成 canary 只注入隔离的 kit 协调进程 `process.env`，过滤由生产 launcher 完成；全部保留
artifact（delegation 目录全部文件 + dispatch/wrapper/env dump/agent-config，不止 events）都会
扫描 canary 值与键名。

## 观察窗口（sink 生命周期）

`delegate.cjs run()` 在 detached Worker 完成**之前**返回 launch receipt。因此 loopback sink 在
整个 Worker 窗口内保持服务：execute 全程不在 launcher 调用的 finally 里关 sink，result 等待是
事件循环友好的有界等待（不再是同步 `Atomics.wait`），sink 只在终态观察完成或早期错误路径
unwind 时由统一 finally 关闭。窗口内协调进程向 `…/coordinator-liveness` 发一次自身 liveness
请求并被 sink 记录——与 Worker probe 命中（`…/probe`）严格分列；liveness 未被记录则拒绝产出
观察。Worker 的 fetch 命中是效果事实，0 命中只是 absence 事实，二者都不是拒绝证明。

## 两阶段执行（prepare → execute）

- `--prepare-only`：先核验 profile 输入（失败不产生任何 worktree 副作用），再建隔离 git
  worktree（当前 HEAD；不写任何 git 身份配置——linked worktree 共享 repo config）、delegation
  scaffold、以及**持久** `dispatch.json`：外部绑定 `--attempt-id`、有限 `timeout_seconds`、
  instruction/permission 精确 SHA-256、`result_schema`（`ultra-delegation-result-v1`）与指令内嵌
  result 模板 digest、六份 UBP 执行源文件 digest（delegate/delegate-worker/agent-execution-driver/
  acp-driver/cli-driver/host-profile）、经 canonical `resolveAcpEntry` 解析的公开 ACPX entry 及其
  实际加载的 acpx 包元数据（`dirname(entry)/node_modules/acpx` 的 name/version/package.json
  digest/realpath）、真实 bridge、App-bundled native CLI、canonical patch（profile 声明 digest 与
  文件实际 digest 不一致即拒绝 prepare）、以及从**当前 live profile** 读取的 declared candidate
  identity（并行的 build-identity 修复落在哪里，prepare 就绑定哪里；绝不硬编码旧 marker）。
  zcode profile 另外先在**任何副作用之前**拒绝 truthy `UBP_DELEGATE_ZCODE_BIN`（生产
  `selectedBinary` 会用它覆盖绑定的 App-bundled CLI），并记录 null 绑定供 execute 复核。
  provider 调用之前退出。同一 attempt id 已有 dispatch 记录时拒绝重新 prepare。
- Root 以该 attempt id 记录具名 attempt 后 `--execute`：先过准入门——状态必须恰为 `prepared`
  （`dispatched`/`observed`/未知 attempt 永不成为第二个未消费运行）；显式传入且与 prepared 值不同
  的 `--timeout-seconds` 拒绝（prepared timeout 不可静默重置；重述相同值可接受）。随后逐项核对
  全部绑定（任何漂移硬拒绝、要求新 attempt id——含 prepare→execute 之间新引入的
  `UBP_DELEGATE_ZCODE_BIN`；loopback 占位 URL 的确定性一次性替换在 dispatch 前记录，保留替换前后
  两个精确 instruction digest，且不豁免其他核对），在 metered provider 调用**之前**把 dispatch
  置为 `dispatched` 并持久化——崩溃后可从 durable 记录恢复。生命周期
  `prepared → dispatched → observed` 只是记录，不是第二个状态机。

## Root 执行命令（源码审查后）

```bash
cd "/Users/rocky243/Context Engineering/ultra-builder-pro-cli"
RUNTIME=$(mktemp -d /tmp/ubp-d1q02-acpx-XXXX)
mkdir -p "$RUNTIME/runtime/node_modules"
cp /tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs "$RUNTIME/runtime/"
ln -s /Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx "$RUNTIME/runtime/node_modules/acpx"
export UBP_D1Q02_REAL_BRIDGE=/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp
export ULTRA_DELEGATE_ACPX_ENTRY="$RUNTIME/runtime/acpx_delegate_entry.cjs"
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --prepare-only --attempt-id d1q02-<slug> \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
# …Root 记录具名 attempt…
node work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs \
  --execute --attempt-id d1q02-<slug> \
  --output .ultra/.runtime/owner-factory-implementation-20260905/stage-b-d1q02-observation.json
```

说明：

- 已核对的公开 runtime 事实（2026-09-06）：entry 源 SHA-256
  `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`（其 worktree HEAD
  `0f456a0839cddeec7add09c09b4e10f202cc08ee`，runtime package 0.3.0）；链接的 acpx 包实际解析为
  **0.13.2**。kit 在 prepare 时重新解析并绑定这些值，不依赖本 README 的转述。
- **`$RUNTIME` 目录必须在 prepare 与 execute 之间保持不变**：entry 路径本身被绑定，换一个
  mktemp 目录即路径漂移，execute 会拒绝。prepare 与 execute 使用同一 `--attempt-id`、同一
  `--output`、相同环境变量；execute 不要另传 `--timeout-seconds`（prepared 值不可重置；重述
  相同值可接受）。
- bridge 与 profile 的 build identity 由 kit 在 prepare 时从当前文件与 live profile 实际读取
  （本次观察到临时修复 binary 报告 `zcode-acp 0.1.0+ultra.zcode.0.16.5.r1`，SHA-256 `ebc2932b…`，
  与仍安装的旧构建不同）；若 prepare→execute 之间 identity 再变，execute 按漂移拒绝，Root 重新
  prepare 即可。不要硬编码任何 marker。
- **native CLI 选择绑定**：生产 `delegate.cjs selectedBinary` 会采用 `UBP_DELEGATE_ZCODE_BIN`
  override；本资格固定于 App-bundled CLI，因此 truthy override 在 prepare 任何副作用之前即被拒，
  并以 null 绑定记录——prepare→execute 之间引入该 override 会在 dispatch 前按漂移拒绝。空串等价
  于生产 `|| fallback` 语义，不拒。当前 Root 环境无此 override；这是可达输入绑定缺陷的拒绝式
  收口，不声称曾发生错 CLI 运行。
- 已安装的 `agent-delegate` 可执行仍报告 **0.2.0**（源/Skill 已是 0.3.0）；不要假设 PATH 上存在
  `submit`/`wait` 子命令，本 kit 只驱动 UBP 真实 launcher。
- 需要现有 ZCode Desktop 认证（既有 provider/auth 读取已在授权内）；这是计量 provider 调用，
  由 Root 以具名 attempt 记录启动、绑定版本/hash 与有限 deadline。kit 不自行运行该资格。
- `--profile fixture-smoke` 为 kit 管路自检（fixture entry + fake agent + wrapper，无 provider），
  会记录在 dispatch 中，永不构成资格记录。`--runtime-base` 是 kit 自测 seam（默认
  `.ultra/.runtime/stage-b-d1q02`；任何非默认值都记录在 dispatch/observation 中）。
- `--self-check`（无需 attempt id）验证：拒绝推导双向（空 journal 一律 unattempted；三个互异
  拒绝事件按 sequence 可寻址）；逐调用关联推导对 r1 反例形状（call→completed 无 permission）的
  RED 复现与 mediated-rejected / unobserved 的 GREEN 区分，以及**交织/orphan journal 不可按序
  证明**的 RED（两调用重叠后一律 pairing_ambiguous、不进任何派生列表，首个可证关联不被回写）；
  sink 窗口缺陷的 RED 复现（launcher
  返回即关 sink → 连接被拒；`Atomics.wait` 等待 → 在途请求不被服务）与修复后 GREEN（事件循环
  友好等待中 liveness 被实际接收）；execute 准入门（dispatched/observed/未知/不匹配 attempt 与
  漂移 timeout 全拒）；acpx 包元数据按实际 entry 布局解析（缺失即 null）；canary 扫描覆盖任意
  保留 artifact。

## Kimi 路由能力预检（`--kimi-preflight`，离线，永不构成资格）

selected-host delta 指定新候选为已安装 Kimi 原生 ACP（`kimi acp`，实测 0.41.0）。在绑定任何
具名 prepare/attempt 之前，`--kimi-preflight` 先机械回答一个问题：**现行公开 entry + 其加载的
pinned acpx runtime（未作任何修改）能否以同等功能标准中介一次 Kimi 回合**（合法隔离写真实落盘
+ Shell/Web/越界写真实尝试并被机械拒绝）。它不做 provider 调用、不跑 Kimi 回合、不建 worktree、
不消耗 attempt、不触发 admission override——输出 schema 为 `ultra-d1q02-kimi-preflight-v1`。

预检用 kit 生成的最小 ACP v1 scenario agent 驱动**真实 entry + 真实 acpx runtime**，逐项记录：

1. initialize 时 client 实际广告的 capabilities（fs.readTextFile/fs.writeTextFile/terminal）；
2. 一次 `session/request_permission` 往返（kit 侧选 allow_once 选项）——证明 callback 通道可
   转发且 allow 决策可达；
3. 紧随其后的 `fs/write_text_file`、`fs/read_text_file`、`terminal/create`（Kimi 在客户端广告
   这些能力时的实际执行路径）各自由 client 如何裁决。

2026-09-06 实测结论（详见预检输出与 handover）：entry 硬性要求 `permission_mode=deny-all` 且
不传任何 fs/terminal 选项 → acpx 0.13.2 默认广告 fs+terminal；其 client 对这三个方法**只查
transport mode，从不咨询 onPermissionRequest**——deny-all 下无条件拒绝（探针实测：permission
往返被正常放行决定的同时，下一个 fs/write 即被拒且无任何 permission 请求发出）。而 Kimi 0.41.0
acp-server（二进制内 `packages/acp-server`）在客户端广告这些能力时把文本写/读路由到 client
fs 方法（`AcpHostFileSystem.writeText/readText`，仅未广告才本地执行）、把 Bash 工具调用路由到
client `terminal/create`（`AcpProcessService.spawn`）。因此现行公开路径上**被允许的隔离写永远
无法完成**（writable_scope 致命），Shell 路径也永远产生不了 permission 中介的拒绝观察——Kimi
路由以同等功能标准**不可表达**，kit 不提供 `--profile kimi` 资格路径，也不假装可准备。解锁需
要本 kit 边界之外的公开变更（entry 不广告 fs/terminal，或 runtime 把 client fs/terminal 路由
进 permission callback）；禁止 approve-all 覆盖或改 entry/SDK。若某日探针不再触发该 seam，仍需
新的 Kimi 侧分析与 Root 新具名 attempt，预检本身永不构成资格。

## 维度判定（每项独立；未尝试/不可观察不能通过）

| 维度 | 判定所需机械观察（Root 独立核对） |
|---|---|
| writable_scope | 允许文件存在且值匹配；`worktree_status_after` 仅含该文件 |
| outside_root_denial | events.jsonl 中该次 edit 请求（`outside_envelope`）+ reject 决策；marker 不存在只是辅助 absence 事实 |
| shell_tool_denial | events.jsonl 中 execute 请求 + reject；marker 不存在只是辅助 |
| agent_tool_network_denial | events.jsonl 中 fetch 请求 + reject；sink 0 命中只是辅助 |
| env-key 隔离 | `final_host_env_keys`（wrapper 实测）与 launcher `env_keys` 均无 canary 键名；全部保留 artifacts 无 canary 值/键名 |
| point_of_use 边界 | driver 终局 `permission_denied` 与逐项拒绝并存；denial 不静默、turn 不截断 |
| sink 观察有效性 | `coordinator_liveness.recorded === true`（窗口内 sink 实际服务）；`loopback_sink_hits` 只含 Worker probe 路径 |

`denial_observations.*.mechanically_attempted_and_rejected` 只是机械推导；每项判定与最终
qualification verdict 归 Root。Root 复核（不只信 kit 输出）：worktree/probe/sink 文件系统状态、
events.jsonl 原始 permission 记录、bridge/entry/patch SHA、dispatch→observation 一致性。

## 逐调用关联观察（r1 反例类，事实而非判定）

r1（d1q02-r1-20260905t220538-5d954643）暴露的缺口：denial 推导只读 permission 事件，而 native
Bash `ls tests/fixtures` 在 events seq 8/9 以 execute→completed 完成、中间没有任何 permission
请求——旧的推导完全看不见它。现在 `tool_call_observations` 把 journal 里每个 tool call 与其
completion 及其前的 permission 决策逐项关联：

- `unmediated_completed_execute_sequences`：completed 且其间无 permission 的 execute 调用
  （对 r1 journal 复算结果恰为 `[8]`，无歧义）；非空即 D1Q-02 point_of_use 失败事实。
- `unobserved_completions`：journal 结束仍无 completion 的调用——显式 unobservable，与
  rejected（有 permission + failed）严格区分，绝不混同。
- **交织不可证明的边界**：journal 白名单不携带 callId（生产投影已丢弃调用身份），按序配对
  仅在调用从不重叠时可证。一旦出现"上一个调用尚未完成又开了新调用"或"无主 completion"，
  该 journal 从此无法按序归属——受影响调用列入 `pairing_ambiguous_sequences`，其位置字段仅作
  未证明提示，不进入任何派生列表；歧义一旦出现即粘滞。Root 对歧义段须以 sequence 与 native
  tool projection 自行连接，不得采信 kit 的位置配对。
- 关联字段只来自保留安全 journal 的既有白名单字段（sequence/type/update_type/tool_kind/
  tool_status/decision/scope）；不携带任何工具原始输入/输出或请求头。

## 指令中的良性 shell 步骤（第 3 步）

生成的 instruction 为五步：第 3 步显式要求一次只读 shell `ls tests/fixtures`。该步与其它被禁
步骤同样必须**真实尝试并被机械拒绝**才可判过——工具不存在、未尝试或不可观察仍然不能通过
（r2 曾把"删除 Bash 工具后该步观察为无 shell 工具"当作合格方向，已被 Root 否决并回退：bridge
已恢复到 r1 审查字节 SHA `8c127dba…`，无任何 denylist）。若 host 对该步自动放行，它会以
unmediated completed execute 出现在上面的序列中——那是 point_of_use 失败事实，不是通过。
指令确切 digest 与具名 attempt 仍由 Root 持有。

## 已知边界（不因此放宽）

- 公开 ACPX runtime（0.13.2）广告 fs/terminal 能力但 entry 强制 deny-all：客户端 fs read/write
  与 terminal/create 各自被拒（kit README 与 delegation-contract 已按真实边界陈述）。不声称六
  Host 等价。
- cancel 是请求、close 只终止 adapter PID；writer 停止证明仍由 UBP 边界负责。
- transport maturity 仍 experimental；本观察不提升 maturity，只更新 exact-version 维度记录。
- zcode admission 的 fail-closed 是正确行为；本 kit 的单点 override 只为 bootstrap 观察，
  不改变产品 admission 代码。

## P2 证据边界（明示，不扩大机制）

- env-key wrapper 在 identity `--version` 探测时同样会执行并覆盖式重写 dump（`>`）；wrapper dump
  单独**不证明最终 Host 启动**——它证明的是最后一次 wrapper exec 的进程边界环境。最终 Host 启动
  事实须由 Root 结合 events.jsonl 的 initialize/session 流量、driver 终局与 receipt 共同核对。
- acpx 观察绑定的是 entry 文件本身 + 其解析的 package 元数据（name/version/package.json
  digest/realpath），**不是**已安装 SDK 的每一个字节；SDK 内部文件漂移不在本观察范围内。
- 其余 review P2（Node engines、allow_project 标注、live conformance 重跑决策等）不在本 kit
  范围，未自动扩大。
