# Close context and harness lifecycle gaps

- Change: `close-context-harness-gaps`
- Kind: `major`
- Base commit: `f140f839781eeb50048a13d4f8e335691c088f8b`
- Documentation impact: `required`

## Intent

Complete the remaining Ultra-native debug lane, make workflow checkpoints recoverable through a real consumer, and add cross-host installation provenance diagnostics for Claude Code, OpenCode, and Codex without importing external memory or graph ownership.

## Documentation rationale

The public runtime, recovery, and installation contracts change.
