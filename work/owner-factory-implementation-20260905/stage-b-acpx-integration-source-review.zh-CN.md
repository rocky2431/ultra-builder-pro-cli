# Stage B：UBP ACPX consumer 集成源码审查

更正后保留 **2 项 P1，无 P0**：认证回退丢失提交前证明、原始事件在过滤前落日志。原 P1-01“普通 ensureSession→startTurn 必定因无 tag status 失败”的断言已撤回，原因与反证保留在下文；只保留另一个具有具体触发条件的 client_operation 兼容事项为 P2。本报告不重复前次 entry 的分块输入与取消缺陷。

这是移动快照审查。ZCode 正在写 UBP，Kimi 正在写外部 entry；本报告不是冻结候选验收。只读源码与现有测试，没有运行 suite、Provider、安装或启动 Agent；只新增本报告。

## 快照与范围

UBP 根目录为 `/Users/rocky243/Context Engineering/ultra-builder-pro-cli`。外部 entry 为 `/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs`。对照已安装 ACPX **0.13.2**，其根目录为 `/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx`；以下 ACPX 行号均相对于该目录。

| 文件 | 开始 SHA-256 | 报告前复核 SHA-256 |
| --- | --- | --- |
| `skills/ultra-delegate/scripts/acp-driver.cjs` | `82879ffb4bdd9c5f818b5631f3116d184117efd372851e67a226b2d2fd503729` | `8bc849b7d593c80d51ed15cd587551026dfeb4e5e664f5162c0e2413f97b5579` |
| `skills/ultra-delegate/scripts/agent-execution-driver.cjs` | `af281fe1fb7ad16f00da913c1480338f3934e27dfb320559d03830fe91fbe3ce` | `43b8a7798a318c7fd6f4e86658f0a0caa5113c6ca5a5723f9b3bbce316ad384a` |
| `skills/ultra-delegate/scripts/delegate.cjs` | `d29b2d0aad5815ec3da71b844bab2875f882dfb0f031078d91318590e0615639` | 同左 |
| 外部 `acpx_delegate_entry.cjs` | `c1c692d8bc54c97d47e99f02477a47bae745b2e69196b414d642c5bc5cd3baad` | `2c0737be23cd2989c10f4d16e2ba434c2de21c36afa054d4d1d10e10b1cde441` |

共享 driver 的变化后已重读 selector、resolver 和 fallback，以下采用复核后的行号。报告初次交付时 acp-driver 又发生变化，复核后更新了关键行号与哈希；当时仍列三项 P1，但后续真实组合反证推翻了 P1-01 的普通路径推断，见更正记录。entry 变化后只核对被本轮消费的 request/result/permission 接口；没有把 Kimi 对前次问题的修改声明为本轮验收通过。测试也在变化，测试行号只绑定本轮读到的内容。

## 已撤回 P1-01；无 tag client_operation 仅保留为 P2

更正历史：初版根据 ACPX `dist/runtime.js:1496–1501` 构造 `{type:'status', text:'session resumed'}`，以及 [acp-driver.cjs:315](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:315>) 拒绝无 tag status，断言普通 ensureSession→startTurn 必然失败。**这个断言错误；此前由该断言产生的 P1 修复要求应撤回。**

遗漏的实际消费者在 `dist/runtime.js:1450–1453`：`emitRuntimeTurnEvent` 先把 payload JSON.stringify，再交 `parsePromptEventLine`。后者在 333–338 通过 type 查 parser，而 340–378 的 `PROMPT_EVENT_PARSERS` 没有 `status`。因此该内部 session-resumed payload 被返回为 null，并未进入 `task.queue`，也没有进入公开的 `turn.events`。不是 entry 的订阅时机或 fixture 初始化绕过了检查；是本轮审查漏读了公开事件归一化这一层。

相反实证来自 Root 复跑既有的 [production-driver-smoke.cjs](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-acpx-production-driver-smoke.cjs>)，没有另写测试或运行 Provider。[Root 记录](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-root-moving-real-entry-smoke.json>) 的观察时间为 `2026-09-05T19:02:50.647859+00:00`，exit code 0；pre/post hash 绑定同一份 UBP driver `8bc849b7…b5579`、entry `/tmp/ubp-acpx-runtime-ppTQ/runtime/acpx_delegate_entry.cjs` 的 `6eaf51eb…5d86`。其 [日志](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/owner-factory-implementation-20260905/stage-b-root-moving-real-entry-smoke.log>) 显示 happy `end_turn`、host output written、writer stopped；multi-denial 返回 `permission_denied`、writer stopped。该证据已经覆盖实际 AcpDriver→真实 ACPX entry→fake Host 的普通组合，不能继续把这条组合验证称作完全缺失。entry 是实现中的复制快照，因此这个通过仍不等于最终冻结 entry 或真实 Provider qualification。

