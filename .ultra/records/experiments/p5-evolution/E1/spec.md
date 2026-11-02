
## REQ-edit Change where a link goes
`PATCH /api/links/<code>` with the JSON body `{"url": "<long link>"}` changes the link's
target: it answers 200 with the link in the shape of `GET /api/links` (same code, the new
`url`, clicks unchanged), and from then on the short link redirects to the new target, the
list and the web page show it, and the change survives a restart. The new link is checked as
in REQ-create: a refused link answers 400 with `{"error": "<the rejection message>"}` and a
body larger than 64 KiB answers 413 with the size message; either way the link is unchanged.
An unknown code answers 404 with `{"error": "没有这个短链接。"}`.
Done when: I point an existing short link at a new page, and opening it lands on the new page.
