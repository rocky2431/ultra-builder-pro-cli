# 发布门（M-P5）

发布门跑了两轮。第 1 轮在 `5abe32d`，门评审第 1 轮指出了几处缺口：没有 Node 22，没有用 v6 自己的锁文件安装，没有在 HEAD 上跑 Skill 校验，检出位置在 v6 目录树里面。修好以后（`d444ac4`）在 `e61f668` 上重跑，就是本页记的第 2 轮。门评审第 2 轮之后又修了 N1（`0c26778`，只改 Skill 文字和一条包测试），在 `0a49d73` 上跑了第 3 次，见本页末尾。

- 脚本：`.ultra/.runtime/v6/p5-work/release-gate-2.sh`（全文在本页末尾）。
- 原始输出：`.ultra/.runtime/v6/p5/r2-*.log` 和 `r2-pack.json`。这两处都在被 Git 忽略的工作目录里。
- 下面的行都从原始输出原样摘出，只有隔离目录的绝对路径换成了 `<iso>`。

## 环境

- 检出位置：v6 目录树之外，`$TMPDIR/ubp-v6-gate.*/src`（`git worktree add --detach … HEAD`），这样不会从上层目录找到 `node_modules`。
- HEAD：`e61f66894e418452ddbd0257710ae624e818b6c7`，`git status --short` 为空。
- Node v25.7.0，npm 11.10.1；另有 Node v22.21.0。
- 依赖：`npm ci`，用的是 v6 自己的 `package-lock.json`。结果是 `found 0 vulnerabilities`，`exit=0`。

## `npm run verify:release`（Node 25.7.0）

```
ℹ tests 362
ℹ suites 0
ℹ pass 362
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 346736.248958
found 0 vulnerabilities
exit=0
```

## 全套测试，Node 22.21.0（`engines` 是 `>=22`，CI 只用 22）

第 1 次是默认并发：本机 16 核，约 15 个测试文件同时跑。命令 `npm run test:node`，日志 `r2-node22.log`。

```
not ok 35 - code fingerprints preserve significant whitespace in Git tree entries
not ok 36 - expect and full logs preserve UTF-8 characters split across output chunks
not ok 37 - shell exit kills descendants holding pipes and returns promptly
not ok 38 - unrelated check fields cannot hide unknown requirement references
not ok 205 - a reviewer past --timeout-sec is stopped and its missing review is invalid
not ok 251 - SessionStart stops reading an open stdin within one second
# tests 362
# pass 356
# fail 6
# duration_ms 3076505.556375
exit=1
```

6 条失败都是墙钟时间断言：`spawnSync` 超时、5000 ms 上限、超时后杀进程、1 秒内停止读 stdin。按测试名把这次和 Node 25 那次逐条配对（268 条），Node 22 的耗时是 Node 25 的 0.2 到 31.5 倍，中位数约 14 倍。

失败的文件在 Node 22 上单独重跑（`r2-node22-rerun.log`），全部通过：

```
### v22.21.0
tests/engine-boundaries.test.cjs exit=0 ℹ pass 6 ℹ fail 0 ℹ duration_ms 6215.492959
tests/session-start.test.cjs exit=0 ℹ pass 6 ℹ fail 0 ℹ duration_ms 6500.73
engine-p5 reviewer-timeout exit=0 ℹ pass 1 ℹ fail 0 ℹ duration_ms 42647.378792
### v25.7.0
tests/engine-boundaries.test.cjs exit=0 ℹ pass 6 ℹ fail 0 ℹ duration_ms 2363.503417
tests/session-start.test.cjs exit=0 ℹ pass 6 ℹ fail 0 ℹ duration_ms 3461.43
engine-p5 reviewer-timeout exit=0 ℹ pass 1 ℹ fail 0 ℹ duration_ms 16834.89775
```

按 CI 的并发重跑（`--test-concurrency=3`，在 v6 工作树里，日志 `r2-node22-c3.log`）。开始时负载 7.06，结束时 7.54（几个日志里记到的负载在 4.8 到 11.4 之间），负载来自不相关的进程：

