'use strict';

// Phase 8B.3 — N-concurrent git worktree registry.
//
// Wraps session-runner's single-session gitWorktreeAdd/Remove with:
//   • allocate({repoRoot, sid, baseRef})  — create .ultra/.runtime/worktrees/<sid>
//   • release({repoRoot, worktree_path})  — remove one
//   • listActive(repoRoot)                — scan git + filter our domain
//   • releaseAll(repoRoot)                — batch cleanup (crash recovery)
//
// Node single-thread execFileSync naturally serializes git calls, so
// `.git/config.lock` contention is a non-issue within one process. If the
// parallel orchestrator (8B.2) ever switches to async git spawning, an
// async mutex can be layered here without changing the API.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

const runtimePaths = require('../mcp-server/lib/runtime-paths.cjs');
const gitBootstrap = require('../mcp-server/lib/git-bootstrap.cjs');
const { SessionRunnerError, _internal } = require('./session-runner.cjs');

const WORKTREE_DOMAIN = path.join(runtimePaths.RUNTIME_RELATIVE_DIR, 'worktrees');

function worktreePath(repoRoot, sid) {
  _internal.assertSessionId(sid);
  return _internal.assertManagedWorktreePath(
    repoRoot,
    path.join(repoRoot, WORKTREE_DOMAIN, sid),
    { sid },
  );
}

function allocate({ repoRoot, sid, baseRef = 'HEAD' }) {
  if (!repoRoot) throw new Error('allocate: repoRoot required');
  if (!sid) throw new Error('allocate: sid required');
  const authority = runtimePaths.ensureRuntimeState(repoRoot, {
    admitStorageBoundary: () => gitBootstrap.ensureExistingProjectStorageBoundary(repoRoot),
  });
  const wt = worktreePath(repoRoot, sid);
  _internal.gitWorktreeAdd(repoRoot, wt, baseRef); // throws WORKTREE_FAILED
  try {
    _internal.linkAuthorityIntoWorktree(repoRoot, wt, { authority });
    return { worktree_path: wt, authority_db_path: authority.stateDbPath };
  } catch (error) {
    try { fs.rmSync(path.join(wt, '.ultra', '.runtime'), { force: true }); }
    catch { /* best effort */ }
    try { _internal.gitWorktreeRemove(repoRoot, wt); }
    catch { /* original authority error is more actionable */ }
    throw error;
  }
}

function sessionRemovalBlocker(repoRoot, sid, worktreePath) {
  const dbPath = runtimePaths.pathsFor(repoRoot).stateDbPath;
  if (!fs.existsSync(dbPath)) return null;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(
      'SELECT sid, status, worktree_path FROM sessions WHERE sid = ?',
    ).all(sid);
    for (const row of rows) {
      let recorded;
      let requested;
      try { recorded = fs.realpathSync(row.worktree_path); }
      catch { recorded = path.resolve(row.worktree_path); }
      try { requested = fs.realpathSync(worktreePath); }
      catch { requested = path.resolve(worktreePath); }
      if (recorded !== requested) {
        return `session ${sid} is bound to a different worktree`;
      }
      if (!['completed', 'crashed'].includes(row.status)) {
        return `session ${sid} is nonterminal (${row.status})`;
      }
    }
    return null;
  } finally {
    db.close();
  }
}

function release({ repoRoot, worktree_path, sid = null }) {
  if (!repoRoot) throw new Error('release: repoRoot required');
  if (!worktree_path) throw new Error('release: worktree_path required');
  const expectedSid = sid === null ? path.basename(worktree_path) : sid;
  _internal.assertSessionId(expectedSid);
  const managedPath = _internal.assertManagedWorktreePath(
    repoRoot, worktree_path, { sid: expectedSid },
  );
  const sessionBlocker = sessionRemovalBlocker(
    repoRoot, expectedSid, managedPath,
  );
  const integrationBlocker = _internal.worktreeRemovalBlocker(repoRoot, managedPath);
  const blocker = sessionBlocker || integrationBlocker;
  if (blocker) {
    throw new SessionRunnerError(
      'WORKTREE_NOT_INTEGRATED',
      `refusing to remove ${managedPath}: ${blocker}`,
    );
  }
  _internal.gitWorktreeRemove(repoRoot, managedPath);
}

function parsePorcelain(text) {
  const entries = [];
  let current = {};
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('worktree ')) {
      if (current.worktree) entries.push(current);
      current = { worktree: line.slice('worktree '.length) };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === '' && current.worktree) {
      entries.push(current);
      current = {};
    }
  }
  if (current.worktree) entries.push(current);
  return entries;
}

function gitDiscoveryError(message, cause) {
  return new SessionRunnerError(
    'WORKTREE_DISCOVERY_FAILED',
    `cannot inspect Git worktrees safely: ${message}`,
    { cause },
  );
}

