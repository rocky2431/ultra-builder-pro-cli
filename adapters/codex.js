'use strict';

/**
 * Codex CLI adapter.
 *
 * Target config dirs:
 *   global: $CODEX_HOME → ~/.codex
 *   local:  <cwd>/.codex
 *
 * Transformations required (Phase 2):
 *   commands → ~/.codex/prompts/*.md    (stripped frontmatter; $ARGUMENTS preserved)
 *   agents   → config.toml [agents.<name>] sections with sandbox + model
 *   skills   → bash-addressable scripts + references in agent prompts
 *   hooks    → config.toml [codex_hooks] entries
 *   Python hooks: viability depends on Codex's hook payload format; degrade
 *                 to "prompt-injected guard" when incompatible
 *
 * Tool name mapping (Phase 4 — prompt-level rewrite):
 *   Read/Write/Edit/Bash/Grep/Glob → supported
 *   AskUserQuestion/Task/Skill     → ultra-tools shim
 *   TeamCreate/SendMessage         → flagged as "unsupported in runtime"
 */

const os = require('node:os');
const path = require('node:path');

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.CODEX_HOME || path.join(ctx.homeDir || os.homedir(), '.codex');
  }
  return path.join(process.cwd(), '.codex');
}

module.exports = {
  name: 'codex',
  resolveTarget,
  install(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`codex adapter install not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
  uninstall(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`codex adapter uninstall not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
};
