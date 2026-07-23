'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initProject } = require('../lib/init-project.cjs');
const { openStateDb, closeStateDb } = require('../lib/state-db.cjs');
const baselines = require('../lib/baseline-workflow.cjs');
const changes = require('../lib/change-workflow.cjs');
const workflows = require('../lib/workflow-state.cjs');
const ops = require('../lib/state-ops.cjs');
const planStore = require('../lib/plan-store.cjs');
const {
  researchCoverage, semanticRecordsForStep,
} = require('../test-support/semantic-records.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function git(rootDir, args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function runNodeTest(rootDir, file) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath, ['--test', file], { cwd: rootDir, env });
}

function write(rootDir, relative, body) {
  const file = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return relative;
}

function evidence(stepId) {
  return [{ kind: 'e2e', ref: `e2e:${stepId}`, summary: `Verified ${stepId} in the full workflow.` }];
}

function finishSimpleSteps(db, rootDir, run, outputs = {}) {
  let current = run;
  for (const workflowStep of current.steps.filter((item) => item.required)) {
    const definition = workflows.WORKFLOW_DEFINITIONS[current.kind]
      .find((item) => item.id === workflowStep.step_id);
    const input = {
      id: current.id, step_id: workflowStep.step_id, status: 'completed',
    };
    if (definition.evidence_required) input.evidence = evidence(workflowStep.step_id);
    if (definition.output_required) {
      input.outputs = [{ path: outputs[workflowStep.step_id], kind: `${current.kind}-artifact` }];
    }
    current = workflows.recordWorkflowStep(db, input, { rootDir });
  }
  return current;
}

function reviewArtifacts(rootDir, {
  session, mode, changeId, taskIds, head, worktreeDigest, contextDigest,
}) {
  const directory = `.ultra/reviews/${session}`;
  const specialist = (file, agent, axis) => write(rootDir, `${directory}/${file}`, `${JSON.stringify({
    $schema: 'ultra-review-findings-v2', agent, axis, session,
    timestamp: new Date().toISOString(),
    scope: { head, range: `${head}^..${head}`, files_analyzed: ['src/status.js'], diff_only: true },
    status: 'complete', findings: [], positive_observations: [], limitations: [],
  }, null, 2)}\n`);
  const spec = specialist('spec-fidelity.json', 'review-spec', 'spec_fidelity');
  const engineering = specialist('review-code.json', 'review-code', 'engineering_standards');
  const summary = write(rootDir, `${directory}/SUMMARY.json`, `${JSON.stringify({
    $schema: 'ultra-review-summary-v2', mode, session, change_id: changeId, task_ids: taskIds,
    head, worktree_digest: worktreeDigest, context_digest: contextDigest,
    status: 'complete', verdict: 'APPROVE',
    axes: {
      spec_fidelity: { verdict: 'PASS', evidence_refs: [spec] },
      engineering_standards: { verdict: 'PASS', evidence_refs: [engineering] },
    },
    workers: {
      completed: ['review-spec', 'review-code'],
      failed: [],
      skipped: ['review-tests', 'review-errors', 'review-design', 'review-comments'],
    },
    worker_selection: [
      { worker: 'review-spec', status: 'selected', rationale: 'Required specification axis.' },
      { worker: 'review-code', status: 'selected', rationale: 'Current runtime diff.' },
      { worker: 'review-tests', status: 'skipped', rationale: 'No test artifact changed.' },
      { worker: 'review-errors', status: 'skipped', rationale: 'No failure path changed.' },
      { worker: 'review-design', status: 'skipped', rationale: 'No design boundary changed.' },
      { worker: 'review-comments', status: 'skipped', rationale: 'No maintained comments changed.' },
    ],
    findings: [], positive_observations: [], limitations: [],
  }, null, 2)}\n`);
  return { spec, engineering, summary };
}

function completeReview(db, rootDir, { id, changeId, taskId = null }) {
  const checkout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
  const taskIds = taskId
    ? [taskId]
    : ops.listTasks(db, {}).filter((task) => task.change_id === changeId).map((task) => task.id).sort();
  let run = workflows.startWorkflow(db, {
    id, kind: 'review', change_id: changeId, task_id: taskId,
    subject: `Review ${taskId || changeId} on both independent axes.`,
  }, { rootDir });
  const context = changes.compileContext(db, {
    id: changeId, task_id: taskId || undefined, role: 'review', gate: 'review',
  }, { rootDir });
  const contextPath = path.relative(rootDir, context.context_manifest_path);
  const artifacts = reviewArtifacts(rootDir, {
    session: id, mode: taskId ? 'task' : 'change', changeId, taskIds,
    head: checkout.head, worktreeDigest: checkout.digest,
    contextDigest: context.manifest_hash,
  });
  run = finishSimpleSteps(db, rootDir, run, {
    'compile-context': contextPath,
    'review-specification': artifacts.spec,
    'review-engineering': artifacts.engineering,
    'coordinate-findings': artifacts.summary,
  });
  return workflows.completeWorkflow(db, { id: run.id }, { rootDir });
}

