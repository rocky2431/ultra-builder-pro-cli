# Shortlink

## Direction

North star: the person who runs Shortlink sees at a glance how much its links are used, and a
person who follows a removed short link learns it was removed on purpose instead of meeting a
plain "Not found".

Users: the operator who creates and deletes links (the page and the JSON API), and the visitors
who open short links.

Success: both behaviors below are live, every test of the existing suite still passes, and
nothing else changes for users. Abandon (stop and ask): remembering deleted codes would need an
npm dependency or a second data file.

Boundary: in scope are the total of all visits on the page at `/`, and 410 已删除 for a deleted
short link. Out of scope are any change to the JSON API's answers, a delete button on the page,
restoring a deleted link, and user documentation (the project has none). Must not change:
everything the existing suite pins, including that a code that never existed answers 404 and
that a deleted code can be chosen again.

Elegance: no npm dependency; one data file, written atomically through the store; the store
owns every read and change of link data and knows nothing of HTTP, and the server owns HTML; a
small diff in the existing style.

## Interface

- Start: `node src/server.cjs`, with `PORT` (`0` picks a free port) and `SHORTLINK_DATA` (the
  data file's path) from the environment. When ready it prints
  `listening on http://127.0.0.1:<port>`.
- The page at `/` lists each link in an element carrying `data-code="<code>"`, with its visit
  count in an element carrying `data-clicks`.
- Acceptance tests live under `test/` and use `test/helpers.cjs`. Only the acceptance author
  edits files under `test/`.

## REQ-total-visits Total visits at the top of the page

At the top of the page at `/`, with or without `?created=`, above the form, a person sees
总访问次数 followed by the total number of visits over all links. The total is the sum of the
visit counts of every link the page lists, expired links included. A deleted link is no longer
listed, so its visits leave the total. Only a visit that redirects counts, as for each link's
own count, so a 404 or 410 answer adds nothing. With no links the total reads 0. It is written
in plain decimal digits.

Interface: exactly one element carries the attribute `data-total-visits`. Its text is the
total, in decimal digits with no separator. It comes before the `<form` of the page, and the
label 总访问次数 comes before it.

Done when: opening `/` shows at the top the total of all visits; it equals the sum of the
visit counts listed below it and goes up by one with every visit that redirects.

## REQ-deleted-page A deleted short link answers 410 已删除

A person who follows a short link that was deleted gets status 410 and an HTML page saying
已删除, so they know it was removed on purpose. Nothing is redirected and no visit is counted.
The page does not show where the link used to go, and it is still the answer after the server
restarts. A link that had expired and was then deleted says 已删除 too. A deleted code that is
chosen again opens the new link, also after a restart, and says 已删除 again once that link is
deleted. A code that never existed still gets the 404 page. A link deleted before this change
was not kept anywhere and answers 404. The JSON API does not change: the list and the page
leave a deleted link out, and `GET /api/links/<code>` and a second `DELETE` answer 404.
Rolling back: once a link has been deleted, the data file keeps its deleted code, which a
Shortlink from before this change cannot read; that version refuses to start on the file and
leaves it untouched.

Interface: the answer is `410` with `Content-Type: text/html; charset=utf-8` and no `Location`
header. Its body holds 已删除 and does not hold 已过期.

Done when: following a deleted short link answers 410 with a page saying 已删除, also after a
restart, and a code that never existed still answers 404.
