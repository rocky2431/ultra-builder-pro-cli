'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

const {
  initProject, InitProjectError, DEFAULT_TEMPLATE, classifyRepository, _internal,
} = require('../lib/init-project.cjs');
const { EXPECTED_VERSION } = require('../lib/state-db.cjs');
const ops = require('../lib/state-ops.cjs');
const taskLedger = require('../lib/task-ledger.cjs');

function mkTempDir(prefix = 'ubp-init-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function git(rootDir, args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function hasGitHead(rootDir) {
  try {
    git(rootDir, ['rev-parse', '--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

test('initProject copies bundled template into .ultra/', () => {
  const target = mkTempDir();
  try {
    const r = initProject({
      target_dir: target,
      project_name: 'demo',
      project_type: 'cli',
      stack: 'node',
    });
    assert.equal(r.status, 'created');
    assert.equal(r.mode, 'greenfield');
    assert.equal(r.created_path, path.join(target, '.ultra'));
    assert.ok(r.copied_files.includes('tasks/tasks.json'));
    assert.ok(r.copied_files.includes('specs/product.md'));
    assert.ok(r.copied_files.includes('changes/active/.gitkeep'));
    assert.ok(r.copied_files.includes('changes/archive/.gitkeep'));
    assert.equal(r.state_db_path, path.join(target, '.ultra', '.runtime', 'state.db'));
    assert.ok(fs.existsSync(r.state_db_path));
    const db = new Database(r.state_db_path, { readonly: true });
    try {
      const version = db.prepare('SELECT version FROM schema_version WHERE version = ?').get(EXPECTED_VERSION);
      assert.equal(version.version, EXPECTED_VERSION);
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'changes'").get());
      const baseline = db.prepare('SELECT mode, status, project_name FROM baselines').get();
      assert.deepEqual(baseline, { mode: 'greenfield', status: 'draft', project_name: 'demo' });
      const runs = db.prepare('SELECT kind FROM workflow_runs ORDER BY rowid').all();
      assert.deepEqual(runs, []);
      const checkpoint = db.prepare(
        "SELECT stage, status, revision FROM stage_checkpoints WHERE stage = 'init'",
      ).get();
      assert.deepEqual(checkpoint, { stage: 'init', status: 'accepted', revision: 1 });
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workflow_runs WHERE kind = 'research'").get().count, 0);
    } finally {
      db.close();
    }
    assert.ok(!r.copied_files.some((f) => f.endsWith('.DS_Store')));
    assert.equal(r.checkpoint.init.status, 'accepted');
    assert.equal(r.checkpoint.research, null);
    assert.deepEqual(r.checkpoint.allowed_transitions, ['ultra-research', 'ultra-status', 'ultra-doctor']);
    assert.equal(r.checkpoint.required_transition, null);
    assert.equal(r.git.status, 'initialized');
    assert.equal(r.git.branch, 'main');
    assert.equal(r.git.head, null);
    assert.equal(r.git.initial_commit_required, true);
    assert.ok(fs.existsSync(path.join(target, '.git')));
    assert.match(
      fs.readFileSync(path.join(target, '.gitignore'), 'utf8'),
      /^\/?\.ultra\/\.runtime\/?$/m,
    );
    assert.equal(git(target, ['check-ignore', '--no-index', '.ultra/.runtime/state.db']) !== '', true);
    assert.throws(
      () => git(target, ['check-ignore', '--no-index', '.ultra/specs/product.md']),
      /Command failed/,
    );
    assert.equal(hasGitHead(target), false);
  } finally { cleanup(target); }
});

test('initProject preserves an existing Git repository and its current HEAD', () => {
  const target = mkTempDir('ubp-init-existing-git-');
  try {
    git(target, ['init', '-q', '-b', 'trunk']);
    git(target, ['config', 'user.email', 'test@ubp.dev']);
    git(target, ['config', 'user.name', 'ubp-test']);
    fs.writeFileSync(path.join(target, 'README.md'), '# Existing repository\n');
    git(target, ['add', 'README.md']);
    git(target, ['commit', '-q', '-m', 'seed']);
    const before = git(target, ['rev-parse', 'HEAD']);

    const result = initProject({
      target_dir: target, project_name: 'existing-repository', git_mode: 'auto',
    });

    assert.equal(result.git.status, 'existing');
    assert.equal(result.git.repository_root, fs.realpathSync(target));
    assert.equal(result.git.branch, 'trunk');
    assert.equal(result.git.head, before);
    assert.equal(result.git.initial_commit_required, false);
    assert.equal(git(target, ['rev-parse', 'HEAD']), before);
    assert.match(
      fs.readFileSync(path.join(target, '.gitignore'), 'utf8'),
      /^\/?\.ultra\/\.runtime\/?$/m,
    );
  } finally {
    cleanup(target);
  }
});

test('initProject narrows an existing broad Ultra ignore so semantic artifacts are trackable', () => {
  const target = mkTempDir('ubp-init-existing-gitignore-');
  try {
    git(target, ['init', '-q', '-b', 'main']);
    git(target, ['config', 'user.email', 'test@ubp.dev']);
    git(target, ['config', 'user.name', 'ubp-test']);
    fs.writeFileSync(path.join(target, '.gitignore'), '.ultra/\nnode_modules/\n');
    git(target, ['add', '.gitignore']);
    git(target, ['commit', '-q', '-m', 'seed old ignore rule']);

    const result = initProject({
      target_dir: target, project_name: 'existing-ignore', git_mode: 'auto',
    });
    const lines = fs.readFileSync(path.join(target, '.gitignore'), 'utf8')
      .split(/\r?\n/).filter(Boolean);
    assert.equal(lines.includes('.ultra/'), false, 'remove the obsolete broad rule');
    assert.ok(
      lines.some((line) => /^\/?\.ultra\/\.runtime\/?$/.test(line)),
      'ignore only local runtime state',
    );
    assert.equal(result.git.gitignore_changed, true);
    assert.equal(git(target, ['check-ignore', '--no-index', '.ultra/.runtime/state.db']) !== '', true);
    assert.throws(
      () => git(target, ['check-ignore', '--no-index', '.ultra/specs/product.md']),
      /Command failed/,
    );
  } finally {
    cleanup(target);
  }
});

test('initProject overrides a custom broad Ultra ignore without deleting the owner rule', () => {
  const target = mkTempDir('ubp-init-existing-custom-ignore-');
  try {
    git(target, ['init', '-q', '-b', 'main']);
    git(target, ['config', 'user.email', 'test@ubp.dev']);
    git(target, ['config', 'user.name', 'ubp-test']);
    const gitignore = '.ultra*\nnode_modules/\n';
    fs.writeFileSync(path.join(target, '.gitignore'), gitignore);
    git(target, ['add', '.gitignore']);
    git(target, ['commit', '-q', '-m', 'seed custom ignore rule']);

    const result = initProject({
      target_dir: target, project_name: 'custom-ignore', git_mode: 'auto',
    });
    assert.equal(result.git.gitignore_changed, true);
    const updated = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
    assert.match(updated, /^\.ultra\*$/m);
    assert.match(updated, /^!\.ultra\/$/m);
    assert.match(updated, /^!\.ultra\/\*\*$/m);
    assert.match(updated, /^\/?\.ultra\/\.runtime\/?$/m);
    assert.equal(git(target, ['check-ignore', '--no-index', '.ultra/.runtime/state.db']) !== '', true);
    assert.throws(
      () => git(target, ['check-ignore', '--no-index', '.ultra/specs/product.md']),
      /Command failed/,
    );
  } finally {
    cleanup(target);
  }
});

test('initProject overrides generic nested ignores for every semantic Ultra artifact class', () => {
  const target = mkTempDir('ubp-init-nested-ignore-');
  try {
    git(target, ['init', '-q', '-b', 'main']);
    git(target, ['config', 'user.email', 'test@ubp.dev']);
    git(target, ['config', 'user.name', 'ubp-test']);
    fs.writeFileSync(
      path.join(target, '.gitignore'),
      'tasks/\ntemplates/\ndocs/\n.ultra/.runtime\n',
    );
    git(target, ['add', '.gitignore']);
    git(target, ['commit', '-q', '-m', 'seed generic nested ignores']);

    const result = initProject({
      target_dir: target, project_name: 'nested-ignore', git_mode: 'auto',
    });

    assert.equal(result.git.gitignore_changed, true);
    assert.equal(
      git(target, ['check-ignore', '--no-index', '.ultra/.runtime/state.db']) !== '',
      true,
    );
    for (const semanticPath of [
      '.ultra/specs/product.md',
      '.ultra/tasks/tasks.json',
      '.ultra/reports/templates/test-report.json',
      '.ultra/docs/research/README.md',
      '.ultra/changes/active/example/intent.md',
    ]) {
      assert.throws(
        () => git(target, ['check-ignore', '--no-index', semanticPath]),
        /Command failed/,
        `${semanticPath} must remain trackable`,
      );
    }
  } finally {
    cleanup(target);
  }
});

test('initProject replaces a broad pre-init rule with the runtime-only boundary', () => {
  const target = mkTempDir('ubp-init-new-gitignore-');
  try {
    fs.writeFileSync(path.join(target, '.gitignore'), '.ultra/\n');
    const result = initProject({
      target_dir: target, project_name: 'new-ignore', git_mode: 'auto',
    });
    assert.equal(result.git.status, 'initialized');
    assert.equal(result.git.gitignore_changed, true);
    const updated = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
    assert.doesNotMatch(updated, /^\.ultra\/$/m);
    assert.match(updated, /^\/?\.ultra\/\.runtime\/?$/m);
  } finally {
    cleanup(target);
  }
});

test('initProject supports an explicit non-Git workspace without creating Git files', () => {
  const target = mkTempDir('ubp-init-no-git-');
  try {
    const result = initProject({
      target_dir: target, project_name: 'non-git-workspace', git_mode: 'skip',
    });

    assert.equal(result.git.status, 'skipped');
    assert.equal(result.git.repository_root, null);
    assert.equal(result.git.initial_commit_required, false);
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, '.gitignore')), false);
    assert.equal(result.baseline.worktree_state, 'unavailable');
  } finally {
    cleanup(target);
  }
});

test('initProject auto-detects existing source as brownfield without auto-starting adoption research', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, 'src'));
    fs.writeFileSync(path.join(target, 'package.json'), '{"name":"legacy-app"}\n');
    fs.writeFileSync(path.join(target, 'src', 'index.js'), 'module.exports = true;\n');
    const result = initProject({ target_dir: target, project_name: 'legacy-app' });
    assert.equal(result.mode, 'brownfield');
    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const baseline = db.prepare('SELECT mode, status, scope_json FROM baselines').get();
      assert.equal(baseline.mode, 'brownfield');
      assert.equal(baseline.status, 'adopting');
      assert.deepEqual(JSON.parse(baseline.scope_json), ['.']);
      const research = db.prepare("SELECT mode, current_step FROM workflow_runs WHERE kind = 'research'").get();
      assert.equal(research, undefined);
    } finally {
      db.close();
    }
    assert.equal(result.checkpoint.research, null);
    assert.deepEqual(result.checkpoint.allowed_transitions, ['ultra-research', 'ultra-status', 'ultra-doctor']);
  } finally { cleanup(target); }
});

