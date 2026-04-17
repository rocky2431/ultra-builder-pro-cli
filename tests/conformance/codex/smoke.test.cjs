'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const codex = require('../../../adapters/codex.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');

// Flow 1: install → managed config.toml block present → MCP server responds → uninstall.
test('codex v0.1 smoke — install + config.toml block + mcp round-trip + uninstall', async () => {
  const target = mkTarget('codex');
  const freshProject = mkTarget('codex-proj');
  try {
    const r = codex.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.prompts.includes('ultra-init.md'));

    const toml = fs.readFileSync(path.join(target, 'config.toml'), 'utf8');
    assert.match(toml, new RegExp(`\\[mcp_servers\\.${codex.MCP_SERVER_NAME}\\]`));
    assert.match(toml, /ultra-builder-pro managed block/);

    // Round-trip — the command + args extracted from the adapter would
    // be the ones codex reads out of config.toml.
    const serverHome = mkTarget('codex-server');
    const initTarget = mkTarget('codex-init');
    fs.rmSync(initTarget, { recursive: true, force: true });
    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const init = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'codex-smoke' },
      });
      assert.equal(readToolPayload(init).status, 'created');
    });
    cleanup(initTarget);

    codex.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(path.join(target, 'prompts')));
  } finally {
    cleanup(target); cleanup(freshProject);
  }
});

// Flow 2: user-authored TOML sections survive install + uninstall idempotency.
test('codex v0.1 smoke — user toml content preserved; install is idempotent', () => {
  const target = mkTarget('codex2');
  const configFile = path.join(target, 'config.toml');
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(configFile, '[profile]\nname = "dev"\n[mcp_servers.mine]\ncommand = "node"\n');

    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const firstLen = fs.readFileSync(configFile, 'utf8').length;

    codex.install({ configDir: target, repoRoot: REPO_ROOT });
    const secondLen = fs.readFileSync(configFile, 'utf8').length;
    assert.equal(firstLen, secondLen);

    codex.uninstall({ configDir: target });
    const after = fs.readFileSync(configFile, 'utf8');
    assert.match(after, /name = "dev"/);
    assert.match(after, /\[mcp_servers\.mine\]/);
    assert.ok(!after.includes('[mcp_servers.' + codex.MCP_SERVER_NAME + ']'));
  } finally {
    cleanup(target);
  }
});
