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
const FAKE_ACPX_ENTRY = path.join(__dirname, 'fixtures', 'fake-acpx-entry.cjs');
// The ACP transport consumes the installed public entry; tests select the
// test-side stand-in through the same runtime-discovery key the product uses.
process.env.ULTRA_DELEGATE_ACPX_ENTRY = FAKE_ACPX_ENTRY;
const {
  deriveWriterState,
  launchExecutionIdentityDrift,
  claudeNativeSettingsObservation,
  resolveAcpEntry,
  resolveAcpxPackage,
  resolveClaudeSdkPackage,
  selectExecutionDriver,
  terminateProcessGroup,
  writeObservationPhase,
} = require('../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const { AcpDriver } = require('../skills/ultra-delegate/scripts/acp-driver.cjs');
const { CliDriver } = require('../skills/ultra-delegate/scripts/cli-driver.cjs');
const {
  CLAUDE_ACP_COMMAND_ENV,
  CLAUDE_ACP_PACKAGE,
  CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS,
  PROFILES,
  ZCODE_ACP_SOURCE,
  claudeAcpSelection,
  claudeInstalledAcp,
  hostProfile,
  renderClaudeNativePermissionSettings,
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

test('ACP drives one absolute-cwd turn through the public entry, streams derived events, and emits the existing result input', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.termination, null);
  assert.equal(outcome.protocolVersion, 1);
  assert.equal(outcome.stopReason, 'end_turn');
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.spec.host_output, 'utf8')), resultPayload());

  // The request chain the entry owns: one absolute-cwd session carrying the
  // digest-bound prompt, and a client that offers no fs or terminal surface.
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
  assert.ok(events.some((event) => event.type === 'update' && event.update_type === 'plan'));
  assert.ok(events.some((event) => event.type === 'update' && event.update_type === 'tool_call'));
  assert.ok(events.some((event) => event.type === 'terminal' && event.stop_reason === 'end_turn'));
  assert.ok(events.every((event) => !('content' in event) && !('rawInput' in event)));
  // Raw protocol traffic is never persisted: the stdout transcript artifact
  // stays empty, so hidden reasoning and raw tool payloads cannot land there.
  assert.equal(fs.readFileSync(fx.spec.stdout, 'utf8'), '');
});

test('ACP records a nonzero adapter exit during client-owned shutdown without overturning a completed turn', async (t) => {
  const fx = fixture('happy');
  fx.spec.env.FAKE_ACPX_ENTRY_EXIT_CODE = '7';
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
    outcome: { outcome: 'allow_once', optionId: 'allow-once' },
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
    outcome: { outcome: 'reject_once', optionId: 'reject-once' },
  });
  assert.equal(fs.existsSync(fx.spec.host_output), false);
  assert.match(fs.readFileSync(fx.spec.events, 'utf8'), /outside_envelope/u);
});

test('denied operations stay recorded while the bounded turn continues to later denial probes', async (t) => {
  // The multiple-denial shape the enforcement qualification needs: an
  // outside-root edit, a shell-class execute, and a network-class fetch are
  // each denied through their exact offered option, the turn still reaches
  // every later probe, and the final terminal stays permission_denied.
  const fx = fixture('permission-multiple');
  const configPath = path.join(fx.root, 'agent-config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    scenario: 'permission-multiple',
    result: resultPayload(),
    permissionSequence: [
      { kind: 'edit', location: path.join(fx.root, 'outside-root.js') },
      { kind: 'execute', location: null },
      { kind: 'fetch', location: null },
    ],
  }));
  fx.spec.args = [FAKE_AGENT, configPath];
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'permission_denied', JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
  const events = readJsonLines(fx.spec.events);
  const permissions = events.filter((event) => event.type === 'permission');
  assert.deepEqual(permissions.map((event) => [
    event.tool_kind, event.decision, event.scope,
  ]), [
    ['edit', 'reject_once', 'outside_envelope'],
    ['execute', 'reject_once', 'operation_denied'],
    ['fetch', 'reject_once', 'operation_denied'],
  ]);
  // The turn stayed reachable after every denial and kept its terminal event.
  assert.ok(events.some((event) => event.type === 'terminal' && event.stop_reason === 'end_turn'));
  assert.equal(fs.existsSync(fx.spec.host_output), false);
});

