'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'install.js');
const WAIT = path.join(ROOT, 'skills', 'ultra-delegate', 'scripts', 'delegate_wait.py');
const { hostProfile } = require('../adapters/_shared/host-profile.cjs');

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

function start(fx, fake, extra = []) {
  return spawnSync(process.execPath, [
    CLI, 'delegate', 'run', '--to', 'codex',
    '--instruction', path.join(fx.delegation, 'instruction.md'),
    '--permission', path.join(fx.delegation, 'permission.json'),
    '--worktree', fx.worktree,
    ...extra,
  ], {
    cwd: fx.root,
    encoding: 'utf8',
    env: { ...process.env, UBP_DELEGATE_CODEX_BIN: fake },
  });
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

test('host profiles use bounded native permission modes without bypass flags', () => {
  const prompt = 'Read the packet and write the result.';
  const cwd = '/tmp/worktree';
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
  assert.deepEqual(claude.slice(0, 2), ['-p', prompt]);
  assert.equal(claude[claude.indexOf('--tools') + 1], 'Read,Write,Edit,Grep,Glob');
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
  assert.equal(grok[grok.indexOf('--sandbox') + 1], 'workspace');

  const readOnly = { ...options, readOnly: true, writableRoots: [] };
  const readOnlyClaude = hostProfile('claude').delegateArgv(prompt, cwd, readOnly);
  const readOnlyCodex = hostProfile('codex').delegateArgv(prompt, cwd, readOnly);
  const readOnlyKimi = hostProfile('kimi').delegateArgv(prompt, cwd, readOnly);
  const readOnlyGrok = hostProfile('grok').delegateArgv(prompt, cwd, readOnly);
  assert.equal(readOnlyClaude[readOnlyClaude.indexOf('--permission-mode') + 1], 'plan');
  assert.equal(readOnlyCodex[readOnlyCodex.indexOf('--sandbox') + 1], 'read-only');
  assert.match(readOnlyKimi.at(-1), /kimi-read-only\.md$/);
  assert.equal(readOnlyGrok[readOnlyGrok.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(
    JSON.parse(hostProfile('opencode').delegateEnv(readOnly).OPENCODE_CONFIG_CONTENT)
      .permission.edit['*'],
    'deny',
  );
});

test('delegate publishes a digest-bound result after enforcing the isolated Git diff', () => {
  const fx = fixture();
  try {
    const payload = JSON.stringify(resultPayload());
    const fake = fakeCli(fx, `
const fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(path.join(process.env.UBP_DELEGATE_WORKTREE, 'src', 'delegated.js'), 'module.exports = 42;\\n');
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
fs.writeFileSync(path.join(process.env.UBP_DELEGATE_WORKTREE, 'src', 'delegated.js'), 'module.exports = 42;\\n');
process.stdout.write(${JSON.stringify(payload)});
`);
    const started = start(fx, fake);
    assert.equal(started.status, 0, started.stderr);
    const receipt = JSON.parse(started.stdout);
    const resultFile = path.join(fx.delegation, 'result.json');
    waitFor(resultFile);
    waitForExit(receipt.worker_pid);
    fs.unlinkSync(resultFile);

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
  fs.mkdirSync(path.join(process.env.UBP_DELEGATE_WORKTREE, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(process.env.UBP_DELEGATE_WORKTREE, 'docs', 'escape.md'), 'escape\\n');
}
if (${JSON.stringify(scenario)} === 'mutated') {
  fs.appendFileSync(process.env.UBP_DELEGATE_PERMISSION_FILE, '\\n');
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
const dir = path.join(process.env.UBP_DELEGATE_WORKTREE, '.ultra');
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
