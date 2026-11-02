N-edit is done: `PATCH /api/links/<code>` changes a link's target, `C-edit` is green, and `ubp node done N-edit` exited 0. The eight earlier checks stay green too.

## Commits (local, on `main` in `/tmp/evo/E1-cur3`)
- `3b3ef9d feat(edit): change where a link goes through the API` — `src/server.cjs` and `src/store.cjs`
- `43059d6 docs(ultra): hand off N-edit and record its rulings`
- `ba51cd2 docs(ultra): state the red C-edit failure as the log shows it`
- `65a5ccd docs(ultra): fix the separator of a N-edit ruling for the plan gate`

I installed nothing and edited no spec, check, plan or ledger file by hand.

## Checks, final run on the final committed tree
- Before the change, `ubp check C-edit` was red, exit 1. Both tests failed with `SyntaxError: Unexpected token '<'`: the server sent its HTML 404 page and the test's `res.json()` could not read it.
- `ubp check C-edit` now prints `C-edit: pass (exit-0)`, exit 0.
- `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` prints `pass (exit-0)` for all eight, exit 0.
- `ubp node done N-edit` prints `node N-edit: pass`, exit 0.
- The first `node done` attempt failed with `plan-gate: Plan gate is fail`. The cause was my own third ruling: it had no space before its second dash, so the gate reported `malformed-ruling`. I fixed the separator, `ubp gate --json` returned `ok: true`, and the checks and `node done` were rerun.

## What changed
- **Store:** `store.retarget(link, url)` sets the new `url` in place and saves through `commit`. On a failed save the old `url` is put back. `store.cjs` now exports ten names.
- **Shared body check:** the JSON body check from `POST /api/links` moved into `readLink()`, and both routes use it, so a link is refused by one rule.
- **Route:** `PATCH` answers 200, 400, 404 or 413 as the requirement says, and 500 if the save fails.
- **Race:** the route reads and checks the body before it looks the code up. With the lookup first, a link deleted during the body read would be answered 200 although it is gone. A raw-socket probe confirmed this: the lookup-first variant answers 200, the committed code answers 404.

## Rulings recorded in `.ultra/rulings.md` (all L2)
1. `retarget` takes the record from `get`, as `hit` does, instead of a code like `remove`.
2. A refused link (400) or an oversized body (413) is reported before an unknown code (404), because of the race above.
3. `PATCH` reads only `url` and ignores other fields such as `expires_in`. An expired link can be edited and stays expired (410).
4. The shared `readLink` helper, and the 413 message reused word for word from REQ-create.

Rulings 2 and 3 are the ones to read first: the spec says nothing about two errors at once, or about editing expiry.

## Not covered by any check
The handoff is at `/tmp/evo/E1-cur3/.ultra/records/handoffs/N-edit.md`. I ran 17 probes by hand in a scratch directory, and all passed. They covered:
- a failed save with a read-only data directory (500, memory and file unchanged)
- restart persistence
- odd codes and bad bodies
- extra fields in the body
- editing an expired link
- the race

A differential of 18 `POST /api/links` requests against the previous server gave identical answers. Servers were stopped by PID, and none are left running.

Not verified: no real browser, since no markup changed. The scope was `src/`, so I did not add checks for the failed-save rollback or the race.

## Left for the controller
`.ultra/ledger/evidence.jsonl` and `.ultra/ledger/nodes.jsonl` are modified and uncommitted. The first was already modified when I started, and `node done` added the second. I left both for you to commit, as for earlier nodes. The probe scripts remain in `/tmp/probe-edit-N/`, outside the repository.
