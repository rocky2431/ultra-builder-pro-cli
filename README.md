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
in Codex invoke `$ultra-builder-pro:ultra`. Run `ubp status` to see the current state; in a
project that has not started it says so.
A project without `.ultra/spec.md`, empty or with existing code, starts in four steps: survey
what exists, investigate only the unknowns whose answer changes a requirement, a check or the
plan, interview the Owner for the rest, and have the Owner confirm the Direction and every
`Done when` line. Checks and a milestone plan follow. A directory that is not yet a Git
repository gets `git init` and a first commit. For existing code, the survey records how it is
built, run and tested, and its test command becomes an invariant every node keeps. A test that
is red now (a new requirement's, one that pins a behavior the Owner wants changed, or one already
failing) stays out of the invariant's run until a node turns it green.

`.ultra/design.md` holds what the project knows: the system, the design decisions in force and
the investigated facts with their sources. The planner keeps it, writers never edit it, and
every node brief carries it together with the spec's Direction and Interface. In the progress
line, `已关闭里程碑 n 项待复核` counts finished work whose checks last passed and went stale (after
a code commit a rerun settles it; after an edit of a requirement, a check or the spec's shared
text its node may need rework);
`未绿` counts work whose latest check run failed or never ran.

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
| `ubp milestone close <id> --owner "words" --review .ultra/records/milestones/<id>-review.md` | Close a reviewed milestone |
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
