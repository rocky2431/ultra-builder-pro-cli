'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker, isMainThread, workerData, parentPort } = require('node:worker_threads');

const { initStateDb, openStateDb, closeStateDb } = require('../lib/state-db.cjs');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-conc-'));
  return { dir, file: path.join(dir, 'state.db') };
}

function appendEventRaw(db, type, payload) {
  const stmt = db.prepare(
    `INSERT INTO events (type, runtime, payload_json) VALUES (?, ?, ?)`,
  );
  return stmt.run(type, 'claude', JSON.stringify(payload)).lastInsertRowid;
}

function withRetry(fn, attempts = 3, baseMs = 25) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      if (!String(err.code || err.message).includes('SQLITE_BUSY')) throw err;
      lastErr = err;
      const wait = baseMs * Math.pow(2, i);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    }
  }
  throw lastErr;
}

if (!isMainThread) {
  const { dbPath, role, count, baseId } = workerData;
  const db = openStateDb(dbPath);
  const written = [];
  for (let i = 0; i < count; i++) {
    const id = withRetry(() =>
      appendEventRaw(db, 'task_created', { role, baseId, i }),
    );
    written.push(Number(id));
  }
  closeStateDb(db);
  parentPort.postMessage({ role, written });
} else {
  test('three concurrent writers append to events with no loss and monotonic id', async () => {
    const { dir, file } = tmpDb();
    try {
      const init = initStateDb(file);
      closeStateDb(init.db);

      const roles = ['mcp', 'cli', 'daemon'];
      const COUNT_PER_WORKER = 100;
      const expected = roles.length * COUNT_PER_WORKER;

      const results = await Promise.all(
        roles.map(
          (role, idx) =>
            new Promise((resolve, reject) => {
              const w = new Worker(__filename, {
                workerData: {
                  dbPath: file,
                  role,
                  count: COUNT_PER_WORKER,
                  baseId: idx * COUNT_PER_WORKER,
                },
              });
              w.on('message', (m) => resolve(m));
              w.on('error', reject);
              w.on('exit', (code) => {
                if (code !== 0) reject(new Error(`worker ${role} exit ${code}`));
              });
            }),
        ),
      );

      const verify = openStateDb(file);
      const total = verify.prepare('SELECT COUNT(*) AS n FROM events').get().n;
      assert.equal(total, expected, 'total event count must match');

      const ids = verify.prepare('SELECT id FROM events ORDER BY id ASC').all().map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, 'event ids must be unique');
      for (let i = 1; i < ids.length; i++) {
        assert.ok(ids[i] > ids[i - 1], 'event ids must be strictly monotonic');
      }
      const minId = ids[0];
      const maxId = ids[ids.length - 1];
      assert.ok(maxId - minId + 1 >= ids.length, 'sequence must not have collisions');

      const perRole = verify
        .prepare("SELECT json_extract(payload_json, '$.role') AS role, COUNT(*) AS n FROM events GROUP BY role")
        .all();
      for (const row of perRole) {
        assert.equal(row.n, COUNT_PER_WORKER, `role ${row.role} count`);
      }
      closeStateDb(verify);

      // Workers should each have observed their own row ids returned cleanly.
      const collected = results.flatMap((r) => r.written);
      assert.equal(collected.length, expected);
      assert.equal(new Set(collected).size, expected, 'no duplicate ids reported by workers');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
