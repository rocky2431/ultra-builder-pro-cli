'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const changes = require('./change-workflow.cjs');
const baselines = require('./baseline-workflow.cjs');
const archiveJournal = require('./archive-journal.cjs');
const workflows = require('./workflow-state.cjs');
const decisions = require('./decision-dialogue.cjs');
const planStore = require('./plan-store.cjs');
const artifactRegistry = require('./artifact-registry.cjs');
const contextSpine = require('./context-spine.cjs');
const {
  seedReadyBaseline,
  seedCompletedWorkflowStructure,
} = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-change-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(
    path.join(rootDir, '.ultra', '.runtime', 'state.db'),
  );
  seedReadyBaseline(db, { rootDir });
  return { rootDir, db };
}

function cleanup({ rootDir, db }) {
  closeStateDb(db);
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function executionContext(taskId, overrides = {}) {
  return {
    task_id: taskId,
    role: 'implement',
    gate: 'implementation',
    context_refs: [
      {
        ref: 'README.md', kind: 'spec', reason: 'Public behavior contract', required: true,
      },
    ],
    budget: { max_tokens: 2_000, max_files: 4 },
    execution_contract: {
      context_budget_percent: 40,
    },
    ...overrides,
  };
}

function createExecutableTask(db, input) {
  return ops.createTask(db, {
    ...input,
    outcome: input.outcome || `Complete the observable outcome for ${input.id}.`,
    slice_kind: input.slice_kind || 'tracer_bullet',
    public_seam: input.public_seam || `public seam for ${input.id}`,
    verification_command: input.verification_command || `node --test ${input.id}.test.cjs`,
    acceptance: input.acceptance || [{
      id: 'fixture-change-acceptance',
      criterion: `The public seam for ${input.id} is observable.`,
      verification: `node --test ${input.id}.test.cjs`,
    }],
    context_refs: input.context_refs || [{
      ref: 'README.md', kind: 'spec', reason: 'Public behavior contract', required: true,
    }],
    docs_impact: input.docs_impact || {
      status: 'none', files: [], rationale: 'The fixture has no public documentation impact.',
    },
    ownership: input.ownership || { owner: 'test-owner', reviewers: [] },
    trace_to: input.trace_to || 'README.md#fixture',
  });
}

function writeReconciliation(fx, {
  changeId, updates = [], noChangeReason = null, resolvedGapIds = [], resolvedUnknowns = [],
  verificationEvidence = 'The reconciled specification and baseline state were read back.',
} = {}) {
  const baseline = baselines.readBaseline(fx.db);
  const semanticChanges = updates.map((relative) => {
    const ref = baseline.spec_refs.find((item) => item.path === relative);
    const file = path.join(fx.rootDir, relative);
    const after = require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const anchor = path.basename(relative, path.extname(relative)).toLowerCase();
    return {
      id: `reconcile-${anchor}`,
      source_ref: `${relative}#${anchor}`,
      action: ref ? 'update' : 'add',
      before_digest: ref?.digest || null,
      after_digest: after,
    };
  });
  const relative = path.join('.ultra', 'changes', 'active', changeId, 'baseline-reconciliation.json');
  fs.mkdirSync(path.dirname(path.join(fx.rootDir, relative)), { recursive: true });
  fs.writeFileSync(path.join(fx.rootDir, relative), `${JSON.stringify({
    $schema: 'ultra-baseline-reconciliation-v1',
    change_id: changeId,
    baseline_id: baseline?.id || null,
    baseline_updates: updates,
    semantic_changes: semanticChanges,
    resolved_gap_ids: resolvedGapIds,
    resolved_unknowns: resolvedUnknowns,
    verification: [{
      name: 'reconciliation read-back', command: 'ubp status', status: 'pass',
      evidence: verificationEvidence,
    }],
    semantic_no_change_reason: updates.length === 0 ? noChangeReason : null,
  }, null, 2)}\n`);
  artifactRegistry.recordArtifact(fx.db, {
    id: `${changeId}-baseline-reconciliation`,
    owner_type: 'change',
    owner_id: changeId,
    kind: 'baseline_reconciliation',
    path: relative,
    source_refs: [{ type: 'change', id: changeId, relation: 'produced_for' }],
    consumer_refs: [],
    provenance: { writer: 'change-workflow-test' },
    metadata: { terminal_role: true },
  }, { rootDir: fx.rootDir });
  return relative;
}

function publishReboundReconciliationWithoutDbCommit(fx, input) {
  const change = changes.readChange(fx.db, input.id);
  const activeFile = path.join(fx.rootDir, input.reconciliation_path);
  const before = fs.readFileSync(activeFile);
  const interrupted = archiveJournal.prepareArchiveMove({
    rootDir: fx.rootDir,
    change,
    summary: input.summary,
    baselineUpdates: input.baseline_updates || [],
    noBaselineChangeReason: input.no_baseline_change_reason || null,
    reconciliationPath: input.reconciliation_path,
    reconciliationDigest: require('node:crypto').createHash('sha256')
      .update(before).digest('hex'),
    reconciliationManifest: JSON.parse(before.toString('utf8')),
  });
  const archivedRelative = path.posix.join(
    interrupted.intent.destination,
    path.posix.relative(interrupted.intent.source, input.reconciliation_path),
  );
  const archivedFile = path.join(fx.rootDir, archivedRelative);
  const after = Buffer.from(
    fs.readFileSync(archivedFile, 'utf8')
      .replaceAll(interrupted.intent.source, interrupted.intent.destination),
  );
  archiveJournal.prepareArchiveRebind(fx.rootDir, interrupted.intent, [{
    relative_path: path.posix.relative(interrupted.intent.destination, archivedRelative),
    before_digest: require('node:crypto').createHash('sha256').update(before).digest('hex'),
    after_digest: require('node:crypto').createHash('sha256').update(after).digest('hex'),
    before_base64: before.toString('base64'),
    after_base64: after.toString('base64'),
  }]);
  return {
    interrupted,
    archivedRelative,
    afterDigest: require('node:crypto').createHash('sha256').update(after).digest('hex'),
  };
}

function seedGateWorkflows(fx, changeId) {
  const tasks = fx.db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY id')
    .all(changeId).map((row) => ops.readTask(fx.db, row.id));
  const checkout = baselines.gitWorktreeSnapshot(fx.rootDir, ['.']);
  const ts = new Date().toISOString();
  const insert = fx.db.prepare(
    `INSERT INTO workflow_runs
     (id, kind, subject, definition_version, status, baseline_id, change_id, task_id,
      metadata_json, blockers_json, summary_json, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', NULL, ?, ?, '{}', '[]', ?, ?, ?, ?)`,
  );
  for (const task of tasks.filter((item) => item.status !== 'expanded')) {
    const runId = `gate-dev-${task.id}`;
    insert.run(
      runId, 'dev', `Verified development for ${task.id}.`,
      workflows.DEFINITION_VERSION, changeId, task.id,
      JSON.stringify({
        change_id: changeId, task_id: task.id, public_seam: task.public_seam,
        verification_command: task.verification_command,
        git_commit: checkout.head, worktree_digest: checkout.digest,
      }), ts, ts, ts,
    );
    seedCompletedWorkflowStructure(fx.db, runId, 'dev', ts);
  }
  const taskIds = tasks.map((task) => task.id).sort();
  const needsSignal = fx.db.prepare('SELECT kind FROM changes WHERE id = ?').get(changeId)?.kind === 'incident'
    || tasks.some((task) => task.type === 'bugfix');
  const regressionSignal = needsSignal ? {
    command: `node --test ${changeId}.test.cjs`,
    expected_red: 'The regression reproduced the pre-fix failure.',
    observed_red: true,
    observed_green: true,
    deterministic: true,
    evidence: 'The same deterministic check failed before the fix and passed afterward.',
  } : null;
  insert.run(
    `gate-test-${changeId}`, 'test', `Verified change ${changeId}.`,
    workflows.DEFINITION_VERSION, changeId, null,
    JSON.stringify({
      change_id: changeId, task_ids: taskIds, passed: true,
      acceptance_ids: changes.readChange(fx.db, changeId).contract.acceptance
        .map((item) => item.id).sort(),
      git_commit: checkout.head, worktree_digest: checkout.digest,
      report_path: `.ultra/reports/tests/gate-test-${changeId}.json`,
      report_digest: 'fixture-test-report', regression_signal: regressionSignal,
    }), ts, ts, ts,
  );
  seedCompletedWorkflowStructure(fx.db, `gate-test-${changeId}`, 'test', ts);
  insert.run(
    `gate-review-${changeId}`, 'review', `Reviewed change ${changeId}.`,
    workflows.DEFINITION_VERSION, changeId, null,
    JSON.stringify({
      change_id: changeId, task_ids: taskIds, mode: 'change', verdict: 'APPROVE',
      git_commit: checkout.head, worktree_digest: checkout.digest,
      report_path: `.ultra/reviews/${changeId}/SUMMARY.json`,
      report_digest: 'fixture-review-report',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: ['fixture:spec-fidelity'] },
        engineering_standards: { verdict: 'PASS', evidence_refs: ['fixture:engineering-standards'] },
      },
    }), ts, ts, ts,
  );
  seedCompletedWorkflowStructure(fx.db, `gate-review-${changeId}`, 'review', ts);
}

function seedNoopPacketAndPlan(fx, changeId) {
  const change = changes.readChange(fx.db, changeId);
  const baseline = baselines.readBaseline(fx.db);
  const tasks = fx.db.prepare('SELECT id FROM tasks WHERE change_id = ? ORDER BY id')
    .all(changeId).map((row) => ops.readTask(fx.db, row.id));
  const planningContext = changes.compileContext(fx.db, {
    id: changeId,
    role: 'plan',
    gate: 'planning',
  }, { rootDir: fx.rootDir });
  const savedPlan = planStore.saveChangePlanArtifacts(
    planStore.buildPlan(tasks, { changeId }),
    {
      rootDir: fx.rootDir,
      change,
      tasks,
      context: {
        snapshot_id: planningContext.manifest.snapshot_id,
        manifest_path: path.relative(fx.rootDir, planningContext.context_manifest_path),
        manifest_digest: planningContext.manifest_hash,
      },
    },
  );
  for (const [id, kind, file] of [
    [`${changeId}-plan-json`, 'execution_plan', savedPlan.plan_path],
    [`${changeId}-plan-md`, 'execution_plan_markdown', savedPlan.plan_md_path],
  ]) {
    artifactRegistry.recordArtifact(fx.db, {
      id,
      owner_type: 'change',
      owner_id: changeId,
      kind,
      path: path.relative(fx.rootDir, file).split(path.sep).join('/'),
      provenance: { writer: 'change-workflow-test-fixture' },
      source_refs: [{ type: 'change', id: changeId, relation: 'planned_from' }],
      consumer_refs: [],
      metadata: { terminal_role: true },
    }, { rootDir: fx.rootDir });
  }
  const delta = changes.recordDelta(fx.db, {
    id: changeId,
    baseline_anchor: {
      baseline_id: baseline.id,
      repository_revision: baseline.repository_revision,
      specs: baseline.spec_refs.map((item) => ({ path: item.path, digest: item.digest })),
    },
    decisions: [],
    non_goals: change.contract.non_goals,
    acceptance: change.contract.acceptance,
    documentation_impact: change.docs_impact,
    unknowns: [],
    no_semantic_change_reason: 'This fixture changes runtime behavior without baseline spec mutations.',
    mutations: [],
  }, { rootDir: fx.rootDir });
  changes.recordDocumentationReconciliation(fx.db, {
    id: changeId,
    delta_artifact_id: delta.artifact.id,
    delta_digest: delta.artifact.digest,
    no_change_reason: 'The accepted Change has no documentation mutation.',
    documents: [],
  }, { rootDir: fx.rootDir });
}

