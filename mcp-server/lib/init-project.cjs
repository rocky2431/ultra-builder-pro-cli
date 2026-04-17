'use strict';

// Implementation for MCP tool `task.init_project` and the CLI fallback
// `ultra-tools init`. Copies the bundled templates/.ultra/ skeleton to the
// target project root, injecting project metadata into tasks.json.
//
// Error contract matches spec/mcp-tools.yaml#task.init_project:
//   ULTRA_DIR_EXISTS | TEMPLATE_MISSING | TARGET_NOT_DIR | IO_ERROR
//
// Not a pure function — touches the filesystem. Kept in lib/ for parity with
// state-ops/projector modules; Phase 4+ may move cross-tool helpers to
// mcp-server/tools/ if the catalogue grows.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
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

function injectTasksJson(ultraDir, { project_name, project_type, stack }) {
  const tasksFile = path.join(ultraDir, 'tasks', 'tasks.json');
  if (!fs.existsSync(tasksFile)) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(tasksFile, 'utf8')); }
  catch (err) { throw new InitProjectError('IO_ERROR', `tasks.json malformed: ${err.message}`, { cause: err }); }
  const nowIso = new Date().toISOString();
  data.created = nowIso;
  data.updated = nowIso;
  data.project = data.project || {};
  data.project.name = project_name;
  if (project_type) data.project.type = project_type;
  if (stack) data.project.stack = stack;
  fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2) + '\n');
}

function initProject({
  target_dir,
  project_name,
  project_type,
  stack,
  overwrite = false,
  source_template,
} = {}) {
  if (typeof project_name !== 'string' || project_name.length === 0) {
    throw new InitProjectError('VALIDATION_ERROR', 'project_name must be non-empty');
  }

  const absTarget = resolveTargetDir(target_dir);
  ensureTargetDir(absTarget);
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

  try { fs.mkdirSync(ultraDir, { recursive: true }); }
  catch (err) { throw new InitProjectError('IO_ERROR', `cannot create .ultra/: ${err.message}`, { retriable: true, cause: err }); }

  let copiedFiles;
  try {
    copiedFiles = copyTemplate(source, ultraDir);
  } catch (err) {
    throw new InitProjectError('IO_ERROR', `template copy failed: ${err.message}`, { retriable: true, cause: err });
  }

  injectTasksJson(ultraDir, { project_name, project_type, stack });

  const result = {
    created_path: ultraDir,
    status,
    copied_files: copiedFiles,
  };
  if (backupPath) result.backup_path = backupPath;
  return result;
}

module.exports = { initProject, InitProjectError, DEFAULT_TEMPLATE };
