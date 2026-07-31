'use strict';

/** Build a Grok Build native Ultra Builder Pro plugin. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  applyNativeDoctor,
  buildMcpRuntime,
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
const SOURCE_ROOT_PARTS = ['.ubp', 'plugin-sources', PLUGIN_NAME];
const BACKUP_ROOT_PARTS = ['.ubp', 'backups'];

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  const configuredHome = [
    ctx.grokHome,
    ctx.grokEnv?.GROK_HOME,
    ctx.env?.GROK_HOME,
    process.env.GROK_HOME,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (configuredHome) return path.resolve(configuredHome);
  return path.join(ctx.homeDir || os.homedir(), '.grok');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), 'plugins', PLUGIN_NAME);
}

function resolveSourceRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), ...SOURCE_ROOT_PARTS);
}

function resolveBackupRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), ...BACKUP_ROOT_PARTS);
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

function writeManifests(repoRoot, pluginRoot) {
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
  const launcher = '${GROK_PLUGIN_ROOT}/runtime/launch.cjs';
  writeAtomic(path.join(pluginRoot, '.mcp.json'), `${JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'stdio',
        command: process.platform === 'win32' ? 'node.exe' : '/usr/bin/env',
        args: process.platform === 'win32' ? [launcher] : ['node', launcher],
      },
    },
  }, null, 2)}\n`);
}

function grokFailure(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function resolveGrokBinary(ctx = {}) {
  const executable = process.platform === 'win32' ? 'grok.exe' : 'grok';
  if (ctx.grokBin) {
    return fs.existsSync(ctx.grokBin) ? path.resolve(ctx.grokBin) : null;
  }
  const candidates = [
    ctx.grokEnv?.GROK_BIN,
    ctx.env?.GROK_BIN,
    process.env.GROK_BIN,
    path.join(resolveTarget(ctx), 'bin', executable),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  const probe = spawnSync(executable, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return probe.status === 0 ? executable : null;
}

function nativeEnvironment(ctx = {}) {
  return {
    ...process.env,
    ...(ctx.env || {}),
    ...(ctx.grokEnv || {}),
    GROK_HOME: resolveTarget(ctx),
  };
}

function runGrok(ctx, args, {
  timeout = 60_000,
  json = false,
  allowFailure = false,
} = {}) {
  const binary = resolveGrokBinary(ctx);
  if (!binary) {
    throw grokFailure(
      'GROK_CLI_UNAVAILABLE',
      'Grok CLI is required for native plugin registration; install Grok Build or pass grokBin',
    );
  }
  const result = spawnSync(binary, args, {
    cwd: ctx.cwd || process.cwd(),
    env: nativeEnvironment(ctx),
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw grokFailure(
      'GROK_CLI_COMMAND_FAILED',
      `grok ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
      { args, status: result.status },
    );
  }
  let payload = null;
  if (json && result.status === 0) {
    try {
      payload = JSON.parse(result.stdout || 'null');
    } catch (error) {
      throw grokFailure(
        'GROK_CLI_INVALID_JSON',
        `grok ${args.join(' ')} returned invalid JSON: ${error.message}`,
      );
    }
  }
  return {
    binary,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    payload,
  };
}

function probeNativeCapabilities(ctx = {}) {
  const binary = resolveGrokBinary(ctx);
  if (!binary) return { status: 'unavailable', binary: null, capabilities: {} };
  const commands = [
    { key: 'plugin_install', args: ['plugin', 'install', '--help'], required: ['--trust'] },
    { key: 'plugin_list', args: ['plugin', 'list', '--help'], required: ['--json'] },
    { key: 'plugin_details', args: ['plugin', 'details', '--help'], required: [] },
    { key: 'plugin_enable', args: ['plugin', 'enable', '--help'], required: [] },
    {
      key: 'plugin_uninstall',
      args: ['plugin', 'uninstall', '--help'],
      required: ['--confirm', '--keep-data'],
    },
    { key: 'inspect', args: ['inspect', '--help'], required: ['--json'] },
    { key: 'mcp_doctor', args: ['mcp', 'doctor', '--help'], required: ['--json'] },
  ];
  const capabilities = {};
  for (const command of commands) {
    const result = runGrok(ctx, command.args, { timeout: 15_000 });
    const output = `${result.stdout}\n${result.stderr}`;
    const missing = command.required.filter((flag) => !output.includes(flag));
    if (missing.length > 0) {
      throw grokFailure(
        'GROK_CLI_CAPABILITY_MISSING',
        `installed Grok CLI does not expose ${command.key}: missing ${missing.join(', ')}`,
        { command: command.args, missing },
      );
    }
    capabilities[command.key] = true;
  }
  const version = runGrok(ctx, ['--version'], { timeout: 10_000 }).stdout.trim();
  return { status: 'pass', binary, version, capabilities };
}

function validatePlugin(pluginRoot, ctx = {}) {
  const capabilities = probeNativeCapabilities(ctx);
  if (capabilities.status === 'unavailable') {
    return { status: 'unavailable', binary: null };
  }
  const result = runGrok(ctx, ['plugin', 'validate', pluginRoot], { timeout: 30_000 });
  return {
    status: 'pass',
    binary: result.binary,
    output: result.stdout.trim(),
    version: capabilities.version,
  };
}

function pluginList(ctx = {}) {
  const result = runGrok(ctx, ['plugin', 'list', '--json'], { json: true });
  if (!Array.isArray(result.payload)) {
    throw grokFailure('GROK_PLUGIN_LIST_INVALID', 'grok plugin list --json must return an array');
  }
  return result.payload;
}

function installedPlugin(ctx = {}) {
  const matches = pluginList(ctx).filter((entry) => entry?.name === PLUGIN_NAME);
  if (matches.length > 1) {
    throw grokFailure(
      'GROK_PLUGIN_REGISTRY_CONFLICT',
      `Grok registered ${matches.length} Ultra Builder Pro plugin entries`,
    );
  }
  const registered = matches[0] || null;
  if (
    registered
    && (
      registered.status !== 'installed'
      || typeof registered.path !== 'string'
      || !registered.path.trim()
    )
  ) {
    throw grokFailure(
      'GROK_PLUGIN_REGISTRY_INVALID',
      'Grok returned an invalid Ultra Builder Pro registry entry',
    );
  }
  return registered;
}

function parseActivationArray(section, key, file) {
  const declaration = new RegExp(`(?:^|\\n)\\s*${key}\\s*=`, 'g');
  const assignment = new RegExp(
    `(?:^|\\n)\\s*${key}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*(?:#.*)?(?=\\n|$)`,
    'g',
  );
  const declarations = [...section.matchAll(declaration)];
  const assignments = [...section.matchAll(assignment)];
  if (declarations.length === 0) return null;
  if (declarations.length !== 1 || assignments.length !== 1) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_REGISTRY_INVALID',
      `Grok activation registry has an invalid plugins.${key} declaration: ${file}`,
      { file, key },
    );
  }
  let values;
  try {
    values = JSON.parse(assignments[0][1]);
  } catch (error) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_REGISTRY_INVALID',
      `Grok activation registry has an unreadable plugins.${key} array: ${file}`,
      { file, key, cause_code: error.code || null },
    );
  }
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_REGISTRY_INVALID',
      `Grok activation registry plugins.${key} must be a string array: ${file}`,
      { file, key },
    );
  }
  return values;
}

function registeredActivationState(ctx) {
  const file = path.join(resolveTarget(ctx), 'config.toml');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const sectionIndexes = lines
    .map((line, index) => (/^\s*\[plugins\]\s*(?:#.*)?$/.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (sectionIndexes.length === 0) return null;
  if (sectionIndexes.length !== 1) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_REGISTRY_INVALID',
      `Grok activation registry contains multiple [plugins] sections: ${file}`,
      { file },
    );
  }
  const start = sectionIndexes[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*(?:#.*)?$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const section = lines.slice(start, end).join('\n');
  const enabled = parseActivationArray(section, 'enabled', file);
  const disabled = parseActivationArray(section, 'disabled', file);
  const listedEnabled = enabled?.includes(PLUGIN_NAME) === true;
  const listedDisabled = disabled?.includes(PLUGIN_NAME) === true;
  if (listedEnabled && listedDisabled) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_REGISTRY_INVALID',
      `Grok activation registry lists ${PLUGIN_NAME} as both enabled and disabled`,
      { file },
    );
  }
  if (listedEnabled) return true;
  if (listedDisabled) return false;
  return null;
}

function resolveNativeInstallPath(plugin) {
  if (typeof plugin?.path !== 'string' || !plugin.path.trim()) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_MISSING',
      'Grok registry did not return an installed path for Ultra Builder Pro',
    );
  }
  const target = path.resolve(plugin.path);
  if (!fs.existsSync(target)) {
    throw grokFailure('GROK_PLUGIN_PATH_MISSING', `Grok registered plugin path is missing: ${target}`);
  }
  const canonicalTarget = fs.realpathSync(target);
  if (!fs.statSync(canonicalTarget).isDirectory()) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_MISSING',
      `Grok registered plugin path is not a directory: ${canonicalTarget}`,
    );
  }
  return canonicalTarget;
}

function assertRegisteredSource(ctx, plugin, {
  expectedPackageName,
  expectedPackageVersion,
  sourceRoot = resolveSourceRoot(ctx),
} = {}) {
  if (typeof plugin?.source !== 'string' || !plugin.source.trim()) {
    throw grokFailure(
      'GROK_PLUGIN_SOURCE_MISSING',
      'Grok registry did not return the source used to install Ultra Builder Pro',
    );
  }
  const expectedSource = path.resolve(sourceRoot);
  const registeredSource = path.resolve(plugin.source);
  if (!fs.existsSync(expectedSource) || !fs.existsSync(registeredSource)) {
    throw grokFailure(
      'GROK_PLUGIN_SOURCE_MISSING',
      `Grok registered plugin source is missing: ${registeredSource}`,
      { expected: expectedSource, actual: registeredSource },
    );
  }
  const canonicalExpected = fs.realpathSync(expectedSource);
  const canonicalSource = fs.realpathSync(registeredSource);
  if (canonicalSource !== canonicalExpected) {
    throw grokFailure(
      'GROK_PLUGIN_SOURCE_MISMATCH',
      `Grok registered ${canonicalSource}, expected managed source ${canonicalExpected}`,
      { expected: canonicalExpected, actual: canonicalSource },
    );
  }
  const report = assertManagedProvenance(canonicalSource, 'registered Grok source', {
    expectedPackageName,
    expectedPackageVersion,
  });
  return { path: canonicalSource, report };
}

function assertNativeInstallPath(ctx, plugin, {
  expectedPackageName = null,
  expectedPackageVersion = null,
  sourceRoot = resolveSourceRoot(ctx),
} = {}) {
  const packageInfo = expectedPackageName
    ? null
    : provenance.packageSource(resolveRepoRoot(ctx)).packageInfo;
  const packageName = expectedPackageName || packageInfo.name;
  const packageVersion = expectedPackageVersion || plugin?.version;
  if (typeof packageVersion !== 'string' || !packageVersion.trim()) {
    throw grokFailure(
      'GROK_PLUGIN_VERSION_MISSING',
      'Grok registry did not return an Ultra Builder Pro package version',
    );
  }
  if (plugin.version !== packageVersion) {
    throw grokFailure(
      'GROK_PLUGIN_VERSION_MISMATCH',
      `Grok registered Ultra Builder Pro ${plugin.version || '<missing>'}, expected ${packageVersion}`,
      { expected: packageVersion, actual: plugin.version || null },
    );
  }
  const target = resolveNativeInstallPath(plugin);
  if (!isManaged(target)) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_UNSAFE',
      `Grok registry returned an unmanaged plugin path: ${target}`,
      { path: target },
    );
  }
  assertManagedProvenance(target, 'registered Grok target', {
    expectedPackageName: packageName,
    expectedPackageVersion: packageVersion,
  });
  assertRegisteredSource(ctx, plugin, {
    expectedPackageName: packageName,
    expectedPackageVersion: packageVersion,
    sourceRoot,
  });
  return target;
}

function assertConsumerPath(expectedTarget, reportedPath, label, ctx = {}) {
  if (typeof reportedPath !== 'string' || !reportedPath.trim()) {
    throw grokFailure(
      'GROK_PLUGIN_CONSUMER_PATH_MISSING',
      `Grok ${label} did not report the registered plugin path`,
      { expected: expectedTarget, actual: reportedPath || null, label },
    );
  }
  const absolute = path.resolve(ctx.cwd || process.cwd(), reportedPath);
  let canonical;
  try {
    canonical = fs.realpathSync(absolute);
  } catch (error) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_SHADOWED',
      `Grok ${label} resolved a missing path instead of the registered plugin: ${absolute}`,
      { expected: expectedTarget, actual: absolute, label, cause_code: error.code || null },
    );
  }
  if (canonical !== expectedTarget) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_SHADOWED',
      `Grok ${label} resolved ${canonical}, expected registered target ${expectedTarget}`,
      { expected: expectedTarget, actual: canonical, label },
    );
  }
  return canonical;
}

function nativeActivationState(ctx, target) {
  const registeredState = registeredActivationState(ctx);
  if (registeredState !== null) return registeredState;
  const inspect = runGrok(ctx, ['inspect', '--json'], { json: true }).payload;
  const matches = (Array.isArray(inspect?.plugins) ? inspect.plugins : [])
    .filter((entry) => entry?.name === PLUGIN_NAME);
  if (matches.length !== 1) {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_STATE_INVALID',
      `Grok inspect returned ${matches.length} Ultra Builder Pro plugin entries`,
      { expected: 1, actual: matches.length },
    );
  }
  const plugin = matches[0];
  assertConsumerPath(target, plugin.path, 'inspect plugin activation', ctx);
  if (typeof plugin.enabled !== 'boolean') {
    throw grokFailure(
      'GROK_PLUGIN_ACTIVATION_STATE_INVALID',
      'Grok inspect did not report a boolean Ultra Builder Pro activation state',
      { actual: plugin.enabled ?? null },
    );
  }
  return plugin.enabled;
}

function restoreNativeActivation(ctx, target, enabled) {
  runGrok(ctx, ['plugin', enabled ? 'enable' : 'disable', PLUGIN_NAME]);
  const restored = nativeActivationState(ctx, target);
  if (restored !== enabled) {
    throw grokFailure(
      'GROK_ROLLBACK_ACTIVATION_MISMATCH',
      `Grok restored Ultra Builder Pro with enabled=${restored}, expected enabled=${enabled}`,
      { expected: enabled, actual: restored },
    );
  }
  return restored;
}

function nativeConsumerState(ctx = {}, registered = null) {
  const registryEntry = registered || installedPlugin(ctx);
  const target = registryEntry ? assertNativeInstallPath(ctx, registryEntry) : null;
  const inspect = runGrok(ctx, ['inspect', '--json'], { json: true }).payload;
  const plugins = Array.isArray(inspect?.plugins) ? inspect.plugins : [];
  const servers = Array.isArray(inspect?.mcpServers) ? inspect.mcpServers : [];
  const matchingPlugins = plugins.filter((entry) => entry?.name === PLUGIN_NAME);
  const matchingServers = servers.filter((entry) => (
    entry?.name === MCP_SERVER_NAME
    && entry?.source?.type === 'plugin'
    && entry?.source?.plugin_name === PLUGIN_NAME
  ));
  if (target) {
    for (const pluginEntry of matchingPlugins) {
      assertConsumerPath(target, pluginEntry.path, 'inspect plugin', ctx);
    }
    for (const serverEntry of matchingServers) {
      assertConsumerPath(target, serverEntry.source.path, 'inspect plugin MCP source', ctx);
    }
  }
  const plugin = matchingPlugins[0] || null;
  const mcp = matchingServers[0] || null;
  const doctor = runGrok(
    ctx,
    ['mcp', 'doctor', MCP_SERVER_NAME, '--json'],
    { json: true, timeout: 60_000 },
  ).payload;
  const doctorServers = Array.isArray(doctor?.servers) ? doctor.servers : [];
  const doctorServer = doctorServers.find((entry) => {
    if (entry?.name !== MCP_SERVER_NAME) return false;
    if (typeof entry.source === 'string') return entry.source.includes(PLUGIN_NAME);
    return entry?.source?.plugin_name === PLUGIN_NAME;
  }) || null;
  return {
    inspect,
    doctor,
    plugin,
    mcp,
    doctorServer,
    target,
    healthy: Boolean(plugin && mcp && doctorServer?.healthy === true),
  };
}

function buildStaging(repoRoot, staging, ctx) {
  const copied = {
    commands: copyCommands(repoRoot, staging),
    skills: copySkills(repoRoot, staging),
    agents: copyAgents(repoRoot, staging),
    hooks: copyHooks(repoRoot, staging),
  };
  const runtime = buildMcpRuntime(repoRoot, staging, { runtime: 'grok' });
  writeManifests(repoRoot, staging);
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

function managedCopy(source, target) {
  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
}

function rebaseProvenanceRoot(pluginRoot) {
  const file = path.join(pluginRoot, PROVENANCE_FILE);
  if (!fs.existsSync(file)) return null;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!manifest.roots || typeof manifest.roots !== 'object') {
    throw grokFailure(
      'GROK_ROLLBACK_SOURCE_INVALID',
      `rollback source has invalid provenance roots: ${file}`,
    );
  }
  manifest.roots.plugin = path.resolve(pluginRoot);
  writeAtomic(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function sourceMatchesRegistration(source, registered) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
    return (
      manifest.name === PLUGIN_NAME
      && (!registered.version || manifest.version === registered.version)
    );
  } catch {
    return false;
  }
}

function ensureRecoverySource(registered, sourceRoot, nativeBackup) {
  const declaredSource = typeof registered.source === 'string'
    ? path.resolve(registered.source)
    : null;
  if (
    declaredSource
    && fs.existsSync(declaredSource)
    && isManaged(declaredSource)
    && sourceMatchesRegistration(declaredSource, registered)
  ) {
    return declaredSource;
  }
  if (
    fs.existsSync(sourceRoot)
    && isManaged(sourceRoot)
    && sourceMatchesRegistration(sourceRoot, registered)
  ) {
    return sourceRoot;
  }
  if (fs.existsSync(sourceRoot)) {
    throw grokFailure(
      'GROK_ROLLBACK_SOURCE_CONFLICT',
      `cannot reconstruct the prior Grok source over existing bytes: ${sourceRoot}`,
    );
  }
  if (!nativeBackup || !fs.existsSync(nativeBackup)) {
    throw grokFailure(
      'GROK_ROLLBACK_SOURCE_MISSING',
      'the previous Grok plugin source is unavailable and cannot be reconstructed safely',
    );
  }
  managedCopy(nativeBackup, sourceRoot);
  rebaseProvenanceRoot(sourceRoot);
  return sourceRoot;
}

function nativeUninstall(ctx, { allowMissing = false } = {}) {
  const entry = installedPlugin(ctx);
  if (!entry) {
    if (allowMissing) return null;
    throw grokFailure('GROK_PLUGIN_NOT_REGISTERED', 'Ultra Builder Pro is not registered by Grok');
  }
  runGrok(ctx, ['plugin', 'uninstall', PLUGIN_NAME, '--confirm', '--keep-data']);
  return entry;
}

function restoreNativeRegistration(ctx, source, {
  verifyConsumer = true,
  enabled = true,
} = {}) {
  if (!source || !fs.existsSync(source)) {
    throw grokFailure(
      'GROK_ROLLBACK_SOURCE_MISSING',
      `cannot restore Grok registration from missing source: ${source || '<none>'}`,
    );
  }
  const current = installedPlugin(ctx);
  if (current) nativeUninstall(ctx, { allowMissing: true });
  runGrok(ctx, ['plugin', 'install', source, '--trust']);
  const registered = installedPlugin(ctx);
  if (!registered) {
    throw grokFailure(
      'GROK_ROLLBACK_NOT_REGISTERED',
      'Grok did not register the restored Ultra Builder Pro source',
    );
  }
  const finalized = finalizeNativeRegistration(
    ctx,
    resolveRepoRoot(ctx),
    source,
    registered,
    { expectedPackageVersion: registered.version },
  );
  const target = finalized.target;
  if (
    typeof registered.source === 'string'
    && path.resolve(registered.source) !== path.resolve(source)
  ) {
    throw grokFailure(
      'GROK_ROLLBACK_SOURCE_MISMATCH',
      `Grok restored Ultra from ${registered.source}, expected ${source}`,
    );
  }
  runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
  restoreNativeActivation(ctx, target, enabled);
  let consumer = null;
  if (verifyConsumer) {
    consumer = nativeConsumerState(ctx, registered);
    if (!consumer.healthy) {
      throw grokFailure(
        'GROK_ROLLBACK_NOT_ACTIVE',
        'restored Grok plugin did not pass native inspect and MCP Doctor',
      );
    }
  }
  return { registered, target, consumer };
}

function combinedRollbackFailure(originalError, rollbackError, recovery = {}) {
  const error = grokFailure(
    'GROK_INSTALL_ROLLBACK_FAILED',
    [
      `Grok install failed: ${originalError.message}`,
      `rollback failed: ${rollbackError.message}`,
    ].join('; '),
    {
      original_code: originalError.code || null,
      rollback_code: rollbackError.code || null,
      ...recovery,
    },
  );
  error.cause = originalError;
  error.original_error = originalError.message;
  error.rollback_error = rollbackError.message;
  return error;
}

function combinedUninstallRollbackFailure(originalError, rollbackError, recovery = {}) {
  const error = grokFailure(
    'GROK_UNINSTALL_ROLLBACK_FAILED',
    [
      `Grok uninstall failed: ${originalError.message}`,
      `rollback failed: ${rollbackError.message}`,
    ].join('; '),
    {
      original_code: originalError.code || null,
      rollback_code: rollbackError.code || null,
      ...recovery,
    },
  );
  error.cause = originalError;
  error.original_error = originalError.message;
  error.rollback_error = rollbackError.message;
  return error;
}

function assertOwnedForUninstall(target, label) {
  if (!fs.existsSync(target)) return;
  if (!isManaged(target)) {
    throw grokFailure(
      'GROK_UNINSTALL_OWNERSHIP_CONFLICT',
      `refusing to uninstall because ${label} is not owned by Ultra: ${target}`,
      { label, path: target },
    );
  }
}

function assertManagedProvenance(target, label, {
  expectedPackageName,
  expectedPackageVersion = null,
  allowMarkerOnly = false,
} = {}) {
  if (!fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) {
    throw grokFailure(
      'GROK_MANAGED_ROOT_INVALID',
      `${label} is not a managed directory: ${target}`,
      { label, path: target },
    );
  }
  if (!isManaged(target)) {
    throw grokFailure(
      'GROK_MANAGED_ROOT_UNOWNED',
      `${label} is not owned by Ultra: ${target}`,
      { label, path: target },
    );
  }
  const file = path.join(target, PROVENANCE_FILE);
  if (allowMarkerOnly && !fs.existsSync(file)) {
    return { status: 'legacy', path: target };
  }
  const report = provenance.inspectProvenance({
    file,
    expectedAdapter: 'grok',
    expectedPackageVersion,
  });
  if (report.status !== 'healthy' || report.package?.name !== expectedPackageName) {
    throw grokFailure(
      'GROK_MANAGED_ROOT_PROVENANCE_INVALID',
      `${label} failed Ultra provenance verification: ${target}`,
      { label, path: target, issues: report.issues },
    );
  }
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const declaredRoot = path.resolve(manifest.roots?.plugin || '');
  const canonicalDeclaredRoot = fs.existsSync(declaredRoot)
    ? fs.realpathSync(declaredRoot)
    : declaredRoot;
  const canonicalTarget = fs.realpathSync(target);
  if (canonicalDeclaredRoot !== canonicalTarget) {
    throw grokFailure(
      'GROK_MANAGED_ROOT_PROVENANCE_INVALID',
      `${label} provenance is bound to a different root: ${target}`,
      {
        label,
        path: target,
        declared_root: manifest.roots?.plugin || null,
      },
    );
  }
  return report;
}

function finalizeNativeRegistration(ctx, repoRoot, sourceRoot, registered, {
  expectedPackageVersion = null,
} = {}) {
  const packageInfo = provenance.packageSource(repoRoot).packageInfo;
  const packageVersion = expectedPackageVersion || packageInfo.version;
  if (registered.version !== packageVersion) {
    throw grokFailure(
      'GROK_PLUGIN_VERSION_MISMATCH',
      `Grok installed Ultra Builder Pro ${registered.version || '<missing>'}, expected ${packageVersion}`,
      { expected: packageVersion, actual: registered.version || null },
    );
  }
  const target = resolveNativeInstallPath(registered);
  if (!isManaged(target)) {
    throw grokFailure(
      'GROK_PLUGIN_PATH_UNSAFE',
      `Grok registry returned an unmanaged plugin path: ${target}`,
      { path: target },
    );
  }
  const source = assertRegisteredSource(ctx, registered, {
    expectedPackageName: packageInfo.name,
    expectedPackageVersion: packageVersion,
    sourceRoot,
  });
  const file = path.join(target, PROVENANCE_FILE);
  let copiedManifest;
  try {
    copiedManifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw grokFailure(
      'GROK_PLUGIN_TARGET_PROVENANCE_INVALID',
      `Grok installed target has invalid copied provenance: ${target}`,
      { path: target, cause_code: error.code || null },
    );
  }
  const declaredRoot = path.resolve(copiedManifest.roots?.plugin || '');
  const canonicalDeclaredRoot = fs.existsSync(declaredRoot)
    ? fs.realpathSync(declaredRoot)
    : declaredRoot;
  if (
    canonicalDeclaredRoot !== source.path
    && canonicalDeclaredRoot !== target
  ) {
    throw grokFailure(
      'GROK_PLUGIN_TARGET_PROVENANCE_INVALID',
      `Grok installed target provenance is not derived from its registered source: ${target}`,
      { path: target, declared_root: copiedManifest.roots?.plugin || null },
    );
  }
  if (
    typeof copiedManifest.content?.digest !== 'string'
    || copiedManifest.content.digest !== source.report.content_digest
  ) {
    throw grokFailure(
      'GROK_PLUGIN_TARGET_PROVENANCE_INVALID',
      `Grok installed target does not match its registered source provenance: ${target}`,
      {
        path: target,
        expected_digest: source.report.content_digest,
        actual_digest: copiedManifest.content?.digest || null,
      },
    );
  }
  const manifest = rebaseProvenanceRoot(target);
  const targetReport = assertManagedProvenance(target, 'registered Grok target', {
    expectedPackageName: packageInfo.name,
    expectedPackageVersion: packageVersion,
  });
  if (targetReport.content_digest !== source.report.content_digest) {
    throw grokFailure(
      'GROK_PLUGIN_TARGET_PROVENANCE_INVALID',
      `Grok installed target assets differ from its registered source: ${target}`,
      {
        path: target,
        expected_digest: source.report.content_digest,
        actual_digest: targetReport.content_digest,
      },
    );
  }
  assertNativeInstallPath(ctx, registered, {
    expectedPackageName: packageInfo.name,
    expectedPackageVersion: packageVersion,
    sourceRoot,
  });
  return { target, provenance: { file, manifest } };
}

function installPreflight(ctx, repoRoot, sourceRoot, legacyRoot) {
  try {
    const packageInfo = provenance.packageSource(repoRoot).packageInfo;
    const registered = installedPlugin(ctx);
    let installedRoot = null;
    if (registered) {
      installedRoot = assertNativeInstallPath(ctx, registered, {
        expectedPackageName: packageInfo.name,
        expectedPackageVersion: registered.version,
        sourceRoot,
      });
      const consumer = nativeConsumerState(ctx, registered);
      if (!consumer.healthy) {
        throw grokFailure(
          'GROK_PLUGIN_MCP_INACTIVE',
          'existing Grok registration did not pass native inspect and MCP Doctor',
        );
      }
    } else {
      assertManagedProvenance(sourceRoot, 'current Grok source', {
        expectedPackageName: packageInfo.name,
        expectedPackageVersion: null,
      });
    }
    assertManagedProvenance(legacyRoot, 'legacy Grok plugin', {
      expectedPackageName: packageInfo.name,
      allowMarkerOnly: true,
    });
    return { registered, installedRoot };
  } catch (error) {
    const failure = grokFailure(
      'GROK_INSTALL_PREFLIGHT_FAILED',
      `Grok install preflight failed: ${error.message}`,
      { cause_code: error.code || null, ...(error.details || {}) },
    );
    failure.cause = error;
    throw failure;
  }
}

function install(ctx = {}) {
  const sourceRoot = resolveSourceRoot(ctx);
  const legacyRoot = resolvePluginRoot(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const capability = probeNativeCapabilities(ctx);
  if (capability.status !== 'pass') {
    throw grokFailure(
      'GROK_CLI_UNAVAILABLE',
      'Grok CLI is required for formal plugin installation; no files were changed',
    );
  }
  const preflight = installPreflight(ctx, repoRoot, sourceRoot, legacyRoot);
  const sourceParent = path.dirname(sourceRoot);
  ensureDir(sourceParent);
  const staging = fs.mkdtempSync(path.join(sourceParent, `${PLUGIN_NAME}-staging-`));
  const sourceBackup = `${staging}-source-previous`;
  const backupRoot = resolveBackupRoot(ctx);
  const transactionId = crypto.randomUUID();
  const legacyBackup = path.join(backupRoot, `legacy-plugin-${transactionId}`);
  const nativeBackup = path.join(backupRoot, `native-plugin-${transactionId}`);
  let sourceMoved = false;
  let sourcePublished = false;
  let legacyMoved = false;
  let nativeSnapshot = false;
  let registryMutationStarted = false;
  const originalNative = preflight.registered;
  let built;

  try {
    built = buildStaging(repoRoot, staging, ctx);
    if (fs.existsSync(sourceRoot)) {
      if (!isManaged(sourceRoot)) {
        throw grokFailure(
          'GROK_SOURCE_UNMANAGED',
          `refusing to replace unmanaged Grok plugin source: ${sourceRoot}`,
        );
      }
      fs.renameSync(sourceRoot, sourceBackup);
      sourceMoved = true;
    }
    fs.renameSync(staging, sourceRoot);
    sourcePublished = true;
    writeProvenance(repoRoot, sourceRoot);

    if (originalNative) {
      const installedRoot = preflight.installedRoot;
      if (!isManaged(installedRoot)) {
        throw grokFailure(
          'GROK_PLUGIN_OWNERSHIP_CONFLICT',
          `refusing to replace an installed Grok plugin not owned by Ultra: ${installedRoot}`,
        );
      }
      ensureDir(backupRoot);
      managedCopy(installedRoot, nativeBackup);
      nativeSnapshot = true;
    }

    if (fs.existsSync(legacyRoot)) {
      if (!isManaged(legacyRoot)) {
        throw grokFailure(
          'GROK_LEGACY_PLUGIN_UNMANAGED',
          `refusing to migrate unmanaged Grok plugin: ${legacyRoot}`,
        );
      }
      ensureDir(backupRoot);
      fs.renameSync(legacyRoot, legacyBackup);
      legacyMoved = true;
    }

    if (originalNative) {
      registryMutationStarted = true;
      nativeUninstall(ctx);
    }
    registryMutationStarted = true;
    runGrok(ctx, ['plugin', 'install', sourceRoot, '--trust']);
    runGrok(ctx, ['plugin', 'enable', PLUGIN_NAME]);
    const registered = installedPlugin(ctx);
    if (!registered) {
      throw grokFailure(
        'GROK_PLUGIN_NOT_REGISTERED',
        'Grok accepted the plugin install command but did not register Ultra Builder Pro',
      );
    }
    const finalized = finalizeNativeRegistration(ctx, repoRoot, sourceRoot, registered);
    const target = finalized.target;
    const provenanceReport = finalized.provenance;
    const consumer = nativeConsumerState(ctx, registered);
    if (!consumer.healthy) {
      throw grokFailure(
        'GROK_PLUGIN_NOT_ACTIVE',
        'Grok registered Ultra Builder Pro but did not activate its plugin MCP consumer',
      );
    }

    if (sourceMoved && fs.existsSync(sourceBackup)) removeTree(sourceBackup);
    if (nativeSnapshot && fs.existsSync(nativeBackup)) removeTree(nativeBackup);
    return {
      target,
      source: sourceRoot,
      ...built,
      provenance: provenanceReport,
      native_registry: {
        status: 'pass',
        repo_key: registered.repo_key || null,
        path: target,
      },
      native_consumer: {
        status: 'pass',
        mcp: MCP_SERVER_NAME,
        healthy: true,
      },
      migration: legacyMoved ? {
        legacy_backup: legacyBackup,
        legacy_source_removed: true,
      } : null,
      trusted: true,
      reload_required: true,
    };
  } catch (error) {
    let rollbackError = null;
    let recoverySource = null;
    try {
      if (registryMutationStarted) nativeUninstall(ctx, { allowMissing: true });
      if (sourcePublished && fs.existsSync(sourceRoot)) removeTree(sourceRoot);
      else if (fs.existsSync(staging)) removeTree(staging);
      if (sourceMoved && fs.existsSync(sourceBackup)) fs.renameSync(sourceBackup, sourceRoot);
      if (legacyMoved && fs.existsSync(legacyBackup)) {
        ensureDir(path.dirname(legacyRoot));
        fs.renameSync(legacyBackup, legacyRoot);
      }
      if (originalNative && registryMutationStarted) {
        recoverySource = ensureRecoverySource(originalNative, sourceRoot, nativeBackup);
        restoreNativeRegistration(ctx, recoverySource);
      }
      if (nativeSnapshot && fs.existsSync(nativeBackup)) removeTree(nativeBackup);
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError;
    }
    if (rollbackError) {
      throw combinedRollbackFailure(error, rollbackError, {
        recovery_source: recoverySource,
        native_backup: nativeSnapshot && fs.existsSync(nativeBackup) ? nativeBackup : null,
      });
    }
    throw error;
  }
}

function doctor(ctx = {}) {
  const source = provenance.packageSource(resolveRepoRoot(ctx));
  const capability = probeNativeCapabilities(ctx);
  if (capability.status === 'unavailable') {
    const sourceRoot = resolveSourceRoot(ctx);
    const report = provenance.inspectProvenance({
      file: path.join(sourceRoot, PROVENANCE_FILE),
      expectedAdapter: 'grok',
      expectedPackageVersion: source.packageInfo.version,
    });
    report.checks.native_registry = { status: 'unavailable' };
    report.checks.native_consumer = { status: 'unavailable' };
    report.issues.push({
      code: 'GROK_CLI_UNAVAILABLE',
      message: 'Grok CLI is unavailable, so native registry and MCP activation were not verified',
    });
    report.status = 'degraded';
    return applyNativeDoctor(report, path.join(sourceRoot, 'runtime'));
  }

  let registered;
  try {
    registered = installedPlugin(ctx);
  } catch (error) {
    return {
      adapter: 'grok',
      status: 'degraded',
      manifest_path: null,
      checks: { native_registry: { status: 'fail' } },
      issues: [{ code: error.code || 'GROK_PLUGIN_LIST_FAILED', message: error.message }],
    };
  }
  if (!registered) {
    const legacyRoot = resolvePluginRoot(ctx);
    return {
      adapter: 'grok',
      status: 'degraded',
      manifest_path: fs.existsSync(path.join(legacyRoot, PROVENANCE_FILE))
        ? path.join(legacyRoot, PROVENANCE_FILE)
        : null,
      checks: {
        native_registry: { status: 'fail' },
        raw_plugin: {
          status: fs.existsSync(legacyRoot) ? 'found' : 'missing',
          path: legacyRoot,
        },
      },
      issues: [{
        code: 'GROK_PLUGIN_NOT_REGISTERED',
        message: fs.existsSync(legacyRoot)
          ? 'a raw Grok plugin exists, but the native Grok plugin registry does not contain it'
          : 'Ultra Builder Pro is not registered in the native Grok plugin registry',
      }],
    };
  }

  let target;
  try {
    target = assertNativeInstallPath(ctx, registered, {
      expectedPackageName: source.packageInfo.name,
      expectedPackageVersion: source.packageInfo.version,
      sourceRoot: resolveSourceRoot(ctx),
    });
  } catch (error) {
    return {
      adapter: 'grok',
      status: 'degraded',
      manifest_path: null,
      checks: {
        native_registry: {
          status: 'fail',
          repo_key: registered.repo_key || null,
          path: registered.path,
        },
        native_consumer: { status: 'unknown' },
      },
      issues: [{
        code: error.code || 'GROK_PLUGIN_PATH_INVALID',
        message: error.message,
        ...(error.details || {}),
      }],
    };
  }
  const report = provenance.inspectProvenance({
    file: path.join(target, PROVENANCE_FILE),
    expectedAdapter: 'grok',
    expectedPackageVersion: source.packageInfo.version,
  });
  report.checks.native_registry = {
    status: 'pass',
    repo_key: registered.repo_key || null,
    path: target,
  };
  try {
    const details = runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
    report.checks.plugin_details = {
      status: 'pass',
      output: details.stdout.trim(),
    };
  } catch (error) {
    report.checks.plugin_details = { status: 'fail' };
    report.issues.push({
      code: 'GROK_PLUGIN_DETAILS_FAILED',
      message: error.message,
    });
  }
  try {
    const consumer = nativeConsumerState(ctx, registered);
    report.checks.native_consumer = {
      status: consumer.healthy ? 'pass' : 'fail',
      plugin_discovered: Boolean(consumer.plugin),
      plugin_mcp_active: Boolean(consumer.mcp),
      mcp_healthy: consumer.doctorServer?.healthy === true,
    };
    if (!consumer.healthy) {
      report.issues.push({
        code: 'GROK_PLUGIN_MCP_INACTIVE',
        message: 'Grok native inspection or MCP Doctor did not confirm the plugin MCP consumer',
      });
    }
  } catch (error) {
    report.checks.native_consumer = { status: 'fail' };
    report.issues.push({
      code: error.code || 'GROK_PLUGIN_MCP_CHECK_FAILED',
      message: error.message,
    });
  }
  try {
    report.checks.plugin_validation = validatePlugin(target, ctx);
  } catch (error) {
    report.checks.plugin_validation = { status: 'fail' };
    report.issues.push({ code: 'PLUGIN_MANIFEST_INVALID', message: error.message });
  }
  return applyNativeDoctor(report, path.join(target, 'runtime'));
}

function uninstall(ctx = {}) {
  const sourceRoot = resolveSourceRoot(ctx);
  const legacyRoot = resolvePluginRoot(ctx);
  const capability = probeNativeCapabilities(ctx);
  if (capability.status !== 'pass') {
    throw grokFailure(
      'GROK_CLI_UNAVAILABLE',
      'Grok CLI is required for formal plugin uninstall; no files were changed',
    );
  }
  const report = {
    target: null,
    source: sourceRoot,
    removed: {},
    native_registry: { status: capability.status },
  };
  const registered = installedPlugin(ctx);
  let installedRoot = null;
  let registeredEnabled = null;
  if (registered) {
    installedRoot = resolveNativeInstallPath(registered);
    report.target = installedRoot;
  }
  const declaredSource = registered && typeof registered.source === 'string'
    ? path.resolve(registered.source)
    : null;
  const ownershipTargets = [
    [installedRoot, 'managed target'],
    [sourceRoot, 'persistent source'],
    [legacyRoot, 'legacy raw plugin'],
    [
      declaredSource
        && declaredSource !== path.resolve(sourceRoot)
        && declaredSource !== installedRoot
        ? declaredSource
        : null,
      'registered source',
    ],
  ];
  for (const [target, label] of ownershipTargets) {
    if (target) assertOwnedForUninstall(target, label);
  }
  if (registered) {
    installedRoot = assertNativeInstallPath(ctx, registered);
    runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
    registeredEnabled = nativeActivationState(ctx, installedRoot);
  }

  const transactionId = crypto.randomUUID();
  const sourceBackup = path.join(
    path.dirname(sourceRoot),
    `.${path.basename(sourceRoot)}-uninstall-${transactionId}`,
  );
  const legacyBackup = path.join(
    path.dirname(legacyRoot),
    `.${path.basename(legacyRoot)}-uninstall-${transactionId}`,
  );
  const backupRoot = resolveBackupRoot(ctx);
  const nativeBackup = path.join(
    backupRoot,
    `uninstall-native-${transactionId}`,
  );
  let sourceStaged = false;
  let legacyStaged = false;
  let nativeSnapshot = false;
  let registryMutationStarted = false;
  try {
    if (fs.existsSync(sourceRoot)) {
      fs.renameSync(sourceRoot, sourceBackup);
      sourceStaged = true;
    }
    if (fs.existsSync(legacyRoot)) {
      fs.renameSync(legacyRoot, legacyBackup);
      legacyStaged = true;
    }
    if (registered) {
      ensureDir(backupRoot);
      managedCopy(installedRoot, nativeBackup);
      nativeSnapshot = true;
      registryMutationStarted = true;
      nativeUninstall(ctx);
      report.removed.native_plugin = true;
    }
    const remaining = installedPlugin(ctx);
    if (remaining) {
      throw grokFailure(
        'GROK_UNINSTALL_NOT_REMOVED',
        'Grok reported uninstall success but the native registry still contains Ultra Builder Pro',
      );
    }
    if (sourceStaged) report.removed.source = true;
    if (legacyStaged) report.removed.legacy_plugin = true;
    if (sourceStaged && fs.existsSync(sourceBackup)) removeTree(sourceBackup);
    if (legacyStaged && fs.existsSync(legacyBackup)) removeTree(legacyBackup);
    if (nativeSnapshot && fs.existsSync(nativeBackup)) removeTree(nativeBackup);
    return report;
  } catch (error) {
    let rollbackError = null;
    let recoverySource = null;
    try {
      if (sourceStaged && fs.existsSync(sourceBackup)) {
        if (fs.existsSync(sourceRoot)) {
          throw grokFailure(
            'GROK_UNINSTALL_ROLLBACK_SOURCE_CONFLICT',
            `cannot restore Grok source over existing bytes: ${sourceRoot}`,
          );
        }
        fs.renameSync(sourceBackup, sourceRoot);
      }
      if (legacyStaged && fs.existsSync(legacyBackup)) {
        if (fs.existsSync(legacyRoot)) {
          throw grokFailure(
            'GROK_UNINSTALL_ROLLBACK_LEGACY_CONFLICT',
            `cannot restore legacy Grok plugin over existing bytes: ${legacyRoot}`,
          );
        }
        fs.renameSync(legacyBackup, legacyRoot);
      }
      if (registered && registryMutationStarted) {
        const current = installedPlugin(ctx);
        if (current) {
          const currentTarget = assertNativeInstallPath(ctx, current);
          const originalSource = typeof registered.source === 'string'
            ? path.resolve(registered.source)
            : null;
          const currentSource = typeof current.source === 'string'
            ? path.resolve(current.source)
            : null;
          if (currentTarget !== installedRoot || currentSource !== originalSource) {
            throw grokFailure(
              'GROK_UNINSTALL_ROLLBACK_REGISTRY_MISMATCH',
              'remaining Grok registration does not match the pre-uninstall registry entry',
              {
                expected_path: installedRoot,
                actual_path: currentTarget,
                expected_source: originalSource,
                actual_source: currentSource,
              },
            );
          }
          runGrok(ctx, ['plugin', 'details', PLUGIN_NAME]);
          restoreNativeActivation(ctx, currentTarget, registeredEnabled);
        } else {
          recoverySource = ensureRecoverySource(registered, sourceRoot, nativeBackup);
          restoreNativeRegistration(ctx, recoverySource, {
            verifyConsumer: false,
            enabled: registeredEnabled,
          });
        }
      }
      if (nativeSnapshot && fs.existsSync(nativeBackup)) removeTree(nativeBackup);
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError;
    }
    if (rollbackError) {
      throw combinedUninstallRollbackFailure(error, rollbackError, {
        recovery_source: recoverySource,
        native_backup: nativeSnapshot && fs.existsSync(nativeBackup) ? nativeBackup : null,
        source_backup: fs.existsSync(sourceBackup) ? sourceBackup : null,
        legacy_backup: fs.existsSync(legacyBackup) ? legacyBackup : null,
      });
    }
    throw error;
  }
}

module.exports = {
  name: 'grok',
  PLUGIN_NAME,
  MCP_SERVER_NAME,
  buildHooksManifest,
  resolveTarget,
  resolvePluginRoot,
  resolveSourceRoot,
  resolveGrokBinary,
  probeNativeCapabilities,
  install,
  doctor,
  uninstall,
};
