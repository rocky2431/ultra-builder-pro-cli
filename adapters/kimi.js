'use strict';

/** Build and register a Kimi Code 0.26+ native Ultra Builder Pro plugin. */

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
const { parse: parseFm, serialize: serializeFm } = require('./_shared/frontmatter.cjs');
const provenance = require('./_shared/provenance.cjs');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_ID = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_ID;
const PROVENANCE_FILE = 'provenance.json';
const REGISTRY_RELATIVE = path.join('plugins', 'installed.json');
const MANAGED_RELATIVE = path.join('plugins', 'managed', PLUGIN_ID);

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    return path.resolve(process.env.KIMI_CODE_HOME || path.join(ctx.homeDir || os.homedir(), '.kimi-code'));
  }
  return path.join(ctx.cwd || process.cwd(), '.kimi-code');
}

function resolvePluginRoot(ctx = {}) {
  return path.join(resolveTarget(ctx), MANAGED_RELATIVE);
}

function resolveRegistryFile(ctx = {}) {
  return path.join(resolveTarget(ctx), REGISTRY_RELATIVE);
}

function resolveRepoRoot(ctx = {}) {
  return path.resolve(ctx.repoRoot || path.join(__dirname, '..'));
}

function loadRegistry(file) {
  if (!fs.existsSync(file)) return { version: 1, plugins: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse ${file}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || parsed.version !== 1 || !Array.isArray(parsed.plugins)) {
    throw new Error(`${file} is not a valid Kimi installed.json document`);
  }
  return parsed;
}

function kimiTextTransform(input, assetName = '') {
  let text = String(input);
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT', '$KIMI_PLUGIN_ROOT');
  text = text.replaceAll('~/.claude/skills', '~/.kimi-code/skills');
  text = text.replaceAll('~/.claude/hooks', '~/.kimi-code/hooks');
  text = text.replaceAll('~/.claude', '~/.kimi-code');
  text = text.replaceAll('~/.codex', '~/.kimi-code');
  text = text.replaceAll('~/.config/opencode', '~/.kimi-code');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replace(/@skills\/([a-z0-9-]+)\/SKILL\.md/g, '$KIMI_PLUGIN_ROOT/skills/$1/SKILL.md');

  if (assetName === 'codex-collab') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
    text = text.replaceAll('Claude Code remains primary', 'Kimi Code remains primary');
    text = text.replaceAll('one Claude Code-owned conclusion', 'one Kimi Code-owned conclusion');
  }
  if (assetName === 'ultra-verify') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
    text = text.replaceAll('Claude Code', 'Kimi Code');
    text = text.replaceAll('Claude', 'Kimi');
    text = text.replaceAll('claude-analysis.md', 'kimi-analysis.md');
  }
  if (assetName === 'cc-collab') {
    text = text.replaceAll('the current host', 'Kimi Code');
    text = text.replaceAll('current host', 'Kimi Code');
  }
  if (assetName === 'ultra-review') {
    text = text.replace(
      /the current host's native bounded-worker\s+mechanism/g,
      'Kimi `AgentSwarm` for parallel reviewers or one foreground Kimi `Agent` for a single reviewer, using the worker prompt files under `$KIMI_PLUGIN_ROOT/agents/`',
    );
  }
  if (assetName === 'learn') {
    text = text.replaceAll("current host's user skill directory", '`~/.kimi-code/skills`');
  }
  text = text.replace(
    /(^|[\s`("'])\/ultra-(?!builder-pro:)([a-z][a-z0-9-]*)/gm,
    '$1/ultra-builder-pro:ultra-$2',
  );
  text = text.replace(
    /(^|[\s`("'])\/learn(?=$|[\s`),.;:])/gm,
    '$1/ultra-builder-pro:learn',
  );
  text = text.replace(
    /(^|[\s`("'])\/clear(?=$|[\s`),.;:])/gm,
    '$1/new',
  );
  return text;
}

function transformSkill(buf, relPath, skillName) {
  const source = buf.toString('utf8');
  if (relPath.endsWith('.json')) {
    const transformed = kimiTextTransform(source, skillName);
    JSON.parse(transformed);
    return Buffer.from(transformed, 'utf8');
  }
  if (!relPath.endsWith('.md')) return buf;
  const { fm, body } = parseFm(source);
  if (!fm) return Buffer.from(kimiTextTransform(source, skillName), 'utf8');
  const policy = skillPolicy(skillName);
  const nativeFm = {
    name: String(fm.name || skillName),
    description: kimiTextTransform(fm.description || `${skillName} workflow`, skillName)
      .replace(/\s+/g, ' ')
      .trim(),
    ...(policy.userInvocable ? { disableModelInvocation: true } : {}),
  };
  return Buffer.from(serializeFm(nativeFm, kimiTextTransform(body, skillName)), 'utf8');
}

function transformAgent(buf, relPath) {
  if (!relPath.endsWith('.md')) return buf;
  const source = buf.toString('utf8');
  const { fm, body } = parseFm(source);
  const name = path.basename(relPath, '.md');
  if (!fm) return Buffer.from(kimiTextTransform(source, name), 'utf8');
  return Buffer.from(serializeFm({
    name: String(fm.name || name),
    description: kimiTextTransform(fm.description || `${name} worker`, name)
      .replace(/\s+/g, ' ')
      .trim(),
  }, kimiTextTransform(body, name)), 'utf8');
}

function copySkills(repoRoot, pluginRoot) {
  const installed = [];
  for (const name of skillsForRuntime('kimi')) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted Kimi skill: ${name}`);
    }
    copyTree(source, path.join(pluginRoot, 'skills', name), {
      transform: (buf, relPath) => transformSkill(buf, relPath, name),
    });
    installed.push(name);
  }
  return installed;
}

function commandDescription(repoRoot, name) {
  const source = path.join(repoRoot, 'commands', `${name}.md`);
  if (fs.existsSync(source)) {
    const { fm } = parseFm(fs.readFileSync(source, 'utf8'));
    if (fm && typeof fm.description === 'string' && fm.description.trim()) {
      return kimiTextTransform(fm.description, name).replace(/\s+/g, ' ').trim();
    }
  }
  return `Run the ${name} Ultra Builder Pro workflow.`;
}

function copyCommands(repoRoot, pluginRoot) {
  const root = path.join(pluginRoot, 'commands');
  ensureDir(root);
  for (const name of CORE_PUBLIC_SKILLS) {
    writeAtomic(path.join(root, `${name}.md`), `---
description: ${JSON.stringify(commandDescription(repoRoot, name))}
---

Use the registered \`${name}\` skill now and follow its complete workflow. Treat the current Kimi
Code session as the primary host; use native Kimi tools and the bundled Ultra MCP. Do not mutate
generated Ultra projections directly.

Arguments: $ARGUMENTS
`);
  }
  return CORE_PUBLIC_SKILLS.map((name) => `${name}.md`);
}

