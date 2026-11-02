Reviewer: Claude Opus 5.5 (independent reviewer subagent; did not write this change). Round 2 of 2, reviewed at HEAD `c1b6374`.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | The implementation matches the FORMATS "Drive" contract | Met | I read every clause against `engine/drive.cjs`, `checks.cjs` and `cli.cjs`: state table, environment variables (including the `ubp` shim on PATH and `UBP_DRIVE`), verification steps 1–7, stop codes, reviewer run, JSON/text output, exit codes 0/1/2/130/143/129, the 5-second grace period before SIGKILL, and the ceilings. The new holes below are in the contract's own wording, not deviations from it. |
| 2 | The P5 tests pass and protect the contract | Mostly met | 33/33 pass. Six mutants in a scratch copy; four were caught (details under S9). |
| 3 | P1–P4 and boundary suites green, line budget, Node built-ins only, existing behavior unchanged | Met | Scratch export of HEAD: `node --test` P1–P5 + boundaries gave `tests 289, pass 289, fail 0`. `wc -l engine/*.cjs` = 1983; the protected test's `split('\n')` count is 2000, exactly the limit. No engine line is over 100 characters, and all requires are `node:` or `./`. The compaction diffs (CLI dispatch, `selectedChecks`, `completion`, `milestone`, `project.cjs`) preserve behavior; the only visible change is the `--budget` error text. Not run: `npm run verify:release`, `npm pack --dry-run`, `--doctor`. |
| 4 | The method paragraph is correct and actionable | Mostly met | S3 and S7 below. |
| 5 | Unattended safety | Partly met | Bounded: yes (`--attempts`, `--max-writers`, `--timeout-sec` ≤ 86400). Truth files: yes. Orphans: fixed for a writer whose children stay in its process group; not for a writer that exits on its own (NS3); unverified for `claude -p` (NS4). Dirty evidence: an exit-0 path remains (NB1). Forged evidence: two narrow paths remain (B4). |

## Round-1 findings

| ID | Status | Where | Notes |
|---|---|---|---|
| B1 | Resolved | `drive.cjs:12-34`, `:71` | Work-tree and HEAD truth bytes for six files including `plan-log`; the gate is read, never run. Tests at `engine-p5.test.cjs:527-575`; the plan-log mutant was caught. |
| B2 | Resolved for in-group descendants | `checks.cjs:31-71` (SIGTERM, then SIGKILL after `graceMs`), `drive.cjs:119-120` | Tests at `:762-799`; the no-grace mutant was caught. The remaining gaps are NS3 and NS4. |
| B3 | Resolved | `checks.cjs:26` tolerates EPERM | The 5-round interrupt test asserts exit 130 and no EPERM; it passed in my loaded run. |
| B4 | Partly | `drive.cjs:72-76`, `:85-87` | Forging the node's own covering checks is now caught. Two narrower paths remain (NS1, NS2). |
| S1 | Resolved | `drive.cjs:154-157` | Test at `:710`; mutant caught. |
| S2 | Resolved | `drive.cjs:188-193` | Test at `:448`. |
| S3 | Partly | `drive.cjs:98-103` | The shim and `eval "$UBP …"` work, but the shim loses to a login shell's PATH (NS5). |
| S4 | Resolved, ceiling stated | `drive.cjs:44-45`, `:50`; `FORMATS.md:891` | — |
| S5 | Resolved | `drive.cjs:46` | Only `.ultra/records/handoffs/` is allowed. |
| S6 | Resolved | `drive.cjs:146`, `:20`, `:47`; `FORMATS.md:168-170` | — |
| S7 | Partly | `method/ultra.md:139-155` | `:141` and `history-rewritten` are wrong (NS5, NS6). |
| S8 | Resolved | `drive.cjs:97`, `:104-115`, `:123` | JSON on interrupt is a stated ceiling. |
| S9 | Mostly | — | See mutant results below. |
| N1 | Resolved | `FORMATS.md:1001-1006` | — |
| N2 | Resolved | — | — |
| N3 | Resolved | `milestone.cjs:18-27` | Parser is now shared. |
| N4 | Resolved | — | — |
| N5 | Resolved | — | New nit below. |
| N6 | Resolved | `cli.cjs:40-41` | — |
| N7 | Resolved | `cli.cjs:96` | The guard is bypassable (nit). |
| N8 | Resolved | `drive.cjs:38-42` | — |

**S9 mutant results** (whole P5 file per mutant, scratch copy):

| Mutant | Result |
|---|---|
| `plan-log` removed from the truth list | caught (3 tests) |
| Decision 2 removed (HEAD must equal the old HEAD) | caught |
| No grace period | caught (2 tests) |
| No baseline run | caught (2 tests) |
| Step 6 without the "new run" rule | survives 33/33 |
| Step 6 without the "stale or unknown" rule | survives 33/33 |

