# Stage B 资格准入消费者：Codex 有界源码审查

观察时间：2026-09-05T23:05:13Z。HEAD：`b765b55cca0e1eaacebc738a68de77906bb50756`，包含实际 Kimi 的未提交改动及并行 ZCode bridge/patch 改动。

**结论：P0 = 0，P1 = 3。CLI 认证回退的目标 transport 准入已接通；实际执行身份的消费者尚未闭合。** 三项 P1 均是新正向资格记录启用后的具体源码可达路径，没有声称当前 negative 记录已允许真实越权。当前两份 negative receipt 字节保持不变。本说明不是正式 Task 2 Review、资格转正或 Stage B 完成记录。

本次先读实际 Kimi 的 `stage-b-kimi-admission-mission.md`、`stage-b-kimi-admission-handover.zh-CN.md` 及原 `stage-b-qualification-consumer-preflight.zh-CN.md`，再追踪默认 launcher、全部现有 selector/driver 调用者、worker、公开 conformance、Doctor 与相关既有测试。只运行已有命令和既有测试，没有编写临时或持久测试、inline probe、fake Agent 或实现代码；唯一新增文件是本说明。

## admission-code-001 · P1：公开 conformance 调用可省略必需的执行身份

**缺陷位置：** [delegate.cjs:1073](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/delegate.cjs:1073>) 至 1076 对 `acp_entry` 和 `execution_identity` 都做可选展开，launcher 不要求拥有 enforcement 资格的 ACP 选择必须携带已验证绑定。实际遗漏调用者是 [acp-conformance.cjs:171](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-conformance.cjs:171>) 至 190。

**触发：** 后续真实正向记录的 profile 字符串与 `qualified_identity` 一致、Packet 所需维度均支持时，使用现有公开 conformance 的 `--command` / `--args-json` 参数选择另一个 adapter/runtime，或将公开 entry 指向另一份文件。

**实际链路与后果：**

1. `acp-conformance.cjs:18-49` 公开解析两个 override；`148-156` 将其变成实际 command/args。
2. `171-190` 向 `runDelegate` 注入自己的 `chooseExecutionDriver`，返回 ACP command/args，却不调用 `selectExecutionDriver`，也不提供 `acpEntry` / `executionIdentity`。
3. `delegate.cjs:993` 接受这份选择；`1031-1040` 的纯 `enforcementAdmission` 只读 profile 的声明身份与维度，不检查这些实际 command/args。
4. `1073-1076` 将缺失绑定合法地省略。worker 在 `delegate-worker.cjs:321-355` 验证 spec 摘要后原样交给执行层，摘要只能证明省略后的 spec 未变。
5. `acp-driver.cjs:411-420` 对无 `acp_entry` 的 spec 重新解析 entry；`438-449` 只在 `execution_identity` 存在时复核。唯一调用 `requiredExecutionIdentity` 的位置是 `agent-execution-driver.cjs:718`，此路由完全不经过它。

结果是静态资格记录可被用于启动未被该记录绑定的执行组合；当前 normal `delegate run` 的指纹检查不能覆盖这个真实产品调用者。conformance 的显式候选选择并没有在代码中建立另一种 enforcement 授权，也不能隐式继承已资格候选的 point-of-use 能力。

**既有证据与边界：** `tests/acp-conformance.test.cjs:39-49` 已通过公开进程入口使用 `--command` / `--args-json`，证明这不是仅测试可注入的死接口；它固定使用无 enforcement 记录的 `codex`，没有覆盖正向资格绑定。上述后果为源码推导，未运行新的 conformance 或 Provider。旧式直接 `new AcpDriver(spec)` 的兼容性本身不是发现；发现是拥有正向 qualification 的现有 launcher 调用也落入同一兼容分支。

**最小修复：** 在 launcher 现有资格/选择边界令必需的执行身份不可因 selector 返回字段缺失而消失，缺绑定时 typed refusal；让公开 conformance 复用既有实际身份观察/验证路径。无记录 Host 的旧行为仍由既有 `gate:null` 决定。由实际作者在已有 fixture/调用缝补充正向记录下的 conformance/selector 缺绑定拒绝检查；不需要另建资格引擎。

## admission-code-002 · P1：native runtime 的身份没有覆盖实际启动

**缺陷位置：** [agent-execution-driver.cjs:194](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:194>) 至 208 的 `launchExecutionIdentityDrift` 不读取或比较 `runtime_sha256`。其调用点 [acp-driver.cjs:439](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:439>) 也仅传 adapter/entry。

