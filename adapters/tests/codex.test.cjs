'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const { seedReadyBaseline } = require('../../mcp-server/test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../../mcp-server/test-support/change-contract.cjs');

const codex = require('../codex.js');
const { parse: parseFrontmatter } = require('../_shared/frontmatter.cjs');
const PACKAGE_VERSION = require('../../package.json').version;
const {
  MCP_DEPENDENT_SKILLS,
  skillsForRuntime,
  WORKFLOW_HOOK_FILES,
} = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMANDS = [
  'learn',
  'ultra-change',
  'ultra-deliver',
  'ultra-dev',
  'ultra-doctor',
  'ultra-init',
  'ultra-plan',
  'ultra-research',
  'ultra-status',
  'ultra-test',
  'ultra-think',
];
const AGENTS = [
  'code-reviewer',
  'debugger',
  'review-code',
  'review-comments',
  'review-coordinator',
  'review-design',
  'review-errors',
  'review-spec',
  'review-tests',
  'tdd-runner',
];

function mkLayout() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-home-'));
  return {
    homeDir,
    configDir: path.join(homeDir, '.codex'),
    pluginRoot: path.join(homeDir, 'plugins', 'ultra-builder-pro'),
    marketplaceFile: path.join(homeDir, '.agents', 'plugins', 'marketplace.json'),
  };
}

function cleanup(layout) {
  fs.rmSync(layout.homeDir, { recursive: true, force: true });
}

function install(layout) {
  return codex.install({
    configDir: layout.configDir,
    homeDir: layout.homeDir,
    scope: 'global',
    repoRoot: REPO_ROOT,
    runPluginCli: false,
  });
}

function skillNames(pluginRoot) {
  return fs.readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

test('install builds one Codex-native plugin with complete skill and command coverage', () => {
  const layout = mkLayout();
  try {
    const report = install(layout);
    assert.equal(report.plugin.root, layout.pluginRoot);

    const manifest = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
    assert.equal(manifest.name, 'ultra-builder-pro');
    const escapedVersion = PACKAGE_VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(manifest.version, new RegExp(`^${escapedVersion}\\+codex\\.[0-9a-f]{12}$`));
    assert.equal(manifest.skills, './skills/');
    assert.equal(manifest.mcpServers, './.mcp.json');
    assert.ok(!Object.hasOwn(manifest, 'hooks'), 'default hooks/hooks.json discovery avoids unsupported manifest field');

    const expectedSkills = skillsForRuntime('codex').sort();
    assert.deepEqual(skillNames(layout.pluginRoot), expectedSkills);
    assert.equal(expectedSkills.length, 18);
    assert.ok(!fs.existsSync(path.join(layout.pluginRoot, 'skills', 'codex-collab')));
    assert.ok(!fs.existsSync(path.join(layout.pluginRoot, 'skills', 'learned')));

    const commandMap = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, 'command-map.json'), 'utf8'));
    assert.deepEqual(Object.keys(commandMap).sort(), COMMANDS.map((name) => `/${name}`).sort());
    for (const command of COMMANDS) {
      assert.equal(commandMap[`/${command}`], `$ultra-builder-pro:${command}`);
      assert.ok(fs.existsSync(path.join(layout.pluginRoot, 'skills', command, 'SKILL.md')));
    }
    assert.ok(!fs.existsSync(path.join(layout.configDir, 'prompts')), 'deprecated Codex prompts must not be installed');
  } finally {
    cleanup(layout);
  }
});

