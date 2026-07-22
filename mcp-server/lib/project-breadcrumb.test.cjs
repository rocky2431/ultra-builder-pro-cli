'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const { seedReadyBaseline } = require('../test-support/ready-baseline.cjs');
const { completeChangeInput } = require('../test-support/change-contract.cjs');
const { createChange } = require('./change-workflow.cjs');
const { createTask } = require('./state-ops.cjs');
const { compileRoleContext, readBreadcrumb } = require('./context-spine.cjs');
const {
  readProjectBreadcrumb,
  renderProjectBreadcrumb,
} = require('./project-breadcrumb.cjs');

function tmpProject(prefix) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(rootDir, '.ultra'), { recursive: true });
  return rootDir;
}

test('project reader returns the exact canonical breadcrumb from state.db', () => {
  const rootDir = tmpProject('ubp-project-breadcrumb-');
  const state = initStateDb(path.join(rootDir, '.ultra', 'state.db'));
  try {
    seedReadyBaseline(state.db, { rootDir, id: 'baseline-1' });
    const { change } = createChange(state.db, { ...completeChangeInput(),
      id: 'db-change', title: 'Database change', kind: 'quick',
      intent: 'Prove every host consumes one breadcrumb.',
      docs_impact: { status: 'none', rationale: 'test fixture' },
    }, { rootDir });
    const task = createTask(state.db, {
      id: 'db-task', title: 'Use one breadcrumb', type: 'bugfix', priority: 'P0',
      change_id: change.id,
      outcome: 'Every host renders the same authoritative breadcrumb.',
      slice_kind: 'tracer_bullet',
      public_seam: 'all host injections',
      verification_command: 'npm test',
      acceptance: [{
        id: 'host-breadcrumb', criterion: 'All hosts use one DB-derived breadcrumb.',
        verification: 'npm test',
      }],
      context_refs: [],
      docs_impact: { status: 'none', files: [], rationale: 'Test fixture only.' },
      ownership: { owner: 'test-owner', reviewers: [] },
      trace_to: 'mcp-server/lib/project-breadcrumb.cjs',
    });
    compileRoleContext(state.db, {
      input: {
        task_id: task.id,
        role: 'implement',
        gate: 'implementation',
      },
      change,
      tasks: [task],
      rootDir,
    });

    const expected = readBreadcrumb(state.db, {}, { rootDir });
    const actual = readProjectBreadcrumb(rootDir);
    assert.deepEqual(actual, expected);
    const rendered = renderProjectBreadcrumb(rootDir, actual);
    assert.match(rendered, /Change: db-change/);
    assert.match(rendered, /Task: db-task/);
    assert.ok(rendered.includes(actual.next_action));
    assert.match(rendered, /Authority: \.ultra\/state\.db/);
  } finally {
    closeStateDb(state.db);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('project reader routes a missing authority to ultra-init', () => {
  const rootDir = tmpProject('ubp-project-missing-db-');
  try {
    const breadcrumb = readProjectBreadcrumb(rootDir);
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.deepEqual(breadcrumb.blockers, ['STATE_DB_MISSING']);
    assert.equal(breadcrumb.recommended_workflow, 'ultra-init');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('project reader routes an old schema to ultra-init without consulting projections', () => {
  const rootDir = tmpProject('ubp-project-old-schema-');
  const db = new Database(path.join(rootDir, '.ultra', 'state.db'));
  try {
    db.exec(`
      CREATE TABLE schema_version (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_version(version) VALUES ('10.0');
    `);
  } finally {
    db.close();
  }
  fs.writeFileSync(path.join(rootDir, '.ultra', 'workflow-state.json'), JSON.stringify({
    command: 'ultra-dev', task_id: 'projection-task', status: 'active',
  }));
  try {
    const breadcrumb = readProjectBreadcrumb(rootDir);
    assert.equal(breadcrumb.readiness, 'blocked');
    assert.ok(breadcrumb.blockers.includes('STATE_SCHEMA_MIGRATION_REQUIRED:10.0'));
    assert.equal(breadcrumb.recommended_workflow, 'ultra-init');
    assert.doesNotMatch(JSON.stringify(breadcrumb), /projection-task|ultra-dev/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
