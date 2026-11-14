The plan gate passes and the `.ultra` files are committed locally, in three commits on top of the two-commit test commit. I wrote no product code and did not start the node loop.

```
M4 · 2/3 绿 · 1 红 · 下一项 N-readme · 本里程碑计划变更 0 次
```

That is 2 of 3 requirements green, 1 red, next item `N-readme`, no plan changes.

**Link expiry already exists.** When you create a link, through the API (`expires_in`) or the form on the page, you can give it a lifetime in whole seconds. Once that time has passed, opening the link shows a "已过期" page with a 410 instead of redirecting, and the visit is not counted. All 49 existing tests pass. It was built as an earlier milestone (M2), but that milestone was closed by proxy, and the old log says you never saw its demo. That is probably why you asked for it again. You can try it now: `npm start`, then
`curl -s http://127.0.0.1:3000/api/links -H 'content-type: application/json' -d '{"url":"https://example.com","expires_in":10}'`.

I checked two more things by hand:
- **Restart:** a link still stops redirecting after the server restarts. No test covered this, so I added one.
- **Browser caching:** the redirect sends no caching headers, so a browser checks again on each visit and sees the expired page once the time is up.

**What I set up instead of rebuilding it:**
- **Milestone M4, three requirements:**
  - expiry through the API: already met;
  - expiry on the page: already met;
  - a README: new and the only red one, because there is no README, so a new user can't find `expires_in` or learn that it is in seconds.
- **Checks:**
  - Two existing expiry tests plus the new restart test cover the first two requirements.
  - A new README test checks the topics it must cover and sends the JSON body of its `curl` example to a real server.
  - The whole existing test suite is registered as a rule that must keep passing.
  - Each check fails when I break the matching code or the README text in a throwaway copy. To prove the README test can pass, I used a scratch README outside the repo and never committed it.
- **Plan:** one node, `N-readme`, which may only touch `README.md`. Its brief is about 11 KB, well within the 32 KB budget.

**Answers I gave on your behalf.** They are logged in `.ultra/records/owner-touches.md` with `proxy: yes`, and they are not your validation. Three are worth a look:
- **Lifetimes stay in whole seconds.** The README lists common values (3600 for an hour, 86400 for a day, 604800 for a week) instead of adding minutes, hours or days. If you set lifetimes by hand on the page often, adding a unit choice would be a new requirement.
- **"Stops redirecting" includes after a server restart.** That is my reading; your sentence didn't mention restarts.
- **The README is in English**, and it quotes the page's Chinese text exactly.

The other decisions I made without asking are in `.ultra/rulings.md`. The main ones are why the README test sits in `test/docs/`, outside what `npm test` runs, and why the milestone is called M4.

**Next:** brief a writer for `N-readme`.
