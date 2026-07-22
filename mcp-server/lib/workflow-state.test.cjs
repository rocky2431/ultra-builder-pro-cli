'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const workflows = require('./workflow-state.cjs');
const ops = require('./state-ops.cjs');
const changes = require('./change-workflow.cjs');
const planStore = require('./plan-store.cjs');
const {
  WORKFLOW_DEFINITIONS, startWorkflow, recordWorkflowStep, completeWorkflow,
} = workflows;
const {
  seedReadyBaseline,
  seedCompletedWorkflowStructure,
} = require('../test-support/ready-baseline.cjs');
const { semanticRecordsForStep } = require('../test-support/semantic-records.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-workflow-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  seedReadyBaseline(db, { rootDir, id: 'baseline' });
  return { rootDir, db };
}

function cleanup(fx) {
  closeStateDb(fx.db);
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function writeArtifact(fx, relative, body) {
  const file = path.join(fx.rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return relative;
}

function verificationDimensions(overrides = {}) {
  const pass = (evidence) => ({ status: 'pass', evidence: [evidence], rationale: 'Required for this change.' });
  const notApplicable = (rationale) => ({ status: 'not_applicable', evidence: [], rationale });
  return {
    acceptance: pass('Acceptance mapping and public seam were executed.'),
    regression: pass('The relevant regression suite passed.'),
    integration: pass('The live consumer path was exercised.'),
    static_analysis: notApplicable('No repository-native static analyzer is configured.'),
    build: notApplicable('This fixture has no separate build command.'),
    performance: notApplicable('The bounded fixture has no material performance risk.'),
    security: notApplicable('The bounded fixture does not change a security boundary.'),
    recovery: pass('The declared recovery path was checked.'),
    ...overrides,
  };
}

function insertChange(fx, id = 'workflow-change', status = 'active', { link = true } = {}) {
  const authority = completeChangeInput({ id, kind: 'standard' });
  fx.db.prepare(
    `INSERT INTO changes
     (id, title, kind, status, intent, artifact_root, contract_json,
      classification_json, research_disposition_json)
     VALUES (?, ?, 'standard', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, `Change ${id}`, status, `Exercise ${id} through durable workflow state.`,
    `.ultra/changes/active/${id}`, JSON.stringify(authority.contract),
    JSON.stringify(authority.classification), JSON.stringify(authority.research_disposition),
  );
  if (link) {
    insertCompletedRun(fx, {
      id: `change-authority-${id}`, kind: 'change', changeId: id,
      summary: { task_ids: [] },
    });
  }
  return id;
}

function finishRequiredSteps(fx, run, outputForStep = () => null) {
  let current = run;
  for (const item of current.steps.filter((candidate) => candidate.required)) {
    const definition = WORKFLOW_DEFINITIONS[current.kind]
      .find((candidate) => candidate.id === item.step_id);
    const input = { id: current.id, step_id: item.step_id, status: 'completed' };
    if (definition.evidence_required) {
      input.evidence = [{
        kind: 'test', ref: `fixture:${item.step_id}`, summary: `Evidence for ${item.step_id}.`,
      }];
    }
    if (definition.output_required) {
      const output = outputForStep(item.step_id);
      input.outputs = [{ path: output, kind: `${current.kind}-evidence` }];
    }
    if (current.kind === 'research') {
      input.semantic_records = semanticRecordsForStep(current.id, item.step_id);
    }
    if (current.kind === 'deliver' && item.step_id === 'release-if-authorized') {
      input.decisions = [{
        kind: 'release_authorization', authorized: false,
        reason: 'This test fixture does not authorize an external release.',
      }];
    }
    current = recordWorkflowStep(fx.db, input, { rootDir: fx.rootDir });
  }
  return current;
}

function insertCompletedRun(fx, {
  id, kind, changeId, taskId = null, summary = {}, baselineId = 'baseline',
}) {
  const ts = new Date().toISOString();
  fx.db.prepare(
    `INSERT INTO workflow_runs
     (id, kind, subject, definition_version, status, baseline_id, change_id, task_id,
      metadata_json, blockers_json, summary_json, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, '{}', '[]', ?, ?, ?, ?)`,
  ).run(
    id, kind, `Completed ${kind} fixture.`, workflows.DEFINITION_VERSION,
    baselineId, changeId, taskId, JSON.stringify(summary), ts, ts, ts,
  );
  seedCompletedWorkflowStructure(fx.db, id, kind, ts);
  if (kind === 'change' && baselineId) {
    fx.db.prepare(
      `UPDATE workflow_steps SET evidence_json = ?
       WHERE run_id = ? AND step_id = 'bind-baseline'`,
    ).run(JSON.stringify([{
      kind: 'baseline', ref: baselineId, summary: 'Bound approved fixture baseline authority.',
    }]), id);
  }
}

function completedTask(fx, changeId, id) {
  const task = ops.createTask(fx.db, {
    id, title: `Complete ${id}`, type: 'feature', priority: 'P0', change_id: changeId,
    outcome: `The ${id} outcome is observable.`, slice_kind: 'tracer_bullet',
    public_seam: `${id} public seam`, verification_command: `node --test ${id}.test.cjs`,
    acceptance: [{ id: `${id}-acceptance`, criterion: 'The seam works.', verification: `node --test ${id}.test.cjs` }],
    context_refs: [{ ref: '.ultra/specs/product.md', reason: 'Accepted behavior.', required: true }],
    docs_impact: { status: 'none', files: [], rationale: 'No public documentation change.' },
    ownership: { owner: 'test-owner', reviewers: [] }, trace_to: '.ultra/specs/product.md#fixture',
  });
  ops.updateTaskStatus(fx.db, task.id, 'in_progress');
  ops.updateTaskStatus(fx.db, task.id, 'completed');
  insertCompletedRun(fx, {
    id: `dev-${id}`, kind: 'dev', changeId, taskId: id,
    summary: { task_id: id, git_commit: null, worktree_digest: null },
  });
  return ops.readTask(fx.db, id);
}

function seedDeliveryPrerequisites(fx, changeId) {
  const task = completedTask(fx, changeId, `${changeId}-task`);
  insertCompletedRun(fx, {
    id: `test-${changeId}`, kind: 'test', changeId,
    summary: { passed: true, task_ids: [task.id], git_commit: null, worktree_digest: null },
  });
  insertCompletedRun(fx, {
    id: `review-${changeId}`, kind: 'review', changeId,
    summary: {
      mode: 'change', verdict: 'APPROVE', task_ids: [task.id], git_commit: null, worktree_digest: null,
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: ['spec.json'] },
        engineering_standards: { verdict: 'PASS', evidence_refs: ['code.json'] },
      },
    },
  });
  return task;
}

test('full research preserves all seventeen original semantic steps without an implicit MVP mode', () => {
  const fx = fixture();
  try {
    const run = workflows.startWorkflow(fx.db, {
      id: 'research-full', kind: 'research', mode: 'full', baseline_id: 'baseline',
      subject: 'Validate the complete product and architecture baseline.',
    }, { rootDir: fx.rootDir });

    assert.equal(run.status, 'active');
    assert.equal(run.mode, 'full');
    assert.equal(run.steps.length, 17);
    assert.deepEqual(run.steps.map((step) => step.step_id), [
      '00-problem-validation',
      '01-opportunity-discovery',
      '02-market-assessment',
      '03-competitive-landscape',
      '04-product-strategy',
      '05-assumptions-validation',
      '10-user-personas',
      '11-user-scenarios',
      '20-user-stories',
      '21-features-scope',
      '22-success-metrics',
      '30-architecture-context',
      '31-solution-strategy',
      '32-building-blocks',
      '40-deployment',
      '41-quality-risks',
      '99-synthesis',
    ]);
    assert.equal(run.steps.every((step) => step.required), true);
    assert.equal(JSON.stringify(run).toLowerCase().includes('mvp'), false);
    assert.equal(run.next_step.step_id, '00-problem-validation');
  } finally {
    cleanup(fx);
  }
});

test('research records evidence and output digests, enforces order, and resumes at the next step', () => {
  const fx = fixture();
  try {
    workflows.startWorkflow(fx.db, {
      id: 'research-resume', kind: 'research', mode: 'full', baseline_id: 'baseline',
      subject: 'Research fixture.',
    }, { rootDir: fx.rootDir });

    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: 'research-resume', step_id: '00-problem-validation', status: 'completed',
        evidence: [{ kind: 'owner', ref: 'decision:problem', summary: 'Problem accepted.' }],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_OUTPUT_REQUIRED',
    );
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: 'research-resume', step_id: '01-opportunity-discovery', status: 'in_progress',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_STEP_OUT_OF_ORDER',
    );

    const discovery = writeArtifact(
      fx, '.ultra/specs/discovery.md', '# Discovery\n\nValidated problem evidence.\n',
    );
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: 'research-resume', step_id: '00-problem-validation', status: 'completed',
        evidence: [{ kind: 'owner', ref: 'decision:problem', summary: 'Problem accepted.' }],
        outputs: [{ path: discovery, kind: 'discovery' }],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_RESEARCH_REPORT_REQUIRED',
    );
    const report = writeArtifact(
      fx,
      '.ultra/docs/research/research-resume/00-problem-validation.md',
      '# Problem validation evidence\n\n## Evidence\n\nOwner decision.\n\n'
        + '## Specification updates\n\nUpdated discovery.md.\n\n'
        + '## Decisions and unknowns\n\nProblem accepted; no unresolved fixture unknown.\n',
    );
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: 'research-resume', step_id: '00-problem-validation', status: 'completed',
        evidence: [{ kind: 'owner', ref: 'decision:problem', summary: 'Problem accepted.' }],
        outputs: [{ path: report, kind: 'research-step-report' }],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_SEMANTIC_RECORDS_REQUIRED',
    );
    const updated = workflows.recordWorkflowStep(fx.db, {
      id: 'research-resume', step_id: '00-problem-validation', status: 'completed',
      evidence: [{ kind: 'owner', ref: 'decision:problem', summary: 'Problem accepted.' }],
      outputs: [{ path: report, kind: 'research-step-report' }],
      decisions: [{ summary: 'Solve the validated problem.', owner: 'product-owner' }],
      semantic_records: semanticRecordsForStep('research-resume', '00-problem-validation'),
    }, { rootDir: fx.rootDir });

    assert.equal(updated.current_step, '01-opportunity-discovery');
    assert.equal(updated.next_step.step_id, '01-opportunity-discovery');
    assert.match(updated.steps[0].outputs[0].digest, /^[0-9a-f]{64}$/);
    assert.equal(updated.steps[0].semantic_records[0].kind, 'problem');

    const reloaded = workflows.readWorkflow(fx.db, 'research-resume', { rootDir: fx.rootDir });
    assert.equal(reloaded.steps[0].status, 'completed');
    assert.equal(reloaded.steps[1].status, 'pending');
  } finally {
    cleanup(fx);
  }
});

test('research health detects a stale semantic source even when the immutable step report is current', () => {
  const fx = fixture();
  try {
    workflows.startWorkflow(fx.db, {
      id: 'research-semantic-freshness', kind: 'research', mode: 'full', baseline_id: 'baseline',
      subject: 'Bind semantic provenance to current source content.',
    }, { rootDir: fx.rootDir });
    const report = writeArtifact(
      fx,
      '.ultra/docs/research/research-semantic-freshness/00-problem-validation.md',
      '# Problem validation evidence\n\n## Evidence\n\nCurrent source.\n\n'
        + '## Specification updates\n\nBound product evidence.\n\n'
        + '## Decisions and unknowns\n\nNo unresolved fixture unknown.\n',
    );
    const source = writeArtifact(
      fx, '.ultra/specs/semantic-source.md', '# Accepted problem\n\nCurrent accepted behavior.\n',
    );
    const semantic = semanticRecordsForStep(
      'research-semantic-freshness', '00-problem-validation',
    );
    semantic[0].source_ref = `${source}#accepted-problem`;
    workflows.recordWorkflowStep(fx.db, {
      id: 'research-semantic-freshness', step_id: '00-problem-validation', status: 'completed',
      evidence: [{ kind: 'source', ref: source, summary: 'Accepted problem source.' }],
      outputs: [{ path: report, kind: 'research-step-report' }],
      semantic_records: semantic,
    }, { rootDir: fx.rootDir });

    fs.appendFileSync(path.join(fx.rootDir, source), '\nChanged after semantic capture.\n');
    const reloaded = workflows.readWorkflow(
      fx.db, 'research-semantic-freshness', { rootDir: fx.rootDir },
    );
    assert.equal(reloaded.artifact_health.status, 'fail');
    assert.ok(reloaded.artifact_health.blockers.includes(
      'WORKFLOW_SEMANTIC_SOURCE_STALE:00-problem-validation:semantic-00-problem-validation',
    ));
  } finally {
    cleanup(fx);
  }
});

test('custom research excludes steps only through explicit selection and records the exclusion reason', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'bounded-research');
    const run = workflows.startWorkflow(fx.db, {
      id: 'research-custom', kind: 'research', mode: 'custom', baseline_id: 'baseline',
      change_id: changeId,
      selected_steps: ['20-user-stories', '21-features-scope'],
      metadata: { selection_reason: 'The owner requested only this active-change feature boundary.' },
      subject: 'Resolve a bounded feature-definition gap.',
    }, { rootDir: fx.rootDir });

    const selected = run.steps.filter((step) => step.required).map((step) => step.step_id);
    assert.deepEqual(selected, ['20-user-stories', '21-features-scope', '99-synthesis']);
    const excluded = run.steps.find((step) => step.step_id === '02-market-assessment');
    assert.equal(excluded.status, 'skipped');
    assert.match(excluded.skip_reason, /custom mode/i);
  } finally {
    cleanup(fx);
  }
});

