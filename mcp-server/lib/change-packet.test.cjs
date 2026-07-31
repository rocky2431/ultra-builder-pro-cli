'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const changes = require('./change-workflow.cjs');
const workflows = require('./workflow-state.cjs');
const artifacts = require('./artifact-registry.cjs');
const baselines = require('./baseline-workflow.cjs');
const ops = require('./state-ops.cjs');
const ultraFacade = require('./ultra-facade.cjs');
const {
  seedReadyBaseline,
  seedCompletedWorkflowStructure,
} = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function digestBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function digestFile(file) {
  return digestBytes(fs.readFileSync(file));
}

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-change-packet-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Change packet fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', '.runtime', 'state.db'));
  seedReadyBaseline(db, { rootDir });
  const created = changes.createChange(db, completeChangeInput({
    id: 'packet-change',
    title: 'Keep change semantics in an isolated overlay',
    kind: 'standard',
    intent: 'Apply accepted semantic changes only during Deliver convergence.',
    docs_impact: {
      status: 'required',
      files: ['docs/change-packet.md'],
      rationale: 'The public workflow contract changes.',
    },
  }), { rootDir });
  return { rootDir, db, change: created.change };
}

function cleanup(fx) {
  closeStateDb(fx.db);
  fs.rmSync(fx.rootDir, { recursive: true, force: true });
}

