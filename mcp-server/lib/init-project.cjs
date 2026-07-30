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
const Database = require('better-sqlite3');

const { EXPECTED_VERSION, initStateDb } = require('./state-db.cjs');
const { assertStateAuthority, inspectProjection } = require('./state-authority.cjs');
const taskLedger = require('./task-ledger.cjs');
const baselines = require('./baseline-workflow.cjs');
const gitBootstrap = require('./git-bootstrap.cjs');
const runtimePaths = require('./runtime-paths.cjs');
const runtimeState = require('./runtime-state.cjs');
const ops = require('./state-ops.cjs');
const stageCheckpoints = require('./stage-checkpoints.cjs');

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
  '.astro', '.c', '.cc', '.cpp', '.cs', '.css', '.dart', '.ex', '.exs', '.fs', '.fsx',
  '.go', '.graphql', '.gql', '.hcl', '.html', '.java', '.js', '.jsx', '.kt', '.kts',
  '.less', '.lua', '.mjs', '.move', '.php', '.proto', '.py', '.r', '.R', '.rb', '.rs',
  '.sass', '.scala', '.scss', '.sh', '.sol', '.svelte', '.swift', '.tf', '.ts', '.tsx',
  '.vue',
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

const JAVASCRIPT_TECHNOLOGIES = Object.freeze([
  { packages: ['next'], name: 'Next.js', capability: 'frontend' },
  { packages: ['react'], name: 'React', capability: 'frontend' },
  { packages: ['vue', 'nuxt'], name: 'Vue', capability: 'frontend' },
  { packages: ['svelte', '@sveltejs/kit'], name: 'Svelte', capability: 'frontend' },
  { packages: ['@angular/core'], name: 'Angular', capability: 'frontend' },
  { packages: ['express'], name: 'Express', capability: 'backend' },
  { packages: ['fastify'], name: 'Fastify', capability: 'backend' },
  { packages: ['@nestjs/core'], name: 'NestJS', capability: 'backend' },
  { packages: ['hono'], name: 'Hono', capability: 'backend' },
  { packages: ['koa'], name: 'Koa', capability: 'backend' },
  { packages: ['commander', 'yargs', 'oclif'], name: 'Node CLI', capability: 'cli' },
  { packages: ['@prisma/client', 'prisma'], name: 'Prisma' },
  { packages: ['typescript'], name: 'TypeScript' },
  { packages: ['vitest'], name: 'Vitest' },
  { packages: ['jest'], name: 'Jest' },
  { packages: ['playwright', '@playwright/test'], name: 'Playwright' },
]);

