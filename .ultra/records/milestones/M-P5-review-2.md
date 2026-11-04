Reviewer: Claude Opus 5.5, fresh context, M-P5 gate (round 2)

Round 2 checked the fixes, the smoke evidence, the three R commits and the drafts. I read the drafts as the Owner will read them. I ran no full suite, and no `check`, `gate`, `node done`, `milestone close` or `approve` in any real repository. My one reproduction ran in a throwaway clone under `$TMPDIR`, which I have since removed; no processes of mine are left.

The fixes hold, apart from one new product problem: the SKILL text added for round-1 item 1.6 lets a forged truth line get committed. I reproduced it. It is a one-sentence fix, but it is a product defect, so the verdict is revise. Everything else needs text fixes only.

## A. How the round-1 findings were handled

**Item 1: Integration**
- **1.1 Drive examples missing from the npm package: resolved (confirmed).**
  - `package.json` `files` now includes `docs/examples/drive`.
  - The new assertion in `tests/v6-package.test.cjs` failed before the fix (`p5/mp5r1-pkg-red.log`, at `claude-writer.sh`) and passes after it (`mp5r1-pkg-green.log`, 16/16).
  - `r2-pack.json` lists 37 files, and both scripts have mode 0755.
  - The SKILL and the CHANGELOG now say where the examples live and that the installer does not copy them into a host.
- **1.2 Review cap and narrow confirmation are not in the method: accepted as a recorded ceiling.** Ceiling 11, the L1 ruling and acceptance §4 item 18 record it. Onboarding line 85 now says "方法里还没有这一条". By the mission's rule, a recorded ceiling is not a defect.
- **1.3 `config.worktree` missing from the method's remedy: resolved (confirmed).** See `skills/ultra/SKILL.md:163-165`.
- **1.4 Help text did not match the README: resolved (confirmed).** `--json` is now described for doctor and engine commands, and `--root` is documented.
- **1.5 Product-shape decision: resolved.** "Correction 2" gives the real Skill path, the absolute engine path and the recovery anchor `211143d`.
- **1.6 "Commit the evidence first" missing from the method: the wording was added, but the new wording is defective.** See finding N1.

**Item 2: Release gate**
- **2.1 Skill validation on HEAD: resolved (confirmed).** `r2-skill-validate.log` validates an archive of `e61f668` (blob `83c85c4…`). Both Skill Creator validators print `Skill is valid!`. The missing Plugin Creator validator is disclosed.
- **2.2 Node 22: largely resolved.**
  - The default-concurrency run was 356/362, exit 1. All six failures are wall-clock assertions.
  - Each failing file was rerun alone on Node 22 and Node 25 (`r2-node22-rerun.log`), and every rerun passed.
  - The run at CI's concurrency 3 (`r2-node22-c3.log`) is **still running**. At 00:50:45 it had 135 top-level results, no `not ok`, and no `exit=` line yet.
  - The drafts still contain a stale claim about this; see N2.
- **2.3 Install from v6's own lockfile, with the checkout outside the v6 tree: resolved (confirmed).**
  - The checkout is `git worktree add --detach` under `$TMPDIR`.
  - `r2-npm-ci.log` reports 0 vulnerabilities and exit 0.
  - Clean-checkout `check --all` passed 7/7, exit 0, `removed=0`.
- **2.4 Release-gate summary: written, not yet final.** `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6/.ultra/.runtime/v6/p5-work/release-gate.md` is uncommitted. Its 【待填：c3】 still needs filling, and line 49 is wrong (N3). Its other numbers match the r2 logs.

**Item 3: P5 exit on sample R**
- **3.1 P5 row: resolved.**
- **3.2 The release engine's writer checks had never run with a real writer: resolved, with caveats (confirmed).**
  - The smoke run used the release engine: `git diff 5abe32d e61f668 -- engine docs/examples` is empty.
  - The writer finished on attempt 1. The reviewer returned revise. The drive stopped at `milestone-gate` with exit 1.
  - "12 个坏副本里 7 个" counts bad copies 01–12 only; the control row 00 is separate. The count is correct.
  - Caveats: one node and one attempt only. The exact smoke command line is not recorded (N9).