test('auto classification keeps a documentation-and-manifest-only skeleton greenfield', () => {
  const target = mkTempDir();
  try {
    fs.writeFileSync(path.join(target, 'README.md'), '# New service skeleton\n');
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'new-service', private: true, scripts: { test: 'node --test' },
    }));
    const profile = classifyRepository(target);
    assert.equal(profile.mode, 'greenfield');
    assert.equal(profile.repository_kind, 'single');
    assert.deepEqual(profile.source_signals, []);

    const result = initProject({ target_dir: target, project_name: 'new-service' });
    assert.equal(result.mode, 'greenfield');
    assert.deepEqual(result.repository_profile.verification_commands, ['npm test']);
  } finally { cleanup(target); }
});

test('auto classification treats root-level application source as brownfield', () => {
  const target = mkTempDir('ubp-init-root-source-');
  try {
    fs.writeFileSync(path.join(target, 'service.py'), 'def run():\n    return "existing"\n');
    const profile = classifyRepository(target);
    assert.equal(profile.mode, 'brownfield');
    assert.ok(profile.reasons.includes('SOURCE_PRESENT'));
    assert.deepEqual(profile.source_signals, ['service.py']);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('auto classification treats a static web application as brownfield', () => {
  const target = mkTempDir('ubp-init-static-web-');
  try {
    fs.writeFileSync(path.join(target, 'index.html'), '<main>Existing product</main>\n');
    fs.writeFileSync(path.join(target, 'styles.css'), 'main { display: block; }\n');
    const profile = classifyRepository(target);
    assert.equal(profile.mode, 'brownfield');
    assert.equal(profile.detected_project_type, 'web');
    assert.match(profile.detected_stack, /HTML/);
    assert.ok(profile.source_signals.includes('index.html'));
    assert.ok(profile.source_signals.includes('styles.css'));
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('auto classification persists evidence-backed project type and stack unless the owner overrides them', () => {
  const target = mkTempDir('ubp-init-detected-stack-');
  try {
    fs.mkdirSync(path.join(target, 'src'), { recursive: true });
    fs.writeFileSync(path.join(target, 'src', 'index.ts'), 'export const ready = true;\n');
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'existing-fullstack',
      dependencies: {
        next: '^15.0.0', react: '^19.0.0', fastify: '^5.0.0', '@prisma/client': '^6.0.0',
      },
      devDependencies: { typescript: '^5.0.0', vitest: '^3.0.0' },
      scripts: { build: 'next build', test: 'vitest run', typecheck: 'tsc --noEmit' },
    }, null, 2));

    const profile = classifyRepository(target);
    assert.equal(profile.detected_project_type, 'fullstack');
    for (const technology of ['Node.js', 'Next.js', 'React', 'Fastify', 'Prisma', 'TypeScript', 'Vitest']) {
      assert.ok(profile.technology_signals.includes(technology), technology);
      assert.match(profile.detected_stack, new RegExp(technology.replace('.', '\\.')));
    }

    const result = initProject({ target_dir: target, project_name: 'existing-fullstack' });
    assert.equal(result.baseline.project_type, 'fullstack');
    assert.equal(result.baseline.stack, profile.detected_stack);
    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const baseline = db.prepare('SELECT project_type, stack FROM baselines').get();
      assert.deepEqual(baseline, {
        project_type: 'fullstack', stack: profile.detected_stack,
      });
    } finally { db.close(); }
  } finally { cleanup(target); }

  const overridden = mkTempDir('ubp-init-owner-stack-');
  try {
    fs.writeFileSync(path.join(overridden, 'index.html'), '<main>Existing product</main>\n');
    const result = initProject({
      target_dir: overridden, project_name: 'owner-classified',
      project_type: 'other', stack: 'Owner-defined runtime boundary',
    });
    assert.equal(result.repository_profile.detected_project_type, 'web');
    assert.equal(result.baseline.project_type, 'other');
    assert.equal(result.baseline.stack, 'Owner-defined runtime boundary');
  } finally { cleanup(overridden); }
});

test('auto classification records bounded monorepo evidence for brownfield adoption', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, 'packages', 'api', 'src'), { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'legacy-suite', private: true, workspaces: ['packages/*'],
      scripts: { build: 'turbo build', test: 'turbo test', lint: 'turbo lint' },
    }));
    fs.writeFileSync(path.join(target, 'packages', 'api', 'package.json'), '{"name":"api"}\n');
    fs.writeFileSync(path.join(target, 'packages', 'api', 'src', 'index.js'), 'module.exports = true;\n');
    fs.writeFileSync(path.join(target, 'Dockerfile'), 'FROM node:22\n');

    const result = initProject({ target_dir: target, project_name: 'legacy-suite' });
    assert.equal(result.mode, 'brownfield');
    assert.equal(result.repository_profile.repository_kind, 'monorepo');
    assert.deepEqual(result.repository_profile.workspace_roots, ['packages/api']);
    assert.ok(result.repository_profile.source_signals.includes('packages/api/src/index.js'));
    assert.ok(result.repository_profile.deployment_signals.includes('Dockerfile'));
    assert.deepEqual(
      result.repository_profile.verification_commands,
      ['npm run build', 'npm test', 'npm run lint'],
    );

    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const row = db.prepare(
        'SELECT repository_branch, worktree_state, classification_json FROM baselines',
      ).get();
      assert.equal(row.repository_branch, 'main');
      assert.equal(row.worktree_state, 'unborn');
      assert.equal(JSON.parse(row.classification_json).repository_kind, 'monorepo');
    } finally { db.close(); }
  } finally { cleanup(target); }
});

