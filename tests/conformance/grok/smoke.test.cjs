'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const grok = require('../../../adapters/grok.js');
const { REPO_ROOT, mkTarget, cleanup, readToolPayload } = require('../_lib.cjs');

test('grok smoke — installed native plugin launches the seven-tool MCP', async () => {
  const configDir = mkTarget('grok-smoke-home');
  const project = mkTarget('grok-smoke-project');
  let client;
  try {
    const report = grok.install({
      configDir,
      repoRoot: REPO_ROOT,
      grokBin: path.join(configDir, 'missing-grok'),
    });
    const entry = JSON.parse(fs.readFileSync(
      path.join(report.target, '.mcp.json'),
      'utf8',
    )).mcpServers['ultra-builder-pro'];
    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args,
      cwd: project,
      stderr: 'pipe',
    });
    client = new Client({ name: 'grok-smoke', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
      'ultra.archive',
      'ultra.checkpoint',
      'ultra.context',
      'ultra.doctor',
      'ultra.record',
      'ultra.session',
      'ultra.sync',
    ]);
    const initialized = await client.callTool({
      name: 'ultra.record',
      arguments: {
        entries: [{
          kind: 'baseline',
          action: 'initialize',
          data: {
            target_dir: project,
            project_name: 'grok-smoke',
            mode: 'greenfield',
            git_mode: 'initialize',
          },
          idempotency_key: 'grok-smoke-init',
        }],
      },
    });
    assert.equal(readToolPayload(initialized).accepted, true);
    assert.ok(fs.existsSync(path.join(project, '.ultra', '.runtime', 'state.db')));
  } finally {
    if (client) await client.close();
    cleanup(configDir);
    cleanup(project);
  }
});
