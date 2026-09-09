# Stage B D1Q-02 kit 初始源码审查

状态：尚不可执行。Root 于 2026-09-05T18:39:42.660681+00:00 只读审查；未调用 Provider，未运行此 kit，未修改实现或测试。实际 ZCode 续行仍拥有 kit 的写权限；这是一份移动阶段的反馈，不代替最终严格 Task Review。

源码：`work/owner-factory-implementation-20260905/stage-b-d1q02-kit/run-d1q02-observation.cjs`，SHA-256 `a097fe4162a1aaf03e28f9c3750f32d4a3feee0eeb1f5766baf1036412ef4097`。依据是当前文件与 `agent-execution-driver.cjs` 的 `descendantSpawnEnv`、`acp-driver.cjs` 顶层 spawn 导入，及 D1Q-02 原始 Acceptance。

## P1：环境隔离观察既未经过实际过滤，也未注入所声称的合成值

kit 在约 174–185 行构造局部 `env` 和合成 canary，之后只把其全部键名放进 `spec.env_keys`，`spec.env` 却为空；从未把该局部 env 作为真实 worker 的启动环境。`descendantSpawnEnv` 按这些键名从当前 `process.env` 取值，而不是再次执行 launcher 筛选。因此这个路径可能转发 Root 环境里现有的同名真实值；没有真实同名值时也没有实际注入 canary，不能证明它被过滤。不要执行此版本。

约 233–242 行在 require AcpDriver 后改写 child_process.spawn。当前 driver 顶层已经解构了 spawn，旧引用不受改写影响；接入 ACPX 后直接 Host spawn 还会位于另一个进程，按 bridge command 匹配当前进程的 spawn 也不能成为 final Host 观察。null 必须保留为不可观察，不能转成干净。

最小充分修正：复用真实 launcher 环境筛选与实际 worker spawn；仅在隔离子进程内设置合成 canary，禁止把 Root 的真实同名值当 canary；观察实际启动选项并继续真实启动。若资格必须绕过尚未获得正向事实的 admission，明确只绕过该精确 bootstrap 事实，不绕过环境/权限/输入绑定实现。终端 Host 观测可沿既有可达 seam 做，不能通过写一个与生产无关的 env 对象替代实际事实。

## P1：资格脚本会改写主仓库共享 Git 作者配置

约 111–112 行在 linked worktree 运行 `git config user.email` 与 `git config user.name`。普通 `git config` 默认写 common repository config；linked worktree 并不自动有独立 config。这两条命令会把本仓库的后续提交身份改成测试身份，且这个试验本来没有 commit 消费者。

最小充分修正：删除这两条不必要的身份写入。若以后确有 fixture commit，使用只影响该单条命令的 `git -c` 参数或子进程环境，不修改共享配置。Root 尚未运行此脚本，无需现在回写作者配置。

## P1：缺少调用前持久 attempt，摘要把无效果写成已拒绝

attemptId 仅在内存与目录名出现，没有在 Provider 调用前写 durable reserved/dispatched 记录。若调用后脚本退出而 observation 尚未写出，只能看到目录，不能按原合同恢复精确 dispatch 与 outcome_unknown。Root 执行前须有其拥有的具名 attempt，预先绑定输入/版本/hash，并在 Provider 调用前记录 dispatch。可由 Root 操作记录承担，不强迫建立新状态机，但 kit 必须允许外部绑定同一 id 和准备/执行边界，不能在调用后才返回这些关键输入。

约 339–341 行以 marker 不存在/sinkHits 为零直接输出 `outside_edit_denied`、`outside_shell_denied`、`web_denied`。这些只证明未观察到效果；模型没有调用工具或过早结束也会得到 true。最小充分修正是把这些字段改成事实性的 marker/sink 观察，并用每项具体 attempt-and-denial 事件独立得出资格。未尝试/不可观察维度仍 unsupported。README 通过表和终局也必须遵守这一点，permission_denied 不能被修饰为成功。

## 后续

上述反馈须交给实际 ZCode 修改；Root 不写实现。当前原始失败资格与输入 Acceptance 摘要保持不变。还要核对最终 kit 使用迁移后的生产 ACP 路径、精确 entry/runtime/bridge/native CLI 和当前 dirty source hashes，保留 provider control-plane 与 Worker 工具效果区别，并完成最终独立真实测试；本报告本身不宣告任一维度合格。

