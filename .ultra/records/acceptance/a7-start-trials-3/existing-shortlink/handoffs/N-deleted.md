# Handoff N-deleted: Remember deleted codes; a deleted short link answers 410 已删除

Commit: 12f2187 (src/store.cjs +57 −27, src/server.cjs +14 −1).

## Interfaces created

- Data file: a deletion now leaves a record `{ "code": "<code>", "deleted_at": "<ISO time>" }`
  in the same JSON list. `save` writes the link records first (oldest first, as before), then
  the deleted records in the order they were deleted. A file of link records only loads
  unchanged and is written back unchanged.
- src/store.cjs:
  - A second Map, `deleted` (code → `{ code, deleted_at }`), beside `links`. A code is never in
    both.
  - `wasDeleted(code)` (exported): whether the code belongs to a deleted link that has not been
    chosen again. It is the only way out of the store for deleted codes.
  - `isDeletedRecord(record)`: `code` is a string and `deleted_at` is a string that `Date.parse`
    reads.
  - `open`: a record that passes `isRecord` is a link (as before); any other must pass
    `isDeletedRecord`, else it throws (the server exits 1). The duplicate-code refusal runs over
    both kinds. The error text is now `expected a JSON list of { code, url, clicks, expires_at }
    and { code, deleted_at } records`.
  - `remove(code)`: deletes the link and sets its deleted record in one `commit`; the undo of a
    failed save drops the deleted record and rebuilds `links` in its old order.
  - `add(url, seconds, code)`: a chosen code that was deleted loses its deleted record in the
    same `commit` that adds the link; the undo puts it back (last among the deleted codes).
  - `freshCode`: skips deleted codes as well as link codes.
  - `get`, `all`, `findPermanent`, `hit`, `isExpired` are unchanged and never see deleted
    records.
- src/server.cjs:
  - `deletedPage`: a constant HTML string built like `expiredPage`: `<title>已删除</title>`,
    `<h1>已删除</h1>`, `<p>这个短链接已被删除，不再跳转。</p>`. It contains nothing of the link.
  - `GET /<code>`: after the stored-link branch (302, or 410 `expiredPage`), a new branch
    `request.method === 'GET' && store.wasDeleted(code)` answers 410 `text/html; charset=utf-8`
    with `deletedPage`. Anything else is still the 404 "Not found" page. No other route
    changed: the API detail, the second `DELETE` and the list still answer as before (404
    `{ error: "没有这个短链接。" }` for a deleted code).

## What dependent nodes must know

- No node depends on N-deleted in plan.json. For the M4 gate and later work:
  - `all()` still returns a new array of link records only, so `page()`'s total and its
    `reverse()` are safe (see the N-total handoff).
  - Any new code that writes `links` must keep the invariant "a code is never in both Maps":
    a code taken by a link must leave `deleted` in the same `commit`, as `add` does.
  - A data file that holds a deleted record stops an older Shortlink (its `open` refuses any
    record that is not a link record); a downgrade needs those records removed by hand.
  - test/m4/ is still outside the C-suite glob; folding it into the invariant after M4 is by
    hand (ruling of 2026-11-12, L3).

## Left unfinished

- Nothing of REQ-deleted-410. `ubp check C-deleted C-journey-m4`: both pass. `ubp check`:
  C-suite and C-total pass. `npm test`: 50 of 50 pass.

## Noticed and left unchanged

- Only `GET` is routed for short links: `HEAD /<code>` of a deleted code answers the 404 page,
  as `HEAD` of a live or an expired code already did (noted in the N-total handoff too).
- Neither the 410 pages nor the 404 page send `Cache-Control`. 410 and 404 are heuristically
  cacheable, so in principle a cache could keep the 已删除 page for a code after it has been
  chosen again. No `Last-Modified` is sent, and browsers do not heuristically cache without
  one, so this is unlikely in practice. The page `/` sends `no-store`.
- `open` keeps each record exactly as parsed, so unknown extra fields in a hand-edited record
  are written back on the next save. This was already true of link records and is now true of
  deleted records too.
- `Date.parse` is lenient (`"1"` or `"2026"` parse), so `isDeletedRecord` accepts such a
  `deleted_at`, as `isExpiry` already accepts such an `expires_at`. `deleted_at` is never read
  after loading.
- Deleted records are never pruned. The data file grows by one record per deletion, and every
  save writes them all (the `save` ceiling comment now says O(links + deleted codes)).
- .ultra/design.md Facts still says "49 of 49 pass" in the dated entry. The suite now holds 50,
  as its System section says. The dated fact was true when it was written.

## Behavior no check pins

- The file layout: deleted records come after the link records and carry `deleted_at` (the ISO
  time of the deletion). No check reads the file's records or `deleted_at`.
- A failed save that re-takes a deleted code (500) leaves the code deleted: it keeps answering
  410 and stays in the file once a later save succeeds (probed by hand, not in any test).
- A failed delete leaves no deleted record. This is pinned only indirectly, by
  test/delete.test.cjs: a leftover record would share its code with the restored link, and
  the restart in that test would refuse the file.
- A generated code never takes a deleted code. With 8 hex digits a random collision is very
  unlikely, so no test could reach this branch.
- `open` refuses (exit 1) a file where one code is both a link and a deleted record, and a
  deleted record without a readable `deleted_at` (probed by hand). C-persist pins only two link
  records with one code and a file that is not a list.
- The exact wording, `lang`, title and h1 of the 已删除 page, and that it sends no
  `Cache-Control`. The checks require only status 410, `text/html`, no `Location`, the text
  已删除, and that the original URL and 已过期 are absent.
- `HEAD` of a deleted code answers 404 (above).
