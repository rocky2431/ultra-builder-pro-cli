Reviewer: Claude reviewer subagent (fresh context; wrote none of the P4 engine, the method or the tests)

# M-P4 gate review: confirming the fix to round-2 B1

The `.ULTRA/` fix works in a normal shell. But the fix itself opens a new hole in the same protection, so I can't accept yet. The new pathspec `':(icase).ultra'` uses Git "pathspec magic". When the environment variable `GIT_LITERAL_PATHSPECS=1` is set, Git reads that pathspec as a literal file name, so it matches nothing. The `truth-changed` allowlist then sees no changes at all. With that variable set, a branch brought a closure in under its exact name, `.ultra/ledger/milestones.jsonl`, with exit 0. The engine does not strip this variable. The fix is one line, and I tested it in a copy.

**How I worked:** a throwaway clone of `ab938e7` with the current uncommitted `engine/`, `tests/`, `method/`, `bin/` and `package.json` copied over it (`cmp`: identical to the workspace). All fixtures were under `$TMPDIR`; everything is deleted and no worktree is left registered. I changed nothing in the workspace; its `git status` list is the same as when I started. As asked, I did not rerun the full suites.

## What I ran and saw

| Case | Command and result |
|---|---|
| (a) Round-2 B1: a closure under `.ULTRA/ledger/milestones.jsonl` | `truth-changed: sneaky changes .ULTRA/ledger/milestones.jsonl`, exit 1, HEAD unchanged, `.ultra/ledger` holds no `milestones.jsonl`, status still `M1 · 1/1 绿 · 下一项 里程碑门`. **Refused.** |
| (b) A symbolic link at `.ultra/records/x` | `truth-changed: linky changes .ultra/records/x`, exit 1, HEAD unchanged. **Refused.** |
| The new test | Test "a branch changes .ultra only through…": 1 pass on the current tree. With the pathspec put back to `-- .ultra`: 1 fail (`merge upper … --json`). **Red without the fix, green with it.** |
| (c) Case (a) with `GIT_LITERAL_PATHSPECS=1` | `{"ok":true,…}`, exit 0, then `M2 · … · 已关闭里程碑 1 项未绿`: M1 is closed. **Bypassed.** |
| (d) An exact-name closure `.ultra/ledger/milestones.jsonl` | Without the variable: `truth-changed`, exit 1. With `GIT_LITERAL_PATHSPECS=1`: `{"ok":true,…}`, exit 0, and M2 becomes current. **Bypassed.** |
| Candidate fix, in a copy | One added line in `gitEnvironment`: also delete `GIT_LITERAL_PATHSPECS`, `GIT_GLOB_PATHSPECS`, `GIT_NOGLOB_PATHSPECS` and `GIT_ICASE_PATHSPECS`. Cases (c) and (d) with the variable set are then both refused `truth-changed`, exit 1. |
| Exposure on this machine | `env \| grep -c '^GIT_.*PATHSPECS'` printed `0`. The hole is latent here, not live. |

Engine size: `wc -l engine/*.cjs` gives `1786 total`, and no line is over 100 characters.

## Blocker

**C1. The allowlist depends on an inherited Git variable.**
- **Where:** `engine/merge.cjs:179` uses `':(icase).ultra'`. `engine/git-state.cjs:16` strips only the variables in `git rev-parse --local-env-vars`, and `GIT_LITERAL_PATHSPECS` is not among them.
- **Why it blocks:** it breaks criterion 3 ("a branch can never bring in … closures or approvals") whenever the controller's environment carries that variable. Git exports it to child processes, such as hooks and aliases, when it is run with `--literal-pathspecs`. That is the same class of leak as round 1's inherited `GIT_DIR`, which the engine fixed by stripping variables. A writer cannot set the controller's environment, so the practical risk is low. But the old pathspec `-- .ultra` did not have this weakness: this round's fix introduced it.
- **Fix:**
  1. Delete the four pathspec variables in `gitEnvironment` (tested above). Alternatively, drop the pathspec and filter paths with `/^\.ultra(\/|$)/i` in JavaScript.
  2. Run the B2 test once with `GIT_LITERAL_PATHSPECS=1` in its environment; the test helper `run` already accepts an `env` argument.
  3. Name these variables in FORMATS, section "Git state" → Environment.

## Round-2 items

| Item | Status | Basis |
|---|---|---|
| B1: `.ULTRA/` case variant | Resolved in a normal environment; still open through C1 | Cases (a), (c) and (d) above |
| S1: forged branch evidence | **Resolved** | `FORMATS.md` ceiling and `method/ultra.md:288` now say `ubp check --all` after each merge. The claim that those runs are appended after every branch record and supersede it is true: each append gets `at` = max(now, greatest + 1). |
| S2: symlink at an allowed path | **Resolved** | Case (b) is refused, and the new test covers it. |
| S2: rule 2 | **Accepted as a ceiling** (nit below) | `FORMATS.md:734-736` |
| Owner item 4: removing an invariant | **Resolved** | The Reductions ceiling now says it leaves no plan-log record. That is true: an invariant is in no milestone snapshot. |
| N2 | **Resolved** | `method/ultra.md:271` now says "a node with a completion record". |
| N3 | **Resolved** | The retro sentence (re-reddened tests count as regressions) is true. |
| N6 | **Resolved** | The addendum matches `data/reports/`: one writer report and three Codex results. |
| N1, N4, N5 | **Accepted as ceilings** | As recorded by the controller |

**Nit on the rule-2 ceiling wording:** "its red check blocks every merge" overstates it. A branch that builds that requirement passes its check, and the engine only judges failing checks (`merge.cjs:209-213`). So it blocks every *other* merge. The method's advice for `not green at HEAD before the merge` ("finished work is red") also doesn't describe this case.

## What must be said to the Owner

1. 第 2 轮的阻断（macOS 上分支用大写 `.ULTRA/` 目录伪造关闭记录）在普通环境下已经修好：我的复现被拒绝，新测试先红后绿。
2. 但这次修法本身带来一个新漏洞。新的 pathspec `':(icase).ultra'` 依赖 Git 的 pathspec 魔法；只要运行 `ubp merge` 的环境里有 `GIT_LITERAL_PATHSPECS=1`，白名单检查就整个失效，连按原名提交的 `.ultra/ledger/milestones.jsonl` 也能把关闭记录合进主线（已复现，退出码 0）。写者改不了控制者的环境，这台机器上现在也没有这个变量，实际风险低；但它违反了标准 3 里的“never”，而且是这次修复引入的，所以结论仍是 revise。
3. 修法只有一行：在 `gitEnvironment` 里再删掉四个 `GIT_*_PATHSPECS` 变量。我在副本里验证过，两个伪造都被拒绝。另外加一条带该变量的测试，并在 FORMATS 里写明。我的建议：照本轮的做法，授权控制者改这一行，并用上面复现 (c)、(d) 确认被拒绝，不再开新的评审轮次。如果 Owner 选择不修，就要把“运行 `ubp merge` 的环境不得设置 `GIT_LITERAL_PATHSPECS`”明确记为上限；我不建议这样做。
4. 其余项目都已核实：S1、S2 的符号链接一例、N2、N3、N6、Owner 第 4 项已解决；N1、N4、N5 和规则 2 记为上限。规则 2 上限的措辞略夸大：负责建这条需求的那个分支本身可以合并，被挡住的是其他分支。
5. 前几轮已提过、仍然成立的几点：REQ-P4-merge 的放宽是代答批准的，Owner 本人还没看过；合并门至今只在夹具上跑过，没有在 R 或真实项目上跑过。

Verdict: revise
