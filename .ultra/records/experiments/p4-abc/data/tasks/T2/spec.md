
## REQ-link-detail Look up one link
`GET /api/links/<code>` answers 200 with the same object the list `GET /api/links` shows for
that link. Looking a link up does not count as a click. An unknown code answers 404 with
`{"error": "没有这个短链接。"}`.
Done when: I fetch one link by its code and see how many times it was opened.
