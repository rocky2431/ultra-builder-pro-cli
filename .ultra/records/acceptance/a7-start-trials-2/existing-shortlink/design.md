# Shortlink: project knowledge

## System

- Node.js, CommonJS (`.cjs`), zero npm dependencies (`package.json` engines `>=22`; this
  machine runs v25.7.0). No build step.
- Run: `npm start` = `node src/server.cjs`. Environment: `PORT` (default 3000, `0` picks a free
  port) and `SHORTLINK_DATA` (default `data/links.json`). It listens on 127.0.0.1 and prints
  `listening on http://127.0.0.1:<port>` when ready.
- `src/store.cjs` owns the data: an in-memory `Map` of links and a `Set` of deleted codes
  (tombstones), mirrored to one JSON file: a list of the links `{ code, url, clicks,
  expires_at }`, oldest first, then one `{ "code": <code>, "deleted": true }` per tombstone. A
  code is in at most one of the two. Every change goes through `commit`:
  an atomic save (temp file + rename) and, when the save fails, an undo so memory keeps
  matching the file. `open` refuses a malformed file or two records with one code, so the
  server stops instead of overwriting data it does not understand. It knows nothing of HTTP.
  Exports: `DATA, open, get, findPermanent, all, isDeleted, add, hit, remove, isExpired,
  isHttpUrl`.
- `src/server.cjs` owns HTTP: `GET /` (the only HTML page: under the `<h1>` the total
  `<p>总访问次数：<strong data-total-visits>N</strong></p>`, then form, notice, table of links
  newest first, rows with `data-code`, counts in `data-clicks` cells; every render of
  `page()`, the 400/413/500 ones too, shows the total), `POST /links` (form, 303 to
  `/?created=<code>`), `GET`/`POST /api/links`, `GET`/`DELETE /api/links/<code>`, and
  `GET /<code>` (302 and a counted visit; 410 page 已过期 when expired; 410 page 已删除,
  `DELETED_PAGE`, when the code was deleted; 404 HTML page otherwise; only GET reaches a link
  or a tombstone, every other method answers 404). Every text from a user, the data file or the Host header goes through `esc`.
- Tests: `npm test` = `node --test --test-reporter=spec test/*.test.cjs`. Each file is a
  black-box check: it starts the real server on a temp data file through `test/helpers.cjs`
  and talks HTTP. The invariant `C-suite` runs the same glob without this milestone's
  acceptance tests (names starting `REQ-total-visits:`, `REQ-deleted-410:`, `M4 journey:`),
  which `C-total-visits`, `C-deleted-410` and `C-journey-m4` run. `test/deleted-codes.test.cjs`
  (names `Deleted codes:`, in `C-suite`) pins refused tombstone files, a failed save of a
  re-chosen deleted code, and that a file from before M4 opens without being rewritten.

## Decisions

- 2026-11-12: Existing test files and `test/helpers.cjs` are acceptance files: a writer never
  edits them. A writer may add a new test file under `test/`; it joins `npm test` and `C-suite`.
- 2026-11-12: The total of visits is the sum of `clicks` over `store.all()`, the links the page
  lists (expired included, deleted not), computed in `page()` from the same array the rows
  come from and never stored; printed like the `data-clicks` cells (N-total-visits).
- 2026-11-12: `store.all()`, `get`, `findPermanent` and `GET /api/links` see live links only:
  a tombstone is never a link (in the `Map` of links or out of it), or the total turns `NaN`
  and the API lists it. Opening a deleted code never calls `store.hit`.
- 2026-11-12: The store remembers a deleted code as a tombstone that keeps the code only (never
  the url or the clicks): exactly `{ code, deleted: true }` in the same list, after the links,
  saved through `commit` (atomic save, exact undo on a failed save). A data file written before
  M4 opens unchanged and is not rewritten. A file in which a tombstone and a link share a code,
  one code has two tombstones, a tombstone has another key or a link has `deleted`, is refused
  at start like two links with one code (N-deleted-410).
- 2026-11-12: `get` stays "the link or undefined"; whether a code was deleted is asked through
  its own store export, so the API routes keep answering 404 for a deleted code.
- 2026-11-12: A deleted code stays free to choose again (pinned in `C-suite`): creating a link
  with it removes its tombstone. A generated code never takes a deleted code.
- 2026-11-12: The deleted page is its own 410 page (`text/html; charset=utf-8`,
  `lang="zh-CN"`, says 已删除), separate from the 已过期 page; it shows nothing of the old url.

## Facts

- 2026-11-12, ran `npm test`: 49 of 49 pass in about 4.6 s; none red, none flaky over the runs
  made. No README or other user documentation exists; `package.json` calls it "A
  zero-dependency link shortener."
- 2026-11-12, read `test/`: the only test that pinned the old 404 of a deleted short link was
  the first test of `test/delete.test.cjs`; its 404 assertion moved, rewritten to 410, into
  `test/deleted-410.test.cjs`. `test/custom-code.test.cjs` pins that a deleted code can be
  chosen again; `test/dedupe.test.cjs` that a deleted link is never given back by dedupe.
- 2026-11-12, read `test/`: several tests hand-write data files in the old record shape
  (`{ code, url, clicks }`, with or without `expires_at`), so the store must keep reading it.
- 2026-11-12, probe on Node v25.7.0: `node --test --test-skip-pattern=<re>` leaves the matching
  tests out of the run and of the spec output and exits 0. Not probed on Node 22.
- 2026-11-12, read `src/server.cjs`: unknown codes, and every method but GET on `/<code>`,
  answer the 404 page; an expired link answers 410 with the 已过期 page and is not counted.
- 2026-11-12, N-deleted-410 handoff: a server from before M4 refuses (exits 1, does not
  overwrite) a data file holding a tombstone, so rolling back after the first delete needs the
  tombstone records removed by hand.
- Open: tombstones grow with every delete and are never pruned (one short record each).
