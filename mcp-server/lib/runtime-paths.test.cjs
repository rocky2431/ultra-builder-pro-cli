'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const { initStateDb, closeStateDb } = require('./state-db.cjs');
const ops = require('./state-ops.cjs');
const gitBootstrap = require('./git-bootstrap.cjs');
const runtimePaths = require('./runtime-paths.cjs');

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-runtime-paths-'));
}

function cleanup(rootDir) {
  try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best effort */ }
}

async function waitForFile(candidate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(candidate)) {
    if (Date.now() >= deadline) throw new Error(`${label} did not become ready`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function collectChild(child, label) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${label} exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout.trim()));
    });
  });
}

test('runtime paths keep mutable authority below .ultra/.runtime', () => {
  const rootDir = mkRoot();
  try {
    assert.deepEqual(runtimePaths.pathsFor(rootDir), {
      rootDir,
      ultraDir: path.join(rootDir, '.ultra'),
      runtimeDir: path.join(rootDir, '.ultra', '.runtime'),
      stateDbPath: path.join(rootDir, '.ultra', '.runtime', 'state.db'),
      legacyStateDbPath: path.join(rootDir, '.ultra', 'state.db'),
      backupsDir: path.join(rootDir, '.ultra', '.runtime', 'backups'),
      collabDir: path.join(rootDir, '.ultra', '.runtime', 'collab'),
      sessionsDir: path.join(rootDir, '.ultra', '.runtime', 'sessions'),
      worktreesDir: path.join(rootDir, '.ultra', '.runtime', 'worktrees'),
      telemetryDir: path.join(rootDir, '.ultra', '.runtime', 'telemetry'),
      debugDir: path.join(rootDir, '.ultra', '.runtime', 'debug'),
      orchestratorDir: path.join(rootDir, '.ultra', '.runtime', 'orchestrator'),
      checkpointPath: path.join(rootDir, '.ultra', '.runtime', 'checkpoint.json'),
      orchestratorPidPath: path.join(
        rootDir, '.ultra', '.runtime', 'orchestrator', 'orchestrator.pid',
      ),
      orchestratorLogPath: path.join(
        rootDir, '.ultra', '.runtime', 'orchestrator', 'orchestrator.log',
      ),
    });
  } finally {
    cleanup(rootDir);
  }
});

test('ensureRuntimeState migrates a legacy DB and sidecars only after making a backup', () => {
  const rootDir = mkRoot();
  try {
    const legacyPath = path.join(rootDir, '.ultra', 'state.db');
    const initialized = initStateDb(legacyPath);
    initialized.db.prepare(
      "INSERT INTO events(type, payload_json) VALUES ('legacy-proof', '{\"preserved\":true}')",
    ).run();
    initialized.db.pragma('wal_checkpoint(TRUNCATE)');
    closeStateDb(initialized.db);
    const result = runtimePaths.ensureRuntimeState(rootDir, {
      now: () => new Date('2026-07-28T04:00:00.000Z'),
    });

    assert.equal(result.migrated, true);
    assert.equal(result.stateDbPath, path.join(rootDir, '.ultra', '.runtime', 'state.db'));
    assert.equal(fs.lstatSync(legacyPath).isFile(), true);
    assert.ok(fs.existsSync(result.stateDbPath));
    assert.ok(fs.existsSync(path.join(result.backupPath, 'state.db')));

    const reopened = initStateDb(result.stateDbPath);
    try {
      assert.equal(
        reopened.db.prepare("SELECT type FROM events WHERE type = 'legacy-proof'").get().type,
        'legacy-proof',
      );
    } finally {
      closeStateDb(reopened.db);
    }
  } finally {
    cleanup(rootDir);
  }
});

test('ensureRuntimeState preserves legacy WAL and SHM sidecars byte-for-byte', () => {
  const rootDir = mkRoot();
  try {
    const legacyPath = path.join(rootDir, '.ultra', 'state.db');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, 'legacy main evidence');
    fs.writeFileSync(`${legacyPath}-wal`, 'legacy wal evidence');
    fs.writeFileSync(`${legacyPath}-shm`, 'legacy shm evidence');

    const result = runtimePaths.ensureRuntimeState(rootDir, {
      now: () => new Date('2026-07-28T04:01:00.000Z'),
    });

    for (const suffix of ['', '-wal', '-shm']) {
      const expected = fs.readFileSync(path.join(result.backupPath, `state.db${suffix}`));
      const actual = fs.readFileSync(`${result.stateDbPath}${suffix}`);
      assert.deepEqual(actual, expected);
      assert.equal(fs.existsSync(`${legacyPath}${suffix}`), false);
    }
  } finally {
    cleanup(rootDir);
  }
});

test('ensureRuntimeState refuses competing legacy and runtime databases', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    for (const dbPath of [paths.legacyStateDbPath, paths.stateDbPath]) {
      const initialized = initStateDb(dbPath);
      closeStateDb(initialized.db);
    }
    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_CONFLICT',
    );
    assert.ok(fs.existsSync(paths.legacyStateDbPath));
    assert.ok(fs.existsSync(paths.stateDbPath));
  } finally {
    cleanup(rootDir);
  }
});