test('brownfield initialization persists an explicitly selected monorepo scope', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, 'packages', 'api', 'src'), { recursive: true });
    fs.mkdirSync(path.join(target, 'packages', 'web', 'src'), { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'legacy-suite', private: true, workspaces: ['packages/*'],
    }));
    fs.writeFileSync(path.join(target, 'packages', 'api', 'src', 'index.js'), 'module.exports = true;\n');
    fs.writeFileSync(path.join(target, 'packages', 'web', 'src', 'index.js'), 'module.exports = true;\n');

    const result = initProject({
      target_dir: target,
      project_name: 'legacy-suite',
      scope: ['packages/api'],
    });

    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const baseline = db.prepare('SELECT scope_json FROM baselines').get();
      assert.deepEqual(JSON.parse(baseline.scope_json), ['packages/api']);
      assert.deepEqual(result.baseline.scope, ['packages/api']);
    } finally { db.close(); }
  } finally { cleanup(target); }
});

test('maintenance CLI forwards an explicit initialization mode', () => {
  const target = mkTempDir();
  try {
    fs.writeFileSync(path.join(target, 'README.md'), '# Intentional greenfield notes\n');
    const output = execFileSync(process.execPath, [
      path.resolve(__dirname, '..', '..', 'ultra-tools', 'cli.cjs'),
      'task', 'init-project', '--target-dir', target, '--project-name', 'explicit-mode',
      '--mode', 'greenfield',
    ], { encoding: 'utf8' });
    const envelope = JSON.parse(output);
    assert.equal(envelope.ok, true);
    assert.equal(envelope.data.mode, 'greenfield');
  } finally { cleanup(target); }
});

test('initProject keeps project metadata in DB authority and seeds an empty team ledger', () => {
  const target = mkTempDir();
  try {
    initProject({
      target_dir: target,
      project_name: 'meta-demo',
      project_type: 'web',
      stack: 'next',
    });
    const tasksJson = JSON.parse(fs.readFileSync(path.join(target, '.ultra', 'tasks', 'tasks.json'), 'utf8'));
    assert.equal(tasksJson.kind, 'ultra-team-task-ledger');
    assert.equal(tasksJson.schema_version, '2.0');
    assert.equal(tasksJson.generation, 0);
    assert.deepEqual(tasksJson.tasks, []);
    assert.deepEqual(tasksJson.decisions, []);
    assert.deepEqual(tasksJson.checkpoints, []);
    assert.equal(tasksJson.baseline, null);
    const db = new Database(
      path.join(target, '.ultra', '.runtime', 'state.db'),
      { readonly: true },
    );
    try {
      const baseline = db.prepare('SELECT project_name, project_type, stack FROM baselines').get();
      assert.deepEqual(baseline, { project_name: 'meta-demo', project_type: 'web', stack: 'next' });
    } finally {
      db.close();
    }
  } finally { cleanup(target); }
});

