Reviewer: Claude Opus 5.5, fresh context, M-P5 gate

The release gate holds up and the engine, contract, method and READMEs agree with each other. But the acceptance package has about ten wrong or overstated claims and leaves out one serious environment problem. The P5 exit claim on R also needs a fuller caveat than the one written, so the verdict at the end is revise.

What I did: read-only inspection of v6 (`5abe32d`), R (`973e558`), the main checkout and the package worktree. I ran `ubp status` in v6 and R, and `--help` with a temporary HOME. In throwaway copies under `$TMPDIR` I ran the Skill Creator validator and the full Node suite under Node v22.21.0 (log kept at `/var/folders/cm/zpwxmr512rq1qz4_0_ryz8t80000gn/T/mp5rev-node22.log`). I ran no `ubp check`, `gate`, `node done` or `milestone close` in either repository. Every process I started has exited (checked with `ps`), the temporary directory is removed, and `git status --short` is empty in both v6 and R.

| Item | Result |
|---|---|
| 1 Integration | Engine, FORMATS, method and READMEs agree. Three product gaps: drive examples not shipped, no review cap in the method, method omits `config.worktree`. Plus three small mismatches. |
| 2 Release gate | The logs show exactly what is claimed. Missing: the Skill and Plugin validators at HEAD, a Node 22 run in the gate, and an install from v6's own lockfile. |
| 3 P5 exit on R | The node work ran unattended to the gate. Completing the milestone needed controller hand work, and the recorded caveat is incomplete. |
| 4 Acceptance package | About ten wrong or overstated claims, and one major omission (a stray commit on `main`). |

## 1. Integration

**1.1 Medium, confirmed: the package does not ship the drive examples it points to, and the method names no writer or reviewer command.**
- `package.json` `files` has no `docs/examples`, and `release-pack.json` lists 35 files with none under `docs/`.
- The shipped `CHANGELOG.md` says "Headless Claude Code writer and reviewer examples are in `docs/examples/drive/`".
- `skills/ultra/SKILL.md:145-148` says to start `ubp drive --writer <cmd> --reviewer <cmd>` and points nowhere.
- Scenario: someone installs from npm, asks for an unattended run, and has no writer command.
- Fix: add `docs/examples/drive` to `files`. The protected test (`tests/v6-package.test.cjs:281-293`) only forbids `.py`, `.test.cjs`, `skills/ultra-*` and `.ultra-template/`, so this does not break it. Or point the CHANGELOG at the repository URL.

**1.2 Medium, confirmed: the shipped method has no review-round cap and no narrow-confirmation step.**
- `grep -i "round|cap|narrow"` on `skills/ultra/SKILL.md` finds neither.
- The revise path (`SKILL.md:200-204`) ends with "review again" and has no bound. The two-round cap comes from contract §8 and the user's own CLAUDE.md, not from the product.
- `claude-confirm.sh`, which closed M3, exists only in R's records (`.ultra/records/p5/scripts/`).
- Scenario: on the Owner's first real sample, a model following the method reviews again after every revise.
- See 4.3: the onboarding note claims the method sets this rule.

**1.3 Low, confirmed: the method's remedy for `writer-left-dirty` and `dirty-tree` (`SKILL.md:158-160`) says to undo changes to Git `config` or `info/exclude`. It leaves out `config.worktree`, which drive compares** (`engine/drive.cjs:27`, `engine/FORMATS.md:824-825`, and the onboarding note). A controller following the method can miss the cause of a repeated stop.

**1.4 Low, confirmed by running: help and README disagree about `--json`.** `node bin/install.js --help` says `--json ... (doctor only)` and lists no `--root`. The README says "Engine commands accept `--root <dir>` and `--json`", and the engine does accept both.

**1.5 Low, confirmed: the product-shape decision cited by the shipped CHANGELOG is out of date** (`/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6/.ultra/decisions/2026-11-01-v6-product-shape.md`).
- It says the Skill body is `method/ultra.md`, which `37430e7` deleted.
- It says the engine is reached as `ubp <command>`, but the Skill uses an absolute path.
- Its recovery point, "the last 5.x commit on `main`", is now the stray commit `26da9ef` (see 4.1). The right anchor is `211143d`, which equals `origin/main`.
- Its correction section fixed only the 5.0.2 statement.

