'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  copyHooks,
  copySkills,
  inspectPlugin,
  markManaged,
  publishManagedTrees,
  removeManaged,
  writePluginProvenance,
} = require('./_shared/plugin-core.cjs');
const {
  captureAbsent,
  ensureDir,
  isManaged,
  managedMetadata,
  pruneCreatedEmpty,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const { zcodeBinary } = require('./_shared/host-profile.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const INLINE_PLUGIN_ID = `${PLUGIN_NAME}@inline`;

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  const configured = ctx.zcodeHome || ctx.env?.ZCODE_HOME || process.env.ZCODE_HOME;
  return configured ? path.resolve(configured) : path.join(ctx.homeDir || os.homedir(), '.zcode');
}

function resolveCliRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), 'cli');
}

function resolveConfigFile(ctx = {}) {
  return path.join(resolveCliRoot(ctx), 'config.json');
}

function resolveMarketplaceRoot(ctx = {}) {
  return path.join(resolveCliRoot(ctx), 'plugins', 'marketplaces', PLUGIN_NAME);
}

function resolveMarketplaceFile(ctx = {}) {
  return path.join(resolveMarketplaceRoot(ctx), 'marketplace.json');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveMarketplaceRoot(ctx), 'plugin');
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function assertPluginScope(ctx = {}) {
  if (ctx.scope === 'local' && !ctx.configDir) {
    throw new Error('ZCode plugins are user-scoped; use global scope or an isolated configDir');
  }
}

function hookProcess(name) {
  return {
    type: 'process',
    command: 'python3',
    args: [`\${ZCODE_PLUGIN_ROOT}/hooks/adapters/zcode.py`, name],
    timeoutMs: 10000,
  };
}

function buildHooksManifest() {
  return {
    hooks: {
      SessionStart: [
        { matcher: 'startup|resume|clear', hooks: [hookProcess('session_context.py')] },
        { matcher: 'compact', hooks: [hookProcess('compact_context.py')] },
      ],
      PreToolUse: [
        { matcher: 'Write|Edit|ApplyPatch|Grep', hooks: [hookProcess('mid_workflow_recall.py')] },
        { matcher: 'Bash', hooks: [hookProcess('block_dangerous_commands.py')] },
      ],
      PostToolUse: [
        { matcher: 'Write|Edit|ApplyPatch', hooks: [hookProcess('post_edit_guard.py')] },
      ],
    },
  };
}

function loadConfig(file) {
  if (!fs.existsSync(file)) return {};
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`invalid ZCode config: ${file}`);
  }
  if (value.plugins !== undefined && (
    !value.plugins || Array.isArray(value.plugins) || typeof value.plugins !== 'object'
  )) throw new Error(`invalid ZCode plugins config: ${file}`);
  if (value.plugins?.dirs !== undefined && (
    !Array.isArray(value.plugins.dirs)
    || !value.plugins.dirs.every((entry) => typeof entry === 'string' && entry)
  )) throw new Error(`invalid ZCode plugins.dirs config: ${file}`);
  if (value.plugins?.enabled !== undefined && typeof value.plugins.enabled !== 'boolean') {
    throw new Error(`invalid ZCode plugins.enabled config: ${file}`);
  }
  return value;
}

function configOwnership(file, pluginRoot) {
  const exists = fs.existsSync(file);
  const config = loadConfig(file);
  const plugins = config.plugins;
  return {
    file_created: !exists,
    plugins_created: plugins === undefined,
    enabled_created: plugins === undefined || !Object.hasOwn(plugins, 'enabled'),
    enabled_previous: plugins?.enabled,
    dirs_created: plugins === undefined || !Object.hasOwn(plugins, 'dirs'),
    dir_preexisting: Array.isArray(plugins?.dirs) && plugins.dirs.includes(pluginRoot),
  };
}

function registeredConfig(config, pluginRoot) {
  const plugins = config.plugins ? { ...config.plugins } : {};
  const dirs = Array.isArray(plugins.dirs) ? [...plugins.dirs] : [];
  if (!dirs.includes(pluginRoot)) dirs.push(pluginRoot);
  plugins.enabled = true;
  plugins.dirs = dirs;
  return { ...config, plugins };
}

function unregisteredConfig(config, pluginRoot, ownership) {
  if (!config.plugins || Array.isArray(config.plugins) || typeof config.plugins !== 'object') {
    throw new Error('cannot unregister Ultra from an invalid ZCode plugins config');
  }
  const next = { ...config, plugins: { ...config.plugins } };
  if (!ownership.dir_preexisting && Array.isArray(next.plugins.dirs)) {
    next.plugins.dirs = next.plugins.dirs.filter((entry) => entry !== pluginRoot);
  }
  if (ownership.dirs_created && next.plugins.dirs?.length === 0) delete next.plugins.dirs;

  if (ownership.enabled_created) {
    if (next.plugins.enabled === true) delete next.plugins.enabled;
  } else if (next.plugins.enabled === true && ownership.enabled_previous !== true) {
    next.plugins.enabled = ownership.enabled_previous;
  }
  if (ownership.plugins_created && Object.keys(next.plugins).length === 0) delete next.plugins;
  return next;
}

