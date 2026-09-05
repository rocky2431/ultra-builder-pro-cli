# Ultra Builder Pro Repository Engineering Guide — Claude Code

This repository ships the same file-first Ultra workflow to six hosts. General user
policy belongs in `~/.claude/CLAUDE.md`; the plugin must not create or rewrite it.

## Product boundary

The host model owns semantic reasoning and route selection. Ultra owns fourteen
host-neutral Skills, five optional hooks, native host adapters, Skill-local ACP-first
delegated Agent execution with a typed result-compatible CLI fallback,
and owner-readable project authority under `.ultra/`, `CONTEXT.md`, and Git.

There is no database, MCP server, semantic state machine, prompt projection, or daemon.
Runtime observations under `.ultra/.runtime/`, `.ultra/progress/`, and `.ultra/reviews/`
are disposable and never outrank the canonical files.

## Sources of truth

- `adapters/_shared/runtime-assets.cjs`: packaged Skills and hooks.
- `skills/*/SKILL.md`: portable workflow prompts.
- `adapters/*.js`: host-native install and lifecycle behavior.
- `hooks/*.py`: five hook implementations plus `_common.py`.
- `.ultra-template/`: new-project data skeleton.
- `docs/ARTIFACT-AUTHORITY.md` and `docs/PLUGIN-ISOLATION-CONTRACT.md`: stable contracts.

Shared Skills stay host-neutral. Public modes are `explicit-only`, `grant-continuable`,
or the read-only router. Explicit-only modes require a current owner selection;
grant-continuable modes may transition only under a verified live Execution Grant for
the exact Change. A public workflow may recommend the next but cannot bypass its
resident mode and grant guard by directly launching it. Put Claude-specific wiring in
`adapters/claude.js`.

## Development and verification

Write the failing contract first, change the smallest authority, update all live
consumers, run the narrow test, then inspect the package. Before claiming completion:

```bash
npm run verify:release
npm pack --dry-run --json
node bin/install.js --all --global --doctor --json
```

Validate changed Skills and generated plugin artifacts with their system validators.
Commit, push, tag, publication, deployment, and installation remain separate authorized
effects.
