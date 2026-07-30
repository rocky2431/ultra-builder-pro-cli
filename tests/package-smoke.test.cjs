'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGE = require(path.join(REPO_ROOT, 'package.json'));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const RETIRED_DISTRIBUTION_REFERENCES = /\b(?:Gemini|RTK|graphify|Impeccable|Context7|GSD-2|GStack|OpenSpec|Spec Kit|Trellis|ECC)\b|Exa MCP|agent-browser|find-skills|\.ultra\/memory|memory\.(?:retain|recall|reflect)/iu;
const MODEL_PROMPT_PATH = /^(?:commands|skills|agents|output-styles|\.ultra-template)\/.*\.md$/;
const PROMPT_HISTORY_RESIDUE = /\bpre-Phase\b|\bPhase\s+\d+\.\d+\b|\bv4\.[45]\b|\b(?:old|previous) prompt version\b/iu;
const PROMPT_COMPARISON_RESIDUE = /\b(?:better|worse|smarter|faster)\s+than\s+(?:Claude|Codex|OpenCode|Kimi|another model|other tools?)\b|\b(?:old|bad)\s*(?:vs\.?|versus)\s*(?:new|good)\b/iu;
const EXPECTED_PUBLIC_COMMANDS = [
  'ultra-init', 'ultra-research', 'ultra-plan', 'ultra-dev', 'ultra-test',
  'ultra-review', 'ultra-deliver', 'ultra-status', 'ultra-think', 'ultra-change',
  'ultra-doctor',
];
const EXPECTED_INTERACTION_FLOW = [
  'inspect', 'suggest', 'host_native_ask', 'normalize', 'persist', 'apply', 'read_back',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function invokeJournalWorker(worker, projectDir, request) {
  const runtimeDir = path.join(projectDir, '.ultra', '.runtime');
  const stat = fs.statSync(runtimeDir, { bigint: true });
  const result = spawnSync(process.execPath, [worker], {
    cwd: runtimeDir,
    input: JSON.stringify({
      ...request,
      runtime_identity: {
        dev: String(stat.dev),
        ino: String(stat.ino),
      },
    }),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const payload = JSON.parse(String(result.stdout || '').trim());
  assert.equal(
    payload.ok,
    true,
    `journal worker failed (${result.status}): ${JSON.stringify(payload.error)} ${result.stderr}`,
  );
  return payload.value;
}

function invokeArchiveMutationWorker(worker, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const directoryFd = fs.openSync(
    directory,
    fs.constants.O_RDONLY
      | (fs.constants.O_DIRECTORY || 0)
      | (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = fs.fstatSync(directoryFd, { bigint: true });
    const result = spawnSync('python3', [worker], {
      input: JSON.stringify({
        operation: 'mkdir_dir',
        directory_fd: 3,
        directory_identity: {
          dev: String(stat.dev),
          ino: String(stat.ino),
          mode: String(stat.mode),
        },
        name: 'archive',
      }),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe', directoryFd],
    });
    assert.equal(
      result.status,
      0,
      `archive worker failed (${result.status}): ${result.stderr || result.stdout}`,
    );
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    assert.equal(fs.statSync(path.join(directory, 'archive')).isDirectory(), true);
  } finally {
    fs.closeSync(directoryFd);
  }
}

function writeDeadOwnerLock(projectDir, sid) {
  const journalDir = path.join(
    projectDir,
    '.ultra',
    '.runtime',
    'recovery',
    'session-close',
  );
  fs.mkdirSync(journalDir, { recursive: true });
  const lockPath = path.join(journalDir, `${sid}.lock`);
  const fd = fs.openSync(
    lockPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600,
  );
  try {
    const directory = fs.statSync(journalDir, { bigint: true });
    const file = fs.fstatSync(fd, { bigint: true });
    fs.writeFileSync(fd, `${JSON.stringify({
      version: 2,
      pid: 2147483647,
      process_start: 'test:dead-owner',
      token: 'packaged-runtime-dead-owner',
      created_at: new Date().toISOString(),
      directory: { dev: String(directory.dev), ino: String(directory.ino) },
      file: { dev: String(file.dev), ino: String(file.ino) },
    })}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return lockPath;
}

async function verifyMcp(launcher, projectDir, { migrateLegacy = false } = {}) {
  fs.mkdirSync(projectDir, { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [launcher],
    cwd: projectDir,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'package-smoke', version: PACKAGE.version }, { capabilities: {} });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion().version, PACKAGE.version);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 7);
    assert.equal(
      fs.existsSync(path.join(projectDir, '.ultra', '.runtime', 'state.db')),
      false,
    );
    if (migrateLegacy) {
      const inspection = await client.callTool({
        name: 'ultra.sync',
        arguments: { action: 'inspect' },
      });
      assert.notEqual(
        inspection.isError,
        true,
        inspection.content?.[0]?.text || 'ultra.sync inspect failed',
      );
      assert.equal(inspection.structuredContent.status, 'migration_required');
      const migrated = await client.callTool({
        name: 'ultra.sync',
        arguments: { action: 'migrate' },
      });
      assert.notEqual(
        migrated.isError,
        true,
        migrated.content?.[0]?.text || 'ultra.sync migrate failed',
      );
      assert.equal(migrated.structuredContent.migrated, true);
    }
    const initialized = await client.callTool({
      name: 'ultra.record',
      arguments: {
        entries: [{
          kind: 'baseline',
          action: 'initialize',
          data: {
            target_dir: projectDir,
            project_name: 'package-smoke',
            mode: 'greenfield',
            git_mode: 'initialize',
          },
          idempotency_key: `package-smoke-${path.basename(projectDir)}`,
        }],
      },
    });
    assert.notEqual(
      initialized.isError,
      true,
      initialized.content?.[0]?.text || 'ultra.record initialize failed',
    );
    assert.equal(
      initialized.structuredContent.accepted,
      true,
      `${launcher}: ${JSON.stringify(initialized.structuredContent)}`,
    );
    assert.ok(
      fs.existsSync(path.join(projectDir, '.ultra', '.runtime', 'state.db')),
      `ultra.record initialize did not create canonical state for ${launcher}`,
    );
  } finally {
    await client.close();
  }
}

function prepareLegacyMcpProject(ultraTools, projectDir, cwd) {
  fs.mkdirSync(projectDir, { recursive: true });
  const initialized = JSON.parse(run(ultraTools, [
    'task', 'init-project', '--target-dir', projectDir, '--project-name', 'tarball-legacy',
  ], { cwd }));
  assert.equal(initialized.ok, true);
  const runtimeDir = path.join(projectDir, '.ultra', '.runtime');
  const legacyDb = path.join(projectDir, '.ultra', 'state.db'); // runtime-path-compatibility
  fs.renameSync(path.join(runtimeDir, 'state.db'), legacyDb);
  fs.mkdirSync(path.join(projectDir, '.ultra', 'sessions'), { recursive: true }); // runtime-path-compatibility
  fs.writeFileSync(
    path.join(projectDir, '.ultra', 'sessions', 'legacy.json'), // runtime-path-compatibility
    '{"legacy":true}\n',
  );
  fs.rmSync(runtimeDir, { recursive: true, force: true });
}

test('npm tarball installs all CLIs and builds durable native host runtimes', { timeout: 300000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-package-smoke-'));
  try {
    const packJson = JSON.parse(run(NPM, ['pack', '--json', '--pack-destination', tempRoot]));
    const forbiddenPayload = packJson[0].files
      .map((entry) => entry.path)
      .filter((file) => /(?:^|\/)(?:tests?|test-support|__pycache__)(?:\/|$)|\.(?:test\.cjs|py[co])$/.test(file));
    assert.deepEqual(forbiddenPayload, [], 'tarball must not ship tests or generated cache files');
    const tarball = path.join(tempRoot, packJson[0].filename);
    const consumer = path.join(tempRoot, 'consumer');
    fs.mkdirSync(consumer);
    run(NPM, ['init', '-y'], { cwd: consumer });
    run(NPM, ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer });
    const consumerAudit = JSON.parse(run(
      NPM, ['audit', '--omit=dev', '--audit-level=high', '--json'], { cwd: consumer },
    ));
    assert.equal(
      consumerAudit.metadata.vulnerabilities.total,
      0,
      JSON.stringify(consumerAudit.vulnerabilities, null, 2),
    );
    assert.equal(consumerAudit.metadata.vulnerabilities.moderate, 0);
    assert.equal(consumerAudit.metadata.vulnerabilities.high, 0);
    assert.equal(consumerAudit.metadata.vulnerabilities.critical, 0);

    const packageRoot = path.join(consumer, 'node_modules', PACKAGE.name);
    const packedPaths = packJson[0].files.map((entry) => entry.path);
    assert.equal(packedPaths.some((file) => file === 'skills/learn/SKILL.md'), false);
    assert.equal(packedPaths.some((file) => file === 'commands/learn.md'), false);
    assert.equal(packedPaths.some((file) => file.startsWith('output-styles/')), false);
    for (const legacyModule of [
      'workflow-state.cjs',
      'decision-dialogue.cjs',
      'context-spine.cjs',
      'project-breadcrumb.cjs',
      'spec-learning.cjs',
    ]) {
      assert.equal(
        packedPaths.includes(`mcp-server/lib/${legacyModule}`),
        false,
        `tarball must not ship retired semantic supervisor ${legacyModule}`,
      );
    }
    assert.ok(
      fs.existsSync(path.join(
        packageRoot,
        'mcp-server',
        'lib',
        'archive-mutation-worker.py',
      )),
      'tarball missing the archive mutation runtime',
    );
    const binRoot = path.join(consumer, 'node_modules', '.bin');
    const ubp = path.join(binRoot, process.platform === 'win32' ? 'ubp.cmd' : 'ubp');
    const ultraTools = path.join(binRoot, process.platform === 'win32' ? 'ultra-tools.cmd' : 'ultra-tools');
    assert.match(run(ubp, ['--version'], { cwd: consumer }), new RegExp(`v${PACKAGE.version}$`));
    assert.equal(run(ultraTools, ['--version'], { cwd: consumer }), PACKAGE.version);

    const cliProject = path.join(tempRoot, 'direct-cli-project');
    fs.mkdirSync(cliProject);
    const initialized = JSON.parse(run(ultraTools, [
      'task', 'init-project', '--target-dir', cliProject, '--project-name', 'tarball-cli',
    ], { cwd: consumer }));
    assert.equal(initialized.ok, true);
    assert.equal(initialized.data.status, 'created');
    assert.ok(fs.existsSync(path.join(cliProject, '.ultra', 'specs', 'product.md')));
    assert.ok(fs.existsSync(path.join(cliProject, '.ultra', '.runtime', 'state.db')));

    for (const doc of [
      'COMMIT-HASH-BACKFILL.md', 'DECISIONS.md', 'STATE-DB-ACCESS-POLICY.md',
      'WORKFLOW-LIFECYCLE.md',
    ]) {
      assert.ok(fs.existsSync(path.join(packageRoot, 'docs', doc)), `tarball missing docs/${doc}`);
    }
    assert.equal(
      fs.existsSync(path.join(packageRoot, 'docs', 'PLAN.zh-CN.md')),
      false,
      'historical implementation plans must not ship in the npm tarball',
    );
    assert.equal(
      fs.existsSync(path.join(packageRoot, 'docs', 'LEGACY-HERMES.md')),
      false,
      'retired Hermes documentation must not ship in the npm tarball',
    );
    for (const entry of packJson[0].files) {
      if (!/\.(?:cjs|js|json|md|py|toml|ya?ml)$/.test(entry.path)) continue;
      const text = fs.readFileSync(path.join(packageRoot, entry.path), 'utf8');
      assert.doesNotMatch(
        text,
        RETIRED_DISTRIBUTION_REFERENCES,
        `tarball contains a retired distribution reference in ${entry.path}`,
      );
      if (MODEL_PROMPT_PATH.test(entry.path)) {
        assert.doesNotMatch(text, /[\u3400-\u9fff]/u, `prompt contains Han text: ${entry.path}`);
        assert.doesNotMatch(
          text,
          PROMPT_HISTORY_RESIDUE,
          `prompt contains migration-history prose: ${entry.path}`,
        );
        assert.doesNotMatch(
          text,
          PROMPT_COMPARISON_RESIDUE,
          `prompt contains tutorial or host-comparison prose: ${entry.path}`,
        );
      }
    }

    const configRoot = path.join(tempRoot, 'hosts');
    for (const runtime of ['claude', 'opencode', 'codex', 'kimi', 'grok']) {
      const hostRoot = path.join(configRoot, runtime);
      const env = runtime === 'codex' ? { HOME: hostRoot } : {};
      run(ubp, [`--${runtime}`, '--config-dir', hostRoot], {
        cwd: consumer,
        env,
      });
      const doctor = JSON.parse(run(
        ubp,
        [`--${runtime}`, '--config-dir', hostRoot, '--doctor', '--json'],
        { cwd: consumer, env },
      ));
      assert.equal(doctor.status, 'healthy', JSON.stringify(doctor, null, 2));
      assert.deepEqual(doctor.reports.map((report) => report.adapter), [runtime]);
    }
    const installedRoots = {
      claude: path.join(configRoot, 'claude', 'skills', 'ultra-builder-pro'),
      opencode: path.join(configRoot, 'opencode', '.ultra-builder-pro'),
      codex: path.join(configRoot, 'codex', 'plugins', 'ultra-builder-pro'),
      kimi: path.join(configRoot, 'kimi', 'plugins', 'managed', 'ultra-builder-pro'),
      grok: path.join(configRoot, 'grok', 'plugins', 'ultra-builder-pro'),
    };
    for (const [runtime, root] of Object.entries(installedRoots)) {
      const contract = JSON.parse(fs.readFileSync(
        path.join(root, 'spec', 'interaction-contract.json'),
        'utf8',
      ));
      assert.equal(contract.schema_version, '1.3', runtime);
      assert.deepEqual(contract.interaction.semantic_selection_flow, EXPECTED_INTERACTION_FLOW);
      assert.equal(contract.interaction.adapter_authority, 'none');
      assert.equal(contract.routing.semantic_recommendation_owner, 'host_model');
      assert.equal(contract.routing.durable_recommendation_authority, false);
      assert.deepEqual(
        Object.keys(contract.public_capability_graph),
        EXPECTED_PUBLIC_COMMANDS,
        runtime,
      );
      for (const capability of Object.values(contract.public_capability_graph)) {
        assert.equal(capability.activation, 'explicit_only', runtime);
        assert.equal(capability.next_capability_source, 'host_model_from_ultra_context', runtime);
        assert.equal(capability.recommendation_owner, 'host_model', runtime);
        assert.equal(capability.selection_owner, 'user', runtime);
        assert.equal(capability.automatic_invocation, false, runtime);
      }
    }
    const launchers = {
      claude: path.join(configRoot, 'claude', 'skills', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
      opencode: path.join(configRoot, 'opencode', '.ultra-builder-pro', 'runtime', 'launch.cjs'),
      codex: path.join(configRoot, 'codex', 'plugins', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
      kimi: path.join(configRoot, 'kimi', 'plugins', 'managed', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
      grok: path.join(configRoot, 'grok', 'plugins', 'ultra-builder-pro', 'runtime', 'launch.cjs'),
    };
    for (const [runtime, launcher] of Object.entries(launchers)) {
      assert.ok(fs.existsSync(launcher), `${runtime} launcher missing`);
      assert.ok(!launcher.startsWith(REPO_ROOT), `${runtime} launcher leaked source checkout`);
      const bundledTools = path.join(path.dirname(launcher), 'ultra-tools.cjs');
      const journalWorker = path.join(
        path.dirname(launcher),
        'session-close-journal-worker.cjs',
      );
      const doctorBackupWorker = path.join(
        path.dirname(launcher),
        'doctor-backup-worker.cjs',
      );
      const archiveMutationWorker = path.join(
        path.dirname(launcher),
        'archive-mutation-worker.py',
      );
      assert.ok(fs.existsSync(journalWorker), `${runtime} session-close worker missing`);
      assert.ok(fs.existsSync(doctorBackupWorker), `${runtime} Doctor backup worker missing`);
      assert.ok(
        fs.existsSync(archiveMutationWorker),
        `${runtime} archive mutation worker missing`,
      );
      const runtimeSource = fs.readFileSync(
        path.join(path.dirname(launcher), 'index.cjs'),
        'utf8',
      );
      assert.match(
        runtimeSource,
        /archive-mutation-worker\.py/,
        `${runtime} bundled MCP does not resolve the installed archive worker`,
      );
      assert.doesNotMatch(
        runtimeSource,
        /const WORKFLOW_DEFINITIONS|function startWorkflow\(/,
        `${runtime} bundled MCP contains the retired semantic supervisor`,
      );
      invokeArchiveMutationWorker(
        archiveMutationWorker,
        path.join(tempRoot, 'archive-worker-smoke', runtime),
      );
      assert.equal(
        run(process.execPath, [bundledTools, '--version'], { cwd: consumer }),
        PACKAGE.version,
        `${runtime} bundled Ultra tools reported the wrong package version`,
      );
      const projectDir = path.join(tempRoot, 'projects', runtime);
      if (runtime === 'codex') {
        prepareLegacyMcpProject(ultraTools, projectDir, consumer);
      }
      await verifyMcp(launcher, projectDir, { migrateLegacy: runtime === 'codex' });
      const journalSid = `package-${runtime}`;
      const worktreePath = path.join(
        projectDir,
        '.ultra',
        '.runtime',
        'worktrees',
        journalSid,
      );
      const prepared = invokeJournalWorker(journalWorker, projectDir, {
        op: 'prepare',
        sid: journalSid,
        task_id: `task-${runtime}`,
        requested_status: 'completed',
        worktree_path: worktreePath,
      });
      assert.equal(prepared.phase, 'prepared');
      assert.equal(
        invokeJournalWorker(journalWorker, projectDir, {
          op: 'read',
          sid: journalSid,
        }).sid,
        journalSid,
      );
      assert.equal(
        invokeJournalWorker(journalWorker, projectDir, {
          op: 'update',
          sid: journalSid,
          patch: { phase: 'removal_failed', error: 'package smoke' },
          expected_generation: 0,
        }).generation,
        1,
      );
      assert.equal(
        invokeJournalWorker(journalWorker, projectDir, {
          op: 'discard',
          sid: journalSid,
          expected_generation: 1,
        }),
        true,
      );
      if (runtime === 'codex') {
        assert.equal(
          fs.lstatSync(
            path.join(projectDir, '.ultra', 'state.db'), // runtime-path-compatibility
          ).isFile(),
          true,
        );
        assert.deepEqual(
          JSON.parse(fs.readFileSync(
            path.join(projectDir, '.ultra', 'state.db'), // runtime-path-compatibility
            'utf8',
          )),
          {
            version: 1,
            kind: 'ultra-state-migration-tombstone',
            canonical_state_db: '.runtime/state.db',
          },
        );
        assert.equal(
          fs.readFileSync(
            path.join(projectDir, '.ultra', '.runtime', 'sessions', 'legacy.json'),
            'utf8',
          ),
          '{"legacy":true}\n',
        );
      }
    }

    const recoveryProject = path.join(tempRoot, 'packaged-doctor-recovery');
    fs.mkdirSync(recoveryProject);
    run('git', ['init'], { cwd: recoveryProject });
    run('git', ['config', 'user.email', 'package-smoke@example.invalid'], { cwd: recoveryProject });
    run('git', ['config', 'user.name', 'Package Smoke'], { cwd: recoveryProject });
    fs.writeFileSync(path.join(recoveryProject, 'README.md'), '# packaged recovery\n');
    run('git', ['add', 'README.md'], { cwd: recoveryProject });
    run('git', ['commit', '-m', 'fixture'], { cwd: recoveryProject });
    JSON.parse(run(ultraTools, [
      'task', 'init-project',
      '--target-dir', recoveryProject,
      '--project-name', 'packaged-recovery',
    ], { cwd: consumer }));

    const installedState = require(path.join(packageRoot, 'mcp-server', 'lib', 'state-db.cjs'));
    const installedOps = require(path.join(packageRoot, 'mcp-server', 'lib', 'state-ops.cjs'));
    const recoveryDbPath = path.join(recoveryProject, '.ultra', '.runtime', 'state.db');
    const recoveryState = installedState.initStateDb(recoveryDbPath);
    const recoverySid = 'packaged-doctor-sid';
    const recoveryTask = 'packaged-doctor-task';
    const recoveryWorktree = path.join(
      recoveryProject,
      '.ultra',
      '.runtime',
      'worktrees',
      recoverySid,
    );
    try {
      installedOps.createTask(recoveryState.db, {
        id: recoveryTask,
        title: 'Recover packaged journal',
        type: 'bugfix',
        priority: 'P0',
      });
      installedOps.createSession(recoveryState.db, {
        sid: recoverySid,
        task_id: recoveryTask,
        runtime: 'codex',
        pid: 2147483647,
        worktree_path: recoveryWorktree,
        artifact_dir: path.join(recoveryProject, '.ultra', '.runtime', 'artifacts', recoverySid),
      });
    } finally {
      installedState.closeStateDb(recoveryState.db);
    }
    const codexWorker = path.join(
      path.dirname(launchers.codex),
      'session-close-journal-worker.cjs',
    );
    invokeJournalWorker(codexWorker, recoveryProject, {
      op: 'prepare',
      sid: recoverySid,
      task_id: recoveryTask,
      requested_status: 'completed',
      worktree_path: recoveryWorktree,
    });
    const staleLock = writeDeadOwnerLock(recoveryProject, recoverySid);
    const doctorResult = spawnSync(
      process.execPath,
      [path.join(path.dirname(launchers.codex), 'ultra-tools.cjs'), 'system', 'doctor', '--repair'],
      {
        cwd: recoveryProject,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    const doctorEnvelope = JSON.parse(doctorResult.stdout.trim().split('\n').at(-1));
    assert.equal(doctorEnvelope.ok, true, doctorResult.stderr || doctorResult.stdout);
    assert.equal(doctorEnvelope.data.repair.close_intents.closed.length, 1);
    assert.equal(doctorEnvelope.data.repair.close_intents.close_pending.length, 0);
    assert.equal(fs.existsSync(staleLock), false);
    assert.equal(
      invokeJournalWorker(codexWorker, recoveryProject, {
        op: 'read',
        sid: recoverySid,
      }),
      null,
    );
    const recoveredDb = installedState.openStateDb(recoveryDbPath);
    try {
      assert.equal(installedOps.readSession(recoveredDb, recoverySid).status, 'completed');
    } finally {
      installedState.closeStateDb(recoveredDb);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
