Reviewer: Claude Opus 5.5, fresh context, M-P5 gate (narrow confirmation of round 2)

N1 is resolved and the text fixes are in. One related gap remains, but it predates this fix and I don't think it should block closing M-P5. I ran no full suite, and no `check`, `gate`, `node done`, `milestone close` or `approve` in any real repository. My test runs used throwaway copies, which are removed, and none of my processes are left running.

## 1. N1: resolved

- **The new paragraph** (`skills/ultra/SKILL.md:151-162` at `0c26778`): when the drive stops, first put back what the stop names, then commit the ledger records, then act on the stop.
- **Reading it as an operator who follows it literally:**
  - **`truth-touched`, forged line left uncommitted:** putting the file back to its HEAD content removes the line, so it never reaches HEAD. Your reproduction (`records/acceptance/n1-repro/result.txt`, "variant a, order new") shows 0 forged lines in HEAD.
  - **`truth-touched`, forged line committed by the writer:** putting back changes nothing, but "undo the attempt in a new commit (a truth line it committed goes with it)" removes it. Variant b also shows 0.
  - **`reviewer-changed-tree`:** the reviewer's changes are put back before anything is committed. This matches the bullet "restore what it changed". I checked this by reading, not by running it.
  - **`history-rewritten` alone:** the branch is reset before the records are committed. With `--hard`, the drive's uncommitted evidence lines are lost, but they describe the rewritten tree, so nothing worth keeping goes (inferred).
- **Small possible loss:** restoring a truth file to HEAD also drops any legitimate uncommitted lines that were in it before the attempt. Because the method says to commit everything before driving, this is rare, and `ubp gate` records them again. No action needed (inferred).
- **The test pins the order (confirmed, run alone in a throwaway copy):**
  - It passes on the committed text.
  - If I put the old order back ("commit … first, then put back") with the three file names present, it fails.
  - It also passes a text that says "nothing to put back; commit all of `.ultra/ledger/`". So it pins wording order, not meaning, which is the limit of any test on prose.
- **Red/green and validators:** `n1-red.log` and `n1-green.log` (17/17) are as described. The validated Skill blob `8520963` is the committed one, and both validators print `Skill is valid!`.

**One case still lets a forged line stay at HEAD (confirmed; low to medium; existed before this fix; I also missed it in rounds 1 and 2).**
- **What happens:** a writer folds a forged approval into an existing commit with `git commit --amend`. The drive verifies in order and the first failure decides the stop, so it reports only `truth-touched`. I ran this: stop `truth-touched`, and the problems list does not mention `history-rewritten`, although the pre-attempt HEAD is no longer an ancestor.
- **Following the method literally:**
  - "Put back to HEAD" does nothing, because the forged line is already in HEAD.
  - `git log before..HEAD` shows one commit carrying the baseline's own message.
  - The operator either thinks the attempt made no commits, so the forged line stays, or reverts that amended commit and loses the baseline commit's legitimate content.
- **Why it doesn't block:** the drive still stops. It needs a writer that both edits a truth file and rewrites history in one attempt. The shipped writer prompt forbids the truth edit, though not amend or rebase.
- **Fix:** one clause, no engine lines. Under any writer stop, first check `git merge-base --is-ancestor <HEAD before the attempt, from reflog> HEAD`, and if it fails, handle `history-rewritten` first. Optionally add "never amend, rebase or reset" to `docs/examples/drive/claude-writer.sh`. Either do this or record it as a ceiling.

## 2. N2–N10, one line each

