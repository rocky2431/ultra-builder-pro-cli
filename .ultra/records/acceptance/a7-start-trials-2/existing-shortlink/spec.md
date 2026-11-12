# Shortlink

## Direction

North star: the person who runs Shortlink sees at a glance how much all their links are used,
and a person who follows a short link that was deleted learns it was removed on purpose,
instead of meeting a plain "Not found".

Users: the operator, who creates links on the page at `/` or through the JSON API and deletes
them through the API; anyone who opens a short link.

Success: the top of `/` shows a total of visits that always equals the sum of the 点击次数
column; a deleted short link answers 410 with a page saying 已删除, also after a restart; a
code that never existed still answers 404; everything the existing test suite pins keeps
passing.

Abandon: if remembering deleted codes would need a database, an npm dependency, or a data file
that existing data files can no longer be read into, stop and ask the Owner.

Boundary: in scope are the total on the page and the 410 page of a deleted short link. Out of
scope: a total in the JSON API, undeleting, a delete button on the page, showing when or why a
link was deleted, and any other change to how links are created, listed, opened, expired,
counted or deleted. Must not change: every behavior the existing test suite pins, among them
that a deleted code can be chosen again and then opens its new link, and that the JSON API
answers 404 for a deleted code.

Elegance: no npm dependency; the change lives in the two existing modules, `src/store.cjs`
still owning the data and `src/server.cjs` the HTTP; the smallest code that meets the checks;
every text that came from a user or the data file goes through `esc`.

## Interface

- Start: `node src/server.cjs` (`npm start`). `PORT` (`0` picks a free port) and
  `SHORTLINK_DATA` (the data file) come from the environment. Ready line:
  `listening on http://127.0.0.1:<port>`.
- The page at `/` lists each link in a row carrying `data-code="<code>"`, with its visit count
  as the text of the cell carrying `data-clicks`. Nothing else on the page carries `data-code`.
- A link is deleted with `DELETE /api/links/<code>` (204, no body).
- Acceptance tests are the files `test/*.test.cjs`, using `test/helpers.cjs`. The names of this
  milestone's acceptance tests start with `REQ-total-visits:`, `REQ-deleted-410:` or
  `M4 journey:`; no other test name may start so.

## REQ-total-visits Total visits at the top of the page

At the top of the page at `/`, above the form, the operator sees the label 总访问次数 and the
total number of visits over all links: the sum of the visit counts of the links the page
lists. An expired link is listed, so its visits count; a deleted link leaves the list, and its
visits leave the total. A visit is what each link's count already counts, an opening that
redirects; an answer 404 or 410 adds nothing. With no link the total is 0, and a restart does
not change it.

Interface: the number, in decimal digits, is the whole text of an element carrying the
attribute `data-total-visits`. The label 总访问次数 comes before that element, and both come
before the page's `<form`.

Done when: I open `/` and see at the top 总访问次数 with a number equal to the sum of the
点击次数 column; after I open a short link it goes up by one, and after I delete a link it
drops by that link's visits.

## REQ-deleted-410 A deleted short link answers 410 已删除

When someone opens (GET) the short link of a link that was deleted, the answer is 410 with an
HTML page that says 已删除, without a redirect and without showing where the link used to go,
so a person who follows an old link knows it was removed on purpose. It stays so after the
server restarts. Opening it counts no visit. A code that never existed still answers the plain
404. A deleted code that is chosen again for a new link opens that new link; deleted again, it
answers 410 again. A link deleted after it expired says 已删除. The JSON API keeps answering
404 for a deleted code.

Interface: the 410 answer has `Content-Type: text/html; charset=utf-8`, contains the text
已删除 and not 已过期, and has no `Location` header.

Done when: I delete a short link and open it: I see a page saying 已删除 with status 410,
also after the server restarts, while a code that never existed still gives 404.
