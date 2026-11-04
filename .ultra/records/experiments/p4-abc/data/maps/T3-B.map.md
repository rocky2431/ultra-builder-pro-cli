**Code map: REQ-dedupe**

**Change** (only `src/server.cjs`; no new `store.cjs` export, `rulings.md:53`)
- Helper beside `publicLink` (:31): `reusable = (url) => store.all().find((l) => l.url === url && l.expires_at === null)`.
- `POST /api/links`: after the `expires_in` check (:194-197), before `store.add` (:199): `const existing = 'expires_in' in body ? undefined : reusable(body.url);`. On a hit, `json(response, 200, publicLink(existing, request))`.
- `POST /links`: after the BAD_EXPIRY check (:158-162), before `store.add` (:164): `const existing = seconds === null ? reusable(value) : undefined;`, then `const link = existing ?? store.add(value, seconds);`. The 500 check and 303 (:169) stay.

**Validation order**
- API: JSON 413/400, `isHttpUrl` 400, `expires_in` 400, `add` 500, 201.
- Form: `readBody` 413 page, trim, `isHttpUrl` 400 page, `expires_in` 400 page, `add` 500 page, 303.
- Dedupe runs last (`rulings.md:47`), so a bad `expires_in` still gets 400.

**Conventions**
- Save before answering: a hit writes nothing (no `hit`, save or new code).
- Exact `===`. The form saves trimmed values (`rulings.md:20`), so compare trimmed there.
- Errors: `json(response, status, { error: CONST })`, or `page(...)`. Add no user text.
- Records: read through `get`/`all` only.

**Pitfalls**
1. Expiring links must never match a request without `expires_in`. C-dedupe does not test this.
2. Old files may hold two never-expiring links with one url (`open()` rejects only duplicate codes). `find` returns the oldest (`all()` order, `store.cjs:95`).
3. No check covers the form's 303 or "clicks unchanged". Verify by hand: post the same form twice, expect one record and 303 to the same code.
4. The "已创建短链接" notice (`rulings.md:36`) shows for reused links. Owner call.
5. Existing tests never repeat a url on one server. C-dedupe's last ledger run failed (`.ultra/ledger/evidence.jsonl:224`); I ran no tests.
6. Dirty `.ultra/ledger/evidence.jsonl` is not yours; keep it out of your commit.
