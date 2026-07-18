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
const { assertStateAuthority, inspectProjection } = require('./state-authority.cjs');
const baselines = require('./baseline-workflow.cjs');
const runtimeState = require('./runtime-state.cjs');
const ops = require('./state-ops.cjs');

const REPO_ROOT = process.env.UBP_RUNTIME_ROOT
  ? path.resolve(process.env.UBP_RUNTIME_ROOT)
  : path.resolve(__dirname, '..', '..');
const SOURCE_TEMPLATE = path.join(REPO_ROOT, 'templates', '.ultra');
const PACKAGED_TEMPLATE = path.join(REPO_ROOT, '.ultra-template');
const DEFAULT_TEMPLATE = fs.existsSync(SOURCE_TEMPLATE) ? SOURCE_TEMPLATE : PACKAGED_TEMPLATE;

class InitProjectError extends Error {
  constructor(code, message, { retriable = false, cause, details } = {}) {
    super(message);
    this.name = 'InitProjectError';
    this.code = code;
    this.retriable = retriable;
    if (cause) this.cause = cause;
    if (details) this.details = details;
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

function copyMissingTemplate(source, dest) {
  const copied = [];
  for (const rel of walkRelative(source)) {
    const to = path.join(dest, rel);
    if (fs.existsSync(to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(source, rel), to);
    copied.push(rel);
  }
  return copied;
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

const IGNORED_SCAN_DIRS = new Set([
  ...IGNORED_ADOPTION_ENTRIES, 'dist', 'build', 'coverage', '.next', '.turbo', 'target',
]);
const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'go.work',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json',
]);
const SOURCE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.go', '.java', '.js', '.jsx', '.kt', '.kts', '.mjs',
  '.move', '.php', '.py', '.rb', '.rs', '.sol', '.swift', '.ts', '.tsx', '.vue',
]);
const SOURCE_DIR_SEGMENTS = new Set([
  'src', 'app', 'apps', 'lib', 'server', 'backend', 'frontend', 'api', 'cmd', 'internal',
]);

function scanRepositoryFiles(rootDir, { maxFiles = 5000, maxDepth = 8 } = {}) {
  const files = [];
  function walk(dir, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= maxFiles) break;
      if (entry.name === '.DS_Store') continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootDir, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (!IGNORED_SCAN_DIRS.has(entry.name) && !entry.name.startsWith('.ultra.backup.')) {
          walk(full, depth + 1);
        }
      } else if (entry.isFile()) files.push(rel);
    }
  }
  walk(rootDir, 0);
  return { files: files.sort(), truncated: files.length >= maxFiles };
}

