Reviewer: Claude reviewer subagent (fresh context), xhigh

Commit reviewed: `e5db85e30a326451482bbb22ab6844f9e6116986` (branch `m-p6`). The diff is `49b1e96..HEAD` without `thinking/`. All probes ran under `/tmp/p6rev.iE9Lr7`: a `git archive` copy, a clone for the full check run, and scratch projects. In the repository itself I only read files.

(Kept as round 1: the controller fixed items of "What must be said to the Owner" at the gate, so the gate starts again at step 1 with a full review, which takes `M-P6-review.md`. Angle brackets the notification transport escaped as HTML entities are restored.)

## Blocking findings

None.

## What must be said to the Owner

### Risks and gaps, most important first

1. **The method does not say how to change behavior that existing tests already pin. On an existing codebase that is the usual case.** (Method text. I inferred this by reading; A7 did not exercise it.)
   - **What the method says now.** Start step 1 (`skills/ultra/SKILL.md:60-68`) registers the existing test command as an invariant. It adds characterization checks only for behavior that "no test pins".
   - **Where it goes wrong.** Suppose the Owner asks to change a behavior an existing test asserts. A model following the text meets three rules that work against the change:
     - the invariant blocks `node done` while it is red (`SKILL.md:335-336`);
     - "Never change a check to get past it" (`:209`);
     - weakening a test inside a check's file is a reduction (`:302-312`).
   - **Likely result.** The writer may not edit the test (brief rule 1 and the example writer prompt). So the likely path is a wasted writer attempt, then Escalation, then the planner editing the old test. The other possibility is a reduction question to the Owner that should never have been asked. Nothing makes the change impossible, so this does not block.
   - **Why A7 missed it.** The feature the existing-codebase trial asked for already existed, so no node changed existing behavior (A7 README, "Limits").
   - **Proposal.** Add one sentence to Start step 1: "When a requirement changes a behavior an existing test pins, the acceptance author rewrites that test to the new behavior together with the requirement's checks, committed red before the node; that is an L1 modify, a reduction only if someone gets less." A second trial that changes one pinned Shortlink behavior would show whether that sentence is enough.

