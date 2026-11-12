Reviewer: Claude reviewer subagent (round-3 context resumed), xhigh, round 3 re-check

Commit checked: `a3ca72f` (`1f25cee..a3ca72f`: `4eba187`, `85d8b8e`, `a3ca72f`). HEAD is `72cc678`, which adds only `.ultra/ledger/` lines and `.ultra/records/` files (`git show --stat 72cc678`), and it did not move while I worked.

(Recorded by the controller verbatim. This re-check is not a review round: it checks the fixes after round 3 (`M-P6-review.md`) under the last 2026-11-12 L1 ruling of `.ultra/rulings.md`.)

This is not a fourth round. Under the last 2026-11-12 L1 ruling I checked three things: my round-3 points, the regressions these three commits introduced, and where the same acceptance could be met with less.

Unchanged since `1f25cee`: the engine, the hook, the adapters, `bin/`, both example scripts, `references/review.md` and the version (`git diff --stat 1f25cee a3ca72f -- engine/ hooks/ adapters/ bin/ docs/ skills/ultra/references/review.md package.json package-lock.json` is empty).

All probes ran under `/tmp/p6r3.O8ESAE`:
- `clone3/`: a clone at `a3ca72f`;
- `clone4/`: a clone at `72cc678`;
- `tree4/`: a `git archive` of `72cc678`, with `git init` so the engine can run on it;
- `mut4/`: broken copies;
- `s/`: scratch projects;
- `cfg4/` and `home4/`: an install of `a3ca72f` into a temporary `--config-dir` with a temporary `HOME`;
- `probes/mk4.sh`, `hand4.sh`, `drive4.sh`, `mut4.cjs`: the scripts.

In the repository I only read files and ran read-only `git` commands. I read the A7 round-3 trial repository (`/tmp/a7r3/shortlink`) without running anything in it. Another full check run (`--root /tmp/ubp-p6-clean-r3`, not mine) ran alongside my full run; I left it alone.

## Blocking findings

None.

## What must be said to the Owner

### 1. Round 3's points, one by one

| Round-3 point | Fixed at `a3ca72f`? | Evidence |
|---|---|---|
| 2. The glob invariant runs every red acceptance test | **Fixed for both routes the text names, when the red test file can load.** A new test file that `require`s its own module at the top still stalls the skip-filter route (point 2 below). | Probes below |
| 2. "Another file" inside the glob | Fixed: the text now says "a directory its glob does not match" (`SKILL.md:72-73`). A broken copy that puts "another file" back fails C-method-p6 ("Start: a directory its glob does not match"). | `mut4/anotherfile` |
| 3. The Direction | Fixed: every quoted phrase is verbatim. Two unquoted lines still lack a source (point 4). | Script lookup below |
| 4. The README installs 6.0.0 at release | Fixed by a release guard (`tests/method-p6.test.cjs:197-202`) | Broken copies below |
| 5. A copied example reviewer stops the drive | Fixed | Probe below |
| 5. A docs check vs `check-touched` | Fixed in the text (`SKILL.md:133-135`). Under drive, the README node finished with its check reading `README.md` from a test file, with no `check-touched` stop. | `drive4.sh dir`, `drive4.sh skip` |
| 5. Status-table wording | Fixed (`SKILL.md:29`) | — |
| 5. `design.md` said "no runtime npm dependency" | Fixed (`.ultra/design.md:5-7` names `js-yaml`) | — |
| 5. `本里程碑计划变更 6 次` | Now `12 次`: the second Direction edit logged six more `shared: true` lines, one per milestone. This is for the demo to explain; nothing was asked of the engine. | `clone4`: `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 12 次` |
| 5. Retro attribution | Unchanged: the same three repeated classes, plus one single red-first run of the new C-method-p6 test. For the demo, which is not written yet. | `ubp retro` on `clone4` |
| 5. Empty directory | Fixed: `git commit --allow-empty` (`SKILL.md:64`) | — |
| 5. Codex relay | Unchanged (a host limit; it was information only) | — |
| Round 2 item 5. The cleaner's "never a large refactor" | Fixed (`SKILL.md:336-337`) | — |
| 6. The no-commit message was unasserted | Fixed: the round-3 order mutant (spec check moved before the no-commit check) now fails C-engine-p6, 11/12, on "a project without .ultra/spec.md has not started…" | `mut4/order` |