另有具体的 **P2** 触发，与已撤回的 resumed 推断分开：Agent 在 active turn 中请求 client `fs/read_text_file`（合法绝对路径位于 cwd）或 `terminal/create`。ACPX `dist/live-checkpoint-Gw2oGjhe.js:2103–2114、3426–3436` 在 deny-all 拒绝之前发出 client operation；4117–4131 把 operation 交给 `onClientOperation`。`dist/runtime.js:834–846` 将其包装为 `type:'client_operation'`，这个 type 确实有 parser（375），并由 480–490 转成无 tag 的公开 status。因此该 client callback 路径会触及 UBP 315–321 的拒绝分支。

这一项尚未在本轮执行复现，且 client fs/terminal 原本就必须被拒绝；目前可确定的影响是把合法的客户端操作诊断转成 `acp_malformed_update`，可能提前结束拒绝后的报告流程，**不能据此维持普通委派不可用的 P1**。若作者处理此 P2，最小做法是区分此类 runtime 操作诊断与 ACP wire update 校验，复用既有安全事件形状或忽略不需要的诊断正文，同时保留 deny-all。它不需要新协议引擎，也不构成“普通 happy 路径通过前必须修复”的额外门槛。

## P1-02：认证错误不再证明“prompt 尚未发送”，却仍重跑 CLI

位置：[acp-driver.cjs:343](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:343>)、[agent-execution-driver.cjs:668](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/agent-execution-driver.cjs:668>)。

`terminalFromResult` 把任意 failed result 的 error.message/code 含 `auth` 都映射成 `acp_auth_required`（347–357）。entry 的 failed result 可以来自 ensureSession，也可以来自 startTurn、已提交 prompt 或运行中错误，当前 wire 没有失败阶段证明。共享 driver 只看到此 failureType，待 writer stopped 后便重跑 CLI（668–697），并写入 `acpFallback.prompt_sent:false`（706–712）。

失败路径：首个 ACP turn 已提交 prompt、完成部分工具工作，后续返回含 auth 的错误；consumer 判为 pre-prompt 认证失败，顺序重跑同一任务。停止证明只能证明第一位 writer 已停止，不能证明第一轮没有执行工作。结果既可能重复执行，也会留下错误的 `prompt_sent:false` 记录。

这违反现有 [delegation-contract.md:161](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/references/delegation-contract.md:161>)：只有 session/new 在任何 prompt 之前的认证失败可以 fallback，其他 ACP 失败不可重试。HEAD 旧 driver 的认证捕获位于 session/new 的专属 catch（旧文件 676–687）；重构把这个关键前提抹掉了。

最小修复：让公共 entry 为严格包围 `ensureSession` 的失败增加结构化证据，例如 `error.phase:'ensure_session'`，其含义必须是 `startTurn` 从未调用；进入 startTurn 后的错误不得借用该 phase。UBP 仅在这项证明成立且错误确认为认证类时允许原有 fallback，其他保持 failed/unknown。优先明确 ACP 错误，文本匹配即使保留也只能处于该阶段限制之内。不得用全文 regex 猜失败阶段，也不应直接删除整个已承诺的 fallback 来掩盖不等价。

最小判定证据：保留“ensureSession 认证失败只 fallback 一次”的正向路径；加入“prompt 已提交后出现 auth 错误，CLI 未启动且没有 prompt_sent:false”的反向路径。两个实际作者分别修改 entry metadata 与 UBP consumer，Root 统一复核。

## P1-03：原始权限/事件行在安全投影之前被持久化

位置：[acp-driver.cjs:452](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:452>)、[acp-driver.cjs:676](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:676>)。

每条 entry JSON 在解析和安全投影之前被 append 到 `protocolStdout`，最终整个 capture 写到 `stdout.log`。`projectRuntimeEvent` 在 295 丢弃 thought，或 journal 投影剔除 rawInput/rawOutput，都发生在原始内容已经进入该 capture 之后。因此过滤只保护 `events.jsonl` 与 host_output，并不保护 stdout.log；原始 permission request 同样被记录。

当前已有具体输入：`tests/fixtures/fake-acp-agent.cjs:239–250` 的 happy 路径发送 thought 文本以及含 token 的 rawInput/rawOutput；85–99 的权限请求携带 rawInput。`tests/acp-driver.test.cjs:139–145` 只扫描派生 events 文件，所以不能发现 stdout.log 中的同一正文。HEAD 旧 driver 没有向 protocolStdout append 原始行，thought 在旧 516 直接返回，这属于新 consumer 的落盘回归。

已接受的 [R2:441](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md:441>) 要求 bounded trace 不包含私密 chain-of-thought；[R2:531](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/docs/wip/ultra-builder-pro-vnext-target-architecture-r2.zh-CN.md:531>) 要求 secret 值不进入日志。

最小修复：原始 permission 只在 IPC/内存中交给现有权限函数；其他原始事件只在内存中完成输出提取和投影。日志复用现有安全形状或固定诊断，不保存 thought/raw tool 参数，不新增泛化脱敏引擎。最小判定是将既有 canary 的无残留检查扩展到 stdout.log 等本次新增的落盘位置，而非只检查 events.jsonl。

## 已核对的实际边界及 P2 兼容事项

### 选择、安装与打包

