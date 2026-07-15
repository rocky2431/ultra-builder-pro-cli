'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const legacy = require('./commands/legacy-memory.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-legacy-memory-'));
  const ultra = path.join(root, '.ultra');
  fs.mkdirSync(path.join(ultra, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(ultra, 'memory', 'memory.db'), 'legacy-hook-store');
  const db = new Database(path.join(ultra, 'state.db'));
  db.exec(`
    CREATE TABLE memory_entries (
      id INTEGER PRIMARY KEY, kind TEXT, content TEXT, task_id TEXT,
      session_id TEXT, tag TEXT, source TEXT, ts TEXT
    );
    INSERT INTO memory_entries
      (kind, content, task_id, session_id, tag, source, ts)
    VALUES ('decision', 'legacy decision', 't1', 's1', 'arch', 'test', '2026-01-01T00:00:00Z');
  `);
  db.close();
  return root;
}

test('inspect reports both legacy stores without mutating them', () => {
  const root = fixture();
  try {
    const result = legacy.inspectLegacy(root);
    assert.equal(result.hook_memory_dir, true);
    assert.equal(result.state_memory_table, true);
    assert.equal(result.state_memory_entries, 1);
    assert.ok(fs.existsSync(path.join(root, '.ultra', 'memory', 'memory.db')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('archive exports legacy state rows and copies hook memory without deletion', () => {
  const root = fixture();
  try {
    const result = legacy.archiveLegacy(root, { timestamp: '2026-07-15T00-00-00-000Z' });
    assert.equal(result.archived, true);
    assert.ok(fs.existsSync(path.join(result.archive_dir, 'hook-memory', 'memory.db')));
    const exported = JSON.parse(fs.readFileSync(path.join(result.archive_dir, 'state-memory-entries.json'), 'utf8'));
    assert.equal(exported.entries.length, 1);
    assert.equal(exported.entries[0].content, 'legacy decision');
    assert.ok(fs.existsSync(path.join(root, '.ultra', 'memory', 'memory.db')));
    const db = new Database(path.join(root, '.ultra', 'state.db'), { readonly: true });
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'memory_entries'").get());
    db.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prune requires an exact confirmation and archives before deleting', () => {
  const root = fixture();
  try {
    assert.throws(() => legacy.pruneLegacy(root, { confirm: 'yes' }), /DELETE_ULTRA_LEGACY_MEMORY/);
    assert.ok(fs.existsSync(path.join(root, '.ultra', 'memory', 'memory.db')));

    const result = legacy.pruneLegacy(root, {
      confirm: 'DELETE_ULTRA_LEGACY_MEMORY',
      timestamp: '2026-07-15T00-00-01-000Z',
    });
    assert.equal(result.pruned, true);
    assert.ok(fs.existsSync(result.archive_dir));
    assert.ok(!fs.existsSync(path.join(root, '.ultra', 'memory')));
    const db = new Database(path.join(root, '.ultra', 'state.db'), { readonly: true });
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'memory_entries'").get(), undefined);
    db.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
