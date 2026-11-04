**Code map: REQ-custom-code** (`/tmp/abc/T1-C`, HEAD `e6627a1`, `src/` clean)

**Change**
- `src/server.cjs`: `BAD_CODE` and `TAKEN` beside `BAD_EXPIRY` (:12), text per `spec.md:105–107`; `isCode` (string check plus `/^[A-Za-z0-9]{4,10}$/`) beside `isSeconds` (:16); the `POST /api/links` branch (:179–206). Form route (:164) unchanged. Reuse `json`, `publicLink`, `SAVE_FAILED`.
- `src/store.cjs`: `add(url, seconds)` (:99) takes an optional `code`; the random loop (:101–103) runs only when it is `undefined`. Generated codes share the Map, so the loop avoids custom ones. `get` (:92) is exported.

**Order**: body parse (413 `TOO_BIG`, else 400 `REJECT`) → `isHttpUrl(body?.url)` (:188) → `expires_in` (:194) → `store.add` (null: 500 `SAVE_FAILED`) → 201. Insert after :197: if `'code' in body`: not `isCode` → 400 `BAD_CODE`; `store.get(body.code)` → 409 `TAKEN`; then `store.add(…, body.code)` (`undefined` if absent). Spec is silent on 400 vs 409; 400 first.

**Conventions**: refusals precede `store.add`, the only write; it saves before returning. Errors are `json(response, status, { error })`. User text reaches HTML only through `esc`. Records keep `{ code, url, clicks, expires_at }`.

**Pitfalls**
1. `RegExp.test` coerces: `null`, `true`, `1234`, `["abcd"]` pass a bare regex (checked in node). Keep the `typeof` check; a stored non-string makes the next start fail at `isRecord` (:32).
2. `add` never checks for a taken code: `links.set` overwrites the old record, and a failed save's undo (:108) deletes it. No `await` between `get` and `add`.
3. `code: null` must be 400, as `rulings.md:42` does for `expires_in`. Test presence with `in`, after :188; `in` throws on a JSON `null` body.
4. Exact match, no folding or trimming: `Docs` ≠ `docs` (`rulings.md:60`). Expired links keep their codes (`rulings.md:44`).
5. Loader unchanged: `isRecord` (:32) checks only the type of `code`; duplicates are exact (:56–60). Keep storage a Map: an object would answer `toString`, a valid code, from its prototype.
6. The check misses non-strings and the 400/409 order; probe them outside the repo.
