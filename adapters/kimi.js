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
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');

const PLUGIN_ID = 'ultra-builder-pro';
const MCP_SERVER_NAME = PLUGIN_ID;
const PROVENANCE_FILE = 'provenance.json';
const REGISTRY_RELATIVE = path.join('plugins', 'installed.json');
const MANAGED_RELATIVE = path.join('plugins', 'managed', PLUGIN_ID);
const BOOTSTRAP_SKILL = 'using-ultra-builder-pro';

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

  text = text.replaceAll('`TaskCreate/TaskUpdate (session-local)`', 'Kimi `TodoList` (session-local)');
  text = text.replaceAll('TaskCreate/TaskUpdate (session-local)', 'Kimi `TodoList` (session-local)');
  text = text.replaceAll('`TaskCreate/TaskUpdate`', 'Kimi `TodoList`');
  text = text.replaceAll('TaskCreate/TaskUpdate', 'Kimi `TodoList`');
  text = text.replaceAll('`TaskCreate`', 'Kimi `TodoList`');
  text = text.replaceAll('`TaskUpdate`', 'Kimi `TodoList`');
  text = text.replaceAll('`TaskList`', 'the current Kimi `TodoList`');
  text = text.replaceAll('TaskCreate', 'Kimi TodoList item creation');
  text = text.replaceAll('TaskUpdate', 'Kimi TodoList updates');
  text = text.replaceAll('TaskList', 'the current Kimi TodoList');
  text = text.replaceAll('TaskOutput', 'subagent transcript output');
  text = text.replaceAll('Claude Task tool', 'Kimi `AgentSwarm`');
  text = text.replaceAll('Task tool', 'Kimi `AgentSwarm`');
  text = text.replaceAll('multiple Task calls', 'one Kimi `AgentSwarm` call with multiple independent tasks');
  text = text.replaceAll('Task calls', 'Kimi `AgentSwarm` items');
  text = text.replaceAll('Task call', 'Kimi `AgentSwarm` item');
  text = text.replaceAll('`run_in_background: true`', 'Kimi `AgentSwarm` parallel execution');
  text = text.replaceAll('run_in_background: true', 'Kimi `AgentSwarm` parallel execution');
  text = text.replaceAll('AskUserQuestion', 'a direct question to the user');
  text = text.replaceAll('Bash tool', 'Kimi `Bash` tool');
  text = text.replaceAll('Use Bash', 'Use Kimi `Bash`');
  text = text.replaceAll('Read tool', 'Kimi `Read` tool');
  text = text.replaceAll('Write tool', 'Kimi `Write` tool');
  text = text.replaceAll('MCP `review.run`', 'Kimi `AgentSwarm` review workers');
  text = text.replaceAll('`review.run`', 'Kimi `AgentSwarm` review workers');
  text = text.replaceAll('review.run', 'Kimi `AgentSwarm` review workers');
  text = text.replaceAll('MCP `ask.question`', 'a direct question to the user');
  text = text.replaceAll('`ask.question`', 'a direct question to the user');
  text = text.replaceAll('ask.question', 'a direct question to the user');
  text = text.replaceAll('Claude runtime', 'Kimi runtime');
  text = text.replaceAll('Claude-only', 'Kimi-only');
  text = text.replaceAll('Claude Code、OpenCode、Codex 三个 runtime', 'Claude Code、OpenCode、Codex、Kimi Code 四个 runtime');
  text = text.replaceAll('Claude Code, OpenCode, and Codex', 'Claude Code, OpenCode, Codex, and Kimi Code');

  if (assetName === 'codex-collab') {
    text = text.replaceAll('Claude Code remains primary', 'Kimi Code remains primary');
    text = text.replaceAll('one Claude Code-owned conclusion', 'one Kimi Code-owned conclusion');
  }
  if (assetName === 'ultra-verify') {
    text = text.replaceAll('Claude Code remains primary', 'Kimi Code remains primary');
    text = text.replaceAll("Claude Code's evidence-backed analysis", "Kimi Code's evidence-backed analysis");
    text = text.replaceAll('Claude writes its analysis first', 'Kimi writes its analysis first');
    text = text.replaceAll('Claude writes its own analysis', 'Kimi writes its own analysis');
    text = text.replaceAll('claude-analysis.md', 'kimi-analysis.md');
    text = text.replaceAll('one Claude Code-owned conclusion', 'one Kimi Code-owned conclusion');
  }
  if (assetName === 'learn') {
    text = text.replaceAll(
      '~/.kimi-code/skills/learned/<name>_unverified.md',
      '~/.kimi-code/skills/learned-<name>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/.kimi-code/skills/learned/<pattern-slug>_unverified.md',
      '~/.kimi-code/skills/learned-<pattern-slug>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/.kimi-code/skills/learned/<slug>_unverified.md',
      '~/.kimi-code/skills/learned-<slug>-unverified/SKILL.md',
    );
    text = text.replaceAll('append the `_unverified` suffix to the filename', 'append `-unverified` to the skill directory name');
    text = text.replaceAll('Never overwrite an existing unverified file', 'Never overwrite an existing learned skill directory');
    text = text.replaceAll('remove the `_unverified` suffix', 'rename the directory to remove `-unverified` and update its frontmatter name');
    text = text.replaceAll('(`pattern-slug-2_unverified.md`)', '(`learned-pattern-slug-2-unverified/`)');
  }
  if (assetName === 'ultra-init') {
    text = text.replaceAll('调用方（Claude / CLI / SDK）', '调用方（Kimi / CLI / SDK）');
    text = text.replace(
      /- 如果调用方是 Claude，可在此用 Kimi `TodoList` 跟踪 Step 0–4 的 session 内进度\n  （这是 runtime 的 session-local 跟踪，不走 MCP）/,
      '- 在 Kimi 中，用原生 `TodoList` 跟踪 Step 0–4 的 session 内进度；这是 session-local 协调，不走 MCP',
    );
    text = text.replace(
      /## 调用方式（按 runtime）[\s\S]*?## 输出锚点/,
      [
        '## Kimi 调用方式',
        '',
        '| Runtime | 调用形态 |',
        '|---------|----------|',
        '| Kimi | `/ultra-builder-pro:ultra-init [name] [type] [stack] [git]` — 原生命令拉起此 skill |',
        '',
        '## 输出锚点',
      ].join('\n'),
    );
  }
  if (assetName === 'ultra-review') {
    text = text.replace(
      '# /ultra-review - Ultra Review System',
      `# /ultra-review - Ultra Review System

## Kimi native worker contract

Use one Kimi \`AgentSwarm\` call when two or more independent reviewers are selected; use one
foreground Kimi \`Agent\` call when only one reviewer is selected. Each reviewer first reads its
matching prompt template (for example \`$KIMI_PLUGIN_ROOT/agents/review-code.md\`) and writes only
its JSON artifact under \`SESSION_PATH\`. Run the coordinator as a final foreground Kimi \`Agent\`
after the reviewer artifacts are complete. Kimi has no custom-agent plugin manifest field; these
bundled files are bounded prompt templates, not separately registered host agents.`,
    );
    const executionContract = [
      '### Phase 3: Kimi Reviewer Execution (File-Based)',
      '',
      'When two or more reviewers are selected, call Kimi `AgentSwarm` exactly once and make it the',
      'only tool call in that response. Use `subagent_type: "coder"`, a `prompt_template` containing',
      '`{{item}}`, and the selected reviewer names as the `items` array. The filled prompt must tell',
      'each reviewer to:',
      '',
      '1. Read `$KIMI_PLUGIN_ROOT/agents/{{item}}.md` and follow that bounded worker contract.',
      '2. Review only `DIFF_FILES` / `DIFF_RANGE` and write',
      '   `{SESSION_PATH}/{{item}}.json` using the schema at',
      '   `$KIMI_PLUGIN_ROOT/skills/ultra-review/references/unified-schema.md`.',
      '3. Report at most 12 findings with confidence >= 75, ordered by severity then confidence.',
      '4. Return only `Wrote N findings (P0:X P1:X P2:X P3:X) to <filepath>` after the file exists.',
      '',
      'Kimi `AgentSwarm` is foreground and accepts at least two items; it has no',
      '`run_in_background` field. When exactly one reviewer is selected, launch one foreground Kimi',
      '`Agent` with `subagent_type: "coder"`, `run_in_background: false`, and the same file contract.',
      'The short final lines may appear in the parent context; the JSON files remain the only findings',
      'input to the coordinator.',
      '',
      '### Phase 4: Validate & Coordinate',
      '',
      '**Step 4a: validate reviewer artifacts** — after the foreground call returns, run:',
      '',
      '```bash',
      'python3 "$KIMI_PLUGIN_ROOT/skills/ultra-review/scripts/review_wait.py" {SESSION_PATH} agents {AGENT_COUNT}',
      '```',
      '',
      'Use only the valid `review-*.json` files reported by the waiter. A partial result is explicit;',
      'zero valid reviewer files skips coordination and reports the failure.',
      '',
      '**Step 4b: coordinate** — Launch the coordinator with one foreground Kimi `Agent` call using',
      '`subagent_type: "coder"` and `run_in_background: false`. Its prompt must first read',
      '`$KIMI_PLUGIN_ROOT/agents/review-coordinator.md`, then read the valid reviewer JSON files,',
      'deduplicate findings, and write `SUMMARY.md` plus `SUMMARY.json` under `SESSION_PATH`.',
      '',
      '**Step 4c: validate the summary** — after the coordinator returns, run:',
      '',
      '```bash',
      'python3 "$KIMI_PLUGIN_ROOT/skills/ultra-review/scripts/review_wait.py" {SESSION_PATH} summary',
      '```',
      '',
      'Read `SUMMARY.json` only after this validation succeeds.',
    ].join('\n');
    text = text.replace(
      /### Phase 3:[\s\S]*?### Phase 5: Report to User/,
      `${executionContract}\n\n### Phase 5: Report to User`,
    );
    text = text.replaceAll('Background Execution', 'Reviewer Execution');
    text = text.replaceAll('Wait & Coordinate', 'Validate & Coordinate');
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
  const nativeFm = {
    name: String(fm.name || skillName),
    description: kimiTextTransform(fm.description || `${skillName} workflow`, skillName)
      .replace(/\s+/g, ' ')
      .trim(),
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
  const bootstrapRoot = path.join(pluginRoot, 'skills', BOOTSTRAP_SKILL);
  ensureDir(bootstrapRoot);
  writeAtomic(path.join(bootstrapRoot, 'SKILL.md'), `---
name: ${BOOTSTRAP_SKILL}
description: Bootstrap the Kimi-native Ultra Builder Pro runtime contract at session start.
---

# Ultra Builder Pro for Kimi Code

Kimi Code is the primary host and owns all edits, evidence, and final verification. Use the
namespaced \`/ultra-builder-pro:ultra-*\` commands or invoke the registered Ultra skills directly.

- \`.ultra/state.db\` is the only durable Ultra authority. JSON and Markdown under \`.ultra/\` are
  projections or workflow artifacts and must never replace MCP state writes.
- Memory and code graph data belong to separately installed external providers. Ultra stores only
  provider metadata references and never captures prompts, transcripts, or cross-session memory.
- Use Kimi \`TodoList\` for session coordination and Kimi \`Agent\` / \`AgentSwarm\` for bounded
  workers. Bundled files under \`$KIMI_PLUGIN_ROOT/agents/\` are worker prompt templates.
- Before compaction, Ultra saves its workflow checkpoint. After compaction or recovery, inspect
  \`.ultra/runtime/checkpoint.json\` and call the Ultra status/doctor MCP tools before continuing.
- If no Ultra workflow is active, the lifecycle hooks remain advisory except projection protection.
`);
  installed.push(BOOTSTRAP_SKILL);
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
    sessionStart: { skill: BOOTSTRAP_SKILL },
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
      hook_adapter: { root: 'plugin', path: path.join('hooks', 'adapters', 'kimi.py') },
      session_bootstrap: {
        root: 'plugin', path: path.join('skills', BOOTSTRAP_SKILL, 'SKILL.md'),
      },
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
      && manifest.sessionStart?.skill === BOOTSTRAP_SKILL;
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
  BOOTSTRAP_SKILL,
  buildHooksManifest,
  kimiTextTransform,
  resolveTarget,
  resolvePluginRoot,
  resolveRegistryFile,
  install,
  doctor,
  uninstall,
};
