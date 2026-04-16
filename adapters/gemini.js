'use strict';

/**
 * Gemini CLI adapter.
 *
 * Target config dirs:
 *   global: $GEMINI_CONFIG_DIR → ~/.gemini
 *   local:  <cwd>/.gemini
 *
 * Transformations required (Phase 2):
 *   commands → ~/.gemini/commands/*.toml  (Gemini command format)
 *   agents   → subagent registrations (Gemini sub-agent protocol, TBD)
 *   skills   → bash-addressable scripts; Gemini has no native skill concept
 *   hooks    → NOT SUPPORTED by Gemini CLI as of 2026-04; we downgrade
 *              guard logic to prompt-injected self-checks (Phase 3)
 *
 * Claude-only tool downgrades (Phase 4):
 *   All routed through ultra-tools shim (task/ask/memory/skill/subagent).
 *   AskUserQuestion → text-mode numbered list is the canonical fallback.
 */

const os = require('node:os');
const path = require('node:path');

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.GEMINI_CONFIG_DIR || path.join(ctx.homeDir || os.homedir(), '.gemini');
  }
  return path.join(process.cwd(), '.gemini');
}

module.exports = {
  name: 'gemini',
  resolveTarget,
  install(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`gemini adapter install not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
  uninstall(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`gemini adapter uninstall not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
};
