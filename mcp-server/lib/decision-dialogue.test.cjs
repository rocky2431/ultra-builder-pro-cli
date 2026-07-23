'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const decisions = require('./decision-dialogue.cjs');
const changes = require('./change-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-decisions-'));
  const dbPath = path.join(rootDir, '.ultra', 'state.db');
  const initialized = initStateDb(dbPath);
  seedReadyBaseline(initialized.db, { rootDir });
  return { rootDir, dbPath, db: initialized.db };
}

function cleanup(fx) {
  closeStateDb(fx.db);
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function question(input = {}) {
  return {
    id: input.id || 'decision-api-compatibility',
    thread_id: input.thread_id || 'thread-change-alignment',
    phase: input.phase || 'change-contract',
    question: input.question || 'Should this change preserve the existing public API for one release?',
    why_now: input.why_now || 'The answer changes task boundaries, rollout order, and rollback.',
    recommendation: input.recommendation || 'Preserve compatibility for one release because active consumers still exist.',
    options: input.options || [
      { id: 'preserve', label: 'Preserve compatibility', tradeoff: 'Lower migration risk with temporary adapter cost.' },
      { id: 'replace', label: 'Replace immediately', tradeoff: 'Simpler implementation with coordinated consumer migration.' },
    ],
    evidence_refs: input.evidence_refs || ['src/public-api.js#exports'],
    effects: input.effects || {
      summary: 'Changes API contract, rollout order, and recovery tasks.',
      artifacts: ['change-contract', 'plan'],
    },
    blocking: input.blocking ?? true,
  };
}

function createAlignedChange(fx, id = 'decision-change') {
  return changes.createChange(fx.db, completeChangeInput({
    id,
    title: 'Preserve decision authority',
    kind: 'standard',
    intent: 'Require owner alignment before planning can advance.',
    docs_impact: { status: 'none', rationale: 'Authority-only fixture.' },
  }), { rootDir: fx.rootDir });
}

test('current schema retains the durable schema 16 decision dialogue authority', () => {
  const fx = fixture();
  try {
    assert.deepEqual(
      fx.db.prepare('SELECT version FROM schema_version WHERE version = ?').get('16.0'),
      { version: '16.0' },
    );
    const tables = new Set(fx.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map((row) => row.name));
    assert.ok(tables.has('decision_threads'));
    assert.ok(tables.has('decision_items'));
  } finally {
    cleanup(fx);
  }
});

test('one decision thread exposes only one current question and resumes from DB', () => {
  const fx = fixture();
  try {
    const thread = decisions.startDecisionThread(fx.db, {
      id: 'thread-change-alignment',
      baseline_id: 'test-baseline',
      purpose: 'Align the owner and agent on one bounded change contract.',
      mode: 'guided',
    });
    assert.equal(thread.status, 'active');
    assert.throws(
      () => decisions.startDecisionThread(fx.db, {
        id: 'thread-competing-alignment', baseline_id: 'test-baseline',
        purpose: 'Ask a different question against the same active authority.', mode: 'guided',
      }),
      (error) => error.code === 'DECISION_THREAD_IN_PROGRESS',
    );
    const opened = decisions.openDecision(fx.db, question());
    assert.equal(opened.current_decision.id, 'decision-api-compatibility');
    assert.throws(
      () => decisions.openDecision(fx.db, question({ id: 'decision-second' })),
      (error) => error.code === 'DECISION_ALREADY_OPEN',
    );

    closeStateDb(fx.db);
    fx.db = initStateDb(fx.dbPath).db;
    const resumed = decisions.readDecisionThread(fx.db, 'thread-change-alignment');
    assert.equal(resumed.current_decision.question, question().question);
    assert.equal(resumed.items.length, 1);
  } finally {
    cleanup(fx);
  }
});

test('blocking decisions stop workflow advancement until an approved checkpoint binds artifacts', () => {
  const fx = fixture();
  try {
    const created = createAlignedChange(fx);
    const plan = workflows.startWorkflow(fx.db, {
      id: 'plan-after-capture',
      kind: 'plan',
      change_id: created.change.id,
      subject: 'Plan only after the remaining material decision is aligned.',
    }, { rootDir: fx.rootDir });
    decisions.startDecisionThread(fx.db, {
      id: 'thread-change-alignment',
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
      purpose: 'Resolve material authority before downstream planning advances.',
      mode: 'guided',
    });
    decisions.openDecision(fx.db, question());

    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: plan.id, step_id: 'validate-baseline', status: 'completed',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING',
    );
    decisions.resolveDecision(fx.db, {
      id: 'decision-api-compatibility',
      decision: 'Preserve compatibility for one release.',
      rationale: 'Two active consumers need a safe migration window.',
      decided_by: 'owner',
    });
    const prepared = decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'prepare',
      summary: 'The change contract preserves compatibility for one release.',
    }, { rootDir: fx.rootDir });
    assert.equal(prepared.status, 'checkpoint_ready');
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: plan.id, step_id: 'validate-baseline', status: 'completed',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING',
    );

    assert.throws(
      () => decisions.checkpointDecisionThread(fx.db, {
        id: 'thread-change-alignment', action: 'confirm',
        approved_by: 'owner', approval_note: 'Attempted confirmation without evidence.',
        no_artifact_reason: 'The workflow has not written its required projection.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ARTIFACT_REQUIRED',
    );

    const alignmentPath = path.join(created.change.artifact_root, 'alignment.md');
    fs.writeFileSync(path.join(fx.rootDir, alignmentPath), '# Alignment\n\nCompatibility is preserved.\n');
    const confirmed = decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'confirm',
      approved_by: 'owner', approval_note: 'Confirmed after reviewing the durable effect.',
      artifacts: [{ path: alignmentPath, kind: 'alignment-projection' }],
    }, { rootDir: fx.rootDir });
    assert.equal(confirmed.status, 'confirmed');
    assert.match(confirmed.checkpoint.artifacts[0].digest, /^[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(fx.rootDir, alignmentPath), '# Alignment\n\nCompatibility changed after approval.\n');
    const staleHealth = decisions.inspectDecisionHealth(fx.db, { rootDir: fx.rootDir });
    assert.equal(staleHealth.status, 'fail');
    assert.equal(staleHealth.current_thread_id, 'thread-change-alignment');
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: plan.id, step_id: 'validate-baseline', status: 'completed',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING'
        && error.details.blockers.includes('DECISION_CHECKPOINT_ARTIFACT_STALE:thread-change-alignment'),
    );
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'prepare',
      summary: 'The same compatibility decision now binds the corrected alignment artifact.',
    }, { rootDir: fx.rootDir });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'confirm',
      approved_by: 'owner', approval_note: 'Reconfirmed after reviewing the corrected artifact.',
      artifacts: [{ path: alignmentPath, kind: 'alignment-projection' }],
    }, { rootDir: fx.rootDir });
    assert.equal(decisions.inspectDecisionHealth(fx.db, { rootDir: fx.rootDir }).status, 'pass');

    const advanced = workflows.recordWorkflowStep(fx.db, {
      id: plan.id, step_id: 'validate-baseline', status: 'completed',
      evidence: [{
        kind: 'baseline',
        ref: 'test-baseline',
        summary: 'The current baseline and owner checkpoint are ready for planning.',
      }],
    }, { rootDir: fx.rootDir });
    assert.equal(advanced.current_step, 'analyze-requirements');
  } finally {
    cleanup(fx);
  }
});

