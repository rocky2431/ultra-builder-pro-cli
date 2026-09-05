'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FAKE_AGENT = path.join(__dirname, 'fixtures', 'fake-acp-agent.cjs');
const {
  deriveWriterState,
  runExecutionDriver,
  selectExecutionDriver,
  terminateProcessGroup,
  writeObservationPhase,
} = require('../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const { AcpDriver } = require('../skills/ultra-delegate/scripts/acp-driver.cjs');
const { CliDriver } = require('../skills/ultra-delegate/scripts/cli-driver.cjs');
const {
  ZCODE_ACP_SOURCE,
  hostProfile,
} = require('../skills/ultra-delegate/scripts/host-profile.cjs');

function resultPayload() {
  return {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'Completed through ACP.',
    changed_files: [],
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
  };
}

function fixture(scenario, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-driver-'));
  const cwd = path.join(root, 'worktree');
  const writable = path.join(cwd, 'src');
  fs.mkdirSync(writable, { recursive: true });
  const spec = {
    command: process.execPath,
    args: [FAKE_AGENT],
    delegation_id: 'driver-fixture',
    launch_id: '12345678-1234-4123-8123-123456789abc',
    cwd,
    env: {
      FAKE_ACP_SCENARIO: scenario,
      FAKE_ACP_TRACE: path.join(root, 'trace.jsonl'),
      FAKE_ACP_CHILD_PID: path.join(root, 'child.pid'),
      FAKE_ACP_RESULT: JSON.stringify(resultPayload()),
      FAKE_ACP_LOCATION: path.join(writable, 'delegated.js'),
    },
    prompt: 'Execute the digest-bound Ultra packet.',
    read_only: false,
    writable_root_paths: [writable],
    env_keys: ['PATH'],
    writer_observation: path.join(root, 'writer.json'),
    cancel: path.join(root, 'cancel.request'),
    stdout: path.join(root, 'stdout.log'),
    stderr: path.join(root, 'stderr.log'),
    host_output: path.join(root, 'host-result.json'),
    events: path.join(root, 'events.jsonl'),
    timeout_ms: 3000,
    ...overrides,
  };
  // The launcher persists an explicit identity-bound not_started observation
  // before any worker exists, so the driver fixtures start from that state.
  writeObservationPhase(spec.writer_observation, {
    identity: { delegationId: spec.delegation_id, launchId: spec.launch_id },
    phase: 'not_started',
  });
  return { root, cwd, writable, spec };
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForFile(file, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function waitForExit(pid, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for process ${pid}`);
}

test('ACP v1 negotiates, creates one absolute-cwd session, streams derived events, and emits the existing result input', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.termination, null);
  assert.equal(outcome.protocolVersion, 1);
  assert.equal(outcome.stopReason, 'end_turn');
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.spec.host_output, 'utf8')), resultPayload());

  const trace = readJsonLines(fx.spec.env.FAKE_ACP_TRACE)
    .filter((entry) => entry.direction === 'client_to_agent')
    .map((entry) => entry.message);
  assert.deepEqual(trace.slice(0, 3).map((message) => message.method), [
    'initialize', 'session/new', 'session/prompt',
  ]);
  assert.equal(trace[0].params.protocolVersion, 1);
  assert.deepEqual(trace[0].params.clientCapabilities, {
    fs: { readTextFile: false, writeTextFile: false },
    terminal: false,
    auth: { terminal: false },
  });
  assert.equal(trace[1].params.cwd, fx.cwd);
  assert.deepEqual(trace[1].params.mcpServers, []);
  assert.deepEqual(trace[2].params.prompt, [{ type: 'text', text: fx.spec.prompt }]);

  const eventSource = fs.readFileSync(fx.spec.events, 'utf8');
  assert.doesNotMatch(eventSource, /hidden-reasoning-secret|raw-secret|read secret title/u);
  const events = readJsonLines(fx.spec.events);
  assert.ok(events.some((event) => event.type === 'protocol' && event.phase === 'initialized'));
  assert.ok(events.some((event) => event.type === 'update' && event.update_type === 'plan'));
  assert.ok(events.some((event) => event.type === 'update' && event.update_type === 'tool_call'));
  assert.ok(events.some((event) => event.type === 'terminal' && event.stop_reason === 'end_turn'));
  assert.ok(events.every((event) => !('content' in event) && !('rawInput' in event)));
});

test('ACP records a nonzero adapter exit during client-owned shutdown without overturning a completed turn', async (t) => {
  const fx = fixture('happy');
  fx.spec.env.FAKE_ACP_EXIT_ON_STDIN_END = '7';
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.signal, null);
  assert.equal(outcome.protocolVersion, 1);
  assert.equal(outcome.stopReason, 'end_turn');
  assert.equal(outcome.adapterExitCode, 7);
  assert.equal(outcome.adapterExitSignal, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.spec.host_output, 'utf8')), resultPayload());
});

test('ACP permission policy selects allow_once only for writes already inside the immutable envelope', async (t) => {
  const fx = fixture('permission-allow');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  const observations = readJsonLines(fx.spec.env.FAKE_ACP_TRACE)
    .filter((entry) => entry.permission_response);
  assert.deepEqual(observations.at(-1).permission_response, {
    outcome: { outcome: 'selected', optionId: 'allow-once' },
  });
  const events = readJsonLines(fx.spec.events);
  assert.ok(events.some((event) => (
    event.type === 'permission' && event.decision === 'allow_once'
      && event.scope === 'inside_envelope'
  )));
});

test('ACP envelope widening is denied and cannot be converted into a successful Ultra result', async (t) => {
  const fx = fixture('permission-widening');
  fx.spec.env.FAKE_ACP_LOCATION = path.join(fx.root, 'outside.js');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'permission_denied');
  const observations = readJsonLines(fx.spec.env.FAKE_ACP_TRACE)
    .filter((entry) => entry.permission_response);
  assert.deepEqual(observations.at(-1).permission_response, {
    outcome: { outcome: 'selected', optionId: 'reject-once' },
  });
  assert.equal(fs.existsSync(fx.spec.host_output), false);
  assert.match(fs.readFileSync(fx.spec.events, 'utf8'), /outside_envelope/u);
});

for (const [scenario, expectedTermination, timeoutMs] of [
  ['cancel', 'cancelled', 3000],
  ['hang', 'timeout', 180],
]) {
  test(`ACP ${expectedTermination} reaches terminal transport state and kills the process group`, async (t) => {
    const fx = fixture(scenario, { timeout_ms: timeoutMs });
    t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
    const running = new AcpDriver(fx.spec).run();
    await waitForFile(fx.spec.env.FAKE_ACP_CHILD_PID);
    const childPid = Number(fs.readFileSync(fx.spec.env.FAKE_ACP_CHILD_PID, 'utf8'));
    assert.equal(processAlive(childPid), true);
    if (expectedTermination === 'cancelled') {
      fs.writeFileSync(fx.spec.cancel, `${JSON.stringify({ requested_at: new Date().toISOString() })}\n`);
    }
    const outcome = await running;
    assert.equal(outcome.termination, expectedTermination, JSON.stringify(outcome));
    await waitForExit(childPid);
    assert.equal(processAlive(childPid), false);
  });
}

for (const [scenario, failureType] of [
  ['malformed', 'acp_malformed_message'],
  ['invalid-response-shape', 'acp_malformed_message'],
  ['wrong-version', 'acp_protocol_version'],
  ['auth-required', 'acp_auth_required'],
  ['malformed-update', 'acp_malformed_update'],
  ['event-flood', 'acp_event_limit'],
  ['early-exit', 'acp_process_exit'],
]) {
  test(`ACP ${scenario} produces typed protocol failure ${failureType}`, async (t) => {
    const fx = fixture(scenario);
    t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
    const outcome = await new AcpDriver(fx.spec).run();
    assert.equal(outcome.failureType, failureType, JSON.stringify(outcome));
  });
}

test('ACP stopReason remains transport observation and does not synthesize an Ultra result', async (t) => {
  const fx = fixture('no-result');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
  assert.equal(fs.existsSync(fx.spec.host_output), false);
});

test('ACP mismatched session diagnostics disclose only envelope state', async (t) => {
  const fx = fixture('wrong-session-update');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_malformed_update');
  const diagnostic = outcome.failureSummary;
  assert.match(diagnostic, /session_established=true/u);
  assert.doesNotMatch(diagnostic, /fake-session|different-session/u);
});

test('ACP buffers bounded session metadata emitted before session/new resolves', async (t) => {
  const fx = fixture('early-session-update');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.spec.host_output, 'utf8')), resultPayload());
  assert.ok(readJsonLines(fx.spec.events).some((event) => (
    event.type === 'update' && event.update_type === 'available_commands_update'
  )));
});

for (const [scenario, failureType] of [
  ['early-session-mismatch', 'acp_malformed_update'],
  ['early-session-message', 'acp_early_update_type'],
  ['early-session-flood', 'acp_early_update_limit'],
]) {
  test(`ACP rejects unsafe or unbounded early session traffic as ${failureType}`, async (t) => {
    const fx = fixture(scenario);
    t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
    const outcome = await new AcpDriver(fx.spec).run();
    assert.equal(outcome.failureType, failureType, JSON.stringify(outcome));
    assert.equal(fs.existsSync(fx.spec.host_output), false);
  });
}

test('driver selection prefers only executable, stdio, ACP v1 candidates with passed per-Host conformance', () => {
  const marker = path.join(os.tmpdir(), `ubp-acp-probe-${process.pid}-${Date.now()}`);
  const passed = {
    acp: {
      surface: 'fake ACP stdio',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: { status: 'passed', evidence: 'tests/fake-acp' },
      command: () => process.execPath,
      argv: () => ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`],
    },
  };
  const selected = selectExecutionDriver({
    host: 'fake', profile: passed, cliCommand: 'fake-cli', env: process.env,
  });
  assert.equal(selected.driver, 'acp');
  assert.equal(selected.protocolVersion, 1);
  assert.equal(selected.fallbackReason, null);
  assert.equal(selected.acpCapability.executable_available, true);
  assert.equal(selected.acpCapability.candidate_valid, true);
  assert.equal(fs.existsSync(marker), false, 'capability probe must not start a provider process');

  const forcedCli = selectExecutionDriver({
    host: 'fake',
    profile: passed,
    cliCommand: 'fake-cli',
    env: { ...process.env, ULTRA_DELEGATE_FORCE_CLI: '1' },
  });
  assert.equal(forcedCli.driver, 'cli');
  assert.equal(forcedCli.fallbackReason, 'acp_forced_cli');
  assert.equal(forcedCli.acpCapability.candidate, true);
  assert.equal(fs.existsSync(marker), false, 'forced CLI recovery must not start ACP');

  const unverified = selectExecutionDriver({
    host: 'fake',
    profile: { ...passed, acp: { ...passed.acp, conformance: { status: 'not_run' } } },
    cliCommand: 'fake-cli',
    env: process.env,
  });
  assert.equal(unverified.driver, 'cli');
  assert.equal(unverified.fallbackReason, 'acp_conformance_not_passed');

  const unrecorded = selectExecutionDriver({
    host: 'fake',
    profile: {
      ...passed,
      acp: { ...passed.acp, conformance: { status: 'passed', evidence: '' } },
    },
    cliCommand: 'fake-cli',
    env: process.env,
  });
  assert.equal(unrecorded.driver, 'cli');
  assert.equal(unrecorded.fallbackReason, 'acp_conformance_evidence_missing');

  const missing = selectExecutionDriver({
    host: 'fake',
    profile: { ...passed, acp: { ...passed.acp, command: () => '/missing/agent' } },
    cliCommand: 'fake-cli',
    env: process.env,
  });
  assert.equal(missing.driver, 'cli');
  assert.equal(missing.fallbackReason, 'acp_command_unavailable');
});

