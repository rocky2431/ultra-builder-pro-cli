'use strict';

// Codex conformance: Ultra Builder Pro is distributed as one personal plugin.
// Command workflows are explicit plugin skills, custom agents are native TOML,
// lifecycle automation uses current Codex hook events, and MCP state stays project-local.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codex = require('../../../adapters/codex.js');
const { REPO_ROOT, mkTarget, cleanup } = require('../_lib.cjs');

const COMMANDS = [
  'ultra-change', 'ultra-deliver', 'ultra-dev', 'ultra-doctor', 'ultra-init', 'ultra-plan',
  'ultra-research', 'ultra-status', 'ultra-test', 'ultra-think',
];
const AGENTS = [
  'code-reviewer', 'debugger', 'review-code', 'review-comments',
  'review-coordinator', 'review-design', 'review-errors', 'review-spec', 'review-tests', 'tdd-runner',
];

function mkLayout(prefix) {
  const homeDir = mkTarget(prefix);
  return {
    homeDir,
    configDir: path.join(homeDir, '.codex'),
    pluginRoot: path.join(homeDir, 'plugins', 'ultra-builder-pro'),
    marketplaceFile: path.join(homeDir, '.agents', 'plugins', 'marketplace.json'),
  };
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

test('codex conformance — ten compatibility mappings plus review are explicit plugin skills', () => {
  const layout = mkLayout('codex-cap-cmd');
  try {
    install(layout);
    const commandMap = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, 'command-map.json'), 'utf8'));
    assert.deepEqual(Object.keys(commandMap).sort(), COMMANDS.map((name) => `/${name}`).sort());
    for (const command of COMMANDS) {
      assert.equal(commandMap[`/${command}`], `$ultra-builder-pro:${command}`);
      assert.ok(fs.existsSync(path.join(layout.pluginRoot, 'skills', command, 'SKILL.md')));
    }
    assert.ok(fs.existsSync(path.join(layout.pluginRoot, 'skills', 'ultra-review', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(layout.configDir, 'prompts')));
  } finally { cleanup(layout.homeDir); }
});

test('codex conformance — complete skill and native agent packaging', () => {
  const layout = mkLayout('codex-cap-assets');
  try {
    install(layout);
    const skills = fs.readdirSync(path.join(layout.pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(layout.pluginRoot, 'skills', entry.name, 'SKILL.md')))
      .map((entry) => entry.name)
      .sort();
    assert.equal(skills.length, 19);
    assert.ok(skills.includes('cc-collab'));
    assert.ok(!skills.includes('codex-collab'));
    assert.ok(!skills.includes('learned'));
    assert.deepEqual(
      fs.readdirSync(path.join(layout.configDir, 'agents')).filter((name) => name.endsWith('.toml')).sort(),
      AGENTS.map((name) => `${name}.toml`).sort(),
    );
  } finally { cleanup(layout.homeDir); }
});

test('codex conformance — current hook event coverage', () => {
  const layout = mkLayout('codex-cap-hook');
  try {
    install(layout);
    const manifest = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.hooks).sort(), [
      'PostCompact', 'PreCompact', 'PreToolUse', 'SessionStart', 'Stop',
      'SubagentStart', 'SubagentStop',
    ].sort());
    assert.match(JSON.stringify(manifest), /hooks\/adapters\/codex\.py/);
  } finally { cleanup(layout.homeDir); }
});

test('codex conformance — plugin MCP has no global state override', () => {
  const layout = mkLayout('codex-cap-mcp');
  try {
    install(layout);
    const mcp = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, '.mcp.json'), 'utf8'));
    const entry = mcp.mcpServers['ultra-builder-pro'];
    assert.equal(entry.type, 'stdio');
    assert.equal(entry.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
    assert.deepEqual(
      entry.args,
      process.platform === 'win32'
        ? [path.join(layout.pluginRoot, 'runtime', 'launch.cjs')]
        : ['node', path.join(layout.pluginRoot, 'runtime', 'launch.cjs')],
    );
    assert.ok(fs.existsSync(path.join(layout.pluginRoot, 'runtime', 'index.cjs')));
    assert.ok(fs.existsSync(path.join(
      layout.pluginRoot,
      'runtime',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    )));
    assert.ok(!entry.env, 'the current task cwd must own .ultra/.runtime/state.db');
  } finally { cleanup(layout.homeDir); }
});

test('codex conformance — complete install is byte-idempotent', () => {
  const layout = mkLayout('codex-cap-idem');
  try {
    install(layout);
    const files = [
      path.join(layout.pluginRoot, '.codex-plugin', 'plugin.json'),
      path.join(layout.pluginRoot, 'hooks', 'hooks.json'),
      path.join(layout.pluginRoot, 'command-map.json'),
      path.join(layout.configDir, 'agents', 'review-code.toml'),
      layout.marketplaceFile,
    ];
    const first = files.map((file) => fs.readFileSync(file));
    install(layout);
    files.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), first[index]));
  } finally { cleanup(layout.homeDir); }
});