test('workflow authority rejects orphan stages and implicit reduced research', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'orphan-test', kind: 'test', subject: 'Test an unbound change.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_AUTHORITY_REQUIRED',
    );
    const changeId = insertChange(fx, 'implicit-research-change');
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'implicit-feature-research', kind: 'research', mode: 'feature',
        baseline_id: 'baseline', change_id: changeId,
        subject: 'Silently reduce the research scope.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_SELECTION_REASON_REQUIRED',
    );
  } finally {
    cleanup(fx);
  }
});

test('plan cannot start until the change-selected research disposition has completed', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, completeChangeInput({
      id: 'research-gated-change', title: 'Gate planning on bounded research', kind: 'standard',
      intent: 'Require the selected research evidence before task design.',
      research_disposition: {
        status: 'required', mode: 'feature', selected_steps: [],
        rationale: 'The user scenario and requirement contract are not yet evidenced.',
      },
    }), { rootDir: fx.rootDir });
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'premature-plan', kind: 'plan', change_id: created.change.id,
        baseline_id: 'baseline', subject: 'Do not plan before selected research.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_CHANGE_RESEARCH_INCOMPLETE',
    );
  } finally {
    cleanup(fx);
  }
});

test('plan completion rejects missing change-acceptance coverage and oversized quick profiles', () => {
  const fx = fixture();
  try {
    const standard = changes.createChange(fx.db, completeChangeInput({
      id: 'coverage-change', title: 'Require complete acceptance coverage', kind: 'standard',
      intent: 'Every accepted change criterion must be owned by an executable task.',
    }), { rootDir: fx.rootDir });
    const task = ops.createTask(fx.db, {
      id: 'coverage-task', title: 'Cover the wrong criterion', type: 'feature', priority: 'P0',
      change_id: standard.change.id, outcome: 'An observable but incomplete slice exists.',
      slice_kind: 'tracer_bullet', public_seam: 'coverage seam',
      verification_command: 'node --test coverage.test.cjs',
      acceptance: [{ id: 'unrelated-acceptance', criterion: 'Unrelated.', verification: 'node --test unrelated.test.cjs' }],
      context_refs: [{ ref: '.ultra/specs/product.md', reason: 'Baseline behavior.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'Fixture only.' },
      ownership: { owner: 'test-owner', reviewers: [] }, trace_to: '.ultra/specs/product.md#product',
    });
    let plan = startWorkflow(fx.db, {
      id: 'coverage-plan', kind: 'plan', change_id: standard.change.id,
      baseline_id: 'baseline', subject: 'Expose the uncovered acceptance criterion.',
    }, { rootDir: fx.rootDir });
    const planPath = writeArtifact(
      fx, '.ultra/coverage-plan.json',
      `${JSON.stringify(planStore.buildPlan([ops.readTask(fx.db, task.id)], { changeId: standard.change.id }), null, 2)}\n`,
    );
    plan = finishRequiredSteps(fx, plan, (stepId) => (stepId === 'verify-plan' ? planPath : null));
    assert.throws(
      () => completeWorkflow(fx.db, {
        id: plan.id,
        approval: { approved_by: 'owner', approval_note: 'Approval cannot hide missing coverage.' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_PLAN_COVERAGE_INCOMPLETE',
    );

    const quick = changes.createChange(fx.db, completeChangeInput({
      id: 'quick-size-change', title: 'Keep quick work bounded', kind: 'quick',
      intent: 'Reject a quick profile that expands into multiple execution tasks.',
    }), { rootDir: fx.rootDir });
    for (const id of ['quick-one', 'quick-two']) {
      ops.createTask(fx.db, {
        id, title: id, type: 'feature', priority: 'P0', change_id: quick.change.id,
        outcome: `${id} outcome`, slice_kind: 'tracer_bullet', public_seam: `${id} seam`,
        verification_command: `node --test ${id}.test.cjs`,
        acceptance: [{
          id: 'quick-size-change-acceptance', criterion: 'Quick behavior works.',
          verification: `node --test ${id}.test.cjs`,
        }],
        context_refs: [{ ref: '.ultra/specs/product.md', reason: 'Baseline.', required: true }],
        docs_impact: { status: 'none', files: [], rationale: 'Fixture only.' },
        ownership: { owner: 'test-owner', reviewers: [] }, trace_to: '.ultra/specs/product.md#product',
      });
    }
    const quickPlan = startWorkflow(fx.db, {
      id: 'quick-size-plan', kind: 'plan', change_id: quick.change.id,
      baseline_id: 'baseline', subject: 'Validate quick task count.',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => workflows.validatePlanContract(fx.db, quickPlan),
      (error) => error.code === 'WORKFLOW_QUICK_PLAN_TOO_LARGE',
    );
  } finally {
    cleanup(fx);
  }
});

test('plan workflow is bound to the baseline recorded by its owning change workflow', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('other-baseline', 'other', 'greenfield', 'draft')`,
    ).run();
    const changeId = insertChange(fx, 'baseline-bound-plan', 'active', { link: false });
    startWorkflow(fx.db, {
      id: 'baseline-bound-change', kind: 'change', baseline_id: 'baseline',
      change_id: changeId, subject: 'Bind the change to its originating baseline.',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'wrong-baseline-plan', kind: 'plan', baseline_id: 'other-baseline',
        change_id: changeId, subject: 'Attempt to plan against another baseline.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_BASELINE_MISMATCH',
    );
    assert.equal(startWorkflow(fx.db, {
      id: 'bound-plan', kind: 'plan', baseline_id: 'baseline',
      change_id: changeId, subject: 'Plan against the bound baseline.',
    }, { rootDir: fx.rootDir }).status, 'active');
  } finally {
    cleanup(fx);
  }
});

test('change-bound stages inherit one baseline authority and reject drift or terminal changes', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('other-baseline', 'other', 'greenfield', 'draft')`,
    ).run();
    const changeId = insertChange(fx, 'stage-authority');
    const testRun = startWorkflow(fx.db, {
      id: 'stage-authority-test', kind: 'test', change_id: changeId,
      subject: 'Inherit the baseline bound by the change workflow.',
    }, { rootDir: fx.rootDir });
    assert.equal(testRun.baseline_id, 'baseline');

    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'stage-authority-review', kind: 'review', baseline_id: 'other-baseline',
        change_id: changeId, subject: 'Attempt cross-baseline review authority.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_BASELINE_MISMATCH',
    );

    fx.db.prepare("UPDATE changes SET status = 'archived' WHERE id = ?").run(changeId);
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'stage-authority-terminal', kind: 'review', change_id: changeId,
        subject: 'Attempt to reopen a terminal change through review.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_CHANGE_NOT_MUTABLE',
    );
  } finally {
    cleanup(fx);
  }
});

test('approved break-glass incident can plan without manufacturing a baseline id', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `INSERT INTO changes
       (id, title, kind, status, intent, baseline_bypass_json, artifact_root)
       VALUES ('incident-plan', 'Incident plan', 'incident', 'active', 'Recover service.', ?,
               '.ultra/changes/active/incident-plan')`,
    ).run(JSON.stringify({
      mode: 'incident_break_glass', reason: 'Production is unavailable.',
      approved_by: 'incident-commander', recorded_at: new Date().toISOString(),
    }));
    startWorkflow(fx.db, {
      id: 'incident-change-run', kind: 'change', change_id: 'incident-plan',
      subject: 'Bind approved incident authority.',
    }, { rootDir: fx.rootDir });
    assert.equal(startWorkflow(fx.db, {
      id: 'incident-plan-run', kind: 'plan', change_id: 'incident-plan',
      subject: 'Plan the recovery slice.',
    }, { rootDir: fx.rootDir }).baseline_id, null);
  } finally {
    cleanup(fx);
  }
});

