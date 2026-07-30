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
const { parse: parseFrontmatter, serialize: serializeFrontmatter } = require('./_shared/frontmatter.cjs');
const { adaptInteractionGuidance } = require('./_shared/interaction-contract.cjs');
const provenance = require('./_shared/provenance.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_NAME;
const SOURCE_TAG = 'ubp';
const SENTINEL_KEY = '_ubp_manifest';
const COMMAND_NAMES = CORE_PUBLIC_SKILLS;
const PROVENANCE_FILE = 'provenance.json';

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

function copySkills(repoRoot, target, names) {
  const copied = [];
  for (const name of names) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Claude skill: ${name}`);
    const files = copyTree(source, path.join(target, 'skills', name), {
      transform(buf, rel) {
        if (rel !== 'SKILL.md') {
          return rel.endsWith('.md')
            ? Buffer.from(adaptInteractionGuidance(buf.toString('utf8'), 'claude'))
            : buf;
        }
        const { fm, body } = parseFrontmatter(buf.toString('utf8'));
        if (!fm) throw new Error(`missing frontmatter in Claude skill: ${name}`);
        let adaptedBody = adaptInteractionGuidance(body, 'claude');
        if (name === 'ultra-review') {
          adaptedBody = adaptedBody.replace(
            /(?:the current host's native|the host-native) bounded-worker\s+mechanism/g,
            'Claude Code Task workers using the installed review agent definitions',
          );
        }
        const policy = skillPolicy(name);
        return Buffer.from(serializeFrontmatter({
          name,
          description: fm.description,
          'user-invocable': policy.userInvocable,
          ...(policy.userInvocable ? { 'disable-model-invocation': true } : {}),
        }, adaptedBody));
      },
    });
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
  report.copied.skills = copySkills(repoRoot, target, skillsForRuntime('claude'));
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
  const source = provenance.packageSource(repoRoot);
  const provenanceFile = path.join(target, PROVENANCE_FILE);
  report.provenance = provenance.writeProvenance({
    file: provenanceFile,
    adapter: 'claude',
    ...source,
    roots: { plugin: target },
    assets: provenance.assetRefsForTree('plugin', target, {
      exclude: ['.ubp-managed', PROVENANCE_FILE],
    }),
    contracts: {
      plugin_manifest: { root: 'plugin', path: '.claude-plugin/plugin.json' },
      mcp_registration: { root: 'plugin', path: '.mcp.json' },
      mcp_launcher: { root: 'plugin', path: 'runtime/launch.cjs' },
      hook_event_helper: { root: 'plugin', path: 'runtime/hook-event.cjs' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      checkpoint_hook: { root: 'plugin', path: 'hooks/workflow_checkpoint.py' },
      resume_hook: { root: 'plugin', path: 'hooks/workflow_resume.py' },
    },
  });
  report.provenance.file = provenanceFile;
  return report;
}

function doctor(ctx = {}) {
  const repoRoot = resolveRepoRoot(ctx);
  const source = provenance.packageSource(repoRoot);
  return provenance.inspectProvenance({
    file: path.join(resolvePluginRoot(ctx), PROVENANCE_FILE),
    expectedAdapter: 'claude',
    expectedPackageVersion: source.packageInfo.version,
  });
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
  doctor,
};
