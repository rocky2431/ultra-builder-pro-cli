**Code map: REQ-link-detail** (`/tmp/abc/T2-C`; by reading, tests not run)

**Change**
- `src/server.cjs` `handle()`: new `GET` branch after DELETE (208–219), before the redirect fallthrough (221). No `store.cjs` change: `store.get(code)` (store.cjs:92) suffices.
- Check: `test/link-detail.test.cjs`; both tests fail today.

**Routing today** (server.cjs:127)
Exact `pathname` matches; DELETE uses a prefix. No params, no decoding (.ultra/rulings.md:56), no 405. Order: `GET /` (130), `POST /links` (135), `GET /api/links` (174), `POST /api/links` (179), DELETE with `startsWith('/api/links/')` (208), fallthrough `store.get(pathname.slice(1))` (221: a found link gets 410 if expired, else `store.hit` and 302), HTML 404 (237).

**Other methods on `/api/links/<code>`**
DELETE: 204, JSON 404 `NO_SUCH`, or JSON 500 on a failed save. GET: HTML 404 today. POST, PUT, HEAD: HTML 404, nothing changes.

**Reuse**
`json()` (26), `publicLink()` (31: `code, short, url, clicks, expires_at`), `NO_SUCH` (13).

**Conventions**
Errors: `{"error": ...}` via `json()`, messages as top-level constants. The list (175) maps `publicLink(link, request)` over `store.all().reverse()`. Records are `{code, url, clicks, expires_at}`, changed only through `store.cjs`.

**Pitfalls**
- Do not call `store.hit`: it counts a click, and the check sees `clicks` of 2.
- End the branch with `return` (line 218 does); else it falls through and writes twice.
- Return `publicLink(link, request)`, not the raw record: the check deep-equals the list item (test/link-detail.test.cjs:22), and a raw record lacks `short` and leaks extra fields.
- Unknown code: JSON `NO_SUCH`, not the HTML fallthrough.
- Place the branch before line 221, or a stored code containing `/` is redirected and counted.
- Gate on `request.method === 'GET'`, or POST and PUT answers change.
- Expired links stay in the list (.ultra/rulings.md:44), and the spec says 200 with the list's object: return 200, not 410. No check pins this.
- `.ultra/ledger/evidence.jsonl` is already modified; keep it out of the commit.
- Run `npm test`, not only the link check.