- **3.3 Wrong run-3 duration in the M3 demo: resolved (confirmed).** `faeb9a0` changes it to "约 3 分钟（评审 178 秒）".
- **3.4 Clean checkout tied to a HEAD: resolved (confirmed).** `records/p5/m3-clean-checkout-head.log` shows head `973e558`, 12/12 pass, `exit=0`, `removed=0`.
- **The R records added in `cf3cf61` and `d90758e` check out (confirmed).**
  - The stored `claude-writer.sh` and `claude-reviewer.sh` are byte-identical to `git show 5e0aacf:docs/examples/drive/…`.
  - The README's 36 seconds between run 0 (03:46:20) and run 1 (03:46:56) is correct.
  - The README says plainly which part is assumed (no uncommitted edits in the integration worktree).
  - The non-records diff is empty.

**Item 4: Acceptance package**
- **4.1 Stray commit on `main`: disclosed, and `main` is untouched (confirmed).**
  - `main` is still at `26da9ef`.
  - `git status --short` on the main checkout lists 143 entries, matching the draft.
  - One correction, and the error is mine from round 1: `.gitignore` went from **185** lines to 3, not 186 (`git show 211143d:.gitignore | wc -l` = 185). Acceptance line 29 and deviation 17 copied my number.
- **4.2–4.10: corrected in the draft.** I read the draft in full.
- **4.11: done.** The package reviews are copied, ceilings 12 and 13 are added, the 0→1 interview is in, and option B now warns that `--global` writes into the real `~/.claude`.
- **`M-P5-review-1.md` is a faithful copy of my round-1 output (confirmed).** I diffed it against my round-1 output from the transcript; the only difference is the trailing newline.

## B. New findings, most severe first

**N1. Blocks closing M-P5 (product defect, confirmed by reproduction).** The text is in `/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6/skills/ultra/SKILL.md:151-158`:

```
When the drive stops, commit the evidence
it left in `.ultra/ledger/` first (records never dirty the tree, so the drive does not), then
act on `stop`:
...
- `truth-touched`, ...: undo the attempt in a new commit and restore from Git any truth file it changed in the work tree.
```

- **The conflict:** `.ultra/ledger/` also holds three truth files: `milestones.jsonl`, `approvals.jsonl` and `plan-log.jsonl` (`engine/FORMATS.md:832-835`). The text says to commit the whole directory *first* and restore truth files *afterwards*. Done in that order, a writer's uncommitted approval or closure line is committed to HEAD, and "restore from Git" then has nothing left to restore.
- **Reproduction** (throwaway clone of the smoke project at `c4228ff`, engine from `git archive e61f668`):
  - The fake writer appended `{"forged":"approval"}` to `approvals.jsonl` and exited 0.
  - The drive stopped correctly with `"stop":"truth-touched"`, exit 1.
  - `git status` showed `approvals.jsonl` and `evidence.jsonl` changed side by side in the ledger directory.
  - Following the text literally (`git add .ultra/ledger/`, then commit) put the forged line into HEAD, and the work tree was then clean.
- **Why it matters:** this removes the protection the `truth-touched` guard exists for. A realistic trigger needs no malice: a writer that runs `eval "$UBP approve …"` to get past a gate.
- **Fix:** one sentence. Either commit only `evidence.jsonl` and `nodes.jsonl`, or, on `truth-touched` and `history-rewritten`, restore the truth files before committing anything. Then rerun the two Skill validators. The fix needs no engine lines.

**N2. Must be fixed before the package is committed (a wrong claim in the package; text only).** `acceptance.zh-CN.md:342` still says "发布门只在 Node 25.7.0 上跑过 … 362 个里 357 过，失败的 5 个". Round 2 ran Node 22 inside the gate and got 356/362 with 6 failures. This line contradicts the table and `release-gate.md`. Rewrite it from the r2 logs, and include the c3 result whether it passes or fails.

**N3. Text fix.** `release-gate.md:49` says "每条测试都比 Node 25 那次慢 12 到 20 倍". I paired per-test durations from `r2-node22.log` and `r2-verify.log` (267 matched tests): the median is 14×, the range is 0.2× to 31.5×, 121 tests are under 12× and 43 are over 20×. Suggested wording: "中位数约 14 倍".

**N4. Text fix.** `.gitignore` 186 → 185, in acceptance line 29 and deviation 17. This was my error in round 1.

**N5. Text fix.** The hook is described as printing "一行进度" (acceptance lines 47 and 63, onboarding line 13). `hooks/session-start.cjs:48-49` prints the status output and then also `Use the ultra Skill to drive this project.`

