'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');
const runner = require('../session-runner.cjs');
const recovery = require('../recovery.cjs');

// Short-lived child: keep the process alive until killed.
const LONG_SLEEP_CMD = process.execPath;
const LONG_SLEEP_ARGS = ['-e', 'setInterval(() => {}, 60000);'];

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-runner-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@ubp.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'ubp-test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  fs.mkdirSync(path.join(dir, '.ultra', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ultra', 'specs', 'product.md'), '# Product baseline\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ultra/.runtime\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return dir;
}

function mkDb(repoRoot) {
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  return { db, dbPath };
}

function seedTask(db, id = 't-1') {
  ops.createTask(db, { id, title: 'runner target', type: 'feature', priority: 'P1' });
  return id;
}

test('session close CAS conflicts remain expected recoverable execution gates', () => {
  assert.equal(
    runner.isExpectedExecutionGate({ code: 'SESSION_CLOSE_CONFLICT' }),
    true,
  );
  assert.equal(
    runner.isExpectedExecutionGate({ code: 'SESSION_CLOSE_JOURNAL_CONFLICT' }),
    true,
  );
});

function seedChangeTask(db, id = 'change-task') {
  const changeId = `${id}-change`;
  db.prepare(
    `INSERT INTO changes (id, title, kind, status, intent, artifact_root)
     VALUES (?, ?, 'standard', 'active', ?, ?)`,
  ).run(
    changeId,
    `Change for ${id}`,
    'Exercise the approved execution path.',
    `.ultra/changes/active/${changeId}`,
  );
  ops.createTask(db, {
    id,
    title: 'change-owned runner target',
    type: 'feature',
    priority: 'P1',
    change_id: changeId,
    outcome: 'The task executes in one mechanically isolated worktree.',
    slice_kind: 'tracer_bullet',
    public_seam: 'session worktree',
    verification_command: 'node --test orchestrator/tests/session-runner.test.cjs',
    acceptance: [{
      id: 'session-ready',
      criterion: 'A session lease does not fabricate semantic Plan approval.',
      verification: 'node --test orchestrator/tests/session-runner.test.cjs',
    }],
    context_refs: [{ ref: 'spec/mcp-tools.yaml', reason: 'Session contract.', required: true }],
    docs_impact: { status: 'none', files: [], rationale: 'No user-facing documentation.' },
    ownership: { owner: 'test-owner', reviewers: [] },
    trace_to: 'spec/mcp-tools.yaml#session-family',
  });
  return { id, changeId };
}

function cleanup(repoRoot, db) {
  try { closeStateDb(db); } catch (_) { /* ignore */ }
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (_) { return false; }
}

