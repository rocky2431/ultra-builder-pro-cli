# Ultra Builder Pro 6

Intent is source code, the plan is compiled, progress is computed, and a change is a diff.

UBP gives Claude Code and Codex one `ultra` Skill, a deterministic `ubp` engine, and a
SessionStart hook. The model owns judgment; the engine computes progress from project files
and executable checks. Node.js 22 or newer and Git are required.

## Install

```sh
npm install -g ultra-builder-pro-cli@6.0.0
ubp --claude --global
ubp --codex --global
# Or install both:
ubp --all --global
```

Use `--config-dir <dir>` for an isolated installation; `--all` gives each host a separate
subdirectory. Only Claude Code supports `--local`. Codex installs are user-scope only:
`--codex` defaults to user scope; `--codex --local` is rejected unless `--config-dir` isolates the
install.
Inspect an installation with `ubp --all --global --doctor --json`. Remove managed assets
with `ubp --all --global --uninstall`.

Each installed plugin carries the engine. Its Skill includes the absolute Node command to
use for every engine command, regardless of any `ubp` on PATH. No Python runtime is needed.

## First session

Open the project in Claude Code and invoke `/ultra` (full name `/ultra-builder-pro:ultra`);
in Codex invoke `$ultra-builder-pro:ultra`. Run `ubp status` to see the current state.
A project without `.ultra/spec.md` starts with an interview, then a specification, checks and a
milestone plan.

The SessionStart hook prints progress and a reminder to use `ultra` only when
`.ultra/spec.md` exists, and stays silent inside a drive's writer or reviewer (`UBP_DRIVE`). It does not start work or write project files.

Codex users review and trust the plugin hook once with `/hooks`; it is skipped until then.
Changed hook definitions need renewed trust. Without hook trust, the Skill's first step,
`ubp status`, still shows the progress line.
See [Codex hook trust](https://learn.chatgpt.com/docs/hooks).

## Commands

| Command | Purpose |
| --- | --- |
| `ubp status` | Compute progress and the next step |
| `ubp gate` | Validate the plan and record its baseline |
| `ubp check [ids]` | Run checks and record evidence |
| `ubp node done <id>` | Complete a node with green requirements |
| `ubp context <id>` | Compile a node brief |
| `ubp milestone close <id> --owner "words" --review <file>` | Close a reviewed milestone |
| `ubp approve <items> --owner "words"` | Record approval of reductions |
| `ubp retro` | Show repeated failure classes |
| `ubp merge <branch> --expect-head <sha>` | Verify and merge a worker branch |
| `ubp drive --writer <cmd> [--reviewer <cmd>]` | Run nodes unattended until the next Owner touch |

Engine commands accept `--root <dir>` and `--json`.
See [file formats and exit codes](engine/FORMATS.md)
and the [method](skills/ultra/SKILL.md) for required evidence and approval boundaries.

## Coming from 5.x

Version 6 replaces the fourteen `ultra-*` Skills with one method and replaces the five
Python hooks with one advisory Node hook. OpenCode, Kimi, Grok and ZCode adapters,
`run`, `delegate`, ACP/Pi execution, durable grants, wake-up machinery and the old project
template are removed. These mechanisms competed for the next step; v6 derives it from the
engine's state. Existing 5.x project records are not automatically migrated.

Keep 5.0.1, the last published 5.x, in a separate configuration directory if you still
need those workflows (5.0.2 was never published).
The old source remains in Git history. See [changes](CHANGELOG.md) and the
[plugin boundary](docs/PLUGIN-ISOLATION-CONTRACT.md).
