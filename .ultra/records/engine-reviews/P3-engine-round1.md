Reviewer: Claude `reviewer` subagent, fresh context (the P3 engine was written by Codex; the contract and tests by the main session)

# P3 engine review, round 1 (verbatim)

I found no place where the engine departs from `engine/FORMATS.md`. The revisions I'd ask for are two missing tests on core P3 behavior, one rule that is too loose for closed milestones, and three fixes to the contract and method text. All are small.

Basis: the full diff against f903a90, the changed sections of `engine/FORMATS.md`, `method/ultra.md`, RESULT.md §3.1–3.7 and §5 P3, and the new and edited tests.

**What I ran.** The four engine suites passed 190/190 in my own run (145 s). Every engine `.cjs` line is within 100 characters and the engine is 1,340 lines. I built 31 broken copies of the engine in /tmp, each with one change: 24 were caught and 7 passed all 190 tests. Every scenario below ran on a throwaway Git fixture, not the workspace. The workspace is unchanged and my /tmp copies are deleted.

## Should-fix

1. **No test checks the milestone half of an approval item** (`engine/plan.cjs:153`). A broken copy that matches approvals by id only, ignoring the milestone, passes all 190 tests.
   - Scenario: check C-x covers REQ-001 (M1) and REQ-003 (M2). The Owner runs `ubp approve M2/C-x`, then C-x is deleted.
   - Real engine: the gate exits 1 with `Reduction M1/C-x needs the Owner's approval`. Broken copy: the gate exits 0.
   - Reproduced. Fix: add this test to `tests/engine-p3.test.cjs`.

2. **No test checks shared text inside code fences** (`engine/formats.cjs:107`). A broken copy that leaves fenced lines out of the shared hash passes all 190 tests.
   - Scenario: `## Interface` holds a fenced `{ "port": "PORT" }`, and only that line changes to `LIST_PORT`.
   - Real engine: every check shows `shared-changed` and the gate is `stale`. Broken copy: everything stays green and the gate is `pass`.
   - The P1 parsing test does edit a fenced line, but together with an unfenced edit in the same section, so it can't tell the two apart.
   - Interface conventions are usually written in fences, so this is the likely real case. Reproduced.

3. **An unused approval survives milestone closure** (`engine/plan.cjs:153`, `engine/FORMATS.md:453-457`).
   - Steps: `approve M1/C-2` while M1 is open, never act on it, close M1, gate an unrelated M2 change, then drop C-2 from the closed M1.
   - Result: the gate exits 0 and records the change with no problem.
   - FORMATS allows this as written, because a closure creates no plan-log record. Nothing lists pending approvals, so the Owner closing M1 can't see that one is outstanding. That weakens the closed-milestone ratchet from RESULT §3.7.
   - Cheap fix: an approval counts only if it is also later than that milestone's closure, in both FORMATS and code, plus one test. Reproduced.

4. **The documented limits leave out the easiest workaround** (`engine/FORMATS.md:463-467`, `method/ultra.md:184-187`).
   - Changing a check's `run` or `expect` in `checks.json` counts as an edit, not a reduction.
   - Reproduced: setting C-2's `run` to `echo 'pass 1'` and committing code that throws gives gate exit 0 (`checks_modified: ["C-2"]`), and `ubp check` turns C-2 green.
   - Narrowing through the shared text (deleting a convention from `## Interface`) is also missing.
   - Both texts name only rewording a requirement and weakening a test file. Once deleting a check is refused, editing its `run` is the obvious next move. Name both in the two texts.

5. **The method's "L1 add" row is wrong** (`method/ultra.md:173`). It says "nothing else changes state".
   - Reproduced: committing a new red check file makes C-1, C-12, C-2 and C-3 stale with `code-changed`. The line went from `2/2 绿` to `0/3 绿 · 2 过期 · 1 未知`.
   - The paragraph right after the table says the opposite. Suggested wording: "no other node changes state; every check is stale until `ubp check`".

## Nits

- **Upgrade path: it works but is undocumented and noisy.** Reproduced on a project with M1 closed and N-03 done:
  - After removing `shared` from every record, everything shows stale and `node done` is refused with `plan-gate`.
  - `ubp gate` records a `change` for both M1 and M2. Each has an empty diff plus `shared: true`.
  - After `ubp check` and `node done` N-01, N-02, N-03 in dependency order, the project is back to `下一项 里程碑门`. Marking N-03 before N-02 is refused with `dependency-not-done`.
  - Cost: `本里程碑计划变更` goes from 0 to 2 and stays there until the next closure. The plan log also says the shared text changed in every milestone when it didn't, and the milestone review reads those diffs.
  - Old and new snapshots match whenever the gate passes, so the upgrade produces no false reductions.
  - Suggest one paragraph near `engine/FORMATS.md:299-302` giving the upgrade steps and noting the count bump.
