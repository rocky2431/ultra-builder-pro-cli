'use strict';

// Projector: regenerates the read-only file views from .ultra/state.db.
//
// state.db is the only authority (D32). tasks.json and contexts/task-*.md
// are projections — humans may read them, never write them. The projector
// is trigger-based: state-ops calls projectAll() after each successful
// write transaction. Projection output passes the v4.5 schemas under
// spec/schemas/ — see mcp-server/tests/projector.test.cjs for the
// round-trip check.

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = '4.5';
const SOURCE_TAG = '.ultra/state.db';

// Frozen SELECTs — values bind through @placeholders so post_edit_guard
// has nothing to flag.
const LIST_TASKS_FOR_PROJECTION_SQL = "SELECT id, title, type, priority, complexity, status, deps, files_modified, session_id, stale, complexity_hint, tag, trace_to, context_file, completion_commit, created_at, updated_at FROM tasks ORDER BY created_at ASC";
const READ_TASK_FOR_PROJECTION_SQL = "SELECT id, title, type, priority, complexity, status, deps, files_modified, session_id, stale, complexity_hint, tag, trace_to, context_file, completion_commit, created_at, updated_at FROM tasks WHERE id = @id";

function rowToProjection(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of ['deps', 'files_modified']) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { out[k] = null; }
    }
    if (out[k] === null || out[k] === undefined) delete out[k];
  }
  if (out.stale !== undefined && out.stale !== null) out.stale = Boolean(out.stale);
  for (const k of Object.keys(out)) {
    if (out[k] === null || out[k] === undefined) delete out[k];
  }
  return out;
}

function defaultPaths(rootDir) {
  return {
    tasksJson: path.join(rootDir, '.ultra', 'tasks', 'tasks.json'),
    contextsDir: path.join(rootDir, '.ultra', 'tasks', 'contexts'),
  };
}

function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, file);
}

function projectTasks(db, { tasksJson } = {}, opts = {}) {
  const rootDir = opts.rootDir;
  const target = tasksJson || defaultPaths(rootDir || '.').tasksJson;
  const rows = db.prepare(LIST_TASKS_FOR_PROJECTION_SQL).all();
  const payload = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: SOURCE_TAG,
    tasks: rows.map(rowToProjection),
  };
  writeAtomic(target, JSON.stringify(payload, null, 2) + '\n');
  return { path: target, count: rows.length };
}

function buildContextDoc(taskRow, existingBody) {
  const headerLines = [
    '---',
    `task_id: ${taskRow.id}`,
    `title: ${escapeYaml(taskRow.title)}`,
    `status: ${taskRow.status}`,
  ];
  if (taskRow.priority) headerLines.push(`priority: ${taskRow.priority}`);
  if (taskRow.type) headerLines.push(`type: ${taskRow.type}`);
  if (taskRow.session_id) headerLines.push(`session_id: ${taskRow.session_id}`);
  headerLines.push(`schema_version: ${SCHEMA_VERSION}`);
  headerLines.push(`generated_at: ${new Date().toISOString()}`);
  headerLines.push('---', '');
  return headerLines.join('\n') + (existingBody || '');
}

function escapeYaml(str) {
  if (str == null) return '';
  if (/[:#\[\]\{\}&\*!|>'"%@`]/.test(str) || /^\s|\s$/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

function extractBodyFromExistingFile(file) {
  if (!fs.existsSync(file)) return '';
  const text = fs.readFileSync(file, 'utf8');
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + 4).replace(/^\n/, '');
}

function projectContext(db, taskId, { contextsDir } = {}, opts = {}) {
  const row = db.prepare(READ_TASK_FOR_PROJECTION_SQL).get({ id: taskId });
  if (!row) return null;
  const projection = rowToProjection(row);
  const dir = contextsDir || defaultPaths(opts.rootDir || '.').contextsDir;
  const target = projection.context_file
    ? path.resolve(opts.rootDir || '.', projection.context_file)
    : path.join(dir, `task-${taskId}.md`);
  const body = extractBodyFromExistingFile(target);
  const next = buildContextDoc(projection, body);
  writeAtomic(target, next);
  return { path: target, task_id: taskId };
}

function projectAll(db, { rootDir = '.', tasksJson, contextsDir } = {}) {
  const paths = defaultPaths(rootDir);
  const tasksTarget = tasksJson || paths.tasksJson;
  const contextsTarget = contextsDir || paths.contextsDir;

  const tasksResult = projectTasks(db, { tasksJson: tasksTarget });
  const contextResults = [];
  const rows = db.prepare("SELECT id FROM tasks").all();
  for (const r of rows) {
    contextResults.push(projectContext(db, r.id, { contextsDir: contextsTarget }, { rootDir }));
  }
  return {
    tasks_json: tasksResult,
    contexts: contextResults.filter(Boolean),
  };
}

module.exports = {
  SCHEMA_VERSION,
  defaultPaths,
  projectTasks,
  projectContext,
  projectAll,
  rowToProjection,
};