The two step-6 rules each cover what the other misses (a writer that forges without changing code; a writer that never runs `ubp check`). No test isolates either rule.

## Controller decisions

1. **Truth before scope: agree.** It is the more specific and more serious code, and undoing the whole attempt also removes the out-of-scope paths.
2. **The writer may commit the old work-tree truth content: agree.**
   - At round start only the ledger truth files can differ from HEAD: uncommitted `spec`, `checks` or `plan` edits make the tree not clean.
   - So the writer can only commit lines the engine or the Owner already wrote, and gains no new capability.
   - Test 2d8d13e protects it (that mutant was caught).
3. **Implemented as answered** (`drive.cjs:44-51`, `cli.cjs:21`, `cli.cjs:134`).
   - Neither proxy answer is recorded in `.ultra/records/owner-touches.md`, committed or in the work tree. I grepped `.ultra/`, `tasks/` and `docs/`.
   - The method requires a `proxy: yes` line for every Owner question.
4. **Budget: correct arithmetic, zero headroom.**
   - `split('\n')` gives 2000, exactly the limit.
   - The fixes below need about 6–8 more lines, so either more compaction or an Owner decision on the budget.
5. **Timeout 3 → 8 s: agree.** No assertion changed. A writer that has not started its check fails loudly with ENOENT; it cannot pass falsely.

## New findings

### Blocker

**NB1. A fix that exists only in the work tree, hidden from Git, passes all the way to exit 0 at `milestone-gate`.**
- Where: `drive.cjs:21-22,43` (`clean()`) and `git-state.cjs:75-90` (`codeState` trusts `git status`). Checks run in the work tree.
- Repro (confirmed in a scratch copy):
  - Each writer runs `git update-index --assume-unchanged src/broken-*`, deletes those files, and commits only `src/N-0x.txt`.
  - Output: `writer N-01: done`, `writer N-02: done`, `check all: pass`, `reviewer M1: accept`, `stop milestone-gate`, exit 0.
  - HEAD still contains all three `src/broken-*` files, and a fresh clone fails C-1, C-2 and C-12.
  - The controller would then show the Owner a demo of a broken HEAD.
- Scope: the writer has to do this deliberately. The blind spot already exists in the engine's own `check`, `node done` and `milestone close`, and I missed it in round 1. It still contradicts criterion 5 ("cannot count … dirty evidence as progress"), and it is the only path left that reaches exit 0.
- Fix (about 3 lines):
  - In `clean()`, treat the tree as dirty when `git ls-files -v` shows any lowercase tag (assume-unchanged) or `S` (skip-worktree).
  - In `snapshot()`, also hash `git rev-parse --git-path info/exclude` and the repository `config`, and stop with `writer-left-dirty` when either changes.
  - Add the repro as a test.
  - State the ceiling that remains: global Git config and gitignored files.
- Complete fix (later): run the milestone gate's `check --all` in a temporary worktree of HEAD. `merge.cjs:169` already does this inline.

### Should-fix

**NS1 (B4, rest). Forged evidence that reuses an old `run` id hides a ratchet break.**
- Where: `drive.cjs:72-75`; contract `FORMATS.md:880` ("a `run` that was not in the ledger before it").
- Repro (confirmed):
  - The N-02 writer recreates `src/broken-C-1`, commits it, and reads the current code fingerprint from its own `ubp check C-12` record.
  - It then appends a copy of the pre-attempt green C-1 record (old run id) with that fingerprint and `at: 2099…`.
  - Result: `writer N-02: done`, with no `ratchet-broken`. The milestone gate's `check --all` stops the run at `checks-not-green` (exit 1), with the breakage attributed to no one.
- Fix: count as "added" every evidence line that is not byte-identical to a line present before the attempt, using the multiset diff already used for completions at `drive.cjs:60-66`. Reword contract step 6.

**NS2. A forged own completion bypasses a red invariant.**
- Where: `drive.cjs:82-87`. Step 7 checks only the node's covering checks; `ubp node done` also requires every invariant to be green.
- Repro (confirmed): the writer breaks invariant `C-inv`. `ubp node done N-01` refuses, so the writer appends a completion line built from the plan-log hashes. The drive records `writer N-01: done`, ends at `checks-not-green` (exit 1), and status shows both nodes `done` with `C-inv` red.
- Fix: step 6 runs every invariant, and step 7's `node-not-green` includes invariants (`Object.hasOwn(c, 'fix')`). In other words, step 7 checks what `node done` checks.

**NS3. A writer that exits on its own leaves its inner check orphaned.**
- Where: `checks.cjs:66-71`; contract `FORMATS.md:855` ("killed at once").
- Repro (confirmed): the writer starts `SLOW=1 ubp check C-1` in the background and exits. The drive sends SIGKILL to the group immediately, the inner `ubp` dies without stopping its check, and the check survives with ppid 1 in its own group. I stopped it by its PID.
- Fix: on a natural exit with a grace period configured, if `process.kill(-pid, 0)` still finds members, take the SIGTERM-then-grace path.

