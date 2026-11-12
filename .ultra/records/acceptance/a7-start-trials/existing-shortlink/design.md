# Shortlink: project knowledge

## System

- Shortlink is a zero-dependency link shortener: Node.js 22 or later (`engines` in
  `package.json`; surveyed on v25.7.0), CommonJS, no npm dependency, no build step.
- Run: `npm start` runs `node src/server.cjs`. `PORT` (default 3000, `0` picks a free port)
  and `SHORTLINK_DATA` (default `data/links.json`) come from the environment. It listens on
  127.0.0.1 only and prints one line `listening on http://127.0.0.1:<port>`. A data file it
  cannot use makes it print `cannot use the data file <path>: <reason>` on stderr and exit 1
  before listening, leaving the file untouched.
- `src/store.cjs` owns the data: an in-memory Map mirrored by one JSON file, a list of
  `{ code, url, clicks, expires_at }` records, oldest first. Every change goes through
  `commit` (write a temp file, rename it over the data file, undo the memory change when the
  write fails). `isExpired` is the one place that decides a link has expired
  (`Date.now() > Date.parse(expires_at)`); `add` turns `expires_in` seconds into
  `expires_at` (capped at 9999-12-31T23:59:59.999Z). It knows nothing of HTTP.
- `src/server.cjs` owns HTTP: `GET /` (the page), `POST /links` (the form), `GET` and
  `POST /api/links`, `GET` and `DELETE /api/links/<code>`, and `GET /<code>` (302, 410 for
  an expired link, 404). It validates input (`url`, `expires_in`, `code`), holds every user
  message, escapes HTML and limits a request body to 64 KiB.
- Tests: `npm test` runs `node --test --test-reporter=spec test/*.test.cjs`: 49 tests, about
  5 s, all passing at 8de0e2c on 2026-11-12. Each test starts the real server on a free port
  with a temporary data file through `test/helpers.cjs` (writers never edit it). The suite is
  the invariant `C-suite`. An acceptance test for behavior that does not exist yet lives
  under `test/docs/`, outside that glob, so `C-suite` stays the suite that passes today.
- History: create, redirect, count, persist, page, expiry, expiry on the page, delete, custom
  code, link detail and dedupe were delivered as M1–M3 under an earlier UBP state that commit
  79a778d removed. This plan does not specify them again; `C-suite` keeps them working.

## Decisions

- 2026-11-12 Expiry is the existing mechanism: `expires_in`, whole seconds from creation, on
  the API and the form; `expires_at`, an ISO time or `null`; after it, 410 with an 已过期 page
  and no click counted. M4 changes no product code.
- 2026-11-12 `README.md` is the user documentation, in English, quoting the page's and the
  server's Chinese strings exactly as shown.
- 2026-11-12 `N-readme` covers the expiry requirements as well as `REQ-readme`: their text
  reaches the README writer, and the node finishes only while their checks are green. Its
  scope is `README.md` alone.

## Facts

- 2026-11-12, code at 8de0e2c and `npm test` (49/49 pass): the Owner's sentence is already
  met. The API refuses an `expires_in` of 0, -1, 1.5, "10", true or null with 400 and
  `expires_in 必须是正整数秒数。`; the form takes plain digits only (`0x10`, `1e3` and `+5`
  are refused) and reads an empty field as never.
- 2026-11-12, probe (two servers in turn on one data file, `expires_in` 2): a link keeps
  `expires_at` across a restart, redirects on the new server before its time and answers 410
  after it. No test pinned this before `C-expire-restart`.
- 2026-11-12, probe headers and RFC 9111 §4.2.2 with RFC 9110 §15.1: the 302 carries no
  `Cache-Control` or `Expires`, and 302 is not heuristically cacheable, so a browser asks
  Shortlink again on each visit and sees the 410 once the time has passed.
- 2026-11-12, git history (`79a778d^:.ultra/records/owner-touches.md`): M2, which delivered
  expiry, was closed by proxy; the Owner never saw its demo.
- 2026-11-12, code: the server's clock decides expiry, so a wrong system clock moves every
  expiry. An expired link keeps its code until it is deleted (choosing that code answers
  409). A create with `expires_in` always makes a new link: an expiring link is never the one
  dedupe gives back.
- Open unknowns: none that M4 depends on.
