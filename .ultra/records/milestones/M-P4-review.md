Reviewer: Claude reviewer subagent (fresh context; wrote none of the P4 engine, the method or the tests)

# M-P4 gate review: final confirmation (C1)

C1 is fixed. Both forgeries are now refused with every pathspec variable I tried, and the new test fails without the fix and passes with it. The four text edits say what the code does. No acceptance criterion is broken any more. What remains are ceilings and nits, listed in the Owner section below.

**How I worked:**
- I used a throwaway clone of `ab938e7` with the current uncommitted `engine/`, `tests/`, `method/`, `bin/` and `package.json` copied over it (`cmp`: identical to the workspace).
- All fixtures were under `$TMPDIR`; everything is deleted and no worktree is left registered.
- I changed nothing in the workspace. Its `git status` list matches the start of this check, plus the controller's new `M-P4-review-3.md`.
- As asked, I did not rerun the full suites.

## What I ran and saw

Each merge below is the forged-closure branch run against the current code. Every one gave `truth-changed`, exit 1, HEAD unchanged, and status still `M1 … 下一项 里程碑门`:

| Run | Branch | Environment | Refusal message |
|---|---|---|---|
| (a) | `.ULTRA/ledger/milestones.jsonl` | none | `sneaky changes .ULTRA/ledger/milestones.jsonl` |
| (c) | same | `GIT_LITERAL_PATHSPECS=1` | same |
| (c′) | same | `GIT_NOGLOB_PATHSPECS=1` | same |
| (c″) | same | `GIT_ICASE_PATHSPECS=0 GIT_GLOB_PATHSPECS=1` | same |
| (d) | exact name `.ultra/ledger/milestones.jsonl` | none | `forge changes .ultra/ledger/milestones.jsonl` |
| (d) | same | `GIT_LITERAL_PATHSPECS=1` | same |
| (d′) | same | `GIT_NOGLOB_PATHSPECS=1` | same |

**The test:** "a branch changes .ultra only through…" gives 1 pass on the current tree. With the new strip line removed from `gitEnvironment`, it gives 1 fail: `upper with GIT_LITERAL_PATHSPECS: {"ok":true,…}`.

**Engine size:** `wc -l engine/*.cjs` gives `1787 total`, and no line is over 100 characters.

## The four text edits

| Edit | True? |
|---|---|
| `FORMATS.md:223-225`: Environment names the four variables | Yes. It matches `git-state.cjs:17-18`, and runs (c) and (d) show the effect. |
| `FORMATS.md:737-739`: the rule-2 ceiling exempts the branch that builds the requirement | Yes. The engine judges only checks that fail after the merge, and that branch makes its check pass. |
| `method/ultra.md:282-284`: advice for `not green at HEAD before the merge` | Yes. It now covers a requirement added to a closed milestone. |
| `method/ultra.md`: retro bullet and refusal list reflowed | I found no change of meaning in either passage. |

## Status of everything raised in the gate review

| Status | Items |
|---|---|
| **Resolved and checked by running something** | Round 1: B1 (parallel writers), B2 (forged closures, approvals and plan log, including the `.ULTRA/` variant and C1), S1–S5, N1–N3. Round 2: S1 (method runs `ubp check --all` after a merge), the S2 symlink case, N2, N3, N6, Owner item 4 (documented). |
| **Accepted as ceilings** | Rule 2. The round-2 nits: the brief's `ubp check` exits 1 for unbuilt checks of later milestones; the year-9999 evidence line's unhelpful message; the spawn-error message losing its reason. The untested parts of round-1 N4 (detached fast-forward, registration-only leftovers) and N5 (maintenance flags). Branch evidence and node lines are trusted. |
| **Open** | None that breaks a criterion. |

## What must be said to the Owner

1. **结论：M-P4 可以关闭。** 门评审两轮外加两次只针对修复的核对，所有阻断都已修好并经我复现确认：并行写者合并、分支伪造关闭/批准/计划日志（含 macOS 大写 `.ULTRA/` 和 `GIT_LITERAL_PATHSPECS` 两条路）。最后两处修复各只有一行，是控制者写的，我核对过（偏离记录第 12 条）。
2. **代答的决定，Owner 本人还没看过：** REQ-P4-merge 放宽为“已完成的工作保持绿”，别人没做完的工作只警告；P4 默认分工（A：每个节点一个写者，加控制者核验）；本次运行中所有 Owner 介入都是代答，相应出口都“未经真实 Owner 验证”。
3. **A/B/C 结论的强弱：**
   - 花费结论扎实：B、C 的 token 是 A 的 3–5 倍，耗时是 2.7–4.5 倍。
   - 质量结论弱：A 在 T1、T3 已经满分，T2 的隐藏测试本身写错，B、C 几乎不可能胜出。
   - “里程碑门做跨厂商评审”没有测过。
   - 预注册只有文件创建时间作证据。
   - “上下文重建”这项指标没有记录。
4. **合并门只在测试夹具上跑过**，从没在 R 或真实项目上跑过。Owner 的第一个真实样本，就是它的第一次真实使用。
5. **合并门的上限（验收时要知道）：**
   - 分支带进来的证据行和节点完成行，引擎照单全收。伪造的证据能让一条红检查在主线上显示为绿，直到跑 `ubp check --all`；方法要求每次合并后、以及里程碑门都跑 `--all`，所以关闭仍受保护。
   - union 合并会照常应用分支一侧的删行，所以分支也能删掉主线账本里的行（推断，未复现）。
   - 已关闭里程碑上后加的需求，在建好之前会挡住其他分支的合并。
   - 临时工作树会用主线已安装的依赖：分支新加的依赖，要先在主线安装。
6. **其他上限：**
   - 删一条不变量不需要批准，也不进计划日志，只靠一条裁决记录。
   - 复盘按测试名归类；评审补了用例而重新变红的测试，会算作回归。
   - 写者简报里的 `ubp check` 会因为后续里程碑还没建的检查而退出 1，这不是写者的失败。
   - 以下几项没有专门测试：快进时的脱离进程组、只剩登记的临时树残留、关闭 Git 自动维护。
7. **提交前还要跑一次发布验证。** 我看到的 `npm run verify:release` 日志是在最后两处一行修复之前跑的（1090 通过、0 失败、5 跳过）。提交前按仓库规定再跑一次 `npm run verify:release`、`npm pack --dry-run --json`。主会话报告最后一次修改后：P4 60/60，P1–P3、边界和打包冒烟 197/197；这些我在本次核对中没有重跑。

Verdict: accept
