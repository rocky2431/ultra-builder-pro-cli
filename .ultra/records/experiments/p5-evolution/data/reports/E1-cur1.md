N-edit 已完成：`C-edit` 变绿，其余 8 个回归检查保持绿，`ubp node done N-edit` 最终退出码 0。不过第一次 `node done` 失败过一次，原因是我写的裁决行格式有误，已修好并重跑。

## 提交（`/tmp/evo/E1-cur1`，`main`）
- `2873875` feat(edit): change where a link goes through the API (REQ-edit)
- `06f932c` docs(ultra): hand off N-edit and record its rulings
- `cafc042` docs(ultra): fix the spacing of an N-edit ruling line

## 改动的文件
- `/tmp/evo/E1-cur1/src/store.cjs`：新增 `retarget(link, url)`，导出从 9 个变成 10 个。
- `/tmp/evo/E1-cur1/src/server.cjs`：新增 `PATCH /api/links/<code>` 路由。
- `/tmp/evo/E1-cur1/.ultra/records/handoffs/N-edit.md`：新写的交接文件。
- `/tmp/evo/E1-cur1/.ultra/rulings.md`：追加 4 条裁决。

## 命令与结果
- 改动前基线：`ubp check C-edit` 输出 `C-edit: fail (exit-1)`，退出码 1。
- 最终 HEAD `cafc042` 上：
  - `ubp check C-edit`：`C-edit: pass (exit-0)`，退出码 0。
  - `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`：8 项全部 `pass (exit-0)`，退出码 0。
  - `ubp node done N-edit`：`node N-edit: pass`，退出码 0。
- 账本里这些运行的记录都是 `dirty:false`。
- 第一次 `ubp node done N-edit` 退出码 1，输出 `plan-gate: Plan gate is fail`。
  - 原因：我的第一条裁决在最后一个破折号前少了空格，`ubp gate` 报 `malformed-ruling`。
  - 处理：只改空格，不改文字，提交 `cafc042`。`ubp gate` 随后输出 `gate: pass`，我在最终提交上重跑了全部检查，然后 `node done` 通过。

## 手工探针
`C-edit` 只管成功路径、404 和 400，其余行为我用一个放在仓库外的脚本，对真实服务器逐项探过：
- 413 的边界：65536 字节通过，65537 和 300000 字节回 413。
- 14 种被拒的请求体都回 400，文件逐字节不变。
- 重启后新目标仍在，列表顺序和点击数不变。
- 已过期的链接可以改，改完仍回 410。
- 保存失败（数据目录只读）回 500，列表和文件不变。
- 上传请求体期间链接被别的请求删掉，PATCH 回 404，且不写任何东西。
- 把 `src/` 改坏两处再跑探针（去掉读完请求体后的第二次查 code；`retarget` 的撤销改成空操作），探针分别在“删除竞态”和“保存失败”两步变红，所以它分得出坏实现。
- 探针里的服务器都已按 PID 停掉。

## 裁决（未上报 Owner，均为 L2，已记入 `rulings.md`）
1. 应答顺序：未知 code 先回 404；再读请求体（过大 413，非 JSON 400）；读完后再查一次 code；最后检查 `url`（400）和保存（500，成功 200）。
2. 413 沿用 REQ-create 的大小信息原文，该信息里写着“未创建任何链接”。
3. 过期链接也可以改，`expires_at` 保持原值，改完仍回 410；请求体里 `url` 以外的字段一律忽略、不报错。
4. `retarget` 像 `hit` 一样收记录而不是 code，失败时把 `url` 撤销回原值。

## 未验证或需要你知道的
- 账本改动未提交：`.ultra/ledger/evidence.jsonl` 和 `nodes.jsonl` 在工作区里是已修改状态。这是引擎写的，我没有手改。`evidence.jsonl` 里还有我开工前就存在的 9 条记录，所以我没有一并提交，留给控制者处理。
- 页面没有编辑入口，只能通过 API 改。REQ-edit 没要求表单，我没加。
- 没有在真实浏览器里验证，也没有改任何标记。
- `/tmp/evo-probe-n-edit` 这个目录名被另一个写者（`E1-cur2` 那边在跑服务）也用了：目录里的 `probe1.cjs`、`probe2.cjs`、`out1.txt`、`mutant` 都不是我的，我没动。清理时我只用 `run.*` 通配符删了自己的临时数据目录。这个目录在我创建之后才出现别人的文件，所以我判断没有删到别人的东西，但没法完全排除。`E1-cur2` 的服务进程（PID 82720）我也没碰。