function buildStaging(repoRoot, staging, publishedRoot) {
  const plugin = path.join(staging, 'plugin');
  const skills = copySkills({ runtime: 'zcode', repoRoot, skillRoot: path.join(plugin, 'skills') });
  copyHooks({
    runtime: 'zcode', repoRoot, hookRoot: path.join(plugin, 'hooks'),
    hooksManifest: buildHooksManifest(),
  });
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeAtomic(path.join(plugin, '.zcode-plugin', 'plugin.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'File-first Ultra Builder Pro workflows for ZCode.',
    author: { name: pkg.author },
    homepage: pkg.homepage,
    repository: pkg.repository?.url || pkg.repository,
    license: pkg.license,
    skills: './skills',
    hooks: './hooks/hooks.json',
  }, null, 2)}\n`);
  writeAtomic(path.join(staging, 'marketplace.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    plugins: [{
      name: PLUGIN_NAME,
      version: pkg.version,
      description: 'File-first Ultra Builder Pro workflows for ZCode.',
      source: './plugin',
    }],
  }, null, 2)}\n`);
  markManaged(plugin, { adapter: 'zcode', plugin: PLUGIN_NAME, version: pkg.version });
  writePluginProvenance({
    adapter: 'zcode', repoRoot, stagingRoot: plugin, publishedRoot,
    contracts: {
      plugin_manifest: { root: 'plugin', path: '.zcode-plugin/plugin.json' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      hook_adapter: { root: 'plugin', path: 'hooks/adapters/zcode.py' },
    },
  });
  return { skills };
}

function shouldRunHostCli(ctx = {}) {
  if (typeof ctx.runHostCli === 'boolean') return ctx.runHostCli;
  return ctx.scope === 'global' && !ctx.configDir;
}

