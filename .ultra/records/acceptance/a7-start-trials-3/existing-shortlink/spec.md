# Shortlink

## Direction

North star: Shortlink is a zero-dependency link shortener. A person pastes a long link on the
page at `/` (or calls the JSON API), gets a short link, and whoever opens the short link lands
on the original. This milestone lets whoever looks after the page see at a glance how much the
links are used in total, and tells a person who follows an old short link that was deleted
that it was removed on purpose.

Users: the people who create and look after links (the page and the API), and the people who
open short links.

Success: both behaviors below hold through the real server, after a restart too, and every
behavior the existing test suite pins still holds.

Abandon: if remembering deleted codes needed an npm dependency, a database or a second data
file; then stop and ask the Owner.

Boundary: out of scope are a delete button on the page, restoring a deleted link, showing
where a deleted link went, and visit history over time. Must not change: the JSON API (a
deleted code still answers 404 there), choosing a deleted code again, the 已过期 page of an
expired link, the 404 page of an unknown code, and one data file into which every existing
data file still loads. Links deleted before this version left no trace and answer 404.

Elegance: no dependency, one data file, one place that decides each answer, code that reads
like the code around it.

## Interface

- Start: `node src/server.cjs`, run from the project root. `PORT` is the port (`0` takes a
  free one); `SHORTLINK_DATA` is the path of the data file. When ready it prints the line
  `listening on http://127.0.0.1:<port>`.
- A short link is `GET /<code>`. Links are deleted with `DELETE /api/links/<code>` (204).
- The page at `/` lists each link in an element carrying `data-code="<code>"`, with its visit
  count as the whole text of an element carrying `data-clicks`.
- Acceptance tests use `test/helpers.cjs`; milestone M4's tests are in `test/m4/`.

## REQ-total-visits Total visits at the top of the page

A person who opens the page at `/` sees, at the top of the page (before the form and the
list), the label 总访问次数 and the total number of visits over all links: the sum of the
visit counts of every link the page lists, expired links included. It is 0 when there is no
link or no visit yet. A visit that redirects raises it by one; a visit that does not redirect
(404, 410) does not; deleting a link takes its visits out of the total, as it takes its row
off the list.

Interface: the number is the whole text of exactly one element carrying the attribute
`data-total-clicks`, written in plain digits without separators, and that element comes
before the `<form` in the HTML.

Done when: I open `/` and see 总访问次数 and the total number of visits over all links at the
top, before the form; I open a short link, come back, and it is one higher.

## REQ-deleted-410 A deleted short link answers 410 已删除

A person who opens the short link `GET /<code>` of a link that was deleted gets status 410 and
an HTML page (`text/html`) saying 已删除, so they know it was removed on purpose, instead of a
plain 404. Nothing redirects and nothing is counted. The page does not show where the link
went, and it says 已删除 even when the link had expired before it was deleted. It still holds
after the server restarts. A code that never existed still answers 404 with the existing page,
which does not say 已删除. A deleted code that is chosen again for a new link goes to the new
link, and answers 410 again once that link is deleted. Everything else about a deleted link
stays as it is: it is off the page and the list, and the JSON API answers 404 for it.

Done when: A short link that was deleted no longer answers a plain 404: it answers 410 with a
page saying 已删除, so a person who follows an old link knows it was removed on purpose. A code
that never existed still answers 404.
