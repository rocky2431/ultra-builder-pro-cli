---
name: ultra-verify
description: Run independent two-model verification with the current host as primary and a read-only Codex advisor, then verify and synthesize the evidence.
---

# Ultra Verify — Independent Two-Model Verification

Claude Code remains primary. It writes the first independent analysis, verifies consequential
claims, and owns the final answer. Codex is an untrusted read-only advisor. Use this workflow only
when the user explicitly asks for cross-model verification.

## Modes

- `decision <question>`: architecture or product decision.
- `diagnose <symptoms>`: independent root-cause hypotheses.
- `audit <scope>`: evidence-backed findings.
- `estimate <task>`: estimates with explicit assumptions.

## Preconditions

1. Confirm `codex --version` plus authentication.
2. Define the exact workspace, question, evidence standard, and response shape.
3. Do not send secrets, unrelated files, or an unbounded home directory.
4. Track four steps in the current host plan: primary analysis, advisor launch, completion wait,
   and verified synthesis.

## 1. Create the session and write the primary view

```bash
SESSION_ID="$(date +%Y%m%d-%H%M%S)-verify-<mode>"
SESSION_PATH=".ultra/collab/${SESSION_ID}"
mkdir -p "${SESSION_PATH}"
```

Write Claude Code's evidence-backed analysis to `${SESSION_PATH}/claude-analysis.md` before
reading the advisor output. Record the mode, checkout, scope, and evidence boundary.

## 2. Launch the advisor read-only

Give the advisor the bounded raw question and evidence without the primary conclusion.

```bash
codex exec -s read-only \
  -o "${SESSION_PATH}/codex-output.md" \
  "<bounded prompt>" \
  2> "${SESSION_PATH}/codex-error.log"
```

Never enable write-capable automation, danger-full-access, or permission bypass for the advisor.

## 3. Wait for completed output

Run the bundled waiter in an asynchronous or yielded shell session and poll it at bounded
intervals; never hold one blocking tool call longer than 60 seconds.

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/ultra-verify/scripts/verify_wait.py" \
  "${SESSION_PATH}" --timeout 1200
```

The waiter reports the advisor as `complete`, `failed`, `empty`, or `pending`. Read the output only
after its status is `complete` and the file is non-empty. Preserve the error log when it fails.

## 4. Verify and synthesize

Compare `claude-analysis.md` with `codex-output.md`:

1. Verify claims against the current checkout, tests, runtime, or primary documentation.
2. Separate verified agreement, useful dissent, and unsupported assertions.
3. Explain scope, version, and assumption differences before judging the result.
4. Write `synthesis.md` and `metadata.json`, then return one Claude Code-owned conclusion.

Use `references/confidence-system.md` for evidence-based confidence and
`references/cross-verify-modes.md` for mode-specific expectations. Model agreement never overrides
failing tests or authoritative runtime evidence.

## Degraded operation

- Advisor failure: return the primary analysis with an explicit single-source warning.
- Never block the underlying user task solely because the advisor is absent, unauthenticated, or
  slow.

## Session files

```text
.ultra/collab/<SESSION_ID>/
  claude-analysis.md
  codex-output.md
  codex-error.log
  metadata.json
  synthesis.md
```