function prepareReadyArchiveChange(fx, changeId) {
  changes.createChange(fx.db, { ...completeChangeInput(),
    id: changeId,
    title: `Archive ${changeId}`,
    kind: 'quick',
    intent: `Archive ${changeId} without weakening artifact authority.`,
    docs_impact: { status: 'none', files: [], rationale: 'Workflow integrity only.' },
  }, { rootDir: fx.rootDir });
  const taskId = `${changeId}-task`;
  createExecutableTask(fx.db, {
    id: taskId, title: `Complete ${changeId}`, type: 'bugfix', priority: 'P0',
    change_id: changeId,
  });
  ops.updateTaskStatus(fx.db, taskId, 'in_progress');
  ops.updateTaskStatus(fx.db, taskId, 'completed');
  changes.compileContext(fx.db, {
    id: changeId, ...executionContext(taskId),
  }, { rootDir: fx.rootDir });
  seedGateWorkflows(fx, changeId);
  const converged = changes.convergeChange(
    fx.db, { id: changeId }, { rootDir: fx.rootDir },
  );
  assert.equal(converged.ready, true);
  return changes.readChange(fx.db, changeId);
}

test('change creation requires a complete contract, classification rationale, and research disposition', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, {
        id: 'chg-incomplete-contract', title: 'Reject incomplete change', kind: 'standard',
        intent: 'Do not let prose masquerade as an executable change contract.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'CHANGE_CONTRACT_REQUIRED',
    );
    const created = changes.createChange(fx.db, completeChangeInput({
      id: 'chg-complete-contract', title: 'Persist complete change', kind: 'standard',
      intent: 'Persist accepted outcomes, verification, recovery, and research routing.',
    }), { rootDir: fx.rootDir });
    assert.equal(created.change.contract.acceptance[0].id, 'chg-complete-contract-acceptance');
    assert.match(created.change.classification.rationale, /smallest profile/);
    assert.equal(created.change.research_disposition.status, 'none');
    assert.match(fs.readFileSync(created.intent_path, 'utf8'), /## Acceptance/);
  } finally {
    cleanup(fx);
  }
});

test('a ready Change reopens when accepted semantic intent is revised', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, completeChangeInput({
      id: 'ready-reopen',
      title: 'Ready draft',
      kind: 'standard',
      intent: 'The first accepted intent.',
    }), { rootDir: fx.rootDir });
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = 'ready-reopen'").run();

    const updated = changes.updateChange(fx.db, 'ready-reopen', {
      intent: 'The corrected accepted intent.',
    }, { rootDir: fx.rootDir });

    assert.equal(updated.status, 'active');
    assert.equal(updated.intent, 'The corrected accepted intent.');
  } finally {
    cleanup(fx);
  }
});

test('compiling identical context twice reuses one content-addressed snapshot', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, completeChangeInput({
      id: 'context-idempotent',
      title: 'Idempotent context',
      kind: 'standard',
      intent: 'The same semantic inputs produce the same Context snapshot.',
    }), { rootDir: fx.rootDir });

    const input = {
      id: 'context-idempotent',
      role: 'plan',
      gate: 'planning',
      context_refs: [{
        ref: 'README.md',
        kind: 'spec',
        reason: 'Current fixture boundary.',
        required: true,
      }],
      budget: { max_tokens: 2_000, max_files: 4 },
    };
    const first = changes.compileContext(fx.db, input, { rootDir: fx.rootDir });
    const second = changes.compileContext(fx.db, input, { rootDir: fx.rootDir });

    assert.equal(second.manifest.snapshot_id, first.manifest.snapshot_id);
    assert.equal(second.manifest_hash, first.manifest_hash);
    assert.equal(second.context_manifest_path, first.context_manifest_path);
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM context_snapshots WHERE change_id = 'context-idempotent'",
      ).get().count,
      1,
    );
  } finally {
    cleanup(fx);
  }
});

test('change creation binds a confirmed alignment checkpoint without copying the transcript', () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'alignment-contract', baseline_id: 'test-baseline',
      purpose: 'Align the bounded change contract.', mode: 'guided',
    });
    decisions.openDecision(fx.db, {
      id: 'alignment-scope', thread_id: 'alignment-contract', phase: 'change-contract',
      question: 'Should this change preserve the public seam?',
      why_now: 'The answer changes acceptance and recovery.',
      recommendation: 'Preserve the seam for one release.',
      effects: { summary: 'Changes contract acceptance and recovery.' },
    });
    assert.throws(
      () => changes.createChange(fx.db, completeChangeInput({
        id: 'premature-change', title: 'Reject premature change', kind: 'standard',
        intent: 'Do not create the change while baseline alignment is still open.',
      }), { rootDir: fx.rootDir }),
      (error) => error.code === 'CHANGE_ALIGNMENT_REQUIRED',
    );
    decisions.resolveDecision(fx.db, {
      id: 'alignment-scope', decision: 'Preserve the seam for one release.',
      rationale: 'Active consumers need a migration window.', decided_by: 'owner',
    });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'alignment-contract', action: 'prepare', summary: 'Preserve the public seam.',
    }, { rootDir: fx.rootDir });
    const alignmentPath = '.ultra/docs/alignment/alignment-contract.md';
    fs.mkdirSync(path.dirname(path.join(fx.rootDir, alignmentPath)), { recursive: true });
    fs.writeFileSync(
      path.join(fx.rootDir, alignmentPath),
      '# Change alignment\n\nPreserve the public seam for one release.\n',
    );
    decisions.checkpointDecisionThread(fx.db, {
      id: 'alignment-contract', action: 'confirm', approved_by: 'owner',
      approval_note: 'Confirmed before opening the change.',
      artifacts: [{ path: alignmentPath, kind: 'alignment-projection' }],
    }, { rootDir: fx.rootDir });

    const created = changes.createChange(fx.db, completeChangeInput({
      id: 'aligned-change', title: 'Bind alignment', kind: 'standard',
      intent: 'Trace the accepted decision checkpoint into the durable change.',
      alignment_thread_id: 'alignment-contract',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }), { rootDir: fx.rootDir });
    assert.equal(created.change.alignment_thread_id, 'alignment-contract');
    assert.equal(
      decisions.readDecisionThread(fx.db, 'alignment-contract').change_id,
      'aligned-change',
    );
    const intent = fs.readFileSync(created.intent_path, 'utf8');
    assert.match(intent, /Alignment checkpoint/);
    assert.doesNotMatch(intent, /transcript|raw prompt/i);
  } finally {
    cleanup(fx);
  }
});

test('change creation rejects a confirmed alignment checkpoint without a current artifact', () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'alignment-without-artifact', baseline_id: 'test-baseline',
      purpose: 'Prove change alignment must be artifact-bound.', mode: 'guided',
    });
    decisions.openDecision(fx.db, {
      id: 'alignment-without-artifact-scope', thread_id: 'alignment-without-artifact',
      phase: 'change-contract', question: 'Should this change preserve the public seam?',
      why_now: 'The answer changes the Change Contract.',
      recommendation: 'Preserve the seam for one release.',
      effects: { summary: 'Changes acceptance and recovery.' },
    });
    decisions.resolveDecision(fx.db, {
      id: 'alignment-without-artifact-scope', decision: 'Preserve the seam.',
      rationale: 'Active consumers exist.', decided_by: 'owner',
    });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'alignment-without-artifact', action: 'prepare', summary: 'Preserve the seam.',
    }, { rootDir: fx.rootDir });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'alignment-without-artifact', action: 'confirm', approved_by: 'owner',
      approval_note: 'Approved without a projection.',
      no_artifact_reason: 'No artifact was written.',
    }, { rootDir: fx.rootDir });

    assert.throws(
      () => changes.createChange(fx.db, completeChangeInput({
        id: 'reject-unbound-alignment', title: 'Reject unbound alignment', kind: 'standard',
        intent: 'Require a current alignment projection before creating the change.',
        alignment_thread_id: 'alignment-without-artifact',
      }), { rootDir: fx.rootDir }),
      (error) => error.code === 'CHANGE_ALIGNMENT_REQUIRED',
    );
  } finally {
    cleanup(fx);
  }
});

test('change convergence rejects Prompt-supplied gate verdicts', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-prompt-verdict', title: 'Derive convergence evidence', kind: 'quick',
      intent: 'Use durable workflow reports instead of Prompt claims.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal authority contract.' },
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => changes.convergeChange(fx.db, {
        id: 'chg-prompt-verdict',
        evidence: [{ category: 'tests', status: 'pass', evidence: 'Trust this prompt.' }],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'CONVERGENCE_EVIDENCE_AUTHORITY_VIOLATION',
    );
  } finally {
    cleanup(fx);
  }
});

test('createChange completes intent capture without starting plan or compiling execution context', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-context',
      title: 'Keep context current',
      kind: 'standard',
      intent: 'Add a continuous change lane after project delivery.',
      provider_refs: {
        memory: { provider: 'cloud-mem', reference: 'cmem://project/fixture', status: 'available' },
        code_graph: {
          provider: 'codebase-memory-mcp', project: 'fixture', revision: 'graph-7',
          indexed_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' }).trim(),
          status: 'fresh',
        },
      },
    }, { rootDir: fx.rootDir });

    assert.equal(created.change.status, 'active');
    assert.equal(created.change.kind, 'standard');
    assert.equal(created.workflow.kind, 'change');
    assert.equal(created.workflow.change_id, created.change.id);
    assert.equal(created.workflow.status, 'completed');
    assert.equal(created.workflow.current_step, null);
    assert.ok(fs.existsSync(created.intent_path));
    assert.equal(created.context_manifest_path, null);
    assert.deepEqual(created.workflow.summary.acceptance_ids, created.change.contract.acceptance.map((item) => item.id));
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM context_snapshots WHERE change_id = ?").get(created.change.id).count,
      0,
    );
  } finally {
    cleanup(fx);
  }
});

