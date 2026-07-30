'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const claude = require('../../../adapters/claude.js');
const { initStateDb, closeStateDb } = require('../../../mcp-server/lib/state-db.cjs');
const { seedReadyBaseline } = require('../../../mcp-server/test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../../../mcp-server/test-support/change-contract.cjs');
const {
  REPO_ROOT, mkTarget, cleanup, withMcpClient, readToolPayload, initializeProject,
} = require('../_lib.cjs');

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
    assert.equal(mcp.command, process.platform === 'win32' ? 'node.exe' : '/usr/bin/env');
    assert.deepEqual(
      mcp.args,
      process.platform === 'win32'
        ? [path.join(pluginRoot, 'runtime', 'launch.cjs')]
        : ['node', path.join(pluginRoot, 'runtime', 'launch.cjs')],
    );

    const statePath = path.join(serverHome, '.ultra', '.runtime', 'state.db');
    const initializedState = initStateDb(statePath);
    seedReadyBaseline(initializedState.db, {
      rootDir: serverHome, id: 'test-baseline', projectName: 'claude-smoke',
    });
    closeStateDb(initializedState.db);

    await withMcpClient({ dbPath: statePath, rootDir: serverHome }, async (client) => {
      assert.equal((await initializeProject(client, initTarget, 'claude-smoke')).status, 'created');
      const recorded = await client.callTool({
        name: 'ultra.record',
        arguments: { entries: [
          {
            kind: 'change_contract',
            action: 'open',
            data: completeChangeInput({
              id: 'claude-smoke-change', title: 'Exercise Claude runtime', kind: 'quick',
              intent: 'Verify the native plugin state round trip.',
              docs_impact: { status: 'none', files: [], rationale: 'Runtime smoke fixture.' },
            }),
            idempotency_key: 'claude-smoke-change',
          },
          {
            kind: 'task_contract',
            action: 'define',
            data: {
              id: 'c-1', title: 'walking skeleton', type: 'architecture', priority: 'P0',
              change_id: 'claude-smoke-change',
            },
            idempotency_key: 'claude-smoke-task',
          },
        ] },
      });
      const payload = readToolPayload(recorded);
      assert.equal(payload.results[0].result.change.id, 'claude-smoke-change');
      assert.equal(payload.results[1].result.task.id, 'c-1');
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