async function waitForPath(candidate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(candidate)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${candidate}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('spawnSession creates worktree, child process, and sessions row', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-1');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-1', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.match(handle.sid, /^sess-/);
    assert.ok(fs.existsSync(handle.worktree_path));
    assert.ok(fs.existsSync(handle.artifact_dir));
    assert.ok(handle.pid);
    assert.ok(isProcessAlive(handle.pid));

    const row = ops.readSession(db, handle.sid);
    assert.equal(row.task_id, 'r-1');
    assert.equal(row.status, 'running');
    assert.equal(row.pid, handle.pid);
  } finally {
    if (handle && handle.pid) { try { process.kill(handle.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('spawnSession gives an automated worker one central Ultra authority', async () => {
  const repoRoot = mkRepo();
  const { db, dbPath } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-authority');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-authority', runtime: 'codex',
      command: process.execPath,
      args: ['-e', `
        const fs = require('node:fs');
        const path = require('node:path');
        fs.writeFileSync(
          path.join(process.env.UBP_ARTIFACT_DIR, 'worker-env.json'),
          JSON.stringify({
            db: process.env.UBP_DB_PATH,
            root: process.env.UBP_ROOT_DIR,
            authority: process.env.UBP_AUTHORITY_ROOT,
            task: process.env.UBP_TASK_ID
          })
        );
      `],
      env: {
        UBP_DB_PATH: '/tmp/forged-state.db',
        UBP_ROOT_DIR: '/tmp/forged-root',
        UBP_AUTHORITY_ROOT: '/tmp/forged-authority',
        UBP_TASK_ID: 'forged-task',
      },
    });
    await new Promise((resolve, reject) => {
      if (handle.process.exitCode !== null) {
        resolve();
        return;
      }
      handle.process.once('exit', (code) => (
        code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))
      ));
      handle.process.once('error', reject);
    });

    const authorityRoot = path.join(handle.worktree_path, '.ultra');
    const runtimeLink = path.join(authorityRoot, '.runtime');
    assert.equal(fs.lstatSync(authorityRoot).isDirectory(), true);
    assert.equal(fs.lstatSync(runtimeLink).isSymbolicLink(), true);
    assert.equal(
      fs.readFileSync(path.join(authorityRoot, 'specs', 'product.md'), 'utf8'),
      '# Product baseline\n',
    );
    assert.equal(
      fs.realpathSync(path.join(runtimeLink, 'state.db')),
      fs.realpathSync(dbPath),
    );
    assert.equal(
      execFileSync('git', ['status', '--porcelain=v1'], {
        cwd: handle.worktree_path,
        encoding: 'utf8',
      }).trim(),
      '',
      'the authority link must never become a task change',
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(handle.artifact_dir, 'worker-env.json'), 'utf8')),
      {
        db: dbPath,
        root: handle.worktree_path,
        authority: repoRoot,
        task: 'r-authority',
      },
    );
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession protects the authority link locally without changing tracked files', () => {
  const repoRoot = mkRepo();
  execFileSync('git', ['rm', '-q', '.gitignore'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-q', '-m', 'remove Ultra ignore'], { cwd: repoRoot });
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-unignored-authority');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-unignored-authority', runtime: 'codex',
    });
    assert.equal(fs.lstatSync(path.join(handle.worktree_path, '.ultra')).isDirectory(), true);
    assert.equal(
      fs.lstatSync(path.join(handle.worktree_path, '.ultra', '.runtime')).isSymbolicLink(),
      true,
    );
    assert.equal(execFileSync('git', ['status', '--porcelain=v1'], {
      cwd: handle.worktree_path,
      encoding: 'utf8',
    }).trim(), '');
    assert.equal(fs.existsSync(path.join(repoRoot, '.gitignore')), false);
    const excludePath = execFileSync('git', ['rev-parse', '--git-path', 'info/exclude'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    assert.match(
      fs.readFileSync(path.resolve(repoRoot, excludePath), 'utf8'),
      /^\/\.ultra\/\.runtime$/m,
    );
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession blocks when the selected HEAD still broad-ignores semantic Ultra artifacts', () => {
  const repoRoot = mkRepo();
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.ultra/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-q', '-m', 'legacy broad ignore'], { cwd: repoRoot });
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-stale-storage-boundary');
    assert.throws(
      () => runner.spawnSession({
        db, repoRoot,
        task_id: 'r-stale-storage-boundary', runtime: 'codex',
      }),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_STORAGE_BOUNDARY_STALE',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.deepEqual(
      execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).split(/\r?\n/).filter((line) => line.startsWith('worktree ')).length,
      1,
    );
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession rejects an unsafe local exclude path without modifying its target', () => {
  const repoRoot = mkRepo();
  execFileSync('git', ['rm', '-q', '.gitignore'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-q', '-m', 'remove Ultra ignore'], { cwd: repoRoot });
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-exclude-target-'));
  const outsideTarget = path.join(outsideDir, 'sentinel');
  const sentinel = 'do not modify\n';
  fs.writeFileSync(outsideTarget, sentinel);
  const excludePath = path.join(repoRoot, '.git', 'info', 'exclude');
  fs.rmSync(excludePath, { force: true });
  fs.symlinkSync(outsideTarget, excludePath);
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-unsafe-exclude');
    assert.throws(
      () => runner.spawnSession({
        db, repoRoot,
        task_id: 'r-unsafe-exclude', runtime: 'codex',
      }),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_AUTHORITY_NOT_IGNORED',
    );
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), sentinel);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).split('\n').filter((line) => line.startsWith('worktree '));
    assert.equal(worktrees.length, 1, 'the provisional worktree must be removed');
  } finally {
    cleanup(repoRoot, db);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('spawnSession does not turn a missing semantic Plan into a mechanical lease gate', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    const task = seedChangeTask(db, 'r-unapproved');
    const handle = runner.spawnSession({
      db, repoRoot,
      task_id: task.id, runtime: 'claude',
    });
    assert.equal(ops.readSession(db, handle.sid).task_id, task.id);
    assert.ok(fs.existsSync(handle.worktree_path));
  } finally {
    cleanup(repoRoot, db);
  }
});