test('plan and task context remain separate workflows after change intent capture', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-auto-stages', title: 'Advance durable stages', kind: 'quick',
      intent: 'Connect plan completion and task context without Prompt-owned bookkeeping.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir: fx.rootDir });
    const task = createExecutableTask(fx.db, {
      id: 'auto-stage-task', title: 'Advance one stage', type: 'feature', priority: 'P0',
      change_id: created.change.id,
    });
    let plan = workflows.startWorkflow(fx.db, {
      id: 'auto-stage-plan', kind: 'plan', baseline_id: 'test-baseline',
      change_id: created.change.id, subject: 'Plan one executable stage.',
      metadata: { task_ids: [task.id] },
    }, { rootDir: fx.rootDir });
    const planningContext = changes.compileContext(fx.db, {
      id: created.change.id, role: 'plan', gate: 'planning',
    }, { rootDir: fx.rootDir });
    const savedPlan = planStore.saveChangePlanArtifacts(
      planStore.buildPlan([ops.readTask(fx.db, task.id)], { changeId: created.change.id }),
      {
        rootDir: fx.rootDir,
        change: created.change,
        tasks: [ops.readTask(fx.db, task.id)],
        context: {
          snapshot_id: planningContext.manifest.snapshot_id,
          manifest_path: path.relative(fx.rootDir, planningContext.context_manifest_path),
          manifest_digest: planningContext.manifest_hash,
        },
      },
    );
    for (const [id, kind, file] of [
      ['auto-stage-plan-json', 'execution_plan', savedPlan.plan_path],
      ['auto-stage-plan-md', 'execution_plan_markdown', savedPlan.plan_md_path],
    ]) {
      artifactRegistry.recordArtifact(fx.db, {
        id,
        owner_type: 'change',
        owner_id: created.change.id,
        kind,
        path: path.relative(fx.rootDir, file).split(path.sep).join('/'),
        provenance: { writer: 'change-workflow-test-fixture' },
        source_refs: [],
        consumer_refs: [],
        metadata: { terminal_role: true },
      }, { rootDir: fx.rootDir });
    }
    for (const step of plan.steps.filter((item) => item.required)) {
      const definition = workflows.WORKFLOW_DEFINITIONS.plan
        .find((item) => item.id === step.step_id);
      plan = workflows.recordWorkflowStep(fx.db, {
        id: plan.id, step_id: step.step_id, status: 'completed',
        ...(definition.evidence_required ? {
          evidence: [{ kind: 'plan', ref: `fixture:${step.step_id}`, summary: 'Current plan evidence.' }],
        } : {}),
        ...(definition.output_required ? {
          outputs: [{
            path: step.step_id === 'compile-context'
              ? path.relative(fx.rootDir, planningContext.context_manifest_path)
              : path.relative(fx.rootDir, savedPlan.plan_path),
            kind: step.step_id === 'compile-context' ? 'context-manifest' : 'execution-plan',
          }],
        } : {}),
      }, { rootDir: fx.rootDir });
    }
    workflows.completeWorkflow(fx.db, { id: plan.id }, { rootDir: fx.rootDir });
    let changeRun = workflows.readWorkflow(fx.db, created.workflow.id, { rootDir: fx.rootDir });
    assert.equal(changeRun.status, 'completed');
    assert.equal(changeRun.current_step, null);

    changes.compileContext(fx.db, {
      id: created.change.id, task_id: task.id, role: 'implement',
    }, { rootDir: fx.rootDir });
    changeRun = workflows.readWorkflow(fx.db, created.workflow.id, { rootDir: fx.rootDir });
    assert.equal(changeRun.status, 'completed');
    assert.equal(
      fx.db.prepare("SELECT COUNT(*) AS count FROM context_snapshots WHERE change_id = ?").get(created.change.id).count,
      2,
    );
  } finally {
    cleanup(fx);
  }
});

test('new ordinary changes require a ready baseline while incidents require an explicit break-glass record', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-invalid-bypass', title: 'Ordinary work', kind: 'quick',
        intent: 'Do not attach break-glass approval to ordinary work.',
        baseline_bypass: { reason: 'Not applicable.', approved_by: 'owner' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    fx.db.prepare('DELETE FROM baselines').run();
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-normal-without-baseline', title: 'Do ordinary work', kind: 'quick',
        intent: 'Do not start ordinary work before adoption.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_NOT_READY',
    );
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-incident-without-approval', title: 'Recover production', kind: 'incident',
        intent: 'Restore the public runtime without waiting for adoption.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_BYPASS_REQUIRED',
    );

    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-incident-break-glass', title: 'Recover production', kind: 'incident',
      intent: 'Restore the public runtime without waiting for adoption.',
      baseline_bypass: {
        reason: 'Production is unavailable and baseline adoption cannot precede recovery.',
        approved_by: 'incident-commander',
      },
    }, { rootDir: fx.rootDir });
    assert.equal(created.change.baseline_bypass.approved_by, 'incident-commander');
    assert.equal(created.change.baseline_bypass.mode, 'incident_break_glass');
    assert.match(created.change.baseline_bypass.recorded_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally { cleanup(fx); }
});

test('task creation authority rejects missing and terminal change ownership even with a healthy baseline', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.assertTaskCreationAllowed(fx.db, { change_id: 'missing-change' }, { rootDir: fx.rootDir }),
      (error) => error.code === 'CHANGE_NOT_FOUND',
    );
    for (const status of ['ready', 'archived', 'cancelled']) {
      const id = `terminal-${status}`;
      changes.createChange(fx.db, { ...completeChangeInput(),
        id, title: `Terminal ${status}`, kind: 'quick',
        intent: 'Verify terminal changes cannot receive new tasks.',
      }, { rootDir: fx.rootDir });
      fx.db.prepare('UPDATE changes SET status = ? WHERE id = ?').run(status, id);
      assert.throws(
        () => changes.assertTaskCreationAllowed(fx.db, { change_id: id }, { rootDir: fx.rootDir }),
        (error) => error.code === 'CHANGE_NOT_MUTABLE',
      );
    }
  } finally { cleanup(fx); }
});

test('incident break-glass remains executable and archives with a mandatory baseline reconciliation gap', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      "UPDATE baselines SET mode = 'brownfield', status = 'adopting' WHERE id = 'test-baseline'",
    ).run();
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-break-glass-closure', title: 'Restore the production path', kind: 'incident',
      intent: 'Repair the urgent runtime failure before baseline adoption can finish.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal runtime recovery.' },
      baseline_bypass: {
        reason: 'Production recovery cannot wait for the incomplete brownfield baseline.',
        approved_by: 'incident-commander',
      },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'break-glass-task', title: 'Repair urgent runtime failure', type: 'bugfix', priority: 'P0',
      change_id: 'chg-break-glass-closure',
    });
    ops.updateTaskStatus(fx.db, 'break-glass-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'break-glass-task', 'completed');
    const compiled = changes.compileContext(fx.db, {
      id: 'chg-break-glass-closure', ...executionContext('break-glass-task'),
    }, { rootDir: fx.rootDir });
    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.ok(compiled.manifest.readiness.warnings.includes('BASELINE_NOT_READY:adopting'));

    const diagnosisPath = path.join(path.dirname(created.intent_path), 'diagnosis.md');
    fs.writeFileSync(diagnosisPath, [
      '# Incident diagnosis: Restore the production path', '',
      '## Reproduction', '', 'The public runtime fails on the terminal transition.', '',
      '## Hypotheses', '', 'The transition loses its durable terminal write.', '',
      '## Root cause', '', 'The terminal path returns before the durable write completes.', '',
      '## Regression test', '', 'The regression test reproduces the lost write and then passes.', '',
      '## Recovery', '', 'Replay the terminal write and verify the public runtime.', '',
    ].join('\n'));

    seedGateWorkflows(fx, 'chg-break-glass-closure');
    const converged = changes.convergeChange(
      fx.db, { id: 'chg-break-glass-closure' }, { rootDir: fx.rootDir },
    );
    assert.equal(converged.ready, true);

    const reconciliationPath = writeReconciliation(fx, {
      changeId: 'chg-break-glass-closure',
      noChangeReason: 'Baseline adoption is tracked by the reconciliation gap.',
    });
    const archived = changes.archiveChange(fx.db, {
      id: 'chg-break-glass-closure', summary: 'Production restored with regression evidence.',
      no_baseline_change_reason: 'Baseline adoption is tracked by the reconciliation gap.',
      reconciliation_path: reconciliationPath,
    }, { rootDir: fx.rootDir });
    assert.equal(archived.change.status, 'archived');
    assert.equal(archived.baseline_bypass, true);
    const baseline = baselines.readBaseline(fx.db, 'test-baseline');
    assert.equal(baseline.status, 'adopting');
    assert.deepEqual(
      baseline.gaps.map((gap) => ({ id: gap.id, category: gap.category, status: gap.status, blocking: gap.blocking })),
      [{
        id: 'incident-chg-break-glass-closure-reconciliation',
        category: 'baseline_blocker', status: 'open', blocking: true,
      }],
    );
    assert.equal(baseline.gaps[0].owner, 'incident-commander');
    assert.ok(baseline.gaps[0].evidence_refs.some((ref) => ref.includes('changes/archive/')));
  } finally { cleanup(fx); }
});

test('an active ordinary change blocks when its baseline loses approved-ready state', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-grandfathered-context', title: 'Finish active work', kind: 'quick',
      intent: 'Stop ordinary execution when baseline authority is no longer approved.',
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'grandfathered-task', title: 'Finish active work', type: 'bugfix', priority: 'P0',
      change_id: 'chg-grandfathered-context',
    });
    fx.db.prepare(
      "UPDATE baselines SET status = 'adopting', mode = 'brownfield' WHERE id = 'test-baseline'",
    ).run();

    assert.throws(
      () => changes.assertTaskCreationAllowed(fx.db, {
        change_id: 'chg-grandfathered-context',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_NOT_READY',
    );

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-grandfathered-context', ...executionContext('grandfathered-task'),
    }, { rootDir: fx.rootDir });
    assert.equal(compiled.manifest.readiness.status, 'blocked');
    assert.ok(compiled.manifest.readiness.blockers.includes('BASELINE_NOT_READY:adopting'));
    assert.ok(!compiled.manifest.readiness.warnings.includes('BASELINE_NOT_READY:adopting'));
    assert.throws(
      () => workflows.startWorkflow(fx.db, {
        kind: 'plan', change_id: 'chg-grandfathered-context',
        subject: 'Do not plan against unapproved authority.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'WORKFLOW_BASELINE_NOT_READY',
    );
  } finally { cleanup(fx); }
});

test('an active change treats only repository drift created after ready binding as advisory', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-authorized-drift', title: 'Continue an authorized slice', kind: 'quick',
      intent: 'Allow implementation drift while preserving the approved baseline binding.',
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'authorized-drift-task', title: 'Modify the tracked seam', type: 'feature', priority: 'P0',
      change_id: 'chg-authorized-drift',
    });
    fs.appendFileSync(path.join(fx.rootDir, 'README.md'), '\nAuthorized active change.\n');

    assert.doesNotThrow(() => changes.assertTaskCreationAllowed(fx.db, {
      change_id: 'chg-authorized-drift',
    }, { rootDir: fx.rootDir }));
    const compiled = changes.compileContext(fx.db, {
      id: 'chg-authorized-drift', ...executionContext('authorized-drift-task'),
    }, { rootDir: fx.rootDir });
    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.ok(compiled.manifest.readiness.warnings.includes('BASELINE_WORKTREE_STALE'));
    assert.ok(compiled.manifest.readiness.warnings.includes('BASELINE_WORKTREE_DIRTY'));
    assert.deepEqual(compiled.manifest.readiness.blockers, []);
  } finally { cleanup(fx); }
});

