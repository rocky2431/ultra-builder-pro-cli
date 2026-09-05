# CC 检查修复独立 Review

结论：接受这三份测试文件的修复。Codex 独立运行正常 `TMPDIR=/tmp npm run verify:release`，exit 0，724/724 Node、104 Hook、0 vulnerabilities；327.214s。原来的两次失败日志均保留。源文件 readback 与最终 diff 确认产品源码没有被这次修复改动。

缺 host 用例原本在结果可读后立即推断 lock/fence 已释放，混淆了终态发布与 finally 清理。新 helper 等待 receipt 指定的 worker 退出，再执行原始释放断言；同根因的成功和 cancel 站点一起修正，没有提前释放 fence 或删除断言。

ACP hang 的后代创建移到 fixture 启动时，cancel 仍在 prompt 中创建，以保留不同生命周期覆盖。deadline 调为 1 秒，仍需实际观察后代先活着、超时后退出；没有后代时会失败，不会空验收通过。它仍依赖进程在预算内启动，不能由一次全绿宣称没有任何调度竞态。Writer 报告的样本上界一处为 98ms、另一处为 72ms，因此这里不采用“最大 72ms／13 倍余量”的定量主张。

证据：`.ultra/.runtime/owner-factory-implementation-20260905/stage-a-cc-races-independent-verify-release.{json,log}`；实际作者报告 `stage-a-cc-verification-races-handover.md`。这项接受仅闭合本阶段的检查失败；不改变 D1 的原有三个 P1，也不代表阶段 A 的真实用户旅程已经全部通过。

回执来源更正：caller 预留的 `stage-a-cc-verification-races-receipt.json` 路径最终存放的是 Worker 自写检查摘要，不能当原生回执。Codex 将原字节保留到 `stage-a-cc-verification-races-worker-summary.json`，再从 agent-delegation 原生 run 目录恢复真正回执，并记录来源与双 SHA（`stage-a-cc-receipt-provenance-correction.json`）。真实 delegation `1413f6babb6b42c7a2e6905e34885337` 为 success/end_turn、1803.457s；其事实不来自模型自报。后续任务将明确禁止 Worker 写 caller-owned receipt 路径。