test('initProject records the declared project_initialized lifecycle event', () => {
  const rootDir = mkTempDir();
  try {
    const result = initProject({ target_dir: rootDir, project_name: 'events-fixture' });
    const db = new Database(result.state_db_path, { readonly: true });
    try {
      const events = db.prepare('SELECT type, payload_json FROM events ORDER BY id').all();
      assert.deepEqual(events.map((row) => row.type), [
        'baseline_started',
        'ultra_checkpoint_accepted',
        'project_initialized',
      ]);
      const payload = JSON.parse(events.at(-1).payload_json);
      assert.deepEqual(
        {
          project_name: payload.project_name,
          mode: payload.mode,
          baseline_id: payload.baseline_id,
          git_status: payload.git.status,
          initial_commit_required: payload.git.initial_commit_required,
        },
        {
          project_name: 'events-fixture',
          mode: 'greenfield',
          baseline_id: 'project-baseline',
          git_status: 'initialized',
          initial_commit_required: true,
        },
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('initProject refuses when .ultra/ already exists and overwrite=false', () => {
  const target = mkTempDir();
  try {
    initProject({ target_dir: target, project_name: 'first' });
    assert.throws(
      () => initProject({ target_dir: target, project_name: 'again' }),
      (err) => err instanceof InitProjectError && err.code === 'ULTRA_DIR_EXISTS',
    );
  } finally { cleanup(target); }
});

test('initProject resume migrates legacy state.db into runtime storage with a verified backup', () => {
  const target = mkTempDir('ubp-init-runtime-migration-');
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'legacy-layout',
      git_mode: 'auto',
    });
    const legacyPath = path.join(target, '.ultra', 'state.db');
    fs.renameSync(first.state_db_path, legacyPath);

    const resumed = initProject({
      target_dir: target,
      project_name: 'legacy-layout',
      resume: true,
      git_mode: 'auto',
    });

    assert.equal(
      resumed.state_db_path,
      path.join(target, '.ultra', '.runtime', 'state.db'),
    );
    assert.equal(fs.lstatSync(legacyPath).isFile(), true);
    assert.ok(fs.existsSync(resumed.state_db_path));
    assert.ok(fs.existsSync(resumed.runtime_migration_backup_path));
    assert.ok(
      fs.existsSync(path.join(resumed.runtime_migration_backup_path, 'state.db')),
    );
    const db = new Database(resumed.state_db_path, { readonly: true });
    try {
      assert.equal(
        db.prepare('SELECT project_name FROM baselines').get().project_name,
        'legacy-layout',
      );
    } finally {
      db.close();
    }
  } finally {
    cleanup(target);
  }
});

test('initProject resume preserves existing artifacts and installs only missing current scaffold files', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, '.ultra', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(target, '.ultra', 'specs', 'product.md'), '# Existing product contract\n');

    const result = initProject({
      target_dir: target, project_name: 'existing-project', mode: 'brownfield', resume: true,
    });
    assert.equal(result.status, 'resumed');
    assert.equal(
      fs.readFileSync(path.join(target, '.ultra', 'specs', 'product.md'), 'utf8'),
      '# Existing product contract\n',
    );
    assert.ok(fs.existsSync(path.join(target, '.ultra', 'specs', 'architecture.md')));
    assert.ok(result.copied_files.includes('specs/architecture.md'));
    assert.equal(result.copied_files.includes('specs/product.md'), false);

    const second = initProject({
      target_dir: target, project_name: 'existing-project', resume: true,
    });
    assert.equal(second.status, 'resumed');
    assert.equal(second.mode, 'brownfield');
    assert.equal(second.mode, second.baseline.mode);
    assert.deepEqual(second.copied_files, []);
    const db = new Database(result.state_db_path, { readonly: true });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM baselines').get().count, 1);
    } finally { db.close(); }
  } finally { cleanup(target); }
});

test('initProject resume imports a cloned team checkpoint and routes to baseline revalidation', () => {
  const source = mkTempDir('ubp-init-team-source-');
  const target = mkTempDir('ubp-init-team-target-');
  try {
    const initialized = initProject({
      target_dir: source,
      project_name: 'Shared project',
      mode: 'brownfield',
      git_mode: 'skip',
    });
    const sourceDb = new Database(initialized.state_db_path);
    try {
      sourceDb.prepare(
        `UPDATE baselines SET status = 'ready', approved_by = 'owner',
         approval_note = 'Accepted source baseline.', converged_at = ?`,
      ).run(new Date().toISOString());
      ops.createTask(sourceDb, {
        id: 'shared-task',
        title: 'Shared task',
        type: 'feature',
        priority: 'P1',
      });
      taskLedger.publishTaskLedger(sourceDb, {
        rootDir: source,
        reason: 'plan_accepted',
      });
    } finally {
      sourceDb.close();
    }

    fs.cpSync(path.join(source, '.ultra'), path.join(target, '.ultra'), {
      recursive: true,
    });
    fs.rmSync(path.join(target, '.ultra', '.runtime'), {
      recursive: true,
      force: true,
    });

    const resumed = initProject({
      target_dir: target,
      project_name: 'Shared project',
      mode: 'brownfield',
      resume: true,
    });
    assert.equal(resumed.status, 'resumed');
    assert.equal(resumed.baseline.status, 'adopting');
    assert.equal(resumed.checkpoint.provenance_status, 'pending_research');
    assert.equal(resumed.team_checkpoint.imported_tasks, 1);
    assert.equal(resumed.team_checkpoint.imported_baseline, true);
    assert.equal(resumed.team_checkpoint.requires_plan_revalidation, true);
    assert.equal(resumed.team_checkpoint.requires_baseline_revalidation, true);
    assert.equal(resumed.team_checkpoint.already_current, false);
    assert.ok(resumed.checkpoint.allowed_transitions.includes('ultra-research'));
    assert.equal(
      fs.existsSync(path.join(
        target, '.ultra', '.runtime', 'projections', 'tasks.json',
      )),
      true,
    );
    const targetDb = new Database(resumed.state_db_path, { readonly: true });
    try {
      assert.equal(
        targetDb.prepare("SELECT status FROM tasks WHERE id = 'shared-task'").get().status,
        'pending',
      );
    } finally {
      targetDb.close();
    }
  } finally {
    cleanup(source);
    cleanup(target);
  }
});

