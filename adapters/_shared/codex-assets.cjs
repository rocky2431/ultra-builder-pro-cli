'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./runtime-assets.cjs');

const { parse: parseFrontmatter } = require('./frontmatter.cjs');
const {
  copyTree,
  ensureDir,
  listRelative,
  removeTree,
  writeAtomic,
} = require('./file-ops.cjs');
const { interactionContract } = require('./interaction-contract.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const MANAGED_MARKER = 'Managed by Ultra Builder Pro Codex adapter.';
const CODEX_NATIVE_MCP_REPLACEMENTS = Object.freeze({
  'review.run': {
    surface: 'native_custom_agents',
    replacement: '$ultra-builder-pro:ultra-review with the installed review-* agents',
  },
  'review.verdict': {
    surface: 'native_custom_agents',
    replacement: 'review-coordinator synthesis using the Ultra unified review artifact',
  },
  'impact.radius': {
    surface: 'codex_code_discovery',
    replacement: 'indexed code graph tools when current, otherwise targeted repository reads',
  },
  'impact.changes': {
    surface: 'codex_code_discovery',
    replacement: 'git diff plus indexed code graph tools when current',
  },
  'impact.dependents': {
    surface: 'codex_code_discovery',
    replacement: 'indexed caller/dependency tracing when current, otherwise targeted repository search',
  },
  'skill.resolve': {
    surface: 'plugin_skill_discovery',
    replacement: 'Codex plugin skill discovery with explicit $ultra-builder-pro:<skill> invocation',
  },
  'skill.manifest': {
    surface: 'plugin_skill_discovery',
    replacement: 'the installed plugin skill SKILL.md and agents/openai.yaml contract',
  },
  'ask.question': {
    surface: 'request_user_input',
    replacement: 'use request_user_input when available, otherwise ask one concise direct question',
  },
  'ask.menu': {
    surface: 'request_user_input',
    replacement: 'use request_user_input when available, otherwise present one concise direct choice',
  },
});
const COMMAND_NAMES = Object.freeze(CORE_PUBLIC_SKILLS.filter((name) => name !== 'ultra-review'));
const SKILL_REFERENCE_NAMES = Object.freeze([
  ...COMMAND_NAMES,
  'cc-collab',
  'ultra-review',
  'ultra-verify',
]);
const CODEX_PRIMARY_SKILLS = new Set([...COMMAND_NAMES, 'ultra-review']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.py', '.sh', '.txt', '.yaml', '.yml']);

function titleCase(name) {
  const special = { 'cc-collab': 'Claude Code Collaboration' };
  if (special[name]) return special[name];
  return name.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function replaceSlashCommand(text, command, replacement) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`(^|[\\s\\x60(>])/${escaped}(?=$|[\\s\\x60,.;):])`, 'gm'),
    (_match, prefix) => `${prefix}${replacement}`,
  );
}

function adaptCodexPrimaryText(input, skillName) {
  let text = String(input);
  if (skillName === 'ultra-review') {
    text = text.replace(
      /the current host's native bounded-worker\s+mechanism/g,
      'native Codex custom agents installed for the selected review workers',
    );
  }

  return text;
}

function adaptSkillAsset(input, targetName, _rel) {
  return adaptHostText(input, targetName);
}

