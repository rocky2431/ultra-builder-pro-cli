# Handoff: N-deleted-410 (REQ-deleted-410)

## Interfaces created

- `src/store.cjs` keeps deleted codes as tombstones: a `Set` of codes (`deleted`) beside the
  `Map` of links. A code is in at most one of the two. New export `isDeleted(code)` (true for
  a code whose link was deleted and that has not been chosen again). Exports are now
  `DATA, open, get, findPermanent, all, isDeleted, add, hit, remove, isExpired, isHttpUrl`.
- The data file stays one JSON list: the links, oldest first, then one record per tombstone,
  exactly `{ "code": "<code>", "deleted": true }` (no url, no clicks). `open` reads links with
  `isRecord` (which now also requires that a link has no `deleted` key) and tombstones with
  `isTombstone` (exactly the two keys). The existing one-code-one-record check covers both
  kinds, so a tombstone sharing a code with a link, or two tombstones of one code, stop the
  server like two links with one code. A file without tombstones reads as before and is not
  rewritten by `open`.
- `remove(code)` deletes the link and adds its tombstone in one `commit`; the undo takes the
  tombstone out again. `remove` of a code that is not a link now returns true and changes
  nothing (before, it saved the unchanged list).
- `add(url, seconds, code)` takes the tombstone of a re-chosen code away in the same `commit`;
  the undo puts the tombstone back in its place. `freshCode` skips deleted codes.
- `get`, `all`, `findPermanent` are unchanged and see links only, so the total, the page rows
  and every `/api/links` route never see a tombstone (the API answers 404 for a deleted code).
- `src/server.cjs`: constant `DELETED_PAGE` (410 body, `lang="zh-CN"`, title and `<h1>`
  已删除, the sentence 这个短链接已被删除，不再跳转。), answered with
  `Content-Type: text/html; charset=utf-8` by `GET /<code>` when there is no link with that code
  and `store.isDeleted(code)` is true. It never calls `store.hit`. It is checked after the
  link branch, so a re-chosen code opens its new link.
- New test file `test/deleted-codes.test.cjs` (3 tests, names start `Deleted codes:`, part of
  `npm test` and C-suite): refused files (tombstone sharing a link's code, two tombstones of
  one code, a tombstone with a url, a link carrying `deleted`), a failed save of a re-chosen
  deleted code (500, the code still answers 410 in memory and after a restart), and a pre-M4
  file opening without being rewritten.

## What dependent nodes must know

- No node in plan.json depends on N-deleted-410; this is for the M4 gate and later work.
- design.md is not mine to edit and is now behind the code in three places: the exports list
  lacks `isDeleted`; the data file is "links oldest first, then `{ code, deleted: true }`
  tombstones", not only a list of `{ code, url, clicks, expires_at }`; and `GET /<code>` also
  answers "410 page 已删除 when the code was deleted".
- Any new walk over the data must go through `links` (via `all`/`get`) for links and
  `isDeleted` for deleted codes; never put a tombstone in the `Map`, or the total turns `NaN`.
- A server from before M4 refuses (exits 1, does not overwrite) a data file that holds a
  tombstone, so a rollback after the first delete needs the tombstone records removed by hand.
- Tombstones are never pruned (the open item in design.md Facts): one short record per deleted
  code that has not been chosen again; deleting a code twice still leaves one.

## Unfinished

- Nothing for REQ-deleted-410: C-deleted-410 and C-journey-m4 are green, and `ubp check` left
  C-suite, C-no-deps and C-total-visits green.

## Noticed and left unchanged

- HEAD on any short link (live, expired or deleted) answers the 404 page, because only GET is
  routed to a link; a client or crawler probing with HEAD never sees 302 or 410.
- `open` checks that a code is a string, not that it follows the 4-10 letters-or-digits rule,
  for links before this node and now for tombstones too. A hand-edited code such as `""` or
  `api/links/x` loads but can never be reached as a short link (other routes come first).
- `/<code>` is not percent-decoded: `/%70romo` is not `promo` and answers 404.
- The 404 page is `lang="en"` and says "Not found" while every other page is `zh-CN`, and a
  failed save during a visit answers the browser route with a JSON 500 (both already noted by
  N-total-visits).
- The expect regex of C-deleted-410 names three of its five tests; the other two count only
  through the exit code (already noted by N-total-visits).
- `startRefused` from test/persist.test.cjs is copied into test/deleted-codes.test.cjs because
  test/helpers.cjs must not be edited.

## Behavior no check pins

- Only GET answers 410 for a deleted code; HEAD, POST and every other method answer 404.
- The exact text and markup of the deleted page; that it shows neither the code nor the old
  url beyond what C-deleted-410 checks (it checks the url only); that it has no
  `Cache-Control` header, like the 已过期 page (no `Last-Modified` either, so a browser has
  nothing to cache it heuristically by).
- The position and order of tombstones in the file (after the links, in the order of the
  deletes) and that a failed save of a re-chosen code keeps that order; nothing reads it.
- A generated code never takes a deleted code (random codes; not testable from outside).
- `store.remove` of an unknown code returns true without saving (the server never calls it so).
- The text of the start-up refusal: `expected a JSON list of { code, url, clicks, expires_at }
  and { code, deleted: true } records`; tests check only that stderr is not empty.
- That a failed delete leaves no tombstone is pinned only indirectly: the last test of
  test/delete.test.cjs restarts on the file after a failed delete, which would be refused if a
  tombstone and the link shared the code.
- A deleted code can be chosen again only through the JSON API; the form has no code field.
