# Runtime compatibility matrix

Ultra Builder Pro adapts one fourteen-Skill, five-hook contract to five native hosts.
This document records the differences that belong in adapters rather than shared
Skills.

## Installed surface

| Host | Managed plugin or bundle | Skills | Hook bridge |
|---|---|---:|---|
| Claude Code | `<config>/skills/ultra-builder-pro` | nested `skills/<name>` | direct Python commands in `hooks/hooks.json` |
| Codex | `<home>/plugins/ultra-builder-pro` plus personal marketplace entry | nested `skills/<name>` with `agents/openai.yaml` | `hooks/adapters/codex.py` |
| OpenCode | `<config>/.ultra-builder-pro` plus `<config>/plugins/ultra-builder-pro.js` | managed `<config>/skills/<name>` | native JS events call shared Python scripts |
| Kimi Code | `<config>/plugins/managed/ultra-builder-pro` plus `installed.json` | nested `skills/<name>` | `hooks/adapters/kimi.py` |
| Grok Build | `<GROK_HOME>/.ubp/plugin-sources/ultra-builder-pro` | nested `skills/<name>` | `hooks/adapters/grok.py` |

Every host receives the same eight owner workflows, five model disciplines, and one
router. Codex alone needs generated `agents/openai.yaml` files to express display data
and implicit-invocation policy; those are host metadata, not custom agents.

## Scope resolution

| Host | Global default | Local default | Environment override |
|---|---|---|---|
| Claude Code | `~/.claude` | `<cwd>/.claude` | `CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex` for config; `~/plugins` and `~/.agents` for sidecars | `<cwd>/.codex` plus home-scoped plugin surface | `CODEX_HOME` |
| OpenCode | `${XDG_CONFIG_HOME:-~/.config}/opencode` | `<cwd>/.opencode` | `OPENCODE_CONFIG_DIR` or `OPENCODE_CONFIG` |
| Kimi Code | `~/.kimi-code` | no project plugin scope | `KIMI_CODE_HOME` |
| Grok Build | `~/.grok` | no project plugin scope | `GROK_HOME` |

An explicit `--config-dir` wins over all defaults and becomes the home for any
host-owned sidecar as well. This rule makes isolated installation tests trustworthy.
With multiple selected runtimes, the CLI passes `<config-dir>/<runtime>` to each adapter
instead of merging incompatible host layouts.
Kimi and Grok currently expose user-scoped plugin installation only. `--local` rejects
them before mutating another host; an explicit `--config-dir` remains available for an
isolated user-scope installation test.

## Invocation policy

| Role | Owner can route directly | Model can select implicitly |
|---|---:|---:|
| eight user-invoked Skills | yes | no |
| five model-invoked Skills | no | yes |
| `ultra-status` router | yes | no |

Claude and Grok receive `user-invocable` / `disable-model-invocation` frontmatter.
Kimi receives its native equivalent. Codex receives
`policy.allow_implicit_invocation` in `agents/openai.yaml`. OpenCode uses portable
source frontmatter and native discovery, but its current Skill schema has no equivalent
owner/model routing bit: all fourteen Skills remain discoverable and their descriptions
guide model selection. Ultra does not add a semantic interception hook to imitate a
host feature OpenCode does not expose.

## Hook compatibility

| Hook | Claude | Codex | OpenCode | Kimi | Grok |
|---|---:|---:|---:|---:|---:|
| session context | yes | normalized | native bridge | normalized to message | executed; host stdout limits apply |
| mid-workflow recall | yes | handles `apply_patch` | native bridge | normalized | executed |
| compact context | pre/start | pre/post | native compact event | pre/post | pre-compact |
| post-edit observation | Write/Edit | Write/Edit/`apply_patch` | write/edit/patch | Write/Edit | Write/Edit/patch |
| dangerous command guard | Bash advisory/deny | Bash advisory/deny | bash advisory/deny | Bash advisory/deny | Bash allow/deny mapping |

All hooks share the same `.ultra/` idle guard. Wire adapters normalize payload and
output fields only; they do not change semantic policy. Codex installation health and
hook activation are distinct: Codex skips newly installed non-managed plugin hooks
until the user reviews and trusts the current definition, so Doctor reports
`hook_activation: user_review_required` without pretending the hook already ran.

## Delegation argv

`adapters/_shared/host-profile.cjs` records current non-interactive invocation for:

- Claude print mode with structured output and an explicit file-tool allowlist; read-only
  uses `plan`, while bounded write uses `acceptEdits` without Bash or web tools;
