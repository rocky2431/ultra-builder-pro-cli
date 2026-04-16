'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const Database = require('better-sqlite3');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'ultra-tools', 'cli.cjs');
const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-db-ops-'));
}

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, 'db', ...args], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '{}';
  return { code: r.status, envelope: JSON.parse(last), stderr: r.stderr };
}

test('db checkpoint runs PRAGMA wal_checkpoint(TRUNCATE) and reports counters', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'state.db');
  try {
    closeStateDb(initStateDb(dbPath).db);
    const { code, envelope } = runCli(['checkpoint', '--path', dbPath]);
    assert.equal(code, 0);
    assert.equal(envelope.ok, true);
    assert.equal(typeof envelope.data.busy, 'number');
    assert.equal(typeof envelope.data.checkpointed, 'number');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db vacuum reports reclaimed bytes after deleting rows', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'state.db');
  try {
    const init = initStateDb(dbPath);
    for (let i = 0; i < 50; i++) {
      ops.appendEvent(init.db, { type: 'task_created', task_id: `t-${i}` });
    }
    init.db.prepare('DELETE FROM events').run();
    closeStateDb(init.db);

    const { code, envelope } = runCli(['vacuum', '--path', dbPath]);
    assert.equal(code, 0);
    assert.equal(envelope.ok, true);
    assert.ok(envelope.data.bytes_after <= envelope.data.bytes_before);
    assert.equal(typeof envelope.data.reclaimed_bytes, 'number');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db integrity returns ok on a healthy database', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'state.db');
  try {
    closeStateDb(initStateDb(dbPath).db);
    const { code, envelope } = runCli(['integrity', '--path', dbPath]);
    assert.equal(code, 0);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.integrity_ok, true);
    assert.deepEqual(envelope.data.messages, ['ok']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db backup writes a file that opens independently with the same schema', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'state.db');
  const backupPath = path.join(dir, 'snap.db');
  try {
    const init = initStateDb(dbPath);
    ops.createTask(init.db, { id: 'b-1', title: 'backup', type: 'feature', priority: 'P1' });
    closeStateDb(init.db);

    const { code, envelope } = runCli(['backup', '--path', dbPath, '--to', backupPath]);
    assert.equal(code, 0);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.target, path.resolve(backupPath));
    assert.ok(envelope.data.size_bytes > 0);

    // Independently open the backup with a fresh connection
    const snap = new Database(backupPath);
    const v = snap.prepare("SELECT version FROM schema_version").get();
    assert.equal(v.version, '4.5');
    const t = snap.prepare("SELECT id FROM tasks WHERE id = 'b-1'").get();
    assert.equal(t.id, 'b-1');
    snap.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db <verb> on a missing database returns DB_NOT_FOUND with exit 2', () => {
  const dir = tmpDir();
  try {
    const missing = path.join(dir, 'missing.db');
    const { code, envelope } = runCli(['integrity', '--path', missing]);
    assert.equal(code, 2);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'DB_NOT_FOUND');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
