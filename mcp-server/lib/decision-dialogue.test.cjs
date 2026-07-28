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

test('an open owner decision blocks advancement while resolved accepted intent needs no ceremonial checkpoint', () => {
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
    const advanced = workflows.recordWorkflowStep(fx.db, {
      id: plan.id, step_id: 'validate-baseline', status: 'completed',
      evidence: [{
        kind: 'baseline',
        ref: 'test-baseline',
        summary: 'The current baseline and normalized owner decision are ready for planning.',
      }],
    }, { rootDir: fx.rootDir });
    assert.equal(advanced.current_step, 'analyze-requirements');

    const completed = decisions.completeDecisionThread(fx.db, {
      id: 'thread-change-alignment',
      summary: 'Compatibility intent is normalized and no artifact checkpoint is required.',
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completed_at !== null, true);
    assert.equal(decisions.inspectDecisionHealth(fx.db, { rootDir: fx.rootDir }).status, 'pass');

    const next = decisions.startDecisionThread(fx.db, {
      id: 'thread-follow-up-alignment',
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
      purpose: 'Allow a later material question after the prior dialogue completed.',
      mode: 'fast',
    });
    assert.equal(next.status, 'active');
  } finally {
    cleanup(fx);
  }
});

test('an open non-blocking question does not become a global workflow gate', () => {
  const fx = fixture();
  try {
    const created = createAlignedChange(fx);
    const plan = workflows.startWorkflow(fx.db, {
      id: 'plan-with-non-blocking-question',
      kind: 'plan',
      change_id: created.change.id,
      subject: 'Advance work that does not depend on an optional follow-up.',
    }, { rootDir: fx.rootDir });
    decisions.startDecisionThread(fx.db, {
      id: 'thread-non-blocking-follow-up',
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
      purpose: 'Retain an optional follow-up without blocking unrelated work.',
      mode: 'fast',
    });
    decisions.openDecision(fx.db, question({
      id: 'decision-optional-release-note',
      thread_id: 'thread-non-blocking-follow-up',
      question: 'Should the later release note include a migration example?',
      blocking: false,
    }));
    assert.throws(
      () => decisions.completeDecisionThread(fx.db, {
        id: 'thread-non-blocking-follow-up',
        summary: 'The optional question was not answered.',
      }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING'
        && error.details.blockers.includes('DECISION_AWAITING_OWNER:decision-optional-release-note'),
    );

    const gate = decisions.decisionGate(fx.db, {
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
    });
    assert.equal(gate.ready, true);
    assert.deepEqual(gate.blockers, []);
    assert.equal(gate.current_decision.id, 'decision-optional-release-note');

    const advanced = workflows.recordWorkflowStep(fx.db, {
      id: plan.id, step_id: 'validate-baseline', status: 'completed',
      evidence: [{
        kind: 'baseline',
        ref: 'test-baseline',
        summary: 'The optional release-note question does not affect baseline validity.',
      }],
    }, { rootDir: fx.rootDir });
    assert.equal(advanced.current_step, 'analyze-requirements');

    decisions.deferDecision(fx.db, {
      id: 'decision-optional-release-note',
      reason: 'The release note is outside the current implementation boundary.',
      consequences: 'A later documentation change may add the example.',
      revisit_condition: 'Revisit when release documentation begins.',
    });
    assert.equal(decisions.completeDecisionThread(fx.db, {
      id: 'thread-non-blocking-follow-up',
      summary: 'The optional follow-up is durably deferred without blocking implementation.',
    }).status, 'completed');
  } finally {
    cleanup(fx);
  }
});

test('an explicitly prepared artifact checkpoint remains a freshness gate', () => {
  const fx = fixture();
  try {
    const created = createAlignedChange(fx);
    const plan = workflows.startWorkflow(fx.db, {
      id: 'plan-with-artifact-checkpoint',
      kind: 'plan',
      change_id: created.change.id,
      subject: 'Keep an explicitly checkpointed alignment artifact current.',
    }, { rootDir: fx.rootDir });
    decisions.startDecisionThread(fx.db, {
      id: 'thread-artifact-alignment',
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
      purpose: 'Bind a material decision cluster to a durable artifact.',
      mode: 'guided',
    });
    decisions.openDecision(fx.db, question({
      id: 'decision-artifact-compatibility',
      thread_id: 'thread-artifact-alignment',
    }));
    decisions.resolveDecision(fx.db, {
      id: 'decision-artifact-compatibility',
      decision: 'Preserve compatibility for one release.',
      rationale: 'Two active consumers need a safe migration window.',
      decided_by: 'owner',
    });
    const alignmentPath = path.join(created.change.artifact_root, 'alignment.md');
    fs.writeFileSync(path.join(fx.rootDir, alignmentPath), '# Alignment\n\nCompatibility is preserved.\n');
    const prepared = decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-artifact-alignment', action: 'prepare',
      summary: 'The change contract preserves compatibility for one release.',
    }, { rootDir: fx.rootDir });
    assert.equal(prepared.status, 'checkpoint_ready');
    const confirmed = decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-artifact-alignment', action: 'confirm',
      approved_by: 'owner', approval_note: 'Confirmed after reviewing the durable effect.',
      artifacts: [{ path: alignmentPath, kind: 'alignment-projection' }],
    }, { rootDir: fx.rootDir });
    assert.equal(confirmed.status, 'confirmed');
    assert.match(confirmed.checkpoint.artifacts[0].digest, /^[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(fx.rootDir, alignmentPath), '# Alignment\n\nCompatibility changed after approval.\n');
    const staleHealth = decisions.inspectDecisionHealth(fx.db, { rootDir: fx.rootDir });
    assert.equal(staleHealth.status, 'fail');
    assert.equal(staleHealth.current_thread_id, 'thread-artifact-alignment');
    assert.throws(
      () => workflows.recordWorkflowStep(fx.db, {
        id: plan.id, step_id: 'validate-baseline', status: 'completed',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'DECISION_ALIGNMENT_BLOCKING'
        && error.details.blockers.includes('DECISION_CHECKPOINT_ARTIFACT_STALE:thread-artifact-alignment'),
    );
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-artifact-alignment', action: 'prepare',
      summary: 'The same compatibility decision now binds the corrected alignment artifact.',
    }, { rootDir: fx.rootDir });
    decisions.checkpointDecisionThread(fx.db, {
      id: 'thread-artifact-alignment', action: 'confirm',
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

test('decision gate reports the blocking thread instead of an older advisory thread', () => {
  const fx = fixture();
  try {
    decisions.startDecisionThread(fx.db, {
      id: 'thread-baseline-advisory',
      baseline_id: 'test-baseline',
      purpose: 'Retain one advisory baseline follow-up.',
      mode: 'fast',
    });
    decisions.openDecision(fx.db, question({
      id: 'decision-baseline-advisory',
      thread_id: 'thread-baseline-advisory',
      question: 'Should a later guide include another example?',
      blocking: false,
    }));

    const created = createAlignedChange(fx, 'decision-change-blocking');
    const plan = workflows.startWorkflow(fx.db, {
      id: 'plan-with-blocking-thread',
      kind: 'plan',
      change_id: created.change.id,
      subject: 'Expose the actual blocking decision.',
    }, { rootDir: fx.rootDir });
    decisions.startDecisionThread(fx.db, {
      id: 'thread-change-blocking',
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
      purpose: 'Resolve the blocking change decision.',
      mode: 'guided',
    });
    decisions.openDecision(fx.db, question({
      id: 'decision-change-blocking',
      thread_id: 'thread-change-blocking',
    }));

    const gate = decisions.decisionGate(fx.db, {
      baseline_id: 'test-baseline',
      change_id: created.change.id,
      workflow_run_id: plan.id,
    });
    assert.equal(gate.ready, false);
    assert.equal(gate.thread.id, 'thread-change-blocking');
    assert.equal(gate.current_decision.id, 'decision-change-blocking');
  } finally {
    cleanup(fx);
  }
});
