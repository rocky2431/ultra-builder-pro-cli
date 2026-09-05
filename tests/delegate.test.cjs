'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'install.js');
const COMPATIBILITY_RUNNER = path.join(ROOT, 'bin', 'delegate.cjs');
const SKILL_RUNNER = path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'delegate.cjs');
const FAKE_ACP_AGENT = path.join(ROOT, 'tests', 'fixtures', 'fake-acp-agent.cjs');
const WAIT = path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'delegate_wait.py');
const {
  cancel: cancelDelegate,
  run: runDelegate,
  sameFileSystemEntry,
  sameFileSystemPath,
  status: statusDelegate,
} = require(SKILL_RUNNER);
const {
  ZCODE_BUNDLED_CLI,
  hostProfile,
  zcodeBinary,
} = require('../adapters/_shared/host-profile.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture(name = 'run-1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-delegate-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'delegate@example.invalid');
  git(root, 'config', 'user.name', 'Delegate Fixture');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'base.js'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.ultra/.runtime/\n');
  git(root, 'add', '.gitignore', 'src/base.js');
  git(root, 'commit', '-m', 'fixture');

  const delegation = path.join(root, '.ultra', '.runtime', 'delegations', name);
  const worktree = path.join(root, '.ultra', '.runtime', 'worktrees', name);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  fs.mkdirSync(delegation, { recursive: true });
  fs.writeFileSync(path.join(delegation, 'instruction.md'), '# Task\nCreate one bounded source file.\n');
  fs.writeFileSync(path.join(delegation, 'permission.json'), `${JSON.stringify({
    $schema: 'ultra-delegation-permission-v1',
    writable_roots: ['src'],
    external_effects: [],
  }, null, 2)}\n`);
  return { root, delegation, worktree };
}

function fakeCli(fx, body) {
  const file = path.join(fx.root, `fake-${path.basename(fx.delegation)}-${Math.random().toString(16).slice(2)}.cjs`);
  fs.writeFileSync(file, `#!/usr/bin/env node\n'use strict';\n${body}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

function resultPayload(changedFiles = ['src/delegated.js']) {
  return {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'Created the delegated source file.',
    changed_files: changedFiles,
    checks: [{ command: 'node --check src/delegated.js', status: 'not_run' }],
    evidence: ['src/delegated.js'],
    questions: [],
    residual_risks: [],
  };
}

function start(fx, fake, extra = [], runtime = 'codex', envExtra = {}) {
  return spawnSync(process.execPath, [
    CLI, 'delegate', 'run', '--to', runtime,
    '--instruction', path.join(fx.delegation, 'instruction.md'),
    '--permission', path.join(fx.delegation, 'permission.json'),
    '--worktree', fx.worktree,
    ...extra,
  ], {
    cwd: fx.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envExtra,
      ULTRA_DELEGATE_FORCE_CLI: '1',
      [`UBP_DELEGATE_${runtime.toUpperCase()}_BIN`]: fake,
    },
  });
}

function addDelegation(fx, name, worktree = fx.worktree) {
  const delegation = path.join(fx.root, '.ultra', '.runtime', 'delegations', name);
  fs.mkdirSync(delegation, { recursive: true });
  fs.writeFileSync(path.join(delegation, 'instruction.md'), '# Task\nCreate one bounded source file.\n');
  fs.writeFileSync(path.join(delegation, 'permission.json'), `${JSON.stringify({
    $schema: 'ultra-delegation-permission-v1',
    writable_roots: ['src'],
    external_effects: [],
  }, null, 2)}\n`);
  return delegation;
}

function launch(fx, delegation, fake, worktree = fx.worktree, extra = [], runtime = 'codex', envExtra = {}) {
  return spawnSync(process.execPath, [
    CLI, 'delegate', 'run', '--to', runtime,
    '--instruction', path.join(delegation, 'instruction.md'),
    '--permission', path.join(delegation, 'permission.json'),
    '--worktree', worktree,
    ...extra,
  ], {
    cwd: fx.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envExtra,
      ULTRA_DELEGATE_FORCE_CLI: '1',
      [`UBP_DELEGATE_${runtime.toUpperCase()}_BIN`]: fake,
    },
  });
}

function readEnvKeys(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

function canary(label) {
  return `ubp-d1-${label}-${crypto.randomUUID()}`;
}

function scanArtifactsForCanaries(files, canaries) {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const item of canaries) {
      assert.ok(
        !source.includes(item.value),
        `${path.basename(file)} retained the ${item.label} canary value`,
      );
      if (item.prohibitName) {
        assert.ok(
          !source.includes(item.name),
          `${path.basename(file)} retained the ${item.label} canary key name`,
        );
      }
    }
  }
}

function delegationArtifacts(delegation) {
  return ['worker-spec.json', 'receipt.json', 'result.json', 'stdout.log', 'stderr.log',
    'events.jsonl', 'host-result.json', 'writer.json']
    .map((name) => path.join(delegation, name));
}

function waitFor(file, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return JSON.parse(fs.readFileSync(file, 'utf8'));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  throw new Error(`timed out waiting for ${file}`);
}

function waitForExit(pid, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
  throw new Error(`timed out waiting for process ${pid}`);
}

// The worker publishes its terminal result inside `try` and only then unlinks
// the lock and releases the fence inside `finally`, so a readable result.json
// is the terminal proof, not the release proof: at that instant the lock and
// fence are still held by construction. A test that asserts the released
// boundary must synchronize on the worker actually finishing.
function waitForWorkerFinalized(delegation, timeout = 15000) {
  const receipt = JSON.parse(fs.readFileSync(path.join(delegation, 'receipt.json'), 'utf8'));
  waitForExit(receipt.worker_pid, timeout);
  return receipt;
}

// The observation moves not_started -> launching -> started; a writer test may
// only trust it once the started phase with a real PID is durably present.
function waitForWriterStarted(file, timeout = 7000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      const observation = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (observation.phase === 'started' && Number.isInteger(observation.pid) && observation.pid > 0) {
        return observation;
      }
    } catch {}
    if (Date.now() >= deadline) throw new Error(`timed out waiting for started writer at ${file}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

// An in-process delegation worker is the test process's own child: waiting for
// its self-exit must yield to the event loop so the child is reaped instead of
// reading as an eternal zombie under a blocking Atomics.wait poll.
async function waitForExitAsync(pid, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for process ${pid}`);
}

const WORKER = path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'delegate-worker.cjs');

function fenceRegistryOf(root) {
  return path.join(root, '.ultra', '.runtime', 'delegation-fences');
}

function heldFenceCount(root) {
  const registry = fenceRegistryOf(root);
  if (!fs.existsSync(registry)) return 0;
  return fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Runs the launcher as its own process through the library run() entry with a
// test-scoped post-spawn fault seam, so the launcher PID actually exits and
// cannot mask the launcher-PID recovery bug the way an in-process run does.
// Production code consumes no fault environment variable on this path.
function launchFaulted(fx, seam, fake, delegation = fx.delegation) {
  const launcher = [
    `const { run } = require(${JSON.stringify(SKILL_RUNNER)});`,
    'try {',
    '  const receipt = run([',
    "    '--to', 'codex',",
    `    '--instruction', ${JSON.stringify(path.join(delegation, 'instruction.md'))},`,
    `    '--permission', ${JSON.stringify(path.join(delegation, 'permission.json'))},`,
    `    '--worktree', ${JSON.stringify(fx.worktree)},`,
    "    '--timeout', '30',",
    `  ], { projectRoot: ${JSON.stringify(fx.root)}, faults: [${JSON.stringify(seam)}] });`,
    '  process.stdout.write(`${JSON.stringify(receipt)}\\n`);',
    '} catch (error) {',
    '  process.stderr.write(`${error.message}\\n`);',
    '  process.exitCode = 1;',
    '}',
  ].join('\n');
  return spawnSync(process.execPath, ['-e', launcher], {
    cwd: fx.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ULTRA_DELEGATE_FORCE_CLI: '1',
      UBP_DELEGATE_CODEX_BIN: fake,
    },
  });
}

function notStartedObservation(delegationId, launchId) {
  return `${JSON.stringify({
    $schema: 'ultra-delegation-writer-v2',
    delegation_id: delegationId,
    launch_id: launchId,
    phase: 'not_started',
    pid: null,
    pgid: null,
    platform: process.platform,
    command: null,
    argv_digest: null,
    started_at: new Date().toISOString(),
    start_identity: null,
  }, null, 2)}\n`;
}

// Fabricates one consistent stopped-worker recovery state (spec, receipt,
// lock, not_started writer observation, and a held fence) whose facts can then
// be selectively conflicted, reused, or symlinked by a recovery test.
function fabricateCancellableRun(fx, dir, {
  workerPid = 99999999,
  workerStartIdentity = null,
} = {}) {
  const { acquireWorktreeFence, fenceFileName } = require(SKILL_RUNNER);
  const delegationId = path.basename(dir);
  const launchId = crypto.randomUUID();
  const files = {
    schema: path.join(dir, 'result-schema.json'),
    spec: path.join(dir, 'worker-spec.json'),
    receipt: path.join(dir, 'receipt.json'),
    lock: path.join(dir, 'run.lock'),
    writer: path.join(dir, 'writer.json'),
    result: path.join(dir, 'result.json'),
    cancel: path.join(dir, 'cancel.request'),
  };
  fs.writeFileSync(files.schema, '{"type":"object"}\n');
  const spec = {
    $schema: 'ultra-delegation-worker-spec-v1',
    delegation_id: delegationId,
    launch_id: launchId,
    host: 'codex',
    model: null,
    command: '/bin/true',
    transport_maturity: 'documented+verified',
    transport_surface: 'fabricated fixture surface',
    execution_driver: 'cli',
    driver_fallback_reason: null,
    args: [],
    cwd: fx.worktree,
    project_root: fs.realpathSync(fx.root),
    instruction: path.join(dir, 'instruction.md'),
    permission: path.join(dir, 'permission.json'),
    instruction_digest: sha256File(path.join(dir, 'instruction.md')),
    permission_digest: sha256File(path.join(dir, 'permission.json')),
    output_schema: files.schema,
    output_schema_digest: sha256File(files.schema),
    host_output: path.join(dir, 'host-result.json'),
    read_only: true,
    writable_roots: [],
    writable_root_paths: [],
    base_head: git(fx.worktree, 'rev-parse', 'HEAD'),
    started_at: new Date().toISOString(),
    timeout_ms: 30000,
    result: files.result,
    stdout: path.join(dir, 'stdout.log'),
    stderr: path.join(dir, 'stderr.log'),
    events: null,
    lock: files.lock,
    cancel: files.cancel,
    writer_observation: files.writer,
    fence: path.join(fenceRegistryOf(fx.root), fenceFileName(delegationId)),
    env_keys: [],
    env: {},
  };
  fs.writeFileSync(files.spec, `${JSON.stringify(spec, null, 2)}\n`);
  const digest = sha256File(files.spec);
  const lockFacts = {
    delegation_id: delegationId,
    launch_id: launchId,
    started_at: spec.started_at,
    spec_digest: digest,
    pid: workerPid,
    worker_start_identity: workerStartIdentity,
  };
  fs.writeFileSync(files.receipt, `${JSON.stringify({
    $schema: 'ultra-delegation-receipt-v1',
    status: 'started',
    delegation_id: delegationId,
    launch_id: launchId,
    started_at: spec.started_at,
    spec_digest: digest,
    worker_pid: workerPid,
    worker_start_identity: workerStartIdentity,
    execution_driver: 'cli',
    driver_fallback_reason: null,
    events_file: null,
  }, null, 2)}\n`);
  fs.writeFileSync(files.lock, `${JSON.stringify(lockFacts, null, 2)}\n`);
  fs.writeFileSync(files.writer, notStartedObservation(delegationId, launchId));
  acquireWorktreeFence(fx.root, {
    delegationId,
    launchId,
    worktree: fx.worktree,
    writableRootPaths: [path.join(fx.worktree, 'src')],
  });
  return { spec, launchId, digest, files };
}

test('Windows canonical path identity ignores drive casing and separator spelling only', () => {
  assert.equal(sameFileSystemPath('D:\\a\\Repo\\Tree', 'd:/a/repo/tree', 'win32'), true);
  assert.equal(sameFileSystemPath('D:\\a\\Repo\\Tree', 'D:\\a\\Repo\\Tree\\', 'win32'), true);
  assert.equal(sameFileSystemPath('D:\\a\\Repo\\Tree', 'D:\\a\\Repo\\Other', 'win32'), false);
  assert.equal(sameFileSystemPath('/tmp/Repo', '/tmp/repo', 'linux'), false);
});

test('Windows worktree aliases resolve by filesystem identity before path spelling', () => {
  const identities = new Map([
    ['C:\\Users\\RUNNER~1\\worktree', { dev: 7n, ino: 42n }],
    ['C:\\Users\\runneradmin\\worktree', { dev: 7n, ino: 42n }],
    ['C:\\Users\\runneradmin\\other', { dev: 7n, ino: 43n }],
  ]);
  const stat = (value) => identities.get(value);
  assert.equal(sameFileSystemEntry(
    'C:\\Users\\RUNNER~1\\worktree',
    'C:\\Users\\runneradmin\\worktree',
    { platform: 'win32', stat },
  ), true);
  assert.equal(sameFileSystemEntry(
    'C:\\Users\\RUNNER~1\\worktree',
    'C:\\Users\\runneradmin\\other',
    { platform: 'win32', stat },
  ), false);
});

test('Skill-local delegation is canonical and the package CLI is a thin compatibility wrapper', () => {
  assert.ok(fs.existsSync(SKILL_RUNNER), SKILL_RUNNER);
  const canonical = require(SKILL_RUNNER);
  const compatibility = require(COMPATIBILITY_RUNNER);
  assert.equal(compatibility.handle, canonical.handle);
  assert.equal(compatibility.run, canonical.run);
  assert.equal(compatibility.status, canonical.status);
  assert.equal(compatibility.cancel, canonical.cancel);

  const help = spawnSync(process.execPath, [SKILL_RUNNER, '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: path.dirname(process.execPath) },
  });
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /delegate\.cjs <run\|status\|cancel>/u);
});

test('host profiles use bounded native permission modes without bypass flags', () => {
  const prompt = 'Read the packet and write the result.';  const cwd = '/tmp/worktree';
  const options = {
    readOnly: false,
    writableRoots: ['src'],
    schemaFile: '/tmp/schema.json',
    schemaJson: '{"type":"object"}',
    hostOutput: '/tmp/result.json',
  };
  const claude = hostProfile('claude').delegateArgv(prompt, cwd, options);
  const codex = hostProfile('codex').delegateArgv(prompt, cwd, options);
  const opencode = hostProfile('opencode').delegateArgv(prompt, cwd, options);
  const kimi = hostProfile('kimi').delegateArgv(prompt, cwd, options);
  const grok = hostProfile('grok').delegateArgv(prompt, cwd, options);
  const zcode = hostProfile('zcode').delegateArgv(prompt, cwd, options);
  assert.deepEqual(claude.slice(0, 2), ['-p', prompt]);
  assert.equal(claude[claude.indexOf('--tools') + 1], 'Read,Write,Edit,Grep,Glob');
  assert.ok(!claude.includes('--json-schema'));
  assert.deepEqual(codex.slice(0, 2), ['exec', '--ephemeral']);
  assert.ok(codex.includes('--ignore-user-config'));
  assert.ok(!codex.includes('--ignore-rules'));
  assert.equal(codex[codex.indexOf('--sandbox') + 1], 'workspace-write');
  assert.ok(codex.includes('sandbox_workspace_write.network_access=false'));
  assert.deepEqual(opencode.slice(0, 3), ['run', '--dir', cwd]);
  assert.ok(opencode.includes('--auto'));
  const opencodeConfig = JSON.parse(hostProfile('opencode').delegateEnv(options).OPENCODE_CONFIG_CONTENT);
  assert.equal(opencodeConfig.permission.bash, 'deny');
  assert.equal(opencodeConfig.permission.external_directory, 'deny');
  assert.equal(opencodeConfig.permission.edit['src/**'], 'allow');
  assert.ok(kimi.includes('--agent-file'));
  assert.match(kimi[kimi.indexOf('--agent-file') + 1], /kimi-write\.md$/);
  assert.ok(!kimi.includes('--yolo'));
  assert.ok(!kimi.includes('--auto'));
  assert.ok(grok.includes('--disable-web-search'));
  assert.ok(grok.includes('--no-subagents'));
  assert.ok(!grok.includes('--json-schema'));
  assert.ok(grok.includes('--verbatim'));
  assert.equal(grok[grok.indexOf('--max-turns') + 1], '12');
  assert.equal(grok[grok.indexOf('--sandbox') + 1], 'workspace');
  assert.deepEqual(zcode.slice(0, 2), ['--cwd', cwd]);
  assert.deepEqual(zcode.slice(-2), ['--prompt', prompt]);
  assert.equal(zcode[zcode.indexOf('--mode') + 1], 'edit');
  assert.ok(!zcode.includes('--max-turns'));
  assert.ok(!zcode.includes('--allowed-tools'));
  assert.match(zcode[zcode.indexOf('--disallowedTools') + 1], /Bash/);

  const readOnly = { ...options, readOnly: true, writableRoots: [] };
  const readOnlyClaude = hostProfile('claude').delegateArgv(prompt, cwd, readOnly);
  const readOnlyCodex = hostProfile('codex').delegateArgv(prompt, cwd, readOnly);
  const readOnlyKimi = hostProfile('kimi').delegateArgv(prompt, cwd, readOnly);
  const readOnlyGrok = hostProfile('grok').delegateArgv(prompt, cwd, readOnly);
  const readOnlyZcode = hostProfile('zcode').delegateArgv(prompt, cwd, readOnly);
  assert.equal(readOnlyClaude[readOnlyClaude.indexOf('--permission-mode') + 1], 'plan');
  assert.equal(readOnlyCodex[readOnlyCodex.indexOf('--sandbox') + 1], 'read-only');
  assert.match(readOnlyKimi.at(-1), /kimi-read-only\.md$/);
  assert.equal(readOnlyGrok[readOnlyGrok.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(readOnlyZcode[readOnlyZcode.indexOf('--mode') + 1], 'plan');
  assert.match(
    readOnlyZcode[readOnlyZcode.indexOf('--disallowedTools') + 1],
    /Write Edit ApplyPatch/,
  );
  assert.equal(
    JSON.parse(hostProfile('opencode').delegateEnv(readOnly).OPENCODE_CONFIG_CONTENT)
      .permission.edit['*'],
    'deny',
  );

  const selectedKimi = hostProfile('kimi').delegateArgv(prompt, cwd, {
    ...options,
    model: 'kimi-code/k3',
  });
  assert.equal(selectedKimi[selectedKimi.indexOf('--model') + 1], 'kimi-code/k3');
});

test('the launcher runs a conformance-passed ACP profile through the unchanged terminal result validator', () => {
  const fx = fixture('acp-integration');
  try {
    const expected = resultPayload([]);
    const trace = path.join(fx.delegation, 'fake-acp-trace.jsonl');
    const profile = {
      binary: process.execPath,
      transportMaturity: 'documented+verified',
      acp: {
        surface: 'fixture ACP stdio',
        transport: 'stdio',
        protocolVersions: [1],
        conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
        command: () => process.execPath,
        argv: () => [FAKE_ACP_AGENT],
      },
      delegateEnv: () => ({
        FAKE_ACP_SCENARIO: 'happy',
        FAKE_ACP_TRACE: trace,
        FAKE_ACP_RESULT: JSON.stringify(expected),
      }),
    };
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '5',
    ], {
      projectRoot: fx.root,
      resolveHostProfile: () => profile,
    });
    assert.equal(receipt.execution_driver, 'acp');
    assert.equal(receipt.driver_fallback_reason, null);
    assert.equal(receipt.acp_capability.conformance_status, 'passed');
    assert.equal(
      receipt.events_file,
      path.join(fs.realpathSync(fx.root), '.ultra', '.runtime', 'delegations', 'acp-integration', 'events.jsonl'),
    );

    const result = waitFor(receipt.result_file);
    assert.equal(result.status, 'finished', JSON.stringify(result));
    assert.equal(result.execution_driver, 'acp');
    assert.equal(result.acp_protocol_version, 1);
    assert.equal(result.acp_stop_reason, 'end_turn');
    assert.deepEqual(result.changed_files, []);
    assert.ok(fs.existsSync(receipt.events_file));
    assert.match(fs.readFileSync(receipt.events_file, 'utf8'), /"type":"terminal"/u);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ACP authentication failure before prompt falls back once to the bounded CLI driver', () => {
  const fx = fixture('acp-auth-fallback');
  try {
    const expected = resultPayload([]);
    const cli = fakeCli(fx, `process.stdout.write(${JSON.stringify(JSON.stringify(expected))});`);
    const profile = {
      binary: cli,
      transportMaturity: 'documented+verified',
      acp: {
        surface: 'fixture ACP stdio',
        transport: 'stdio',
        protocolVersions: [1],
        conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
        command: () => process.execPath,
        argv: () => [FAKE_ACP_AGENT],
      },
      delegateArgv: () => [],
      delegateEnv: () => ({ FAKE_ACP_SCENARIO: 'auth-required' }),
    };
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '5',
    ], {
      projectRoot: fx.root,
      resolveHostProfile: () => profile,
    });
    assert.equal(receipt.execution_driver, 'acp');
    const result = waitFor(receipt.result_file);
    assert.equal(result.status, 'finished', JSON.stringify(result));
    assert.equal(result.execution_driver, 'cli');
    assert.equal(result.driver_fallback_reason, 'acp_auth_required');
    assert.equal(result.acp_fallback.prompt_sent, false);
    assert.equal(result.acp_fallback.protocol_version, 1);
    assert.deepEqual(result.changed_files, []);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an ACP end_turn without the exact Ultra result remains missing_result', () => {
  const fx = fixture('acp-stop-is-not-complete');
  try {
    const profile = {
      binary: process.execPath,
      transportMaturity: 'documented+verified',
      acp: {
        surface: 'fixture ACP stdio',
        transport: 'stdio',
        protocolVersions: [1],
        conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
        command: () => process.execPath,
        argv: () => [FAKE_ACP_AGENT],
      },
      delegateEnv: () => ({ FAKE_ACP_SCENARIO: 'no-result' }),
    };
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '5',
    ], {
      projectRoot: fx.root,
      resolveHostProfile: () => profile,
    });
    const result = waitFor(receipt.result_file);
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'missing_result');
    assert.equal(result.acp_stop_reason, 'end_turn');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ACP status exposes only the latest derived observation and cancellation leaves no orphan', () => {
  const fx = fixture('acp-status-cancel');
  const childPidFile = path.join(fx.delegation, 'fake-acp-child.pid');
  try {
    const profile = {
      binary: process.execPath,
      transportMaturity: 'documented+verified',
      acp: {
        surface: 'fixture ACP stdio',
        transport: 'stdio',
        protocolVersions: [1],
        conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
        command: () => process.execPath,
        argv: () => [FAKE_ACP_AGENT],
      },
      delegateEnv: () => ({
        FAKE_ACP_SCENARIO: 'cancel',
        FAKE_ACP_CHILD_PID: childPidFile,
      }),
    };
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '10',
    ], {
      projectRoot: fx.root,
      resolveHostProfile: () => profile,
    });
    const childPid = waitFor(childPidFile);
    const snapshot = statusDelegate(['--delegation', fx.delegation], { projectRoot: fx.root });
    assert.equal(snapshot.status, 'running');
    assert.equal(snapshot.execution_driver, 'acp');
    assert.equal(snapshot.execution_observation.status, 'observed');
    assert.ok(snapshot.execution_observation.event_count >= 2);
    assert.equal('content' in snapshot.execution_observation.latest, false);

    cancelDelegate(['--delegation', fx.delegation], { projectRoot: fx.root });
    const result = waitFor(receipt.result_file);
    assert.equal(result.failure_type, 'cancelled');
    assert.equal(result.acp_protocol_version, 1);
    waitForExit(childPid);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ACP status projects a fixed safe event shape even when the derived journal is tampered', () => {
  const fx = fixture('acp-status-tampered-event');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'receipt.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-receipt-v1',
      status: 'started',
      delegation_id: 'acp-status-tampered-event',
      worker_pid: 99999999,
      execution_driver: 'acp',
      driver_fallback_reason: null,
      events_file: path.join(fx.delegation, 'events.jsonl'),
    })}\n`);
    fs.writeFileSync(path.join(fx.delegation, 'events.jsonl'), `${JSON.stringify({
      sequence: 1,
      observed_at: '2026-08-25T00:00:00Z',
      type: 'update',
      update_type: 'tool_call',
      tool_kind: 'read',
      tool_status: 'completed',
      location_count: 0,
      content: 'journal-secret',
      rawInput: { token: 'credential-secret' },
    })}\n`);

    const snapshot = statusDelegate(
      ['--delegation', fx.delegation],
      { projectRoot: fx.root },
    );
    assert.equal(snapshot.execution_observation.status, 'observed');
    assert.deepEqual(snapshot.execution_observation.latest, {
      sequence: 1,
      observed_at: '2026-08-25T00:00:00Z',
      type: 'update',
      update_type: 'tool_call',
      tool_kind: 'read',
      tool_status: 'completed',
      location_count: 0,
    });
    assert.doesNotMatch(JSON.stringify(snapshot), /journal-secret|credential-secret/u);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('the ZCode delegate transport reports experimental maturity until the support bar is met', () => {
  assert.equal(hostProfile('zcode').transportMaturity, 'experimental');
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok']) {
    assert.notEqual(hostProfile(runtime).transportMaturity, 'experimental');
  }
});