function adaptHostText(input, skillName = '') {
  let text = String(input);
  text = text.replaceAll('codex-collab', 'cc-collab');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.claude/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.codex/skills', '~/plugins/ultra-builder-pro/skills');
  text = text.replaceAll('~/.claude/hooks', '~/plugins/ultra-builder-pro/hooks');
  text = text.replaceAll('~/.claude', '~/.codex');

  for (const skill of SKILL_REFERENCE_NAMES) {
    text = replaceSlashCommand(text, skill, `$ultra-builder-pro:${skill}`);
  }
  text = replaceSlashCommand(text, 'clear', 'start a new Codex task');

  if (CODEX_PRIMARY_SKILLS.has(skillName)) {
    text = adaptCodexPrimaryText(text, skillName);
  }

  if (skillName === 'learn') {
    text = text.replaceAll("current host's user skill directory", '`~/.agents/skills`');
    text += `\n\n## Codex packaging requirement\n\nEach learned pattern must be a valid skill directory, not a loose Markdown file. The generated\n\`SKILL.md\` must start with only \`name\` and \`description\` frontmatter. Also create\n\`agents/openai.yaml\` with \`policy.allow_implicit_invocation: false\`. A new Codex task is required\nbefore the learned skill appears in discovery.\n`;
  }

  return text;
}

