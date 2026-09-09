# Stage B：新 ACPX 入口初次源码审查

本轮发现 **2 项 P1**，另有输出收尾与后端会话关闭的 P2。结论针对 ZCode 正在实现、尚未接受且尚未接入 UBP 的入口，不能据此宣称 Stage B 已完成或实际 Host 已验证。

审查对象：`/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs`，SHA-256 `c1c692d8bc54c97d47e99f02477a47bae745b2e69196b414d642c5bc5cd3baad`（10,956 bytes）。审查期间重复核对未变化。对照实际已安装 `/Users/rocky243/.local/share/agent-delegation/runtime/node_modules/acpx` 的 0.13.2 公共声明和实现；以下简称该目录为 ACPX。只读源码，没有执行测试、真实 Provider 或安装操作；现有 7 项入口测试的通过记录不等于本轮复测。

## P1：stdin 没有稳定的 UTF-8 与行边界

位置：[入口第 112 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:112)、[第 209 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:209)。

- 首请求的 `buffered += chunk`（115）没有设置流编码，分别把 Buffer 解码后才拼接。中文 prompt 或路径的一个 UTF-8 字符跨两个 chunk 时，会成为替换字符；JSON 仍可通过解析，实际任务内容已改变。
- 权限回复在每个 `data` 回调重新创建 `buffered`（210），遇到没有换行的尾段便退出（213），并不保留尾段。合法的单条 `permission_decision` 跨两个 chunk 时，首段丢失，第二段通常 JSON 解析失败后也被忽略（220–221）。`decisionWaiters` 因而一直未完成，当前 UBP 已准许的 native 工具也无法继续。
- 回调只接收 `req`（143），没有使用 ACPX 传入的 abort signal，也没有 stdin EOF 对 pending waiter 的收尾。ACPX `dist/live-checkpoint-Gw2oGjhe.js:4973–4995` 会直接等待该回调；`deny-all` 是返回/异常后的权限兜底，不能使一个永不 settle 的 Promise 自动返回拒绝。

最小跟进：使用一套持久的 UTF-8 行解码器，贯通首请求和后续决策，保留跨 chunk 尾段；通过现有 callback signal 和输入关闭事件结束 pending waiters。补两项窄验证即可：一条合法权限回复被拆成多个 chunk；中文请求在多字节字符内部拆分后原文不变。无须添加协议引擎。

## P1：初始化期间收到取消，仍可能在取消后提交 prompt

位置：[入口第 197 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:197)、[第 237 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:237)。

失败路径明确：入口先发出 `started`（234），随后等待 `ensureSession`。此时 SIGTERM/SIGINT 只 resolve `cancelSignal`，因为 `turn === null`，不会调用 turn.cancel（197–205）。初始化返回后，243–249 无条件调用 `startTurn`，没有检查已取消状态，也没有传入 signal。取消宽限直到 `await turn.promptStarted` 之后才建立（250、265–268）。因此先取消、后提交 prompt 的情况可达，prompt 甚至可能在宽限结束前完成并被报告为 completed。

另一个同源收尾问题是 `promptStarted` 在提交前取消时会 reject，入口的通用 catch（272–280）直接制造 failed，跳过实际 `turn.result` 的 cancelled 结果。ACPX `dist/runtime.js:1180–1196、1503–1507` 明确实现了这种前置取消语义。

最小跟进：在异步初始化之前建立可保留的取消状态/AbortController，取消后不再启动新 turn；使用公开 `startTurn.signal`，并让已有 turn 的 canonical result 决定其终态，而非把 `promptStarted` 的取消 rejection 改写为 failed。取消计时应覆盖初始化等待后的处理和结果收尾，不能只覆盖 prompt 已开始后的 `turn.result`。公共 `ensureSession` 输入没有 signal（`dist/runtime.d.ts:22–36`）；应如实保留“初始化本身的中断仍由进程/调用方边界处置”这一限制，不虚构 runtime 支持。最小验证是延迟 ensure 返回时发出取消，确认随后没有 prompt 提交。

## P2：输出消费未完成便关闭 stream 并强制退出

位置：[入口第 251 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:251)、[第 288 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:288)。

事件 pump 的 Promise 没有保存或等待；终态后先输出 result，再 `closeStream`，最后 `process.exit`。ACPX 的 result 在记录和 client 清理后完成，不承诺外部 iterator 已消费完毕（`dist/runtime.d.ts:237–247`）。其队列关闭仍允许排空（`dist/runtime.js:558–578`），但 `closeStream` 会直接 `queue.clear()`（1165–1169）。如果还有事件积压，尾部事件可被丢弃；此外 `emit`（45–47）不处理 stdout backpressure，强制退出也没有等待已排队字节写完。actual result 只包含状态/stopReason/error，不能补回被丢弃的 agent 输出。

