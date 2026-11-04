Reviewer: Claude Opus 5.5 (independent reviewer subagent; did not write this change)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | The implementation matches the FORMATS "Drive" contract exactly | Partly met | I read the code clause by clause. It follows the state table, the environment variables, verification order 1–6, the stop codes, the JSON/text shapes and exit codes 0/1/2. Deviations: interrupts can exit 2 (B3); SIGHUP exits 129, which the contract does not list; the `UBP` example differs from the code (N2). The contract itself is unsafe in steps 2 and 4 (B1). |
| 2 | The 17 P5 tests pass and protect the contract | Partly met | 17/17 pass. 5 of 6 targeted mutants survive the whole P5 file (S9). |
| 3 | P1–P4 and boundary suites green; ≤2000 lines; lines ≤100 chars; Node built-ins only; behavior unchanged | Met | `node --test tests/engine-p1…p5.test.cjs tests/engine-boundaries.test.cjs` gave `pass 264, fail 0` (336 s). `wc -l engine/*.cjs` = 1936. awk finds no engine line over 100 chars. `drive.cjs` requires only `node:fs`, `node:path`, `node:crypto` and local modules. `selectedChecks`/`runChecks` moved verbatim, and parsing of the old options is unchanged. Only 64 lines of budget remain, and the fixes below must fit in them. Not run: `npm run verify:release`, `npm pack --dry-run`, `--doctor`. |
| 4 | The new `method/ultra.md` paragraph is correct and actionable | Missed | S7 |
| 5 | Unattended safety | Missed | **Bounded:** yes, by inspection (attempts per node, timeout per process, `timeout_sec` per check). **Orphans:** not prevented (B2, B3). **Dirty evidence:** handled. **Forged evidence:** counted (B4). **Truth files:** committed changes are caught; uncommitted ones pass (B1). |

## Findings

### Blockers

**B1. Uncommitted changes to the truth files and Owner ledgers pass every check, and the drive can record them as a plan change.**
- Where: `engine/drive.cjs:19-33` compares HEAD trees only. `engine/git-state.cjs:50-53,72-73`: paths the engine owns never make the tree dirty. `engine/drive.cjs:127` calls `gate()`, which appends pending plan changes to `plan-log` (`engine/plan.cjs:202-210`). Contract: `engine/FORMATS.md:794-797` ("byte-identical at both HEADs") and `:801`.
- Repro 1 (confirmed, on a throwaway copy of the P5 fixture):
  - The writer rewrites every `run` in `.ultra/checks.json` to `node -e "console.log('pass 1')"` and commits only `src/N-0x.txt`.
  - It then runs `$UBP gate`, `$UBP check` and `$UBP node done`.
  - Result: exit 0 and `stop: milestone-gate`, with steps `writer N-01: done`, `writer N-02: done`, `check all: pass`.
  - Every `src/broken-*` is still present and `git status` shows ` M .ultra/checks.json`. Status reads `M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 1 次`.
  - Here the writer ran the gate itself. Had it not, step 4 would have recorded the change (inferred from the code).
- Repro 2 (confirmed):
  - The N-01 writer works honestly and appends `{"v":1,"milestone":"M1","at":…}` to `.ultra/ledger/milestones.jsonl` without committing it. Writers commit with `git add src`.
  - Result: exit 0, `stop: all-done`. The reviewer never runs and the Owner is never asked.
  - With `git add -A`, the *next* writer is blamed with `truth-touched` instead.
- Inferred, same path: a writer that runs `eval "$UBP approve M1/REQ-002 --owner x"` or `$UBP milestone close …` needs no forging at all.
- Fix:
  - Before every writer and reviewer run, snapshot the working-tree bytes (or absence) of the five truth files. Afterwards require both the working-tree bytes and the HEAD blobs to be unchanged, else `truth-touched`.
  - Make step 4 read-only: `status(load(root)).gate === 'pass'`, else `plan-gate`. With the truth files unchanged, a stale gate can only come from an edited ledger, and the drive must never record a plan change for a writer.
  - Amend FORMATS steps 2 and 4.
  - Add tests for an uncommitted `checks.json` edit, an uncommitted closure line and `$UBP approve` run by the writer.

**B2. A timeout or interrupt leaves the writer's checks running.**
- Where: `engine/checks.cjs:25-29` sends SIGKILL only; `:36-38` starts each check `detached`, in its own process group.
- Mechanism:
  - The brief tells the writer to run `ubp check`. That inner engine sits in the writer's process group; its check sits in a group of its own.
  - The drive sends SIGKILL to the writer's group. The inner engine dies before its SIGINT/SIGTERM handler can run, so it never kills its check.
