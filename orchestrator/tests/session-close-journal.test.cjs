'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  initStateDb,
  closeStateDb,
} = require('../../mcp-server/lib/state-db.cjs');
const journal = require('../session-close-journal.cjs');

function mkRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-close-journal-'));
  const dbPath = path.join(repoRoot, '.ultra', '.runtime', 'state.db');
  const { db } = initStateDb(dbPath);
  closeStateDb(db);
  return repoRoot;
}

function cleanup(...paths) {
  for (const candidate of paths) {
    try { fs.rmSync(candidate, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function intent(sid, overrides = {}) {
  return {
    sid,
    task_id: `task-${sid}`,
    requested_status: 'completed',
    worktree_path: path.join(os.tmpdir(), 'ubp-worktrees', sid),
    ...overrides,
  };
}

function runChild(script, args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(process.execPath, ['-e', script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('exit', (code, signal) => resolve({
      code,
      signal,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    }));
  });
}

function holdJournalLock(modulePath, repoRoot, sid) {
  const script = [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'const [modulePath, repoRoot, sid] = process.argv.slice(1);',
    'const journal = require(modulePath);',
    "const runtimeDir = path.join(repoRoot, '.ultra', '.runtime');",
    'const stat = fs.statSync(runtimeDir, { bigint: true });',
    'process.chdir(runtimeDir);',
    'journal._internal.enterPinnedJournalRoot({ dev: String(stat.dev), ino: String(stat.ino) });',
    'journal._internal.acquireUpdateLock(sid);',
    "process.stdout.write('locked\\n');",
    'setInterval(() => {}, 1000);',
  ].join('\n');
  const child = childProcess.spawn(
    process.execPath,
    ['-e', script, modulePath, repoRoot, sid],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.stdout.once('data', (chunk) => {
      if (String(chunk).trim() !== 'locked') {
        reject(new Error(`lock helper returned unexpected output: ${String(chunk)} ${stderr}`));
        return;
      }
      resolve(child);
    });
    child.once('exit', (code, signal) => {
      if (code !== null || signal !== 'SIGKILL') {
        reject(new Error(`lock helper exited before ready: code=${code} signal=${signal} ${stderr}`));
      }
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

test('prepare uses creation CAS across real processes', async () => {
  const repoRoot = mkRepo();
  const barrier = path.join(repoRoot, 'start');
  const modulePath = require.resolve('../session-close-journal.cjs');
  const script = [
    "'use strict';",
    "const fs = require('node:fs');",
    'const [modulePath, repoRoot, barrier, taskId] = process.argv.slice(1);',
    'while (!fs.existsSync(barrier)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);',
    'try {',
    '  const journal = require(modulePath);',
    "  journal.prepare(repoRoot, { sid: 'race-sid', task_id: taskId, requested_status: 'completed', worktree_path: '/tmp/ubp-race-wt' });",
    "  process.stdout.write('ok');",
    '} catch (error) {',
    "  process.stdout.write(String(error && error.code || 'error'));",
    '}',
  ].join('\n');
  try {
    const first = runChild(script, [modulePath, repoRoot, barrier, 'task-a']);
    const second = runChild(script, [modulePath, repoRoot, barrier, 'task-b']);
    fs.writeFileSync(barrier, 'go\n');
    const results = await Promise.all([first, second]);

    assert.deepEqual(
      results.map((entry) => entry.stdout).sort(),
      ['SESSION_CLOSE_CONFLICT', 'ok'],
    );
    const stored = journal.read(repoRoot, 'race-sid');
    assert.ok(['task-a', 'task-b'].includes(stored.task_id));
    assert.equal(stored.generation, 0);
  } finally {
    cleanup(repoRoot);
  }
});

test('updates persist generation and recovery_failed is an absorbing phase', () => {
  const repoRoot = mkRepo();
  try {
    const created = journal.prepare(repoRoot, intent('phase-sid')).intent;
    assert.equal(created.generation, 0);
    const failed = journal.update(repoRoot, 'phase-sid', {
      phase: 'recovery_failed',
      error: 'first failure',
    });
    assert.equal(failed.generation, 1);

    assert.throws(
      () => journal.update(repoRoot, 'phase-sid', {
        phase: 'worktree_removed',
        error: null,
      }),
      (error) => error?.code === 'SESSION_CLOSE_CONFLICT',
    );
    assert.deepEqual(
      {
        phase: journal.read(repoRoot, 'phase-sid').phase,
        error: journal.read(repoRoot, 'phase-sid').error,
        generation: journal.read(repoRoot, 'phase-sid').generation,
      },
      {
        phase: 'recovery_failed',
        error: 'first failure',
        generation: 1,
      },
    );
  } finally {
    cleanup(repoRoot);
  }
});

test('update generation CAS rejects a deterministic nested writer', () => {
  const repoRoot = mkRepo();
  const realSpawnSync = childProcess.spawnSync;
  let injected = false;
  try {
    journal.prepare(repoRoot, intent('nested-sid'));
    childProcess.spawnSync = (...args) => {
      const request = JSON.parse(String(args[2]?.input || '{}'));
      if (!injected && request.op === 'update') {
        injected = true;
        journal.update(repoRoot, 'nested-sid', {
          phase: 'recovery_failed',
          error: 'nested writer won',
        });
      }
      return realSpawnSync(...args);
    };

    assert.throws(
      () => journal.update(repoRoot, 'nested-sid', {
        phase: 'worktree_removed',
        error: null,
      }),
      (error) => error?.code === 'SESSION_CLOSE_CONFLICT',
    );
    assert.deepEqual(
      {
        phase: journal.read(repoRoot, 'nested-sid').phase,
        error: journal.read(repoRoot, 'nested-sid').error,
        generation: journal.read(repoRoot, 'nested-sid').generation,
      },
      {
        phase: 'recovery_failed',
        error: 'nested writer won',
        generation: 1,
      },
    );
  } finally {
    childProcess.spawnSync = realSpawnSync;
    cleanup(repoRoot);
  }
});

test('update generation CAS serializes real competing processes', async () => {
  const repoRoot = mkRepo();
  const barrier = path.join(repoRoot, 'update-start');
  const modulePath = require.resolve('../session-close-journal.cjs');
  const script = [
    "'use strict';",
    "const fs = require('node:fs');",
    'const [modulePath, repoRoot, barrier, phase] = process.argv.slice(1);',
    'while (!fs.existsSync(barrier)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);',
    'try {',
    '  const journal = require(modulePath);',
    "  journal.update(repoRoot, 'update-race-sid', { phase, error: phase }, { expected_generation: 0 });",
    "  process.stdout.write('ok');",
    '} catch (error) {',
    "  process.stdout.write(String(error && error.code || 'error'));",
    '}',
  ].join('\n');
  try {
    journal.prepare(repoRoot, intent('update-race-sid'));
    const first = runChild(script, [
      modulePath,
      repoRoot,
      barrier,
      'removal_failed',
    ]);
    const second = runChild(script, [
      modulePath,
      repoRoot,
      barrier,
      'recovery_failed',
    ]);
    fs.writeFileSync(barrier, 'go\n');
    const results = await Promise.all([first, second]);

    assert.deepEqual(
      results.map((entry) => entry.stdout).sort(),
      ['SESSION_CLOSE_CONFLICT', 'ok'],
    );
    const stored = journal.read(repoRoot, 'update-race-sid');
    assert.ok(['removal_failed', 'recovery_failed'].includes(stored.phase));
    assert.equal(stored.error, stored.phase);
    assert.equal(stored.generation, 1);
  } finally {
    cleanup(repoRoot);
  }
});

test('read and list reject filename/payload SID mismatches and unbounded schema', () => {
  const repoRoot = mkRepo();
  try {
    const valid = journal.prepare(repoRoot, intent('victim-sid')).intent;
    const victimPath = journal.journalPath(repoRoot, 'victim-sid');
    fs.writeFileSync(victimPath, `${JSON.stringify({ ...valid, sid: 'other-sid' })}\n`);
    assert.throws(
      () => journal.read(repoRoot, 'victim-sid'),
      (error) => error?.code === 'SESSION_CLOSE_JOURNAL_INVALID',
    );
    assert.throws(
      () => journal.list(repoRoot),
      (error) => error?.code === 'SESSION_CLOSE_JOURNAL_INVALID',
    );

    fs.writeFileSync(victimPath, `${JSON.stringify({ ...valid, unexpected: true })}\n`);
    assert.throws(
      () => journal.read(repoRoot, 'victim-sid'),
      (error) => error?.code === 'SESSION_CLOSE_JOURNAL_INVALID',
    );
  } finally {
    cleanup(repoRoot);
  }
});

test('all journal operations fail closed when the runtime ancestor is swapped before cwd pinning', () => {
  const repoRoot = mkRepo();
  const runtimeDir = path.join(repoRoot, '.ultra', '.runtime');
  const realSpawnSync = childProcess.spawnSync;
  try {
    journal.prepare(repoRoot, intent('existing-sid'));
    const operations = [
      ['prepare', () => journal.prepare(repoRoot, intent('swap-sid'))],
      ['read', () => journal.read(repoRoot, 'existing-sid')],
      ['list', () => journal.list(repoRoot)],
      ['update', () => journal.update(repoRoot, 'existing-sid', {
        phase: 'worktree_removed',
        error: null,
      })],
      ['discard', () => journal.discard(repoRoot, 'existing-sid')],
    ];
    for (const [name, operation] of operations) {
      const heldRuntime = `${runtimeDir}.held-${name}`;
      const external = fs.mkdtempSync(path.join(os.tmpdir(), `ubp-close-external-${name}-`));
      let swapped = false;
      childProcess.spawnSync = (...args) => {
        const options = args[2] || {};
        if (!swapped && path.resolve(options.cwd || '') === path.resolve(runtimeDir)) {
          swapped = true;
          fs.renameSync(runtimeDir, heldRuntime);
          fs.symlinkSync(external, runtimeDir, 'dir');
        }
        return realSpawnSync(...args);
      };

      assert.throws(
        operation,
        (error) => [
          'SESSION_CLOSE_JOURNAL_UNSAFE',
          'RUNTIME_PATH_UNSAFE',
        ].includes(error?.code),
      );
      assert.equal(
        fs.existsSync(path.join(external, 'recovery', 'session-close')),
        false,
      );
      childProcess.spawnSync = realSpawnSync;
      fs.rmSync(runtimeDir, { force: true });
      fs.renameSync(heldRuntime, runtimeDir);
      cleanup(external);
      if (name === 'prepare') {
        assert.equal(journal.read(repoRoot, 'swap-sid'), null);
      }
    }
  } finally {
    childProcess.spawnSync = realSpawnSync;
    cleanup(repoRoot);
  }
});

test('a live lock owner blocks without age takeover, then SIGKILL is recovered by update and discard', async () => {
  const repoRoot = mkRepo();
  const modulePath = require.resolve('../session-close-journal.cjs');
  let child;
  try {
    journal.prepare(repoRoot, intent('killed-lock-sid'));
    child = await holdJournalLock(modulePath, repoRoot, 'killed-lock-sid');

    assert.throws(
      () => journal.update(repoRoot, 'killed-lock-sid', {
        phase: 'removal_failed',
        error: 'must wait for live owner',
      }),
      (error) => error?.code === 'SESSION_CLOSE_CONFLICT',
    );

    const lockPath = path.join(
      repoRoot,
      '.ultra',
      '.runtime',
      'recovery',
      'session-close',
      'killed-lock-sid.lock',
    );
    const metadata = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(metadata.pid, child.pid);
    assert.equal(typeof metadata.process_start, 'string');
    assert.ok(metadata.process_start.length > 0);
    assert.deepEqual(Object.keys(metadata.directory).sort(), ['dev', 'ino']);
    assert.deepEqual(Object.keys(metadata.file).sort(), ['dev', 'ino']);

    const exited = waitForExit(child);
    child.kill('SIGKILL');
    assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });
    child = null;

    const updated = journal.update(repoRoot, 'killed-lock-sid', {
      phase: 'removal_failed',
      error: 'recovered after SIGKILL',
    });
    assert.equal(updated.phase, 'removal_failed');
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(journal.discard(repoRoot, 'killed-lock-sid'), true);
    assert.equal(journal.read(repoRoot, 'killed-lock-sid'), null);
  } finally {
    if (child) child.kill('SIGKILL');
    cleanup(repoRoot);
  }
});

test('a reused live PID marker is reclaimed only after inode-validated lock ownership changes', async () => {
  const repoRoot = mkRepo();
  const modulePath = require.resolve('../session-close-journal.cjs');
  let child;
  try {
    journal.prepare(repoRoot, intent('reused-pid-sid'));
    child = await holdJournalLock(modulePath, repoRoot, 'reused-pid-sid');
    const lockPath = path.join(
      repoRoot,
      '.ultra',
      '.runtime',
      'recovery',
      'session-close',
      'reused-pid-sid.lock',
    );
    const metadata = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    fs.writeFileSync(lockPath, `${JSON.stringify({
      ...metadata,
      process_start: `${metadata.process_start}-different-process`,
    })}\n`);

    const updated = journal.update(repoRoot, 'reused-pid-sid', {
      phase: 'removal_failed',
      error: 'PID was reused',
    });
    assert.equal(updated.phase, 'removal_failed');
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    if (child) {
      const exited = waitForExit(child);
      child.kill('SIGKILL');
      await exited;
    }
    cleanup(repoRoot);
  }
});
