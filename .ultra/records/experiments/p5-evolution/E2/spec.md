
## REQ-search Find links by their target
`GET /api/links?q=<text>` answers 200 with the links whose `url` contains `<text>`, ignoring
letter case, newest first, in the shape of `GET /api/links`. `<text>` is the decoded value of
the query parameter `q`, matched literally (no wildcards). Without `q`, or with an empty
`q`, it answers every link. The web page `GET /?q=<text>` lists only the matching links, and
it has a search form (`GET /`) whose field named `q` shows `<text>` again.
Done when: I type part of a long link into the search box and see only the links that
contain it.