test('locateStateDb reads one authority without mutation and refuses competing databases', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    fs.mkdirSync(path.dirname(paths.legacyStateDbPath), { recursive: true });
    fs.writeFileSync(paths.legacyStateDbPath, 'legacy');
    assert.equal(runtimePaths.locateStateDb(rootDir), paths.legacyStateDbPath);
    assert.equal(fs.existsSync(paths.runtimeDir), false);

    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    fs.writeFileSync(paths.stateDbPath, 'runtime');
    assert.throws(
      () => runtimePaths.locateStateDb(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_CONFLICT',
    );
    assert.throws(
      () => runtimePaths.resolveConfiguredStateDb(rootDir, {
        env: { UBP_DB_PATH: path.join(rootDir, 'external-state.db') },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_CONFLICT',
    );
  } finally {
    cleanup(rootDir);
  }
});

test('configured state authority validates its complete main, WAL, and SHM set before resolution', () => {
  const fixtures = [
    {
      label: 'main symlink',
      setup(configured, outside) {
        fs.writeFileSync(outside, 'outside main');
        fs.symlinkSync(outside, configured);
      },
    },
    {
      label: 'main directory',
      setup(configured) {
        fs.mkdirSync(configured);
      },
    },
    {
      label: 'orphan WAL',
      setup(configured) {
        fs.writeFileSync(`${configured}-wal`, 'orphan');
      },
      code: 'RUNTIME_ORPHAN_SIDECAR',
    },
    {
      label: 'WAL symlink',
      setup(configured, outside) {
        fs.writeFileSync(configured, 'main');
        fs.writeFileSync(outside, 'outside WAL');
        fs.symlinkSync(outside, `${configured}-wal`);
      },
    },
    {
      label: 'SHM directory',
      setup(configured) {
        fs.writeFileSync(configured, 'main');
        fs.mkdirSync(`${configured}-shm`);
      },
    },
  ];

  for (const fixture of fixtures) {
    const rootDir = mkRoot();
    const authorityDir = mkRoot();
    try {
      const configured = path.join(authorityDir, 'state.db');
      const outside = path.join(authorityDir, 'outside');
      fixture.setup(configured, outside);
      assert.throws(
        () => runtimePaths.locateStateDb(rootDir, {
          env: { UBP_DB_PATH: configured },
        }),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === (fixture.code || 'RUNTIME_PATH_UNSAFE'),
        fixture.label,
      );
    } finally {
      cleanup(rootDir);
      cleanup(authorityDir);
    }
  }
});

test('configured state cannot override or invent a project authority', () => {
  const rootDir = mkRoot();
  const authorityDir = mkRoot();
  try {
    const projectPaths = runtimePaths.pathsFor(rootDir);
    const project = initStateDb(projectPaths.stateDbPath);
    closeStateDb(project.db);
    const externalPath = path.join(authorityDir, 'state.db');
    const external = initStateDb(externalPath);
    closeStateDb(external.db);

    assert.throws(
      () => runtimePaths.locateStateDb(rootDir, {
        env: { UBP_ROOT_DIR: rootDir, UBP_DB_PATH: externalPath },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_AUTHORITY_MISMATCH',
    );

    const emptyRoot = mkRoot();
    try {
      assert.throws(
        () => runtimePaths.locateStateDb(emptyRoot, {
          env: { UBP_ROOT_DIR: emptyRoot, UBP_DB_PATH: externalPath },
        }),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === 'RUNTIME_AUTHORITY_MISMATCH',
      );
      assert.equal(fs.existsSync(path.join(emptyRoot, '.ultra')), false);
    } finally {
      cleanup(emptyRoot);
    }
  } finally {
    cleanup(rootDir);
    cleanup(authorityDir);
  }
});

test('storage admission validates every canonical runtime entry before mutation', () => {
  const fixtures = [
    path.join('telemetry', 'events.jsonl'),
    path.join('sessions', 'session', 'metadata.json'),
    path.join('collab', 'review.json'),
    path.join('worktrees', 'session', 'marker'),
    path.join('backups', 'state.db'),
    path.join('debug', 'trace.jsonl'),
    'checkpoint.json',
    path.join('orchestrator', 'orchestrator.pid'),
    path.join('orchestrator', 'orchestrator.log'),
  ];
  for (const relative of fixtures) {
    const rootDir = mkRoot();
    const outside = mkRoot();
    try {
      const paths = runtimePaths.pathsFor(rootDir);
      const candidate = path.join(paths.runtimeDir, relative);
      const target = path.join(outside, 'sentinel');
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      fs.writeFileSync(target, 'outside');
      fs.symlinkSync(target, candidate);

      assert.throws(
        () => runtimePaths.ensureRuntimeState(rootDir),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === 'RUNTIME_PATH_UNSAFE',
        relative,
      );
      assert.equal(fs.readFileSync(target, 'utf8'), 'outside');
    } finally {
      cleanup(rootDir);
      cleanup(outside);
    }
  }
});

test('legacy database migration rolls back a partial sidecar rename', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const original = {
      '': Buffer.from('legacy main'),
      '-wal': Buffer.from('legacy wal'),
      '-shm': Buffer.from('legacy shm'),
    };
    fs.mkdirSync(path.dirname(paths.legacyStateDbPath), { recursive: true });
    for (const [suffix, content] of Object.entries(original)) {
      fs.writeFileSync(`${paths.legacyStateDbPath}${suffix}`, content);
    }
    let renameCount = 0;
    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir, {
        now: () => new Date('2026-07-28T05:00:00.000Z'),
        rename(source, target) {
          renameCount += 1;
          if (renameCount === 2) throw new Error('injected second rename failure');
          fs.renameSync(source, target);
        },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_MIGRATION_FAILED',
    );
    for (const [suffix, content] of Object.entries(original)) {
      assert.deepEqual(fs.readFileSync(`${paths.legacyStateDbPath}${suffix}`), content);
      assert.equal(fs.existsSync(`${paths.stateDbPath}${suffix}`), false);
    }
    const backups = fs.readdirSync(paths.backupsDir);
    assert.equal(backups.length, 1);
    for (const [suffix, content] of Object.entries(original)) {
      assert.deepEqual(
        fs.readFileSync(path.join(paths.backupsDir, backups[0], `state.db${suffix}`)),
        content,
      );
    }
  } finally {
    cleanup(rootDir);
  }
});

test('ensureRuntimeState moves every legacy mutable root below .ultra/.runtime', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const fixtures = new Map([
      [path.join('.ultra', 'backups', 'legacy.db'), 'backup'],
      [path.join('.ultra', 'collab', 'review.md'), 'collab'],
      [path.join('.ultra', 'sessions', 'session.json'), 'session'],
      [path.join('.ultra', 'worktrees', 'orphan', 'marker.txt'), 'worktree'],
      [path.join('.ultra', 'telemetry', '2026-07-28.jsonl'), 'telemetry'],
      [path.join('.ultra', 'debug', 'trace.jsonl'), 'debug'],
      [path.join('.ultra', 'runtime', 'checkpoint.json'), 'checkpoint'],
      [path.join('.ultra', 'orchestrator', 'lease.json'), 'orchestrator'],
      [path.join('.ultra', 'orchestrator.pid'), 'pid'],
      [path.join('.ultra', 'orchestrator.log'), 'log'],
    ]);
    for (const [relative, content] of fixtures) {
      const file = path.join(rootDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }

    runtimePaths.ensureRuntimeState(rootDir);

    const expected = new Map([
      [path.join(paths.backupsDir, 'legacy.db'), 'backup'],
      [path.join(paths.collabDir, 'review.md'), 'collab'],
      [path.join(paths.sessionsDir, 'session.json'), 'session'],
      [path.join(paths.worktreesDir, 'orphan', 'marker.txt'), 'worktree'],
      [path.join(paths.telemetryDir, '2026-07-28.jsonl'), 'telemetry'],
      [path.join(paths.runtimeDir, 'debug', 'trace.jsonl'), 'debug'],
      [path.join(paths.runtimeDir, 'checkpoint.json'), 'checkpoint'],
      [path.join(paths.runtimeDir, 'orchestrator', 'lease.json'), 'orchestrator'],
      [path.join(paths.runtimeDir, 'orchestrator', 'orchestrator.pid'), 'pid'],
      [path.join(paths.runtimeDir, 'orchestrator', 'orchestrator.log'), 'log'],
    ]);
    for (const [file, content] of expected) {
      assert.equal(fs.readFileSync(file, 'utf8'), content, file);
    }
    for (const relative of fixtures.keys()) {
      assert.equal(fs.existsSync(path.join(rootDir, relative)), false, relative);
    }
  } finally {
    cleanup(rootDir);
  }
});