- **One check item approves any reduction of that check.** Reproduced: `approve M1/C-12` with the words "只管 REQ-001", then deleting C-12 entirely, passes the gate. In the other direction, any gated change to a milestone cancels its pending approvals. A shared-text edit re-records every milestone, so it cancels all of them. That is safe, but the method's "approve, then edit" step should warn about it.
- **A new FORMATS sentence is false** (`engine/FORMATS.md:439-440`: "Problems appear in the table's order"). Reproduced: the gate returns `uncovered-requirement, unknown-milestone, empty-node`, but the table lists `empty-node` first. Suggest: reduction problems follow every other plan problem, and `malformed-ruling` comes last.
- **Hand-written approvals aren't mentioned.** FORMATS states this limit for closures (`engine/FORMATS.md:328`) but not for approvals (304-313). A hand-appended line passes exactly like `ubp approve`. I inferred this from `engine/ledger.cjs:16-21`, which only checks the record's shape.
- **Approvals for check ids like `valueOf` are never used up.** This comes from an older bug: `in` is used instead of a has-own check in `engine/plan.cjs:121-131`. Reproduced with a check named `valueOf`: the approved removal passes the gate but nothing is recorded, M1's snapshot still lists it, and the approval stays usable. Use `Object.hasOwn`, as `reductionProblems` already does.
- **Smaller rules with no test** (the broken copies passed everything):
  - `shared-changed` listed first among a node's reasons (`engine/states.cjs:59`).
  - Hash checking of `shared` in evidence and plan-log records (`engine/ledger.cjs:44`); only node records are tested.
  - `diff.shared` must be `true` (`engine/ledger.cjs:59`).
  - Approvals are cancelled only by the same milestone's plan change. A stricter copy that cancels them on any milestone's change survived; it fails safe.
  - The lock and reload inside `approve` is untested, which is expected without a concurrency test.
- **Briefs don't include the shared text.** `ubp context` uses requirement text only (`engine/context.cjs:35`). A writer reworking a node after an `## Interface` change never sees what changed. This doesn't break FORMATS, but P3 now calls shared text "what every requirement relies on".
- **New prose lines over 100 characters** in places where the surrounding text is wrapped: `engine/FORMATS.md:287, 297, 348, 677` and `method/ultra.md:150`.

## Whether the four edited P1 tests still protect what they did

They keep what they protected.
- The three reduction tests keep every original assertion (recorded types, exact diffs, `node done` refused with `plan-gate`, plan-change counts). They only add a `fail` → `approve` → `stale` step.
- The parsing test now requires every requirement's reasons to be exactly `['shared-changed']`, which still proves no requirement's own text changed. It still catches a broken copy where `## Notes` doesn't end REQ-001, and one that lists the reasons in the wrong order.
- Its one loss is that it no longer checks a fenced edit on its own (should-fix 2).

## Ways around the gate I tried that it blocked

Each was refused as FORMATS says, or its approval was used up after one use:
- deleting a requirement from the spec only
- moving a requirement to another milestone
- renaming a milestone, or swapping two milestone ids
- renaming a requirement or a check
- swapping two checks' coverage
- narrowing a check to cover only a requirement in another milestone
- re-adding and re-removing an item
- reusing a milestone id after its `removed` record
- a far-future hand-written `at` (later records are always stamped after it, so it can't extend reuse)

## Acceptance criteria

- **Goal 1 (shared text invalidates):** met. The fenced case is untested (should-fix 2).
- **Goal 2 (reductions need approval):** met for removal, narrowing, moves, renames, removed milestones, closed milestones and approvals given in advance. The milestone half of an item is untested (should-fix 1), and an unused approval outlives closure (should-fix 3).
- **Goal 3 (precise node invalidation; any code change invalidates checks):** met and documented at `engine/FORMATS.md:370-378`. The method's L1 add row contradicts it (should-fix 5).
- **Suites green and engine size:** confirmed (190/190; 1,340 lines, no line over 100).
- **Not checked:** `npm run verify:release`, `npm pack --dry-run` and the install doctor, as instructed.

Verdict: revise