test('all six Hosts expose the exact pinned or native stable ACP v1 stdio command', () => {
  const expected = {
    claude: {
      command: 'npx',
      args: ['--yes', '@agentclientprotocol/claude-agent-acp@0.70.0'],
    },
    codex: {
      command: 'npx',
      args: ['--yes', '@agentclientprotocol/codex-acp@1.6.2'],
    },
    opencode: { command: 'opencode', args: ['acp'] },
    kimi: { command: 'kimi', args: ['acp'] },
    grok: { command: 'grok', args: ['agent', 'stdio'] },
    zcode: {
      command: 'zcode-acp',
      args: ['--zcode-path', hostProfile('zcode').binary, '--no-browser'],
    },
  };

  for (const [host, wanted] of Object.entries(expected)) {
    const profile = hostProfile(host);
    assert.ok(profile.acp, host);
    assert.equal(profile.acp.transport, 'stdio', host);
    assert.deepEqual(profile.acp.protocolVersions, [1], host);
    assert.equal(profile.acp.command({
      host,
      cliCommand: profile.binary,
      env: {},
    }), wanted.command, host);
    assert.deepEqual(profile.acp.argv({
      host,
      cliCommand: profile.binary,
      env: {},
    }), wanted.args, host);
  }
});

test('ZCode bridge source binds the 0.16.5 compatibility patch by path and digest', () => {
  assert.deepEqual(ZCODE_ACP_SOURCE, {
    repository: 'https://github.com/jpalmae/zcode-acp',
    version: '0.1.0',
    commit: '42fe149d4b501469343c01f23ba3801832306d53',
    buildMarker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5',
    runtimeVersion: '0.16.5',
    patch: {
      path: 'skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch',
      sha256: '174dfd0feafe84320556a84b5ae08b10e44c5515fea4992fd1d58af54cee4e3d',
      compatibility: 'ZCode CLI 0.16.5 runtime-preferences handshake',
    },
  });
  const patchFile = path.join(ROOT, ZCODE_ACP_SOURCE.patch.path);
  const eolAttribute = execFileSync('git', [
    'check-attr', 'eol', '--', ZCODE_ACP_SOURCE.patch.path,
  ], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.match(eolAttribute, /: eol: lf$/u, 'the digest-bound patch must remain LF on Windows');
  assert.doesNotMatch(fs.readFileSync(patchFile, 'utf8'), /\r\n/u);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(patchFile)).digest('hex');
  assert.equal(digest, ZCODE_ACP_SOURCE.patch.sha256);
});

