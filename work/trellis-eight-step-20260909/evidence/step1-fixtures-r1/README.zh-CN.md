# r1 快照：被 Root REQUEST_CHANGES 的评测协议草案

保存目的：让被否决的协议事实保持可见，不被后续修正覆盖。
对应 Root 意见书：`work/trellis-eight-step-20260909/step1-fixtures-correction-mission.md`。

SHA-256 见 `SHA256SUMS.txt`：

- `trellis-daily-20260909.json` — `299a80b78f822534682da6dd5b591d0dee8ebc89e3f3b9236745500655107795`
- `trellis-daily-eval.test.cjs` — `f1f37e3db9904853f301d0e9e3554c5bfcf00d5852de054520f85d2689f66ae6`
- `step1-fixtures-handover.zh-CN.md` — `1cf7b78bc796e8e9c768c661c0b07c4415cba8684c9500c7a2ea2c07b165b04b`

## 字节状态说明（必须如实读）

本快照取自 Root 意见书送达时磁盘上的状态，**不是** Root 审阅时的全部原始字节：
在读到意见书之前，我已因发现并发 writer 在 `tests/owner-journeys-eval.test.cjs` 里记录的
`--test test/` 目录参数移植性问题，把 `runFixtureSuite` 与四个 fixture 的 `package.json`
测试脚本改成显式列出测试文件名（正是意见书第 5 条要求的方向）。因此：

- 被否决的**协议内容**（F2 澄清轮数上限、web UI 禁令、"你判断就好"覆盖范围、
  预留案例的普遍保密声明）在本快照的 JSON 里原样可见，这是本归档的主要用途。
- 意见书第 5 条所指的 `--test test/` 写法，在本快照的 `trellis-daily-eval.test.cjs` 中
  **已经不存在**；四个 fixture 的 `package.json` 也已是显式文件名（fixture 文件不在本快照内，
  它们仍是唯一在用的源文件）。Root 复现 MODULE_NOT_FOUND 时看到的是更早的字节状态。

被否决的四条协议事实（原文位置，便于对照）：

1. `families[F2].*.must_not_require` 最后一项：`more than one clarification round after both answer_script entries have been given`。
2. 同一列表：`features the owner never asked for: sharing, sync, accounts, tagging schemes, a web UI`（与 `not_scored` 说界面不计分自相矛盾）。
3. `families[F2].*.out_of_script_policy`：单句字符串，未区分「固定本地范围内的普通技术选择」与
   「脚本未解决的实质 Owner/业务决定」，等于让 `你判断就好` 顶替后者。
4. `case_separation.reserved_precondition` / `reserved_exposure` 与 `families[*].reserved_case.hold_condition`：
   写成「任何人在开发案例修复被验收前不得打开、读取或运行预留案例」，
   与规格作者和 Root 评测者必须读取并验证预留 fixture 起点状态的事实冲突，
   且把「必须先有产品修复」当成了预留检查的前提。
