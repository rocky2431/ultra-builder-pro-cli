# Stage B public ACPX entry 最终独立源码审查

2026-09-06。**接受本次 public entry 分项，未发现当前需要阻塞合入的 P0/P1。** 本结论只覆盖所审四个消费者与给定 pinned runtime 的对应路径，不代表 UBP 全部集成完成，也不代表真实 Host、完整 writer 停止或无人值守生命周期已取得资格。

## 范围与先验验证

- 工作树：`/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill`；HEAD/base 为 `f9dc8b50fb24a1d83e7ad77dedaeda4bdc5c5166`。审查 README、installer、完整新增 entry、完整测试文件，以及 Kimi 交接和红/绿原始日志。
- 按任务要求先读取 Root 的[最终测试 JSON](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-root-final-entry-tests.json>)与[日志](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-root-final-entry-tests.log>)：进程 exit 0、54 项通过、没有跳过；进程用时 40.419 秒，unittest 用时 40.313 秒。四文件 pre/post SHA 与本次审查读取一致；日志 SHA 为 `f5a09f5649b5d7bb9fa9f2f0069331c47334c9ba71529a5e31043f57feadc34d`。
- 本 reviewer 未重复测试、未调用 provider、未安装、未写实现/测试或启动 Agent；只写本报告。只读源检查开始于 `2026-09-05T19:07:07.443749+00:00`，结束于 `2026-09-05T19:13:45.898959+00:00`，四文件哈希不变。

## 修复与实际消费者核对

| 路径 | 核查结论与具体证据 |
|---|---|
| 公共 runtime 与安装路径 | [entry:162](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:162)只通过 `require('acpx/runtime')` 使用公开 API；本机 package.json 为 0.13.2 且明确导出 `./runtime`。没有第二 ACP/JSON-RPC engine，没有从私有带哈希文件名的 bundle import。本地 package.json/package-lock 与 f9dc8b5 逐字未变。入口控制一次调用、权限转发与结果输出，协议运行仍由 ACPX 承担。 |
| UTF-8/NDJSON 与权限等待 | [entry:129](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:129)使用一个持久 StringDecoder 和行缓冲处理首请求及后续决定。[第 176 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:176)的 EOF 收尾与第 237 行起的幂等 settle 清除 waiter；公开 callback 的 abort signal 也能结束待决 Promise。未知 option 返回 reject，未决定/EOF 让 pinned deny-all 接手；没有观察到 fail-open 分支。现有测试覆盖多字节拆分、9 字节分片决定、权限等待中的 EOF。 |
| 取消与真实终态 | [entry:302](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:302)在 ensureSession 前建立 sticky abort；初始化返回后先检查取消，再进入 startTurn。信号同时传给公开 `startTurn`，与 [pinned runtime:1181](/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/runtime.js:1181)的已取消时禁止提交路径相符。promptStarted 因取消拒绝后读取 canonical result，不改写成 failed；未获得终态的宽限路径保留 `result_timeout:true`，没有宣称后代已停止。 |
| 有依据的失败 phase | [entry:336](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:336)在调用 startTurn 前设置边界；[第 376、380 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:376)分别覆盖 resolved failed result 和抛错路径。`ensure_session` 只表示 startTurn 从未被调用；进入边界即为 `turn`，不声称工具一定已执行，也不从 auth 文本推断阶段。两个测试以相同认证错误文案对照 session/new 与 session/prompt，实际夹具请求日志分别证明无 prompt/有 prompt。缺失 phase 仍无 before-prompt 证明；UBP 是否据此正确控制 fallback 属于其消费者的独立审查。 |
| 输出与关闭 | [entry:387](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:387)先等待事件排空，最后通过 stdout write callback 刷净 result 后退出。pinned [queue:566](/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/runtime.js:566)会先消费已有元素再结束，[cleanup:1571](/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/runtime.js:1571)关闭 queue 而非清空。[entry:401](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:401)取消 discardPersistentState，符合 [runtime:1678](/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/runtime.js:1678)普通 close 只释放 retained owner、discard 分支才调用 backend close 的实际路径；没有保留导致二次启动的旧调用。 |
| 安装器与 README | [installer:238](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/scripts/install_user.py:238)把 entry 纳入原有备份/原子复制列表，第 279 行记录摘要；没有修改 0.2.1 Kimi 安装位置或 env 修正。`git diff <base>` 在该文件只显示这两处增量；README 是原文追加，既存 0.41.0 Kimi 路径说明保留。[README:221](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/README.md:221)命令指向当前测试；测试复制当前 entry 到临时目录并链接已安装 node_modules，运行真实公共 ACPX runtime 与本地假 ACP agent，不是替身 runtime。 |