function hasGitMetadata(repoRoot) {
  let current = path.resolve(repoRoot);
  while (true) {
    if (fs.lstatSync(path.join(current, '.git'), { throwIfNoEntry: false })) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function runGitText(repoRoot, args, execGit) {
  const value = execGit('git', args, {
    cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  });
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
    throw gitDiscoveryError(`Git returned no output for ${args.join(' ')}`);
  }
  return String(value);
}

function listActive(repoRoot, { execGit = execFileSync } = {}) {
  const metadataPresent = hasGitMetadata(repoRoot);
  let inside;
  try {
    inside = runGitText(repoRoot, ['rev-parse', '--is-inside-work-tree'], execGit).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error);
    if (!metadataPresent && /not a git repository/i.test(detail)) return [];
    if (error instanceof SessionRunnerError) throw error;
    throw gitDiscoveryError(detail.trim(), error);
  }
  if (inside !== 'true') {
    if (!metadataPresent && inside === 'false') return [];
    throw gitDiscoveryError(`unexpected repository probe result: ${inside || '(empty)'}`);
  }

  let out;
  try {
    out = runGitText(repoRoot, ['worktree', 'list', '--porcelain'], execGit);
  } catch (err) {
    if (err instanceof SessionRunnerError) throw err;
    throw gitDiscoveryError(String(err?.stderr || err?.message || err).trim(), err);
  }
  const rawDomainRoot = _internal.assertManagedWorktreeRoot(repoRoot);
  // On macOS tmpdir is a symlink (/var → /private/var); git returns realpath.
  // Canonicalize both sides so prefix matching is robust.
  const domainRoot = (fs.existsSync(rawDomainRoot)
    ? fs.realpathSync(rawDomainRoot)
    : rawDomainRoot) + path.sep;
  const active = [];
  for (const entry of parsePorcelain(out)) {
    if (!entry.worktree) continue;
    const physical = fs.existsSync(entry.worktree)
      ? fs.realpathSync(entry.worktree)
      : path.resolve(entry.worktree);
    if (!(physical + path.sep).startsWith(domainRoot)) continue;
    const sid = path.basename(entry.worktree);
    const canonical = _internal.assertManagedWorktreePath(
      repoRoot, entry.worktree, { sid },
    );
    active.push({
      sid,
      worktree_path: canonical,
      head: entry.head || null,
      branch: entry.branch || null,
      detached: !!entry.detached,
    });
  }
  return active;
}

function releaseAll(repoRoot, options = {}) {
  const active = listActive(repoRoot, options);
  const releaseWorktree = options.releaseWorktree || release;
  let cleaned = 0;
  const protectedSids = new Set();
  const preserved = [];
  const quarantined = [];
  for (const entry of active) {
    try {
      releaseWorktree({
        repoRoot,
        worktree_path: entry.worktree_path,
        sid: entry.sid,
      });
      cleaned += 1;
    } catch (err) {
      protectedSids.add(entry.sid);
      preserved.push({
        sid: entry.sid,
        worktree_path: entry.worktree_path,
        reason: err.message,
      });
      // Best-effort: one bad worktree shouldn't stop the sweep.
      process.stderr.write(`worktree-manager: release(${entry.sid}) failed: ${err.message}\n`);
    }
  }
  // Filesystem entries Git no longer owns are recovery evidence, not trash.
  // Move real managed children atomically into quarantine and report the path.
  const domainRoot = path.join(repoRoot, WORKTREE_DOMAIN);
  if (fs.existsSync(domainRoot)) {
    for (const name of fs.readdirSync(domainRoot)) {
      const full = path.join(domainRoot, name);
      try {
        if (protectedSids.has(name)) continue;
        _internal.assertSessionId(name);
        const managedPath = _internal.assertManagedWorktreePath(
          repoRoot, full, { sid: name },
        );
        const recoveryRoot = path.join(
          runtimePaths.pathsFor(repoRoot).runtimeDir,
          'recovery',
          'worktrees',
        );
        fs.mkdirSync(recoveryRoot, { recursive: true });
        const token = new Date().toISOString().replace(/[:.]/g, '-');
        let recoveryPath = path.join(recoveryRoot, `${token}-${name}`);
        let attempt = 0;
        while (fs.lstatSync(recoveryPath, { throwIfNoEntry: false })) {
          attempt += 1;
          recoveryPath = path.join(recoveryRoot, `${token}-${name}-${attempt}`);
        }
        fs.renameSync(managedPath, recoveryPath);
        quarantined.push({
          sid: name,
          source_path: managedPath,
          recovery_path: recoveryPath,
        });
      }
      catch (err) {
        preserved.push({ sid: name, worktree_path: full, reason: err.message });
        process.stderr.write(`worktree-manager: orphan sweep failed for ${full}: ${err.message}\n`);
      }
    }
  }
  return { cleaned, preserved, quarantined };
}

module.exports = {
  allocate,
  release,
  listActive,
  releaseAll,
  worktreePath,
  WORKTREE_DOMAIN,
};
