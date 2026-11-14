Reviewer: Claude reviewer subagent (fresh context), xhigh, round 3

Commit reviewed: `1f25cee6afbb9053cc7eb132375061a4dc11f92d` (branch `m-p6`). HEAD did not move while I worked. I read the diff from the previous closure (`49b1e96..HEAD`) and read the fixes after `a814f6c` line by line. I followed `skills/ultra/references/review.md` and the controller's brief.

(Recorded by the controller verbatim, except that angle brackets the notification transport escaped as HTML entities are restored. Round 1 is `M-P6-review-1.md`, round 2 is `M-P6-review-2.md`.)

All probes ran under `/tmp/p6r3.O8ESAE`:
- `tree/`: a `git archive` of HEAD, then `git init` so the engine can run on it;
- `clone/`: a clone at HEAD; its engine is byte-identical;
- `s/`: scratch projects;
- `mut/`: broken copies;
- `probes/`: the scripts;
- `cfg/` and `home/`: an install into a temporary `--config-dir` with a temporary `HOME`.

In the repository itself I only read files and ran read-only `git` commands. I started no servers.

## Blocking findings

None.

## What must be said to the Owner

### 1. Round 2's "What must be said to the Owner", item by item

| Round-2 item | Fixed at HEAD? | Evidence |
|---|---|---|
| 1. A pinned-behavior change stalls every earlier node | **Fixed for the shape round 2 reproduced**, when the plan uses the skip filter or moves the test outside the invariant's run. The same text still allows two plans that stall (point 2 below). | Drive probes, table below |
| 1a. "L1 modify" during Start | Fixed: the phrase is gone | `skills/ultra/SKILL.md:74-79` |
| 1b. The "a behavior changes" row of Changes after 0→1 | Fixed | `SKILL.md:283` |
| 2. REQ-P6-status text when every milestone is closed | Fixed. The requirement now says "other than the one the line names"; the engine is unchanged; there is a new test. | `.ultra/spec.md:125-128`. Broken copy `allclosed` fails C-engine-p6. New-user probe: a single closed M1, then a notes commit, gives `M1 · 0/1 绿 · 1 过期 · 下一项 检查`, `recheck 0 not_green 0`, as the amended text says. |
| 3/2. Three gaps in the Monitor relay | Fixed in the text, and confirmed live (A5 below) | `references/drive.md:14-24` |
| 3/2. Codex | Partly: the Owner is told to `tail -f .ultra/.runtime/drive.err` | `drive.md:21-25` |
| 3/3. `待复核` did not name the shared text | Fixed | `SKILL.md:41-44`; both READMEs |
| 3/4. Two ambiguities in the design line | Both fixed | `SKILL.md:18-21` ("registering nothing the checks already hold"; "while a drive runs, wait for it to end first") |
| 3/5. Red baseline | Fixed. Probe `probes/cleanup.sh`, run under drive with a red baseline in the invariant and a first `"kind": "cleanup"` node: `writer N-fix: done`, `writer N-01: done`, `check all: pass`, `stop milestone-gate`. The cleaner's "never a large refactor" still has no exception (minor). | `SKILL.md:71-73` |
| 3/9. Raw `ENOENT` before a project starts | Fixed (point 6) | `engine/git-state.cjs:109-112` |
| 3/9. `git init` in Start | Fixed | `SKILL.md:63-64` |
| 3/9. README review path | Fixed | README command tables |
| 3. "each writer line" vs "each line" | Fixed | `drive.md:38-40` |
| 4. Version | Fixed: `6.1.0-rc.0`. Doctor reports it with commit `1f25cee` and `dirty: false`. The README's install line still says 6.0.0, by ruling (point 4). | Install probe |
| 4. This repository's own setup | Done: a Direction (a draft, point 3), `.ultra/design.md`, REQ-P6-docs, and per-test `expect` for C-engine-p6 and C-method-p6 | `.ultra/checks.json` |
| 5. Acceptance gaps | Closed for the engine: six of seven broken copies are caught. The method checks are still structural only, by ruling (point 6). | `mut/` |
| 6. Where a writer puts its own tests | Partly: an invariant written as a glob names no test file, so writer tests under it no longer trigger `check-touched` | `SKILL.md:68-70` |
| 6. The gate's reviewer did not read the design | Fixed | `references/review.md:9-10` |
| 6. Close accepts only the canonical review path | Unchanged; the ruling keeps `--review` | — |
| The four "could be met with less" items | All done: one `review.md`, the drive row moved to `drive.md`, the measured-comparison parenthetical cut, the Start bullets merged | — |

