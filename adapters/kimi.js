'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  managedMetadata,
  pruneCreatedEmpty,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');

const PLUGIN_ID = 'ultra-builder-pro';

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') return process.env.KIMI_CODE_HOME || path.join(ctx.homeDir || os.homedir(), '.kimi-code');
  return path.join(ctx.cwd || process.cwd(), '.kimi-code');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), 'plugins', 'managed', PLUGIN_ID);
}

function resolveRegistryFile(ctx = {}) {
  return path.join(resolveTarget(ctx), 'plugins', 'installed.json');
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function assertPluginScope(ctx = {}) {
  if (ctx.scope === 'local' && !ctx.configDir) {
    throw new Error('Kimi plugins are user-scoped; use global scope or an isolated configDir');
  }
}

function hookCommand(name) {
  return `python3 ./hooks/adapters/kimi.py ${JSON.stringify(name)}`;
}

function buildHooksManifest() {
  return [
    { event: 'SessionStart', command: hookCommand('session_context.py'), timeout: 10 },
    { event: 'SessionStart', matcher: 'compact', command: hookCommand('compact_context.py'), timeout: 10 },
    { event: 'PreToolUse', matcher: 'Edit|Write|Grep', command: hookCommand('mid_workflow_recall.py'), timeout: 10 },
    { event: 'PreToolUse', matcher: 'Bash', command: hookCommand('block_dangerous_commands.py'), timeout: 10 },
    { event: 'PostToolUse', matcher: 'Edit|Write', command: hookCommand('post_edit_guard.py'), timeout: 10 },
    { event: 'PreCompact', command: hookCommand('compact_context.py'), timeout: 10 },
    { event: 'PostCompact', command: hookCommand('compact_context.py'), timeout: 10 },
  ];
}

function loadRegistry(file) {
  if (!fs.existsSync(file)) return { version: 1, plugins: [] };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || value.version !== 1 || !Array.isArray(value.plugins)) {
    throw new Error(`invalid Kimi registry: ${file}`);
  }
  return value;
}

function nextRegistry(value, target, repoRoot) {
  const existing = value.plugins.find((entry) => entry?.id === PLUGIN_ID);
  if (existing && path.resolve(existing.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to replace conflicting Kimi registration: ${existing.root}`);
  }
  const now = new Date().toISOString();
  const record = {
    id: PLUGIN_ID,
    root: target,
    source: 'local-path',
    enabled: existing?.enabled ?? true,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
    originalSource: repoRoot,
  };
  return {
    version: 1,
    plugins: [...value.plugins.filter((entry) => entry?.id !== PLUGIN_ID), record],
  };
}

function buildStaging(repoRoot, staging, publishedRoot) {
  const skills = copySkills({ runtime: 'kimi', repoRoot, skillRoot: path.join(staging, 'skills') });
  const hooks = buildHooksManifest();
  copyHooks({ runtime: 'kimi', repoRoot, hookRoot: path.join(staging, 'hooks'), hooksManifest: hooks });
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeAtomic(path.join(staging, 'kimi.plugin.json'), `${JSON.stringify({
    name: PLUGIN_ID,
    version: pkg.version,
    description: 'File-first Ultra Builder Pro workflows for Kimi Code.',
    keywords: ['kimi-code', 'skills', 'hooks', 'ultra-builder-pro'],
    author: { name: pkg.author },
    homepage: pkg.homepage,
    license: pkg.license,
    skills: ['./skills'],
    hooks,
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'File-first project workflows and evidence.',
      developerName: pkg.author,
      websiteURL: pkg.homepage,
    },
  }, null, 2)}\n`);
  markManaged(staging, { adapter: 'kimi', plugin: PLUGIN_ID, version: pkg.version });
  writePluginProvenance({
    adapter: 'kimi', repoRoot, stagingRoot: staging, publishedRoot,
    contracts: {
      plugin_manifest: { root: 'plugin', path: 'kimi.plugin.json' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      hook_adapter: { root: 'plugin', path: 'hooks/adapters/kimi.py' },
    },
  });
  return { skills };
}

function install(ctx = {}) {
  assertPluginScope(ctx);
  const target = resolvePluginRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const previousMetadata = managedMetadata(target) || {};
  const cleanupAbsent = previousMetadata.cleanup_absent
    || captureAbsent(configRoot, ['.', 'plugins', path.join('plugins', 'managed')]);
  const registryExisted = fs.existsSync(registryFile);
  const registryCreated = previousMetadata.registry_created === true
    || (previousMetadata.registry_created === undefined && !registryExisted);
  const registryBefore = registryExisted ? fs.readFileSync(registryFile) : null;
  const registry = nextRegistry(loadRegistry(registryFile), target, repoRoot);
  ensureDir(path.dirname(target));
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.${PLUGIN_ID}-staging-`));
  try {
    const copied = buildStaging(repoRoot, staging, target);
    markManaged(staging, {
      cleanup_absent: cleanupAbsent,
      registry_created: registryCreated,
    });
    writeAtomic(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
    try {
      publishManagedTrees([{ source: staging, target, label: 'Kimi plugin' }]);
    } catch (error) {
      if (registryExisted) writeAtomic(registryFile, registryBefore);
      else if (fs.existsSync(registryFile)) fs.unlinkSync(registryFile);
      throw error;
    }
    return {
      target,
      pluginRoot: target,
      skillRoot: path.join(target, 'skills'),
      hookRoot: path.join(target, 'hooks'),
      registry: registryFile,
      copied,
    };
  } catch (error) {
    if (fs.existsSync(staging)) removeTree(staging);
    pruneCreatedEmpty(configRoot, cleanupAbsent);
    throw error;
  }
}

