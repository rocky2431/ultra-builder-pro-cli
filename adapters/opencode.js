'use strict';

/**
 * OpenCode adapter.
 *
 * Target config dirs (follows XDG Base Directory spec):
 *   global: $OPENCODE_CONFIG_DIR → $XDG_CONFIG_HOME/opencode → ~/.config/opencode
 *   local:  <cwd>/.opencode
 *
 * Transformations required (Phase 2):
 *   commands → .opencode/commands/*.md   (YAML frontmatter largely reusable)
 *   agents   → .opencode/agents/*.md     (frontmatter tool names mostly reusable)
 *   skills   → .opencode/skills/**       (pending validation against OpenCode skill spec)
 *   hooks    → opencode.json / opencode.jsonc hook entries
 *   Python hooks: invoked via `python3 …` — OpenCode hook JSON format compatible
 *
 * Claude-only tool downgrades (to be injected into prompts by Phase 4):
 *   AskUserQuestion → ultra-tools ask (text-mode numbered list)
 *   TaskCreate/*    → ultra-tools task …
 *   Skill(...)      → ultra-tools skill invoke
 *   Agent(subagent) → recursive CLI call or inlined Bash
 */

const os = require('node:os');
const path = require('node:path');

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
    if (process.env.OPENCODE_CONFIG) return path.dirname(process.env.OPENCODE_CONFIG);
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) return path.join(xdg, 'opencode');
    return path.join(ctx.homeDir || os.homedir(), '.config', 'opencode');
  }
  return path.join(process.cwd(), '.opencode');
}

module.exports = {
  name: 'opencode',
  resolveTarget,
  install(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`opencode adapter install not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
  uninstall(ctx) {
    const target = resolveTarget(ctx);
    throw new Error(`opencode adapter uninstall not implemented (target would be ${target}) — scheduled for Phase 2`);
  },
};
