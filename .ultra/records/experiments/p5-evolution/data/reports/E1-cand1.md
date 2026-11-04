N-edit is done: `PATCH /api/links/<code>` is implemented, `C-edit` is green, and `ubp node done N-edit` passes. The working tree is clean, and I started no servers that are still running.

## Commits (on `main` in `/tmp/evo/E1-cand1`)
- `face542` feat(edit): change where a link goes through the API
- `70f2872` docs(ultra): hand off N-edit and record its rulings
- `d2aa6f9` docs(ultra): fix the dash spacing of two N-edit rulings
- `530a5c5` chore(ultra): record N-edit evidence and completion

## Checks
- `ubp check C-edit` printed `C-edit: pass (exit-0)` and exited 0. It was red on the committed tree before my change: both tests failed with `SyntaxError: Unexpected token '<'`, because the server answered its HTML 404 page where the check reads JSON.
- `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` printed `pass (exit-0)` for all eight and exited 0.
- `ubp node done N-edit` failed the first time with `plan-gate: Plan gate is fail`. The gate flagged two of my three new rulings as malformed because I had left out the space before an em dash. I fixed the spacing in `d2aa6f9` with no wording change. `ubp gate` then passed, and `ubp node done N-edit` printed `node N-edit: pass` and exited 0.

## What changed
- **`src/store.cjs`:** new `retarget(code, url)`, built on `commit(undo)`. It edits the record in place, so the link keeps its place in the list, its code, clicks and expiry.
- **`src/server.cjs`:** the new `PATCH /api/links/<code>` route.
  - Success answers `200` with the same shape as `GET /api/links`.
  - Answers are checked in the order 404, 413, 400, then the edit.
  - A failed save answers `500` and puts the old `url` back.

## Hand probing
I wrote a probe script outside the repository, `/tmp/evo-probe-edit/probe.cjs`, and all 249 cases pass.
- **Cases:** every interface plus a restart, 28 refused inputs, 16 awkward accepted links, body sizes up to a 56 MB body, a read-only data directory, expired and legacy records, and a delete racing the body.
- **Discrimination:** the script fails on the pre-change tree and on three deliberately broken copies (no rollback, no second lookup after the body, `clicks` applied from the body).
- **One correction:** the only failure on the real tree was a wrong expectation of mine. A raw space is sent unchanged in `Location`, which is existing REQ-redirect behavior.

## Rulings (all L2, in `.ultra/rulings.md`; nothing escalated)
1. Unknown code answers 404 before the body is read, and the code is checked again after it. The second check matters: without it, a delete arriving mid-body made the PATCH answer a wrong 500.
2. `retarget` takes a code and returns the record, or `null` when the save failed or the code is unknown.
3. Only `url` is read from the body. Other fields are ignored and still answer `200`. An expired link can be edited and stays expired.

## Not pinned by `C-edit`
All of these were probed by hand and are listed in `.ultra/records/handoffs/N-edit.md`.
- Survival across a restart, and the page showing the new link.
- The 413, and the failed-save rollback.
- Ignored extra fields, expired-link edits, odd codes, and the delete race.

Also left open:
- The 413 text says "未创建任何链接" (no link created). It is the spec's exact string, so I kept it.
- Two clients editing at once: the last request wins, with no version check.
- Not run in a real browser; no markup changed.

The first `evidence.jsonl` diff, nine lines at 18:02Z, was already uncommitted before I started. I committed it in `530a5c5` with my runs. A server process from `/tmp/evo/E1-cand3` (pid 79920) is running; it is another unit's, and I left it alone.
