# Plan: Native Kimi Code runtime support

1. Inspect the installed official Kimi Code 0.27.0 package for plugin, command,
   skill, hook, MCP, handbook, registry, and agent delegation contracts.
2. Add failing adapter, hook, conformance, installer, package, and durable state
   tests for the Kimi host.
3. Implement a Kimi-native managed plugin adapter, lifecycle wire adapter,
   project-root MCP launcher, command namespace, and Agent/AgentSwarm prompt
   adaptation without importing memory, code graph, Gemini, or RTK ownership.
4. Extend CLI, schema 9.1, migration, handbook, provenance, doctor, and public
   compatibility documentation to the fourth host.
5. Run the release gate, install globally without modifying user config.toml,
   and verify a fresh Kimi session reports plugin state ok and 29 MCP tools.
