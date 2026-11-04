N-edit is finished and `ubp node done N-edit` passed. `PATCH /api/links/<code>` now changes where a link goes, and all nine checks are green on the committed tree. The working tree is clean, and `ubp status` now says the next item is the milestone gate.

## Commits (local, on `main` in `/tmp/evo/E1-cand3`)

| Hash | Subject |
|---|---|
| `6d9199d` | feat(edit): change where a link goes through the API |
| `983f9ac` | docs(ultra): hand off N-edit and record its rulings |
| `19672c5` | docs(ultra): fix the separator of two N-edit rulings |
| `c88322a` | chore(ultra): record N-edit evidence and completion |

## What changed

- **`src/store.cjs`**: new `setUrl(code, url)`, built on the existing `commit`. It changes only `url`, in place. A failed save puts the old url back, and the link keeps its place in the list.
- **`src/server.cjs`**: the `PATCH` route reads the body first, then answers in this order: unknown code 404, body over 64 KiB 413, refused link 400, failed save 500, otherwise 200 with the `GET /api/links` shape.
- **Why the body is read first:** if the route looked the code up first, a `DELETE` landing while the body was still arriving would reach `setUrl` and get a 500. A copy of the route written that way did exactly that in my probe.
- **Also written:** `.ultra/records/handoffs/N-edit.md` and four L2 lines in `.ultra/rulings.md`.

## Checks and results

| Command | Result |
|---|---|
| `node --test … test/edit.test.cjs` before the change | 2 failed (HTML 404 where JSON was expected) |
| `ubp check C-edit` | `C-edit: pass (exit-0)`, exit 0 |
| `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` | all 8 `pass (exit-0)`, exit 0 |
| `ubp node done N-edit` | `node N-edit: pass`, exit 0 |

I ran the nine checks twice on the committed tree, and every ledger line says `dirty=false`.

My first `ubp node done` attempt failed (exit 1, "Plan gate is fail") because two of my own rulings had no space before the em dash after a full-width parenthesis. I fixed the separators in `19672c5`, the gate passed, and I re-ran everything.

## Hand probe

My 88-assertion probe passes against the committed code. It covers:
- the same data through the PATCH response, list, page, redirect, file and a kill and restart;
- wrong types, empty and whitespace-only values, non-ASCII text, HTML-special characters and 64 KiB boundary sizes;
- odd codes, an expired link, and a read-only data directory;
- a `DELETE` landing during a slow `PATCH` body.

It also fails against two broken copies, one with no rollback and one that looks the code up before the body. The probe script is at `/tmp/probe-e1c3-scripts/probe.cjs`, outside the repository. Every server was stopped by PID, and none are left running.

## Rulings I recorded (L2, nothing escalated)

1. `setUrl` takes a code and returns only whether the save worked.
2. The route reads the body first, and the answers go in the order 404, 413, 400, 500. An unknown code answers 404 whatever the body holds.
3. Only `url` changes. Other body keys such as `expires_in` are ignored, and an expired link can be edited and stays expired.
4. The 413 reuses the existing size message word for word.

## Still open

- **413 wording:** the message says "未创建任何链接" ("no link was created"), which isn't apt for an edit. Changing it needs the Owner, because `C-create` and `C-journey-m1` pin the string.
- **Behaviour no check pins:** `C-edit` doesn't cover restart, the web page, 413, the failed-save rollback, an expired link, the order of 404/413/400, ignored extra keys, or the delete-during-slow-body case. These are listed in the handoff.
- **Pre-existing ledger lines:** the ledger already had nine uncommitted engine lines when I started (one run of each check, `C-edit` red). I committed them in `c88322a` with my own evidence.
- **Shared `/tmp`:** other `probe-edit-*` directories exist in `/tmp` and `$TMPDIR` that my script did not create. I assume another session uses them, and I touched none of them. I removed only my own leftover directory.
- **Not run in a real browser:** no markup changed.
