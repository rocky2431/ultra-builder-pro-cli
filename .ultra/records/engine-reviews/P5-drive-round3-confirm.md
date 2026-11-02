Reviewer: Claude Opus 5.5 (independent reviewer subagent, round 1–2 author of the repros). This is the narrow round-3 confirmation on `e575a44`, not a review round.

Following your definition, the verdict is **accept**: all four repros now stop as the contract says. But the same failure as NB1 is still reachable by a different route, ignored files, and that needs the Owner's attention before the first real run.

All experiments ran on `git archive e575a44` under `$TMPDIR`. I stopped every process I started and deleted the directory; the worktree is untouched (`git status` empty, HEAD `e575a44`).

## 1. The four repros

| Repro | Now | Evidence |
|---|---|---|
| NB1: deletion hidden with `assume-unchanged` | **Resolved**, stops `writer-left-dirty` | `writer N-01: writer-left-dirty (exit 0)` → `stop writer-left-dirty`, exit 1. The `--skip-worktree` variant stops the same way. |
| NS1: old green C-1 record (same run id) re-dated, with the current code | **Resolved**, stops `ratchet-broken` | `writer N-01: done`, then `writer N-02: ratchet-broken` naming `REQ-001`, exit 1 |
| NS2: completion written by hand over a red invariant | **Resolved**, stops `node-not-green` | `writer N-01: node-not-green`, problem `C-inv: node-not-green`, exit 1 |
| NS3: writer exits, leaving `SLOW=1 ubp check C-1` in the background | **Resolved**, no orphan | 3 of 3 runs: `attempts-exhausted`, and the check PID was gone each time |

## 2. Variations

| Variation | Result | Classification |
|---|---|---|
| `git update-index --skip-worktree` | Caught (`writer-left-dirty`); also covered by the new tests | Fixed |
| `.git/info/exclude`, or `core.excludesFile` in `.git/config` | Covered by the new tests | Fixed |
| `include`/`includeIf` added to `.git/config` | Caught by the config hash (inferred) | Fixed. Editing a file that an existing include already points to is in the stated ceiling. |
| Global or XDG excludes file (`~/.config/git/ignore`), global `core.fsmonitor` | Not compared (inferred from Git docs, not run) | Ceiling. The ceiling text names global config, but not the default excludes file Git reads without any config. |
| `core.excludesFile` in `.git/config.worktree`, in a repo that already has `extensions.worktreeConfig` | **Passes: exit 0** at `milestone-gate`, reviewer `accept`; a fresh clone fails C-1, C-2 and C-12 (tested) | Defect, but small. The file is inside the repository, so the current ceiling text does not cover it. Fix: add `'config.worktree'` to the settings list in `snapshot()` in `drive.cjs`; it fits on the same line. |
| Untracked `src/.gitignore` that ignores itself and the needed files | **Passes: exit 0**, `accept`, broken HEAD (tested) | Belongs to the ignored-files class (finding F1 below). Not stated in FORMATS. |
| **Committed** `src/.gitignore` with `ok-*`, writer uses `git add -A` | **Passes: exit 0**, `accept`, broken HEAD (tested) | Same class, and no bad intent needed: this is what an ordinary agent does when it gitignores a generated file the code imports. |
| Forged record equal to an old line except whitespace | No hole (by reading `additions()`) | Not a defect. Records are compared as parsed values, each old line used once. A whitespace-only copy carries the same values, so the engine reads nothing new. Any changed value counts as added and is re-run, and a second copy also counts as added. |
| Cleanup node: completion written by hand while a requirement is red | `writer CL: done` is accepted, then `stop checks-not-green`, exit 1 (tested) | Low-severity defect. Contract step 7 says it checks "what `node done` requires", but for a cleanup node `node done` also requires the closed milestones' requirements and its own milestone's requirements (those covered by done nodes) to be green (`completion.cjs`, cleanup branch). The run is stopped before exit 0. |

