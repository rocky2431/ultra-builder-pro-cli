'use strict';

/**
 * Codex adapter.
 *
 * Codex-native mapping:
 *   commands/*.md       -> explicit plugin skills ($ultra-builder-pro:<name>)
 *   skills/**           -> ~/plugins/ultra-builder-pro/skills/**
 *   agents/*.md         -> ~/.codex/agents/*.toml
 *   hooks/*.py          -> plugin hooks with a Codex wire adapter
 *   mcp-server          -> plugin .mcp.json (project cwd owns .ultra/state.db)
 *   plugin marketplace  -> ~/.agents/plugins/marketplace.json
 *
 * Deprecated ~/.codex/prompts and ~/.codex/skills projection is intentionally
 * not used. The plugin remains the single distribution boundary for skills,
 * hooks, and MCP; custom agents use Codex's standalone TOML surface.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  ensureDir,
  isManaged,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const {
  PLUGIN_NAME,
  MANAGED_MARKER,
  buildPlugin,
  installAgents,
} = require('./_shared/codex-assets.cjs');

const MCP_SERVER_NAME = PLUGIN_NAME;
const SOURCE_TAG = 'ubp';
const MARKER_BEGIN = '# >>> ultra-builder-pro managed block — do not edit by hand';
const MARKER_END = '# <<< ultra-builder-pro managed block';
const RUNTIME_MANIFEST_DIR = 'ultra-builder-pro';
const RUNTIME_MANIFEST_FILE = 'install-manifest.json';
const HOOK_ADAPTER_RELATIVE = path.join('hooks', 'adapters', 'codex.py');

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    return process.env.CODEX_HOME || path.join(ctx.homeDir || os.homedir(), '.codex');
  }
  return path.join(ctx.cwd || process.cwd(), '.codex');
}

function resolveHomeDir(ctx = {}) {
  return path.resolve(ctx.homeDir || os.homedir());
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveHomeDir(ctx), 'plugins', PLUGIN_NAME);
}

function resolveMarketplaceFile(ctx = {}) {
  return path.join(resolveHomeDir(ctx), '.agents', 'plugins', 'marketplace.json');
}

function runtimeManifestFile(configDir) {
  return path.join(configDir, RUNTIME_MANIFEST_DIR, RUNTIME_MANIFEST_FILE);
}

function stripManagedBlock(text) {
  const begin = text.indexOf(MARKER_BEGIN);
  if (begin === -1) return text;
  const end = text.indexOf(MARKER_END, begin);
  if (end === -1) return text;
  const endLine = text.indexOf('\n', end);
  const after = endLine === -1 ? text.length : endLine + 1;
  const leading = text.slice(0, begin).replace(/\n+$/, '\n');
  return leading + text.slice(after);
}

function hasManagedBlock(text) {
  return text.includes(MARKER_BEGIN);
}

function cleanupLegacyConfig(configDir) {
  const configFile = path.join(configDir, 'config.toml');
  let configUpdated = false;
  if (fs.existsSync(configFile)) {
    const existing = fs.readFileSync(configFile, 'utf8');
    if (hasManagedBlock(existing)) {
      const stripped = stripManagedBlock(existing);
      if (stripped.trim()) writeAtomic(configFile, stripped);
      else fs.unlinkSync(configFile);
      configUpdated = true;
    }
  }

  const removed = [];
  for (const sub of ['skills', 'prompts']) {
    const dir = path.join(configDir, sub);
    if (fs.existsSync(dir) && isManaged(dir)) {
      removeTree(dir);
      removed.push(sub);
    }
  }
  return { configUpdated, removed };
}

function loadMarketplace(file) {
  if (!fs.existsSync(file)) {
    return {
      name: 'personal',
      interface: { displayName: 'Personal' },
      plugins: [],
    };
  }
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    throw new Error(`${file} must contain a non-empty marketplace name`);
  }
  if (!payload.interface || typeof payload.interface !== 'object' || Array.isArray(payload.interface)) {
    payload.interface = { displayName: 'Personal' };
  }
  if (!Array.isArray(payload.plugins)) {
    throw new Error(`${file} field plugins must be an array`);
  }
  return payload;
}

function marketplaceEntry() {
  return {
    name: PLUGIN_NAME,
    source: { source: 'local', path: `./plugins/${PLUGIN_NAME}` },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  };
}

function upsertMarketplace(file) {
  const payload = loadMarketplace(file);
  const entry = marketplaceEntry();
  const index = payload.plugins.findIndex((plugin) => plugin && plugin.name === PLUGIN_NAME);
  if (index === -1) payload.plugins.push(entry);
  else payload.plugins[index] = entry;
  writeAtomic(file, JSON.stringify(payload, null, 2) + '\n');
  return { file, name: payload.name, entry };
}

function removeMarketplaceEntry(file) {
  if (!fs.existsSync(file)) return { file, updated: false, name: 'personal' };
  const payload = loadMarketplace(file);
  const next = payload.plugins.filter((plugin) => !plugin || plugin.name !== PLUGIN_NAME);
  if (next.length === payload.plugins.length) {
    return { file, updated: false, name: payload.name };
  }
  payload.plugins = next;
  writeAtomic(file, JSON.stringify(payload, null, 2) + '\n');
  return { file, updated: true, name: payload.name };
}

function shouldRunPluginCli(ctx = {}) {
  if (typeof ctx.runPluginCli === 'boolean') return ctx.runPluginCli;
  return ctx.scope === 'global' && !ctx.configDir;
}

function runPluginCli(action, marketplaceName, ctx = {}) {
  const codexBin = ctx.codexBin || 'codex';
  const selector = `${PLUGIN_NAME}@${marketplaceName}`;
  const args = action === 'add'
    ? ['plugin', 'add', selector, '--json']
    : ['plugin', 'remove', selector];
  const result = spawnSync(codexBin, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`codex plugin ${action} failed${detail ? `: ${detail}` : ''}`);
  }
  return { selector, stdout: result.stdout.trim() };
}

function pluginCacheRoot(configDir, marketplaceName) {
  if (typeof marketplaceName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(marketplaceName)) {
    throw new Error(`invalid Codex marketplace name: ${marketplaceName}`);
  }
  return path.join(configDir, 'plugins', 'cache', marketplaceName, PLUGIN_NAME);
}

function normalizeHookCacheVersions(versions) {
  const normalized = new Set();
  for (const version of versions) {
    if (typeof version !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(version)) {
      throw new Error(`invalid Codex plugin cache version: ${String(version)}`);
    }
    normalized.add(version);
  }
  return [...normalized].sort();
}

function listKnownHookCacheVersions(configDir, marketplaceName, manifest = null) {
  const root = pluginCacheRoot(configDir, marketplaceName);
  const versions = [];
  if (fs.existsSync(root)) {
    versions.push(...fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name));
  }

  if (manifest && manifest.source === SOURCE_TAG && manifest.adapter === 'codex') {
    if (manifest.plugin && manifest.plugin.version !== undefined) {
      versions.push(manifest.plugin.version);
    }
    if (manifest.hook_cache_versions !== undefined) {
      if (!Array.isArray(manifest.hook_cache_versions)) {
        throw new Error('invalid Codex runtime manifest hook_cache_versions');
      }
      versions.push(...manifest.hook_cache_versions);
    }
  }
  return normalizeHookCacheVersions(versions);
}

function hookAdaptersForVersions(configDir, marketplaceName, versions) {
  const root = pluginCacheRoot(configDir, marketplaceName);
  return normalizeHookCacheVersions(versions)
    .map((version) => path.join(root, version, HOOK_ADAPTER_RELATIVE));
}

function listCachedHookAdapters(configDir, marketplaceName, manifest = null) {
  return hookAdaptersForVersions(
    configDir,
    marketplaceName,
    listKnownHookCacheVersions(configDir, marketplaceName, manifest),
  );
}

function hookForwarder(target) {
  return `#!/usr/bin/env python3
"""Forward a live Codex task from a retired plugin cache to the current adapter."""

import runpy

runpy.run_path(${JSON.stringify(path.resolve(target))}, run_name="__main__")
`;
}

function prepareHookAdapterPath(file) {
  const versionRoot = path.dirname(path.dirname(path.dirname(file)));
  try {
    const stat = fs.lstatSync(versionRoot);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(versionRoot);
    } else if (!stat.isDirectory()) {
      throw new Error(`Codex plugin cache version is not a directory: ${versionRoot}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function restoreCachedHookAdapters(previousAdapters, target) {
  const resolvedTarget = path.resolve(target);
  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`current Codex hook adapter is missing: ${resolvedTarget}`);
  }
  const restored = [];
  for (const previous of previousAdapters) {
    if (path.resolve(previous) === resolvedTarget || fs.existsSync(previous)) continue;
    prepareHookAdapterPath(previous);
    writeAtomic(previous, hookForwarder(resolvedTarget));
    restored.push(previous);
  }
  return { target: resolvedTarget, restored };
}

function currentHookAdapter(configDir, marketplaceName, plugin) {
  const cached = path.join(pluginCacheRoot(configDir, marketplaceName), plugin.version, HOOK_ADAPTER_RELATIVE);
  if (fs.existsSync(cached)) return cached;
  return path.join(plugin.root, HOOK_ADAPTER_RELATIVE);
}

function writeRuntimeManifest(configDir, data) {
  const file = runtimeManifestFile(configDir);
  writeAtomic(file, JSON.stringify({
    source: SOURCE_TAG,
    adapter: 'codex',
    plugin: data.plugin,
    marketplace: data.marketplace,
    agents: data.agents,
    hook_cache_versions: data.hookCacheVersions,
  }, null, 2) + '\n');
  return file;
}

function install(ctx = {}) {
  const configDir = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const marketplaceFile = resolveMarketplaceFile(ctx);
  ensureDir(configDir);

  const previousManifest = readRuntimeManifest(configDir);
  const legacy = cleanupLegacyConfig(configDir);
  const plugin = buildPlugin({ repoRoot, pluginRoot });
  const agents = installAgents({ repoRoot, configDir });
  const marketplace = upsertMarketplace(marketplaceFile);
  const previousVersions = listKnownHookCacheVersions(
    configDir,
    marketplace.name,
    previousManifest,
  );

  let registration = null;
  let hookCompatibility = null;
  if (shouldRunPluginCli(ctx)) {
    const previousAdapters = hookAdaptersForVersions(
      configDir,
      marketplace.name,
      previousVersions,
    );
    try {
      registration = runPluginCli('add', marketplace.name, ctx);
    } catch (registrationError) {
      try {
        hookCompatibility = restoreCachedHookAdapters(
          previousAdapters,
          currentHookAdapter(configDir, marketplace.name, plugin),
        );
      } catch (recoveryError) {
        throw new AggregateError(
          [registrationError, recoveryError],
          `codex plugin add and hook cache recovery both failed`,
        );
      }
      throw registrationError;
    }
    hookCompatibility = restoreCachedHookAdapters(
      previousAdapters,
      currentHookAdapter(configDir, marketplace.name, plugin),
    );
  }
  const hookCacheVersions = normalizeHookCacheVersions([
    ...previousVersions,
    plugin.version,
  ]);
  const manifestFile = writeRuntimeManifest(configDir, {
    plugin: { root: plugin.root, version: plugin.version },
    marketplace: { file: marketplace.file, name: marketplace.name },
    agents: agents.installed,
    hookCacheVersions,
  });

  return {
    target: configDir,
    plugin,
    agents,
    marketplace,
    registration,
    hookCompatibility,
    legacy,
    manifestFile,
    config: { updated: legacy.configUpdated },
  };
}

function removeManagedAgents(configDir, manifest) {
  const agentRoot = path.join(configDir, 'agents');
  const requested = manifest && Array.isArray(manifest.agents)
    ? manifest.agents
    : (fs.existsSync(agentRoot) ? fs.readdirSync(agentRoot).filter((name) => name.endsWith('.toml')) : []);
  const removed = [];
  for (const file of requested) {
    const target = path.join(agentRoot, path.basename(file));
    if (!fs.existsSync(target)) continue;
    const contents = fs.readFileSync(target, 'utf8');
    if (!contents.startsWith(`# ${MANAGED_MARKER}`)) continue;
    fs.unlinkSync(target);
    removed.push(path.basename(target));
  }
  return removed;
}

function readRuntimeManifest(configDir) {
  const file = runtimeManifestFile(configDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`invalid Codex runtime manifest ${file}: ${error.message}`, { cause: error });
  }
}

function uninstall(ctx = {}) {
  const configDir = resolveTarget(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const marketplaceFile = resolveMarketplaceFile(ctx);
  const manifest = readRuntimeManifest(configDir);
  const marketplaceBefore = loadMarketplace(marketplaceFile);

  const registration = shouldRunPluginCli(ctx)
    ? runPluginCli('remove', marketplaceBefore.name, ctx)
    : null;
  const agents = removeManagedAgents(configDir, manifest);

  let pluginRemoved = false;
  if (fs.existsSync(pluginRoot) && fs.existsSync(path.join(pluginRoot, '.ubp-managed'))) {
    removeTree(pluginRoot);
    pluginRemoved = true;
  }
  const marketplace = removeMarketplaceEntry(marketplaceFile);
  const legacy = cleanupLegacyConfig(configDir);
  const manifestDir = path.join(configDir, RUNTIME_MANIFEST_DIR);
  if (fs.existsSync(manifestDir)) removeTree(manifestDir);

  return {
    target: configDir,
    removed: { plugin: pluginRemoved, agents },
    marketplace,
    registration,
    legacy,
    config: { updated: legacy.configUpdated },
  };
}

module.exports = {
  name: 'codex',
  MCP_SERVER_NAME,
  MARKER_BEGIN,
  MARKER_END,
  SOURCE_TAG,
  resolveTarget,
  resolveHomeDir,
  resolvePluginRoot,
  resolveMarketplaceFile,
  install,
  uninstall,
  _internal: {
    stripManagedBlock,
    hasManagedBlock,
    cleanupLegacyConfig,
    loadMarketplace,
    upsertMarketplace,
    removeMarketplaceEntry,
    runPluginCli,
    pluginCacheRoot,
    listKnownHookCacheVersions,
    listCachedHookAdapters,
    prepareHookAdapterPath,
    restoreCachedHookAdapters,
  },
};