## 排队反馈前补充：bridge 的原生非成功终态

独立只读 bridge 审查另已确认一个同范围 P1；详见 `stage-b-bridge-independent-source-review.zh-CN.md`（同目录，正在形成最终报告）。当前 `src/zcode/protocol.rs` 不接收原生 `resultType`，`src/zcode/mod.rs` 对全部 `turn.completed` 固定给 EndTurn；本机原生 bundle 明确发送 `resultType: "cancelled"` 后映射为 `turn.completed`，因此真实取消会被转成正常 ACP `end_turn`。`src/agent.rs` 还把真实 `TurnError::Failed` 只转为警告文本后 EndTurn。原生 bundle SHA-256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。这是实际终态分支的反例，不是从错误文本猜测额度。

本排队反馈回合也应修复这个当前 bridge 消费者：保留并精确映射实际 native cancelled/failed 事实，使取消保持 cancelled、真实失败走 ACP error/失败语义；正常 turn 仍 EndTurn，多次拒绝保持逐项拒绝并最终由 UBP 投影 permission_denied。只对本机原生实际产生的字段/值作映射，未知仍未知，不扩成文本分类器。复用现有 fake server/client 加回归，更新完整 canonical patch/digest/临时离线binary及相应现有消费者，不替换已安装 bridge。

同份 bridge 审查发现 allow_project 被误标 allow_once，但实际原生选项固定先有真正 allow_once，UBP/ACPX first-kind 路径因此不会选后者；该项仅保留 P2，不自动扩大本次修复。报告保留触发条件，不能误写当前已发生权限升级。

## 排队反馈前补充：实际 ACPX glue 的 P1 与一项已撤回推断

请一并读取同目录的 `stage-b-acpx-integration-source-review.zh-CN.md`（独立 reviewer 正在完成）。当前 UBP glue 将任何 message/code 含 auth 的 failed result 变成 acp_auth_required，既有 fallback consumer 随后重跑 CLI 并声明 prompt_sent:false。entry 错误却可能发生在 startTurn/工具已执行后；writer stopped 不能证明重跑没有重复效果。Kimi 的同一独占工作树后续回合将提供最小 v1 optional metadata `result.error.phase`，约定仅 ensureSession 且尚未调用 startTurn 的失败为 `ensure_session`，进入 startTurn 后为 `turn`。UBP 必须同时核对该结构化 before-prompt 证据及真正 auth 错误，只有前者可走原有 fallback；missing/unknown/turn 不得落入该前提。保留旧合法 pre-prompt auth fallback，同时补已发送 prompt 后 auth-like 失败不启动 CLI 的回归。

**更正并撤回这项普通路径 P1（19:03Z）：** 此处初审曾声称 ensureSession→startTurn 的普通内部 `{type:status,text:session resumed}` 会进入 turn.events 并被 UBP误拒。Root 实际运行作者已有 real-entry + fake-Host + AcpDriver 脚本，正常与多拒绝路径均通过，前后 source hash不变（3.29s）；原 reviewer 复查发现此前漏读 runtime.js 的 emitRuntimeTurnEvent→parsePromptEventLine 归一化，这条内部 status 被过滤，实际不进入 turn.events。原推断已被反证，不得以它为修复门槛。保留组合验证，但不要为了消除此错误推断修改运行代码。其他可能的无tag client_operation 兼容问题按独立报告P2处理，没有当前反例不自动修复。证据 `stage-b-root-moving-real-entry-smoke.json` / `.log`，独立报告已更正。

第三项 glue P1 是日志回归：当前 `acp-driver.cjs` 先将每条原始 entry JSON append 到 protocolStdout，再做语义/日志过滤，最后把该原始 buffer 写进 stdout.log。即使 thought 在后续投影丢弃，思考正文和 rawInput/rawOutput 已落盘。现有 happy fixture 明确发出合成 hidden-reasoning-secret/raw-secret-token，当前 tests 只检查 events.jsonl，因此不足。旧 HEAD driver 未把这些原始行保存在 stdout 中。最小修复是原始事件只在 IPC/内存供精确权限判断及结果消费，保留日志仅用已有安全投影或固定诊断；禁止另加泛化脱敏引擎。对现有 happy case 的全部保留产物检查该回归，不能只检查 events。保持 stdout/stderr 的真实诊断边界，并以实际内容证明不再保留 private thought/raw secret。

