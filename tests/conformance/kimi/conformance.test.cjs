'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kimi = require('../../../adapters/kimi.js');
const { CORE_PUBLIC_SKILLS, skillsForRuntime } = require('../../../adapters/_shared/runtime-assets.cjs');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');

function layout(prefix) {
  const home = mkTarget(prefix);
  return {
    home,
    pluginRoot: path.join(home, 'plugins', 'managed', 'ultra-builder-pro'),
    registryFile: path.join(home, 'plugins', 'installed.json'),
  };
}

function install(value) {
  return kimi.install({ configDir: value.home, repoRoot: REPO_ROOT });
}

test('kimi conformance — native manifest exposes all twelve workflow commands', () => {
  const value = layout('kimi-cap-command');
  try {
    install(value);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'kimi.plugin.json'), 'utf8'));
    assert.deepEqual(manifest.commands, ['./commands']);
    assert.deepEqual(
      fs.readdirSync(path.join(value.pluginRoot, 'commands')).sort(),
      CORE_PUBLIC_SKILLS.map((name) => `${name}.md`).sort(),
    );
    assert.deepEqual(manifest.sessionStart, { skill: 'using-ultra-builder-pro' });
  } finally { cleanup(value.home); }
});

test('kimi conformance — complete skills plus functional worker templates', () => {
  const value = layout('kimi-cap-assets');
  try {
    install(value);
    const skills = fs.readdirSync(path.join(value.pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()
        && fs.existsSync(path.join(value.pluginRoot, 'skills', entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, [...skillsForRuntime('kimi'), 'using-ultra-builder-pro'].sort());
    assert.equal(skills.length, 20);
    assert.equal(
      fs.readdirSync(path.join(value.pluginRoot, 'agents')).filter((name) => name.endsWith('.md')).length,
      10,
    );
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'agents', 'review-spec.md')));
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'kimi.plugin.json'), 'utf8'));
    assert.equal(manifest.agents, undefined);
  } finally { cleanup(value.home); }
});

test('kimi conformance — hook event coverage uses the Kimi wire adapter', () => {
  const value = layout('kimi-cap-hooks');
  try {
    install(value);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'kimi.plugin.json'), 'utf8'));
    assert.deepEqual([...new Set(manifest.hooks.map((hook) => hook.event))].sort(), [
      'PostCompact', 'PreCompact', 'PreToolUse', 'SessionStart', 'Stop',
      'SubagentStart', 'SubagentStop',
    ].sort());
    assert.ok(manifest.hooks.every((hook) => hook.command.includes('hooks/adapters/kimi.py')));
  } finally { cleanup(value.home); }
});

test('kimi conformance — MCP avoids the incompatible Kimi embedded Node ABI', () => {
  const value = layout('kimi-cap-mcp');
  try {
    install(value);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'kimi.plugin.json'), 'utf8'));
    const entry = manifest.mcpServers['ultra-builder-pro'];
    assert.equal(entry.transport, 'stdio');
    assert.equal(entry.command, process.platform === 'win32' ? 'node.exe' : 'env');
    assert.deepEqual(
      entry.args,
      process.platform === 'win32' ? ['./runtime/launch.cjs'] : ['node', './runtime/launch.cjs'],
    );
    assert.equal(entry.cwd, undefined);
    assert.equal(entry.env, undefined);
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'runtime', 'build', 'Release', 'better_sqlite3.node')));
  } finally { cleanup(value.home); }
});

test('kimi conformance — install is byte-idempotent apart from provenance timestamps', () => {
  const value = layout('kimi-cap-idempotent');
  try {
    install(value);
    const files = [
      path.join(value.pluginRoot, 'kimi.plugin.json'),
      path.join(value.pluginRoot, 'commands', 'ultra-init.md'),
      path.join(value.pluginRoot, 'skills', 'ultra-review', 'SKILL.md'),
      path.join(value.pluginRoot, 'hooks', 'adapters', 'kimi.py'),
    ];
    const first = files.map((file) => fs.readFileSync(file));
    install(value);
    files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), first[index]));
  } finally { cleanup(value.home); }
});