test('delivery-stage workflows persist blockers and recover without losing completed steps', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'delivery-recovery');
    seedDeliveryPrerequisites(fx, changeId);
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    workflows.startWorkflow(fx.db, {
      id: 'deliver-run', kind: 'deliver', change_id: changeId,
      subject: 'Deliver the reviewed change.',
    }, { rootDir: fx.rootDir });
    workflows.recordWorkflowStep(fx.db, {
      id: 'deliver-run', step_id: 'bind-evidence', status: 'completed',
      evidence: [{ kind: 'test', ref: 'test:delivery-recovery', summary: 'Current report bound.' }],
    }, { rootDir: fx.rootDir });
    let blocked = workflows.recordWorkflowStep(fx.db, {
      id: 'deliver-run', step_id: 'reconcile-specifications', status: 'blocked',
      blockers: ['SPEC_LEARNING_UNRESOLVED'],
    }, { rootDir: fx.rootDir });
    assert.equal(blocked.status, 'blocked');
    assert.deepEqual(blocked.blockers, ['SPEC_LEARNING_UNRESOLVED']);

    blocked = workflows.recordWorkflowStep(fx.db, {
      id: 'deliver-run', step_id: 'reconcile-specifications', status: 'in_progress',
    }, { rootDir: fx.rootDir });
    assert.equal(blocked.status, 'active');
    assert.deepEqual(blocked.blockers, []);
    assert.equal(blocked.steps[0].status, 'completed');
  } finally {
    cleanup(fx);
  }
});

