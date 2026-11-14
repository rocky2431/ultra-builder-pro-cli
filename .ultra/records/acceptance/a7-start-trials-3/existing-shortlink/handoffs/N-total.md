# Handoff N-total: Total visits at the top of the page

Commit: 8e0f4b6 (src/server.cjs only, +12 −6).

## Interfaces created

- Page `/`: a new paragraph `<p>总访问次数：<strong data-total-clicks>N</strong></p>` directly
  after `<h1>Shortlink</h1>` and before `<form action="/links" …>`. `N` is the sum of
  `link.clicks` over `store.all()`, printed as `${total}` (plain digits, like the
  `<td data-clicks>` cells).
- In `page()` (src/server.cjs): `const listed = store.all();` is now taken once, the total is
  `listed.reduce((sum, link) => sum + link.clicks, 0)`, and the rows come from
  `listed.reverse()`. Nothing changed in src/store.cjs; no counter is stored and the data file
  format did not change.

## What dependent nodes must know (N-deleted)

- The total is summed from `store.all()`. Deleted records (`{ code, deleted_at }`) must stay out
  of `all()`, as the design says: one of them in that list makes `link.clicks` undefined, the
  total `NaN`, and C-total, C-journey-m4 and every page test red.
- `page()` calls `reverse()` on the array `all()` returns, which is only safe while `all()` keeps
  returning a new array each call (it does today: `[...links.values()]`).
- The 已删除 page of `GET /<code>` is a separate page built like `expiredPage`; it does not go
  through `page()` and needs no total.
- C-journey-m4 now passes every total assertion (lines 17–33) and fails first at line 36,
  "the old short link answers 410" (actual 404): that and everything after it is N-deleted's.

## Left unfinished

- Nothing of REQ-total-visits. C-total: pass. C-suite: pass (`npm test` 50/50). C-deleted and
  C-journey-m4 stay red until N-deleted (REQ-deleted-410).

## Noticed and left unchanged

- `GET /<code>` whose visit cannot be saved (`store.hit` false) answers JSON 500
  (`json(response, 500, …)`), so a browser following a short link gets a JSON body, not an HTML
  page. Pinned as 500 by the suite; the body type is not.
- Only `GET` is routed: `HEAD /` and `HEAD /<code>` fall through to the 404 "Not found" page.
- The code in `GET /<code>` and `/api/links/<code>` is the raw path, not percent-decoded, so
  `/%64ocs` does not reach `docs` (codes are ASCII letters and digits, so only hand-crafted URLs
  are affected).
- `isRecord` in `open` accepts any integer `clicks` ≥ 0, including values above
  `Number.MAX_SAFE_INTEGER` or ≥ 1e21 from a hand-edited file; the row cells already print such
  a number in exponent form (`1e+21`), which is not plain digits.

## Behavior no check pins

- The total also appears on the 400, 413 and 500 answers of `POST /links` (they are the same
  page); the checks only read it on `GET /`.
- The exact markup (`<p>` and `<strong>`), the full-width colon in `总访问次数：`, and that the
  total sits after the `<h1>` title: the checks only require the label and the element before
  `<form`, once, after `<body`.
- A total above `Number.MAX_SAFE_INTEGER` loses precision, and one ≥ 1e21 prints in exponent
  form; only reachable through a hand-edited data file.
- A visit whose save fails (500) is not counted in the total, because `store.hit` undoes the
  click; test/persist.test.cjs pins the 500 and the undone count in the file and the API, but no
  check reads the page's total after such a failure.
