'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const kimi = require('../kimi.js');
const {
  CORE_PUBLIC_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
} = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_ID = 'ultra-builder-pro';

function mkTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-kimi-'));
}

function layout(home) {
  return {
    pluginRoot: path.join(home, 'plugins', 'managed', PLUGIN_ID),
    registryFile: path.join(home, 'plugins', 'installed.json'),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('install builds and registers one Kimi-native plugin without changing config.toml', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  const configFile = path.join(home, 'config.toml');
  const userConfig = '[[hooks]]\nevent = "Stop"\ncommand = "/user/hook.sh"\n';
  try {
    fs.writeFileSync(configFile, userConfig);
    const report = kimi.install({ configDir: home, repoRoot: REPO_ROOT });

    assert.equal(report.target, pluginRoot);
    assert.equal(fs.readFileSync(configFile, 'utf8'), userConfig);
    assert.ok(fs.existsSync(path.join(pluginRoot, '.ubp-managed')));
    assert.ok(fs.existsSync(path.join(pluginRoot, 'provenance.json')));

    const registry = readJson(registryFile);
    assert.equal(registry.version, 1);
    assert.equal(registry.plugins.length, 1);
    assert.deepEqual(registry.plugins[0], {
      id: PLUGIN_ID,
      root: pluginRoot,
      source: 'local-path',
      enabled: true,
      installedAt: registry.plugins[0].installedAt,
      updatedAt: registry.plugins[0].updatedAt,
      originalSource: REPO_ROOT,
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Kimi manifest exposes native skills, commands, hooks, session bootstrap, and MCP', () => {
  const home = mkTarget();
  const { pluginRoot } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const manifest = readJson(path.join(pluginRoot, 'kimi.plugin.json'));

    assert.equal(manifest.name, PLUGIN_ID);
    assert.deepEqual(manifest.skills, ['./skills']);
    assert.deepEqual(manifest.commands, ['./commands']);
    assert.deepEqual(manifest.sessionStart, { skill: 'using-ultra-builder-pro' });
    assert.equal(manifest.agents, undefined, 'Kimi 0.26/0.27 has no custom-agent manifest field');
    assert.deepEqual(manifest.mcpServers[PLUGIN_ID], {
      transport: 'stdio',
      command: process.platform === 'win32' ? 'node.exe' : 'env',
      args: process.platform === 'win32'
        ? ['./runtime/launch.cjs']
        : ['node', './runtime/launch.cjs'],
      enabled: true,
    });

    const hookText = JSON.stringify(manifest.hooks);
    assert.match(hookText, /hooks\/adapters\/kimi\.py/);
    for (const hook of WORKFLOW_HOOK_FILES.filter((value) => value !== 'context_spine.py')) {
      assert.match(hookText, new RegExp(hook.replace('.', '\\.')));
    }
    assert.ok(fs.existsSync(path.join(pluginRoot, 'hooks', 'context_spine.py')));
    assert.doesNotMatch(hookText, /memory|recall|journal|prompt[_ -]?capture|block_dangerous|post_edit_guard/i);

    const commands = fs.readdirSync(path.join(pluginRoot, 'commands')).sort();
    assert.deepEqual(commands, CORE_PUBLIC_SKILLS.map((name) => `${name}.md`).sort());
    const commandText = fs.readFileSync(path.join(pluginRoot, 'commands', 'ultra-init.md'), 'utf8');
    assert.match(commandText, /Use the registered `ultra-init` skill/);
    assert.match(commandText, /\$ARGUMENTS/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Kimi assets are allowlisted and adapted to native tools and paths', () => {
  const home = mkTarget();
  const { pluginRoot } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });

    const skills = fs.readdirSync(path.join(pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && fs.existsSync(path.join(pluginRoot, 'skills', entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, [...skillsForRuntime('kimi'), 'using-ultra-builder-pro'].sort());

    const learn = fs.readFileSync(path.join(pluginRoot, 'skills', 'learn', 'SKILL.md'), 'utf8');
    const review = fs.readFileSync(path.join(pluginRoot, 'skills', 'ultra-review', 'SKILL.md'), 'utf8');
    const init = fs.readFileSync(path.join(pluginRoot, 'skills', 'ultra-init', 'SKILL.md'), 'utf8');
    const bootstrap = fs.readFileSync(
      path.join(pluginRoot, 'skills', 'using-ultra-builder-pro', 'SKILL.md'),
      'utf8',
    );
    assert.match(learn, /`~\/.kimi-code\/skills`/);
    assert.doesNotMatch(learn, /_unverified|learned-[^\s/]*-unverified/i);
    assert.match(review, /Kimi `AgentSwarm`/);
    assert.match(review, /\$KIMI_PLUGIN_ROOT\/agents\//);
    assert.match(review, /scripts\/review_wait\.py/);
    assert.match(review, /spec_fidelity/);
    assert.match(review, /engineering_standards/);
    assert.doesNotMatch(review, /background mode|run_in_background/);
    assert.match(init, /task\.init_project/);
    assert.doesNotMatch(init, /Claude Code|OpenCode|Codex/);
    assert.match(bootstrap, /\.ultra\/state\.db/);
    assert.match(bootstrap, /external providers/);
    assert.match(fs.readFileSync(path.join(pluginRoot, 'skills', 'codex-collab', 'SKILL.md'), 'utf8'), /--ephemeral/);

    const allPromptAssets = [];
    for (const root of ['commands', 'skills', 'agents']) {
      const pending = [path.join(pluginRoot, root)];
      while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const file = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(file);
          else if (entry.isFile() && /\.(?:md|json)$/.test(entry.name)) allPromptAssets.push(file);
        }
      }
    }
    const foreign = /~\/.claude|~\/.codex|~\/.config\/opencode|CLAUDE\.md|TaskCreate|TaskUpdate|TaskList|AskUserQuestion|run_in_background:\s*true|\$CLAUDE_PLUGIN_ROOT|Kimi `Shell`/;
    for (const file of allPromptAssets) {
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, foreign, file);
      assert.doesNotMatch(text, /(^|[\s`("'])\/ultra-(?!builder-pro:)[a-z]/m, file);
      assert.doesNotMatch(text, /[\u3400-\u9fff]|ultra-review-findings-v1|Context7|Exa MCP|graphify|confidence\s*>=?\s*\d+/iu, file);
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('reinstall preserves unrelated records and existing Kimi capability choices', () => {
  const home = mkTarget();
  const { registryFile } = layout(home);
  try {
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      plugins: [{
        id: 'mine', root: '/tmp/mine', source: 'local-path', enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/mine',
      }],
    }, null, 2));

    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const first = readJson(registryFile);
    const ultra = first.plugins.find((entry) => entry.id === PLUGIN_ID);
    ultra.enabled = false;
    ultra.capabilities = { mcpServers: { [PLUGIN_ID]: { enabled: false } } };
    fs.writeFileSync(registryFile, JSON.stringify(first, null, 2));

    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const second = readJson(registryFile);
    assert.deepEqual(second.plugins.map((entry) => entry.id).sort(), ['mine', PLUGIN_ID]);
    const refreshed = second.plugins.find((entry) => entry.id === PLUGIN_ID);
    assert.equal(refreshed.installedAt, ultra.installedAt);
    assert.equal(refreshed.enabled, false);
    assert.deepEqual(refreshed.capabilities, ultra.capabilities);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('uninstall removes only the owned Kimi plugin record and managed root', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const registry = readJson(registryFile);
    registry.plugins.unshift({
      id: 'mine', root: '/tmp/mine', source: 'local-path', enabled: true,
      installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/mine',
    });
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));

    kimi.uninstall({ configDir: home });
    assert.equal(fs.existsSync(pluginRoot), false);
    assert.deepEqual(readJson(registryFile).plugins.map((entry) => entry.id), ['mine']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('install and uninstall refuse to replace or remove an unmanaged Kimi root', () => {
  const home = mkTarget();
  const { pluginRoot, registryFile } = layout(home);
  try {
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, 'user.txt'), 'keep');
    assert.throws(
      () => kimi.install({ configDir: home, repoRoot: REPO_ROOT }),
      /unmanaged Kimi plugin/,
    );

    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      plugins: [{
        id: PLUGIN_ID, root: pluginRoot, source: 'local-path', enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/foreign',
      }],
    }));
    assert.throws(() => kimi.uninstall({ configDir: home }), /unmanaged Kimi plugin/);
    assert.equal(fs.readFileSync(path.join(pluginRoot, 'user.txt'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('doctor validates registration and provenance without mutating the Kimi home', () => {
  const home = mkTarget();
  const { registryFile } = layout(home);
  try {
    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const before = fs.readFileSync(registryFile);
    const healthy = kimi.doctor({ configDir: home, repoRoot: REPO_ROOT });
    assert.equal(healthy.status, 'healthy', JSON.stringify(healthy, null, 2));
    assert.deepEqual(fs.readFileSync(registryFile), before);

    const registry = readJson(registryFile);
    registry.plugins[0].enabled = false;
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));
    const degraded = kimi.doctor({ configDir: home, repoRoot: REPO_ROOT });
    assert.equal(degraded.status, 'degraded');
    assert.ok(degraded.issues.some((issue) => issue.code === 'PLUGIN_REGISTRATION_INVALID'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