test('test completion validates its bound report and derives the durable gate result', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'test-report-change');
    const task = completedTask(fx, changeId, 'test-report-task');
    fx.db.prepare("UPDATE tasks SET type = 'bugfix' WHERE id = ?").run(task.id);
    let run = startWorkflow(fx.db, {
      id: 'test-report-run', kind: 'test', change_id: changeId,
      subject: 'Verify one current change.',
    }, { rootDir: fx.rootDir });
    const compiled = changes.compileContext(fx.db, {
      id: changeId, role: 'check', gate: 'verification',
    }, { rootDir: fx.rootDir });
    const contextPath = path.relative(fx.rootDir, compiled.context_manifest_path);
    const report = {
      $schema: 'ultra-test-report-v1',
      change_id: changeId,
      task_ids: [task.id],
      git_commit: null,
      worktree_digest: null,
      context_digest: compiled.manifest_hash,
      acceptance: [{ id: 'acceptance-1', status: 'fail', evidence: 'The accepted behavior is not satisfied.' }],
      commands: [{ command: 'node --test', status: 'pass', exit_code: 0, evidence: '1 passed' }],
      public_seams: [{ seam: 'workflow.complete', status: 'pass', evidence: 'Observed result.' }],
      failures: [],
      recovery: [],
      verification_dimensions: verificationDimensions(),
      regression_signal: null,
      passed: true,
      run_count: 1,
      timestamp: new Date().toISOString(),
      blocking_issues: [],
    };
    const reportPath = writeArtifact(
      fx, '.ultra/reports/tests/test-report-run.json', JSON.stringify(report, null, 2),
    );
    run = finishRequiredSteps(fx, run, (stepId) => {
      return stepId === 'compile-context' ? contextPath : reportPath;
    });
    assert.throws(
      () => completeWorkflow(fx.db, {
        id: run.id, summary: { passed: false, prompt_claim: 'must not become authority' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_SUMMARY_AUTHORITY_VIOLATION',
    );
    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_REPORT_INVALID',
    );
    report.acceptance[0].status = 'pass';
    report.acceptance[0].evidence = 'The accepted behavior is satisfied.';
    fs.writeFileSync(path.join(fx.rootDir, reportPath), JSON.stringify(report, null, 2));
    run = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'write-report', status: 'completed',
      evidence: [{ kind: 'test', ref: reportPath, summary: 'Corrected report evidence.' }],
      outputs: [{ path: reportPath, kind: 'test-evidence' }],
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_REGRESSION_SIGNAL_MISSING',
    );
    report.regression_signal = {
      command: 'node --test regression.test.cjs',
      expected_red: 'The stale report was incorrectly accepted.',
      observed_red: true,
      observed_green: true,
      deterministic: true,
      duration_ms: 12,
      evidence: 'The same regression test failed before the fix and passed after it.',
    };
    report.verification_dimensions.security = {
      status: 'not_run', evidence: [],
      rationale: 'Security applicability has not yet been resolved.',
    };
    fs.writeFileSync(path.join(fx.rootDir, reportPath), JSON.stringify(report, null, 2));
    run = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'write-report', status: 'completed',
      evidence: [{ kind: 'test', ref: reportPath, summary: 'Regression signal recorded.' }],
      outputs: [{ path: reportPath, kind: 'test-evidence' }],
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_REPORT_INVALID',
    );
    report.verification_dimensions.security = {
      status: 'not_applicable', evidence: [],
      rationale: 'The fixture changes no input, authorization, secret, or trust boundary.',
    };
    fs.writeFileSync(path.join(fx.rootDir, reportPath), JSON.stringify(report, null, 2));
    run = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'write-report', status: 'completed',
      evidence: [{ kind: 'test', ref: reportPath, summary: 'All verification dimensions resolved.' }],
      outputs: [{ path: reportPath, kind: 'test-evidence' }],
    }, { rootDir: fx.rootDir });
    const completed = completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir });
    assert.equal(completed.summary.passed, true);
    assert.equal(completed.summary.change_id, changeId);
    assert.equal(completed.summary.report_path, reportPath);
    assert.equal(Object.hasOwn(completed.summary, 'prompt_claim'), false);

    fs.writeFileSync(path.join(fx.rootDir, reportPath), '{}');
    assert.equal(
      workflows.readWorkflow(fx.db, run.id, { rootDir: fx.rootDir }).artifact_health.status,
      'fail',
    );
  } finally {
    cleanup(fx);
  }
});

