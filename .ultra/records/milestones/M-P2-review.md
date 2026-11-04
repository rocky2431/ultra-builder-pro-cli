# Gate record: M-P2 (commit 97482db, branch v6)

**Recommendation: accept.** Commit 97482db is exactly what I approved, apart from the three FORMATS nit fixes. The sample shows the P2 exit working end to end. Four smaller findings are listed at the end; none blocks the gate.

## 1. Does 97482db carry what I approved?

Yes.
- **Files match.** Every engine file, `bin/install.js`, `tests/engine-p2.test.cjs` and `tests/package-smoke.test.cjs` has the same blob id I reviewed, taken from the index lines of `p2.diff`, `round2.diff` and `round3.diff`. `completion.cjs` and `expect-worker.cjs` are unchanged from `fb8ec70`.
- **Protected hashes match.** All four files in `p2-protected.sha256` hash the same at 97482db and in the work tree. For these paths the work tree has no changes against 97482db.
- **FORMATS is the only difference.** I rebuilt the round-3 FORMATS by applying the three review diffs to `fb8ec70`; it reproduced blob `7d84587` exactly. Diffed against the commit, it differs only by my round-3 nits, all fixed:
  - the 109-character line is re-wrapped;
  - the `no node, it` stub line is gone;
  - the handoff wording now says "nothing is at that path and no directory on the path is a file", which matches the code.
- **Engine limits hold.** The engine is 1,266 lines, with no line over 100 characters.
- **The commit holds more than I reviewed.** It also contains `method/ultra.md` (194 lines), v6's own `.ultra/` truth files and `.gitattributes`, none of which were in my three rounds. Its body says "three review rounds … (21 items, all closed)", which reads as covering the whole commit. It actually covers the engine, the tests and FORMATS, and I count 19 items, not 21. Better to note this in the gate record than to rewrite the commit.

## 2. P2 exit on the reference sample (`ubp-sample-shortlink`)

**M1 went from nothing to closed through the gate.**
- **Order was right.** The checks and plan were committed before any code (`7e64c9a`), and the three nodes were completed in dependency order.
- **The first review was handled as the method says.**
  - The round-1 review said `Verdict: revise`, and it was kept as `M1-review-1.md`.
  - The spec edits went through the gate: two `change` records for M1 in the plan log.
  - All three nodes were redone, at 14:38–14:41.
- **The second review accepted.** Round 2 has exactly one `Verdict: accept` line (line 91, no fences).
- **The closure record agrees with the ledgers.**
  - `journey.run` is `2777d235`, the latest clean pass of `C-journey-m1`.
  - `code` is `47bafac8`, the same code fingerprint as that run.
  - `review.sha256` equals the hash of the file on disk and of the copy committed at `6869a38`, so the review was committed together with the closure.
- **Status afterwards is consistent.** `status` now reads `M2 · 0/2 绿 · 2 红 · 下一项 N-expire · 本里程碑计划变更 0 次`: gate `pass`, not dirty, `closed_not_green` 0. All five M1 requirements are green.

**Touches are counted and proxy answers are marked.**
- `owner-touches.md` has 7 entries: 6 with `proxy: yes`, 1 with `proxy: no` (the Owner's delegation).
- The closure has `proxy: true`, and its Owner words say “未看演示” (did not see the demo).
- Ruling 26 marks the REQ-create narrowing as a proxy answer ("代答").
- Both commit messages say the gate answer is not Owner validation.

## Findings

1. **should-fix, in the method text:** `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6/method/ultra.md:144`
   - It says: run `ubp check --all`, then "Every check, including those of closed milestones, must be green."
   - That cannot be met on the sample. M2's checks were written before its code, and they were red when M1 closed: `C-expire` and `C-journey-m2` both last failed (`exit-1`) at 14:42:18Z.
   - The engine correctly requires only the requirements of this milestone and of closed milestones. A model that follows the text literally would stop at a gate it should pass.
   - Fix: "every check covering a requirement of this milestone or of a closed milestone must be green". This is the same kind of fix as the one already made to the brief's `ubp check` rule.
2. **nit, in the method:** the touch log uses the touchpoint `delegation`, which is not one of the five listed at `method/ultra.md:181`. By the method's own rules, an Owner message that comes in mid-run is `unplanned`. So the "a run that went as planned has no `unplanned` line" count reads one too low. Fix: log it as `unplanned`, or add `delegation` to the list.
3. **nit:** the accepting review, `M1-review.md`, has no `Reviewer:` line; the round-1 review has one. Do not edit it now, because that would break `review.sha256`. Instead, have the method require a `Reviewer:` line in every review.
4. **For the Owner, not a defect:** three decisions that the method reserves for the Owner were made by proxy:
   - all four interview answers;
   - the REQ-create narrowing to a 64 KiB request cap (ruling 26);
   - the M1 gate itself, given without seeing the demo.

   All are marked as proxy. The Owner's final acceptance should confirm them explicitly, the narrowing above all.

Verdict: accept