test('initProject resume repairs a pre-Git draft and refreshes corrected project metadata', () => {
  const target = mkTempDir('ubp-init-resume-git-');
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Incorrect Name',
      project_type: 'other',
      stack: 'Unknown',
      git_mode: 'skip',
    });
    assert.equal(first.git.status, 'skipped');
    assert.equal(fs.existsSync(path.join(target, '.git')), false);

    const resumed = initProject({
      target_dir: target,
      project_name: 'Correct Name',
      project_type: 'cli',
      stack: 'Rust',
      git_mode: 'auto',
      resume: true,
    });

    assert.equal(resumed.status, 'resumed');
    assert.equal(resumed.git.status, 'initialized');
    assert.equal(resumed.git.initial_commit_required, true);
    assert.equal(resumed.baseline.project_name, 'Correct Name');
    assert.equal(resumed.baseline.project_type, 'cli');
    assert.equal(resumed.baseline.stack, 'Rust');
    assert.equal(resumed.baseline.repository_revision, null);
    assert.equal(resumed.baseline.worktree_state, 'unborn');
    const db = new Database(resumed.state_db_path, { readonly: true });
    try {
      assert.deepEqual(
        db.prepare(
          'SELECT project_name, project_type, stack, repository_revision, worktree_state FROM baselines',
        ).get(),
        {
          project_name: 'Correct Name',
          project_type: 'cli',
          stack: 'Rust',
          repository_revision: null,
          worktree_state: 'unborn',
        },
      );
      const event = db.prepare(
        "SELECT payload_json FROM events WHERE type = 'baseline_metadata_refreshed' ORDER BY id DESC LIMIT 1",
      ).get();
      assert.ok(event);
      assert.equal(JSON.parse(event.payload_json).project_name, 'Correct Name');
    } finally {
      db.close();
    }
  } finally {
    cleanup(target);
  }
});

test('initProject resume rolls back Git and authoritative metadata when a late projection fails', () => {
  const target = mkTempDir('ubp-init-resume-atomic-');
  const originalDateNow = Date.now;
  const fixedNow = 1777777777777;
  let projectionTrap;
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Original Name',
      project_type: 'other',
      stack: 'Original Stack',
      git_mode: 'skip',
    });
    const beforeDb = new Database(first.state_db_path, { readonly: true });
    const before = beforeDb.prepare(
      'SELECT project_name, project_type, stack, worktree_state FROM baselines',
    ).get();
    const beforeEvents = beforeDb.prepare('SELECT COUNT(*) AS count FROM events').get().count;
    beforeDb.close();

    Date.now = () => fixedNow;
    projectionTrap = path.join(
      target,
      '.ultra',
      '.runtime',
      'projections',
      `tasks.json.tmp-${process.pid}-${fixedNow}`,
    );
    fs.mkdirSync(path.dirname(projectionTrap), { recursive: true });
    fs.mkdirSync(projectionTrap);

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'Must Roll Back',
        project_type: 'cli',
        stack: 'Rust',
        git_mode: 'auto',
        resume: true,
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'IO_ERROR'
        && /projection/i.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, '.gitignore')), false);

    const afterDb = new Database(first.state_db_path, { readonly: true });
    try {
      assert.deepEqual(
        afterDb.prepare(
          'SELECT project_name, project_type, stack, worktree_state FROM baselines',
        ).get(),
        before,
      );
      assert.equal(
        afterDb.prepare('SELECT COUNT(*) AS count FROM events').get().count,
        beforeEvents,
      );
    } finally {
      afterDb.close();
    }
  } finally {
    Date.now = originalDateNow;
    if (projectionTrap) fs.rmSync(projectionTrap, { recursive: true, force: true });
    cleanup(target);
  }
});

test('initProject resume restores the pre-migration authority when a late projection fails', () => {
  const target = mkTempDir('ubp-init-resume-migration-atomic-');
  const originalDateNow = Date.now;
  const fixedNow = 1777777777788;
  let projectionTrap;
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Pre-migration Name',
      project_type: 'other',
      stack: 'Pre-migration Stack',
      git_mode: 'skip',
    });
    const legacyDb = new Database(first.state_db_path);
    legacyDb.prepare("DELETE FROM schema_version WHERE version IN ('19.0', '20.0')").run();
    legacyDb.prepare("DELETE FROM migration_history WHERE to_version IN ('19.0', '20.0')").run();
    const beforeVersions = legacyDb.prepare(
      'SELECT version FROM schema_version ORDER BY rowid',
    ).all().map((row) => row.version);
    legacyDb.close();

    Date.now = () => fixedNow;
    projectionTrap = path.join(
      target,
      '.ultra',
      '.runtime',
      'projections',
      `tasks.json.tmp-${process.pid}-${fixedNow}`,
    );
    fs.mkdirSync(path.dirname(projectionTrap), { recursive: true });
    fs.mkdirSync(projectionTrap);

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'Must Not Survive',
        project_type: 'cli',
        stack: 'Rust',
        git_mode: 'skip',
        resume: true,
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'IO_ERROR'
        && /projection/i.test(error.message),
    );

    const restoredDb = new Database(first.state_db_path, { readonly: true });
    try {
      assert.deepEqual(
        restoredDb.prepare('SELECT version FROM schema_version ORDER BY rowid')
          .all().map((row) => row.version),
        beforeVersions,
      );
      assert.equal(
        restoredDb.prepare("SELECT COUNT(*) AS count FROM schema_version WHERE version = '20.0'")
          .get().count,
        0,
      );
      assert.deepEqual(
        restoredDb.prepare('SELECT project_name, project_type, stack FROM baselines').get(),
        {
          project_name: 'Pre-migration Name',
          project_type: 'other',
          stack: 'Pre-migration Stack',
        },
      );
    } finally {
      restoredDb.close();
    }
  } finally {
    Date.now = originalDateNow;
    if (projectionTrap) fs.rmSync(projectionTrap, { recursive: true, force: true });
    cleanup(target);
  }
});

