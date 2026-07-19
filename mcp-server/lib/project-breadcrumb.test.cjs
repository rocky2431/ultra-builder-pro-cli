'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
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
    state.db.prepare(
      `INSERT INTO baselines
       (id, project_name, mode, status, approved_by, approval_note, converged_at)
       VALUES ('baseline-1', 'fixture', 'greenfield', 'ready', 'test', 'fixture', ?)`,
    ).run(new Date().toISOString());
    const { change } = createChange(state.db, {
      id: 'db-change', title: 'Database change', kind: 'quick',
      intent: 'Prove every host consumes one breadcrumb.',
      docs_impact: { status: 'none', rationale: 'test fixture' },
    }, { rootDir });
    const task = createTask(state.db, {
      id: 'db-task', title: 'Use one breadcrumb', type: 'bugfix', priority: 'P0',
      change_id: change.id,
    });
    compileRoleContext(state.db, {
      input: {
        task_id: task.id,
        role: 'implement',
        gate: 'implementation',
        execution_contract: {
          slice_kind: 'tracer_bullet',
          public_seam: 'all host injections',
          verification_command: 'npm test',
        },
        next_action: 'Run the cross-host breadcrumb regression test.',
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