test('convergeChange blocks incomplete work and marks a fully evidenced standard change ready', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-converge', title: 'Converge artifacts', kind: 'standard',
      intent: 'Require code, specs, tests, docs, and review evidence to agree.',
    }, { rootDir: fx.rootDir });

    const blocked = changes.convergeChange(
      fx.db, { id: 'chg-converge' }, { rootDir: fx.rootDir },
    );
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes('NO_TASKS'));
    assert.ok(blocked.blockers.includes('DOCS_IMPACT_UNKNOWN'));
    assert.ok(blocked.blockers.includes('CHANGE_DELTA_AUTHORITY_MISSING'));
    assert.ok(blocked.blockers.includes('CHANGE_PLAN_AUTHORITY_MISSING'));
    const blockedEvent = fx.db.prepare(
      "SELECT type, change_id FROM events WHERE change_id = ? ORDER BY id DESC LIMIT 1",
    ).get('chg-converge');
    assert.deepEqual(blockedEvent, { type: 'change_blocked', change_id: 'chg-converge' });

    changes.updateChange(fx.db, 'chg-converge', {
      docs_impact: {
        status: 'none',
        files: [],
        rationale: 'This fixture changes runtime authority without public documentation.',
      },
    }, { rootDir: fx.rootDir });
    assert.match(
      fs.readFileSync(
        path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-converge', 'intent.md'),
        'utf8',
      ),
      /This fixture changes runtime authority without public documentation\./,
    );
    createExecutableTask(fx.db, {
      id: 'change-task', title: 'Implement change lifecycle', type: 'feature', priority: 'P0',
      change_id: 'chg-converge',
    });
    ops.updateTaskStatus(fx.db, 'change-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'change-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-converge', ...executionContext('change-task'),
    }, { rootDir: fx.rootDir });

    seedNoopPacketAndPlan(fx, 'chg-converge');
    seedGateWorkflows(fx, 'chg-converge');
    const ready = changes.convergeChange(
      fx.db, { id: 'chg-converge' }, { rootDir: fx.rootDir },
    );
    assert.equal(ready.ready, true);
    assert.equal(ready.status, 'ready');
    assert.deepEqual(ready.blockers, []);
    assert.ok(fs.existsSync(ready.verification_path));
  } finally {
    cleanup(fx);
  }
});

test('change convergence requires the exact fresh implementation context for every executable task', () => {
  const fx = fixture();
  try {
    const readmeDigest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(path.join(fx.rootDir, 'README.md'))).digest('hex');
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-exact-context', title: 'Require exact task context', kind: 'quick',
      intent: 'Do not let a review packet stand in for the implementation contract.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal authority contract.' },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'exact-context-task', title: 'Bind implementation context', type: 'feature', priority: 'P0',
      change_id: 'chg-exact-context',
      context_refs: [{
        ref: 'README.md', kind: 'spec', reason: 'Accepted fixture contract', required: true,
        expected_digest: readmeDigest, freshness_policy: 'digest',
      }],
    });
    ops.updateTaskStatus(fx.db, 'exact-context-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'exact-context-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-exact-context', task_id: 'exact-context-task', role: 'review', gate: 'review',
    }, { rootDir: fx.rootDir });
    seedGateWorkflows(fx, 'chg-exact-context');

    const missingImplementation = changes.convergeChange(
      fx.db, { id: 'chg-exact-context' }, { rootDir: fx.rootDir },
    );
    assert.ok(missingImplementation.blockers.includes('TASK_CONTEXT_MISSING:exact-context-task'));

    changes.compileContext(fx.db, {
      id: 'chg-exact-context', task_id: 'exact-context-task',
      role: 'implement', gate: 'implementation',
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(path.join(fx.rootDir, 'README.md'), '\nContext drift.\n');

    const staleImplementation = changes.convergeChange(
      fx.db, { id: 'chg-exact-context' }, { rootDir: fx.rootDir },
    );
    assert.ok(staleImplementation.blockers.includes(
      'TASK_CONTEXT_INVALID:exact-context-task:CONTEXT_REQUIRED_REF_STALE:README.md',
    ));
  } finally {
    cleanup(fx);
  }
});

test('convergeChange requires an approved baseline after active work has remained executable', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-baseline-gate', title: 'Keep runtime work moving', kind: 'quick',
      intent: 'Defer baseline closure to convergence without losing implementation progress.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal workflow behavior only.' },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'baseline-gate-task', title: 'Exercise convergence boundary', type: 'feature', priority: 'P0',
      change_id: 'chg-baseline-gate',
    });
    ops.updateTaskStatus(fx.db, 'baseline-gate-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'baseline-gate-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-baseline-gate', ...executionContext('baseline-gate-task'),
    }, { rootDir: fx.rootDir });
    fx.db.prepare('DELETE FROM baselines').run();

    const result = changes.convergeChange(
      fx.db, { id: 'chg-baseline-gate' }, { rootDir: fx.rootDir },
    );

    assert.equal(result.ready, false);
    assert.ok(result.blockers.includes('BASELINE_MISSING'));
  } finally {
    cleanup(fx);
  }
});

test('change creation rejects a schema-migration compatibility baseline until re-adoption', () => {
  const fx = fixture();
  try {
    fx.db.prepare(
      `UPDATE baselines SET mode = 'migrated', approved_by = 'schema-migration',
       approval_note = 'compatibility only' WHERE id = 'test-baseline'`,
    ).run();
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-migrated-gate', title: 'Require owner adoption', kind: 'quick',
        intent: 'Do not let schema migration impersonate project-owner approval.',
        docs_impact: { status: 'none', files: [], rationale: 'Gate behavior only.' },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_NOT_READY'
        && error.details.blockers.includes('BASELINE_MIGRATION_REVIEW_REQUIRED'),
    );
  } finally {
    cleanup(fx);
  }
});

