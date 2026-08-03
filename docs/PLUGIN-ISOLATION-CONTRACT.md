# Plugin isolation contract

Ultra Builder Pro owns a narrow install surface and becomes active only in a project
that contains `.ultra/` or when the owner explicitly invokes an Ultra Skill.

## Owned surfaces

Per host, Ultra may install:

- exactly fourteen managed Skills;
- exactly five hook scripts plus `_common.py` and any required wire adapter;
- one native plugin manifest or entrypoint;
- provenance and managed-ownership markers;
- the host's native registry entry where required.

The package also owns `ubp delegate run`, its worker, and rule-side Skill references.

## Surfaces Ultra does not own

Ultra must not create or rewrite:

- global user instruction files such as `~/.codex/AGENTS.md` or
  `~/.claude/CLAUDE.md`;
- general memory, code-graph, browser, deployment, framework, or productivity assets;
- user-defined commands, agents, plugins, hooks, or registry entries;
- repository files outside `.ultra/` and `CONTEXT.md` unless the selected engineering
  task itself authorizes them;
- an Ultra database, server registration, semantic runtime, or daemon.

## Installation lifecycle

Install builds a complete staging tree, marks it managed, writes provenance, then
atomically publishes it. An existing unmanaged target is never overwritten. Reinstall
replaces only the managed tree. Doctor is read-only. Uninstall removes only assets
whose ownership can be proven.

Host-owned sidecars must resolve from the same isolation root as `--config-dir`. For
Codex this includes both `plugins/ultra-builder-pro` and
`.agents/plugins/marketplace.json`; sandbox installation must not touch the real home
directory. Codex native registration runs with both `HOME` and `CODEX_HOME` set to that
root. If registration fails, install restores the previous managed tree and marketplace,
or removes every fresh partial artifact.

When one invocation selects multiple hosts, the supplied path is a parent isolation
root and each adapter receives `<path>/<runtime>`. Sharing one concrete config directory
would collide host-native `skills/` and `plugins/` layouts.

OpenCode installation may remove a specifically recognizable Ultra registration from
an older release. It must preserve unrelated configuration and files.

Before first install, each adapter records only the exact config files and directory
shells that do not yet exist. Uninstall may prune those recorded paths only when they
are still empty (or a zero-byte host-created file); it preserves every pre-existing,
non-empty, modified, symlinked, or unowned path. Codex marketplace and Kimi registry
files additionally remember whether Ultra created the registry itself, so an empty
registry that existed before installation is retained.

## Activation

Owner-invoked Skills activate only through the host's explicit Skill surface.
Model-invoked Skills may be selected by the host model only as methods inside the
current authorized task. Hooks activate only through host lifecycle registrations.

One public Skill may recommend another but never launches it. Installation does not
create project authority or start background work.

## Idle behavior

Every hook resolves the current project and checks for `.ultra/` before reading,
writing, injecting context, or denying an effect. Without `.ultra/`, it emits no stdout,
exits zero, and leaves the project untouched.

The only hook denial is a named destructive shell effect in an active Ultra project.
The denial identifies the protected effect and supplies an exact-command SHA-256
authorization path. Additive protected-branch publication is an advisory observation
because a portable hook cannot consume every host's trusted owner-approval receipt;
history rewrites and branch deletion remain guarded. All other hook failures are
fail-open diagnostics.

## Project data boundary

Canonical project data is owner-readable and Git-compatible. Derived hook, review, and
delegation artifacts live only under ignored `.ultra/.runtime/`, `.ultra/progress/`, or
`.ultra/reviews/`. Disabling or uninstalling Ultra leaves canonical project data intact
and resumable by ordinary file reading.
