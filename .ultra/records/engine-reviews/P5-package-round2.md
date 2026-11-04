Reviewer: Claude (Opus 5.5), independent reviewer subagent; did not write this change (round 2, final)

# Review round 2: UBP v6.0.0 packaging (`v6-p5-pkg`, base `cd6828b`, uncommitted)

All 18 round-1 items are fixed (two of the nits only partly), and none of the new problems blocks acceptance. Two small things still need doing when the change is committed: stage the new hook test file, and fix one stale CHANGELOG section.

I edited nothing in the workspace. My experiments ran in a copy under `$TMPDIR`, with temporary `HOME`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. That copy is deleted, and no processes from the review are left running. Afterwards the workspace status had the same 30 non-deleted entries and all 7 protected hashes were OK.

What I ran:
- **Changed suites in the copy:** `v6-package`, `session-start`, `install`, `v026-adapters`, `package-smoke` and `adapters/_shared/*`, with a temporary npm cache. Result: **66 tests, 66 pass, 0 fail**.
- **Engine:** I did not rerun the engine suites. `git diff cd6828b -- engine/ tests/engine-*` is empty, and the main session reports `verify:release` 313/313.
- **Codex docs:** I read https://learn.chatgpt.com/docs/hooks. It confirms that Codex loads `hooks/hooks.json` from the plugin root by default. Plugin hooks are skipped until trusted in `/hooks`, and trust is tied to the hook's current hash. `--dangerously-bypass-hook-trust` applies to one run only. Plain stdout from a SessionStart hook becomes developer context, and `timeout` is in seconds.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `v6-package` passes; engine and its tests unchanged | **Met** | 10/10 inside the 66/66 run. 7/7 hashes OK. The engine diff is empty. |
| 2 | Nothing in use was deleted; nothing 5.x remains; no test weakened | **Met** | The tarball smoke test is back to a real `npm install` (B1). `CONTEXT.md` is deleted, and nothing outside excluded paths still refers to it. A search of all tracked and untracked files (excluding `docs/wip`, `thinking`, `work`, `.ultra`, CHANGELOG) finds no OpenCode, Kimi, Grok, ZCode, `.ultra-template` or Python references. The assertions removed from `v026-adapters` belong only to the OpenCode, ZCode and Kimi branches. |
| 3 | Install, doctor and uninstall are safe | **Met** | All checked by running them. `--codex --local` in any combination exits 1, prints nothing to stdout and writes nothing to HOME or cwd. A real Codex 0.165.0 install, doctor (`healthy`) and uninstall leaves no residue. The hook exits 0 in all 9 probes and left the project byte-identical, `.git` included. |
| 4 | Skill discoverable; README and CHANGELOG match; Codex wired the same way | **Met** | Both READMEs and the CHANGELOG give `/ultra`, `/ultra-builder-pro:ultra` and `$ultra-builder-pro:ultra`. I reproduced the writer's Codex observation myself: the recorded request contains the hook output as its own developer message, and the Skill appears in the skill list. |
| 5 | Docs accurate; method text unchanged except the `ubp` paragraph | **Met, one stale section** | The rename diff is one hunk: frontmatter plus the 3-line paragraph. The READMEs, CLAUDE.md, AGENTS.md and the contract are accurate. The leftover 5.x `[Unreleased]` section in CHANGELOG contradicts 6.0.0 (new finding R2-2). |

## Round-1 items

| Item | Status | Evidence |
|---|---|---|
| B1 tarball smoke test | **Resolved** | `tests/package-smoke.test.cjs:64-68` matches the base apart from the cache variable. I reproduced it by hand: `npm pack`, then `npm install <tgz>` into a consumer project. `node_modules/ultra-builder-pro-cli` is a real directory, not a symlink; the lockfile entry is `resolved: file:…/ultra-builder-pro-cli-6.0.0.tgz`; js-yaml and argparse were fetched into a fresh cache; `--version` prints v6.0.0. |
| S1 invocation | **Resolved** | `README.md:31-32`, `README.zh-CN.md`, `CHANGELOG.md:10-11`. |
| S2 Codex hook | **Resolved, with a stated limit** | I copied `observe.cjs` to a temp directory, installed the plugin, and ran it myself: `requestCount 1`, `statusDelivered true`, `skillReminderDelivered true`. The receipt's claims match what I saw. **The limit:** delivery is proven only with the one-run trust bypass. Persistent trust through `/hooks` was not tested, and the README documents that step. |
| S3 + S4 engine path | **Resolved** | The source keeps the placeholders (`skills/ultra/SKILL.md:11-13`). After installing from the tarball into a config directory whose path contains both a space and a `'`, the Skill reads `` `ubp` always means `node '…/cfg claude'\''s/…/engine/cli.cjs'` ``. That command, run through `sh`, printed the M1 status line. The FORMATS path is absolute and the file exists. The Codex source copy and Codex's cached copy both point at the plugin's own engine. No placeholder is left over. |
| S5 CONTEXT.md | **Resolved** | Deleted; it is in `pkg-r2-deleted.txt`, and no live reference remains. |
| S6 Codex scope | **Resolved** | `bin/install.js:164-167` and `:198-200`. Help line 68 says "Claude Code only". With `--config-dir`, `--codex --local` is still allowed, installs, and uninstalls cleanly. |
| S7 manifests | **Resolved** | Claude: "UBP v6 method, engine and session status line for Claude Code." Codex manifest updated to match. |
| N1 `tmp/arg0-macos` | **Resolved** | Real Codex install and uninstall: residue `[]`. |
| N2 1-second stdin limit | **Resolved** | Measured exit times: stdin held open 1196 ms, partial JSON never closed 1207 ms, input arriving after 1.5 s 1201 ms. All exit 0 and fall back to the process cwd. |
| N3 walk-up | **Resolved** | With JSON `cwd` set to `project/src/deep` and the process cwd at `/`, it prints the status. The nearest nested project wins (covered by a test). |
| N4 malformed input | **Resolved** | `{oops`: falls back to the process cwd and prints. Closed stdin (`<&-`): prints. A nonexistent `cwd`, and a directory outside any project: silent, exit 0. |
| N5 short description | **Partly** | The cut now falls on a word boundary, but it reads "…from status and the". Cosmetic only. |
| N6 stale references | **Resolved** | `.gitattributes`, `.gitignore`, `.npmignore` and `OPENCODE_CONFIG` cleaned. |
| N7 unused parameter | **Resolved** | `adapters/claude.js:44`; `copyHooks` also dropped the unused `runtime`. |
| N8 CHANGELOG order | **Resolved** | The preamble now comes first. See R2-2 for what follows the 6.0.0 entry. |
| N9 trailer line | **Resolved** | Removed from `CLAUDE.md`. `AGENTS.md` keeps it, as it did at the base. |
| N10 npm cache in tests | **Partly** | `package-smoke` uses its own cache. The protected `v6-package` test still runs `npm pack --dry-run` with the default cache in `~/.npm`. The writer is not allowed to change that file. |

