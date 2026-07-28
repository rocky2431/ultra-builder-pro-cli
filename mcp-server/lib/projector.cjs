'use strict';

// Projector: regenerates the read-only file views from .ultra/.runtime/state.db.
//
// state.db owns lifecycle and artifact bindings (D32); registered digest-bound
// files own semantic/evidence bodies. tasks.json and contexts/task-*.md are
// complete projections — humans may read them, never write them. The projector
// is trigger-based: state-ops calls projectAll() after each successful
// write transaction. Projection output passes the v4.5 schemas under
// spec/schemas/ — see mcp-server/tests/projector.test.cjs for the
// round-trip check.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ops = require('./state-ops.cjs');
const artifacts = require('./artifact-registry.cjs');
const contextPaths = require('./context-paths.cjs');

const SCHEMA_VERSION = '4.5';
const SOURCE_TAG = '.ultra/.runtime/state.db';

// Frozen SELECTs — values bind through @placeholders.
const TASK_PROJECTION_COLUMNS = 'id, title, type, priority, complexity, estimated_days, status, deps, files_modified, session_id, stale, tag, trace_to, outcome, slice_kind, public_seam, verification_command, acceptance_json, context_refs_json, docs_impact_json, ownership_json, context_file, completion_commit, created_at, updated_at';
const LIST_TASKS_FOR_PROJECTION_SQL = `SELECT ${TASK_PROJECTION_COLUMNS} FROM tasks ORDER BY created_at ASC`;
const READ_TASK_FOR_PROJECTION_SQL = `SELECT ${TASK_PROJECTION_COLUMNS} FROM tasks WHERE id = @id`;
const CONTRACT_START = '<!-- ultra:task-contract:start -->';
const CONTRACT_END = '<!-- ultra:task-contract:end -->';

