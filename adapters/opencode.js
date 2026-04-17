'use strict';

/**
 * OpenCode adapter — Phase 4.3 real installer.
 *
 * Target config dirs (XDG Base Directory):
 *   global: $OPENCODE_CONFIG_DIR → $XDG_CONFIG_HOME/opencode → ~/.config/opencode
 *   local:  <cwd>/.opencode
 *
 * What install does:
 *   - copy commands/*.md → <target>/commands/ (frontmatter lowercased)
 *   - copy skills/**    → <target>/skills/ (frontmatter lowercased)
 *   - copy hooks/*.py   → <target>/hooks/ (invoked via python3)
 *   - merge opencode.json: inject mcp.<MCP_SERVER_NAME> entry
 *   - OpenCode exposes only 2 reachable hook events (session.start + event)
 *     — see hooks/adapters/opencode.py for mapping
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
const {
  parse: parseFm,
  serialize: serializeFm,
  lowercaseKeys,
} = require('./_shared/frontmatter.cjs');

const SENTINEL_KEY = '_ubp_manifest';
const MCP_SERVER_NAME = 'ultra-builder-pro';
const SOURCE_TAG = 'ubp';

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
    if (process.env.OPENCODE_CONFIG) return path.dirname(process.env.OPENCODE_CONFIG);
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) return path.join(xdg, 'opencode');
    return path.join(ctx.homeDir || os.homedir(), '.config', 'opencode');
  }
  return path.join(ctx.cwd || process.cwd(), '.opencode');
}

function resolveRepoRoot(ctx) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function lowercaseFrontmatterTransform(buf, relPath) {
  if (!relPath.endsWith('.md')) return buf;
  const text = buf.toString('utf8');
  const { fm, body } = parseFm(text);
  if (!fm) return buf;
  const normalized = lowercaseKeys(fm);
  return Buffer.from(serializeFm(normalized, body), 'utf8');
}

function buildMcpEntry(repoRoot, target) {
  return {
    command: process.execPath,
    args: [path.join(repoRoot, 'mcp-server', 'server.cjs')],
    env: {
      UBP_DB_PATH: path.join(target, 'state.db'),
      UBP_ROOT_DIR: target,
      _source: SOURCE_TAG,
    },
  };
}

function install(ctx) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  ensureDir(target);

  const report = { target, copied: {}, config: { updated: false } };

  // 1. commands — lowercase frontmatter keys in transit
  const commandsSrc = path.join(repoRoot, 'commands');
  if (fs.existsSync(commandsSrc)) {
    report.copied.commands = copyTree(commandsSrc, path.join(target, 'commands'), {
      transform: lowercaseFrontmatterTransform,
    });
    markManaged(path.join(target, 'commands'), { adapter: 'opencode' });
  }

  // 2. skills — same transform
  const skillsSrc = path.join(repoRoot, 'skills');
  if (fs.existsSync(skillsSrc)) {
    report.copied.skills = copyTree(skillsSrc, path.join(target, 'skills'), {
      transform: lowercaseFrontmatterTransform,
    });
    markManaged(path.join(target, 'skills'), { adapter: 'opencode' });
  }

  // 3. hooks python (subset reachable — 2 events; see hooks/adapters/opencode.py)
  const hookFiles = copyFlatByExt(path.join(repoRoot, 'hooks'), path.join(target, 'hooks'), '.py');
  if (hookFiles.length > 0) {
    report.copied.hooks = hookFiles;
    markManaged(path.join(target, 'hooks'), { adapter: 'opencode' });
  }

  // 4. opencode.json — merge mcp entry + sentinel
  const configFile = path.join(target, 'opencode.json');
  const existing = readJsonSafe(configFile);
  const mcp = { ...(existing.mcp || {}) };
  mcp[MCP_SERVER_NAME] = buildMcpEntry(repoRoot, target);
  const next = { ...existing, mcp };
  const withSentinel = withSentinelBlock(next, SENTINEL_KEY, {
    mcp_server_name: MCP_SERVER_NAME,
    hook_adapter: 'hooks/adapters/opencode.py',
    reachable_events: ['session.start', 'event'],
  });
  writeAtomic(configFile, JSON.stringify(withSentinel, null, 2) + '\n');
  report.config.updated = true;
  return report;
}

function uninstall(ctx) {
  const target = resolveTarget(ctx);
  const report = { target, removed: {}, config: { updated: false } };

  const configFile = path.join(target, 'opencode.json');
  if (fs.existsSync(configFile)) {
    const existing = readJsonSafe(configFile);
    if (hasSentinelBlock(existing, SENTINEL_KEY)) {
      const mcp = { ...(existing.mcp || {}) };
      delete mcp[MCP_SERVER_NAME];
      const next = removeSentinelBlock({ ...existing, mcp }, SENTINEL_KEY);
      if (Object.keys(next.mcp || {}).length === 0) delete next.mcp;
      writeAtomic(configFile, JSON.stringify(next, null, 2) + '\n');
      report.config.updated = true;
    }
  }

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
  name: 'opencode',
  SENTINEL_KEY,
  MCP_SERVER_NAME,
  SOURCE_TAG,
  resolveTarget,
  install,
  uninstall,
};
