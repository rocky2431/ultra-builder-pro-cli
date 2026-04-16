'use strict';

/**
 * Claude Code adapter.
 *
 * Target config dirs:
 *   global: ~/.claude (or $CLAUDE_CONFIG_DIR, or --config-dir)
 *   local:  <cwd>/.claude
 *
 * Assets to deploy:
 *   commands/*.md → <target>/commands/
 *   agents/*.md   → <target>/agents/
 *   skills/**     → <target>/skills/
 *   hooks/*.py    → <target>/hooks/
 *   settings.json → <target>/settings.json  (merged, not overwritten)
 *
 * Phase 0: stub only. Real implementation arrives in Phase 2 (adapters).
 */

const os = require('node:os');
const path = require('node:path');

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.CLAUDE_CONFIG_DIR || path.join(ctx.homeDir || os.homedir(), '.claude');
  }
  return path.join(process.cwd(), '.claude');
}

module.exports = {
  name: 'claude',
  resolveTarget,
  install(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`claude adapter install not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
  uninstall(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`claude adapter uninstall not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
};
