'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const changes = require('./change-workflow.cjs');
const learning = require('./spec-learning.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-learning-'));
  execFileSync('git', ['init', '-q'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: rootDir });
  fs.writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: rootDir });
  const { db } = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  db.prepare(
    `INSERT INTO baselines
     (id, project_name, mode, status, approved_by, approval_note, converged_at)
     VALUES ('test-baseline', 'fixture', 'migrated', 'ready', 'test', 'legacy fixture', ?)`,
  ).run(new Date().toISOString());
  changes.createChange(db, {
    id: 'learning-change', title: 'Learning change', kind: 'quick',
    intent: 'Exercise guarded specification-learning transitions.',
  }, { rootDir });
  return { rootDir, db };
}

test('spec learning cannot skip approval or mutate after apply', () => {
  const fx = fixture();
  try {
    learning.proposeSpecLearning(fx.db, {
      id: 'candidate-1', change_id: 'learning-change', target_ref: 'README.md',
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
    learning.resolveSpecLearning(fx.db, {
      change_id: 'learning-change', candidate_id: 'candidate-1', decision: 'apply',
      resolution: 'Applied to README.md.',
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