test('candidate identity requires exact bridge and runtime markers without starting a provider', (t) => {
  const binRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-identity-bin-'));
  t.after(() => fs.rmSync(binRoot, { recursive: true, force: true }));
  const executable = path.join(binRoot, 'identity-acp');
  fs.writeFileSync(executable, 'probe-only\n');
  fs.chmodSync(executable, 0o755);
  const profile = {
    acp: {
      surface: 'identity-bound fixture',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: { status: 'passed', evidence: 'fixture-receipt' },
      command: () => executable,
      argv: () => [],
      identityProbes: () => [
        {
          label: 'bridge',
          command: executable,
          args: ['--bridge-version'],
          expectedStdout: 'identity-acp 1.0.0+verified',
        },
        {
          label: 'runtime',
          command: executable,
          args: ['--runtime-version'],
          expectedStdout: 'runtime 2.0.0',
        },
      ],
    },
  };
  const cases = [
    {
      name: 'missing bridge marker',
      results: [{ status: 1, stdout: '', stderr: 'missing' }],
      driver: 'cli',
      fallback: 'acp_candidate_identity_unavailable',
      reason: 'bridge',
    },
    {
      name: 'wrong bridge marker',
      results: [{ status: 0, stdout: 'identity-acp 1.0.0\n', stderr: '' }],
      driver: 'cli',
      fallback: 'acp_candidate_identity_mismatch',
      reason: 'bridge',
    },
    {
      name: 'wrong runtime marker',
      results: [
        { status: 0, stdout: 'identity-acp 1.0.0+verified\n', stderr: '' },
        { status: 0, stdout: 'runtime 1.9.0\n', stderr: '' },
      ],
      driver: 'cli',
      fallback: 'acp_candidate_identity_mismatch',
      reason: 'runtime',
    },
    {
      name: 'exact bridge and runtime markers',
      results: [
        { status: 0, stdout: 'identity-acp 1.0.0+verified\n', stderr: '' },
        { status: 0, stdout: 'runtime 2.0.0\n', stderr: '' },
      ],
      driver: 'acp',
      fallback: null,
      reason: null,
    },
  ];
  for (const scenario of cases) {
    const calls = [];
    const selection = selectExecutionDriver({
      host: 'fixture',
      profile,
      cliCommand: 'fixture-cli',
      env: { ...process.env, PATH: binRoot },
      runCandidateProbe: (command, args, options) => {
        calls.push({ command, args, options });
        return scenario.results[calls.length - 1];
      },
    });
    assert.equal(selection.driver, scenario.driver, scenario.name);
    assert.equal(selection.fallbackReason, scenario.fallback, scenario.name);
    assert.equal(
      selection.acpCapability.candidate_identity_valid,
      scenario.driver === 'acp',
      scenario.name,
    );
    assert.equal(selection.acpCapability.candidate_identity_reason, scenario.reason, scenario.name);
    assert.equal(calls.length, scenario.results.length, scenario.name);
    assert.ok(calls.every((call) => call.options.timeout === 5000), scenario.name);
  }
});