- Codex ephemeral `exec` with user config ignored, project rules preserved, native
  `read-only` or `workspace-write`, network disabled, and an output schema;
- OpenCode `run --auto` only after an inline config explicitly denies Bash, web,
  subagents, external directories, Skills and undeclared edit roots;
- Kimi prompt mode with a launch-only read or write agent profile that exposes only
  file tools and no Bash, web, MCP, Skills or subagents;
- Grok single-turn mode with `read-only` or `workspace` OS sandbox, structured output,
  no memory, web search or subagents.

The launcher accepts no external-effect authority. It binds instruction, permission and
output-schema digests, a clean Git worktree, allowed write roots, actual changed paths,
strict result schema, timeout and cancellation. Empty roots select read-only mode. The
model returns structured output and never authors the receipt. Host-native permissions
are the execution boundary; the primary host still inspects and integrates the isolated
diff.

## Lifecycle verification

Each adapter must pass isolated install, doctor, reinstall, and uninstall tests. Real
global doctor additionally asks the native host where supported, but never repairs or
installs. Codex still performs native registration under `--config-dir`; its host process
inherits the same isolated `HOME` and `CODEX_HOME`. Grok native registration is skipped
only in explicit isolated test mode. Lifecycle tests also require the isolated config
and fake HOME to contain zero children after uninstall, while separate ownership tests
prove that pre-existing empty Codex and Kimi registries survive.

## Authenticated cross-host continuation evidence

On 2026-08-03, one deliberately narrow task was run in an isolated Git repository to
test the product's central recovery claim with real authenticated models. This was a
continuation drill, not a full project workflow or a delegation receipt test.

Both hosts used globally installed artifacts from the same clean source candidate:

- source commit: `c473a248bde2afce77591f2ba382246d420b5c72`;
- worktree digest: `e83bdcbe2905cf02cb06cb0219127f6ce0400484331a6e9fc95622bbe24b44bd`;
- Doctor: Claude healthy with 83 assets and zero issues; Codex healthy with 99 assets
  and zero issues, with optional hooks still `user_review_required`.

The seed repository had one passing smoke test, one pending task, one mapped Change
acceptance ID, and seed HEAD `cf27d62aeeae353e0650413de6d9a118b89a0406`.

| Phase | Execution boundary | Observed result |
|---|---|---|
| Claude | One print-mode call, `acceptEdits`, no persistent session, empty MCP config, explicit file and local-test tools, USD 1.00 cap | Exit 0 at USD 0.741367 with zero web requests. It changed only the task ledger/context, added `test/slug.test.cjs`, and allowed the hook to write disposable progress. `src/slug.cjs` and completion evidence remained untouched. The task test exited 1 with actual `hello,-world!` versus expected `hello-world`; both task surfaces read `in_progress`, and the Resume Note named the exact next action. |
| Codex | One ephemeral `workspace-write` call with sandbox network disabled and no conversation from Claude | Exit 0. It found and read the installed `ultra-dev` Skill, recovered the single task from Git and `.ultra/`, reproduced the same red, changed only the intended implementation, then passed the task test 1/1 and `npm test` 2/2. It wrote the three-command canonical evidence record and logs, completed both task status surfaces, and filled Completion and the final Resume Note. |
| Independent check | Local commands after both model calls | `node --test test/slug.test.cjs` passed 1/1, `npm test` passed 2/2, `git diff --check` passed, and a structural check confirmed one completed task, six evidence dimensions, three existing command-log references, and matching ledger/context state. |

The Codex process emitted non-blocking diagnostics for an older local model-cache
schema and an unauthenticated user-config MCP startup. No MCP result was consumed and
no external effect occurred; all task actions used local file and shell tools. This
means the drill proves file-backed Claude-to-Codex continuation even while Codex hooks
remain untrusted, but it does not claim that arbitrary user configuration starts
without unrelated host diagnostics.

The result establishes one real end-to-end example of cross-host resume without a
shared conversation, database, MCP authority, daemon, or generated prompt projection.
It does not establish output quality for every model, host, repository, or task shape.
Task-level `ultra-review` and commits were intentionally excluded from the drill so the
two host calls tested only the handoff boundary.

Two older `.ultra` evidence snapshots originally named the completed WIP by its former
path. The current-path artifact contract requires every reference to resolve in the
checkout, so those two references now point here while their 2026-08-01 status and
limitations remain explicitly historical. The original WIP is still recoverable from
their pinned source commit `3f99189bc68697262cd90444685ac2d4857139c4` with
`git show`; the live `docs/wip/` directory contains no unfinished document.