**N6. Text fix.** Onboarding line 17 says "下文的 `ubp` 都写成 `node <v6 工作树>/bin/install.js`", but lines 32 and 55 still say plain `ubp`. Change it to "下文的 `ubp` 请读作 …".

**N7. Text fix.** Acceptance line 343 ends with "。。".

**N8. Text fix (found by reading the draft).** The exception list in acceptance §4 omits item 16, which is recorded only in R's `rulings.md`.

**N9. Not blocking; record gap.** The smoke drive's command line is not recorded. `p5/smoke-drive.started` holds only the start time, run ID, exit code and end time. That it ran the shipped examples unchanged is inferred from the reviewer's behaviour (`git archive HEAD`, `eval "$UBP …"`). R now has a README for this; the smoke run should get one line too.

**N10. Not blocking; CI risk.** The reviewer-timeout test took 42.6 s against a 50 s bound under load (rerun log). It may be flaky on a slow CI runner. CI was not observed, which is already disclosed.

**Still to fill.** Placeholders remain:
- acceptance lines 111 and 231
- 4 in `index.html`
- 2 in `M-P5-demo.md`
- 1 in `release-gate.md`

**Checked and correct:**
- M-P5-demo's retro line matches `r2-retro.log` (once ×1 from C-release, 0 classes repeated twice or more).
- The new milestone-gate entry in `owner-touches.md` matches the L1 ruling.

## Acceptance criteria
- **Item 1, Integration:** met, except N1.
- **Item 2, Release gate:** met for Node 25, pack, doctor, clean checkout and Skill validation. Node 22 c3 could not be checked because the run is still going. CI was not observed (disclosed).
- **Item 3, P5 exit on R:** met. The caveats (one node in the smoke run, the review cap ceiling) are recorded.
- **Item 4, Acceptance package:** met, except N2–N8, which are text fixes before commit.

## What must be said to the Owner
1. **阻塞项（产品，已复现）**：方法文本 `skills/ultra/SKILL.md:151-158` 这样写："drive 停下后先提交 `.ultra/ledger/`，再把被改的真相文件从 Git 恢复"。这个目录里也有 `approvals.jsonl`、`milestones.jsonl`、`plan-log.jsonl`。照字面做，写者伪造的批准行会先被提交，之后"从 Git 恢复"就没东西可恢复了。我在临时副本里复现过：drive 正确停在 `truth-touched`，照方法提交后，伪造行进了 HEAD。改法只需一句话：只提交 `evidence.jsonl` 和 `nodes.jsonl`，或者先恢复真相文件再提交。改完重跑两个 Skill 校验器，不占引擎行数。建议你授权这一处修复，修完由控制者用同样的复现核对后放行。
2. **主仓库 `main` 上的误提交 `26da9ef` 要你决定**：revert，还是 reset 到 `211143d`。在此之前，全局 `ubp` 不能用（`--version` 显示 v0.1.0），主仓库有 143 条未跟踪条目。顺带更正我第 1 轮的数字：`.gitignore` 是从 185 行删到 3 行，不是 186 行。
3. **Node 22**：默认并发下 356/362，6 条失败都是计时断言，单独重跑全部通过。按 CI 并发 3 的重跑写这份评审时还没结束（00:50 时已出 135 条，0 失败）。CI 没有实际跑过 v6。验收包第 6 节第 342 行还是旧说法（"357 过、5 个失败、只在 Node 25 上跑过"），入库前必须改。
4. **冒烟运行**：只有一个节点、一次尝试。写者通过了发布版的全部核验；评审给的是 revise，12 个坏副本里有 7 个能让检查变绿。这次的启动命令行没有记录下来。
5. **"评审两轮后只做窄核对"不在方法里**（上限 11）。照方法走，你的真实样本在两轮评审后需要你亲自叫停。
6. **被 Git 忽略的文件 drive 看不见**（上限）。缓解办法是里程碑门在干净副本上重跑检查，加上示例评审在 `git archive HEAD` 上跑检查。
7. **本里程碑的放行和中间所有介入都是代答**，未经你本人验证。逐条清单在验收包第 4 节。
8. **只需改文字、不影响关闭的**：
   - `release-gate.md:49` 的"每条都慢 12 到 20 倍"（实测中位数约 14 倍，范围 0.2 到 31.5 倍）；
   - hook 打印的不止"一行"；
   - 上手说明第 17 行"写成"应为"读作"；
   - 第 343 行多一个"。"；
   - 第 4 节例外清单漏了第 16 条；
   - 各处【待填】。

Verdict: revise
