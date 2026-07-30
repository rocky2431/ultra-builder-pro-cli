# Plugin Isolation Contract

Ultra Builder Pro is an explicitly invoked, removable workflow plugin. Installation
must not change a user's durable engineering policy or initialize any repository.

## Owned surfaces

An adapter may write only:

- the host's plugin-owned command, skill, worker, hook, and runtime directories;
- the host registry or manifest entries required to load those assets;
- the plugin's own provenance and managed-file markers.

The first command allowed to create project authority is `ultra-init`. Once invoked,
Ultra owns only the repository-local `.ultra/` workflow-memory envelope and its
MCP-published checkpoint plus generated local projections.

## Surfaces Ultra does not own

Install, update, doctor, and uninstall must not create, rewrite, trim, merge, or delete:

- user-level `CLAUDE.md`, `AGENTS.md`, or equivalent instruction files;
- repository-level instruction files;
- project source, Git history, remotes, or `.ultra/` data;
- general memory or code-graph provider data.

Existing Ultra marker blocks in a user handbook are legacy user content after this
contract takes effect. They are not silently removed because the plugin cannot prove
ownership or preserve unrelated edits. The owner may review and remove them separately.

## Activation

Public Ultra workflows run only after an explicit user command or Skill invocation.
Completion of one workflow may return current Context diagnostics and a host-model
recommendation, but it must not start another public workflow. SQLite does not choose
or authorize that recommendation.

Host adapters prevent implicit model activation with the strongest native mechanism:

- Claude Code and Kimi Code mark public workflow Skills as model-disabled;
- Codex marks workflow metadata as implicit-invocation-disabled;
- OpenCode exposes public workflows through commands backed by private plugin assets,
  not through the model-discoverable skill catalog.
- Grok Build uses explicit plugin Skills/commands and makes Skill-entry
  `ultra.context` authoritative when a Hook output channel is not consumed.

Internal review-rule skills remain available only to their bounded workers.

## Idle behavior

Outside a repository containing `.ultra/.runtime/state.db`, all Ultra Hooks are silent.
Inside an initialized repository, a Hook may inject one bounded Context Envelope when
the host consumes that channel. The sole idle-time enforcement is protection against
direct writes to the MCP-owned team checkpoint or generated Ultra projections; the DB
remains checkout-local operational authority. Semantic incompleteness is advisory.

Installation tests preserve byte-for-byte snapshots of all supported user handbook
paths. Runtime tests cover explicit activation, idle silence, active recovery, and
projection protection.