function expandWorkspacePattern(rootDir, pattern) {
  const normalized = String(pattern || '').trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
  if (!normalized) return [];
  if (!normalized.includes('*')) {
    const candidate = path.join(rootDir, normalized);
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory() ? [normalized] : [];
  }
  if (!normalized.endsWith('/*') || normalized.slice(0, -2).includes('*')) return [];
  const parentRel = normalized.slice(0, -2);
  const parent = path.join(rootDir, parentRel);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return [];
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parentRel}/${entry.name}`);
}

function packageProfile(rootDir) {
  const file = path.join(rootDir, 'package.json');
  if (!fs.existsSync(file)) return { workspacePatterns: [], verificationCommands: [] };
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rawWorkspaces = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : (Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages : []);
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    const verificationCommands = ['build', 'test', 'lint', 'typecheck']
      .filter((name) => typeof scripts[name] === 'string' && scripts[name].trim())
      .map((name) => name === 'test' ? 'npm test' : `npm run ${name}`);
    return { workspacePatterns: rawWorkspaces, verificationCommands };
  } catch {
    return { workspacePatterns: [], verificationCommands: [] };
  }
}

function classifyRepository(absTarget) {
  const { files, truncated } = scanRepositoryFiles(absTarget);
  const packageData = packageProfile(absTarget);
  const manifestSignals = files.filter((file) => MANIFEST_NAMES.has(path.basename(file))).slice(0, 100);
  const testSignals = files.filter((file) => {
    const lower = file.toLowerCase();
    return /(^|\/)(test|tests|__tests__|spec)(\/|$)/.test(lower)
      || /\.(test|spec)\.[^.]+$/.test(lower);
  }).slice(0, 100);
  const deploymentSignals = files.filter((file) => {
    const lower = file.toLowerCase();
    return /(^|\/)(dockerfile|railway\.json|railway\.toml|vercel\.json|fly\.toml)$/.test(lower)
      || lower.startsWith('.github/workflows/')
      || /(^|\/)docker-compose[^/]*\.ya?ml$/.test(lower);
  }).slice(0, 100);
  const databaseSignals = files.filter((file) => {
    const lower = file.toLowerCase();
    return /(^|\/)(migrations?|prisma|schema)(\/|$)/.test(lower)
      || /(^|\/)schema\.(sql|prisma)$/.test(lower);
  }).slice(0, 100);
  const sourceSignals = files.filter((file) => {
    const lower = file.toLowerCase();
    if (testSignals.includes(file) || lower.endsWith('.config.js') || lower.endsWith('.config.ts')) return false;
    const segments = file.split('/');
    const ext = path.extname(file);
    if (!SOURCE_EXTENSIONS.has(ext)) return false;
    return segments.some((segment) => SOURCE_DIR_SEGMENTS.has(segment))
      || /(^|\/)(main|index|server|app)\.[^.]+$/.test(lower);
  }).slice(0, 200);
  const workspaceRoots = [...new Set(packageData.workspacePatterns
    .flatMap((pattern) => expandWorkspacePattern(absTarget, pattern)))]
    .sort();
  const workspaceMarkers = [];
  if (packageData.workspacePatterns.length > 0) workspaceMarkers.push('package.json#workspaces');
  for (const marker of ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json', 'go.work']) {
    if (files.includes(marker)) workspaceMarkers.push(marker);
  }
  if (workspaceRoots.length === 0 && files.some((file) => /^packages\/[^/]+\/package\.json$/.test(file))) {
    workspaceRoots.push(...files
      .filter((file) => /^packages\/[^/]+\/package\.json$/.test(file))
      .map((file) => path.posix.dirname(file)));
    workspaceRoots.sort();
  }
  const reasons = [];
  if (sourceSignals.length > 0) reasons.push('SOURCE_PRESENT');
  if (testSignals.length > 0) reasons.push('TESTS_PRESENT');
  if (deploymentSignals.length > 0) reasons.push('DEPLOYMENT_PRESENT');
  if (databaseSignals.length > 0) reasons.push('PERSISTED_STATE_PRESENT');
  if (workspaceMarkers.length > 0 || workspaceRoots.length > 0) reasons.push('MONOREPO_PRESENT');
  if (reasons.length === 0) reasons.push('SKELETON_ONLY');
  const mode = sourceSignals.length > 0 || testSignals.length > 0
    || deploymentSignals.length > 0 || databaseSignals.length > 0
    ? 'brownfield' : 'greenfield';
  return {
    mode,
    reasons,
    repository_kind: workspaceMarkers.length > 0 || workspaceRoots.length > 0 ? 'monorepo' : 'single',
    workspace_markers: workspaceMarkers,
    workspace_roots: [...new Set(workspaceRoots)],
    manifest_signals: manifestSignals,
    source_signals: sourceSignals,
    test_signals: testSignals,
    deployment_signals: deploymentSignals,
    database_signals: databaseSignals,
    verification_commands: packageData.verificationCommands,
    scan_truncated: truncated,
  };
}

function detectProjectMode(absTarget, requested = 'auto') {
  if (!['auto', 'greenfield', 'brownfield'].includes(requested)) {
    throw new InitProjectError('VALIDATION_ERROR', `unsupported initialization mode: ${requested}`);
  }
  if (requested !== 'auto') return requested;
  return classifyRepository(absTarget).mode;
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

function projectionMigrationError(projection) {
  const targets = { '4.4': '4.5', '4.5': '12.0' };
  const target = targets[projection.version];
  if (target) {
    return new InitProjectError(
      'LEGACY_STATE_MIGRATION_REQUIRED',
      `state.db has no tasks but ${projection.path} contains ${projection.taskCount} v${projection.version} tasks; `
        + `run ultra-tools migrate --from=${projection.version} --to=${target} --source-dir <project-root> before resuming initialization`,
      { details: { projection_path: projection.path, projection_version: projection.version, legacy_task_count: projection.taskCount } },
    );
  }
  return new InitProjectError(
    'STATE_AUTHORITY_CONFLICT',
    `state.db has no tasks but ${projection.path} contains ${projection.taskCount} tasks with unsupported projection version ${projection.version}`,
    { details: { projection_path: projection.path, projection_version: projection.version, legacy_task_count: projection.taskCount } },
  );
}

function resumeProject({
  absTarget, ultraDir, source, project_name, project_type, stack, resolvedMode,
  scope, repositoryProfile, projection,
}) {
  const stateDbPath = path.join(ultraDir, 'state.db');
  const stateExisted = fs.existsSync(stateDbPath);
  let initialized;
  let copiedFiles = [];
  let baselineResult;
  try {
    initialized = initStateDb(stateDbPath);
    const { db } = initialized;
    if (projection && projection.taskCount > 0) assertStateAuthority(db, absTarget);
    copiedFiles = copyMissingTemplate(source, ultraDir);
    validateTasksTemplate(ultraDir);
    baselineResult = baselines.readBaseline(db);
    if (!baselineResult) {
      baselineResult = baselines.startBaseline(db, {
        id: 'project-baseline', project_name, project_type, stack,
        mode: resolvedMode, repository_revision: baselines.gitHead(absTarget),
        scope: scope === undefined ? ['.'] : scope,
        classification: repositoryProfile,
      }, { rootDir: absTarget });
    }
    ops.appendEvent(db, {
      type: 'project_resumed',
      payload: {
        project_name, mode: baselineResult.mode, baseline_id: baselineResult.id,
        installed_missing_files: copiedFiles.length,
      },
    });
    const job = runtimeState.enqueueProjection(db, { tool_name: 'task.init_project' });
    const projectionResult = runtimeState.processProjectionJobs(db, { rootDir: absTarget, limit: 1 });
    const projected = projectionResult.jobs.find((item) => item.id === job.id);
    if (!projected || projected.status !== 'completed') {
      throw new Error(projected?.error || 'resume projection did not complete');
    }
  } catch (error) {
    if (initialized?.db?.open) initialized.db.close();
    for (const rel of copiedFiles.reverse()) {
      try { fs.rmSync(path.join(ultraDir, rel), { force: true }); } catch { /* best effort */ }
    }
    if (!stateExisted) {
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.rmSync(`${stateDbPath}${suffix}`, { force: true }); } catch { /* best effort */ }
      }
    }
    if (error.code && ['LEGACY_STATE_MIGRATION_REQUIRED', 'STATE_AUTHORITY_CONFLICT', 'STATE_PROJECTION_INVALID'].includes(error.code)) {
      throw new InitProjectError(error.code, error.message, { cause: error, details: error.details });
    }
    throw new InitProjectError(
      'IO_ERROR', `project resume failed: ${error.message}; existing .ultra assets were preserved`,
      { retriable: true, cause: error },
    );
  }
  initialized.db.close();
  const result = {
    created_path: ultraDir,
    state_db_path: stateDbPath,
    status: 'resumed',
    mode: resolvedMode,
    baseline: {
      id: baselineResult.id,
      mode: baselineResult.mode,
      status: baselineResult.status,
      repository_revision: baselineResult.repository_revision,
      scope: baselineResult.scope,
    },
    copied_files: copiedFiles,
    repository_profile: repositoryProfile,
  };
  if (initialized.backup_path) result.migration_backup_path = initialized.backup_path;
  return result;
}

function initProject({
  target_dir,
  project_name,
  project_type,
  stack,
  mode = 'auto',
  scope,
  resume = false,
  overwrite = false,
  source_template,
} = {}) {
  if (typeof project_name !== 'string' || project_name.length === 0) {
    throw new InitProjectError('VALIDATION_ERROR', 'project_name must be non-empty');
  }
  if (resume && overwrite) {
    throw new InitProjectError('VALIDATION_ERROR', 'resume and overwrite are mutually exclusive');
  }

  const absTarget = resolveTargetDir(target_dir);
  ensureTargetDir(absTarget);
  const repositoryProfile = classifyRepository(absTarget);
  const resolvedMode = mode === 'auto' ? repositoryProfile.mode : detectProjectMode(absTarget, mode);
  repositoryProfile.detected_mode = repositoryProfile.mode;
  repositoryProfile.mode = resolvedMode;
  const source = ensureTemplate(source_template);
  const ultraDir = path.join(absTarget, '.ultra');

  if (fs.existsSync(ultraDir) && resume) {
    let projection;
    try { projection = inspectProjection(absTarget); }
    catch (error) {
      throw new InitProjectError(error.code || 'STATE_PROJECTION_INVALID', error.message, {
        cause: error, details: error.details,
      });
    }
    if (projection && projection.taskCount > 0
      && !fs.existsSync(path.join(ultraDir, 'state.db'))) {
      throw projectionMigrationError(projection);
    }
    return resumeProject({
      absTarget, ultraDir, source, project_name, project_type, stack, resolvedMode,
      scope, repositoryProfile, projection,
    });
  }

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
        mode: resolvedMode, repository_revision: baselines.gitHead(absTarget),
        scope: scope === undefined ? ['.'] : scope,
        classification: repositoryProfile,
      }, { rootDir: absTarget });
      ops.appendEvent(db, {
        type: 'project_initialized',
        payload: {
          project_name, mode: resolvedMode, baseline_id: baselineResult.id,
        },
      });
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
      scope: baselineResult.scope,
    },
    copied_files: copiedFiles,
    repository_profile: repositoryProfile,
  };
  if (backupPath) result.backup_path = backupPath;
  return result;
}

module.exports = {
  initProject, InitProjectError, DEFAULT_TEMPLATE, detectProjectMode, classifyRepository,
};
