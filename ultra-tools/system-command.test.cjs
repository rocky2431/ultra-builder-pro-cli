'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../mcp-server/lib/state-db.cjs');

const CLI = path.join(__dirname, 'cli.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-system-cli-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  closeStateDb(db);
  return rootDir;
}

function invoke(rootDir, args) {
  return spawnSync(process.execPath, [CLI, 'system', ...args], {
    cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('system doctor provides a read-only JSON health envelope', () => {
  const rootDir = fixture();
  try {
    const result = invoke(rootDir, ['doctor']);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.status, 'healthy');
    assert.equal(envelope.data.repair_performed, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('system doctor --repair creates a backup before recovery', () => {
  const rootDir = fixture();
  try {
    const result = invoke(rootDir, ['doctor', '--repair']);
    assert.equal(result.status, 0, result.stderr);
    const envelope = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.repair_performed, true);
    assert.ok(fs.existsSync(envelope.data.backup_path));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
