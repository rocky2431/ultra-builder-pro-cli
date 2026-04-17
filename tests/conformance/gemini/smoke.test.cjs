'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gemini = require('../../../adapters/gemini.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');

// Flow 1: install packs into extensions/ultra-builder-pro → manifest valid →
// MCP server responds → uninstall removes the extension dir cleanly.
test('gemini v0.1 smoke — extension packaging + manifest + mcp round-trip + uninstall', async () => {
  const target = mkTarget('gemini');
  const freshProject = mkTarget('gemini-proj');
  try {
    const r = gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    const extRoot = r.target;
    assert.ok(fs.existsSync(path.join(extRoot, 'gemini-extension.json')));
    assert.ok(fs.existsSync(path.join(extRoot, 'GEMINI.md')));
    assert.ok(r.copied.commands.includes('ultra-init.toml'));

    const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'gemini-extension.json'), 'utf8'));
    assert.equal(manifest.name, gemini.EXTENSION_NAME);
    assert.equal(manifest._source, gemini.SOURCE_TAG);
    assert.ok(manifest.mcpServers[gemini.MCP_SERVER_NAME]);

    const serverHome = mkTarget('gemini-server');
    const initTarget = mkTarget('gemini-init');
    fs.rmSync(initTarget, { recursive: true, force: true });
    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const init = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'gemini-smoke' },
      });
      assert.equal(readToolPayload(init).status, 'created');
    });
    cleanup(initTarget);

    gemini.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(extRoot));
  } finally {
    cleanup(target); cleanup(freshProject);
  }
});

// Flow 2: converted commands/*.toml have Gemini-friendly shape; SKILL.md shipped alongside.
test('gemini v0.1 smoke — commands.toml shape + skills copied verbatim', () => {
  const target = mkTarget('gemini2');
  try {
    gemini.install({ configDir: target, repoRoot: REPO_ROOT });
    const extRoot = gemini.resolveExtensionRoot({ configDir: target });

    const toml = fs.readFileSync(path.join(extRoot, 'commands', 'ultra-init.toml'), 'utf8');
    assert.match(toml, /^description = "/m);
    assert.match(toml, /^prompt = """/m);
    assert.match(toml, /workflow reference: @skills\/ultra-init\/SKILL\.md/);

    const skillText = fs.readFileSync(path.join(extRoot, 'skills', 'ultra-init', 'SKILL.md'), 'utf8');
    assert.ok(skillText.includes('ultra-init — Phase 3.1'));
  } finally {
    cleanup(target);
  }
});