```
not ok 180 - a check that times out after the merge blocks it
not ok 205 - a reviewer past --timeout-sec is stopped and its missing review is invalid
not ok 251 - SessionStart stops reading an open stdin within one second
# tests 362
# pass 359
# fail 3
# duration_ms 2222540.91125
exit=1
```

- 180：检查限 1 秒超时，只有“slow C-2”那个提交应该超时。负载高时前一个提交的检查也超过了 1 秒，二分查找就报了前一个提交。
- 205：`--timeout-sec 5` 同时限住测试里的假写者。假写者超过 5 秒，尝试次数用完，drive 停在 `attempts-exhausted`，而测试期望的是 `review-invalid`。
- 251：要求 1 秒内停止读 stdin。

三条在 Node 22 上单独重跑（`r2-node22-c3-rerun.log`，负载约 6.4），每次正好跑 1 条，都通过：

```
tests/engine-p4.test.cjs exit=0 # tests 1 # pass 1 # fail 0 # skipped 0 # duration_ms 11686.791917
tests/engine-p5.test.cjs exit=0 # tests 1 # pass 1 # fail 0 # skipped 0 # duration_ms 31241.593
tests/session-start.test.cjs exit=0 # tests 1 # pass 1 # fail 0 # skipped 0 # duration_ms 1784.60475
```

结论：在 Node 22 下行为没有问题。套件里的墙钟时间断言在机器负载高时会失败；没有放宽任何断言，记为上限 14（`.ultra/records/deviations.md`）。

## `npm pack --dry-run --json`

`ultra-builder-pro-cli@6.0.0`，37 个文件，打包 111913 字节，解开 353259 字节，`exit=0`。比第 1 轮多出的两个文件是 drive 示例。包里没有 `.py`。

```
CHANGELOG.md
LICENSE
README.md
README.zh-CN.md
adapters/_shared/file-ops.cjs
adapters/_shared/frontmatter.cjs
adapters/_shared/plugin-core.cjs
adapters/_shared/provenance.cjs
adapters/_shared/runtime-assets.cjs
adapters/_shared/validate.cjs
adapters/claude.js
adapters/codex.js
bin/install.js
docs/examples/drive/claude-reviewer.sh
docs/examples/drive/claude-writer.sh
docs/PLUGIN-ISOLATION-CONTRACT.md
engine/checks.cjs
engine/cli.cjs
engine/completion.cjs
engine/context.cjs
engine/drive.cjs
engine/expect-worker.cjs
engine/expect.cjs
engine/formats.cjs
engine/FORMATS.md
engine/git-state.cjs
engine/ledger.cjs
engine/loading.cjs
engine/merge.cjs
engine/milestone.cjs
engine/plan.cjs
engine/project.cjs
engine/signals.cjs
engine/states.cjs
hooks/session-start.cjs
package.json
skills/ultra/SKILL.md
```

## 隔离安装、`--all --global --doctor --json`、卸载

三条命令依次是：`HOME=<iso>/home node bin/install.js --all --global --config-dir <iso>/cfg`，再加 `--doctor --json` 跑一次，再加 `--uninstall` 跑一次。真实的 `~/.claude` 和 `~/.codex` 都没有动。

- install：exit 0；doctor：exit 0；uninstall：exit 0
- doctor 总状态：`healthy`
  - `claude`：`healthy`
    - 来源 `e61f66894e418452ddbd0257710ae624e818b6c7`，`dirty: false`
    - 检查项：manifest=pass, assets=pass, contracts=pass, skill_inventory=pass, hook_inventory=pass, plugin_manifest=pass
    - issues：[]
  - `codex`：`healthy`
    - 来源同上，`dirty: false`
    - 检查项：manifest=pass, assets=pass, contracts=pass, skill_inventory=pass, hook_inventory=pass, plugin_manifest=pass, marketplace=pass, host_plugin=pass, hook_activation=host_managed
    - issues：[]
- 卸载后 `<iso>/cfg` 和 `<iso>/home` 下没有剩下任何条目。