for (const scenario of [
  { mode: 'greenfield', researchMode: 'full' },
  { mode: 'brownfield', researchMode: 'adoption' },
]) test(`${scenario.mode} initialization converges through research, plan, dev, test, review, and delivery`, () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-full-e2e-'));
  let db;
  try {
    write(rootDir, 'README.md', '# Full workflow fixture\n');
    if (scenario.mode === 'brownfield') {
      write(rootDir, 'src/legacy.js', "'use strict';\nexports.existingBehavior = () => true;\n");
    }

    const initialized = initProject({
      target_dir: rootDir, project_name: 'full-workflow', mode: 'auto',
    });
    assert.equal(initialized.mode, scenario.mode);
    assert.equal(initialized.workflow.research_status, 'not_started');
    assert.equal(initialized.workflow.research_mode, null);
    assert.equal(initialized.git.status, 'initialized');
    assert.equal(initialized.git.initial_commit_required, true);
    git(rootDir, ['config', 'user.email', 'test@ubp.dev']);
    git(rootDir, ['config', 'user.name', 'ubp-test']);
    git(rootDir, ['add', '.gitignore', 'README.md']);
    if (scenario.mode === 'brownfield') git(rootDir, ['add', 'src/legacy.js']);
    git(rootDir, ['commit', '-q', '-m', 'chore: establish project repository']);
    db = openStateDb(path.join(rootDir, '.ultra', 'state.db'));

    let research = workflows.startWorkflow(db, {
      id: `research-${scenario.mode}`,
      kind: 'research',
      mode: scenario.researchMode,
      baseline_id: initialized.baseline.id,
      subject: 'Establish the complete product and architecture baseline.',
      coverage: researchCoverage(),
    }, { rootDir });
    for (const workflowStep of research.steps.filter((item) => item.required)) {
      let output = '.ultra/specs/architecture.md';
      if (workflowStep.step_id.startsWith('0')) output = '.ultra/specs/discovery.md';
      else if (workflowStep.step_id.startsWith('1') || workflowStep.step_id.startsWith('2')) {
        output = '.ultra/specs/product.md';
      } else if (workflowStep.step_id === '99-synthesis') {
        output = '.ultra/specs/research-distillate.md';
      }
      fs.appendFileSync(path.join(rootDir, output), `\n## ${workflowStep.step_id}\n\nVerified E2E evidence.\n`);
      const report = write(
        rootDir,
        `.ultra/docs/research/${research.id}/${workflowStep.step_id}.md`,
        [
          `# ${workflowStep.step_id} evidence`, '',
          '## Evidence', '', 'Verified E2E evidence.', '',
          '## Specification updates', '', `Updated ${output}.`, '',
          '## Decisions and unknowns', '', 'No unresolved E2E fixture decision.', '',
        ].join('\n'),
      );
      const outputs = [{ path: report, kind: 'research-step-report' }];
      if (workflowStep.step_id === '99-synthesis') {
        outputs.push(
          { path: '.ultra/specs/discovery.md', kind: 'baseline-specification' },
          { path: '.ultra/specs/product.md', kind: 'baseline-specification' },
          { path: '.ultra/specs/architecture.md', kind: 'baseline-specification' },
          { path: '.ultra/specs/research-distillate.md', kind: 'research-distillate' },
        );
      }
      research = workflows.recordWorkflowStep(db, {
        id: research.id, step_id: workflowStep.step_id, status: 'completed',
        evidence: evidence(workflowStep.step_id),
        outputs,
        semantic_records: semanticRecordsForStep(research.id, workflowStep.step_id),
      }, { rootDir });
    }
    research = workflows.completeWorkflow(db, { id: research.id }, { rootDir });
    assert.equal(research.status, 'completed');

    const baselineId = initialized.baseline.id;
    const revision = git(rootDir, ['rev-parse', 'HEAD']);
    baselines.recordBaseline(db, {
      id: baselineId, repository_revision: revision, scope: ['.'],
      spec_refs: [
        { kind: 'discovery', path: '.ultra/specs/discovery.md' },
        { kind: 'product', path: '.ultra/specs/product.md' },
        { kind: 'architecture', path: '.ultra/specs/architecture.md' },
      ],
      evidence: scenario.mode === 'brownfield'
        ? [{ kind: 'source', ref: 'src/legacy.js', summary: 'Existing runtime behavior is observed.' }]
        : [{ kind: 'docs', ref: 'README.md', summary: 'Repository intent is documented.' }],
      verification: [{ name: 'fixture', command: 'node --version', status: 'pass', evidence: 'Runtime available.' }],
      unknowns: [], gaps: [], classification: initialized.repository_profile,
    }, { rootDir });
    const convergedBaseline = baselines.convergeBaseline(db, {
      id: baselineId, expected_revision: revision,
      approved_by: 'product-owner', approval_note: 'Approved the complete product and architecture baseline.',
    }, { rootDir });
    assert.equal(convergedBaseline.ready, true);

    const created = changes.createChange(db, completeChangeInput({
      id: 'daily-status', title: 'Add daily status seam', kind: 'quick',
      intent: 'Expose one verified status function through the maintained runtime.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal fixture API only.' },
      contract: {
        outcome: 'The maintained runtime exposes a verified ready status.',
        acceptance: [{
          id: 'status-ready', criterion: 'getStatus returns ready.',
          verification: 'node --test test/status.test.js',
        }],
        non_goals: ['Unrelated runtime behavior.'],
        public_seams: ['src/status.js#getStatus'],
        recovery: {
          strategy: 'Remove the bounded status seam.',
          verification: 'Run the pre-change runtime test suite.',
        },
        unresolved_decisions: [],
      },
    }), { rootDir });
    const task = ops.createTask(db, {
      id: 'status-task', title: 'Implement status seam', type: 'feature', priority: 'P0',
      change_id: created.change.id, outcome: 'The status seam returns ready.',
      slice_kind: 'tracer_bullet', public_seam: 'src/status.js#getStatus',
      verification_command: 'node --test test/status.test.js',
      acceptance: [{
        id: 'status-ready', criterion: 'getStatus returns ready.',
        verification: 'node --test test/status.test.js',
      }],
      context_refs: [{
        ref: '.ultra/specs/product.md', kind: 'spec', reason: 'Accepted product behavior.', required: true,
      }],
      docs_impact: { status: 'none', files: [], rationale: 'Internal fixture API only.' },
      ownership: { owner: 'runtime-maintainer', reviewers: ['product-owner'] },
      trace_to: '.ultra/specs/product.md#20-user-stories',
    });
    write(rootDir, '.ultra/changes/active/daily-status/plan.md', '# Plan\n\nImplement and verify one seam.\n');
    let plan = workflows.startWorkflow(db, {
      id: 'plan-daily-status', kind: 'plan', baseline_id: baselineId,
      change_id: created.change.id, subject: 'Plan the complete accepted status seam.',
      metadata: { task_ids: [task.id] },
    }, { rootDir });
    planStore.savePlanArtifact(
      planStore.buildPlan([ops.readTask(db, task.id)], { changeId: created.change.id }),
      path.join(rootDir, '.ultra', 'execution-plan.json'),
      'json',
    );
    plan = finishSimpleSteps(db, rootDir, plan, {
      'verify-plan': '.ultra/execution-plan.json',
    });
    workflows.completeWorkflow(db, {
      id: plan.id,
      approval: { approved_by: 'product-owner', approval_note: 'Approved the complete status scope.' },
    }, { rootDir });

    const plannedContext = changes.compileContext(db, {
      id: created.change.id, task_id: task.id, role: 'implement',
    }, { rootDir });
    let changeRun = workflows.readWorkflow(db, created.workflow.id, { rootDir });
    assert.equal(changeRun.status, 'completed');
    assert.equal(changeRun.current_step, null);
    assert.ok(plannedContext.manifest.control.allowed_transitions.includes('ultra-dev'));

    let dev = workflows.startWorkflow(db, {
      id: 'dev-status-task', kind: 'dev', change_id: created.change.id, task_id: task.id,
      subject: 'Implement the status task through its public seam.',
    }, { rootDir });
    for (const stepId of ['bind-task', 'compile-context', 'establish-feedback-loop']) {
      const stepInput = {
        id: dev.id, step_id: stepId, status: 'completed', evidence: evidence(stepId),
      };
      if (stepId === 'compile-context') {
        stepInput.outputs = [{
          path: path.relative(rootDir, plannedContext.context_manifest_path),
          kind: 'context-manifest',
        }];
      }
      dev = workflows.recordWorkflowStep(db, stepInput, { rootDir });
    }
    ops.updateTaskStatus(db, task.id, 'in_progress');
    write(rootDir, 'src/status.js', "'use strict';\nexports.getStatus = () => 'ready';\n");
    write(rootDir, 'test/status.test.js', [
      "'use strict';",
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { getStatus } = require('../src/status.js');",
      "test('status is ready', () => assert.equal(getStatus(), 'ready'));",
      '',
    ].join('\n'));
    runNodeTest(rootDir, 'test/status.test.js');
    git(rootDir, ['add', 'src/status.js', 'test/status.test.js']);
    git(rootDir, ['commit', '-q', '-m', 'feat: add status seam']);
    const implementationHead = git(rootDir, ['rev-parse', 'HEAD']);
    ops.patchTask(db, task.id, { completion_commit: implementationHead });
    dev = workflows.recordWorkflowStep(db, {
      id: dev.id, step_id: 'implement-slice', status: 'completed',
    }, { rootDir });
    dev = workflows.recordWorkflowStep(db, {
      id: dev.id, step_id: 'verify-slice', status: 'completed',
      evidence: [{ kind: 'test', ref: 'node --test test/status.test.js', summary: 'Status seam passed.' }],
    }, { rootDir });
    completeReview(db, rootDir, {
      id: 'review-status-task', changeId: created.change.id, taskId: task.id,
    });
    dev = workflows.recordWorkflowStep(db, {
      id: dev.id, step_id: 'review-slice', status: 'completed',
      evidence: [{ kind: 'review', ref: 'review-status-task', summary: 'Both review axes passed.' }],
    }, { rootDir });
    ops.updateTaskStatus(db, task.id, 'completed');
    dev = workflows.recordWorkflowStep(db, {
      id: dev.id, step_id: 'record-completion', status: 'completed',
      evidence: [{ kind: 'commit', ref: implementationHead, summary: 'Task completion is committed.' }],
    }, { rootDir });
    dev = workflows.completeWorkflow(db, { id: dev.id }, { rootDir });
    assert.equal(dev.summary.review_workflow_id, 'review-status-task');

    let testRun = workflows.startWorkflow(db, {
      id: 'test-daily-status', kind: 'test', change_id: created.change.id,
      subject: 'Verify the complete current status change.',
    }, { rootDir });
    const checkedContext = changes.compileContext(db, {
      id: created.change.id, task_id: task.id, role: 'check',
    }, { rootDir });
    const testCheckout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
    const testReport = write(rootDir, `.ultra/reports/tests/${testRun.id}.json`, `${JSON.stringify({
      $schema: 'ultra-test-report-v1', change_id: created.change.id, task_ids: [task.id],
      git_commit: testCheckout.head, worktree_digest: testCheckout.digest,
      context_digest: checkedContext.manifest_hash,
      acceptance: [{ id: 'status-ready', status: 'pass', evidence: 'Observed ready.' }],
      commands: [{ command: 'node --test test/status.test.js', status: 'pass', exit_code: 0, evidence: '1 passed.' }],
      public_seams: [{ seam: 'src/status.js#getStatus', status: 'pass', evidence: 'Returned ready.' }],
      failures: [], recovery: [],
      verification_profile: {
        rationale: 'Exercise behavior, regression, integration, and recovery for this bounded runtime change.',
        selected_dimensions: ['acceptance', 'regression', 'integration', 'recovery'],
        excluded_dimensions: [
          { dimension: 'static_analysis', rationale: 'The fixture has no repository-native static analyzer.' },
          { dimension: 'build', rationale: 'The fixture has no separate build product.' },
          { dimension: 'performance', rationale: 'The bounded status seam has no material performance risk.' },
          { dimension: 'security', rationale: 'The fixture changes no trust or authorization boundary.' },
        ],
      },
      verification_dimensions: {
        acceptance: { status: 'pass', evidence: ['Status acceptance passed.'], rationale: 'Required.' },
        regression: { status: 'pass', evidence: ['Node test suite passed.'], rationale: 'Required.' },
        integration: { status: 'pass', evidence: ['Exported status seam executed.'], rationale: 'Required.' },
        recovery: { status: 'pass', evidence: ['Status recovery route checked.'], rationale: 'Required.' },
      },
      regression_signal: null, passed: true, run_count: 1,
      timestamp: new Date().toISOString(), blocking_issues: [],
    }, null, 2)}\n`);
    testRun = finishSimpleSteps(db, rootDir, testRun, {
      'compile-context': path.relative(rootDir, checkedContext.context_manifest_path),
      'write-report': testReport,
    });
    testRun = workflows.completeWorkflow(db, { id: testRun.id }, { rootDir });
    assert.equal(testRun.summary.passed, true);

    const changeReview = completeReview(db, rootDir, {
      id: 'review-daily-status', changeId: created.change.id,
    });
    assert.equal(changeReview.summary.verdict, 'APPROVE');

    const convergedChange = changes.convergeChange(
      db, { id: created.change.id }, { rootDir },
    );
    assert.equal(convergedChange.ready, true);

    let deliver = workflows.startWorkflow(db, {
      id: 'deliver-daily-status', kind: 'deliver', baseline_id: baselineId,
      change_id: created.change.id, subject: 'Archive the verified status change without publishing.',
    }, { rootDir });
    const convergenceContext = changes.compileContext(db, {
      id: created.change.id, role: 'check', gate: 'convergence',
    }, { rootDir });
    for (const stepId of ['bind-evidence', 'reconcile-specifications', 'verify-candidate', 'converge-authority']) {
      const stepInput = {
        id: deliver.id, step_id: stepId, status: 'completed', evidence: evidence(stepId),
      };
      if (stepId === 'verify-candidate') {
        stepInput.outputs = [{
          path: path.relative(rootDir, convergenceContext.context_manifest_path),
          kind: 'context-manifest',
        }];
      }
      deliver = workflows.recordWorkflowStep(db, stepInput, { rootDir });
    }
    const reconciliationPath = write(
      rootDir,
      '.ultra/changes/active/daily-status/baseline-reconciliation.json',
      `${JSON.stringify({
        $schema: 'ultra-baseline-reconciliation-v1',
        change_id: created.change.id,
        baseline_id: baselineId,
        baseline_updates: [],
        semantic_changes: [],
        resolved_gap_ids: [],
        resolved_unknowns: [],
        verification: [{
          name: 'delivery read-back', command: 'node --test test/status.test.js', status: 'pass',
          evidence: 'The accepted behavior passed without changing baseline specifications.',
        }],
        semantic_no_change_reason: 'The accepted baseline behavior did not change.',
      }, null, 2)}\n`,
    );
    const archived = changes.archiveChange(db, {
      id: created.change.id, summary: 'Status seam verified and archived.',
      no_baseline_change_reason: 'The accepted baseline behavior did not change.',
      reconciliation_path: reconciliationPath,
    }, { rootDir });
    deliver = workflows.recordWorkflowStep(db, {
      id: deliver.id, step_id: 'archive-change', status: 'completed',
      evidence: [{ kind: 'archive', ref: path.relative(rootDir, archived.archive_path), summary: 'Change packet archived.' }],
    }, { rootDir });
    const deliveryCheckout = baselines.gitWorktreeSnapshot(rootDir, ['.']);
    const deliveryReport = write(rootDir, `.ultra/reports/delivery/${deliver.id}.json`, `${JSON.stringify({
      $schema: 'ultra-delivery-report-v1', change_id: created.change.id,
      archive_status: 'archived', baseline_id: baselineId, baseline_status: 'ready',
      git_commit: deliveryCheckout.head, worktree_digest: deliveryCheckout.digest,
      context_digest: convergenceContext.manifest_hash,
      checks: [{ command: 'node --test test/status.test.js', status: 'pass', exit_code: 0, evidence: '1 passed.' }],
      rollback: 'Restore the managed state backup and archived packet.',
      timestamp: new Date().toISOString(),
    }, null, 2)}\n`);
    deliver = workflows.recordWorkflowStep(db, {
      id: deliver.id, step_id: 'verify-delivery', status: 'completed',
      evidence: [{ kind: 'delivery', ref: deliveryReport, summary: 'Local delivery evidence agrees.' }],
      outputs: [{ path: deliveryReport, kind: 'delivery-report' }],
    }, { rootDir });
    deliver = workflows.completeWorkflow(db, { id: deliver.id }, { rootDir });

    assert.equal(deliver.status, 'completed');
    assert.equal(deliver.summary.release, undefined);
    assert.equal(changes.readChange(db, created.change.id).status, 'archived');
    assert.equal(baselines.inspectBaseline(db, { rootDir }).status, 'pass');
    const workflowHealth = workflows.inspectWorkflowHealth(db, { rootDir });
    assert.equal(workflowHealth.status, 'pass');
    assert.equal(workflowHealth.active, 0);
  } finally {
    if (db) closeStateDb(db);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
