N-edit 已完成：`C-edit` 变绿，回归检查全绿，`ubp node done N-edit` 通过，工作区干净。

## 提交（均在 `/tmp/evo/E1-cur2` 的 `main` 上，未安装任何东西）

- `7963cc7` feat(edit): change where a link goes through the API
- `a973012` docs(ultra): hand off N-edit and record its rulings
- `10591cb` chore(ultra): record N-edit evidence and completion。这个提交只收入引擎写进 ledger 的行（19 行，只追加，没有改动已有行），沿用 N-delete 的做法。

## 改动

- `/tmp/evo/E1-cur2/src/store.cjs`：新增 `retarget(code, url)`，基于 `commit(undo)`。它原地改记录，所以 code、clicks、`expires_at` 和列表位置都不变。保存失败时撤销回旧 `url`，返回 `false`。导出的名字增加到十个。
- `/tmp/evo/E1-cur2/src/server.cjs`：新增 `PATCH /api/links/<code>` 路由。
  - 成功返回 200 和 `publicLink`。
  - `url` 不合规返回 400（`REJECT`），请求体超过 64 KiB 返回 413（`TOO_BIG`）。
  - 未知 code 返回 404（`NO_SUCH`），保存失败返回 500（`SAVE_FAILED`）。
- `/tmp/evo/E1-cur2/.ultra/records/handoffs/N-edit.md`：交接记录。
- `/tmp/evo/E1-cur2/.ultra/rulings.md`：新增 3 条 L2 裁决。

## 检查结果（均在已提交的树上，经 `ubp check`）

- 改动前：`C-edit` 为红，路由回的是 HTML 404，ledger 里有这次失败记录。
- `ubp check C-edit`：`C-edit: pass (exit-0)`，退出码 0。
- `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`：八项都是 `pass (exit-0)`，尾行 `M3 · 1/1 绿 · 下一项 N-edit · 本里程碑计划变更 0 次`，退出码 0。
- `ubp node done N-edit`：输出 `node N-edit: pass`，退出码 0。

## 手工探针

探针脚本和数据都在仓库外（`/tmp/probe-edit-scripts`、`/tmp/probe-edit-data`），服务全部按 PID 杀掉，没有残留进程。结果是 `probe.cjs` 的 9 组探针全过：

- 重启（`SIGKILL` 后）后仍保留修改，顺序、clicks 和重定向都对。
- 9 种非法 `url` 都是 400，超限请求体是 413，刚好 65536 字节的请求体被接受，文件前后逐字节相同。
- 7 种未知或奇怪的 code 都是 JSON 404，对已知 code 的 GET、POST、PUT 仍是 HTML 404。
- 过期链接可改，改后仍是 410。
- 只读目录下保存失败返回 500，列表和文件都不变，目录可写后编辑恢复正常。
- 读请求体期间另一个请求把链接删了，PATCH 回 404。

两个反向对照也都按预期失败：去掉读体后的二次查找会得到 500 而不是 404，撤销函数为空操作则列表探针失败。

## 裁决（已写入 `rulings.md`，均为 L2）

1. 未知 code 先于读请求体就回 404，读完后再查一次。所以未知 code 加坏 body 得到 404，而不是 400 或 413。
2. 已过期的链接可以改目标，`expires_at` 不变，仍回 410，不会复活。
3. PATCH 请求体里除 `url` 以外的字段一律忽略。

没有上报给 Owner 的 L0 事项，也没有收窄或删除任何需求。

## 未验证和已知缺口

- `C-edit` 只覆盖三个行为：改目标并保留 code 和 clicks、未知 code 返回 404、非法链接返回 400。重启保留、413、保存失败回滚、过期链接编辑和删除竞态都只靠上面的手工探针，没有检查固定住。我的范围是 `src/`，不能改检查。
- 413 的提示文字是 spec 指定的"创建"那句，用在编辑上措辞不贴切。换文案属于需求变更，我没动。
- 没有在真实浏览器里验证。页面从 `store.all()` 渲染，我没有改任何 markup。
