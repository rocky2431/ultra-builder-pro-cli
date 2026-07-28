'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../mcp-server/lib/state-db.cjs');
const ops = require('../mcp-server/lib/state-ops.cjs');

const CLI = path.join(__dirname, '..', 'ultra-tools', 'cli.cjs');

function run(rootDir, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return {
    code: result.status,
    envelope: JSON.parse(lines.at(-1) || '{}'),
    stderr: result.stderr,
  };
}

function project() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-cli-authority-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const initialized = initStateDb(dbPath);
  closeStateDb(initialized.db);
  return { rootDir, dbPath };
}

test('db --path and session --db reject unrelated external authorities', () => {
  const { rootDir, dbPath } = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-cli-external-'));
  try {
    const externalDb = path.join(outside, 'state.db');
    let initialized = initStateDb(externalDb);
    ops.createTask(initialized.db, {
      id: 'external-task', title: 'external', type: 'feature', priority: 'P1',
    });
    ops.createSession(initialized.db, {
      sid: 'external-session',
      task_id: 'external-task',
      runtime: 'codex',
      worktree_path: path.join(outside, 'worktree'),
      artifact_dir: path.join(outside, 'artifacts'),
    });
    closeStateDb(initialized.db);

    const integrity = run(rootDir, ['db', 'integrity', '--path', externalDb]);
    assert.equal(integrity.code, 2);
    assert.match(integrity.envelope.error.message, /authority|canonical|project/i);

    const heartbeat = run(rootDir, [
      'session', 'heartbeat', '--sid', 'external-session', '--db', externalDb,
    ]);
    assert.notEqual(heartbeat.code, 0);
    assert.match(heartbeat.envelope.error.message, /authority|canonical|project/i);
    assert.equal(fs.existsSync(dbPath), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('db backup target must remain inside the canonical managed backup directory', () => {
  const { rootDir, dbPath } = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-cli-backup-outside-'));
  try {
    const externalTarget = path.join(outside, 'copy.db');
    const external = run(rootDir, [
      'db', 'backup', '--path', dbPath, '--to', externalTarget,
    ]);
    assert.equal(external.code, 2);
    assert.match(external.envelope.error.message, /backup|managed|runtime|authority/i);
    assert.equal(fs.existsSync(externalTarget), false);

    const backups = path.join(rootDir, '.ultra', '.runtime', 'backups');
    fs.mkdirSync(path.dirname(backups), { recursive: true });
    fs.symlinkSync(outside, backups, 'dir');
    const escaped = run(rootDir, [
      'db', 'backup', '--to', path.join(backups, 'escaped.db'),
    ]);
    assert.equal(escaped.code, 2);
    assert.equal(fs.existsSync(path.join(outside, 'escaped.db')), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