function doctor(ctx = {}) {
  assertPluginScope(ctx);
  const target = resolvePluginRoot(ctx);
  const report = inspectPlugin({
    adapter: 'kimi', repoRoot: resolveRepoRoot(ctx), pluginRoot: target,
    skillRoot: path.join(target, 'skills'), hookRoot: path.join(target, 'hooks'),
    manifestFile: path.join(target, 'kimi.plugin.json'),
  });
  let registered = false;
  try {
    const record = loadRegistry(resolveRegistryFile(ctx)).plugins.find((entry) => entry?.id === PLUGIN_ID);
    registered = !!record && record.enabled === true && path.resolve(record.root) === path.resolve(target);
  } catch {}
  report.checks.registration = { status: registered ? 'pass' : 'fail' };
  if (!registered) report.issues.push({ code: 'PLUGIN_REGISTRATION_INVALID' });
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function uninstall(ctx = {}) {
  assertPluginScope(ctx);
  const target = resolvePluginRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const metadata = managedMetadata(target) || {};
  const cleanupAbsent = metadata.cleanup_absent || [];
  const registryFile = resolveRegistryFile(ctx);
  const registry = loadRegistry(registryFile);
  const record = registry.plugins.find((entry) => entry?.id === PLUGIN_ID);
  if (record && path.resolve(record.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to remove conflicting Kimi registration: ${record.root}`);
  }
  if (record) {
    registry.plugins = registry.plugins.filter((entry) => entry?.id !== PLUGIN_ID);
    if (registry.plugins.length === 0 && metadata.registry_created === true) fs.unlinkSync(registryFile);
    else writeAtomic(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
  }
  const removedPlugin = removeManaged(target, 'Kimi plugin');
  const cleaned = pruneCreatedEmpty(configRoot, cleanupAbsent);
  return {
    target,
    pluginRoot: target,
    removed: { plugin: removedPlugin, registration: !!record },
    cleaned,
  };
}

module.exports = {
  name: 'kimi',
  PLUGIN_ID,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  resolveRegistryFile,
  install,
  doctor,
  uninstall,
};
