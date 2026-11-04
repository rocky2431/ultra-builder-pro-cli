# Mission: node N-link-detail of Shortlink

Workspace: `/tmp/abc/T2-B` (a Git repository, branch `main`). You are the writer of one node. The
brief below is everything you are given; the current code is in the repository.

`ubp` means `node "/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"`, run from the workspace (the current directory is the project
root). Run the `ubp check` line of the brief's rules for this node's checks. Before
`ubp node done N-link-detail`, also run `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`:
they must stay green.

## Code map from a read-only explorer (may be incomplete; the code is the truth)

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


Write `.ultra/records/handoffs/N-link-detail.md`. Commit inside this repository only (local
commits on `main`); install nothing. Stop every server you start by its PID, never with a
pattern-based kill, and keep data files in a temp directory outside the repository.

Report: your commits (hash and subject), the final output and exit code of the checks and
of `ubp node done N-link-detail`, and anything you escalated or recorded as a ruling.

---

# Node N-link-detail: Look up one link

Milestone M3: Look up one link · node state ready

## Requirements

## REQ-link-detail Look up one link
`GET /api/links/<code>` answers 200 with the same object the list `GET /api/links` shows for
that link. Looking a link up does not count as a click. An unknown code answers 404 with
`{"error": "没有这个短链接。"}`.
Done when: I fetch one link by its code and see how many times it was opened.

## Checks that must turn green (read-only)

- C-link-detail · red · `node --test --test-reporter=spec test/link-detail.test.cjs`

## Scope

- src/

## Handoffs from dependencies

### N-delete

# N-delete handoff

## Interfaces

- `DELETE /api/links/<code>` removes the link and saves the file before it answers.
  - Known code: `204`, no body, no `Content-Type`.
  - Unknown code: `404`, `application/json`, `{ "error": "没有这个短链接。" }` (the `NO_SUCH` constant in `server.cjs`), nothing changes. A second delete of the same code is therefore `404`. The code is whatever follows `/api/links/`, not decoded, as in the redirect: `/api/links/`, `/api/links/a/b`, `constructor` and `__proto__` all answer this `404`.
  - Failed save: `500` with `{ "error": "无法写入数据文件，请稍后再试。" }` (`SAVE_FAILED`); the link is still in memory, in its place, and in the file; `cannot write <DATA>: <reason>` goes to stderr (same as every other write path).
- Afterwards `GET /<code>` answers `404` (the HTML not-found page) and `GET /api/links` no longer lists the link. An expired link can be deleted like any other (probed: `410` before, `204`, then `404`); expiry itself still never deletes a record.
- Other methods on `/api/links/<code>` are unchanged: `GET`, `POST` and `PUT` still answer the `404` HTML page and leave the link alone. The web page has no delete button: REQ-delete-page was dropped from the plan with the Owner's approval.
- `src/store.cjs` exports nine names now: the eight of the N-store handoff plus `remove(code)`.
  - `remove(code)` deletes the link and saves; it returns `true`, or `false` when the save failed (the link is back, logged on stderr). It does not tell "no such code" from a failed save: the route calls `store.get(code)` first and answers `404` itself, as the redirect does. An unknown code passed to `remove` anyway changes nothing and still saves the file.
  - It takes a code, not a record like `hit`, so a stray object cannot be "removed" and counted as saved.
- No new environment variable, file, dependency or data file field. The data file format is unchanged.

## Dependency integration

- N-store: the removal is built on the private `commit(undo)` and the route follows the `if (!store.remove(...))` pattern, so the Map is touched only inside `store.cjs` and `save` is called only from there.
- The trap named in the N-store handoff is handled: `remove` keeps `[...links]` before deleting and its undo clears the Map and rebuilds it from that copy, so a record whose delete failed keeps its place. A plain `delete` then `set` undo puts it last, so memory would list it newest and the next save would write the file in another order than `GET /api/links` shows (see Verification for the probe that tells the two apart).
- Cost: each delete copies the entries once, which is O(links), the same order as the save that follows (the ceiling already written above `save`).

## Unfinished work

Nothing of REQ-delete is deferred. Noticed and not done:

- No check covers the failed-save rollback of a delete (its `500`, the unchanged list and file, the preserved order), the expired-link delete, or the odd paths above: `C-delete` pins only the three behaviors of the requirement. The scope of this node is `src/` and the checks are not the writer's to edit; a later check could pin them with the same read-only-directory technique `C-persist` uses (which, like it, does not hold as root or on Windows).
- There is no way to delete expired links in bulk; they stay until someone deletes each by code (unchanged from N-expire).
- The two carried-over notes of the N-store handoff stand: a hand-edited data file with two records of the same `code` loads as one, and `save` rewrites the whole list with no `fsync`.
- Not run in a real browser; no markup changed.

## Verification

`C-delete` is green (3 tests) and `C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2` stay green; the runs are in the report of this node. `C-delete` was red on the committed tree before the change (the server answered `404` where the check expects `204`).

Not covered by any check and run by hand in scratch directories outside the repository, every server stopped by its PID:

- Store level, with the data directory made read-only so `save` fails: three links, `remove` of the middle one returned `false`, `all()` kept the order, the link was still there, and after the directory was writable again `add` wrote the file as the old three plus the new one. The same script against a copy of the store with the `delete` then `set` undo failed (the link moved to the end), so the probe does tell the trap from the fix. The same script against `src/store.cjs` passes, and a later successful `remove` of that link wrote the file without it.
- HTTP level against the real server: a delete with the directory read-only answered `500` with the message, left the file byte for byte and the list in the same order, and the link still redirected; after the directory was restored the delete answered `204` with no body and no `Content-Type`, the file lost only that link, and its short link gave `404`. The odd paths listed above all answered the JSON `404`; `GET`, `POST`, `PUT` on `/api/links/<code>` answered the HTML `404` and kept the link; a `DELETE` with a 100000-byte body still answered `204`.
- A hand-written data file with an expired link: the delete answered `204`, then `404`, and the file kept only the other link.

## Rules

- Do not edit .ultra/spec.md, .ultra/checks.json, .ultra/plan.json, .ultra/ledger/ or the files the checks above run. If a check or a requirement looks wrong, stop and escalate.
- Change only files inside the scope, and commit your work: evidence from an uncommitted tree never counts.
- Run `ubp check C-link-detail` until every check above is green, then `ubp node done N-link-detail`.
- Escalate instead of deciding: a change of direction (L0) and any deletion or narrowing of a requirement go to the Owner.
- Record every other decision you made without asking as one line in .ultra/rulings.md: `- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> — 如果判断错了，代价是 <代价>`.
- Before `ubp node done N-link-detail`, write .ultra/records/handoffs/N-link-detail.md: the interfaces you created, what dependent nodes must know, and what is left unfinished.
- If three attempts leave a check red, stop and report the check, its error line and what you tried.