test('legacy mutable-root migration rolls back after a partial rename failure', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const legacySession = path.join(paths.ultraDir, 'sessions', 'session.json');
    const legacyTelemetry = path.join(paths.ultraDir, 'telemetry', 'events.jsonl');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.mkdirSync(path.dirname(legacyTelemetry), { recursive: true });
    fs.writeFileSync(legacySession, 'session');
    fs.writeFileSync(legacyTelemetry, 'telemetry');
    let renameCount = 0;

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir, {
        rename(source, target) {
          renameCount += 1;
          if (renameCount === 2) throw new Error('injected auxiliary rename failure');
          fs.renameSync(source, target);
        },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'LEGACY_RUNTIME_MIGRATION_FAILED',
    );
    assert.equal(fs.readFileSync(legacySession, 'utf8'), 'session');
    assert.equal(fs.readFileSync(legacyTelemetry, 'utf8'), 'telemetry');
    assert.equal(fs.existsSync(path.join(paths.sessionsDir, 'session.json')), false);
    assert.equal(fs.existsSync(path.join(paths.telemetryDir, 'events.jsonl')), false);
  } finally {
    cleanup(rootDir);
  }
});

test('ensureRuntimeState relocates a registered legacy Git worktree through Git', () => {
  const rootDir = mkRoot();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'runtime-paths@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Runtime Paths Test'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: rootDir });

    const paths = runtimePaths.pathsFor(rootDir);
    const legacyWorktree = path.join(rootDir, '.ultra', 'worktrees', 'registered');
    execFileSync('git', ['worktree', 'add', '-q', '--detach', legacyWorktree, 'HEAD'], {
      cwd: rootDir,
    });

    runtimePaths.ensureRuntimeState(rootDir);

    const migratedWorktree = path.join(paths.worktreesDir, 'registered');
    assert.equal(fs.existsSync(legacyWorktree), false);
    assert.equal(fs.existsSync(path.join(migratedWorktree, 'README.md')), true);
    const migratedReal = fs.realpathSync(migratedWorktree);
    const registry = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    assert.match(registry, new RegExp(
      `^worktree ${migratedReal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm',
    ));
    assert.doesNotMatch(registry, /prunable gitdir file points to non-existent location/);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', path.join(
        rootDir, '.ultra', '.runtime', 'worktrees', 'registered',
      )], { cwd: rootDir, stdio: 'ignore' });
    } catch { /* best effort */ }
    cleanup(rootDir);
  }
});

test('legacy registered worktree whole-Ultra link becomes tracked semantics plus runtime authority', {
  skip: process.platform === 'win32' ? 'legacy directory symlink fixture is POSIX-only' : false,
}, () => {
  const rootDir = mkRoot();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'runtime-paths@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Runtime Paths Test'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# fixture\n');
    fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n');
    fs.writeFileSync(path.join(rootDir, '.gitignore'), '.ultra/.runtime\n');
    execFileSync('git', ['add', '-A'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: rootDir });

    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    const legacyWorktree = path.join(paths.ultraDir, 'worktrees', 'legacy-linked');
    execFileSync('git', ['worktree', 'add', '-q', '--detach', legacyWorktree, 'HEAD'], {
      cwd: rootDir,
    });
    ops.createTask(initialized.db, {
      id: 'legacy-linked-task',
      title: 'Legacy linked task',
      type: 'feature',
      priority: 'P1',
    });
    ops.createSession(initialized.db, {
      sid: 'legacy-linked',
      task_id: 'legacy-linked-task',
      runtime: 'codex',
      worktree_path: legacyWorktree,
      artifact_dir: path.join(paths.ultraDir, 'sessions', 'legacy-linked'),
    });
    closeStateDb(initialized.db);
    fs.rmSync(path.join(legacyWorktree, '.ultra'), { recursive: true, force: true });
    fs.symlinkSync(paths.ultraDir, path.join(legacyWorktree, '.ultra'), 'dir');

    runtimePaths.ensureRuntimeState(rootDir);

    const migrated = path.join(paths.worktreesDir, 'legacy-linked');
    assert.equal(fs.lstatSync(path.join(migrated, '.ultra')).isDirectory(), true);
    assert.equal(
      fs.readFileSync(path.join(migrated, '.ultra', 'specs', 'product.md'), 'utf8'),
      '# Product\n',
    );
    const runtimeLink = path.join(migrated, '.ultra', '.runtime');
    assert.equal(fs.lstatSync(runtimeLink).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(runtimeLink), fs.realpathSync(paths.runtimeDir));
    const reopened = initStateDb(paths.stateDbPath);
    try {
      assert.equal(
        reopened.db.prepare(
          'SELECT worktree_path FROM sessions WHERE sid = ?',
        ).get('legacy-linked').worktree_path,
        migrated,
      );
    } finally {
      closeStateDb(reopened.db);
    }
    assert.equal(
      runtimePaths.locateStateDb(migrated, {
        env: { UBP_DB_PATH: paths.stateDbPath },
      }),
      paths.stateDbPath,
    );
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', path.join(
        rootDir, '.ultra', '.runtime', 'worktrees', 'legacy-linked',
      )], { cwd: rootDir, stdio: 'ignore' });
    } catch { /* best effort */ }
    cleanup(rootDir);
  }
});

test('legacy whole-Ultra worktree conversion and Git move roll back together', {
  skip: process.platform === 'win32' ? 'legacy directory symlink fixture is POSIX-only' : false,
}, () => {
  const rootDir = mkRoot();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'runtime-paths@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Runtime Paths Test'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# fixture\n');
    fs.mkdirSync(path.join(rootDir, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.ultra', 'specs', 'product.md'), '# Product\n');
    fs.writeFileSync(path.join(rootDir, '.gitignore'), '.ultra/.runtime\n');
    execFileSync('git', ['add', '-A'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: rootDir });

    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    const legacyWorktree = path.join(paths.ultraDir, 'worktrees', 'legacy-rollback');
    execFileSync('git', ['worktree', 'add', '-q', '--detach', legacyWorktree, 'HEAD'], {
      cwd: rootDir,
    });
    ops.createTask(initialized.db, {
      id: 'legacy-rollback-task',
      title: 'Legacy rollback task',
      type: 'feature',
      priority: 'P1',
    });
    ops.createSession(initialized.db, {
      sid: 'legacy-rollback',
      task_id: 'legacy-rollback-task',
      runtime: 'codex',
      worktree_path: legacyWorktree,
      artifact_dir: path.join(paths.ultraDir, 'sessions', 'legacy-rollback'),
    });
    closeStateDb(initialized.db);
    fs.rmSync(path.join(legacyWorktree, '.ultra'), { recursive: true, force: true });
    fs.symlinkSync(paths.ultraDir, path.join(legacyWorktree, '.ultra'), 'dir');
    const legacySession = path.join(paths.ultraDir, 'sessions', 'late.json');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, 'late');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir, {
        rename(source, target) {
          if (source === legacySession) throw new Error('injected late migration failure');
          fs.renameSync(source, target);
        },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'LEGACY_RUNTIME_MIGRATION_FAILED',
    );

    assert.equal(fs.lstatSync(path.join(legacyWorktree, '.ultra')).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(path.join(legacyWorktree, '.ultra')), fs.realpathSync(paths.ultraDir));
    assert.equal(fs.existsSync(path.join(paths.worktreesDir, 'legacy-rollback')), false);
    const reopened = initStateDb(paths.legacyStateDbPath);
    try {
      assert.equal(
        reopened.db.prepare(
          'SELECT worktree_path FROM sessions WHERE sid = ?',
        ).get('legacy-rollback').worktree_path,
        legacyWorktree,
      );
    } finally {
      closeStateDb(reopened.db);
    }
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', path.join(
        rootDir, '.ultra', 'worktrees', 'legacy-rollback',
      )], { cwd: rootDir, stdio: 'ignore' });
    } catch { /* best effort */ }
    cleanup(rootDir);
  }
});

test('registered Git worktree relocation rolls back when a later legacy root conflicts', () => {
  const rootDir = mkRoot();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'runtime-paths@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Runtime Paths Test'], { cwd: rootDir });
    fs.writeFileSync(path.join(rootDir, 'README.md'), '# fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: rootDir });

    const paths = runtimePaths.pathsFor(rootDir);
    const legacyWorktree = path.join(rootDir, '.ultra', 'worktrees', 'registered');
    execFileSync('git', ['worktree', 'add', '-q', '--detach', legacyWorktree, 'HEAD'], {
      cwd: rootDir,
    });
    const legacySession = path.join(paths.ultraDir, 'sessions', 'conflict.json');
    const runtimeSession = path.join(paths.sessionsDir, 'conflict.json');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.mkdirSync(path.dirname(runtimeSession), { recursive: true });
    fs.writeFileSync(legacySession, 'legacy');
    fs.writeFileSync(runtimeSession, 'runtime');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'LEGACY_RUNTIME_CONFLICT',
    );

    assert.ok(fs.existsSync(path.join(legacyWorktree, 'README.md')));
    assert.equal(
      fs.existsSync(path.join(paths.worktreesDir, 'registered')),
      false,
    );
    const registry = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    assert.match(registry, new RegExp(
      `^worktree ${fs.realpathSync(legacyWorktree).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'm',
    ));
    assert.doesNotMatch(registry, /prunable gitdir file points to non-existent location/);
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', path.join(
        rootDir, '.ultra', 'worktrees', 'registered',
      )], { cwd: rootDir, stdio: 'ignore' });
    } catch { /* best effort */ }
    cleanup(rootDir);
  }
});