function rowToProjection(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of ['deps', 'files_modified']) {
    if (typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { out[k] = null; }
    }
    if (out[k] === null || out[k] === undefined) delete out[k];
  }
  const jsonFields = {
    acceptance_json: ['acceptance', []],
    context_refs_json: ['context_refs', []],
    docs_impact_json: ['docs_impact', { status: 'unknown', files: [], rationale: null }],
    ownership_json: ['ownership', {}],
  };
  for (const [column, [field, fallback]] of Object.entries(jsonFields)) {
    try { out[field] = typeof out[column] === 'string' ? JSON.parse(out[column]) : fallback; }
    catch { out[field] = fallback; }
    delete out[column];
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

function dbContentTimestamp(db) {
  const row = db.prepare("SELECT MAX(latest) AS ts FROM (SELECT MAX(updated_at) AS latest FROM tasks UNION ALL SELECT MAX(ts) AS latest FROM events UNION ALL SELECT MAX(applied_at) AS latest FROM schema_version)").get();
  return (row && row.ts) || new Date(0).toISOString();
}

function projectTasks(db, { tasksJson } = {}, opts = {}) {
  const rootDir = opts.rootDir;
  const target = tasksJson || defaultPaths(rootDir || '.').tasksJson;
  const rows = db.prepare(LIST_TASKS_FOR_PROJECTION_SQL).all();
  // generated_at = max(content timestamps) so identical state → identical
  // bytes → idempotent commits (PLAN Phase 2.6 / Phase 2.8 chore commit).
  const payload = {
    schema_version: SCHEMA_VERSION,
    generated_at: dbContentTimestamp(db),
    source: SOURCE_TAG,
    tasks: rows.map(rowToProjection),
  };
  writeAtomic(target, JSON.stringify(payload, null, 2) + '\n');
  return { path: target, count: rows.length };
}

function buildContextDoc(taskRow) {
  const headerLines = [
    '---',
    `task_id: ${taskRow.id}`,
    `title: ${escapeYaml(taskRow.title)}`,
    `status: ${taskRow.status}`,
  ];
  if (taskRow.priority) headerLines.push(`priority: ${taskRow.priority}`);
  if (taskRow.type) headerLines.push(`type: ${taskRow.type}`);
  if (taskRow.session_id) headerLines.push(`session_id: ${taskRow.session_id}`);
  if (taskRow.completion_commit) headerLines.push(`completion_commit: ${taskRow.completion_commit}`);
  if (taskRow.stale) headerLines.push('stale: true');
  headerLines.push(`schema_version: ${SCHEMA_VERSION}`);
  headerLines.push(`generated_by: ${contextPaths.GENERATED_BY}`);
  headerLines.push(`generated_at: ${taskRow.updated_at || new Date().toISOString()}`);
  headerLines.push('---', '');

  const body = [];
  if (taskRow.stale) {
    body.push([
      `> ⚠️ STALE since ${taskRow.updated_at || new Date().toISOString()}`,
      '> Specification evidence may have changed. Recompile the task context before continuing.',
      '',
    ].join('\n'));
  }
  body.push(buildTaskContract(taskRow));
  return headerLines.join('\n') + body.join('');
}

function buildTaskContract(task) {
  const acceptance = Array.isArray(task.acceptance) ? task.acceptance : [];
  const refs = Array.isArray(task.context_refs) ? task.context_refs : [];
  const docs = task.docs_impact || { status: 'unknown', files: [], rationale: null };
  const ownership = task.ownership || {};
  const lines = [
    CONTRACT_START,
    '## Execution Contract (generated from state.db)',
    '',
    `- Outcome: ${task.outcome || 'unresolved'}`,
    `- Slice: ${task.slice_kind || 'unresolved'}`,
    `- Public seam: ${task.public_seam || 'unresolved'}`,
    `- Verification: ${task.verification_command || 'unresolved'}`,
    `- Trace: ${task.trace_to || 'unresolved'}`,
    `- Owner: ${ownership.owner || 'unresolved'}`,
    `- Documentation: ${docs.status || 'unknown'}${docs.rationale ? ` — ${docs.rationale}` : ''}`,
    '',
    '### Acceptance',
    '',
    ...(acceptance.length > 0
      ? acceptance.map((item) => `- ${item.id}: ${item.criterion} — verify with \`${item.verification}\``)
      : ['- unresolved']),
    '',
    '### Context References',
    '',
    ...(refs.length > 0
      ? refs.map((item) => `- \`${item.ref}\` — ${item.reason}`)
      : ['- unresolved']),
    '',
    CONTRACT_END,
    '',
  ];
  return lines.join('\n');
}

function escapeYaml(str) {
  if (str == null) return '';
  if (/[:#\[\]\{\}&\*!|>'"%@`]/.test(str) || /^\s|\s$/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

function legacyContextParseError(message) {
  const error = new Error(message);
  error.code = 'LEGACY_CONTEXT_PARSE_ERROR';
  return error;
}

function extractAuthoredContextBytes(contents) {
  const original = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  let body = original.toString('utf8');
  const frontmatter = /^(?:\uFEFF)?---(?:\r\n|\n)[\s\S]*?(?:\r\n|\n)---(?:(?:\r\n|\n)|$)/.exec(body);
  if (frontmatter) body = body.slice(frontmatter[0].length);
  const staleBanner = /^> ⚠️ STALE[^\r\n]*(?:(?:\r\n|\n)>[^\r\n]*)*(?:(?:\r\n|\n){1,2}|$)/.exec(body);
  if (staleBanner) body = body.slice(staleBanner[0].length);

  let cursor = 0;
  while (true) {
    const start = body.indexOf(CONTRACT_START, cursor);
    if (start === -1) break;
    const markerEnd = body.indexOf(CONTRACT_END, start + CONTRACT_START.length);
    if (markerEnd === -1) {
      throw legacyContextParseError(
        'legacy task context has an unterminated generated execution contract',
      );
    }
    let end = markerEnd + CONTRACT_END.length;
    if (body.startsWith('\r\n', end)) end += 2;
    else if (body.startsWith('\n', end)) end += 1;
    const removeFrom = body.slice(0, start).trim() === '' ? 0 : start;
    body = body.slice(0, removeFrom) + body.slice(end);
    cursor = removeFrom;
  }
  return body.trim() === '' ? null : Buffer.from(body, 'utf8');
}

function promoteAuthoredContext(db, taskId, target, rootDir) {
  if (!fs.existsSync(target.file)) return null;
  const stat = fs.lstatSync(target.file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new contextPaths.ContextPathError(
      `task context must be a regular file: ${target.relative}`,
    );
  }
  const sourceBytes = fs.readFileSync(target.file);
  const bytes = extractAuthoredContextBytes(sourceBytes);
  if (!bytes) return null;
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const safeTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const relative = `.ultra/docs/migration/legacy-context/${safeTaskId}-${digest.slice(0, 12)}.md`;
  const file = path.resolve(rootDir, ...relative.split('/'));
  const existed = fs.existsSync(file);
  if (existed) {
    const existingDigest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (existingDigest !== digest) {
      throw new Error(`legacy context promotion digest conflict: ${relative}`);
    }
  } else {
    writeAtomic(file, bytes);
  }
  try {
    const recorded = artifacts.recordArtifact(db, {
      owner_type: 'task',
      owner_id: taskId,
      kind: 'legacy_context_findings',
      path: relative,
      content_digest: digest,
      source_refs: [{
        type: 'external',
        id: `legacy-context:${target.relative}`,
        relation: 'imported_from',
      }],
      consumer_refs: [{ type: 'task', id: taskId, relation: 'consumed_by' }],
      provenance: {
        writer: 'ultra-projector',
        operation: 'legacy-context-promotion',
      },
      metadata: {
        original_path: target.relative,
        original_digest: sourceDigest,
        authored_body_digest: digest,
      },
    }, { rootDir });
    return { path: relative, digest, artifact_id: recorded.artifact.id };
  } catch (error) {
    if (!existed) fs.rmSync(file, { force: true });
    throw error;
  }
}

function projectContext(db, taskId, { contextsDir } = {}, opts = {}) {
  const row = db.prepare(READ_TASK_FOR_PROJECTION_SQL).get({ id: taskId });
  if (!row) return null;
  const projection = rowToProjection(row);
  const rootDir = path.resolve(opts.rootDir || '.');
  if (contextsDir) {
    const supplied = path.resolve(contextsDir);
    const canonical = defaultPaths(rootDir).contextsDir;
    if (supplied !== canonical) {
      throw new contextPaths.ContextPathError(
        `custom context projection roots are not allowed: ${contextsDir}`,
      );
    }
  }
  const target = contextPaths.resolveContextPath(rootDir, projection.context_file, { taskId });
  const promoted = promoteAuthoredContext(db, taskId, target, rootDir);
  const next = buildContextDoc(projection);
  writeAtomic(target.file, next);
  return { path: target.file, task_id: taskId, promoted };
}

function listContextFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) output.push(...listContextFiles(file));
    else if (entry.isFile()) output.push(file);
  }
  return output;
}

function pruneGeneratedGhosts(db, rootDir, expected) {
  const contextsDir = defaultPaths(rootDir).contextsDir;
  const pruned = [];
  for (const file of listContextFiles(contextsDir)) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/');
    if (expected.has(relative) || path.basename(file) === 'TEMPLATE.md') continue;
    const contents = fs.readFileSync(file);
    if (!contextPaths.isGeneratedContextContents(contents)) continue;
    const staged = `${file}.prune-${process.pid}-${Date.now()}`;
    fs.renameSync(file, staged);
    try {
      ops.appendEvent(db, {
        type: 'projection_pruned',
        payload: { path: relative, reason: 'task_missing' },
      });
      fs.rmSync(staged, { force: true });
      pruned.push(relative);
    } catch (error) {
      fs.renameSync(staged, file);
      throw error;
    }
  }
  return pruned.sort();
}