// The deadline budget must contain everything that has to happen before the
// descendant can be observed alive: the fixture's own process startup plus one
// polled observation. A 180 ms budget left roughly 2x headroom over a measured
// 31-72 ms startup under load, which is why the deadline could fire before any
// descendant existed. The termination assertion held in that case, but the
// process-group assertions had nothing to observe.
for (const [scenario, expectedTermination, timeoutMs] of [
  ['cancel', 'cancelled', 3000],
  ['hang', 'timeout', 1000],
]) {
  test(`ACP ${expectedTermination} reaches terminal transport state and kills the process group`, async (t) => {
    const fx = fixture(scenario, { timeout_ms: timeoutMs });
    t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
    const running = new AcpDriver(fx.spec).run();
    // Non-vacuity gate: a run that terminated without ever creating the
    // descendant fails here rather than silently asserting nothing.
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

// Agent-side protocol violations are owned by the entry's pinned runtime now:
// they surface through the driver as one typed failed-turn terminal, while
// the driver-side physical limits and the dedicated authentication type
// (consumed by the CLI fallback gate) stay product assertions.
for (const [scenario, failureType] of [
  ['malformed', 'acp_turn_failed'],
  ['invalid-response-shape', 'acp_turn_failed'],
  ['wrong-version', 'acp_turn_failed'],
  ['auth-required', 'acp_auth_required'],
  ['malformed-update', 'acp_turn_failed'],
  ['event-flood', 'acp_event_limit'],
  ['early-exit', 'acp_turn_failed'],
]) {
  test(`ACP ${scenario} produces typed protocol failure ${failureType}`, async (t) => {
    const fx = fixture(scenario);
    t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
    const outcome = await new AcpDriver(fx.spec).run();
    assert.equal(outcome.failureType, failureType, JSON.stringify(outcome));
  });
}

// The regression for the real pre-startTurn version refusal, not its
// stand-in: the fake entry's own comparison once masked that the production
// entry submitted prompts on an unsupported negotiation and the driver
// synthesized protocolVersion 1 from any typed result. Opt-in, because it
// needs the actual public entry inside a runtime root that resolves the
// pinned acpx (UBP_TEST_ACPX_ENTRY, exactly like tests/acpx-entry.test.cjs).
test('the real public entry refuses an unsupported negotiation before any prompt is submitted', {}, async (t) => {
  const realEntry = process.env.UBP_TEST_ACPX_ENTRY;
  if (!realEntry) return t.skip('UBP_TEST_ACPX_ENTRY not set');
  const fx = fixture('wrong-version', { timeout_ms: 20000 });
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { process.env.ULTRA_DELEGATE_ACPX_ENTRY = FAKE_ACPX_ENTRY; });
  process.env.ULTRA_DELEGATE_ACPX_ENTRY = realEntry;

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_turn_failed', JSON.stringify(outcome));
  // The structured pre-prompt proof: startTurn was never invoked.
  assert.equal(outcome.failurePhase, 'ensure_session', JSON.stringify(outcome));
  // The version is the entry's observed negotiation (2), never a
  // synthesized 1; this is exactly the value a conformance claim would
  // consume, so an unsupported negotiation can never pass as v1.
  assert.equal(outcome.protocolVersion, 2, JSON.stringify(outcome));
  assert.equal(outcome.termination, null);
  // Honest refusal boundary: the pinned manager may create the agent session
  // before its negotiated version reaches the session record, but the prompt
  // must never be submitted and no host result may be published.
  const methods = readJsonLines(fx.spec.env.FAKE_ACP_TRACE)
    .filter((entry) => entry.direction === 'client_to_agent')
    .map((entry) => entry.message.method);
  assert.equal(methods[0], 'initialize');
  assert.ok(methods.includes('session/new'), 'the pinned manager creates the session before the version observation');
  assert.equal(methods.includes('session/prompt'), false, 'no prompt may be submitted on an unsupported negotiation');
  assert.equal(fs.existsSync(fx.spec.host_output), false, 'no host result may be published');
  assert.equal(
    readJsonLines(fx.spec.events).some((event) => event.type === 'terminal'),
    false,
    'no terminal success event may be journaled',
  );
});

test('ACP stopReason remains transport observation and does not synthesize an Ultra result', async (t) => {
  const fx = fixture('no-result');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
  assert.equal(fs.existsSync(fx.spec.host_output), false);
});

test('runtime-shaped session metadata is journaled as stable update events', async (t) => {
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

  // The generic ACP engine is the installed public entry: without it the ACP
  // route is unavailable with an exact typed reason and no worker is launched.
  const noEntry = selectExecutionDriver({
    host: 'fake',
    profile: passed,
    cliCommand: 'fake-cli',
    env: { ...process.env, ULTRA_DELEGATE_ACPX_ENTRY: '/no/such/acpx-entry.cjs' },
  });
  assert.equal(noEntry.driver, 'cli');
  assert.equal(noEntry.fallbackReason, 'acp_entry_unavailable');
  assert.equal(noEntry.acpCapability.acp_entry_available, false);
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
    buildMarker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5.r1',
    runtimeVersion: '0.16.5',
    patch: {
      path: 'skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch',
      sha256: '8c127dba648720121da9326cae721141785f03ef72bdfae2201f50e59bb9cb36',
      compatibility: 'ZCode CLI 0.16.5 runtime-preferences handshake; native file_path ToolCallLocations in updates and permission requests; host denials recorded with the turn still terminal; native resultType cancelled and turn.failed keep truthful ACP terminals',
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
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-profile-home-'));
  t.after(() => {
    fs.rmSync(binRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  });
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
    // An isolated HOME keeps the claude route on the test's own npx stand-in:
    // the selection reads the managed registry relative to HOME, so the real
    // machine's preinstalled binding must not leak into this generic check.
    const selectionEnv = {
      PATH: binRoot,
      HOME: homeRoot,
      ULTRA_DELEGATE_ACPX_ENTRY: FAKE_ACPX_ENTRY,
    };
    const profile = hostProfile(runtime, { env: selectionEnv });
    const selection = selectExecutionDriver({
      host: runtime,
      profile,
      cliCommand: profile.binary,
      env: selectionEnv,
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

test('the claude ACP route consumes the managed registry preinstalled adapter or fails closed', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-registry-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const registryDir = path.join(home, '.config', 'agent-delegation');
  const adapter = path.join(home, 'adapters', 'claude-agent-acp', 'dist', 'index.js');
  const native = path.join(home, 'bin', 'claude');
  fs.mkdirSync(path.dirname(adapter), { recursive: true });
  fs.mkdirSync(path.dirname(native), { recursive: true });
  fs.writeFileSync(adapter, '#!/usr/bin/env node\n// fixture adapter\n');
  fs.chmodSync(adapter, 0o755);
  fs.writeFileSync(native, '#!/bin/sh\necho "2.1.261 (Claude Code)"\n');
  fs.chmodSync(native, 0o755);
  const writeRegistry = (payload) => {
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(path.join(registryDir, 'config.json'), `${JSON.stringify(payload, null, 2)}\n`);
  };
  const healthyTarget = {
    argv: [adapter],
    cli_env: { CLAUDE_CODE_EXECUTABLE: native },
    observed_version: '2.1.261 (Claude Code)',
  };
  const healthyRegistry = () => ({
    runtime_packages: { '@agentclientprotocol/claude-agent-acp': '0.75.1' },
    targets: { claude: healthyTarget },
  });

  // No HOME, an absent registry, or a registry without a claude target keeps
  // the legacy npx route as the source — nothing is assumed installed. The
  // selection object also carries the exact registry binding it consumed (or
  // null) so every later consumer can reuse one resolution.
  assert.deepEqual(
    claudeAcpSelection({}),
    { command: 'npx', args: ['--yes', CLAUDE_ACP_PACKAGE], installed: null },
  );
  assert.equal(claudeInstalledAcp({ HOME: home }), null);
  writeRegistry({ runtime_packages: {}, targets: {} });
  assert.equal(claudeInstalledAcp({ HOME: home }), null);
  assert.deepEqual(
    claudeAcpSelection({ HOME: home }),
    { command: 'npx', args: ['--yes', CLAUDE_ACP_PACKAGE], installed: null },
  );

  // A healthy binding selects the preinstalled adapter bytes and the exact
  // native executable; the explicit override wins exactly as on ZCode (the
  // override pins only the adapter — the native binding still comes from the
  // one registry read when one is healthy).
  writeRegistry(healthyRegistry());
  const installed = claudeInstalledAcp({ HOME: home });
  assert.deepEqual(installed, {
    adapter,
    adapterArgs: [],
    adapterPackage: '@agentclientprotocol/claude-agent-acp@0.75.1',
    nativeExecutable: native,
    runtimeVersion: '2.1.261 (Claude Code)',
  });
  assert.deepEqual(claudeAcpSelection({ HOME: home }), { command: adapter, args: [], installed });
  assert.deepEqual(
    claudeAcpSelection({ HOME: home, [CLAUDE_ACP_COMMAND_ENV]: '/tmp/claude-wrapper.sh' }),
    { command: '/tmp/claude-wrapper.sh', args: [], installed },
  );

  // A published-but-broken binding fails closed instead of substituting
  // another adapter silently.
  writeRegistry({ ...healthyRegistry(), targets: { claude: { ...healthyTarget, argv: [] } } });
  assert.throws(() => claudeAcpSelection({ HOME: home }), /malformed/u);
  writeRegistry({ ...healthyRegistry(), targets: { claude: { ...healthyTarget, argv: [path.join(home, 'missing.js')] } } });
  assert.throws(() => claudeAcpSelection({ HOME: home }), /not an absolute existing file/u);
  writeRegistry({ ...healthyRegistry(), targets: { claude: { ...healthyTarget, cli_env: {} } } });
  assert.throws(() => claudeAcpSelection({ HOME: home }), /CLAUDE_CODE_EXECUTABLE/u);
  writeRegistry({ ...healthyRegistry(), runtime_packages: {} });
  assert.throws(() => claudeAcpSelection({ HOME: home }), /adapter version/u);
});

test('the claude installed route exposes a probed identity and keeps the adapter override inside the delegation env', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-registry-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const adapter = path.join(home, 'adapter.js');
  const native = path.join(home, 'claude');
  fs.writeFileSync(adapter, '#!/usr/bin/env node\n');
  fs.chmodSync(adapter, 0o755);
  fs.writeFileSync(native, '#!/bin/sh\n');
  fs.chmodSync(native, 0o755);
  fs.mkdirSync(path.join(home, '.config', 'agent-delegation'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'agent-delegation', 'config.json'), `${JSON.stringify({
    runtime_packages: { '@agentclientprotocol/claude-agent-acp': '0.75.1' },
    targets: {
      claude: {
        argv: [adapter],
        cli_env: { CLAUDE_CODE_EXECUTABLE: native },
        observed_version: '2.1.261 (Claude Code)',
      },
    },
  })}\n`);
  const env = { HOME: home, PATH: process.env.PATH, ULTRA_DELEGATE_ACPX_ENTRY: FAKE_ACPX_ENTRY };

  const installed = hostProfile('claude', { env });
  assert.match(installed.acp.surface, /preinstalled @agentclientprotocol\/claude-agent-acp@0\.75\.1/u);
  assert.deepEqual(installed.acp.candidateIdentity, {
    bridge_build_marker: '@agentclientprotocol/claude-agent-acp@0.75.1',
    runtime_version: '2.1.261 (Claude Code)',
  });
  assert.deepEqual(installed.acp.identityProbes({ env }), [{
    label: 'claude_native_cli',
    command: native,
    args: ['--version'],
    expectedStdout: '2.1.261 (Claude Code)',
  }]);
  assert.equal(installed.acp.runtimeFilePath({ env }), native);
  // The launcher injects the registry native binding through the adapter's
  // supported env key, and nothing else crosses from the registry read.
  const savedHome = process.env.HOME;
  try {
    process.env.HOME = path.join(home, 'no-registry');
    assert.deepEqual(PROFILES.claude.delegateEnv(), {});
    process.env.HOME = home;
    assert.deepEqual(PROFILES.claude.delegateEnv(), { CLAUDE_CODE_EXECUTABLE: native });
  } finally {
    process.env.HOME = savedHome;
  }
  // A stale native CLI observation is rejected by the live identity probe
  // and falls back typed; the declared registry version is never assumed.
  const stale = selectExecutionDriver({
    host: 'claude',
    profile: installed,
    cliCommand: 'claude',
    env,
    runCandidateProbe: () => ({ status: 0, stdout: '2.2.0 (Claude Code)\n', stderr: '' }),
  });
  assert.equal(stale.driver, 'cli');
  assert.equal(stale.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(stale.acpCapability.candidate_identity_reason, 'claude_native_cli');
  const current = selectExecutionDriver({
    host: 'claude',
    profile: installed,
    cliCommand: 'claude',
    env,
    runCandidateProbe: (command, args) => {
      assert.equal(command, native);
      assert.deepEqual(args, ['--version']);
      return { status: 0, stdout: '2.1.261 (Claude Code)\n', stderr: '' };
    },
  });
  assert.equal(current.driver, 'acp');
  assert.equal(current.command, adapter);
  assert.deepEqual(current.args, []);

  // Without the registry the profile keeps the legacy surface and exposes no
  // candidate identity an enforcement record could ever string-match.
  const legacy = hostProfile('claude', { env: { ...env, HOME: path.join(home, 'empty') } });
  assert.match(legacy.acp.surface, /official @agentclientprotocol\/claude-agent-acp@0\.70\.0/u);
  assert.equal(legacy.acp.candidateIdentity, undefined);
  assert.equal(legacy.acp.identityProbes, undefined);
});

test('the production claude native permission settings carry the native-valid schema the adapter reads', () => {
  const bytes = renderClaudeNativePermissionSettings();
  const parsed = JSON.parse(bytes);
  // The installed adapter reads settings.permissions.defaultMode (surfaced as
  // the native query permissionMode); a top-level defaultMode key is never
  // consumed by the native permission path and cannot pin the mode.
  assert.equal(parsed.permissions.defaultMode, 'default');
  assert.equal(parsed.defaultMode, undefined);
  // The minimal complete ask rule is the official all-tools glob (every tool
  // except EndConversation): current canonical names (Agent, not Task), MCP
  // tools, and future tools all reach the permission callback, and no tool is
  // removed by a deny rule.
  assert.deepEqual(parsed.permissions.ask, ['*']);
  assert.equal(parsed.permissions.deny, undefined);
  assert.equal(parsed.disableAllHooks, true);
  assert.equal(bytes, renderClaudeNativePermissionSettings());
});

test('one claude selection binds adapter, argv, native file, and launcher env against a registry update', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-one-binding-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const registryDir = path.join(home, '.config', 'agent-delegation');
  const adapterA = path.join(home, 'adapter-a.cjs');
  const nativeA = path.join(home, 'claude-a');
  const adapterB = path.join(home, 'adapter-b.cjs');
  const nativeB = path.join(home, 'claude-b');
  for (const [file, text] of [[adapterA, '// adapter a\n'], [adapterB, '// adapter b\n']]) {
    fs.writeFileSync(file, text);
    fs.chmodSync(file, 0o755);
  }
  for (const native of [nativeA, nativeB]) {
    fs.writeFileSync(native, '#!/bin/sh\necho "2.1.261 (Claude Code)"\n');
    fs.chmodSync(native, 0o755);
  }
  const writeRegistry = (targets) => {
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(path.join(registryDir, 'config.json'), `${JSON.stringify({
      runtime_packages: { '@agentclientprotocol/claude-agent-acp': '0.75.1' },
      targets,
    })}\n`);
  };
  const claudeTarget = (adapter, native) => ({
    argv: [adapter],
    cli_env: { CLAUDE_CODE_EXECUTABLE: native },
    observed_version: '2.1.261 (Claude Code)',
  });
  writeRegistry({ claude: claudeTarget(adapterA, nativeA) });
  const env = { HOME: home, PATH: process.env.PATH, ULTRA_DELEGATE_ACPX_ENTRY: FAKE_ACPX_ENTRY };
  const profile = hostProfile('claude', { env });
  const probeOk = () => ({ status: 0, stdout: '2.1.261 (Claude Code)\n', stderr: '' });
  const selection = selectExecutionDriver({
    host: 'claude',
    profile,
    cliCommand: 'claude',
    env,
    runCandidateProbe: probeOk,
  });
  assert.equal(selection.driver, 'acp', JSON.stringify(selection.acpCapability));
  assert.ok(selection.acpSelection, 'the selection carries its one registry resolution');
  assert.equal(selection.acpSelection.installed.adapter, adapterA);
  assert.equal(selection.acpSelection.installed.nativeExecutable, nativeA);

  // An ordinary registry update after the selection must not mix two
  // bindings: every consumer of the one selection keeps the originally bound
  // adapter/native files — the launcher env carries the same native binding
  // the selection hashed, never the updated registry's B.
  writeRegistry({ claude: claudeTarget(adapterB, nativeB) });
  assert.equal(profile.acp.command({ env, selection: selection.acpSelection }), adapterA);
  assert.deepEqual(profile.acp.argv({ env, selection: selection.acpSelection }), []);
  assert.equal(profile.acp.runtimeFilePath({ env, selection: selection.acpSelection }), nativeA);
  assert.equal(profile.acp.identityProbes({ env, selection: selection.acpSelection })[0].command, nativeA);
  assert.deepEqual(
    PROFILES.claude.delegateEnv({}, { selection: selection.acpSelection }),
    { CLAUDE_CODE_EXECUTABLE: nativeA },
  );

  // A FRESH selection after the update resolves the new registry coherently —
  // adapter, native file, probes, and launcher env all come from the one new
  // read, never a mix of A and B.
  const reselected = selectExecutionDriver({
    host: 'claude',
    profile,
    cliCommand: 'claude',
    env,
    runCandidateProbe: (command) => {
      assert.equal(command, nativeB);
      return probeOk();
    },
  });
  assert.equal(reselected.driver, 'acp', JSON.stringify(reselected.acpCapability));
  assert.equal(reselected.command, adapterB);
  assert.equal(reselected.acpSelection.installed.nativeExecutable, nativeB);
  assert.deepEqual(
    PROFILES.claude.delegateEnv({}, { selection: reselected.acpSelection }),
    { CLAUDE_CODE_EXECUTABLE: nativeB },
  );

  // A selection whose registry binding disappeared entirely refuses typed
  // instead of launching an unprobed substitute candidate.
  writeRegistry({});
  const refused = selectExecutionDriver({
    host: 'claude',
    profile,
    cliCommand: 'claude',
    env,
    runCandidateProbe: probeOk,
  });
  assert.equal(refused.driver, 'cli');
  assert.equal(refused.fallbackReason, 'acp_candidate_identity_unavailable');
});

test('a qualified claude record additionally binds the native settings and claude SDK package it relies on', (t) => {
  const tree = identityTree(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-consumer-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  // The claude SDK package the adapter resolves at run time, placed exactly
  // where Node resolution from the adapter's directory finds it.
  const sdkPackageFile = path.join(
    tree.root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json',
  );
  fs.mkdirSync(path.dirname(sdkPackageFile), { recursive: true });
  const writeSdkPackage = (payload) => fs.writeFileSync(
    sdkPackageFile,
    `${JSON.stringify(payload)}\n`,
  );
  writeSdkPackage({
    name: '@anthropic-ai/claude-agent-sdk', version: '0.3.257', main: 'index.js',
  });
  fs.writeFileSync(path.join(path.dirname(sdkPackageFile), 'index.js'), '// fixture sdk\n');
  const sdkPackage = {
    name: '@anthropic-ai/claude-agent-sdk',
    version: '0.3.257',
    package_json_sha256: fileDigest(sdkPackageFile),
  };
  assert.deepEqual(resolveClaudeSdkPackage(tree.adapter), sdkPackage);

  // The execution site's actual native permission configuration: the two
  // project-tier files the production contract names, rendered by it.
  const worktree = path.join(tree.root, 'worktree');
  const writeNativeSettings = () => {
    fs.mkdirSync(path.join(worktree, '.claude'), { recursive: true });
    const bytes = renderClaudeNativePermissionSettings();
    for (const relative of CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS) {
      fs.writeFileSync(path.join(worktree, relative), bytes);
    }
  };
  writeNativeSettings();
  const nativeSettings = claudeNativeSettingsObservation(
    worktree, CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS,
  );
  assert.ok(/^[0-9a-f]{64}$/u.test(String(nativeSettings.sha256)));
  // A site missing any declared settings file observes nothing — never an
  // assumed configuration.
  const bareWorktree = path.join(tree.root, 'bare-worktree');
  fs.mkdirSync(bareWorktree, { recursive: true });
  assert.equal(
    claudeNativeSettingsObservation(bareWorktree, CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS).sha256,
    null,
  );

  fs.mkdirSync(path.join(home, '.config', 'agent-delegation'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'agent-delegation', 'config.json'), `${JSON.stringify({
    runtime_packages: { '@agentclientprotocol/claude-agent-acp': '0.75.1' },
    targets: {
      claude: {
        argv: [tree.adapter],
        cli_env: { CLAUDE_CODE_EXECUTABLE: tree.runtime },
        observed_version: '2.1.261 (Claude Code)',
      },
    },
  })}\n`);
  const env = { HOME: home, PATH: process.env.PATH, ULTRA_DELEGATE_ACPX_ENTRY: tree.entry };
  const claude = hostProfile('claude', { env });
  assert.deepEqual(claude.acp.executionIdentityBindings, ['native_settings', 'claude_sdk_package']);
  const probeOk = () => ({ status: 0, stdout: '2.1.261 (Claude Code)\n', stderr: '' });
  const qualified = (extra) => ({
    ...claude,
    enforcement: identityProfile(tree, {
      ...claude.acp.candidateIdentity,
      ...identityFingerprints(tree),
      ...extra,
    }).enforcement,
  });
  const selectQualified = (profile, cwd = worktree) => selectExecutionDriver({
    host: 'claude',
    profile,
    cliCommand: 'claude',
    env,
    cwd,
    runCandidateProbe: probeOk,
  });

  // The full binding admits the route and the observed identity carries the
  // native-settings and SDK facts the record binds.
  const fullBinding = { native_settings_sha256: nativeSettings.sha256, claude_sdk_package: sdkPackage };
  const bound = selectQualified(qualified(fullBinding));
  assert.equal(bound.driver, 'acp', JSON.stringify(bound.acpCapability));
  assert.equal(bound.executionIdentity.native_settings_sha256, nativeSettings.sha256);
  assert.deepEqual(bound.executionIdentity.native_settings_files, [...CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS]);
  assert.deepEqual(bound.executionIdentity.claude_sdk_package, sdkPackage);

  // The four generic fingerprints alone can never admit a qualified claude
  // route: the record that does not bind the native policy and SDK facts it
  // relies on is refused before any hash comparison of them.
  const genericOnly = selectQualified(qualified({}));
  assert.equal(genericOnly.driver, 'cli');
  assert.equal(genericOnly.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(genericOnly.acpCapability.candidate_identity_reason, 'native_settings');

  // A worktree whose native policy changed does not inherit the qualified
  // result, and neither does one without any native policy.
  fs.appendFileSync(path.join(worktree, '.claude', 'settings.local.json'), '// drifted policy\n');
  const changedPolicy = selectQualified(qualified(fullBinding));
  assert.equal(changedPolicy.driver, 'cli');
  assert.equal(changedPolicy.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(changedPolicy.acpCapability.candidate_identity_reason, 'native_settings');
  const noPolicy = selectQualified(qualified(fullBinding), bareWorktree);
  assert.equal(noPolicy.driver, 'cli');
  assert.equal(noPolicy.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(noPolicy.acpCapability.candidate_identity_reason, 'native_settings');

  // A changed claude SDK package inside the same adapter and native versions
  // does not inherit the qualified result either.
  writeNativeSettings();
  writeSdkPackage({
    name: '@anthropic-ai/claude-agent-sdk', version: '0.3.257', main: 'index.js', changed: true,
  });
  const changedSdk = selectQualified(qualified(fullBinding));
  assert.equal(changedSdk.driver, 'cli');
  assert.equal(changedSdk.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(changedSdk.acpCapability.candidate_identity_reason, 'claude_sdk_package');

  // The detached-launch recheck re-derives both facts at the bound cwd and
  // adapter path; a site drift after selection fails closed before any Host.
  writeSdkPackage({
    name: '@anthropic-ai/claude-agent-sdk', version: '0.3.257', main: 'index.js',
  });
  const relaunch = selectQualified(qualified(fullBinding));
  assert.equal(relaunch.driver, 'acp');
  const relaunchDrift = (cwd) => launchExecutionIdentityDrift(relaunch.executionIdentity, {
    adapterPath: relaunch.executionIdentity.adapter_path,
    runtimePath: relaunch.executionIdentity.runtime_path,
    entryPath: tree.entry,
    cwd,
  });
  assert.equal(relaunchDrift(worktree), null);
  fs.appendFileSync(path.join(worktree, '.claude', 'settings.json'), '// drifted after selection\n');
  assert.equal(relaunchDrift(worktree), 'native_settings');
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
  // After the repaired-marker split the retained record keeps binding the
  // originally installed build it observed — history — deliberately distinct
  // from the repaired source marker, so that build can never be admitted
  // under the repaired identity.
  assert.equal(record.qualified_identity.bridge_build_marker, 'zcode-acp 0.1.0+ultra.zcode.0.16.5');
  assert.notEqual(record.qualified_identity.bridge_build_marker, ZCODE_ACP_SOURCE.buildMarker);
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
  // ACP transport: the declared repaired identity is version-mismatched
  // against the retained negative record (which binds the originally
  // installed build), so every required dimension fails closed before any
  // transport fact is consulted; a read-only packet no longer requires
  // writable_scope.
  const acp = enforcementAdmission(zcode, { required: write, driver: 'acp' });
  assert.equal(acp.route, 'unavailable');
  assert.equal(acp.code, 'host_enforcement_unavailable');
  assert.deepEqual(acp.dimensions.map((entry) => [entry.dimension, entry.status]), [
    ['writable_scope', 'version_mismatch'],
    ['outside_root_denial', 'version_mismatch'],
    ['shell_tool_denial', 'version_mismatch'],
    ['agent_tool_network_denial', 'version_mismatch'],
    ['point_of_use_effect_boundary', 'version_mismatch'],
  ]);
  const acpReadOnly = enforcementAdmission(zcode, { required: readOnly, driver: 'acp' });
  assert.equal(acpReadOnly.route, 'unavailable');
  assert.ok(acpReadOnly.dimensions.every((entry) => entry.dimension !== 'writable_scope'));
  // The CLI transport has no retained observation at all; the same identity
  // mismatch dominates, so every required dimension is version-mismatched and
  // the route is unavailable without silent fallback.
  const cli = enforcementAdmission(zcode, { required: readOnly, driver: 'cli' });
  assert.equal(cli.route, 'unavailable');
  assert.deepEqual(
    cli.dimensions.map((entry) => entry.status),
    ['version_mismatch', 'version_mismatch', 'version_mismatch', 'version_mismatch'],
  );
  // The decision carries its evidence binding and no secret value.
  assert.equal(acp.evidence.attempt_id, zcode.enforcement.attempt_id);
  assert.equal(acp.transport, 'acp-stdio');
  assert.equal(acp.identity.match, false);
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
  // A hypothetical positive record qualifies the identity the live profile
  // declares — after the repaired-marker split, that is the repaired build,
  // never the originally installed build retained by the negative record.
  const admittedRecord = {
    ...zcode.enforcement,
    qualified_identity: zcode.acp.candidateIdentity,
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

test('the repaired bridge marker is distinct and candidate selection rejects the installed unqualified build', () => {
  const zcode = hostProfile('zcode');
  const required = [
    'writable_scope', 'outside_root_denial', 'shell_tool_denial',
    'agent_tool_network_denial', 'point_of_use_effect_boundary',
  ];
  const repaired = zcode.acp.candidateIdentity;
  // The declared selection identity is the repaired revision, distinct from
  // the originally installed build marker that the retained negative record
  // still binds as history.
  assert.equal(repaired.bridge_build_marker, ZCODE_ACP_SOURCE.buildMarker);
  assert.equal(
    zcode.enforcement.qualified_identity.bridge_build_marker,
    'zcode-acp 0.1.0+ultra.zcode.0.16.5',
    'the retained negative record must keep binding the originally installed build',
  );
  assert.notEqual(
    repaired.bridge_build_marker,
    zcode.enforcement.qualified_identity.bridge_build_marker,
    'the repaired build must not share a marker with the unqualified installed build',
  );
  const qualifiedDimensions = {};
  for (const dimension of required) {
    qualifiedDimensions[dimension] = {
      observation: 'supported', admission: 'supported', basis: 'fixture: exact observed support',
    };
  }
  const repairedRecord = {
    ...zcode.enforcement,
    qualified_identity: repaired,
    transports: { 'acp-stdio': { dimensions: qualifiedDimensions } },
  };
  const env = { ...process.env, ULTRA_ZCODE_ACP_COMMAND: process.execPath };
  const selectWith = (bridgeStdout, runtimeStdout) => selectExecutionDriver({
    host: 'zcode',
    profile: zcode,
    cliCommand: '/usr/bin/true',
    env,
    runCandidateProbe: (command, args) => {
      assert.equal(args[0], '--version');
      return command === env.ULTRA_ZCODE_ACP_COMMAND
        ? { status: 0, stdout: `${bridgeStdout}\n`, stderr: '' }
        : { status: 0, stdout: `${runtimeStdout}\n`, stderr: '' };
    },
  });
  // A candidate still reporting the installed unqualified build's marker is
  // rejected by the existing identity probe seam and falls back typed.
  const oldBuild = selectWith('zcode-acp 0.1.0+ultra.zcode.0.16.5', '0.16.5');
  assert.equal(oldBuild.driver, 'cli');
  assert.equal(oldBuild.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(oldBuild.acpCapability.candidate_identity_valid, false);
  assert.equal(oldBuild.acpCapability.candidate_identity_reason, 'zcode_bridge');
  // The exact repaired marker is selected on the same seam.
  const repairedBuild = selectWith(repaired.bridge_build_marker, repaired.runtime_version);
  assert.equal(repairedBuild.driver, 'acp');
  assert.equal(repairedBuild.fallbackReason, null);
  assert.equal(repairedBuild.acpCapability.candidate_identity_valid, true);
  // Even a fully positive record qualified on the repaired identity rejects
  // the installed build's declared identity: flipping the same historical
  // identity to supported can never admit the old build.
  const { enforcementAdmission: admission } = require('../skills/ultra-delegate/scripts/host-profile.cjs');
  const installedDeclared = {
    ...zcode,
    acp: {
      ...zcode.acp,
      candidateIdentity: {
        bridge_build_marker: 'zcode-acp 0.1.0+ultra.zcode.0.16.5',
        runtime_version: '0.16.5',
      },
    },
    enforcement: repairedRecord,
  };
  const rejected = admission(installedDeclared, { required, driver: 'acp' });
  assert.equal(rejected.route, 'unavailable');
  assert.equal(rejected.identity.match, false);
  assert.ok(rejected.dimensions.every((entry) => entry.status === 'version_mismatch'));
});

function fileDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// One isolated execution-identity tree: an adapter executable, a native
// runtime file, and a public entry with the SDK package beside it — the exact
// layout the qualification kit binds, rebuilt from fixture bytes only.
function identityTree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = path.join(root, 'adapter-bin');
  fs.writeFileSync(adapter, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(adapter, 0o755);
  const runtime = path.join(root, 'runtime.cjs');
  fs.writeFileSync(runtime, '// fixture runtime 2.0.0\n');
  const entryDir = path.join(root, 'acpx-runtime');
  fs.mkdirSync(path.join(entryDir, 'node_modules', 'acpx'), { recursive: true });
  const entry = path.join(entryDir, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(entry, '// fixture entry\n');
  const packageFile = path.join(entryDir, 'node_modules', 'acpx', 'package.json');
  fs.writeFileSync(packageFile, `${JSON.stringify({ name: 'acpx', version: '0.13.2' })}\n`);
  return { root, adapter, runtime, entry, packageFile };
}

function identityFingerprints(tree) {
  return {
    adapter_sha256: fileDigest(tree.adapter),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(tree.entry),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: fileDigest(tree.packageFile) },
    // The selection also retains the exact resolved paths it hashed so the
    // detached launch consumes and rechecks those same paths instead of
    // re-resolving a bare or relative command against another cwd.
    adapter_path: tree.adapter,
    runtime_path: tree.runtime,
  };
}

const FIXTURE_CANDIDATE_IDENTITY = Object.freeze({
  bridge_build_marker: 'fixture-acp 1.0.0+ultra.fixture.2.0.0',
  runtime_version: '2.0.0',
});

function identityProfile(tree, qualifiedIdentity) {
  return {
    binary: tree.runtime,
    acp: {
      surface: 'fixture ACP stdio',
      transport: 'stdio',
      protocolVersions: [1],
      conformance: { status: 'passed', evidence: 'tests/fixtures/fake-acp-agent.cjs' },
      command: () => tree.adapter,
      argv: () => ['--runtime', tree.runtime, '--no-browser'],
      candidateIdentity: FIXTURE_CANDIDATE_IDENTITY,
    },
    enforcement: {
      $schema: 'ultra-host-enforcement-qualification-v1',
      attempt_id: 'fixture-execution-identity',
      observed_at: '2026-09-06T00:00:00Z',
      evidence: 'tests/acp-driver.test.cjs#execution-identity-fixture',
      receipt_sha256: '0'.repeat(64),
      qualified_identity: qualifiedIdentity,
      provider_transport_admission: 'separately_authorized_only',
      transports: { 'acp-stdio': { dimensions: {} } },
      disposition: { route: 'admitted', reason: 'fixture', silent_fallback: false, maturity_change: false },
    },
  };
}

function selectWithIdentity(tree, qualifiedIdentity) {
  return selectExecutionDriver({
    host: 'fixture',
    profile: identityProfile(tree, qualifiedIdentity),
    cliCommand: tree.runtime,
    env: { ...process.env, ULTRA_DELEGATE_ACPX_ENTRY: tree.entry },
  });
}

test('selection consumes the observed execution identity a string-matching qualification binds', (t) => {
  const tree = identityTree(t);
  const selection = selectWithIdentity(tree, {
    ...FIXTURE_CANDIDATE_IDENTITY,
    ...identityFingerprints(tree),
  });
  assert.equal(selection.driver, 'acp', JSON.stringify(selection.acpCapability));
  assert.equal(selection.fallbackReason, null);
  // The exact resolved entry is bound by content, and the verified identity
  // travels with the selection for the digest-bound worker spec.
  assert.deepEqual(selection.acpEntry, { path: tree.entry, sha256: fileDigest(tree.entry) });
  assert.deepEqual(selection.executionIdentity, identityFingerprints(tree));
});

test('a qualified claude record byte-binds the registry native file, not the PATH CLI spelling', (t) => {
  const tree = identityTree(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-claude-identity-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.config', 'agent-delegation'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'agent-delegation', 'config.json'), `${JSON.stringify({
    runtime_packages: { '@agentclientprotocol/claude-agent-acp': '0.75.1' },
    targets: {
      claude: {
        argv: [tree.adapter],
        cli_env: { CLAUDE_CODE_EXECUTABLE: tree.runtime },
        observed_version: '2.1.261 (Claude Code)',
      },
    },
  })}\n`);
  const env = { HOME: home, PATH: process.env.PATH, ULTRA_DELEGATE_ACPX_ENTRY: tree.entry };
  const claude = hostProfile('claude', { env });
  assert.ok(claude.acp.candidateIdentity, 'the registry binding declares the candidate identity');
  // The claude route's qualified record additionally binds the native
  // permission configuration at the execution site and the Claude SDK
  // package beside the adapter; the fixture site provides both so this test
  // stays about the runtime-file binding, not the new components.
  const sdkPackageFile = path.join(
    tree.root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json',
  );
  fs.mkdirSync(path.dirname(sdkPackageFile), { recursive: true });
  fs.writeFileSync(sdkPackageFile, `${JSON.stringify({
    name: '@anthropic-ai/claude-agent-sdk', version: '0.3.257', main: 'index.js',
  })}\n`);
  fs.writeFileSync(path.join(path.dirname(sdkPackageFile), 'index.js'), '// fixture sdk\n');
  const worktree = path.join(tree.root, 'worktree');
  fs.mkdirSync(path.join(worktree, '.claude'), { recursive: true });
  for (const relative of CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS) {
    fs.writeFileSync(path.join(worktree, relative), renderClaudeNativePermissionSettings());
  }
  const fingerprints = {
    adapter_sha256: fileDigest(tree.adapter),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(tree.entry),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: fileDigest(tree.packageFile) },
    native_settings_sha256: claudeNativeSettingsObservation(
      worktree, CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS,
    ).sha256,
    claude_sdk_package: {
      name: '@anthropic-ai/claude-agent-sdk',
      version: '0.3.257',
      package_json_sha256: fileDigest(sdkPackageFile),
    },
  };
  const qualified = {
    ...claude,
    enforcement: identityProfile(tree, {
      ...claude.acp.candidateIdentity,
      ...fingerprints,
    }).enforcement,
  };
  const selectClaude = (probeStdout) => selectExecutionDriver({
    host: 'claude',
    profile: qualified,
    // A bare PATH spelling: the adapter consumes the native CLI through the
    // registry's CLAUDE_CODE_EXECUTABLE binding, so the hashed runtime file
    // must come from the profile declaration, never from this spelling.
    cliCommand: 'claude',
    env,
    cwd: worktree,
    runCandidateProbe: () => ({ status: 0, stdout: `${probeStdout}\n`, stderr: '' }),
  });
  const bound = selectClaude('2.1.261 (Claude Code)');
  assert.equal(bound.driver, 'acp', JSON.stringify(bound.acpCapability));
  assert.equal(bound.executionIdentity.runtime_path, tree.runtime);
  assert.equal(bound.executionIdentity.runtime_sha256, fingerprints.runtime_sha256);
  // Same-version drift of the registry-bound native file fails closed on the
  // runtime component even though the PATH CLI spelling never changed.
  fs.appendFileSync(tree.runtime, '// replaced native bytes\n');
  const drifted = selectClaude('2.1.261 (Claude Code)');
  assert.equal(drifted.driver, 'cli');
  assert.equal(drifted.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(drifted.acpCapability.candidate_identity_reason, 'runtime_sha256');
});

test('same-version drift of the actual adapter, runtime, entry, or SDK package fails closed at selection', (t) => {
  const declared = FIXTURE_CANDIDATE_IDENTITY;

  const entryTree = identityTree(t);
  const entryBase = identityFingerprints(entryTree);
  fs.appendFileSync(entryTree.entry, '// replaced entry bytes, same declared versions\n');
  const entryDrift = selectWithIdentity(entryTree, { ...declared, ...entryBase });
  assert.equal(entryDrift.driver, 'cli');
  assert.equal(entryDrift.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(entryDrift.acpCapability.candidate_identity_valid, false);
  assert.equal(entryDrift.acpCapability.candidate_identity_reason, 'acpx_entry_sha256');

  const adapterTree = identityTree(t);
  const adapterBase = identityFingerprints(adapterTree);
  fs.appendFileSync(adapterTree.adapter, '# replaced adapter bytes\n');
  const adapterDrift = selectWithIdentity(adapterTree, { ...declared, ...adapterBase });
  assert.equal(adapterDrift.driver, 'cli');
  assert.equal(adapterDrift.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(adapterDrift.acpCapability.candidate_identity_reason, 'adapter_sha256');

  const runtimeTree = identityTree(t);
  const runtimeBase = identityFingerprints(runtimeTree);
  fs.appendFileSync(runtimeTree.runtime, '// replaced runtime bytes\n');
  const runtimeDrift = selectWithIdentity(runtimeTree, { ...declared, ...runtimeBase });
  assert.equal(runtimeDrift.driver, 'cli');
  assert.equal(runtimeDrift.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(runtimeDrift.acpCapability.candidate_identity_reason, 'runtime_sha256');

  const packageTree = identityTree(t);
  const packageBase = identityFingerprints(packageTree);
  fs.writeFileSync(packageTree.packageFile, `${JSON.stringify({ name: 'acpx', version: '0.13.3' })}\n`);
  const packageDrift = selectWithIdentity(packageTree, { ...declared, ...packageBase });
  assert.equal(packageDrift.driver, 'cli');
  assert.equal(packageDrift.fallbackReason, 'acp_candidate_identity_mismatch');
  assert.equal(packageDrift.acpCapability.candidate_identity_reason, 'acpx_package');

  const missingTree = identityTree(t);
  const missingBase = identityFingerprints(missingTree);
  fs.rmSync(path.join(missingTree.root, 'acpx-runtime', 'node_modules'), { recursive: true, force: true });
  const missing = selectWithIdentity(missingTree, { ...declared, ...missingBase });
  assert.equal(missing.driver, 'cli');
  assert.equal(missing.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(missing.acpCapability.candidate_identity_reason, 'acpx_package');
});

test('a string-matching record without the full fingerprint binding fails closed at selection', (t) => {
  const tree = identityTree(t);
  const declared = FIXTURE_CANDIDATE_IDENTITY;
  // Strings alone can never admit the ACP route: the record must bind the
  // observed bytes, or the candidate is unavailable.
  const stringsOnly = selectWithIdentity(tree, { ...declared });
  assert.equal(stringsOnly.driver, 'cli');
  assert.equal(stringsOnly.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(stringsOnly.acpCapability.candidate_identity_valid, false);
  assert.equal(stringsOnly.acpCapability.candidate_identity_reason, 'adapter_sha256');

  const base = identityFingerprints(tree);
  const partial = selectWithIdentity(tree, { ...declared, adapter_sha256: base.adapter_sha256 });
  assert.equal(partial.driver, 'cli');
  assert.equal(partial.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(partial.acpCapability.candidate_identity_reason, 'runtime_sha256');

  const noPackage = selectWithIdentity(tree, {
    ...declared,
    adapter_sha256: base.adapter_sha256,
    runtime_sha256: base.runtime_sha256,
    acpx_entry_sha256: base.acpx_entry_sha256,
  });
  assert.equal(noPackage.driver, 'cli');
  assert.equal(noPackage.fallbackReason, 'acp_candidate_identity_unavailable');
  assert.equal(noPackage.acpCapability.candidate_identity_reason, 'acpx_package');
});

test('a version-mismatched record never engages the execution-identity binding at selection', (t) => {
  const tree = identityTree(t);
  // The qualified strings differ from the declared candidate: the pure
  // admission gate owns that refusal, so selection stays probe-only and never
  // hash-compares the live files.
  fs.appendFileSync(tree.entry, '// drifted bytes the selector must not consult\n');
  const selection = selectWithIdentity(tree, {
    bridge_build_marker: 'fixture-acp 1.0.0+ultra.fixture.1.0.0',
    runtime_version: '1.0.0',
  });
  assert.equal(selection.driver, 'acp');
  assert.equal(selection.executionIdentity, undefined);
  assert.deepEqual(selection.acpEntry, { path: tree.entry, sha256: fileDigest(tree.entry) });
});

test('a byte-bound selection builds the candidate argv over the resolved runtime path', (t) => {
  const tree = identityTree(t);
  // A bare runtime command resolved through PATH — the shape of an installed
  // CLI name. The bound bytes are the resolved file's, so the same bytes are
  // copied into the PATH entry the resolution must find.
  const binDir = path.join(tree.root, 'bin');
  fs.mkdirSync(binDir);
  const bareRuntime = path.join(binDir, 'fixture-runtime');
  fs.copyFileSync(tree.runtime, bareRuntime);
  fs.chmodSync(bareRuntime, 0o755);
  const profile = identityProfile(tree, {
    ...FIXTURE_CANDIDATE_IDENTITY,
    ...identityFingerprints(tree),
  });
  profile.acp.argv = ({ cliCommand }) => ['--runtime', cliCommand, '--no-browser'];
  const selection = selectExecutionDriver({
    host: 'fixture',
    profile,
    cliCommand: 'fixture-runtime',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      ULTRA_DELEGATE_ACPX_ENTRY: tree.entry,
    },
  });
  assert.equal(selection.driver, 'acp', JSON.stringify(selection.acpCapability));
  // The launched adapter consumes the exact resolved runtime path the
  // selection hashed — never the bare name re-resolved at launch time.
  assert.deepEqual(selection.args, ['--runtime', bareRuntime, '--no-browser']);
  assert.equal(selection.executionIdentity.runtime_path, bareRuntime);
  assert.equal(selection.executionIdentity.runtime_sha256, fileDigest(bareRuntime));
});

test('a byte-bound selection resolves a relative runtime command once, at selection', (t) => {
  const tree = identityTree(t);
  const profile = identityProfile(tree, {
    ...FIXTURE_CANDIDATE_IDENTITY,
    ...identityFingerprints(tree),
  });
  profile.acp.argv = ({ cliCommand }) => ['--runtime', cliCommand, '--no-browser'];
  const selection = selectExecutionDriver({
    host: 'fixture',
    profile,
    cliCommand: path.relative(process.cwd(), tree.runtime),
    env: { ...process.env, ULTRA_DELEGATE_ACPX_ENTRY: tree.entry },
  });
  assert.equal(selection.driver, 'acp', JSON.stringify(selection.acpCapability));
  // A relative spelling is resolved against the selection's cwd exactly once;
  // the bound absolute path is what the launch consumes and rechecks.
  assert.deepEqual(selection.args, ['--runtime', tree.runtime, '--no-browser']);
  assert.equal(selection.executionIdentity.runtime_path, tree.runtime);
});

// The managed agent-delegation installer publishes the absolute entry of the
// selected runtime generation as `acpx_delegate_entry` in
// ~/.config/agent-delegation/config.json; the resolver consumes that public
// registry key between the explicit override and the legacy fixed location.
function registryHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-registry-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const generation = path.join(
    home, '.local', 'share', 'agent-delegation', 'runtimes', '20260906T000000Z-generation',
  );
  fs.mkdirSync(generation, { recursive: true });
  const generationEntry = path.join(generation, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(generationEntry, '// selected generation entry\n');
  const legacyDir = path.join(home, '.local', 'share', 'agent-delegation', 'runtime');
  fs.mkdirSync(legacyDir, { recursive: true });
  const legacyEntry = path.join(legacyDir, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(legacyEntry, '// legacy fixed entry\n');
  const registryFile = path.join(home, '.config', 'agent-delegation', 'config.json');
  const writeRegistry = (source) => {
    fs.mkdirSync(path.dirname(registryFile), { recursive: true });
    fs.writeFileSync(registryFile, source);
  };
  return { home, generation, generationEntry, legacyEntry, registryFile, writeRegistry };
}

test('the entry resolver consumes the managed registry binding before the legacy location', (t) => {
  const fx = registryHome(t);
  fx.writeRegistry(`${JSON.stringify({ schema_version: 1, acpx_delegate_entry: fx.generationEntry })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), fx.generationEntry);

  // A registry without the entry binding (an older managed install) keeps the
  // legitimate legacy fallback.
  fx.writeRegistry(`${JSON.stringify({ schema_version: 1, runtime_root: fx.generation })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), fx.legacyEntry);

  // An unreadable or malformed registry is no binding at all.
  fx.writeRegistry('{not json');
  assert.equal(resolveAcpEntry({}, { home: fx.home }), fx.legacyEntry);

  // No registry file: the legacy location still serves older installs.
  fs.rmSync(fx.registryFile);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), fx.legacyEntry);

  // Nothing published anywhere resolves to null so callers fail closed typed.
  fs.rmSync(path.join(fx.home, '.local'), { recursive: true, force: true });
  assert.equal(resolveAcpEntry({}, { home: fx.home }), null);
});

test('the explicit entry override keeps priority and fails closed over the registry', (t) => {
  const fx = registryHome(t);
  fx.writeRegistry(`${JSON.stringify({ acpx_delegate_entry: fx.generationEntry })}\n`);
  // An explicit absolute override wins over the registry binding.
  assert.equal(
    resolveAcpEntry({ ULTRA_DELEGATE_ACPX_ENTRY: fx.legacyEntry }, { home: fx.home }),
    fx.legacyEntry,
  );
  // An invalid explicit override (relative, or naming a missing file) refuses
  // every other source rather than widening the transport.
  assert.equal(
    resolveAcpEntry({ ULTRA_DELEGATE_ACPX_ENTRY: 'relative/acpx-entry.cjs' }, { home: fx.home }),
    null,
  );
  assert.equal(
    resolveAcpEntry({ ULTRA_DELEGATE_ACPX_ENTRY: path.join(fx.home, 'missing-entry.cjs') }, { home: fx.home }),
    null,
  );
});

test('a broken registry binding fails closed instead of substituting another runtime', (t) => {
  const fx = registryHome(t);
  // The installer publishes an absolute resolved path; a relative, missing, or
  // non-file binding is broken — the legacy location is NOT a silent fallback
  // for a selection the installer actually made.
  fx.writeRegistry(`${JSON.stringify({ acpx_delegate_entry: 'relative/acpx_delegate_entry.cjs' })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), null);

  fx.writeRegistry(`${JSON.stringify({ acpx_delegate_entry: path.join(fx.home, 'removed-generation', 'acpx_delegate_entry.cjs') })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), null);

  fx.writeRegistry(`${JSON.stringify({ acpx_delegate_entry: fx.generation })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), null);

  fx.writeRegistry(`${JSON.stringify({ acpx_delegate_entry: 42 })}\n`);
  assert.equal(resolveAcpEntry({}, { home: fx.home }), null);
});

test('the SDK package resolution follows the entry realpath like Node does', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acpx-realpath-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const realDir = path.join(root, 'real-runtime');
  fs.mkdirSync(path.join(realDir, 'node_modules', 'acpx'), { recursive: true });
  const realEntry = path.join(realDir, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(realEntry, '// real entry\n');
  const packageFile = path.join(realDir, 'node_modules', 'acpx', 'package.json');
  fs.writeFileSync(packageFile, `${JSON.stringify({ name: 'acpx', version: '0.13.2' })}\n`);
  // Node resolves a symlinked main module to its real path (no
  // --preserve-symlinks-main), so the SDK loads from beside the REAL entry —
  // never from beside the symlink spelling.
  const aliasDir = path.join(root, 'alias');
  fs.mkdirSync(aliasDir);
  const aliasEntry = path.join(aliasDir, 'acpx_delegate_entry.cjs');
  fs.symlinkSync(realEntry, aliasEntry);
  assert.deepEqual(resolveAcpxPackage(aliasEntry), {
    name: 'acpx',
    version: '0.13.2',
    package_json_sha256: fileDigest(packageFile),
  });
  // The direct ordinary-file layout resolves identically.
  assert.deepEqual(resolveAcpxPackage(realEntry), {
    name: 'acpx',
    version: '0.13.2',
    package_json_sha256: fileDigest(packageFile),
  });
});

test('the SDK package resolution walks up node_modules exactly like the entry require', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acpx-walkup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // require('acpx/package.json') from the entry checks the node_modules
  // hierarchy upward; a package installed above the entry directory is what
  // the running entry actually loads.
  fs.mkdirSync(path.join(root, 'node_modules', 'acpx'), { recursive: true });
  const packageFile = path.join(root, 'node_modules', 'acpx', 'package.json');
  fs.writeFileSync(packageFile, `${JSON.stringify({ name: 'acpx', version: '0.13.2' })}\n`);
  const nested = path.join(root, 'runtimes', 'generation-a');
  fs.mkdirSync(nested, { recursive: true });
  const entry = path.join(nested, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(entry, '// generation entry\n');
  assert.deepEqual(resolveAcpxPackage(entry), {
    name: 'acpx',
    version: '0.13.2',
    package_json_sha256: fileDigest(packageFile),
  });
  // Nothing resolvable stays unobserved so callers fail closed.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acpx-bare-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  const bareEntry = path.join(bare, 'acpx_delegate_entry.cjs');
  fs.writeFileSync(bareEntry, '// entry without a resolvable SDK\n');
  assert.equal(resolveAcpxPackage(bareEntry), null);
  assert.equal(resolveAcpxPackage(path.join(bare, 'missing-entry.cjs')), null);
});

test('the launch reuses the selection-bound public entry instead of resolving anew', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { process.env.ULTRA_DELEGATE_ACPX_ENTRY = FAKE_ACPX_ENTRY; });
  fx.spec.acp_entry = { path: FAKE_ACPX_ENTRY, sha256: fileDigest(FAKE_ACPX_ENTRY) };
  // Defeat the resolver: the launch must follow the bound selection, never a
  // fresh resolution after admission.
  process.env.ULTRA_DELEGATE_ACPX_ENTRY = '/no/such/acpx-entry.cjs';
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.spec.host_output, 'utf8')), resultPayload());
});

test('a changed bound entry refuses before any host launch', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  const drifted = path.join(fx.root, 'drifted-entry.cjs');
  fs.copyFileSync(FAKE_ACPX_ENTRY, drifted);
  fx.spec.acp_entry = { path: drifted, sha256: fileDigest(drifted) };
  fs.appendFileSync(drifted, '// drift after admission\n');
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_execution_identity_mismatch', JSON.stringify(outcome));
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'not_started');
  assert.equal(fs.existsSync(fx.spec.events), false, 'no journal may exist without a launch');
});

test('the launch rechecks the bound adapter, entry, and SDK package identity', async (t) => {
  const tree = identityTree(t);
  const entryCopy = path.join(tree.root, 'acpx-runtime', 'acpx_delegate_entry.cjs');
  fs.copyFileSync(FAKE_ACPX_ENTRY, entryCopy);

  // Drifted adapter bytes refuse before any launch.
  const adapterFx = fixture('happy');
  t.after(() => fs.rmSync(adapterFx.root, { recursive: true, force: true }));
  adapterFx.spec.acp_entry = { path: entryCopy, sha256: fileDigest(entryCopy) };
  adapterFx.spec.execution_identity = {
    adapter_sha256: '0'.repeat(64),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(entryCopy),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: fileDigest(tree.packageFile) },
    adapter_path: process.execPath,
    runtime_path: tree.runtime,
  };
  const adapterOutcome = await new AcpDriver(adapterFx.spec).run();
  assert.equal(adapterOutcome.failureType, 'acp_execution_identity_mismatch', JSON.stringify(adapterOutcome));
  assert.match(adapterOutcome.failureSummary, /adapter/u);
  assert.equal(fs.existsSync(adapterFx.spec.events), false);

  // A changed SDK package.json beside the bound entry refuses the same way.
  const packageFx = fixture('happy');
  t.after(() => fs.rmSync(packageFx.root, { recursive: true, force: true }));
  packageFx.spec.acp_entry = { path: entryCopy, sha256: fileDigest(entryCopy) };
  packageFx.spec.execution_identity = {
    adapter_sha256: fileDigest(process.execPath),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(entryCopy),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: '0'.repeat(64) },
    adapter_path: process.execPath,
    runtime_path: tree.runtime,
  };
  const packageOutcome = await new AcpDriver(packageFx.spec).run();
  assert.equal(packageOutcome.failureType, 'acp_execution_identity_mismatch', JSON.stringify(packageOutcome));
  assert.match(packageOutcome.failureSummary, /acpx_package/u);
  assert.equal(fs.existsSync(packageFx.spec.events), false);

  // The fully matching binding launches through the unchanged path.
  const happyFx = fixture('happy');
  t.after(() => fs.rmSync(happyFx.root, { recursive: true, force: true }));
  happyFx.spec.acp_entry = { path: entryCopy, sha256: fileDigest(entryCopy) };
  happyFx.spec.execution_identity = {
    adapter_sha256: fileDigest(process.execPath),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(entryCopy),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: fileDigest(tree.packageFile) },
    adapter_path: process.execPath,
    runtime_path: tree.runtime,
  };
  const happyOutcome = await new AcpDriver(happyFx.spec).run();
  assert.equal(happyOutcome.code, 0, JSON.stringify(happyOutcome));
  assert.equal(happyOutcome.stopReason, 'end_turn');
});

// One byte-bound launch fixture: the bound entry copy with its SDK package
// beside it, plus the execution identity a verified selection retains —
// content digests AND the exact resolved adapter/runtime paths it hashed.
function boundLaunchFixture(t) {
  const tree = identityTree(t);
  const entryCopy = path.join(tree.root, 'acpx-runtime', 'acpx_delegate_entry.cjs');
  fs.copyFileSync(FAKE_ACPX_ENTRY, entryCopy);
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  fx.spec.acp_entry = { path: entryCopy, sha256: fileDigest(entryCopy) };
  fx.spec.execution_identity = {
    adapter_sha256: fileDigest(process.execPath),
    runtime_sha256: fileDigest(tree.runtime),
    acpx_entry_sha256: fileDigest(entryCopy),
    acpx_package: { name: 'acpx', version: '0.13.2', package_json_sha256: fileDigest(tree.packageFile) },
    adapter_path: process.execPath,
    runtime_path: tree.runtime,
  };
  return { tree, fx, entryCopy };
}

test('an ordinary runtime update between selection and the detached launch refuses before any host launch', async (t) => {
  const { tree, fx } = boundLaunchFixture(t);
  // The runtime file the selection hashed is replaced before the worker's
  // launch recheck — same declared versions, different bytes.
  fs.appendFileSync(tree.runtime, '// runtime update after admission\n');
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_execution_identity_mismatch', JSON.stringify(outcome));
  assert.match(outcome.failureSummary, /runtime/u);
  assert.equal(fs.existsSync(fx.spec.events), false, 'no journal may exist without a launch');
  assert.equal(JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8')).phase, 'not_started');
});

test('the launch consumes the selection-bound adapter path instead of re-resolving the command', async (t) => {
  const { fx } = boundLaunchFixture(t);
  // The worker's sanitized view cannot resolve this command name at all; only
  // the path the selection bound may launch.
  fx.spec.command = 'ubp-deliberately-unresolvable-adapter';
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.code, 0, JSON.stringify(outcome));
  assert.equal(outcome.stopReason, 'end_turn');
});

test('a bound execution identity without the resolved paths fails closed before launch', async (t) => {
  const { fx } = boundLaunchFixture(t);
  // Content digests without the exact resolved paths are a malformed binding:
  // the launch cannot prove which files the OS will consume.
  delete fx.spec.execution_identity.adapter_path;
  delete fx.spec.execution_identity.runtime_path;
  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_execution_identity_mismatch', JSON.stringify(outcome));
  assert.match(outcome.failureSummary, /execution_identity/u);
  assert.equal(fs.existsSync(fx.spec.events), false, 'no journal may exist without a launch');
  assert.equal(JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8')).phase, 'not_started');
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

test('an unreadable ACPX entry keeps the ACP route typed-unavailable without launching a worker', async (t) => {
  const fx = fixture('happy');
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));
  t.after(() => { process.env.ULTRA_DELEGATE_ACPX_ENTRY = FAKE_ACPX_ENTRY; });
  process.env.ULTRA_DELEGATE_ACPX_ENTRY = '/no/such/acpx-entry.cjs';

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_entry_unavailable', JSON.stringify(outcome));
  assert.equal(outcome.spawnError, null);
  // No writer ever existed: the launcher's not_started proof stays releasable.
  const observation = JSON.parse(fs.readFileSync(fx.spec.writer_observation, 'utf8'));
  assert.equal(observation.phase, 'not_started');
  assert.equal(
    deriveWriterState(observation, { identity: { delegationId: fx.spec.delegation_id, launchId: fx.spec.launch_id } }),
    'stopped',
  );
  assert.equal(fs.existsSync(fx.spec.events), false, 'no journal may exist without a launch');
});

test('an unresolvable ACP candidate command is typed-unavailable before any launch', async (t) => {
  const fx = fixture('happy', { command: path.join(os.tmpdir(), `ubp-no-such-acp-${process.pid}-${Date.now()}`) });
  t.after(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  const outcome = await new AcpDriver(fx.spec).run();
  assert.equal(outcome.failureType, 'acp_command_unavailable', JSON.stringify(outcome));
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
