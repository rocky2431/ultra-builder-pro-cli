# Mission: node N-dedupe of Shortlink

Workspace: `/tmp/abc/T3-B` (a Git repository, branch `main`). You are the writer of one node. The
brief below is everything you are given; the current code is in the repository.

`ubp` means `node "/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"`, run from the workspace (the current directory is the project
root). Run the `ubp check` line of the brief's rules for this node's checks. Before
`ubp node done N-dedupe`, also run `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete`:
they must stay green.

## Code map from a read-only explorer (may be incomplete; the code is the truth)

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


Write `.ultra/records/handoffs/N-dedupe.md`. Commit inside this repository only (local
commits on `main`); install nothing. Stop every server you start by its PID, never with a
pattern-based kill, and keep data files in a temp directory outside the repository.

Report: your commits (hash and subject), the final output and exit code of the checks and
of `ubp node done N-dedupe`, and anything you escalated or recorded as a ruling.

---

# Node N-dedupe: The same link is shortened once

Milestone M3: The same link is shortened once · node state ready

## Requirements

## REQ-dedupe The same link is shortened once
Creating a link, through the API or the web page, whose `url` is exactly the `url` of an
existing link that never expires gives back that existing link and creates nothing: the API
answers 200 with the existing link (same code, clicks unchanged), the page answers 303 to
`/?created=<existing code>`. A request with `expires_in`, or a `url` that differs in any
character, creates a new link as before.
Done when: I shorten the same long link twice and get the same short link both times.

## Checks that must turn green (read-only)

- C-dedupe · red · `node --test --test-reporter=spec test/dedupe.test.cjs`

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
- Run `ubp check C-dedupe` until every check above is green, then `ubp node done N-dedupe`.
- Escalate instead of deciding: a change of direction (L0) and any deletion or narrowing of a requirement go to the Owner.
- Record every other decision you made without asking as one line in .ultra/rulings.md: `- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> — 如果判断错了，代价是 <代价>`.
- Before `ubp node done N-dedupe`, write .ultra/records/handoffs/N-dedupe.md: the interfaces you created, what dependent nodes must know, and what is left unfinished.
- If three attempts leave a check red, stop and report the check, its error line and what you tried.