test('live legacy migration refuses a held writer in another process', async () => {
  const rootDir = mkRoot();
  let child;
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    child = spawn(process.execPath, [
      '-e',
      [
        "const Database = require('better-sqlite3');",
        'const db = new Database(process.argv[1]);',
        "db.exec('BEGIN IMMEDIATE');",
        "db.prepare(\"INSERT INTO events(type, payload_json) VALUES ('held-write', '{}')\").run();",
        "process.stdout.write('READY\\\\n');",
        'setInterval(() => {}, 60000);',
      ].join(' '),
      paths.legacyStateDbPath,
    ], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('writer did not become ready')), 3000);
      child.stdout.once('data', (chunk) => {
        clearTimeout(timer);
        if (chunk.toString().includes('READY')) resolve();
        else reject(new Error(`unexpected writer output: ${chunk}`));
      });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`writer exited early: ${code}`)));
    });

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_NOT_QUIESCENT',
    );
    assert.equal(fs.lstatSync(paths.legacyStateDbPath).isFile(), true);
    assert.equal(fs.existsSync(paths.stateDbPath), false);
  } finally {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* best effort */ }
    }
    cleanup(rootDir);
  }
});

test('legacy path becomes a fail-closed tombstone after SQLite authority migration', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    initialized.db.prepare(
      "INSERT INTO events(type, payload_json) VALUES ('migration-proof', '{}')",
    ).run();
    closeStateDb(initialized.db);

    runtimePaths.ensureRuntimeState(rootDir);

    assert.equal(fs.lstatSync(paths.legacyStateDbPath).isFile(), true);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(paths.legacyStateDbPath, 'utf8')),
      {
        version: 1,
        kind: 'ultra-state-migration-tombstone',
        canonical_state_db: '.runtime/state.db',
      },
    );
    assert.throws(() => initStateDb(paths.legacyStateDbPath));
    assert.equal(fs.lstatSync(paths.stateDbPath).isFile(), true);
    assert.equal(runtimePaths.locateStateDb(rootDir), paths.stateDbPath);
    const reopened = initStateDb(paths.stateDbPath);
    try {
      assert.equal(
        reopened.db.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'migration-proof'",
        ).get().count,
        1,
      );
    } finally {
      closeStateDb(reopened.db);
    }
  } finally {
    cleanup(rootDir);
  }
});

test('managed tombstone is ignored exactly while similarly named semantic files stay trackable', () => {
  const rootDir = mkRoot();
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.email', 'runtime-paths@example.invalid'], { cwd: rootDir });
    execFileSync('git', ['config', 'user.name', 'Runtime Paths Test'], { cwd: rootDir });
    fs.mkdirSync(path.join(rootDir, '.ultra', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.ultra', 'docs', 'state.db'), 'semantic prose\n');
    gitBootstrap.ensureExistingProjectStorageBoundary(rootDir);
    execFileSync('git', ['add', '-A'], { cwd: rootDir });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: rootDir });

    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    runtimePaths.ensureRuntimeState(rootDir);

    assert.equal(
      execFileSync(
        'git',
        ['status', '--short', '--untracked-files=all'],
        { cwd: rootDir, encoding: 'utf8' },
      ),
      '',
    );
    assert.doesNotThrow(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/state.db'],
      { cwd: rootDir },
    ));
    assert.throws(() => execFileSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', '.ultra/docs/state.db'],
      { cwd: rootDir },
    ));
  } finally {
    cleanup(rootDir);
  }
});