## 里程碑门第 1 步：`check --all`

| 在哪里跑 | 结果 |
|---|---|
| v6 工作树（`r2-check-all.log`），然后提交它记下的证据（`e61f668`） | 7/7 pass，`exit=0` |
| 干净检出（`r2-clean-check-all.log`，`check --all --root <干净检出>`） | 7/7 pass，`exit=0`；之后 `git worktree remove` 返回 `removed=0` |

```
C-engine: pass (exit-0)
C-release: pass (exit-0)
C-engine-p2: pass (exit-0)
C-engine-p3: pass (exit-0)
C-engine-p4: pass (exit-0)
C-engine-p5: pass (exit-0)
C-package: pass (exit-0)
M-P5 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次
exit=0
```

## Skill 校验（仓库 CLAUDE.md 要求）

日志 `r2-skill-validate.log`。被校验的是 `git archive e61f668 skills/ultra` 解出的副本，`SKILL.md` 的 blob 是 `83c85c47fd0ab4230e405d700425560113dcecea`。

```
validator=/Users/rocky243/.codex/skills/.system/skill-creator/scripts/quick_validate.py
Skill is valid!
exit=0
validator=/Users/rocky243/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py
Skill is valid!
exit=0
```

Plugin Creator 在这台机器上只有脚手架脚本，没有校验器，所以 Codex 清单没有经过它的校验。Codex 一侧有 doctor 的 `plugin_manifest`、`marketplace`、`host_plugin` 三项，都是 pass。

## 没验证的

- CI 没有观察到：没有推送，GitHub Actions 没有跑过 v6。
- doctor 是从源码树装的，不是从 tarball 装的。从 tarball 安装由 `verify:release` 里的 `package-smoke` 覆盖。

## 脚本

```sh
#!/bin/sh
# M-P5 gate, round 2 (after the gate review's round-1 revise). Runs, in order and never in
# parallel (the engine's timing tests are load-sensitive):
#   1. `ubp check --all` in v6 and a commit of the evidence it records;
#   2. a clean checkout of HEAD outside the v6 tree (so no parent node_modules is found),
#      installed with `npm ci` from v6's own lockfile;
#   3. there: `npm run verify:release` (Node 25), the full suite under Node 22 (engines >=22,
#      CI uses 22), `npm pack --dry-run --json`, install / --doctor --json / --uninstall with
#      HOME and --config-dir in a fresh directory (never the real HOME), and the milestone
#      gate's step 1, `ubp check --all --root <clean checkout>`;
#   4. removal of the clean checkout.
set -u
V="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6"
L="$V/.ultra/.runtime/v6/p5"
NODE22="$HOME/.nvm/versions/node/v22.21.0/bin"
cd "$V" || exit 2
test "$(git rev-parse --show-toplevel)" = "$V" || exit 2

node bin/install.js check --all > "$L/r2-check-all.log" 2>&1
code=$?; echo "exit=$code" >> "$L/r2-check-all.log"
[ "$code" -eq 0 ] || { echo "stop: check --all failed"; exit 1; }
if ! git diff --quiet -- .ultra/ledger/evidence.jsonl; then
  git add .ultra/ledger/evidence.jsonl
  git commit -q -m "chore(ultra): record M-P5 evidence after the gate-review fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi

T=$(mktemp -d "${TMPDIR:-/tmp}/ubp-v6-gate.XXXXXX") || exit 2
C="$T/src"
git worktree add --detach "$C" HEAD > "$L/r2-worktree.log" 2>&1 || exit 2
cd "$C" || exit 2
{ echo "head=$(git rev-parse HEAD)"; echo "status:"; git status --short; node --version; npm --version
  echo "node22=$("$NODE22/node" --version)"; } > "$L/r2-env.log" 2>&1

npm ci > "$L/r2-npm-ci.log" 2>&1; echo "exit=$?" >> "$L/r2-npm-ci.log"
npm run verify:release > "$L/r2-verify.log" 2>&1; echo "exit=$?" >> "$L/r2-verify.log"
PATH="$NODE22:$PATH" sh -c 'node --version; npm run test:node' > "$L/r2-node22.log" 2>&1
echo "exit=$?" >> "$L/r2-node22.log"
npm pack --dry-run --json > "$L/r2-pack.json" 2> "$L/r2-pack.stderr.log"; echo "exit=$?" >> "$L/r2-pack.stderr.log"

ISO="$V/.ultra/.runtime/v6/p5-work/iso2-$(date +%Y%m%d%H%M%S)"
mkdir -p "$ISO/home" "$ISO/cfg"
{
  echo "iso=$ISO"
  echo "--- install"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg"; echo "exit=$?"
  echo "--- doctor"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg" --doctor --json; echo "exit=$?"
  echo "--- uninstall"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg" --uninstall; echo "exit=$?"
  echo "--- left after uninstall"
  find "$ISO/cfg" "$ISO/home" -mindepth 1 | sed "s#$ISO#<iso>#"
} > "$L/r2-doctor.log" 2>&1

node bin/install.js check --all --root "$C" > "$L/r2-clean-check-all.log" 2>&1
echo "exit=$?" >> "$L/r2-clean-check-all.log"

cd "$V" && git worktree remove --force "$C"; echo "removed=$?" >> "$L/r2-clean-check-all.log"
rmdir "$T" 2>/dev/null
echo done
```