test('archiveChange requires an exact current managed reconciliation authority before parsing', () => {
  const fx = fixture();
  try {
    const change = prepareReadyArchiveChange(fx, 'chg-reconciliation-authority');
    const reconciliationPath = writeReconciliation(fx, {
      changeId: change.id,
      noChangeReason: 'No baseline content changed.',
    });
    fx.db.prepare(
      "UPDATE artifacts SET managed = 0 WHERE id = 'chg-reconciliation-authority-baseline-reconciliation'",
    ).run();

    assert.throws(
      () => changes.archiveChange(fx.db, {
        id: change.id,
        summary: 'Reject unmanaged reconciliation authority.',
        no_baseline_change_reason: 'No baseline content changed.',
        reconciliation_path: reconciliationPath,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_AUTHORITY_INVALID',
    );
    assert.ok(fs.existsSync(path.join(fx.rootDir, change.artifact_root)));
    const archiveRoot = path.join(fx.rootDir, '.ultra', 'changes', 'archive');
    assert.equal(
      fs.existsSync(archiveRoot)
        && fs.readdirSync(archiveRoot).some((entry) => entry.endsWith(`-${change.id}`)),
      false,
    );
  } finally {
    cleanup(fx);
  }
});

test('archiveChange rejects a reconciliation symlink without parsing or moving external bytes', () => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-reconciliation-external-'));
  try {
    const change = prepareReadyArchiveChange(fx, 'chg-reconciliation-symlink');
    const reconciliationPath = writeReconciliation(fx, {
      changeId: change.id,
      noChangeReason: 'No baseline content changed.',
    });
    const file = path.join(fx.rootDir, reconciliationPath);
    const external = path.join(outside, 'external.json');
    fs.writeFileSync(external, '{"external":"must-not-be-consumed"}\n');
    fs.rmSync(file);
    fs.symlinkSync(external, file);

    assert.throws(
      () => changes.archiveChange(fx.db, {
        id: change.id,
        summary: 'Reject external reconciliation bytes.',
        no_baseline_change_reason: 'No baseline content changed.',
        reconciliation_path: reconciliationPath,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_MANIFEST_UNSAFE',
    );
    assert.ok(fs.existsSync(path.join(fx.rootDir, change.artifact_root)));
    assert.equal(fs.readFileSync(external, 'utf8'), '{"external":"must-not-be-consumed"}\n');
  } finally {
    cleanup(fx);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('archiveChange moves a ready change into immutable history and records baseline reconciliation', () => {
  const fx = fixture();
  try {
    fs.mkdirSync(path.join(fx.rootDir, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(fx.rootDir, '.ultra', 'specs', 'product.md'), '# Product\n\nCurrent behavior.\n');
    fs.writeFileSync(path.join(fx.rootDir, '.ultra', 'specs', 'architecture.md'), '# Architecture\n\nCurrent boundary.\n');
    const fileDigest = (file) => require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(file)).digest('hex');
    const currentRefs = baselines.readBaseline(fx.db, 'test-baseline').spec_refs;
    fx.db.prepare(
      `UPDATE baselines SET mode = 'brownfield', repository_revision = ?, spec_refs_json = ?
       WHERE id = 'test-baseline'`,
    ).run(
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' }).trim(),
      JSON.stringify(currentRefs.map((ref) => (
        ['product', 'architecture'].includes(ref.kind)
          ? { ...ref, digest: fileDigest(path.join(fx.rootDir, ref.path)) }
          : ref
      ))),
    );
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-archive', title: 'Archive verified change', kind: 'quick',
      intent: 'Preserve the completed change as project history.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal test-only behavior.' },
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(
      path.join(fx.rootDir, '.ultra', 'specs', 'product.md'),
      '\nBehavior learned and approved by this change.\n',
    );
    execFileSync('git', ['add', '.ultra/specs/product.md'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'update baseline behavior'], { cwd: fx.rootDir });
    const changedHead = execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' },
    ).trim();
    const drift = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(drift.blockers.includes('BASELINE_HEAD_STALE'), false);
    assert.ok(drift.blockers.includes('BASELINE_SPEC_STALE:.ultra/specs/product.md'));
    createExecutableTask(fx.db, {
      id: 'archive-task', title: 'Complete archive path', type: 'bugfix', priority: 'P1',
      change_id: 'chg-archive',
    });
    ops.updateTaskStatus(fx.db, 'archive-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'archive-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-archive', ...executionContext('archive-task'),
    }, { rootDir: fx.rootDir });
    seedGateWorkflows(fx, 'chg-archive');
    const converged = changes.convergeChange(
      fx.db, { id: 'chg-archive' }, { rootDir: fx.rootDir },
    );
    assert.equal(converged.ready, true);

    assert.throws(
      () => changes.archiveChange(fx.db, {
        id: 'chg-archive', summary: 'Do not archive without semantic reconciliation.',
        baseline_updates: ['.ultra/specs/product.md'],
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_MANIFEST_REQUIRED',
    );
    const reconciliationPath = writeReconciliation(fx, {
      changeId: 'chg-archive', updates: ['.ultra/specs/product.md'],
    });
    const sourcePrefix = '.ultra/changes/active/chg-archive/';
    for (const artifact of fx.db.prepare(
      'SELECT id, path FROM artifacts WHERE change_id = ?',
    ).all('chg-archive')) {
      if (artifact.path.startsWith(sourcePrefix)) {
        fx.db.prepare('UPDATE artifacts SET path = ? WHERE id = ?')
          .run(artifact.path.replaceAll('/', '\\'), artifact.id);
      }
    }
    for (const step of fx.db.prepare(
      `SELECT ws.run_id, ws.step_id, ws.outputs_json
       FROM workflow_steps ws JOIN workflow_runs wr ON wr.id = ws.run_id
       WHERE wr.change_id = ?`,
    ).all('chg-archive')) {
      const outputs = JSON.parse(step.outputs_json || '[]').map((output) => (
        output.path?.startsWith(sourcePrefix)
          ? { ...output, path: output.path.replaceAll('/', '\\') }
          : output
      ));
      fx.db.prepare(
        'UPDATE workflow_steps SET outputs_json = ? WHERE run_id = ? AND step_id = ?',
      ).run(JSON.stringify(outputs), step.run_id, step.step_id);
    }
    fx.db.prepare(
      `UPDATE context_snapshots
       SET manifest_path = REPLACE(manifest_path, '/', '\\')
       WHERE change_id = ? AND manifest_path LIKE ?`,
    ).run('chg-archive', `${sourcePrefix}%`);

    const archived = changes.archiveChange(fx.db, {
      id: 'chg-archive', summary: 'Verified quick fix archived.',
      baseline_updates: ['.ultra/specs/product.md'],
      reconciliation_path: reconciliationPath,
    }, { rootDir: fx.rootDir });
    assert.equal(archived.change.status, 'archived');
    assert.ok(fs.existsSync(archived.archive_path));
    assert.equal(fs.existsSync(path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-archive')), false);
    const artifacts = fx.db.prepare(
      'SELECT kind, path, status FROM artifacts WHERE change_id = ? ORDER BY kind',
    ).all('chg-archive');
    assert.ok(artifacts.some((artifact) => artifact.kind === 'archive_summary'));
    assert.ok(artifacts.some((artifact) => artifact.kind === 'baseline_reconciliation'));
    for (const artifact of artifacts) {
      assert.equal(artifact.status, 'archived');
      assert.doesNotMatch(artifact.path, /changes\/active/);
      assert.doesNotMatch(artifact.path, /\\/);
      assert.ok(fs.existsSync(path.join(fx.rootDir, artifact.path)), artifact.path);
    }
    const changeRun = workflows.listWorkflows(
      fx.db, { kind: 'change', change_id: 'chg-archive' }, { rootDir: fx.rootDir },
    )[0];
    for (const output of changeRun.steps.flatMap((step) => step.outputs)) {
      assert.doesNotMatch(output.path, /changes\/active/);
      assert.doesNotMatch(output.path, /\\/);
      assert.ok(fs.existsSync(path.join(fx.rootDir, output.path)), output.path);
    }
    assert.equal(changeRun.artifact_health.status, 'pass');
    const archivedContext = fx.db.prepare(
      'SELECT manifest_path FROM context_snapshots WHERE change_id = ? ORDER BY created_at DESC LIMIT 1',
    ).get('chg-archive');
    assert.doesNotMatch(archivedContext.manifest_path, /changes\/active/);
    assert.doesNotMatch(archivedContext.manifest_path, /\\/);
    assert.ok(fs.existsSync(path.join(fx.rootDir, archivedContext.manifest_path)));
    const archivedContextBytes = fs.readFileSync(
      path.join(fx.rootDir, archivedContext.manifest_path),
    );
    assert.doesNotMatch(
      archivedContextBytes.toString('utf8'),
      /\.ultra\/changes\/active\/chg-archive(?:\/|")/,
    );
    const reconciliation = fx.db.prepare(
      "SELECT type, payload_json FROM events WHERE type = 'baseline_reconciled' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(reconciliation.type, 'baseline_reconciled');
    assert.deepEqual(JSON.parse(reconciliation.payload_json).baseline_updates, ['.ultra/specs/product.md']);
    const reconciled = baselines.inspectBaseline(fx.db, { rootDir: fx.rootDir });
    assert.equal(reconciled.status, 'pass');
    assert.equal(reconciled.baseline.repository_revision, changedHead);
  } finally {
    cleanup(fx);
  }
});

test('archive crash-resume rebinds Context authority into a self-contained immutable packet', () => {
  const fx = fixture();
  try {
    const changeId = 'chg-context-rebind';
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: changeId,
      title: 'Rebind archived Context authority',
      kind: 'quick',
      intent: 'Keep archived Context manifests replayable without active-root references.',
      docs_impact: { status: 'none', files: [], rationale: 'Authority-only regression.' },
    }, { rootDir: fx.rootDir });
    const activeEvidence = `${created.change.artifact_root}/implementation-evidence.md`;
    fs.writeFileSync(
      path.join(fx.rootDir, activeEvidence),
      '# Implementation evidence\n\nChange-owned evidence.\n',
    );
    const taskId = `${changeId}-task`;
    const taskRefs = [{
      ref: activeEvidence,
      kind: 'source',
      reason: 'Change-owned implementation evidence.',
      required: true,
    }];
    createExecutableTask(fx.db, {
      id: taskId,
      title: 'Compile a Change-owned Context reference',
      type: 'bugfix',
      priority: 'P0',
      change_id: changeId,
      context_refs: taskRefs,
      trace_to: `${activeEvidence}#implementation-evidence`,
    });
    ops.updateTaskStatus(fx.db, taskId, 'in_progress');
    ops.updateTaskStatus(fx.db, taskId, 'completed');
    const compiled = changes.compileContext(fx.db, {
      id: changeId,
      ...executionContext(taskId, { context_refs: taskRefs }),
    }, { rootDir: fx.rootDir });
    const activeManifest = path.relative(fx.rootDir, compiled.context_manifest_path)
      .split(path.sep).join('/');
    seedGateWorkflows(fx, changeId);
    const devRunId = `gate-dev-${taskId}`;
    fx.db.prepare(
      `UPDATE workflow_steps
       SET outputs_json = ?, evidence_json = ?
       WHERE run_id = ? AND step_id = 'compile-context'`,
    ).run(
      JSON.stringify([{
        path: activeManifest,
        kind: 'context-manifest',
        digest: compiled.manifest_hash,
      }]),
      JSON.stringify([{
        kind: 'context',
        ref: activeManifest,
        digest: compiled.manifest_hash,
        summary: 'Compiled Context authority.',
      }]),
      devRunId,
    );
    const converged = changes.convergeChange(
      fx.db, { id: changeId }, { rootDir: fx.rootDir },
    );
    assert.equal(converged.ready, true);
    const input = {
      id: changeId,
      summary: 'Archive the replayable Context packet.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId,
        noChangeReason: 'No baseline content changed.',
      }),
    };
    const reconciliationBytes = fs.readFileSync(
      path.join(fx.rootDir, input.reconciliation_path),
    );
    const interrupted = archiveJournal.prepareArchiveMove({
      rootDir: fx.rootDir,
      change: changes.readChange(fx.db, changeId),
      summary: input.summary,
      baselineUpdates: [],
      noBaselineChangeReason: input.no_baseline_change_reason,
      reconciliationPath: input.reconciliation_path,
      reconciliationDigest: require('node:crypto').createHash('sha256')
        .update(reconciliationBytes).digest('hex'),
      reconciliationManifest: JSON.parse(reconciliationBytes.toString('utf8')),
    });
    assert.equal(interrupted.location, 'destination');

    const archived = changes.archiveChange(fx.db, input, { rootDir: fx.rootDir });
    const retried = changes.archiveChange(fx.db, input, { rootDir: fx.rootDir });
    assert.equal(retried.idempotent, true);
    const archivedRoot = path.relative(fx.rootDir, archived.archive_path)
      .split(path.sep).join('/');
    const snapshot = fx.db.prepare(
      `SELECT id, manifest_path, manifest_hash, role, gate
       FROM context_snapshots WHERE change_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(changeId);
    const manifestBytes = fs.readFileSync(path.join(fx.rootDir, snapshot.manifest_path));
    const manifestDigest = require('node:crypto').createHash('sha256')
      .update(manifestBytes).digest('hex');
    assert.equal(snapshot.manifest_hash, manifestDigest);
    assert.match(manifestBytes.toString('utf8'), new RegExp(archivedRoot));
    assert.doesNotMatch(
      manifestBytes.toString('utf8'),
      new RegExp(`\\.ultra/changes/active/${changeId}(?:/|")`),
    );
    const contextArtifact = fx.db.prepare(
      `SELECT path, digest, content_hash FROM artifacts
       WHERE change_id = ? AND kind = 'context_manifest'`,
    ).get(changeId);
    assert.equal(contextArtifact.path, snapshot.manifest_path);
    assert.equal(contextArtifact.digest, manifestDigest);
    assert.equal(contextArtifact.content_hash, manifestDigest);
    const devContextStep = fx.db.prepare(
      `SELECT outputs_json, evidence_json FROM workflow_steps
       WHERE run_id = ? AND step_id = 'compile-context'`,
    ).get(devRunId);
    const [output] = JSON.parse(devContextStep.outputs_json);
    const [evidence] = JSON.parse(devContextStep.evidence_json);
    assert.equal(output.path, snapshot.manifest_path);
    assert.equal(output.digest, manifestDigest);
    assert.equal(evidence.ref, snapshot.manifest_path);
    assert.equal(evidence.digest, manifestDigest);
    const replay = contextSpine.validateContextSnapshot(fx.db, {
      change_id: changeId,
      task_id: taskId,
      role: snapshot.role,
      gate: snapshot.gate,
    }, { rootDir: fx.rootDir });
    assert.equal(replay.blockers.includes('CONTEXT_MANIFEST_STALE'), false);
    assert.equal(replay.blockers.some((item) => item.includes('CONTEXT_REF_')), false);

    const stack = [archived.archive_path];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(child);
        else if (entry.isFile()) {
          assert.equal(
            fs.readFileSync(child).includes(Buffer.from(`.ultra/changes/active/${changeId}`)),
            false,
            child,
          );
        }
      }
    }
  } finally {
    cleanup(fx);
  }
});

test('archiveChange rolls back when declared reconciliation leaves a tracked specification stale', () => {
  const fx = fixture();
  try {
    const specPath = path.join(fx.rootDir, '.ultra', 'specs', 'product.md');
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, '# Product\n\nOriginal behavior.\n');
    const originalHead = execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: fx.rootDir, encoding: 'utf8' },
    ).trim();
    const originalDigest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(specPath)).digest('hex');
    const currentRefs = baselines.readBaseline(fx.db, 'test-baseline').spec_refs;
    fx.db.prepare(
      `UPDATE baselines SET mode = 'brownfield', repository_revision = ?, spec_refs_json = ?
       WHERE id = 'test-baseline'`,
    ).run(originalHead, JSON.stringify(currentRefs.map((ref) => (
      ref.kind === 'product' ? { ...ref, digest: originalDigest } : ref
    ))));
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-reconcile-rollback', title: 'Reject incomplete reconciliation', kind: 'quick',
      intent: 'Keep the active change recoverable until every tracked specification is reconciled.',
      docs_impact: { status: 'none', files: [], rationale: 'Workflow integrity only.' },
    }, { rootDir: fx.rootDir });
    fs.appendFileSync(specPath, '\nChanged behavior that must be declared.\n');
    execFileSync('git', ['add', '.ultra/specs/product.md'], { cwd: fx.rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'change tracked product spec'], { cwd: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'reconcile-rollback-task', title: 'Exercise archive rollback', type: 'feature', priority: 'P0',
      change_id: 'chg-reconcile-rollback',
    });
    ops.updateTaskStatus(fx.db, 'reconcile-rollback-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'reconcile-rollback-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-reconcile-rollback', ...executionContext('reconcile-rollback-task'),
    }, { rootDir: fx.rootDir });
    seedGateWorkflows(fx, 'chg-reconcile-rollback');
    const converged = changes.convergeChange(
      fx.db, { id: 'chg-reconcile-rollback' }, { rootDir: fx.rootDir },
    );
    assert.equal(converged.ready, true);

    const reconciliationPath = writeReconciliation(fx, {
      changeId: 'chg-reconcile-rollback', noChangeReason: 'No baseline update declared.',
    });
    assert.throws(
      () => changes.archiveChange(fx.db, {
        id: 'chg-reconcile-rollback', summary: 'Attempt an incomplete archive.',
        no_baseline_change_reason: 'No baseline update declared.',
        reconciliation_path: reconciliationPath,
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_INCOMPLETE'
        && error.details.blockers.includes('BASELINE_SPEC_STALE:.ultra/specs/product.md'),
    );

    const active = changes.readChange(fx.db, 'chg-reconcile-rollback');
    assert.equal(active.status, 'ready');
    assert.ok(fs.existsSync(path.join(fx.rootDir, active.artifact_root)));
    assert.equal(fs.existsSync(path.join(fx.rootDir, active.artifact_root, 'archive-summary.md')), false);
    assert.equal(baselines.readBaseline(fx.db).repository_revision, originalHead);
    const reconciliationEvents = fx.db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE type = 'baseline_reconciled' AND change_id = ?",
    ).get('chg-reconcile-rollback');
    assert.equal(reconciliationEvents.count, 0);
  } finally {
    cleanup(fx);
  }
});