- Repro (confirmed): the writer runs `SLOW=1 $UBP check C-1`, and the check sleeps 90 s when `SLOW` is set.
  - With `--timeout-sec 3 --attempts 1` the drive returns in 4 s (exit 1, `attempts-exhausted`). `checks/pass.cjs C-1` is still alive, leading its own group, with ppid 1. This happened in 5 of 5 timeouts.
  - SIGINT or SIGTERM to the drive left the same orphan in 8 of 8 runs. I stopped each orphan by its PID.
- Fix, for the drive's writer and reviewer runs only (this keeps P1's check semantics):
  - Send SIGTERM to the group, wait a grace period of 5–10 s, then send SIGKILL.
  - The inner `ubp` handles SIGTERM by killing its own check group (`signals.cjs`).
  - Test the scenario above and assert that the recorded check PID is dead after the drive exits, both for a timeout and for SIGINT.

**B3. Interrupts and timeouts sometimes end with exit 2 and `kill EPERM`, aborting the run.**
- Where: `engine/checks.cjs:26-28` tolerates only ESRCH. `:41-43` rejects the promise. `:58-62` kills the group a second time after the leader exits.
- Repro (confirmed on Darwin 24.6 with Node 25.7, using the B2 scenario):
  - 4 of 8 interrupts printed `kill EPERM`. Of the 7 runs whose exit code I captured, 3 exited 2 instead of 130.
  - 1 of 5 timeouts aborted the whole drive with exit 2, `kill EPERM` and no step output.
- Likely cause (inferred): after the SIGKILL the group contains only zombies nobody has reaped, and macOS answers `kill(-pgid)` with EPERM.
- This violates `FORMATS.md:826` (exit 130/143) and the merge's own rule at `:735-737` ("never turns the exit into 2").
- Fix: never reject from the second kill after exit; treat EPERM like ESRCH there. Test the B2 scenario at least 5 times and assert exit 130.

**B4. Forged evidence counts as node progress.**
- Where: `engine/drive.cjs:131-138` (step 5 runs only stale or unknown checks, so it trusts fresh ledger records) and `:37` (any committed change under `.ultra/ledger/` is allowed).
- Repro (confirmed):
  - The writer commits a placeholder and runs `$UBP check`, which fails.
  - It appends copies of the failing evidence records with `outcome: "pass"`, dated 2099, then runs `$UBP node done`.
  - The drive reports `writer N-01: done` and `writer N-02: done`, and two forged completions land in `nodes.jsonl`.
  - Only then does the milestone gate's `check --all` re-run every check (the new records are dated after the forged ones, `ledger.cjs:182-185`). The drive stops at `checks-not-green`, exit 1.
- So the exit-0 stops are backstopped. Criterion 5 still fails: later attempts build on the forged node and get blamed for it by the ratchet.
- Fix:
  - Count the evidence records before each attempt.
  - Afterwards re-run (as `check <ids>`) every check whose latest record was appended during the attempt, plus the stale and unknown ones.
  - Require every ledger change, between HEADs and in the working tree, to be a pure append.
  - Reword contract step 5 to match.

### Should-fix

**S1. The ratchet has no baseline when checks are stale at the start of an attempt.**
- Where: `drive.cjs:132-135`, together with the rule that an actionable node comes before `检查`.
- Repro (confirmed): N-01 is done by hand, and the N-02 writer recreates `src/broken-C-1`.
  - With fresh evidence the drive stops `ratchet-broken`, which is correct.
  - After an unrelated `README.md` commit (every check now stale) the same writer gets `writer N-02: done`, a completion is recorded, and the run ends at a generic `checks-not-green`.
- This is the normal state at the start of a milestone, because planners commit red checks before code (`ultra.md:196`: "every check is stale").
- Fix: before a writer attempt, run the stale checks whenever any requirement of the current or a closed milestone is stale or unknown. This is the manual ratchet step.

**S2. Nothing checks what the reviewer did.**
- Where: `drive.cjs:154-169`.
- Repro (confirmed): the reviewer writes a valid accepting review, leaves `src/broken-C-1` untracked and edits `.ultra/checks.json`.
  - The drive prints `reviewer M1: accept`, then `stop milestone-gate`, and exits 0.
  - Status afterwards reads `下一项 检查 · 工作区未提交 · 计划门待重跑`.
- Fix: after the reviewer, require the same HEAD, a clean tree, unchanged truth bytes and `next` still at `里程碑门`; otherwise stop with `reviewer-changed-tree`.

