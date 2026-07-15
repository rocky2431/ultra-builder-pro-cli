'use strict';

/** Build a Claude Code native Ultra Builder Pro plugin. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  copyTree,
  ensureDir,
  isManaged,
  markManaged,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const { buildMcpRuntime } = require('./_shared/codex-assets.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_NAME;
const SOURCE_TAG = 'ubp';
const SENTINEL_KEY = '_ubp_manifest';
const COMMAND_NAMES = CORE_PUBLIC_SKILLS.filter((name) => name !== 'ultra-review');

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.CLAUDE_CONFIG_DIR || path.join(ctx.homeDir || os.homedir(), '.claude');
  }
  return path.join(ctx.cwd || process.cwd(), '.claude');
}

function resolvePluginRoot(ctx = {}) {
  if (ctx.pluginRoot) return ctx.pluginRoot;
  return path.join(resolveTarget(ctx), 'skills', PLUGIN_NAME);
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function copyNamedDirectories(repoRoot, target, parent, names) {
  const copied = [];
  for (const name of names) {
    const source = path.join(repoRoot, parent, name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Claude asset: ${parent}/${name}`);
    const files = copyTree(source, path.join(target, parent, name));
    copied.push(...files.map((rel) => path.join(name, rel)));
  }
  return copied;
}

function copyCommands(repoRoot, target) {
  const commandRoot = path.join(target, 'commands');
  ensureDir(commandRoot);
  const copied = [];
  for (const name of COMMAND_NAMES) {
    const file = `${name}.md`;
    const source = path.join(repoRoot, 'commands', file);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Claude command: ${file}`);
    fs.copyFileSync(source, path.join(commandRoot, file));
    copied.push(file);
  }
  return copied;
}

function hookCommand(name, ...args) {
  return {
    type: 'command',
    command: [
      `python3 "\${CLAUDE_PLUGIN_ROOT}/hooks/${name}"`,
      ...args.map((arg) => JSON.stringify(arg)),
    ].join(' '),
    timeout: 10,
  };
}

function buildHooksManifest() {
  return {
    description: 'Ultra workflow lifecycle hooks; inactive outside projects with an active .ultra workflow.',
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear',
          hooks: [hookCommand('health_check.py'), hookCommand('workflow_context.py')],
        },
        { matcher: 'compact', hooks: [hookCommand('workflow_resume.py')] },
      ],
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [hookCommand('active_task_context.py')] },
      ],
      PreCompact: [
        { hooks: [hookCommand('workflow_checkpoint.py')] },
      ],
      Stop: [
        { hooks: [hookCommand('pre_stop_check.py')] },
      ],
      SubagentStart: [
        { hooks: [hookCommand('subagent_tracker.py', 'start')] },
      ],
      SubagentStop: [
        { hooks: [hookCommand('subagent_tracker.py', 'stop')] },
      ],
    },
  };
}

function install(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target);
    if (entries.length > 0 && !isManaged(target)) {
      throw new Error(`refusing to replace unmanaged Claude plugin: ${target}`);
    }
    if (entries.length > 0) removeTree(target);
  }
  ensureDir(target);

  const report = { target, copied: {}, config: { updated: false } };
  report.copied.commands = copyCommands(repoRoot, target);
  report.copied.skills = copyNamedDirectories(repoRoot, target, 'skills', skillsForRuntime('claude'));
  report.copied.agents = copyTree(path.join(repoRoot, 'agents'), path.join(target, 'agents'));

  ensureDir(path.join(target, 'hooks'));
  report.copied.hooks = [];
  for (const name of WORKFLOW_HOOK_FILES) {
    fs.copyFileSync(path.join(repoRoot, 'hooks', name), path.join(target, 'hooks', name));
    report.copied.hooks.push(name);
  }
  writeAtomic(path.join(target, 'hooks', 'hooks.json'), JSON.stringify(buildHooksManifest(), null, 2) + '\n');

  const runtime = buildMcpRuntime(repoRoot, target, { runtime: 'claude' });
  writeAtomic(path.join(target, '.mcp.json'), JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: process.execPath,
        args: [runtime.launcher],
      },
    },
  }, null, 2) + '\n');

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeAtomic(path.join(target, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'Claude Code native Ultra Builder Pro workflows, agents, hooks, and MCP task state.',
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    repository: pkg.homepage,
    license: pkg.license || 'MIT',
  }, null, 2) + '\n');
  markManaged(target, { adapter: 'claude', plugin: PLUGIN_NAME });
  return report;
}

function uninstall(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const report = { target, removed: {}, config: { updated: false } };
  if (fs.existsSync(target) && isManaged(target)) {
    removeTree(target);
    report.removed.plugin = true;
  }
  return report;
}

module.exports = {
  name: 'claude',
  PLUGIN_NAME,
  SENTINEL_KEY,
  SOURCE_TAG,
  MCP_SERVER_NAME,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  install,
  uninstall,
};