test('delegation is durable, while a deferred blocking decision remains a gate', () => {
  const fx = fixture();
  try {
    const created = createAlignedChange(fx);
    decisions.startDecisionThread(fx.db, {
      id: 'thread-change-alignment', change_id: created.change.id,
      workflow_run_id: created.workflow.id,
      purpose: 'Exercise explicit owner delegation and deferral.', mode: 'fast',
    });
    decisions.openDecision(fx.db, question());
    const delegated = decisions.delegateDecision(fx.db, {
      id: 'decision-api-compatibility',
      delegated_to: 'primary-agent',
      decision: 'Preserve compatibility for one release.',
      rationale: 'The agent may choose the reversible implementation inside the accepted seam.',
      guardrails: ['Do not break active consumers.', 'Keep rollback executable.'],
    });
    assert.equal(delegated.items[0].status, 'delegated');
    assert.equal(delegated.items[0].resolution.authority, 'delegated');

    decisions.openDecision(fx.db, question({
      id: 'decision-release-window',
      question: 'Which release window owns removal of the compatibility layer?',
    }));
    decisions.deferDecision(fx.db, {
      id: 'decision-release-window',
      reason: 'The downstream release calendar is not yet available.',
      consequences: 'Planning cannot claim a complete retirement path.',
      revisit_condition: 'Resolve when the downstream release calendar is published.',
    });
    assert.throws(
      () => decisions.checkpointDecisionThread(fx.db, {
        id: 'thread-change-alignment', action: 'prepare', summary: 'Partial alignment.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING',
    );
  } finally {
    cleanup(fx);
  }
});

test('superseding a confirmed owner decision reopens alignment without erasing history', () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'thread-change-alignment', baseline_id: 'test-baseline',
      purpose: 'Keep revisions of an owner decision.', mode: 'guided',
    });
    decisions.openDecision(fx.db, question());
    decisions.resolveDecision(fx.db, {
      id: 'decision-api-compatibility', decision: 'Preserve compatibility.',
      rationale: 'Active consumers exist.', decided_by: 'owner',
    });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'prepare', summary: 'Initial decision.',
    }, { rootDir: fx.rootDir });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'confirm',
      approved_by: 'owner', approval_note: 'Initial decision approved.',
      no_artifact_reason: 'This standalone thinking thread has no project artifact.',
    }, { rootDir: fx.rootDir });

    const reopened = decisions.supersedeDecision(fx.db, {
      id: 'decision-api-compatibility',
      replacement: question({
        id: 'decision-api-compatibility-v2',
        question: 'Should new runtime evidence change the compatibility decision?',
      }),
      reason: 'New runtime evidence shows that all consumers have migrated.',
    });
    assert.equal(reopened.status, 'active');
    assert.equal(reopened.items[0].status, 'superseded');
    assert.equal(reopened.current_decision.id, 'decision-api-compatibility-v2');
    assert.equal(reopened.checkpoint.invalidated, true);

    decisions.resolveDecision(fx.db, {
      id: 'decision-api-compatibility-v2',
      decision: 'Remove the compatibility layer after verified consumer migration.',
      rationale: 'Current runtime evidence proves all consumers migrated.',
      decided_by: 'owner',
    });
    const revisedCheckpoint = decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-change-alignment', action: 'prepare', summary: 'Compatibility may now be removed.',
    }, { rootDir: fx.rootDir });
    assert.equal(revisedCheckpoint.checkpoint.history.length, 1);
    assert.equal(revisedCheckpoint.checkpoint.history[0].invalidated, true);
  } finally {
    cleanup(fx);
  }
});