test('every generated skill is Codex-valid, UI-visible, and free of Claude host bindings', () => {
  const layout = mkLayout();
  try {
    install(layout);
    for (const name of skillNames(layout.pluginRoot)) {
      const skillDir = path.join(layout.pluginRoot, 'skills', name);
      const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      const { fm } = parseFrontmatter(text);
      assert.deepEqual(Object.keys(fm).sort(), ['description', 'name'], `${name} should use Codex skill frontmatter only`);
      assert.equal(fm.name, name);
      assert.doesNotMatch(
        text,
        /~\/\.claude|CLAUDE\.md|AskUserQuestion|(^|[\s`(>])\/(?:ultra-[a-z-]+|recall|learn|codex-collab)(?=$|[\s`,.;):])/m,
      );
      assert.doesNotMatch(text, /TaskCreate|TaskUpdate|TaskList|TaskOutput|run_in_background|~\/\.codex\/skills|mcp__claude/);
      assert.doesNotMatch(text, /[\u3400-\u9fff]|ultra-review-findings-v1|Context7|Exa MCP|confidence\s*>=?\s*\d+/iu);

      const openai = yaml.load(fs.readFileSync(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8'));
      const openaiSource = fs.readFileSync(path.join(skillDir, 'agents', 'openai.yaml'), 'utf8');
      assert.ok(openai.interface.display_name);
      assert.ok(openai.interface.short_description);
      assert.ok(openai.interface.short_description.length >= 25, name);
      assert.ok(openai.interface.short_description.length <= 64, name);
      assert.match(openaiSource, /short_description:\s+['"]/);
      assert.match(openaiSource, /default_prompt:\s+['"]/);
      assert.match(openai.interface.default_prompt, new RegExp(`\\$ultra-builder-pro:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.equal(openai.policy.allow_implicit_invocation, false);
      if (MCP_DEPENDENT_SKILLS.includes(name)) {
        assert.deepEqual(openai.dependencies.tools, [{
          type: 'mcp',
          value: 'ultra-builder-pro',
          description: 'Ultra Builder Pro authoritative task and change runtime',
        }]);
      } else {
        assert.equal(openai.dependencies, undefined);
      }
    }

    const cc = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'cc-collab', 'SKILL.md'), 'utf8');
    assert.match(cc, /Claude Code/);
    assert.match(cc, /claude --safe-mode/);

    const verify = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'ultra-verify', 'SKILL.md'), 'utf8');
    assert.match(verify, /Keep the current host responsible/);
    assert.match(verify, /installed collaboration companion/);
    assert.match(verify, /host-analysis\.md/);
    assert.doesNotMatch(verify, /codex exec|claude --safe-mode|Claude synthesizes|Claude-only/);

    const waiter = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'ultra-verify', 'scripts', 'verify_wait.py'), 'utf8');
    assert.match(waiter, /--advisor/);
    assert.match(waiter, /advisor-output\.md/);
    assert.doesNotMatch(waiter, /^ADVISOR\s*=|^OUTPUT_FILE\s*=/m);

    const review = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'ultra-review', 'SKILL.md'), 'utf8');
    assert.match(review, /native Codex custom agents/);
    assert.match(review, /review-spec/);
    assert.match(review, /scripts\/review_wait\.py/);

    const plan = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'ultra-plan', 'SKILL.md'), 'utf8');
    const status = fs.readFileSync(path.join(layout.pluginRoot, 'skills', 'ultra-status', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(plan, /LEGACY_STATE_MIGRATION_REQUIRED|v4\.4|v4\.5/);
    assert.match(plan, /Never read or\s+write .*tasks\.json/i);
    assert.match(status, /Never fall\s+back to generated task JSON/i);

    const coreWorkflowText = [
      ...COMMANDS,
      'ultra-review',
    ].map((name) => fs.readFileSync(path.join(layout.pluginRoot, 'skills', name, 'SKILL.md'), 'utf8')).join('\n');
    assert.doesNotMatch(coreWorkflowText, /Phase (?:3\.7|5|7) placeholder|not yet implemented|UNKNOWN_TOOL/);
    assert.doesNotMatch(coreWorkflowText, /session\.checkpoint|review\.run|ultra-tools subagent/);
    assert.doesNotMatch(coreWorkflowText, /ask\.question|ultra-tools task (?:create|update|list|get)/);
    assert.doesNotMatch(coreWorkflowText, /Context7 MCP|mcp__context7|Exa MCP|mcp__exa|Playwright via Bash/);
    assert.doesNotMatch(coreWorkflowText, /`\/{command}`/);
  } finally {
    cleanup(layout);
  }
});

test('install converts all bundled agent prompts into native Codex agent TOML', () => {
  const layout = mkLayout();
  try {
    const report = install(layout);
    assert.deepEqual(report.agents.installed.sort(), AGENTS.map((name) => `${name}.toml`).sort());
    for (const name of AGENTS) {
      const text = fs.readFileSync(path.join(layout.configDir, 'agents', `${name}.toml`), 'utf8');
      assert.match(text, new RegExp(`^name = "${name}"`, 'm'));
      assert.match(text, /^description = /m);
      assert.match(text, /^developer_instructions = """/m);
      assert.doesNotMatch(
        text,
        /model = "opus"|^tools =|^memory =|maxTurns|CLAUDE\.md|AskUserQuestion|(^|[\s`(>])\/(?:ultra-[a-z-]+|recall|learn|codex-collab)(?=$|[\s`,.;):])/m,
      );
    }
  } finally {
    cleanup(layout);
  }
});

test('plugin declares current Codex hooks and a project-local Ultra MCP server', () => {
  const layout = mkLayout();
  try {
    install(layout);
    const hooks = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
    assert.deepEqual(Object.keys(hooks).sort(), [
      'PostCompact', 'PreCompact', 'PreToolUse', 'SessionStart', 'Stop',
      'SubagentStart', 'SubagentStop',
    ].sort());
    const serializedHooks = JSON.stringify(hooks);
    for (const feature of WORKFLOW_HOOK_FILES.filter((value) => value !== 'context_spine.py')) {
      assert.match(serializedHooks, new RegExp(feature.replace('.', '\\.')));
    }
    assert.ok(fs.existsSync(path.join(layout.pluginRoot, 'hooks', 'context_spine.py')));
    assert.doesNotMatch(serializedHooks, /memory|recall|journal|observation_capture|user_prompt_capture|block_dangerous|post_edit_guard/);
    assert.match(serializedHooks, /\$PLUGIN_ROOT\/hooks\/adapters\/codex\.py/);
    assert.match(serializedHooks, /apply_patch/);

    const mcp = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, '.mcp.json'), 'utf8'));
    const server = mcp.mcpServers['ultra-builder-pro'];
    assert.equal(server.type, 'stdio');
    assert.ok(path.isAbsolute(server.command));
    assert.ok(path.isAbsolute(server.args[0]));
    assert.equal(server.args[0], path.join(layout.pluginRoot, 'runtime', 'launch.cjs'));
    assert.doesNotMatch(server.args[0], new RegExp(REPO_ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(!server.env, 'MCP must use each Codex task cwd so .ultra/state.db stays project-local');

    for (const rel of [
      'runtime/index.cjs',
      'runtime/breadcrumb.cjs',
      'runtime/hook-event.cjs',
      'runtime/launch.cjs',
      'runtime/ultra-tools.cjs',
      'runtime/build/Release/better_sqlite3.node',
      'spec/mcp-tools.yaml',
      'spec/upstream-mcp-tools.yaml',
      'spec/codex-capability-map.json',
      'spec/schemas/state-db.sql',
      'templates/.ultra/tasks/tasks.json',
    ]) {
      assert.ok(fs.existsSync(path.join(layout.pluginRoot, rel)), `missing bundled MCP asset ${rel}`);
    }

    const liveSpec = yaml.load(fs.readFileSync(path.join(layout.pluginRoot, 'spec', 'mcp-tools.yaml'), 'utf8'));
    const upstreamSpec = yaml.load(fs.readFileSync(path.join(layout.pluginRoot, 'spec', 'upstream-mcp-tools.yaml'), 'utf8'));
    const capabilityMap = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, 'spec', 'codex-capability-map.json'), 'utf8'));
    assert.equal(liveSpec.tools.length, 41);
    assert.equal(upstreamSpec.tools.length, 41);
    assert.deepEqual(upstreamSpec.tools.map((tool) => tool.name).sort(), liveSpec.tools.map((tool) => tool.name).sort());
    assert.deepEqual(capabilityMap.live_mcp_tools.sort(), liveSpec.tools.map((tool) => tool.name).sort());
    assert.equal(Object.keys(capabilityMap.codex_native_replacements).length, 9);
    assert.equal(capabilityMap.codex_native_replacements['review.run'].surface, 'native_custom_agents');
    assert.equal(capabilityMap.codex_native_replacements['ask.question'].surface, 'direct_user_interaction');
  } finally {
    cleanup(layout);
  }
});

test('bundled plugin MCP runs outside the source checkout and keeps state in the Codex task cwd', async () => {
  const layout = mkLayout();
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-codex-mcp-project-'));
  let client;
  try {
    install(layout);
    fs.writeFileSync(path.join(projectDir, 'contract.md'), '# Bundled runtime contract\n');
    const seededState = initStateDb(path.join(projectDir, '.ultra', 'state.db'));
    seedReadyBaseline(seededState.db, {
      rootDir: projectDir, id: 'test-baseline', projectName: 'codex-bundle',
    });
    closeStateDb(seededState.db);
    const mcp = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, '.mcp.json'), 'utf8'));
    const server = mcp.mcpServers['ultra-builder-pro'];
    const env = { ...process.env };
    delete env.UBP_DB_PATH;
    delete env.UBP_ROOT_DIR;
    delete env.UBP_RUNTIME_ROOT;
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      cwd: projectDir,
      env,
      stderr: 'pipe',
    });
    client = new Client({ name: 'ubp-codex-adapter-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === 'task.create'));
    const change = await client.callTool({
      name: 'change.create',
      arguments: completeChangeInput({
        id: 'codex-bundle-change', title: 'Exercise bundled runtime', kind: 'quick',
        intent: 'Keep task state in the Codex task working directory.',
        docs_impact: { status: 'none', files: [], rationale: 'Runtime smoke fixture.' },
      }),
    });
    assert.equal(change.isError, undefined);
    const created = await client.callTool({
      name: 'task.create',
      arguments: {
        id: 'codex-bundle-1', title: 'bundled runtime', type: 'feature', priority: 'P1',
        change_id: 'codex-bundle-change',
        outcome: 'The bundled MCP persists task authority in the Codex task directory.',
        slice_kind: 'tracer_bullet',
        public_seam: 'bundled MCP task lifecycle',
        verification_command: 'node --test adapters/tests/codex.test.cjs',
        acceptance: [{
          id: 'task-cwd-authority',
          criterion: 'Task lifecycle state is stored under the Codex task working directory.',
          verification: 'node --test adapters/tests/codex.test.cjs',
        }],
        context_refs: [{
          ref: 'contract.md', kind: 'spec', reason: 'Bundled runtime behavior contract', required: true,
        }],
        docs_impact: { status: 'none', files: [], rationale: 'Runtime smoke fixture.' },
        ownership: { owner: 'test-owner', reviewers: [] },
        trace_to: 'contract.md#bundled-runtime-contract',
      },
    });
    assert.equal(created.isError, undefined);
    const started = await client.callTool({
      name: 'task.update', arguments: { id: 'codex-bundle-1', patch: { status: 'in_progress' } },
    });
    assert.equal(started.isError, undefined);
    assert.ok(fs.existsSync(path.join(projectDir, '.ultra', 'state.db')));
    assert.ok(!fs.existsSync(path.join(layout.pluginRoot, '.ultra', 'state.db')));

    const status = spawnSync(process.execPath, [
      path.join(layout.pluginRoot, 'runtime', 'ultra-tools.cjs'),
      'status', '--cost', '--json',
    ], { cwd: projectDir, encoding: 'utf8' });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).ok, true);

    const hookEvent = spawnSync(process.execPath, [
      path.join(layout.pluginRoot, 'runtime', 'hook-event.cjs'), projectDir, 'stop',
    ], {
      cwd: projectDir,
      input: JSON.stringify({
        agent_id: 'bundle-agent', agent_type: 'review-code', session_id: 'host-session',
        agent_transcript_path: '/private/transcript.jsonl',
      }),
      encoding: 'utf8',
    });
    assert.equal(hookEvent.status, 0, hookEvent.stderr);
    assert.equal(JSON.parse(hookEvent.stdout).recorded, true);
    const lifecycleRead = initStateDb(path.join(projectDir, '.ultra', 'state.db')).db;
    const lifecycleRow = lifecycleRead.prepare(
      "SELECT payload_json FROM events WHERE type = 'subagent_stopped' ORDER BY id DESC LIMIT 1",
    ).get();
    closeStateDb(lifecycleRead);
    assert.match(lifecycleRow.payload_json, /bundle-agent/);
    assert.doesNotMatch(lifecycleRow.payload_json, /transcript/);

    const freshTarget = path.join(projectDir, 'fresh-project');
    const initialized = await client.callTool({
      name: 'task.init_project',
      arguments: { target_dir: freshTarget, project_name: 'Codex bundle', project_type: 'cli' },
    });
    assert.equal(initialized.isError, undefined);
    assert.ok(fs.existsSync(path.join(freshTarget, '.ultra', 'tasks', 'tasks.json')));
  } finally {
    if (client) await client.close();
    fs.rmSync(projectDir, { recursive: true, force: true });
    cleanup(layout);
  }
});

test('install preserves user config and marketplace entries and is byte-idempotent', () => {
  const layout = mkLayout();
  try {
    fs.mkdirSync(layout.configDir, { recursive: true });
    const configFile = path.join(layout.configDir, 'config.toml');
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n');
    fs.mkdirSync(path.dirname(layout.marketplaceFile), { recursive: true });
    fs.writeFileSync(layout.marketplaceFile, JSON.stringify({
      name: 'personal',
      interface: { displayName: 'Personal' },
      plugins: [{
        name: 'mine',
        source: { source: 'local', path: './plugins/mine' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Developer Tools',
      }],
    }, null, 2) + '\n');

    install(layout);
    const firstConfig = fs.readFileSync(configFile, 'utf8');
    const firstMarketplace = fs.readFileSync(layout.marketplaceFile, 'utf8');
    const firstManifest = fs.readFileSync(path.join(layout.pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8');
    const firstAgent = fs.readFileSync(path.join(layout.configDir, 'agents', 'review-code.toml'), 'utf8');
    install(layout);

    assert.equal(fs.readFileSync(configFile, 'utf8'), firstConfig);
    assert.equal(fs.readFileSync(layout.marketplaceFile, 'utf8'), firstMarketplace);
    assert.equal(fs.readFileSync(path.join(layout.pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'), firstManifest);
    assert.equal(fs.readFileSync(path.join(layout.configDir, 'agents', 'review-code.toml'), 'utf8'), firstAgent);

    const marketplace = JSON.parse(firstMarketplace);
    assert.deepEqual(marketplace.plugins.map((entry) => entry.name), ['mine', 'ultra-builder-pro']);
    assert.equal(marketplace.plugins[1].source.path, './plugins/ultra-builder-pro');
  } finally {
    cleanup(layout);
  }
});

test('uninstall removes only UBP-managed plugin and agents', () => {
  const layout = mkLayout();
  try {
    fs.mkdirSync(layout.configDir, { recursive: true });
    const configFile = path.join(layout.configDir, 'config.toml');
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n');
    install(layout);
    fs.writeFileSync(path.join(layout.configDir, 'agents', 'mine.toml'), 'name = "mine"\n');

    codex.uninstall({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      runPluginCli: false,
    });

    assert.ok(!fs.existsSync(layout.pluginRoot));
    for (const name of AGENTS) {
      assert.ok(!fs.existsSync(path.join(layout.configDir, 'agents', `${name}.toml`)));
    }
    assert.ok(fs.existsSync(path.join(layout.configDir, 'agents', 'mine.toml')));
    assert.equal(fs.readFileSync(configFile, 'utf8'), '[profile]\nname = "dev"\n');
    const marketplace = JSON.parse(fs.readFileSync(layout.marketplaceFile, 'utf8'));
    assert.ok(!marketplace.plugins.some((entry) => entry.name === 'ultra-builder-pro'));
  } finally {
    cleanup(layout);
  }
});

test('doctor checks the current Codex cache hook target for a CLI-managed global install', () => {
  const layout = mkLayout();
  try {
    install(layout);
    const runtimeManifest = JSON.parse(fs.readFileSync(
      path.join(layout.configDir, 'ultra-builder-pro', 'install-manifest.json'),
      'utf8',
    ));
    const version = runtimeManifest.plugin.version;
    const cacheAdapter = path.join(
      codex._internal.pluginCacheRoot(layout.configDir, 'personal'),
      version,
      'hooks',
      'adapters',
      'codex.py',
    );
    const doctorCtx = {
      homeDir: layout.homeDir,
      scope: 'global',
      repoRoot: REPO_ROOT,
      runPluginCli: true,
    };

    const degraded = codex.doctor(doctorCtx);
    assert.equal(degraded.status, 'degraded');
    assert.ok(degraded.issues.some((entry) => (
      entry.code === 'HOOK_TARGET_MISSING' && entry.version === version
    )));

    fs.mkdirSync(path.dirname(cacheAdapter), { recursive: true });
    fs.copyFileSync(path.join(layout.pluginRoot, 'hooks', 'adapters', 'codex.py'), cacheAdapter);
    assert.equal(codex.doctor(doctorCtx).status, 'healthy');
  } finally {
    cleanup(layout);
  }
});
