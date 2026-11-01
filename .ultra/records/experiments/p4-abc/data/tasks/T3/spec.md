
## REQ-dedupe The same link is shortened once
Creating a link, through the API or the web page, whose `url` is exactly the `url` of an
existing link that never expires gives back that existing link and creates nothing: the API
answers 200 with the existing link (same code, clicks unchanged), the page answers 303 to
`/?created=<existing code>`. A request with `expires_in`, or a `url` that differs in any
character, creates a new link as before.
Done when: I shorten the same long link twice and get the same short link both times.