test('delegate run surfaces experimental maturity and fails closed on unqualified enforcement', () => {
  const fx = fixture('zcode-experimental');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-permission-v1',
      writable_roots: [],
      external_effects: [],
    }, null, 2)}\n`);
    const payload = JSON.stringify(resultPayload([]));
    const fake = fakeCli(fx, `process.stdout.write(${JSON.stringify(payload)});`);

    // The experimental-maturity disclosure gate still refuses an
    // unacknowledged launch, and no receipt exists.
    const unacknowledged = start(fx, fake, [], 'zcode');
    assert.notEqual(unacknowledged.status, 0);
    assert.match(unacknowledged.stderr, /experimental/iu);
    assert.match(unacknowledged.stderr, /--ack-experimental/u);
    assert.match(unacknowledged.stderr, /not the documented ZCode Desktop interactive surface/iu);
    assert.equal(fs.existsSync(path.join(fx.delegation, 'receipt.json')), false);

    // An acknowledged launch is still refused by the retained exact-version
    // enforcement qualification. The forced CLI transport has no retained
    // observation, so the one typed unavailable diagnostic fires before the
    // fence, the worker spec, the worker, or any Host process: forcing the CLI
    // transport is not a silent fallback past the qualification.
    const refused = start(fx, fake, ['--ack-experimental'], 'zcode');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /host enforcement unavailable/iu);
    assert.match(refused.stderr, /transport cli/iu);
    assert.match(refused.stderr, /outside_root_denial/u);
    assert.doesNotMatch(refused.stderr, /writable_scope/u);
    for (const artifact of [
      ...delegationArtifacts(fx.delegation),
      path.join(fx.delegation, 'result-schema.json'),
      path.join(fx.delegation, 'run.lock'),
    ]) {
      assert.equal(fs.existsSync(artifact), false, `${artifact} must not exist after refusal`);
    }
    assert.equal(heldFenceCount(fx.root), 0);

    // A write packet additionally requires writable_scope and names it.
    const writeFx = fixture('zcode-enforcement-write');
    try {
      const writeFake = fakeCli(writeFx, `process.stdout.write(${JSON.stringify(payload)});`);
      const writeRefused = start(writeFx, writeFake, ['--ack-experimental'], 'zcode');
      assert.notEqual(writeRefused.status, 0);
      assert.match(writeRefused.stderr, /host enforcement unavailable/iu);
      assert.match(writeRefused.stderr, /writable_scope/u);
      assert.equal(heldFenceCount(writeFx.root), 0);
    } finally {
      fs.rmSync(writeFx.root, { recursive: true, force: true });
    }

    // The ACP transport the qualification observed fails closed with the
    // observed unsupported/unobserved statuses through one typed error, again
    // before the fence, the worker spec, or any Host process.
    const acpProbe = [
      `const { run } = require(${JSON.stringify(SKILL_RUNNER)});`,
      'try {',
      '  run([',
      "    '--to', 'zcode', '--ack-experimental',",
      `    '--instruction', ${JSON.stringify(path.join(fx.delegation, 'instruction.md'))},`,
      `    '--permission', ${JSON.stringify(path.join(fx.delegation, 'permission.json'))},`,
      `    '--worktree', ${JSON.stringify(fx.worktree)},`,
      '  ], {',
      `    projectRoot: ${JSON.stringify(fx.root)},`,
      '    chooseExecutionDriver: () => ({',
      "      driver: 'acp', command: 'fixture-acp-adapter-not-installed', args: [], protocolVersion: 1,",
      '      fallbackReason: null, acpCapability: {},',
      '    }),',
      '  });',
      '} catch (error) {',
      '  process.stdout.write(`${JSON.stringify({ code: error.code, name: error.name, admission: error.admission })}\\n`);',
      '  process.exitCode = 1;',
      '}',
    ].join('\n');
    const acpRefused = spawnSync(process.execPath, ['-e', acpProbe], {
      cwd: fx.root,
      encoding: 'utf8',
      env: { ...process.env, UBP_DELEGATE_ZCODE_BIN: fake },
    });
    assert.equal(acpRefused.status, 1, acpRefused.stdout + acpRefused.stderr);
    const refusal = JSON.parse(acpRefused.stdout);
    assert.equal(refusal.code, 'UBP_HOST_ENFORCEMENT_UNAVAILABLE');
    assert.equal(refusal.name, 'HostEnforcementUnavailableError');
    assert.equal(refusal.admission.route, 'unavailable');
    assert.equal(refusal.admission.transport, 'acp-stdio');
    assert.deepEqual(refusal.admission.dimensions.map((entry) => [entry.dimension, entry.status]), [
      ['outside_root_denial', 'unobserved'],
      ['shell_tool_denial', 'unobserved'],
      ['agent_tool_network_denial', 'unobserved'],
      ['point_of_use_effect_boundary', 'unobserved'],
    ]);
    assert.equal(refusal.admission.evidence.receipt_sha256, sha256File(path.join(
      ROOT, '.ultra', 'evidence', 'vnext-d1-host-enforcement-qualification', 'host-enforcement-receipt.json',
    )));
    assert.doesNotMatch(JSON.stringify(refusal), /sk-[A-Za-z0-9]{8,}|Bearer\s|AKIA[0-9A-Z]{8,}/u);
    for (const artifact of [
      ...delegationArtifacts(fx.delegation),
      path.join(fx.delegation, 'result-schema.json'),
      path.join(fx.delegation, 'run.lock'),
    ]) {
      assert.equal(fs.existsSync(artifact), false, `${artifact} must not exist after ACP-route refusal`);
    }
    assert.equal(heldFenceCount(fx.root), 0);

    // A gated Host whose exact qualification supports every required dimension
    // is admitted and launches through the unchanged path and result contract.
    const qualifiedFx = fixture('zcode-qualified-gate');
    try {
      const qualifiedFake = fakeCli(
        qualifiedFx,
        `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'src', 'delegated.js'), 'module.exports = 42;\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload(['src/delegated.js'])))});
