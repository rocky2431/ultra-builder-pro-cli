# Plugin Isolation Contract

Ultra Builder Pro is an explicitly invoked, removable workflow plugin. Installation
must not change a user's durable engineering policy or initialize any repository.

## Owned surfaces

An adapter may write only:

- the host's plugin-owned command, skill, worker, hook, and runtime directories;
- the host registry or manifest entries required to load those assets;
- the plugin's own provenance and managed-file markers.

The first command allowed to create project authority is `ultra-init`. Once invoked,
Ultra owns only the repository-local `.ultra/` authority and its generated projections.

## Surfaces Ultra does not own

Install, update, doctor, and uninstall must not create, rewrite, trim, merge, or delete:

- user-level `CLAUDE.md`, `AGENTS.md`, or equivalent instruction files;
- repository-level instruction files;
- project source, Git history, remotes, or `.ultra/` data;
- memory or code-graph provider data.

Existing Ultra marker blocks in a user handbook are legacy user content after this
contract takes effect. They are not silently removed because the plugin cannot prove
ownership or preserve unrelated edits. The owner may review and remove them separately.

## Activation

Public Ultra workflows run only after an explicit user command or skill invocation.
Completion of one workflow may return allowed transitions and a recommendation, but it
must not start another public workflow.

Host adapters prevent implicit model activation with the strongest native mechanism:

- Claude Code and Kimi Code mark public workflow skills as model-disabled;
- Codex marks workflow metadata as implicit-invocation-disabled;
- OpenCode exposes public workflows through commands backed by private plugin assets,
  not through the model-discoverable skill catalog.

Internal review-rule skills remain available only to their bounded workers.

## Idle behavior

Outside a repository containing `.ultra/state.db`, all Ultra hooks are silent. Inside
an initialized repository they remain silent unless a DB-authoritative workflow is
active, blocked, or ready. The sole idle-time enforcement is protection against direct
writes to generated Ultra projections; the DB remains authoritative.

Installation tests preserve byte-for-byte snapshots of all supported user handbook
paths. Runtime tests cover explicit activation, idle silence, active recovery, and
projection protection.
