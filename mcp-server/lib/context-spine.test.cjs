'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { compileRoleContext, deriveTransitions, readBreadcrumb } = require('./context-spine.cjs');
const { initStateDb } = require('./state-db.cjs');
const { createChange, compileContext } = require('./change-workflow.cjs');
const { createTask, patchTask } = require('./state-ops.cjs');
const baselines = require('./baseline-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const decisions = require('./decision-dialogue.cjs');
const { seedReadyBaseline: seedCompleteBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function seedReadyBaseline(db, rootDir, id = 'test-baseline') {
  return seedCompleteBaseline(db, { rootDir, id });
}

test('breadcrumb routes a project without a converged baseline back to adoption', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-baseline-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    const breadcrumb = readBreadcrumb(db, {}, { rootDir });
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.ok(breadcrumb.blockers.includes('BASELINE_MISSING'));
    assert.deepEqual(breadcrumb.allowed_transitions, ['ultra-init', 'ultra-status']);
    assert.equal(breadcrumb.required_transition, 'ultra-init');
    assert.equal(breadcrumb.next_action, undefined);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('breadcrumb routes an adopting baseline to the exact durable workflow step', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-workflow-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    const baseline = baselines.startBaseline(db, {
      id: 'adoption', project_name: 'legacy', mode: 'brownfield', scope: ['.'],
    }, { rootDir, emitEvent: false });
    const run = workflows.startWorkflow(db, {
      id: 'research-adoption', kind: 'research', mode: 'adoption',
      baseline_id: baseline.id, subject: 'Establish the observed brownfield baseline.',
      coverage: workflows.WORKFLOW_DEFINITIONS.research.map((item) => ({
        step_id: item.id, disposition: 'execute',
        rationale: 'Current brownfield evidence must be inspected.', evidence_refs: [],
      })),
    }, { rootDir });

    const breadcrumb = readBreadcrumb(db, {}, { rootDir });
    assert.ok(breadcrumb.allowed_transitions.includes('ultra-research'));
    assert.equal(breadcrumb.required_transition, null);
    assert.equal(breadcrumb.workflow.id, run.id);
    assert.equal(breadcrumb.workflow.current_step, '00-problem-validation');
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('deriveTransitions exposes valid alternatives without choosing a semantic next action', () => {
  const change = { id: 'context-spine', status: 'active' };
  const task = { id: 'task-1', status: 'in_progress' };
  const transitions = deriveTransitions({
    change, tasks: [task], task, role: 'review', readiness: 'ready',
  });
  assert.deepEqual(transitions.required_transition, null);
  assert.ok(transitions.allowed_transitions.includes('ultra-dev'));
  assert.ok(transitions.allowed_transitions.includes('ultra-review'));
  assert.ok(transitions.allowed_transitions.includes('ultra-think'));
});

test('deriveTransitions requires recovery only when a hard invariant leaves one legal route', () => {
  const transitions = deriveTransitions({
    change: { id: 'context-spine', status: 'active' },
    tasks: [], task: null, role: 'plan', readiness: 'blocked',
    blockers: ['STATE_DB_UNREADABLE'],
  });
  assert.equal(transitions.required_transition, 'ultra-doctor');
  assert.deepEqual(transitions.allowed_transitions, ['ultra-doctor', 'ultra-status']);
});

test('deriveTransitions exposes delivery only after change convergence', () => {
  const completedTask = { id: 'task-1', status: 'completed' };
  const active = deriveTransitions({
    change: { id: 'context-spine', status: 'active' },
    tasks: [completedTask], task: null, role: 'check', readiness: 'ready',
  });
  assert.ok(active.allowed_transitions.includes('ultra-test'));
  assert.ok(active.allowed_transitions.includes('ultra-review'));
  assert.equal(active.allowed_transitions.includes('ultra-deliver'), false);

  const gateReady = deriveTransitions({
    change: { id: 'context-spine', status: 'active' },
    tasks: [completedTask], task: null, role: 'check', readiness: 'ready',
    deliveryReady: true,
  });
  assert.ok(gateReady.allowed_transitions.includes('ultra-deliver'));

  const converged = deriveTransitions({
    change: { id: 'context-spine', status: 'ready' },
    tasks: [completedTask], task: null, role: 'check', readiness: 'ready',
  });
  assert.ok(converged.allowed_transitions.includes('ultra-deliver'));
});

test('a task is not plan-ready before its execution contract is compiled', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-plan-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, { ...completeChangeInput(),
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
    assert.ok(breadcrumb.blockers.includes('CONTEXT_NOT_COMPILED'));
    assert.throws(
      () => readBreadcrumb(db, { id: 'missing-change' }, { rootDir }),
      (error) => error.code === 'CHANGE_NOT_FOUND',
    );

    compileContext(db, { id: change.id, task_id: task.id, role: 'plan' }, { rootDir });
    db.prepare("UPDATE context_snapshots SET context_json = '{}', readiness = 'ready'").run();
    const migratedLegacy = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(migratedLegacy.readiness, 'blocked');
    assert.ok(migratedLegacy.blockers.includes('CONTEXT_SNAPSHOT_UPGRADE_REQUIRED'));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('task context derives its execution contract and references from state.db', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-task-authority-'));
  fs.writeFileSync(path.join(rootDir, 'contract.md'), '# Contract\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, { ...completeChangeInput(),
      id: 'db-contract', title: 'DB contract', kind: 'quick',
      intent: 'Use one durable task contract as context authority.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    const task = createTask(db, {
      id: 'task-contract', title: 'Use durable contract', type: 'feature', priority: 'P0',
      change_id: change.id, outcome: 'The context uses DB fields.', slice_kind: 'tracer_bullet',
      public_seam: 'context manifest', verification_command: 'node --test context',
      acceptance: [{ id: 'db', criterion: 'DB values appear.', verification: 'node --test context' }],
      context_refs: [{ ref: 'contract.md', reason: 'Defines accepted behavior.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'No public documentation change.' },
      ownership: { owner: 'runtime-maintainer', reviewers: [] }, trace_to: 'contract.md#contract',
    });
    const context = compileRoleContext(db, {
      input: { task_id: task.id, role: 'implement' }, change, tasks: [task], rootDir,
    });
    assert.equal(context.readiness.status, 'ready');
    assert.equal(context.execution_contract.public_seam, 'context manifest');
    assert.equal(context.context.items[0].ref, 'contract.md');
    assert.throws(
      () => compileRoleContext(db, {
        input: {
          task_id: task.id, role: 'implement',
          execution_contract: { public_seam: 'prompt override' },
        },
        change, tasks: [task], rootDir,
      }),
      (error) => error.code === 'EXECUTION_CONTRACT_CONFLICT',
    );
    assert.throws(
      () => compileRoleContext(db, {
        input: {
          task_id: task.id,
          role: 'implement',
          context_refs: [{ ref: 'contract.md', reason: 'Prompt-owned replacement.', required: false }],
        },
        change, tasks: [task], rootDir,
      }),
      (error) => error.code === 'EXECUTION_CONTEXT_REFS_CONFLICT',
    );
    const modelRecommendation = compileRoleContext(db, {
      input: {
        task_id: task.id,
        role: 'implement',
        recommendation: {
          workflow: 'ultra-dev',
          rationale: 'The accepted pending task has a current execution contract.',
        },
      },
      change, tasks: [task], rootDir,
    });
    assert.equal(modelRecommendation.recommendation.workflow, 'ultra-dev');
    assert.equal(modelRecommendation.control.required_transition, null);

    const inherited = compileRoleContext(db, {
      input: { task_id: task.id, role: 'review' }, change, tasks: [task], rootDir,
    });
    assert.equal(inherited.context.items[0].reason, 'Defines accepted behavior.');
    assert.equal(inherited.context.items[0].required, true);

    compileContext(db, { id: change.id, task_id: task.id, role: 'implement' }, { rootDir });
    patchTask(db, task.id, { public_seam: 'updated context manifest' });
    const stale = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(stale.readiness, 'blocked');
    assert.ok(stale.blockers.includes('CONTEXT_TASK_CONTRACT_STALE'));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('active change breadcrumb follows the latest durable stage workflow', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-stage-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, { ...completeChangeInput(),
      id: 'stage-route', title: 'Stage route', kind: 'standard',
      intent: 'Route status through the active durable plan stage.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    const plan = workflows.startWorkflow(db, {
      id: 'plan-stage', kind: 'plan', baseline_id: 'test-baseline', change_id: change.id,
      subject: 'Plan the active stage.',
    }, { rootDir });
    const breadcrumb = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(breadcrumb.workflow.id, plan.id);
    assert.ok(breadcrumb.allowed_transitions.includes('ultra-plan'));
    assert.equal(breadcrumb.required_transition, null);
    assert.equal(breadcrumb.next_action, undefined);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('breadcrumb prioritizes one current owner decision over downstream workflow work', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-decision-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const created = createChange(db, { ...completeChangeInput(),
      id: 'decision-route', title: 'Decision route', kind: 'standard',
      intent: 'Route the owner to one load-bearing decision before planning.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    decisions.startDecisionThread(db, {
      id: 'decision-route-thread', change_id: created.change.id,
      workflow_run_id: created.workflow.id,
      purpose: 'Resolve the API compatibility boundary.', mode: 'guided',
    });
    decisions.openDecision(db, {
      id: 'decision-route-api', thread_id: 'decision-route-thread', phase: 'change-contract',
      question: 'Should the public API remain compatible for one release?',
      why_now: 'The answer changes rollout and recovery tasks.',
      recommendation: 'Preserve compatibility while active consumers migrate.',
      effects: { summary: 'Changes the API contract and rollout plan.' },
      blocking: true,
    });

    const breadcrumb = readBreadcrumb(db, { id: created.change.id }, { rootDir });
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.equal(breadcrumb.gate, 'alignment');
    assert.equal(breadcrumb.decision.thread_id, 'decision-route-thread');
    assert.equal(breadcrumb.decision.current.id, 'decision-route-api');
    assert.deepEqual(breadcrumb.allowed_transitions, ['ultra-think', 'ultra-status']);
    assert.equal(breadcrumb.required_transition, 'ultra-think');
    assert.equal(breadcrumb.next_action, undefined);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('breadcrumb invalidates context when the working tree changes without a new commit', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-worktree-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Contract\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, { ...completeChangeInput(),
      id: 'worktree-context', title: 'Worktree context', kind: 'quick',
      intent: 'Invalidate context after any source edit at the same HEAD.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    compileContext(db, { id: change.id, role: 'plan' }, { rootDir });
    assert.equal(readBreadcrumb(db, { id: change.id }, { rootDir }).readiness, 'ready');

    fs.appendFileSync(path.join(rootDir, 'README.md'), '\nChanged after context compilation.\n');
    const stale = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(stale.readiness, 'blocked');
    assert.ok(stale.blockers.includes('CONTEXT_WORKTREE_STALE'));
    assert.ok(stale.allowed_transitions.includes('change.context'));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
