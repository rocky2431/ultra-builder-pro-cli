'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
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
  listRelative,
  managedMetadata,
  pruneCreatedEmpty,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') return process.env.CODEX_HOME || path.join(ctx.homeDir || os.homedir(), '.codex');
  return path.join(ctx.cwd || process.cwd(), '.codex');
}

function resolveHomeDir(ctx = {}) {
  return path.resolve(ctx.configDir || ctx.homeDir || os.homedir());
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveHomeDir(ctx), 'plugins', PLUGIN_NAME);
}

function resolveMarketplaceFile(ctx = {}) {
  return path.join(resolveHomeDir(ctx), '.agents', 'plugins', 'marketplace.json');
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function currentCleanupRoots(ctx = {}) {
  return new Set([resolveHomeDir(ctx), resolveTarget(ctx)].map((root) => path.resolve(root)));
}

function installCleanupRoots(ctx, pluginRoot) {
  const previous = managedMetadata(pluginRoot)?.cleanup_roots;
  const allowed = currentCleanupRoots(ctx);
  if (previous !== undefined) {
    if (!Array.isArray(previous) || previous.some((entry) => (
      !entry || !allowed.has(path.resolve(entry.root || '')) || !Array.isArray(entry.absent)
    ))) throw new Error(`invalid Codex cleanup ownership in ${pluginRoot}`);
    return previous;
  }

  const groups = new Map();
  const add = (root, candidates) => {
    root = path.resolve(root);
    if (!groups.has(root)) groups.set(root, new Set());
    for (const candidate of candidates) groups.get(root).add(candidate);
  };
  add(resolveHomeDir(ctx), [
    '.', 'plugins', '.agents', path.join('.agents', 'plugins'),
    path.join('.agents', 'plugins', 'marketplace.json'),
  ]);
  add(resolveTarget(ctx), [
    '.', 'config.toml', 'plugins', path.join('plugins', 'cache'),
    path.join('plugins', 'cache', 'personal'), 'tmp', path.join('tmp', 'arg0'),
  ]);
  return [...groups].map(([root, candidates]) => ({
    root,
    absent: captureAbsent(root, [...candidates]),
  }));
}

function pruneInstallCleanup(ctx, cleanupRoots) {
  const allowed = currentCleanupRoots(ctx);
  const removed = [];
  for (const entry of cleanupRoots || []) {
    const root = path.resolve(entry.root || '');
    if (!allowed.has(root) || !Array.isArray(entry.absent)) {
      throw new Error('refusing Codex cleanup outside the current config and sidecar roots');
    }
    removed.push(...pruneCreatedEmpty(root, entry.absent).map((item) => `${root}:${item}`));
  }
  return removed;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function hookCommand(pluginRoot, name) {
  const adapter = path.join(pluginRoot, 'hooks', 'adapters', 'codex.py');
  return {
    type: 'command',
    command: `python3 ${shellQuote(adapter)} ${shellQuote(name)}`,
    timeout: 10,
  };
}

function buildHooksManifest(pluginRoot = '${CODEX_PLUGIN_ROOT}') {
  return {
    hooks: {
      SessionStart: [
        { matcher: 'startup|resume|clear', hooks: [hookCommand(pluginRoot, 'session_context.py')] },
        { matcher: 'compact', hooks: [hookCommand(pluginRoot, 'compact_context.py')] },
      ],
      PreToolUse: [
        { matcher: 'Write|Edit|Grep|apply_patch', hooks: [hookCommand(pluginRoot, 'mid_workflow_recall.py')] },
        { matcher: 'Bash', hooks: [hookCommand(pluginRoot, 'block_dangerous_commands.py')] },
      ],
      PostToolUse: [
        { matcher: 'Write|Edit|apply_patch', hooks: [hookCommand(pluginRoot, 'post_edit_guard.py')] },
      ],
      PreCompact: [{ matcher: 'manual|auto', hooks: [hookCommand(pluginRoot, 'compact_context.py')] }],
      PostCompact: [{ hooks: [hookCommand(pluginRoot, 'compact_context.py')] }],
    },
  };
}

function contentHash(root, version) {
  const hash = crypto.createHash('sha256').update(version);
  for (const relative of listRelative(root).sort()) {
    if (relative.startsWith('.codex-plugin') || relative === '.ubp-managed') continue;
    hash.update(relative).update(fs.readFileSync(path.join(root, relative)));
  }
  return hash.digest('hex').slice(0, 12);
}

function buildStaging(repoRoot, staging, publishedRoot) {
  const skillRoot = path.join(staging, 'skills');
  const hookRoot = path.join(staging, 'hooks');
  const skills = copySkills({ runtime: 'codex', repoRoot, skillRoot });
  copyHooks({
    runtime: 'codex', repoRoot, hookRoot,
    hooksManifest: buildHooksManifest(publishedRoot),
  });
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(staging, 'LICENSE'));
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = `${pkg.version}+codex.${contentHash(staging, pkg.version)}`;
  writeAtomic(path.join(staging, '.codex-plugin', 'plugin.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    version,
    description: 'File-first Ultra Builder Pro workflows for Codex.',
    author: { name: pkg.author },
    homepage: pkg.homepage,
    repository: pkg.repository?.url || pkg.repository,
    license: pkg.license,
    keywords: ['codex', 'skills', 'hooks', 'ultra-builder-pro'],
    skills: './skills/',
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'File-first project workflows and evidence.',
      longDescription: 'Resume product and engineering work across sessions and coding-agent hosts through portable Skills, repository files, and Git.',
      developerName: pkg.author,
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Write'],
      websiteURL: pkg.homepage,
      defaultPrompt: [
        'Start a new project with $ultra-builder-pro:ultra-init.',
        'Reconcile this change with $ultra-builder-pro:ultra-change.',
        'Show workflow status with $ultra-builder-pro:ultra-status.',
      ],
    },
  }, null, 2)}\n`);
  markManaged(staging, { adapter: 'codex', plugin: PLUGIN_NAME, version });
  writePluginProvenance({
    adapter: 'codex', repoRoot, stagingRoot: staging, publishedRoot,
    contracts: {
      plugin_manifest: { root: 'plugin', path: '.codex-plugin/plugin.json' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      hook_adapter: { root: 'plugin', path: 'hooks/adapters/codex.py' },
    },
  });
  return { skills, version };
}

function loadMarketplace(file) {
  if (!fs.existsSync(file)) return { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.plugins)) {
    throw new Error(`invalid Codex marketplace: ${file}`);
  }
  return value;
}

function marketplaceEntry() {
  return {
    name: PLUGIN_NAME,
    source: { source: 'local', path: `./plugins/${PLUGIN_NAME}` },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  };
}

function writeMarketplace(file) {
  const value = loadMarketplace(file);
  const next = value.plugins.filter((entry) => entry?.name !== PLUGIN_NAME);
  next.push(marketplaceEntry());
  value.plugins = next;
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  return value.name;
}

function runCodex(args, ctx) {
  const result = spawnSync(ctx.codexBin || 'codex', args, {
    encoding: 'utf8', timeout: ctx.hostCliTimeoutMs || 30000,
    env: { ...process.env, HOME: resolveHomeDir(ctx), CODEX_HOME: resolveTarget(ctx) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || `codex ${args.join(' ')} failed`);
  return result.stdout;
}

function shouldRunPluginCli(ctx = {}) {
  if (typeof ctx.runPluginCli === 'boolean') return ctx.runPluginCli;
  return ctx.scope === 'global';
}

function installedPlugin(ctx) {
  const value = JSON.parse(runCodex(['plugin', 'list', '--json'], ctx));
  if (!Array.isArray(value.installed)) {
    throw new Error('codex plugin list --json must include an installed array');
  }
  return value.installed.find((entry) => entry?.name === PLUGIN_NAME) || null;
}

function restoreMarketplace(file, previous) {
  if (previous !== null) {
    writeAtomic(file, previous);
  } else if (fs.existsSync(file)) {
    removeMarketplace(file, { deleteIfEmpty: true });
  }
}

function install(ctx = {}) {
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const marketplaceFile = resolveMarketplaceFile(ctx);
  const previousMetadata = managedMetadata(pluginRoot) || {};
  const cleanupRoots = installCleanupRoots(ctx, pluginRoot);
  if (fs.existsSync(pluginRoot) && !isManaged(pluginRoot)) {
    throw new Error(`refusing to replace unmanaged Codex plugin: ${pluginRoot}`);
  }
  ensureDir(resolveTarget(ctx));
  const runNative = shouldRunPluginCli(ctx);
  const previousRegistration = runNative ? installedPlugin(ctx) : null;
  const previousMarketplace = fs.existsSync(marketplaceFile)
    ? fs.readFileSync(marketplaceFile, 'utf8')
    : null;
  const marketplaceCreated = previousMetadata.marketplace_created === true
    || (previousMetadata.marketplace_created === undefined && previousMarketplace === null);
  const previousMarketplaceName = fs.existsSync(marketplaceFile)
    ? loadMarketplace(marketplaceFile).name
    : 'personal';
  ensureDir(path.dirname(pluginRoot));
  const staging = fs.mkdtempSync(path.join(path.dirname(pluginRoot), `.${PLUGIN_NAME}-staging-`));
  const recovery = fs.existsSync(pluginRoot)
    ? `${pluginRoot}.ubp-recovery-${crypto.randomUUID()}`
    : null;
  if (recovery) fs.cpSync(pluginRoot, recovery, { recursive: true });
  let marketplaceName;
  let published = false;
  let marketplaceWritten = false;
  let nativeAttempted = false;
  try {
    const copied = buildStaging(repoRoot, staging, pluginRoot);
    markManaged(staging, {
      cleanup_roots: cleanupRoots,
      marketplace_created: marketplaceCreated,
    });
    publishManagedTrees([{ source: staging, target: pluginRoot, label: 'Codex plugin' }]);
    published = true;
    marketplaceName = writeMarketplace(marketplaceFile);
    marketplaceWritten = true;
    if (runNative) {
      nativeAttempted = true;
      runCodex(['plugin', 'add', `${PLUGIN_NAME}@${marketplaceName}`, '--json'], ctx);
    }
    if (recovery) removeTree(recovery);
    return {
      target: resolveTarget(ctx),
      pluginRoot,
      skillRoot: path.join(pluginRoot, 'skills'),
      hookRoot: path.join(pluginRoot, 'hooks'),
      marketplaceFile,
      copied,
    };
  } catch (error) {
    const rollback = [];
    try {
      if (published) {
        if (fs.existsSync(pluginRoot)) removeTree(pluginRoot);
        if (recovery && fs.existsSync(recovery)) fs.renameSync(recovery, pluginRoot);
      } else if (recovery && fs.existsSync(recovery)) {
        removeTree(recovery);
      }
    } catch (rollbackError) {
      rollback.push(rollbackError);
    }
    try {
      if (marketplaceWritten) restoreMarketplace(marketplaceFile, previousMarketplace);
    } catch (rollbackError) {
      rollback.push(rollbackError);
    }
    if (nativeAttempted) {
      try {
        const currentRegistration = installedPlugin(ctx);
        if (previousRegistration && !currentRegistration) {
          runCodex([
            'plugin', 'add', `${PLUGIN_NAME}@${previousMarketplaceName}`, '--json',
          ], ctx);
        } else if (!previousRegistration && currentRegistration) {
          runCodex([
            'plugin', 'remove', `${PLUGIN_NAME}@${marketplaceName}`, '--json',
          ], ctx);
        }
      } catch (rollbackError) {
        rollback.push(rollbackError);
      }
    }
    if (fs.existsSync(staging)) removeTree(staging);
    if (recovery && fs.existsSync(recovery)) removeTree(recovery);
    try { pruneInstallCleanup(ctx, cleanupRoots); } catch (cleanupError) { rollback.push(cleanupError); }
    if (rollback.length) {
      throw new AggregateError([error, ...rollback], 'Codex install and rollback failed');
    }
    throw error;
  }
}

function doctor(ctx = {}) {
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const report = inspectPlugin({
    adapter: 'codex', repoRoot, pluginRoot,
    skillRoot: path.join(pluginRoot, 'skills'),
    hookRoot: path.join(pluginRoot, 'hooks'),
    manifestFile: path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
  });
  let marketplaceOk = false;
  try {
    marketplaceOk = loadMarketplace(resolveMarketplaceFile(ctx)).plugins.some((entry) => (
      entry?.name === PLUGIN_NAME && entry.source?.path === `./plugins/${PLUGIN_NAME}`
    ));
  } catch {}
  report.checks.marketplace = { status: marketplaceOk ? 'pass' : 'fail' };
  if (!marketplaceOk) report.issues.push({ code: 'MARKETPLACE_REGISTRATION_INVALID' });
  if (shouldRunPluginCli(ctx)) {
    let discovered = false;
    try {
      const plugin = installedPlugin(ctx);
      discovered = !!plugin && plugin.installed !== false && plugin.enabled === true;
    } catch {}
    report.checks.host_plugin = { status: discovered ? 'pass' : 'fail' };
    if (!discovered) report.issues.push({ code: 'HOST_PLUGIN_NOT_DISCOVERED' });
  }
  report.checks.hook_activation = {
    status: 'user_review_required',
    reason: 'Codex does not trust non-managed plugin hooks merely because the plugin is installed or enabled.',
  };
  report.actions = [{
    code: 'REVIEW_CODEX_HOOK_TRUST',
    message: 'Open a new Codex session, review the current Ultra hook definition, and trust it before relying on hook acceleration.',
  }];
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function removeMarketplace(file, { deleteIfEmpty = false } = {}) {
  if (!fs.existsSync(file)) return false;
  const value = loadMarketplace(file);
  const before = value.plugins.length;
  value.plugins = value.plugins.filter((entry) => entry?.name !== PLUGIN_NAME);
  if (value.plugins.length === before) return false;
  if (deleteIfEmpty && value.plugins.length === 0 && value.name === 'personal') {
    fs.unlinkSync(file);
  } else {
    writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  return true;
}

function uninstall(ctx = {}) {
  const marketplaceFile = resolveMarketplaceFile(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const metadata = managedMetadata(pluginRoot) || {};
  const cleanupRoots = metadata.cleanup_roots || [];
  const marketplaceCreated = metadata.marketplace_created === true;
  const marketplace = fs.existsSync(marketplaceFile) ? loadMarketplace(marketplaceFile) : { name: 'personal' };
  if (shouldRunPluginCli(ctx)) {
    runCodex(['plugin', 'remove', `${PLUGIN_NAME}@${marketplace.name}`, '--json'], ctx);
  }
  const removedPlugin = removeManaged(pluginRoot, 'Codex plugin');
  const removedMarketplace = removeMarketplace(marketplaceFile, { deleteIfEmpty: marketplaceCreated });
  const cleaned = pruneInstallCleanup(ctx, cleanupRoots);
  return {
    target: resolveTarget(ctx), pluginRoot,
    removed: {
      plugin: removedPlugin,
      marketplace: removedMarketplace,
    },
    cleaned,
  };
}

module.exports = {
  name: 'codex',
  PLUGIN_NAME,
  buildHooksManifest,
  resolveTarget,
  resolveHomeDir,
  resolvePluginRoot,
  resolveMarketplaceFile,
  install,
  doctor,
  uninstall,
};
