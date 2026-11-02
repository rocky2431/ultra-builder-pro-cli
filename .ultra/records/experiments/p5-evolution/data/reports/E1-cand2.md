N-edit is done: `PATCH /api/links/<code>` now changes where a link goes. `C-edit` is green and the eight regression checks stay green. `ubp node done N-edit` printed `node N-edit: pass`, and the working tree is clean.

**Commits (all on `main`, nothing installed or pushed)**
- `a109f34` feat(edit): change where a link goes through the API (REQ-edit)
- `bbd6c16` docs(edit): hand off N-edit and record its rulings
- `dee5b67` chore(ultra): record N-edit evidence and completion
- `7a316b6` chore(ultra): record the C-edit run after N-edit completion

The two chore commits hold only engine-written, append-only ledger lines, committed the way earlier nodes did.

**Files changed**
- `src/server.cjs` (the PATCH route, 293 lines)
- `src/store.cjs` (new export `setUrl(code, url)`, now ten exports, 143 lines)
- `.ultra/records/handoffs/N-edit.md`
- `.ultra/rulings.md` (three L2 lines appended)
- the two ledger files

**Checks**

| Command | Result |
|---|---|
| `ubp check C-edit` on the parent commit, before the change | `C-edit: fail (exit-1)` |
| `ubp check C-edit` on the committed tree | `C-edit: pass (exit-0)`, exit code 0 |
| `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` | all eight `pass (exit-0)`, exit code 0 |
| `ubp node done N-edit` | `node N-edit: pass`, exit code 0 |

**What the hand probes covered (details in the handoff)**
- **Interfaces:** after an edit, the response, the list, the redirect, the web page and the data file all show the new link, and so does a restarted server on the same file.
- **Awkward inputs:** 16 refused link values and 7 raw bodies all gave 400 and left the data file byte for byte unchanged. Bodies of 65537 bytes and 66000 bytes (22000 `路`) gave 413, and 65536 bytes was accepted. Odd codes and other methods gave 404. Non-ASCII links, `http:/host` and HTML characters all behaved.
- **Failed save (read-only data directory):** 500, the old URL kept in the list, the redirect and the file, and the order unchanged. The same probe failed (9 of 11) against a copy with the rollback removed, so it can tell the difference.
- **Races and expiry:** a `DELETE` during a slow `PATCH` upload gives 404 and nothing is written back. Three concurrent `PATCH` requests leave the file matching the list. An expired link can be edited, stays expired and keeps its click count.
- **Clean run:** the successful runs wrote nothing to stderr.
- **Servers:** every server was stopped by PID, and none is running now.

**Rulings I recorded without asking**
All three are L2 and in `.ultra/rulings.md`.
1. An unknown code answers 404 without reading the body. The code is looked up again after the body is read, because a delete can land in between. When several things are wrong at once, the order is 404, then 413, then 400.
2. `setUrl` takes a code and changes only `url`. A failed save puts the old URL back.
3. An expired link can be edited and stays expired. Keys other than `url` are silently ignored, so `expires_in` in a PATCH body does nothing. The URL is stored as given, without trimming, as in `POST /api/links`.

**Not pinned by any check**
`C-edit` covers only the success path, an unknown code and one refused link. No check pins these:
- the failed-save rollback
- the 413 and other 400 paths
- the restart
- the web page
- an expired link
- a delete during the upload
- the odd codes

The scope was `src/`, so I did not edit the checks. A later check could cover the rollback with the read-only-directory technique `C-persist` and `C-delete` use. That technique does not hold as root or on Windows.

I escalated nothing; no requirement was changed or narrowed. The probe scripts are in `/tmp/evo-probe-n-edit/` and not in the repository. `probe.cjs` in that directory is not mine and was already there.
