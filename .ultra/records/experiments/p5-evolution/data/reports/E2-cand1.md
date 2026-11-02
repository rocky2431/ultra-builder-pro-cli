N-search is done: `C-search` is green, the eight earlier checks stay green, and `ubp node done N-search` exited 0. The working tree is clean, and none of my servers are left running.

**Commits** (all local on `main`, nothing installed):
- `2fe9eab` feat(search): find links by their target (REQ-search)
- `c8a83cb` docs(ultra): hand off N-search and record its rulings
- `2e9a3c5` chore(ultra): record N-search evidence and completion (the engine-written ledger records only)

**Checks and node completion:**

| Command | Result | Exit |
|---|---|---|
| `ubp check C-search` before the change | `C-search: fail (exit-1)` | 0 |
| `ubp check C-search` after the change | `C-search: pass (exit-0)` | 0 |
| `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` | all 8 `pass (exit-0)` | 0 |
| `ubp node done N-search` | `node N-search: pass` | 0 |

`ubp status` now reads `M3 · 1/1 绿 · 下一项 里程碑门`. The "exit 0" on the first row is `ubp check`'s own exit code, which is 0 even when the check fails.

**What changed in `src/`:**
- **Shared match:** `store.search(text)` in `src/store.cjs` is used by both `GET /api/links?q=` and `GET /?q=`. It matches the text literally and ignores case with a regex (`iu` flags). An empty `q` matches every link.
- **Page:** a second form (`GET /`, field `q`) sits below the create form and shows `q` back, escaped. When nothing matches it says `没有匹配的链接。`.
- **Existing bug fixed:** the old `request.url.split('?')` dropped everything after a second `?`, so `?q=what?` searched for `what`. The URL is now split at the first `?` only.

**Hand probes** (scripts and data in temp directories outside the repository; the full list is in `.ultra/records/handoffs/N-search.md`):
- **HTTP probe:** 136 assertions against the real server, including restarts, delete, expiry, click counts, and the page matching the API for 18 values of `q`. They also covered regex characters, `+`/`%20`/`%2B`, bad escapes, repeated `q`, non-ASCII text, and HTML characters in `q`.
- **Fuzz:** 20000 random ASCII queries matched a plain `toLowerCase().includes()` check with no mismatches.
- **Read-only data directory:** searching never writes the data file and works when the directory is read-only.
- **Oversized input:** a 100000-character `q` gets `431` from Node itself, and the server kept answering.

**Rulings:** four L2 lines in `.ultra/rulings.md`. I escalated nothing and changed or narrowed no requirement.
- **Matching:** `q` is not trimmed, so a space-only `q` matches links whose `url` contains a space. Expired links are searchable, like in `GET /api/links`.
- **Query decoding:** it follows form rules, so `+` means a space and a literal plus is `%2B`. The first of repeated `q` wins.
- **Store exports:** `store.cjs` now exports ten names, with `search` the new one.
- **Page text and layout:** the page search form, the empty-result text, and one CSS line spacing the two forms.

**One slip, now fixed:** my second ruling was malformed (no space before ` — 因为`), which failed the plan gate and made the first `ubp node done` exit 1. I fixed that one line in my own rulings file and folded it into the unshared docs commit, so history has no malformed ruling.

**Not pinned by any check:** the handoff lists these.
- Regex characters in `q`, `+` versus `%20` versus `%2B`, non-ASCII case matching, the no-match sentence, and the escaping of `q` in the field.
- Deleted and expired links in search results, and results after a restart.
- A request line of about 16 KiB or more gets `431` from Node, so a `q` that long can't be sent.
- Not run in a real browser; the form and the two-form layout were checked on the markup and over HTTP only.

A node server for `/tmp/evo/E2-cur1` (PID 15989) is running in a different workspace. It isn't mine and I left it alone.
