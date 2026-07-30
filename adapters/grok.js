'use strict';

/** Build a Grok Build native Ultra Builder Pro plugin. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  applyNativeDoctor,
  buildMcpRuntime,
  mcpCommand,
} = require('./_shared/codex-assets.cjs');
const {
  copyTree,
  ensureDir,
  isManaged,
  markManaged,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const {
  parse: parseFrontmatter,
  serialize: serializeFrontmatter,
} = require('./_shared/frontmatter.cjs');
const {
  adaptInteractionGuidance,
} = require('./_shared/interaction-contract.cjs');
const provenance = require('./_shared/provenance.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_NAME;
const PROVENANCE_FILE = 'provenance.json';
const COMMAND_NAMES = CORE_PUBLIC_SKILLS;

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    return path.join(ctx.homeDir || os.homedir(), '.grok');
  }
  return path.join(ctx.cwd || process.cwd(), '.grok');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), 'plugins', PLUGIN_NAME);
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function copySkills(repoRoot, pluginRoot) {
  const copied = [];
  for (const name of skillsForRuntime('grok')) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted Grok skill: ${name}`);
    }
    const files = copyTree(source, path.join(pluginRoot, 'skills', name), {
      transform(buffer, relative) {
        if (!relative.endsWith('.md')) return buffer;
        let text = adaptInteractionGuidance(buffer.toString('utf8'), 'grok');
        if (name === 'ultra-review') {
          text = text.replace(
            /(?:the current host's native|the host-native) bounded-worker\s+mechanism/g,
            'Grok Build subagents using the installed read-only agent definitions',
          );
        }
        if (relative !== 'SKILL.md') return Buffer.from(text);
        const { fm, body } = parseFrontmatter(text);
        if (!fm) throw new Error(`missing frontmatter in Grok skill: ${name}`);
        const policy = skillPolicy(name);
        return Buffer.from(serializeFrontmatter({
          name,
          description: fm.description,
          'user-invocable': policy.userInvocable,
          ...(policy.userInvocable ? { 'disable-model-invocation': true } : {}),
        }, body));
      },
    });
    copied.push(...files.map((relative) => path.join(name, relative)));
  }
  return copied;
}

function copyCommands(repoRoot, pluginRoot) {
  const copied = [];
  for (const name of COMMAND_NAMES) {
    const source = path.join(repoRoot, 'commands', `${name}.md`);
    if (!fs.existsSync(source)) throw new Error(`missing Grok command: ${name}.md`);
    const target = path.join(pluginRoot, 'commands', `${name}.md`);
    const text = adaptInteractionGuidance(fs.readFileSync(source, 'utf8'), 'grok');
    writeAtomic(target, text);
    copied.push(`${name}.md`);
  }
  return copied;
}

function copyAgents(repoRoot, pluginRoot) {
  const copied = [];
  const sourceRoot = path.join(repoRoot, 'agents');
  for (const file of fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.md')).sort()) {
    const { fm, body } = parseFrontmatter(
      fs.readFileSync(path.join(sourceRoot, file), 'utf8'),
    );
    if (!fm?.name || !fm?.description) {
      throw new Error(`invalid Grok agent frontmatter: ${file}`);
    }
    const next = { ...fm };
    delete next.model;
    delete next.maxTurns;
    delete next.permissionMode;
    delete next.mcpServers;
    delete next.hooks;
    next.mcpInheritance = 'all';
    const instructions = [
      'Use the immutable Worker Packet supplied by the parent. Echo its exact packet_digest.',
      'Do not call Ultra MCP write tools or mutate another worker artifact.',
      '',
      adaptInteractionGuidance(body, 'grok').trim(),
      '',
    ].join('\n');
    writeAtomic(
      path.join(pluginRoot, 'agents', file),
      serializeFrontmatter(next, instructions),
    );
    copied.push(file);
  }
  return copied;
}

function hookCommand(feature, ...args) {
  return {
    type: 'command',
    command: [
      'python3 "${GROK_PLUGIN_ROOT}/hooks/adapters/grok.py"',
      JSON.stringify(feature),
      ...args.map((arg) => JSON.stringify(arg)),
    ].join(' '),
    timeout: 10,
  };
}

function buildHooksManifest() {
  return {
    description: [
      'Ultra hooks are observational except for exact managed-file protection.',
      'Grok ignores SessionStart/PostCompact stdout, so Skills read ultra.context explicitly.',
    ].join(' '),
    hooks: {
      SessionStart: [{
        matcher: 'startup|resume|clear|compact',
        hooks: [hookCommand('health_check.py')],
      }],
      PreToolUse: [{
        matcher: 'Edit|Write|MultiEdit|search_replace|apply_patch',
        hooks: [hookCommand('active_task_context.py')],
      }],
      PreCompact: [{
        matcher: 'manual|auto',
        hooks: [hookCommand('workflow_checkpoint.py')],
      }],
      Stop: [{
        hooks: [hookCommand('pre_stop_check.py')],
      }],
      SubagentStart: [{
        hooks: [hookCommand('subagent_tracker.py', 'start')],
      }],
      SubagentStop: [{
        hooks: [hookCommand('subagent_tracker.py', 'stop')],
      }],
    },
  };
}

function copyHooks(repoRoot, pluginRoot) {
  const copied = [];
  ensureDir(path.join(pluginRoot, 'hooks', 'adapters'));
  for (const name of WORKFLOW_HOOK_FILES) {
    const source = path.join(repoRoot, 'hooks', name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Grok hook: ${name}`);
    fs.copyFileSync(source, path.join(pluginRoot, 'hooks', name));
    copied.push(name);
  }
  fs.copyFileSync(
    path.join(repoRoot, 'hooks', 'adapters', 'grok.py'),
    path.join(pluginRoot, 'hooks', 'adapters', 'grok.py'),
  );
  copied.push(path.join('adapters', 'grok.py'));
  writeAtomic(
    path.join(pluginRoot, 'hooks', 'hooks.json'),
    `${JSON.stringify(buildHooksManifest(), null, 2)}\n`,
  );
  return copied;
}

function writeManifests(repoRoot, pluginRoot, runtime) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const repository = typeof pkg.repository === 'string'
    ? pkg.repository.replace(/^git\+/, '').replace(/\.git$/, '')
    : String(pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '');
  writeAtomic(path.join(pluginRoot, 'plugin.json'), `${JSON.stringify({
    name: PLUGIN_NAME,
    version: pkg.version,
    description: 'Grok Build native Ultra workflows, Worker Packets, observational hooks, and a project-local MCP safety kernel.',
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    homepage: pkg.homepage,
    repository,
    license: pkg.license || 'MIT',
  }, null, 2)}\n`);
  const command = mcpCommand(runtime.launcher);
  writeAtomic(path.join(pluginRoot, '.mcp.json'), `${JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'stdio',
        command: command.command,
        args: command.args,
      },
    },
  }, null, 2)}\n`);
}

function validatePlugin(pluginRoot, ctx = {}) {
  const binary = ctx.grokBin || path.join(
    ctx.homeDir || os.homedir(),
    '.grok',
    'bin',
    process.platform === 'win32' ? 'grok.exe' : 'grok',
  );
  if (!fs.existsSync(binary)) return { status: 'unavailable', binary };
  const result = spawnSync(binary, ['plugin', 'validate', pluginRoot], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `grok plugin validate failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return { status: 'pass', binary, output: (result.stdout || '').trim() };
}

function buildStaging(repoRoot, staging, ctx) {
  const copied = {
    commands: copyCommands(repoRoot, staging),
    skills: copySkills(repoRoot, staging),
    agents: copyAgents(repoRoot, staging),
    hooks: copyHooks(repoRoot, staging),
  };
  const runtime = buildMcpRuntime(repoRoot, staging, { runtime: 'grok' });
  writeManifests(repoRoot, staging, runtime);
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(staging, 'LICENSE'));
  }
  markManaged(staging, { adapter: 'grok', plugin: PLUGIN_NAME });
  const validation = validatePlugin(staging, ctx);
  return { copied, validation };
}

function writeProvenance(repoRoot, pluginRoot) {
  const source = provenance.packageSource(repoRoot);
  const file = path.join(pluginRoot, PROVENANCE_FILE);
  const manifest = provenance.writeProvenance({
    file,
    adapter: 'grok',
    ...source,
    roots: { plugin: pluginRoot },
    assets: provenance.assetRefsForTree('plugin', pluginRoot, {
      exclude: ['.ubp-managed', PROVENANCE_FILE],
    }),
    contracts: {
      plugin_manifest: { root: 'plugin', path: 'plugin.json' },
      mcp_registration: { root: 'plugin', path: '.mcp.json' },
      mcp_launcher: { root: 'plugin', path: 'runtime/launch.cjs' },
      native_runtime: { root: 'plugin', path: 'runtime/native-runtime.json' },
      context_envelope_helper: { root: 'plugin', path: 'runtime/hook-context.cjs' },
      hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' },
      hook_adapter: { root: 'plugin', path: path.join('hooks', 'adapters', 'grok.py') },
    },
  });
  return { file, manifest };
}

function install(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to replace unmanaged Grok plugin: ${target}`);
  }
  ensureDir(path.dirname(target));
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `${PLUGIN_NAME}-staging-`));
  const backup = `${staging}-previous`;
  let movedPrevious = false;
  let published = false;
  try {
    const built = buildStaging(repoRoot, staging, ctx);
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedPrevious = true;
    }
    fs.renameSync(staging, target);
    published = true;
    writeManifests(repoRoot, target, {
      launcher: path.join(target, 'runtime', 'launch.cjs'),
    });
    const provenanceReport = writeProvenance(repoRoot, target);
    if (movedPrevious) removeTree(backup);
    return {
      target,
      ...built,
      provenance: provenanceReport,
      trusted: ctx.scope === 'global',
      reload_required: true,
    };
  } catch (error) {
    if (published && fs.existsSync(target)) removeTree(target);
    else if (fs.existsSync(staging)) removeTree(staging);
    if (movedPrevious && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

function doctor(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const source = provenance.packageSource(resolveRepoRoot(ctx));
  const report = provenance.inspectProvenance({
    file: path.join(target, PROVENANCE_FILE),
    expectedAdapter: 'grok',
    expectedPackageVersion: source.packageInfo.version,
  });
  try {
    const validation = validatePlugin(target, ctx);
    report.checks.plugin_validation = validation;
  } catch (error) {
    report.checks.plugin_validation = { status: 'fail' };
    report.issues.push({ code: 'PLUGIN_MANIFEST_INVALID', message: error.message });
  }
  return applyNativeDoctor(report, path.join(target, 'runtime'));
}

function uninstall(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const report = { target, removed: {} };
  if (fs.existsSync(target)) {
    if (!isManaged(target)) {
      throw new Error(`refusing to remove unmanaged Grok plugin: ${target}`);
    }
    removeTree(target);
    report.removed.plugin = true;
  }
  return report;
}

module.exports = {
  name: 'grok',
  PLUGIN_NAME,
  MCP_SERVER_NAME,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  install,
  doctor,
  uninstall,
};