## New findings (none blocking)

**R2-1. `tests/session-start.test.cjs` is untracked (`??`).**
- The other new files were registered with `git add -N`; this one was not.
- If the commit uses `git add -u` or `commit -a`, the 6 hook regression tests (stdin limit, walk-up, malformed input, no writes) will be left out.
- **Fix:** stage this file explicitly in the packaging commit.

**R2-2. `CHANGELOG.md:24-30`: the 5.x `[Unreleased]` section now sits below `## 6.0.0` and contradicts it.**
- It says "the source package declares `5.0.2`" and lists Pi delegation, durable checkpoints and the goal entry as Added. 6.0.0 removes all of these.
- **Fix:** rename it, for example to "5.0.2 (source only, never published)", or merge it into the history. If an `[Unreleased]` heading is kept, it belongs above 6.0.0.

**R2-3 (nit). The walk-up does not stop at the enclosing Git repository's root.**
- A non-v6 repository nested inside a v6 project prints the outer project's status line.
- This is what the mission asked for; it is noted only so it is a known behaviour.

**R2-4 (nit). The open-stdin test allows 2500 ms (`tests/session-start.test.cjs:89-93`).**
- It took 1.2 s by hand and 1.7 s inside the suite. A slow CI runner could make it flaky.

**R2-5 (nit). Without a scope flag, `ubp --all` now installs Claude Code in the project (`./.claude`) and Codex at user scope (`bin/install.js:166`).**
- The output prints both scopes, and the README always shows `--global`.
- I inferred this from the code and did not run it.

**R2-6 (nit, evidence accuracy). The S2 probe is not fully offline.**
- During the run, Codex starts its own `git fetch` of `github.com/openai/plugins.git` (its curated plugin sync). The fetch kept running after `codex exec` exited; I stopped it by PID 83010.
- "No paid model request" is true; "network-silent" would not be.

## What must be said to the Owner

- 第一轮提出的全部问题都已修复，其中两个小问题只修了一部分：Codex 列表里的简短描述读起来像半句话；受保护的 `v6-package` 测试仍然用默认的 npm 缓存，写手无权改这个文件。全部经我独立复现：
  - 打包冒烟测试恢复为真正用 `npm install` 安装 tarball。
  - Skill 写的是插件自带引擎的绝对路径，路径里有空格、有引号也能用，不会再用 PATH 上的 5.0.2。
  - `--codex --local` 会被拒绝，而且什么都不写。
  - hook 最多等 stdin 1 秒，会向上查找项目，坏输入时退回进程目录，从不写文件。
- Codex 的 hook 送达已被证实：在隔离环境中用本地假模型记录请求，状态行确实作为 developer 消息到达了模型。但这次证明用的是一次性绕过信任的参数；你实际使用时，要先在 Codex 里用 `/hooks` 信任这个 hook 一次，否则 Codex 会跳过它。README 已写明这一点；此前 Skill 第一步的 `ubp status` 照样能显示进度。
- 提交时需要做两件小事：
  - 显式暂存新的 hook 测试文件 `tests/session-start.test.cjs`（目前未被 Git 跟踪）。
  - 把 CHANGELOG 里 6.0.0 下面那段 5.x 时期的 `[Unreleased]` 改名或并入历史，它现在和 6.0.0 的说法互相矛盾。
- v6 产品形态（只保留一个 Skill、删掉 5.x 全部 Skill 和其他宿主）仍是助手代你做的决定（`.ultra/decisions/2026-11-01-v6-product-shape.md`），等你验收。

Verdict: accept