最终文案也须完成当前 Task3/D1Q-04 原有范围：`delegation-contract.md` 当前仍声称 runtime 广告无 fs/terminal，但新真实 ACPX 广告存在，执行 callbacks 由 deny-all 拒绝，native 工具走 UBP raw permission。独立报告把此项列为兼容/文档 P2；Root 在这里明确不是为了润色而扩大修复，而是 D1Q-04 明确要求被改动的当前维护合同陈述真实实现，不能在发布验收中保留这条确定的反事实。请以最小文案同步该既有修改路径，保留“执行拒绝”与“广告关闭”的区别，并用 real entry 组合检查；无需新增开关。Node最低版本/Windows默认路径等其余未在当前Host复现的兼容P2保留，不自动扩大源码范围。

Root 的同范围 maintained-consumer 搜索也确认 `skills/ultra-delegate/SKILL.md:141–147` 仍声称 AcpDriver 直接发送 initialize 且无 fs/terminal 广告。这是与 delegation-contract 同一根因的模型入口消费者，亦在当前 D1Q-04 原计划 MODIFY 范围内；请同步最小真实 public-entry 描述，并运行 Changed Skill 的官方 validator。不要只修 reference 而留下模型入口反事实。Root 搜索其余 `.ultra/specs/product.md`、`.ultra/specs/architecture.md`、`docs/ARCHITECTURE.md`、`docs/ARTIFACT-AUTHORITY.md` 没有查到同一句广告声明，无需因此重写它们。

## 续行中间稿复查：仍须由排队回合收口

Root 于 2026-09-05T19:38:22.844022+00:00 读取当前 kit，SHA-256 `a524e97fdc49f01415dcfb75ba4a3b5268cb0b92ae23d12113648ee6dc8a73fb`，未运行 Provider。删除共享 Git config 写入、把 absence 改为事实观察已在当前稿体现，应保留。以下为同一原反馈仍未闭合的实际代码点，不是增加新架构要求：

- 当前第 199 行 require AcpDriver，第 266 行才替换 child_process.spawn，而 acp-driver.cjs 第 5 行仍解构缓存 spawn；因此该 spy 仍不可达，observedHostEnvKeys 仍会是 null。并且 kit 直接手填 baseEnvKeys，没有经过真实 launcher 的目标环境筛选，不能把构造后的 env key 集合当成过滤证据。请按原反馈用真实已受检 launcher/final spawn seam，观察来自隔离子进程的 synthetic key；不接受仅把 spy 提前但仍手工替代 production filtering。
- 当前第 246 行只向 stdout 输出 dispatched:true 后立即运行，不持久化 attempt，也不等待 Root 确認持久记录。管道读取到该行不保证 Root 在 Provider 前完成 durable dispatch。因此原先要求的实际准备/执行边界仍未实现。可选最小 Root 控制握手或分步入口，具体实现由 writer 判断；必须能在真正执行前固定 attempt、指令/permission/schema/实际实现与版本 hash、有限 deadline。无须新通用工作流引擎。
- 当前 parseArgs 返回 object，main 的 output 是该对象，而末尾约第 365–366 行仍 path.dirname(output)、fs.writeFileSync(output,...)。实际 Node path API 对 object 会抛 TypeError，完整 Provider 回合后会丢 observation。请修复这个直接返值消费者，并在不调用 Provider 的现有本地验证中证明最终观察能落盘；不要用一次计费真调用才发现它。
- ACPX package version 的当前定位 path.dirname(path.dirname(acpxEntry))/node_modules/acpx 与 README 的 runtime/node_modules 布局不符，catch 会生成 null。最终 exact-version 资格不得保留这个不可观察绑定；从实际解析的公开 package 路径获得版本并绑定输入/代码，缺失时在派发前指出。

此前 auth/raw stdout 与 bridge 发现已有作者修复进展，排队回合应以最终源码逐项核对，已修复者无需重复编辑；普通 internal status P1 仍明确撤回。Root 最终真实测试前需要可执行的 kit 和可靠准备步骤，不能用报告先宣告通过。

## 当前维护文案的最后两处旧引擎承诺

