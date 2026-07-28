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
const { EXPECTED_VERSION, initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const dbCommand = require('../../ultra-tools/commands/db.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-db-ops-'));
}

function runCli(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, 'db', ...args], { encoding: 'utf8', cwd });
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '{}';
  return { code: r.status, envelope: JSON.parse(last), stderr: r.stderr };
}

test('db checkpoint runs PRAGMA wal_checkpoint(TRUNCATE) and reports counters', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  try {
    closeStateDb(initStateDb(dbPath).db);
    const { code, envelope } = runCli(['checkpoint', '--path', dbPath], dir);
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
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  try {
    const init = initStateDb(dbPath);
    for (let i = 0; i < 50; i++) {
      ops.appendEvent(init.db, {
        type: 'task_created',
        task_id: `t-${i}`,
        payload: { padding: 'x'.repeat(16 * 1024) },
      });
    }
    init.db.prepare('DELETE FROM events').run();
    closeStateDb(init.db);

    const { code, envelope } = runCli(['vacuum', '--path', dbPath], dir);
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
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  try {
    closeStateDb(initStateDb(dbPath).db);
    const { code, envelope } = runCli(['integrity', '--path', dbPath], dir);
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
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  const backupPath = path.join(dir, '.ultra', '.runtime', 'backups', 'snap.db');
  try {
    const init = initStateDb(dbPath);
    ops.createTask(init.db, { id: 'b-1', title: 'backup', type: 'feature', priority: 'P1' });
    closeStateDb(init.db);

    const { code, envelope } = runCli(
      ['backup', '--path', dbPath, '--to', backupPath],
      dir,
    );
    assert.equal(code, 0);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.target, path.resolve(backupPath));
    assert.ok(envelope.data.size_bytes > 0);

    // Independently open the backup with a fresh connection
    const snap = new Database(backupPath);
    const v = snap.prepare('SELECT version FROM schema_version WHERE version = ?').get(EXPECTED_VERSION);
    assert.equal(v.version, EXPECTED_VERSION);
    const t = snap.prepare("SELECT id FROM tasks WHERE id = 'b-1'").get();
    assert.equal(t.id, 'b-1');
    snap.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db backup includes a commit in the former checkpoint-to-copy race window', () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  const backupPath = path.join(dir, '.ultra', '.runtime', 'backups', 'concurrent.db');
  let primary;
  try {
    primary = initStateDb(dbPath).db;
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    const size = dbCommand._internal.createOnlineBackup(primary, backupPath, {
      beforeSnapshot() {
        const writer = new Database(dbPath);
        try {
          writer.pragma('journal_mode = WAL');
          writer.prepare(
            "INSERT INTO events(type, payload_json) VALUES ('committed-before-snapshot', '{\"committed\":true}')",
          ).run();
        } finally {
          writer.close();
        }
      },
    });
    assert.ok(size > 0);
    const snapshot = new Database(backupPath, { readonly: true });
    try {
      assert.equal(
        snapshot.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'committed-before-snapshot'",
        ).get().count,
        1,
      );
      assert.deepEqual(snapshot.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    } finally {
      snapshot.close();
    }
  } finally {
    closeStateDb(primary);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('db <verb> on a missing database returns DB_NOT_FOUND with exit 2', () => {
  const dir = tmpDir();
  try {
    const missing = path.join(dir, '.ultra', '.runtime', 'state.db');
    const { code, envelope } = runCli(['integrity', '--path', missing], dir);
    assert.equal(code, 2);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'DB_NOT_FOUND');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
