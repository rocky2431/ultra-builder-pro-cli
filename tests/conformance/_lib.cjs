'use strict';

// Shared conformance helpers. v0.1 smoke flows reuse these so each
// runtime's test file stays focused on the runtime-specific assertions.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO_ROOT, 'mcp-server', 'server.cjs');

function mkTarget(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ubp-conf-${prefix}-`));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

async function withMcpClient({ dbPath, rootDir }, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, UBP_DB_PATH: dbPath, UBP_ROOT_DIR: rootDir },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'conformance', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try { await fn(client); }
  finally { await client.close(); }
}

function readToolPayload(result) {
  if (result.structuredContent) return result.structuredContent;
  return JSON.parse(result.content[0].text);
}

module.exports = {
  REPO_ROOT,
  SERVER,
  mkTarget,
  cleanup,
  withMcpClient,
  readToolPayload,
};
