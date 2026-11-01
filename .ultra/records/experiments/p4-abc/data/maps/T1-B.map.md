**Code map: REQ-custom-code** (`/tmp/abc/T1-B`, HEAD 25225a4)

**Change**
- `src/server.cjs`: add `BAD_CODE` and `TAKEN` to the constants (lines 8–14), copied from `test/custom-code.test.cjs:8–9`; add `isCode` beside `isSeconds` (16); in `POST /api/links` (179–206), add the checks after the `expires_in` check (193–197) and pass `body.code` to `store.add` (199).
- `src/store.cjs`: `add(url, seconds, code)` (97–109) skips the random loop (101–103) when `code` is given. Add no export.

**Reuse**: `store.get` (92), `json` (26), `publicLink` (31).

**Order today**: readBody, 413 (184) → JSON.parse, 400 → `isHttpUrl(body?.url)`, 400 → `expires_in`, 400 → `store.add` (null: 500) → 201. Add the format check (400), then the taken check (409), after `expires_in`.

**Conventions**: errors are `{ error }` from constants; `add` saves (and rolls back on failure) before it returns, and the 201 follows; no `await` between `get` and `add`; no trim or case folding (rulings:20); follow rulings:42, so a present `code` is validated even when `null`; records keep `{code, url, clicks, expires_at}`; escape any HTML with `esc`.

**Pitfalls**
1. Check `typeof === 'string'` first. `/^[A-Za-z0-9]{4,10}$/.test(12345)` is true, and a stored number would fail `isRecord` (store.cjs:32) at restart (inferred). Avoid `\w`, which accepts `_`.
2. `'code' in 5` throws (checked), so the check must follow `isHttpUrl`.
3. `add`'s do-while always draws a random code; a passed code must bypass it. Its null means a failed save, so decide 409 in the route with `get` (rulings:52, 55).
4. Matching is exact: `Docs` differs from `docs` (rulings:60). Expired links keep their code (rulings:44).
5. Keep `isRecord` unchanged; REQ-persist does not ask for code format (spec.md:59–60; N-persist handoff).
6. `links` (5 letters) would turn `GET /links` into a redirect. Spec is silent; log it.

**Verify**: `npm test`. C-custom-code is red at HEAD (`.ultra/ledger/evidence.jsonl:224`). Do not edit `test/` or `.ultra/checks.json`. Log new choices in `.ultra/rulings.md`.
