
## REQ-custom-code Choose the short code
`POST /api/links` accepts an optional `code`: 4 to 10 ASCII letters or digits. The new link
gets exactly that code. Any other value of `code` answers 400 with
`{"error": "code 必须是 4–10 位字母或数字。"}`; a code already in use answers 409 with
`{"error": "这个短码已被使用。"}`. A refused request creates nothing.
Done when: I create a link with the code `docs`, and opening `/docs` takes me to it; a second
link with the code `docs` is refused.
