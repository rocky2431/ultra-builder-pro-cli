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
  managedMetadata,
  pruneCreatedEmpty,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    return process.env.CLAUDE_CONFIG_DIR || path.join(ctx.homeDir || os.homedir(), '.claude');
  }
  return path.join(ctx.cwd || process.cwd(), '.claude');
}

function resolvePluginRoot(ctx = {}) {
  return ctx.pluginRoot || path.join(resolveTarget(ctx), 'skills', PLUGIN_NAME);
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function hookCommand(name) {
  return {
    type: 'command',
    command: `python3 "\${CLAUDE_PLUGIN_ROOT}/hooks/${name}"`,
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
        { matcher: 'Write|Edit|Grep', hooks: [hookCommand('mid_workflow_recall.py')] },
        { matcher: 'Bash', hooks: [hookCommand('block_dangerous_commands.py')] },
      ],
      PostToolUse: [
        { matcher: 'Write|Edit', hooks: [hookCommand('post_edit_guard.py')] },
      ],
      PreCompact: [{ hooks: [hookCommand('compact_context.py')] }],
    },
  };
}

function buildStaging(repoRoot, staging, publishedRoot) {
  const skillRoot = path.join(staging, 'skills');
  const hookRoot = path.join(staging, 'hooks');
  const hooks = buildHooksManifest();
  const skills = copySkills({ runtime: 'claude', repoRoot, skillRoot });
  copyHooks({ runtime: 'claude', repoRoot, hookRoot, hooksManifest: hooks });
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeAtomic(path.join(staging, '.claude-plugin', 'plugin.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'File-first Ultra Builder Pro workflows for Claude Code.',
    author: { name: pkg.author },
    repository: pkg.homepage,
    license: pkg.license,
  }, null, 2)}\n`);
  markManaged(staging, { adapter: 'claude', plugin: PLUGIN_NAME, version: pkg.version });
  writePluginProvenance({
    adapter: 'claude', repoRoot, stagingRoot: staging, publishedRoot,
    contracts: {
      plugin_manifest: { root: 'plugin', path: '.claude-plugin/plugin.json' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
    },
  });
  return { skills };
}

function install(ctx = {}) {
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const target = resolveTarget(ctx);
  const cleanupAbsent = managedMetadata(pluginRoot)?.cleanup_absent
    || captureAbsent(target, ['.', 'skills']);
  ensureDir(path.dirname(pluginRoot));
  const staging = fs.mkdtempSync(path.join(path.dirname(pluginRoot), `.${PLUGIN_NAME}-staging-`));
  try {
    const copied = buildStaging(repoRoot, staging, pluginRoot);
    markManaged(staging, { cleanup_absent: cleanupAbsent });
    publishManagedTrees([{ source: staging, target: pluginRoot, label: 'Claude plugin' }]);
    return {
      target: pluginRoot,
      pluginRoot,
      skillRoot: path.join(pluginRoot, 'skills'),
      hookRoot: path.join(pluginRoot, 'hooks'),
      copied,
    };
  } catch (error) {
    if (fs.existsSync(staging)) removeTree(staging);
    pruneCreatedEmpty(target, cleanupAbsent);
    throw error;
  }
}

function shouldRunHostCli(ctx = {}) {
  if (typeof ctx.runHostCli === 'boolean') return ctx.runHostCli;
  return ctx.scope === 'global' && !ctx.configDir;
}

function doctor(ctx = {}) {
  const repoRoot = resolveRepoRoot(ctx);
  const pluginRoot = resolvePluginRoot(ctx);
  const report = inspectPlugin({
    adapter: 'claude',
    repoRoot,
    pluginRoot,
    skillRoot: path.join(pluginRoot, 'skills'),
    hookRoot: path.join(pluginRoot, 'hooks'),
    manifestFile: path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
  });
  if (shouldRunHostCli(ctx)) {
    const result = spawnSync(ctx.claudeBin || 'claude', ['plugin', 'list', '--json'], {
      encoding: 'utf8', timeout: ctx.hostCliTimeoutMs || 30000,
      env: { ...process.env, CLAUDE_CONFIG_DIR: resolveTarget(ctx) },
    });
    let discovered = false;
    if (result.status === 0) {
      try {
        const plugins = JSON.parse(result.stdout);
        discovered = Array.isArray(plugins) && plugins.some((entry) => (
          entry?.id === `${PLUGIN_NAME}@skills-dir` && entry.enabled === true
        ));
      } catch {}
    }
    report.checks.host_plugin = { status: discovered ? 'pass' : 'fail' };
    if (!discovered) report.issues.push({ code: 'HOST_PLUGIN_NOT_DISCOVERED' });
    report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  }
  return report;
}

function uninstall(ctx = {}) {
  const pluginRoot = resolvePluginRoot(ctx);
  const cleanupAbsent = managedMetadata(pluginRoot)?.cleanup_absent || [];
  const removed = removeManaged(pluginRoot, 'Claude plugin');
  const cleaned = pruneCreatedEmpty(resolveTarget(ctx), cleanupAbsent);
  return { target: pluginRoot, pluginRoot, removed, cleaned };
}

module.exports = {
  name: 'claude',
  PLUGIN_NAME,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  install,
  doctor,
  uninstall,
};
