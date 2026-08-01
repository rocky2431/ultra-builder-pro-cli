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

const PLUGIN_NAME = 'ultra-builder-pro';

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  const configured = ctx.grokHome || ctx.grokEnv?.GROK_HOME || ctx.env?.GROK_HOME || process.env.GROK_HOME;
  return configured ? path.resolve(configured) : path.join(ctx.homeDir || os.homedir(), '.grok');
}

function resolveSourceRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), '.ubp', 'plugin-sources', PLUGIN_NAME);
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), 'plugins', PLUGIN_NAME);
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function assertPluginScope(ctx = {}) {
  if (ctx.scope === 'local' && !ctx.configDir) {
    throw new Error('Grok plugins are user-scoped; use global scope or an isolated configDir');
  }
}

function hookCommand(name) {
  return {
    type: 'command',
    command: `python3 "\${GROK_PLUGIN_ROOT}/hooks/adapters/grok.py" ${JSON.stringify(name)}`,
    timeout: 10,
  };
}

function buildHooksManifest() {
  return {
    description: 'Ultra file-first context sensors and narrow effect protection.',
    hooks: {
      SessionStart: [
        { matcher: 'startup|resume|clear', hooks: [hookCommand('session_context.py')] },
        { matcher: 'compact', hooks: [hookCommand('compact_context.py')] },
      ],
      PreToolUse: [
        { matcher: 'Write|Edit|Grep|apply_patch', hooks: [hookCommand('mid_workflow_recall.py')] },
        { matcher: 'Bash', hooks: [hookCommand('block_dangerous_commands.py')] },
      ],
      PostToolUse: [
        { matcher: 'Write|Edit|apply_patch', hooks: [hookCommand('post_edit_guard.py')] },
      ],
      PreCompact: [{ matcher: 'manual|auto', hooks: [hookCommand('compact_context.py')] }],
    },
  };
}

