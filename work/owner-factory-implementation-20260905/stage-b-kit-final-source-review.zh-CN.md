# Stage B D1Q-02 kit 最终候选分项源码审查

受检仓库：`/Users/rocky243/Context Engineering/ultra-builder-pro-cli`。本次是 Root 执行真实资格前的独立、只读源码审查，**不是严格最终 Task Review，也不是 Provider qualification verdict**。仅写本报告；未执行 Provider、真实 zcode prepare/execute、自检或产品测试，未修改实现与测试。

结论：**1 项 P1，0 项 P0**。kit 已走真实 detached launcher，并修正 sink 提前关闭、同步等待、consumed attempt 重跑和 absence 冒充拒绝等原问题；尚有实际 native CLI 选择与记录的文件 SHA 不一致的可达路径，须在真实资格前修正 kit。另列两项 P2 证据限制，不要求扩建产品框架。

## 受检快照

kit 初读两文件均与 Root 指定 SHA 一致；下列执行消费者在追踪前记录 SHA。结束复核时间为 **2026-09-05 20:38:48 UTC**，全部 SHA 与各自读前一致。本结论只绑定这份候选；作者后续修复应单独复核新 SHA。

| 文件（仓库相对路径） | 读前与读后 SHA-256 |
|---|---|
| `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs` | `1b286e06c7af68313a4a8836ec9b3d32760c5ed55a4c91a23099becac776948d` |
| `work/owner-factory-implementation-20260905/stage-b-d1q02-kit/README.zh-CN.md` | `59abf3a77984595f320203eea9c76ee12a10da95bfacd80f3511daa8eb5db212` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `d29b2d0aad5815ec3da71b844bab2875f882dfb0f031078d91318590e0615639` |
| `skills/ultra-delegate/scripts/delegate-worker.cjs` | `a7ee8530346f2fb2d8868aba9c207edc5df730377e54c270fbfa8b143ffc8373` |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `f564d8f4f7b15e5c95ed27df35d8f8daca7ad6839412cb814256335e0b598ed4` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `72f46e166b39f468ecabcfd92dc994ab31b912bf0d4c1b4b74a9b509d35f87db` |
| `skills/ultra-delegate/scripts/cli-driver.cjs` | `d301ce7df4eb617a8f700bf8454cc9c70bb7d216e49517914ab22a34698f658b` |
| `skills/ultra-delegate/scripts/host-profile.cjs` | `0f330a88bb2441d445af326928ba08c2eeb2434a40c486994e85dcbd871a3681` |

下文 `kit` 指上表 observation script；`README` 指同目录 README；执行消费者均在 `skills/ultra-delegate/scripts/`。外部 final entry 另作只读 SHA 核对，仍为 `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb`，未重新展开此前已完成的 entry 审查。

## P1-01：native CLI 的真实选择未进入 prepare/execute 绑定

**位置与失败路径：**

- `kit:600–616` 检查并记录固定 `ZCODE_BUNDLED_CLI` 的路径与文件 SHA；`kit:787–807` 执行前再次核对该固定文件，没有检查 `UBP_DELEGATE_ZCODE_BIN`。
- 真实 `delegate.cjs:735–736` 的 `selectedBinary(runtime, fallback)` 优先返回 `process.env[UBP_DELEGATE_${runtime.toUpperCase()}_BIN]`；`delegate.cjs:868` 在本次真实 `run()` 消费它。
- `host-profile.cjs:497–498` 把实际选中的 `cliCommand` 写入 bridge 的 `--zcode-path`。`host-profile.cjs:513–516` 与 `agent-execution-driver.cjs:517–539` 仅校验该 native CLI 的 `--version` 输出，未把其文件 SHA 与 kit 记录核对。
- `kit:999–1005` 将原 prepared bindings 复制进 observation。故另一个同报 `0.16.5`、字节不同的 CLI 可以实际执行，而 observation 仍声称 App-bundled CLI 的 SHA。

**精确触发条件／复现步骤（源码追踪已确认；本次未运行 Provider）：**

1. 使用已绑定、正常通过身份探针的 bridge/entry，按 README prepare 新 zcode attempt。
2. 在 execute 的进程环境中设置 `UBP_DELEGATE_ZCODE_BIN=/absolute/path/to/another/zcode.cjs`。该文件能正常执行，`--version` 输出仍为 `0.16.5`，但文件 SHA 与 `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` 不同；无须改 bridge、entry、App-bundled CLI、patch 或 UBP 文件。
3. 所有现有 kit drift 比较仍通过；真实 launcher 将另一文件传给 `--zcode-path`，且同版本字符串仍可通过 identity probe。
4. 运行若得到观察结果，`bindings.bundled_cli_sha256` 仍指向未运行的固定 App 文件。于是 exact-file qualification 的证据与被测 native CLI 不一致。该变量在 prepare、execute 两阶段都已设置时也会触发，不只限于阶段之间漂移。