**The pinned-behavior reproduction (brief, point 1).**

- **Setup.** Round 2's shape: existing slug code; invariant `C-inv`; N-01 (README) first in plan order; N-02 changes what the test `keeps dashes at the ends` pins. The invariant is registered as HEAD's Start text says: the runner and the glob `test/*.test.cjs`. The scripted writer is the same as round 2's, under `ubp drive`.
- **Results** (`probes/mk.sh`, `probes/drive.sh`):

  | Plan HEAD's text allows | Drive result |
  |---|---|
  | Pinned test rewritten in place, invariant run with `--test-skip-pattern="drops dashes"` ("behind the runner's skip filter") | `drive: writer N-01: done (exit 0)`, `drive: writer N-02: done (exit 0)`, `drive: check all: pass`, `drive: stop milestone-gate`, on Node 25.7.0 and on 22.21.0 |
  | "To another file", outside the glob (`acceptance/trim.test.cjs`) | The same, reaching `milestone-gate` |
  | "To another file", inside the glob (`test/trim.test.cjs`) | Three `drive: writer N-01: node-not-done (exit 0)`, then `drive: stop attempts-exhausted`. By hand: `node N-01: fail` / `invariant-not-green: C-inv is not green — Keep every existing test passing.` |

- **Conclusion.** Round 2's stall does not recur when the plan takes the test out of the invariant's run.

### 2. A new stall: the glob invariant picks up every red acceptance test in its directory (regression from `36a141f`)

I confirmed this by running it.

- **What the text says.**
  - `SKILL.md:68-70` registers the invariant as "the runner and a glob, not a list of files, so tests added later join it". This sentence is new in `36a141f`.
  - `SKILL.md:151-153` commits every new check's tests red before any implementation.
  - Nothing says where the acceptance author puts those red tests. In `test/`, the glob runs them.
- **Reproduction** (`probes/mk.sh newtest`, `probes/hand.sh newtest`).
  - Same project. The pinned test is handled with the skip filter, as the text says.
  - In addition, REQ-003 is a new behavior. Its red test is `test/title.test.cjs`, and its node N-03 comes last.
  - By hand: N-01's own check passed (`C-docs: pass (exit-0)`), then `node N-01: fail` / `invariant-not-green: C-inv is not green — Keep every existing test passing.`
  - Under drive: three `node-not-done`, then `stop attempts-exhausted`.
  - No pinned behavior is involved: every node before the last new behavior's node is refused.
- **The second trap** is the "another file" wording for the pinned test. A file inside the glob satisfies it and stalls (table above).
- **How A7 round 2 avoided both.** The session wrote its own ruling (`a7-start-trials-2/existing-shortlink/rulings.md:5`): skip this milestone's test-name prefixes "because they are red until their nodes land and would otherwise refuse every node". That is one sample and one model, not the method text.
- **Why it does not block.**
  - REQ-P6-method's new sentence is about a test that pins a behavior ("so no node before the change is refused").
  - Its `Done when` (a headless session reaches the gate with no node refused by the invariant) holds as recorded in A7 round 2.
  - No requirement says anything about new acceptance tests. This is the same class as round 2's point 1.
- **Proposed fix** (an L1 modify of REQ-P6-method's method text, with a ruling): one rule in Start step 1 replacing the red-baseline and pinned-test clauses: "a test that is red now (a red baseline, a pinned test rewritten to the new behavior, or a new requirement's test) stays out of the invariant's run, behind the runner's skip filter by a name prefix or in a directory its glob does not match". Add a C-method-p6 assertion for it.

### 3. The Direction against the Owner's words

The 2026-11-12 L0 ruling makes this a draft for gate step 4. I compared it with:
- `thinking/back-to-essentials-20261030/THOUGHTS.md` (10-30, 10-31);
- `.ultra/records/owner-touches.md` (11-11);
- the Owner-confirmed contract (§8 of `back-to-essentials` RESULT).

**What is faithful:**
- the north-star quote (`THOUGHTS.md:54`);
- the users quote (`owner-touches.md:41`);
- "你不知道具体进度是什么" (`THOUGHTS.md:36`);
- "越改越乱" (`THOUGHTS.md:46`);
- the host scope (§8: "宿主只做 Claude Code 和 Codex");
- "Abandon: not stated by the Owner."

