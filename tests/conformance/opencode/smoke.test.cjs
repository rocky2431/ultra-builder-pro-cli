'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const opencode = require('../../../adapters/opencode.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');
const { parse: parseFm } = require('../../../adapters/_shared/frontmatter.cjs');

// Flow 1: install adapter → confirm opencode.json wiring → round-trip via the same MCP
// server the adapter would launch → uninstall. Skill frontmatter is lowercased on copy.
test('opencode v0.1 smoke — install + lowercased frontmatter + mcp round-trip + uninstall', async () => {
  const target = mkTarget('opencode');
  const freshProject = mkTarget('opencode-proj');
  try {
    const r = opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.commands.includes('ultra-init.md'));

    // opencode.json declares our mcp
    const config = JSON.parse(fs.readFileSync(path.join(target, 'opencode.json'), 'utf8'));
    const mcp = config.mcp[opencode.MCP_SERVER_NAME];
    assert.ok(mcp);
    assert.equal(mcp.command, process.execPath);
    // OpenCode reachable hook events documented in sentinel
    assert.deepEqual(config[opencode.SENTINEL_KEY].reachable_events, ['session.start', 'event']);

    // skill frontmatter is lowercased in-transit — pick one and verify keys
    const skillText = fs.readFileSync(path.join(target, 'skills', 'ultra-init', 'SKILL.md'), 'utf8');
    const { fm } = parseFm(skillText);
    for (const key of Object.keys(fm)) {
      assert.equal(key, key.toLowerCase(), `skill fm key ${key} should be lowercased`);
    }

    // Round-trip via the same MCP server the adapter would launch.
    const serverHome = mkTarget('opencode-server');
    const initTarget = mkTarget('opencode-init');
    fs.rmSync(initTarget, { recursive: true, force: true });
    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const init = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'opencode-smoke' },
      });
      assert.equal(readToolPayload(init).status, 'created');
    });
    cleanup(initTarget);

    opencode.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(path.join(target, 'commands')));
    assert.ok(!fs.existsSync(path.join(target, 'skills')));
  } finally {
    cleanup(target); cleanup(freshProject);
  }
});

// Flow 2: user-authored opencode.json is preserved; uninstall touches only our section.
test('opencode v0.1 smoke — user mcp entries survive install/uninstall', () => {
  const target = mkTarget('opencode2');
  const configFile = path.join(target, 'opencode.json');
  try {
    fs.writeFileSync(configFile, JSON.stringify({
      theme: 'dark',
      mcp: { my_server: { command: 'node', args: ['./mine.js'] } },
    }));
    opencode.install({ configDir: target, repoRoot: REPO_ROOT });
    opencode.uninstall({ configDir: target });

    const after = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(after.theme, 'dark');
    assert.ok(after.mcp.my_server);
    assert.ok(!after.mcp[opencode.MCP_SERVER_NAME]);
    assert.ok(!(opencode.SENTINEL_KEY in after));
  } finally {
    cleanup(target);
  }
});
