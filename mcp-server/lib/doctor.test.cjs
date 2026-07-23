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
const changes = require('./change-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const workflows = require('./workflow-state.cjs');
const { researchCoverage } = require('../test-support/semantic-records.cjs');
const decisions = require('./decision-dialogue.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');

function fixture({ baseline = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-doctor-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  if (baseline) {
    seedReadyBaseline(db, { rootDir });
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
  const fx = fixture({ baseline: false });
  try {
    baselines.startBaseline(fx.db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.baseline.status, 'warning');
    assert.equal(report.checks.baseline.mode, 'brownfield');
    assert.deepEqual(report.checks.baseline.gaps, {
      total: 0, open: 0, blocking: 0, by_category: {},
    });
    assert.ok(report.checks.baseline.blockers.includes('BASELINE_NOT_READY:adopting'));
  } finally {
    cleanup(fx);
  }
});

test('doctor degrades when a ready baseline loses immutable research authority', async () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `UPDATE workflow_steps SET outputs_json = ?, updated_at = ?
       WHERE run_id = 'test-baseline-research' AND step_id = '00-problem-validation'`,
    ).run(JSON.stringify([{
      path: '.ultra/docs/research/test-baseline-research/00-problem-validation.md',
      kind: 'research-step-report', digest: '0'.repeat(64),
    }]), new Date().toISOString());
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'degraded');
    assert.equal(report.checks.baseline.status, 'fail');
    assert.ok(report.checks.baseline.blockers.some((item) => item.startsWith(
      'BASELINE_RESEARCH_WORKFLOW_OUTPUT_STALE:',
    )));
  } finally {
    cleanup(fx);
  }
});

test('doctor exposes blocked workflow recovery without treating an expected pause as database corruption', async () => {
  const fx = fixture({ baseline: false });
  try {
    const baseline = baselines.startBaseline(fx.db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir: fx.rootDir, emitEvent: false });
    const run = workflows.startWorkflow(fx.db, {
      id: 'research-adoption', kind: 'research', mode: 'adoption',
      baseline_id: baseline.id, subject: 'Establish current system evidence.',
      coverage: researchCoverage(),
    }, { rootDir: fx.rootDir });
    workflows.recordWorkflowStep(fx.db, {
      id: run.id, step_id: '00-problem-validation', status: 'blocked',
      blockers: ['OWNER_EVIDENCE_REQUIRED'],
    }, { rootDir: fx.rootDir });
    runtime.ensureProjectionJob(fx.db, { tool_name: 'workflow.step' });
    runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => ({ projected: true }),
    });

    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.workflows.status, 'warning');
    assert.equal(report.checks.workflows.blocked, 1);
  } finally {
    cleanup(fx);
  }
});

test('doctor reports an awaiting owner decision as recoverable workflow state', async () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'doctor-decision', baseline_id: 'test-baseline',
      purpose: 'Wait for one owner decision.', mode: 'guided',
    });
    decisions.openDecision(fx.db, {
      id: 'doctor-api', thread_id: 'doctor-decision', phase: 'research',
      question: 'Should the public API remain compatible?',
      why_now: 'The answer changes the research synthesis.',
      recommendation: 'Preserve compatibility until consumers migrate.',
      effects: { summary: 'Changes product and architecture specifications.' },
    });
    runtime.ensureProjectionJob(fx.db, { tool_name: 'decision.open' });
    runtime.processProjectionJobs(fx.db, {
      rootDir: fx.rootDir,
      project: () => ({ projected: true }),
    });
    const report = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir });
    assert.equal(report.status, 'healthy');
    assert.equal(report.checks.decisions.status, 'warning');
    assert.equal(report.checks.decisions.awaiting_owner, 1);
    assert.equal(report.checks.decisions.current.id, 'doctor-api');
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

test('doctor repair resumes an archive journal left after a process crash', async () => {
  const fx = fixture();
  try {
    const activeRoot = path.join(fx.rootDir, '.ultra', 'changes', 'active', 'doctor-archive');
    fs.mkdirSync(activeRoot, { recursive: true });
    fs.writeFileSync(path.join(activeRoot, 'intent.md'), '# Authorized archive\n');
    const reconciliationPath = '.ultra/changes/active/doctor-archive/baseline-reconciliation.json';
    const reconciliationManifest = {
      $schema: 'ultra-baseline-reconciliation-v1', change_id: 'doctor-archive',
      baseline_id: 'test-baseline', baseline_updates: [], semantic_changes: [],
      resolved_gap_ids: [], resolved_unknowns: [],
      verification: [{ name: 'read-back', command: 'ubp status', status: 'pass', evidence: 'Verified.' }],
      semantic_no_change_reason: 'No baseline content changed.',
    };
    fs.writeFileSync(
      path.join(fx.rootDir, reconciliationPath), `${JSON.stringify(reconciliationManifest)}\n`,
    );
    fx.db.prepare(
      `INSERT INTO changes
       (id, title, kind, status, intent, docs_impact_json, provider_refs_json, artifact_root)
       VALUES ('doctor-archive', 'Recover archive', 'quick', 'ready', 'Recover it',
               '{"status":"none","files":[],"rationale":"recovery"}', '{}',
               '.ultra/changes/active/doctor-archive')`,
    ).run();
    const prepared = archiveJournal.prepareArchiveMove({
      rootDir: fx.rootDir, change: changes.readChange(fx.db, 'doctor-archive'),
      summary: 'Resume the authorized archive.', baselineUpdates: [],
      noBaselineChangeReason: 'No baseline content changed.',
      reconciliationPath,
      reconciliationDigest: require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(fx.rootDir, reconciliationPath))).digest('hex'),
      reconciliationManifest,
    });
    assert.equal(fs.existsSync(prepared.source), false);
    const before = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.archive_recovery.pending, 1);

    const after = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(after.repair.archives.resumed, 1);
    assert.equal(changes.readChange(fx.db, 'doctor-archive').status, 'archived');
    assert.equal(after.checks.archive_recovery.pending, 0);
    assert.equal(fs.existsSync(path.join(prepared.destination, archiveJournal.INTENT_FILE)), false);
  } finally {
    cleanup(fx);
  }
});

test('doctor repair creates a blocked recovery workflow for a legacy untracked change', async () => {
  const fx = fixture();
  try {
    const artifactRoot = path.join(fx.rootDir, '.ultra', 'changes', 'active', 'legacy-change');
    fs.mkdirSync(artifactRoot, { recursive: true });
    fx.db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('legacy-change', 'Legacy active change', 'standard', 'active',
               'Preserve and recover this pre-workflow change.',
               '.ultra/changes/active/legacy-change')`,
    ).run();
    const before = doctor.inspectSystem(fx.db, { rootDir: fx.rootDir });
    assert.equal(before.status, 'degraded');
    assert.equal(before.checks.workflows.status, 'fail');
    assert.deepEqual(before.checks.workflows.untracked_active_changes, ['legacy-change']);

    const after = await doctor.runDoctor(fx.db, { rootDir: fx.rootDir, repair: true });
    assert.equal(after.repair.workflows.created, 1);
    const recovered = workflows.listWorkflows(
      fx.db, { kind: 'change', change_id: 'legacy-change' }, { rootDir: fx.rootDir },
    )[0];
    assert.equal(recovered.status, 'blocked');
    assert.equal(recovered.current_step, 'bind-baseline');
    assert.deepEqual(recovered.blockers, ['LEGACY_CHANGE_PROVENANCE_REQUIRED']);
    assert.deepEqual(after.checks.workflows.untracked_active_changes, []);
  } finally {
    cleanup(fx);
  }
});