test('Windows process termination kills the descendant tree and falls back to the direct child', () => {
  const calls = [];
  const child = {
    pid: 4242,
    kill: (signal) => calls.push({ type: 'child', signal }),
  };
  terminateProcessGroup(child, 'SIGKILL', {
    platform: 'win32',
    spawnSync: (command, args, options) => {
      calls.push({ type: 'taskkill', command, args, options });
      return { status: 0 };
    },
  });
  assert.deepEqual(calls, [{
    type: 'taskkill',
    command: 'taskkill.exe',
    args: ['/PID', '4242', '/T', '/F'],
    options: { stdio: 'ignore', windowsHide: true },
  }]);

  calls.length = 0;
  terminateProcessGroup(child, 'SIGTERM', {
    platform: 'win32',
    spawnSync: (command, args, options) => {
      calls.push({ type: 'taskkill', command, args, options });
      return { status: 0 };
    },
  });
  assert.deepEqual(calls[0].args, ['/PID', '4242', '/T', '/F']);

  calls.length = 0;
  terminateProcessGroup(child, 'SIGTERM', {
    platform: 'win32',
    spawnSync: () => ({ status: 1 }),
  });
  assert.deepEqual(calls, [{ type: 'child', signal: 'SIGTERM' }]);

  calls.length = 0;
  terminateProcessGroup(child, 'SIGTERM', {
    platform: 'win32',
    spawnSync: () => { throw new Error('taskkill unavailable'); },
  });
  assert.deepEqual(calls, [{ type: 'child', signal: 'SIGTERM' }]);
});

