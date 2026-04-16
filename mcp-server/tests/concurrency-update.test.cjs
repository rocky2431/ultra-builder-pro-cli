'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker, isMainThread, workerData, parentPort } = require('node:worker_threads');

const { initStateDb, openStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');

const WORKER_COUNT = 20;
const TASKS_PER_WORKER = 50;

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-conc-up-'));
  return { dir, file: path.join(dir, 'state.db') };
}

if (!isMainThread) {
  const { dbPath, workerIdx, count } = workerData;
  const db = openStateDb(dbPath);
  const completed = [];
  for (let i = 0; i < count; i++) {
    const id = `w${workerIdx}-t${i}`;
    ops.updateTaskStatus(db, id, 'in_progress');
    ops.updateTaskStatus(db, id, 'completed');
    completed.push(id);
  }
  closeStateDb(db);
  parentPort.postMessage({ workerIdx, completed });
} else {
  test(`${WORKER_COUNT} workers × ${TASKS_PER_WORKER} updateTaskStatus — no loss, monotonic events`, async () => {
    const { dir, file } = tmpDb();
    try {
      const init = initStateDb(file);
      const db = init.db;

      // Pre-seed disjoint tasks so workers never contend on the same row.
      for (let w = 0; w < WORKER_COUNT; w++) {
        for (let t = 0; t < TASKS_PER_WORKER; t++) {
          ops.createTask(db, {
            id: `w${w}-t${t}`,
            title: `seed w${w}t${t}`,
            type: 'feature',
            priority: 'P3',
          });
        }
      }
      closeStateDb(db);

      const expectedTasks = WORKER_COUNT * TASKS_PER_WORKER;
      const results = await Promise.all(
        Array.from({ length: WORKER_COUNT }, (_, idx) =>
          new Promise((resolve, reject) => {
            const w = new Worker(__filename, {
              workerData: { dbPath: file, workerIdx: idx, count: TASKS_PER_WORKER },
            });
            w.on('message', resolve);
            w.on('error', reject);
            w.on('exit', (code) => {
              if (code !== 0) reject(new Error(`worker ${idx} exit ${code}`));
            });
          }),
        ),
      );

      const completedClaims = results.flatMap((r) => r.completed);
      assert.equal(completedClaims.length, expectedTasks);

      const verify = openStateDb(file);
      const completedRows = verify.prepare("SELECT id, status FROM tasks WHERE status = @status").all({ status: 'completed' });
      assert.equal(completedRows.length, expectedTasks, 'every task must end in completed');

      // Each task contributes 1 task_created + 1 task_started + 1 task_completed = 3 events.
      const totalEvents = verify.prepare('SELECT COUNT(*) AS n FROM events').get().n;
      assert.equal(totalEvents, expectedTasks * 3, 'every transition must record an event');

      const ids = verify.prepare('SELECT id FROM events ORDER BY id ASC').all().map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, 'event ids must be unique');
      for (let i = 1; i < ids.length; i++) {
        assert.ok(ids[i] > ids[i - 1], 'event ids must be strictly monotonic');
      }

      const startedCount = verify.prepare("SELECT COUNT(*) AS n FROM events WHERE type = @type").get({ type: 'task_started' }).n;
      const completedCount = verify.prepare("SELECT COUNT(*) AS n FROM events WHERE type = @type").get({ type: 'task_completed' }).n;
      assert.equal(startedCount, expectedTasks, 'every task got a task_started event');
      assert.equal(completedCount, expectedTasks, 'every task got a task_completed event');

      closeStateDb(verify);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
