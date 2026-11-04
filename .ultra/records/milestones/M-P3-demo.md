# M-P3 门记录（控制者写，评审在 M-P3-review.md）

1. 手动试什么：M-P3 的旅程就是 R 上的 P3 出口。按 `ubp-sample-shortlink/.ultra/records/p3/transcript.md` 的出口核对表，每条注入（L1 新增、L1 修改、L2、L1 缩小）后看 `ubp status` 和 `ubp check` 的变化。
2. 旅程检查：C-engine-p3 绿（`ubp check --all` 在关闭前重跑，见下方进度行）；R 上 C-journey-m2 最近一次干净通过是 2026-11-01T16:48:13Z。
3. 进度行：`M-P3 · 3/3 绿 · 下一项 里程碑门 · 本里程碑计划变更 2 次`。
4. 计划变更：见 `.ultra/ledger/plan-log.jsonl` 里 M-P3 的两条。
5. 门评审：accept，5 条 should-fix、5 条 nit。处置：S1、S4、N1、N2、N3（演示部分）、N4 在 R 上追加更正（`7177b6b`）；S3、N3（方法部分）进 P4 的方法文本；S2、S5 和上限记入 `.ultra/records/deviations.md`。
6. 计划外介入：2 条，都是 Owner 主动来问（见 `owner-touches.md`）。
7. 代答：是。Owner 未看演示；评审要求告诉 Owner 的 5 件事在 `deviations.md`，验收时一并确认。