function zcodeCommand(ctx, args) {
  const selected = ctx.zcodeBin || process.env.ZCODE_BIN || zcodeBinary();
  const command = selected.endsWith('.cjs') || selected.endsWith('.js') ? process.execPath : selected;
  const argv = command === selected ? args : [selected, ...args];
  const result = spawnSync(command, argv, {
    encoding: 'utf8',
    timeout: ctx.hostCliTimeoutMs || 30000,
    env: { ...process.env, HOME: ctx.homeDir || os.homedir() },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `zcode ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function nativePlugin(ctx) {
  const value = JSON.parse(zcodeCommand(ctx, ['plugins', 'list', '--json']));
  if (!Array.isArray(value.plugins)) throw new Error('zcode plugins list --json must include plugins');
  return value.plugins.find((entry) => entry?.id === INLINE_PLUGIN_ID) || null;
}

function install(ctx = {}) {
  assertPluginScope(ctx);
  const target = resolveMarketplaceRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const configFile = resolveConfigFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to replace unmanaged ZCode marketplace: ${target}`);
  }
  const previousMetadata = managedMetadata(target) || {};
  const cleanupAbsent = previousMetadata.cleanup_absent || captureAbsent(configRoot, [
    '.', 'cli', path.join('cli', 'plugins'), path.join('cli', 'plugins', 'marketplaces'),
    path.join('cli', 'config.json'),
  ]);
  const ownership = previousMetadata.config_ownership || configOwnership(configFile, pluginRoot);
  const configExisted = fs.existsSync(configFile);
  const configBefore = configExisted ? fs.readFileSync(configFile, 'utf8') : null;
  const nextConfig = registeredConfig(loadConfig(configFile), pluginRoot);
  ensureDir(path.dirname(target));
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.${PLUGIN_NAME}-staging-`));
  const recovery = fs.existsSync(target)
    ? fs.mkdtempSync(path.join(path.dirname(target), `.${PLUGIN_NAME}-recovery-`))
    : null;
  if (recovery) fs.cpSync(target, recovery, { recursive: true });
  try {
    const copied = buildStaging(repoRoot, staging, pluginRoot);
    markManaged(staging, {
      adapter: 'zcode', plugin: PLUGIN_NAME,
      cleanup_absent: cleanupAbsent,
      config_ownership: ownership,
    });
    publishManagedTrees([{ source: staging, target, label: 'ZCode marketplace' }]);
    writeAtomic(configFile, `${JSON.stringify(nextConfig, null, 2)}\n`);
    if (shouldRunHostCli(ctx)) {
      const plugin = nativePlugin(ctx);
      if (!plugin || plugin.enabled !== true || path.resolve(plugin.rootPath) !== path.resolve(pluginRoot)) {
        throw new Error('ZCode did not activate the managed Ultra inline plugin');
      }
    }
    if (recovery) removeTree(recovery);
    return {
      target,
      marketplaceRoot: target,
      marketplaceFile: resolveMarketplaceFile(ctx),
      pluginRoot,
      skillRoot: path.join(pluginRoot, 'skills'),
      hookRoot: path.join(pluginRoot, 'hooks'),
      configFile,
      copied,
    };
  } catch (error) {
    const rollback = [];
    try {
      if (configExisted) writeAtomic(configFile, configBefore);
      else if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
    } catch (rollbackError) { rollback.push(rollbackError); }
    try {
      if (fs.existsSync(target)) removeTree(target);
      if (recovery) fs.renameSync(recovery, target);
    } catch (rollbackError) { rollback.push(rollbackError); }
    if (fs.existsSync(staging)) removeTree(staging);
    pruneCreatedEmpty(configRoot, cleanupAbsent);
    if (rollback.length) throw new AggregateError([error, ...rollback], 'ZCode install and rollback failed');
    throw error;
  }
}

function doctor(ctx = {}) {
  assertPluginScope(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const report = inspectPlugin({
    adapter: 'zcode', repoRoot: resolveRepoRoot(ctx), pluginRoot,
    skillRoot: path.join(pluginRoot, 'skills'), hookRoot: path.join(pluginRoot, 'hooks'),
    manifestFile: path.join(pluginRoot, '.zcode-plugin', 'plugin.json'),
  });
  let marketplaceValid = false;
  try {
    const marketplace = JSON.parse(fs.readFileSync(resolveMarketplaceFile(ctx), 'utf8'));
    marketplaceValid = marketplace?.name === PLUGIN_NAME
      && Array.isArray(marketplace.plugins)
      && marketplace.plugins.some((entry) => entry?.name === PLUGIN_NAME && entry?.source === './plugin');
  } catch {}
  report.checks.marketplace = { status: marketplaceValid ? 'pass' : 'fail' };
  if (!marketplaceValid) report.issues.push({ code: 'ZCODE_MARKETPLACE_INVALID' });

  let registered = false;
  try {
    const config = loadConfig(resolveConfigFile(ctx));
    registered = config.plugins?.enabled !== false
      && Array.isArray(config.plugins?.dirs)
      && config.plugins.dirs.includes(pluginRoot);
  } catch {}
  report.checks.registration = { status: registered ? 'pass' : 'fail' };
  if (!registered) report.issues.push({ code: 'ZCODE_PLUGIN_NOT_REGISTERED' });

  if (shouldRunHostCli(ctx)) {
    let discovered = false;
    try {
      const plugin = nativePlugin(ctx);
      discovered = !!plugin && plugin.enabled === true
        && path.resolve(plugin.rootPath) === path.resolve(pluginRoot)
        && plugin.skillCount === 14;
    } catch {}
    report.checks.native_registry = { status: discovered ? 'pass' : 'fail' };
    if (!discovered) report.issues.push({ code: 'ZCODE_NATIVE_DISCOVERY_FAILED' });
  }
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function uninstall(ctx = {}) {
  assertPluginScope(ctx);
  const target = resolveMarketplaceRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const metadata = managedMetadata(target) || {};
  const ownership = metadata.config_ownership;
  const cleanupAbsent = metadata.cleanup_absent || [];
  if (fs.existsSync(target) && !ownership) {
    throw new Error(`missing ZCode config ownership in ${target}`);
  }
  const configFile = resolveConfigFile(ctx);
  const configBefore = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null;
  if (ownership) {
    const next = unregisteredConfig(loadConfig(configFile), pluginRoot, ownership);
    if (ownership.file_created && Object.keys(next).length === 0) fs.unlinkSync(configFile);
    else writeAtomic(configFile, `${JSON.stringify(next, null, 2)}\n`);
  }
  try {
    const removed = removeManaged(target, 'ZCode marketplace');
    const cleaned = pruneCreatedEmpty(configRoot, cleanupAbsent);
    return { target, marketplaceRoot: target, pluginRoot, removed: { marketplace: removed }, cleaned };
  } catch (error) {
    if (configBefore !== null) writeAtomic(configFile, configBefore);
    throw error;
  }
}

module.exports = {
  name: 'zcode',
  PLUGIN_NAME,
  INLINE_PLUGIN_ID,
  buildHooksManifest,
  resolveTarget,
  resolveCliRoot,
  resolveConfigFile,
  resolveMarketplaceRoot,
  resolveMarketplaceFile,
  resolvePluginRoot,
  install,
  doctor,
  uninstall,
};