test('SQLite migration publishes the old-path tombstone without a free pathname seam', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    let observed = false;

    runtimePaths.ensureRuntimeState(rootDir, {
      beforeTombstonePublish({ legacyStateDbPath }) {
        observed = true;
        assert.equal(fs.lstatSync(legacyStateDbPath).isFile(), true);
        assert.throws(
          () => fs.openSync(legacyStateDbPath, 'wx'),
          (error) => error && error.code === 'EEXIST',
        );
      },
    });

    assert.equal(observed, true);
    assert.equal(runtimePaths.isManagedLegacyStateTombstone(paths.legacyStateDbPath), true);
    assert.throws(() => initStateDb(paths.legacyStateDbPath));
  } finally {
    cleanup(rootDir);
  }
});

test('state migration reclaims a gate whose owner was killed', async () => {
  const rootDir = mkRoot();
  let child;
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    const gatePath = path.join(paths.runtimeDir, 'state-migration.lock');
    child = spawn(process.execPath, [
      '-e',
      [
        "const fs = require('node:fs');",
        'const target = process.argv[1];',
        "fs.writeFileSync(target, JSON.stringify({ version: 2, pid: process.pid, owner_started_at: 'killed-fixture', token: 'killed-fixture' }));",
        "process.stdout.write('READY\\\\n');",
        'setInterval(() => {}, 60000);',
      ].join(' '),
      gatePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('gate owner did not become ready')), 3000);
      child.stdout.once('data', (chunk) => {
        clearTimeout(timer);
        if (chunk.toString().includes('READY')) resolve();
        else reject(new Error(`unexpected gate owner output: ${chunk}`));
      });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`gate owner exited early: ${code}`)));
    });
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
    child = null;

    assert.doesNotThrow(() => runtimePaths.ensureRuntimeState(rootDir));
    assert.equal(fs.existsSync(gatePath), false);
    assert.equal(fs.existsSync(paths.stateDbPath), true);
  } finally {
    if (child) {
      try { child.kill('SIGKILL'); } catch { /* best effort */ }
    }
    cleanup(rootDir);
  }
});

test('state migration publishes complete gate metadata before competitors can observe it', async () => {
  const rootDir = mkRoot();
  let first;
  let second;
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    const writerReady = path.join(rootDir, 'gate-writer-ready');
    const releaseWriter = path.join(rootDir, 'release-gate-writer');
    const modulePath = path.join(__dirname, 'runtime-paths.cjs');
    const firstScript = [
      "const fs = require('node:fs');",
      'const runtimePaths = require(process.argv[1]);',
      'const paths = runtimePaths.pathsFor(process.argv[2]);',
      'const ready = process.argv[3];',
      'const release = process.argv[4];',
      'const originalOpen = fs.openSync.bind(fs);',
      'const originalWrite = fs.writeFileSync.bind(fs);',
      'let gateDescriptor = null;',
      'let delayed = false;',
      'fs.openSync = (target, flags, mode) => {',
      '  const descriptor = originalOpen(target, flags, mode);',
      "  if (String(target).includes('state-migration.lock') && flags === 'wx') {",
      '    gateDescriptor = descriptor;',
      '  }',
      '  return descriptor;',
      '};',
      'fs.writeFileSync = (target, ...args) => {',
      '  if (target === gateDescriptor && !delayed) {',
      '    delayed = true;',
      "    originalWrite(ready, 'ready');",
      '    while (!fs.existsSync(release)) {',
      '      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);',
      '    }',
      '  }',
      '  return originalWrite(target, ...args);',
      '};',
      'try {',
      '  const releaseGate = runtimePaths._internal.acquireStateMigrationGate(paths);',
      '  releaseGate();',
      '  process.stdout.write(JSON.stringify({ acquired: true }));',
      '} catch (error) {',
      '  process.stdout.write(JSON.stringify({ acquired: false, code: error.code || null }));',
      '}',
    ].join('\n');
    const secondScript = [
      'const runtimePaths = require(process.argv[1]);',
      'const paths = runtimePaths.pathsFor(process.argv[2]);',
      'try {',
      '  const releaseGate = runtimePaths._internal.acquireStateMigrationGate(paths);',
      '  releaseGate();',
      '  process.stdout.write(JSON.stringify({ acquired: true }));',
      '} catch (error) {',
      '  process.stdout.write(JSON.stringify({ acquired: false, code: error.code || null }));',
      '}',
    ].join('\n');

    first = spawn(
      process.execPath,
      ['-e', firstScript, modulePath, rootDir, writerReady, releaseWriter],
      { cwd: path.resolve(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const firstDone = collectChild(first, 'delayed migration gate writer');
    await waitForFile(writerReady, 'migration gate writer');

    second = spawn(
      process.execPath,
      ['-e', secondScript, modulePath, rootDir],
      { cwd: path.resolve(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const secondResult = await collectChild(second, 'migration gate competitor');
    fs.writeFileSync(releaseWriter, 'release');
    const firstResult = await firstDone;

    assert.deepEqual(secondResult, { acquired: true });
    assert.deepEqual(firstResult, { acquired: true });
    assert.equal(
      fs.existsSync(path.join(paths.runtimeDir, 'state-migration.lock')),
      false,
    );
  } finally {
    if (first?.exitCode === null) first.kill('SIGKILL');
    if (second?.exitCode === null) second.kill('SIGKILL');
    cleanup(rootDir);
  }
});

test('state migration rejects a stable malformed gate', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    const gatePath = path.join(paths.runtimeDir, 'state-migration.lock');
    fs.writeFileSync(gatePath, '{"version":');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_NOT_QUIESCENT'
        && /malformed or unsafe/.test(error.message),
    );
    assert.equal(fs.readFileSync(gatePath, 'utf8'), '{"version":');
    assert.equal(fs.existsSync(paths.stateDbPath), false);
  } finally {
    cleanup(rootDir);
  }
});

test('state migration leaves a gate owned by a live process fail-closed', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    closeStateDb(initialized.db);
    fs.mkdirSync(paths.runtimeDir, { recursive: true });
    const gatePath = path.join(paths.runtimeDir, 'state-migration.lock');
    fs.writeFileSync(gatePath, JSON.stringify({
      version: 2,
      pid: process.pid,
      owner_started_at: null,
      token: 'live-owner-fixture',
    }));

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_STATE_NOT_QUIESCENT',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(gatePath, 'utf8')).token,
      'live-owner-fixture',
    );
    assert.equal(fs.existsSync(paths.stateDbPath), false);
  } finally {
    cleanup(rootDir);
  }
});

