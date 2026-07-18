'use strict';

// Implementation for MCP tool `task.init_project` and the CLI fallback
// `ultra-tools task init-project`. Copies the bundled templates/.ultra/ skeleton
// to the target project root and records project metadata in authoritative state.
//
// Error contract matches spec/mcp-tools.yaml#task.init_project:
//   ULTRA_DIR_EXISTS | TEMPLATE_MISSING | TARGET_NOT_DIR | IO_ERROR
//
// Not a pure function — touches the filesystem. Kept in lib/ for parity with
// state-ops/projector modules; Phase 4+ may move cross-tool helpers to
// mcp-server/tools/ if the catalogue grows.

const fs = require('node:fs');
const path = require('node:path');

const { initStateDb } = require('./state-db.cjs');
const baselines = require('./baseline-workflow.cjs');
const runtimeState = require('./runtime-state.cjs');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..', '..');
const DEFAULT_TEMPLATE = path.join(REPO_ROOT, 'templates', '.ultra');

class InitProjectError extends Error {
  constructor(code, message, { retriable = false, cause } = {}) {
    super(message);
    this.name = 'InitProjectError';
    this.code = code;
    this.retriable = retriable;
    if (cause) this.cause = cause;
  }
}

function resolveTargetDir(target) {
  if (!target) throw new InitProjectError('TARGET_NOT_DIR', 'target_dir must be a non-empty string');
  return path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
}

function ensureTargetDir(absTarget) {
  if (!fs.existsSync(absTarget)) {
    try { fs.mkdirSync(absTarget, { recursive: true }); }
    catch (err) { throw new InitProjectError('IO_ERROR', `cannot create target_dir: ${err.message}`, { retriable: true, cause: err }); }
    return;
  }
  const stat = fs.statSync(absTarget);
  if (!stat.isDirectory()) {
    throw new InitProjectError('TARGET_NOT_DIR', `target_dir exists but is not a directory: ${absTarget}`);
  }
}

function ensureTemplate(sourceOverride) {
  const source = sourceOverride ? path.resolve(sourceOverride) : DEFAULT_TEMPLATE;
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new InitProjectError('TEMPLATE_MISSING', `source_template not found: ${source}`);
  }
  return source;
}

function timestampSlug(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function walkRelative(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(rel);
    }
  }
  walk(root);
  return out.sort();
}

function copyTemplate(source, dest) {
  const files = walkRelative(source);
  for (const rel of files) {
    const from = path.join(source, rel);
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return files;
}

function validateTasksTemplate(ultraDir) {
  const tasksFile = path.join(ultraDir, 'tasks', 'tasks.json');
  if (!fs.existsSync(tasksFile)) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); }
  catch (err) { throw new InitProjectError('IO_ERROR', `tasks.json malformed: ${err.message}`, { cause: err }); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
    throw new InitProjectError('IO_ERROR', 'tasks.json template must contain a tasks array');
  }
}

const IGNORED_ADOPTION_ENTRIES = new Set([
  '.DS_Store', '.git', '.gitignore', '.ultra', 'node_modules', 'vendor', '.venv', 'venv',
]);

function detectProjectMode(absTarget, requested = 'auto') {
  if (!['auto', 'greenfield', 'brownfield'].includes(requested)) {
    throw new InitProjectError('VALIDATION_ERROR', `unsupported initialization mode: ${requested}`);
  }
  if (requested !== 'auto') return requested;
  const meaningful = fs.readdirSync(absTarget, { withFileTypes: true })
    .some((entry) => !IGNORED_ADOPTION_ENTRIES.has(entry.name)
      && !entry.name.startsWith('.ultra.backup.'));
  return meaningful ? 'brownfield' : 'greenfield';
}

function rollbackInitialization(ultraDir, backupPath) {
  const errors = [];
  try {
    if (fs.existsSync(ultraDir)) fs.rmSync(ultraDir, { recursive: true, force: true });
  } catch (error) {
    errors.push(`partial cleanup failed: ${error.message}`);
  }
  if (backupPath) {
    try { fs.renameSync(backupPath, ultraDir); }
    catch (error) { errors.push(`backup restore failed: ${error.message}`); }
  }
  return errors;
}

function initProject({
  target_dir,
  project_name,
  project_type,
  stack,
  mode = 'auto',
  overwrite = false,
  source_template,
} = {}) {
  if (typeof project_name !== 'string' || project_name.length === 0) {
    throw new InitProjectError('VALIDATION_ERROR', 'project_name must be non-empty');
  }

  const absTarget = resolveTargetDir(target_dir);
  ensureTargetDir(absTarget);
  const resolvedMode = detectProjectMode(absTarget, mode);
  const source = ensureTemplate(source_template);
  const ultraDir = path.join(absTarget, '.ultra');

  let status = 'created';
  let backupPath;
  if (fs.existsSync(ultraDir)) {
    if (!overwrite) {
      throw new InitProjectError('ULTRA_DIR_EXISTS', `.ultra/ already exists at ${ultraDir}; pass overwrite=true to back up and recreate`);
    }
    backupPath = path.join(absTarget, `.ultra.backup.${timestampSlug()}`);
    try { fs.renameSync(ultraDir, backupPath); }
    catch (err) { throw new InitProjectError('IO_ERROR', `backup rename failed: ${err.message}`, { retriable: true, cause: err }); }
    status = 'overwritten';
  }

  let copiedFiles;
  let baselineResult;
  try {
    fs.mkdirSync(ultraDir, { recursive: true });
    copiedFiles = copyTemplate(source, ultraDir);
    validateTasksTemplate(ultraDir);
    const stateDbPath = path.join(ultraDir, 'state.db');
    const { db } = initStateDb(stateDbPath);
    try {
      baselineResult = baselines.startBaseline(db, {
        id: 'project-baseline', project_name, project_type, stack,
        mode: resolvedMode, repository_revision: baselines.gitHead(absTarget), scope: ['.'],
      }, { rootDir: absTarget });
      const job = runtimeState.enqueueProjection(db, { tool_name: 'task.init_project' });
      const projection = runtimeState.processProjectionJobs(db, { rootDir: absTarget, limit: 1 });
      const projected = projection.jobs.find((item) => item.id === job.id);
      if (!projected || projected.status !== 'completed') {
        throw new Error(projected?.error || 'initial projection did not complete');
      }
    } finally {
      db.close();
    }
  } catch (err) {
    const rollbackErrors = rollbackInitialization(ultraDir, backupPath);
    const rollbackNote = rollbackErrors.length > 0
      ? `; rollback incomplete: ${rollbackErrors.join('; ')}`
      : '; prior state restored';
    throw new InitProjectError(
      'IO_ERROR',
      `project initialization failed: ${err.message}${rollbackNote}`,
      { retriable: true, cause: err },
    );
  }

  const stateDbPath = path.join(ultraDir, 'state.db');
  const result = {
    created_path: ultraDir,
    state_db_path: stateDbPath,
    status,
    mode: resolvedMode,
    baseline: {
      id: baselineResult.id,
      mode: baselineResult.mode,
      status: baselineResult.status,
      repository_revision: baselineResult.repository_revision,
    },
    copied_files: copiedFiles,
  };
  if (backupPath) result.backup_path = backupPath;
  return result;
}

module.exports = { initProject, InitProjectError, DEFAULT_TEMPLATE, detectProjectMode };
