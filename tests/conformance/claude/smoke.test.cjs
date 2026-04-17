'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const claude = require('../../../adapters/claude.js');
const { REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload } = require('../_lib.cjs');

// Flow 1: install adapter → MCP server up → task.init_project → task.create →
// read projected tasks.json → uninstall. End-to-end for the Claude runtime.
test('claude v0.1 smoke — install → task round-trip → projector verified → uninstall', async () => {
  const target = mkTarget('claude');
  const freshProject = mkTarget('claude-proj');
  try {
    // 1. adapter install
    const r = claude.install({ configDir: target, repoRoot: REPO_ROOT });
    assert.ok(r.copied.commands.includes('ultra-init.md'));
    assert.ok(r.copied.skills.some((p) => p.includes('ultra-init/SKILL.md')));

    // 2. read settings.json, confirm our MCP server wiring
    const settings = JSON.parse(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'));
    const mcp = settings.mcpServers[claude.MCP_SERVER_NAME];
    assert.ok(mcp);
    assert.equal(mcp.command, process.execPath);

    // 3. start MCP server + round-trip. init_project target is a second
    // clean directory; task.create writes to the server's state.db and the
    // projector lands tasks.json under serverHome.
    const serverHome = mkTarget('claude-server');
    const initTarget = mkTarget('claude-init');
    // mkTarget returns existing empty dirs; remove initTarget so init_project
    // can claim a virgin path without ULTRA_DIR_EXISTS.
    fs.rmSync(initTarget, { recursive: true, force: true });
    await withMcpClient({ dbPath: path.join(serverHome, 'state.db'), rootDir: serverHome }, async (client) => {
      const init = await client.callTool({
        name: 'task.init_project',
        arguments: { target_dir: initTarget, project_name: 'claude-smoke' },
      });
      const initPayload = readToolPayload(init);
      assert.equal(initPayload.status, 'created');
      assert.ok(fs.existsSync(path.join(initTarget, '.ultra', 'tasks', 'tasks.json')));

      const created = await client.callTool({
        name: 'task.create',
        arguments: { id: 'c-1', title: 'walking skeleton', type: 'architecture', priority: 'P0' },
      });
      const createdPayload = readToolPayload(created);
      assert.equal(createdPayload.id, 'c-1');

      // Projector writes to UBP_ROOT_DIR (serverHome), not initTarget
      const tasksJson = JSON.parse(fs.readFileSync(path.join(serverHome, '.ultra', 'tasks', 'tasks.json'), 'utf8'));
      assert.equal(tasksJson.tasks[0].id, 'c-1');
    });
    cleanup(initTarget);

    // 4. uninstall cleans up
    claude.uninstall({ configDir: target });
    assert.ok(!fs.existsSync(path.join(target, 'commands')));
    assert.ok(!fs.existsSync(path.join(target, 'skills')));
  } finally {
    cleanup(target); cleanup(freshProject);
  }
});

// Flow 2: install idempotency + settings merge preserves user data.
test('claude v0.1 smoke — idempotent install + user data preserved under sentinel', () => {
  const target = mkTarget('claude2');
  try {
    fs.writeFileSync(path.join(target, 'settings.json'), JSON.stringify({
      user_prop: 'keep-me',
      hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'user-hook.sh', timeout: 5 }] }] },
    }, null, 2));

    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    const first = fs.readFileSync(path.join(target, 'settings.json'), 'utf8');

    claude.install({ configDir: target, repoRoot: REPO_ROOT });
    const second = fs.readFileSync(path.join(target, 'settings.json'), 'utf8');

    const stripTs = (s) => s.replace(/"__generated_at": "[^"]+"/g, '"__generated_at": "<t>"');
    assert.equal(stripTs(second), stripTs(first));

    const merged = JSON.parse(second);
    assert.equal(merged.user_prop, 'keep-me');
    const userHookSurvives = merged.hooks.PostToolUse.some((m) =>
      m.hooks.some((h) => h.command === 'user-hook.sh'),
    );
    assert.ok(userHookSurvives);
  } finally {
    cleanup(target);
  }
});
