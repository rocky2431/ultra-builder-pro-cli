'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const checkpoints = require('./stage-checkpoints.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-stage-checkpoint-'));
  const dbPath = path.join(rootDir, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  return { rootDir, db, close() { closeStateDb(db); fs.rmSync(rootDir, { recursive: true, force: true }); } };
}

test('stage checkpoints keep an editable draft and immutable accepted revisions', () => {
  const fx = fixture();
  try {
    const first = checkpoints.saveDraft(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1' },
      payload: { summary: 'Initial Plan draft.' },
      evidence: [],
      diagnostics: [{ code: 'PLAN_EVIDENCE_INCOMPLETE', severity: 'needs_attention' }],
      idempotency_key: 'plan-draft-1',
    });
    assert.equal(first.status, 'draft');
    assert.equal(first.revision, 1);

    const revised = checkpoints.saveDraft(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1' },
      payload: { summary: 'Revised Plan draft.' },
      evidence: [{ kind: 'plan', ref: '.ultra/changes/active/change-1/plan.json' }],
      diagnostics: [],
      idempotency_key: 'plan-draft-2',
    });
    assert.equal(revised.id, first.id);
    assert.equal(revised.revision, 1);
    assert.equal(revised.payload.summary, 'Revised Plan draft.');

    const accepted = checkpoints.acceptDraft(fx.db, {
      id: revised.id,
      idempotency_key: 'plan-accept-1',
    });
    assert.equal(accepted.status, 'accepted');

    const next = checkpoints.saveDraft(fx.db, {
      stage: 'plan',
      scope: { change_id: 'change-1' },
      payload: { summary: 'A later corrected Plan.' },
      evidence: [],
      diagnostics: [],
      idempotency_key: 'plan-draft-3',
    });
    assert.equal(next.revision, 2);
    assert.equal(next.supersedes_id, accepted.id);

    const acceptedNext = checkpoints.acceptDraft(fx.db, {
      id: next.id,
      idempotency_key: 'plan-accept-2',
    });
    assert.equal(acceptedNext.status, 'accepted');
    assert.equal(checkpoints.readCheckpoint(fx.db, accepted.id).status, 'superseded');
  } finally {
    fx.close();
  }
});

test('semantic diagnostics remain reportable data and do not lock the draft', () => {
  const fx = fixture();
  try {
    const draft = checkpoints.saveDraft(fx.db, {
      stage: 'review',
      scope: { change_id: 'change-2' },
      payload: { summary: 'Review is incomplete.' },
      evidence: [],
      diagnostics: [
        { code: 'REVIEW_EVIDENCE_INCOMPLETE', severity: 'needs_attention' },
        { code: 'BASELINE_WORKTREE_STALE', severity: 'warning' },
      ],
      idempotency_key: 'review-draft-1',
    });
    assert.equal(draft.status, 'draft');
    assert.deepEqual(
      draft.diagnostics.map((item) => item.code),
      ['REVIEW_EVIDENCE_INCOMPLETE', 'BASELINE_WORKTREE_STALE'],
    );

    const revised = checkpoints.saveDraft(fx.db, {
      stage: 'review',
      scope: { change_id: 'change-2' },
      payload: { summary: 'Review evidence is now complete.' },
      evidence: [{ kind: 'review', ref: '.ultra/changes/active/change-2/review/report.json' }],
      diagnostics: [],
      idempotency_key: 'review-draft-2',
    });
    assert.equal(revised.id, draft.id);
    assert.deepEqual(revised.diagnostics, []);
  } finally {
    fx.close();
  }
});

test('checkpoint readers reject corrupted persisted authority', () => {
  const fx = fixture();
  try {
    const draft = checkpoints.saveDraft(fx.db, {
      stage: 'dev',
      scope: { task_id: 'task-corrupt' },
      payload: { summary: 'Original checkpoint.' },
      evidence: [],
      diagnostics: [],
      idempotency_key: 'dev-corrupt-draft',
    });
    fx.db.prepare(
      `UPDATE stage_checkpoints SET payload_json = ?
       WHERE id = ?`,
    ).run(JSON.stringify({ summary: 'Tampered checkpoint.' }), draft.id);

    assert.throws(
      () => checkpoints.readCheckpoint(fx.db, draft.id),
      (error) => error.code === 'CHECKPOINT_DIGEST_MISMATCH',
    );
    assert.throws(
      () => checkpoints.currentCheckpoint(
        fx.db,
        'dev',
        { task_id: 'task-corrupt' },
      ),
      (error) => error.code === 'CHECKPOINT_DIGEST_MISMATCH',
    );
    assert.throws(
      () => checkpoints.listCheckpoints(fx.db, {
        stage: 'dev',
        scope: { task_id: 'task-corrupt' },
      }),
      (error) => error.code === 'CHECKPOINT_DIGEST_MISMATCH',
    );
  } finally {
    fx.close();
  }
});