test('later task commits do not invalidate completed development evidence for earlier tasks', () => {
  const fx = fixture();
  try {
    execFileSync('git', ['init', '-q'], { cwd: fx.rootDir });
    execFileSync('git', ['config', 'user.email', 'workflow@example.test'], { cwd: fx.rootDir });
    execFileSync('git', ['config', 'user.name', 'Workflow Test'], { cwd: fx.rootDir });
    fs.writeFileSync(path.join(fx.rootDir, '.gitignore'), '.ultra/\n');
    fs.writeFileSync(path.join(fx.rootDir, 'first.js'), 'module.exports = 1;\n');
    execFileSync('git', ['add', '.gitignore', 'first.js'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'first task'], { cwd: fx.rootDir });

    const changeId = insertChange(fx, 'multi-task-change');
    const first = completedTask(fx, changeId, 'first-task');
    const firstSnapshot = require('./baseline-workflow.cjs').gitWorktreeSnapshot(fx.rootDir, ['.']);
    fx.db.prepare('UPDATE workflow_runs SET summary_json = ? WHERE id = ?').run(
      JSON.stringify({
        task_id: first.id,
        git_commit: firstSnapshot.head,
        worktree_digest: firstSnapshot.digest,
      }),
      `dev-${first.id}`,
    );

    fs.writeFileSync(path.join(fx.rootDir, 'second.js'), 'module.exports = 2;\n');
    execFileSync('git', ['add', 'second.js'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'second task'], { cwd: fx.rootDir });
    const second = completedTask(fx, changeId, 'second-task');
    const secondSnapshot = require('./baseline-workflow.cjs').gitWorktreeSnapshot(fx.rootDir, ['.']);
    fx.db.prepare('UPDATE workflow_runs SET summary_json = ? WHERE id = ?').run(
      JSON.stringify({
        task_id: second.id,
        git_commit: secondSnapshot.head,
        worktree_digest: secondSnapshot.digest,
      }),
      `dev-${second.id}`,
    );

    const run = startWorkflow(fx.db, {
      id: 'multi-task-test', kind: 'test', change_id: changeId,
      subject: 'Verify the aggregate result after sequential task commits.',
    }, { rootDir: fx.rootDir });
    const bound = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'bind-scope', status: 'completed',
      evidence: [{ kind: 'git', ref: secondSnapshot.head, summary: 'All task commits are present.' }],
    }, { rootDir: fx.rootDir });
    assert.equal(bound.current_step, 'compile-context');
  } finally {
    cleanup(fx);
  }
});