- **N2 resolved:** acceptance lines 114, 266 and 354 now give 356/362 and 359/362 with ceiling 14. "357" and "只在 Node 25" are gone from the acceptance draft and `index.html`.
- **N3 resolved:** `release-gate.md:49` now gives 0.2–31.5×, median about 14×. This matches my own pairing (267 tests, median 14.0×).
- **N4 resolved:** 185 everywhere; 186 appears nowhere.
- **N5 resolved:** acceptance lines 50 and 66, onboarding line 13 and `index.html` all mention the extra `Use the ultra Skill…` line.
- **N6 resolved:** onboarding line 17 now says "请读作".
- **N7 resolved:** no "。。" in any draft.
- **N8 resolved:** I checked the locations in R. Item 14 is in R's `rulings.md:65`; item 15 is in R's `M3-review.md:113-115`; item 16 is in R's `rulings.md:65/70/74`.
- **N9 resolved:** `records/acceptance/drive-smoke/README.md` is consistent with the evidence:
  - the script blobs equal the `5abe32d` and `e61f668` blobs (`04a866e…`, `41fca3c…`);
  - the models match the logs (`claude-sonnet-5-5`, `claude-opus-5-5`);
  - `c4228ff` at 06:48:39Z and the writer commits fall inside the drive window.
- **N10 recorded:** ceiling 14, including the 42.6 s against a 50 s bound. Node 22 at concurrency 3 failed 3 tests (180, 205, 251); each passes alone (`r2-node22-c3-rerun.log`). Test 205 really ended `attempts-exhausted` instead of `review-invalid` (c3 log line 1825).

## 3. New records and the §0 correction

- **§0 correction: right (confirmed).**
  - `main` is at `188c087`, a revert of `26da9ef`. Its tree hash equals `211143d`'s (`4c9344a…`), and `origin/main` is still `211143d`.
  - The main checkout now has 39 untracked entries.
  - With a throwaway HOME, the global `ubp --version` prints `v5.0.2`, and `ubp status` prints `unexpected positional argument: status`, exit 1. The 5.x `bin/install.js` has no `status` command.
  - npm's latest published version is 5.0.1, which matches acceptance line 53.
- **Onboarding option A is safe for the main checkout (confirmed).** The global package is an `npm link` symlink into the main checkout. In a throwaway prefix with npm 11.10.1, `npm install -g <tgz>` replaced the link with a real directory and left the link target's files untouched.
- **The other records are consistent:** deviations 18 and 19, the L1 ruling, and the two owner-touch lines. `M-P5-review-2.md` matches my round-2 text exactly apart from the trailing newline.
- **I can't confirm the Owner's own words.** I can't check the `proxy: no` quote "revert 吧，你直接做" from where I sit; only its effect.
- **Two small text issues, not blocking:**
  - Ceiling 14 says the machine load was "6 到 13". The logs record 4.8–11.4; cite that range.
  - `records/acceptance/n1-repro/n1-repro.sh` creates its run directory next to itself (`$HERE/n1-repro-<ts>`). Re-running it from the records folder would put Git clones inside the v6 tree. Use `mktemp -d` instead.
- **Post-fix gate:** `p5/r3-check-all.log` (head `0c26778`) had no results yet at 01:28, so I could not check it.

## What must be said to the Owner
1. N1 已修好：drive 停下后，方法现在先放回被改的真相文件，再提交记录。写者没提交的伪造批准行不会再进 HEAD；我用新测试和复现都确认过。
2. 还剩一个缺口，修复前就有，不阻断：写者如果把伪造行用 `--amend` 并进旧提交，drive 只报 `truth-touched`，不报改写历史。照方法字面处理时，伪造行可能留在 HEAD，也可能连那个旧提交的正常内容一起撤掉。补一句话就能修，不占引擎行数；要么在你的第一个真实样本前补上，要么记成上限。
3. 主仓库 `main` 已按你的话 revert（`188c087`），树与 `origin/main` 相同，没有推送。全局 `ubp` 是 5.x，本来就没有引擎命令；要直接用 `ubp` 跑 v6，需要按上手说明方式 A 安装。我在临时目录里测过，这一步不会删掉主仓库里的文件。
4. Node 22 上，默认并发 356/362、并发 3 是 359/362，失败的都是计时断言，单独重跑全过（上限 14）。CI 没有跑过。
5. 修 N1 之后的发布门检查（r3）我核对时还没跑完，结果要由控制者确认。
6. 本里程碑的放行和中间所有介入都是代答，未经你本人验证。

Verdict: accept
