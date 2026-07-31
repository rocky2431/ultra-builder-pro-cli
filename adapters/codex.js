'use strict';

/**
 * Codex adapter.
 *
 * Codex-native mapping:
 *   commands/*.md       -> explicit plugin skills ($ultra-builder-pro:<name>)
 *   skills/**           -> ~/plugins/ultra-builder-pro/skills/**
 *   agents/*.md         -> ~/.codex/agents/*.toml
 *   hooks/*.py          -> plugin hooks with a Codex wire adapter
 *   mcp-server          -> plugin .mcp.json (project cwd owns .ultra/.runtime/state.db)
 *   plugin marketplace  -> ~/.agents/plugins/marketplace.json
 *
 * Deprecated ~/.codex/prompts and ~/.codex/skills projection is intentionally
 * not used. The plugin remains the single distribution boundary for skills,
 * hooks, and MCP; custom agents use Codex's standalone TOML surface.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
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
  applyNativeDoctor,
  buildPlugin,
  installAgents,
} = require('./_shared/codex-assets.cjs');
const provenance = require('./_shared/provenance.cjs');

const MCP_SERVER_NAME = PLUGIN_NAME;
const SOURCE_TAG = 'ubp';
const MARKER_BEGIN = '# >>> ultra-builder-pro managed block — do not edit by hand';
const MARKER_END = '# <<< ultra-builder-pro managed block';
const RUNTIME_MANIFEST_DIR = 'ultra-builder-pro';
const RUNTIME_MANIFEST_FILE = 'install-manifest.json';
const PROVENANCE_FILE = 'provenance.json';
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
  const payload = mergedMarketplace(file);
  writeAtomic(file, JSON.stringify(payload, null, 2) + '\n');
  return { file, name: payload.name, entry: marketplaceEntry() };
}

function mergedMarketplace(file) {
  const payload = loadMarketplace(file);
  const entry = marketplaceEntry();
  const index = payload.plugins.findIndex((plugin) => plugin && plugin.name === PLUGIN_NAME);
  if (index === -1) payload.plugins.push(entry);
  else payload.plugins[index] = entry;
  return payload;
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

function shouldRunHostCli(ctx = {}) {
  if (typeof ctx.runHostCli === 'boolean') return ctx.runHostCli;
  return shouldRunPluginCli(ctx);
}

function runCodexCli(args, ctx = {}) {
  const result = spawnSync(ctx.codexBin || 'codex', args, {
    encoding: 'utf8',
    timeout: ctx.hostCliTimeoutMs || 30000,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: resolveHomeDir(ctx),
      CODEX_HOME: resolveTarget(ctx),
    },
  });
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      const error = new Error(`codex ${args.join(' ')} timed out`);
      error.code = 'HOST_CLI_TIMEOUT';
      throw error;
    }
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`codex ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function runPluginCli(action, marketplaceName, ctx = {}) {
  const selector = `${PLUGIN_NAME}@${marketplaceName}`;
  const args = action === 'add'
    ? ['plugin', 'add', selector, '--json']
    : ['plugin', 'remove', selector, '--json'];
  return { selector, stdout: runCodexCli(args, ctx).trim() };
}

function snapshotPluginRegistration(marketplaceName, ctx = {}) {
  const selector = `${PLUGIN_NAME}@${marketplaceName}`;
  const payload = JSON.parse(runCodexCli(['plugin', 'list', '--json'], ctx));
  if (!payload || !Array.isArray(payload.installed)) {
    throw new Error('codex plugin list --json did not return an installed array');
  }
  const entry = payload.installed.find((plugin) => (
    plugin?.pluginId === selector
    || (plugin?.name === PLUGIN_NAME && plugin?.marketplaceName === marketplaceName)
  )) || null;
  return {
    selector,
    marketplaceName,
    installed: !!entry && entry.installed !== false,
    enabled: !!entry && entry.enabled === true,
    entry,
    config: captureFiles([path.join(resolveTarget(ctx), 'config.toml')])[0],
  };
}

function restorePluginRegistration(snapshot, ctx = {}) {
  const action = snapshot.installed ? 'add' : 'remove';
  let actionError = null;
  let result = null;
  try {
    result = runPluginCli(action, snapshot.marketplaceName, ctx);
  } catch (error) {
    actionError = error;
  }
  let configError = null;
  try {
    restoreFiles([snapshot.config]);
  } catch (error) {
    configError = error;
  }
  if (actionError || configError) {
    throw new AggregateError(
      [actionError, configError].filter(Boolean),
      `Codex ${action} registration rollback failed`,
    );
  }
  return {
    ...result,
    restored: {
      installed: snapshot.installed,
      enabled: snapshot.enabled,
    },
  };
}

function inspectCodexHost(ctx = {}, runtimeManifest = null, expectedPluginVersion = null) {
  const payload = JSON.parse(runCodexCli(['plugin', 'list', '--json'], ctx));
  if (!payload || !Array.isArray(payload.installed)) {
    throw new Error('codex plugin list --json did not return an installed array');
  }
  const marketplaceName = runtimeManifest?.marketplace?.name || 'personal';
  const pluginId = `${PLUGIN_NAME}@${marketplaceName}`;
  const plugin = payload.installed.find((entry) => (
    entry?.pluginId === pluginId
    || (entry?.name === PLUGIN_NAME && entry?.marketplaceName === marketplaceName)
  ));
  const pluginOk = !!plugin
    && plugin.installed === true
    && plugin.enabled === true
    && (!(expectedPluginVersion || runtimeManifest?.plugin?.version)
      || plugin.version === (expectedPluginVersion || runtimeManifest.plugin.version));
  const mcpPayload = JSON.parse(runCodexCli(['mcp', 'list', '--json'], ctx));
  if (!Array.isArray(mcpPayload)) {
    throw new Error('codex mcp list --json did not return an array');
  }
  const expected = JSON.parse(
    fs.readFileSync(path.join(resolvePluginRoot(ctx), '.mcp.json'), 'utf8'),
  ).mcpServers?.[MCP_SERVER_NAME];
  const mcp = mcpPayload.find((entry) => entry?.name === MCP_SERVER_NAME);
  const mcpOk = !!mcp
    && mcp.enabled === true
    && mcp.disabled_reason === null
    && mcp.transport?.type === 'stdio'
    && mcp.transport.command === expected?.command
    && JSON.stringify(mcp.transport.args) === JSON.stringify(expected?.args);
  return { pluginId, plugin, pluginOk, mcp, mcpOk };
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

function listHookCacheVersionsOnDisk(configDir, marketplaceName) {
  const root = pluginCacheRoot(configDir, marketplaceName);
  if (!fs.existsSync(root)) return [];
  return normalizeHookCacheVersions(
    fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name),
  );
}

function listKnownHookCacheVersions(configDir, marketplaceName, manifest = null) {
  const versions = listHookCacheVersionsOnDisk(configDir, marketplaceName);

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

function readPluginManifest(pluginRoot) {
  const file = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const contents = fs.readFileSync(file);
  const manifest = JSON.parse(contents.toString('utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.name !== PLUGIN_NAME) {
    throw new Error(`invalid Codex plugin manifest: ${file}`);
  }
  normalizeHookCacheVersions([manifest.version]);
  return { file, contents, manifest };
}

function codexVersionParts(version) {
  if (typeof version !== 'string') return null;
  const match = /^(.+)\+codex\.([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(version);
  return match ? { base: match[1], cachebuster: match[2] } : null;
}

function bindCachebusterProvenance({
  report,
  runtimeManifest,
  sourceManifest,
  host,
  configDir,
  marketplaceName,
}) {
  const previousVersion = runtimeManifest?.plugin?.version;
  const currentVersion = sourceManifest?.manifest?.version;
  const previous = codexVersionParts(previousVersion);
  const current = codexVersionParts(currentVersion);
  if (!previous || !current || previous.base !== current.base
    || previousVersion === currentVersion) {
    return false;
  }

  const mismatch = report.issues.filter((issue) => (
    issue.code === 'ASSET_HASH_MISMATCH'
    && issue.root === 'plugin'
    && issue.path === path.join('.codex-plugin', 'plugin.json')
  ));
  if (mismatch.length !== 1
    || !host?.pluginOk
    || host.plugin?.version !== currentVersion) {
    report.checks.cachebuster_binding = { status: 'fail' };
    return false;
  }

  const originalManifest = {
    ...sourceManifest.manifest,
    version: previousVersion,
  };
  const originalHash = crypto.createHash('sha256')
    .update(`${JSON.stringify(originalManifest, null, 2)}\n`)
    .digest('hex');
  const cacheManifestFile = path.join(
    pluginCacheRoot(configDir, marketplaceName),
    currentVersion,
    '.codex-plugin',
    'plugin.json',
  );
  let cacheMatchesSource = false;
  try {
    cacheMatchesSource = crypto.createHash('sha256')
      .update(fs.readFileSync(cacheManifestFile))
      .digest('hex')
      === crypto.createHash('sha256')
        .update(sourceManifest.contents)
        .digest('hex');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (originalHash !== mismatch[0].expected || !cacheMatchesSource) {
    report.checks.cachebuster_binding = { status: 'fail' };
    return false;
  }

  report.issues = report.issues.filter((issue) => issue !== mismatch[0]);
  report.checks.assets.failed -= 1;
  if (report.checks.assets.failed === 0) report.checks.assets.status = 'pass';
  report.checks.cachebuster_binding = {
    status: 'pass',
    previous_version: previousVersion,
    current_version: currentVersion,
    cache_manifest: cacheManifestFile,
  };
  return true;
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

function captureFiles(files) {
  return [...new Set(files)].map((file) => {
    try {
      const stat = fs.statSync(file);
      return { file, exists: true, contents: fs.readFileSync(file), mode: stat.mode & 0o7777 };
    } catch (error) {
      if (error.code === 'ENOENT') return { file, exists: false };
      throw error;
    }
  });
}

function restoreFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      try {
        fs.unlinkSync(snapshot.file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      continue;
    }
    writeAtomic(snapshot.file, snapshot.contents);
    fs.chmodSync(snapshot.file, snapshot.mode);
  }
}

function publishStagedAgents(staged, configDir) {
  const targetRoot = path.join(configDir, 'agents');
  ensureDir(targetRoot);
  for (const file of staged.installed) {
    const target = path.join(targetRoot, file);
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target, 'utf8');
      if (!existing.startsWith(`# ${MANAGED_MARKER}`)) {
        throw new Error(`refusing to overwrite unmanaged Codex agent: ${target}`);
      }
    }
  }
  for (const file of staged.installed) {
    writeAtomic(
      path.join(targetRoot, file),
      fs.readFileSync(path.join(staged.root, file)),
    );
  }
  return { root: targetRoot, installed: staged.installed };
}

function install(ctx = {}) {
  const configDir = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const marketplaceFile = resolveMarketplaceFile(ctx);
  ensureDir(configDir);

  const previousManifest = readRuntimeManifest(configDir);
  if (fs.existsSync(pluginRoot) && !isManaged(pluginRoot)) {
    throw new Error(`refusing to replace unmanaged plugin directory: ${pluginRoot}`);
  }
  ensureDir(path.dirname(pluginRoot));
  const stagingRoot = fs.mkdtempSync(path.join(path.dirname(pluginRoot), `.${PLUGIN_NAME}-staging-`));
  const backupRoot = `${stagingRoot}-previous`;
  const agentStagingConfig = fs.mkdtempSync(path.join(configDir, `.${PLUGIN_NAME}-agents-`));
  let plugin = null;
  let stagedAgents = null;
  let agents = null;
  let marketplace = null;
  let previousVersions = [];
  let previousAdapters = [];
  let snapshots = [];
  let movedPrevious = false;
  let published = false;
  let registration = null;
  let registrationSnapshot = null;
  let registrationAttempted = false;
  let hookCompatibility = null;
  let legacy = { configUpdated: false, removed: [] };
  try {
    plugin = buildPlugin({ repoRoot, pluginRoot: stagingRoot, publishedRoot: pluginRoot });
    stagedAgents = installAgents({ repoRoot, configDir: agentStagingConfig });
    const marketplacePayload = mergedMarketplace(marketplaceFile);
    marketplace = {
      file: marketplaceFile,
      name: marketplacePayload.name,
      entry: marketplaceEntry(),
    };
    previousVersions = listKnownHookCacheVersions(
      configDir,
      marketplace.name,
      previousManifest,
    );
    previousAdapters = hookAdaptersForVersions(
      configDir,
      marketplace.name,
      previousVersions,
    );
    snapshots = captureFiles([
      marketplaceFile,
      runtimeManifestFile(configDir),
      path.join(configDir, RUNTIME_MANIFEST_DIR, PROVENANCE_FILE),
      ...stagedAgents.installed.map((file) => path.join(configDir, 'agents', file)),
      ...previousAdapters,
    ]);

    if (fs.existsSync(pluginRoot)) {
      fs.renameSync(pluginRoot, backupRoot);
      movedPrevious = true;
    }
    fs.renameSync(stagingRoot, pluginRoot);
    published = true;
    agents = publishStagedAgents(stagedAgents, configDir);
    writeAtomic(marketplaceFile, JSON.stringify(marketplacePayload, null, 2) + '\n');

    if (shouldRunPluginCli(ctx)) {
      registrationSnapshot = snapshotPluginRegistration(marketplace.name, ctx);
      registrationAttempted = true;
      registration = runPluginCli('add', marketplace.name, ctx);
      if (typeof ctx.afterPluginRegistration === 'function') {
        ctx.afterPluginRegistration({
          action: 'add',
          before: registrationSnapshot,
          registration,
        });
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
    const source = provenance.packageSource(repoRoot);
    const provenanceFile = path.join(configDir, RUNTIME_MANIFEST_DIR, PROVENANCE_FILE);
    const provenanceManifest = provenance.writeProvenance({
      file: provenanceFile,
      adapter: 'codex',
      ...source,
      roots: { plugin: pluginRoot, config: configDir },
      assets: [
        ...provenance.assetRefsForTree('plugin', pluginRoot, {
          exclude: ['.ubp-managed'],
        }),
        ...agents.installed.map((file) => ({ root: 'config', path: path.join('agents', file) })),
        { root: 'config', path: path.join(RUNTIME_MANIFEST_DIR, RUNTIME_MANIFEST_FILE) },
      ],
      contracts: {
        plugin_manifest: { root: 'plugin', path: '.codex-plugin/plugin.json' },
        mcp_registration: { root: 'plugin', path: '.mcp.json' },
        mcp_launcher: { root: 'plugin', path: 'runtime/launch.cjs' },
        native_runtime: { root: 'plugin', path: 'runtime/native-runtime.json' },
        context_envelope_helper: { root: 'plugin', path: 'runtime/hook-context.cjs' },
        hook_event_helper: { root: 'plugin', path: 'runtime/hook-event.cjs' },
        hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
        hook_adapter: { root: 'plugin', path: HOOK_ADAPTER_RELATIVE },
        runtime_manifest: { root: 'config', path: path.join(RUNTIME_MANIFEST_DIR, RUNTIME_MANIFEST_FILE) },
      },
    });
    provenanceManifest.file = provenanceFile;
    legacy = cleanupLegacyConfig(configDir);
    if (movedPrevious) removeTree(backupRoot);
    removeTree(agentStagingConfig);
    return {
      target: configDir,
      plugin,
      agents,
      marketplace,
      registration,
      hookCompatibility,
      legacy,
      manifestFile,
      provenance: provenanceManifest,
      config: { updated: legacy.configUpdated },
    };
  } catch (error) {
    if (published && fs.existsSync(pluginRoot)) removeTree(pluginRoot);
    else if (fs.existsSync(stagingRoot)) removeTree(stagingRoot);
    if (movedPrevious && fs.existsSync(backupRoot)) fs.renameSync(backupRoot, pluginRoot);
    let rollbackError = null;
    try {
      const currentCache = marketplace && plugin
        ? path.join(pluginCacheRoot(configDir, marketplace.name), plugin.version)
        : null;
      if (currentCache && !previousVersions.includes(plugin.version) && fs.existsSync(currentCache)) {
        removeTree(currentCache);
      }
      if (registrationAttempted && registrationSnapshot) {
        restorePluginRegistration(registrationSnapshot, ctx);
      }
      restoreFiles(snapshots);
    } catch (caught) {
      rollbackError = caught;
    } finally {
      if (fs.existsSync(agentStagingConfig)) removeTree(agentStagingConfig);
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Codex install and rollback both failed',
      );
    }
    throw error;
  }
}

function doctor(ctx = {}) {
  const configDir = resolveTarget(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const marketplaceFile = resolveMarketplaceFile(ctx);
  const source = provenance.packageSource(repoRoot);
  const report = provenance.inspectProvenance({
    file: path.join(configDir, RUNTIME_MANIFEST_DIR, PROVENANCE_FILE),
    expectedAdapter: 'codex',
    expectedPackageVersion: source.packageInfo.version,
  });

  let runtimeManifest = null;
  try {
    runtimeManifest = readRuntimeManifest(configDir);
  } catch (error) {
    report.issues.push({ code: 'RUNTIME_MANIFEST_INVALID', message: error.message });
  }
  const runtimeManifestOk = runtimeManifest?.source === SOURCE_TAG
    && runtimeManifest.adapter === 'codex'
    && runtimeManifest.plugin?.root === pluginRoot
    && typeof runtimeManifest.plugin?.version === 'string';
  if (!runtimeManifestOk && !report.issues.some((entry) => entry.code === 'RUNTIME_MANIFEST_INVALID')) {
    report.issues.push({ code: 'RUNTIME_MANIFEST_INVALID', path: runtimeManifestFile(configDir) });
  }
  report.checks.runtime_manifest = { status: runtimeManifestOk ? 'pass' : 'fail' };

  let marketplaceOk = false;
  try {
    const marketplace = loadMarketplace(marketplaceFile);
    const entry = marketplace.plugins.find((plugin) => plugin?.name === PLUGIN_NAME);
    marketplaceOk = entry?.source?.source === 'local'
      && entry.source.path === `./plugins/${PLUGIN_NAME}`;
  } catch (error) {
    report.issues.push({ code: 'MARKETPLACE_REGISTRATION_INVALID', message: error.message });
  }
  if (!marketplaceOk && !report.issues.some((entry) => entry.code === 'MARKETPLACE_REGISTRATION_INVALID')) {
    report.issues.push({ code: 'MARKETPLACE_REGISTRATION_INVALID', path: marketplaceFile });
  }
  report.checks.marketplace = { status: marketplaceOk ? 'pass' : 'fail' };

  let sourceManifest = null;
  try {
    sourceManifest = readPluginManifest(pluginRoot);
  } catch (error) {
    report.issues.push({ code: 'PLUGIN_MANIFEST_INVALID', message: error.message });
  }

  let host = null;
  if (shouldRunHostCli(ctx)) {
    try {
      host = inspectCodexHost(
        ctx,
        runtimeManifest,
        sourceManifest?.manifest?.version || null,
      );
      report.checks.host_plugin = { status: host.pluginOk ? 'pass' : 'fail' };
      report.checks.host_mcp = { status: host.mcpOk ? 'pass' : 'fail' };
      if (!host.pluginOk) {
        report.issues.push({
          code: 'HOST_PLUGIN_NOT_DISCOVERED',
          plugin_id: host.pluginId,
        });
      }
      if (!host.mcpOk) {
        report.issues.push({
          code: 'HOST_MCP_NOT_DISCOVERED',
          plugin_id: host.pluginId,
          server: MCP_SERVER_NAME,
        });
      }
    } catch (error) {
      report.checks.host_plugin = { status: 'fail' };
      report.checks.host_mcp = { status: 'fail' };
      report.issues.push({
        code: error.code === 'HOST_CLI_TIMEOUT'
          ? 'HOST_CLI_TIMEOUT'
          : 'HOST_CLI_INSPECTION_FAILED',
        message: error.message,
      });
    }
  }

  const marketplaceName = runtimeManifest?.marketplace?.name || 'personal';
  if (runtimeManifestOk && sourceManifest && host) {
    bindCachebusterProvenance({
      report,
      runtimeManifest,
      sourceManifest,
      host,
      configDir,
      marketplaceName,
    });
  }

  let hookTargetsOk = runtimeManifestOk;
  if (runtimeManifestOk) {
    const cacheRoot = pluginCacheRoot(configDir, marketplaceName);
    let requiredVersions = [];
    try {
      requiredVersions = listHookCacheVersionsOnDisk(configDir, marketplaceName);
      const activeVersion = host?.plugin?.installed === true
        ? host.plugin.version
        : (shouldRunPluginCli(ctx)
          ? sourceManifest?.manifest?.version || runtimeManifest.plugin.version
          : null);
      if (activeVersion) {
        requiredVersions = normalizeHookCacheVersions([
          ...requiredVersions,
          activeVersion,
        ]);
      }
    } catch (error) {
      hookTargetsOk = false;
      report.issues.push({ code: 'HOOK_CACHE_INVALID', message: error.message });
    }
    for (const version of requiredVersions) {
      const adapter = path.join(cacheRoot, version, HOOK_ADAPTER_RELATIVE);
      if (!fs.existsSync(adapter)) {
        hookTargetsOk = false;
        report.issues.push({ code: 'HOOK_TARGET_MISSING', version, path: adapter });
      }
    }
  }
  report.checks.hook_targets = { status: hookTargetsOk ? 'pass' : 'fail' };
  return applyNativeDoctor(report, path.join(pluginRoot, 'runtime'));
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
  let registration = null;
  let registrationSnapshot = null;
  let registrationAttempted = false;
  try {
    if (shouldRunPluginCli(ctx)) {
      registrationSnapshot = snapshotPluginRegistration(marketplaceBefore.name, ctx);
      registrationAttempted = true;
      registration = runPluginCli('remove', marketplaceBefore.name, ctx);
      if (typeof ctx.afterPluginRegistration === 'function') {
        ctx.afterPluginRegistration({
          action: 'remove',
          before: registrationSnapshot,
          registration,
        });
      }
    }
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
  } catch (error) {
    if (registrationAttempted && registrationSnapshot) {
      try {
        restorePluginRegistration(registrationSnapshot, ctx);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Codex uninstall and registration rollback both failed',
        );
      }
    }
    throw error;
  }
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
  doctor,
  _internal: {
    stripManagedBlock,
    hasManagedBlock,
    cleanupLegacyConfig,
    loadMarketplace,
    upsertMarketplace,
    removeMarketplaceEntry,
    runPluginCli,
    runCodexCli,
    snapshotPluginRegistration,
    restorePluginRegistration,
    inspectCodexHost,
    pluginCacheRoot,
    listKnownHookCacheVersions,
    listCachedHookAdapters,
    prepareHookAdapterPath,
    restoreCachedHookAdapters,
  },
};