test('review completion derives both verdict axes from the coordinated artifact', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'review-report-change');
    let run = startWorkflow(fx.db, {
      id: 'review-report-run', kind: 'review', change_id: changeId,
      subject: 'Review one current change.',
    }, { rootDir: fx.rootDir });
    const compiled = changes.compileContext(fx.db, {
      id: changeId, role: 'review', gate: 'review',
    }, { rootDir: fx.rootDir });
    const contextPath = path.relative(fx.rootDir, compiled.context_manifest_path);
    const specialist = (name, agent, axis) => writeArtifact(
      fx, `.ultra/reviews/review-report-change/${name}.json`, JSON.stringify({
        $schema: 'ultra-review-findings-v2', agent, axis,
        session: 'review-report-change', timestamp: new Date().toISOString(),
        scope: { head: 'workspace', range: 'working-tree', files_analyzed: ['src/index.js'], diff_only: true },
        status: 'complete', findings: [], positive_observations: [], limitations: [],
      }),
    );
    const spec = specialist('spec-fidelity', 'review-spec', 'spec_fidelity');
    const engineering = specialist('review-code', 'review-code', 'engineering_standards');
    const summary = writeArtifact(fx, '.ultra/reviews/review-report-change/SUMMARY.json', JSON.stringify({
      $schema: 'ultra-review-summary-v2', mode: 'change', session: 'review-report-change',
      change_id: changeId, task_ids: [], head: 'workspace', worktree_digest: null,
      context_digest: compiled.manifest_hash,
      status: 'complete', verdict: 'APPROVE',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: [spec] },
        engineering_standards: { verdict: 'PASS', evidence_refs: [engineering] },
      },
      workers: { completed: ['review-spec', 'review-code'], failed: [], skipped: [] },
      worker_selection: [
        { worker: 'review-spec', status: 'selected', rationale: 'Required specification axis.' },
        { worker: 'review-code', status: 'selected', rationale: 'Current runtime diff.' },
      ],
      findings: [], positive_observations: [], limitations: [],
    }, null, 2));
    run = finishRequiredSteps(fx, run, (stepId) => ({
      'compile-context': contextPath,
      'review-specification': spec,
      'review-engineering': engineering,
      'coordinate-findings': summary,
    })[stepId]);
    const completed = completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir });
    assert.equal(completed.summary.verdict, 'APPROVE');
    assert.equal(completed.summary.axes.spec_fidelity.verdict, 'PASS');
    assert.equal(completed.summary.axes.engineering_standards.verdict, 'PASS');
  } finally {
    cleanup(fx);
  }
});

test('review completion rejects a coordinated summary that drops a blocking specialist finding', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'review-omission-change');
    let run = startWorkflow(fx.db, {
      id: 'review-omission-run', kind: 'review', change_id: changeId,
      subject: 'Do not allow coordination to erase specialist evidence.',
    }, { rootDir: fx.rootDir });
    const compiled = changes.compileContext(fx.db, {
      id: changeId, role: 'review', gate: 'review',
    }, { rootDir: fx.rootDir });
    const contextPath = path.relative(fx.rootDir, compiled.context_manifest_path);
    const specialist = (name, agent, axis, findings = []) => writeArtifact(
      fx, `.ultra/reviews/review-omission-change/${name}.json`, JSON.stringify({
        $schema: 'ultra-review-findings-v2', agent, axis,
        session: 'review-omission-change', timestamp: new Date().toISOString(),
        scope: { head: 'workspace', range: 'working-tree', files_analyzed: ['src/index.js'], diff_only: true },
        status: 'complete', findings, positive_observations: [], limitations: [],
      }),
    );
    const spec = specialist('spec-fidelity', 'review-spec', 'spec_fidelity');
    const engineering = specialist('review-code', 'review-code', 'engineering_standards', [{
      id: 'review-code-001', axis: 'engineering_standards', severity: 'P1',
      category: 'correctness', title: 'Observable failure is unhandled',
      file: 'src/index.js', line: 1, line_end: 1,
      trigger: 'The public entry point receives invalid input.',
      impact: 'The accepted behavior fails without its documented recovery path.',
      evidence: 'The current branch returns before executing recovery.',
      suggestion: 'Route invalid input through the accepted recovery branch.',
    }]);
    const summary = writeArtifact(fx, '.ultra/reviews/review-omission-change/SUMMARY.json', JSON.stringify({
      $schema: 'ultra-review-summary-v2', mode: 'change', session: 'review-omission-change',
      change_id: changeId, task_ids: [], head: 'workspace', worktree_digest: null,
      context_digest: compiled.manifest_hash,
      status: 'complete', verdict: 'APPROVE',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: [spec] },
        engineering_standards: { verdict: 'PASS', evidence_refs: [engineering] },
      },
      workers: { completed: ['review-spec', 'review-code'], failed: [], skipped: [] },
      worker_selection: [
        { worker: 'review-spec', status: 'selected', rationale: 'Required specification axis.' },
        { worker: 'review-code', status: 'selected', rationale: 'Current runtime diff.' },
      ],
      findings: [], positive_observations: [], limitations: [],
    }, null, 2));
    run = finishRequiredSteps(fx, run, (stepId) => ({
      'compile-context': contextPath,
      'review-specification': spec,
      'review-engineering': engineering,
      'coordinate-findings': summary,
    })[stepId]);

    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_REVIEW_FINDINGS_MISMATCH',
    );
  } finally {
    cleanup(fx);
  }
});

