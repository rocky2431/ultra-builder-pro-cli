Reviewer: Claude (Opus 5.5), independent reviewer subagent; did not write this change

# Review: UBP v6.0.0 packaging (`v6-p5-pkg`, base `cd6828b`, uncommitted)

I didn't modify anything in the workspace. My experiments ran in `/tmp/ubp-review-0ZCCPS`, a copy of the workspace, using temporary `HOME`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. Every process I started was stopped by PID and the directory is deleted. At the end, `git status` showed the same 289 entries, `git diff --stat` matched the receipt's numbers plus the three files staged with `git add -N`, and all 7 protected hashes were OK.

What I ran: the changed suites in the copy (`tests/v6-package`, `install`, `v026-adapters`, `package-smoke` and `adapters/_shared/tests/*`) with a temporary npm cache: **59 tests, 59 pass, 0 fail**. I did not rerun the engine suites. `git diff cd6828b -- engine/ tests/engine-*` is empty, and the receipt reports 247/247.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `v6-package` passes and protects the decision; engine and its tests unchanged | **Met** | 10/10 inside the 59/59 run. `shasum -c` gives 7× OK. The engine diff against the base is empty. |
| 2 | Nothing still used was deleted; nothing 5.x that ships or runs remains; no test weakened | **Missed** | The deletions are correct. `npm pack` ships 34 paths with no 5.x content (checked by the test). The removed `run`/`delegate`/`slice` commands and the old host flags are gone. But `package-smoke` was weakened (B1), and `CONTEXT.md` is still entirely 5.x (S5). |
| 3 | Install, doctor and uninstall are safe | **Mostly met** | Verified by running it, with the fake Codex CLI and with the real `codex-cli 0.165.0`. Install, doctor and uninstall stay inside `--config-dir`, and HOME stays empty. A failed Claude install keeps the user's file and leaves no staging directory. Removed flags and commands exit 1 and write nothing. The hook exits 0 in every probe and left the project tree byte-identical, `.git` included. Gaps: the real Codex CLI leaves an empty `tmp/arg0-macos` (N1); `--codex --local` writes into HOME (S6). |
| 4 | Skill can be found and called; README and CHANGELOG match the name for both hosts; Codex wired the same way | **Partly** | **Claude Code:** I verified offline that `/ultra` resolves to `/ultra-builder-pro:ultra`, and the hook output reaches the session, so the README is right for Claude. **Codex:** `codex debug prompt-input` lists `ultra-builder-pro:ultra`, so the README's `$ultra-builder-pro:ultra` matches. But the CHANGELOG says nothing about how to invoke it (S1), and I could not observe the Codex hook firing (S2). |
| 5 | Documentation accurate; method text unchanged except the `ubp` paragraph | **Partly** | The rename diff is one hunk: frontmatter plus line 11, so the method text is unchanged. README, README.zh-CN, CLAUDE.md, AGENTS.md and PLUGIN-ISOLATION-CONTRACT are mostly accurate. Wrong or stale: the relative `engine/FORMATS.md` reference (S3), `CONTEXT.md` (S5), the `--local` help line (S6), and the 5.x wording in both plugin manifests (S7). |

## Blockers

**B1. `tests/package-smoke.test.cjs:63-67`: the tarball smoke test was weakened.**
- `npm install <tarball>` into a consumer project was replaced by `tar -xzf` plus a symlink to the repository's own `node_modules`.
- The test no longer proves that the published package installs and runs with only its declared `dependencies`. A module present in the repo's `node_modules` but missing from `dependencies` (a dev dependency, or something hoisted) would now pass and then break for users.
- This fits neither allowed reason for changing a test (old asset list, host list or version). The mission's "do not install anything" meant the workspace's `node_modules`. The test's consumer install happens in a temporary directory.
- The final `verify:release` ran with network access (`release-network.log`), so the original test would have worked.
- **Fix:** restore the base lines (`npm install tarball --ignore-scripts --no-audit --no-fund`, with `packageRoot = consumer/node_modules/ultra-builder-pro-cli`). If the sandbox `EPERM` returns, set a temporary `npm_config_cache`.

