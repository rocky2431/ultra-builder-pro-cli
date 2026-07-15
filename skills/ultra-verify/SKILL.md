---
name: ultra-verify
description: Run three-way verification with the current host as primary and read-only Gemini and Codex advisors, then verify and synthesize the evidence.
---

# Ultra Verify — Three-Way Verification

Claude Code remains primary. It writes the first independent analysis, verifies consequential
claims, and owns the final answer. Gemini and Codex are untrusted read-only advisors. Use this
workflow only when the user explicitly asks for cross-model or three-way verification.

## Modes

- `decision <question>`: architecture or product decision.
- `diagnose <symptoms>`: independent root-cause hypotheses.
- `audit <scope>`: evidence-backed findings.
- `estimate <task>`: estimates with explicit assumptions.

## Preconditions

1. Confirm `gemini --version` and `codex --version` plus authentication.
2. Define the exact workspace, question, evidence standard, and response shape.
3. Do not send secrets, unrelated files, or an unbounded home directory.
4. Track the four workflow steps in the current host plan: primary analysis, advisor launch,
   completion wait, and verified synthesis.

## 1. Create the session and write the primary view

```bash
SESSION_ID="$(date +%Y%m%d-%H%M%S)-verify-<mode>"
SESSION_PATH=".ultra/collab/${SESSION_ID}"
mkdir -p "${SESSION_PATH}"
```

Write Claude Code's evidence-backed analysis to `${SESSION_PATH}/claude-analysis.md` before
reading either advisor. Record the mode, checkout, scope, and evidence boundary.

## 2. Launch both advisors read-only

Give both advisors the same bounded raw question and evidence, without the primary conclusion.
Launch them concurrently when the host supports independent shell sessions; otherwise start both
before collecting either result.

Gemini:

```bash
gemini --approval-mode plan \
  --output-format text \
  -p "<bounded prompt>" \
  > "${SESSION_PATH}/gemini-output.md" \
  2> "${SESSION_PATH}/gemini-error.log"
```

Codex:

```bash
codex exec -s read-only \
  -o "${SESSION_PATH}/codex-output.md" \
  "<bounded prompt>" \
  2> "${SESSION_PATH}/codex-error.log"
```

Never enable auto-edit, write-capable automation, danger-full-access, or permission bypass for
either advisor.

## 3. Wait for completed outputs

Run the bundled waiter in an asynchronous or yielded shell session and poll it at bounded
intervals; never hold one blocking tool call longer than 60 seconds.

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/ultra-verify/scripts/verify_wait.py" \
  "${SESSION_PATH}" --timeout 1200
```

The waiter reports each advisor as `complete`, `failed`, `empty`, or `pending`. Read an advisor
output only after the corresponding status is `complete` and the file is non-empty. Preserve its
error log when it fails.

## 4. Verify and synthesize

Compare `claude-analysis.md` with each completed advisor output:

1. Verify claims against the current checkout, tests, runtime, or primary documentation.
2. Separate consensus, majority views, useful dissent, and unsupported assertions.
3. Explain scope, version, and assumption differences before scoring agreement.
4. Write `synthesis.md` and `metadata.json`, then return one Claude Code-owned conclusion.

Use `references/confidence-system.md` for scoring and
`references/cross-verify-modes.md` for mode-specific evidence expectations. Model agreement never
overrides failing tests or authoritative runtime evidence.

## Degraded operation

- One advisor fails: continue with the primary view plus the available advisor and name the gap.
- Both advisors fail: return primary-only analysis with an explicit single-source warning.
- Never block the underlying user task solely because an advisor is absent, unauthenticated, or
  slow.

## Session files

```text
.ultra/collab/<SESSION_ID>/
  claude-analysis.md
  gemini-output.md
  gemini-error.log
  codex-output.md
  codex-error.log
  metadata.json
  synthesis.md
```
