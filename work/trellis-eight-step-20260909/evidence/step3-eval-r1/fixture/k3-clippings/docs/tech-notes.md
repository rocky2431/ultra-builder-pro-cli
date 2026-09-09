# 工程事实记录

本文件记录项目级工程事实：从代码、数据或运行中确认、需要在后续任务中继续使用的事实。每条注明日期与出处（观察到它的文件或运行）。任务专有的临时结论不记在这里。

## 2026-08-20 库存为追加式 JSONL，id 由 store 分配

出处：`docs/decisions/2026-08-20-append-only-jsonl.md`、`src/store.js`。
库存每行一条 JSON；`appendEntry` 按现有行数分配 `entry-0001` 递增 id，写入方传 book/author/time/text，不传 id。