test('initProject resume restores the complete legacy runtime layout after a late failure', () => {
  const target = mkTempDir('ubp-init-resume-layout-atomic-');
  const originalDateNow = Date.now;
  const fixedNow = 1777777777799;
  let projectionTrap;
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Legacy Layout',
      git_mode: 'skip',
    });
    const runtimeDb = first.state_db_path;
    const legacyDb = path.join(target, '.ultra', 'state.db');
    fs.renameSync(runtimeDb, legacyDb);
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(`${runtimeDb}${suffix}`)) {
        fs.renameSync(`${runtimeDb}${suffix}`, `${legacyDb}${suffix}`);
      }
    }
    const runtimeDir = path.dirname(runtimeDb);
    if (fs.readdirSync(runtimeDir).length === 0) fs.rmdirSync(runtimeDir);

    const legacySession = path.join(target, '.ultra', 'sessions', 'session.json');
    const legacyWorktree = path.join(
      target, '.ultra', 'worktrees', 'orphan-session', 'marker.txt',
    );
    fs.mkdirSync(path.dirname(legacySession), { recursive: true });
    fs.mkdirSync(path.dirname(legacyWorktree), { recursive: true });
    fs.writeFileSync(legacySession, 'legacy session');
    fs.writeFileSync(legacyWorktree, 'legacy worktree');
    const ignorePath = path.join(target, '.gitignore');
    fs.writeFileSync(ignorePath, 'owner-rule\n');
    const tasksPath = path.join(target, '.ultra', 'tasks', 'tasks.json');
    const tasksBefore = fs.readFileSync(tasksPath);

    Date.now = () => fixedNow;
    projectionTrap = path.join(
      target,
      '.ultra',
      '.runtime',
      'projections',
      `tasks.json.tmp-${process.pid}-${fixedNow}`,
    );
    fs.mkdirSync(path.dirname(projectionTrap), { recursive: true });
    fs.mkdirSync(projectionTrap);

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'Must Roll Back Entire Layout',
        git_mode: 'auto',
        resume: true,
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'IO_ERROR'
        && /projection/i.test(error.message),
    );

    const restored = new Database(legacyDb, { readonly: true, fileMustExist: true });
    try {
      assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(
        restored.prepare('SELECT project_name FROM baselines').get().project_name,
        'Legacy Layout',
      );
    } finally {
      restored.close();
    }
    assert.equal(fs.existsSync(runtimeDb), false);
    assert.equal(fs.readFileSync(legacySession, 'utf8'), 'legacy session');
    assert.equal(fs.readFileSync(legacyWorktree, 'utf8'), 'legacy worktree');
    assert.equal(
      fs.existsSync(path.join(runtimeDir, 'sessions', 'session.json')),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(runtimeDir, 'worktrees', 'orphan-session', 'marker.txt')),
      false,
    );
    assert.deepEqual(fs.readFileSync(tasksPath), tasksBefore);
    assert.equal(fs.readFileSync(ignorePath, 'utf8'), 'owner-rule\n');
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
  } finally {
    Date.now = originalDateNow;
    if (projectionTrap) fs.rmSync(projectionTrap, { recursive: true, force: true });
    cleanup(target);
  }
});

test('initProject resume snapshots before schema mutation and preserves entry state on snapshot failure', () => {
  const target = mkTempDir('ubp-init-resume-pre-schema-');
  const originalPrepare = Database.prototype.prepare;
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Pre-schema Snapshot',
      git_mode: 'skip',
    });
    const db = new Database(first.state_db_path);
    try {
      db.exec("DELETE FROM schema_version; INSERT INTO schema_version(version) VALUES ('18.0')");
      db.prepare(
        "INSERT INTO events(type, payload_json) VALUES ('pre-schema-proof', '{\"preserve\":true}')",
      ).run();
      db.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }

    Database.prototype.prepare = function injectedPrepare(sql, ...args) {
      if (String(sql).trim().toUpperCase().startsWith('VACUUM INTO')) {
        throw new Error('injected pre-schema VACUUM INTO failure');
      }
      return originalPrepare.call(this, sql, ...args);
    };

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'Must Preserve Schema 18',
        git_mode: 'skip',
        resume: true,
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'IO_ERROR'
        && /VACUUM INTO/i.test(error.message),
    );

    Database.prototype.prepare = originalPrepare;
    const restored = new Database(first.state_db_path, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.deepEqual(
        restored.prepare('SELECT version FROM schema_version ORDER BY version').all(),
        [{ version: '18.0' }],
      );
      assert.equal(
        restored.prepare(
          "SELECT COUNT(*) AS count FROM events WHERE type = 'pre-schema-proof'",
        ).get().count,
        1,
      );
    } finally {
      restored.close();
    }
  } finally {
    Database.prototype.prepare = originalPrepare;
    cleanup(target);
  }
});

test('resume snapshot publish failure preserves both the live DB and recovery snapshot', () => {
  const target = mkTempDir('ubp-init-resume-publish-atomic-');
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'Resume Publish Atomicity',
      git_mode: 'skip',
    });
    const liveBefore = fs.readFileSync(first.state_db_path);
    const snapshot = _internal.createResumeSnapshot(
      path.join(target, '.ultra'),
      first.state_db_path,
    );
    const snapshotBefore = fs.readFileSync(snapshot.statePath);

    const errors = _internal.restoreResumeSnapshot(snapshot, {
      renameSync(source, destination) {
        if (source === snapshot.statePath && destination === snapshot.stateDbPath) {
          const error = new Error('injected final snapshot publish failure');
          error.code = 'EIO';
          throw error;
        }
        fs.renameSync(source, destination);
      },
    });

    assert.match(errors.join('\n'), /injected final snapshot publish failure/);
    assert.deepEqual(fs.readFileSync(first.state_db_path), liveBefore);
    assert.deepEqual(fs.readFileSync(snapshot.statePath), snapshotBefore);
  } finally {
    cleanup(target);
  }
});

test('initProject resume returns the completed initialization workflow provenance for a ready baseline', () => {
  const target = mkTempDir();
  try {
    const first = initProject({ target_dir: target, project_name: 'ready-project' });
    const db = new Database(first.state_db_path);
    try {
      const researchId = 'research-ready-project';
      db.prepare(
        `INSERT INTO workflow_runs
         (id, kind, mode, subject, definition_version, status, baseline_id,
          metadata_json, summary_json, completed_at)
         VALUES (?, 'research', 'full', ?, '2.0', 'completed', ?, '{}', '{}', CURRENT_TIMESTAMP)`,
      ).run(researchId, 'Completed baseline research provenance.', first.baseline.id);
      db.prepare(
        "UPDATE baselines SET status = 'ready', approved_by = 'owner', research_run_id = ?, converged_at = CURRENT_TIMESTAMP",
      ).run(researchId);
    } finally { db.close(); }

    const resumed = initProject({
      target_dir: target, project_name: 'ready-project', resume: true,
    });
    assert.equal(resumed.baseline.status, 'ready');
    assert.equal(resumed.checkpoint.init.id, first.checkpoint.init.id);
    assert.equal(resumed.checkpoint.research.status, 'accepted');
    assert.equal(resumed.checkpoint.research.mode, 'full');
    assert.ok(resumed.checkpoint.allowed_transitions.includes('ultra-change'));
    assert.equal(resumed.checkpoint.required_transition, null);
  } finally { cleanup(target); }
});

