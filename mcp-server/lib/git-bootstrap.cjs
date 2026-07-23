'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GIT_MODES = new Set(['auto', 'initialize', 'skip']);
// No trailing slash: isolated session worktrees expose `.ultra` as a symlink
// to the central authority, and Git's directory-only pattern does not ignore
// that symlink reliably.
const ULTRA_IGNORE_LINE = '.ultra';

class GitBootstrapError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message);
    this.name = 'GitBootstrapError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function runGit(rootDir, args) {
  return spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitValue(rootDir, args) {
  const result = runGit(rootDir, args);
  return result.status === 0 ? result.stdout.trim() : null;
}

function inspectGitRepository(rootDir) {
  const repositoryRoot = gitValue(rootDir, ['rev-parse', '--show-toplevel']);
  if (!repositoryRoot) {
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
    branch: gitValue(rootDir, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
      || gitValue(rootDir, ['branch', '--show-current']),
    head: gitValue(rootDir, ['rev-parse', '--verify', 'HEAD']),
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

function containsUltraIgnore(contents, { requireSymlinkSafe = false } = {}) {
  const accepted = requireSymlinkSafe
    ? ['.ultra', '/.ultra']
    : ['.ultra', '.ultra/', '/.ultra', '/.ultra/'];
  return contents.split(/\r?\n/).some((line) => {
    const value = line.trim();
    return accepted.includes(value);
  });
}

function effectiveUltraIgnore(rootDir) {
  return runGit(rootDir, ['check-ignore', '--quiet', '--no-index', '--', '.ultra']).status === 0;
}

function ensureUltraIgnored(rootDir, { requireSymlinkSafe = false } = {}) {
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
  if (!requireSymlinkSafe && effectiveUltraIgnore(rootDir)) {
    return {
      changed: false,
      path: file,
      rollback: { existed, before },
    };
  }
  if (before !== null && containsUltraIgnore(before, { requireSymlinkSafe })) {
    return {
      changed: false,
      path: file,
      rollback: { existed, before },
    };
  }
  const prefix = before && !before.endsWith('\n') ? `${before}\n` : (before || '');
  const separator = prefix && !prefix.endsWith('\n\n') ? '\n' : '';
  const next = `${prefix}${separator}# Ultra Builder Pro local authority\n${ULTRA_IGNORE_LINE}\n`;
  fs.writeFileSync(file, next);
  return {
    changed: true,
    path: file,
    rollback: { existed, before },
  };
}

function assertUltraIgnored(rootDir) {
  const result = runGit(rootDir, ['check-ignore', '--quiet', '--no-index', '--', '.ultra']);
  if (result.status === 0) return;
  const detail = result.status === 1
    ? 'the effective Git rules re-include .ultra'
    : (result.stderr || result.stdout || 'Git could not evaluate the rule').trim();
  throw new GitBootstrapError(
    'GITIGNORE_INEFFECTIVE',
    `Ultra authority is not ignored by Git: ${detail}`,
  );
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
    internal.gitignore = ensureUltraIgnored(rootDir, {
      // A repository created in this call has no tracked baseline to preserve,
      // so its ignore rule can be made safe for the session authority symlink.
      requireSymlinkSafe: internal.created_repository,
    });
    assertUltraIgnored(rootDir);
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
  bootstrapGit,
  inspectGitRepository,
  rollbackGitBootstrap,
};