test('each shipped Host selects ACP only from its own current conformance row', (t) => {
  const binRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-profile-bin-'));
  t.after(() => fs.rmSync(binRoot, { recursive: true, force: true }));
  for (const command of ['npx', 'opencode', 'kimi', 'grok', 'zcode-acp']) {
    const file = path.join(binRoot, command);
    fs.writeFileSync(file, 'probe-only\n');
    fs.chmodSync(file, 0o755);
  }
  const expected = {
    claude: { status: 'passed', driver: 'acp', fallback: null },
    codex: { status: 'passed', driver: 'acp', fallback: null },
    opencode: { status: 'passed', driver: 'acp', fallback: null },
    kimi: { status: 'passed', driver: 'acp', fallback: null },
    grok: { status: 'passed', driver: 'acp', fallback: null },
    zcode: { status: 'passed', driver: 'acp', fallback: null },
  };
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok', 'zcode']) {
    const profile = hostProfile(runtime);
    const selection = selectExecutionDriver({
      host: runtime,
      profile,
      cliCommand: profile.binary,
      env: { ...process.env, PATH: binRoot },
      runCandidateProbe: (command, args) => ({
        status: 0,
        stdout: runtime === 'zcode' && command === 'zcode-acp'
          ? `${ZCODE_ACP_SOURCE.buildMarker}\n`
          : `${ZCODE_ACP_SOURCE.runtimeVersion}\n`,
        stderr: '',
      }),
    });
    assert.equal(profile.acp?.conformance?.status, expected[runtime].status, runtime);
    assert.equal(selection.driver, expected[runtime].driver, runtime);
    assert.equal(selection.fallbackReason, expected[runtime].fallback, runtime);
    if (expected[runtime].status === 'passed') {
      assert.match(profile.acp.conformance.evidence, /^docs\/evals\/ultra-5-0-live-acp-conformance\.md#/u);
    }
    assert.equal(typeof selection.acpCapability.candidate_valid === 'boolean'
      || selection.acpCapability.candidate_valid === null, true, runtime);
    assert.equal(typeof selection.acpCapability.executable_available === 'boolean'
      || selection.acpCapability.executable_available === null, true, runtime);
  }
  const zcode = hostProfile('zcode');
  assert.equal(zcode.transportMaturity, 'experimental');
  assert.equal(zcode.installedRuntimeOnly, true);
  assert.match(zcode.acp.surface, /installed ZCode Desktop runtime/iu);
});

test('the retained enforcement qualification is bound to the exact redacted receipt it cites', () => {
  const receiptFile = path.join(
    ROOT, '.ultra', 'evidence', 'vnext-d1-host-enforcement-qualification', 'host-enforcement-receipt.json',
  );
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const profile = hostProfile('zcode');
  const record = profile.enforcement;
  assert.ok(record, 'the ZCode profile carries its retained enforcement qualification record');
  assert.equal(record.$schema, 'ultra-host-enforcement-qualification-v1');
  assert.equal(record.attempt_id, receipt.attempt_id);
  assert.equal(record.observed_at, receipt.observed_at);
  assert.equal(
    record.evidence,
    '.ultra/evidence/vnext-d1-host-enforcement-qualification/host-enforcement-receipt.json',
  );
  assert.equal(
    record.receipt_sha256,
    crypto.createHash('sha256').update(fs.readFileSync(receiptFile)).digest('hex'),
  );
  assert.equal(record.qualified_identity.bridge_build_marker, receipt.host.adapter_version);
  assert.equal(record.qualified_identity.runtime_version, receipt.host.runtime_version);
  assert.equal(record.qualified_identity.bridge_build_marker, ZCODE_ACP_SOURCE.buildMarker);
  assert.equal(record.qualified_identity.runtime_version, ZCODE_ACP_SOURCE.runtimeVersion);
  // Provider transport and adapter preinstallation stay separate facts; the
  // separately authorized provider transport is never Worker effect authority
  // and never a dimension.
  assert.equal(record.provider_transport_admission, 'separately_authorized_only');
  const observed = record.transports['acp-stdio'].dimensions;
  assert.equal(observed.provider_transport, undefined);
  for (const [name, fact] of Object.entries(receipt.dimensions)) {
    if (name === 'provider_transport') {
      assert.ok(
        fact.admission.startsWith('separately authorized'),
        'provider transport stays separately authorized only',
      );
      continue;
    }
    const encoded = observed[name];
    assert.ok(encoded, `dimension ${name} is represented`);
    assert.ok(fact.observation.startsWith(encoded.observation), `${name} observation`);
    assert.ok(fact.admission.startsWith(encoded.admission), `${name} admission`);
    assert.equal(typeof encoded.basis, 'string', `${name} basis is text`);
    assert.ok(encoded.basis.length > 0, `${name} basis is non-empty`);
  }
  assert.deepEqual(
    Object.keys(observed).sort(),
    Object.keys(receipt.dimensions).filter((name) => name !== 'provider_transport').sort(),
  );
  assert.equal(record.transports.cli, undefined, 'the CLI transport carries no enforcement observation');
  assert.equal(record.disposition.route, receipt.admission_disposition.route);
  assert.equal(record.disposition.reason, receipt.admission_disposition.reason);
  assert.equal(record.disposition.silent_fallback, false);
  assert.equal(record.disposition.maturity_change, false);
  // Adapter preinstallation is recorded without hiding a runtime package fetch
  // behind a supposedly offline admission claim.
  assert.match(observed.adapter_preinstallation.basis, /no package manager or runtime fetch/u);
  // The unqualified route keeps its experimental maturity; no promotion.
  assert.equal(profile.transportMaturity, 'experimental');
});