test('two process migration reclassifies authority inside the gate and the waiter is a no-op', async () => {
  const rootDir = mkRoot();
  let first;
  let second;
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    initialized.db.prepare(
      "INSERT INTO events(type, payload_json) VALUES ('gate-interleave-proof', '{}')",
    ).run();
    closeStateDb(initialized.db);
    const legacySession = path.join(paths.ultraDir, 'sessions', 'gate-proof.json');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, '{"preserved":true}\n');
    const ready = path.join(rootDir, 'first-ready');
    const release = path.join(rootDir, 'release-first');
    const secondStarted = path.join(rootDir, 'second-started');
    const modulePath = path.join(__dirname, 'runtime-paths.cjs');
    const firstScript = [
      "const fs = require('node:fs');",
      'const runtimePaths = require(process.argv[1]);',
      'const rootDir = process.argv[2];',
      'const ready = process.argv[3];',
      'const release = process.argv[4];',
      'const result = runtimePaths.ensureRuntimeState(rootDir, {',
      '  afterGateAcquired() {',
      "    fs.writeFileSync(ready, 'ready');",
      '    while (!fs.existsSync(release)) {',
      '      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);',
      '    }',
      '  },',
      '});',
      'process.stdout.write(JSON.stringify({ migrated: result.migrated, db: result.stateDbPath }));',
    ].join('\n');
    const secondScript = [
      "const fs = require('node:fs');",
      'const runtimePaths = require(process.argv[1]);',
      'const rootDir = process.argv[2];',
      'const started = process.argv[3];',
      "fs.writeFileSync(started, 'started');",
      'const result = runtimePaths.ensureRuntimeState(rootDir);',
      'process.stdout.write(JSON.stringify({ migrated: result.migrated, db: result.stateDbPath }));',
    ].join('\n');

    first = spawn(process.execPath, ['-e', firstScript, modulePath, rootDir, ready, release], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const firstDone = collectChild(first, 'first migrator');
    await waitForFile(ready, 'first migrator');

    second = spawn(
      process.execPath,
      ['-e', secondScript, modulePath, rootDir, secondStarted],
      {
        cwd: path.resolve(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const secondDone = collectChild(second, 'second migrator');
    await waitForFile(secondStarted, 'second migrator');
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(second.exitCode, null, 'second migrator must still be waiting on the gate');
    fs.writeFileSync(release, 'release');

    const [firstResult, secondResult] = await Promise.all([firstDone, secondDone]);
    assert.deepEqual(firstResult, { migrated: true, db: paths.stateDbPath });
    assert.deepEqual(secondResult, { migrated: false, db: paths.stateDbPath });
    assert.equal(fs.readdirSync(paths.backupsDir).length, 1);
    assert.equal(runtimePaths.isManagedLegacyStateTombstone(paths.legacyStateDbPath), true);
    assert.equal(fs.existsSync(legacySession), false);
    assert.equal(
      fs.readFileSync(path.join(paths.sessionsDir, 'gate-proof.json'), 'utf8'),
      '{"preserved":true}\n',
    );
    const reopened = initStateDb(paths.stateDbPath);
    try {
      assert.equal(
        reopened.db.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'gate-interleave-proof'",
        ).get().count,
        1,
      );
    } finally {
      closeStateDb(reopened.db);
    }
  } finally {
    if (first?.exitCode === null) first.kill('SIGKILL');
    if (second?.exitCode === null) second.kill('SIGKILL');
    cleanup(rootDir);
  }
});

test('outer migration gate holds state, auxiliary runtime, boundary admission, and rollback together', async () => {
  const rootDir = mkRoot();
  let first;
  let second;
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const initialized = initStateDb(paths.legacyStateDbPath);
    initialized.db.prepare(
      "INSERT INTO events(type, payload_json) VALUES ('outer-gate-proof', '{}')",
    ).run();
    closeStateDb(initialized.db);
    const legacySession = path.join(paths.ultraDir, 'sessions', 'outer-gate.json');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, '{"outer":true}\n');

    const boundaryReady = path.join(rootDir, 'boundary-ready');
    const releaseFailure = path.join(rootDir, 'release-boundary-failure');
    const secondStarted = path.join(rootDir, 'boundary-waiter-started');
    const modulePath = path.join(__dirname, 'runtime-paths.cjs');
    const firstScript = [
      "const fs = require('node:fs');",
      'const runtimePaths = require(process.argv[1]);',
      'const rootDir = process.argv[2];',
      'const ready = process.argv[3];',
      'const release = process.argv[4];',
      'try {',
      '  runtimePaths.ensureRuntimeState(rootDir, {',
      '    admitStorageBoundary() {',
      "      fs.writeFileSync(ready, 'ready');",
      '      while (!fs.existsSync(release)) {',
      '        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);',
      '      }',
      "      throw new Error('injected storage boundary failure');",
      '    },',
      '  });',
      "  process.stdout.write(JSON.stringify({ unexpected: 'success' }));",
      '} catch (error) {',
      '  process.stdout.write(JSON.stringify({ code: error.code || null, message: error.message }));',
      '}',
    ].join('\n');
    const secondScript = [
      "const fs = require('node:fs');",
      'const runtimePaths = require(process.argv[1]);',
      'const rootDir = process.argv[2];',
      'const started = process.argv[3];',
      "fs.writeFileSync(started, 'started');",
      'const result = runtimePaths.ensureRuntimeState(rootDir);',
      'process.stdout.write(JSON.stringify({ migrated: result.migrated, db: result.stateDbPath }));',
    ].join('\n');

    first = spawn(
      process.execPath,
      ['-e', firstScript, modulePath, rootDir, boundaryReady, releaseFailure],
      {
        cwd: path.resolve(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const firstDone = collectChild(first, 'failing boundary migrator');
    await waitForFile(boundaryReady, 'storage boundary');

    second = spawn(
      process.execPath,
      ['-e', secondScript, modulePath, rootDir, secondStarted],
      {
        cwd: path.resolve(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const secondDone = collectChild(second, 'boundary waiter');
    await waitForFile(secondStarted, 'boundary waiter');
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(
      second.exitCode,
      null,
      'the waiter must not observe authority that the first caller can still roll back',
    );

    fs.writeFileSync(releaseFailure, 'release');
    const [firstResult, secondResult] = await Promise.all([firstDone, secondDone]);
    assert.match(firstResult.message, /injected storage boundary failure/);
    assert.deepEqual(secondResult, { migrated: true, db: paths.stateDbPath });
    assert.equal(runtimePaths.isManagedLegacyStateTombstone(paths.legacyStateDbPath), true);
    assert.equal(fs.existsSync(legacySession), false);
    assert.equal(
      fs.readFileSync(path.join(paths.sessionsDir, 'outer-gate.json'), 'utf8'),
      '{"outer":true}\n',
    );
    const reopened = initStateDb(paths.stateDbPath);
    try {
      assert.equal(
        reopened.db.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'outer-gate-proof'",
        ).get().count,
        1,
      );
    } finally {
      closeStateDb(reopened.db);
    }
  } finally {
    if (first?.exitCode === null) first.kill('SIGKILL');
    if (second?.exitCode === null) second.kill('SIGKILL');
    cleanup(rootDir);
  }
});

test('projectRootFromStateDbPath recognizes runtime and legacy layouts', () => {
  const rootDir = path.resolve('/tmp/ubp-project-root');
  assert.equal(
    runtimePaths.projectRootFromStateDbPath(
      path.join(rootDir, '.ultra', '.runtime', 'state.db'),
    ),
    rootDir,
  );
  assert.equal(
    runtimePaths.projectRootFromStateDbPath(path.join(rootDir, '.ultra', 'state.db')),
    rootDir,
  );
});

test('findProjectRoot only accepts external authority through an intentional task runtime link', () => {
  const fixture = registeredTaskAuthority();
  const unrelated = mkRoot();
  try {
    const dbPath = fixture.authorityPaths.stateDbPath;

    assert.equal(
      runtimePaths.findProjectRoot(unrelated, { env: { UBP_DB_PATH: dbPath } }),
      null,
    );
    const forged = mkRoot();
    assert.throws(
      () => runtimePaths.findProjectRoot(forged, {
        env: { UBP_ROOT_DIR: forged, UBP_DB_PATH: dbPath },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_AUTHORITY_MISMATCH',
    );
    cleanup(forged);
    fs.mkdirSync(path.join(fixture.worktree, 'src'), { recursive: true });
    assert.equal(
      runtimePaths.findProjectRoot(path.join(fixture.worktree, 'src'), {
        env: { UBP_ROOT_DIR: fixture.worktree, UBP_DB_PATH: dbPath },
      }),
      fixture.worktree,
    );
  } finally {
    cleanup(fixture.authority);
    cleanup(unrelated);
  }
});

test('runtime admission rejects a full .ultra symlink before touching its target', () => {
  const rootDir = mkRoot();
  const outside = mkRoot();
  try {
    fs.writeFileSync(path.join(outside, 'sentinel'), 'outside');
    fs.symlinkSync(outside, path.join(rootDir, '.ultra'), 'dir');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_PATH_UNSAFE',
    );
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'outside');
    assert.equal(fs.existsSync(path.join(outside, '.runtime')), false);
  } finally {
    cleanup(rootDir);
    cleanup(outside);
  }
});

test('runtime admission rejects an outbound .ultra/.runtime symlink', () => {
  const rootDir = mkRoot();
  const outside = mkRoot();
  try {
    fs.mkdirSync(path.join(rootDir, '.ultra'));
    fs.symlinkSync(outside, path.join(rootDir, '.ultra', '.runtime'), 'dir');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_PATH_UNSAFE',
    );
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    cleanup(rootDir);
    cleanup(outside);
  }
});

test('runtime admission rejects non-directory control roots and non-regular state entries', () => {
  const fixtures = [
    {
      label: '.ultra regular file',
      setup(rootDir) {
        fs.writeFileSync(path.join(rootDir, '.ultra'), 'not a directory');
      },
    },
    {
      label: '.ultra/.runtime regular file',
      setup(rootDir) {
        fs.mkdirSync(path.join(rootDir, '.ultra'));
        fs.writeFileSync(path.join(rootDir, '.ultra', '.runtime'), 'not a directory');
      },
    },
    {
      label: 'legacy state.db directory',
      setup(rootDir) {
        fs.mkdirSync(path.join(rootDir, '.ultra', 'state.db'), { recursive: true });
      },
    },
    {
      label: 'runtime state.db directory',
      setup(rootDir) {
        fs.mkdirSync(path.join(rootDir, '.ultra', '.runtime', 'state.db'), {
          recursive: true,
        });
      },
    },
  ];

  for (const fixture of fixtures) {
    const rootDir = mkRoot();
    try {
      fixture.setup(rootDir);
      assert.throws(
        () => runtimePaths.ensureRuntimeState(rootDir),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === 'RUNTIME_PATH_UNSAFE',
        fixture.label,
      );
      assert.equal(
        fs.existsSync(path.join(rootDir, '.ultra', '.runtime', 'backups')),
        false,
        fixture.label,
      );
    } finally {
      cleanup(rootDir);
    }
  }
});

test('runtime admission rejects symlinked legacy DB and sidecars before backup or rename', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    const rootDir = mkRoot();
    const outside = mkRoot();
    try {
      const paths = runtimePaths.pathsFor(rootDir);
      const target = path.join(outside, `state${suffix || '-main'}`);
      fs.mkdirSync(paths.ultraDir, { recursive: true });
      fs.writeFileSync(target, 'outside');
      if (suffix) fs.writeFileSync(paths.legacyStateDbPath, 'main');
      fs.symlinkSync(target, `${paths.legacyStateDbPath}${suffix}`);

      assert.throws(
        () => runtimePaths.ensureRuntimeState(rootDir),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === 'RUNTIME_PATH_UNSAFE',
        suffix || 'main',
      );
      assert.equal(fs.readFileSync(target, 'utf8'), 'outside');
      assert.equal(fs.existsSync(paths.backupsDir), false);
    } finally {
      cleanup(rootDir);
      cleanup(outside);
    }
  }
});

test('runtime admission rejects an outbound symlink inside a legacy auxiliary root', () => {
  const rootDir = mkRoot();
  const outside = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    const target = path.join(outside, 'session.json');
    fs.writeFileSync(target, 'outside');
    fs.mkdirSync(path.join(paths.ultraDir, 'sessions'), { recursive: true });
    fs.symlinkSync(target, path.join(paths.ultraDir, 'sessions', 'escape.json'));

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_PATH_UNSAFE',
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'outside');
    assert.equal(fs.existsSync(paths.sessionsDir), false);
  } finally {
    cleanup(rootDir);
    cleanup(outside);
  }
});