**1.6 Low, confirmed: the method never says to commit `.ultra/` after a drive stop.** It says to commit after a gate passes (`SKILL.md:110-112`) and after a closure (`:213`). The onboarding note and ceiling 7 say "按方法先提交再开门". Drive runs the reviewer before any such commit (`drive.cjs:186-196`), which is why all three M3 reviews report 24 uncommitted ledger lines.

**What holds (confirmed):**
- Every stop code in `drive.cjs` except `all-done` appears in `SKILL.md:149-166`.
- The truth-file list in FORMATS matches `drive.cjs:11-13`.
- The round-3 method edit (clean checkout at the gate, `SKILL.md:187-193`) survived the rebase from `method/` to `skills/ultra/`.
- Both READMEs and the CHANGELOG agree.
- The engine requires only `node:` builtins and relative files.
- The package ships nothing from 5.x; 63 tracked product files.

## 2. Release gate

**2.1 Medium-low, confirmed: the repository's CLAUDE.md requires "Validate changed Skills with the Skill Creator validator and changed Codex manifests with Plugin Creator". `release-gate.sh` runs neither.**
- The only recorded Skill validation is at `37430e7` (`ultra-builder-pro-cli-v6-p5-pkg/.ultra/.runtime/v6/p5/pkg-r2-receipt/receipt.md:48`). `SKILL.md` has changed four times since: `6301028`, `35403e3`, `d35bd94`, `571e263`.
- I ran `quick_validate.py` on a copy of HEAD's `skills/ultra`: `Skill is valid!`, exit 0.
- Plugin Creator was "unavailable" (`receipt.md:49`). That unavailable check is not listed in the package's 没验证 section, though CLAUDE.md says to report unavailable checks.

**2.2 Low, confirmed: the gate ran only on Node 25.7.0, while `engines` is `>=22` and CI uses Node 22.**
- I ran the full suite on a temporary clone of `5abe32d` under Node v22.21.0, with load average around 8: 362 tests, 357 pass, 5 fail, 2065 s.
- All five failures are wall-clock bounds: an 8 s `spawnSync` timeout, a 2.5 s kill, a 50 s bound, and two drive runs killed by their `spawnSync` timeout.
- Rerun one file at a time, all five pass: boundaries 1/1, session-start 1/1, engine-p5 3/3.
- Conclusion: Node 22 is compatible, and the suite is load-sensitive (known; package review R2-4).

**2.3 Low, confirmed: v6's `node_modules` is a symlink to `../ultra-builder-pro-cli/node_modules`.**
- That directory holds packages not in v6's lockfile (`@modelcontextprotocol`, `@vercel`).
- No `npm ci` from v6's lockfile has been run. js-yaml is 4.3.2 in both, so the risk is low.
- The clean-checkout rerun sits inside the v6 tree and installs nothing, so it resolves dependencies from parent directories. It does not exercise the method's "install what the project needs" step.

**2.4 Low, confirmed: `records/acceptance/release-gate.md`, which acceptance §1 says is committed, does not exist.** `ls .ultra/records/acceptance` reports no such directory. The draft is `p5-work/release-gate.md`.

**What the logs show (confirmed; they match the claims):**
- `release-env.log`: HEAD `5abe32d`, empty status, v25.7.0, npm 11.10.1.
- `release-verify.log`: 362 tests, 362 pass, 0 fail, 0 skipped, 349 s, `found 0 vulnerabilities`, `exit=0`.
- Pack: 35 files, 110,260 / 348,122 bytes, `engine/drive.cjs` included, no `.py`.
- Doctor: install exit 0. Both hosts `healthy` with commit `5abe32d` and `dirty: false`. Claude: 22 assets, 2 contracts. Codex: 24 assets, `hook_activation: host_managed`. Uninstall exit 0, and nothing left under the isolated `cfg` or `home`.
- `mp5-clean-checkout.log`: 7/7 pass, `exit=0`, `removed=0` at 22:03.
- Doctor ran from the source tree, not the tarball. The tarball install is covered by `package-smoke` inside `verify:release`.

