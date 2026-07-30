'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const grok = require('../grok.js');
const { skillsForRuntime } = require('../_shared/runtime-assets.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function fixture() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-grok-'));
  return {
    configDir,
    pluginRoot: path.join(configDir, 'plugins', 'ultra-builder-pro'),
    missingBinary: path.join(configDir, 'missing-grok'),
  };
}

function cleanup(value) {
  fs.rmSync(value.configDir, { recursive: true, force: true });
}

function install(value) {
  return grok.install({
    configDir: value.configDir,
    repoRoot: REPO_ROOT,
    grokBin: value.missingBinary,
  });
}

test('Grok install emits one native plugin with all owned assets', () => {
  const value = fixture();
  try {
    const report = install(value);
    assert.equal(report.target, value.pluginRoot);
    assert.equal(report.validation.status, 'unavailable');
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, '.mcp.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'hooks', 'hooks.json')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'hooks', 'adapters', 'grok.py')));
    assert.ok(fs.existsSync(path.join(value.pluginRoot, 'runtime', 'native-runtime.json')));
    assert.ok(fs.existsSync(path.join(
      value.pluginRoot,
      'runtime',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    )));
    const skills = fs.readdirSync(path.join(value.pluginRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(skills, skillsForRuntime('grok').sort());
    assert.equal(
      fs.readdirSync(path.join(value.pluginRoot, 'commands')).length,
      11,
    );
    assert.equal(
      fs.readdirSync(path.join(value.pluginRoot, 'agents')).filter((name) => name.endsWith('.md')).length,
      10,
    );
  } finally {
    cleanup(value);
  }
});

test('Grok manifest uses only native component discovery and seven-tool MCP', () => {
  const value = fixture();
  try {
    install(value);
    const manifest = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, 'plugin.json'), 'utf8'));
    assert.equal(manifest.name, 'ultra-builder-pro');
    assert.equal(typeof manifest.author.name, 'string');
    assert.equal(typeof manifest.repository, 'string');
    const mcp = JSON.parse(fs.readFileSync(path.join(value.pluginRoot, '.mcp.json'), 'utf8'))
      .mcpServers['ultra-builder-pro'];
    assert.equal(mcp.type, 'stdio');
    assert.equal(mcp.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
    assert.deepEqual(
      mcp.args,
      process.platform === 'win32'
        ? [path.join(value.pluginRoot, 'runtime', 'launch.cjs')]
        : ['node', path.join(value.pluginRoot, 'runtime', 'launch.cjs')],
    );
    const spec = fs.readFileSync(path.join(value.pluginRoot, 'spec', 'mcp-tools.yaml'), 'utf8');
    assert.equal((spec.match(/^\s+- name: ultra\./gm) || []).length, 7);
  } finally {
    cleanup(value);
  }
});

test('Grok hooks are observational except exact managed-file protection', () => {
  const value = fixture();
  try {
    install(value);
    const hooks = JSON.parse(fs.readFileSync(
      path.join(value.pluginRoot, 'hooks', 'hooks.json'),
      'utf8',
    ));
    assert.deepEqual(Object.keys(hooks.hooks).sort(), [
      'PreCompact', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop',
    ].sort());
    assert.doesNotMatch(JSON.stringify(hooks), /workflow_context|workflow_resume/);
    const adapter = path.join(value.pluginRoot, 'hooks', 'adapters', 'grok.py');
    const result = spawnSync('python3', [adapter, 'pre_stop_check.py'], {
      cwd: value.configDir,
      input: JSON.stringify({
        hookEventName: 'Stop',
        reason: 'end_turn',
        cwd: value.configDir,
      }),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  } finally {
    cleanup(value);
  }
});

test('Grok reinstall is deterministic and uninstall is ownership-scoped', () => {
  const value = fixture();
  try {
    install(value);
    const first = fs.readFileSync(path.join(value.pluginRoot, 'plugin.json'));
    install(value);
    assert.deepEqual(fs.readFileSync(path.join(value.pluginRoot, 'plugin.json')), first);
    grok.uninstall({ configDir: value.configDir });
    assert.equal(fs.existsSync(value.pluginRoot), false);
    assert.equal(fs.existsSync(value.configDir), true);
  } finally {
    cleanup(value);
  }
});