第 1 轮（`5abe32d`）：`verify:release` 362/362，打包 35 个文件，隔离 doctor 两个宿主 healthy，在 v6 目录树里的干净检出上 7/7。原始输出是 `.ultra/.runtime/v6/p5/release-*.log` 和 `mp5-clean-checkout.log`，脚本是 `p5-work/release-gate.sh`。

## 第 3 次：N1 修复之后（`0a49d73`）

脚本 `records/acceptance/release-gate-3.sh`，原始输出 `.ultra/.runtime/v6/p5/r3-*`。顺序：先在 v6 工作树里跑 `check --all` 并提交证据（`0a49d73`），再在 v6 目录树之外建干净检出、`npm ci`，在那里跑 `check --all`、pack、隔离安装和 doctor、Skill 校验。Node 22 没有重跑（上限 14）。

| 项 | 结果 |
|---|---|
| v6 工作树 `check --all`（含 C-release，即 `verify:release`） | 7/7 pass，exit 0 |
| 干净检出 `npm ci` | 0 个漏洞，exit 0 |
| 干净检出 `check --all --root <干净检出>` | **6/7，exit 1**：`C-engine-p5` 失败，它的日志随临时检出一起删掉了，不知道是哪条测试 |
| 同一 HEAD 的新干净检出，单独 `ubp check C-engine-p5` | 40/40 pass，exit 0（`r3-clean-p5-rerun.log`、`r3-clean-p5-rerun.check.log`；负载 9.5 → 8.3） |
| `npm pack --dry-run --json` | 6.0.0，37 个文件，112031 / 353580 字节，不含 `.py` |
| 隔离安装 → `--doctor --json` → 卸载 | 三步 exit 0；两个宿主 `healthy`，来源 `0a49d73`，`dirty: true`；卸载后隔离目录为空 |
| Skill 校验（HEAD 的 `SKILL.md`，blob `852096372d38a1a7c8ea06fc002d2a88c9cd576f`） | 两个 Skill Creator 校验器都是 `Skill is valid!` |

- 干净检出那次的失败：同一 HEAD 的干净副本能过，所以不是缺了被忽略的文件（方法里这一步要找的东西）。推断是负载下的墙钟断言（上限 14），没有证实。7 条检查在干净检出上是分两次跑通的。
- `dirty: true`：这次在干净检出里先跑了 `check --all`，它往 `.ultra/ledger/evidence.jsonl` 写了证据行，之后才跑 doctor（推断；第 2 次 doctor 在前，是 `dirty: false`）。
- 脚本的缺陷：删临时检出之前没有把检查日志复制出来。重跑那次补上了。