function copyAgents(repoRoot, pluginRoot) {
  return copyTree(path.join(repoRoot, 'agents'), path.join(pluginRoot, 'agents'), {
    transform: transformAgent,
  });
}

function hookCommand(feature, ...args) {
  return [
    'python3 ./hooks/adapters/kimi.py',
    JSON.stringify(feature),
    ...args.map((arg) => JSON.stringify(arg)),
  ].join(' ');
}

function buildHooksManifest() {
  return [
    { event: 'SessionStart', command: hookCommand('health_check.py'), timeout: 5 },
    { event: 'SessionStart', command: hookCommand('workflow_context.py'), timeout: 10 },
    { event: 'PreToolUse', matcher: 'Edit|Write', command: hookCommand('active_task_context.py'), timeout: 5 },
    { event: 'PreCompact', command: hookCommand('workflow_checkpoint.py'), timeout: 10 },
    { event: 'PostCompact', command: hookCommand('workflow_resume.py'), timeout: 10 },
    { event: 'Stop', command: hookCommand('pre_stop_check.py'), timeout: 5 },
    { event: 'SubagentStart', command: hookCommand('subagent_tracker.py', 'start'), timeout: 5 },
    { event: 'SubagentStop', command: hookCommand('subagent_tracker.py', 'stop'), timeout: 5 },
  ];
}

