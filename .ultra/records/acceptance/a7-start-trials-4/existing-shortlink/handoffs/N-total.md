# Handoff: N-total (REQ-total-visits)

## Interfaces created

- The page built by `page()` in `src/server.cjs` now has, right after `<h1>Shortlink</h1>`
  and before `<form`, the line
  `<p class="total">总访问次数：<strong data-total-visits>N</strong></p>`.
  `N` is the sum of `clicks` over the array `store.all()` returns, computed when the page is
  built and never stored. It is the only element that carries `data-total-visits`.
- The total and the table come from one `store.all()` call: `page()` keeps that array in
  `links`, adds up the total, then reverses it to make the rows, newest first. So the total
  always matches the `data-clicks` column on the same page.
- No store function was added and `src/store.cjs` is unchanged.

## What dependent nodes must know (N-deleted)

- The total depends on `store.all()` returning link records only, each with an integer
  `clicks`. If tombstones `{ code, deleted_at }` go into the same Map, `all()` must skip
  them (design.md says it does). Otherwise the sum becomes `NaN` (C-total-visits and
  C-journey-m4 go red) and the page gets a broken row for each tombstone.
- A deleted link leaves the total only because `remove` takes it out of what `all()`
  returns. Keep it that way when the tombstone is added. Nothing in `server.cjs` needs to
  change for the total.
- `page()` now uses a local `links` (the array from `store.all()`). Nothing else in
  `server.cjs` has that name.

## Left unfinished

- Nothing for REQ-total-visits: C-total-visits is green and INV-suite is green.
- C-deleted and C-journey-m4 are still red. They cover REQ-deleted-page, which belongs to
  N-deleted. The journey's total assertions already pass, and its first failure is the
  410 已删除 answer.

## Noticed and left unchanged

- `${total}` and each row's `${clicks}` are printed with JavaScript's number-to-string
  conversion. A value of 1e21 or more prints as `1e+21`, and a sum above
  `Number.MAX_SAFE_INTEGER` loses precision. Only a hand-edited data file can get there:
  `open` accepts any non-negative integer Number. The column already behaves this way.
- When the visit cannot be saved, `/<code>` answers 500 with JSON, not HTML, on a route a
  browser opens. This existed before and is out of scope.
- The 404 page is `lang="en"` with "Not found", while every other page is zh-CN. It is
  pinned by INV-suite (REQ-redirect), so it was left alone.
- `class="total"` has no CSS rule, like the existing `class="created"`. It renders as a
  plain paragraph.

## Behavior implemented that no check pins

- The total also shows on the refusal pages that `POST /links` answers with the same page
  (400 bad URL, 400 bad expires_in, 413 too large, 500 save failed), not only on `GET /`
  with or without `?created=`. See the ruling in `.ultra/rulings.md`.
- The exact markup and wording: a `<p class="total">` placed directly after the `<h1>`,
  the label `总访问次数：` with a full-width colon, and the number in a `<strong>`. The
  check pins only the order (label before the number, both before `<form`), that there is
  exactly one total, and that the number is plain digits.
