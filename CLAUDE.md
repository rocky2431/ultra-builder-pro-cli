# Ultra Builder Pro v6 Repository Guide

## Product boundary

UBP is one project method (`ultra`), a deterministic engine (`ubp`), and one advisory
SessionStart hook for Claude Code and Codex. Intent is source code, the plan is compiled,
progress is computed, and a change is a diff. The host model owns judgment; the engine
owns progress and mechanical gates. No ACP runner, daemon or Python hook is shipped.

## Sources of truth and layout

- `skills/ultra/SKILL.md`: the host-neutral method. Its engine-path placeholder is replaced
  only in installed copies; there is no separate method source.
- `engine/FORMATS.md`: project file formats, evidence rules and exit codes.
- `engine/*.cjs`: the engine; `bin/install.js` dispatches commands and installation.
- `adapters/claude.js`, `adapters/codex.js` and `adapters/_shared/`: host packaging,
  managed ownership, provenance and doctor. Each plugin includes its own engine copy.
- `adapters/_shared/runtime-assets.cjs`: two hosts, one Skill and one hook.
- `hooks/session-start.cjs`: read-only status observation, always exiting zero.
- `.ultra/`: project specification, checks, plan, rulings, ledgers and records.
  `.ultra/.runtime/` is disposable. Git and these files carry project truth.
- `tests/`: engine and package contracts; `adapters/_shared/tests/`: shared install tests.

See `docs/PLUGIN-ISOLATION-CONTRACT.md` for ownership and activation boundaries.
Never create or rewrite the user's global `AGENTS.md` or `CLAUDE.md`.

## Development and release checks

Read the affected contract before editing. Preserve protected acceptance files. Change the
smallest authoritative source and every affected consumer. Run the narrow regression first,
then the release checks; inspect the final diff and packed paths:

```sh
npm run verify:release
npm pack --dry-run --json
node bin/install.js --all --global --doctor --json
```

The release gate runs the remaining Node suites and the production dependency audit.
Validate changed Skills with the Skill Creator validator and changed Codex manifests with
Plugin Creator. Use temporary `--config-dir` directories for installation
tests; never use a real HOME for a test. Report unavailable checks and failed aggregate gates
without treating isolated retries as success.

Commit, push, tag, publication and real host installation are separate effects requiring
explicit authorization. Use Conventional Commits; stage only authorized paths.
Do not change scope or acceptance to make a check pass.
