'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const claude = require('../../../adapters/claude.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');

test('claude native plugin — install, MCP round-trip, and scoped uninstall', async () => {
  const target = mkTarget('claude');
  const pluginRoot = path.join(target, 'skills', 'ultra-builder-pro');
  const serverHome = mkTarget('claude-server');
  const initTarget = mkTarget('claude-init');
  try {
    fs.rmSync(initTarget, { recursive: true, force: true });
    const report = claude.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(report.copied.commands.includes('ultra-init.md'));
    assert.ok(fs.existsSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json')));

    const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'))
      .mcpServers[claude.MCP_SERVER_NAME];
    assert.equal(mcp.command, process.execPath);
    assert.equal(mcp.args[0], path.join(pluginRoot, 'runtime', 'launch.cjs'));

    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const initialized = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'claude-smoke' },
      });
      assert.equal(readToolPayload(initialized).status, 'created');
      const created = await client.callTool({
        name: 'task.create',
        arguments: { id: 'c-1', title: 'walking skeleton', type: 'architecture', priority: 'P0' },
      });
      assert.equal(readToolPayload(created).id, 'c-1');
    });

    claude.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(pluginRoot));
    assert.ok(fs.existsSync(target));
  } finally {
    cleanup(target);
    cleanup(serverHome);
    cleanup(initTarget);
  }
});

test('claude native plugin — reinstall is deterministic and user settings are untouched', () => {
  const target = mkTarget('claude-preserve');
  const settingsFile = path.join(target, 'settings.json');
  const manifestFile = path.join(target, 'skills', 'ultra-builder-pro', '.claude-plugin', 'plugin.json');
  try {
    const userSettings = '{"enabledPlugins":{"claude-mem@thedotmack":true}}\n';
    fs.writeFileSync(settingsFile, userSettings);
    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    const first = fs.readFileSync(manifestFile);
    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.deepEqual(fs.readFileSync(manifestFile), first);
    assert.equal(fs.readFileSync(settingsFile, 'utf8'), userSettings);
  } finally {
    cleanup(target);
  }
});
