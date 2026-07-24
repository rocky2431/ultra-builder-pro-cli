# Ultra Builder Pro Repository Engineering Guide — Codex

This file contains repository-specific guidance for developing Ultra Builder Pro with
Codex. General user engineering policy belongs in `~/.codex/AGENTS.md`; do not duplicate
the complete user handbook here.

## Product boundary

Ultra Builder Pro is a host-adapted workflow plugin for Claude Code, Codex, OpenCode,
and Kimi Code. It owns workflow authority, evidence, recovery, host adapters, and the
minimal prompts required to operate them.

It does not own persistent memory, code-graph content, general browsing, deployment
providers, framework guidance, or unrelated productivity skills. Keep those capabilities
in separately installed owner packages.

## Sources of truth

- `adapters/_shared/runtime-assets.cjs`: packaged Skill, hook, and collaboration allowlists.
- `adapters/_shared/handbook.cjs`: bounded and full user-handbook renderers.
- `mcp-server/lib/workflow-state.cjs`: workflow state transitions and durable gates.
- `spec/mcp-tools.yaml`: public MCP contract.
- `skills/*/SKILL.md`: reusable workflow prompts.
- Codex plugin Skills: native `$ultra-builder-pro:<skill>` entry points.
- `.ultra/state.db`: project workflow authority at runtime.

Generated Markdown and JSON are projections or evidence artifacts, not parallel
authorities.

## Host adaptation

Adapt semantics, not names. Codex Skills, plans, subagents, hooks, `config.toml`, plugin
manifests, and MCP wiring must remain Codex-native. Never make a foreign prompt
“compatible” through path or product-name substitution alone.

Shared Skills must remain host-neutral. Put host-specific invocation and wiring in the
adapter. Do not recreate deprecated prompt or user-Skill projections outside the native
plugin boundary.

The complete user handbook is installed only through explicit:

```bash
ubp-handbook preview --runtime codex --full > /tmp/ubp-codex-handbook.md
ubp-handbook apply --runtime codex --full \
  --confirm "PASTE_64_CHARACTER_TOKEN_HERE"
```

Plugin installation must never mutate the user handbook implicitly.

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

Commit, push, tag, npm publication, GitHub Release, handbook application, and host
installation are separate effects. Perform only the effects explicitly authorized by
the user and verify each one independently.