function copyHooks(repoRoot, pluginRoot) {
  const root = path.join(pluginRoot, 'hooks');
  ensureDir(root);
  for (const name of WORKFLOW_HOOK_FILES) {
    const source = path.join(repoRoot, 'hooks', name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted Kimi hook: ${name}`);
    fs.copyFileSync(source, path.join(root, name));
  }
  ensureDir(path.join(root, 'adapters'));
  fs.copyFileSync(
    path.join(repoRoot, 'hooks', 'adapters', 'kimi.py'),
    path.join(root, 'adapters', 'kimi.py'),
  );
  return [...WORKFLOW_HOOK_FILES, path.join('adapters', 'kimi.py')];
}

function mcpManifest() {
  if (process.platform === 'win32') {
    return { transport: 'stdio', command: 'node.exe', args: ['./runtime/launch.cjs'], enabled: true };
  }
  // Kimi's built-in `node` fallback uses the host binary's ABI. Ultra bundles
  // better-sqlite3 for the Node that runs `ubp`, so use PATH Node explicitly.
  return { transport: 'stdio', command: 'env', args: ['node', './runtime/launch.cjs'], enabled: true };
}

function writeManifest(repoRoot, pluginRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const manifest = {
    name: PLUGIN_ID,
    version: pkg.version,
    description: 'Kimi-native Ultra Builder Pro workflows, lifecycle hooks, review workers, and project-local MCP state.',
    keywords: ['kimi-code', 'skills', 'hooks', 'mcp', 'ultra-builder-pro'],
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    homepage: pkg.homepage,
    license: pkg.license || 'MIT',
    skills: ['./skills'],
    mcpServers: { [MCP_SERVER_NAME]: mcpManifest() },
    hooks: buildHooksManifest(),
    commands: ['./commands'],
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'Kimi-native engineering workflows and verification gates.',
      longDescription: 'Ultra workflows, continuous-change state, review worker templates, lifecycle recovery hooks, and a project-local MCP server adapted to Kimi Code.',
      developerName: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors',
      websiteURL: pkg.homepage,
    },
    skillInstructions: 'Kimi Code remains primary. Use Ultra MCP for durable state, TodoList for session coordination, and Agent or AgentSwarm with bundled prompt templates for bounded workers.',
  };
  writeAtomic(path.join(pluginRoot, 'kimi.plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function buildStaging(repoRoot, staging) {
  const copied = {
    commands: copyCommands(repoRoot, staging),
    skills: copySkills(repoRoot, staging),
    agents: copyAgents(repoRoot, staging),
    hooks: copyHooks(repoRoot, staging),
  };
  buildMcpRuntime(repoRoot, staging, { runtime: 'kimi' });
  writeManifest(repoRoot, staging);
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(staging, 'LICENSE'));
  }
  markManaged(staging, { adapter: 'kimi', plugin: PLUGIN_ID });
  return copied;
}

function upsertRegistry(registry, target, repoRoot) {
  const existing = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
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
    ...(existing?.capabilities ? { capabilities: existing.capabilities } : {}),
  };
  return {
    version: 1,
    plugins: [...registry.plugins.filter((entry) => !entry || entry.id !== PLUGIN_ID), record],
  };
}

function writePluginProvenance(repoRoot, target) {
  const source = provenance.packageSource(repoRoot);
  const file = path.join(target, PROVENANCE_FILE);
  const manifest = provenance.writeProvenance({
    file,
    adapter: 'kimi',
    ...source,
    roots: { plugin: target },
    assets: provenance.assetRefsForTree('plugin', target, {
      exclude: ['.ubp-managed', PROVENANCE_FILE],
    }),
    contracts: {
      plugin_manifest: { root: 'plugin', path: 'kimi.plugin.json' },
      mcp_launcher: { root: 'plugin', path: path.join('runtime', 'launch.cjs') },
      hook_event_helper: { root: 'plugin', path: path.join('runtime', 'hook-event.cjs') },
      hook_adapter: { root: 'plugin', path: path.join('hooks', 'adapters', 'kimi.py') },
    },
  });
  return { file, manifest };
}

function install(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const registry = loadRegistry(registryFile);
  const existingRecord = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
  if (existingRecord && path.resolve(existingRecord.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to replace conflicting Kimi registration: ${existingRecord.root}`);
  }
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to replace unmanaged Kimi plugin: ${target}`);
  }

  const managedDir = path.dirname(target);
  ensureDir(managedDir);
  const staging = fs.mkdtempSync(path.join(managedDir, `${PLUGIN_ID}-`));
  const backup = `${staging}-previous`;
  let movedPrevious = false;
  let published = false;
  try {
    const copied = buildStaging(repoRoot, staging);
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedPrevious = true;
    }
    fs.renameSync(staging, target);
    published = true;
    const provenanceReport = writePluginProvenance(repoRoot, target);
    writeAtomic(registryFile, `${JSON.stringify(upsertRegistry(registry, target, repoRoot), null, 2)}\n`);
    if (movedPrevious) removeTree(backup);
    return {
      target,
      registry: registryFile,
      copied,
      provenance: provenanceReport,
      reload_required: true,
    };
  } catch (error) {
    if (published && fs.existsSync(target)) removeTree(target);
    else if (fs.existsSync(staging)) removeTree(staging);
    if (movedPrevious && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

function addIssue(report, code, details = {}) {
  report.issues.push({ code, ...details });
}

function doctor(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const source = provenance.packageSource(repoRoot);
  const report = provenance.inspectProvenance({
    file: path.join(target, PROVENANCE_FILE),
    expectedAdapter: 'kimi',
    expectedPackageVersion: source.packageInfo.version,
  });

  let registrationOk = false;
  try {
    const registry = loadRegistry(registryFile);
    const record = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
    registrationOk = !!record
      && path.resolve(record.root || '') === path.resolve(target)
      && record.source === 'local-path'
      && record.enabled === true;
  } catch (error) {
    addIssue(report, 'PLUGIN_REGISTRATION_INVALID', { path: registryFile, message: error.message });
  }
  if (!registrationOk && !report.issues.some((issue) => issue.code === 'PLUGIN_REGISTRATION_INVALID')) {
    addIssue(report, 'PLUGIN_REGISTRATION_INVALID', { path: registryFile, expected_root: target });
  }

  let manifestOk = false;
  let mcpOk = false;
  let hooksOk = false;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'kimi.plugin.json'), 'utf8'));
    manifestOk = manifest.name === PLUGIN_ID
      && Array.isArray(manifest.skills)
      && manifest.skills.includes('./skills')
      && Array.isArray(manifest.commands)
      && manifest.commands.includes('./commands')
      && manifest.sessionStart === undefined;
    const mcp = manifest.mcpServers?.[MCP_SERVER_NAME];
    const expected = mcpManifest();
    mcpOk = !!mcp
      && mcp.transport === expected.transport
      && mcp.command === expected.command
      && JSON.stringify(mcp.args) === JSON.stringify(expected.args)
      && mcp.enabled === true;
    hooksOk = Array.isArray(manifest.hooks)
      && buildHooksManifest().every((expectedHook) => manifest.hooks.some((hook) => (
        hook.event === expectedHook.event
        && hook.command === expectedHook.command
        && hook.matcher === expectedHook.matcher
      )));
  } catch (error) {
    addIssue(report, 'PLUGIN_MANIFEST_INVALID', {
      path: path.join(target, 'kimi.plugin.json'), message: error.message,
    });
  }
  if (!manifestOk && !report.issues.some((issue) => issue.code === 'PLUGIN_MANIFEST_INVALID')) {
    addIssue(report, 'PLUGIN_MANIFEST_INVALID', { path: path.join(target, 'kimi.plugin.json') });
  }
  if (!mcpOk) addIssue(report, 'MCP_REGISTRATION_INVALID', { path: path.join(target, 'kimi.plugin.json') });
  if (!hooksOk) addIssue(report, 'HOOK_REGISTRATION_INVALID', { path: path.join(target, 'kimi.plugin.json') });

  report.checks.registration = { status: registrationOk ? 'pass' : 'fail' };
  report.checks.plugin_manifest = { status: manifestOk ? 'pass' : 'fail' };
  report.checks.mcp_registration = { status: mcpOk ? 'pass' : 'fail' };
  report.checks.hook_registration = { status: hooksOk ? 'pass' : 'fail' };
  if (report.status !== 'missing') report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function uninstall(ctx = {}) {
  const target = resolvePluginRoot(ctx);
  const registryFile = resolveRegistryFile(ctx);
  const registry = loadRegistry(registryFile);
  const record = registry.plugins.find((entry) => entry && entry.id === PLUGIN_ID);
  if (record && path.resolve(record.root || '') !== path.resolve(target)) {
    throw new Error(`refusing to remove conflicting Kimi registration: ${record.root}`);
  }
  if (fs.existsSync(target) && !isManaged(target)) {
    throw new Error(`refusing to remove unmanaged Kimi plugin: ${target}`);
  }

  const report = { target, registry: registryFile, removed: {} };
  if (fs.existsSync(target)) {
    removeTree(target);
    report.removed.plugin = true;
  }
  if (record) {
    writeAtomic(registryFile, `${JSON.stringify({
      version: 1,
      plugins: registry.plugins.filter((entry) => !entry || entry.id !== PLUGIN_ID),
    }, null, 2)}\n`);
    report.removed.registration = true;
  }
  return report;
}

module.exports = {
  name: 'kimi',
  PLUGIN_ID,
  MCP_SERVER_NAME,
  buildHooksManifest,
  kimiTextTransform,
  resolveTarget,
  resolvePluginRoot,
  resolveRegistryFile,
  install,
  doctor,
  uninstall,
};