## 3. The P5 exit on R

**3.1 Medium, confirmed: "P5 exit observed" holds only for the node work; the recorded caveat is incomplete.**

What drive did unattended (`drive-run-1/drive.json`):
- three writers, each done on the first attempt;
- `check --all` passed;
- the reviewer said revise;
- drive stopped at `milestone-gate`.

What the controller did by hand:
- Before the drive: wrote the simulated Owner message (`p5/m3.md`), the red tests (`696893c`), and the plan with a proxy reduction of the closed M1 (`3c5de92`, 9 hours before the drive).
- Started drive four times. Run 0 never started a writer (exit 127).
- After run 1: renamed the review to `M3-review-1.md`, added 7 assertions (`24d9f6e`), wrote a ruling and a proxy gate answer.
- After run 2: ran 33 mutants itself (`mutants-round2.txt`) and added 6 tests (`49555e3`).
- For run 3: swapped in a reviewer it wrote, `claude-confirm.sh`. That reviewer checks only four items and is told that new gaps do not decide the verdict.
- Ran a clean checkout, wrote the demo, and closed M3 by proxy (`aba26ad`).

The accepting review says itself: "I confirmed only the adoption; I did not review the milestone a third time" (`M3-review.md`).

The task-record caveat ("补检查由控制者以规划者身份做") is true but leaves out the narrowed reviewer, the four starts, and that M3 was simulated and planned by the controller. The acceptance package's P5 row is still 【待填】, and its one-line summary carries no caveat.

Suggested row text: 无人值守部分达到：drive 无人值守写完 M3 三个节点并停在门口；两轮 revise 由控制者手工补检查，drive 共启动 4 次，接受 M3 的是控制者编写的窄核对，不是整分支评审；M3 是模拟需求。

**3.2 Medium, confirmed: the shipped writer verification and the shipped example scripts have never run with a real writer.**
- R's only writer run (run 1) used the pre-round-3 engine (`5e0aacf`, deviation 16).
- `git diff 5e0aacf 7faef6c -- engine/` shows round 3 changed:
  - `clean()` (now rejects assume-unchanged and skip-worktree entries);
  - the Git-settings comparison for both writer and reviewer;
  - the per-run shim;
  - process-group cleanup in `checks.cjs`.
- Run 3 also lacked `571e263` (the `config.worktree` comparison).
- R's scripts differ from the shipped examples: R called `ubp` from PATH, while the examples call `eval "$UBP …"` and the reviewer adds a `git archive HEAD` run.
- R's writers' plain `ubp` worked: their logs show `node done` passed. The `eval` form has been exercised only by fake writers in `tests/engine-p5.test.cjs:425`.

**3.3 Low, confirmed: R's committed `M3-demo.md` item 5 gives run 3 as "19 分钟".** The review log says `duration_ms 178042`, about 3 minutes. The acceptance package's "约 3 分钟" is right. The demo counts 4 runs while the acceptance table says three.

**3.4 Low, confirmed: `R/.ultra/records/p5/m3-clean-checkout.log` records no HEAD or path,** so which commit it ran on can only be inferred from timing.

**Numbers checked and correct:**
- Writer times 4.5, 3.3 and 1.9 minutes, costing $0.79, $0.60 and $0.37.
- Run 1 total $4.94. Reviews $3.18, $3.91 and $2.54, which is $9.63. The whole M3 drive came to about $11.39; no total is stated anywhere.
- 17/13/36/4; 7 assertions; 15 (2 of them controls)/13; 6 tests; 33/30/3; 49 tests and 12 checks; 454 lines; 11 requirements, 12 checks, 3 milestones.
- Run 0's "3 秒" cannot be checked: its records have no timestamps.

## 4. Acceptance package

