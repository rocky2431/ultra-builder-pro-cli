'use strict';

/**
 * Claude Code adapter — Phase 4.2 real installer.
 *
 * Target config dirs:
 *   global: ~/.claude (or $CLAUDE_CONFIG_DIR, or --config-dir)
 *   local:  <cwd>/.claude
 *
 * Assets deployed:
 *   commands/*.md  → <target>/commands/
 *   skills/**      → <target>/skills/
 *   hooks/*.py     → <target>/hooks/
 *   mcp-server/    → registered via settings.json mcpServers
 *   settings.json  → merged (hooks tagged with _source='ubp'; mcpServers entry
 *                     carries sibling `_ubp: { source: 'ubp' }` block outside env
 *                    tracked by _ubp_manifest sentinel)
 *
 * Install is idempotent: re-running install produces byte-equal output.
 * Uninstall strips only the items recorded in _ubp_manifest.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  copyTree,
  writeAtomic,
  ensureDir,
  removeTree,
  markManaged,
  isManaged,
  copyFlatByExt,
} = require('./_shared/file-ops.cjs');
const {
  readJsonSafe,
  withSentinelBlock,
  removeSentinelBlock,
  hasSentinelBlock,
} = require('./_shared/settings-merge.cjs');

const SENTINEL_KEY = '_ubp_manifest';
const SOURCE_TAG = 'ubp';
const MCP_SERVER_NAME = 'ultra-builder-pro';

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.CLAUDE_CONFIG_DIR || path.join(ctx.homeDir || os.homedir(), '.claude');
  }
  return path.join(ctx.cwd || process.cwd(), '.claude');
}

function resolveRepoRoot(ctx) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function loadTemplateSettings(repoRoot) {
  const file = path.join(repoRoot, 'settings.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function tagHookEntries(hooksObj) {
  // deep-clone and tag every leaf hook command with _source=ubp
  if (!hooksObj || typeof hooksObj !== 'object') return {};
  const out = {};
  for (const [event, matchers] of Object.entries(hooksObj)) {
    if (!Array.isArray(matchers)) continue;
    out[event] = matchers.map((m) => ({
      ...m,
      hooks: (m.hooks || []).map((h) => ({ ...h, _source: SOURCE_TAG })),
    }));
  }
  return out;
}

function mergeHooks(existingHooks, newHooks) {
  const out = { ...(existingHooks || {}) };
  for (const [event, matchers] of Object.entries(newHooks || {})) {
    const existing = Array.isArray(out[event]) ? out[event] : [];
    // dedupe by _source=ubp command string: replace any existing ubp entries
    const keepUser = existing
      .map((m) => ({
        ...m,
        hooks: (m.hooks || []).filter((h) => h._source !== SOURCE_TAG),
      }))
      .filter((m) => m.hooks && m.hooks.length > 0);
    out[event] = [...keepUser, ...matchers];
  }
  return out;
}

function stripUbpHooks(hooks) {
  if (!hooks || typeof hooks !== 'object') return {};
  const out = {};
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    const filtered = matchers
      .map((m) => ({
        ...m,
        hooks: (m.hooks || []).filter((h) => h._source !== SOURCE_TAG),
      }))
      .filter((m) => m.hooks && m.hooks.length > 0);
    if (filtered.length > 0) out[event] = filtered;
  }
  return out;
}

function buildMcpServerEntry(repoRoot, target) {
  const serverJs = path.join(repoRoot, 'mcp-server', 'server.cjs');
  return {
    command: process.execPath,
    args: [serverJs],
    env: {
      UBP_DB_PATH: path.join(target, 'state.db'),
      UBP_ROOT_DIR: target,
    },
    // Sibling identification block — lives outside env so it never leaks
    // into the child process environment. Used by uninstall to distinguish
    // our mcpServers entry from user-authored ones (P2 #9, D45).
    _ubp: { source: SOURCE_TAG },
  };
}

function install(ctx) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  ensureDir(target);

  const report = { target, copied: {}, config: { updated: false } };

  // 1. Copy commands
  const commandsSrc = path.join(repoRoot, 'commands');
  if (fs.existsSync(commandsSrc)) {
    report.copied.commands = copyTree(commandsSrc, path.join(target, 'commands'));
    markManaged(path.join(target, 'commands'), { adapter: 'claude' });
  }

  // 2. Copy skills (full tree)
  const skillsSrc = path.join(repoRoot, 'skills');
  if (fs.existsSync(skillsSrc)) {
    report.copied.skills = copyTree(skillsSrc, path.join(target, 'skills'));
    markManaged(path.join(target, 'skills'), { adapter: 'claude' });
  }

  // 3. Copy hook python files
  const hookFiles = copyFlatByExt(path.join(repoRoot, 'hooks'), path.join(target, 'hooks'), '.py');
  if (hookFiles.length > 0) {
    report.copied.hooks = hookFiles;
    markManaged(path.join(target, 'hooks'), { adapter: 'claude' });
  }

  // 4. Merge settings.json
  const settingsFile = path.join(target, 'settings.json');
  // rescue=true: if the user's settings.json is syntactically broken, back
  // it up and proceed with an empty object so install can still finish.
  const existing = readJsonSafe(settingsFile, { rescue: true });
  const template = loadTemplateSettings(repoRoot) || {};
  const taggedHooks = tagHookEntries(template.hooks);
  const mergedHooks = mergeHooks(existing.hooks, taggedHooks);

  const mcpServers = { ...(existing.mcpServers || {}) };
  mcpServers[MCP_SERVER_NAME] = buildMcpServerEntry(repoRoot, target);

  const next = {
    ...existing,
    hooks: mergedHooks,
    mcpServers,
  };
  // Preserve user permissions: only seed when absent (permissions structure
  // is nested — we don't want to second-guess the user's allow/deny lists).
  if (!existing.permissions && template.permissions) next.permissions = template.permissions;
  // env: shallow key-wise merge so template defaults like MAX_THINKING_TOKENS
  // land even when the user already set EDITOR or other unrelated keys. User
  // keys still win per-key to preserve overrides.
  const mergedEnv = { ...(template.env || {}), ...(existing.env || {}) };
  if (Object.keys(mergedEnv).length > 0) next.env = mergedEnv;

  const withSentinel = withSentinelBlock(next, SENTINEL_KEY, {
    hook_events: Object.keys(taggedHooks),
    mcp_server_name: MCP_SERVER_NAME,
  });

  writeAtomic(settingsFile, JSON.stringify(withSentinel, null, 2) + '\n');
  report.config.updated = true;
  return report;
}

function uninstall(ctx) {
  const target = resolveTarget(ctx);
  const report = { target, removed: {}, config: { updated: false } };

  const settingsFile = path.join(target, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    const existing = readJsonSafe(settingsFile);
    if (hasSentinelBlock(existing, SENTINEL_KEY)) {
      const strippedHooks = stripUbpHooks(existing.hooks);
      const mcpServers = { ...(existing.mcpServers || {}) };
      delete mcpServers[MCP_SERVER_NAME];
      const next = removeSentinelBlock({ ...existing, hooks: strippedHooks, mcpServers }, SENTINEL_KEY);
      if (Object.keys(next.hooks || {}).length === 0) delete next.hooks;
      if (Object.keys(next.mcpServers || {}).length === 0) delete next.mcpServers;
      writeAtomic(settingsFile, JSON.stringify(next, null, 2) + '\n');
      report.config.updated = true;
    }
  }

  // Remove copied assets — only touch dirs that carry our sentinel file
  for (const sub of ['commands', 'skills', 'hooks']) {
    const dir = path.join(target, sub);
    if (fs.existsSync(dir) && isManaged(dir)) {
      removeTree(dir);
      report.removed[sub] = true;
    }
  }
  return report;
}

module.exports = {
  name: 'claude',
  SENTINEL_KEY,
  SOURCE_TAG,
  MCP_SERVER_NAME,
  resolveTarget,
  install,
  uninstall,
};