**Where it departs** (none contradicts the Owner, so none blocks; each is the Owner's call at step 4):

- **Elegance line.** The Owner never defined elegance. The method's own interview asks for it (`SKILL.md:93`), and the A7 new-project session asked it. Write "not stated by the Owner", or ask.
- **Success line leaves out the Owner's own success words:**
  - "只要最终能产出一个真正好用的东西就行" (`THOUGHTS.md:52`);
  - "症结在于没有做出来一个真正可用的东西" (`THOUGHTS.md:38`);
  - the contract's "完成的标准是：Owner 能把它拿去做第一个真实工程样本" and "真正的验收是 Owner 的第一个真实样本".

  What it lists instead are the assistant's mechanisms ("progress is computed", "touches only the layer it belongs to"). They answer the Owner's complaints, but they are not the Owner's words. "The Owner is asked only where their judgment is needed" paraphrases the 11-01 delegation ("这个中间应该不太需要我了"), not verbatim.
- **North star.**
  - "产生真实、优雅且非常厉害的工程样本" becomes "real, elegant software".
  - "井井有条" and "极高的辨识度" are dropped.
  - The Owner's two purposes from 10-30 ("1. 自动化 2. 更好、更精确的意图识别与执行") are absent.
- **Boundary.**
  - "no daemon, runner or Python hook" comes from the v6 product boundary (CLAUDE.md, and the Owner's 11-04 "按你的打算来"), not from the Owner's words. On 10-31 the Owner left graph plus loop and async multi-agent open ("都可以纳入考虑"). This is not a contradiction.
  - The cost the Owner accepted, "0 到 1 阶段可能会比较重，但这是我们可以接受的", is absent.
- **No draft marker.** The spec text does not mark the Direction as a draft. Every brief already gives it to writers as the Owner's Direction (this repository's N-P6-method brief, 9993 bytes, carries it). A "放行" that does not address it would close the milestone on an unconfirmed Direction. The step-4 question should show the Direction text itself.

### 4. The README installs 6.0.0, which lacks this milestone's behavior

- **The line.** `README.md:12` (and the zh copy) says `npm install -g ultra-builder-pro-cli@6.0.0`.
- **The conflict.** REQ-P6-docs' `Done when` is "a new user can install, start a project and close a milestone by following the README". Version 6.0.0 has none of M-P6's behavior. For example, `README.md:33` says `ubp status` in a project that has not started "says so", while 6.0.0 prints the raw `ENOENT`.
- **Why the line is there.** The L2 ruling explains it: the README should not point at a version that is not published.
- **The gap.** Nothing checks this line at release: C-package pins only the version in `package.json` and the lock.
- **Why it does not block.** The package is unreleased, and the Owner installs from a commit. I followed the README with the packed `6.1.0-rc.0`, using `node bin/install.js` as `ubp`, from an empty directory:
  - before `git init`: `… is not inside a Git work tree. Run git init first.`;
  - before a commit: `… has no commit. Commit the code first.`;
  - after it: `… has not started: .ultra/spec.md does not exist. Start it with the ultra Skill.`;
  - then `gate: pass`, red check, `node N-01: pass`, and `ubp milestone close M1 --owner "放行" --review .ultra/records/milestones/M1-review.md` gave `milestone M1: pass`.
- **Fix at release:** an install line without a version, or a release check that the README's version equals `package.json`'s when it is not a prerelease.

### 5. Other regressions and small items from the fixes

- **A copied example reviewer stops the drive.**
  - The header says "Copy it and adjust before use" (`docs/examples/drive/claude-reviewer.sh:6`). The script now reads `review.md` relative to its own location (`:16-18`).
  - Copied into a project (`tools/rev.sh`), the drive stopped:
    ```
    drive: reviewer M1: review-invalid (exit 2)
    ```
    and the review log said `review guide not found: …/tools/../../../skills/ultra/references/review.md (set UBP_REVIEW_GUIDE)`.
  - It can be recovered: the `review-invalid` row of `drive.md` says to fix the reviewer command, and the comment at `:15` names the variable.
  - Fix: `drive.md:27-31` could name `UBP_REVIEW_GUIDE` and the installed Skill's `references/review.md`.
  - From the package or repository path it works: with a fake `claude` on PATH, the prompt has the mission lines, then the whole of `review.md`, with backticks intact, also under a path with a space.
- **Documentation as a requirement vs the drive's `check-touched`.**
  - A docs check whose `run` names `README.md` (for example `grep … README.md`) makes `README.md` off-limits to every drive writer. My first probe gave `drive: writer N-01: check-touched (exit 0)` / `check-touched: README.md`.
  - The rule predates M-P6 (FORMATS, "A check names a path…"). It is newly likely because M-P6 makes the README a requirement.
  - Fix: say that a docs check reads the README from inside a test file, as this repository's C-method-p6 does.
- **Status-table wording.** The drive row says "change no file" (`SKILL.md:29`). `drive.md:47-49` then has you remove `.ultra/.runtime/drive.lock` when the pid belongs to another process. The reference resolves this; it is wording only.
- **A wrong fact in this repository's design.** `.ultra/design.md:5-6` says "no runtime npm dependency". `package.json` declares `js-yaml`, which `adapters/_shared/frontmatter.cjs` requires. Every brief carries this line.
- **The progress line now says `本里程碑计划变更 6 次`.**
  - One Direction edit logged one `change` line per milestone (M-P1 to M-P6, all `shared: true`).
  - Status counts every change since the latest closure, whatever its milestone (`engine/states.cjs:104-105`, unchanged since `fb8ec70`).
  - REQ-P3-diff speaks of "each plan change of a milestone". This predates M-P6. The demo should explain the 6.
- **Retro.** The three repeated classes are deliberate red-first runs, but two come from M-P6's opening red-first, not this round:
  - `closed milestones keep counting`: C-engine and C-release, 08:59–09:12;
  - `after a drive stop … truth files back`: C-package, 09:19 and 09:24;
  - only `a project without .ultra/spec.md` (C-engine-p6, 18:15 and 18:18) is from this round.
- **Empty directory.** "A first commit of what is there" (`SKILL.md:63-64`) fails with nothing to commit unless `--allow-empty` is used. The A7 trial made an empty commit.
- **Codex.** There are no line notifications there. The controller tells the Owner to `tail -f` and stops (`drive.md:21-25`), so REQ-P6-method's "relays each line" holds only in Claude Code.

### 6. Acceptance gaps: broken copies

**Engine.** Each copy is under `mut/`; I ran `tests/engine-p6.test.cjs` against each:

| Broken copy | C-engine-p6 |
|---|---|
| Not-started check removed | Fails "a project without .ultra/spec.md…" |
| `=== 'pass'` changed to `!== 'fail'` (a last `unknown` counted as `待复核`) | Fails "a closed requirement is to be rechecked only when…" |
| Current milestone included in the closed counts | Fails "when every milestone is closed…" |
| `--json` problem lines printed to stdout | Fails "drive --json writes each problem of a stop on stderr" |
| Review path compared by basename (accepts `docs/M2-review.md`) | Fails "a milestone closes only on its own review"; the `expect` line is gone |
| Shared text loses its internal empty lines | Fails "the brief keeps the shared text…" |
| Spec check moved before the no-commit check | **Passes 12/12.** No suite asserts the no-commit message. HEAD on that input: `… has no commit. Commit the code first.` (exit 2). The check that would close it: the not-started test, run once on a repository with no commit. |

- So round 2's `unknown` gap is closed.
- The not-started test covers five command forms. I drove all thirteen by hand: `status`, `status --json`, `gate`, `check`, `check --all`, `node done`, `milestone close`, `context`, `approve`, `drive`, `drive --json`, `retro`, `merge`. Each exited 2 with the exact message, and `git status --porcelain --ignored` stayed empty.

**Method text.** C-method-p6 is structural only, by the 2026-11-12 ruling:
- **Pinned test kept in the invariant.** I rewrote the Start bullet so the pinned test "is never taken out of the invariant: it stays in the invariant and is rewritten…". It passes C-method-p6 14/14 and C-package 15/15, because the phrase "out of the invariant" still appears.
- **Blocking sentence deleted.** Deleting `review.md`'s blocking sentence (a spec or Direction that says other than the Owner said) passes both. Nothing asserts that sentence, before this round or now.
- **README command renamed.** Renaming a README command fails C-method-p6 (the REQ-P6-docs test), as it should.

HEAD's text is right at `SKILL.md:74-79` and `review.md:17-18`.

### 7. Could the same acceptance be met with less?

- **Start step 1.** The one rule in point 2 replaces two clauses and also removes point 2's stall.
- **Engine.** The not-started check is 4 lines; the engine is at 2015 of 2050 lines. Nothing to cut. The ruling not to remove `--review` is fine.
- **`claude-reviewer.sh`.** The guide lookup costs 4 lines and adds one failure mode (a copied script). Keep it, and add the documentation line from point 5.
- **`tests/engine-p5.test.cjs`, `gone()`.** The 6 diagnostic lines leave the assertions unchanged. Remove them once the cause is known.
- **The REQ-P6-docs test** (`tests/method-p6.test.cjs:159`) parses `--help` with a hand-written splitter. It could compare against the list the CLI prints for an unknown command ("Use status, gate, check, node, milestone, context, approve, retro, merge, drive."). The gain is small.

### Acceptance criteria

- **A1: met.**
  - This repository's N-P6-method brief compiles to 9993 bytes, with `## Project`, then the Direction, then `### .ultra/design.md`, all before `## Requirements`.
  - C-engine-p6's shared-text test passes.
- **A2: met.** C-engine-p6 passes.
- **A3: met.**
  - Checked on scratch projects.
  - The line from this repository's committed files, read on the clone: `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 6 次`. Every closed requirement is green after the gate's check run.
- **A4: met.**
- **A5: met, confirmed live.**
  - I armed a Monitor with `drive.md`'s exact command on a drive that ended in a stop.
  - It delivered all six lines, including `node-not-done: N-01: node-not-done — Resolve this stop before resuming drive.` and `drive: stop attempts-exhausted`.
  - I stopped the monitor at the drive's completion notice, as the text says.
- **A6: met.**
  - `SKILL.md` is 381 lines.
  - The drive, merge and review instructions are in `references/`.
  - C-method-p6 passes 14/14.
- **A7: met as recorded** in `a7-start-trials-2/`.
  - One sample per trial.
  - The existing-codebase trial was not run under drive.
  - It avoided point 2 through the session's own ruling, not the text.
- **A8: met.**
  - **Full check run.** On the unmodified `git archive` copy, `node engine/cli.cjs check --all` gave every check `pass (exit-0)`: C-engine, C-release, C-engine-p2 to p5, C-package, C-engine-p6 and C-method-p6. Exit 0, final line `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 6 次`.
  - **Release suite.** C-release's log: `ℹ tests 412`, `ℹ pass 412`, `ℹ fail 0`, `found 0 vulnerabilities`.
  - **Pack.** `npm pack --dry-run --json`: version `6.1.0-rc.0`, 40 entries, including `skills/ultra/references/review.md`.
  - **Install.** `--all --global --config-dir <tmp>` with a temporary `HOME` exited 0. `--doctor --json` reported `healthy`, `6.1.0-rc.0`, commit `1f25cee`, `dirty: false`. The installed engines are byte-identical to `engine/`, the installed Skill has no placeholder, and both hosts carry `references/review.md`.
  - **Skill validators.** Skill Creator `quick_validate.py`, Codex and Claude copies: `Skill is valid!` for both.
  - **Plugin Creator.** The local copy has no validator script. The new manifest version `6.1.0-rc.0+codex.3e0b413907e9` is a semantic version, which is what `plugin-json-spec.md` asks for.
  - **Node 22.21.0.** C-engine-p6 12/12, C-method-p6 14/14, C-package 15/15, and the skip-filter drive probe reached the gate.
- **A9:** waiting on the Owner.

**Spec against the Owner's words.**
- The REQ-P6-status narrowing ("other than the one the line names") was named in the step-4 question the Owner answered "先修".
- REQ-P6-method and REQ-P6-docs only add.
- The changed C-package assertions keep their strength:
  - the bar phrases are now asserted on the one `review.md`;
  - the gate and the example reviewer must name it, and C-method-p6 checks that the example actually reads it (`cat "$GUIDE"`);
  - the lock assertions moved to `drive.md`, and the status-table row must route there and say "change no file".
- I found no spec change that leaves an input or user with less without approval. The Direction is point 3.

### Not checked

- A live headless model session (I ran none).
- The Codex host.
- Linux.
- `engine-p5` and the full release suite on Node 22: I stopped my Node 22 `engine-p5` run so it would not overlap the full run's timing-sensitive interrupt test.
- The Plugin Creator validator (none available).

Verdict: accept