test('delivery completion is bound to an archived change and a truthful release report', () => {
  const fx = fixture();
  try {
    const changeId = insertChange(fx, 'delivery-report-change');
    fx.db.prepare("UPDATE baselines SET status = 'ready' WHERE id = 'baseline'").run();
    seedDeliveryPrerequisites(fx, changeId);
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    let run = startWorkflow(fx.db, {
      id: 'delivery-report-run', kind: 'deliver', change_id: changeId,
      subject: 'Archive without an unauthorized release.',
    }, { rootDir: fx.rootDir });
    const compiled = changes.compileContext(fx.db, {
      id: changeId, role: 'check', gate: 'convergence',
    }, { rootDir: fx.rootDir });
    const contextPath = path.relative(fx.rootDir, compiled.context_manifest_path);
    const reportPath = writeArtifact(fx, '.ultra/reports/delivery/delivery-report-run.json', JSON.stringify({
      $schema: 'ultra-delivery-report-v1', change_id: changeId,
      archive_status: 'archived', baseline_id: 'baseline', baseline_status: 'ready',
      git_commit: null, worktree_digest: null,
      context_digest: compiled.manifest_hash,
      checks: [{ command: 'node --test', status: 'pass', exit_code: 0, evidence: 'All checks passed.' }],
      release: { authorized: false, performed: false, evidence: [] },
      rollback: 'Restore the archived change packet and authoritative DB backup.',
      timestamp: new Date().toISOString(),
    }, null, 2));
    run = finishRequiredSteps(fx, run, (stepId) => {
      return stepId === 'verify-candidate' ? contextPath : reportPath;
    });
    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_CHANGE_NOT_ARCHIVED',
    );
    fx.db.prepare("UPDATE changes SET status = 'archived' WHERE id = ?").run(changeId);
    const reportFile = path.join(fx.rootDir, reportPath);
    const conflictingReport = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    conflictingReport.release = {
      authorized: true, performed: true,
      evidence: [{
        kind: 'release', reference: 'fixture-release', status: 'pass',
        evidence: 'A fabricated release must not override the recorded owner decision.',
      }],
    };
    fs.writeFileSync(reportFile, JSON.stringify(conflictingReport, null, 2));
    run = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'verify-delivery', status: 'completed',
      evidence: [{ kind: 'delivery', ref: reportPath, summary: 'Conflicting release claim.' }],
      outputs: [{ path: reportPath, kind: 'delivery-report' }],
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_RELEASE_AUTHORITY_MISMATCH',
    );
    conflictingReport.release = { authorized: false, performed: false, evidence: [] };
    fs.writeFileSync(reportFile, JSON.stringify(conflictingReport, null, 2));
    run = recordWorkflowStep(fx.db, {
      id: run.id, step_id: 'verify-delivery', status: 'completed',
      evidence: [{ kind: 'delivery', ref: reportPath, summary: 'Release claim matches owner decision.' }],
      outputs: [{ path: reportPath, kind: 'delivery-report' }],
    }, { rootDir: fx.rootDir });
    const completed = completeWorkflow(fx.db, { id: run.id }, { rootDir: fx.rootDir });
    assert.equal(completed.summary.release.authorized, false);
    assert.equal(completed.summary.archive_status, 'archived');
  } finally {
    cleanup(fx);
  }
});

