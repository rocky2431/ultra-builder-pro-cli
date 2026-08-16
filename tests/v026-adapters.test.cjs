'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const {
  GRANT_CONTINUABLE_SKILLS,
  skillsForRuntime,
  WORKFLOW_HOOK_FILES,
} = require('../adapters/_shared/runtime-assets.cjs');

function sandbox(runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-${runtime}-`));
  return {
    root,
    ctx: {
      repoRoot: ROOT,
      configDir: root,
      homeDir: root,
      cwd: root,
      scope: 'global',
      runHostCli: false,
      runPluginCli: false,
    },
  };
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function treeSnapshot(root) {
  return Object.fromEntries(walk(root).map((file) => [
    path.relative(root, file),
    fs.readFileSync(file),
  ]));
}

function assertNoLegacy(root) {
  const relative = walk(root).map((file) => path.relative(root, file));
  assert.ok(!relative.some((file) => file === '.mcp.json' || file.startsWith(`runtime${path.sep}`)));
  assert.ok(!relative.some((file) => file.startsWith(`commands${path.sep}`)));
  assert.ok(!relative.some((file) => file.startsWith(`agents${path.sep}`) && !file.endsWith('openai.yaml')));
  for (const file of relative.filter((name) => /(?:\.json|\.md|\.yaml)$/.test(name))) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /mcpServers|ultra\.context|state\.db|persistent safety kernel/i, file);
  }
}

for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok', 'zcode']) {
  test(`${runtime} installs, diagnoses, updates and uninstalls the v0.26 asset boundary`, async () => {
    const adapter = require(path.join(ROOT, 'adapters', `${runtime}.js`));
    const { ctx } = sandbox(runtime);
    const first = await adapter.install(ctx);
    const pluginRoot = first.pluginRoot || first.target;
    assert.ok(fs.existsSync(pluginRoot), `${runtime} plugin root missing`);

    const skillRoot = first.skillRoot || path.join(pluginRoot, 'skills');
    const installedSkills = fs.readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(installedSkills, skillsForRuntime(runtime).sort());
    for (const name of installedSkills) {
      assert.ok(fs.existsSync(path.join(skillRoot, name, 'SKILL.md')), name);
    }
    assert.deepEqual(
      treeSnapshot(path.join(skillRoot, 'ultra-init', 'assets', 'project-template')),
      treeSnapshot(path.join(ROOT, '.ultra-template')),
      `${runtime}: installed ultra-init template drifted from the canonical project template`,
    );

    const hookRoot = first.hookRoot || path.join(pluginRoot, 'hooks');
    for (const name of WORKFLOW_HOOK_FILES) {
      assert.ok(fs.existsSync(path.join(hookRoot, name)), `${runtime}:${name}`);
    }
    assert.ok(fs.existsSync(path.join(hookRoot, '_common.py')), `${runtime}:hook helper`);
    assertNoLegacy(pluginRoot);

    const healthy = await adapter.doctor(ctx);
    assert.equal(healthy.status, 'healthy', JSON.stringify(healthy.issues));

    const second = await adapter.install(ctx);
    assert.equal(second.pluginRoot || second.target, pluginRoot);
    assert.equal((await adapter.doctor(ctx)).status, 'healthy');

    const removed = await adapter.uninstall(ctx);
    assert.equal(fs.existsSync(pluginRoot), false, JSON.stringify(removed));
  });
}

test('Codex emits native invocation policy without an MCP dependency', async () => {
  const codex = require('../adapters/codex.js');
  const { ctx } = sandbox('codex-policy');
  const report = await codex.install(ctx);
  for (const name of skillsForRuntime('codex')) {
    const metadata = yaml.load(fs.readFileSync(
      path.join(report.skillRoot, name, 'agents', 'openai.yaml'),
      'utf8',
    ));
    const modelInvoked = ['ultra-grilling', 'ultra-domain-modeling', 'ultra-tdd', 'ultra-review', 'ultra-think'].includes(name);
    assert.equal(
      metadata.policy.allow_implicit_invocation,
      modelInvoked || GRANT_CONTINUABLE_SKILLS.includes(name),
      name,
    );
    assert.equal(metadata.dependencies, undefined, name);
  }
});

test('Codex plugin manifest satisfies the native presentation contract', async () => {
  const codex = require('../adapters/codex.js');
  const { ctx } = sandbox('codex-manifest');
  const report = await codex.install(ctx);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(report.pluginRoot, '.codex-plugin', 'plugin.json'),
    'utf8',
  ));
  assert.equal(typeof manifest.interface.longDescription, 'string');
  assert.ok(manifest.interface.longDescription.length > 0);
  assert.equal(manifest.interface.developerName, 'Ultra Builder Pro contributors');
  assert.equal(manifest.interface.category, 'Developer Tools');
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
  assert.ok(manifest.interface.defaultPrompt.length >= 1);
  assert.ok(manifest.interface.defaultPrompt.every((prompt) => prompt.length <= 128));
});

test('Codex doctor distinguishes healthy installation from user-controlled hook trust', async () => {
  const codex = require('../adapters/codex.js');
  const { ctx } = sandbox('codex-hook-trust');
  await codex.install(ctx);
  const report = await codex.doctor(ctx);
  assert.equal(report.status, 'healthy');
  assert.equal(report.checks.hook_activation.status, 'user_review_required');
  assert.ok(report.actions.some((action) => action.code === 'REVIEW_CODEX_HOOK_TRUST'));
});

test('OpenCode upgrades a managed v0.25 surface without touching user assets', async () => {
  const opencode = require('../adapters/opencode.js');
  const { root, ctx } = sandbox('opencode-upgrade');
  const legacyBundle = path.join(root, '.ultra-builder-pro');
  const legacySkill = path.join(root, 'skills', 'ultra-verify');
  const managedCommand = path.join(root, 'commands', 'ultra-init.md');
  const userCommand = path.join(root, 'commands', 'user.md');
  const managedAgent = path.join(root, 'agents', 'review-code.md');
  const userAgent = path.join(root, 'agents', 'user.md');
  fs.mkdirSync(path.join(legacyBundle, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(legacyBundle, '.ubp-managed'), '{}\n');
  fs.writeFileSync(path.join(legacyBundle, 'runtime', 'launch.cjs'), 'retired\n');
  fs.mkdirSync(legacySkill, { recursive: true });
  fs.writeFileSync(path.join(legacySkill, '.ubp-managed'), '{}\n');
  fs.writeFileSync(path.join(legacySkill, 'SKILL.md'), 'retired\n');
  for (const file of [managedCommand, userCommand, managedAgent, userAgent]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  fs.writeFileSync(managedCommand, '<!-- ultra-builder-pro:managed -->\nretired\n');
  fs.writeFileSync(userCommand, 'user command\n');
  fs.writeFileSync(managedAgent, '<!-- ultra-builder-pro:managed -->\nretired\n');
  fs.writeFileSync(userAgent, 'user agent\n');
  fs.mkdirSync(path.join(root, 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'plugins', 'ultra-builder-pro.js'),
    '// Managed by Ultra Builder Pro.\nretired\n',
  );
  fs.writeFileSync(path.join(root, 'opencode.json'), `${JSON.stringify({
    mcp: { 'ultra-builder-pro': { command: ['retired'] }, keep: { command: ['keep'] } },
    theme: 'user-owned',
  }, null, 2)}\n`);

  const report = await opencode.install(ctx);
  assert.equal((await opencode.doctor(ctx)).status, 'healthy');
  assert.equal(fs.existsSync(path.join(report.pluginRoot, 'runtime')), false);
  assert.equal(fs.existsSync(legacySkill), false);
  assert.equal(fs.existsSync(managedCommand), false);
  assert.equal(fs.existsSync(managedAgent), false);
  assert.equal(fs.readFileSync(userCommand, 'utf8'), 'user command\n');
  assert.equal(fs.readFileSync(userAgent, 'utf8'), 'user agent\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'opencode.json'), 'utf8')), {
    mcp: { keep: { command: ['keep'] } },
    theme: 'user-owned',
  });
});

test('OpenCode rejects corrupt legacy config before replacing a healthy install', async () => {
  const opencode = require('../adapters/opencode.js');
  const { root, ctx } = sandbox('opencode-preflight');
  const first = await opencode.install(ctx);
  const marker = path.join(first.pluginRoot, 'previous-install.txt');
  fs.writeFileSync(marker, 'preserve me\n');
  fs.writeFileSync(path.join(root, 'opencode.json'), '{');

  await assert.rejects(async () => opencode.install(ctx), SyntaxError);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve me\n');
});

test('OpenCode rolls back every managed tree when plugin publication fails', async () => {
  const opencode = require('../adapters/opencode.js');
  const { root, ctx } = sandbox('opencode-rollback');
  const ownerFile = path.join(root, 'plugins');
  fs.writeFileSync(ownerFile, 'owner file blocks the plugin directory\n');

  await assert.rejects(async () => opencode.install(ctx), /EEXIST|ENOTDIR/);
  assert.equal(fs.readFileSync(ownerFile, 'utf8'), 'owner file blocks the plugin directory\n');
  assert.equal(fs.existsSync(path.join(root, '.ultra-builder-pro')), false);
  assert.equal(fs.existsSync(path.join(root, 'skills')), false);
});

test('all hook manifests wire the five hooks and no lifecycle supervisor', async () => {
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok', 'zcode']) {
    const adapter = require(path.join(ROOT, 'adapters', `${runtime}.js`));
    const text = JSON.stringify(adapter.buildHooksManifest());
    for (const name of WORKFLOW_HOOK_FILES) assert.match(text, new RegExp(name.replace('.', '\\.')));
    assert.doesNotMatch(text, /workflow_checkpoint|workflow_resume|subagent_tracker|pre_stop_check|health_check/);
  }
});

test('ZCode publishes a native inline plugin and local marketplace with reversible config', async () => {
  const zcode = require('../adapters/zcode.js');
  const { root, ctx } = sandbox('zcode-native');
  const configFile = path.join(root, 'cli', 'config.json');
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify({
    plugins: { enabled: false, dirs: ['/owner/plugin'], options: { keep: true } },
    ui: { locale: 'zh-CN' },
  }, null, 2)}\n`);

  const installed = await zcode.install(ctx);
  const manifest = JSON.parse(fs.readFileSync(
    path.join(installed.pluginRoot, '.zcode-plugin', 'plugin.json'),
    'utf8',
  ));
  const marketplace = JSON.parse(fs.readFileSync(installed.marketplaceFile, 'utf8'));
  const configured = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(manifest.name, 'ultra-builder-pro');
  assert.equal(manifest.skills, './skills');
  assert.equal(manifest.hooks, './hooks/hooks.json');
  assert.equal(marketplace.name, 'ultra-builder-pro');
  assert.equal(marketplace.plugins[0].source, './plugin');
  assert.equal(configured.plugins.enabled, true);
  assert.deepEqual(configured.plugins.dirs, ['/owner/plugin', installed.pluginRoot]);
  assert.deepEqual(configured.plugins.options, { keep: true });
  assert.deepEqual(configured.ui, { locale: 'zh-CN' });

  await zcode.uninstall(ctx);
  assert.deepEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')), {
    plugins: { enabled: false, dirs: ['/owner/plugin'], options: { keep: true } },
    ui: { locale: 'zh-CN' },
  });
});
