# Using Ultra Builder Pro

[Project overview](../README.md) · [简体中文介绍](../README.zh-CN.md) · [All documentation](README.md)

Start with the agent you already use. Ultra adds methods and project records to
that host; you keep its normal conversation, tools, and model account.

- [Install a plugin](#install-a-plugin)
- [Start from a goal](#start-from-a-goal)
- [Workflow and recovery](#workflow-and-recovery)
- [Delegate work](#delegate-work)
- [Check, update, or remove an installation](#check-update-or-remove-an-installation)

## Install a plugin

You need Node.js 22+, Git for project history and worktrees, and an installed host
with its own model access. The optional Python hooks need `python3` on `PATH`.
Ultra does not install a coding agent or configure its model account.

Choose a user-level installation:

| Host | Command |
|---|---|
| Claude Code | `npx ultra-builder-pro-cli@latest --claude --global` |
| Codex | `npx ultra-builder-pro-cli@latest --codex --global` |
| OpenCode | `npx ultra-builder-pro-cli@latest --opencode --global` |
| Kimi Code | `npx ultra-builder-pro-cli@latest --kimi --global` |
| Grok Build | `npx ultra-builder-pro-cli@latest --grok --global` |
| ZCode | `npx ultra-builder-pro-cli@latest --zcode --global` |

Use `--all --global` to install for all six hosts. For Claude Code, Codex, or
OpenCode, `--local` instead of `--global` installs into the current project.
Kimi Code, Grok Build, and ZCode support user-level installation only.

These commands resolve the published npm package. The [changelog](../CHANGELOG.md)
is the record of released and unreleased changes. To install directly from a
source checkout instead:

```bash
git clone https://github.com/rocky2431/ultra-builder-pro-cli.git
cd ultra-builder-pro-cli
npm ci
node bin/install.js --codex --global
```

Replace `--codex` with the host you use. Installation copies the selected assets;
later source edits do not update an existing installation automatically.

For an isolated installation, supply `--config-dir /path/to/test-config`. This
also isolates host sidecar files. With multiple hosts, the installer puts each
one under its own subdirectory. Existing unrelated configuration is preserved.

Start a new host session after installation. Codex manages hook trust itself;
Ultra's Doctor cannot observe that live trust decision or grant it for you.

## Start from a goal

Inside a host that has loaded Ultra, describe what you want and say to use Ultra
Builder Pro. If the host does not discover it from the request, select it through
the native Skill picker. Codex exposes names such as
`$ultra-builder-pro:ultra-change`.

For day-to-day work on an existing project, a request that changes an accepted
product or specification commitment starts with `ultra-change`. A bounded fix
that leaves those commitments intact can stay ordinary repository work.

### Goal entry from this checkout

From the source checkout, the `run` command loads Ultra and gives the host your
goal verbatim. The model chooses the route. You do not choose an internal phase.

```bash
# Claude Code: install this checkout, then start a session
node bin/install.js --claude --global
node bin/install.js run --cwd /path/to/project "fix Chinese text in CSV export"

# Pi: load this checkout's Skills and extension for the session
node bin/install.js run --host pi --cwd /path/to/project "build a receipt organizer"

# Inspect the command and initial prompt without starting a session
node bin/install.js run --host pi --dry-run --json "describe your goal"
```

The default host is Claude Code. The goal entry can launch Claude Code and Pi;
use native Skill entry in the other hosts. Pi needs an installed `pi` executable
but no separate managed Ultra installation. It loads the packaged Skills and
extension for this session and does not load the optional Claude hooks.

An installed package that includes this entry also exposes `ubp run`. Running
through `npx` to install a plugin does not by itself put `ubp` on your `PATH`.

| Option | Use it to |
|---|---|
| `--cwd <dir>` | Work in another project |
| `--config-dir <dir>` | Select a managed Claude plugin under that configuration |
| `--plugin-dir <dir>` | Load a generated plugin directory |
| `--continue` | Continue the last native session in the working directory |
| `--resume <id>` | Resume a named native session |
| `--host-arg <arg>` | Pass one additional native host argument; repeat as needed |
| `-` | Read the goal from standard input |

Stop and exit behave as they do in the native host. When continuing, keep the
same project and plugin selection. Use the interactive terminal while the
purpose is still being clarified: a one-shot print command or piped input does
not provide a way to answer follow-up questions. A host may also request access
to the selected plugin directory.

## Workflow and recovery

A new product may need its intended use clarified before any files are created.
Research establishes the first accepted project baseline. Later changes update
only the parts they affect. The model selects the needed planning, development,
testing, and review methods, then verifies the actual outcome.

The [workflow reference](WORKFLOW-LIFECYCLE.md) defines each Skill's entry and exit
conditions. The [architecture reference](ARCHITECTURE.md#method-plane) lists the
Skills; [artifact authority](ARTIFACT-AUTHORITY.md) defines who writes each record.
An internal stage finishing does not, by itself, mean the requested product is done.

### Continue in another session

A fresh session starts from repository root and `HEAD`, then reads the active
Change, task ledger, relevant context and Resume Note, accepted decisions,
evidence, and current diff. It does not repeat completed Research just because
the previous conversation is unavailable.

The Execution Grant records the work that may continue:

- A `session-local` grant applies while its activation remains in the current
  conversation. If that activation is lost in a fresh session, host switch, or
  compaction, execution stops for the owner to reactivate it.
- A `durable work-package` grant can allow a fresh Agent to continue only after
  it stably verifies the exact recorded grant, its scope, and its validity.

Neither mode grants finalization or archive. Commit, push, publication,
deployment, and installation each need the corresponding owner authorization.
Permission already given for the same scope and effects does not need to be
requested again. The [grant contract](../skills/ultra-change/references/execution-grant.md)
defines the exact mode rules.

### Unattended Pi checkpoints

Ordinary session resumption is separate from unattended continuation. The Pi
extension can register one checkpoint only after the owner explicitly selects a
durable work package, its local write scope, expiry, and budget.

It waits for the old main session and finite supervisor to end, then starts at
most one fresh Pi turn to inspect the original results. It checks revocation,
expiry, and input identity. An unknown delivery remains unknown and is not
automatically replayed. It does not create an unlimited background worker.

The [checkpoint contract](../skills/ultra-delegate/references/durable-checkpoint.md)
covers registration, status, revocation, notifications, and recovery. Machine
restarts and network partitions are not fully qualified recovery paths.

## Delegate work

The main agent can work alone, ask for an independent check, or split independent
work after you authorize delegation. You can name a target yourself or permit
the model to choose within a defined scope and budget. Calling Ultra alone does
not grant that permission.

Workers receive a specific instruction, an isolated Git worktree, and allowed
write locations. They cannot take over canonical `.ultra/` records or grant
themselves external effects. The main agent checks their actual diff and result
before deciding what to integrate. Reading is not confined by a portable
readable-roots sandbox.

The [delegation Skill](../skills/ultra-delegate/SKILL.md) uses ACP-first transport
where qualified, with a typed CLI fallback. Native runtime identity and
permission enforcement are checked independently of plugin installation.
An unavailable target is reported; there is no silent provider switch.

Pi's qualified worker path permits scoped file work and denies Bash execution.
A worker may write tests; the main agent runs them after integration. ZCode's
plugin remains installable, but its current delegated execution path is
unavailable. See the [host qualification record](RUNTIME-COMPAT-MATRIX.md#host-enforcement-qualification-fail-closed-admission)
before attempting a particular runtime. The matrix also contains ZCode bridge,
provider-configuration, and experimental-acknowledgement requirements.

For authorized Pi parallel work, use the
[finite-batch contract](../skills/ultra-delegate/references/finite-run-slice.md).
The model chooses the tasks; the controller starts only the listed attempts,
waits, handles cancellation, and returns results. Results can return in the
current tool call or as a notification to the same live session. The
[factory reference](../skills/ultra-delegate/references/operational-factory.md)
covers worktrees, budgets, later batches, and cleanup. Coordination has a cost;
repeated efficiency gains over comparable single-agent work remain unproven.

## Check, update, or remove an installation

Doctor inspects the installed package and managed assets without changing them:

```bash
npx ultra-builder-pro-cli@latest --all --global --doctor --json
```

To update, repeat the installation command for the host and scope you use.
To remove that managed installation:

```bash
npx ultra-builder-pro-cli@latest --codex --global --uninstall
```

Use the same `--config-dir` if you originally selected one. Uninstall preserves
pre-existing registries and unrelated files and removes only empty configuration
shells created by the installation.

If Doctor reports a degraded installation, keep its output and check the
[host-specific paths and limitations](RUNTIME-COMPAT-MATRIX.md). Healthy files
do not prove that optional hooks are trusted or that a provider can execute work.
