**REQ-dedupe code map**

**Change** (`src/server.cjs` only)
- `POST /links` (135-172): after the `expires_in` check (162), before `store.add` (164), when the field is empty. A match answers `303` to `/?created=<code>`.
- `POST /api/links` (179-206): after the check (197), before `store.add` (199), when the key is absent. A match answers `200` with `publicLink(match, request)`.
- Helper beside `publicLink` (31): `store.all().find((link) => link.url === url && link.expires_at === null)`. No new store export (`.ultra/rulings.md:53`).

**Validation**
- Form: body (413 page) → trimmed `url` (400) → `expires_in` (400) → `add` (500 page) → 303.
- API: JSON (413, 400) → `url` (400) → `expires_in` if present (400) → `add` (500 JSON) → 201.

**Conventions**
Errors: `{ error: CONST }` via `json`; `page(...)` escapes user text with `esc`. Return the stored record via `publicLink`. Writes only through `store`; a match writes nothing (no save, no 500 branch).

**Pitfalls**
1. Match only `expires_at === null`, not `isExpired`: a future expiry is not "never". `open()` makes missing fields null (`src/store.cjs:62`).
2. Look up after the `expires_in` check, so `expires_in: null` still gets 400 (`test/expire.test.cjs:41`).
3. Compare stored strings exactly; no `new URL()` normalization (`https://example.com` ≠ `https://example.com/`). Form: trimmed value; API: raw `body.url`.
4. No `await` between lookup and `store.add`, or identical POSTs can both create.
5. Duplicate never-expiring URLs can already exist (`.ultra/records/handoffs/N-persist.md:24`); `find` returns the oldest. Record that in `.ultra/rulings.md`.
6. `test/dedupe.test.cjs` (C-dedupe) checks only the API 200 and non-matching cases. Check the form 303, expired twins and post-visit clicks by hand; do not edit tests.

**Raise first**
- `.ultra/spec.md:30` says "Two creations give two different codes" with no REQ-dedupe exception; the planner should add one. Other tests never repeat a URL on one server (read, not run), so their checks should stay green.
- `src/server.cjs:79` says 已创建短链接 after a dedupe, though nothing was created. Only the copy can change; the spec fixes the redirect.