test('closeSession kills child, releases the lease, and preserves the worktree by default', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-close');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-close', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    const wt = handle.worktree_path;
    const result = runner.closeSession(
      { db, repoRoot, sid: handle.sid },
      { status: 'completed', kill_signal: 'SIGKILL' },
    );

    const row = ops.readSession(db, handle.sid);
    assert.equal(row.status, 'completed');
    // give the kernel a tick to reap the SIGKILL
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!isProcessAlive(handle.pid), `pid ${handle.pid} should be dead`);
    assert.ok(fs.existsSync(wt));
    assert.equal(result.worktree_preserved, true);
  } finally {
    cleanup(repoRoot, db);
  }
});

test('closeSession waits for delayed SIGTERM shutdown before publishing terminal state', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-delayed-close');
    const ready = path.join(repoRoot, '.ultra', '.runtime', 'delayed-close-ready');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'r-delayed-close',
      runtime: 'codex',
      command: process.execPath,
      args: [
        '-e',
        [
          "const fs = require('node:fs');",
          'const Database = require(process.argv[1]);',
          'const db = new Database(process.env.UBP_DB_PATH);',
          'process.on("SIGTERM", () => {',
          '  setTimeout(() => {',
          "    db.prepare(\"INSERT INTO events(type, session_id, payload_json) VALUES ('worker-shutdown-proof', ?, '{}')\").run(process.env.UBP_SESSION_ID);",
          '    db.close();',
          '    process.exit(0);',
          '  }, 200);',
          '});',
          "fs.writeFileSync(process.argv[2], 'ready');",
          'setInterval(() => {}, 60000);',
        ].join('\n'),
        require.resolve('better-sqlite3'),
        ready,
      ],
    });
    await waitForPath(ready);
    const started = Date.now();
    runner.closeSession(
      { db, repoRoot, sid: handle.sid },
      { status: 'completed', kill_timeout_ms: 2000, kill_poll_ms: 10 },
    );
    assert.ok(Date.now() - started >= 150);
    assert.equal(ops.readSession(db, handle.sid).status, 'completed');
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE type = 'worker-shutdown-proof' AND session_id = ?",
      ).get(handle.sid).count,
      1,
    );
    const terminalEventCount = db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, terminalEventCount);
  } finally {
    if (handle?.pid && isProcessAlive(handle.pid)) {
      try { process.kill(handle.pid, 'SIGKILL'); } catch { /* best effort */ }
      if (handle.process?.exitCode === null) {
        await new Promise((resolve) => handle.process.once('exit', resolve));
      }
    }
    cleanup(repoRoot, db);
  }
});