**4.1 High, confirmed facts, inferred cause: a stray commit on the main checkout's `main` is not mentioned anywhere.**

What it is:
- `/Users/rocky243/Context Engineering/ultra-builder-pro-cli` has `main` at `26da9ef` "chore: start the Shortlink reference sample", 2026-10-31 20:29:27. That is one second after R's `11c37dc`, with the same message.
- It replaces `package.json` (ultra-builder-pro-cli 5.0.2 becomes shortlink 0.1.0), cuts `.gitignore` from 186 lines to 3, and rewrites `.gitattributes`.
- It is not on `origin/main` (`211143d`) and not in v6.
- No deviation, ruling or task-record line mentions it (grep finds nothing).

What it causes:
- `/opt/homebrew/bin/ubp` resolves to this checkout's `bin/install.js`. So the "old global 0.1.0" in drive review round 2 and acceptance §3 is this commit, not an old install.
- The main checkout's 5.x package and ignore rules are broken, and 143 untracked entries are now exposed.
- The decision's recovery anchor (1.5) points at this commit.

The contract authorizes commits on `v6` only. The cause is inferred: probably the R init step ran in the wrong directory.

What to do: record it as a deviation. The Owner should choose between `git revert 26da9ef` (non-destructive) and resetting `main` to `211143d` (destructive, needs their explicit approval).

**4.2 Medium, confirmed, wrong: §6 says "第 3 轮只加严了写者核验，而 R 的第 2、3 次运行没有写者".** Round 3 also tightened reviewer verification (3.2). And the run that did have writers missed round 3. The same sentence is in `index.html`.

**4.3 Medium, confirmed, wrong: `onboarding.zh-CN.md:73` says "方法规定评审最多两轮……窄核对不算第三轮".** The method has no such rule (1.2).

**4.4 Medium, confirmed, wrong count: §3 分工 says the cap was exceeded twice, both times checked by the original reviewer (偏差 8、16).**
- Deviation 8 says P4's round 3 was checked by the controller alone, with independent verification left to the M-P4 gate review.
- More reviews went past the cap: the M-P4 gate (two rounds plus two fix confirmations, deviation 12) and R's M3 gate.
- So the cap was passed at least four times.

**4.5 Medium, confirmed, wrong: §4 says "每条原文都在对应项目的 owner-touches.md 里，标着 proxy: yes".** v6's `owner-touches.md` has no line for:
- item 1, product shape (it is in the decision file);
- item 2, the P4 default roles (decision file);
- item 6, the 2000-line budget (a ruling, `rulings.md:16`);
- item 7, the method candidate.

**4.6 Medium-low, confirmed, says the opposite: §4 item 16 "并发去重只防住单个 setImmediate 的交错".** `M3-review-1.md` finding 7 says the check catches the 20 ms copy "but not a single `setImmediate`", and `mutants-round2.txt` shows `r1-DD-race fail=0`. It should read 拦得住 20 ms 的间隔，拦不住单个 setImmediate 的交错. The same text is in `index.html`.

**4.7 Medium-low, confirmed, overstated: §1 says "节点完成、合并、drive 都会拦" a ratchet break.** `engine/completion.cjs` checks only the plan gate, a clean tree, dependencies, the node's own requirements and the invariants. In the manual flow the ratchet is caught by `check` plus the controller (`SKILL.md:126-130`) and by `milestone close`.

**4.8 Medium-low, confirmed by running: the commands the Owner is told to run fail on this machine.** "怎么验收" step 2 (`ubp status`), step 3 and onboarding §7 (`ubp gate`) use plain `ubp`. With a temporary HOME, `/opt/homebrew/bin/ubp status` prints `✗ unexpected positional argument: status` and exits 1. §2 "亲手看" correctly uses the full path; these steps should too.

**4.9 Low, confirmed, broken references:**
- "完整命令见验收包" (`onboarding.zh-CN.md:72`): the package records no actual drive command line for R, so the runs cannot be reproduced exactly.
- `0e73ba7` in §3 and deviation 16, and `0520af0`, exist only on `v6-p5-drive`. The v6 commits are `571e263` and `d35bd94`.

