# Harness Closure Delta

## Debug lane

- `incident` is the canonical Ultra debug lane; no additional change kind is introduced.
- Incident work must persist an inspectable diagnosis artifact covering reproduction,
  falsifiable hypotheses, root cause, the discriminating regression test, and recovery.
- Convergence must reject an incident whose diagnosis artifact is missing or incomplete,
  even when a caller submits a free-form `diagnosis` evidence row.
- The runtime workflows must explicitly route difficult incident diagnosis to the bundled
  debugger agent while the primary host retains ownership of the fix and verification.

## Workflow checkpoint recovery

- The pre-compact hook snapshot is an actual recovery input, not a write-only artifact.
- Resume must validate the checkpoint schema and embedded workflow state, prefer the
  checkpoint when it is at least as current as the live workflow file, and fall back safely
  when it is missing, stale, terminal, or corrupt.
- Resume never treats the checkpoint as task authority; `.ultra/.runtime/state.db` remains the source
  of truth for task/session/change state.

## Installation provenance

- A read-only installer doctor covers Claude Code, OpenCode, and Codex.
- Every host installation exposes a normalized provenance manifest with package version,
  adapter, source repository, deterministic content digest, install root, and managed assets.
- Doctor reports missing, corrupt, version-mismatched, content-drifted, hook-broken, and
  MCP-launcher-broken installations without mutating them.
- The existing project-level `ultra-doctor` remains scoped to `.ultra/.runtime/state.db`; installation
  diagnosis is a CLI/adapter boundary and is not added to the project MCP server.