## Should fix

**S1. `CHANGELOG.md`, 6.0.0 entry: no invocation instructions (criterion 4).**
- Add one line: Claude Code uses `/ultra` (full name `/ultra-builder-pro:ultra`); Codex uses `$ultra-builder-pro:ultra`.
- I verified both names offline. Claude transcript: `/ultra` produced `<command-name>/ultra-builder-pro:ultra</command-name>`, while an unknown command produced `unknown_command_fallback`. Codex: the skill listing in `prompt-input`.

**S2. Codex hook delivery is unproven.**
- In an isolated `CODEX_HOME`, the plugin shows as `installed: true, enabled: true` and the Skill is listed.
- An offline `codex exec` session (fake local provider) produced no hook output and no hook log lines. A user-level control hook in that run did not fire either, so the probe tells us nothing either way.
- The Codex binary contains plugin-hook trust logic (`failed to trust materialized plugin hooks`, `hooks.state."…".trusted_hash`, `plugin.json#hooks[`). Our `.codex-plugin/plugin.json` has no `hooks` field (same as 5.x).
- **Cheapest check that tells the causes apart:** start an interactive Codex session with a temporary `CODEX_HOME` inside a v6 project.
  - If it offers to review or trust the plugin hook and then shows the status line, the wiring is fine. Then the README should say Codex asks you to trust the hook first.
  - If it never offers the hook, add `"hooks": "./hooks/hooks.json"` to the manifest and test again.

**S3. `skills/ultra/SKILL.md:12`: the installed Skill points to `engine/FORMATS.md` as a relative path.**
- That path does not resolve from the user's project, or from the skill's own directory. The file actually lives at `<plugin>/engine/FORMATS.md`.
- **Fix:** have the installer replace it with an absolute path, the same way it does for the CLI. This is the one paragraph the method allows to change.

**S4. `skills/ultra/SKILL.md:11`: the Skill prefers whatever `ubp` is on PATH over its own engine copy.**
- Neither 5.0.2 nor `main` has a `status` command: `git show main:bin/install.js` dispatches only `run`. If 5.x is installed globally with npm, `ubp status` exits with "unexpected positional argument". The README's "coming from 5.x" section invites exactly that setup.
- More generally, the `ubp` on PATH can be a different version from the plugin's copy.
- **Fix:** always call `node '<abs>/engine/cli.cjs'`, or use PATH `ubp` only when `ubp --version` matches the plugin's version.

**S5. `CONTEXT.md`: the whole glossary is 5.x.**
- It describes `ultra-init`, `ultra-research`, North Star, the `ultra-status` router, ACP Delegate and Worker Packet as current terms.
- That contradicts the decision ("everything 5.x-only leaves the branch") and the new guides.
- **Fix:** delete it, or rewrite it in v6 terms: spec, checks, plan, node, milestone, ruling, ledger.

**S6. `bin/install.js:68`: the help says `-l, --local` gives project scope for "Claude Code and Codex". That is false for Codex.**
- I verified that `ubp --codex --local` writes the plugin to `~/plugins/ultra-builder-pro` and the marketplace entry to `~/.agents/plugins/marketplace.json`. It leaves an empty `.codex/` in the project and registers nothing.
- The same happens with plain `ubp --codex`, because the default scope is local (`bin/install.js:166`).
- The underlying behaviour predates this change (`adapters/codex.js:37-39`), but this change rewrote the help line.
- **Fix:** make `--codex --local` without `--config-dir` a usage error, or change the help to "Claude Code only". The README sentence "Codex plugin registration uses its host CLI" should say plainly that Codex installs are user-scope only.

**S7. Plugin manifests still use 5.x wording.**
- `adapters/claude.js:66`: "File-first … workflows".
- `adapters/codex.js:141,150-151`: "Resume … across … coding-agent hosts through portable Skills". This text is shown in the Codex plugin UI.
- **Fix:** replace both with one-line v6 descriptions.

