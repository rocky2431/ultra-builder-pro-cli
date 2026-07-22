'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const changes = require('./change-workflow.cjs');
const learning = require('./spec-learning.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-learning-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  seedReadyBaseline(db, { rootDir });
  changes.createChange(db, completeChangeInput({
    id: 'learning-change', title: 'Learning change', kind: 'quick',
    intent: 'Exercise guarded specification-learning transitions.',
  }), { rootDir });
  return { rootDir, db };
}

test('spec learning cannot skip approval or mutate after apply', () => {
  const fx = fixture();
  try {
    learning.proposeSpecLearning(fx.db, {
      id: 'candidate-1', change_id: 'learning-change', target_ref: 'README.md#fixture',
      summary: 'A stable public contract was discovered.',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => learning.resolveSpecLearning(fx.db, {
        change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'apply',
        resolution: 'Applied.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ILLEGAL_LEARNING_TRANSITION',
    );
    learning.resolveSpecLearning(fx.db, {
      change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'approve',
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => learning.resolveSpecLearning(fx.db, {
        change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'apply',
        resolution: 'Claimed without a verified file transition.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'LEARNING_APPLY_EVIDENCE_REQUIRED',
    );
    const target = path.join(fx.rootDir, 'README.md');
    const beforeDigest = digest(target);
    fs.appendFileSync(target, '\n## Stable behavior\n\nThe learned contract is now explicit.\n');
    const afterDigest = digest(target);
    learning.resolveSpecLearning(fx.db, {
      change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'apply',
      resolution: 'Applied to README.md.',
      applied_ref: 'README.md#fixture', before_digest: beforeDigest, after_digest: afterDigest,
      apply_evidence: ['README.md#stable-behavior'],
    }, { rootDir: fx.rootDir });
    assert.throws(
      () => learning.resolveSpecLearning(fx.db, {
        change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'reject',
        resolution: 'Too late.',
      }, { rootDir: fx.rootDir }),
      (error) => error.code === 'ILLEGAL_LEARNING_TRANSITION',
    );
  } finally {
    closeStateDb(fx.db);
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