test('packet admission compares required enforcement dimensions with exact Host facts before launch', () => {
  const {
    enforcementAdmission,
    requiredPacketEnforcementDimensions,
  } = require('../skills/ultra-delegate/scripts/host-profile.cjs');
  const write = requiredPacketEnforcementDimensions({ readOnly: false });
  const readOnly = requiredPacketEnforcementDimensions({ readOnly: true });
  assert.deepEqual(write, [
    'writable_scope', 'outside_root_denial', 'shell_tool_denial',
    'agent_tool_network_denial', 'point_of_use_effect_boundary',
  ]);
  assert.deepEqual(readOnly, write.slice(1));

  const zcode = hostProfile('zcode');
  // ACP transport: one observed unsupported fact plus unobserved facts fail
  // closed; a read-only packet no longer requires writable_scope.
  const acp = enforcementAdmission(zcode, { required: write, driver: 'acp' });
  assert.equal(acp.route, 'unavailable');
  assert.equal(acp.code, 'host_enforcement_unavailable');
  assert.deepEqual(acp.dimensions.map((entry) => [entry.dimension, entry.status]), [
    ['writable_scope', 'unsupported'],
    ['outside_root_denial', 'unobserved'],
    ['shell_tool_denial', 'unobserved'],
    ['agent_tool_network_denial', 'unobserved'],
    ['point_of_use_effect_boundary', 'unobserved'],
  ]);
  const acpReadOnly = enforcementAdmission(zcode, { required: readOnly, driver: 'acp' });
  assert.equal(acpReadOnly.route, 'unavailable');
  assert.ok(acpReadOnly.dimensions.every((entry) => entry.dimension !== 'writable_scope'));
  // The CLI transport has no retained observation at all: every required
  // dimension is missing and the route is unavailable without silent fallback.
  const cli = enforcementAdmission(zcode, { required: readOnly, driver: 'cli' });
  assert.equal(cli.route, 'unavailable');
  assert.deepEqual(cli.dimensions.map((entry) => entry.status), ['missing', 'missing', 'missing', 'missing']);
  // The decision carries its evidence binding and no secret value.
  assert.equal(acp.evidence.attempt_id, zcode.enforcement.attempt_id);
  assert.equal(acp.transport, 'acp-stdio');
  assert.equal(acp.identity.match, true);
  const serialized = JSON.stringify(acp);
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9]{8,}|Bearer\s|AKIA[0-9A-Z]{8,}/u);
  assert.deepEqual(
    Object.keys(acp).sort(),
    ['code', 'dimensions', 'evidence', 'gate', 'identity', 'route', 'transport'],
  );
  for (const entry of acp.dimensions) {
    assert.deepEqual(Object.keys(entry).sort(), ['basis', 'dimension', 'status']);
  }
  // Capability facts decide, never provider brand or self-report: the same
  // facts and identity on another Host profile yield the same decision.
  const otherBrand = {
    ...hostProfile('claude'),
    enforcement: zcode.enforcement,
    acp: { ...hostProfile('claude').acp, candidateIdentity: zcode.acp.candidateIdentity },
  };
  assert.deepEqual(enforcementAdmission(otherBrand, { required: write, driver: 'acp' }), acp);
  // Hosts without a retained qualification make no capability claim and keep
  // their existing conformance-gated admission path.
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok']) {
    const ungated = enforcementAdmission(hostProfile(runtime), { required: write, driver: 'acp' });
    assert.equal(ungated.route, 'admitted', runtime);
    assert.equal(ungated.gate, null, runtime);
    assert.deepEqual(ungated.dimensions, [], runtime);
  }
});

