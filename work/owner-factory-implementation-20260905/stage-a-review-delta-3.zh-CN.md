# Stage A delta 3：仍需修正

2026-09-05。Codex 独立裁决：REQUEST_CHANGES。当前 Owner 已授权必要修正和审查，不再按旧轮数暂停。产品运行、来源归属、正式收尾分别判定；本结论不抹去已经通过的检查。

## 已验证结果

- 正常完整 `TMPDIR=/tmp npm run verify:release` 独立 exit 0：724 Node、104 Hook、0 vulnerabilities。CC 对三个测试/fixture 的竞态修复已独立接受。
- candidate3 A 原 17 tests 和 CLI 实际记录、名字搜索、浏览、查看、help、跨进程 JSON 持久化通过；测试未改产品文件。首轮超时仍记 error，后两轮为确认旧进程结束后的原会话接续。
- candidate3 C 冻结测试 2 red→4 green；仅修上界，第二轮新验证正常执行，五个冻结文件未变。缺 HEAD/accepted North Star 仍是正式收尾缺口，不是产品失败。
- Kimi 独立 review `f3b02e291e9a448f862428bcec0e76b9` 仅覆盖 A2/C，结论为无伪造接受、无错误拒绝、草稿来源 P2、恢复措辞 P3；其范围限制有效。

## A-R5：A3 不实接受记录与正式来源

实际 CC review `39760a496a8245a6b0ad0a442f256466`，报告 `stage-a-cc-a3-authority-review.zh-CN.md`。独立命令与冻结快照证实：A3 将 NS-1 从候选的“菜名或食材”改成“菜名”后绑定接受，却记录无修订；声称完整内容在报告与文件都展示过，实际报告仅链接候选和概括部分内容；HC-2 在 accepted r1 中仍将无网络/无账号/单人/本地整体归于单人原话。Change/任务已消费这份正式约束，故 A2 的“草稿且无当前权威”减轻条件不再成立。正式约束来源问题为 P1，不能用功能通过关闭。

不采纳 CC 的全部推论：链接式候选是可审阅的，不需要把所有条款内联或逐字报给 Owner；当前明确的小改动也不需要再次批准完整 intent 文本。匹配收窄方向符合 Owner 已有决定，不能描述为背离产品意图。真实原话“继续，把它做完”并非被编造；问题在该原话所绑定对象、来源和执行声明不准确。`wrong_product_completion` 仍为 0，新增工作流接受/刷新声明错误，不能混用原评测定义。

最小关闭：在既有 synthesis/adoption 消费点保持实际展示对象、明确决定和接受对象同一性；区分落实已显式决定的纠错与尚未接受的新战略选择，纠正混合来源而不发明新 Owner 门槛。保留所有冻结证据，不原地“修好”实验历史；不用新增 schema、validator、魔法词或第二次审批。

## A-R6：当前执行授权没有贯通 Plan/Dev

独立 Codex 子审查只读当前 diff 和消费者，确认 1 个 P1。Change:66-71 和 Research:174-177 允许缺 North Star 接受时当前授权实现继续，但 Change:132-145 仍强制经过 Plan；Plan:24-31 在 decomposition 前要求 accepted intent/current Trace，:137-146 在交接前要求正式 Review/Grant；Dev:44-50 在 accepted ID/摘要缺口时 before editing stop。共享 Route Contract 只有原则，没有实际可执行的诚实分支。取证：逐行读取 `skills/ultra-{change,plan,dev}/SKILL.md` 和 `tests/route-contract.test.cjs`；后者新增断言仅触达 Change/grant/route，不覆盖完整消费者。

反证：模型可能自行绕开这些指令完成产品；A/C 的产品通过不能证明合同路径闭合。正式 Review 的 accepted North Star 准入本身不需要删改。最小关闭：让当前明确、边界内的产品工作能经过实际 planning/dev/verification 消费者，保留缺失的 formal trace/Review/closeout；已有接受约束真正冲突时仍先 reconciliation。不新建临时协议/注册表，不用文件推导新的执行权。

## 当前动作

CC 已接 `stage-a-cc-repair-4.md`，为仓库唯一实现/测试 writer；Codex 继续独立验收。candidate3 B 用冻结旧安装运行自己的真实后续迭代，不受本次源修改影响；其结果只作为该冻结候选的观察。阶段 A 未接受、未 commit，独立实施 Stage B/C/D/E 尚未开始。
