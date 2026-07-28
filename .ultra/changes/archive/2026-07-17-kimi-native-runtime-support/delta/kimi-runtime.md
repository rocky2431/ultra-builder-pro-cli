# Delta: Kimi Code native host

## Added

- `--kimi` and `--all` installation, doctor, uninstall, and handbook routing.
- Native `kimi.plugin.json` registration for twelve Ultra workflows, allowlisted
  skills, eight lifecycle hooks, one session bootstrap, and one stdio MCP.
- Kimi hook output adaptation, Agent/AgentSwarm review semantics, namespaced
  command prompts, and safe project-root recovery for plugin-root MCP startup.
- Durable runtime value `kimi` in schema 9.1 with transactional migration of
  the constrained event and session tables.

## Preserved boundaries

- `.ultra/.runtime/state.db` remains the only Ultra authority; JSON and Markdown remain
  projections or artifacts.
- Memory and code graph content remain external provider concerns.
- Existing Kimi `config.toml`, unrelated plugin records, and user hook choices
  are not owned or overwritten by the installer.
- Gemini and RTK remain retired from active package, prompt, schema, and docs
  surfaces.

## Host limitation

Kimi 0.26/0.27 runs `PostCompact` as fire-and-forget. Ultra persists and restores
the checkpoint, but does not claim that hook text is reinjected into the model
context. The runtime matrix marks this one surface as degraded.