test('orphan legacy WAL or SHM fails closed without becoming runtime or semantic state', () => {
  for (const suffix of ['-wal', '-shm']) {
    const rootDir = mkRoot();
    try {
      const paths = runtimePaths.pathsFor(rootDir);
      fs.mkdirSync(paths.ultraDir, { recursive: true });
      fs.writeFileSync(`${paths.legacyStateDbPath}${suffix}`, 'orphan');

      assert.throws(
        () => runtimePaths.ensureRuntimeState(rootDir),
        (error) => error instanceof runtimePaths.RuntimePathError
          && error.code === 'RUNTIME_ORPHAN_SIDECAR',
      );
      assert.equal(fs.readFileSync(`${paths.legacyStateDbPath}${suffix}`, 'utf8'), 'orphan');
      assert.equal(fs.existsSync(paths.runtimeDir), false);
    } finally {
      cleanup(rootDir);
    }
  }
});

test('Git worktree discovery failure blocks legacy worktree migration', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    execFileSync('git', ['init', '-q'], { cwd: rootDir });
    const source = path.join(paths.ultraDir, 'worktrees', 'unknown', 'marker');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'legacy');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir, {
        spawnGit(_command, args) {
          if (args[0] === 'rev-parse') {
            return { status: 128, stdout: '', stderr: 'fatal: detected dubious ownership' };
          }
          return { status: 1, stdout: '', stderr: 'injected worktree discovery failure' };
        },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'WORKTREE_DISCOVERY_FAILED',
    );
    assert.equal(fs.readFileSync(source, 'utf8'), 'legacy');
    assert.equal(fs.existsSync(path.join(paths.worktreesDir, 'unknown')), false);
  } finally {
    cleanup(rootDir);
  }
});

