# hooks/ — runtime-portable hook layer

Phase 3.8 establishes the core + adapters split. Phase 4 completes it by
wiring each adapter to its runtime's native hook loader.

## Current state (Phase 3.8)

```
hooks/
├── README.md                 # this file
├── adapters/                 # Phase 3.8 stubs → Phase 4 full wire
│   ├── claude.py             # Claude Code (JSON stdin, file locks)
│   ├── opencode.py           # OpenCode — 2 reachable events
│   ├── codex.py              # Codex — 2 reachable events (spec under dev)
│   └── gemini.py             # Gemini — prompt-guard downgrade only
├── core/                     # Phase 4 — extracted runtime-agnostic logic
├── tests/                    # existing hook tests (Claude-specific today)
└── <15 existing hook modules>   # currently Claude-native, untouched in 3.8
```

## The core / adapter split

```
<runtime hook event>  ──→  adapters/<runtime>.py  ──→  core/<feature>.py (pure logic)
                                    │                       │
                          parses runtime-specific     returns {allow, exit_code,
                          payload (JSON stdin on     deny_reason, additional_context}
                          Claude, env vars on        — no IO, no runtime coupling
                          Codex, etc.)
```

**Target** — every hook feature (`post_edit_guard`, `pre_stop_check`,
`session_journal`, `memory_db`, `block_dangerous_commands`, …) should live
in `core/` as a pure function. Each adapter parses its runtime's payload
and calls the right core function. Phase 3.8 documents this target; the
actual extraction happens incrementally in Phase 4.

## Runtime reachability (PLAN §5.4)

| Runtime | Hook events reachable | Adapter status |
|---------|----------------------|----------------|
| **Claude Code** | 8 events (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, PreCompact, PostCompact, Stop, SubagentStop) | full — 15 hooks wired |
| **OpenCode** | 2 events (session.start + event) | adapter stub; Phase 4 wires |
| **Codex** | 2 events (hooks.json spec under dev) | adapter stub; Phase 4 spikes |
| **Gemini** | 0 hook events; prompt-guard only | adapter stub; Phase 4 documents downgrade |

## 3.8 scope — what landed

- `adapters/{claude,opencode,codex,gemini}.py` stubs with responsibility
  comments
- `core/` directory reserved; no extraction yet
- Claude's 15 existing hooks untouched — **byte-exact behavior preserved**
  (AC: diff-equal to pre-Phase-3 baseline)
- Migration path documented (this file)

## Why not extract core/ in 3.8?

Risk vs reward. The 15 Claude hooks cover real production workflows
(`post_edit_guard` SQL heuristics, `pre_stop_check` P0 gates,
`session_journal` FTS5 writes). Moving them requires:
1. Precise call-site audit per hook
2. Re-wiring `settings.json` hook paths
3. Re-running every test in `hooks/tests/`

Phase 4's adapter work forces that audit anyway (OpenCode/Codex need the
core extracted to be callable). Doing it in 3.8 without an immediate
consumer invites churn. **Build what you need when you need it.**

## Hook feature inventory (current Claude implementation)

| Feature | File | Extraction priority |
|---------|------|--------------------:|
| Session journal (FTS5) | `session_journal.py` + `memory_db.py` | HIGH — shared across runtimes |
| Pre-stop gate (P0 check) | `pre_stop_check.py` | HIGH — shared |
| Post-edit heuristics | `post_edit_guard.py` | MEDIUM — Claude-specific tooling |
| Dangerous command block | `block_dangerous_commands.py` | HIGH — shared |
| Session context injection | `session_context.py` + `post_compact_inject.py` | MEDIUM — Claude-specific |
| Mid-workflow recall | `mid_workflow_recall.py` | LOW — context-size dependent |
| Observation capture | `observation_capture.py` | LOW — Claude-specific |
| Subagent tracker | `subagent_tracker.py` | LOW — Claude-specific |
| User prompt capture | `user_prompt_capture.py` | MEDIUM — shared |
| Pre-compact context save | `pre_compact_context.py` | LOW — Claude-only (no compact on other runtimes) |
| Health / doctor | `health_check.py`, `system_doctor.py`, `hook_utils.py` | infra (not event-driven) |