test('initProject resume routes a ready baseline with missing provenance to doctor', () => {
  const target = mkTempDir();
  try {
    const first = initProject({ target_dir: target, project_name: 'broken-ready-project' });
    const db = new Database(first.state_db_path);
    try {
      db.prepare("UPDATE workflow_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP").run();
      db.prepare(
        "UPDATE baselines SET status = 'ready', approved_by = 'owner', research_run_id = NULL, converged_at = CURRENT_TIMESTAMP",
      ).run();
    } finally { db.close(); }

    const resumed = initProject({
      target_dir: target, project_name: 'broken-ready-project', resume: true,
    });
    assert.equal(resumed.checkpoint.provenance_status, 'incomplete');
    assert.equal(resumed.checkpoint.required_transition, 'ultra-doctor');
  } finally { cleanup(target); }
});

test('initProject resume upgrades a matching legacy task projection into the team ledger', () => {
  const target = mkTempDir();
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'legacy-ledger-upgrade',
      git_mode: 'skip',
    });
    const db = new Database(first.state_db_path);
    try {
      ops.createTask(db, {
        id: 'legacy-task',
        title: 'Legacy task',
        type: 'feature',
        priority: 'P1',
      });
    } finally {
      db.close();
    }
    const legacyDocument = {
      schema_version: '4.5',
      source: '.ultra/state.db',
      tasks: [{
        id: 'legacy-task',
        title: 'Legacy task',
        type: 'feature',
        priority: 'P1',
        status: 'pending',
      }],
    };
    const legacyBytes = Buffer.from(`${JSON.stringify(legacyDocument, null, 2)}\n`);
    const ledgerFile = path.join(target, '.ultra', 'tasks', 'tasks.json');
    fs.writeFileSync(ledgerFile, legacyBytes);

    const resumed = initProject({
      target_dir: target,
      project_name: 'legacy-ledger-upgrade',
      git_mode: 'skip',
      resume: true,
    });

    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.equal(ledger.kind, taskLedger.LEDGER_KIND);
    assert.equal(ledger.tasks.length, 1);
    assert.equal(ledger.tasks[0].id, 'legacy-task');
    assert.equal(resumed.team_checkpoint.migrated_legacy_projection, true);
    assert.equal(resumed.team_checkpoint.imported_tasks, 0);
    assert.equal(resumed.team_checkpoint.already_current, true);
    assert.ok(fs.existsSync(resumed.team_checkpoint.legacy_backup_path));
    assert.deepEqual(
      fs.readFileSync(resumed.team_checkpoint.legacy_backup_path),
      legacyBytes,
    );
  } finally { cleanup(target); }
});

test('initProject resume rejects and rolls back a divergent legacy task projection', () => {
  const target = mkTempDir();
  try {
    const first = initProject({
      target_dir: target,
      project_name: 'legacy-ledger-conflict',
      git_mode: 'skip',
    });
    const db = new Database(first.state_db_path);
    try {
      ops.createTask(db, {
        id: 'legacy-task',
        title: 'SQLite title',
        type: 'feature',
        priority: 'P1',
      });
    } finally {
      db.close();
    }
    const legacyBytes = Buffer.from(`${JSON.stringify({
      schema_version: '4.5',
      source: '.ultra/state.db',
      tasks: [{
        id: 'legacy-task',
        title: 'Divergent projection title',
        type: 'feature',
        priority: 'P1',
        status: 'pending',
      }],
    }, null, 2)}\n`);
    const ledgerFile = path.join(target, '.ultra', 'tasks', 'tasks.json');
    fs.writeFileSync(ledgerFile, legacyBytes);

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'legacy-ledger-conflict',
        git_mode: 'skip',
        resume: true,
      }),
      (error) => error.code === 'TASK_LEDGER_LEGACY_CONFLICT',
    );
    assert.deepEqual(fs.readFileSync(ledgerFile), legacyBytes);
    const restored = new Database(first.state_db_path, { readonly: true });
    try {
      assert.equal(
        restored.prepare("SELECT title FROM tasks WHERE id = 'legacy-task'").get().title,
        'SQLite title',
      );
    } finally {
      restored.close();
    }
  } finally { cleanup(target); }
});

test('initProject resume refuses projection-only tasks until the supported import runs', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, '.ultra', 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(target, '.ultra', 'tasks', 'tasks.json'), JSON.stringify({
      schema_version: '4.5', source: '.ultra/state.db',
      tasks: [{ id: 'legacy', title: 'Legacy task', type: 'feature', priority: 'P1', status: 'pending' }],
    }));
    assert.throws(
      () => initProject({ target_dir: target, project_name: 'legacy', resume: true }),
      (error) => error.code === 'LEGACY_STATE_MIGRATION_REQUIRED'
        && error.message.includes(`--from=4.5 --to=${EXPECTED_VERSION}`),
    );
    assert.equal(fs.existsSync(path.join(target, '.ultra', 'state.db')), false);
    assert.equal(fs.existsSync(path.join(target, '.ultra', 'specs', 'product.md')), false);
  } finally { cleanup(target); }
});

test('initProject rejects conflicting resume and overwrite modes', () => {
  const target = mkTempDir();
  try {
    fs.mkdirSync(path.join(target, '.ultra'));
    assert.throws(
      () => initProject({
        target_dir: target, project_name: 'conflict', resume: true, overwrite: true,
      }),
      (error) => error.code === 'VALIDATION_ERROR' && /resume.*overwrite/i.test(error.message),
    );
  } finally { cleanup(target); }
});

test('initProject with overwrite=true backs up existing .ultra/', () => {
  const target = mkTempDir();
  try {
    initProject({ target_dir: target, project_name: 'first' });
    const sentinel = path.join(target, '.ultra', 'sentinel.txt');
    fs.writeFileSync(sentinel, 'before-backup');

    const r = initProject({ target_dir: target, project_name: 'second', overwrite: true });
    assert.equal(r.status, 'overwritten');
    assert.ok(r.backup_path);
    assert.ok(fs.existsSync(path.join(r.backup_path, 'sentinel.txt')));
    assert.equal(
      fs.readFileSync(path.join(r.backup_path, 'sentinel.txt'), 'utf8'),
      'before-backup',
    );
    assert.ok(!fs.existsSync(sentinel));
  } finally { cleanup(target); }
});