2. **In Claude Code, the Owner still sees drive progress only when they ask or when the drive ends.** (Method text. I inferred this from this host's tool contract and did not test it with a real drive.)
   - **The engine side works.** With `--json`, each event reaches stderr as it happens. My timestamps: `+0s drive: run …`, `+1s drive: check stale: pass`, `+7s drive: writer N-02: done (exit 0)`, `+8s drive: stop milestone-gate`. These lines are identical to text-mode stdout.
   - **Nothing makes the model relay them.**
     - The method starts the drive with Bash `run_in_background` (`SKILL.md:199-205`, `references/drive.md:14`). That wakes the model only when the command exits.
     - `drive.md:31-33` says to relay each writer line "as it arrives", or "at each check-in" on a host that reports only the end. Claude Code is such a host, and nothing creates a check-in.
     - So workflow-review finding 7 is only half fixed.
   - **Proposal.** This host has a `Monitor` tool that turns each new output line into a notification. `drive.md` could say: in Claude Code, redirect stderr to `.ultra/.runtime/drive.err`, run a Monitor on `tail -f` of it filtered to `^drive: `, and re-arm it when it expires.
   - The `Done when` lines of REQ-P6-status and REQ-P6-method are met as written, so this does not block.

3. **The docs promise more for `待复核` than the engine computes.**
   - **What the engine counts.** A closed requirement counts as `待复核` when it is stale and every check covering it last passed (`engine/states.cjs:100-103`). That matches the spec and the RESULT's "过期但上次通过".
   - **What the docs say.** `SKILL.md:38-39` describes it as "finished work that only needs its checks rerun". Both READMEs say "only need a rerun after a commit".
   - **Where they differ.** The case `tests/engine-p1.test.cjs:705-714` pins is a requirement whose **text** changed, and a changed check definition counts the same way. There the node may need a writer, and a rerun may come back red.
   - **Effect.** The model still acts correctly, because `next` sends it to the stale node or to `ubp check`. But the Owner reading the line may be misled.
   - **Fix.** One clause in each document: "… after a code commit a rerun settles it; after a requirement or check edit its node may need rework."

4. **Projects already on 6.0.0, including this repository, get none of the new knowledge in their briefs.**
   - **The missing step.** Start runs only when `.ultra/spec.md` is missing. No step writes `.ultra/design.md` for a project that already has a spec.
   - **This repository.**
     - Its spec has no `## Direction` and no `## Interface`.
     - There is no `.ultra/design.md` and no `.ultra/records/interview.md`.
     - So a brief's `## Project` here holds only the spec's two-line intro and `No design written.`, and a gate reviewer has no interview to read.
   - **This repository also breaks two rules M-P6 added.**
     - It has no user-documentation requirement.
     - Its two new checks (C-engine-p6 and C-method-p6 in `.ultra/checks.json`) still use `^ℹ pass [1-9][0-9]*$`. The 2026-11-12 ruling shows that pattern cannot prove a test ran, and it exempts only closed milestones' checks. Today the two checks still prove something, because both files contain real tests (7 and 9).
   - **Proposal.** Add a line to "Every session starts the same way": "spec without `.ultra/design.md`: write it from a survey (Start step 1) before the next node". Then, as this project's next step, give it a Direction, a design and per-test `expect` lines.

5. **An existing test suite that is already red, flaky or slow at survey time stops every node.**
   - **The problem.** Registering the suite as an invariant (`SKILL.md:63-64`) blocks `node done` and `milestone close` until it passes. A suite slower than the default `timeout_sec` of 600 comes back `unknown` on every run.
   - **What is missing.** The method does not say to check the baseline first, or what to do when it fails. Real codebases often start in this state.
   - **Proposal.** "Run the suite first. If it is not green, record the failing tests under `## Facts` and either make fixing them the first node or register the invariant on what passes; set `timeout_sec` from the measured run."

6. **The new `expect` example fails for tests nested in `describe`.** (Verified.)
   - `SKILL.md:134-136` and `engine/FORMATS.md` suggest `^✔ <test name>`. The spec reporter indents tests inside `describe`, so the anchored pattern never matches them.
   - On Node 25.7.0, with one nested and one top-level test, I got `anchored nested match: false | top: true`.
   - This fails safe: `expect-unmet` is `unknown`, never green. But it costs a round of debugging.
   - **Fix.** Use `^\s*✔ <test name>`, and add one line saying that for other test runners the `expect` matches that runner's line for the named test.

7. **Acceptance gaps: broken copies the P6 checks still pass.** None of these blocks, because HEAD behaved correctly on every input the broken copies got wrong.

   Six broken engine copies each passed `C-engine-p6` 7/7:
   - **(a) `some` instead of `every` in `closed_recheck`.** HEAD, after a notes commit, on a closed requirement covered by C-1a (last run passed) and C-1b (last run failed): `recheck 0 not_green 1`, line `… · 已关闭里程碑 1 项未绿`.
   - **(b) shared text without its internal empty lines; (c) shared text only from before the first requirement; (f) shared text without trailing-whitespace trimming.**
     - Test spec: CRLF line endings, trailing spaces, three-line gaps, a fenced `## REQ-999`, an `## Interface` after `REQ-001`, and a `# Tail heading` after `REQ-002`.
     - What HEAD's brief showed:
       - every shared line in file order;
       - internal empty lines kept;
       - trailing whitespace removed;
       - the fenced line kept as shared text;
       - the Interface and the tail present.
   - **(d) `--json` dropping problem lines from stderr.** HEAD's `--json` stderr equals text-mode stdout line for line, including `review-exists: … — Resolve this stop before resuming drive.`
   - **(e) review path compared by basename only.** HEAD prints `review-not-for-milestone: docs/M1-review.md is not the review for M1 — Use .ultra/records/milestones/M1-review.md for this milestone.`

   One broken method copy (changed to "a writer may edit it too") passed `C-method-p6` 9/9. HEAD says "a writer never edits it" (`SKILL.md:100`). The 2026-11-12 ruling already records that C-method-p6 is structural only.

   Cases that would close these gaps:
   - two checks covering one closed requirement, with mixed last outcomes;
   - a spec with shared text between and after requirement blocks, compared byte for byte;
   - a drive stop that has a problem, asserting the problem line appears on stderr;
   - `docs/<id>-review.md` refused.

8. **Version and provenance.**
   - `package.json` is still `6.0.0`, and the README tells a new user to run `npm install -g ultra-builder-pro-cli@6.0.0`. That installs the published 6.0.0, which has no `## Project`, `待复核` or `review-not-for-milestone`, although the same README describes them.
   - Publishing is outside the contract, so this does not block.
   - **Consequence.** After the gate, the contract installs into the real `~/.claude`. That install will report `version: 6.0.0` for content that differs from npm's 6.0.0; the doctor in my temporary install already did.
   - **Proposal.** Set a prerelease version before that install, and bump the version and the README pin together at release, so `--doctor` stays honest.

9. **Smaller items.**
   - **`all-done`:** REQ-P6-method says every drive stop is handled in a reference, but `references/drive.md` never mentions the `all-done` stop (`engine/drive.cjs:216`). The status table covers the same state as `全部完成`. The pre-M-P6 Skill did not handle it explicitly either, and C-method-p6's list leaves it out on purpose. Fix: one bullet.
   - **Checks reading `.ultra/design.md`:** `SKILL.md:141` says "A check never reads `.ultra/records/`". FORMATS now also forbids reading `.ultra/design.md`, so the same sentence should name it.
   - **zh README:** `README.zh-CN.md` lacks the English README's sentence that the hook stays silent inside a drive (`UBP_DRIVE`).
   - **First `ubp status` in a fresh project:** in a committed repository without a spec, `ubp status` prints a raw `.ultra/spec.md: ENOENT: no such file or directory, open '…'` and exits 2. The README promises "the current state". Start also never mentions `git init` and a first commit; the new-project trial worked both out by itself.
   - **Canonical review path only:**
     - `milestone close` refuses even this milestone's own accepting review if it sits at any other path. On macOS a lowercase `m1-review.md` naming the same file is refused too.
     - That is stricter than "another milestone's review". I read it as covered by the confirmed contract ("核对评审路径属于该里程碑").
     - Every closure in this repository used the canonical path, so nothing existing breaks.
   - **Heading levels:** the spec's own `# …` and `## Direction` headings appear inside the brief's `## Project` at the brief's own heading level. This is as specified and still readable, but a writer sees `## Direction` as if it were a brief section.

### Could the same acceptance be met with less?

Yes, mostly in the method text and a little in the engine. None of these cuts is needed to accept.

- **Method text.**
  - SKILL.md is 394 lines, against 395 before. About 85 lines of drive and merge handling moved out, and about as much new text came in, so the always-loaded body is no lighter. Finding 8 asked for a lighter body; A6 only asked for no growth.
  - **Gate step 2's reviewer instructions** (`SKILL.md:235-263`, about 29 lines) exist in three copies:
    - in SKILL.md;
    - in `docs/examples/drive/claude-reviewer.sh`;
    - in the brief the controller wrote for this review.

    They already differ: the run on a clean copy is part of gate step 1 in one place and part of the reviewer's prompt in another. I would replace all three with one `references/review.md`, read by a manual reviewer and `cat` into the example prompt. That keeps one bar and saves about 22 always-loaded lines.
  - **The status table's drive row** (`SKILL.md:26`, the `ps` stale-lock procedure) matters only to drive users. It is also separate from `drive-running` in `drive.md:63-66`, which gives a different rule for removing the lock. I would move the row into `drive.md` and leave "`drive 运行中` → read `references/drive.md`". That saves about 6 lines and puts all lock handling in one place.
  - **Two smaller cuts, about 6 lines in total:**
    - the measured-comparison evidence in Roles (`:49-51`; keep the rule itself);
    - two of the three places that say every brief carries the shared text and the design (`:100-101`, `:151-152`, `:323-325`).
- **Engine.**
  - The M-P6 change is about 13 lines (1998 to 2011, against the 2050 cap).
  - The one cut I would consider: drop `--review` and have `close` read `.ultra/records/milestones/<id>-review.md` itself, as `drive` already does (`engine/drive.cjs:192`). That removes the path comparison, `review-not-for-milestone`, and the whole class of wrong-path mistakes. The cost is a CLI change for anyone who passes `--review`.
  - I would keep:
    - the separate `sharedText`, because it keeps existing evidence hashes valid;
    - design.md's `## Decisions`, because it is the only current-state view of a growing ruling log, and the cleaner checks it.
- **Checks.** C-method-p6 only checks that strings are present (item 7). It is cheap, so I would not add machinery to it. But it should not be read as evidence that the method works.

### Acceptance criteria

- **A1: met.**
  - A brief's `## Project` holds the spec's shared text in file order, then the design. I drove this on scratch projects with and without `.ultra/design.md`, including CRLF and trailing whitespace.
  - A design symlinked to a file outside the project reads `Not read: not a regular file inside the project.` None of the outside file's content appears.
  - The first rule names `.ultra/design.md`, and the hint for an oversized design names it too.
- **A2: met.**
  - Writing or committing `.ultra/design.md` left the status and every check unchanged.
  - A branch that edits it is refused by the merge gate: `truth-changed: w changes .ultra/design.md …`.
  - Drive treats a writer's committed edit to it as out of scope.
- **A3: met.**
  - After commits touching only `notes.md` or `thinking/`, the line read `… · 已关闭里程碑 1 项待复核`. When the last run had failed, it read `未绿`.
  - This repository's live line before my rerun: `M-P6 · 0/4 绿 · 4 过期 · 下一项 检查 · 本里程碑计划变更 0 次 · 已关闭里程碑 2 项未绿 · 已关闭里程碑 13 项待复核`.
  - The 2 `未绿` are C-release and C-package. Their latest records in the main ledger failed at 09:24, before the 09:30 merge, and there is no record of the merge gate's own runs. That is correct by the spec, and it is why `merge.md` says to run `ubp check --all` after a merge.
- **A4: met.**
  - These were all refused with `review-not-for-milestone`: another milestone's review, `M1-review-1.md`, a copy at the project root, and `docs/M1-review.md`.
  - A missing canonical review was refused only as `review-missing`.
  - `./.ultra/records/./milestones/../milestones/M1-review.md` closed the milestone.
- **A5: met.** With `--json`, stderr carries every event as it happens (timestamps above), and stdout holds only the JSON.
- **A6: met.**
  - The method has the four start steps, design.md upkeep, the escalation row for an unknown fact, the review against the Owner's words, documentation as a requirement and progress reports.
  - Drive and merge handling are in the references. Every stop and refusal code from the pre-M-P6 Skill is still present.
  - SKILL.md is 394 lines (`wc -l`).
- **A7: met.**
  - Both trials ran this plugin's Skill (each transcript names `ultra-builder-pro:ultra`) and did what they were asked.
  - Limits: those listed in the A7 README, plus item 1 above. The corrected `expect` text was not trialed again.
- **A8: met, except the validators.**
  - In a clone of HEAD, `ubp check --all` gave every check `pass (exit-0)`:
    - C-engine;
    - C-release (`npm run verify:release`: 402/402 tests, `found 0 vulnerabilities`);
    - C-engine-p2 through C-engine-p5;
    - C-package;
    - C-engine-p6;
    - C-method-p6.
  - Final line: `M-P6 · 4/4 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次`.
  - `npm pack --dry-run --json`: 39 entries, including `skills/ultra/references/drive.md`, `merge.md` and both drive examples.
  - `--all --global --config-dir <tmp>` with a temporary `HOME` installed both hosts. `--doctor --json` reported `"status": "healthy"`. Both hosts have the references, and no `__UBP_` placeholder is left.
  - I did not run the Skill Creator or Plugin Creator validators.
- **A9:** still waiting on the Owner's own release decision.

### Not checked

- The Skill Creator and Plugin Creator validators.
- A first session driven by a live model myself, in Claude Code or Codex. I read the A7 records instead.
- Relaying a drive through `Monitor`.
- Linux and Node 22. Everything ran on macOS with Node 25.7.0.

Verdict: accept
