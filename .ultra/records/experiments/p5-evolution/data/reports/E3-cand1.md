N-stats is done and `ubp node done N-stats` passes. `C-stats` is green, the eight earlier checks stay green, and the working tree is clean.

## Commits (local, on `main`)
- `935e0d6` feat(stats): show the totals through GET /api/stats and on the page
- `7c6d01c` docs(ultra): hand off N-stats and record its rulings
- `ced28a4` docs(ultra): fix the format of two N-stats rulings
- `6d15677` chore(ultra): record N-stats evidence and completion

## What changed
- **Code:** only `/tmp/evo/E3-cand1/src/server.cjs` changed (22 lines added). `totals()` counts the three numbers from `store.all()` and asks `isExpired` about expiry. `GET /api/stats` and the page both read it.
- **Page:** the line `链接 N 条 · 点击 N 次 · 过期 N 条` sits under the `<h1>`, with each number in a `<b data-total-…>`. `store.cjs` is untouched.
- **Records:** `/tmp/evo/E3-cand1/.ultra/records/handoffs/N-stats.md` and three new lines in `/tmp/evo/E3-cand1/.ultra/rulings.md`.

## Checks
| Command | Result | Exit code |
|---|---|---|
| `ubp check C-stats` | `C-stats: pass (exit-0)` (red on the committed tree before the change) | 0 |
| `ubp check C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete` | all eight `pass (exit-0)` | 0 |
| `ubp node done N-stats` | `node N-stats: pass` | 0 |

My first `ubp node done N-stats` failed with `plan-gate: Plan gate is fail`. Two of my own ruling lines had a parenthetical the ruling format refuses. I fixed the wording in `ced28a4` and the second run passed.

## Hand probes
- **Coverage:** I checked the API, the page numbers, the list, the row count and the 已过期 count against each other. The steps were create (API and form), visit, expiry, `410` and `404` visits, a `SIGKILL` restart, delete, and a read-only data directory. They also covered the `400`, `413` and `500` pages, odd paths and methods, hand-written data files with legacy or hostile records, and 20,000 links.
- **Result:** every step agreed.
- **Browser:** one headless Chrome screenshot looked right. I did not try an interactive browser.
- **Servers:** every one was stopped by its PID and none is left running.
- **Mutant:** a copy of `src/` that drops expired links' clicks from the total passes `C-stats` (2 of 2) but fails my probe. `C-stats` never uses an expired link, so it doesn't pin the `expired` number or that rule.

## Escalated and rulings
- **For the Owner:** `spec.md` Direction still says "no statistics beyond the click count", while REQ-stats adds totals. I built REQ-stats as the newer, explicit requirement and recorded it as an L1 ruling. The Owner should either confirm it or amend that line, which is outside my scope. If the intent was no totals, revert `935e0d6`.
- **L2, counting:** `links` and `clicks` include expired links and their clicks, and only a delete removes them. The counting lives in `server.cjs`.
- **L2, page wording:** the label says 过期, not 已过期, so 已过期 stays the marker of a single row, and the totals line sits before the list. `row()` slices to the end of the page, and `C-journey-m2` checks 已过期 per row, so a stray 已过期 would fail those checks.

## Not pinned by any check
- An expired link is counted in `links`, `clicks` and `expired`.
- A delete lowers the totals.
- The totals survive a restart.
- A failed save leaves the totals alone.
- The totals line appears on the refusal pages.
- Other methods and paths on `/api/stats` answer `404`.

The handoff also records the ceilings I found:
- Counting is O(links) per request.
- A link can expire between `totals()` and the row marks of the same render.
- Hand-edited click counts of 2^53 or more print in exponent notation.
- A link coded `api/stats` in a hand-edited file is shadowed by the route.

Before this run, `.ultra/ledger/evidence.jsonl` already had nine uncommitted rows from the controller's red baseline run. They went into `6d15677` together with my rows, append-only and as the engine wrote them.
