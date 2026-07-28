'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const {
  compileRoleContext,
  deriveTransitions,
  readBreadcrumb,
  validateContextSnapshot,
} = require('./context-spine.cjs');
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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
      metadata: { selection_reason: 'The owner accepted the applicable brownfield evidence areas.' },
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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

    compileContext(db, {
      id: change.id, task_id: task.id, role: 'implement', gate: 'implementation',
    }, { rootDir });
    db.prepare(
      `UPDATE context_snapshots SET context_json = '{}', readiness = 'ready'
       WHERE change_id = ? AND task_id = ? AND role = 'implement' AND gate = 'implementation'`,
    ).run(change.id, task.id);
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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
    assert.ok(
      db.prepare(
        `SELECT id FROM context_snapshots
         WHERE change_id = ? AND task_id IS ? AND role = 'implement' AND gate = 'implementation'`,
      ).get(change.id, task.id),
      JSON.stringify(db.prepare('SELECT change_id, task_id, role, gate FROM context_snapshots').all()),
    );
    patchTask(db, task.id, { public_seam: 'updated context manifest' });
    const stale = readBreadcrumb(db, { id: change.id }, { rootDir });
    assert.equal(stale.readiness, 'blocked');
    assert.ok(
      stale.blockers.includes('CONTEXT_TASK_CONTRACT_STALE'),
      JSON.stringify(stale),
    );
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('role context inheritance is isolated by task, role, and gate', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-role-key-'));
  fs.writeFileSync(path.join(rootDir, 'implementation.md'), '# Implementation\n');
  fs.writeFileSync(path.join(rootDir, 'review.md'), '# Review\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, { ...completeChangeInput(),
      id: 'role-key', title: 'Role-keyed context', kind: 'quick',
      intent: 'Keep implementation and review context independent.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    compileContext(db, {
      id: change.id, role: 'plan', gate: 'planning',
      context_refs: [{ ref: 'implementation.md', reason: 'Planning contract.', required: true }],
    }, { rootDir });
    compileContext(db, {
      id: change.id, role: 'review', gate: 'review',
      context_refs: [{ ref: 'review.md', reason: 'Independent review contract.', required: true }],
    }, { rootDir });

    const implementation = compileRoleContext(db, {
      input: { role: 'plan', gate: 'planning' },
      change, tasks: [], rootDir,
    });
    assert.equal(implementation.context.items[0].ref, 'implementation.md');
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('spec_refs reject undeclared or oversized payload and contribute normalized metadata to budget', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-spec-refs-'));
  fs.writeFileSync(path.join(rootDir, 'planning.md'), '# Planning contract\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, {
      ...completeChangeInput(),
      id: 'bounded-spec-refs',
      title: 'Bound specification references',
      kind: 'quick',
      intent: 'Keep context metadata bounded and explicit.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });

    assert.throws(
      () => compileRoleContext(db, {
        input: {
          role: 'plan',
          gate: 'planning',
          context_refs: [],
          spec_refs: [{
            ref: 'planning.md',
            reason: 'Must not be silently discarded.',
          }],
        },
        change,
        tasks: [],
        rootDir,
      }),
      (error) => error.code === 'VALIDATION_ERROR'
        && /mutually exclusive/.test(error.message),
    );
    assert.throws(
      () => compileRoleContext(db, {
        input: {
          role: 'plan',
          gate: 'planning',
          spec_refs: [{
            ref: 'planning.md',
            reason: 'Current planning contract.',
            inline_blob: 'x'.repeat(200_000),
          }],
        },
        change,
        tasks: [],
        rootDir,
      }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => compileRoleContext(db, {
        input: {
          role: 'plan',
          gate: 'planning',
          spec_refs: [{
            ref: 'planning.md',
            reason: 'x'.repeat(200_000),
          }],
        },
        change,
        tasks: [],
        rootDir,
      }),
      (error) => error.code === 'VALIDATION_ERROR',
    );

    const shortContext = compileRoleContext(db, {
      input: {
        role: 'plan',
        gate: 'planning',
        spec_refs: [{
          ref: 'planning.md',
          reason: 'Current planning contract.',
        }],
      },
      change,
      tasks: [],
      rootDir,
    });
    const longContext = compileRoleContext(db, {
      input: {
        role: 'plan',
        gate: 'planning',
        spec_refs: [{
          ref: 'planning.md',
          reason: `Current planning contract: ${'bounded context detail '.repeat(60)}`,
        }],
      },
      change,
      tasks: [],
      rootDir,
    });
    assert.ok(
      longContext.context.inline_token_estimate
        > shortContext.context.inline_token_estimate + 200,
      'normalized reference metadata must consume the inline context budget',
    );
    assert.deepEqual(
      Object.keys(longContext.context.items[0]).sort(),
      [
        'digest',
        'estimated_tokens',
        'expected_digest',
        'freshness_policy',
        'kind',
        'reason',
        'ref',
        'required',
        'role',
        'status',
      ],
    );
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('optional digest and advisory reference drift stays nonblocking and is presented as current warning state', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-optional-freshness-'));
  const optionalPath = path.join(rootDir, 'optional.md');
  const advisoryPath = path.join(rootDir, 'advisory.md');
  fs.writeFileSync(optionalPath, '# Optional v1\n');
  fs.writeFileSync(advisoryPath, '# Advisory v1\n');
  const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, {
      ...completeChangeInput(),
      id: 'optional-freshness',
      title: 'Present nonblocking reference drift',
      kind: 'quick',
      intent: 'Keep optional and advisory evidence visible without making it authority.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    compileContext(db, {
      id: change.id,
      role: 'plan',
      gate: 'planning',
      context_refs: [{
        ref: 'optional.md',
        reason: 'Helpful but nonblocking planning evidence.',
        required: false,
        expected_digest: digest(optionalPath),
        freshness_policy: 'digest',
      }],
    }, { rootDir });
    compileContext(db, {
      id: change.id,
      role: 'review',
      gate: 'review',
      context_refs: [{
        ref: 'advisory.md',
        reason: 'Review should surface drift without blocking.',
        required: true,
        expected_digest: digest(advisoryPath),
        freshness_policy: 'advisory',
      }],
    }, { rootDir });
    fs.writeFileSync(optionalPath, '# Optional v2\n');
    fs.writeFileSync(advisoryPath, '# Advisory v2\n');

    const optional = validateContextSnapshot(db, {
      change_id: change.id,
      task_id: null,
      role: 'plan',
      gate: 'planning',
    }, { rootDir });
    assert.deepEqual(optional.blockers, []);
    assert.ok(optional.warnings.includes('CONTEXT_OPTIONAL_REF_STALE:optional.md'));
    assert.equal(optional.manifest.context.items[0].freshness_status, 'stale');
    assert.equal(optional.manifest.context.items[0].current_digest, digest(optionalPath));

    const advisory = validateContextSnapshot(db, {
      change_id: change.id,
      task_id: null,
      role: 'review',
      gate: 'review',
    }, { rootDir });
    assert.deepEqual(advisory.blockers, []);
    assert.ok(advisory.warnings.includes('CONTEXT_REF_STALE_ADVISORY:advisory.md'));
    assert.equal(advisory.manifest.context.items[0].freshness_status, 'stale');
    assert.equal(advisory.manifest.context.items[0].current_digest, digest(advisoryPath));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('local Context refs reject final and ancestor symlinks without reading their targets', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-local-ref-symlink-'));
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-external-ref-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, {
      ...completeChangeInput(),
      id: 'unsafe-local-context',
      title: 'Reject unsafe local Context refs',
      kind: 'quick',
      intent: 'Never read a project Context reference through a symbolic link.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    const secret = path.join(externalRoot, 'secret.md');
    fs.writeFileSync(secret, '# External secret\n');
    fs.symlinkSync(secret, path.join(rootDir, 'final-link.md'));
    fs.symlinkSync(externalRoot, path.join(rootDir, 'ancestor-link'));

    for (const ref of ['final-link.md', 'ancestor-link/secret.md']) {
      let attemptedRead = false;
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = function guardedReadFileSync(candidate, ...args) {
        if (typeof candidate === 'string'
          && path.resolve(candidate) === path.resolve(rootDir, ref)) {
          attemptedRead = true;
          throw new Error(`unsafe test read attempted: ${candidate}`);
        }
        return originalReadFileSync.call(this, candidate, ...args);
      };
      try {
        assert.throws(
          () => compileRoleContext(db, {
            input: {
              role: 'plan',
              gate: 'planning',
              context_refs: [{
                ref,
                kind: 'source',
                reason: 'This local reference must remain inside the project.',
                required: true,
              }],
            },
            change,
            tasks: [],
            rootDir,
          }),
          (error) => error.code === 'CONTEXT_REF_UNSAFE',
        );
        assert.equal(attemptedRead, false, `Context compiler read through ${ref}`);
      } finally {
        fs.readFileSync = originalReadFileSync;
      }
    }

    assert.throws(
      () => compileRoleContext(db, {
        input: {
          role: 'plan',
          gate: 'planning',
          context_refs: [{
            ref: 'https://example.test/contract',
            kind: 'source',
            reason: 'A URI is external only when explicitly classified as external.',
            required: true,
          }],
        },
        change,
        tasks: [],
        rootDir,
      }),
      (error) => error.code === 'VALIDATION_ERROR',
    );
    const external = compileRoleContext(db, {
      input: {
        role: 'plan',
        gate: 'planning',
        context_refs: [{
          ref: 'https://example.test/contract',
          kind: 'external',
          reason: 'Explicit external evidence remains metadata-only.',
          required: true,
        }],
      },
      change,
      tasks: [],
      rootDir,
    });
    assert.equal(external.context.items[0].status, 'external');
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('Context revalidation rejects a local file swapped to a symlink after compile without reading it', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-local-ref-swap-'));
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-external-swap-'));
  const localRef = path.join(rootDir, 'contract.md');
  const external = path.join(externalRoot, 'contract.md');
  fs.writeFileSync(localRef, '# Local contract\n');
  fs.writeFileSync(external, '# External replacement\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, {
      ...completeChangeInput(),
      id: 'context-ref-swap',
      title: 'Reject Context ref swaps',
      kind: 'quick',
      intent: 'Keep compiled local Context references physically inside the project.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    compileContext(db, {
      id: change.id,
      role: 'plan',
      gate: 'planning',
      context_refs: [{
        ref: 'contract.md',
        kind: 'spec',
        reason: 'Current local contract.',
        required: true,
      }],
    }, { rootDir });
    fs.rmSync(localRef);
    fs.symlinkSync(external, localRef);

    let attemptedRead = false;
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = function guardedReadFileSync(candidate, ...args) {
      if (typeof candidate === 'string' && path.resolve(candidate) === localRef) {
        attemptedRead = true;
        throw new Error(`unsafe test read attempted: ${candidate}`);
      }
      return originalReadFileSync.call(this, candidate, ...args);
    };
    try {
      const result = validateContextSnapshot(db, {
        change_id: change.id,
        task_id: null,
        role: 'plan',
        gate: 'planning',
      }, { rootDir });
      assert.ok(result.blockers.includes('CONTEXT_REF_UNSAFE:contract.md'));
      assert.equal(attemptedRead, false);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('an advisory digest mismatch already present at compile remains visible on revalidation', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-persisted-warning-'));
  fs.writeFileSync(path.join(rootDir, 'advisory.md'), '# Current advisory evidence\n');
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const { change } = createChange(db, {
      ...completeChangeInput(),
      id: 'persisted-context-warning',
      title: 'Persist Context warnings',
      kind: 'quick',
      intent: 'Keep a still-active advisory mismatch visible across workflow checks.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    const compiled = compileContext(db, {
      id: change.id,
      role: 'review',
      gate: 'review',
      context_refs: [{
        ref: 'advisory.md',
        kind: 'docs',
        reason: 'Advisory evidence intentionally points at an older digest.',
        required: true,
        expected_digest: '0'.repeat(64),
        freshness_policy: 'advisory',
      }],
    }, { rootDir });
    assert.ok(compiled.manifest.readiness.warnings.includes(
      'CONTEXT_REF_STALE_ADVISORY:advisory.md',
    ));

    const revalidated = validateContextSnapshot(db, {
      change_id: change.id,
      task_id: null,
      role: 'review',
      gate: 'review',
    }, { rootDir });
    assert.ok(revalidated.warnings.includes(
      'CONTEXT_REF_STALE_ADVISORY:advisory.md',
    ));
    assert.equal(revalidated.manifest.context.items[0].freshness_status, 'stale');
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('active change breadcrumb follows the latest durable stage workflow', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-stage-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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

test('breadcrumb recalls normalized accepted intent after its decision thread completes', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-accepted-intent-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const created = createChange(db, {
      ...completeChangeInput(),
      id: 'accepted-intent-route',
      title: 'Accepted intent route',
      kind: 'standard',
      intent: 'Keep normalized owner intent available across sessions.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    decisions.startDecisionThread(db, {
      id: 'accepted-intent-thread',
      change_id: created.change.id,
      workflow_run_id: created.workflow.id,
      purpose: 'Persist one owner-selected compatibility boundary.',
      mode: 'guided',
    });
    decisions.openDecision(db, {
      id: 'accepted-intent-api',
      thread_id: 'accepted-intent-thread',
      phase: 'change-contract',
      question: 'Should the public API remain compatible for one release?',
      why_now: 'The answer changes rollout and recovery tasks.',
      recommendation: 'Preserve compatibility while active consumers migrate.',
      effects: { summary: 'Changes the API contract and rollout plan.' },
      blocking: true,
    });
    decisions.resolveDecision(db, {
      id: 'accepted-intent-api',
      decision: 'Preserve compatibility for one release.',
      rationale: 'Two active consumers still require a migration window.',
      decided_by: 'owner',
    });
    decisions.completeDecisionThread(db, {
      id: 'accepted-intent-thread',
      summary: 'Compatibility intent is normalized and applied to the change contract.',
      applied_refs: [{
        kind: 'change',
        ref: created.change.id,
        field: 'contract.outcome',
        value: created.change.contract.outcome,
      }],
    });

    const breadcrumb = readBreadcrumb(db, { id: created.change.id }, { rootDir });
    assert.equal(breadcrumb.decision, null);
    assert.equal(breadcrumb.accepted_intent.length, 1);
    assert.deepEqual(breadcrumb.accepted_intent[0], {
      thread_id: 'accepted-intent-thread',
      decision_id: 'accepted-intent-api',
      status: 'answered',
      authority: 'owner',
      decision: 'Preserve compatibility for one release.',
      rationale: 'Two active consumers still require a migration window.',
      decided_by: 'owner',
      delegated_to: null,
      consequences: null,
      revisit_condition: null,
      effects: { summary: 'Changes the API contract and rollout plan.' },
      applied_refs: [{
        kind: 'change',
        ref: created.change.id,
        field: 'contract.outcome',
        value: created.change.contract.outcome,
      }],
      resolved_at: breadcrumb.accepted_intent[0].resolved_at,
    });
    assert.ok(breadcrumb.accepted_intent[0].resolved_at);
    assert.equal('interaction_receipt' in breadcrumb.accepted_intent[0], false);
    assert.equal('transcript' in breadcrumb.accepted_intent[0], false);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('breadcrumb keeps a non-blocking question visible without forcing ultra-think', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-spine-advisory-decision-'));
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  try {
    seedReadyBaseline(db, rootDir);
    const created = createChange(db, {
      ...completeChangeInput(),
      id: 'advisory-decision-route',
      title: 'Advisory decision route',
      kind: 'standard',
      intent: 'Keep an optional documentation follow-up visible without blocking planning.',
      docs_impact: { status: 'none', rationale: 'Test fixture only.' },
    }, { rootDir });
    decisions.startDecisionThread(db, {
      id: 'advisory-decision-thread',
      change_id: created.change.id,
      workflow_run_id: created.workflow.id,
      purpose: 'Retain one optional documentation follow-up.',
      mode: 'fast',
    });
    decisions.openDecision(db, {
      id: 'advisory-release-note',
      thread_id: 'advisory-decision-thread',
      phase: 'delivery-docs',
      question: 'Should a later release note include a migration example?',
      why_now: 'The answer affects only a later documentation enhancement.',
      recommendation: 'Defer the example until release documentation begins.',
      effects: { summary: 'May add one later documentation task.' },
      blocking: false,
    });

    const breadcrumb = readBreadcrumb(db, { id: created.change.id }, { rootDir });
    assert.equal(breadcrumb.readiness, 'ready');
    assert.equal(breadcrumb.required_transition, null);
    assert.ok(!breadcrumb.blockers.some((code) => code.startsWith('DECISION_')));
    assert.equal(breadcrumb.decision.current.id, 'advisory-release-note');
    assert.ok(breadcrumb.allowed_transitions.some((route) => route !== 'ultra-think'));
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
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
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
