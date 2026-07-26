# Ultra Builder Pro Repository Engineering Guide — Claude Code

This file contains repository-specific guidance for developing Ultra Builder Pro with
Claude Code. General user engineering policy belongs in `~/.claude/CLAUDE.md`; the plugin
must not create or rewrite that file.

## Product boundary

Ultra Builder Pro is a host-adapted workflow plugin for Claude Code, Codex, OpenCode,
and Kimi Code. It owns workflow authority, evidence, recovery, host adapters, and the
minimal prompts required to operate them.

It does not own persistent memory, code-graph content, general browsing, deployment
providers, framework guidance, or unrelated productivity skills. Keep those capabilities
in separately installed owner packages.

## Sources of truth

- `adapters/_shared/runtime-assets.cjs`: packaged Skill, hook, and collaboration allowlists.
- `docs/PLUGIN-ISOLATION-CONTRACT.md`: installation, activation, idle, and ownership boundaries.
- `mcp-server/lib/workflow-state.cjs`: workflow state transitions and durable gates.
- `spec/mcp-tools.yaml`: public MCP contract.
- `skills/*/SKILL.md`: reusable workflow prompts.
- `commands/*.md`: thin Claude Code launchers; do not duplicate workflow logic.
- `.ultra/state.db`: project workflow authority at runtime.

Generated Markdown and JSON are projections or evidence artifacts, not parallel
authorities.

## Host adaptation

Adapt semantics, not names. Claude Code commands, interaction surfaces, workers, hooks,
settings, and plugin paths must remain Claude-native. Never make a foreign prompt
“compatible” through path or product-name substitution alone.

Shared Skills must remain host-neutral. Put host-specific invocation and wiring in the
adapter. Keep public launchers thin, require explicit owner invocation, and keep external
capabilities and user-handbook policy out of the package. One workflow may recommend but
must not launch another.

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
