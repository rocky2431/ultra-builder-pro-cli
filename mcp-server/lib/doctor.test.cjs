'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const runtime = require('./runtime-state.cjs');
const doctor = require('./doctor.cjs');
const baselines = require('./baseline-workflow.cjs');

function fixture({ migratedBaseline = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-doctor-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  if (migratedBaseline) {
    db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('test-baseline', 'fixture', 'migrated', 'ready', 'test', 'legacy fixture', ?)`,
    ).run(new Date().toISOString());
  }
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

test('doctor reports structured health for an initialized Ultra project', async () => {
  const fx = fixture();
  try {
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.repair_performed, false);
    assert.equal(report.checks.state_db.status, 'pass');
    assert.equal(report.checks.external_providers.ownership, 'external');
  } finally {
    cleanup(fx);
  }
});

test('doctor reports incomplete brownfield adoption as advisory rather than authority failure', async () => {
  const fx = fixture({ migratedBaseline: false });
  try {
    baselines.startBaseline(fx.db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.baseline.status, 'warning');
    assert.equal(report.checks.baseline.mode, 'brownfield');
    assert.ok(report.checks.baseline.blockers.includes('BASELINE_NOT_READY:adopting'));
  } finally {
    cleanup(fx);
  }
});

test('doctor repair is backup-first and drains projection/spec-event recovery work', async () => {
  const fx = fixture();
  try {
    ops.createTask(fx.db, {
      id: 'stale-target', title: 'Refresh context', type: 'feature', priority: 'P1',
      trace_to: '.ultra/specs/product.md#continuous-change',
    });
    ops.appendEvent(fx.db, {
      type: 'spec_changed',
      payload: { sections: ['.ultra/specs/product.md#continuous-change'] },
    });
    runtime.enqueueProjection(fx.db, { tool_name: 'task.append_event', event_cursor: 2 });

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(report.repair_performed, true);
    assert.ok(fs.existsSync(report.backup_path));
    assert.equal(ops.readTask(fx.db, 'stale-target').stale, true);
    assert.equal(runtime.readConsumerCursor(fx.db, 'spec-staleness'), 2);
    assert.equal(runtime.listProjectionJobs(fx.db, { status: 'pending' }).length, 0);
    assert.equal(report.status, 'healthy');
  } finally {
    cleanup(fx);
  }
});

test('doctor reports running projection work and repairs only stale interrupted jobs', async () => {
  const fx = fixture();
  try {
    ops.appendEvent(fx.db, { type: 'spec_changed', payload: { sections: [] } });
    const job = runtime.enqueueProjection(fx.db, { tool_name: 'task.append_event', event_cursor: 1 });
    fx.db.prepare("UPDATE projection_jobs SET status = 'running', updated_at = ? WHERE id = ?")
      .run('2000-01-01T00:00:00.000Z', job.id);

    const before = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.projections.running, 1);

    const after = await doctor.runDoctor(fx.db, {
      rootDir: fx.rootDir,
      repair: true,
      projectionStaleAfterMs: 0,
    });
    assert.equal(after.repair.interrupted.requeued, 1);
    assert.equal(after.checks.projections.running, 0);
    assert.equal(after.status, 'healthy');
  } finally {
    cleanup(fx);
  }
});