test('a change-bound dialogue does not block an unrelated change on the same baseline', () => {
  const fx = fixture();
  try {
    const first = createAlignedChange(fx, 'decision-change-a');
    const second = createAlignedChange(fx, 'decision-change-b');
    fx.db.prepare(
      `INSERT INTO baselines (id, project_name, mode, status)
       VALUES ('other-baseline', 'other', 'greenfield', 'draft')`,
    ).run();
    assert.throws(
      () => decisions.startDecisionThread(fx.db, {
        id: 'thread-mismatched-authority', baseline_id: 'other-baseline',
        change_id: first.change.id, purpose: 'Reject mismatched change authority.', mode: 'guided',
      }),
      (error) => error.code === 'DECISION_AUTHORITY_MISMATCH',
    );
    decisions.startDecisionThread(fx.db, {
      id: 'thread-change-a',
      baseline_id: 'test-baseline',
      change_id: first.change.id,
      workflow_run_id: first.workflow.id,
      purpose: 'Align only change A.',
      mode: 'guided',
    });
    decisions.openDecision(fx.db, question({
      id: 'decision-change-a-scope',
      thread_id: 'thread-change-a',
    }));

    const firstGate = decisions.decisionGate(fx.db, {
      baseline_id: 'test-baseline',
      change_id: first.change.id,
      workflow_run_id: first.workflow.id,
    });
    const secondGate = decisions.decisionGate(fx.db, {
      baseline_id: 'test-baseline',
      change_id: second.change.id,
      workflow_run_id: second.workflow.id,
    });

    assert.equal(firstGate.ready, false);
    assert.equal(secondGate.ready, true);
  } finally {
    cleanup(fx);
  }
});
