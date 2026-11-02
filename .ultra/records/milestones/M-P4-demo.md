# M-P4 门记录（控制者写，评审在 M-P4-review.md 及 -1、-2、-3）

1. 手动试什么：合并门。门评审第 2 轮用三个“先写红测试”的并行写者，在同一个里程碑里依次合并，三次都通过，未完成的工作只给警告。各种伪造都被拒绝（`truth-changed`），包括：
   - 文件名或目录名的大小写变体（`.ultra/ledger/Milestones.jsonl`、`.ULTRA/…`）；
   - 符号链接（指向 ledger，或者放在 records 下）；
   - 伪造的计划日志行；
   - 删除记录；
   - 调用环境里带 `GIT_LITERAL_PATHSPECS` 时的伪造。
2. 旅程检查：C-engine-p4 为绿；关闭前先用 `ubp check --all` 重跑一遍。
3. 进度行：见关闭前的 `ubp status`，在下面的提交说明里。
4. 计划变更：`.ultra/ledger/plan-log.jsonl` 里 M-P4 有 1 条，是 REQ-P4-merge 的改写：合并门改为只要求“已完成的工作保持绿”。这一条属于缩小，已代答批准，记录在 `approvals.jsonl` 的 `M-P4/REQ-P4-merge`。
5. 门评审：
   - 第 1 轮 revise：B1 并行写者合不进来；B2 分支能伪造关闭和批准。
   - 第 2 轮 revise：仍能用大写 `.ULTRA/` 目录伪造。
   - 第 1 次核对 revise：修复引入了 C1，继承的 pathspec 环境变量会让检查失效。
   - 最后一次核对：accept（`M-P4-review.md`），没有阻断。
   - 最后两处修复各一行，都由控制者写，测试先红后绿（偏离 12）。规则 2 的边角情况和 N1、N4、N5 记为上限。
6. 计划外介入：本里程碑没有新增。
7. 代答：是。Owner 没有看演示。REQ-P4-merge 的放宽、两次“授权修复并核对”，都是代答。合并门目前只在测试夹具上跑过，P5 集成会是它第一次用在真实项目上（v6 自己的分支）。
8. 同属 P4 的实验：
   - A/B/C 默认分工实验：结论在 `.ultra/records/experiments/p4-abc/RESULTS.md`。
   - P5b 进化门槛实验：结论是拒绝（未证实），在 `.ultra/records/experiments/p5-evolution/`。