**S3. A headless writer cannot reach this engine the way its brief says.**
- The brief tells the writer to run `ubp check …` and `ubp node done …` (`context.cjs:13-17`).
- On this machine, `ubp` on PATH is the global install (`/opt/homebrew/bin/ubp → …/ultra-builder-pro-cli/bin/install.js`). It answers `✗ unexpected positional argument: status`.
- `$UBP check` fails in sh and bash with exit 127 (`'/opt/homebrew/bin/node': No such file or directory`), because the value is shell-quoted. Only `eval "$UBP check"` works.
- All of this is confirmed. The test writer passes only because `execSync` adds a second `sh -c`.
- For the first `claude -p` run, expect three `node-not-done` attempts and then `attempts-exhausted`.
- Fix: put `.ultra/.runtime/drive/<run>/bin` first on PATH for the writer and reviewer, with a `ubp` shim that runs `exec <node> <cli.cjs> "$@"`. Document `eval "$UBP …"` in FORMATS.

**S4. Check files inside a node's scope are not protected.**
- The manual step the drive replaces requires that the writer "touches no check file" (`ultra.md:120-123`, also `:266`). The drive checks only scope prefixes (`drive.cjs:36-38`).
- With tests placed next to the code (scope `src/`, check `node --test src/x.test.js`), a writer can weaken the test and still pass.
- Fix:
  - Stop when a changed path appears as a literal token in any check's `run`.
  - Say in the contract that the remaining case is unprotected.
  - Tell planners to keep check files outside every scope.

**S5. The whole of `.ultra/records/` is allowed (inferred from `drive.cjs:37`).**
- A writer may author `records/milestones/<M>-review.md`. Without `--reviewer`, the drive stops at `milestone-gate` with exit 0 and a self-written review sitting where `milestone close` will read it.
- A writer may also write `records/owner-touches.md`, which is the Owner's record.
- Fix: allow only `.ultra/records/handoffs/`.

**S6. Nodes without `scope` can never pass (inferred).**
- `node.scope ?? []` (`drive.cjs:37`) puts every code path out of scope, and each refusal costs a full writer attempt.
- `FORMATS.md:170` still calls scope optional and says it is "enforced later".
- Prefixes are matched with raw `startsWith`, so `src` also matches `src2/…`.
- Fix: stop with `scope-missing` before the first writer, update `:170`, and define prefixes as directory prefixes.

**S7. The method paragraph is not enough for a controller (`method/ultra.md:139-142`).**
- It covers 3 of 15 stop codes.
- "Show the demo" at `milestone-gate` is wrong for `verdict: revise` (milestone-gate step 2 comes first). It also skips the review when no `--reviewer` was given.
- "Revert in a new commit and brief again" does not work on its own. The writer has usually run `node done` already, and a completion does not depend on the code (`states.cjs`, `nodeStates`). So after the revert the node stays `done`, and a resumed drive never briefs it again.
- Proposed text:
  > When the Owner asks for an unattended run, give every node a `scope` and start `ubp drive --writer <cmd> --reviewer <cmd> --json`; the writer command hands the agent `$UBP_BRIEF` and has it call the engine as `eval "$UBP <args>"`. Act on `stop`: `milestone-gate` with `accept` → "Milestone gate" from `ubp retro` and step 3; with `revise` → step 2's revise path; without a reviewer → step 2 first. `truth-touched`, `out-of-scope`, `ratchet-broken` → revert the attempt (commits and work-tree truth files) in a new commit; the node stays `done`, so run it through the node loop by hand before driving again. `writer-left-dirty`, `dirty-tree` → commit what belongs to the node, discard the rest. `attempts-exhausted` → "Escalation" (stalled), logs in `.ultra/.runtime/drive/<run>/`. `review-exists` → keep it as `<milestone>-review-<n>.md`; `review-invalid` → fix the reviewer command; `plan-gate`, `brief-over-budget`, `checks-not-green`, `blocked` → the matching planner step.

**S8. An abnormal end loses the record of the run.**
- On an interrupt or engine failure, `--json` prints nothing on stdout (confirmed), and the run id is never shown, so the logs under `.ultra/.runtime/drive/<run>/` are hard to find.
- Text mode never prints problems (for example, which path was out of scope), and prints everything only at the end of a run that can take hours.
- A timed-out attempt looks identical to an idle one (`node-not-done`).
- Fix:
  - Print `drive: run <uuid>` first (on stderr under `--json`).
  - Print each step line as it happens.
  - On stop, print `code: message — hint` as the other commands do.
  - Add `timeout` and the exit code to writer steps.

