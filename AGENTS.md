# Ultra Builder Pro Repository Engineering Guide — Codex

This file contains repository-specific guidance for developing Ultra Builder Pro with
Codex. General user engineering policy belongs in `~/.codex/AGENTS.md`; the plugin must
not create or rewrite that file.

## Product boundary

Ultra Builder Pro is a host-adapted workflow plugin for Claude Code, Codex, OpenCode,
and Kimi Code. It owns workflow authority, evidence, recovery, host adapters, and the
minimal prompts required to operate them.

It owns project-local cross-session workflow memory under `.ultra/`: normalized intent,
progress, tasks, bounded context, specifications, evidence, provenance, and recovery.
It does not own general conversational or episodic memory, code-graph payloads, general
browsing, deployment providers, framework guidance, or unrelated productivity skills.
Keep those capabilities in separately installed owner packages.

## Sources of truth

- `adapters/_shared/runtime-assets.cjs`: packaged Skill, hook, and collaboration allowlists.
- `docs/PLUGIN-ISOLATION-CONTRACT.md`: installation, activation, idle, and ownership boundaries.
- `mcp-server/lib/workflow-state.cjs`: workflow state transitions and durable gates.
- `spec/mcp-tools.yaml`: public MCP contract.
- `skills/*/SKILL.md`: reusable workflow prompts.
- Codex plugin Skills: native `$ultra-builder-pro:<skill>` entry points.
- `.ultra/.runtime/state.db`: lifecycle, index, transition, freshness, and coordination authority
  at runtime.
- `docs/ARTIFACT-AUTHORITY.md`: authority and promotion rules for every `.ultra/`
  artifact class.

Digest-bound specifications and evidence files carry semantic content; generated
projections and working scratch do not become authority merely because they are under
`.ultra/`.

## Host adaptation

Adapt semantics, not names. Codex Skills, plans, subagents, hooks, `config.toml`, plugin
manifests, and MCP wiring must remain Codex-native. Never make a foreign prompt
“compatible” through path or product-name substitution alone.

Shared Skills must remain host-neutral. Put host-specific invocation and wiring in the
adapter. Do not recreate deprecated prompt, user-Skill, or user-handbook projections
outside the native plugin boundary. Public workflows require explicit owner invocation;
one workflow may recommend but must not launch another.

## Development workflow

1. Reproduce a bug or define new behavior with a failing test.
2. Change the smallest authoritative source.
3. Update every live consumer and recovery path affected by the contract.
4. Run the narrow test first, then the relevant package suite.
5. Inspect the final diff and packaged artifact.

Do not weaken gates merely to make tests pass. Context-size guidance is advisory;
authority, security, irreversible effects, and evidence integrity may block.

## Verification

Before claiming repository completion, run the relevant narrow tests and:

```bash
npm run verify:release
npm pack --dry-run --json
node bin/install.js --all --global --doctor --json
```

Validate every changed Skill with the Skill Creator validator. Validate the Codex plugin
artifact with the Plugin Creator validator when its manifest or marketplace surface
changes.

## Git and release effects

Use Conventional Commits and include only authorized paths. Do not add AI co-author
trailers; the configured Git user remains the sole commit author.

Commit, push, tag, npm publication, GitHub Release, and host installation are separate
effects. Perform only the effects explicitly authorized by the user and verify each one
independently.
