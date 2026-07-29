'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GIT_MODES = new Set(['auto', 'initialize', 'skip']);
// No trailing slash: isolated session worktrees expose only `.ultra/.runtime`
// as a symlink, and Git's directory-only pattern does not ignore that symlink
// reliably. Semantic and evidence artifacts elsewhere in `.ultra/` remain
// trackable and travel with their task branch.
const ULTRA_RUNTIME_IGNORE_LINE = '.ultra/.runtime';
const ULTRA_LEGACY_STATE_IGNORE_LINES = Object.freeze([
  '.ultra/[s]tate.db',
  '.ultra/[s]tate.db-wal',
  '.ultra/[s]tate.db-shm',
]);
const ULTRA_LEGACY_STATE_PROBES = Object.freeze([
  '.ultra/' + 'state.db',
  '.ultra/' + 'state.db-wal',
  '.ultra/' + 'state.db-shm',
]);
const ULTRA_UNIGNORE_DIR_LINE = '!.ultra/';
const ULTRA_UNIGNORE_CONTENT_LINE = '!.ultra/**';
const LEGACY_BROAD_IGNORE_LINES = new Set(['.ultra', '.ultra/', '/.ultra', '/.ultra/']);
const ULTRA_GIT_ARTIFACT_CLASSES = Object.freeze({
  runtime: Object.freeze({
    compatibility: ULTRA_LEGACY_STATE_PROBES,
    authority: Object.freeze([
      '.ultra/.runtime/state.db',
      '.ultra/.runtime/state.db-wal',
      '.ultra/.runtime/state.db-shm',
    ]),
    backups: Object.freeze([
      '.ultra/.runtime/backups/state-db-2026-07-28.db',
      '.ultra/.runtime/backups/legacy-state-2026-07-28/state.db',
      '.ultra/.runtime/backups/projection-v4.5-2026-07-28/tasks/tasks.json',
      '.ultra/.runtime/backups/backup-v4.4-2026-07-28/specs/product.md',
    ]),
    coordination: Object.freeze([
      '.ultra/.runtime/collab/review.json',
      '.ultra/.runtime/sessions/session/metadata.json',
      '.ultra/.runtime/worktrees/session/marker',
      '.ultra/.runtime/telemetry/events.jsonl',
      '.ultra/.runtime/debug/trace.jsonl',
      '.ultra/.runtime/checkpoint.json',
      '.ultra/.runtime/orchestrator/orchestrator.pid',
      '.ultra/.runtime/orchestrator/orchestrator.log',
      '.ultra/.runtime/recovery/worktrees/session/sentinel',
    ]),
  }),
  semantic: Object.freeze({
    baseline: Object.freeze([
      '.ultra/specs/discovery.md',
      '.ultra/specs/product.md',
      '.ultra/specs/architecture.md',
      '.ultra/specs/research-distillate.md',
    ]),
    planning: Object.freeze([
      '.ultra/plan.md',
      '.ultra/plan.json',
      '.ultra/tasks/tasks.json',
      '.ultra/tasks/plan.md',
      '.ultra/tasks/plan.json',
    ]),
    research: Object.freeze([
      '.ultra/docs/research/README.md',
      '.ultra/docs/research/workflow/step.md',
    ]),
    changes: Object.freeze([
      '.ultra/changes/active/example/intent.md',
      '.ultra/changes/active/example/plan.md',
      '.ultra/changes/active/example/delta/spec.md',
      '.ultra/changes/active/example/findings/review.md',
      '.ultra/changes/active/example/evidence/build.json',
      '.ultra/changes/active/example/reconciliation.json',
      '.ultra/changes/active/example/verification.md',
      '.ultra/changes/active/example/contexts/manifest.json',
      '.ultra/changes/archive/example/intent.md',
      '.ultra/changes/archive/example/plan.md',
      '.ultra/changes/archive/example/evidence/release.json',
    ]),
    reports: Object.freeze([
      '.ultra/reports/templates/test-report.json',
      '.ultra/reports/templates/delivery-report.json',
      '.ultra/reports/tests/workflow.json',
      '.ultra/reports/delivery/workflow.json',
      '.ultra/reports/test-report.json',
      '.ultra/reports/delivery-report.json',
    ]),
    evidence: Object.freeze([
      '.ultra/evidence/build.json',
      '.ultra/findings/review.md',
      '.ultra/reconciliation/change.md',
      '.ultra/archive/change/evidence.json',
    ]),
  }),
});
const ULTRA_RUNTIME_PROBES = Object.freeze(
  Object.values(ULTRA_GIT_ARTIFACT_CLASSES.runtime).flat(),
);
const ULTRA_SEMANTIC_PROBES = Object.freeze(
  Object.values(ULTRA_GIT_ARTIFACT_CLASSES.semantic).flat(),
);