test('Git-boundary failure rolls DB and auxiliary migration back as one admission', () => {
  const rootDir = mkRoot();
  try {
    const paths = runtimePaths.pathsFor(rootDir);
    fs.mkdirSync(paths.ultraDir, { recursive: true });
    fs.writeFileSync(paths.legacyStateDbPath, 'legacy main');
    fs.writeFileSync(`${paths.legacyStateDbPath}-wal`, 'legacy wal');
    const legacySession = path.join(paths.ultraDir, 'sessions', 'session.json');
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.writeFileSync(legacySession, 'legacy session');

    assert.throws(
      () => runtimePaths.ensureRuntimeState(rootDir, {
        admitStorageBoundary() {
          const error = new Error('injected Git-boundary failure');
          error.code = 'GITIGNORE_INEFFECTIVE';
          throw error;
        },
      }),
      (error) => error.code === 'GITIGNORE_INEFFECTIVE',
    );

    assert.equal(fs.readFileSync(paths.legacyStateDbPath, 'utf8'), 'legacy main');
    assert.equal(fs.readFileSync(`${paths.legacyStateDbPath}-wal`, 'utf8'), 'legacy wal');
    assert.equal(fs.readFileSync(legacySession, 'utf8'), 'legacy session');
    assert.equal(fs.existsSync(paths.stateDbPath), false);
    assert.equal(fs.existsSync(path.join(paths.sessionsDir, 'session.json')), false);
  } finally {
    cleanup(rootDir);
  }
});

function registeredTaskAuthority() {
  const authority = mkRoot();
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: authority });
  execFileSync('git', ['config', 'user.email', 'authority@example.invalid'], {
    cwd: authority,
  });
  execFileSync('git', ['config', 'user.name', 'Authority Test'], { cwd: authority });
  fs.writeFileSync(path.join(authority, 'README.md'), '# authority\n');
  fs.writeFileSync(path.join(authority, 'README.link'), 'placeholder');
  if (process.platform !== 'win32') {
    fs.rmSync(path.join(authority, 'README.link'));
    fs.symlinkSync('README.md', path.join(authority, 'README.link'));
  }
  fs.mkdirSync(path.join(authority, '.ultra', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(authority, '.ultra', 'specs', 'product.md'), '# Product\n');
  fs.writeFileSync(path.join(authority, '.gitignore'), '.ultra/.runtime\n');
  execFileSync('git', ['add', '-A'], { cwd: authority });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: authority });

  const authorityPaths = runtimePaths.pathsFor(authority);
  const initialized = initStateDb(authorityPaths.stateDbPath);
  ops.createTask(initialized.db, {
    id: 'task-authentic', title: 'authentic task', type: 'feature', priority: 'P1',
  });
  const sid = 'sess-authentic';
  const worktree = path.join(authorityPaths.worktreesDir, sid);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  execFileSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], {
    cwd: authority,
  });
  const worktreeUltra = path.join(worktree, '.ultra');
  fs.symlinkSync(
    process.platform === 'win32'
      ? authorityPaths.runtimeDir
      : path.relative(worktreeUltra, authorityPaths.runtimeDir),
    path.join(worktreeUltra, '.runtime'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  ops.createSession(initialized.db, {
    sid,
    task_id: 'task-authentic',
    runtime: 'codex',
    worktree_path: worktree,
    artifact_dir: path.join(authorityPaths.sessionsDir, sid),
  });
  closeStateDb(initialized.db);
  return { authority, authorityPaths, sid, worktree };
}

test('an intentional task runtime link requires Git registration and its DB session binding', () => {
  const fixture = registeredTaskAuthority();
  try {
    assert.equal(
      runtimePaths.locateStateDb(fixture.worktree, {
        env: { UBP_DB_PATH: fixture.authorityPaths.stateDbPath },
      }),
      fixture.authorityPaths.stateDbPath,
    );
    assert.throws(
      () => runtimePaths.locateStateDb(fixture.worktree, { env: {} }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_PATH_UNSAFE',
    );
  } finally {
    cleanup(fixture.authority);
  }
});

test('a forged project cannot borrow an unrelated authority through a matching symlink', () => {
  const authority = mkRoot();
  const forged = mkRoot();
  try {
    const authorityPaths = runtimePaths.pathsFor(authority);
    const initialized = initStateDb(authorityPaths.stateDbPath);
    closeStateDb(initialized.db);
    fs.mkdirSync(path.join(forged, '.ultra'), { recursive: true });
    fs.symlinkSync(
      authorityPaths.runtimeDir,
      path.join(forged, '.ultra', '.runtime'),
      'dir',
    );
    assert.throws(
      () => runtimePaths.locateStateDb(forged, {
        env: { UBP_DB_PATH: authorityPaths.stateDbPath },
      }),
      (error) => error instanceof runtimePaths.RuntimePathError
        && error.code === 'RUNTIME_AUTHORITY_MISMATCH',
    );
  } finally {
    cleanup(authority);
    cleanup(forged);
  }
});

test('runtime validation treats a registered Git worktree as opaque repository content', {
  skip: process.platform === 'win32' ? 'tracked symlink fixture is POSIX-only' : false,
}, () => {
  const fixture = registeredTaskAuthority();
  try {
    assert.equal(fs.lstatSync(path.join(fixture.worktree, 'README.link')).isSymbolicLink(), true);
    assert.doesNotThrow(() => runtimePaths.validateProjectLayout(
      fixture.authority,
      { env: {}, validateRuntimeTree: true },
    ));
  } finally {
    cleanup(fixture.authority);
  }
});
