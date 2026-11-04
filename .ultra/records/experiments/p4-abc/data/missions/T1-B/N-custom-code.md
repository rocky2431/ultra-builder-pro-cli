# Mission: node N-custom-code of Shortlink

Workspace: `/tmp/abc/T1-B` (a Git repository, branch `main`). You are the writer of one node. The
brief below is everything you are given; the current code is in the repository.

`ubp` means `node "/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"`, run from the workspace (the current directory is the project
root). Run the `ubp check` line of the brief's rules for this node's checks. Before
`ubp node done N-custom-code`, also run `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`:
they must stay green.

## Code map from a read-only explorer (may be incomplete; the code is the truth)

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


Write `.ultra/records/handoffs/N-custom-code.md`. Commit inside this repository only (local
commits on `main`); install nothing. Stop every server you start by its PID, never with a
pattern-based kill, and keep data files in a temp directory outside the repository.

Report: your commits (hash and subject), the final output and exit code of the checks and
of `ubp node done N-custom-code`, and anything you escalated or recorded as a ruling.

---

# Node N-custom-code: Choose the short code

Milestone M3: Choose the short code · node state ready

## Requirements

## REQ-custom-code Choose the short code
`POST /api/links` accepts an optional `code`: 4 to 10 ASCII letters or digits. The new link
gets exactly that code. Any other value of `code` answers 400 with
`{"error": "code 必须是 4–10 位字母或数字。"}`; a code already in use answers 409 with
`{"error": "这个短码已被使用。"}`. A refused request creates nothing.
Done when: I create a link with the code `docs`, and opening `/docs` takes me to it; a second
link with the code `docs` is refused.

## Checks that must turn green (read-only)

- C-custom-code · red · `node --test --test-reporter=spec test/custom-code.test.cjs`

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
- Run `ubp check C-custom-code` until every check above is green, then `ubp node done N-custom-code`.
- Escalate instead of deciding: a change of direction (L0) and any deletion or narrowing of a requirement go to the Owner.
- Record every other decision you made without asking as one line in .ultra/rulings.md: `- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> — 如果判断错了，代价是 <代价>`.
- Before `ubp node done N-custom-code`, write .ultra/records/handoffs/N-custom-code.md: the interfaces you created, what dependent nodes must know, and what is left unfinished.
- If three attempts leave a check red, stop and report the check, its error line and what you tried.