test('terminal close never signals a reused PID and reconciles its journal idempotently', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  const realKill = process.kill;
  let handle;
  const signals = [];
  try {
    seedTask(db, 'r-terminal-idempotent');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'r-terminal-idempotent',
      runtime: 'codex',
    });
    runner._internal.closeJournal.prepare(repoRoot, {
      sid: handle.sid,
      task_id: 'r-terminal-idempotent',
      requested_status: 'completed',
      worktree_path: handle.worktree_path,
    });
    // Model a legacy terminal row whose uncleared PID now belongs to an
    // unrelated process.
    db.prepare("UPDATE sessions SET status = 'completed', pid = ? WHERE sid = ?")
      .run(process.pid, handle.sid);
    process.kill = (pid, signal) => {
      signals.push({ pid, signal });
      throw new Error('terminal close attempted to signal a reused PID');
    };

    const first = runner.closeSession(
      { db, repoRoot, sid: handle.sid },
      { status: 'completed' },
    );
    assert.equal(first.worktree_preserved, false);
    assert.equal(fs.existsSync(handle.worktree_path), false);
    assert.equal(runner._internal.closeJournal.read(repoRoot, handle.sid), null);
    assert.equal(ops.readSession(db, handle.sid).pid, null);

    const second = runner.closeSession(
      { db, repoRoot, sid: handle.sid },
      { status: 'completed' },
    );
    assert.equal(second.worktree_preserved, false);
    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'crashed' },
      ),
      (error) => error?.code === 'SESSION_TERMINAL_CONFLICT',
    );
    assert.deepEqual(signals, []);
  } finally {
    process.kill = realKill;
    cleanup(repoRoot, db);
  }
});

test('closeSession cannot overwrite a terminal result committed after its initial read', () => {
  const repoRoot = mkRepo();
  const { db, dbPath } = mkDb(repoRoot);
  const competingDb = require('../../mcp-server/lib/state-db.cjs').openStateDb(dbPath);
  const originalReadSession = ops.readSession;
  let handle;
  let injected = false;
  try {
    seedTask(db, 'r-terminal-cas');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'r-terminal-cas',
      runtime: 'codex',
    });
    ops.readSession = (candidateDb, sid) => {
      const row = originalReadSession(candidateDb, sid);
      if (!injected && candidateDb === db && sid === handle.sid) {
        injected = true;
        ops.updateSession(competingDb, sid, { status: 'crashed' });
      }
      return row;
    };

    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'completed' },
      ),
      (error) => error?.code === 'SESSION_TERMINAL_CONFLICT',
    );
    assert.equal(originalReadSession(db, handle.sid).status, 'crashed');
    assert.equal(
      db.prepare(
        `SELECT COUNT(*) AS count FROM events
         WHERE session_id = ?
           AND type IN ('session_closed', 'session_crashed')`,
      ).get(handle.sid).count,
      1,
    );
  } finally {
    ops.readSession = originalReadSession;
    competingDb.close();
    cleanup(repoRoot, db);
  }
});

test('closeSession fails closed when a worker ignores the termination signal', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-stubborn-close');
    const ready = path.join(repoRoot, '.ultra', '.runtime', 'stubborn-close-ready');
    handle = runner.spawnSession({
      db,
      repoRoot,
      task_id: 'r-stubborn-close',
      runtime: 'codex',
      command: process.execPath,
      args: [
        '-e',
        [
          "const fs = require('node:fs');",
          'process.on("SIGTERM", () => {});',
          "fs.writeFileSync(process.argv[1], 'ready');",
          'setInterval(() => {}, 60000);',
        ].join('\n'),
        ready,
      ],
    });
    await waitForPath(ready);

    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        {
          status: 'crashed',
          remove_worktree: true,
          kill_timeout_ms: 100,
          kill_poll_ms: 10,
        },
      ),
      (error) => error?.code === 'SESSION_TERMINATION_TIMEOUT',
    );
    assert.equal(ops.readSession(db, handle.sid).status, 'running');
    assert.equal(fs.existsSync(handle.worktree_path), true);
    assert.equal(
      runner._internal.closeJournal.read(repoRoot, handle.sid).phase,
      'worker_running',
    );
  } finally {
    if (handle?.pid && isProcessAlive(handle.pid)) {
      try { process.kill(handle.pid, 'SIGKILL'); } catch { /* best effort */ }
      if (handle.process?.exitCode === null) {
        await new Promise((resolve) => handle.process.once('exit', resolve));
      }
    }
    cleanup(repoRoot, db);
  }
});