这是源码可见的完整性缺口，尚未在本轮复现具体截断数量，按 P2 报告。最小跟进：保留并等待正常完成的事件消费 Promise，保证完整事件位于最终 result 之前；退出前完成 stdout 写入。取消期限内不能排空时，应明确报告输出不完整。用末尾集中输出/慢消费者的窄 fixture 判定，不需要另造输出系统。

## P2：oneshot 清理会额外启动 Host，并延长取消后的返回

位置：[入口第 284 行](/tmp/ubp-factory-stage-b-l7dd0y3s/agent-delegate-skill/runtime/acpx_delegate_entry.cjs:284)。

正常 oneshot 终态已由 ACPX 关闭 client（`dist/runtime.js:915–931、1539–1564`）。入口随后 `runtime.close({ discardPersistentState: true })` 走的是关闭后端 session 的路径（1660–1685），并非仅释放内存 Map。原 client 已关闭时，`readRetainedSessionOwner` 拒绝复用（876–888；`dist/live-checkpoint-Gw2oGjhe.js:4190–4191、4717–4742`），继而创建新 client，调用 `client.start()` 后才检查 Host 是否支持 `session/close`（`dist/runtime.js:1707–1729`）。

这不会提交第二个 prompt，但确实多一次 Host 启动。入口等整个 finally 完成才输出 result；新启动/关闭等待使用请求 timeout，而不是 10 秒 cancel grace，因此“宽限结束后迅速给出结果”的描述不成立。最小跟进：该内存、oneshot consumer 若只需释放自身资源，使用不要求清除后端持久 session 的 close；如另有明确的后端 session 删除要求，应显式说明该效果及其独立期限，不能把它混作必然的轻量清理。

## optionId：当前 UBP 路径对齐，通用声明需收窄

入口 161–172 先按 exact optionId 找 option，再只返回其 kind；ACPX 公共 permission decision 只接受 outcome，没有 exact optionId 字段（`dist/session-options-DwRDODlr.d.ts:6–20`）。运行时再按 kind 选第一项（`dist/live-checkpoint-Gw2oGjhe.js:2229–2233、2441–2450`）。因此任意 consumer 选择第二个同 kind option 时，入口不能保持 exact optionId。

但这 **不是已证明的当前 UBP P1**：[现有 permissionDecision](</Users/rocky243/Context Engineering/ultra-builder-pro-cli/skills/ultra-delegate/scripts/acp-driver.cjs:230>) 的 230–277 同样选第一项 allow_once，或第一项 reject_once/reject_always，没有任意选择第二项的路径。当前允许路径存在 allow_once 后才返回其 optionId，因此 ACPX 的 allow_once→allow_always fallback 在该路径上不可达。没有证据支持为此修改 ACPX 库或新增 transport。

最小跟进：把入口 14–18、139 的通用 exact-ID 宣称收窄为实际支持的 first-kind selection 语义；如保留面向任意 caller 的 exact-ID 接口，应拒绝无法保持同一 optionId 的选择，而不是暗中重选。UBP 接线时复用现有 permissionDecision，不把语义裁决搬入 runtime。

## 环境边界：接线验收项，当前不另立缺陷

`createAcpRuntime` 所用 sessionStore、agentRegistry、deny-all、callback、timeout 等是 0.13.2 公开支持的参数（`dist/runtime.d.ts:292–315`）。内存 sessionStore 没有文件写入，入口没有设置 `sessionOptions.env`；这只能说明该 store 不持久化，不能推出 Host 不会使用其自身文件。

ACPX 启动 agent 时复制入口的 `process.env`（`dist/live-checkpoint-Gw2oGjhe.js:3138–3149、3181–3184、4280–4291`）。因此 UBP 必须以最终 descendant/Host 的净化 env 启动该 entry，不能传入 worker 专用的 packet path 环境或完整父进程环境，再期待 ACPX 替它过滤。当前 UBP 接线尚未完成，此项是必须落实的消费边界，不重复认定新的 env bug。真实 Host 完整停止与进程环境仍由实际消费者及其 OS-launch 验证负责。

本轮只新增本报告；没有修改实现、测试或已有审查文档。建议 ZCode 先修两项 P1，并处理上述最小收尾问题，再由 Root 针对实际接线与冻结候选复审。