function adaptedDescription(sourceDescription, targetName) {
  const special = {
    'cc-collab': 'Ask Claude Code for an independent read-only analysis while Codex owns verification and synthesis. Use only when the user explicitly requests CC or Claude Code collaboration.',
    'ultra-verify': 'Run Codex-primary cross-model verification with a read-only Claude Code advisor. Use only when the user explicitly requests independent model verification.',
    'ultra-dev': 'Execute one authoritative Ultra task with Codex-native implementation, verification, and review. Use when a dependency-ready slice is ready for development.',
    'learn': 'Extract one verified reusable workflow from the current Codex task into a portable user skill. Use when the user explicitly asks to preserve the method.',
  };
  return special[targetName] || adaptHostText(String(sourceDescription || `${titleCase(targetName)} workflow for Codex.`), targetName)
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSkillMarkdown(sourceText, sourceName, targetName) {
  const { fm, body } = parseFrontmatter(sourceText);
  const adaptedBody = adaptHostText(body, targetName);
  return yaml.dump({
    name: targetName,
    description: adaptedDescription(fm && fm.description, targetName),
  }, { lineWidth: -1, noRefs: true }).trimEnd()
    .replace(/^/, '---\n') + `\n---\n\n${adaptedBody.trim()}\n`;
}

function shortDescription(description, name) {
  const value = String(description || `${titleCase(name)} for Codex`).replace(/\s+/g, ' ').trim();
  if (value.length <= 64) return value;
  const candidate = value.slice(0, 65);
  const boundary = candidate.lastIndexOf(' ');
  const short = (boundary >= 25 ? candidate.slice(0, boundary) : value.slice(0, 64))
    .replace(/[\s.,;:]+$/, '');
  return short || `${titleCase(name)} for Codex`;
}

function buildOpenAiYaml(name, description) {
  const policy = skillPolicy(name);
  const metadata = {
    interface: {
      display_name: titleCase(name),
      short_description: shortDescription(description, name),
      default_prompt: `Use $ultra-builder-pro:${name} for this task and follow its workflow.`,
    },
    policy: { allow_implicit_invocation: policy.allowImplicitInvocation },
  };
  if (policy.requiresUltraMcp) {
    metadata.dependencies = {
      tools: [{
        type: 'mcp',
        value: PLUGIN_NAME,
        description: 'Ultra Builder Pro authoritative task and change runtime',
      }],
    };
  }
  return yaml.dump(metadata, {
    lineWidth: -1,
    noRefs: true,
    forceQuotes: true,
    quotingType: "'",
  });
}

function isTextFile(rel) {
  return TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

function copySkill(sourceDir, targetDir, sourceName, targetName) {
  if (targetName === 'cc-collab') {
    ensureDir(targetDir);
    const sourceText = fs.readFileSync(path.join(sourceDir, 'SKILL.md'), 'utf8');
    const skillText = buildSkillMarkdown(sourceText, sourceName, targetName);
    writeAtomic(path.join(targetDir, 'SKILL.md'), skillText);
    const description = parseFrontmatter(skillText).fm.description;
    writeAtomic(path.join(targetDir, 'agents', 'openai.yaml'), buildOpenAiYaml(targetName, description));
    return;
  }

  copyTree(sourceDir, targetDir, {
    transform(original, rel) {
      if (rel === path.join('agents', 'openai.yaml')) return original;
      if (rel === 'SKILL.md') {
        return Buffer.from(buildSkillMarkdown(original.toString('utf8'), sourceName, targetName));
      }
      if (!isTextFile(rel)) return original;
      return Buffer.from(adaptSkillAsset(original.toString('utf8'), targetName, rel));
    },
  });
  const skillText = fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8');
  const description = parseFrontmatter(skillText).fm.description;
  writeAtomic(path.join(targetDir, 'agents', 'openai.yaml'), buildOpenAiYaml(targetName, description));
}

function buildCommandMap() {
  return Object.fromEntries(COMMAND_NAMES.map((name) => [`/${name}`, `$ultra-builder-pro:${name}`]));
}

function hookCommand(feature, ...args) {
  return [
    'python3 "$PLUGIN_ROOT/hooks/adapters/codex.py"',
    JSON.stringify(feature),
    ...args.map((arg) => JSON.stringify(arg)),
  ].join(' ');
}

function commandHook(feature, timeout, statusMessage, ...args) {
  return {
    type: 'command',
    command: hookCommand(feature, ...args),
    timeout,
    statusMessage,
  };
}

function buildHooksManifest() {
  return {
    hooks: {
      SessionStart: [
        { hooks: [commandHook('health_check.py', 5, 'Checking Ultra runtime')] },
        { hooks: [commandHook('workflow_context.py', 10, 'Loading active Ultra workflow')] },
      ],
      PreToolUse: [
        { matcher: 'Edit|Write|apply_patch', hooks: [commandHook('active_task_context.py', 3, 'Checking active Ultra task')] },
      ],
      PreCompact: [
        { matcher: 'manual|auto', hooks: [commandHook('workflow_checkpoint.py', 10, 'Saving Ultra workflow checkpoint')] },
      ],
      PostCompact: [
        { hooks: [commandHook('workflow_resume.py', 10, 'Restoring Ultra workflow checkpoint')] },
      ],
      Stop: [
        { hooks: [commandHook('pre_stop_check.py', 5, 'Reporting Ultra workflow position')] },
      ],
      SubagentStart: [
        { hooks: [commandHook('subagent_tracker.py', 5, 'Tracking Ultra subagent', 'start')] },
      ],
      SubagentStop: [
        { hooks: [commandHook('subagent_tracker.py', 5, 'Tracking Ultra subagent', 'stop')] },
      ],
    },
  };
}

function copyHooks(repoRoot, pluginRoot) {
  const sourceRoot = path.join(repoRoot, 'hooks');
  const targetRoot = path.join(pluginRoot, 'hooks');
  ensureDir(targetRoot);
  for (const name of WORKFLOW_HOOK_FILES) {
    fs.copyFileSync(path.join(sourceRoot, name), path.join(targetRoot, name));
  }
  ensureDir(path.join(targetRoot, 'adapters'));
  fs.copyFileSync(
    path.join(sourceRoot, 'adapters', 'codex.py'),
    path.join(targetRoot, 'adapters', 'codex.py'),
  );
  writeAtomic(path.join(targetRoot, 'hooks.json'), JSON.stringify(buildHooksManifest(), null, 2) + '\n');
}

function buildMcpRuntime(repoRoot, pluginRoot, { runtime = 'codex' } = {}) {
  const source = path.join(repoRoot, 'mcp-server', 'server.cjs');
  const cliSource = path.join(repoRoot, 'adapters', '_shared', 'codex-ultra-tools-entry.cjs');
  const runtimeRoot = path.join(pluginRoot, 'runtime');
  const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-mcp-build-'));
  let nccCli;
  try {
    nccCli = require.resolve('@vercel/ncc/dist/ncc/cli.js');
  } catch (error) {
    throw new Error(`Ultra MCP bundling requires @vercel/ncc: ${error.message}`);
  }

  try {
    const bundled = spawnSync(process.execPath, [
      nccCli,
      'build',
      source,
      '-o',
      buildRoot,
      '--no-cache',
      '--quiet',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (bundled.error) throw bundled.error;
    if (bundled.status !== 0) {
      const detail = (bundled.stderr || bundled.stdout || '').trim();
      throw new Error(`ncc failed to bundle the Ultra MCP runtime${detail ? `: ${detail}` : ''}`);
    }
    copyTree(buildRoot, runtimeRoot);
  } finally {
    removeTree(buildRoot);
  }

  const cliBuildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-cli-build-'));
  try {
    const bundled = spawnSync(process.execPath, [
      nccCli,
      'build',
      cliSource,
      '-o',
      cliBuildRoot,
      '--no-cache',
      '--quiet',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (bundled.error) throw bundled.error;
    if (bundled.status !== 0) {
      const detail = (bundled.stderr || bundled.stdout || '').trim();
      throw new Error(`ncc failed to bundle the Ultra fallback CLI${detail ? `: ${detail}` : ''}`);
    }
    for (const rel of listRelative(cliBuildRoot)) {
      const target = rel === 'index.cjs'
        ? path.join(runtimeRoot, 'ultra-tools.cjs')
        : path.join(runtimeRoot, rel);
      ensureDir(path.dirname(target));
      fs.copyFileSync(path.join(cliBuildRoot, rel), target);
    }
  } finally {
    removeTree(cliBuildRoot);
  }

  const runtimeBootstrap = runtime === 'kimi' ? `
const fs = require('node:fs');
const pluginRoot = path.resolve(__dirname, '..');

function usableProjectRoot(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidate = path.resolve(value);
  if (candidate === pluginRoot || candidate.startsWith(pluginRoot + path.sep)) return null;
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : null;
  } catch (_) {
    return null;
  }
}

if (!process.env.UBP_ROOT_DIR) {
  const rootDir = usableProjectRoot(process.cwd()) || usableProjectRoot(process.env.PWD);
  if (!rootDir) {
    throw new Error('Kimi Ultra MCP could not resolve the active project root; start Kimi from the project directory');
  }
  process.env.UBP_ROOT_DIR = rootDir;
}
if (!process.env.UBP_DB_PATH) {
  process.env.UBP_DB_PATH = path.join(process.env.UBP_ROOT_DIR, '.ultra', 'state.db');
}
` : '';

  const launcher = `'use strict';

const path = require('node:path');

process.env.UBP_RUNTIME_ROOT = path.resolve(__dirname, '..');
${runtimeBootstrap}

const { main } = require('./index.cjs');

main().catch((error) => {
  process.stderr.write(\`mcp-server fatal: \${error.message}\\n\`);
  process.exit(1);
});
`;
  writeAtomic(path.join(runtimeRoot, 'launch.cjs'), launcher);
  fs.copyFileSync(
    path.join(repoRoot, 'mcp-server', 'breadcrumb.cjs'),
    path.join(runtimeRoot, 'breadcrumb.cjs'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'mcp-server', 'hook-event.cjs'),
    path.join(runtimeRoot, 'hook-event.cjs'),
  );

  const sourceToolsFile = path.join(repoRoot, 'spec', 'mcp-tools.yaml');
  const upstreamManifest = yaml.load(fs.readFileSync(sourceToolsFile, 'utf8'));
  const { REGISTERED_TOOLS } = require(path.join(repoRoot, 'mcp-server', 'server.cjs'));
  const registered = new Set(REGISTERED_TOOLS);
  const liveFamilies = new Set(
    upstreamManifest.tools.filter((tool) => registered.has(tool.name)).map((tool) => tool.family),
  );
  const liveManifest = {
    ...upstreamManifest,
    info: {
      ...upstreamManifest.info,
      notes: `${upstreamManifest.info.notes.trim()}\n\n${runtime} bundled runtime: only tools registered by the MCP server are listed here.`,
    },
    families: upstreamManifest.families.filter((family) => liveFamilies.has(family.name)),
    tools: upstreamManifest.tools.filter((tool) => registered.has(tool.name)),
  };
  const specRoot = path.join(pluginRoot, 'spec');
  ensureDir(specRoot);
  writeAtomic(path.join(specRoot, 'mcp-tools.yaml'), yaml.dump(liveManifest, { lineWidth: -1, noRefs: true }));
  writeAtomic(
    path.join(specRoot, 'interaction-contract.json'),
    JSON.stringify(interactionContract(runtime), null, 2) + '\n',
  );
  if (runtime === 'codex') {
    fs.copyFileSync(sourceToolsFile, path.join(specRoot, 'upstream-mcp-tools.yaml'));
    writeAtomic(path.join(specRoot, 'codex-capability-map.json'), JSON.stringify({
      runtime: 'codex',
      live_mcp_tools: REGISTERED_TOOLS,
      codex_native_replacements: CODEX_NATIVE_MCP_REPLACEMENTS,
    }, null, 2) + '\n');
  }
  const sourceSchema = path.join(repoRoot, 'spec', 'schemas', 'state-db.sql');
  const targetSchema = path.join(specRoot, 'schemas', 'state-db.sql');
  ensureDir(path.dirname(targetSchema));
  fs.copyFileSync(sourceSchema, targetSchema);

  const preferredTemplate = path.join(repoRoot, 'templates', '.ultra');
  const packagedTemplate = path.join(repoRoot, '.ultra-template');
  const templateRoot = fs.existsSync(preferredTemplate) ? preferredTemplate : packagedTemplate;
  if (!fs.existsSync(templateRoot)) {
    throw new Error(`Ultra project template missing from ${repoRoot}`);
  }
  copyTree(templateRoot, path.join(pluginRoot, 'templates', '.ultra'));

  return {
    launcher: path.join(runtimeRoot, 'launch.cjs'),
    bundle: path.join(runtimeRoot, 'index.cjs'),
    ultraTools: path.join(runtimeRoot, 'ultra-tools.cjs'),
  };
}

function pluginContentHash(pluginRoot, baseVersion) {
  const hash = crypto.createHash('sha256');
  hash.update(baseVersion);
  for (const rel of listRelative(pluginRoot)) {
    if (rel === path.join('.codex-plugin', 'plugin.json') || rel === '.ubp-managed') continue;
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(pluginRoot, rel)));
  }
  return hash.digest('hex').slice(0, 12);
}

function buildPlugin({ repoRoot, pluginRoot }) {
  if (fs.existsSync(pluginRoot)) {
    const marker = path.join(pluginRoot, '.ubp-managed');
    if (!fs.existsSync(marker)) {
      throw new Error(`refusing to replace unmanaged plugin directory: ${pluginRoot}`);
    }
    removeTree(pluginRoot);
  }
  ensureDir(pluginRoot);

  const installedSkills = [];
  for (const name of skillsForRuntime('codex')) {
    const sourceDir = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
      throw new Error(`missing allowlisted Codex skill: ${name}`);
    }
    copySkill(sourceDir, path.join(pluginRoot, 'skills', name), name, name);
    installedSkills.push(name);
  }

  copyHooks(repoRoot, pluginRoot);
  const mcpRuntime = buildMcpRuntime(repoRoot, pluginRoot);
  writeAtomic(path.join(pluginRoot, '.mcp.json'), JSON.stringify({
    mcpServers: {
      [PLUGIN_NAME]: {
        type: 'stdio',
        command: process.execPath,
        args: [mcpRuntime.launcher],
      },
    },
  }, null, 2) + '\n');
  writeAtomic(path.join(pluginRoot, 'command-map.json'), JSON.stringify(buildCommandMap(), null, 2) + '\n');
  if (fs.existsSync(path.join(repoRoot, 'LICENSE'))) {
    fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(pluginRoot, 'LICENSE'));
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = `${pkg.version}+codex.${pluginContentHash(pluginRoot, pkg.version)}`;
  const manifest = {
    name: PLUGIN_NAME,
    version,
    description: 'Codex-native Ultra Builder Pro workflows, agents, hooks, and MCP task state.',
    author: { name: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors' },
    homepage: pkg.homepage,
    repository: 'https://github.com/rocky2431/ultra-builder-pro-cli',
    license: pkg.license || 'MIT',
    keywords: ['codex', 'skills', 'agents', 'hooks', 'mcp', 'ultra-builder-pro'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Ultra Builder Pro',
      shortDescription: 'Codex-native engineering workflows and verification gates.',
      longDescription: 'Complete Codex adaptation of Ultra Builder Pro skills, command workflows, custom agents, lifecycle hooks, and project-local MCP state.',
      developerName: typeof pkg.author === 'string' ? pkg.author : 'Ultra Builder Pro contributors',
      category: 'Developer Tools',
      capabilities: ['Interactive', 'Write'],
      websiteURL: pkg.homepage,
      defaultPrompt: [
        'Initialize this project with the Ultra Builder Pro workflow.',
        'Run the Ultra review pipeline on my current changes.',
        'Show the current Ultra project status, valid transitions, and host recommendation.',
      ],
      brandColor: '#111827',
    },
  };
  writeAtomic(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeAtomic(path.join(pluginRoot, '.ubp-managed'), JSON.stringify({ source: 'ubp', adapter: 'codex', version }, null, 2) + '\n');
  return { root: pluginRoot, version, skills: installedSkills.sort() };
}

function tomlMultiline(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '');
  return `"""\\\n${escaped.trim()}\n"""`;
}

function buildAgentToml(sourceText) {
  const { fm, body } = parseFrontmatter(sourceText);
  const name = fm.name;
  const description = adaptHostText(String(fm.description || `${name} Ultra Builder Pro agent.`), name)
    .replace(/\s+/g, ' ')
    .trim();
  let instructions = adaptHostText(body, name);
  instructions = instructions.replace(
    /Consult your agent memory[^\n]*/g,
    'Use the current checkout and parent-supplied context; do not assume persistent custom-agent memory.',
  );
  instructions = `You are a native Codex custom agent. Stay inside the delegated scope, preserve unrelated changes, and return concise evidence to the parent task.\n\n${instructions}`;
  return [
    `# ${MANAGED_MARKER}`,
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    'model_reasoning_effort = "high"',
    `developer_instructions = ${tomlMultiline(instructions)}`,
    '',
  ].join('\n');
}

function installAgents({ repoRoot, configDir }) {
  const sourceRoot = path.join(repoRoot, 'agents');
  const targetRoot = path.join(configDir, 'agents');
  ensureDir(targetRoot);
  const installed = [];
  for (const file of fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.md')).sort()) {
    const targetFile = path.join(targetRoot, file.replace(/\.md$/, '.toml'));
    if (fs.existsSync(targetFile)) {
      const existing = fs.readFileSync(targetFile, 'utf8');
      if (!existing.startsWith(`# ${MANAGED_MARKER}`)) {
        throw new Error(`refusing to overwrite unmanaged Codex agent: ${targetFile}`);
      }
    }
    writeAtomic(targetFile, buildAgentToml(fs.readFileSync(path.join(sourceRoot, file), 'utf8')));
    installed.push(path.basename(targetFile));
  }
  return { root: targetRoot, installed };
}

module.exports = {
  PLUGIN_NAME,
  MANAGED_MARKER,
  COMMAND_NAMES,
  adaptHostText,
  buildCommandMap,
  buildHooksManifest,
  buildMcpRuntime,
  buildPlugin,
  buildAgentToml,
  installAgents,
};