**S9. Contract clauses no test catches.** Mutants were run against the whole P5 file in throwaway copies:

| Mutant | Result |
|---|---|
| `milestones.jsonl` removed from the truth list | 17/17 pass |
| `spec.md` and `plan.json` removed from the truth list | 17/17 pass |
| Step 4 removed | 17/17 pass |
| Ratchet limited to the current milestone | 17/17 pass |
| Interrupted writer ignored | 17/17 pass |
| `check --all` removed at the gate | caught (1 failure) |

- Also untested, by inspection:
  - exit 130/143 on interrupt, and the writer being stopped first;
  - the reviewer's `UBP` and `UBP_ROOT`, and the reviewer timeout;
  - the `blocked` stop;
  - "one per file/path, in that order";
  - steps 1 and 2 running in that order;
  - nested process groups.
- The timeout test asserts only the writer (the group leader). The leader dies even if only its PID were killed, so the group kill is protected by P1's background-child test, not by P5.

### Nits
- **N1. Exit codes in FORMATS are incomplete.** SIGHUP exits 129, which `FORMATS.md:826` does not list. `:907-911` ("Exit 1 only ever means…") omits the drive's stops.
- **N2. The `UBP` example does not match the code.** `FORMATS.md:787-788` shows `node '/x/bin/install.js'`; the code builds `'<execPath>' '<repo>/engine/cli.cjs'` (`drive.cjs:70-71`).
- **N3. Review validity is not "as for `milestone close`".** `FORMATS.md:816-817` says it is, but `milestone close` does not require the `Reviewer:` line. `drive.cjs:41-52` also reimplements the parser instead of sharing it.
- **N4. The stop step prints a pseudo-action.** The `status` pseudo-action uses the absolute root as its subject (`drive.cjs:76-79`), giving `drive: status /private/var/…: dirty-tree`.
- **N5. The verification `check` line is misleading** (`drive.cjs:92-96`). It prints before the `writer` line it belongs to, and it says `fail` whenever later milestones' checks are red.
- **N6. `--timeout-sec` has no upper bound** (inferred from Node's documentation, not run). Above 2147483 s Node clamps the timer to 1 ms, which would kill the writer at once. Cap it at 86400 like `timeout_sec`.
- **N7. "No lock of its own" (`FORMATS.md:829`) conflates two locks.** A separate `drive.lock` would not block the writer's `ubp`, and it would stop two drives running on one tree. Also consider setting `UBP_DRIVE=1` and refusing `drive`, `approve`, `milestone close` and `merge` while it is set.
- **N8. History rewrites are not detected.** Adding `git merge-base --is-ancestor <before> <after>` would cover it.

## What must be said to the Owner

- 现在还不能让无人值守的写手用 `ubp drive` 跑真实项目。以下都在临时副本里复现过：
  - 写手把 `.ultra/checks.json` 改弱但**不提交**，drive 以 exit 0 停在 `milestone-gate`，两个节点都记为完成，可实际问题一个都没修。
  - 写手往 `milestones.jsonl` 追加一行未提交的关闭记录，drive 直接以 `all-done`、exit 0 结束，评审和你的里程碑问题都被跳过。
  - 原因是合同只比较两次提交，不比较工作区。
- 超时或 Ctrl-C 之后，写手内部跑的检查进程会残留，13 次全部复现。8 次中断里有 4 次报 `kill EPERM`，退出码是 2 而不是 130；还有 1 次超时让整个 drive 中途崩溃。
- 第一次真实使用（headless `claude -p`）预计会卡住：
  - brief 让写手调用 `ubp`，而这台机器 PATH 上的 `ubp` 是全局安装的旧版，不认识 `check` 和 `node done`。
  - `$UBP` 直接用会报 127，必须 `eval`。
- 需要你拍板的两件事：
  1. 节点范围内的测试文件 drive 不保护，而手动流程要求"不碰检查文件"。我建议规划时把检查文件放在所有 scope 之外，drive 再拦截 `run` 里出现的路径。
  2. drive 没有总时长或总费用上限，最坏情况是"节点数 × 3 次尝试 × 1 小时"，20 个节点就是 60 小时的付费代理时间。我建议加一个总尝试次数或总时限。
- 另外，评审给出 `revise` 时 drive 也以 exit 0 结束。只看退出码的脚本会把它当成成功。
- 已验证：P1–P5 和边界测试 264/264 通过，引擎 1936 行。未运行 `npm run verify:release`、打包和 doctor。

Verdict: revise