test('archiveChange resumes a durable journal after the filesystem move outlives the process', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-crash-resume', title: 'Resume interrupted archive', kind: 'quick',
      intent: 'Finish an authorized archive after a process crash.',
      docs_impact: { status: 'none', files: [], rationale: 'Recovery-only behavior.' },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'crash-resume-task', title: 'Verify archive recovery', type: 'bugfix', priority: 'P0',
      change_id: 'chg-crash-resume',
    });
    ops.updateTaskStatus(fx.db, 'crash-resume-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'crash-resume-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-crash-resume', ...executionContext('crash-resume-task'),
    }, { rootDir: fx.rootDir });
    seedGateWorkflows(fx, 'chg-crash-resume');
    const converged = changes.convergeChange(
      fx.db, { id: 'chg-crash-resume' }, { rootDir: fx.rootDir },
    );
    assert.equal(converged.ready, true);
    const input = {
      id: 'chg-crash-resume', summary: 'Resume the interrupted archive safely.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId: 'chg-crash-resume', noChangeReason: 'No baseline content changed.',
      }),
    };
    const change = changes.readChange(fx.db, input.id);
    const interrupted = archiveJournal.prepareArchiveMove({
      rootDir: fx.rootDir, change, summary: input.summary, baselineUpdates: [],
      noBaselineChangeReason: input.no_baseline_change_reason,
      reconciliationPath: input.reconciliation_path,
      reconciliationDigest: require('node:crypto').createHash('sha256')
        .update(fs.readFileSync(path.join(fx.rootDir, input.reconciliation_path))).digest('hex'),
      reconciliationManifest: JSON.parse(
        fs.readFileSync(path.join(fx.rootDir, input.reconciliation_path), 'utf8'),
      ),
    });
    assert.equal(changes.readChange(fx.db, input.id).status, 'ready');
    assert.equal(fs.existsSync(interrupted.source), false);
    assert.equal(fs.existsSync(interrupted.destination), true);

    const resumed = changes.archiveChange(fx.db, input, { rootDir: fx.rootDir });
    assert.equal(resumed.change.status, 'archived');
    assert.equal(resumed.archive_path, interrupted.destination);
    assert.equal(archiveJournal.listArchiveIntents(fx.rootDir).length, 0);
  } finally {
    cleanup(fx);
  }
});

test('archiveChange resumes after the reconciliation rebind is published before DB commit', () => {
  const fx = fixture();
  try {
    const changeId = 'chg-rebind-before-db-retry';
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: changeId,
      title: 'Retry a published reconciliation rebind',
      kind: 'quick',
      intent: 'Resume the committed filesystem authority without rolling it back.',
      docs_impact: { status: 'none', files: [], rationale: 'Recovery-only behavior.' },
    }, { rootDir: fx.rootDir });
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    const input = {
      id: changeId,
      summary: 'Resume the rebound reconciliation safely.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId,
        noChangeReason: 'No baseline content changed.',
        verificationEvidence: `${created.change.artifact_root}/verification.log`,
      }),
    };
    const crash = publishReboundReconciliationWithoutDbCommit(fx, input);

    const resumed = changes.archiveChange(fx.db, input, { rootDir: fx.rootDir });

    assert.equal(resumed.change.status, 'archived');
    assert.equal(resumed.archive_path, crash.interrupted.destination);
    assert.equal(fs.existsSync(crash.interrupted.source), false);
    assert.equal(fs.existsSync(crash.interrupted.destination), true);
    assert.equal(archiveJournal.listArchiveIntents(fx.rootDir).length, 0);
    const reconciliation = fx.db.prepare(
      "SELECT path, digest FROM artifacts WHERE change_id = ? AND kind = 'baseline_reconciliation'",
    ).get(changeId);
    assert.equal(reconciliation.path, crash.archivedRelative);
    assert.equal(reconciliation.digest, crash.afterDigest);
  } finally {
    cleanup(fx);
  }
});

test('archive recovery resumes a published reconciliation rebind instead of rolling it back', () => {
  const fx = fixture();
  try {
    const changeId = 'chg-rebind-before-db-recover';
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: changeId,
      title: 'Recover a published reconciliation rebind',
      kind: 'quick',
      intent: 'Let Doctor retain and commit the already published archive bytes.',
      docs_impact: { status: 'none', files: [], rationale: 'Recovery-only behavior.' },
    }, { rootDir: fx.rootDir });
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    const input = {
      id: changeId,
      summary: 'Recover the rebound reconciliation safely.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId,
        noChangeReason: 'No baseline content changed.',
        verificationEvidence: `${created.change.artifact_root}/verification.log`,
      }),
    };
    const crash = publishReboundReconciliationWithoutDbCommit(fx, input);

    const recovered = changes.recoverInterruptedArchives(fx.db, { rootDir: fx.rootDir });

    assert.equal(recovered.resumed, 1);
    assert.equal(recovered.rolled_back, 0);
    assert.equal(recovered.failed, 0);
    assert.equal(changes.readChange(fx.db, changeId).status, 'archived');
    assert.equal(fs.existsSync(crash.interrupted.source), false);
    assert.equal(fs.existsSync(crash.interrupted.destination), true);
    assert.equal(archiveJournal.listArchiveIntents(fx.rootDir).length, 0);
    const reconciliation = fx.db.prepare(
      "SELECT path, digest FROM artifacts WHERE change_id = ? AND kind = 'baseline_reconciliation'",
    ).get(changeId);
    assert.equal(reconciliation.path, crash.archivedRelative);
    assert.equal(reconciliation.digest, crash.afterDigest);
  } finally {
    cleanup(fx);
  }
});

test('archiveChange rejects tampered reconciliation bytes after a published rebind', () => {
  const fx = fixture();
  try {
    const changeId = 'chg-rebind-tamper-retry';
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: changeId,
      title: 'Reject a tampered reconciliation retry',
      kind: 'quick',
      intent: 'Keep unknown archived bytes outside durable baseline authority.',
      docs_impact: { status: 'none', files: [], rationale: 'Recovery-only behavior.' },
    }, { rootDir: fx.rootDir });
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    const input = {
      id: changeId,
      summary: 'Reject the tampered rebound reconciliation.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId,
        noChangeReason: 'No baseline content changed.',
        verificationEvidence: `${created.change.artifact_root}/verification.log`,
      }),
    };
    const crash = publishReboundReconciliationWithoutDbCommit(fx, input);
    fs.appendFileSync(
      path.join(fx.rootDir, crash.archivedRelative),
      '\nTAMPERED AFTER REBIND\n',
    );

    assert.throws(
      () => changes.archiveChange(fx.db, input, { rootDir: fx.rootDir }),
      (error) => error.code === 'BASELINE_RECONCILIATION_AUTHORITY_INVALID',
    );
    assert.equal(changes.readChange(fx.db, changeId).status, 'ready');
    assert.equal(fs.existsSync(crash.interrupted.source), false);
    assert.equal(fs.existsSync(crash.interrupted.destination), true);
    assert.equal(
      fs.existsSync(path.join(crash.interrupted.destination, archiveJournal.INTENT_FILE)),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(crash.interrupted.destination, archiveJournal.REBIND_FILE)),
      true,
    );
  } finally {
    cleanup(fx);
  }
});

test('archive recovery preserves tampered rebound bytes and journals for explicit repair', () => {
  const fx = fixture();
  try {
    const changeId = 'chg-rebind-tamper-recover';
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: changeId,
      title: 'Preserve a tampered reconciliation recovery',
      kind: 'quick',
      intent: 'Fail closed without committing or rolling back unknown archive bytes.',
      docs_impact: { status: 'none', files: [], rationale: 'Recovery-only behavior.' },
    }, { rootDir: fx.rootDir });
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(changeId);
    const input = {
      id: changeId,
      summary: 'Preserve the tampered rebound reconciliation.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId,
        noChangeReason: 'No baseline content changed.',
        verificationEvidence: `${created.change.artifact_root}/verification.log`,
      }),
    };
    const crash = publishReboundReconciliationWithoutDbCommit(fx, input);
    fs.appendFileSync(
      path.join(fx.rootDir, crash.archivedRelative),
      '\nTAMPERED BEFORE RECOVERY\n',
    );

    const recovered = changes.recoverInterruptedArchives(fx.db, { rootDir: fx.rootDir });

    assert.equal(recovered.resumed, 0);
    assert.equal(recovered.rolled_back, 0);
    assert.equal(recovered.failed, 1);
    assert.equal(recovered.items[0].status, 'failed');
    assert.match(recovered.items[0].error, /ARCHIVE_REBIND_CONFLICT/);
    assert.equal(changes.readChange(fx.db, changeId).status, 'ready');
    assert.equal(fs.existsSync(crash.interrupted.source), false);
    assert.equal(fs.existsSync(crash.interrupted.destination), true);
    assert.equal(
      fs.existsSync(path.join(crash.interrupted.destination, archiveJournal.INTENT_FILE)),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(crash.interrupted.destination, archiveJournal.REBIND_FILE)),
      true,
    );
  } finally {
    cleanup(fx);
  }
});