function buildStaging(repoRoot, staging, publishedRoot) {
  const skills = copySkills({ runtime: 'grok', repoRoot, skillRoot: path.join(staging, 'skills') });
  copyHooks({
    runtime: 'grok', repoRoot, hookRoot: path.join(staging, 'hooks'),
    hooksManifest: buildHooksManifest(),
  });
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeAtomic(path.join(staging, 'plugin.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'File-first Ultra Builder Pro workflows for Grok Build.',
    author: { name: pkg.author },
    homepage: pkg.homepage,
    repository: pkg.repository?.url || pkg.repository,
    license: pkg.license,
  }, null, 2)}\n`);
  markManaged(staging, { adapter: 'grok', plugin: PLUGIN_NAME, version: pkg.version });
  writePluginProvenance({
    adapter: 'grok', repoRoot, stagingRoot: staging, publishedRoot,
    contracts: {
      plugin_manifest: { root: 'plugin', path: 'plugin.json' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      hook_adapter: { root: 'plugin', path: 'hooks/adapters/grok.py' },
    },
  });
  return { skills };
}

function shouldRunHostCli(ctx = {}) {
  if (typeof ctx.runHostCli === 'boolean') return ctx.runHostCli;
  return ctx.scope === 'global' && !ctx.configDir;
}

function runGrok(ctx, args) {
  const result = spawnSync(ctx.grokBin || 'grok', args, {
    encoding: 'utf8', timeout: ctx.hostCliTimeoutMs || 30000,
    env: { ...process.env, GROK_HOME: resolveTarget(ctx) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || `grok ${args.join(' ')} failed`);
  return result.stdout;
}

function installedPlugin(ctx) {
  const value = JSON.parse(runGrok(ctx, ['plugin', 'list', '--json']));
  if (!Array.isArray(value)) throw new Error('grok plugin list --json must return an array');
  return value.find((entry) => entry?.name === PLUGIN_NAME) || null;
}

function install(ctx = {}) {
  assertPluginScope(ctx);
  const sourceRoot = resolveSourceRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const cleanupAbsent = managedMetadata(sourceRoot)?.cleanup_absent
    || captureAbsent(configRoot, ['.', '.ubp', path.join('.ubp', 'plugin-sources'), 'plugins']);
  ensureDir(path.dirname(sourceRoot));
  const staging = fs.mkdtempSync(path.join(path.dirname(sourceRoot), `.${PLUGIN_NAME}-staging-`));
  const recovery = fs.existsSync(sourceRoot)
    ? fs.mkdtempSync(path.join(path.dirname(sourceRoot), `.${PLUGIN_NAME}-recovery-`))
    : null;
  if (recovery) fs.cpSync(sourceRoot, recovery, { recursive: true });
  let previousRegistration = null;
  try {
    const copied = buildStaging(repoRoot, staging, sourceRoot);
    markManaged(staging, { cleanup_absent: cleanupAbsent });
    publishManagedTrees([{ source: staging, target: sourceRoot, label: 'Grok plugin source' }]);
    if (shouldRunHostCli(ctx)) {
      runGrok(ctx, ['plugin', 'validate', sourceRoot]);
      previousRegistration = installedPlugin(ctx);
      if (previousRegistration) runGrok(ctx, ['plugin', 'uninstall', PLUGIN_NAME, '--confirm', '--keep-data']);
      runGrok(ctx, ['plugin', 'install', sourceRoot, '--trust']);
      runGrok(ctx, ['plugin', 'enable', PLUGIN_NAME]);
      runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
    }
    if (recovery) removeTree(recovery);
    return {
      target: sourceRoot,
      pluginRoot: sourceRoot,
      skillRoot: path.join(sourceRoot, 'skills'),
      hookRoot: path.join(sourceRoot, 'hooks'),
      copied,
    };
  } catch (error) {
    const rollback = [];
    try {
      if (fs.existsSync(sourceRoot)) removeTree(sourceRoot);
      if (recovery) fs.renameSync(recovery, sourceRoot);
      if (previousRegistration && shouldRunHostCli(ctx)) {
        try { runGrok(ctx, ['plugin', 'uninstall', PLUGIN_NAME, '--confirm', '--keep-data']); } catch {}
        runGrok(ctx, ['plugin', 'install', sourceRoot, '--trust']);
        if (previousRegistration.enabled !== false) runGrok(ctx, ['plugin', 'enable', PLUGIN_NAME]);
      }
    } catch (rollbackError) {
      rollback.push(rollbackError);
    }
    if (fs.existsSync(staging)) removeTree(staging);
    pruneCreatedEmpty(configRoot, cleanupAbsent);
    if (rollback.length) throw new AggregateError([error, ...rollback], 'Grok install and rollback failed');
    throw error;
  }
}

function doctor(ctx = {}) {
  assertPluginScope(ctx);
  const sourceRoot = resolveSourceRoot(ctx);
  const report = inspectPlugin({
    adapter: 'grok', repoRoot: resolveRepoRoot(ctx), pluginRoot: sourceRoot,
    skillRoot: path.join(sourceRoot, 'skills'), hookRoot: path.join(sourceRoot, 'hooks'),
    manifestFile: path.join(sourceRoot, 'plugin.json'),
  });
  if (shouldRunHostCli(ctx)) {
    let discovered = false;
    try {
      const plugin = installedPlugin(ctx);
      discovered = !!plugin && plugin.enabled !== false;
      if (discovered) runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
    } catch {}
    report.checks.native_registry = { status: discovered ? 'pass' : 'fail' };
    if (!discovered) report.issues.push({ code: 'GROK_PLUGIN_NOT_REGISTERED' });
  }
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function uninstall(ctx = {}) {
  assertPluginScope(ctx);
  const sourceRoot = resolveSourceRoot(ctx);
  const configRoot = resolveTarget(ctx);
  const cleanupAbsent = managedMetadata(sourceRoot)?.cleanup_absent || [];
  if (shouldRunHostCli(ctx)) {
    const plugin = installedPlugin(ctx);
    if (plugin) runGrok(ctx, ['plugin', 'uninstall', PLUGIN_NAME, '--confirm', '--keep-data']);
  }
  const legacy = resolvePluginRoot(ctx);
  const removedLegacy = fs.existsSync(legacy) && isManaged(legacy)
    ? removeManaged(legacy, 'legacy Grok plugin')
    : false;
  const removedSource = removeManaged(sourceRoot, 'Grok plugin source');
  const cleaned = pruneCreatedEmpty(configRoot, cleanupAbsent);
  return {
    target: sourceRoot,
    pluginRoot: sourceRoot,
    removed: {
      source: removedSource,
      legacy: removedLegacy,
    },
    cleaned,
  };
}

module.exports = {
  name: 'grok',
  PLUGIN_NAME,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  resolveSourceRoot,
  install,
  doctor,
  uninstall,
};