本审查进程只检查键的存在性：`UBP_DELEGATE_ZCODE_BIN`、`ULTRA_DELEGATE_FORCE_CLI` **当前均未设置**，未读取或打印凭据值。因此不声称作者既有 fixture 日志或当前默认运行已经误绑定；问题是生产 launcher 已有、kit 未限制的真实选择路径，不是假设未来新增接口。

**最小修正边界：** 本 kit 明确要测 App-bundled CLI，故在 prepare 与 execute 中拒绝该变量选择不同于 `ZCODE_BUNDLED_CLI` 的目标即可；若接受显式相同路径，应保持路径／SHA 解释一致。不要静默删除该变量造成“表面采纳、实际忽略”。另一可行边界是绑定真实选中的 native CLI 并在 execute 比较，但本轮不必扩成任意 CLI 资格系统。无需改生产 `selectedBinary`、driver、permission 或新增协议引擎。

修正的最小验证应不调用 Provider：使用现有 seam 或独立子进程环境，证明非 bundled override 在产生 worktree／派发之前被拒；execute 阶段新增该 override 同样不得消费 prepared attempt。保留默认 bundled 路径与既有 fixture 管路验证。本报告未自行实现或运行这些检查。

## 已核实的实际路径与证据限度

| 关注点 | 当前源码与消费行为 |
|---|---|
| 真实 launcher 与唯一 bootstrap 放行 | `kit:723–728` 只删除 profile 的 `enforcement`；`kit:907–922` 调真实 `run()`，只注入 `resolveHostProfile`。没有替换 `spawnWorker`、`chooseExecutionDriver`、env policy 或 permission callback。无 enforcement record 时 `host-profile.cjs:270–279` 才走现有 admitted 分支；既有 negative record 未修改。 |
| 真实 detached Worker | `delegate.cjs:843–851` 默认 `spawn` 使用真实 `env`、`detached:true`；`delegate.cjs:1109–1111` 调用该默认 seam 后 unref。kit 取得 receipt 后继续等这个 Worker，未把模型回复或 fixture receipt 替代生产启动。 |
| 真实环境过滤 | canary 仅在 `kit:883–891` 注入协调进程；`delegate.cjs:928–934` 调 `descendantEnvViews`，`host-profile.cjs:102–118` 按实际 allowlist 得出 worker/host 两视图；`delegate.cjs:1086–1109` 持久化键名并传递 worker env。`agent-execution-driver.cjs:126–133` 从 Worker env 按 digest-bound 键重建；`acp-driver.cjs:398、436–444` 用该 env 启动 entry。不是手工过滤对象冒充观察。 |
| sink 实际服务 | `kit:817–823` 开启 loopback sink；`kit:940–948` 先 await liveness，再用 `waitForFileAsync` 的异步 100ms 等待（`kit:192–198`）等待 result。唯一 close 在 `kit:1079–1082`，不在 launcher 返回时关闭。正常等待期间事件循环可服务 HTTP。早期错误关闭 sink 时不产出成功观察。 |
| liveness 与 Worker 效果 | `kit:940–946` 使用独立 `/coordinator-liveness` 并验证有记录；`kit:1030–1031` 将 `/probe` 与 liveness 分列。liveness 不计 Worker hit。该单次自检证明 sink 服务时刻；不单凭它推导 Host 已产生工具请求。 |
| prepare／派发／已消费 | `kit:270–290` 只接受 schema、attempt、profile 匹配且 state 为 prepared 的记录，取回有限 prepared timeout 并拒绝显式更改。`kit:572` 拒绝已有 dispatch 的 reprepare。`kit:900–905` 在真实 launcher 调用之前持久化 dispatched；`kit:1055–1058` 最后记 observed。派发后异常不会恢复成未消费。 |
| deadline | prepared timeout 通过真实 `--timeout` 传入 launcher（`kit:917`），Worker spec 使用它（`delegate.cjs:1074`）；协调者另加 30 秒等 typed result（`kit:948`）。`dispatch_deadline_at` 是派发前记录的绝对时间，产品实际执行上限由 timeout 控制；不能把该字段当成另一个独立绝对时钟中断器。 |
| instruction 与执行来源 | `kit:752–815` 先核对 instruction、permission、HEAD、六执行源、entry、bridge、patch、声明 identity；只有 loopback 占位符在 `kit:829–837` 一次替换，并保存前后 SHA。native CLI 选择缺口见 P1；acpx 元数据边界见 P2。 |
| 拒绝事实 | `kit:304–331` 每个维度都要求对应 kind/scope 的请求与 reject；空集合不会通过。`kit:1042–1045` 明确 marker absence 与零 sink hits 不等于拒绝。允许文件值和实际 Git 状态单列（`kit:957–971`），不由 fixture denial 推导 writable_scope。 |
| retained artifacts | `kit:975–985` 枚举当前 `delegate.cjs:883–893` 的实际已知产物、两输入文件及 kit 侧文件；`kit:1047–1053` 另检查 observation 的 canary 值。该名单覆盖当前 launcher 明确命名的 delegation 产物；不是整个 HOME、任意 Host 私有状态或完整 worktree 的扫描声明。Root 仍按 README 111–112 独立核对 worktree/probes 与实际证据。 |
| Writer 停止证明 | `delegate-worker.cjs:430–444` 在发布 terminal 前检查 `boundaryProof`，不明／活跃改为 outcome_unknown；`delegate-worker.cjs:449–465` 保留不明结果的 fence。kit 未替换该逻辑，也未把 sink 关闭解释为 Worker 已停止。 |

