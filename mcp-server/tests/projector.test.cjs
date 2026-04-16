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
  const dbPath = path.join(dir, '.ultra', 'state.db');
  const init = initStateDb(dbPath);
  return { dir, dbPath, db: init.db };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('projectTasks emits a v4.5-conformant tasks.json', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, { id: 'p-1', title: 'first', type: 'feature', priority: 'P1', tag: 'main' });
    ops.createTask(db, { id: 'p-2', title: 'second', type: 'bugfix', priority: 'P2' });
    ops.updateTaskStatus(db, 'p-1', 'in_progress');

    const out = projector.projectTasks(db, {}, { rootDir: dir });
    assert.equal(out.count, 2);

    const projection = readJson(out.path);
    assert.equal(projection.schema_version, '4.5');
    assert.equal(projection.source, '.ultra/state.db');
    assert.equal(projection.tasks.length, 2);
    assert.ok(validateTasksJson(projection), `ajv failed: ${ajv.errorsText(validateTasksJson.errors)}`);

    const p1 = projection.tasks.find((t) => t.id === 'p-1');
    assert.equal(p1.status, 'in_progress');
    closeStateDb(db);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('projectContext rebuilds header but preserves the body', () => {
  const { dir, db } = tmpProject();
  try {
    ops.createTask(db, { id: 'cx-1', title: 'context test', type: 'feature', priority: 'P1' });
    const ctxFile = path.join(dir, '.ultra', 'tasks', 'contexts', 'task-cx-1.md');
    fs.mkdirSync(path.dirname(ctxFile), { recursive: true });
    fs.writeFileSync(ctxFile, '---\nstale: header\n---\n\n# body that must survive\n\nUser notes go here.\n');

    ops.updateTaskStatus(db, 'cx-1', 'in_progress');
    projector.projectContext(db, 'cx-1', {}, { rootDir: dir });

    const text = fs.readFileSync(ctxFile, 'utf8');
    assert.match(text, /^---\n/, 'must start with frontmatter');
    assert.match(text, /status: in_progress/);
    assert.match(text, /schema_version: 4\.5/);
    assert.match(text, /# body that must survive/);
    assert.match(text, /User notes go here\./);
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