独立 reviewer 的有限复审已确认 auth phase 和 raw stdout 两个源码 P1 被修复，最终报告将在 `stage-b-acpx-integration-repair-review.zh-CN.md`。其同时指出 `delegation-contract.md:119–124`、`skills/ultra-delegate/SKILL.md:164–167` 仍陈述旧 driver 的 32 条/256KiB early-session buffer 与逐条 sessionId 校验，而新的公共 entry consumer 没有这些实现。原 reviewer 将此列为 P2 文案事实残留，并不要求恢复旧引擎。Root 按已授权 D1Q-04 的同一 maintained-consumer 要求，请 writer 仅作最小真实文案同步，明确实际连接/事件路由边界；不要为保住旧文案增加新协议引擎或 gate。保留已知 SDK sessionId 严格比较差异这一限制。

## 正向资格写回前必须区分现有旧 binary 与此次修复 binary

Root 实际只读运行两者 `--version`，结果完全相同：`zcode-acp 0.1.0+ultra.zcode.0.16.5`。已安装 binary SHA-256 `0e9c8fb2827c566c8a623f3a9706715a221ce7a9b1d3eef32c839937c62420dd`；此次临时修复 binary SHA-256 `2ca338e8d62bfca9de8eeaad08eaad8a96c176e674edb0ddbb9d7495a6b12b8c`。当前 host-profile.cjs:279–283 仅按 bridge_build_marker/runtime_version 比较资格身份，driver identity probe 也只比较 --version stdout，并不比较上述 binary 或 patch bytes。原始负向资格也使用同一 build marker。

当前记录仍 negative，因此这不是声称当前已 fail-open。它是 D1Q-01/02 正向写回前的必备收口：若真实修复路径通过后只把同一 identity 的 dimensions 改成 supported，就会把仍安装的旧构建也选入该正向身份，无法说明 exact 修复版资格。请用已有 candidate identity/version seam 最小区分新旧实际构建（例如真实修复版本标记与所有既有消费者一致；具体方案由 writer 决定），或提供当前源码已有且可证明区分二者的消费者。不要增加通用 attest/sandbox 引擎，不替换已安装 binary，不把当前 negative 批改为 supported。用已有身份探针回归证明旧 binary 声明与新资格不匹配，待 Root 真实观察后才发布新资格事实。原始负向 receipt/identity 保留历史。现有观察在 `stage-b-bridge-version-collision.json`；如 writer 在读到本节前已变更当前版本，请先核对，避免重复改动。

## 真实 launcher 改写后的观察生命周期复查

Root 2026-09-05T19:57:30.286685+00:00 读取 kit SHA-256 `b69c162f3e655d5ed5a1001a5e55a0c5e7cd2d8cff655f98d021b877167a4f84`。实际 launcher 和 final Host wrapper 已接入，原 fake-env/spawn 点有修复进展；以下是该新异步调用路径的直接问题：`runDelegate(...)` 返回 detached worker 的启动 receipt，Worker 此时尚未完成，但当前约 535–546 行 finally 就 sink.close()，随后约 550 行才等 result.json。waitForFile 当前也是同步等待。因此真实 Worker 运行期间 loopback HTTP 接收器不能持续处理请求，“0 hits”失去作为独立有效接收器的观察意义。请保持 sink 在整个真实 worker 窗口内运行并让其事件循环可处理请求，再于确定终态/退出清理时关闭。复用本地 fixture 验证接收器在这个实际等待窗口能接受一次明确的合成正向 hit（不需 Provider 或外部网络）；拒绝资格仍须独立 permission attempt/reject 事实，不把正向 sink 自检计入 Worker 效果。

当前 prepare/execute 还需要如实落实既有单次、输入绑定要求：execute 未显式拒绝非 prepared 状态，且 timeout 参数未与已准备 deadline 比较；记录中的 bundled CLI/canonical patch hash 未在 execute 比较，实际 UBP 源与 result schema/public SDK 版本也尚未在派发前绑定。Root 可拥有最终 canonical attempt/原始源 inventory，不要求重复建引擎；但准备接口必须让 Root 在调用前得到准确的最终 instruction/permission/schema 和实际执行字节/版本及有限 deadline，并不能把已 dispatched/observed 的同 id 当未消耗。请按最小实际消费缺口核对与已有 launcher 的拒绝行为，不新增通用政策或恢复框架。已经修好/有现有消费者保证的点请直接提供可检查依据，不重复编辑。