test('missing, unknown and version-mismatched enforcement dimensions fail closed before launch', () => {
  const { enforcementAdmission } = require('../skills/ultra-delegate/scripts/host-profile.cjs');
  const required = [
    'writable_scope', 'outside_root_denial', 'shell_tool_denial',
    'agent_tool_network_denial', 'point_of_use_effect_boundary',
  ];
  const zcode = hostProfile('zcode');
  const qualifiedDimensions = {};
  for (const dimension of required) {
    qualifiedDimensions[dimension] = {
      observation: 'supported', admission: 'supported', basis: 'fixture: exact observed support',
    };
  }
  const admittedRecord = {
    ...zcode.enforcement,
    transports: { 'acp-stdio': { dimensions: qualifiedDimensions } },
  };
  // A positive packet is admitted only when every required dimension is
  // supported for the exact qualified identity and selected transport.
  const admitted = enforcementAdmission(
    { ...zcode, enforcement: admittedRecord },
    { required, driver: 'acp' },
  );
  assert.equal(admitted.route, 'admitted');
  assert.equal(admitted.gate, 'enforcement_qualification');
  assert.deepEqual(admitted.dimensions, []);
  // A record without one required dimension fails closed as missing.
  const missingDimensions = { ...qualifiedDimensions };
  delete missingDimensions.shell_tool_denial;
  const missing = enforcementAdmission(
    {
      ...zcode,
      enforcement: { ...admittedRecord, transports: { 'acp-stdio': { dimensions: missingDimensions } } },
    },
    { required, driver: 'acp' },
  );
  assert.equal(missing.route, 'unavailable');
  assert.deepEqual(missing.dimensions, [{
    dimension: 'shell_tool_denial',
    status: 'missing',
    basis: 'no retained qualification observation for this transport and dimension',
  }]);
  // An admission value outside the retained vocabulary is unknown, never
  // interpreted as support.
  const unknownDimensions = {
    ...qualifiedDimensions,
    agent_tool_network_denial: { observation: 'supported', admission: 'partially', basis: 'fixture' },
  };
  const unknown = enforcementAdmission(
    {
      ...zcode,
      enforcement: { ...admittedRecord, transports: { 'acp-stdio': { dimensions: unknownDimensions } } },
    },
    { required, driver: 'acp' },
  );
  assert.equal(unknown.route, 'unavailable');
  assert.deepEqual(
    unknown.dimensions.map((entry) => [entry.dimension, entry.status]),
    [['agent_tool_network_denial', 'unknown']],
  );
  // A profile whose declared candidate identity no longer matches the
  // qualified identity is version-mismatched for every required dimension.
  const drifted = enforcementAdmission({
    ...zcode,
    acp: {
      ...zcode.acp,
      candidateIdentity: { bridge_build_marker: 'zcode-acp 0.1.0+ultra.zcode.0.17.0', runtime_version: '0.17.0' },
    },
    enforcement: admittedRecord,
  }, { required, driver: 'acp' });
  assert.equal(drifted.route, 'unavailable');
  assert.ok(drifted.dimensions.every((entry) => entry.status === 'version_mismatch'));
  assert.equal(drifted.identity.match, false);
  // A bound record with no declared candidate identity cannot prove which
  // runtime is installed and fails closed the same way.
  const undeclared = enforcementAdmission({
    ...zcode,
    acp: { ...zcode.acp, candidateIdentity: undefined },
    enforcement: admittedRecord,
  }, { required, driver: 'acp' });
  assert.equal(undeclared.route, 'unavailable');
  assert.ok(undeclared.dimensions.every((entry) => entry.status === 'version_mismatch'));
});

test('driver descendants receive only the spec-scoped environment', async (t) => {
  const fx = fixture('env-capture');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const capture = path.join(fx.root, 'driver-child-env-keys.txt');
  fx.spec.env.FAKE_ACP_ENV_CAPTURE = capture;
  const canaryKey = 'UBP_D1_DRIVER_UNRELATED_SECRET';
  const canaryValue = `ubp-d1-driver-${process.pid}-${Date.now()}`;
  process.env[canaryKey] = canaryValue;
  t.after(() => { delete process.env[canaryKey]; });

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  const keys = fs.readFileSync(capture, 'utf8').split('\n').filter(Boolean);
  assert.ok(keys.includes('FAKE_ACP_SCENARIO'), 'spec env must reach the descendant');
  assert.ok(keys.includes('PATH'), 'the base PATH must reach the descendant');
  assert.ok(!keys.includes(canaryKey), 'an unrelated launcher secret must not reach the descendant');
  assert.ok(!fs.readFileSync(fx.spec.events, 'utf8').includes(canaryValue));
});

test('CliDriver preserves result-compatible output while bounding capture', async (t) => {
  const fx = fixture('cli');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  fx.spec.args = ['-e', `process.stdout.write('x'.repeat(2048) + ${JSON.stringify(JSON.stringify(resultPayload()))})`];
  fx.spec.capture_limit_bytes = 1024;
  const outcome = await new CliDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  const stdout = fs.readFileSync(fx.spec.stdout, 'utf8');
  assert.ok(Buffer.byteLength(stdout) <= 1100);
  assert.match(stdout, /output truncated/u);
  assert.match(stdout, /ultra-delegation-result-v1/u);
});