## Nits

- **N1.** After the real Codex CLI runs, uninstall leaves an empty `tmp/arg0-macos` in a fresh config directory. The cleanup list (`adapters/codex.js:79`) only knows `tmp/arg0`. Older behaviour, but verified with 0.165.0.
- **N2.** `hooks/session-start.cjs:11-12` reads stdin until it closes, with no timeout of its own. Holding stdin open for 3 s delayed the hook by 3 s. The host's 10 s timeout caps this; in the real Claude session the hook took 200 ms.
- **N3.** `hooks/session-start.cjs:18` checks only `<cwd>/.ultra/spec.md`, so a session started in a subdirectory gets no status line (verified). It could use `CLAUDE_PROJECT_DIR` or the git top-level instead.
- **N4.** Malformed hook input JSON silently suppresses the status line, even in a v6 project. It could fall back to `process.cwd()`.
- **N5.** The Codex `openai.yaml` `short_description` is cut mid-word: "…from status and the init". The cause is the 64-character slice at `adapters/_shared/plugin-core.cjs:42`.
- **N6.** Stale references:
  - `.gitattributes:1`: deleted `ultra-delegate` patches.
  - `.gitignore:95-99,126-127`: `.ultra-template`.
  - `.npmignore`: `hooks/tests` lines.
  - `adapters/_shared/tests/resolve-target.test.cjs:44,51,58`: `OPENCODE_CONFIG`.
- **N7.** `adapters/claude.js:44`: the `pluginRoot` parameter is never used (the call at `:59` passes nothing).
- **N8.** `CHANGELOG.md`: the 6.0.0 section sits above the file's preamble ("All notable changes…"); move it below.
- **N9.** `CLAUDE.md` now says "omit AI co-author trailers". Before, only `AGENTS.md` said that, so this is a policy change for Claude in this repository.
- **N10.** The tests run `npm pack` against the real `~/.npm` cache and logs, which caused the `EPERM` in the receipt. Setting `npm_config_cache` to a temporary directory inside the tests would make them independent of HOME.

## What must be said to the Owner

- 包装基本到位：只装 Claude Code 和 Codex，一个 `ultra` Skill、一份引擎副本、一个 Node 写的 SessionStart hook；5.x 的部分已经不再打包。我在临时目录里实测：安装、doctor、卸载都只写进指定的配置目录，hook 不写任何文件，引擎和受保护的测试没有改动。
- 有一个测试被削弱了：`package-smoke` 原来会真的 `npm install` 打包出的 tarball，现在改成解压后借用仓库自己的 `node_modules`。这样即使漏声明了依赖，测试也能通过。验收标准明令禁止削弱测试，必须恢复。
- Claude Code 这边：我离线验证了 `/ultra` 会解析到 `ultra-builder-pro:ultra`，hook 打出的状态行也进了会话。Codex 这边：Skill 能被发现，但没能观察到 hook 真正触发。Codex 的插件 hook 需要你确认信任；manifest 里也没有声明 `hooks`。需要你在隔离目录里开一次交互式 Codex 会话，看它会不会请你信任这个 hook，信任之后是否显示状态行。
- 两个会影响实际使用的问题：
  - 已安装的 Skill 优先调用 PATH 上的 `ubp`。如果你按 README 建议把 5.0.2 留着、又是用 npm 全局装的，PATH 上的就是 5.0.2，而 5.0.2 没有 `ubp status` 命令，会直接报错。
  - `ubp --codex`（不加 `--global`）会把插件写进你的用户目录、却不在 Codex 里注册，帮助文字却说它是"项目级"安装。
- 产品形态本身是助手代你做的决定（`.ultra/decisions/2026-11-01-v6-product-shape.md`），你还没确认过。另外 `CONTEXT.md` 仍是整份 5.x 词汇表，`docs/wip/` 里也还有 5.x 材料（这次任务明确不让动）。

Verdict: revise