**F1, for the Owner.** The NB1 failure class is still open: a fix that exists only in the work tree, invisible to Git, while HEAD is broken and the drive still ends at exit 0 with a reviewer `accept`.
- The route is ignored files, and the committed-`.gitignore` case needs no bad intent.
- The manual milestone gate has the same blind spot: the reviewer "drives the product by hand" in the same work tree.
- In round 2 I listed ignored files as a ceiling, but FORMATS does not state it.
- Cheapest mitigation, with no engine lines:
  - FORMATS names the ceiling (ignored files and `config.worktree`).
  - `method/ultra.md` "Milestone gate" step 1 adds: run the journey check, or `ubp check --all`, on a fresh clone or `git worktree` of HEAD before the demo.
- Complete fix (later, needs line budget): run the gate's `check --all` in a temporary worktree of HEAD, as `merge.cjs` already does inline.

## 3. Method text: resolved

- `method/ultra.md:141-142`: the writer command tells the agent to call the engine as `eval "$UBP <args>"`, and explains that a login shell can put another `ubp` first on PATH. FORMATS adds "prefer it".
- The `history-rewritten` entry now reads: find the pre-attempt HEAD in `git reflog`, check that nothing after it needs keeping, and reset the branch to it. That is correct.
- Minor: the drive still does not report the pre-attempt HEAD, so the controller has to identify it from the reflog.
- The `writer-left-dirty` entry now also says to clear the index flags and undo changes to `config` and `info/exclude`.

## 4. Existing behavior: resolved

- **Checks are still killed at once.** With `graceMs = 0` the new exit-handler branch is skipped and `kill(); finish()` runs as before. The added `clearTimeout(timer)` is harmless. P1's "background children never outlive their check" is among the passing tests.
- **The probe matches `killGroup`.** The natural-exit probe `process.kill(-pid, 0)` tolerates ESRCH and EPERM, the same as `killGroup` (the controller's one-line change).
- **Compaction preserves behavior.** In `checks.cjs`, `readTail` is equivalent, and the new `selectedChecks` condition (`opts.selector !== 'req' || c.covers.includes(opts.req)`) is equivalent to the old ternary. In `drive.cjs`, `additions()` keeps the same comparison the completions used before.
- **The shim is rewritten before every run** (inside `shell()`); the new `shim` test covers it.
- **Suites:** P1–P5 + boundaries on the export gave `tests 295, pass 295, fail 0`. `wc -l engine/*.cjs` = 1983 and `split('\n')` = 2000, exactly the limit. No engine line is over 100 characters.

## What must be said to the Owner

- 第 2 轮要求修的四个复现都已按合同停下：
  - `assume-unchanged` 和 `skip-worktree` 停在 `writer-left-dirty`；
  - 复用旧记录伪造证据停在 `ratchet-broken`；
  - 手写完成记录绕过不变量停在 `node-not-green`；
  - 写手自己退出后不再留下检查进程（跑了 3 次）。
  - 引擎测试 295/295 通过，行数正好在 2000 的上限。
- 但同一类问题仍然存在：修复只在工作区、HEAD 是坏的，drive 照样以 exit 0 停在里程碑门、评审也写 accept。
  - 途径是被 Git 忽略的文件。最普通的写法就会触发：写手在提交的 `.gitignore` 里忽略了代码需要的文件，然后 `git add -A`。不需要恶意，已复现。
  - 手动流程有同样的盲区。
  - 合同目前没有把它写成上限。
- 建议第一次真实运行前做两件不占引擎行数的事：
  1. FORMATS 写明这个上限（被忽略的文件，以及 `.git/config.worktree`）；
  2. 方法的里程碑门第 1 步加一句：演示前在 HEAD 的干净检出（新 clone 或 `git worktree`）上跑一遍旅程检查或 `ubp check --all`。
  - 完整修法（门上的检查放到临时 worktree 里跑，合并门已经这么做）需要行数预算，由你决定以后是否放宽。
- 两个小缺口：
  - 仓库已开启按 worktree 配置时，写手可以用 `.git/config.worktree` 藏文件。修法是在设置列表里加一个词。
  - 清理节点的手写完成记录能通过 drive 的验证，最后会被 `checks-not-green` 拦下（exit 1）。合同那句"这就是 `node done` 的要求"对清理节点不成立。
- NS4（`claude -p` 的进程组）仍是已写明的上限。样本运行里没见到残留进程只是个例，不是验证。
- 以上 accept 是按协调者给的定义（四个复现都不再通过）。上面那类问题要不要在首次真实运行前处理，需要你来决定。

Verdict: accept