`,
      );
      const qualifiedProbe = [
        `const { hostProfile } = require(${JSON.stringify(path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'host-profile.cjs'))});`,
        `const { run } = require(${JSON.stringify(SKILL_RUNNER)});`,
        'const record = hostProfile("zcode").enforcement;',
        'const dimensions = {};',
        'for (const name of ["writable_scope", "outside_root_denial", "shell_tool_denial", "agent_tool_network_denial", "point_of_use_effect_boundary"]) {',
        '  dimensions[name] = { observation: "supported", admission: "supported", basis: "fixture: exact observed support" };',
        '}',
        'const profile = {',
        '  ...hostProfile("zcode"),',
        '  enforcement: { ...record, transports: { "acp-stdio": { dimensions }, cli: { dimensions } } },',
        '};',
        'try {',
        '  const receipt = run([',
        "    '--to', 'zcode', '--ack-experimental',",
        `    '--instruction', ${JSON.stringify(path.join(qualifiedFx.delegation, 'instruction.md'))},`,
        `    '--permission', ${JSON.stringify(path.join(qualifiedFx.delegation, 'permission.json'))},`,
        `    '--worktree', ${JSON.stringify(qualifiedFx.worktree)},`,
        "    '--timeout', '30',",
        '  ], { projectRoot: ' + JSON.stringify(qualifiedFx.root) + ', resolveHostProfile: () => profile });',
        '  process.stdout.write(`${JSON.stringify({ launched: true, driver: receipt.execution_driver })}\\n`);',
        '} catch (error) {',
        '  process.stdout.write(`${JSON.stringify({ launched: false, message: error.message })}\\n`);',
        '  process.exitCode = 1;',
        '}',
      ].join('\n');
      const qualified = spawnSync(process.execPath, ['-e', qualifiedProbe], {
        cwd: qualifiedFx.root,
        encoding: 'utf8',
        env: { ...process.env, ULTRA_DELEGATE_FORCE_CLI: '1', UBP_DELEGATE_ZCODE_BIN: qualifiedFake },
      });
      assert.equal(qualified.status, 0, qualified.stdout + qualified.stderr);
      const launched = JSON.parse(qualified.stdout);
      assert.equal(launched.launched, true);
      assert.equal(launched.driver, 'cli');
      const qualifiedResult = waitFor(path.join(qualifiedFx.delegation, 'result.json'));
      assert.equal(qualifiedResult.status, 'finished');
      assert.deepEqual(qualifiedResult.changed_files, ['src/delegated.js']);
    } finally {
      fs.rmSync(qualifiedFx.root, { recursive: true, force: true });
    }

    const documented = fixture('codex-documented');
    try {
      const codexFake = fakeCli(documented, `process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});`);
      const codexStart = start(documented, codexFake);
      assert.equal(codexStart.status, 0, codexStart.stderr);
      assert.doesNotMatch(codexStart.stderr, /--ack-experimental/u);
      const codexReceipt = JSON.parse(codexStart.stdout);
      assert.equal(codexReceipt.transport_maturity, 'documented+verified');
      assert.equal(codexReceipt.experimental_ack, undefined);
      assert.equal(codexReceipt.execution_driver, 'cli');
      assert.equal(codexReceipt.driver_fallback_reason, 'acp_forced_cli');
      assert.equal(codexReceipt.acp_capability.candidate, true);
      const codexResult = waitFor(path.join(documented.delegation, 'result.json'));
      assert.equal(codexResult.transport_maturity, 'documented+verified');
      assert.equal(codexResult.execution_driver, 'cli');
      assert.equal(codexResult.driver_fallback_reason, 'acp_forced_cli');
    } finally {
      fs.rmSync(documented.root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an all-transports-unavailable qualification rejects before any executable identity probe', () => {
  const fx = fixture('zcode-pre-admission-probe');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-permission-v1',
      writable_roots: [],
      external_effects: [],
    }, null, 2)}\n`);
    // Two fake executables stand in for the adapter bridge and the runtime
    // CLI. Any identity-probe invocation durably records itself, so a marker
    // file after the refusal proves the launcher ran Host-side code before
    // the fail-closed decision.
    const marker = path.join(fx.root, 'identity-probe-invoked');
    const canaryBody = (stdout) => [
      'const fs = require(\'node:fs\');',
      `fs.writeFileSync(${JSON.stringify(marker)}, 'invoked');`,
      `process.stdout.write(${JSON.stringify(stdout)});`,
    ].join('\n');
    const bridge = fakeCli(fx, canaryBody('zcode-acp 0.1.0+ultra.zcode.0.16.5'));
    const runtime = fakeCli(fx, canaryBody('0.16.5'));
    // The ordinary ACP-first route with the production selector: no forced
    // CLI, no injected driver, and both probe executables would pass.
    const probe = [
      `const { run } = require(${JSON.stringify(SKILL_RUNNER)});`,
      'try {',
      '  run([',
      "    '--to', 'zcode', '--ack-experimental',",
      `    '--instruction', ${JSON.stringify(path.join(fx.delegation, 'instruction.md'))},`,
      `    '--permission', ${JSON.stringify(path.join(fx.delegation, 'permission.json'))},`,
      `    '--worktree', ${JSON.stringify(fx.worktree)},`,
      '  ], { projectRoot: ' + JSON.stringify(fx.root) + ' });',
      '  process.stdout.write(\'launched\');',
      '} catch (error) {',
      '  process.stdout.write(`${JSON.stringify({ code: error.code, name: error.name, admission: error.admission })}\\n`);',
      '  process.exitCode = 1;',
      '}',
    ].join('\n');
    const refused = spawnSync(process.execPath, ['-e', probe], {
      cwd: fx.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ULTRA_ZCODE_ACP_COMMAND: bridge,
        UBP_DELEGATE_ZCODE_BIN: runtime,
        UBP_TEST_PROBE_CANARY: 'sk-pre-admission-probe-secret',
      },
    });
    assert.equal(refused.status, 1, refused.stdout + refused.stderr);
    const refusal = JSON.parse(refused.stdout);
    assert.equal(refusal.code, 'UBP_HOST_ENFORCEMENT_UNAVAILABLE');
    assert.equal(refusal.name, 'HostEnforcementUnavailableError');
    assert.equal(refusal.admission.route, 'unavailable');
    assert.equal(refusal.admission.transport, 'acp-stdio');
    assert.deepEqual(refusal.admission.dimensions.map((entry) => [entry.dimension, entry.status]), [
      ['outside_root_denial', 'unobserved'],
      ['shell_tool_denial', 'unobserved'],
      ['agent_tool_network_denial', 'unobserved'],
      ['point_of_use_effect_boundary', 'unobserved'],
    ]);
    // The retained capability facts alone decide the refusal: no
    // process-backed identity probe, fence, worker spec, worker, or Host
    // process may exist behind it.
    assert.equal(
      fs.existsSync(marker),
      false,
      'an executable identity probe ran before the all-transports-unavailable refusal',
    );
    for (const artifact of [
      ...delegationArtifacts(fx.delegation),
      path.join(fx.delegation, 'result-schema.json'),
      path.join(fx.delegation, 'run.lock'),
    ]) {
      assert.equal(fs.existsSync(artifact), false, `${artifact} must not exist after refusal`);
    }
    assert.equal(heldFenceCount(fx.root), 0);
    assert.doesNotMatch(refused.stdout + refused.stderr, /sk-pre-admission-probe-secret/u);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('both public delegate process boundaries emit one typed redacted unavailable diagnostic', () => {
  const fx = fixture('zcode-typed-boundary');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-permission-v1',
      writable_roots: [],
      external_effects: [],
    }, null, 2)}\n`);
    const payload = JSON.stringify(resultPayload([]));
    const fake = fakeCli(fx, `process.stdout.write(${JSON.stringify(payload)});`);
    const secret = 'sk-typed-boundary-secret';
    const direct = spawnSync(process.execPath, [
      SKILL_RUNNER, 'run', '--to', 'zcode', '--ack-experimental',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
    ], {
      cwd: fx.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ULTRA_DELEGATE_FORCE_CLI: '1',
        UBP_DELEGATE_ZCODE_BIN: fake,
        UBP_TEST_BOUNDARY_SECRET: secret,
      },
    });
    const compatibility = start(fx, fake, ['--ack-experimental'], 'zcode', {
      UBP_TEST_BOUNDARY_SECRET: secret,
    });
    for (const [label, outcome] of [['installed skill runner', direct], ['ubp delegate compatibility', compatibility]]) {
      assert.notEqual(outcome.status, 0, `${label}: nonzero exit`);
      const diagnostics = outcome.stderr.split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        })
        .filter((value) => value && typeof value === 'object');
      assert.equal(
        diagnostics.length,
        1,
        `${label}: exactly one parseable JSON diagnostic, got: ${JSON.stringify(outcome.stderr)}`,
      );
      const diagnostic = diagnostics[0];
      assert.equal(diagnostic.code, 'UBP_HOST_ENFORCEMENT_UNAVAILABLE');
      assert.equal(diagnostic.error, 'host_enforcement_unavailable');
      assert.equal(diagnostic.admission.code, 'host_enforcement_unavailable');
      assert.equal(diagnostic.admission.route, 'unavailable');
      assert.equal(diagnostic.admission.transport, 'cli');
      assert.ok(
        Array.isArray(diagnostic.admission.dimensions) && diagnostic.admission.dimensions.length > 0,
        `${label}: admission dimensions retained`,
      );
      assert.match(diagnostic.message, /host enforcement unavailable/iu);
      assert.match(diagnostic.message, /no silent fallback/u);
      assert.match(diagnostic.message, /Evidence: /u);
      assert.doesNotMatch(outcome.stderr + outcome.stdout, new RegExp(secret, 'u'));
      assert.doesNotMatch(
        JSON.stringify(diagnostic),
        /sk-[A-Za-z0-9]{8,}|Bearer\s|AKIA[0-9A-Z]{8,}/u,
      );
    }
    for (const artifact of [
      ...delegationArtifacts(fx.delegation),
      path.join(fx.delegation, 'result-schema.json'),
      path.join(fx.delegation, 'run.lock'),
    ]) {
      assert.equal(fs.existsSync(artifact), false, `${artifact} must not exist after refusal`);
    }
    assert.equal(heldFenceCount(fx.root), 0);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('ZCode binary selection prefers the bundled macOS CLI before the PATH fallback', () => {
  assert.equal(
    zcodeBinary({
      platform: 'darwin',
      exists: (candidate) => candidate === ZCODE_BUNDLED_CLI,
    }),
    ZCODE_BUNDLED_CLI,
  );
  assert.equal(zcodeBinary({ platform: 'darwin', exists: () => false }), 'zcode');
  assert.equal(zcodeBinary({ platform: 'linux', exists: () => true }), 'zcode');
});

test('delegate records and forwards an explicit Kimi model selection', () => {
  const fx = fixture('kimi-model');
  try {
    const payload = JSON.stringify(resultPayload([]));
    const fake = fakeCli(fx, `process.stdout.write(${JSON.stringify(payload)});`);
    const started = start(fx, fake, ['--model', 'kimi-code/k3'], 'kimi');
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    assert.equal(receipt.model, 'kimi-code/k3');
    assert.equal(receipt.execution_driver, 'cli');
    assert.equal(receipt.driver_fallback_reason, 'acp_forced_cli');
    const spec = JSON.parse(fs.readFileSync(path.join(fx.delegation, 'worker-spec.json'), 'utf8'));
    assert.equal(spec.model, 'kimi-code/k3');
    assert.equal(spec.args[spec.args.indexOf('--model') + 1], 'kimi-code/k3');
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'finished');
    assert.equal(result.execution_driver, 'cli');
    assert.equal(result.driver_fallback_reason, 'acp_forced_cli');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('delegate extracts a pretty fenced result after host commentary', () => {
  const fx = fixture('fenced-result');
  try {
    const payload = resultPayload([]);
    const fake = fakeCli(fx, `