function projectAll(db, { rootDir = '.', tasksJson, contextsDir } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const paths = defaultPaths(resolvedRoot);
  const tasksTarget = tasksJson || paths.tasksJson;
  const contextsTarget = contextsDir || paths.contextsDir;
  if (path.resolve(contextsTarget) !== paths.contextsDir) {
    throw new contextPaths.ContextPathError(
      `custom context projection roots are not allowed: ${contextsTarget}`,
    );
  }

  const rows = db.prepare("SELECT id, context_file FROM tasks").all();
  const expected = new Set(rows.map((row) => (
    contextPaths.resolveContextPath(resolvedRoot, row.context_file, { taskId: row.id }).relative
  )));
  const tasksResult = projectTasks(db, { tasksJson: tasksTarget });
  const contextResults = [];
  for (const r of rows) {
    contextResults.push(projectContext(
      db, r.id, { contextsDir: contextsTarget }, { rootDir: resolvedRoot },
    ));
  }
  const pruned = pruneGeneratedGhosts(db, resolvedRoot, expected);
  return {
    tasks_json: tasksResult,
    contexts: contextResults.filter(Boolean),
    pruned,
  };
}

module.exports = {
  SCHEMA_VERSION,
  defaultPaths,
  projectTasks,
  projectContext,
  projectAll,
  rowToProjection,
  extractAuthoredContextBytes,
  promoteAuthoredContext,
};
