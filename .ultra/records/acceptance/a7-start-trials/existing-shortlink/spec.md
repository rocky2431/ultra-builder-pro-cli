# Shortlink specification

## Direction
North star: one person or a small team runs Shortlink on their own machine. They paste a long
link and get a short one; opening the short link takes them to the original address; they
can see how many times each link was opened. This work, in the Owner's words (2026-11-12):
"when I create a short link I can say how long it should live, and once that time has passed
it stops redirecting."

Success: following only the README, the Owner starts Shortlink, creates a link that lives a
time they chose from the page and through the API, sees it redirect until then and stop once
that time has passed, also across a restart; and everything that passed before this work
still passes. Abandon: if meeting that sentence needs an npm dependency, a second process or a
change of the data file format.

Boundary: a lifetime is set when a link is created, in whole seconds. Out: other units or a
date picker, changing or removing a lifetime after creation, deleting expired links
automatically, showing a live link's end time on the page, accounts, custom domains,
statistics beyond the click count, a JavaScript framework. Nothing that works today changes:
every behavior the existing test suite pins, the API's field names and messages, and the
data file format stay as they are.

Elegance here: zero npm dependencies, one command (`npm start`) to run, data in one local
JSON file that survives a restart, code short enough to read in one sitting, and no product
code written where the existing code already does what the Owner said.

## Interface
Design (L2) shared by every requirement; the planner may change it with a ruling.
`node src/server.cjs` (what `npm start` runs) starts the server. `PORT` (default 3000; `0`
picks a free port) and `SHORTLINK_DATA` (default `data/links.json`) are read from the
environment. When ready it prints exactly one line `listening on http://127.0.0.1:<port>`.
A short link is `http://<request Host>/<code>`, where `<code>` is 4 to 10 characters from
`A-Z`, `a-z` and `0-9`. On the page at `/`, each link is one element carrying
`data-code="<code>"`.

## REQ-expire Say how long a link lives (API)
`POST /api/links` accepts an optional `expires_in`: a positive integer number of seconds the
link should live, counted from its creation. Any other value (for example `0`, `-1`, `1.5`,
`"10"`, `true` or `null`) answers 400 with `{"error": "expires_in 必须是正整数秒数。"}` and
creates nothing. Every link the API reports carries `"expires_at"`: the ISO 8601 time it
stops redirecting, or `null` when it never expires (`expires_in` absent). Until that time,
`GET /<code>` redirects and counts the visit as for any link. Once that time has passed,
`GET /<code>` answers 410 with an HTML page containing `已过期` and the link's `expires_at`
exactly as the API reports it, sends no `Location`, and counts nothing. A link keeps its
`expires_at` across a server restart and, on the restarted server, redirects until that time
and answers 410 after it.
Done when: I create a short link through the API saying how long it should live; it
redirects until then, and once that time has passed it stops redirecting, also after the
server restarted.

## REQ-expire-page Say how long a link lives (web page)
The form on `/` has an optional field `expires_in`: whole seconds, where an empty field means
never. A valid submission with a lifetime answers 303 to `/?created=<code>` like any other.
A value that is not a positive integer written in plain digits answers 400 with the page,
showing `expires_in 必须是正整数秒数。`, and creates nothing. The list shows `已过期` inside
the element of every link whose time has passed, and opening that link shows the expired
page of REQ-expire.
Done when: on the page I create a short link and say how long it should live; it redirects
until then, and once that time has passed it stops redirecting and the page marks it 已过期.

## REQ-readme A new user learns from the README how long a link lives
`README.md` at the root, in English, tells a new user, with nothing else to read:
- what Shortlink needs: Node.js 22 or later, and no `npm install`;
- how to start and configure it: `npm start`, then open the address it prints,
  `http://127.0.0.1:3000/` by default; `PORT` and `SHORTLINK_DATA` with their defaults; and
  that a data file it cannot use stops it with `cannot use the data file` and the reason on
  stderr, leaving the file untouched;
- how to create a short link from the page and with `POST /api/links`;
- how long a link lives: `expires_in` in whole seconds on the page and in the API, an empty
  field or an absent `expires_in` meaning never, with the common values one hour `3600`, one
  day `86400` and seven days `604800`; the API's `expires_at`; and that once that time has
  passed, opening the short link answers 410 with a page saying `已过期`, and the visit is not
  counted.
It holds at least one fenced code block with a `curl` command that creates a link with a
lifetime by sending its JSON body as `-d '<json>'` to `/api/links`. That body, sent to a
running Shortlink, creates a link that expires `expires_in` seconds later.
Done when: following only the README, a new user starts Shortlink, creates a short link that
lives for a time they chose, from the page and through the API, and knows what a visitor sees
once that time has passed.