test('initProject restores the prior .ultra when overwrite initialization fails', () => {
  const target = mkTempDir();
  const badTemplate = mkTempDir('ubp-bad-template-');
  try {
    initProject({ target_dir: target, project_name: 'first' });
    fs.writeFileSync(path.join(target, '.ultra', 'sentinel.txt'), 'restore-me');
    fs.cpSync(DEFAULT_TEMPLATE, badTemplate, { recursive: true });
    fs.writeFileSync(path.join(badTemplate, 'tasks', 'tasks.json'), '{not-json\n');

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'broken-overwrite',
        overwrite: true,
        source_template: badTemplate,
      }),
      (error) => error instanceof InitProjectError && error.code === 'IO_ERROR',
    );
    assert.equal(
      fs.readFileSync(path.join(target, '.ultra', 'sentinel.txt'), 'utf8'),
      'restore-me',
    );
    assert.equal(
      fs.readdirSync(target).some((name) => name.startsWith('.ultra.backup.')),
      false,
    );
  } finally {
    cleanup(target);
    cleanup(badTemplate);
  }
});

test('initProject rolls back Git bootstrap when authoritative initialization fails after git init', () => {
  const target = mkTempDir('ubp-init-git-rollback-');
  const badTemplate = mkTempDir('ubp-init-git-rollback-template-');
  try {
    fs.cpSync(DEFAULT_TEMPLATE, badTemplate, { recursive: true });
    fs.writeFileSync(path.join(badTemplate, 'state.db'), 'not a sqlite database\n');

    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'broken-after-git',
        source_template: badTemplate,
      }),
      (error) => error instanceof InitProjectError && error.code === 'IO_ERROR',
    );
    assert.equal(fs.existsSync(path.join(target, '.ultra')), false);
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, '.gitignore')), false);
  } finally {
    cleanup(target);
    cleanup(badTemplate);
  }
});

test('initProject refuses a symlinked root .gitignore without modifying its target', () => {
  const target = mkTempDir('ubp-init-gitignore-symlink-');
  const externalDir = mkTempDir('ubp-init-gitignore-target-');
  const external = path.join(externalDir, 'sentinel.txt');
  try {
    fs.writeFileSync(external, 'preserve-me\n');
    fs.symlinkSync(external, path.join(target, '.gitignore'));
    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'unsafe-gitignore',
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'GITIGNORE_UNSAFE',
    );
    assert.equal(fs.readFileSync(external, 'utf8'), 'preserve-me\n');
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, '.ultra')), false);
  } finally {
    cleanup(target);
    cleanup(externalDir);
  }
});

test('initProject repairs rules that re-include the entire Ultra directory', () => {
  const target = mkTempDir('ubp-init-gitignore-negation-');
  try {
    git(target, ['init', '-q', '-b', 'main']);
    git(target, ['config', 'user.email', 'test@ubp.dev']);
    git(target, ['config', 'user.name', 'ubp-test']);
    const gitignore = '.ultra/\n!.ultra/\n';
    fs.writeFileSync(path.join(target, '.gitignore'), gitignore);
    git(target, ['add', '.gitignore']);
    git(target, ['commit', '-q', '-m', 'seed conflicting ignore']);
    const before = git(target, ['rev-parse', 'HEAD']);

    const result = initProject({
      target_dir: target, project_name: 'repaired-ignore', git_mode: 'auto',
    });
    assert.equal(result.git.gitignore_changed, true);
    const updated = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
    assert.match(updated, /^\.ultra\/\.runtime$/m);
    assert.equal(git(target, ['check-ignore', '--no-index', '.ultra/.runtime/state.db']) !== '', true);
    assert.throws(
      () => git(target, ['check-ignore', '--no-index', '.ultra/specs/product.md']),
      /Command failed/,
    );
    assert.equal(git(target, ['rev-parse', 'HEAD']), before);
    assert.ok(fs.existsSync(path.join(target, '.ultra', 'specs', 'product.md')));
  } finally {
    cleanup(target);
  }
});

test('initProject rejects empty project_name', () => {
  const target = mkTempDir();
  try {
    assert.throws(
      () => initProject({ target_dir: target, project_name: '' }),
      (err) => err instanceof InitProjectError && err.code === 'VALIDATION_ERROR',
    );
  } finally { cleanup(target); }
});

test('initProject rejects an unsupported git_mode before mutating the target', () => {
  const target = mkTempDir('ubp-init-invalid-git-mode-');
  try {
    assert.throws(
      () => initProject({
        target_dir: target, project_name: 'demo', git_mode: 'reinitialize',
      }),
      (error) => error instanceof InitProjectError
        && error.code === 'VALIDATION_ERROR'
        && /git_mode/.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
    assert.equal(fs.existsSync(path.join(target, '.ultra')), false);
  } finally {
    cleanup(target);
  }
});

test('initProject rejects missing source_template', () => {
  const target = mkTempDir();
  try {
    assert.throws(
      () => initProject({
        target_dir: target,
        project_name: 'demo',
        source_template: '/tmp/does-not-exist-ubp-init',
      }),
      (err) => err instanceof InitProjectError && err.code === 'TEMPLATE_MISSING',
    );
  } finally { cleanup(target); }
});

test('initProject surface TARGET_NOT_DIR when target_dir is a file', () => {
  const parent = mkTempDir();
  const filePath = path.join(parent, 'not-a-dir.txt');
  fs.writeFileSync(filePath, 'x');
  try {
    assert.throws(
      () => initProject({ target_dir: filePath, project_name: 'demo' }),
      (err) => err instanceof InitProjectError && err.code === 'TARGET_NOT_DIR',
    );
  } finally { cleanup(parent); }
});

test('copied tree matches bundled templates/.ultra/ (diff-equal excluding .DS_Store)', () => {
  const target = mkTempDir();
  try {
    const r = initProject({ target_dir: target, project_name: 'diff-equal' });
    const templateFiles = [];
    (function walk(dir, prefix = '') {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.DS_Store') continue;
        const rel = prefix ? path.join(prefix, e.name) : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), rel);
        else if (e.isFile()) templateFiles.push(rel);
      }
    })(DEFAULT_TEMPLATE);
    assert.deepEqual(r.copied_files.sort(), templateFiles.sort());
    for (const rel of templateFiles) {
      if (rel === 'tasks/tasks.json') continue; // metadata injected by design
      const src = fs.readFileSync(path.join(DEFAULT_TEMPLATE, rel));
      const dst = fs.readFileSync(path.join(r.created_path, rel));
      assert.deepEqual(dst, src, `content diff in ${rel}`);
    }
  } finally { cleanup(target); }
});