**4.10 Low, confirmed: the P2 row says "达到" although the exit includes "Owner 只在计划好的点介入".** v6 has two `unplanned` lines during P2. The M-P2 review counts the `delegation` line as unplanned too.

**4.11 Low, confirmed, omissions:**
- Package reviews exist only in the disposable `ultra-builder-pro-cli-v6-p5-pkg/.ultra/.runtime/v6/p5/review-round{1,2}.md` and are not in v6's records or in the §5 index.
- Plugin Creator was not run.
- The gate never ran on Node 22 (my result is in 2.2).
- v6's `.gitignore` is still the 5.8.0 file (it ignores `scripts/`, `lib/`, `tasks/`, `templates/`, `*.log`). That widens ceiling 8 for v6 itself. Advise the Owner to keep a narrow `.gitignore` on the real sample.
- "需要你本人出面的只有三处" leaves out the 0→1 interview.
- Onboarding option B (`--global`) still writes into the real `~/.claude` and `~/.codex`, so "不动全局" is misleading.

## What must be said to the Owner

1. 主仓库 `ultra-builder-pro-cli` 的本地 `main` 上多了一个误提交 `26da9ef`。它和样本 R 的第一个提交同一秒、同一句说明，把 UBP 的 `package.json` 换成了 Shortlink 的，`.gitignore` 从 186 行删成 3 行。
   - 它没有推送，也没有记进任何偏差或任务记录。
   - 这台机器上的全局 `ubp` 因此是坏的：`ubp status` 直接报错。之前说的“旧的全局 0.1.0”就是这个提交造成的。
   - 合同只授权在 `v6` 上提交。请你决定用 `git revert`，还是把 `main` 重置到 `211143d`（重置是破坏性操作）。
2. “P5 出口已观察到”要说完整：
   - drive 无人值守地写完了 M3 的三个节点，并停在里程碑门。
   - 让 M3 关闭的是控制者的手工工作：两轮 revise 后手工补检查，drive 共启动 4 次，第三次评审换成控制者写的窄核对脚本（只核对 4 件事，新缺口不影响结论）。
   - 最后接受 M3 的不是一次整分支评审，而且 M3 本身是模拟的需求。
3. 发布版的写者核验（第 3 轮修复）和随包示例脚本，都没有和真实的 `claude -p` 写者完整跑过。R 上唯一带写者的那次 drive 用的是修复之前的引擎。你的第一个真实样本就是第一次。
4. 发布的方法里没有“评审最多两轮、之后做窄核对”这一步。按方法走，revise 之后会一直再评审，需要你在两轮后叫停。M3 用的窄核对脚本只在 R 的记录里。
5. npm 包里没有 drive 的写者和评审示例脚本，CHANGELOG 却指向它们。用 npm 装的人拿不到现成命令。
6. 验收包里这几条要改：
   - “第 3 轮只加严了写者核验”不对，评审核验也加严了；
   - “评审上限超出两次、由原评审者核对”不对，至少超出四次，P4 那次是控制者自己核对；
   - “每条原文都在 owner-touches.md”不对，产品形态、默认分工、行数预算、方法候选这四条不在里面；
   - setImmediate 那句说反了，检查拦不住单个 setImmediate 的交错；
   - “节点完成会拦棘轮”说过了，手动的节点完成不检查别的需求；
   - 验收步骤里直接用的 `ubp status` 和 `ubp gate` 在这台机器上会失败，要写完整路径；
   - 引用的 `release-gate.md` 摘要还没入库；
   - 一处提交号 `0e73ba7` 不在 v6 历史里，应为 `571e263`。
7. 发布门本身是成立的：数字都和原始日志一致，在 HEAD 的干净检出上 7 条检查全过。
   - 我补跑了两项：Skill 校验在 HEAD 上通过；Node 22 全量测试在机器高负载下 357/362，失败的 5 条全是计时断言，单独重跑全部通过。
   - Plugin Creator 不可用，Codex 清单没有经过它的校验。

Verdict: revise