- `selectExecutionDriver` 在候选可用后检查 `resolveAcpEntry`；entry 缺失时返回明确 `acp_entry_unavailable` 的 CLI 选择（共享 driver 599–605）。`delegate.cjs:1020–1028` 仍对实际所选 transport 做 enforcement admission，因此未发现这里绕过准入的 fail-open。
- resolver 的 macOS/Linux 默认路径为 `~/.local/share/agent-delegation/runtime/acpx_delegate_entry.cjs`，显式路径必须绝对且是文件（共享 driver 630–650）。审查时本机默认文件 **不存在**。外部 `scripts/install_user.py:230–248` 已把该 entry 加入 runtime 复制清单，277–280 记录 entry hash；它仍是未安装的在建实现，不能当成实际已可用能力。
- `package.json` 的 files 清单包含 Skill-local scripts，`adapters/_shared/plugin-core.cjs:24–33、178–218` 会安装/检查并从安装目录调用共享 selector。未发现普通产品路径保留第二套 JSON-RPC/session/turn 引擎；通用生命周期交给外部 entry/ACPX，UBP 剩下自己的权限、结果和停止边界。测试里的 fake entry 是 stand-in，不是 shipped runtime，但其通过不能证明实际组合兼容。
- **P2**：当前 Node 支持声明不一致。UBP `package.json` 为 `>=22.0.0`，driver 418 使用当前 `process.execPath` 启动 entry，而 ACPX 0.13.2 声明 `>=22.13.0`。resolver 只判断文件存在，不检查当前执行该 entry 的 Node/runtime 条件。发布前需明确并核对这条外部运行前提，不应把选中 acp 当成可执行证明；这不是本机 Node 的已复现运行失败。
- **P2**：Windows 默认路径不一致。resolver 643–646 使用 APPDATA，而实际外部 installer 231 对所有平台固定写 `home/.local/share/agent-delegation`。若这次承诺 Windows 默认发现，则应对齐真实 installer；若当前不支持，应明确范围，不能以手工 override 的 fixture 证明默认安装路径可用。

### 环境和 writer 边界

`delegate.cjs:928–934` 先构建角色 env；`host-profile.cjs:97–112` 只给 worker 追加三项 `UBP_DELEGATE_*` packet 路径。新 consumer 379 使用 `descendantSpawnEnv(spec)`，418–425 直接把该 env 交给实际 entry spawn。ACPX `dist/live-checkpoint-Gw2oGjhe.js:3181–3191` 再从 entry 环境创建 Host，其普通 spawn 没有另建 detached group。没有发现新 glue 把完整父环境重新混入 Host。

entry 现在是被观察的 writer-tree root：`launchSpec` 392 与实际 spawn argv 一致，launching/start observation 保留；超时/取消由 553 的 requestTermination、581 的 shutdown 和 644 的 termination 分支请求取消，再终止相应进程组。最终安全结论仍由 `delegate-worker.cjs:430–442、453–466` 的 boundaryProof 控制；alive/unknown 会覆盖成功或取消结果并保留 fence。entry 的 cancelled/completed result 没有直接释放 fence。真实 Host 自行派生进程的完整停止仍需 Root 的 Host qualification，源码不能代替这项证据。

### raw permission 与 advertised client callbacks

consumer 478–487 把 entry 的 `message.request.raw` 原样交给现有 `permissionDecision`，只把选中的 optionId 回送；239–281 的 allow_once/真实 writable root/拒绝规则仍在 UBP，未转交 runtime 做语义判断。当前 UBP 与 ACPX 都取第一项同 kind option，未发现现有消费路径因 exact optionId→kind 转换而放宽授权。

ACPX 广告 fs/terminal 为可用（`dist/live-checkpoint-Gw2oGjhe.js:4334–4341`），但当前 entry 强制 deny-all：client fs read 在 2114 拒绝，write 在 2172–2176 拒绝，terminal/create 在 3436、3619–3623 拒绝；它们没有调用 native `onPermissionRequest` 来绕过拒绝。native Host 的权限请求才走 raw callback。因此当前没有这条客户端执行路径的 fail-open 证据。

**P2 文档/验证不等价**：`delegation-contract.md:94–97` 仍写“广告无 fs/terminal”，fake entry 的 initialize 也仍发送 false；这不能用来证明真实 ACPX 的广告行为相同。应准确记录“真实广告存在、客户端执行 deny-all、native 工具另经 UBP 权限决策”的已选边界，并通过真实 entry 验证拒绝。无需重建旧通用协议引擎，也不应向 runtime 传不存在的能力开关。

## 交付前最小跟进

先由实际作者修复保留的两项 P1，再冻结 entry 与 UBP consumer 的组合，核对认证阶段反例、日志无 canary 和客户端 fs/terminal 拒绝。Root 已有真实 entry + 实际 AcpDriver 的 happy/multi-denial 通过证据，不能忽略；冻结后的变更若影响这条路径，再做相应增量核对。安装器已添加文件不等于已安装，默认发现与 packed/installed Skill consumer 需要单独核对。此后再把 Host qualification 与停止证明合并判断 Stage B；该 moving fake-Host 组合通过不替代最终冻结候选或真实 Host 的 qualification。