test('archive crash resume uses reconciliation file truth instead of embedded journal semantics', () => {
  const fx = fixture();
  try {
    const change = prepareReadyArchiveChange(fx, 'chg-journal-semantic-copy');
    baselines.appendGap(fx.db, {
      baseline_id: 'test-baseline',
      gap: {
        id: 'journal-only-gap',
        category: 'known_defect',
        status: 'open',
        blocking: false,
        summary: 'Only a verified reconciliation file may resolve this gap.',
        evidence_refs: ['README.md'],
        owner: 'test-owner',
      },
    });
    const input = {
      id: change.id,
      summary: 'Resume from authoritative reconciliation bytes.',
      no_baseline_change_reason: 'No baseline content changed.',
      reconciliation_path: writeReconciliation(fx, {
        changeId: change.id,
        noChangeReason: 'No baseline content changed.',
      }),
    };
    const manifestFile = path.join(fx.rootDir, input.reconciliation_path);
    const manifestBytes = fs.readFileSync(manifestFile);
    const interrupted = archiveJournal.prepareArchiveMove({
      rootDir: fx.rootDir,
      change,
      summary: input.summary,
      baselineUpdates: [],
      noBaselineChangeReason: input.no_baseline_change_reason,
      reconciliationPath: input.reconciliation_path,
      reconciliationDigest: require('node:crypto').createHash('sha256')
        .update(manifestBytes).digest('hex'),
      reconciliationManifest: JSON.parse(manifestBytes.toString('utf8')),
    });
    const journalPath = path.join(interrupted.destination, archiveJournal.INTENT_FILE);
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.reconciliation_manifest.resolved_gap_ids = ['journal-only-gap'];
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    const resumed = changes.archiveChange(fx.db, input, { rootDir: fx.rootDir });

    assert.equal(resumed.change.status, 'archived');
    const baseline = baselines.readBaseline(fx.db, 'test-baseline');
    assert.equal(
      baseline.gaps.find((gap) => gap.id === 'journal-only-gap').status,
      'open',
    );
    const event = fx.db.prepare(
      "SELECT payload_json FROM events WHERE type = 'baseline_reconciled' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.deepEqual(JSON.parse(event.payload_json).resolved_gap_ids, []);
    const artifact = fx.db.prepare(
      "SELECT metadata_json FROM artifacts WHERE change_id = ? AND kind = 'baseline_reconciliation'",
    ).get(change.id);
    assert.deepEqual(JSON.parse(artifact.metadata_json).resolved_gap_ids, []);
  } finally {
    cleanup(fx);
  }
});

test('provider references reject embedded memory or graph payloads', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-provider-content', title: 'Reject provider payload', kind: 'quick',
        intent: 'Keep external provider content outside Ultra state.',
        provider_refs: {
          memory: { provider: 'cloud-mem', status: 'available', content: 'captured transcript' },
        },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'PROVIDER_CONTENT_FORBIDDEN',
    );
  } finally {
    cleanup(fx);
  }
});

test('createChange rejects whitespace-only title and intent outside the MCP boundary', () => {
  const fx = fixture();
  try {
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-empty-title', title: '   ', kind: 'quick', intent: 'Valid intent.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => changes.createChange(fx.db, { ...completeChangeInput(),
        id: 'chg-empty-intent', title: 'Valid title', kind: 'quick', intent: '\t',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  } finally {
    cleanup(fx);
  }
});

test('updateChange keeps intent.md synchronized with authoritative change metadata', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-update-intent', title: 'Original title', kind: 'quick',
      intent: 'Original intent.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal-only change.' },
    }, { rootDir: fx.rootDir });

    changes.updateChange(fx.db, 'chg-update-intent', {
      title: 'Updated title',
      intent: 'Updated intent with current acceptance behavior.',
      docs_impact: { status: 'required', files: ['README.md'], rationale: 'Usage changed.' },
    }, { rootDir: fx.rootDir });

    const text = fs.readFileSync(created.intent_path, 'utf8');
    assert.match(text, /^# Updated title/m);
    assert.match(text, /Updated intent with current acceptance behavior\./);
    assert.match(text, /Documentation impact: `required`/);
    const artifact = fx.db.prepare(
      `SELECT id, content_hash, before_digest, managed, provenance_json
       FROM artifacts WHERE change_id = ? AND kind = 'intent'`,
    ).get('chg-update-intent');
    assert.match(artifact.content_hash, /^[0-9a-f]{64}$/);
    assert.match(artifact.before_digest, /^[0-9a-f]{64}$/);
    assert.equal(artifact.managed, 1);
    assert.equal(JSON.parse(artifact.provenance_json).writer, 'change-workflow');
    assert.deepEqual(
      fx.db.prepare(
        `SELECT source_type, source_id, target_type, target_id
         FROM artifact_edges
         WHERE (source_type = 'artifact' AND source_id = ?)
            OR (target_type = 'artifact' AND target_id = ?)
         ORDER BY source_type, target_type`,
      ).all(artifact.id, artifact.id).map((edge) => ({
        source_type: edge.source_type,
        source_id: edge.source_id,
        target_type: edge.target_type,
        target_id: edge.target_id,
      })),
      [
        {
          source_type: 'artifact', source_id: artifact.id,
          target_type: 'workflow',
          target_id: fx.db.prepare(
            "SELECT id FROM workflow_runs WHERE change_id = 'chg-update-intent'",
          ).get().id,
        },
        {
          source_type: 'change', source_id: 'chg-update-intent',
          target_type: 'artifact', target_id: artifact.id,
        },
      ],
    );
    assert.equal(
      fx.db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'spec_changed' AND change_id = ?",
      ).get('chg-update-intent').count,
      1,
    );
  } finally {
    cleanup(fx);
  }
});

test('updateChange invalidates only registered consumers while compiled context detects semantic drift', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-update-authority', title: 'Original authority', kind: 'standard',
      intent: 'Deliver the original accepted behavior.',
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'authority-task', title: 'Implement original authority', type: 'feature', priority: 'P0',
      change_id: 'chg-update-authority',
    });
    createExecutableTask(fx.db, {
      id: 'unrelated-authority-task',
      title: 'Remain independent of the compiled context',
      type: 'feature',
      priority: 'P1',
      change_id: 'chg-update-authority',
    });
    changes.compileContext(fx.db, {
      id: 'chg-update-authority',
      ...executionContext('authority-task'),
    }, { rootDir: fx.rootDir });

    const original = completeChangeInput({ id: 'chg-update-authority' }).contract;
    changes.updateChange(fx.db, 'chg-update-authority', {
      contract: {
        ...original,
        outcome: 'Deliver the revised accepted behavior.',
      },
    }, { rootDir: fx.rootDir });

    assert.equal(ops.readTask(fx.db, 'authority-task').stale, true);
    assert.equal(ops.readTask(fx.db, 'unrelated-authority-task').stale, false);
    const breadcrumb = changes.readBreadcrumb(
      fx.db, { id: 'chg-update-authority' }, { rootDir: fx.rootDir },
    );
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.ok(
      breadcrumb.blockers.includes('CONTEXT_CHANGE_CONTRACT_STALE'),
      JSON.stringify(breadcrumb),
    );
    const event = fx.db.prepare(
      "SELECT payload_json FROM events WHERE type = 'change_updated' AND change_id = ? ORDER BY id DESC LIMIT 1",
    ).get('chg-update-authority');
    assert.deepEqual(JSON.parse(event.payload_json).invalidated_tasks, ['authority-task']);
  } finally {
    cleanup(fx);
  }
});

test('updateChange rejects whitespace-only title or intent outside the MCP boundary', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-update-validation', title: 'Valid title', kind: 'quick',
      intent: 'Valid intent.',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => changes.updateChange(fx.db, 'chg-update-validation', { title: '   ' }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => changes.updateChange(fx.db, 'chg-update-validation', { intent: '\t' }, { rootDir: fx.rootDir }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
  } finally {
    cleanup(fx);
  }
});

test('incident changes create a durable structured diagnosis artifact', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-incident-diagnosis', title: 'Diagnose runtime failure', kind: 'incident',
      intent: 'Reproduce and fix the runtime failure at its root cause.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal runtime repair.' },
    }, { rootDir: fx.rootDir });

    const diagnosisPath = path.join(path.dirname(created.intent_path), 'diagnosis.md');
    assert.ok(fs.existsSync(diagnosisPath));
    const text = fs.readFileSync(diagnosisPath, 'utf8');
    for (const heading of ['Reproduction', 'Hypotheses', 'Root cause', 'Regression test', 'Recovery']) {
      assert.match(text, new RegExp(`^## ${heading}$`, 'm'));
    }
    const artifact = fx.db.prepare(
      "SELECT kind, path, content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-diagnosis');
    assert.equal(artifact.kind, 'diagnosis');
    assert.match(artifact.content_hash, /^[0-9a-f]{64}$/);
    assert.equal(path.join(fx.rootDir, artifact.path), diagnosisPath);
  } finally {
    cleanup(fx);
  }
});

test('incident convergence requires every structured diagnosis section and refreshes its artifact hash', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-incident-converge', title: 'Converge runtime diagnosis', kind: 'incident',
      intent: 'Require inspectable debugging evidence before incident closure.',
      docs_impact: { status: 'none', files: [], rationale: 'Internal runtime repair.' },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'incident-task', title: 'Fix diagnosed failure', type: 'bugfix', priority: 'P0',
      change_id: 'chg-incident-converge',
    });
    ops.updateTaskStatus(fx.db, 'incident-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'incident-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-incident-converge', ...executionContext('incident-task'),
    }, { rootDir: fx.rootDir });

    seedGateWorkflows(fx, 'chg-incident-converge');
    const blocked = changes.convergeChange(
      fx.db, { id: 'chg-incident-converge' }, { rootDir: fx.rootDir },
    );
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes('DIAGNOSIS_SECTION_MISSING:reproduction'));
    assert.ok(blocked.blockers.includes('DIAGNOSIS_SECTION_MISSING:root-cause'));

    const diagnosisPath = path.join(path.dirname(created.intent_path), 'diagnosis.md');
    const beforeHash = fx.db.prepare(
      "SELECT content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-converge').content_hash;
    fs.writeFileSync(diagnosisPath, [
      '# Incident diagnosis: Converge runtime diagnosis', '',
      '## Reproduction', '', 'The projection worker fails after an interrupted claim.', '',
      '## Hypotheses', '', 'A stale running job is never returned to the pending queue.', '',
      '## Root cause', '', 'Boot recovery did not consume interrupted projection state.', '',
      '## Regression test', '', 'The test seeds a stale running job and verifies requeue.', '',
      '## Recovery', '', 'Requeue the job after the stale cutoff and replay projection.', '',
    ].join('\n'));

    const ready = changes.convergeChange(
      fx.db, { id: 'chg-incident-converge' }, { rootDir: fx.rootDir },
    );
    assert.equal(ready.ready, true);
    const afterHash = fx.db.prepare(
      "SELECT content_hash FROM artifacts WHERE change_id = ? AND kind = 'diagnosis'",
    ).get('chg-incident-converge').content_hash;
    assert.notEqual(afterHash, beforeHash);
    assert.equal(
      afterHash,
      require('node:crypto').createHash('sha256').update(fs.readFileSync(diagnosisPath)).digest('hex'),
    );
  } finally {
    cleanup(fx);
  }
});

