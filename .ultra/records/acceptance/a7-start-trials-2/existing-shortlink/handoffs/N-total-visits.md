# Handoff: N-total-visits (REQ-total-visits)

## Interfaces created

- The page at `/` now shows, right under `<h1>Shortlink</h1>` and above the form:
  `<p>总访问次数：<strong data-total-visits>N</strong></p>`. `N` is the sum of `clicks` over
  `store.all()`, worked out in `page()` of `src/server.cjs` on every render
  (`const links = store.all(); const total = links.reduce((sum, link) => sum + link.clicks, 0);`)
  and never stored. The rows are built from the same `links` array, reversed, so the total
  and the 点击次数 column always come from the same records.
- No store export was added or changed; `src/store.cjs` is untouched. No new test file.

## What dependent nodes must know (N-deleted-410)

- The total trusts `store.all()` to return live links only, each with an integer `clicks`.
  If tombstones go in the same `Map`, or `all()` returns them, the total becomes `NaN`
  (`totalIn` then reads `null`), a row with `undefined` appears, and `GET /api/links` lists
  them. Keep `all()` as "the links the page lists".
- The same goes for the other walks over `links`: `findPermanent`, and `freshCode`, which per
  design.md must also never pick a deleted code. `save()` writes `[...links.values()]`, and
  `open()` refuses anything `isRecord` rejects, so a tombstone record in the file needs its
  own validation path.
- C-total-visits must stay green after the 410 work. Its second test deletes `live1`,
  asserts `notEqual(302)` on opening it (true for today's 404 and for the coming 410),
  then checks that the total stays 43 after that open and after a SIGKILL restart on the
  same data file. So the deleted page must not call `store.hit`, and a data file holding
  tombstones must open again.
- C-journey-m4 now passes every total assertion and first fails at
  `test/journey-m4.test.cjs:38` ("the old short link answers 410"). What is left in it is
  REQ-deleted-410.

## Unfinished

- Nothing for REQ-total-visits. C-deleted-410 and C-journey-m4 are red, as they were before
  this node; they belong to N-deleted-410.

## Noticed and left unchanged

- The 404 page is `lang="en"` and says "Not found", while every other page is `zh-CN`.
  The Direction keeps the plain 404 for unknown codes, so I left it.
- A failed save during a visit (`store.hit` returns false) answers `/<code>`, a browser
  route, with a JSON 500 rather than an HTML page.
- The `data-clicks` cell prints `clicks` without `esc`. That is safe, because `open` admits
  only non-negative integers, and the total follows the same convention (see rulings).
- The `expect` regex of C-deleted-410 names three of the five REQ-deleted-410 tests. The
  other two ("a code that never existed still answers the plain 404" and "a deleted code
  chosen again ...") are caught only through the exit code. The check did report
  `fail (exit-1)`, so the exit code does count.
- The doc comment on `store.all()` says "Every link". If tombstones arrive, keep it true.

## Behavior no check pins

- The exact markup: a `<p>` with a full-width colon and a `<strong>`, placed directly under
  the `<h1>`. The tests pin only the order label, then the element, then `<form`, and that
  the element's whole text is the number.
- The total also shows on the 400, 413 and 500 renders of the page (a refused form, a body
  too big, a failed save), because they go through the same `page()`.
- The total stays current on back navigation only because of the existing
  `Cache-Control: no-store` on the page.
- A hand-edited data file whose clicks add up past 2^53 gives an inexact total. At 1e21 and
  above it prints in exponent form (`1e+21`), as the column cell already does.
- The JSON API has no total. That is out of scope, and no test asserts that it is absent.
