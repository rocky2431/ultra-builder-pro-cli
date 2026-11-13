# Handoff: N-deleted (REQ-deleted-page)

## Interfaces created

- `src/store.cjs` exports `isDeleted(code)`: true when a link with this code was deleted and
  the code has not been chosen again since. It is the only reader of the tombstones. `get`,
  `all` and `findPermanent` are unchanged and never return a tombstone.
- The data file can now hold tombstones `{ "code": "<code>", "deleted_at": "<ISO time>" }`
  (`deleted_at` is `new Date().toISOString()` at the delete). `save` writes the link records
  oldest first, then the tombstones in the order of their deletes. `open` accepts both kinds
  in any order, refuses a tombstone whose `deleted_at` `Date.parse` cannot read or that has a
  `url` or a `clicks` key, and refuses two records of one code, a tombstone's included. Its
  error message now reads `expected a JSON list of { code, url, clicks, expires_at } links and
  { code, deleted_at } deleted codes`.
- In memory, tombstones live in a second Map `deleted` beside `links` (not exported). A code is
  in at most one of the two.
- `remove(code)` deletes the link and adds its tombstone in one save. On a failed save both
  Maps are put back exactly (the link in its place, no tombstone).
- `add(url, seconds, code)` with a deleted code drops its tombstone in the same save; the new
  link is the newest (last). On a failed save the link is gone and the tombstones are back in
  their order. `freshCode` skips deleted codes as well as live ones.
- A new internal helper `restore(map, entries)` rebuilds a Map in its old order; `remove` now
  uses it instead of its inline loop.
- `src/server.cjs`: a constant `DELETED_PAGE` and one branch in `/<code>`: GET on a deleted
  code answers `410`, `Content-Type: text/html; charset=utf-8`, no `Location`, body
  `<title>已删除</title><h1>已删除</h1><p>这个短链接已被删除，不再跳转。</p>` (zh-CN). It sits
  after the live/expired branch and before the 404, and counts nothing.

## What dependent nodes must know

- No node depends on N-deleted in this plan. For the milestone gate and later work:
- design.md `## System` still describes the file as a list of `{ code, url, clicks,
  expires_at }` records, oldest first, and `/<code>` as 302 / 410 已过期 / 404. Both are now
  out of date: the file also holds tombstones, after the links, and `/<code>` answers 410
  已删除 for a deleted code.
- Downgrade: once a delete has written a tombstone, the Shortlink of before this change refuses
  the file at start (its `open` knows no tombstone): it exits 1 and leaves the file untouched.
  Going back to an older version would need the tombstones removed from the file by hand.
- Anything new that reads links must use `get`/`all`/`findPermanent` (no tombstones) and ask
  `isDeleted` only where a deleted code must answer differently. Anything new that changes
  data must keep a code in at most one Map, or the next `open` refuses the file.

## Left unfinished

- Nothing for REQ-deleted-page: C-deleted and C-journey-m4 are green, and INV-suite and
  C-total-visits stay green (`ubp check` after the code commit).
- Folding the two L2 rulings into design.md is the controller's.

## Noticed and left unchanged

- Tombstones are kept for ever: about 60 bytes per delete, written in every save. The comment
  on `deleted` in src/store.cjs gives the ceiling and an upgrade path (forget old ones).
  The requirement says the 410 must survive restarts and sets no limit.
- Neither 410 page (已过期, 已删除) nor the 404 page sends `Cache-Control`. A deleted or never
  used code can later open a link, so a cache that kept a 410 or a 404 would hide it. Browsers
  give no heuristic lifetime without `Last-Modified`, which Shortlink never sends, so I matched
  the existing pages and added nothing.
- `open` does not check a tombstone for other extra keys (an `expires_at` on one is kept as
  is), nor that `deleted_at` lies in the past, nor that its code follows the 4-10 rule (link
  codes are not checked there either).
- HEAD on any short link answers 404, deleted or not: the branch has always answered GET only.
- From N-total, still true: a failed save on a visit answers 500 with JSON on a browser route,
  and the 404 page is `lang="en"` "Not found" (pinned by INV-suite).

## Behavior implemented that no check pins

- The file layout: tombstones after the links, the `deleted_at` value and format. No check
  reads the file.
- `open`'s validation of tombstones (bad time, `url` or `clicks` on a tombstone, a link and a
  tombstone with one code: each stops the server) and its new error text. Probed by hand.
- A generated code never takes a deleted code (random, so no check can reach it).
- A re-chosen deleted code becomes the newest link in the list. A re-choose whose save fails
  answers 500 and the code still answers 410 (probed by hand). The tombstone's place in the
  file after a failed save.
- The page's exact wording, `lang="zh-CN"`, and that it shows no time. The check pins 410,
  text/html, no Location, 已删除 present and 已过期 absent, and the old url absent.
- Only GET answers 410; POST, HEAD and the rest answer 404 on a deleted code.
