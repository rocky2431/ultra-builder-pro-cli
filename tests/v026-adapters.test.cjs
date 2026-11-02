'use strict';

const { afterEach, test } = require('node:test');
const sandboxes = [];
afterEach(() => {
  for (const root of sandboxes.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { parse } = require('../adapters/_shared/frontmatter.cjs');

const ROOT = path.resolve(__dirname, '..');
const {
  skillPolicy,
  skillsForRuntime,
  WORKFLOW_HOOK_FILES,
} = require('../adapters/_shared/runtime-assets.cjs');

function sandbox(runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-${runtime}-`));
  sandboxes.push(root);
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

for (const runtime of ['claude', 'codex']) {
  test(`${runtime} installs, diagnoses, updates and uninstalls the packaged asset boundary`, async () => {
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
      const installedSkill = path.join(skillRoot, name, 'SKILL.md');
      assert.ok(fs.existsSync(installedSkill), name);
      const installedText = fs.readFileSync(installedSkill, 'utf8');
      const { fm } = parse(installedText);
      assert.ok(installedText.includes(path.join(pluginRoot, 'engine', 'cli.cjs')));
      assert.ok(installedText.includes(path.join(pluginRoot, 'engine', 'FORMATS.md')));
      assert.doesNotMatch(installedText, /when the command is not on PATH/u);
      const policy = skillPolicy(name);
      if (runtime === 'claude') {
        assert.equal(fm['user-invocable'], policy.userInvocable, `${runtime}:${name}:user`);
        assert.equal(
          fm['disable-model-invocation'],
          policy.allowImplicitInvocation ? undefined : true,
          `${runtime}:${name}:implicit`,
        );
      } else {
        assert.equal(fm['user-invocable'], undefined, `${runtime}:${name}:unsupported user bit`);
        assert.equal(
          fm['disable-model-invocation'],
          undefined,
          `${runtime}:${name}:unsupported implicit bit`,
        );
        assert.equal(
          fm.disableModelInvocation,
          undefined,
          `${runtime}:${name}:unsupported native bit`,
        );
      }
    }
    const hookRoot = first.hookRoot || path.join(pluginRoot, 'hooks');
    for (const name of WORKFLOW_HOOK_FILES) {
      assert.ok(fs.existsSync(path.join(hookRoot, name)), `${runtime}:${name}`);
    }
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
    assert.equal(
      metadata.policy.allow_implicit_invocation,
      skillPolicy(name).allowImplicitInvocation,
      name,
    );
    assert.equal(metadata.dependencies, undefined, name);
  }
});

test('every Host receives each whole source description, and Codex shortens only its own', async () => {
  // What a Host lists is the description verbatim: no adapter may shorten, reflow or
  // rewrite it, because that listing is the only surface a model sees before the body
  // loads. Codex additionally derives a bounded short description, which stays a prefix
  // of that same text. Where that prefix falls inside a word is pre-existing Codex
  // presentation behaviour, observed but not asserted here.
  const source = Object.fromEntries(skillsForRuntime('claude').map((name) => [
    name,
    String(parse(fs.readFileSync(path.join(ROOT, 'skills', name, 'SKILL.md'), 'utf8')).fm.description),
  ]));

  for (const runtime of ['claude', 'codex']) {
    const adapter = require(path.join(ROOT, 'adapters', `${runtime}.js`));
    const { ctx } = sandbox(`${runtime}-description-fidelity`);
    const report = await adapter.install(ctx);
    const skillRoot = report.skillRoot || path.join(report.pluginRoot || report.target, 'skills');
    for (const name of skillsForRuntime(runtime)) {
      const installed = parse(fs.readFileSync(path.join(skillRoot, name, 'SKILL.md'), 'utf8'));
      assert.equal(String(installed.fm.description), source[name], `${runtime}:${name}`);
    }
    if (runtime !== 'codex') continue;
    for (const name of skillsForRuntime(runtime)) {
      const metadata = yaml.load(fs.readFileSync(
        path.join(skillRoot, name, 'agents', 'openai.yaml'),
        'utf8',
      ));
      const short = String(metadata.interface.short_description);
      const collapsed = source[name].replace(/\s+/gu, ' ').trim();
      assert.ok(short.length > 0 && short.length <= 64, `${name}: short ${short.length}`);
      assert.ok(collapsed.startsWith(short), `${name}: short description is not a prefix`);
      assert.ok(!/[a-z]/iu.test(collapsed[short.length] || ''), 'do not cut inside a word');
    }
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

test('Codex doctor leaves unobservable hook trust with the Host', async () => {
  const codex = require('../adapters/codex.js');
  const { ctx } = sandbox('codex-hook-trust');
  await codex.install(ctx);
  const report = await codex.doctor(ctx);
  assert.equal(report.status, 'healthy');
  assert.deepEqual(report.checks.hook_activation, {
    status: 'host_managed',
    observable: false,
    reason: 'Codex owns persisted Hook trust, and its CLI does not expose the live trust decision to plugins.',
  });
  assert.equal(report.actions, undefined);
});
