'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const kimi = require('../../../adapters/kimi.js');
const { REPO_ROOT, mkTarget, cleanup, readToolPayload } = require('../_lib.cjs');

test('kimi smoke — native plugin registration launches the bundled MCP from project cwd', { timeout: 30000 }, async () => {
  const home = mkTarget('kimi-smoke-home');
  const project = mkTarget('kimi-smoke-project');
  try {
    const report = kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    const manifest = JSON.parse(fs.readFileSync(path.join(report.target, 'kimi.plugin.json'), 'utf8'));
    const entry = manifest.mcpServers['ultra-builder-pro'];
    // Kimi forces plugin MCP cwd to the managed plugin root. Node preserves
    // the host's original PWD, so the Kimi launcher must recover the active
    // project from that environment boundary before opening state.db.
    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args,
      cwd: report.target,
      env: {
        ...process.env,
        KIMI_CODE_HOME: home,
        KIMI_PLUGIN_ROOT: report.target,
        PWD: project,
      },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'kimi-smoke', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
      const listed = await client.callTool({ name: 'task.list', arguments: {} });
      assert.deepEqual(readToolPayload(listed).tasks, []);
      assert.ok(fs.existsSync(path.join(project, '.ultra', '.runtime', 'state.db')));
      assert.equal(
        fs.existsSync(path.join(report.target, '.ultra', '.runtime', 'state.db')),
        false,
      );
    } finally {
      await client.close();
    }
  } finally {
    cleanup(home);
    cleanup(project);
  }
});

test('kimi smoke — user config and unrelated plugin registration survive round-trip', () => {
  const home = mkTarget('kimi-smoke-preserve');
  const configFile = path.join(home, 'config.toml');
  const registryFile = path.join(home, 'plugins', 'installed.json');
  const config = '[[hooks]]\nevent = "Stop"\ncommand = "/user/orca-hook.sh"\n';
  try {
    fs.writeFileSync(configFile, config);
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, JSON.stringify({
      version: 1,
      plugins: [{
        id: 'mine', root: '/tmp/mine', source: 'local-path', enabled: true,
        installedAt: '2026-01-01T00:00:00.000Z', originalSource: '/tmp/mine',
      }],
    }, null, 2));

    kimi.install({ configDir: home, repoRoot: REPO_ROOT });
    kimi.uninstall({ configDir: home });

    assert.equal(fs.readFileSync(configFile, 'utf8'), config);
    assert.deepEqual(JSON.parse(fs.readFileSync(registryFile, 'utf8')).plugins.map((p) => p.id), ['mine']);
  } finally { cleanup(home); }
});
