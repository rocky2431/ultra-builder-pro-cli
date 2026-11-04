**REQ-link-detail 代码地图**（`/tmp/abc/T2-B`，HEAD `b43b18b`，只读）

**改动范围**
- `/tmp/abc/T2-B/src/server.cjs` 的 `handle()`：在 DELETE 分支（:208–219）之后、跳转查找（:221）之前加一个 `GET /api/links/` 分支。
- `src/store.cjs` 不用改：`get(code)`（:92）已导出（:131），返回只读记录。不要从 server 直接碰 Map（rulings 53）。
- 不改 `test/`：`test/helpers.cjs` 文件头写明写者不得修改。

**可复用**
- `NO_SUCH`（:13，即规格原文）、`json()`（:26）、`publicLink(link, request)`（:31）。列表用的就是它（:175），详情直接返回它的结果，不包一层。

**现有匹配顺序**
- `handle()` 按序 `if`，首个命中即返回。`/`、`/links`、`/api/links` 精确匹配；DELETE 用 `startsWith('/api/links/')`；其余落到 :221，把路径去掉开头 `/` 当 code 查找，未命中则 :237 返回 HTML 404。
- 今天的 `GET /api/links/<code>` 是 HTML 404。DELETE：已知 code 204；未知 code（含空串、`a/b`）404 JSON；保存失败 500 JSON。
- `POST`、`PUT`、`HEAD` 等：HTML 404，记录不变。规格未规定，保持现状。

**约定**
- 错误为 `{"error": ...}`，经 `json()`。
- code 取 `pathname.slice('/api/links/'.length)`，不解码、不改大小写（rulings 56、60）。
- 数据记录为 `{code, url, clicks, expires_at}`；API 对象多一个 `short`。
- 不新增面向用户的文字（rulings 16）。
- 交接记录按惯例写 `.ultra/records/handoffs/N-link-detail.md`，格式同 `N-delete.md`。

**陷阱**
1. 位置必须在 :237 兜底 404 之前；最清楚的是放在 :221 之前。
2. 不要复用跳转分支：它调用 `store.hit`（计数并写文件），且对过期链接回 410。规格要求 200、不计数。列表仍含过期链接，所以详情对过期链接也应 200（这是我的读法，可以改）。
3. 不要返回原始记录：它缺 `short`，还会漏出手工加的字段。
4. 分支要判断 `request.method === 'GET'`，不能只判前缀，否则其他方法的行为会变。
5. HEAD 在所有路由上都是 HTML 404（rulings 31，已裁决不修）。
6. 工作区有未提交的 `.ultra/ledger/evidence.jsonl`（引擎写入）。提交时不要 `git add -A`（rulings 51 记录过账本行被挂到别的节点）。

**验证**
- `npm test`（`package.json:12`），以及 `node --test test/link-detail.test.cjs`。
- 两个新测试按代码推断现在都是红的：`detail()` 对 HTML 404 调 `res.json()` 会先抛错。本次只读，未运行测试。