class GitBootstrapError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'GitBootstrapError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function runGit(rootDir, args, spawnGit = spawnSync) {
  return spawnGit('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitValue(rootDir, args, spawnGit = spawnSync, {
  absentStatuses = [],
} = {}) {
  const result = runGit(rootDir, args, spawnGit);
  if (result?.error) {
    throw new GitBootstrapError(
      'GIT_DISCOVERY_FAILED',
      `Git probe failed: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (result.status === 0) return String(result.stdout || '').trim();
  if (absentStatuses.includes(result.status)) return null;
  const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
  throw new GitBootstrapError(
    'GIT_DISCOVERY_FAILED',
    `Git probe ${args.join(' ')} failed: ${detail}`,
  );
}

function hasGitMetadata(rootDir) {
  let current = path.resolve(rootDir);
  while (true) {
    if (fs.lstatSync(path.join(current, '.git'), { throwIfNoEntry: false })) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function inspectGitRepository(rootDir, { spawnGit = spawnSync } = {}) {
  const metadataPresent = hasGitMetadata(rootDir);
  const result = runGit(rootDir, ['rev-parse', '--show-toplevel'], spawnGit);
  const repositoryRoot = result?.status === 0 ? String(result.stdout || '').trim() : '';
  if (!repositoryRoot) {
    const detail = String(
      result?.error?.message || result?.stderr || result?.stdout || 'unknown Git probe failure',
    ).trim();
    const explicitlyNotRepository = !metadataPresent
      && result?.status !== null
      && result?.status !== 0
      && /not a git repository/i.test(detail);
    if (!explicitlyNotRepository) {
      throw new GitBootstrapError(
        'GIT_DISCOVERY_FAILED',
        `cannot classify repository state: ${detail}`,
        { cause: result?.error },
      );
    }
    return {
      present: false,
      repository_root: null,
      branch: null,
      head: null,
    };
  }
  return {
    present: true,
    repository_root: path.resolve(repositoryRoot),
    branch: gitValue(
      rootDir,
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      spawnGit,
      { absentStatuses: [1] },
    )
      || gitValue(rootDir, ['branch', '--show-current'], spawnGit),
    head: gitValue(
      rootDir,
      ['rev-parse', '--verify', '--quiet', 'HEAD'],
      spawnGit,
      { absentStatuses: [1] },
    ),
  };
}

function initializeRepository(rootDir) {
  let result = runGit(rootDir, ['init', '-q', '-b', 'main']);
  if (result.status !== 0) {
    result = runGit(rootDir, ['init', '-q']);
    if (result.status === 0) {
      const branch = runGit(rootDir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
      if (branch.status !== 0) result = branch;
    }
  }
  if (result.status !== 0) {
    throw new GitBootstrapError(
      'GIT_INIT_FAILED',
      `git init failed: ${(result.stderr || result.stdout || 'unknown error').trim()}`,
    );
  }
}

function checkIgnoreStates(rootDir, probes, spawnGit = spawnSync) {
  const unique = [...new Set(probes)];
  if (unique.length === 0) return new Map();
  const result = spawnGit(
    'git',
    ['check-ignore', '--no-index', '--stdin', '-z'],
    {
      cwd: rootDir,
      encoding: 'utf8',
      input: `${unique.join('\0')}\0`,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  if (result?.error || ![0, 1].includes(result?.status)) {
    const detail = String(
      result?.error?.message || result?.stderr || result?.stdout
        || `exit ${String(result?.status)}`,
    ).trim();
    throw new GitBootstrapError(
      'GITIGNORE_PROBE_FAILED',
      `cannot classify Ultra artifacts: ${detail}`,
      { cause: result?.error },
    );
  }
  const ignored = new Set(
    String(result.stdout || '').split('\0').filter(Boolean),
  );
  for (const output of ignored) {
    if (!unique.includes(output)) {
      throw new GitBootstrapError(
        'GITIGNORE_PROBE_FAILED',
        `Git returned an unexpected Ultra artifact path: ${output}`,
      );
    }
  }
  return new Map(unique.map((probe) => [
    probe,
    ignored.has(probe) ? 'ignored' : 'trackable',
  ]));
}

function checkIgnoreState(rootDir, probe) {
  return checkIgnoreStates(rootDir, [probe]).get(probe);
}

function scanManagedArtifacts(rootDir) {
  const ultraRoot = path.join(rootDir, '.ultra');
  const stat = fs.lstatSync(ultraRoot, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    return { runtime: [], semantic: [] };
  }
  const found = { runtime: [], semantic: [] };
  const pending = fs.readdirSync(ultraRoot)
    .map((entry) => path.join(ultraRoot, entry));
  while (pending.length > 0) {
    const candidate = pending.pop();
    const entry = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (!entry) continue;
    const relative = path.relative(rootDir, candidate).split(path.sep).join('/');
    const runtime = relative === '.ultra/.runtime'
      || relative.startsWith('.ultra/.runtime/')
      || ULTRA_LEGACY_STATE_PROBES.includes(relative);
    found[runtime ? 'runtime' : 'semantic'].push(relative);
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    const parts = relative.split('/');
    if (parts.length === 4
        && parts[0] === '.ultra'
        && parts[1] === '.runtime'
        && parts[2] === 'worktrees') {
      continue;
    }
    for (const child of fs.readdirSync(candidate)) {
      pending.push(path.join(candidate, child));
    }
  }
  return found;
}

function runtimeIsIgnored(rootDir) {
  const runtimeEntry = fs.lstatSync(
    path.join(rootDir, '.ultra', '.runtime'),
    { throwIfNoEntry: false },
  );
  if (runtimeEntry?.isSymbolicLink()) {
    // Git refuses to classify pathspecs beyond a symlink. For a task
    // worktree the link itself is the complete runtime boundary, so proving
    // the exact link ignored is both necessary and sufficient.
    return checkIgnoreState(rootDir, '.ultra/.runtime') === 'ignored';
  }
  const actual = scanManagedArtifacts(rootDir).runtime;
  const probes = [...new Set([...ULTRA_RUNTIME_PROBES, ...actual])];
  const states = checkIgnoreStates(rootDir, probes);
  return probes.every((probe) => states.get(probe) === 'ignored');
}

function semanticArtifactsAreTrackable(rootDir) {
  const actual = scanManagedArtifacts(rootDir).semantic;
  const probes = [...new Set([...ULTRA_SEMANTIC_PROBES, ...actual])];
  const states = checkIgnoreStates(rootDir, probes);
  return probes.every((probe) => states.get(probe) === 'trackable');
}

function rootRulesPreserveUltraBoundary(rootDir) {
  const file = path.join(rootDir, '.gitignore');
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return true;
  if (stat.isSymbolicLink() || !stat.isFile()) return false;
  const rules = fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  let lastUnsafe = -1;
  let unignoreDir = -1;
  let unignoreContent = -1;
  let runtimeIgnore = -1;
  const compatibilityIgnores = new Map(
    ULTRA_LEGACY_STATE_IGNORE_LINES.map((rule) => [rule, -1]),
  );
  rules.forEach((rule, index) => {
    const normalized = rule.replace(/^\/+/, '').replace(/\/+$/u, '');
    if (rule === ULTRA_UNIGNORE_DIR_LINE) unignoreDir = index;
    else if (rule === ULTRA_UNIGNORE_CONTENT_LINE) unignoreContent = index;
    else if (normalized === ULTRA_RUNTIME_IGNORE_LINE) runtimeIgnore = index;
    else if (compatibilityIgnores.has(normalized)) compatibilityIgnores.set(normalized, index);
    else if (normalized.includes('.ultra')) lastUnsafe = index;
  });
  if (lastUnsafe === -1) return true;
  return unignoreDir > lastUnsafe
    && unignoreContent > unignoreDir
    && runtimeIgnore > unignoreContent
    && [...compatibilityIgnores.values()].every((index) => index > unignoreContent);
}

function effectiveUltraStorageBoundary(rootDir) {
  return rootRulesPreserveUltraBoundary(rootDir)
    && runtimeIsIgnored(rootDir)
    && semanticArtifactsAreTrackable(rootDir);
}

function repositoryLocalRuntimePattern(rootDir, repository) {
  const repositoryRoot = fs.realpathSync(repository.repository_root);
  const projectRoot = fs.realpathSync(rootDir);
  const relative = path.relative(repositoryRoot, projectRoot);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new GitBootstrapError(
      'GIT_REPOSITORY_SCOPE_INVALID',
      `project root is outside its reported Git repository: ${rootDir}`,
    );
  }
  const components = relative ? relative.split(path.sep) : [];
  return `/${[...components, '.ultra', '.runtime'].join('/')}`;
}

function repositoryLocalCompatibilityPatterns(rootDir, repository) {
  const runtimePattern = repositoryLocalRuntimePattern(rootDir, repository);
  const prefix = runtimePattern.slice(0, -'.runtime'.length);
  return ULTRA_LEGACY_STATE_IGNORE_LINES.map((line) => (
    `${prefix}${line.slice('.ultra/'.length)}`
  ));
}

function ensureLocalRuntimeIgnored(rootDir, repository) {
  const result = runGit(rootDir, ['rev-parse', '--git-path', 'info/exclude']);
  if (result.status !== 0) {
    throw new GitBootstrapError(
      'GITEXCLUDE_UNAVAILABLE',
      `cannot resolve repository-local exclude file: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  const reported = result.stdout.trim();
  const file = path.isAbsolute(reported) ? reported : path.resolve(rootDir, reported);
  let stat = null;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new GitBootstrapError(
      'GITEXCLUDE_UNSAFE',
      `refusing to update non-regular repository-local exclude file: ${file}`,
    );
  }
  const existed = stat !== null;
  const before = existed ? fs.readFileSync(file, 'utf8') : null;
  if (runtimeIsIgnored(rootDir)) {
    return { changed: false, path: file, rollback: { existed, before } };
  }
  const managedPattern = repositoryLocalRuntimePattern(rootDir, repository);
  const compatibilityPatterns = repositoryLocalCompatibilityPatterns(rootDir, repository);
  const preserved = (before || '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '# Ultra Builder Pro local runtime')
    .filter((line) => line.trim() !== ULTRA_RUNTIME_IGNORE_LINE)
    .filter((line) => line.trim() !== managedPattern)
    .filter((line) => !compatibilityPatterns.includes(line.trim()))
    .join('\n')
    .replace(/\n+$/u, '');
  const prefix = preserved ? `${preserved}\n` : '';
  const separator = prefix && !prefix.endsWith('\n\n') ? '\n' : '';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${prefix}${separator}# Ultra Builder Pro local runtime\n`
      + `${managedPattern}\n${compatibilityPatterns.join('\n')}\n`,
  );
  return { changed: true, path: file, rollback: { existed, before } };
}

function rollbackFileMutation(mutation) {
  if (!mutation?.changed) return [];
  try {
    if (mutation.rollback.existed) {
      fs.writeFileSync(mutation.path, mutation.rollback.before);
    } else {
      fs.rmSync(mutation.path, { force: true });
    }
    return [];
  } catch (error) {
    return [`${mutation.path}: ${error.message}`];
  }
}

function ensureUltraRuntimeIgnored(rootDir) {
  const file = path.join(rootDir, '.gitignore');
  let stat = null;
  try { stat = fs.lstatSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const existed = stat !== null;
  if (stat) {
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new GitBootstrapError(
        'GITIGNORE_UNSAFE',
        `refusing to update non-regular root .gitignore: ${file}`,
      );
    }
  }
  const before = existed ? fs.readFileSync(file, 'utf8') : null;
  if (effectiveUltraStorageBoundary(rootDir)) {
    return {
      changed: false,
      path: file,
      rollback: { existed, before },
    };
  }
  const preserved = (before || '')
    .split(/\r?\n/)
    .filter((line) => !LEGACY_BROAD_IGNORE_LINES.has(line.trim()))
    .filter((line) => ![
      ULTRA_RUNTIME_IGNORE_LINE,
      `/${ULTRA_RUNTIME_IGNORE_LINE}`,
      `${ULTRA_RUNTIME_IGNORE_LINE}/`,
      `/${ULTRA_RUNTIME_IGNORE_LINE}/`,
      ULTRA_UNIGNORE_DIR_LINE,
      ULTRA_UNIGNORE_CONTENT_LINE,
      ...ULTRA_LEGACY_STATE_IGNORE_LINES,
    ].includes(line.trim()))
    .join('\n')
    .replace(/\n+$/u, '');
  const prefix = preserved ? `${preserved}\n` : '';
  const separator = prefix && !prefix.endsWith('\n\n') ? '\n' : '';
  const next = `${prefix}${separator}`
    + '# Ultra Builder Pro semantic artifacts are trackable; runtime state is local\n'
    + `${ULTRA_UNIGNORE_DIR_LINE}\n`
    + `${ULTRA_UNIGNORE_CONTENT_LINE}\n`
    + `${ULTRA_RUNTIME_IGNORE_LINE}\n`
    + `${ULTRA_LEGACY_STATE_IGNORE_LINES.join('\n')}\n`;
  fs.writeFileSync(file, next);
  return {
    changed: true,
    path: file,
    rollback: { existed, before },
  };
}

function assertUltraStorageBoundary(rootDir) {
  if (effectiveUltraStorageBoundary(rootDir)) return;
  throw new GitBootstrapError(
    'GITIGNORE_INEFFECTIVE',
    'Git rules must ignore .ultra/.runtime while keeping semantic .ultra artifacts trackable',
  );
}

function ensureExistingProjectStorageBoundary(rootDir) {
  const repository = inspectGitRepository(rootDir);
  if (!repository.present) {
    return {
      status: 'not_a_repository',
      repository,
      gitignore_changed: false,
      gitignore_path: null,
    };
  }
  let gitignore;
  let localExclude;
  try {
    if (effectiveUltraStorageBoundary(rootDir)) {
      return {
        status: 'ready',
        repository,
        gitignore_changed: false,
        gitignore_path: null,
        local_exclude_changed: false,
        local_exclude_path: null,
      };
    }
    if (semanticArtifactsAreTrackable(rootDir)) {
      localExclude = ensureLocalRuntimeIgnored(rootDir, repository);
      if (!effectiveUltraStorageBoundary(rootDir)) {
        rollbackFileMutation(localExclude);
        localExclude = null;
        gitignore = ensureUltraRuntimeIgnored(rootDir);
      }
    } else {
      gitignore = ensureUltraRuntimeIgnored(rootDir);
    }
    assertUltraStorageBoundary(rootDir);
    return {
      status: 'ready',
      repository,
      gitignore_changed: Boolean(gitignore?.changed),
      gitignore_path: gitignore?.path || null,
      local_exclude_changed: Boolean(localExclude?.changed),
      local_exclude_path: localExclude?.path || null,
    };
  } catch (error) {
    rollbackFileMutation(localExclude);
    rollbackGitBootstrap(rootDir, { created_repository: false, gitignore });
    throw error;
  }
}

function rollbackGitBootstrap(rootDir, internal) {
  const errors = [];
  if (!internal) return errors;
  const gitignore = internal.gitignore;
  if (gitignore?.changed) {
    try {
      if (gitignore.rollback.existed) {
        fs.writeFileSync(gitignore.path, gitignore.rollback.before);
      } else {
        fs.rmSync(gitignore.path, { force: true });
      }
    } catch (error) {
      errors.push(`gitignore restore failed: ${error.message}`);
    }
  }
  if (internal.created_repository) {
    try {
      fs.rmSync(path.join(rootDir, '.git'), { recursive: true, force: true });
    } catch (error) {
      errors.push(`git repository rollback failed: ${error.message}`);
    }
  }
  return errors;
}

function bootstrapGit(rootDir, { mode = 'auto' } = {}) {
  if (!GIT_MODES.has(mode)) {
    throw new GitBootstrapError(
      'VALIDATION_ERROR',
      `git_mode must be one of: ${[...GIT_MODES].join(', ')}`,
    );
  }
  const before = inspectGitRepository(rootDir);
  if (!before.present && mode === 'skip') {
    return {
      result: {
        requested_mode: mode,
        status: 'skipped',
        repository_root: null,
        branch: null,
        head: null,
        gitignore_path: null,
        gitignore_changed: false,
        initial_commit_required: false,
      },
      internal: null,
    };
  }

  const internal = {
    created_repository: false,
    gitignore: null,
  };
  try {
    if (!before.present) {
      initializeRepository(rootDir);
      internal.created_repository = true;
    }
    internal.gitignore = ensureUltraRuntimeIgnored(rootDir);
    assertUltraStorageBoundary(rootDir);
    const after = inspectGitRepository(rootDir);
    if (!after.present) {
      throw new GitBootstrapError(
        'GIT_INIT_FAILED',
        'git initialization completed without a discoverable repository',
      );
    }
    return {
      result: {
        requested_mode: mode,
        status: internal.created_repository ? 'initialized' : 'existing',
        repository_root: after.repository_root,
        branch: after.branch,
        head: after.head,
        gitignore_path: path.relative(rootDir, internal.gitignore.path) || '.gitignore',
        gitignore_changed: internal.gitignore.changed,
        initial_commit_required: after.head === null,
      },
      internal,
    };
  } catch (error) {
    rollbackGitBootstrap(rootDir, internal);
    if (error instanceof GitBootstrapError) throw error;
    throw new GitBootstrapError(
      'GIT_INIT_FAILED',
      `Git bootstrap failed: ${error.message}`,
      { cause: error },
    );
  }
}

module.exports = {
  GitBootstrapError,
  GIT_MODES,
  ULTRA_GIT_ARTIFACT_CLASSES,
  ULTRA_RUNTIME_PROBES,
  ULTRA_SEMANTIC_PROBES,
  bootstrapGit,
  assertUltraStorageBoundary,
  effectiveUltraStorageBoundary,
  ensureExistingProjectStorageBoundary,
  inspectGitRepository,
  rollbackGitBootstrap,
};
