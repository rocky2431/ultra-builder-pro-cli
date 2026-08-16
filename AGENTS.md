# Ultra Builder Pro Repository Engineering Guide — Codex

This file contains repository-specific guidance for developing Ultra Builder Pro with
Codex. General user engineering policy belongs in `~/.codex/AGENTS.md`; the plugin must
not create or rewrite that file.

## Product boundary

Ultra Builder Pro is a file-first workflow plugin for Claude Code, Codex, OpenCode,
Kimi Code, Grok Build, and ZCode, implementing the provider-neutral Ultra Core
Protocol (accepted 3.0 design: `docs/ULTRA-BUILDER-PRO-3.0.zh-CN.md`). The host
model owns intent interpretation, route selection, decomposition, semantic
completeness, and final expression. Ultra supplies fourteen portable Skills, five
optional hooks, host adapters, delegated CLI execution, and the repository files
needed to resume work across sessions and hosts. Authorization is explicit and
dual-mode — session-local by default, durable work-package only via an exact owner
grant recorded under `.ultra/decisions/`; no file, status, Hook, or Resume note
implies activation. One coherent work package receives at most one initial Review
plus two P0/P1 delta Reviews; P2/P3 findings are reported, never auto-repaired.

Project authority is owner-readable text and JSON under `.ultra/`, plus `CONTEXT.md`
and Git history. Ultra does not own general conversation memory, code graphs, browsing,
deployment providers, framework guidance, or unrelated productivity capabilities.

## Sources of truth

- `adapters/_shared/runtime-assets.cjs`: the exact eight user-invoked Skills, five
  model-invoked Skills, one router, six hosts, and five hooks.
- `skills/*/SKILL.md`: reusable host-neutral workflow and discipline prompts.
- `adapters/*.js`: native installation, update, doctor, and uninstall behavior.
- `adapters/_shared/host-profile.cjs`: non-interactive delegation argv for six CLIs.
- `hooks/*.py`: the complete hook surface; `_common.py` is a library, not a registration.
- `.ultra-template/`: canonical new-project data skeleton.
- `docs/ARTIFACT-AUTHORITY.md`: authority and recovery rules for project artifacts.
- `docs/PLUGIN-ISOLATION-CONTRACT.md`: ownership, activation, and idle boundaries.

No database, MCP server, semantic state machine, generated prompt projection, or daemon
is part of the product. `.ultra/.runtime/`, `.ultra/progress/`, and `.ultra/reviews/`
are disposable or reconstructable observations, never semantic authority.

## Host adaptation

Adapt semantics, not names. Shared Skills remain host-neutral; invocation policy,
frontmatter transformation, hooks, registries, and filesystem locations belong in the
adapter. Public workflows require explicit owner invocation and may recommend, but may
not launch, another public workflow. Model-invoked disciplines are reusable internal
methods and need at least two canonical callers.

## Development workflow

1. Define observable completion and write the failing regression or contract test.
2. Change the smallest authoritative source.
3. Update every live consumer, install artifact, and recovery path affected.
4. Run the narrow test, then the package suite.
5. Inspect the final diff and packed artifact.

Semantic gaps remain diagnostics. Hooks may hard-block only a named externally
destructive effect with an authoritative input and reachable authorization path.

## Verification

Before claiming repository completion, run the relevant narrow tests and:

```bash
npm run verify:release
npm pack --dry-run --json
node bin/install.js --all --global --doctor --json
```

Validate every changed Skill with the Skill Creator validator. Validate a generated
Codex plugin with the Plugin Creator validator when its manifest or marketplace surface
changes. Use isolated config directories for mutating installation tests.

## Git and release effects

Use Conventional Commits and include only authorized paths. Do not add AI co-author
trailers. Commit, push, tag, npm publication, GitHub Release, deployment, and host
installation are separate effects; perform only those explicitly authorized.