权限 first-kind 限制已诚实收窄：入口先核对实际 optionId，再输出该 option 的 kind，ACPX 选择该 kind 的第一项。虽然 pinned runtime 对 allow_once 有回退顺序，但当前入口只有找到实际 allow_once 选项才输出 allow_once，因此该路径已有同 kind 选项，不需要、也没有证明会升级为 allow_always。不能推广为可选中同 kind 的任意后续 optionId。

## 原始失败与断言保持

读取 `git show 440579b1^3:tests/test_acpx_delegate_entry.py` 后，以 Python AST 提取原有七个 test 方法并逐个比较：六个方法原样保留；`test_agent_crash_reports_a_failed_turn` 只追加 `phase == turn`。另新增九个方法，最终入口测试共 16 项。被审 ZCode 草稿 entry 的实际 SHA 为 `c1c692d8bc54c97d47e99f02477a47bae745b2e69196b414d642c5bc5cd3baad`；未修改或删除该 stash。

原始 [red-probes-against-draft.log:58](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/docs/research/2026-09-06-acpx-consumer-repair/red-probes-against-draft.log:58)记录第二次 initialize；[第 74 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/docs/research/2026-09-06-acpx-consumer-repair/red-probes-against-draft.log:74)记录 burst-0059 被截断为非法 JSON。两项原 P2 因此有当前验收失败反例后才修复，未通过放宽断言变绿。同一日志还保留 UTF-8、取消及 waiter 失败。后续 [red-phase-probes.log](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/docs/research/2026-09-06-acpx-consumer-repair/red-phase-probes.log)有三项 phase 断言失败，[green-phase-fixed-entry-tests.log](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/docs/research/2026-09-06-acpx-consumer-repair/green-phase-fixed-entry-tests.log)为 16/16；Root 独立最终 54 项验证与这些最终字节一致。夹具现在对权限决定真正回复 prompt terminal，改正了原来依赖超时的行为，七项原断言未因此删弱。

## P2 与未证明范围

1. **交接的整体 10 秒说法不准确。** [handover:79](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/docs/research/2026-09-06-acpx-consumer-repair-handover.zh-CN.md:79)称 teardown 整体 10 秒；实际 entry:388 与 400 是先后两次 race，event drain 和 runtime close **各**有 10 秒上限，两段可合计约 20 秒，之外还有取消 grace、初始化等待及最后输出刷新。没有全流程统一 10 秒保证。最小处理是按此事实解释/修正文案，不为单纯措辞重构 runtime。
2. **旧 sessionId 严格比较不能归功于新 SDK 路径。** 已读取 pinned 实现：`createConnection → handlePermissionRequest → tryHandlePermissionRequestWithHost` 把原始 permission 交给 callback；`cancellationSignalForSession` 只按传入 ID 建/取 controller。[runtime.js:805](/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx/dist/runtime.js:805)按连接 owner 的 activeTurn 路由 update，没有对照 notification.sessionId。内部 client 的 `handleSessionUpdate` 也没有该比较；elicitation 的独立 session 检查不能用来证明 permission/update 同样检查。对应内部源码仅作为审查证据读取，入口没有导入其私有路径。未发现当前真实 Host 混入跨会话请求造成破坏的反例，故按 P2/职责变化保留；Root 已安排 UBP 文案同步。不能说“换 SDK 后旧的逐项比较自动保留”，也不据此新增第二协议引擎。
3. **生命周期资格仍由当前证据限定。** ensureSession 无公开 abort 输入，取消后立即停止初始化的能力未实现；初始化超时与完整进程树/后代停止仍归调用方。startTurn 到 prompt 提交的细小取消窗口有源码支持，但没有外部夹具专项确定性观测。事件排空超时会诊断可能不完整；stderr 刷新、输出背压和全体后代停止都不能从绿色套件推导。内存 store 限定入口自身的 runtime record，不承诺被委派 Host 不写其原生会话文件。

本 reviewer 的只读 `rtk git diff --check <base>` 通过。未对 P2 编写代码、增加测试或重启 provider。

## 审查前后一致的 SHA-256

| 文件 | SHA-256 |
|---|---|
| `README.md` | `923f7df2d0d189f608cae7962ccdc9767f180005fe4cb950b2c9444c6e445ff8` |
| `scripts/install_user.py` | `f4aeecb60816c74e362ee0e8d630fafc02fee86801f1756503bbf25bc74ec557` |
| `runtime/acpx_delegate_entry.cjs` | `99049a249b8bf719914601cb82869692379e5a8bba8fff1ad51d796fe5a4c6bb` |
| `tests/test_acpx_delegate_entry.py` | `a1a76492c878b061a74ed67d03bbd003dacfbf64ecdf4b2ccdd75c757a31a949` |