**触发：** 正向资格下，选择阶段核验了默认 App-bundled runtime；在 launcher 完成选择之后、detached worker 启动 Host 之前，该 runtime 被一次正常 App/CLI 更新替换。即使绝对路径及版本文本相同，也可能是不同字节。这个触发不依赖恶意 OS 在相邻系统调用之间交换并恢复目录项，也不需要相对路径。

**实际链路与后果：** `selectExecutionDriver:721-725` 只在选择时通过 `identityFilePath(cliCommand, env)` 哈希 runtime。`735-748` 返回摘要及原始 args，没有保留解析后的 runtime 文件位置。ZCode 的实际 runtime 参数来自 `host-profile.cjs:583` 的 `--zcode-path cliCommand`，由 launcher 写入 spec，随后由实际 entry 交给 adapter。启动前只复核 adapter、entry、SDK package；`runtime_sha256` 到此成为没有消费者的字段。更新后的未资格 runtime 仍能启动并继承旧资格维度。

**既有证据与边界：** Kimi 交接明确承认 native runtime 仅在 admission 核验。现有 `tests/acp-driver.test.cjs:1065` 起覆盖的是选择前改 runtime；`1172` 起启动复核只测 adapter、entry、SDK package。该后果为源码推导，未制造文件替换探针。mission 第 2 项明确要求将实际 adapter/native runtime/entry/SDK 的解析结果绑定，并在 launch 使用/复核；把 native runtime 排除为交接 limitation 并没有完成该要求。

**最小修复：** 从现有 profile/选择缝绑定实际 native runtime 的解析位置与内容身份，令实际 adapter 参数消费这份选择，并在现有 Host 启动检查中复核该文件摘要。沿用当前 typed mismatch 及 writer `not_started` 拒绝，不需要解析任意 argv 的通用框架。由实际作者复用已有 runtime fixture，覆盖选择后、启动前的同版本字节漂移。

## admission-code-003 · P1：SDK 指纹读取位置可能不是 entry 实际加载位置

**缺陷位置：** [agent-execution-driver.cjs:157](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:157>) 至 169 的 `resolveAcpxPackage` 直接拼接 `dirname(entry)/node_modules/acpx/package.json`；[同文件:205](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:205>) 的启动复核重复同一规则。

**触发：** 一个受支持的绝对 entry 覆盖路径 `/A/entry.cjs` 是指向 `/B/entry.cjs` 的符号链接，entry 内容与已资格字节相同。`/A/node_modules/acpx/package.json` 保留已资格元数据，而 `/B/node_modules/acpx` 是另一 SDK 身份。文件迁移/符号链接配置即可产生这个布局，无需运行中竞态。

**实际链路与后果：** `resolveAcpEntry` 用 `statSync(...).isFile()` 接受该链接并保留 `/A` 路径。选择和启动都哈希 `/A` 邻接的 package.json。实际 `AcpDriver` 使用 `spawn(process.execPath, [entryPath])`，没有 `--preserve-symlinks-main`；Node 的默认主模块解析以真实文件位置加载 entry。已读的真实 entry `acpx_delegate_entry.cjs:190,194` 分别调用 `require('acpx/runtime')` 和 `require('acpx/package.json')`，会从实际模块位置解析 `/B` 的 SDK。于是所有新资格指纹比较都能通过，运行的 SDK 却不是比较过的那个 package。

**既有证据与边界：** 本机既有 `node --help` 明确提供 `--preserve-symlinks-main` 作为保留主模块符号链接的选项，而启动参数未使用它。当前 Root 已受测 entry 是普通文件，因此本审查没有声称当前 `/tmp/ubp-acpx-protocol-root-z4cncgah/runtime/acpx_delegate_entry.cjs` 已加载错包。现有 identity fixture 始终把 entry 与 package.json 放在同一平铺目录；没有这种符号链接布局的既有回归，本次没有新增探针复现。本发现是有限的 Node 加载路径与源码条件推导，不要求证明整个 node_modules 字节。

资格 kit 的 `run-d1q02-observation.cjs:232-247` 使用同样的邻接假设，所以仅把旧 receipt 字段映射进 profile 会继承错误观察。

**最小修复：** 复用 Node 标准模块解析，从 entry 实际主模块路径解析它的 `acpx/package.json`，对那份实际文件读取元数据和摘要；选择、启动与资格 kit 对齐同一解析语义。可以使用 stdlib 的 realpath 与 `module.createRequire`，不需要新依赖或全包证明。由实际作者复用现有 identity fixture 覆盖符号链接/迁移布局，并确认仍允许内容身份一致的合法迁移。

