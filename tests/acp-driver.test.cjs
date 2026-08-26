'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FAKE_AGENT = path.join(__dirname, 'fixtures', 'fake-acp-agent.cjs');
const {
  selectExecutionDriver,
} = require('../skills/ultra-delegate/scripts/agent-execution-driver.cjs');
const { AcpDriver } = require('../skills/ultra-delegate/scripts/acp-driver.cjs');
const { CliDriver } = require('../skills/ultra-delegate/scripts/cli-driver.cjs');
const { hostProfile } = require('../skills/ultra-delegate/scripts/host-profile.cjs');

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
    cancel: path.join(root, 'cancel.request'),
    stdout: path.join(root, 'stdout.log'),
    stderr: path.join(root, 'stderr.log'),
    host_output: path.join(root, 'host-result.json'),
    events: path.join(root, 'events.jsonl'),
    timeout_ms: 3000,
    ...overrides,
  };
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

test('all shipped Hosts honestly retain CLI fallback until their own ACP row passes; ZCode names installed-runtime experimental scope', () => {
  const expectedFallback = {
    claude: 'acp_not_available',
    codex: 'acp_not_available',
    opencode: 'acp_stdio_unavailable',
    kimi: 'acp_conformance_not_passed',
    grok: 'acp_conformance_not_passed',
    zcode: 'acp_v1_unavailable',
  };
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi', 'grok', 'zcode']) {
    const profile = hostProfile(runtime);
    const selection = selectExecutionDriver({
      host: runtime,
      profile,
      cliCommand: profile.binary,
      env: process.env,
    });
    assert.equal(selection.driver, 'cli', runtime);
    assert.equal(selection.fallbackReason, expectedFallback[runtime], runtime);
    assert.notEqual(profile.acp?.conformance?.status, 'passed', runtime);
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