const payload = ${JSON.stringify(payload)};
process.stdout.write('The bounded review is complete.\\n\\n\`\`\`json\\n');
process.stdout.write(JSON.stringify(payload, null, 2));
process.stdout.write('\\n\`\`\`\\n');
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'finished');
    assert.equal(result.summary, payload.summary);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('delegate publishes a digest-bound result after enforcing the isolated Git diff', () => {
  const fx = fixture();
  try {
    const payload = JSON.stringify(resultPayload());
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'src', 'delegated.js'), 'module.exports = 42;\\n');
process.stdout.write(JSON.stringify({ type: 'assistant', content: ${JSON.stringify(payload)} }));
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    assert.equal(receipt.$schema, 'ultra-delegation-receipt-v1');
    assert.equal(receipt.status, 'started');
    assert.ok(/^[0-9a-f]{64}$/.test(receipt.instruction_digest));
    assert.ok(/^[0-9a-f]{64}$/.test(receipt.permission_digest));
    assert.ok(/^[0-9a-f]{64}$/.test(receipt.output_schema_digest));
    assert.equal(receipt.read_only, false);
    assert.match(
      receipt.cancel_command,
      /skills[\\/]ultra-delegate[\\/]scripts[\\/]delegate\.cjs/u,
    );
    assert.doesNotMatch(receipt.cancel_command, /(?:^|\s)"?ubp"?\s+delegate\b/u);

    const spec = JSON.parse(fs.readFileSync(path.join(fx.delegation, 'worker-spec.json'), 'utf8'));
    assert.match(spec.args.at(-1), /# Task\nCreate one bounded source file\./u);
    assert.match(spec.args.at(-1), /"writable_roots": \[\s*"src"/u);
    assert.match(
      spec.args.at(-1),
      /The exact fields are \$schema, status, summary, changed_files, checks, evidence, questions, and residual_risks\./u,
    );
    assert.doesNotMatch(spec.args.at(-1), /Read the immutable instruction file/u);
    const nativeSchema = JSON.parse(fs.readFileSync(
      path.join(fx.delegation, 'result-schema.json'), 'utf8',
    ));
    assert.equal(nativeSchema.properties.$schema.type, 'string');
    assert.equal(nativeSchema.properties.status.type, 'string');
    assert.equal(nativeSchema.properties.checks.items.properties.status.type, 'string');
    assert.ok(!('uniqueItems' in nativeSchema.properties.changed_files));
    assert.ok(nativeSchema.properties.checks.items.required.includes('output_ref'));

    const resultFile = path.join(fx.delegation, 'result.json');
    const result = waitFor(resultFile);
    assert.equal(result.status, 'finished');
    assert.equal(result.host, 'codex');
    assert.equal(result.instruction_digest, receipt.instruction_digest);
    assert.equal(result.permission_digest, receipt.permission_digest);
    assert.equal(result.output_schema_digest, receipt.output_schema_digest);
    assert.equal(result.read_only, false);
    assert.deepEqual(result.changed_files, ['src/delegated.js']);
    assert.equal(typeof result.base_head, 'string');
    assert.equal(typeof result.final_head, 'string');
    waitForWorkerFinalized(fx.delegation);
    assert.equal(fs.existsSync(path.join(fx.delegation, 'run.lock')), false);

    const waited = spawnSync('python3', [WAIT, resultFile, '--interval', '0.01', '--timeout', '2'], { encoding: 'utf8' });
    assert.equal(waited.status, 0, waited.stderr);
    assert.equal(JSON.parse(waited.stdout).status, 'finished');

    const status = spawnSync(process.execPath, [CLI, 'delegate', 'status', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).status, 'finished');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('cancel reconstructs actual changed paths when a stopped worker lost its terminal result', () => {
  const fx = fixture('lost-terminal');
  try {
    const payload = JSON.stringify(resultPayload());
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.cwd(), 'src', 'delegated.js'), 'module.exports = 42;\\n');
process.stdout.write(${JSON.stringify(payload)});
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const resultFile = path.join(fx.delegation, 'result.json');
    waitFor(resultFile);
    waitForExit(receipt.worker_pid);
    fs.unlinkSync(resultFile);

    const status = spawnSync(process.execPath, [
      SKILL_RUNNER, 'status', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(status.status, 0, status.stderr);
    const stalled = JSON.parse(status.stdout);
    assert.equal(stalled.status, 'stalled');
    assert.match(
      stalled.repair,
      /skills[\\/]ultra-delegate[\\/]scripts[\\/]delegate\.cjs/u,
    );
    assert.doesNotMatch(stalled.repair, /(?:^|\s)"?ubp"?\s+delegate\b/u);

    const cancelled = spawnSync(process.execPath, [
      CLI, 'delegate', 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(cancelled.status, 0, cancelled.stderr);
    const recovered = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    assert.equal(recovered.failure_type, 'cancelled');
    assert.deepEqual(recovered.changed_files, ['src/delegated.js']);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('delegate rejects non-worktrees, unknown permission keys, and external effects', () => {
  const fx = fixture();
  try {
    const fake = fakeCli(fx, 'process.exit(0);');
    const plain = path.join(fx.root, 'plain-directory');
    fs.mkdirSync(plain);
    const nonWorktree = spawnSync(process.execPath, [
      CLI, 'delegate', 'run', '--to', 'codex',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'), '--worktree', plain,
    ], { cwd: fx.root, encoding: 'utf8', env: { ...process.env, UBP_DELEGATE_CODEX_BIN: fake } });
    assert.notEqual(nonWorktree.status, 0);
    assert.match(nonWorktree.stderr, /Git worktree/i);

    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), JSON.stringify({
      $schema: 'ultra-delegation-permission-v1', writable_roots: ['src'],
      readable_roots: ['.'], external_effects: [],
    }));
    const unknown = start(fx, fake);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unknown permission field.*readable_roots/i);

    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), JSON.stringify({
      $schema: 'ultra-delegation-permission-v1', writable_roots: ['src'],
      external_effects: ['push'],
    }));
    const effects = start(fx, fake);
    assert.notEqual(effects.status, 0);
    assert.match(effects.stderr, /external_effects must be empty/i);

    fs.mkdirSync(path.join(fx.worktree, '.ultra', 'contexts'), { recursive: true });
    for (const root of ['.ultra', '.ultra/contexts']) {
      fs.writeFileSync(path.join(fx.delegation, 'permission.json'), JSON.stringify({
        $schema: 'ultra-delegation-permission-v1', writable_roots: [root],
        external_effects: [],
      }));
      const guarded = start(fx, fake);
      assert.notEqual(guarded.status, 0, `expected ${root} to be rejected`);
      assert.match(guarded.stderr, /\.ultra/);
    }
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('delegate fails closed on unauthorized writes, packet mutation, and nonzero finished results', () => {
  for (const scenario of ['unauthorized', 'mutated', 'schema-mutated', 'nonzero']) {
    const fx = fixture(scenario);
    try {
      const payload = scenario === 'unauthorized'
        ? resultPayload(['docs/escape.md'])
        : resultPayload([]);
      const fake = fakeCli(fx, `
const fs = require('node:fs');
const path = require('node:path');
if (${JSON.stringify(scenario)} === 'unauthorized') {
  fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'docs', 'escape.md'), 'escape\\n');
}
if (${JSON.stringify(scenario)} === 'mutated') {
  fs.appendFileSync(${JSON.stringify(path.join(fx.delegation, 'permission.json'))}, '\\n');
}
if (${JSON.stringify(scenario)} === 'schema-mutated') {
  const schema = process.argv[process.argv.indexOf('--output-schema') + 1];
  fs.appendFileSync(schema, '\\n');
}
process.stdout.write(${JSON.stringify(JSON.stringify(payload))});
process.exit(${scenario === 'nonzero' ? 9 : 0});
`);
      const started = start(fx, fake);
      assert.equal(started.status, 0, started.stderr);
      const result = waitFor(path.join(fx.delegation, 'result.json'));
      assert.equal(result.status, 'failed');
      assert.equal(result.failure_type, {
        unauthorized: 'unauthorized_write',
        mutated: 'permission_changed',
        'schema-mutated': 'output_schema_changed',
        nonzero: 'process_exit',
      }[scenario]);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }
});

test('.ultra stays unwritable even when the permission grants the whole checkout', () => {
  const fx = fixture('ultra-guard');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-permission-v1',
      writable_roots: ['.'],
      external_effects: [],
    }, null, 2)}\n`);
    const payload = resultPayload(['.ultra/tasks.json']);
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(process.cwd(), '.ultra');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tasks.json'), '{"tasks":[]}\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(payload))});
process.exit(0);
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'unauthorized_write');
    assert.match(result.summary, /\.ultra/);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an empty writable root set creates a native read-only delegation', () => {
  const fx = fixture('read-only');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'permission.json'), `${JSON.stringify({
      $schema: 'ultra-delegation-permission-v1',
      writable_roots: [],
      external_effects: [],
    }, null, 2)}\n`);
    const payload = JSON.stringify(resultPayload([]));
    const fake = fakeCli(fx, `process.stdout.write(${JSON.stringify(payload)});`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    assert.equal(JSON.parse(started.stdout).read_only, true);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'finished');
    assert.equal(result.read_only, true);
    assert.deepEqual(result.changed_files, []);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('duplicate runs are locked and cancellation reaches a terminal result', () => {
  const fx = fixture('cancel');
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const first = start(fx, fake, ['--timeout', '10']);
    assert.equal(first.status, 0, first.stderr);
    const second = start(fx, fake, ['--timeout', '10']);
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /already running/i);

    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    assert.equal(JSON.parse(cancel.stdout).status, 'cancel_requested');
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'cancelled');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('delegate timeout kills the host process and records the recovery path', () => {
  const fx = fixture('timeout');
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '0.2']);
    assert.equal(started.status, 0, started.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'timeout');
    assert.match(result.summary, /timed out/i);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('one canonical environment policy derives frozen exact-key role-scoped views', () => {
  const { descendantEnvViews } = require('../adapters/_shared/host-profile.cjs');
  assert.equal(typeof descendantEnvViews, 'function');
  const source = {
    PATH: '/usr/bin', HOME: '/home/u', LANG: 'C', TMPDIR: '/tmp',
    CLAUDE_CODE_SESSION_TOKEN: 'primary-control-value',
    ANTHROPIC_API_KEY: 'unrelated-provider-value',
    OPENAI_API_KEY: 'selected-host-value',
    OPENAI_WEBHOOK_SECRET: 'same-provider-decoy-value',
    ANTHROPIC_ADMIN_API_KEY: 'claude-namespace-decoy-value',
    CODEX_HOME: '/home/u/.codex',
    UBP_DELEGATE_CODEX_BIN: '/bin/true', UBP_DELEGATE_CODEX_MODEL: 'm',
    UBP_DELEGATE_INSTRUCTION_FILE: '/leak/i', UBP_DELEGATE_PERMISSION_FILE: '/leak/p',
    UBP_DELEGATE_WORKTREE: '/leak/w',
    ULTRA_DELEGATE_FORCE_CLI: '1',
    NODE_OPTIONS: '--no-warnings', RANDOM_UNRELATED_JUNK: 'x',
  };
  const packetEnv = {
    UBP_DELEGATE_INSTRUCTION_FILE: '/packet/i',
    UBP_DELEGATE_PERMISSION_FILE: '/packet/p',
    UBP_DELEGATE_WORKTREE: '/packet/w',
  };
  const views = descendantEnvViews(source, hostProfile('codex'), { packetEnv });
  assert.deepEqual(Object.keys(views.probe).sort(), [
    'CODEX_HOME', 'HOME', 'LANG', 'OPENAI_API_KEY', 'PATH', 'TMPDIR', 'ULTRA_DELEGATE_FORCE_CLI',
  ]);
  assert.deepEqual(Object.keys(views.host).sort(), [
    'CODEX_HOME', 'HOME', 'LANG', 'OPENAI_API_KEY', 'PATH', 'TMPDIR',
  ]);
  assert.deepEqual(Object.keys(views.worker).sort(), [
    'CODEX_HOME', 'HOME', 'LANG', 'OPENAI_API_KEY', 'PATH', 'TMPDIR',
    'UBP_DELEGATE_INSTRUCTION_FILE', 'UBP_DELEGATE_PERMISSION_FILE', 'UBP_DELEGATE_WORKTREE',
  ]);
  assert.equal(views.probe.ULTRA_DELEGATE_FORCE_CLI, '1');
  assert.equal(views.host.OPENAI_API_KEY, 'selected-host-value');
  assert.equal(views.host.CODEX_HOME, '/home/u/.codex');
  // Same-provider and cross-namespace decoys never cross the boundary, and an
  // env-carried auth key without repository evidence stays out until Task 2
  // qualifies it (HOME file credentials remain the documented path).
  for (const decoy of [
    'OPENAI_WEBHOOK_SECRET', 'ANTHROPIC_ADMIN_API_KEY', 'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_SESSION_TOKEN', 'UBP_DELEGATE_CODEX_BIN', 'UBP_DELEGATE_CODEX_MODEL',
  ]) {
    assert.ok(!(decoy in views.probe), `probe seam admitted the decoy ${decoy}`);
    assert.ok(!(decoy in views.host), `host seam admitted the decoy ${decoy}`);
    assert.ok(!(decoy in views.worker), `worker seam admitted the decoy ${decoy}`);
  }
  assert.ok(Object.isFrozen(views.probe) && Object.isFrozen(views.host) && Object.isFrozen(views.worker));

  const claudeViews = descendantEnvViews({
    ...source, CLAUDE_CONFIG_DIR: '/home/u/.claude',
  }, hostProfile('claude'));
  assert.ok('CLAUDE_CONFIG_DIR' in claudeViews.host, 'the selected Host keeps its evidenced config-root key');
  for (const banned of ['ANTHROPIC_API_KEY', 'ANTHROPIC_ADMIN_API_KEY', 'OPENAI_API_KEY', 'OPENAI_WEBHOOK_SECRET']) {
    assert.ok(!(banned in claudeViews.host), `claude host seam admitted ${banned}`);
  }

  const win = descendantEnvViews(
    { Path: 'C:\\x', SystemRoot: 'C:\\Windows', OPENAI_API_KEY: 's' },
    hostProfile('codex'),
    { platform: 'win32' },
  );
  assert.equal(win.host.Path, 'C:\\x');
  assert.equal(win.host.SystemRoot, 'C:\\Windows');
});

test('descendant environments are role-scoped at the probe and ACP host seams', () => {
  const fx = fixture('env-scoped-acp');
  const canaries = [
    { label: 'primary control', name: 'CLAUDE_CODE_SESSION_TOKEN', value: canary('primary'), prohibitName: true },
    { label: 'unrelated provider', name: 'ANTHROPIC_API_KEY', value: canary('unrelated'), prohibitName: true },
    { label: 'same-provider decoy', name: 'FIXTURE_WEBHOOK_SECRET', value: canary('fixture-decoy'), prohibitName: true },
    { label: 'selected host auth', name: 'FIXTURE_API_KEY', value: canary('selected') },
  ];
  const probeKeys = path.join(fx.root, 'probe-env-keys.txt');
  const hostKeys = path.join(fx.root, 'acp-host-env-keys.txt');
  const probeScript = path.join(fx.root, 'probe-capture.cjs');
  fs.writeFileSync(probeScript, [
    '#!/usr/bin/env node',
    "'use strict';",
    'const fs = require(\'node:fs\');',
    `fs.writeFileSync(${JSON.stringify(probeKeys)}, Object.keys(process.env).sort().join('\\n') + '\\n');`,
    "process.stdout.write('probe-ok\\n');",
    '',
  ].join('\n'));
  fs.chmodSync(probeScript, 0o755);
  const configPath = path.join(fx.root, 'agent-config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    scenario: 'env-capture',
    result: resultPayload([]),
    envCapture: hostKeys,
  }));
  const profile = {
    binary: process.execPath,
    transportMaturity: 'documented+verified',
    envDiscovery: { exact: ['FIXTURE_API_KEY'] },
    acp: {
      surface: 'fixture ACP stdio',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
      command: () => process.execPath,
      argv: () => [FAKE_ACP_AGENT, configPath],
      identityProbes: () => [{
        label: 'fixture_probe',
        command: process.execPath,
        args: [probeScript],
        expectedStdout: 'probe-ok',
      }],
    },
    delegateEnv: () => ({ FIXTURE_DELEGATE_CONFIG: 'bounded' }),
  };
  const saved = {};
  for (const item of canaries) saved[item.name] = process.env[item.name];
  try {
    for (const item of canaries) process.env[item.name] = item.value;
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '5',
    ], { projectRoot: fx.root, resolveHostProfile: () => profile });
    assert.equal(receipt.execution_driver, 'acp');
    const result = waitFor(receipt.result_file);
    assert.equal(result.status, 'finished', JSON.stringify(result));

    const probe = readEnvKeys(probeKeys);
    assert.ok(probe.includes('PATH'), 'discovery PATH must reach the probe');
    assert.ok(probe.includes('FIXTURE_API_KEY'), 'selected-Host auth discovery must reach the probe');
    for (const banned of ['CLAUDE_CODE_SESSION_TOKEN', 'ANTHROPIC_API_KEY', 'FIXTURE_WEBHOOK_SECRET', 'UBP_DELEGATE_WORKTREE']) {
      assert.ok(!probe.includes(banned), `probe seam leaked ${banned}`);
    }

    const host = readEnvKeys(hostKeys);
    assert.ok(host.includes('PATH'), 'runtime PATH must reach the final Host');
    assert.ok(host.includes('FIXTURE_API_KEY'), 'selected-Host auth input must reach the final Host');
    assert.ok(host.includes('FIXTURE_DELEGATE_CONFIG'), 'launcher-authorized delegate config must reach the final Host');
    for (const banned of [
      'CLAUDE_CODE_SESSION_TOKEN', 'ANTHROPIC_API_KEY', 'FIXTURE_WEBHOOK_SECRET',
      'UBP_DELEGATE_INSTRUCTION_FILE', 'UBP_DELEGATE_PERMISSION_FILE', 'UBP_DELEGATE_WORKTREE',
    ]) {
      assert.ok(!host.includes(banned), `ACP host seam leaked ${banned}`);
    }

    scanArtifactsForCanaries(delegationArtifacts(fx.delegation), canaries);
  } finally {
    for (const item of canaries) {
      if (saved[item.name] === undefined) delete process.env[item.name];
      else process.env[item.name] = saved[item.name];
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('CLI host descendants receive the sanitized selected-Host environment only', () => {
  const fx = fixture('env-scoped-cli');
  const canaries = [
    { label: 'primary control', name: 'CLAUDE_CODE_SESSION_TOKEN', value: canary('primary'), prohibitName: true },
    { label: 'unrelated provider', name: 'ANTHROPIC_API_KEY', value: canary('unrelated'), prohibitName: true },
    { label: 'same-provider decoy', name: 'OPENAI_WEBHOOK_SECRET', value: canary('webhook'), prohibitName: true },
    { label: 'provider-namespace decoy', name: 'ANTHROPIC_ADMIN_API_KEY', value: canary('admin'), prohibitName: true },
    { label: 'selected host auth', name: 'OPENAI_API_KEY', value: canary('selected') },
  ];
  const hostKeys = path.join(fx.root, 'cli-host-env-keys.txt');
  try {
    const fake = fakeCli(fx, `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(hostKeys)}, Object.keys(process.env).sort().join('\\n') + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});
`);
    const envExtra = {};
    for (const item of canaries) envExtra[item.name] = item.value;
    const started = start(fx, fake, [], 'codex', envExtra);
    assert.equal(started.status, 0, started.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'finished', JSON.stringify(result));

    const host = readEnvKeys(hostKeys);
    assert.ok(host.includes('PATH'), 'runtime PATH must reach the CLI Host');
    assert.ok(host.includes('OPENAI_API_KEY'), 'selected-Host auth input must reach the CLI Host');
    for (const banned of [
      'CLAUDE_CODE_SESSION_TOKEN', 'ANTHROPIC_API_KEY',
      'OPENAI_WEBHOOK_SECRET', 'ANTHROPIC_ADMIN_API_KEY',
      'UBP_DELEGATE_INSTRUCTION_FILE', 'UBP_DELEGATE_PERMISSION_FILE', 'UBP_DELEGATE_WORKTREE',
      'UBP_DELEGATE_CODEX_BIN', 'ULTRA_DELEGATE_FORCE_CLI',
    ]) {
      assert.ok(!host.includes(banned), `CLI host seam leaked ${banned}`);
    }

    scanArtifactsForCanaries(delegationArtifacts(fx.delegation), canaries);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('writer state derivation is truthful for alive, stopped, reused and unprovable boundaries', () => {
  const { deriveWriterState } = require(path.join(
    ROOT, 'skills', 'ultra-delegate', 'scripts', 'agent-execution-driver.cjs',
  ));
  assert.equal(typeof deriveWriterState, 'function');
  // /proc/<pid>/stat tokens after the comm field restart at field 3, so the
  // starttime (field 22) is token 19; the line below places it exactly there.
  const statLine = (starttime) => `4242 (node) S 1 4242 4242 34816 4194624 100 0 0 0 0 1 2 3 4 5 6 7 8 ${starttime} 999999 777`;
  const readProc = (file, starttime = '100') => {
    if (file === '/proc/4242/stat') return statLine(starttime);
    const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error;
  };
  const identity = { delegationId: 'd-derive', launchId: '11111111-1111-4111-8111-111111111111' };
  const observation = (over = {}) => ({
    $schema: 'ultra-delegation-writer-v2',
    delegation_id: identity.delegationId,
    launch_id: identity.launchId,
    phase: 'started',
    pid: 4242, pgid: 4242, platform: 'linux',
    command: 'fake-host',
    argv_digest: 'a'.repeat(64),
    started_at: '2026-09-01T00:00:00.000Z',
    start_identity: { type: 'linux_procfs_starttime', value: '100' },
    ...over,
  });
  const esrch = (target) => {
    if (target === 4242 || target === -4242) {
      const error = new Error('ESRCH'); error.code = 'ESRCH'; throw error;
    }
    const error = new Error('EPERM'); error.code = 'EPERM'; throw error;
  };
  const linux = { platform: 'linux', readFileSync: (file) => readProc(file) };
  const cases = [
    {
      name: 'live pid with matching start identity is alive',
      observation: observation(), kill: () => {}, options: linux, expected: 'alive',
    },
    {
      name: 'live pid with reused start identity is unknown',
      observation: observation(), kill: () => {}, options: { platform: 'linux', readFileSync: (file) => readProc(file, '999') }, expected: 'unknown',
    },
    {
      name: 'live pid with recorded identity that can no longer be read is unknown',
      observation: observation(), kill: () => {},
      options: { platform: 'linux', readFileSync: () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } },
      expected: 'unknown',
    },
    {
      name: 'dead pid with dead process group is stopped',
      observation: observation(), kill: esrch, options: linux, expected: 'stopped',
    },
    {
      name: 'dead pid with a surviving process group is unknown',
      observation: observation(),
      kill: (target) => {
        if (target === -4242) return;
        const error = new Error('ESRCH'); error.code = 'ESRCH'; throw error;
      },
      options: linux, expected: 'unknown',
    },
    {
      name: 'live pid that only answers EPERM is alive',
      observation: observation(),
      kill: () => { const error = new Error('EPERM'); error.code = 'EPERM'; throw error; },
      options: linux, expected: 'alive',
    },
    {
      name: 'windows observation without pgid degrades to the pid boundary',
      observation: observation({ pgid: null, platform: 'win32' }),
      kill: esrch, options: { platform: 'win32' }, expected: 'stopped',
    },
    {
      name: 'malformed observation is unknown',
      observation: null, kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'non-integer pid is unknown',
      observation: observation({ pid: 'many' }), kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'explicit valid not_started phase is stopped',
      observation: observation({
        phase: 'not_started', pid: null, pgid: null, command: null, argv_digest: null, start_identity: null,
      }),
      kill: esrch, options: linux, expected: 'stopped',
    },
    {
      name: 'not_started with a pgid is unknown',
      observation: observation({ phase: 'not_started', pid: null, command: null, argv_digest: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'not_started with a start identity is unknown',
      observation: observation({ phase: 'not_started', pid: null, pgid: null, command: null, argv_digest: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'not_started with command identity is unknown',
      observation: observation({ phase: 'not_started', pid: null, pgid: null, argv_digest: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'not_started with an argv digest is unknown',
      observation: observation({ phase: 'not_started', pid: null, pgid: null, command: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'launching with a pid is unknown',
      observation: observation({ phase: 'launching', pgid: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'launching with a pgid is unknown',
      observation: observation({ phase: 'launching', pid: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'launching without command identity is unknown',
      observation: observation({ phase: 'launching', pid: null, pgid: null, start_identity: null, command: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'launching without an argv digest is unknown',
      observation: observation({ phase: 'launching', pid: null, pgid: null, start_identity: null, argv_digest: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'started with a non-matching POSIX pgid is unknown',
      observation: observation({ pgid: 4243 }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'started with a non-null Windows pgid is unknown',
      observation: observation({ platform: 'win32' }),
      kill: esrch, options: { platform: 'win32' }, expected: 'unknown',
    },
    {
      name: 'started without command identity is unknown',
      observation: observation({ command: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'started without an argv digest is unknown',
      observation: observation({ argv_digest: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'launching phase is unknown even with a dead probe',
      observation: observation({ phase: 'launching', pid: null, pgid: null, start_identity: null }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'observation from another launch identity is unknown',
      observation: observation({ launch_id: '22222222-2222-4222-8222-222222222222' }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'observation from another delegation is unknown',
      observation: observation({ delegation_id: 'd-other' }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'observation recorded on another platform is unknown',
      observation: observation({ platform: 'darwin' }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'observation with an extra field is unknown',
      observation: observation({ extra: 'field' }),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'observation with a missing phase is unknown',
      observation: (() => { const value = observation(); delete value.phase; return value; })(),
      kill: esrch, options: linux, expected: 'unknown',
    },
    {
      name: 'legacy v1 observation without identity binding is unknown',
      observation: { $schema: 'ultra-delegation-writer-v1', pid: 4242, pgid: 4242, platform: 'linux' },
      kill: esrch, options: linux, expected: 'unknown',
    },
  ];
  for (const scenario of cases) {
    assert.equal(
      deriveWriterState(scenario.observation, {
        identity,
        platform: scenario.options.platform,
        kill: scenario.kill,
        readFileSync: scenario.options.readFileSync,
      }),
      scenario.expected,
      scenario.name,
    );
  }
});

test('writer observation transitions refuse impossible or skipped phases', () => {
  const {
    markWriterLaunching,
    observeWriterStart,
    rewindWriterNotStarted,
    writeObservationPhase,
  } = require(path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'agent-execution-driver.cjs'));
  assert.equal(typeof markWriterLaunching, 'function');
  assert.equal(typeof observeWriterStart, 'function');
  assert.equal(typeof rewindWriterNotStarted, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-writer-transitions-'));
  try {
    const identity = { delegationId: 'd-trans', launchId: '33333333-3333-4333-8333-333333333333' };
    const file = path.join(root, 'writer.json');
    const spec = (over = {}) => ({
      writer_observation: file,
      delegation_id: identity.delegationId,
      launch_id: identity.launchId,
      command: 'fake-host',
      args: ['--work'],
      ...over,
    });
    const phase = () => JSON.parse(fs.readFileSync(file, 'utf8')).phase;

    // A skipped transition is refused: launching without a durably persisted
    // not_started observation proves nothing.
    assert.equal(markWriterLaunching(spec()), false);
    assert.equal(fs.existsSync(file), false);

    writeObservationPhase(file, { identity, phase: 'not_started' });
    // Evidence from another identity is never overwritten or advanced.
    assert.equal(markWriterLaunching(spec({
      launch_id: '44444444-4444-4444-8444-444444444444',
    })), false);
    assert.equal(phase(), 'not_started');
    // A launching observation requires command/argv identity from the spec.
    assert.equal(markWriterLaunching(spec({ command: null, args: null })), false);
    assert.equal(phase(), 'not_started');
    assert.equal(markWriterLaunching(spec()), true);
    assert.equal(phase(), 'launching');

    const child = { pid: 4242 };
    assert.equal(observeWriterStart(spec({
      launch_id: '44444444-4444-4444-8444-444444444444',
    }), child), null);
    assert.equal(phase(), 'launching');
    // started may not skip launching, and a missing observation is refused.
    fs.unlinkSync(file);
    assert.equal(observeWriterStart(spec(), child), null);
    assert.equal(fs.existsSync(file), false);
    writeObservationPhase(file, { identity, phase: 'not_started' });
    assert.equal(observeWriterStart(spec(), child), null, 'started may not follow not_started directly');
    assert.equal(phase(), 'not_started');
    assert.equal(markWriterLaunching(spec()), true);
    const started = observeWriterStart(spec(), child);
    assert.ok(started && typeof started === 'object');
    assert.equal(started.phase, 'started');
    assert.equal(started.pid, 4242);
    assert.equal(started.pgid, 4242, 'the detached POSIX launch is its own process-group leader');
    assert.equal(started.start_identity, null);

    // started is terminal for one launch: neither transition accepts it.
    assert.equal(markWriterLaunching(spec()), false);
    assert.equal(phase(), 'started');
    assert.equal(observeWriterStart(spec(), child), null);
    assert.equal(phase(), 'started');
    // Rewinding to not_started is an explicit proven-safe restoration, not a
    // default transition from started.
    assert.equal(rewindWriterNotStarted(spec()), false);
    assert.equal(phase(), 'started');
    assert.equal(rewindWriterNotStarted(spec(), { allowedPriorPhases: ['started'] }), true);
    assert.equal(phase(), 'not_started');
    // A rewind requires existing evidence of the exact prior phase.
    fs.unlinkSync(file);
    assert.equal(rewindWriterNotStarted(spec()), false);
    assert.equal(rewindWriterNotStarted(spec(), { allowedPriorPhases: ['started'] }), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('worktree fences reject exact, overlapping and aliased roots while admitting disjoint ones', () => {
  const { fencePathsOverlap, acquireWorktreeFence, releaseWorktreeFence } = require(SKILL_RUNNER);
  assert.equal(typeof fencePathsOverlap, 'function');
  assert.equal(typeof acquireWorktreeFence, 'function');
  assert.equal(typeof releaseWorktreeFence, 'function');

  for (const [left, right, platform, expected] of [
    ['/w/tree', '/w/tree', 'linux', true],
    ['/w/tree', '/w/tree/', 'linux', true],
    ['/w', '/w/tree', 'linux', true],
    ['/w/tree', '/w/tree2', 'linux', false],
    ['/w/a', '/w/b', 'linux', false],
    ['C:\\Work\\Tree', 'c:/work/tree', 'win32', true],
    ['C:\\Work', 'C:/work/tree/sub', 'win32', true],
    ['C:\\Work\\Tree', 'C:\\Work\\Other', 'win32', false],
    ['D:\\a\\Repo\\Tree', 'd:/a/repo/tree', 'win32', true],
  ]) {
    assert.equal(fencePathsOverlap(left, right, { platform }), expected, `${left} vs ${right}`);
  }

  const identities = new Map([
    ['C:\\Users\\RUNNER~1\\wt', { dev: 7n, ino: 42n }],
    ['C:\\Users\\runneradmin\\wt', { dev: 7n, ino: 42n }],
    ['/alias/link', { dev: 9n, ino: 77n }],
    ['/real/target', { dev: 9n, ino: 77n }],
  ]);
  const stat = (value) => {
    const entry = identities.get(value);
    if (!entry) { const error = new Error('ENOENT'); error.code = 'ENOENT'; throw error; }
    return entry;
  };
  assert.equal(fencePathsOverlap('/alias/link', '/real/target', { stat }), true);
  assert.equal(
    fencePathsOverlap('C:\\Users\\RUNNER~1\\wt', 'C:\\Users\\runneradmin\\wt', { platform: 'win32', stat }),
    true,
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-'));
  try {
    const wtA = path.join(root, 'wt-a');
    const wtB = path.join(root, 'wt-b');
    const wtC = path.join(root, 'wt-c');
    for (const dir of [wtA, wtB, wtC]) {
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    }
    acquireWorktreeFence(root, {
      delegationId: 'd-a', launchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      worktree: wtA, writableRootPaths: [path.join(wtA, 'src')],
    });
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-b', launchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      worktree: wtB, writableRootPaths: [path.join(wtA, 'src', 'lib')],
    }), /overlap|conflict|held/iu);
    acquireWorktreeFence(root, {
      delegationId: 'd-c', launchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      worktree: wtC, writableRootPaths: [path.join(wtC, 'src')],
    });
    releaseWorktreeFence(root, 'd-a', { launchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    acquireWorktreeFence(root, {
      delegationId: 'd-b', launchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      worktree: wtB, writableRootPaths: [path.join(wtA, 'src', 'lib')],
    });
    const alias = path.join(root, 'alias-to-a');
    fs.symlinkSync(wtA, alias);
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-d', launchId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      worktree: alias, writableRootPaths: [],
    }), /overlap|conflict|held/iu);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fence admission fails closed for same-id reacquire and invalid registry entries', () => {
  const { acquireWorktreeFence, fenceFileName, releaseWorktreeFence } = require(SKILL_RUNNER);
  assert.equal(typeof fenceFileName, 'function');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-closed-'));
  try {
    const wtA = path.join(root, 'wt-a');
    const wtB = path.join(root, 'wt-b');
    fs.mkdirSync(wtA, { recursive: true });
    fs.mkdirSync(wtB, { recursive: true });
    const launchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    acquireWorktreeFence(root, {
      delegationId: 'd-a', launchId: launchA, worktree: wtA, writableRootPaths: [],
    });
    // An existing fence is held even when its delegation id matches: no normal
    // run path may reacquire its own already-persisted fence.
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-a', launchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      worktree: wtA, writableRootPaths: [],
    }), /held|conflict|fence/iu);

    const registry = path.join(root, '.ultra', '.runtime', 'delegation-fences');
    // Valid JSON with missing required fields is an invalid fence, not an
    // ignorable one: admission must fail closed.
    fs.writeFileSync(path.join(registry, fenceFileName('d-empty')), '{}\n');
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-b', launchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      worktree: wtB, writableRootPaths: [],
    }), /invalid|resolve|fence/iu);

    // Extra fields are equally invalid.
    const heldFence = JSON.parse(fs.readFileSync(path.join(registry, fenceFileName('d-a')), 'utf8'));
    fs.writeFileSync(path.join(registry, fenceFileName('d-extra')), `${JSON.stringify({
      ...heldFence, delegation_id: 'd-extra', unexpected: true,
    })}\n`);
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-c', launchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      worktree: wtB, writableRootPaths: [],
    }), /invalid|resolve|fence/iu);

    // Release refuses invalid or identity-mismatched entries instead of
    // deleting them.
    assert.throws(() => releaseWorktreeFence(root, 'd-empty'), /invalid|resolve|fence/iu);
    assert.ok(fs.existsSync(path.join(registry, fenceFileName('d-empty'))));
    assert.throws(() => releaseWorktreeFence(root, 'd-a', {
      launchId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    }), /identity|launch|invalid/iu);
    assert.ok(fs.existsSync(path.join(registry, fenceFileName('d-a'))));
    assert.equal(releaseWorktreeFence(root, 'd-a', { launchId: launchA }), true);
    assert.equal(fs.existsSync(path.join(registry, fenceFileName('d-a'))), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the fence registry refuses symlinked components and entries and never touches external targets', () => {
  const { acquireWorktreeFence, fenceFileName, releaseWorktreeFence } = require(SKILL_RUNNER);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-outside-'));
  try {
    const wtA = path.join(root, 'wt-a');
    fs.mkdirSync(wtA, { recursive: true });
    fs.mkdirSync(path.join(root, '.ultra', '.runtime'), { recursive: true });
    const registry = path.join(root, '.ultra', '.runtime', 'delegation-fences');
    fs.mkdirSync(registry);
    // The sentinel is a completely valid fence for an unrelated root: reading
    // through the symlink would admit or overwrite it.
    const sentinel = path.join(outside, 'sentinel.json');
    const sentinelSource = `${JSON.stringify({
      $schema: 'ultra-delegation-worktree-fence-v1',
      delegation_id: 'sentinel-owner',
      launch_id: '99999999-9999-4999-8999-999999999999',
      worktree: '/elsewhere/wt',
      writable_roots: [],
      pid: null,
      created_at: '2026-09-01T00:00:00.000Z',
    })}\n`;
    fs.writeFileSync(sentinel, sentinelSource);
    fs.symlinkSync(sentinel, path.join(registry, fenceFileName('d-link')));

    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-other', launchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      worktree: wtA, writableRootPaths: [],
    }), /symlink|invalid|resolve|fence/iu);
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-link', launchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      worktree: wtA, writableRootPaths: [],
    }), /symlink|invalid|resolve|fence/iu);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), sentinelSource);
    assert.throws(() => releaseWorktreeFence(root, 'd-link'), /symlink|invalid|resolve|fence/iu);
    assert.ok(fs.lstatSync(path.join(registry, fenceFileName('d-link'))).isSymbolicLink());
    assert.equal(fs.readFileSync(sentinel, 'utf8'), sentinelSource);

    // A symlinked registry component is refused before any registry mutation,
    // so no fence is ever created outside the canonical project root.
    fs.rmSync(registry, { recursive: true, force: true });
    const outsideRegistry = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-reg-out-'));
    fs.symlinkSync(outsideRegistry, registry);
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-reg', launchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      worktree: wtA, writableRootPaths: [],
    }), /real directory|resolve|fence/iu);
    assert.equal(fs.readdirSync(outsideRegistry).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

function bestEffortCancel(fx, delegation) {
  try {
    spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', delegation], {
      cwd: fx.root, encoding: 'utf8', timeout: 10000,
    });
  } catch {}
}

test('two delegation ids cannot concurrently write the same physical worktree', () => {
  const fx = fixture('fence-exact');
  const secondId = addDelegation(fx, 'fence-exact-b');
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const first = start(fx, fake, ['--timeout', '30']);
    assert.equal(first.status, 0, first.stderr);
    const second = launch(fx, secondId, fake);
    assert.notEqual(second.status, 0, 'an exact worktree alias must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);
    bestEffortCancel(fx, fx.delegation);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.failure_type, 'cancelled');
  } finally {
    bestEffortCancel(fx, secondId);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a symlinked worktree alias cannot bypass the writer fence', () => {
  const fx = fixture('fence-symlink');
  const secondId = addDelegation(fx, 'fence-symlink-b');
  const alias = path.join(fx.root, 'wt-alias');
  try {
    fs.symlinkSync(fx.worktree, alias);
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const first = start(fx, fake, ['--timeout', '30']);
    assert.equal(first.status, 0, first.stderr);
    const second = launch(fx, secondId, fake, alias);
    assert.notEqual(second.status, 0, 'a symlink alias must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);
    bestEffortCancel(fx, fx.delegation);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.failure_type, 'cancelled');
  } finally {
    bestEffortCancel(fx, secondId);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('disjoint registered worktrees remain concurrently admissible', () => {
  const fx = fixture('fence-disjoint');
  const secondWorktree = path.join(fx.root, '.ultra', '.runtime', 'worktrees', 'fence-disjoint-b');
  const secondId = addDelegation(fx, 'fence-disjoint-b');
  try {
    git(fx.root, 'worktree', 'add', '--detach', secondWorktree, 'HEAD');
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const first = start(fx, fake, ['--timeout', '30']);
    assert.equal(first.status, 0, first.stderr);
    const second = launch(fx, secondId, fake, secondWorktree, ['--timeout', '30']);
    assert.equal(second.status, 0, second.stderr);
    bestEffortCancel(fx, fx.delegation);
    bestEffortCancel(fx, secondId);
    assert.equal(waitFor(path.join(fx.delegation, 'result.json')).failure_type, 'cancelled');
    assert.equal(waitFor(path.join(secondId, 'result.json')).failure_type, 'cancelled');
  } finally {
    bestEffortCancel(fx, secondId);
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('cancel after outer-worker loss with a live nested writer is outcome_unknown and freezes the fence', () => {
  const fx = fixture('orphan-writer');
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const observation = waitForWriterStarted(path.join(fx.delegation, 'writer.json'));
    writerPid = observation.pid;
    assert.ok(Number.isInteger(writerPid) && writerPid > 0);
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);

    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.ok(fs.existsSync(path.join(fx.delegation, 'run.lock')), 'the frozen delegation lock must be kept');
    const registry = path.join(fx.root, '.ultra', '.runtime', 'delegation-fences');
    assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 1);
    try { process.kill(writerPid, 0); } catch { assert.fail('the nested writer must still be alive'); }

    const secondId = addDelegation(fx, 'orphan-writer-second');
    const second = launch(fx, secondId, fake);
    assert.notEqual(second.status, 0, 'a frozen root must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a frozen fence releases only after the orphaned writer boundary is proven stopped', () => {
  const fx = fixture('fence-release');
  const resultFile = path.join(fx.delegation, 'result.json');
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const observation = waitForWriterStarted(path.join(fx.delegation, 'writer.json'));
    writerPid = observation.pid;
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);
    const first = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(first.status, 0, first.stderr);
    const frozen = waitFor(resultFile);
    assert.equal(frozen.failure_type, 'outcome_unknown');

    process.kill(writerPid, 'SIGKILL');
    waitForExit(writerPid);
    writerPid = null;
    const repair = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(repair.status, 0, repair.stderr);
    const repaired = JSON.parse(repair.stdout);
    assert.equal(repaired.status, 'already_terminal');
    assert.equal(repaired.fence_released, true);
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).failure_type, 'outcome_unknown');

    const nextId = addDelegation(fx, 'fence-release-next');
    const next = launch(fx, nextId, fake, fx.worktree, ['--timeout', '30']);
    assert.equal(next.status, 0, next.stderr);
    bestEffortCancel(fx, nextId);
    assert.equal(waitFor(path.join(nextId, 'result.json')).failure_type, 'cancelled');
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an expired timeout after outer-worker loss never synthesizes a safe timeout result', () => {
  const fx = fixture('timeout-orphan');
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '1']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const observation = waitForWriterStarted(path.join(fx.delegation, 'writer.json'));
    writerPid = observation.pid;
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);

    const snapshot = spawnSync(process.execPath, [
      SKILL_RUNNER, 'status', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(snapshot.status, 0, snapshot.stderr);
    const observed = JSON.parse(snapshot.stdout);
    assert.equal(observed.writer_observation.state, 'alive');

    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.notEqual(result.failure_type, 'timeout');
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an unidentifiable nested writer keeps the outcome unknown', () => {
  const fx = fixture('unidentifiable-writer');
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const writerFile = path.join(fx.delegation, 'writer.json');
    const observation = waitForWriterStarted(writerFile);
    writerPid = observation.pid;
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);
    // The recorded writer no longer proves anything: its identity now names a
    // live process this launcher never observed starting.
    fs.writeFileSync(writerFile, `${JSON.stringify({
      ...observation, pid: process.pid, pgid: null,
    }, null, 2)}\n`);

    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.ok(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'delegation-fences')));
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('missing writer evidence keeps the boundary unknown instead of stopped', () => {
  const fx = fixture('missing-writer');
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const writerFile = path.join(fx.delegation, 'writer.json');
    const observation = waitForWriterStarted(writerFile);
    writerPid = observation.pid;
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);
    // The outer worker's start identity and launch binding are recorded in the
    // lock so a stale or reused lock PID cannot pose as the active worker.
    const lock = JSON.parse(fs.readFileSync(path.join(fx.delegation, 'run.lock'), 'utf8'));
    assert.equal(typeof lock.launch_id, 'string');
    assert.equal(lock.launch_id.length > 0, true);
    assert.equal(typeof lock.spec_digest, 'string');
    assert.ok('worker_start_identity' in lock);
    fs.unlinkSync(writerFile);

    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.ok(fs.existsSync(path.join(fx.delegation, 'run.lock')), 'the frozen delegation lock must be kept');
    const registry = path.join(fx.root, '.ultra', '.runtime', 'delegation-fences');
    assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 1);
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('writer evidence from another launch identity is unknown and never proves a stop', () => {
  for (const [name, tamper] of [
    ['mismatched-launch', (observation) => ({ ...observation, launch_id: '22222222-2222-4222-8222-222222222222' })],
    ['stale-schema', (observation) => ({
      $schema: 'ultra-delegation-writer-v1',
      pid: observation.pid, pgid: observation.pgid, platform: observation.platform,
    })],
  ]) {
    const fx = fixture(`writer-identity-${name}`);
    let writerPid = null;
    try {
      const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
      const started = start(fx, fake, ['--timeout', '30']);
      assert.equal(started.status, 0, started.stderr);
      const receipt = JSON.parse(started.stdout);
      const writerFile = path.join(fx.delegation, 'writer.json');
      const observation = waitForWriterStarted(writerFile);
      writerPid = observation.pid;
      process.kill(receipt.worker_pid, 'SIGKILL');
      waitForExit(receipt.worker_pid);
      process.kill(writerPid, 'SIGKILL');
      waitForExit(writerPid);
      writerPid = null;
      fs.writeFileSync(writerFile, `${JSON.stringify(tamper(observation), null, 2)}\n`);

      const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
        cwd: fx.root, encoding: 'utf8',
      });
      assert.equal(cancel.status, 0, cancel.stderr);
      const result = waitFor(path.join(fx.delegation, 'result.json'));
      assert.equal(result.failure_type, 'outcome_unknown', name);
      const registry = path.join(fx.root, '.ultra', '.runtime', 'delegation-fences');
      assert.equal(fs.readdirSync(registry).filter((entry) => entry.endsWith('.json')).length, 1, name);
    } finally {
      if (writerPid) {
        try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
      }
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }
});

test('post-spawn launcher loss retains a bound lock and never trusts the launcher pid', () => {
  for (const seam of ['receipt-write', 'lock-rewrite']) {
    const fx = fixture(`fault-proc-${seam}`);
    try {
      const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
      const faulted = launchFaulted(fx, seam, fake);
      assert.notEqual(faulted.status, 0, `${seam} must surface the post-spawn failure`);
      assert.match(faulted.stderr, /cancel/u, `${seam} must point to the recovery command`);

      // The lock carries the launch-bound digest and never labels the dead
      // launcher pid as the worker pid.
      const lockFile = path.join(fx.delegation, 'run.lock');
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      assert.match(lock.spec_digest, /^[0-9a-f]{64}$/u, `${seam}: the lock must bind the spec digest`);
      assert.notEqual(lock.pid, faulted.pid, `${seam}: the launcher pid must never pose as the worker pid`);

      // Status truth while the run is unresolved: a conservative
      // running/unknown/stalled view with the canonical repair, never
      // not_started-with-no-repair, and never the launcher pid as worker.
      const snapshot = spawnSync(process.execPath, [
        SKILL_RUNNER, 'status', '--delegation', fx.delegation,
      ], { cwd: fx.root, encoding: 'utf8' });
      assert.equal(snapshot.status, 0, snapshot.stderr);
      const observed = JSON.parse(snapshot.stdout);
      assert.ok(
        ['running', 'unknown', 'stalled'].includes(observed.status),
        `${seam}: expected a conservative recovery state, got ${observed.status}`,
      );
      assert.ok(observed.repair, `${seam}: the canonical cancel repair must be offered`);
      assert.notEqual(observed.worker_pid, faulted.pid, `${seam}: status must not report the launcher pid as the worker`);

      // The retained fence blocks a second writer on the same roots.
      assert.equal(heldFenceCount(fx.root), 1, seam);
      const secondId = addDelegation(fx, `fault-proc-${seam}-second`);
      const second = launch(fx, secondId, fake);
      assert.notEqual(second.status, 0, `${seam}: a retained fence must block a second writer`);
      assert.match(second.stderr, /overlap|conflict|fence/iu, seam);

      // The detached worker itself heals the lost launcher write: it claims
      // the lock with its own identity before the host may launch.
      waitForWriterStarted(path.join(fx.delegation, 'writer.json'));
      const claimed = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      assert.ok(Number.isInteger(claimed.pid) && claimed.pid > 0, `${seam}: the worker must claim a real pid`);
      assert.notEqual(claimed.pid, faulted.pid, seam);
      assert.match(claimed.spec_digest, /^[0-9a-f]{64}$/u, seam);
      assert.equal(claimed.delegation_id, path.basename(fx.delegation), seam);
      assert.ok('worker_start_identity' in claimed, seam);

      // Cancellation signals the live worker and reaches a truthful
      // worker-authored terminal result.
      const cancel = spawnSync(process.execPath, [
        SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
      ], { cwd: fx.root, encoding: 'utf8' });
      assert.equal(cancel.status, 0, cancel.stderr);
      const result = waitFor(path.join(fx.delegation, 'result.json'), 15000);
      assert.equal(result.failure_type, 'cancelled', seam);
      // Terminal result is not release proof: the worker unlinks the lock and
      // releases the fence in its own `finally`. This seam faults the launcher
      // receipt write, so synchronize on the pid the worker claimed in the lock.
      waitForExit(claimed.pid, 15000);
      const registry = fenceRegistryOf(fx.root);
      assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 0, seam);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }
});

test('a finished CLI result with a live same-group descendant is outcome_unknown and freezes the fence', () => {
  const fx = fixture('cli-live-descendant');
  const nestedPidFile = path.join(fx.delegation, 'nested-writer.pid');
  let nestedPid = null;
  const sentinel = path.join(os.tmpdir(), `ubp-d1-cancel-sentinel-${crypto.randomUUID()}.json`);
  try {
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
nested.unref();
fs.writeFileSync(${JSON.stringify(nestedPidFile)}, String(nested.pid) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const resultFile = path.join(fx.delegation, 'result.json');
    const result = waitFor(resultFile, 15000);
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.equal(result.failure_type, 'outcome_unknown');
    const registry = path.join(fx.root, '.ultra', '.runtime', 'delegation-fences');
    assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 1);

    nestedPid = Number(fs.readFileSync(nestedPidFile, 'utf8'));
    assert.ok(Number.isInteger(nestedPid) && nestedPid > 0);
    const secondId = addDelegation(fx, 'cli-live-descendant-second');
    const second = launch(fx, secondId, fake);
    assert.notEqual(second.status, 0, 'a frozen root must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);

    // Let the worker finish its frozen finally-block before repairing, so the
    // retained fence is not released concurrently by two recovery paths.
    const workerPid = JSON.parse(fs.readFileSync(
      path.join(fx.delegation, 'receipt.json'), 'utf8',
    )).worker_pid;
    waitForExit(workerPid, 6000);

    // status exposes a freshly derived writer state without rewriting the
    // immutable terminal result.
    const snapshot = statusDelegate(['--delegation', fx.delegation], { projectRoot: fx.root });
    assert.equal(snapshot.failure_type, 'outcome_unknown');
    assert.equal(snapshot.writer_observation.state, 'unknown');
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).failure_type, 'outcome_unknown');

    // Launcher recovery never unlinks a fence path named by a mutated spec:
    // the digest check refuses spec consumption entirely, and the fence path
    // is derived from the launch-bound identity, so the sentinel is untouchable.
    fs.writeFileSync(sentinel, 'sentinel-payload\n');
    const specFile = path.join(fx.delegation, 'worker-spec.json');
    fs.writeFileSync(specFile, `${JSON.stringify({
      ...JSON.parse(fs.readFileSync(specFile, 'utf8')), fence: sentinel,
    }, null, 2)}\n`);
    process.kill(nestedPid, 'SIGKILL');
    waitForExit(nestedPid);
    nestedPid = null;
    const tampered = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(tampered.status, 0, tampered.stderr);
    const tamperedOutcome = JSON.parse(tampered.stdout);
    assert.equal(tamperedOutcome.status, 'already_terminal');
    assert.equal(tamperedOutcome.fence_released, true, 'the identity-bound derived fence may release');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel-payload\n');
    assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 0);
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).failure_type, 'outcome_unknown');
  } finally {
    if (nestedPid) {
      try { process.kill(nestedPid, 'SIGKILL'); waitForExit(nestedPid, 1500); } catch {}
    }
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a finished ACP result with a live same-group descendant is outcome_unknown and keeps the fence', async (t) => {
  const fx = fixture('acp-live-descendant');
  const childPidFile = path.join(fx.delegation, 'fake-acp-child.pid');
  let childPid = null;
  t.after(() => {
    if (childPid) {
      try { process.kill(childPid, 'SIGKILL'); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  });
    const idle = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const profile = {
      binary: process.execPath,
      transportMaturity: 'documented+verified',
      acp: {
        surface: 'fixture ACP stdio',
        transport: 'stdio',
        protocolVersions: [1],
        conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
        command: () => process.execPath,
        argv: () => [FAKE_ACP_AGENT],
      },
      delegateEnv: () => ({
        FAKE_ACP_SCENARIO: 'finish-live-group',
        FAKE_ACP_CHILD_PID: childPidFile,
        FAKE_ACP_RESULT: JSON.stringify(resultPayload([])),
      }),
    };
    const receipt = runDelegate([
      '--to', 'fixture',
      '--instruction', path.join(fx.delegation, 'instruction.md'),
      '--permission', path.join(fx.delegation, 'permission.json'),
      '--worktree', fx.worktree,
      '--timeout', '10',
    ], { projectRoot: fx.root, resolveHostProfile: () => profile });
    childPid = waitFor(childPidFile);
    const result = waitFor(receipt.result_file, 15000);
    assert.equal(result.status, 'failed', JSON.stringify(result));
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.equal(result.acp_stop_reason, 'end_turn');
    const registry = path.join(fx.root, '.ultra', '.runtime', 'delegation-fences');
    assert.equal(fs.readdirSync(registry).filter((name) => name.endsWith('.json')).length, 1);

    const secondId = addDelegation(fx, 'acp-live-descendant-second');
    const second = launch(fx, secondId, idle);
    assert.notEqual(second.status, 0, 'a frozen root must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);

    // Let the worker finish its frozen finally-block before repairing, so the
    // retained fence is not released concurrently by two recovery paths.
    await waitForExitAsync(receipt.worker_pid);
    process.kill(childPid, 'SIGKILL');
    waitForExit(childPid);
    childPid = null;
    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const repaired = JSON.parse(cancel.stdout);
    assert.equal(repaired.status, 'already_terminal');
    assert.equal(repaired.fence_released, true);
  });

test('spec drift blocks synthesized terminal fields but never the cancel signal', () => {
  const fx = fixture('cancel-spec-digest');
  const sentinel = path.join(os.tmpdir(), `ubp-d1-cancel-spec-sentinel-${crypto.randomUUID()}.json`);
  let writerPid = null;
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const observation = waitForWriterStarted(path.join(fx.delegation, 'writer.json'));
    writerPid = observation.pid;
    process.kill(receipt.worker_pid, 'SIGKILL');
    waitForExit(receipt.worker_pid);

    fs.writeFileSync(sentinel, 'sentinel-payload\n');
    const specFile = path.join(fx.delegation, 'worker-spec.json');
    const originalSpec = fs.readFileSync(specFile, 'utf8');
    fs.writeFileSync(specFile, `${JSON.stringify({
      ...JSON.parse(originalSpec), fence: sentinel,
    }, null, 2)}\n`);
    const tampered = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    // Drift may block synthesized terminal fields only: the canonical signal
    // is still created and reported.
    assert.equal(tampered.status, 0, tampered.stderr);
    assert.ok(fs.existsSync(path.join(fx.delegation, 'cancel.request')), 'the cancel signal must be created before spec consumption');
    assert.equal(fs.existsSync(path.join(fx.delegation, 'result.json')), false, 'a drifted spec must not be consumed for terminal fields');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel-payload\n');
    assert.equal(heldFenceCount(fx.root), 1, 'the live writer keeps the fence retained');

    // The restored spec cancels truthfully: the live writer keeps the outcome
    // unknown and the sentinel untouched.
    fs.writeFileSync(specFile, originalSpec);
    const cancel = spawnSync(process.execPath, [CLI, 'delegate', 'cancel', '--delegation', fx.delegation], {
      cwd: fx.root, encoding: 'utf8',
    });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'));
    assert.equal(result.failure_type, 'outcome_unknown');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel-payload\n');
  } finally {
    if (writerPid) {
      try { process.kill(writerPid, 'SIGKILL'); waitForExit(writerPid, 1500); } catch {}
    }
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('spec drift never blocks signalling a live worker', () => {
  const fx = fixture('cancel-drift-live');
  const sentinel = path.join(os.tmpdir(), `ubp-d1-drift-sentinel-${crypto.randomUUID()}.json`);
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    waitForWriterStarted(path.join(fx.delegation, 'writer.json'));

    fs.writeFileSync(sentinel, 'sentinel-payload\n');
    const specFile = path.join(fx.delegation, 'worker-spec.json');
    fs.writeFileSync(specFile, `${JSON.stringify({
      ...JSON.parse(fs.readFileSync(specFile, 'utf8')), fence: sentinel,
    }, null, 2)}\n`);

    const cancel = spawnSync(process.execPath, [
      SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(cancel.status, 0, cancel.stderr);
    assert.ok(fs.existsSync(path.join(fx.delegation, 'cancel.request')), 'the signal must be created before spec consumption');

    // The signalled live worker authors its own terminal result; nothing
    // synthetic is published over it and the sentinel stays byte-identical.
    const result = waitFor(path.join(fx.delegation, 'result.json'), 15000);
    assert.equal(result.failure_type, 'cancelled');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel-payload\n');
    waitForWorkerFinalized(fx.delegation);
    assert.equal(heldFenceCount(fx.root), 0, 'the worker releases its own proven-safe fence');
  } finally {
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('recovery fails closed on conflicting or malformed lock and receipt facts', () => {
  const fx = fixture('recovery-conflict');
  try {
    const cases = [
      {
        name: 'launch identity conflict',
        mutate: (fabricated) => {
          const lock = JSON.parse(fs.readFileSync(fabricated.files.lock, 'utf8'));
          lock.launch_id = '22222222-2222-4222-8222-222222222222';
          fs.writeFileSync(fabricated.files.lock, `${JSON.stringify(lock, null, 2)}\n`);
        },
      },
      {
        name: 'spec digest conflict',
        mutate: (fabricated) => {
          const lock = JSON.parse(fs.readFileSync(fabricated.files.lock, 'utf8'));
          lock.spec_digest = 'b'.repeat(64);
          fs.writeFileSync(fabricated.files.lock, `${JSON.stringify(lock, null, 2)}\n`);
        },
      },
      {
        name: 'worker pid conflict',
        mutate: (fabricated) => {
          const lock = JSON.parse(fs.readFileSync(fabricated.files.lock, 'utf8'));
          lock.pid = 123125;
          fs.writeFileSync(fabricated.files.lock, `${JSON.stringify(lock, null, 2)}\n`);
        },
      },
      {
        name: 'delegation identity conflict',
        mutate: (fabricated) => {
          const receipt = JSON.parse(fs.readFileSync(fabricated.files.receipt, 'utf8'));
          receipt.delegation_id = 'some-other-run';
          fs.writeFileSync(fabricated.files.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
        },
      },
    ];
    for (const scenario of cases) {
      const dir = addDelegation(fx, `conflict-${scenario.name.replace(/\s+/gu, '-')}`);
      const fabricated = fabricateCancellableRun(fx, dir);
      scenario.mutate(fabricated);
      const status = spawnSync(process.execPath, [
        SKILL_RUNNER, 'status', '--delegation', dir,
      ], { cwd: fx.root, encoding: 'utf8' });
      assert.notEqual(status.status, 0, `${scenario.name}: recovery must fail closed`);
      assert.match(status.stderr, /conflict|malformed|resolve/iu, scenario.name);
      const cancel = spawnSync(process.execPath, [
        SKILL_RUNNER, 'cancel', '--delegation', dir,
      ], { cwd: fx.root, encoding: 'utf8' });
      assert.notEqual(cancel.status, 0, `${scenario.name}: cancel must fail closed`);
      assert.match(cancel.stderr, /conflict|malformed|resolve/iu, scenario.name);
      assert.equal(fs.existsSync(fabricated.files.result), false, scenario.name);
      // A fail-closed cancel never releases the fabricated fence, so the test
      // itself must free the shared worktree before fabricating the next case.
      try {
        require(SKILL_RUNNER).releaseWorktreeFence(fx.root, path.basename(dir), {
          launchId: fabricated.launchId,
        });
      } catch {}
    }

    // Malformed lock bytes are rejected as facts, not silently ignored.
    const malformedDir = addDelegation(fx, 'conflict-malformed-lock');
    const malformed = fabricateCancellableRun(fx, malformedDir);
    fs.writeFileSync(malformed.files.lock, '{not-json');
    const status = spawnSync(process.execPath, [
      SKILL_RUNNER, 'status', '--delegation', malformedDir,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.notEqual(status.status, 0);
    assert.match(status.stderr, /malformed|resolve/iu);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a reused bound pid is not trusted or held through a raw liveness fallback', () => {
  const fx = fixture('reused-pid');
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  sleeper.unref();
  try {
    assert.ok(Number.isInteger(sleeper.pid) && sleeper.pid > 0);
    // The recorded start identity cannot match any current process, so the
    // bound worker is provably gone even though its pid answers probe(0).
    const fabricated = fabricateCancellableRun(fx, fx.delegation, {
      workerPid: sleeper.pid,
      workerStartIdentity: { type: 'linux_procfs_starttime', value: '1' },
    });
    const snapshot = spawnSync(process.execPath, [
      SKILL_RUNNER, 'status', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(snapshot.status, 0, snapshot.stderr);
    const observed = JSON.parse(snapshot.stdout);
    const cancel = spawnSync(process.execPath, [
      SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(cancel.status, 0, cancel.stderr);
    if (process.platform === 'linux') {
      // Where the kernel start time is observable, a same-type different
      // value proves pid reuse: stopped, and the provably-reused worker may
      // not hold a truthful stopped-boundary cancellation open through a raw
      // pid probe.
      assert.equal(observed.status, 'stalled');
      assert.ok(
        fs.existsSync(fabricated.files.result),
        'a reused bound pid must not defer a truthful stopped-boundary cancellation',
      );
      const result = JSON.parse(fs.readFileSync(fabricated.files.result, 'utf8'));
      assert.equal(result.failure_type, 'cancelled');
      assert.equal(fs.existsSync(fabricated.files.lock), false);
      assert.equal(heldFenceCount(fx.root), 0);
    } else {
      // The recorded identity type is known but currently unobservable on
      // this platform: the live pid is never stopped through raw liveness,
      // status stays conservatively unknown, and cancel signals without
      // synthesizing a terminal, deleting the lock, or releasing the fence.
      assert.equal(observed.status, 'unknown');
      assert.equal(JSON.parse(cancel.stdout).status, 'cancel_requested');
      assert.equal(
        fs.existsSync(fabricated.files.result), false,
        'an unobservable bound identity must not authorize a cancelled terminal',
      );
      assert.equal(fs.existsSync(fabricated.files.lock), true);
      assert.equal(heldFenceCount(fx.root), 1);
    }
  } finally {
    try { process.kill(sleeper.pid, 'SIGKILL'); waitForExit(sleeper.pid, 1500); } catch {}
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a post-spawn pre-claim launch-bound lock stays outer-worker unknown', () => {
  const fx = fixture('preclaim-gap');
  try {
    // The exact post-spawn/pre-claim recovery state: the launcher bound the
    // lock with no worker pid and no identity, wrote the spec and the
    // not_started writer observation, held the fence, and died before the
    // receipt. The detached worker may still exist unobserved.
    const fabricated = fabricateCancellableRun(fx, fx.delegation, {
      workerPid: null,
      workerStartIdentity: null,
    });
    fs.rmSync(fabricated.files.receipt);

    const snapshot = spawnSync(process.execPath, [
      SKILL_RUNNER, 'status', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(snapshot.status, 0, snapshot.stderr);
    assert.equal(JSON.parse(snapshot.stdout).status, 'unknown');

    const cancel = spawnSync(process.execPath, [
      SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(cancel.status, 0, cancel.stderr);
    assert.equal(JSON.parse(cancel.stdout).status, 'cancel_requested');
    assert.ok(fs.existsSync(fabricated.files.cancel), 'the signal is created first');
    assert.equal(
      fs.existsSync(fabricated.files.result), false,
      'an unclaimed worker must not be proven stopped',
    );
    assert.equal(
      fs.existsSync(fabricated.files.lock), true,
      'unknown never authorizes deleting the launch-bound lock',
    );
    assert.equal(heldFenceCount(fx.root), 1, 'unknown never authorizes releasing the fence');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('an unknown worker start-identity type fails closed as a malformed recovery fact', () => {
  const fx = fixture('identity-type');
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  sleeper.unref();
  try {
    const fabricated = fabricateCancellableRun(fx, fx.delegation, {
      workerPid: sleeper.pid,
      workerStartIdentity: { type: 'vendor_unstable_identity', value: '1' },
    });
    for (const command of ['status', 'cancel']) {
      const outcome = spawnSync(process.execPath, [
        SKILL_RUNNER, command, '--delegation', fx.delegation,
      ], { cwd: fx.root, encoding: 'utf8' });
      assert.notEqual(outcome.status, 0, `${command}: an unknown identity type must fail closed`);
      assert.match(outcome.stderr, /malformed|resolve/iu, command);
    }
    assert.equal(fs.existsSync(fabricated.files.result), false);
    assert.equal(heldFenceCount(fx.root), 1);
  } finally {
    try { process.kill(sleeper.pid, 'SIGKILL'); waitForExit(sleeper.pid, 1500); } catch {}
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

// A test-scoped separate worker driver: it wraps fs.readFileSync inside the
// worker process before the worker module loads, so only the worker's second
// read of the launch-bound lock — the claim readback — observes a persisted
// identity that was changed or omitted. No production fault hook or public
// testing API is involved.
function readbackInterposer(fx, mode) {
  return fakeCli(fx, `
const fs = require('node:fs');
const [lockFile, specFile, digest, workerPath, faultMode] = process.argv.slice(2);
const realReadFileSync = fs.readFileSync;
let lockReads = 0;
fs.readFileSync = function interposedReadFileSync(file, ...rest) {
  let content = realReadFileSync.call(fs, file, ...rest);
  if (file === lockFile) {
    lockReads += 1;
    if (lockReads === 2) {
      const persisted = JSON.parse(content);
      if (faultMode === 'omitted') delete persisted.worker_start_identity;
      else persisted.worker_start_identity = { type: 'linux_procfs_starttime', value: '424242' };
      content = JSON.stringify(persisted, null, 2) + '\\n';
    }
  }
  return content;
};
process.argv = [process.argv[0], workerPath, specFile, digest];
require(workerPath);
`);
}

test('the worker lock-claim readback refuses a changed or omitted start identity', () => {
  for (const mode of ['changed', 'omitted']) {
    const fx = fixture(`readback-${mode}`);
    const marker = path.join(fx.root, 'host-launched.marker');
    try {
      // The host child env is rebuilt from the spec alone, so the fake cannot
      // rely on a PATH-dependent shebang.
      const fake = path.join(fx.root, `fake-readback-${mode}.cjs`);
      fs.writeFileSync(fake, `#!${process.execPath}
'use strict';
require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});
`);
      fs.chmodSync(fake, 0o755);
      const launchId = '99999999-9999-4999-8999-999999999999';
      const delegationId = path.basename(fx.delegation);
      const { acquireWorktreeFence, fenceFileName } = require(SKILL_RUNNER);
      acquireWorktreeFence(fx.root, {
        delegationId, launchId, worktree: fx.worktree,
        writableRootPaths: [path.join(fx.worktree, 'src')],
      });
      const writerFile = path.join(fx.delegation, 'writer.json');
      fs.writeFileSync(writerFile, notStartedObservation(delegationId, launchId));
      const schema = path.join(fx.delegation, 'result-schema.json');
      fs.writeFileSync(schema, '{"type":"object"}\n');
      const lockFile = path.join(fx.delegation, 'run.lock');
      const spec = {
        $schema: 'ultra-delegation-worker-spec-v1',
        delegation_id: delegationId,
        launch_id: launchId,
        host: 'codex',
        model: null,
        command: fake,
        transport_maturity: 'documented+verified',
        transport_surface: 'fabricated fixture surface',
        execution_driver: 'cli',
        driver_fallback_reason: null,
        args: [],
        cwd: fx.worktree,
        project_root: fs.realpathSync(fx.root),
        instruction: path.join(fx.delegation, 'instruction.md'),
        permission: path.join(fx.delegation, 'permission.json'),
        instruction_digest: sha256File(path.join(fx.delegation, 'instruction.md')),
        permission_digest: sha256File(path.join(fx.delegation, 'permission.json')),
        output_schema: schema,
        output_schema_digest: sha256File(schema),
        host_output: path.join(fx.delegation, 'host-result.json'),
        read_only: false,
        writable_roots: ['src'],
        writable_root_paths: [path.join(fx.worktree, 'src')],
        base_head: git(fx.worktree, 'rev-parse', 'HEAD'),
        started_at: new Date().toISOString(),
        timeout_ms: 10000,
        result: path.join(fx.delegation, 'result.json'),
        stdout: path.join(fx.delegation, 'stdout.log'),
        stderr: path.join(fx.delegation, 'stderr.log'),
        events: null,
        lock: lockFile,
        cancel: path.join(fx.delegation, 'cancel.request'),
        writer_observation: writerFile,
        fence: path.join(fenceRegistryOf(fx.root), fenceFileName(delegationId)),
        env_keys: [],
        env: {},
      };
      const specFile = path.join(fx.delegation, 'worker-spec.json');
      fs.writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
      const digest = sha256File(specFile);
      // The launcher's pre-spawn lock form is claimable: the worker must bind
      // its identity and read the exact value back before the host may run.
      fs.writeFileSync(lockFile, `${JSON.stringify({
        delegation_id: delegationId,
        launch_id: launchId,
        started_at: spec.started_at,
        spec_digest: digest,
        pid: null,
        worker_start_identity: null,
      }, null, 2)}\n`);

      const worker = spawnSync(process.execPath, [
        readbackInterposer(fx, mode), lockFile, specFile, digest, WORKER, mode,
      ], { cwd: fx.root, encoding: 'utf8', timeout: 30000 });
      assert.equal(worker.status, 0, worker.stderr);
      assert.equal(
        fs.existsSync(marker), false,
        `${mode}: the host must never launch behind an unproven lock identity`,
      );
      const result = waitFor(spec.result);
      assert.equal(result.failure_type, 'worker_lock_unbound', mode);
      assert.ok(fs.existsSync(lockFile), `${mode}: the refused lock stays behind as evidence`);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }
});

test('a worker that cannot bind its identity to the launch-bound lock never launches the host', () => {
  const fx = fixture('worker-claim-refused');
  const marker = path.join(fx.root, 'host-launched.marker');
  try {
    const fake = fakeCli(fx, `
require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});
`);
    const launchId = '88888888-8888-4888-8888-888888888888';
    const delegationId = path.basename(fx.delegation);
    const { acquireWorktreeFence, fenceFileName } = require(SKILL_RUNNER);
    acquireWorktreeFence(fx.root, {
      delegationId, launchId, worktree: fx.worktree,
      writableRootPaths: [path.join(fx.worktree, 'src')],
    });
    const writerFile = path.join(fx.delegation, 'writer.json');
    fs.writeFileSync(writerFile, notStartedObservation(delegationId, launchId));
    const schema = path.join(fx.delegation, 'result-schema.json');
    fs.writeFileSync(schema, '{"type":"object"}\n');
    const spec = {
      $schema: 'ultra-delegation-worker-spec-v1',
      delegation_id: delegationId,
      launch_id: launchId,
      host: 'codex',
      model: null,
      command: fake,
      transport_maturity: 'documented+verified',
      transport_surface: 'fabricated fixture surface',
      execution_driver: 'cli',
      driver_fallback_reason: null,
      args: [],
      cwd: fx.worktree,
      project_root: fs.realpathSync(fx.root),
      instruction: path.join(fx.delegation, 'instruction.md'),
      permission: path.join(fx.delegation, 'permission.json'),
      instruction_digest: sha256File(path.join(fx.delegation, 'instruction.md')),
      permission_digest: sha256File(path.join(fx.delegation, 'permission.json')),
      output_schema: schema,
      output_schema_digest: sha256File(schema),
      host_output: path.join(fx.delegation, 'host-result.json'),
      read_only: false,
      writable_roots: ['src'],
      writable_root_paths: [path.join(fx.worktree, 'src')],
      base_head: git(fx.worktree, 'rev-parse', 'HEAD'),
      started_at: new Date().toISOString(),
      timeout_ms: 10000,
      result: path.join(fx.delegation, 'result.json'),
      stdout: path.join(fx.delegation, 'stdout.log'),
      stderr: path.join(fx.delegation, 'stderr.log'),
      events: null,
      lock: path.join(fx.delegation, 'run.lock'),
      cancel: path.join(fx.delegation, 'cancel.request'),
      writer_observation: writerFile,
      fence: path.join(fenceRegistryOf(fx.root), fenceFileName(delegationId)),
      env_keys: [],
      env: {},
    };
    const specFile = path.join(fx.delegation, 'worker-spec.json');
    fs.writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
    const digest = sha256File(specFile);
    // The tampered lock no longer matches the launch-bound spec digest, so the
    // worker must refuse to claim it and must not launch the host.
    fs.writeFileSync(spec.lock, `${JSON.stringify({
      delegation_id: delegationId,
      launch_id: launchId,
      started_at: spec.started_at,
      spec_digest: 'f'.repeat(64),
      pid: null,
      worker_start_identity: null,
    }, null, 2)}\n`);
    const worker = spawnSync(process.execPath, [WORKER, specFile, digest], {
      cwd: fx.root, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(worker.status, 0, worker.stderr);
    assert.equal(fs.existsSync(marker), false, 'the host must never launch behind an unbound lock');
    const result = waitFor(spec.result);
    assert.equal(result.failure_type, 'worker_lock_unbound');
    assert.equal(JSON.parse(fs.readFileSync(writerFile, 'utf8')).phase, 'not_started');
    // The safely-failed run releases the fence but keeps the tampered lock as
    // evidence for inspection.
    assert.equal(heldFenceCount(fx.root), 0);
    assert.ok(fs.existsSync(spec.lock));
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a pre-existing cancel request is a prior-run artifact that blocks a new launch', () => {
  const fx = fixture('stale-cancel-request');
  try {
    fs.writeFileSync(path.join(fx.delegation, 'cancel.request'), `${JSON.stringify({ requested_at: '2026-09-01T00:00:00.000Z' })}\n`);
    const fake = fakeCli(fx, 'process.exit(0);');
    const started = start(fx, fake);
    assert.notEqual(started.status, 0, 'a stale cancel request must block a new run');
    assert.match(started.stderr, /artifact|already|cancel/iu);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a missing host binary publishes a truthful releasable spawn_error', () => {
  const fx = fixture('spawn-error');
  try {
    const missing = path.join(fx.root, 'definitely-missing-host');
    const started = start(fx, missing);
    assert.equal(started.status, 0, started.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'), 15000);
    assert.equal(result.status, 'failed');
    assert.equal(result.failure_type, 'spawn_error');
    waitForWorkerFinalized(fx.delegation);
    // The OS-confirmed no-pid failure restored a releasable boundary: no
    // impossible writer is frozen behind a spawn that never existed.
    assert.equal(fs.existsSync(path.join(fx.delegation, 'run.lock')), false);
    assert.equal(heldFenceCount(fx.root), 0);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('outcome_unknown stays frozen when the descendant dies after the first boundary proof', () => {
  const fx = fixture('unknown-freeze');
  const nestedPidFile = path.join(fx.delegation, 'nested-writer.pid');
  let nestedPid = null;
  try {
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
nested.unref();
fs.writeFileSync(${JSON.stringify(nestedPidFile)}, String(nested.pid) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload([])))});
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const resultFile = path.join(fx.delegation, 'result.json');
    const frozen = waitFor(resultFile, 15000);
    assert.equal(frozen.failure_type, 'outcome_unknown');
    nestedPid = Number(fs.readFileSync(nestedPidFile, 'utf8'));

    // The descendant dies inside the worker's finally window: the frozen
    // terminal must not release through a later proof or elapsed time.
    process.kill(nestedPid, 'SIGKILL');
    waitForExit(nestedPid);
    nestedPid = null;
    const workerPid = JSON.parse(fs.readFileSync(
      path.join(fx.delegation, 'receipt.json'), 'utf8',
    )).worker_pid;
    waitForExit(workerPid, 6000);
    assert.ok(fs.existsSync(path.join(fx.delegation, 'run.lock')), 'the frozen run lock must be retained for repair');
    assert.equal(heldFenceCount(fx.root), 1, 'the frozen fence must be retained');

    const secondId = addDelegation(fx, 'unknown-freeze-second');
    const second = launch(fx, secondId, fake);
    assert.notEqual(second.status, 0, 'a frozen root must not admit a second writer');
    assert.match(second.stderr, /overlap|conflict|fence/iu);

    // Explicit cancel releases after current matching stop proof without
    // rewriting the immutable terminal result.
    const repair = spawnSync(process.execPath, [
      SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(repair.status, 0, repair.stderr);
    const repaired = JSON.parse(repair.stdout);
    assert.equal(repaired.status, 'already_terminal');
    assert.equal(repaired.fence_released, true);
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).failure_type, 'outcome_unknown');
    assert.equal(heldFenceCount(fx.root), 0);
  } finally {
    if (nestedPid) {
      try { process.kill(nestedPid, 'SIGKILL'); waitForExit(nestedPid, 1500); } catch {}
    }
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('a fast pre-host cancel leaves no recreated or partial fence behind', () => {
  const fx = fixture('fast-cancel');
  try {
    const fake = fakeCli(fx, 'setInterval(() => {}, 1000);');
    const started = start(fx, fake, ['--timeout', '30']);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const cancel = spawnSync(process.execPath, [
      CLI, 'delegate', 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.equal(cancel.status, 0, cancel.stderr);
    const result = waitFor(path.join(fx.delegation, 'result.json'), 15000);
    assert.equal(result.failure_type, 'cancelled');
    waitForExit(receipt.worker_pid, 8000);

    const registry = fenceRegistryOf(fx.root);
    const leftovers = fs.existsSync(registry)
      ? fs.readdirSync(registry).filter((name) => name.endsWith('.json') || name.includes('.tmp-fence'))
      : [];
    assert.deepEqual(leftovers, [], 'no fence entry or temporary may be recreated after release');
    assert.equal(fs.existsSync(path.join(fx.delegation, 'run.lock')), false);
    // The post-spawn fence PID rewrite had no reader and is gone entirely.
    assert.equal('updateWorktreeFence' in require(SKILL_RUNNER), false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('fence entries with non-absolute roots are invalid and block admission', () => {
  const { acquireWorktreeFence, fenceFileName, releaseWorktreeFence } = require(SKILL_RUNNER);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-fence-relative-'));
  try {
    const wtA = path.join(root, 'wt-a');
    const wtProbe = path.join(root, 'wt-probe');
    fs.mkdirSync(wtA, { recursive: true });
    fs.mkdirSync(wtProbe, { recursive: true });
    const registry = path.join(root, '.ultra', '.runtime', 'delegation-fences');
    fs.mkdirSync(registry, { recursive: true });
    // Acquire one real fence first so the crafted entries carry exactly the
    // implementation's current field set: their only defect is a relative root.
    acquireWorktreeFence(root, {
      delegationId: 'd-probe', launchId: '44444444-4444-4444-8444-444444444444',
      worktree: wtProbe, writableRootPaths: [wtProbe],
    });
    const template = JSON.parse(fs.readFileSync(
      path.join(registry, fenceFileName('d-probe')), 'utf8',
    ));
    releaseWorktreeFence(root, 'd-probe', { launchId: '44444444-4444-4444-8444-444444444444' });
    const relativeFence = (worktree, writableRoots) => `${JSON.stringify({
      ...template,
      delegation_id: 'd-relative',
      launch_id: '55555555-5555-4555-8555-555555555555',
      worktree,
      writable_roots: writableRoots,
    }, null, 2)}\n`;

    fs.writeFileSync(path.join(registry, fenceFileName('d-relative')), relativeFence('wt/relative', []));
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-other', launchId: '66666666-6666-4666-8666-666666666666',
      worktree: wtA, writableRootPaths: [],
    }), /invalid|resolve|fence/iu, 'a relative worktree root must fail closed');

    fs.writeFileSync(path.join(registry, fenceFileName('d-relative')), relativeFence(wtA, ['src/relative']));
    assert.throws(() => acquireWorktreeFence(root, {
      delegationId: 'd-other', launchId: '66666666-6666-4666-8666-666666666666',
      worktree: wtA, writableRootPaths: [],
    }), /invalid|resolve|fence/iu, 'a relative writable root must fail closed');

    assert.throws(() => releaseWorktreeFence(root, 'd-relative', {
      launchId: '55555555-5555-4555-8555-555555555555',
    }), /invalid|resolve|fence/iu, 'releasing a relative-root fence must fail closed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cancel refuses a symlinked cancel request and never touches the external target', () => {
  const fx = fixture('cancel-symlink');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-cancel-symlink-out-'));
  const sentinel = path.join(outside, 'cancel-target.json');
  try {
    fs.writeFileSync(sentinel, 'sentinel-payload\n');
    const fabricated = fabricateCancellableRun(fx, fx.delegation);
    fs.symlinkSync(sentinel, fabricated.files.cancel);

    const cancel = spawnSync(process.execPath, [
      SKILL_RUNNER, 'cancel', '--delegation', fx.delegation,
    ], { cwd: fx.root, encoding: 'utf8' });
    assert.notEqual(cancel.status, 0, 'a symlinked cancel signal must be refused');
    assert.match(cancel.stderr, /symlink|refus/iu);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'sentinel-payload\n');
    assert.ok(fs.lstatSync(fabricated.files.cancel).isSymbolicLink());
    assert.equal(fs.existsSync(fabricated.files.result), false, 'no terminal result may be synthesized through a refused signal');
    assert.equal(heldFenceCount(fx.root), 1, 'the fence stays retained');
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