## 已确认的正确路径

- `delegate.cjs:1010-1020` 重用同一 Packet required dimensions 得出的 CLI admission，仅在目标 CLI `admitted` 时绑定 fallback。`agent-execution-driver.cjs:800-830` 保持 pre-session auth、完整 writer stopped、重新进入 not_started 的原有条件。ACP-only 正向 fixture 无 CLI fallback/marker；CLI-admitted 与无记录 legacy 的既有回退均通过。
- 默认 launcher 上，`requiredExecutionIdentity` 的“无记录”分支不宣称 qualification；声明字符串不同的分支仍被非空的四/五项 Packet 维度判为 `version_mismatch`。匹配的对象即使缺摘要，也返回缺字段对象，再由 `executionIdentityDrift` typed 拒绝；没有把此正常缺绑定路径误报为绕过。真正的遗漏是 admission-code-001 的现有调用者跳过了整个 selector。
- entry 路径及摘要已绑定进正常 worker spec，实际启动复用它；entry/adapter/package.json 在所实现的观察路径上漂移会在 Host 启动前拒绝。不可将“Host 未启动”扩成“外层 Worker 从未存在”：启动复核发生在 detached worker 内。
- `bin/delegate.cjs` / `bin/delegate-worker.cjs` 是现有 Skill 路径的薄包装。`adapters/_shared/plugin-core.cjs:213` 的 selector 调用属于 Doctor 诊断，不启动任务 Worker。`runExecutionDriver` 的任务消费者仍是 `delegate-worker.cjs:355`；未发现第二条普通任务 fallback 执行引擎。
- 已接受的 protocolVersion 观察/拒绝逻辑未在本次改动中改写，本审查未重开 Task 1 三项 P2。

## 本次实际验证与当前红灯

执行的是既有命令：

```bash
rtk proxy node --test tests/delegate.test.cjs tests/acp-driver.test.cjs
```

本次结果：**106 tests，104 pass，1 fail，1 skip，40.949 秒，exit 1**。九项本次 admission 回归均执行通过。skip 是既有真实 entry 协议回归的 `UBP_TEST_ACPX_ENTRY not set`，没有把 skip 报为通过。

唯一失败为 `tests/acp-driver.test.cjs:480` 的 canonical bridge patch 摘要断言：

- 实际 patch：`603064df4171966ac557129832f4f7423921875434c86cd2112bed05f3f88772`。
- 当前 profile 声明：`8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36`。

ZCode 正并行改 bridge/patch，Kimi mission 又明确要求其不猜最终 marker/digest。这个当前集成不一致须由 Root 在真实最终构建事实到达后协调更新并验证，不归给 Kimi 尚未获知的最终身份，也不因上述解释宣称当前检查已绿。Kimi 原始 `stage-b-admission-repair-focused.log` 仍保留其当时的 `105 pass / 0 fail / 1 skip`；本次新结果没有覆盖旧日志。

上述六个受审实现/测试文件的实际 SHA 与 Kimi `stage-b-admission-repair-hashes.json` 一致，检查后再次读取仍一致：

| 文件 | SHA-256 |
|---|---|
| `skills/ultra-delegate/scripts/host-profile.cjs` | `b4b6c3a9160c14ed44118e6f601f0cec261ccb59b2590a831e51cce29de11793` |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `deff212b704821a9bed7f6f754bed57b8fc242f2561f1cf319925ff72e4528da` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `0ca2a50f1bcebf8231da6ac04a67baf61de9c6e4760375fc31f8bee8190046fa` |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `db86c5b9cdcd4f047e15f9c10734fa0c8381b5ca94b5051a0edbd4e64124dba2` |
| `tests/delegate.test.cjs` | `339757531e9bf079d2262de1d961ad478e80341c7afc6e99692448b3288d41a0` |
| `tests/acp-driver.test.cjs` | `5ee800fdc10943b67e6fc562f7d23aee38075b95e698942b0118047ae4a7a7cb` |

仅这些受审路径的 `git diff --check` 通过。原 negative receipt SHA 仍为 `936c77949630c52a7ca128c0f780cc98b2f3a046e5ff8d500bb41cd145bdde01`；r1 negative receipt SHA 仍为 `04c53544528b7f35c38fbaf6ef6f3666ecc1c9d4b936024e7825467fb1f6846e`。

本次未运行 Provider、真实 qualification、安装、完整 release 或新的诊断程序。三项 P1 的修复与必要回归继续由实际 ZCode/Kimi/CC 作者执行；Root 负责接收最终事实、审查及后续集成门。