**NS4. With `claude -p` as the writer, the drive's group kill reaches only `claude`.**
- Observed in this host: each Bash tool command is its own process-group leader. My command's zsh had pid = pgid 80914; its parent `claude` had pgid 7974.
- Unverified: whether `claude -p` stops those groups when it receives SIGTERM. If it does not, a timeout or interrupt leaves the agent's `ubp check` and its check running.
- Cheapest check: one `claude -p` probe that runs a long `sleep`, then SIGTERM to its group, then look for the sleep.
- Robust fix: inside a drive, `runShell` records each check's pgid under `.ultra/.runtime/drive/<run>/` (path from the environment), and the drive kills those groups after every run.

**NS5 (S3, rest). Inside an agent's shell, `ubp` is not this engine.**
- This host's Claude Code shell snapshot does `export PATH=<absolute>`.
- Running `zsh -lic` with the shim directory first puts `/opt/homebrew/bin` ahead of it. `whence ubp` gives `/opt/homebrew/bin/ubp`, the old global v0.1.0 that rejects `check` and `node done`.
- The test writer passes only because it uses non-login `sh`.
- Fix:
  - Replace `method/ultra.md:141` ("inside the run, `ubp` is this engine") and the FORMATS text with: call the engine only as `eval "$UBP <args>"`.
  - Optionally, the drive appends that sentence to the brief file it writes.

**NS6 (S7, rest). The `history-rewritten` instruction is wrong.**
- At `method/ultra.md:145`, "undo the attempt in a new commit" cannot bring back commits the writer folded away, and reverting the folded commit also reverts the previous node.
- The drive never reports the HEAD before the attempt.
- Fix: put the before/after HEADs in the `writer` step (or in this problem's message), and tell the controller to restore the branch to the pre-attempt HEAD.

**NS7. The two P5 proxy answers are not in `owner-touches.md`.** Record them as `proxy: yes` lines.

### Nits
- The shim is written once per run (`drive.cjs:103`), in a directory no check covers, so a writer can replace it for later writers and the reviewer. Write it inside `shell()` before every run.
- The brief is compiled before the baseline run (`:147` vs `:154`), so it shows check states from before that run.
- `drive: check stale: pass` is printed when nothing ran, just before `stop checks-not-green` (seen in the NS1 and NS2 runs). Say `none`.
- `UBP_DRIVE` is bypassable with `env -u UBP_DRIVE …`. The truth bytes still catch `approve` and `close`, but "keeps a writer … from starting a drive" overclaims.
- The `--budget` error now prints `9007199254740991`. `Reviewer: ` with an empty name is accepted, although the method says `Reviewer: <who>`.

## What must be said to the Owner

- 第一轮的 4 个阻断里，B1–B3 已修好并有测试：未提交的真相文件改动、超时或中断后残留的检查进程、`kill EPERM` 导致的 exit 2。B4（伪造证据）只修好了一部分。全部 289 个引擎测试在 HEAD 上通过。
- 新发现一个能让 drive 以 exit 0 停在里程碑门的漏洞，已复现：写手用 `git update-index --assume-unchanged` 把修复只留在工作区，drive 跑完、评审写了 accept，可 HEAD 上每个检查都失败。
  - 这需要写手故意这么做。
  - 引擎原有的 `check`、`node done`、`milestone close` 本来就有这个盲区，第一轮我没发现。
  - 修复约 3 行加一条测试。
- 另外两条伪造路径也需要写手故意为之，已复现：
  - 复用旧 run id 伪造证据，可以掩盖棘轮回退；
  - 手写完成记录，可以绕过不变量。
  - 两者最终都会被里程碑门的 `check --all` 拦下（exit 1），但当时会被错记为节点完成。各需 1–2 行修复。
- 第一次用 `claude -p` 真跑前有两个风险：
  - 在这台机器上，代理的 shell 里 `ubp` 会解析到旧的全局版本，所以写手命令里要明确让代理只用 `eval "$UBP …"`。
  - Claude 的 Bash 命令跑在它自己的进程组里，drive 超时或中断时只能杀到 claude 本身；claude 会不会清理它启动的检查进程，没有验证过。建议先做一次很小的探针。
- 两个设计问题（检查文件不放进 scope、`--max-writers` 默认 10 且 `revise` 时 exit 1）是代答的，没有写进 `owner-touches.md`，请你本人确认。
- 引擎行数正好卡在 2000 的上限，上面的修复要么再压缩代码，要么由你调整预算。
- 这是合同允许的最后一轮评审。我的建议是：授权修 NB1、NS1、NS2、NS3，以及 NS5 的方法文字，由控制者用我给的复现确认，不再开新一轮评审。如果你选择不修，就把这几条作为已知上限写进验收报告，再接受 P5。

Verdict: revise