## P2：仅保留的证据限制

1. **同一个 env dump 会先由 identity probe 写入。** `kit:874–877` wrapper 无条件写 `final-host-env-keys.txt`；`host-profile.cjs:505–511` 的 bridge `--version` 探针也调用同一个 command，经 `agent-execution-driver.cjs:517–524` 在 Worker 之前执行。因此若随后 entry 在启动实际 Host 之前失败，`kit:952、1015` 仍可能读到探针的键名列表。正常 Host 启动会覆盖该文件；已有 fixture 没有证明这个 zcode 特有探针分支。Root 不应仅凭非空 dump 给失败前启动的环境维度合格，须结合真实 ACP 启动／permission／terminal 证据。最小后续改进是让版本探针与真正 Host invocation 不复用同一 observation 文件；不需要改产品 env policy。本轮不扩修。
2. **acpx 记录是包元数据绑定，不是 runtime 全部字节绑定。** `kit:226–240` 记录 package 路径、realpath、name/version/package.json SHA；`kit:783–785、800–801` 比较时只使用 name/version/package.json SHA。切换到相同 package.json 的另一 realpath 不会被该比较拒绝，runtime 文件本体也未逐个 hash。README 39–40 对“元数据”的表述可保留，但 README 47 的“全部绑定／任何漂移”不能外推到 realpath 或依赖树全部字节。Root 本次需使用已核定的同一 acpx 0.13.2 安装并保留解析身份，不由这个字段声称整棵依赖不可变。本轮不要求增加依赖校验框架。

## 已读日志与未完成项

已读 Kimi 的 `stage-b-kimi-kit-final-repair-handover.zh-CN.md`，并只读其命名日志与保留产物，而非据 handover 宣告通过：

- `.ultra/.runtime/owner-factory-implementation-20260905/stage-b-kimi-kit-selfcheck-final.log` 记录 self-check PASS；本审查未重跑。
- 同目录 `stage-b-kimi-kit-fixture-green2.log` 与 `stage-b-kimi-kit-check2-observation.json`：`d1q02-kitcheck-007` 为 fixture-smoke；三类 permission rejection、`permission_denied/end_turn`、liveness true、probe hits 0、canary hits 0；**allowed_written 为 false**，不构成 writable_scope 或真实 Host qualification。
- 该 fixture receipt started_at 为 `20:23:23.500Z`，liveness requested/answered 为 `20:23:23.504Z/20:23:23.508Z`，result finished_at 为 `20:23:23.984Z`，与 sink 在该实际 detached Worker 等待窗口服务相符。
- 已读 `stage-b-kimi-kit-red-state.log`、`stage-b-kimi-kit-red-drift.log`、`stage-b-kimi-kit-red-entry.log`；它们支撑作者已执行的拒绝分支，不替代本次 native selection 缺口的回归验证。其中 RED-7 日志保留旧顺序失败，当前源码已把 profile 检查移到创建 worktree 之前，不把旧日志错当当前仍有该缺陷。

未执行真实 ZCode 资格；未提升任何 Host maturity、enforcement qualification、D1 状态或最终 Review 状态；未重提已撤回的 ordinary status P1。下一步仅由实际作者修正 P1-01 的 kit 选择绑定并提交新 SHA／窄验证证据，再由 Root 运行真实资格与最终产品门。

## Root 修正复核 — 2026-09-06

实际 Kimi 后续回合 949bcb0768fb44fbb9e6110ee8d8e5b7 success/end_turn，439.442s，已结束收取；157 条 tool-scoped rpc errors、0 protocol errors，不能记为零错误。新 kit SHA fef81238a601eb056d398a8f8121d42053afeb5a8ba27d0c77444e4269f4b2ac，README SHA d3cda4f3c9d584a658f37417ad09f9a2b6450cc7be77267d3f7e5d8cded7ce41。Root逐行核对 assertNativeCliOverrideAbsent、prepare的副作用前调用、execute原比较循环中的native_cli_override_value：truthy override在两阶段都拒，空串沿生产fallback语义处理。限定CLI的原P1已解决，不改变生产launcher。作者 RED-A/B 与 GREEN 日志覆盖prepare拒绝且无worktree、prepare后引入override拒绝且未消费、正常prepare及fixture-smoke；这些不是实际Provider资格。

Root独立运行最终 --self-check exit0，0.960s，源码SHA前后相同，原始日志 stage-b-root-kit-after-native-binding.log SHA 1afaf26a501d40b2b32687b8a49c610adb44c3d1d1e75f0fef1d27703ee7109f，新增override断言及原有sink/attempt/metadata/canary检查均通过。此分项源码接受。两个P2观察边界仍在，真实D1Q-02资格未运行，也未自动将profile改为supported。
