# Design

## System

- Shortlink is a zero-dependency link shortener in CommonJS for Node >= 22 (25.7.0 here).
  `npm start` runs `node src/server.cjs`, which listens on 127.0.0.1:`PORT` (default 3000)
  and keeps its links in the data file `SHORTLINK_DATA` (default `data/links.json`, ignored
  by Git).
- `src/store.cjs` owns the link data: two in-memory Maps, `links` and `deleted`, and the JSON
  data file. The file is a list of link records `{ code, url, clicks, expires_at }`, oldest
  first, then tombstones `{ code, deleted_at }` in the order of their deletes. After every
  change the store saves the whole list through a temp file and a rename, and undoes the change
  in memory when the save fails. `open` validates every record, and it refuses a repeated code
  across links and tombstones, so the server stops instead of overwriting a file it does not
  understand. The store knows nothing of HTTP.
- `src/server.cjs` owns HTTP and HTML. The page at `/` shows the total of all visits, the form,
  then a table of every link, newest first; it runs `esc` on everything from a user and sends
  `no-store`. `POST /links` takes the form and answers 303 to `/?created=<code>`. The API is
  `GET`/`POST /api/links` and `GET`/`DELETE /api/links/<code>`. `GET /<code>` answers 302 to
  the link and counts one visit, the 410 page 已过期 for an expired link, the 410 page 已删除
  for a deleted code, and otherwise the 404 HTML page.
- Tests: `npm test` runs `node --test --test-reporter=spec test/*.test.cjs test/m4/*.test.cjs`.
  Each test starts a real server on a free port with a temp data file through
  `test/helpers.cjs`. The suite is the invariant `INV-suite`. M4's tests in `test/m4/` joined
  it at the M4 gate (2026-11-12). A later milestone's new red tests wait in their own
  directory until that milestone's gate.

## Decisions

- 2026-11-12 Deleted codes are remembered in the same data file as tombstone records
  `{ "code": "<code>", "deleted_at": "<ISO time>" }` with no url and no count, so one atomic
  save covers a delete. A file written before this change has no tombstones and opens
  unchanged. `open` reads a record as a tombstone only when it has a string `code`, a
  `deleted_at` that `Date.parse` reads, and no `url` or `clicks` key. A broken link record
  therefore stops the server instead of being read as a deleted code (N-deleted).
- 2026-11-12 Tombstones live in their own Map `deleted`, which only `isDeleted(code)` reads.
  A code is in at most one of `links` and `deleted`. `get`, `all` and `findPermanent` never
  return a tombstone, so the list, the page and its total, `GET /api/links/<code>` and
  `DELETE` treat a deleted code as absent, exactly as before. Only `GET /<code>` answers
  differently: a fixed 410 page saying 已删除, without the old url or the delete time. Other
  methods answer 404 as before (N-deleted).
- 2026-11-12 Choosing a deleted code (`POST /api/links` with `code`) drops its tombstone in
  the same save as the new link, so the file never holds two records with the same code. A
  generated code also avoids deleted codes, so an old short link never opens someone else's
  new link. A failed save puts both Maps back in their old order (`restore`).
- 2026-11-12 The total on the page is the sum of `clicks` over the links the page lists
  (`all()`). It is computed when the page is built and never stored. `page()` in
  `src/server.cjs` takes one `store.all()` array for both the total and the rows and prints
  `<p class="total">总访问次数：<strong data-total-visits>N</strong></p>` right after the
  `<h1>`. Every render of the page shows it, the refusal pages of `POST /links` included
  (N-total). So `all()` must return link records only: a tombstone in it would make the
  total `NaN`.

## Facts

- 2026-11-12, running `npm test`: 49 tests pass in about 5 s on Node 25.7.0.
- 2026-11-12, from `src/store.cjs` before M4: `remove` deleted the record from the Map and
  the file, so links deleted before this change are not recorded anywhere and keep answering
  404.
- 2026-11-12, from the tests: `test/delete.test.cjs` pinned "a deleted short link answers
  404" (moved to `test/m4/deleted.test.cjs` and rewritten to 410).
  `test/custom-code.test.cjs` pins that a deleted code can be chosen again and then opens the
  new link. `test/dedupe.test.cjs` pins that a create never gives back a deleted link.
- 2026-11-12, from `src/server.cjs`: an expired link answers 410 with 已过期, and a visit
  after expiry counts nothing. Each listed link's count sits in an element carrying
  `data-clicks`.
- 2026-11-12, N-total handoff: counts print through JavaScript's number-to-string, so a
  hand-edited count of 1e21 or more shows as `1e+21` (in the column and the total alike).
- 2026-11-12, N-deleted handoff: once a delete has written a tombstone, a Shortlink from
  before M4 refuses the data file at start (exit 1, file untouched). Rolling back needs the
  tombstones removed from the file by hand. Tombstones are kept forever, about 60 bytes per
  delete in every save. No 410 or 404 page sends `Cache-Control`.
- Open unknowns: none that decides a requirement.