test('a host is never launched when its launching observation cannot be persisted', async (t) => {
  const fx = fixture('observation-launching-fault');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { delete process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION; });
  process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION = 'launching';
  const marker = path.join(fx.root, 'host-launched.marker');
  fx.spec.args = ['-e', [
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1');`,
    `process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload()))});`,
  ].join(' ')];

  const outcome = await new CliDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'writer_observation_unavailable', JSON.stringify(outcome));
  assert.equal(fs.existsSync(marker), false, 'an unobservable host must never be launched');
  // The explicit not_started proof stays exactly where the launcher put it.
  assert.equal(JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8')).phase, 'not_started');
});

test('a started-observation fault terminates the CLI host boundary and publishes no success', async (t) => {
  const fx = fixture('observation-started-fault');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { delete process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION; });
  process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION = 'started';
  const marker = path.join(fx.root, 'useful-work.marker');
  fx.spec.args = ['-e', [
    'const work = () => {',
    `  require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1');`,
    `  process.stdout.write(${JSON.stringify(JSON.stringify(resultPayload()))});`,
    '};',
    'setTimeout(work, 400);',
  ].join(' ')];

  const outcome = await new CliDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'writer_start_unobserved', JSON.stringify(outcome));
  assert.equal(outcome.code, null, 'a failed observation must not publish a successful host exit');
  assert.equal(fs.existsSync(marker), false, 'the host must not complete useful work behind an unrecorded identity');
  if (fs.existsSync(fx.spec.stdout)) {
    assert.doesNotMatch(fs.readFileSync(fx.spec.stdout, 'utf8'), /ultra-delegation-result-v1/u);
  }
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'launching');
  assert.equal(
    deriveWriterState(observation, { identity: { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id } }),
    'unknown',
  );
});

test('a started-observation fault terminates the ACP host before any protocol handshake', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { delete process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION; });
  process.env.UBP_DELEGATE_TEST_FAULT_OBSERVATION = 'started';

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'writer_start_unobserved', JSON.stringify(outcome));
  assert.equal(outcome.code, null);
  assert.equal(outcome.protocolVersion, null, 'no initialize handshake may complete');
  assert.equal(outcome.stopReason, null);
  assert.equal(fs.existsSync(fx.spec.host_output), false);
  assert.ok(
    !readJsonLines(fx.spec.events).some((event) => event.type === 'protocol' && event.phase === 'initialized'),
    'no derived protocol event may exist for an unrecorded host',
  );
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'launching');
  assert.equal(
    deriveWriterState(observation, { identity: { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id } }),
    'unknown',
  );
});

test('a CLI spawn failure with no pid restores a releasable not_started boundary', async (t) => {
  const fx = fixture('cli', { command: path.join(os.tmpdir(), `ubp-no-such-host-${process.pid}-${Date.now()}`) });
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new CliDriver(fx.spec).run();
  assert.ok(outcome.spawnError, JSON.stringify(outcome));
  assert.equal(outcome.spawnError.code, 'ENOENT');
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'not_started', 'an OS-confirmed spawn failure with no child pid restores not_started');
  assert.equal(
    deriveWriterState(observation, { identity: { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id } }),
    'stopped',
    'the restored proof must release the boundary instead of freezing an impossible writer',
  );
});

test('an ACP spawn failure with no pid restores a releasable not_started boundary', async (t) => {
  const fx = fixture('happy', { command: path.join(os.tmpdir(), `ubp-no-such-acp-${process.pid}-${Date.now()}`) });
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.ok(outcome.spawnError, JSON.stringify(outcome));
  assert.equal(outcome.spawnError.code, 'ENOENT');
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'not_started');
  assert.equal(
    deriveWriterState(observation, { identity: { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id } }),
    'stopped',
  );
});

test('the ACP fallback gate consumes only proven-stopped launch boundaries', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const { launchBoundWriterState } = require('../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
  assert.equal(typeof launchBoundWriterState, 'function');
  const identity = { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id };

  // Missing evidence is unknown, never stopped.
  fs.unlinkSync(fx.spec.writer_observation);
  assert.equal(launchBoundWriterState(fx.spec), 'unknown');

  // A live recorded writer keeps the gate closed.
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  sleeper.unref();
  t.after(() => { try { process.kill(sleeper.pid, 'SIGKILL'); } catch {} });
  writeObservationPhase(fx.spec.writer_observation, {
    identity,
    phase: 'started',
    pid: sleeper.pid,
    pgid: sleeper.pid,
    platform: process.platform,
    command: fx.spec.command,
    argv: fx.spec.args,
  });
  assert.equal(launchBoundWriterState(fx.spec), 'alive');

  // Only a proven-stopped boundary may admit the second launch.
  process.kill(sleeper.pid, 'SIGKILL');
  await waitForExit(sleeper.pid);
  assert.equal(launchBoundWriterState(fx.spec), 'stopped');
});