function writeOverlay(fx, relative, contents) {
  const target = path.join(fx.rootDir, fx.change.artifact_root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return path.relative(fx.rootDir, target).split(path.sep).join('/');
}

function deltaInput(fx, overlayPath) {
  const baseline = baselines.readBaseline(fx.db, 'test-baseline');
  const product = baseline.spec_refs.find((item) => item.kind === 'product');
  return {
    id: fx.change.id,
    baseline_anchor: {
      baseline_id: baseline.id,
      repository_revision: baseline.repository_revision,
      specs: baseline.spec_refs.map((item) => ({
        path: item.path,
        digest: item.digest,
      })),
    },
    decisions: [{
      id: 'accepted-overlay',
      summary: 'Keep baseline specifications immutable until Deliver.',
    }],
    non_goals: fx.change.contract.non_goals,
    acceptance: fx.change.contract.acceptance,
    documentation_impact: fx.change.docs_impact,
    unknowns: [],
    mutations: [{
      id: 'update-product-contract',
      action: 'update',
      target_path: product.path,
      overlay_path: overlayPath,
      before_digest: product.digest,
      after_digest: digestFile(path.join(fx.rootDir, overlayPath)),
      acceptance_refs: fx.change.contract.acceptance.map((item) => item.id),
      documentation_refs: ['docs/change-packet.md'],
    }],
  };
}

function seedDeliveryGates(fx) {
  const task = ops.createTask(fx.db, {
    id: 'packet-delivery-task',
    title: 'Deliver the isolated Change packet',
    type: 'feature',
    priority: 'P0',
    change_id: fx.change.id,
    outcome: 'The accepted overlay converges atomically.',
    slice_kind: 'tracer_bullet',
    public_seam: 'Change packet delivery',
    verification_command: 'node --test change-packet.test.cjs',
    acceptance: fx.change.contract.acceptance,
    context_refs: [{
      ref: '.ultra/specs/product.md',
      reason: 'Current product baseline.',
      required: true,
    }],
    docs_impact: fx.change.docs_impact,
    ownership: { owner: 'test-owner', reviewers: [] },
    trace_to: '.ultra/specs/product.md#product',
  });
  ops.updateTaskStatus(fx.db, task.id, 'in_progress');
  ops.updateTaskStatus(fx.db, task.id, 'completed');
  const checkout = baselines.gitWorktreeSnapshot(fx.rootDir, ['.']);
  const ts = new Date().toISOString();
  const insert = fx.db.prepare(
    `INSERT INTO workflow_runs
     (id, kind, subject, definition_version, status, baseline_id, change_id, task_id,
      metadata_json, blockers_json, summary_json, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', 'test-baseline', ?, ?, '{}', '[]', ?, ?, ?, ?)`,
  );
  insert.run(
    'packet-dev',
    'dev',
    'Complete packet implementation.',
    workflows.DEFINITION_VERSION,
    fx.change.id,
    task.id,
    JSON.stringify({
      change_id: fx.change.id,
      task_id: task.id,
      public_seam: task.public_seam,
      verification_command: task.verification_command,
      git_commit: checkout.head,
      worktree_digest: checkout.digest,
    }),
    ts,
    ts,
    ts,
  );
  seedCompletedWorkflowStructure(fx.db, 'packet-dev', 'dev', ts);
  insert.run(
    'packet-test',
    'test',
    'Verify packet implementation.',
    workflows.DEFINITION_VERSION,
    fx.change.id,
    null,
    JSON.stringify({
      change_id: fx.change.id,
      task_ids: [task.id],
      acceptance_ids: fx.change.contract.acceptance.map((item) => item.id).sort(),
      passed: true,
      git_commit: checkout.head,
      worktree_digest: checkout.digest,
      report_path: '.ultra/reports/tests/packet-test.json',
      report_digest: 'fixture-test-report',
    }),
    ts,
    ts,
    ts,
  );
  seedCompletedWorkflowStructure(fx.db, 'packet-test', 'test', ts);
  insert.run(
    'packet-review',
    'review',
    'Review packet implementation.',
    workflows.DEFINITION_VERSION,
    fx.change.id,
    null,
    JSON.stringify({
      change_id: fx.change.id,
      task_ids: [task.id],
      mode: 'change',
      verdict: 'APPROVE',
      git_commit: checkout.head,
      worktree_digest: checkout.digest,
      report_path: '.ultra/reviews/packet-change/SUMMARY.json',
      report_digest: 'fixture-review-report',
      axes: {
        spec_fidelity: { verdict: 'PASS', evidence_refs: ['fixture:spec'] },
        engineering_standards: { verdict: 'PASS', evidence_refs: ['fixture:engineering'] },
      },
    }),
    ts,
    ts,
    ts,
  );
  seedCompletedWorkflowStructure(fx.db, 'packet-review', 'review', ts);
  return task;
}

test('typed Change delta registers overlay authority without mutating baseline specs', () => {
  const fx = fixture();
  try {
    const baselinePath = path.join(fx.rootDir, '.ultra', 'specs', 'product.md');
    const beforeBytes = fs.readFileSync(baselinePath);
    const beforeDigest = digestBytes(beforeBytes);
    const overlayPath = writeOverlay(
      fx,
      'delta/specs/product.md',
      '# product\n\nAccepted behavior from the isolated Change overlay.\n',
    );

    const recorded = changes.recordDelta(
      fx.db,
      deltaInput(fx, overlayPath),
      { rootDir: fx.rootDir },
    );

    assert.equal(digestFile(baselinePath), beforeDigest);
    assert.deepEqual(fs.readFileSync(baselinePath), beforeBytes);
    assert.equal(recorded.delta.change_id, fx.change.id);
    assert.equal(recorded.delta.mutations[0].overlay_path, overlayPath);
    assert.equal(recorded.artifact.owner_type, 'change');
    assert.equal(recorded.artifact.owner_id, fx.change.id);
    assert.equal(recorded.artifact.kind, 'change_delta');
    assert.equal(recorded.artifact.status, 'current');
    assert.ok(recorded.artifact.source_refs.some(
      (ref) => ref.type === 'baseline' && ref.id === 'test-baseline',
    ));
    assert.ok(recorded.artifact.consumer_refs.some(
      (ref) => ref.type === 'external' && ref.id === 'ultra-deliver',
    ));
    assert.equal(
      artifacts.getArtifact(fx.db, { path: overlayPath }).kind,
      'delta_payload',
    );
  } finally {
    cleanup(fx);
  }
});

test('documentation reconciliation rejects orphans and binds before/after evidence to delta acceptance', () => {
  const fx = fixture();
  try {
    const productOverlay = writeOverlay(
      fx,
      'delta/specs/product.md',
      '# product\n\nAccepted behavior from the isolated Change overlay.\n',
    );
    const delta = changes.recordDelta(
      fx.db,
      deltaInput(fx, productOverlay),
      { rootDir: fx.rootDir },
    );
    const docsOverlay = writeOverlay(
      fx,
      'documentation/docs/change-packet.md',
      '# Change packet\n\nThe baseline is updated only by Deliver convergence.\n',
    );
    const reconciliation = {
      id: fx.change.id,
      delta_artifact_id: delta.artifact.id,
      delta_digest: delta.artifact.digest,
      documents: [{
        path: 'docs/change-packet.md',
        action: 'add',
        overlay_path: docsOverlay,
        before_digest: null,
        after_digest: digestFile(path.join(fx.rootDir, docsOverlay)),
        delta_refs: ['update-product-contract'],
        acceptance_refs: fx.change.contract.acceptance.map((item) => item.id),
        verification: [{
          command: 'node --test change-packet.test.cjs',
          status: 'pass',
          evidence_refs: ['test:change-packet-docs'],
        }],
        consumers: [],
      }],
    };

    assert.throws(
      () => changes.recordDocumentationReconciliation(
        fx.db, reconciliation, { rootDir: fx.rootDir },
      ),
      (error) => error.code === 'DOCUMENTATION_ORPHAN_UNRESOLVED',
    );

    reconciliation.documents[0].consumers = [{
      type: 'external',
      id: 'ultra-deliver',
      relation: 'explains_delivery',
    }];
    const recorded = changes.recordDocumentationReconciliation(
      fx.db, reconciliation, { rootDir: fx.rootDir },
    );
    assert.equal(recorded.reconciliation.documents[0].after_digest, digestFile(
      path.join(fx.rootDir, docsOverlay),
    ));
    assert.equal(recorded.artifact.kind, 'documentation_reconciliation');
    assert.equal(recorded.artifact.owner_id, fx.change.id);
    assert.ok(recorded.artifact.source_refs.some(
      (ref) => ref.type === 'artifact' && ref.id === delta.artifact.id,
    ));
  } finally {
    cleanup(fx);
  }
});

test('archive applies the Change overlay to baseline and documentation only at Deliver convergence', () => {
  const fx = fixture();
  try {
    const productPath = path.join(fx.rootDir, '.ultra', 'specs', 'product.md');
    const productBefore = fs.readFileSync(productPath);
    const productOverlay = writeOverlay(
      fx,
      'delta/specs/product.md',
      '# product\n\nAccepted behavior from the isolated Change overlay.\n',
    );
    const delta = changes.recordDelta(
      fx.db,
      deltaInput(fx, productOverlay),
      { rootDir: fx.rootDir },
    );
    const docsOverlay = writeOverlay(
      fx,
      'documentation/docs/change-packet.md',
      '# Change packet\n\nThe baseline is updated only by Deliver convergence.\n',
    );
    changes.recordDocumentationReconciliation(fx.db, {
      id: fx.change.id,
      delta_artifact_id: delta.artifact.id,
      delta_digest: delta.artifact.digest,
      documents: [{
        path: 'docs/change-packet.md',
        action: 'add',
        overlay_path: docsOverlay,
        before_digest: null,
        after_digest: digestFile(path.join(fx.rootDir, docsOverlay)),
        delta_refs: ['update-product-contract'],
        acceptance_refs: fx.change.contract.acceptance.map((item) => item.id),
        verification: [{
          command: 'node --test change-packet.test.cjs',
          status: 'pass',
          evidence_refs: ['test:change-packet-delivery'],
        }],
        consumers: [{
          type: 'external',
          id: 'ultra-deliver',
          relation: 'explains_delivery',
        }],
      }],
    }, { rootDir: fx.rootDir });
    assert.deepEqual(fs.readFileSync(productPath), productBefore);
    assert.equal(fs.existsSync(path.join(fx.rootDir, 'docs', 'change-packet.md')), false);

    seedDeliveryGates(fx);
    fx.db.prepare(
      "UPDATE changes SET status = 'ready' WHERE id = ?",
    ).run(fx.change.id);
    const archived = changes.archiveChange(fx.db, {
      id: fx.change.id,
      summary: 'Apply and archive the complete Change packet.',
    }, { rootDir: fx.rootDir });

    assert.equal(archived.change.status, 'archived');
    assert.equal(
      fs.readFileSync(productPath, 'utf8'),
      '# product\n\nAccepted behavior from the isolated Change overlay.\n',
    );
    assert.equal(
      fs.readFileSync(path.join(fx.rootDir, 'docs', 'change-packet.md'), 'utf8'),
      '# Change packet\n\nThe baseline is updated only by Deliver convergence.\n',
    );
    const baseline = baselines.readBaseline(fx.db, 'test-baseline');
    assert.equal(
      baseline.spec_refs.find((item) => item.kind === 'product').digest,
      digestFile(productPath),
    );
    assert.deepEqual(
      require('./delivery-transaction.cjs').listDeliveryTransactions(fx.rootDir),
      [],
    );
    assert.ok(fs.existsSync(archived.archive_path));
  } finally {
    cleanup(fx);
  }
});

test('archive receipt failure restores an applied typed delta before an exact retry', async () => {
  const fx = fixture();
  try {
    const productPath = path.join(fx.rootDir, '.ultra', 'specs', 'product.md');
    const productBefore = fs.readFileSync(productPath);
    const productAfter = '# product\n\nReceipt-safe typed delta.\n';
    const productOverlay = writeOverlay(
      fx,
      'delta/specs/product.md',
      productAfter,
    );
    const delta = changes.recordDelta(
      fx.db,
      deltaInput(fx, productOverlay),
      { rootDir: fx.rootDir },
    );
    const docsOverlay = writeOverlay(
      fx,
      'documentation/docs/change-packet.md',
      '# Change packet\n\nReceipt-safe documentation delta.\n',
    );
    changes.recordDocumentationReconciliation(fx.db, {
      id: fx.change.id,
      delta_artifact_id: delta.artifact.id,
      delta_digest: delta.artifact.digest,
      documents: [{
        path: 'docs/change-packet.md',
        action: 'add',
        overlay_path: docsOverlay,
        before_digest: null,
        after_digest: digestFile(path.join(fx.rootDir, docsOverlay)),
        delta_refs: ['update-product-contract'],
        acceptance_refs: fx.change.contract.acceptance.map((item) => item.id),
        verification: [{
          command: 'node --test change-packet.test.cjs',
          status: 'pass',
          evidence_refs: ['test:archive-receipt-rollback'],
        }],
        consumers: [{
          type: 'external',
          id: 'ultra-deliver',
          relation: 'explains_delivery',
        }],
      }],
    }, { rootDir: fx.rootDir });
    seedDeliveryGates(fx);
    fx.db.prepare("UPDATE changes SET status = 'ready' WHERE id = ?").run(fx.change.id);
    fx.db.exec(
      `CREATE TRIGGER fail_archive_receipt_after_delta
       BEFORE INSERT ON events
       WHEN NEW.type = 'ultra_kernel_call'
       BEGIN
         SELECT RAISE(ABORT, 'injected archive receipt failure after delta apply');
       END`,
    );
    const request = {
      change_id: fx.change.id,
      payload: { summary: 'Apply the typed delta exactly once.' },
      idempotency_key: 'archive-delta-receipt-rollback',
    };

    await assert.rejects(
      () => ultraFacade.dispatch('ultra.archive', request, fx.db, { rootDir: fx.rootDir }),
      (error) => error.code === 'STATE_PERSISTENCE_FAILED',
    );
    assert.deepEqual(fs.readFileSync(productPath), productBefore);
    assert.equal(fs.existsSync(path.join(fx.rootDir, 'docs', 'change-packet.md')), false);
    assert.equal(changes.readChange(fx.db, fx.change.id).status, 'ready');
    assert.deepEqual(
      require('./delivery-transaction.cjs').listDeliveryTransactions(fx.rootDir),
      [],
    );

    fx.db.exec('DROP TRIGGER fail_archive_receipt_after_delta');
    const retried = await ultraFacade.dispatch(
      'ultra.archive',
      request,
      fx.db,
      { rootDir: fx.rootDir },
    );
    assert.equal(retried.accepted, true);
    assert.equal(fs.readFileSync(productPath, 'utf8'), productAfter);
    assert.equal(
      fs.readFileSync(path.join(fx.rootDir, 'docs', 'change-packet.md'), 'utf8'),
      '# Change packet\n\nReceipt-safe documentation delta.\n',
    );
    assert.deepEqual(
      require('./delivery-transaction.cjs').listDeliveryTransactions(fx.rootDir),
      [],
    );
  } finally {
    cleanup(fx);
  }
});