test('compileContext v3 persists role-scoped context and control transitions without a canonical recommendation', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-context-v2', title: 'Compile role context', kind: 'standard',
      intent: 'Give each execution role only the context it needs.',
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'context-v2-task', title: 'Build role-scoped manifest', type: 'feature', priority: 'P0',
      change_id: 'chg-context-v2',
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-context-v2',
      ...executionContext('context-v2-task'),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.schema_version, '3.0');
    assert.equal(compiled.manifest.role, 'implement');
    assert.equal(compiled.manifest.gate, 'implementation');
    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.equal(compiled.manifest.context.items[0].ref, 'README.md');
    assert.match(compiled.manifest.context.items[0].digest, /^[0-9a-f]{64}$/);
    assert.equal(compiled.manifest.execution_contract.slice_kind, 'tracer_bullet');
    assert.equal(compiled.manifest.resume.task_id, 'context-v2-task');
    assert.equal(compiled.manifest.next_action, undefined);
    assert.ok(compiled.manifest.control.allowed_transitions.includes('ultra-dev'));
    assert.equal(compiled.manifest.control.required_transition, null);

    const snapshot = fx.db.prepare(
      `SELECT role, gate, next_action, readiness, context_json, token_budget
       FROM context_snapshots
       WHERE change_id = ? AND task_id = ? AND role = 'implement' AND gate = 'implementation'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    ).get('chg-context-v2', 'context-v2-task');
    assert.equal(snapshot.role, 'implement');
    assert.equal(snapshot.gate, 'implementation');
    assert.equal(snapshot.next_action, '');
    assert.equal(snapshot.readiness, 'ready');
    assert.equal(snapshot.token_budget, 2_000);
    assert.equal(JSON.parse(snapshot.context_json).execution_contract.public_seam, 'public seam for context-v2-task');

    const breadcrumb = changes.readBreadcrumb(fx.db, { id: 'chg-context-v2' }, { rootDir: fx.rootDir });
    assert.equal(breadcrumb.change_id, 'chg-context-v2');
    assert.equal(breadcrumb.task_id, 'context-v2-task');
    assert.equal(breadcrumb.role, 'implement');
    assert.equal(breadcrumb.readiness, 'ready');
    assert.match(breadcrumb.context_manifest_hash, /^[0-9a-f]{64}$/);
  } finally {
    cleanup(fx);
  }
});

test('compileContext is pure with respect to Change provider authority', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-context-pure', title: 'Compile without mutation', kind: 'quick',
      intent: 'Context compilation must not rewrite accepted Change authority.',
      provider_refs: {
        memory: { provider: 'cloud-mem', reference: 'cmem://accepted', status: 'fresh' },
      },
    }, { rootDir: fx.rootDir });
    const before = changes.readChange(fx.db, created.change.id);
    const compiled = changes.compileContext(fx.db, {
      id: created.change.id, role: 'plan', gate: 'planning',
    }, { rootDir: fx.rootDir });
    const after = changes.readChange(fx.db, created.change.id);

    assert.deepEqual(after.provider_refs, before.provider_refs);
    assert.equal(after.updated_at, before.updated_at);
    assert.deepEqual(compiled.manifest.providers, before.provider_refs);
    assert.throws(
      () => changes.compileContext(fx.db, {
        id: created.change.id,
        provider_refs: {
          memory: { provider: 'cloud-mem', reference: 'cmem://override', status: 'fresh' },
        },
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'CONTEXT_PROVIDER_REFS_MUTATION_UNSUPPORTED',
    );
  } finally {
    cleanup(fx);
  }
});

test('implementation context embeds one bounded task neighborhood and counts inline authority bytes', () => {
  const fx = fixture();
  try {
    const created = changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-context-scope', title: 'Bound implementation task scope', kind: 'standard',
      intent: `Keep implementation context bounded.${' accepted context'.repeat(100)}`,
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'scope-dependency', title: 'Dependency', type: 'feature', priority: 'P0',
      change_id: created.change.id,
    });
    createExecutableTask(fx.db, {
      id: 'scope-selected', title: 'Selected', type: 'feature', priority: 'P0',
      change_id: created.change.id, deps: ['scope-dependency'],
    });
    createExecutableTask(fx.db, {
      id: 'scope-integration', title: 'Integration', type: 'feature', priority: 'P1',
      change_id: created.change.id, deps: ['scope-selected'], slice_kind: 'integration_checkpoint',
    });
    createExecutableTask(fx.db, {
      id: 'scope-unrelated', title: 'Unrelated', type: 'feature', priority: 'P2',
      change_id: created.change.id,
    });

    const compiled = changes.compileContext(fx.db, {
      id: created.change.id, task_id: 'scope-selected', role: 'implement',
      gate: 'implementation', budget: { max_tokens: 10, max_files: 10 },
    }, { rootDir: fx.rootDir });
    assert.deepEqual(
      compiled.manifest.tasks.map((task) => task.id).sort(),
      ['scope-dependency', 'scope-integration', 'scope-selected'],
    );
    assert.equal(compiled.manifest.tasks.some((task) => task.id === 'scope-unrelated'), false);
    assert.ok(compiled.manifest.context.inline_token_estimate > 10);
    assert.equal(
      compiled.manifest.context.token_estimate,
      compiled.manifest.context.file_token_estimate
        + compiled.manifest.context.inline_token_estimate,
    );
    assert.ok(compiled.manifest.readiness.warnings.includes('CONTEXT_TOKEN_BUDGET_EXCEEDED'));
    assert.equal(compiled.manifest.task_context_contract.purpose.includes('scope-selected'), true);
    assert.deepEqual(compiled.manifest.task_context_contract.constraints, created.change.contract.constraints || []);
    assert.deepEqual(compiled.manifest.task_context_contract.non_goals, created.change.contract.non_goals || []);
    assert.deepEqual(compiled.manifest.task_context_contract.recovery, created.change.contract.recovery);
  } finally {
    cleanup(fx);
  }
});

test('compileContext blocks a required missing ref', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-context-budget', title: 'Bound context packet', kind: 'quick',
      intent: 'Fail closed when required context is missing while reporting size pressure.',
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'budget-task', title: 'Compile bounded packet', type: 'bugfix', priority: 'P0',
      change_id: 'chg-context-budget',
      context_refs: [
        { ref: 'missing-contract.md', kind: 'spec', reason: 'Required contract', required: true },
        { ref: 'README.md', kind: 'source', reason: 'Current implementation', required: true },
      ],
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-context-budget',
      ...executionContext('budget-task', {
        context_refs: [
          { ref: 'missing-contract.md', kind: 'spec', reason: 'Required contract', required: true },
          { ref: 'README.md', kind: 'source', reason: 'Current implementation', required: true },
        ],
        budget: { max_tokens: 2_000, max_files: 4 },
      }),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.readiness.status, 'blocked');
    assert.ok(compiled.manifest.readiness.blockers.includes('CONTEXT_REQUIRED_REF_MISSING:missing-contract.md'));
  } finally {
    cleanup(fx);
  }
});

test('an incident can proceed with four necessary large files while context budgets remain advisory', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-incident-context', title: 'Recover IM runtime', kind: 'incident',
      intent: 'Keep an urgent root-cause fix executable when its required files exceed guidance.',
    }, { rootDir: fx.rootDir });
    const refs = [];
    for (let index = 1; index <= 4; index += 1) {
      const ref = `incident-runtime-${index}.cjs`;
      fs.writeFileSync(path.join(fx.rootDir, ref), 'x'.repeat(8_000));
      refs.push({
        ref, kind: 'source', reason: `Required incident runtime boundary ${index}`, required: true,
      });
    }
    createExecutableTask(fx.db, {
      id: 'incident-context-task', title: 'Repair IM terminal transition', type: 'bugfix', priority: 'P0',
      change_id: 'chg-incident-context',
      context_refs: refs,
      public_seam: 'IM terminal transition',
      verification_command: 'node --test im-terminal.test.cjs',
    });

    const compiled = changes.compileContext(fx.db, {
      id: 'chg-incident-context',
      ...executionContext('incident-context-task', {
        context_refs: refs,
        budget: { max_tokens: 100, max_files: 2 },
        execution_contract: {
          context_budget_percent: 80,
        },
      }),
    }, { rootDir: fx.rootDir });

    assert.equal(compiled.manifest.readiness.status, 'ready');
    assert.deepEqual(compiled.manifest.readiness.blockers, []);
    assert.ok(compiled.manifest.readiness.warnings.includes('CONTEXT_FILE_BUDGET_EXCEEDED'));
    assert.ok(compiled.manifest.readiness.warnings.includes('CONTEXT_TOKEN_BUDGET_EXCEEDED'));
    assert.ok(compiled.manifest.readiness.warnings.includes('EXECUTION_CONTEXT_BUDGET_ADVISORY'));
    assert.equal(compiled.manifest.context.file_count, 4);
    assert.ok(compiled.manifest.context.token_estimate > 100);
  } finally {
    cleanup(fx);
  }
});

test('spec-learning candidates are approval-gated and unresolved candidates block convergence', () => {
  const fx = fixture();
  try {
    changes.createChange(fx.db, { ...completeChangeInput(),
      id: 'chg-learning', title: 'Converge learned contract', kind: 'quick',
      intent: 'Promote stable implementation discoveries into an approved baseline update.',
      docs_impact: { status: 'none', files: [], rationale: 'Fixture exercises the approval state machine.' },
    }, { rootDir: fx.rootDir });
    createExecutableTask(fx.db, {
      id: 'learning-task', title: 'Capture stable contract', type: 'bugfix', priority: 'P0',
      change_id: 'chg-learning',
    });
    ops.updateTaskStatus(fx.db, 'learning-task', 'in_progress');
    ops.updateTaskStatus(fx.db, 'learning-task', 'completed');
    changes.compileContext(fx.db, {
      id: 'chg-learning', ...executionContext('learning-task'),
    }, { rootDir: fx.rootDir });

    const proposed = changes.proposeSpecLearning(fx.db, {
      id: 'learning-1', change_id: 'chg-learning', task_id: 'learning-task',
      target_ref: 'README.md#contract', summary: 'The public command fails closed on stale context.',
      evidence: ['node --test learning-task.test.cjs'],
    }, { rootDir: fx.rootDir });
    assert.equal(proposed.status, 'proposed');

    seedGateWorkflows(fx, 'chg-learning');
    const blocked = changes.convergeChange(
      fx.db, { id: 'chg-learning' }, { rootDir: fx.rootDir },
    );
    assert.ok(blocked.blockers.includes('SPEC_LEARNING_UNRESOLVED:learning-1'));

    assert.equal(changes.resolveSpecLearning(fx.db, {
      change_id: 'chg-learning', candidate_id: 'learning-1', decision: 'approve',
      resolution: 'Stable public contract.',
    }, { rootDir: fx.rootDir }).status, 'approved');
    const readme = path.join(fx.rootDir, 'README.md');
    const beforeDigest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(readme)).digest('hex');
    fs.appendFileSync(readme, '\n## Contract\n\nThe public command fails closed on stale context.\n');
    const afterDigest = require('node:crypto').createHash('sha256')
      .update(fs.readFileSync(readme)).digest('hex');
    assert.equal(changes.resolveSpecLearning(fx.db, {
      change_id: 'chg-learning', candidate_id: 'learning-1', decision: 'apply',
      resolution: 'Applied to README.md#contract.',
      applied_ref: 'README.md#contract', before_digest: beforeDigest, after_digest: afterDigest,
      apply_evidence: ['README.md#contract'],
    }, { rootDir: fx.rootDir }).status, 'applied');

    const projection = JSON.parse(fs.readFileSync(
      path.join(fx.rootDir, '.ultra', 'changes', 'active', 'chg-learning', 'spec-learning.json'),
      'utf8',
    ));
    assert.equal(projection.source, '.ultra/.runtime/state.db');
    assert.equal(projection.candidates[0].status, 'applied');
  } finally {
    cleanup(fx);
  }
});
