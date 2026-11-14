# Shortlink: project knowledge

## System

- Node.js ≥ 22 (measured on 25.7.0), CommonJS (`.cjs`), no npm dependency. `npm start` runs
  `node src/server.cjs`: it listens on `127.0.0.1:$PORT` (default 3000; `PORT=0` takes a free
  port) and prints `listening on http://127.0.0.1:<port>`. The data file is `$SHORTLINK_DATA`
  (default `data/links.json`, ignored by Git).
- `src/store.cjs` owns the data: the in-memory `Map` of links (code → `{ code, url, clicks,
  expires_at }`), a second `Map` `deleted` of deleted codes (code → `{ code, deleted_at }`; a
  code is never in both, and `wasDeleted(code)` is the only way they leave the store), and the
  data file (a JSON list: the links oldest first, then the deleted records in deletion order).
  Every change goes through
  `commit(undo)`: an atomic save (temp file, then rename) whose failure runs `undo`, so memory
  keeps matching the file, and the caller answers 500. `open` refuses (server exits 1) a file it
  does not understand or one with two records of one code. `isExpired` is the one place that
  decides expiry. It knows nothing of HTTP.
- `src/server.cjs` owns HTTP: `GET /` (the only HTML page, built by `page()`: title, the total
  `<p>总访问次数：<strong data-total-clicks>N</strong></p>`, form, notice, then a table, newest
  first, rows `<tr data-code="…">` with a `<td data-clicks>` cell), `POST /links` (form →
  303 to `/?created=<code>`), `GET`/`POST /api/links`, `GET`/`DELETE /api/links/<code>` (404
  JSON `{ error: "没有这个短链接。" }` for an unknown code), and `GET /<code>`: 302 to the link
  (counted through `store.hit`), 410 with the 已过期 page (`expiredPage`) for an expired link
  (not counted), 410 with the constant 已删除 page (`deletedPage`, nothing of the link) when
  `store.wasDeleted(code)`, else 404 with the English "Not found" page. Every user value goes through
  `esc`. UI text is Chinese.
- Tests: `npm test` = `node --test --test-reporter=spec test/*.test.cjs` (50 tests, about 5 s).
  Each test starts the real server through `test/helpers.cjs` on a fresh temp data file. They
  pin milestones M1–M3, built before `.ultra/` existed, plus `test/deleted-api.test.cjs` (what
  a deletion keeps doing), and form the invariant `C-suite`. Milestone M4's acceptance tests
  live in `test/m4/`, outside that glob.

## Decisions

- 2026-11-12 A deleted code is remembered in the same data file, as a record
  `{ "code": "<code>", "deleted_at": "<ISO time>" }` among the link records. `open` accepts a
  file holding both kinds; a file of link records only (every existing file) loads unchanged.
  One code is never both a link and a deleted record: the duplicate-code refusal of `open`
  covers both kinds.
- 2026-11-12 A deletion removes the link and records its deleted code in one `commit`; a failed
  save undoes both (the link keeps its place and still redirects).
- 2026-11-12 Choosing a deleted code again (`code` in `POST /api/links`) drops its deleted
  record in the same `commit` that adds the new link. A generated code never takes a deleted
  code. Any new code that puts a code into `links` must take it out of `deleted` in the same
  `commit`, as `add` does.
- 2026-11-12 `open` reads a record that passes the link check as a link (as before) and
  requires every other record to be `{ code, deleted_at }` with a readable `deleted_at`;
  anything else stops the server. Deleted records are kept forever (never pruned).
- 2026-11-12 Deleted records are not links: `get`, `all`, `findPermanent`, the page, the list
  and the JSON API never see them; the API keeps answering 404 for a deleted code. Only
  `GET /<code>` asks whether a code was deleted, and answers 410 with an 已删除 page built like
  `expiredPage`, which shows no original link.
- 2026-11-12 The page's total visit count is computed at each render from the same
  `store.all()` the table shows; no counter is stored. It sits directly under the title, before
  the form, on every answer of `page()` (the 400/413/500 pages after a refused form too).
  `page()` reverses the array `all()` returns, so `all()` must keep returning a new array of
  link records only (a deleted record in it would make the total `NaN`).

## Facts

- 2026-11-12 (three runs of `npm test`): 49 of 49 pass in 4.8–5.7 s; no flaky test seen.
- 2026-11-12 (reading `src/store.cjs`, `src/server.cjs`): a deletion drops the record from the
  `Map` and the file, so a deleted code answers the 404 "Not found" page and nothing remembers
  it; links deleted before M4 will keep answering 404. An expired link's `GET /<code>` answers
  410 before `store.hit`, so it is not counted.
- 2026-11-12 (reading `open`): a record that is not a link record stops the server, so a data
  file holding a deleted record stops an older Shortlink (it never brings a deleted link back).
- 2026-11-12 (`test/custom-code.test.cjs`, `test/dedupe.test.cjs`): choosing a deleted code
  again works, and dedupe never gives back a deleted link; both are in `C-suite`.
- 2026-11-12 (spec reporter output on Node 25.7.0): a top-level test prints as `✔ <name>` at
  the start of its line.
- Open unknowns: none that decides this milestone.