test('closeSession rejects a nonterminal requested outcome before changing the lease', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-close-running');
    const handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-close-running', runtime: 'codex',
    });
    const before = ops.readSession(db, handle.sid);
    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'running', remove_worktree: true },
      ),
      (error) => error?.code === 'VALIDATION_ERROR',
    );
    assert.deepEqual(ops.readSession(db, handle.sid), before);
    assert.equal(fs.existsSync(handle.worktree_path), true);
  } finally {
    cleanup(repoRoot, db);
  }
});

test('closeSession refuses to remove uncommitted or unintegrated worktree changes', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-unsafe-remove');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-unsafe-remove', runtime: 'claude',
    });
    fs.writeFileSync(path.join(handle.worktree_path, 'uncommitted.txt'), 'preserve me\n');

    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'completed', remove_worktree: true },
      ),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_NOT_INTEGRATED',
    );
    assert.ok(fs.existsSync(handle.worktree_path));
    assert.equal(ops.readSession(db, handle.sid).status, 'running');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('closeSession journals removal before Git mutation and recovery resumes it', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-remove-failure');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-remove-failure', runtime: 'codex',
    });
    execFileSync('git', ['worktree', 'lock', handle.worktree_path], { cwd: repoRoot });
    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: handle.sid },
        { status: 'completed', remove_worktree: true },
      ),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_FAILED',
    );
    assert.equal(ops.readSession(db, handle.sid).status, 'running');
    assert.equal(fs.existsSync(handle.worktree_path), true);
    const journal = path.join(
      repoRoot,
      '.ultra',
      '.runtime',
      'recovery',
      'session-close',
      `${handle.sid}.json`,
    );
    assert.equal(fs.existsSync(journal), true);
    assert.deepEqual(
      runner.admissionCheck(db, repoRoot, 'r-remove-failure'),
      {
        can_spawn: false,
        conflict: {
          sid: handle.sid,
          status: 'closing',
          heartbeat_age_ms: 0,
        },
        recommended_action: 'recover_close',
      },
    );
    assert.throws(
      () => runner.spawnSession({
        db,
        repoRoot,
        task_id: 'r-remove-failure',
        runtime: 'claude',
        takeover: true,
      }),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'SESSION_CLOSE_PENDING',
    );
    assert.equal(ops.readSession(db, handle.sid).status, 'running');
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      1,
    );

    execFileSync('git', ['worktree', 'unlock', handle.worktree_path], { cwd: repoRoot });
    const recovered = recovery.recoverOnBoot(db, { repoRoot });
    assert.ok(recovered.closed.some((entry) => entry.sid === handle.sid));
    assert.equal(ops.readSession(db, handle.sid).status, 'completed');
    assert.equal(fs.existsSync(handle.worktree_path), false);
    assert.equal(fs.existsSync(journal), false);
  } finally {
    if (handle?.worktree_path && fs.existsSync(handle.worktree_path)) {
      try { execFileSync('git', ['worktree', 'unlock', handle.worktree_path], { cwd: repoRoot }); }
      catch { /* best effort */ }
    }
    cleanup(repoRoot, db);
  }
});

