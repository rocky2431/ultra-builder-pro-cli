'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TASKS_SCHEMA = path.join(REPO_ROOT, 'spec', 'schemas', 'tasks.v4.5.schema.json');

const { initStateDb, closeStateDb } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const projector = require('../lib/projector.cjs');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateTasksJson = ajv.compile(JSON.parse(fs.readFileSync(TASKS_SCHEMA, 'utf8')));

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-proj-'));
  const dbPath = path.join(dir, '.ultra', '.runtime', 'state.db');
  const init = initStateDb(dbPath);
  return { dir, dbPath, db: init.db };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('projectTasks emits a v4.5-conformant tasks.json', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, { id: 'p-1', title: 'first', type: 'feature', priority: 'P1', tag: 'main', estimated_days: 2.5 });
    ops.createTask(db, { id: 'p-2', title: 'second', type: 'bugfix', priority: 'P2' });
    ops.updateTaskStatus(db, 'p-1', 'in_progress');

    const out = projector.projectTasks(db, {}, { rootDir: dir });
    assert.equal(out.count, 2);

    const projection = readJson(out.path);
    assert.equal(projection.schema_version, '4.5');
    assert.equal(projection.source, '.ultra/.runtime/state.db');
    assert.equal(projection.tasks.length, 2);
    assert.ok(validateTasksJson(projection), `ajv failed: ${ajv.errorsText(validateTasksJson.errors)}`);

    const p1 = projection.tasks.find((t) => t.id === 'p-1');
    assert.equal(p1.status, 'in_progress');
    assert.equal(p1.estimated_days, 2.5);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext fully regenerates the read-only file and removes arbitrary body edits', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, { id: 'cx-1', title: 'context test', type: 'feature', priority: 'P1' });
    const ctxFile = path.join(dir, '.ultra', 'tasks', 'contexts', 'task-cx-1.md');
    fs.mkdirSync(path.dirname(ctxFile), { recursive: true });
    fs.writeFileSync(ctxFile, '---\nstale: header\n---\n\n# body that must be removed\n\nUser notes go here.\n');

    ops.updateTaskStatus(db, 'cx-1', 'in_progress');
    projector.projectContext(db, 'cx-1', {}, { rootDir: dir });

    const text = fs.readFileSync(ctxFile, 'utf8');
    assert.match(text, /^---\n/, 'must start with frontmatter');
    assert.match(text, /status: in_progress/);
    assert.match(text, /schema_version: 4\.5/);
    assert.match(text, /## Execution Contract \(generated from state\.db\)/);
    assert.doesNotMatch(text, /# body that must be removed/);
    assert.doesNotMatch(text, /User notes go here\./);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext replaces legacy authored context with the generated contract', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, {
      id: 'legacy-body', title: 'legacy context body', type: 'feature', priority: 'P1',
      context_file: '.ultra/tasks/contexts/task-legacy-body.md',
    });
    const ctxFile = path.join(dir, '.ultra', 'tasks', 'contexts', 'task-legacy-body.md');
    fs.mkdirSync(path.dirname(ctxFile), { recursive: true });
    fs.writeFileSync(ctxFile, [
      '# Task legacy-body',
      '',
      '> **Status**: pending | **Priority**: P1 | **Complexity**: 4',
      '',
      '## Context',
      'Keep this body.',
      '',
    ].join('\n'));

    const legacyBytes = fs.readFileSync(ctxFile);
    projector.projectContext(db, 'legacy-body', {}, { rootDir: dir });
    const text = fs.readFileSync(ctxFile, 'utf8');
    assert.match(text, /generated_by: ultra-projector/);
    assert.match(text, /status: pending/);
    assert.doesNotMatch(text, /> \*\*Status\*\*:/);
    assert.match(text, /## Execution Contract \(generated from state\.db\)/);
    assert.doesNotMatch(text, /# Task legacy-body/);
    assert.doesNotMatch(text, /Keep this body\./);
    const promoted = db.prepare(
      `SELECT * FROM artifacts
       WHERE owner_type = 'task' AND owner_id = 'legacy-body'
         AND kind = 'legacy_context_findings'`,
    ).get();
    assert.ok(promoted, 'authored legacy context must be promoted before replacement');
    assert.equal(promoted.managed, 1);
    assert.equal(
      fs.readFileSync(path.join(dir, promoted.path), 'utf8'),
      legacyBytes.toString('utf8'),
    );
    assert.equal(
      promoted.digest,
      require('node:crypto').createHash('sha256').update(legacyBytes).digest('hex'),
    );
    assert.deepEqual(
      db.prepare(
        `SELECT target_type, target_id FROM artifact_edges
         WHERE source_type = 'artifact' AND source_id = ?`,
      ).all(promoted.id),
      [{ target_type: 'task', target_id: 'legacy-body' }],
    );
    projector.projectContext(db, 'legacy-body', {}, { rootDir: dir });
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM artifacts
         WHERE owner_type = 'task' AND owner_id = 'legacy-body'
           AND kind = 'legacy_context_findings'`,
      ).get().count,
      1,
      'reprojection must not duplicate the one-time promotion',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext promotes authored prose preserved after a legacy generated contract', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, {
      id: 'mixed-legacy', title: 'mixed legacy context', type: 'feature', priority: 'P1',
      context_file: '.ultra/tasks/contexts/task-mixed-legacy.md',
    });
    const ctxFile = path.join(dir, '.ultra', 'tasks', 'contexts', 'task-mixed-legacy.md');
    fs.mkdirSync(path.dirname(ctxFile), { recursive: true });
    const authoredBody = 'KEEP THIS LEGACY FINDING\nSecond exact line.\n';
    fs.writeFileSync(ctxFile, [
      '---',
      'task_id: mixed-legacy',
      'status: pending',
      'schema_version: 4.5',
      '---',
      '<!-- ultra:task-contract:start -->',
      '## Execution Contract (generated from state.db)',
      '',
      '- Outcome: unresolved',
      '<!-- ultra:task-contract:end -->',
      authoredBody,
    ].join('\n'));

    projector.projectContext(db, 'mixed-legacy', {}, { rootDir: dir });

    const projection = fs.readFileSync(ctxFile, 'utf8');
    assert.match(projection, /generated_by: ultra-projector/);
    assert.doesNotMatch(projection, /KEEP THIS LEGACY FINDING/);
    assert.equal(
      projection.match(/<!-- ultra:task-contract:start -->/g).length,
      1,
      'the target must remain a pure single-contract projection',
    );
    const promoted = db.prepare(
      `SELECT * FROM artifacts
       WHERE owner_type = 'task' AND owner_id = 'mixed-legacy'
         AND kind = 'legacy_context_findings'`,
    ).get();
    assert.ok(promoted, 'mixed legacy context must retain its authored body');
    assert.equal(promoted.managed, 1);
    assert.equal(fs.readFileSync(path.join(dir, promoted.path), 'utf8'), authoredBody);
    assert.equal(
      promoted.digest,
      require('node:crypto').createHash('sha256').update(authoredBody).digest('hex'),
    );
    const artifactEvents = db.prepare(
      `SELECT COUNT(*) AS count FROM events
       WHERE type = 'artifact_recorded' AND task_id = 'mixed-legacy'`,
    ).get().count;
    projector.projectContext(db, 'mixed-legacy', {}, { rootDir: dir });
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE type = 'artifact_recorded' AND task_id = 'mixed-legacy'`,
      ).get().count,
      artifactEvents,
      'a pure generated reprojection must not manufacture another promotion',
    );
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext rejects traversal and symlink ancestors outside the context projection root', () => {
  const { dir, db } = tmpProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-proj-outside-'));
  try {
    ops.createTask(db, {
      id: 'escape', title: 'escape', type: 'feature', priority: 'P1',
      context_file: '.ultra/tasks/contexts/../../../escaped.md',
    });
    assert.throws(
      () => projector.projectContext(db, 'escape', {}, { rootDir: dir }),
      (error) => error.code === 'CONTEXT_PATH_INVALID',
    );
    assert.equal(fs.existsSync(path.join(dir, 'escaped.md')), false);

    const contexts = path.join(dir, '.ultra', 'tasks', 'contexts');
    fs.mkdirSync(path.dirname(contexts), { recursive: true });
    fs.symlinkSync(outside, contexts);
    ops.createTask(db, {
      id: 'symlink', title: 'symlink', type: 'feature', priority: 'P1',
      context_file: '.ultra/tasks/contexts/task-symlink.md',
    });
    assert.throws(
      () => projector.projectContext(db, 'symlink', {}, { rootDir: dir }),
      (error) => error.code === 'CONTEXT_PATH_INVALID',
    );
    assert.equal(fs.existsSync(path.join(outside, 'task-symlink.md')), false);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('projectAll prunes only generated ghost contexts and records the recovery evidence', () => {
  const { dir, db } = tmpProject();
  try {
    const contexts = path.join(dir, '.ultra', 'tasks', 'contexts');
    fs.mkdirSync(contexts, { recursive: true });
    const generatedGhost = path.join(contexts, 'task-deleted.md');
    const authoredGhost = path.join(contexts, 'notes.md');
    fs.writeFileSync(generatedGhost, [
      '---', 'task_id: deleted', 'generated_by: ultra-projector', '---', '',
    ].join('\n'));
    fs.writeFileSync(authoredGhost, '# Keep this authored note\n');

    const result = projector.projectAll(db, { rootDir: dir });
    assert.deepEqual(result.pruned, ['.ultra/tasks/contexts/task-deleted.md']);
    assert.equal(fs.existsSync(generatedGhost), false);
    assert.equal(fs.existsSync(authoredGhost), true);
    const event = db.prepare(
      "SELECT payload_json FROM events WHERE type = 'projection_pruned' ORDER BY id DESC LIMIT 1",
    ).get();
    assert.equal(JSON.parse(event.payload_json).path, '.ultra/tasks/contexts/task-deleted.md');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manual edits to tasks.json are overwritten on the next projectAll', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, { id: 'ow-1', title: 'overwrite', type: 'feature', priority: 'P0' });
    projector.projectAll(db, { rootDir: dir });

    const tasksJson = path.join(dir, '.ultra', 'tasks', 'tasks.json');
    fs.writeFileSync(tasksJson, JSON.stringify({ tampered: true }));
    assert.deepEqual(readJson(tasksJson), { tampered: true });

    ops.patchTask(db, 'ow-1', { tag: 'main' });
    projector.projectAll(db, { rootDir: dir });

    const restored = readJson(tasksJson);
    assert.equal(restored.schema_version, '4.5');
    assert.equal(restored.tasks[0].id, 'ow-1');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectAll completes within 1s after a state.db write (PLAN AC)', () => {
  const { dir, db } = tmpProject();
  try {
    for (let i = 0; i < 30; i++) {
      ops.createTask(db, { id: `s-${i}`, title: `s${i}`, type: 'feature', priority: 'P3' });
    }
    const start = Date.now();
    const out = projector.projectAll(db, { rootDir: dir });
    const elapsed = Date.now() - start;
    assert.ok(elapsed <= 1000, `projectAll took ${elapsed}ms, must be <= 1000ms`);
    assert.equal(out.tasks_json.count, 30);
    assert.equal(out.contexts.length, 30);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext is a no-op for unknown task ids', () => {
  const { dir, db } = tmpProject();
  try {
    const r = projector.projectContext(db, 'no-such-task', {}, { rootDir: dir });
    assert.equal(r, null);
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