function readTextBounded(file, maxBytes = 256 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function detectTechnologyProfile(rootDir, files) {
  const technologies = new Set();
  const capabilities = new Set();
  const packageFiles = files.filter((file) => path.basename(file) === 'package.json').slice(0, 100);
  for (const relative of packageFiles) {
    let pkg;
    try { pkg = JSON.parse(readTextBounded(path.join(rootDir, relative))); }
    catch { continue; }
    technologies.add('Node.js');
    const dependencies = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ]);
    if (pkg.bin && (typeof pkg.bin === 'string' || typeof pkg.bin === 'object')) {
      capabilities.add('cli');
    }
    for (const technology of JAVASCRIPT_TECHNOLOGIES) {
      if (!technology.packages.some((name) => dependencies.has(name))) continue;
      technologies.add(technology.name);
      if (technology.capability) capabilities.add(technology.capability);
    }
  }

  if (files.some((file) => file === 'tsconfig.json' || /\.(ts|tsx)$/.test(file))) {
    technologies.add('TypeScript');
  }
  if (files.some((file) => /(^|\/)index\.html$/.test(file))) {
    technologies.add('HTML');
    capabilities.add('frontend');
  }
  if (files.some((file) => /\.(css|scss|sass|less)$/.test(file))) technologies.add('CSS');

  const pythonFiles = files.filter((file) => (
    ['pyproject.toml', 'requirements.txt'].includes(path.basename(file)) || file.endsWith('.py')
  ));
  if (pythonFiles.length > 0) {
    technologies.add('Python');
    const declarations = pythonFiles
      .filter((file) => ['pyproject.toml', 'requirements.txt'].includes(path.basename(file)))
      .map((file) => readTextBounded(path.join(rootDir, file)).toLowerCase())
      .join('\n');
    for (const [needle, label, capability] of [
      ['fastapi', 'FastAPI', 'backend'], ['django', 'Django', 'backend'],
      ['flask', 'Flask', 'backend'], ['typer', 'Typer', 'cli'], ['click', 'Click', 'cli'],
      ['pytest', 'Pytest', null],
    ]) {
      if (!declarations.includes(needle)) continue;
      technologies.add(label);
      if (capability) capabilities.add(capability);
    }
  }
  if (files.some((file) => ['go.mod', 'go.work'].includes(path.basename(file)) || file.endsWith('.go'))) {
    technologies.add('Go');
  }
  if (files.some((file) => path.basename(file) === 'Cargo.toml' || file.endsWith('.rs'))) {
    technologies.add('Rust');
    const cargo = files.filter((file) => path.basename(file) === 'Cargo.toml')
      .map((file) => readTextBounded(path.join(rootDir, file)).toLowerCase()).join('\n');
    if (cargo.includes('clap')) {
      technologies.add('Clap');
      capabilities.add('cli');
    }
  }
  if (files.some((file) => ['pom.xml', 'build.gradle', 'build.gradle.kts'].includes(path.basename(file)))) {
    technologies.add('JVM');
  }
  if (files.some((file) => path.basename(file) === 'Gemfile' || file.endsWith('.rb'))) {
    technologies.add('Ruby');
  }
  if (files.some((file) => path.basename(file) === 'composer.json' || file.endsWith('.php'))) {
    technologies.add('PHP');
  }

  let projectType = 'other';
  if (capabilities.has('frontend') && capabilities.has('backend')) projectType = 'fullstack';
  else if (capabilities.has('frontend')) projectType = 'web';
  else if (capabilities.has('backend')) projectType = 'api';
  else if (capabilities.has('cli')) projectType = 'cli';
  return {
    detected_project_type: projectType,
    detected_stack: technologies.size > 0 ? [...technologies].join(', ') : null,
    technology_signals: [...technologies],
    capability_signals: [...capabilities].sort(),
  };
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
    if (testSignals.includes(file) || /(^|\/)[^/]+\.config\.(c|m)?(j|t)s$/.test(lower)) return false;
    const ext = path.extname(file);
    if (!SOURCE_EXTENSIONS.has(ext)) return false;
    return true;
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
  if (truncated) reasons.push('SCAN_TRUNCATED');
  if (reasons.length === 0) reasons.push('SKELETON_ONLY');
  const mode = sourceSignals.length > 0 || testSignals.length > 0
    || deploymentSignals.length > 0 || databaseSignals.length > 0 || truncated
    ? 'brownfield' : 'greenfield';
  const technologyProfile = detectTechnologyProfile(absTarget, files);
  return {
    mode,
    ...technologyProfile,
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

function createResumeSnapshot(ultraDir, stateDbPath) {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const runtimeDir = path.dirname(stateDbPath);
  const statePath = path.join(runtimeDir, `.resume-state-${token}.db`);
  const projectionDir = path.join(runtimeDir, `.resume-projections-${token}`);
  const projectionTargets = [
    path.join('tasks', 'tasks.json'),
    path.join('tasks', 'contexts'),
    path.join('.runtime', 'projections'),
    path.join('.runtime', 'backups', 'task-ledger'),
  ];
  let db;
  try {
    db = new Database(stateDbPath, { fileMustExist: true });
    db.prepare('VACUUM INTO ?').run(statePath);
    db.close();
    db = null;
    const projections = projectionTargets.map((relative) => {
      const source = path.join(ultraDir, relative);
      const existed = fs.existsSync(source);
      if (existed) {
        const destination = path.join(projectionDir, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(source, destination, { recursive: true });
      }
      return { relative, existed };
    });
    return { statePath, projectionDir, projections, stateDbPath, ultraDir };
  } catch (error) {
    if (db?.open) db.close();
    for (const target of [statePath, projectionDir]) {
      try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    throw error;
  }
}

function discardResumeSnapshot(snapshot) {
  if (!snapshot) return [];
  const errors = [];
  for (const target of [snapshot.statePath, snapshot.projectionDir]) {
    try { fs.rmSync(target, { recursive: true, force: true }); }
    catch (error) { errors.push(`resume snapshot cleanup failed for ${target}: ${error.message}`); }
  }
  return errors;
}

function restoreResumeSnapshot(snapshot, {
  renameSync = fs.renameSync,
} = {}) {
  if (!snapshot) return [];
  const errors = [];
  const runtimeDir = path.dirname(snapshot.stateDbPath);
  const liveStage = path.join(
    runtimeDir,
    `.resume-live-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const movedLive = [];
  try {
    fs.mkdirSync(liveStage, { recursive: false });
    for (const suffix of ['', '-wal', '-shm']) {
      const live = `${snapshot.stateDbPath}${suffix}`;
      if (!fs.existsSync(live)) continue;
      const staged = path.join(liveStage, `state.db${suffix}`);
      renameSync(live, staged);
      movedLive.push({ live, staged });
    }
    renameSync(snapshot.statePath, snapshot.stateDbPath);
  } catch (error) {
    errors.push(`state.db restore failed: ${error.message}`);
    for (const item of [...movedLive].reverse()) {
      try {
        if (fs.existsSync(item.live)) {
          errors.push(`live state rollback target already exists: ${item.live}`);
          continue;
        }
        renameSync(item.staged, item.live);
      } catch (rollbackError) {
        errors.push(`live state rollback failed for ${item.live}: ${rollbackError.message}`);
      }
    }
    // The snapshot and staged live image are recovery evidence. Never destroy
    // either when publication or rollback is incomplete.
    try {
      if (fs.existsSync(liveStage) && fs.readdirSync(liveStage).length === 0) {
        fs.rmdirSync(liveStage);
      }
    } catch (cleanupError) {
      errors.push(`live state staging cleanup failed: ${cleanupError.message}`);
    }
    return errors;
  }
  try {
    fs.rmSync(liveStage, { recursive: true, force: true });
  } catch (error) {
    errors.push(`prior live state cleanup failed: ${error.message}`);
  }
  for (const item of snapshot.projections) {
    const target = path.join(snapshot.ultraDir, item.relative);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      if (item.existed) {
        const source = path.join(snapshot.projectionDir, item.relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.cpSync(source, target, { recursive: true });
      }
    } catch (error) {
      errors.push(`projection restore failed for ${item.relative}: ${error.message}`);
    }
  }
  if (errors.length === 0) {
    errors.push(...discardResumeSnapshot(snapshot));
  }
  return errors;
}

function projectionMigrationError(projection) {
  const targets = { '4.4': '4.5', '4.5': EXPECTED_VERSION };
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

function ensureInitializationCheckpoint(db, baseline) {
  let initCheckpoint = stageCheckpoints.currentCheckpoint(
    db,
    'init',
    { baseline_id: baseline.id },
    { includeDraft: false },
  );
  if (!initCheckpoint) {
    const draft = stageCheckpoints.saveDraft(db, {
      stage: 'init',
      scope: { baseline_id: baseline.id },
      payload: {
        project_name: baseline.project_name,
        repository_revision: baseline.repository_revision,
        scope: baseline.scope,
      },
      evidence: [{
        kind: 'authority',
        ref: '.ultra/.runtime/state.db',
        summary: 'State authority, scaffold, projection, and repository classification were verified.',
      }],
      diagnostics: [],
      idempotency_key: `init:${baseline.id}:draft`,
    });
    initCheckpoint = stageCheckpoints.acceptDraft(db, {
      id: draft.id,
      idempotency_key: `init:${baseline.id}:accept`,
    });
  }
  let researchCheckpoint = stageCheckpoints.currentCheckpoint(
    db,
    'research',
    { baseline_id: baseline.id },
    { includeDraft: false },
  );
  const legacyResearch = db.prepare(
    `SELECT id, mode, status FROM workflow_runs
     WHERE kind = 'research' AND baseline_id = ?
     ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).get(baseline.id);
  if (!researchCheckpoint && legacyResearch?.status === 'completed') {
    const draft = stageCheckpoints.saveDraft(db, {
      stage: 'research',
      scope: { baseline_id: baseline.id },
      payload: {
        migration_source: 'workflow_runs',
        legacy_run_id: legacyResearch.id,
        mode: legacyResearch.mode,
      },
      evidence: [{
        kind: 'legacy_workflow',
        ref: legacyResearch.id,
        summary: 'Completed legacy research provenance migrated during project resume.',
      }],
      diagnostics: [],
      idempotency_key: `research:${baseline.id}:legacy:${legacyResearch.id}:draft`,
    });
    researchCheckpoint = stageCheckpoints.acceptDraft(db, {
      id: draft.id,
      idempotency_key: `research:${baseline.id}:legacy:${legacyResearch.id}:accept`,
    });
  }
  const compatibilityOnly = baseline.mode === 'migrated';
  const provenanceComplete = !compatibilityOnly
    && baseline.status === 'ready'
    && initCheckpoint.status === 'accepted'
    && researchCheckpoint?.status === 'accepted';
  const readyWithoutProvenance = baseline.status === 'ready' && !provenanceComplete;
  const allowedTransitions = provenanceComplete
    ? ['ultra-change', 'ultra-research', 'ultra-status', 'ultra-doctor']
    : (readyWithoutProvenance
      ? ['ultra-doctor', 'ultra-research', 'ultra-status']
      : ['ultra-research', 'ultra-status', 'ultra-doctor']);
  return {
    init: {
      id: initCheckpoint.id,
      status: initCheckpoint.status,
      revision: initCheckpoint.revision,
      digest: initCheckpoint.digest,
    },
    research: researchCheckpoint ? {
      id: researchCheckpoint.id,
      status: researchCheckpoint.status,
      revision: researchCheckpoint.revision,
      digest: researchCheckpoint.digest,
      mode: researchCheckpoint.payload?.mode || null,
    } : null,
    provenance_status: compatibilityOnly
      ? 'compatibility_only'
      : (provenanceComplete ? 'complete' : (readyWithoutProvenance ? 'incomplete' : 'pending_research')),
    allowed_transitions: allowedTransitions,
    required_transition: readyWithoutProvenance
      ? 'ultra-doctor'
      : (compatibilityOnly ? 'ultra-research' : null),
  };
}

function resumeProject({
  absTarget, ultraDir, source, project_name, project_type, stack, resolvedMode,
  scope, repositoryProfile, projection, git_mode,
}) {
  let locatedStatePath;
  try {
    locatedStatePath = runtimePaths.locateStateDb(absTarget, { env: {} });
  } catch (error) {
    throw new InitProjectError(
      error.code || 'RUNTIME_STATE_CONFLICT',
      error.message,
      { cause: error, details: error.details },
    );
  }
  const stateExisted = fs.existsSync(locatedStatePath);
  let runtimeLayout;
  let gitSetup;
  const stateDbPath = runtimePaths.pathsFor(absTarget).stateDbPath;
  let initialized;
  let copiedFiles = [];
  let baselineResult;
  let checkpointResult;
  let teamCheckpoint;
  let resumeSnapshot;
  const completeResume = () => {
    try {
      if (stateExisted) {
        // Snapshot the exact entry authority before initStateDb can migrate its
        // schema. A failed snapshot therefore cannot partially upgrade state.
        resumeSnapshot = createResumeSnapshot(ultraDir, stateDbPath);
      }
      initialized = initStateDb(stateDbPath);
      const { db } = initialized;
      if (projection && (
        projection.taskCount > 0 || projection.kind === taskLedger.LEDGER_KIND
      )) {
        teamCheckpoint = assertStateAuthority(db, absTarget, { importTeamLedger: true });
      }
      copiedFiles = copyMissingTemplate(source, ultraDir);
      validateTasksTemplate(ultraDir);
      repositoryProfile.git = gitSetup.result;
      baselineResult = baselines.readBaseline(db);
      if (!baselineResult) {
        baselineResult = baselines.startBaseline(db, {
          id: 'project-baseline', project_name, project_type, stack,
          mode: resolvedMode, repository_revision: baselines.gitHead(absTarget),
          scope: scope === undefined ? ['.'] : scope,
          classification: repositoryProfile,
        }, { rootDir: absTarget });
      } else {
        baselineResult = baselines.refreshInProgressBaseline(db, {
          id: baselineResult.id,
          project_name,
          project_type,
          stack,
          classification: repositoryProfile,
        }, { rootDir: absTarget });
      }
      checkpointResult = ensureInitializationCheckpoint(db, baselineResult);
      if (projection?.kind === 'legacy-task-projection') {
        const publication = taskLedger.publishTaskLedger(db, {
          rootDir: absTarget,
          reason: 'legacy_projection_upgraded',
        });
        teamCheckpoint = {
          generation: publication.ledger.generation,
          state_digest: publication.ledger.state_digest,
          imported: 0,
          deleted: 0,
          imported_changes: 0,
          imported_baseline: false,
          requires_plan_revalidation: false,
          requires_baseline_revalidation: false,
          already_current: true,
          published: publication.changed,
          migrated_legacy_projection: Boolean(publication.migrated_legacy_projection),
          legacy_backup_path: publication.legacy_backup_path || null,
        };
      }
      ops.appendEvent(db, {
        type: 'project_resumed',
        payload: {
          project_name, mode: baselineResult.mode, baseline_id: baselineResult.id,
          installed_missing_files: copiedFiles.length, git: gitSetup.result,
        },
      });
      const job = runtimeState.enqueueProjection(db, { tool_name: 'task.init_project' });
      const projectionResult = runtimeState.processProjectionJobs(
        db, { rootDir: absTarget, limit: 1 },
      );
      const projected = projectionResult.jobs.find((item) => item.id === job.id);
      if (!projected || projected.status !== 'completed') {
        throw new Error(
          `resume projection did not complete: ${projected?.error || 'projection job missing'}`,
        );
      }
    } catch (error) {
      if (initialized?.db?.open) initialized.db.close();
      const stateRollbackErrors = stateExisted
        ? restoreResumeSnapshot(resumeSnapshot)
        : [];
      const gitRollbackErrors = gitBootstrap.rollbackGitBootstrap(
        absTarget, gitSetup?.internal,
      );
      for (const rel of copiedFiles.reverse()) {
        try { fs.rmSync(path.join(ultraDir, rel), { force: true }); } catch { /* best effort */ }
      }
      if (!stateExisted) {
        for (const suffix of ['', '-wal', '-shm']) {
          try { fs.rmSync(`${stateDbPath}${suffix}`, { force: true }); } catch { /* best effort */ }
        }
      }
      const rollbackErrors = [...stateRollbackErrors, ...gitRollbackErrors];
      if (error instanceof taskLedger.TaskLedgerError
          || (error.code && [
            'LEGACY_STATE_MIGRATION_REQUIRED',
            'STATE_AUTHORITY_CONFLICT',
            'STATE_PROJECTION_INVALID',
          ].includes(error.code))) {
        throw new InitProjectError(
          error.code,
          error.message,
          { cause: error, details: error.details },
        );
      }
      if (error instanceof gitBootstrap.GitBootstrapError) {
        throw new InitProjectError(
          error.code,
          `${error.message}${rollbackErrors.length ? `; ${rollbackErrors.join('; ')}` : ''}`,
          { cause: error },
        );
      }
      throw new InitProjectError(
        'IO_ERROR',
        `project resume failed: ${error.message}; `
          + `${rollbackErrors.length ? 'resume rollback was incomplete' : 'existing authority and projections were restored'}`
          + `${rollbackErrors.length ? `; ${rollbackErrors.join('; ')}` : ''}`,
        { retriable: true, cause: error },
      );
    }
  };

  try {
    runtimeLayout = runtimePaths.ensureRuntimeState(absTarget, {
      admitStorageBoundary: () => {
        gitSetup = gitBootstrap.bootstrapGit(absTarget, { mode: git_mode });
        completeResume();
        return gitSetup;
      },
    });
  } catch (error) {
    if (error instanceof InitProjectError) throw error;
    throw new InitProjectError(
      error.code || 'RUNTIME_STATE_MIGRATION_FAILED',
      error.message,
      { cause: error, details: error.details },
    );
  }
  initialized.db.close();
  discardResumeSnapshot(resumeSnapshot);
  const result = {
    created_path: ultraDir,
    state_db_path: stateDbPath,
    status: 'resumed',
    mode: baselineResult.mode,
    baseline: {
      id: baselineResult.id,
      mode: baselineResult.mode,
      status: baselineResult.status,
      project_name: baselineResult.project_name,
      project_type: baselineResult.project_type,
      stack: baselineResult.stack,
      repository_revision: baselineResult.repository_revision,
      repository_branch: baselineResult.repository_branch,
      worktree_state: baselineResult.worktree_state,
      scope: baselineResult.scope,
    },
    copied_files: copiedFiles,
    repository_profile: repositoryProfile,
    git: gitSetup.result,
    checkpoint: checkpointResult,
  };
  if (teamCheckpoint) {
    result.team_checkpoint = {
      generation: teamCheckpoint.generation,
      state_digest: teamCheckpoint.state_digest,
      imported_tasks: teamCheckpoint.imported,
      deleted_tasks: teamCheckpoint.deleted,
      imported_changes: teamCheckpoint.imported_changes,
      imported_baseline: teamCheckpoint.imported_baseline,
      requires_plan_revalidation: teamCheckpoint.requires_plan_revalidation,
      requires_baseline_revalidation: teamCheckpoint.requires_baseline_revalidation,
      already_current: teamCheckpoint.already_current,
      published: Boolean(teamCheckpoint.published),
      migrated_legacy_projection: Boolean(teamCheckpoint.migrated_legacy_projection),
      legacy_backup_path: teamCheckpoint.legacy_backup_path || undefined,
    };
  }
  if (initialized.backup_path) result.migration_backup_path = initialized.backup_path;
  if (runtimeLayout.backupPath) {
    result.runtime_migration_backup_path = runtimeLayout.backupPath;
  }
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
  git_mode = 'auto',
  source_template,
} = {}) {
  if (typeof project_name !== 'string' || project_name.length === 0) {
    throw new InitProjectError('VALIDATION_ERROR', 'project_name must be non-empty');
  }
  if (resume && overwrite) {
    throw new InitProjectError('VALIDATION_ERROR', 'resume and overwrite are mutually exclusive');
  }
  if (!gitBootstrap.GIT_MODES.has(git_mode)) {
    throw new InitProjectError(
      'VALIDATION_ERROR',
      `git_mode must be one of: ${[...gitBootstrap.GIT_MODES].join(', ')}`,
    );
  }

  const absTarget = resolveTargetDir(target_dir);
  ensureTargetDir(absTarget);
  const repositoryProfile = classifyRepository(absTarget);
  const resolvedMode = mode === 'auto' ? repositoryProfile.mode : detectProjectMode(absTarget, mode);
  const resolvedProjectType = project_type || repositoryProfile.detected_project_type;
  const resolvedStack = stack || repositoryProfile.detected_stack || undefined;
  repositoryProfile.detected_mode = repositoryProfile.mode;
  repositoryProfile.mode = resolvedMode;
  repositoryProfile.selected_project_type = resolvedProjectType;
  repositoryProfile.selected_stack = resolvedStack || null;
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
    let locatedStatePath;
    try {
      locatedStatePath = runtimePaths.locateStateDb(absTarget, { env: {} });
    } catch (error) {
      throw new InitProjectError(
        error.code || 'RUNTIME_STATE_CONFLICT',
        error.message,
        { cause: error, details: error.details },
      );
    }
    if (projection && projection.taskCount > 0
      && projection.kind !== taskLedger.LEDGER_KIND
      && !fs.existsSync(locatedStatePath)) {
      throw projectionMigrationError(projection);
    }
    return resumeProject({
      absTarget, ultraDir, source, project_name, project_type: resolvedProjectType,
      stack: resolvedStack, resolvedMode,
      scope, repositoryProfile, projection, git_mode,
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
  let checkpointResult;
  let gitSetup;
  try {
    fs.mkdirSync(ultraDir, { recursive: true });
    copiedFiles = copyTemplate(source, ultraDir);
    validateTasksTemplate(ultraDir);
    gitSetup = gitBootstrap.bootstrapGit(absTarget, { mode: git_mode });
    repositoryProfile.git = gitSetup.result;
    const runtimeLayout = runtimePaths.ensureRuntimeState(absTarget);
    const stateDbPath = runtimeLayout.stateDbPath;
    const { db } = initStateDb(stateDbPath);
    try {
      baselineResult = baselines.startBaseline(db, {
        id: 'project-baseline', project_name, project_type: resolvedProjectType,
        stack: resolvedStack,
        mode: resolvedMode, repository_revision: baselines.gitHead(absTarget),
        scope: scope === undefined ? ['.'] : scope,
        classification: repositoryProfile,
      }, { rootDir: absTarget });
      checkpointResult = ensureInitializationCheckpoint(db, baselineResult);
      ops.appendEvent(db, {
        type: 'project_initialized',
        payload: {
          project_name, mode: resolvedMode, baseline_id: baselineResult.id,
          git: gitSetup.result,
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
    rollbackErrors.push(...gitBootstrap.rollbackGitBootstrap(absTarget, gitSetup?.internal));
    const rollbackNote = rollbackErrors.length > 0
      ? `; rollback incomplete: ${rollbackErrors.join('; ')}`
      : '; prior state restored';
    if (err instanceof gitBootstrap.GitBootstrapError) {
      throw new InitProjectError(
        err.code,
        `project initialization failed: ${err.message}${rollbackNote}`,
        { cause: err },
      );
    }
    throw new InitProjectError(
      'IO_ERROR',
      `project initialization failed: ${err.message}${rollbackNote}`,
      { retriable: true, cause: err },
    );
  }

  const stateDbPath = runtimePaths.pathsFor(absTarget).stateDbPath;
  const result = {
    created_path: ultraDir,
    state_db_path: stateDbPath,
    status,
    mode: resolvedMode,
    baseline: {
      id: baselineResult.id,
      mode: baselineResult.mode,
      status: baselineResult.status,
      project_name: baselineResult.project_name,
      project_type: baselineResult.project_type,
      stack: baselineResult.stack,
      repository_revision: baselineResult.repository_revision,
      repository_branch: baselineResult.repository_branch,
      worktree_state: baselineResult.worktree_state,
      scope: baselineResult.scope,
    },
    copied_files: copiedFiles,
    repository_profile: repositoryProfile,
    git: gitSetup.result,
    checkpoint: checkpointResult,
  };
  if (backupPath) result.backup_path = backupPath;
  return result;
}

module.exports = {
  initProject, InitProjectError, DEFAULT_TEMPLATE, detectProjectMode, classifyRepository,
  _internal: {
    createResumeSnapshot,
    discardResumeSnapshot,
    restoreResumeSnapshot,
  },
};