test('plan completion and dev startup require a complete DB-backed task execution contract', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `UPDATE baselines SET status = 'ready', approved_by = 'owner',
       approval_note = 'approved', converged_at = ? WHERE id = 'baseline'`,
    ).run(new Date().toISOString());
    fx.db.prepare(
      `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
       VALUES ('change', 'Plan contract', 'standard', 'active', 'Define an executable plan.',
               '.ultra/changes/active/change')`,
    ).run();
    startWorkflow(fx.db, {
      id: 'plan-contract-change', kind: 'change', baseline_id: 'baseline',
      change_id: 'change', subject: 'Bind the plan-contract fixture to its baseline.',
    }, { rootDir: fx.rootDir });
    const draft = ops.createTask(fx.db, {
      id: 'planned-task', title: 'Implement the planned seam', type: 'feature', priority: 'P0',
      change_id: 'change',
    });
    const omitted = ops.createTask(fx.db, {
      id: 'omitted-task', title: 'Keep every change task in plan authority',
      type: 'feature', priority: 'P1', change_id: 'change',
    });
    let plan = startWorkflow(fx.db, {
      id: 'plan-contract', kind: 'plan', baseline_id: 'baseline', change_id: 'change',
      subject: 'Create an executable delivery plan.', metadata: { task_ids: [draft.id] },
    }, { rootDir: fx.rootDir });
    for (const item of plan.steps.filter((candidate) => candidate.required)) {
      const input = { id: plan.id, step_id: item.step_id, status: 'completed' };
      if (WORKFLOW_DEFINITIONS.plan.find((definition) => definition.id === item.step_id).evidence_required) {
        input.evidence = [{ kind: 'test', ref: `fixture:${item.step_id}`, summary: 'Planning evidence.' }];
      }
      if (WORKFLOW_DEFINITIONS.plan.find((definition) => definition.id === item.step_id).output_required) {
        input.outputs = [{ path: writeArtifact(fx, `.ultra/${item.step_id}.md`, item.step_id), kind: 'plan' }];
      }
      plan = recordWorkflowStep(fx.db, input, { rootDir: fx.rootDir });
    }
    assert.throws(
      () => completeWorkflow(fx.db, { id: plan.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'TASK_EXECUTION_CONTRACT_INCOMPLETE',
    );
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'dev-draft', kind: 'dev', change_id: 'change', task_id: draft.id,
        subject: 'Implement an incomplete task.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'TASK_EXECUTION_CONTRACT_INCOMPLETE',
    );

    ops.patchTask(fx.db, draft.id, {
      outcome: 'One public status seam is complete.', slice_kind: 'tracer_bullet',
      public_seam: 'CLI status output', verification_command: 'npm test -- status',
      acceptance: [{ id: 'status', criterion: 'Status is visible.', verification: 'npm test -- status' }],
      context_refs: [{ ref: 'spec/mcp-tools.yaml', reason: 'Public contract.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'No user-facing documentation change.' },
      ownership: { owner: 'runtime-maintainer', reviewers: [] },
      trace_to: '.ultra/specs/product.md#product',
    });
    assert.throws(
      () => completeWorkflow(fx.db, {
        id: plan.id,
        approval: { approved_by: 'product-owner', approval_note: 'Approve only the first task.' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'TASK_EXECUTION_CONTRACT_INCOMPLETE',
    );
    ops.patchTask(fx.db, omitted.id, {
      outcome: 'The full change task set remains under one plan.', slice_kind: 'tracer_bullet',
      public_seam: 'Plan workflow task set', verification_command: 'npm test -- workflow-plan',
      acceptance: [{ id: 'full-set', criterion: 'No change task is omitted.', verification: 'npm test -- workflow-plan' }],
      context_refs: [{ ref: 'spec/mcp-tools.yaml', reason: 'Workflow contract.', required: true }],
      docs_impact: { status: 'none', files: [], rationale: 'No user-facing documentation change.' },
      ownership: { owner: 'runtime-maintainer', reviewers: [] },
      trace_to: '.ultra/specs/product.md#product',
    });
    const planPath = path.join(fx.rootDir, '.ultra', 'execution-plan.json');
    planStore.savePlanArtifact(
      planStore.buildPlan(
        ops.listTasks(fx.db, { change_id: 'change' }),
        { changeId: 'change' },
      ),
      planPath,
      'json',
    );
    plan = recordWorkflowStep(fx.db, {
      id: plan.id, step_id: 'verify-plan', status: 'completed',
      evidence: [{ kind: 'test', ref: 'fixture:verify-plan', summary: 'Planning evidence.' }],
      outputs: [{ path: '.ultra/execution-plan.json', kind: 'execution-plan' }],
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => completeWorkflow(fx.db, { id: plan.id }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_APPROVAL_REQUIRED',
    );
    assert.throws(
      () => completeWorkflow(fx.db, {
        id: plan.id,
        summary: { task_ids: [draft.id] },
        approval: { approved_by: 'product-owner', approval_note: 'Attempted prompt subset.' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_SUMMARY_AUTHORITY_VIOLATION',
    );
    const completedPlan = completeWorkflow(fx.db, {
      id: plan.id,
      approval: { approved_by: 'product-owner', approval_note: 'Approved complete scope and slices.' },
    }, { rootDir: fx.rootDir });
    assert.equal(completedPlan.status, 'completed');
    assert.deepEqual(completedPlan.summary.task_ids, ['omitted-task', 'planned-task']);
    assert.match(completedPlan.summary.task_contract_digests['planned-task'], /^[0-9a-f]{64}$/);
    const approvalEvents = ops.subscribeEventsSince(fx.db, {
      since_id: 0, types: ['plan_approved'], limit: 100,
    });
    assert.equal(approvalEvents.events.length, 1);
    assert.equal(approvalEvents.events[0].change_id, 'change');
    assert.equal(approvalEvents.events[0].payload.workflow_id, completedPlan.id);
    assert.equal(approvalEvents.events[0].payload.approved_by, 'product-owner');
    ops.patchTask(fx.db, draft.id, { public_seam: 'A changed seam without renewed plan approval' });
    assert.throws(
      () => startWorkflow(fx.db, {
        id: 'dev-stale-plan', kind: 'dev', change_id: 'change', task_id: draft.id,
        subject: 'Reject an unapproved task-contract change.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_PLAN_TASK_CONTRACT_STALE',
    );
    ops.patchTask(fx.db, draft.id, { public_seam: 'CLI status output' });
    assert.equal(startWorkflow(fx.db, {
      id: 'dev-ready', kind: 'dev', change_id: 'change', task_id: draft.id,
      subject: 'Implement the complete task contract.',
    }, { rootDir: fx.rootDir }).status, 'active');
  } finally {
    cleanup(fx);
  }
});