test('closeSession rejects an externally forged worktree path without deleting it', () => {
  const repoRoot = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-session-external-'));
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-forged-path');
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'preserve');
    ops.createSession(db, {
      sid: 'sess-forged',
      task_id: 'r-forged-path',
      runtime: 'codex',
      worktree_path: outside,
      artifact_dir: path.join(
        repoRoot, '.ultra', '.runtime', 'sessions', 'sess-forged',
      ),
    });

    assert.throws(
      () => runner.closeSession(
        { db, repoRoot, sid: 'sess-forged' },
        { status: 'completed', remove_worktree: true },
      ),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_SCOPE_INVALID',
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
    assert.equal(ops.readSession(db, 'sess-forged').status, 'running');
  } finally {
    cleanup(repoRoot, db);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('closeSession requires its DB sid to name the exact managed direct child', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    const managed = path.join(repoRoot, '.ultra', '.runtime', 'worktrees');
    const fixtures = [
      {
        sid: 'sess-expected',
        worktree: path.join(managed, 'sess-other'),
      },
      {
        sid: 'sess-nested',
        worktree: path.join(managed, 'parent', 'sess-nested'),
      },
    ];
    for (const fixture of fixtures) {
      seedTask(db, `task-${fixture.sid}`);
      fs.mkdirSync(fixture.worktree, { recursive: true });
      const sentinel = path.join(fixture.worktree, 'sentinel');
      fs.writeFileSync(sentinel, 'preserve');
      ops.createSession(db, {
        sid: fixture.sid,
        task_id: `task-${fixture.sid}`,
        runtime: 'codex',
        worktree_path: fixture.worktree,
        artifact_dir: path.join(
          repoRoot, '.ultra', '.runtime', 'sessions', fixture.sid,
        ),
      });

      assert.throws(
        () => runner.closeSession(
          { db, repoRoot, sid: fixture.sid },
          { status: 'completed', remove_worktree: true },
        ),
        (error) => error instanceof runner.SessionRunnerError
          && error.code === 'WORKTREE_SCOPE_INVALID',
        fixture.sid,
      );
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve');
      assert.equal(ops.readSession(db, fixture.sid).status, 'running');
    }
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession refuses second session without takeover (ADMISSION_DENIED)', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let first;
  try {
    seedTask(db, 'r-adm');
    first = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-adm', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.throws(
      () => runner.spawnSession({
        db, repoRoot,
        task_id: 'r-adm', runtime: 'codex',
        command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
      }),
      (err) => err instanceof runner.SessionRunnerError && err.code === 'ADMISSION_DENIED',
    );
  } finally {
    if (first && first.pid) { try { process.kill(first.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('takeover=true terminates the owned process, crashes its lease, and spawns new one', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let first, second;
  try {
    seedTask(db, 'r-take');
    first = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-take', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    const firstExit = new Promise((resolve) => first.process.once('exit', resolve));
    second = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-take', runtime: 'codex',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
      takeover: true,
    });
    assert.notEqual(second.sid, first.sid);

    const firstRow = ops.readSession(db, first.sid);
    assert.equal(firstRow.status, 'crashed');
    const secondRow = ops.readSession(db, second.sid);
    assert.equal(secondRow.status, 'running');
    assert.equal(secondRow.runtime, 'codex');
    await Promise.race([
      firstExit,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('takeover did not terminate the prior worker')),
        1000,
      )),
    ]);
  } finally {
    for (const h of [first, second]) {
      if (h && h.pid) { try { process.kill(h.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    }
    cleanup(repoRoot, db);
  }
});

test('spawnSession rejects a worktree base outside the managed project boundary', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-scope');
    assert.throws(
      () => runner.spawnSession({
        db, repoRoot,
        task_id: 'r-scope', runtime: 'codex',
        worktree_base: path.join(os.tmpdir(), 'outside-ultra-worktrees'),
      }),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_SCOPE_INVALID',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally {
    cleanup(repoRoot, db);
  }
});

test('worktree base containment follows real paths and rejects an in-scope symlink escape', () => {
  const repoRoot = mkRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-worktree-escape-'));
  try {
    const managedBase = path.join(repoRoot, '.ultra', '.runtime', 'worktrees');
    fs.mkdirSync(managedBase, { recursive: true });
    const escape = path.join(managedBase, 'escape');
    fs.symlinkSync(outside, escape, 'dir');

    assert.throws(
      () => runner._internal.resolveWorktreeBase(repoRoot, escape),
      (error) => error instanceof runner.SessionRunnerError
        && error.code === 'WORKTREE_SCOPE_INVALID',
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('attachHeartbeat updates heartbeat_at while running', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-hb');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-hb', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    const stop = runner.attachHeartbeat(db, handle.sid, { intervalMs: 20 });
    await new Promise((r) => setTimeout(r, 80));
    stop();

    const row = ops.readSession(db, handle.sid);
    assert.ok(row.heartbeat_at, 'heartbeat_at should be populated');
    // lease extended beyond initial default of started_at + 1800s? compare against start
    assert.ok(Date.parse(row.heartbeat_at) > 0);
  } finally {
    if (handle && handle.pid) { try { process.kill(handle.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('kill -9 child: reapOrphanSessions marks orphan after heartbeat grace expires', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-orphan');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-orphan', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    // force lease + heartbeat into the past so reaper has something to grab
    ops.updateSession(db, handle.sid, {
      lease_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    process.kill(handle.pid, 'SIGKILL');

    const reaped = ops.reapOrphanSessions(db, { graceSeconds: 30 });
    assert.ok(reaped.reaped.includes(handle.sid));
    const row = ops.readSession(db, handle.sid);
    assert.equal(row.status, 'orphan');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('concurrent spawns on same task: only one succeeds (admission serialization)', async () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let winner;
  try {
    seedTask(db, 'r-race');

    const attempts = [0, 1, 2].map((i) =>
      Promise.resolve().then(() => {
        try {
          return runner.spawnSession({
            db, repoRoot,
            task_id: 'r-race', runtime: ['claude', 'opencode', 'codex'][i],
            command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
          });
        } catch (err) {
          return { error: err.code };
        }
      }),
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r && r.sid);
    const denied = results.filter((r) => r && r.error === 'ADMISSION_DENIED');
    assert.equal(winners.length, 1, `expected 1 winner, got ${winners.length}`);
    assert.equal(denied.length, 2, `expected 2 denied, got ${denied.length}`);
    winner = winners[0];
  } finally {
    if (winner && winner.pid) { try { process.kill(winner.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('spawnSession refuses tripped task (CIRCUIT_TRIPPED, takeover cannot override)', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  try {
    seedTask(db, 'r-cb');
    for (let i = 0; i < 3; i += 1) ops.recordTaskFailure(db, 'r-cb', { reason: 'test' });
    assert.equal(ops.isCircuitTripped(db, 'r-cb'), true);

    const attempt = (takeover) => runner.spawnSession({
      db, repoRoot,
      task_id: 'r-cb', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
      takeover,
    });
    assert.throws(() => attempt(false), (err) => err.code === 'CIRCUIT_TRIPPED');
    assert.throws(() => attempt(true), (err) => err.code === 'CIRCUIT_TRIPPED');
  } finally {
    cleanup(repoRoot, db);
  }
});

test('spawnSession works again after resetCircuitBreaker', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let handle;
  try {
    seedTask(db, 'r-cb-reset');
    for (let i = 0; i < 3; i += 1) ops.recordTaskFailure(db, 'r-cb-reset', { reason: 'test' });
    ops.resetCircuitBreaker(db, 'r-cb-reset');
    handle = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-cb-reset', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.ok(handle.sid);
  } finally {
    if (handle && handle.pid) { try { process.kill(handle.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    cleanup(repoRoot, db);
  }
});

test('two sessions on different tasks get independent worktrees', () => {
  const repoRoot = mkRepo();
  const { db } = mkDb(repoRoot);
  let a, b;
  try {
    seedTask(db, 'r-multi-a');
    seedTask(db, 'r-multi-b');
    a = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-multi-a', runtime: 'claude',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    b = runner.spawnSession({
      db, repoRoot,
      task_id: 'r-multi-b', runtime: 'codex',
      command: LONG_SLEEP_CMD, args: LONG_SLEEP_ARGS,
    });
    assert.notEqual(a.sid, b.sid);
    assert.notEqual(a.worktree_path, b.worktree_path);
    assert.notEqual(a.pid, b.pid);
    assert.ok(isProcessAlive(a.pid) && isProcessAlive(b.pid));
  } finally {
    for (const h of [a, b]) {
      if (h && h.pid) { try { process.kill(h.pid, 'SIGKILL'); } catch (_) { /* ignore */ } }
    }
    cleanup(repoRoot, db);
  }
});
