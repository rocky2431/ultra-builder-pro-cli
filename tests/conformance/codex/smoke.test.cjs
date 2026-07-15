'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codex = require('../../../adapters/codex.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');

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

test('codex smoke — plugin install + MCP round-trip + scoped uninstall', async () => {
  const layout = mkLayout('codex-smoke');
  const serverHome = mkTarget('codex-server');
  const initTarget = mkTarget('codex-init');
  try {
    fs.rmSync(initTarget, { recursive: true, force: true });
    const report = install(layout);
    assert.equal(report.plugin.skills.length, 25);
    assert.equal(report.agents.installed.length, 9);

    const mcp = JSON.parse(fs.readFileSync(path.join(layout.pluginRoot, '.mcp.json'), 'utf8'));
    assert.ok(mcp.mcpServers['ultra-builder-pro']);
    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const init = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'codex-smoke' },
      });
      assert.equal(readToolPayload(init).status, 'created');
    });

    codex.uninstall({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      runPluginCli: false,
    });
    assert.ok(!fs.existsSync(layout.pluginRoot));
    assert.ok(!fs.existsSync(path.join(layout.configDir, 'agents', 'review-code.toml')));
  } finally {
    cleanup(layout.homeDir);
    cleanup(serverHome);
    cleanup(initTarget);
  }
});

test('codex smoke — user config and unrelated marketplace entries survive install/uninstall', () => {
  const layout = mkLayout('codex-preserve');
  const configFile = path.join(layout.configDir, 'config.toml');
  try {
    fs.mkdirSync(layout.configDir, { recursive: true });
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n[mcp_servers.mine]\ncommand = "node"\n');
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
    codex.uninstall({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      runPluginCli: false,
    });

    assert.equal(fs.readFileSync(configFile, 'utf8'), '[profile]\nname = "dev"\n[mcp_servers.mine]\ncommand = "node"\n');
    const marketplace = JSON.parse(fs.readFileSync(layout.marketplaceFile, 'utf8'));
    assert.deepEqual(marketplace.plugins.map((entry) => entry.name), ['mine']);
  } finally { cleanup(layout.homeDir); }
});
