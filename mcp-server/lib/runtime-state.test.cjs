'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const runtime = require('./runtime-state.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-runtime-state-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

test('projection jobs complete and retain their event cursor', () => {
  const fx = fixture();
  try {
    const job = runtime.enqueueProjection(fx.db, { tool_name: 'task.create', event_cursor: 7 });
    const result = runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => ({ tasks_json: { count: 0 }, contexts: [] }),
    });
    assert.equal(result.processed, 1);
    assert.equal(result.jobs[0].status, 'completed');
    const stored = runtime.readProjectionJob(fx.db, job.id);
    assert.equal(stored.status, 'completed');
    assert.equal(stored.event_cursor, 7);
  } finally {
    cleanup(fx);
  }
});

test('projection failures are explicit, retryable incidents rather than swallowed warnings', () => {
  const fx = fixture();
  try {
    runtime.enqueueProjection(fx.db, { tool_name: 'task.update', event_cursor: 4, max_attempts: 1 });
    // Test Double rationale: deterministic projector failure is required; filesystem permission failures vary by host.
    const result = runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => { throw new Error('projection disk unavailable'); },
    });
    assert.equal(result.jobs[0].status, 'failed');
    assert.match(result.jobs[0].error, /projection disk unavailable/);
    const incidents = runtime.listIncidents(fx.db, { status: 'open' });
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].code, 'PROJECTION_FAILED');
    assert.equal(incidents[0].retryable, true);
  } finally {
    cleanup(fx);
  }
});

test('event consumer cursors are durable and monotonic', () => {
  const fx = fixture();
  try {
    assert.equal(runtime.readConsumerCursor(fx.db, 'spec-staleness'), 0);
    runtime.writeConsumerCursor(fx.db, 'spec-staleness', 12);
    runtime.writeConsumerCursor(fx.db, 'spec-staleness', 9);
    assert.equal(runtime.readConsumerCursor(fx.db, 'spec-staleness'), 12);
  } finally {
    cleanup(fx);
  }
});

test('interrupted running projections are requeued only after the stale cutoff', () => {
  const fx = fixture();
  try {
    const stale = runtime.enqueueProjection(fx.db, { tool_name: 'task.update', event_cursor: 3 });
    const fresh = runtime.enqueueProjection(fx.db, { tool_name: 'task.create', event_cursor: 4 });
    fx.db.prepare("UPDATE projection_jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .run('2000-01-01T00:00:00.000Z', stale.id);
    fx.db.prepare("UPDATE projection_jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .run('2999-01-01T00:00:00.000Z', fresh.id);

    const result = runtime.requeueInterruptedProjections(fx.db, {
      staleBefore: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(result.requeued, 1);
    assert.equal(runtime.readProjectionJob(fx.db, stale.id).status, 'pending');
    assert.equal(runtime.readProjectionJob(fx.db, fresh.id).status, 'running');
  } finally {
    cleanup(fx);
  }
});
