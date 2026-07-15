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
    cacheRoot: path.join(homeDir, '.codex', 'plugins', 'cache', 'personal', 'ultra-builder-pro'),
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

function writeFakeCodexCli(layout, { fail = false } = {}) {
  const executable = path.join(layout.homeDir, `fake-codex-${fail ? 'fail' : 'ok'}.cjs`);
  fs.writeFileSync(executable, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pluginRoot = ${JSON.stringify(layout.pluginRoot)};
const cacheRoot = ${JSON.stringify(layout.cacheRoot)};
fs.rmSync(cacheRoot, { recursive: true, force: true });
if (${JSON.stringify(fail)}) {
  process.stderr.write('simulated plugin add failure');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
const target = path.join(cacheRoot, manifest.version);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(pluginRoot, target, { recursive: true });
process.stdout.write(JSON.stringify({ installed: true, version: manifest.version }));
`);
  fs.chmodSync(executable, 0o755);
  return executable;
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

test('codex smoke — live hook cache paths survive a successful plugin refresh', () => {
  const layout = mkLayout('codex-hook-cache-success');
  const oldAdapter = path.join(
    layout.cacheRoot,
    '0.3.0+codex.previous',
    'hooks',
    'adapters',
    'codex.py',
  );
  try {
    fs.mkdirSync(path.dirname(oldAdapter), { recursive: true });
    fs.writeFileSync(oldAdapter, '# previous adapter\n');

    const report = codex.install({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      repoRoot: REPO_ROOT,
      runPluginCli: true,
      codexBin: writeFakeCodexCli(layout),
    });
    const currentAdapter = path.join(
      layout.cacheRoot,
      report.plugin.version,
      'hooks',
      'adapters',
      'codex.py',
    );

    assert.ok(fs.existsSync(currentAdapter));
    assert.ok(fs.existsSync(oldAdapter));
    assert.match(fs.readFileSync(oldAdapter, 'utf8'), /runpy\.run_path/);
    assert.deepEqual(report.hookCompatibility, {
      target: currentAdapter,
      restored: [oldAdapter],
    });
  } finally { cleanup(layout.homeDir); }
});

test('codex smoke — failed plugin refresh restores live hook cache paths', () => {
  const layout = mkLayout('codex-hook-cache-failure');
  const oldAdapter = path.join(
    layout.cacheRoot,
    '0.3.0+codex.previous',
    'hooks',
    'adapters',
    'codex.py',
  );
  try {
    fs.mkdirSync(path.dirname(oldAdapter), { recursive: true });
    fs.writeFileSync(oldAdapter, '# previous adapter\n');

    assert.throws(() => codex.install({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      repoRoot: REPO_ROOT,
      runPluginCli: true,
      codexBin: writeFakeCodexCli(layout, { fail: true }),
    }), /simulated plugin add failure/);

    const sourceAdapter = path.join(layout.pluginRoot, 'hooks', 'adapters', 'codex.py');
    assert.ok(fs.existsSync(sourceAdapter));
    assert.ok(fs.existsSync(oldAdapter));
    assert.match(fs.readFileSync(oldAdapter, 'utf8'), /runpy\.run_path/);
  } finally { cleanup(layout.homeDir); }
});

test('codex smoke — corrupt runtime manifest fails closed before uninstall', () => {
  const layout = mkLayout('codex-corrupt-manifest');
  try {
    install(layout);
    const manifestFile = path.join(
      layout.configDir,
      'ultra-builder-pro',
      'install-manifest.json',
    );
    fs.writeFileSync(manifestFile, '{ invalid json\n');

    assert.throws(() => codex.uninstall({
      configDir: layout.configDir,
      homeDir: layout.homeDir,
      scope: 'global',
      runPluginCli: false,
    }), /invalid Codex runtime manifest/);
    assert.ok(fs.existsSync(layout.pluginRoot));
    assert.ok(fs.existsSync(path.join(layout.configDir, 'agents', 'review-code.toml')));
  } finally { cleanup(layout.homeDir); }
});

test('codex smoke — hook cache root rejects marketplace path traversal', () => {
  const layout = mkLayout('codex-cache-traversal');
  try {
    assert.throws(
      () => codex._internal.pluginCacheRoot(layout.configDir, '../../outside'),
      /invalid Codex marketplace name/,
    );
  } finally { cleanup(layout.homeDir); }
});