**Point 2, repeated with the plans `a3ca72f`'s Start step 1 produces.**

- **Setup.** Round 3's `newtest` project:
  - existing slug code;
  - N-01 (README) first;
  - N-02 changes what `keeps dashes at the ends` pins;
  - N-03 adds a new behavior (REQ-003, `title`) and comes last.
- **Invariant:** the runner and the glob `test/*.test.cjs`.
- **Acceptance**, committed red before any node as the text says. The docs check reads `README.md` from a test file, as the new Specification bullet says.
- **Writer:** the same scripted writer, under `ubp drive`.

| Plan | By hand (N-01's writer, then `node done`) | Under drive |
|---|---|---|
| Directory route: the pinned test moved into `test/m1/trim.test.cjs`, rewritten red; the new tests in `test/m1/` | `node N-01: pass` | `drive: writer N-01: done (exit 0)`, `N-02: done`, `N-03: done`, `drive: check all: pass`, `drive: stop milestone-gate` |
| Skip-filter route: red tests named `M1: …` (the pinned one rewritten in place, inside `describe`); invariant run with `--test-skip-pattern="^M1: "` | `node N-01: pass` | The same, ending `drive: stop milestone-gate` |
| Skip-filter route, but the new test file starts with `const { title } = require('../src/title.cjs')` | `node N-01: fail` / `invariant-not-green: C-inv is not green — Keep every existing test passing.` | Three `drive: writer N-01: node-not-done (exit 0)`, then `drive: stop attempts-exhausted` |

I ran the drive probes on Node 25.7.0. I checked the two `node --test` facts behind the table on both 25.7.0 and 22.21.0:
- a `^M1: ` prefix skips a red test inside `describe`;
- a file whose top-level `require` throws is reported as one failing test (`✖ test/b.test.cjs`, `ℹ fail 1`, exit 1), whatever the skip pattern.

**The copied reviewer, repeated.**
- **Setup.** I copied `claude-reviewer.sh` into the project as `tools/rev.sh`. I set `UBP_REVIEW_GUIDE` to the installed Skill's `references/review.md` from my install of `a3ca72f`, as `references/drive.md:31-34` now says. I set it two ways: in the drive's environment, and inline (`--reviewer "UBP_REVIEW_GUIDE='…' sh tools/rev.sh"`).
- **Result.** With a fake `claude` that writes an accepting review, both runs printed `drive: reviewer M1: accept (exit 0)` and `drive: stop milestone-gate`.
- **The prompt** was the mission lines, then the installed `review.md`, byte for byte (apart from the final newline that `$(cat)` drops).

**The README guard, on broken copies of `a3ca72f`.**

| Broken copy | C-method-p6 |
|---|---|
| `package.json` and the lock at `6.1.0`, both READMEs still `6.0.0` | Fails: `README.md: 6.0.0` |
| The same, with only the zh README stale | Fails: `README.zh-CN.md: 6.0.0` |
| `6.1.0` everywhere | Passes. C-package fails, because it pins `6.1.0-rc.0` (closed M-P5 acceptance; it had to change at release anyway). |
| Still a prerelease, README says `5.0.1` | Passes, by design |
| An install line without a version | Fails ("the install line names a version") |

The guard runs at release:
- `verify:release` runs `tests/*.test.cjs`;
- `.github/workflows/release.yml` runs `npm run verify:release` before `npm publish`;
- `prepublishOnly` runs it too.

### 2. The skip-filter route stalls on a new test file that cannot load yet (new in `a3ca72f`; the wording was my round-3 proposal)

I confirmed this by running it (third row of the table above).

- **What the text says.** `SKILL.md:72-79` now offers "behind the runner's skip filter on a name prefix" for every red test, including "a new requirement's test".
- **Why that route fails here.** A name filter cannot skip a file that throws before it registers its tests. A new requirement's test usually `require`s the module its node will write, so this is the common shape, not an edge case.
- **The directory route has no such trap.**
- **Where the wording came from.** Before `a3ca72f`, the skip filter was offered only for a pinned test and a red baseline, both inside files that already load. My round-3 proposal extended it to new tests, and I had not tested that.
- **Why it does not block.**
  - REQ-P6-method asks that a test that is red now "stays out of the invariant's run". A file that loads in the run and fails is not out of it, and the planner can see that the moment the acceptance is committed. In my probe, the red-first `ubp check` already printed `C-inv: fail (exit-1)`, and the line ended `不变量 1 未绿`, before any node.
  - The `Done when` holds as recorded: A7 round 3 chose the directory route, with no refusal. That is one sample.
  - This is the same class as round 2's point 1 and round 3's point 2. Three rounds in a row have found a route the method text allows that stalls; the Owner may weigh that differently.
- **Fix: two clauses.**
  - In Start step 1: "a new test file goes in the directory; the skip filter suits a test inside a file that already loads."
  - In "Commit the test files before any implementation and run `ubp check`" (`SKILL.md:153`): "and an invariant that was green before this commit is still green; one that turned red has a red test in its run (Start step 1)."

  The second clause catches every route at the moment the acceptance is committed, including runner behaviors the text cannot list. It would also have caught round 2's and round 3's stalls. It is worded as before and after, so it stays compatible with the cleanup-first route, whose invariant is already red before the acceptance commit.

### 3. Tests kept outside the glob never come back into the project's own test command

I confirmed this on the A7 round-3 repository.

- **What each text says.**
  - `SKILL.md` does not say what happens to a red test once its node turns it green.
  - `README.md:39-41` says it "stays out of the invariant's run until a node turns it green". The zh README says the same ("等节点把它变绿"), which implies it rejoins. Nothing moves it back.
- **What the trial shows.**
  - The project's `npm test` is `node --test --test-reporter=spec test/*.test.cjs`.
  - The three M4 tests stay in `test/m4/`; the record's "`npm test` 50/50" is the 49 existing tests plus one characterization test.
  - So after M4, the project's own test command, and any CI that runs it, checks neither the total nor the 410 page. For deleted links it keeps only "the deleted link no longer redirects".
  - UBP itself still checks both: each requirement's check runs at every gate and in the ratchet. The session noticed this in its own ruling ("has to be folded into the invariant by hand").
- **Why this is a regression.** `a3ca72f`'s rule sends every new requirement's test to a directory the glob does not match, so on an existing codebase every behavior UBP adds or changes leaves the project's own test command.
- **Why it does not block.** It does not contradict any requirement, and nothing UBP tracks loses its check.
- **Fix, one clause, the Owner's choice:**
  - when the milestone closes, its acceptance tests join the project's test command and the invariant (move them into the glob, or drop their prefix from the filter: a plan change, not a reduction);
  - or make both READMEs say they stay out.

### 4. The Direction against the Owner's words

Each of the nine quoted phrases, looked up by script, is verbatim in the Owner's records:
- `thinking/back-to-essentials-20261030/THOUGHTS.md:36,38,46,52,54`;
- `.ultra/records/owner-touches.md:41`;
- `越改越乱` also in that directory's `RESULT.md`.

What the rewrite fixed:
- "Elegance: not stated by the Owner.";
- the daemon/runner/Python-hook clause is labeled "not the Owner's words";
- the success line uses the Owner's own words and the confirmed contract's completion standard (`RESULT.md:282,286`);
- the accepted cost of a heavier 0→1 stage is added;
- the host scope names its source.

Where it still departs (none contradicts the Owner; each is for gate step 4):
- **"Its two purposes (2026-10-30)"** (`.ultra/spec.md:10`). The Owner said "我们**之前**做 Ultra Builder Pro 有两个目的", that is, the earlier UBP's purposes, while asking whether to keep that mode. Write "the purposes of the earlier UBP", or ask.
- **"Publishing and installing are the Owner's acts"** (`spec.md:18-19`) names no source. The closest Owner-confirmed words are the two contracts: "不包括 push、tag、npm 发布" (`RESULT.md:305`), and the M-P6 contract's "门通过后装进 ~/.claude，不 push、不发布", which the Owner answered "确认，确认" (`owner-touches.md:43`). Cite them.
- **"The problems it ends"** (`spec.md:13`) frames the Owner's complaints as success conditions. That is a reading, not the Owner's words, and it is unlabeled.
- **Line breaks inside quotes.** Three quotes are broken across lines (`spec.md:7-8`, `13-14`, `19-20`), so rendered Markdown shows a space inside them. Cosmetic.
- **No draft marker.** The spec still does not mark the Direction as a draft. The 2026-11-12 L0 ruling commits gate step 4 to show the Owner the full text; keep to that.
- **The Owner's 10-31 "都可以纳入考虑"** (graph, loop, async multi-agent) are the words closest to the labeled daemon/runner boundary. Point to them in the step-4 question.

### 5. Other regressions and small items

- **REQ-P6-method's `Done when` now says "following the method's text".** The A7 round-3 session departed from that text once: by its own ruling, it made no README requirement, although the method makes user documentation a requirement (trial README, "What the trial shows" 3). This is not about the invariant, and a gate review of that project would see it. The method may need a condition, for example "when the work changes how a user installs, runs, configures or recovers it". The Owner decides.
- **The guard forbids an install line without a version.** That is by design (it rules out the other fix I proposed in round 3); the version-pinned README is kept.
- **Nothing else regressed:**
  - `SKILL.md` is 384 lines;
  - Skill Creator `quick_validate.py`: `Skill is valid!`;
  - every earlier C-method-p6 assertion still passes;
  - `M-P6-review-2.md` is byte-identical to the round-2 review at `1f25cee`, and `M-P6-review.md` holds my round-3 text with one verdict line;
  - briefs at HEAD are 8461 to 10564 bytes, against a 32768-byte budget, with the new Direction in `## Project`;
  - the CHANGELOG and both READMEs state the same rule as the Skill, apart from point 3's "until".

### 6. Could the same acceptance be met with less?

- **Start step 1.** With point 2's "invariant still green after the acceptance commit" clause, the route list can shrink to examples. The check at the moment of commit protects every route.

  Dropping the skip-filter route would also remove point 2's trap, but it would make point 3 worse: tests kept beside the others under a skip filter are still run by the project's own test command. So I would keep both routes and add the clause.
- **The README guard.** Six lines that catch a real release slip; keep it.

  C-package's literal `6.1.0-rc.0` pin (closed M-P5 acceptance) makes every release edit a closed milestone's acceptance again. Asserting `lock.version === package.version` would meet the same acceptance with no edit per release. That is closed acceptance, so the Owner decides.
- **Keep:** the no-commit assertion (4 lines), and the `UBP_REVIEW_GUIDE` sentence in `drive.md`.

### Acceptance criteria (as these commits touch them)

- **A3: met.** The line at HEAD, read on `clone4`: `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 12 次`, with `closed_recheck 0`, `closed_not_green 0`, `dirty false`, `gate pass`.
- **A6: met.**
  - `SKILL.md` is 384 lines, within 395.
  - C-method-p6 passes 16/16.
- **A7: met as recorded** in `.ultra/records/acceptance/a7-start-trials-3/`.
  - One sample, not run under drive.
  - My drive probes cover both routes, and point 2's trap, under drive.
- **A8: met.**
  - **Full check run.** On the unmodified `git archive` copy of `72cc678`, `node engine/cli.cjs check --all` gave all nine checks `pass (exit-0)`. Exit 0, final line `M-P6 · 5/5 绿 · 下一项 里程碑门 · 本里程碑计划变更 12 次`.
  - **Release suite.** C-release's log: `ℹ tests 414`, `ℹ pass 414`, `ℹ fail 0`, `found 0 vulnerabilities`.
  - **Changed suites.** C-engine-p6 12/12; C-method-p6 16/16.
  - **Pack.** `npm pack --dry-run --json`: `6.1.0-rc.0`, 40 entries, `references/review.md` included, no tests shipped.
  - **Install.** `--all --global` into a temporary config with a temporary `HOME` exited 0. `--doctor --json` reported `healthy`, `6.1.0-rc.0`, commit `a3ca72f`; its `dirty: true` comes from my own untracked `node_modules` symlink in the scratch clone. The installed engines are byte-identical to `engine/`, and the installed Skills carry the new rule.
- **A9:** waiting on the Owner.

**Spec against the Owner's words.**
- REQ-P6-method's edit asks for more than before: the rule now covers every red test, and the `Done when` adds a new behavior and "following the method's text". It is recorded by the 2026-11-12 L1 ruling.
- The Direction is point 4.
- I found no spec change that leaves an input or user with less without approval. Point 3 concerns the method's guidance for the Owner's projects, not this spec.

### Not checked

- A live headless session (I read the A7 round-3 record and repository only).
- The Codex host and Linux.
- `engine-p5` on Node 22.
- The gate demo, which is not written yet (the `12 次` count and the retro attribution).

Verdict: accept
