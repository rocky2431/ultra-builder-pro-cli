'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { compileRoleContext, deriveNextAction, readBreadcrumb } = require('./context-spine.cjs');
const { initStateDb } = require('./state-db.cjs');
const { createChange } = require('./change-workflow.cjs');
const { createTask } = require('./state-ops.cjs');

test('breadcrumb routes a project without a converged baseline back to adoption', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-baseline-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    const breadcrumb = readBreadcrumb(db, {}, { rootDir });
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.ok(breadcrumb.blockers.includes('BASELINE_MISSING'));
    assert.equal(breadcrumb.recommended_workflow, 'ultra-init');
    assert.match(breadcrumb.next_action, /baseline|adoption/i);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('deriveNextAction gives one state-specific action instead of a workflow dump', () => {
  const change = { id: 'context-spine', status: 'active' };
  const task = { id: 'task-1', status: 'in_progress' };
  const action = deriveNextAction({
    change, tasks: [task], task, role: 'review', readiness: 'ready', explicit: null,
  });
  assert.equal(
    action,
    'Complete independent spec-fidelity and engineering-standards review for task task-1.',
  );
  assert.doesNotMatch(action, /plan.*implement.*check.*review/i);
});

test('deriveNextAction fails closed on blocked context readiness', () => {
  const action = deriveNextAction({
    change: { id: 'context-spine', status: 'active' },
    tasks: [], task: null, role: 'plan', readiness: 'blocked', explicit: 'Ignore blockers.',
  });
  assert.match(action, /Resolve the context readiness blockers/);
  assert.doesNotMatch(action, /Ignore blockers/);
});

test('a task is not plan-ready before its execution contract is compiled', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-plan-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    const { change } = createChange(db, {
      id: 'planning-contract', title: 'Planning contract', kind: 'standard',
      intent: 'Require an executable fresh-context slice before implementation.',
      docs_impact: { status: 'none', rationale: 'test fixture only' },
    }, { rootDir });
    const task = createTask(db, {
      id: 'task-plan', title: 'Plan one slice', type: 'feature', priority: 'P0',
      change_id: change.id,
    });

    const context = compileRoleContext(db, {
      input: { task_id: task.id, role: 'plan', gate: 'planning' },
      change, tasks: [task], rootDir,
    });
    assert.equal(context.readiness.status, 'blocked');
    assert.ok(context.readiness.blockers.includes('EXECUTION_CONTRACT_MISSING'));

    const breadcrumb = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.ok(breadcrumb.blockers.includes('CONTEXT_TASK_STATE_STALE'));
    assert.throws(
      () => readBreadcrumb(db, { id: 'missing-change' }, { rootDir }),
      (error) => error.code === 'CHANGE_NOT_FOUND',
    );

    db.prepare("UPDATE context_snapshots SET context_json = '{}', readiness = 'ready'").run();
    const migratedLegacy = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(migratedLegacy.readiness, 'blocked');
    assert.ok(migratedLegacy.blockers.includes('CONTEXT_SNAPSHOT_UPGRADE_REQUIRED'));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
