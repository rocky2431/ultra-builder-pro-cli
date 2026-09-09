'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(
  ROOT, 'skills', 'ultra-delegate', 'scripts', 'acp-conformance.cjs',
);
const FAKE_AGENT = path.join(__dirname, 'fixtures', 'fake-acp-agent.cjs');
// The generic ACP engine is the installed public entry: conformance harness
// runs select the test-side stand-in through the same runtime-discovery key
// the product consumes.
process.env.ULTRA_DELEGATE_ACPX_ENTRY = path.join(__dirname, 'fixtures', 'fake-acpx-entry.cjs');

function canary(label) {
  return `ubp-d1-${label}-${crypto.randomUUID()}`;
}

function runHarness(root, scenario, extras = {}) {
  const output = path.join(root, `receipt-${scenario}.json`);
  const hostEnvKeys = path.join(root, `host-env-keys-${scenario}.txt`);
  const configPath = path.join(root, `agent-config-${scenario}.json`);
  const canaries = [
    { label: 'primary control', name: 'CLAUDE_CODE_SESSION_TOKEN', value: canary('primary'), prohibitName: true },
    { label: 'unrelated provider', name: 'ANTHROPIC_API_KEY', value: canary('unrelated'), prohibitName: true },
    { label: 'same-provider decoy', name: 'OPENAI_WEBHOOK_SECRET', value: canary('webhook'), prohibitName: true },
    { label: 'provider-namespace decoy', name: 'ANTHROPIC_ADMIN_API_KEY', value: canary('admin'), prohibitName: true },
    { label: 'selected host auth', name: 'OPENAI_API_KEY', value: canary('selected') },
  ];
  fs.writeFileSync(configPath, JSON.stringify({ scenario, envCapture: hostEnvKeys, ...extras }));
  const env = { ...process.env };
  for (const item of canaries) env[item.name] = item.value;
  const run = spawnSync(process.execPath, [
    HARNESS,
    '--host', 'codex',
    '--output', output,
    '--timeout', '10',
    '--command', process.execPath,
    '--args-json', JSON.stringify([FAKE_AGENT, configPath]),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env,
  });
  return { run, output, hostEnvKeys, canaries };
}

test('ACP conformance exercises the real delegation path with a sanitized Host environment and retains only redacted facts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-conformance-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'secret provider response must not persist',
    changed_files: [],
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
  };
  const { run, output, hostEnvKeys, canaries } = runHarness(root, 'happy', { result });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.$schema, 'ultra-acp-conformance-receipt-v1');
  assert.equal(receipt.host, 'codex');
  assert.equal(receipt.result.status, 'passed');
  assert.equal(receipt.result.execution_driver, 'acp');
  assert.equal(receipt.result.protocol_version, 1);
  assert.equal(receipt.result.stop_reason, 'end_turn');
  assert.equal(receipt.result.adapter_exit_code, 0);
  assert.equal(receipt.result.adapter_exit_signal, null);
  assert.equal(receipt.result.git_clean, true);
  assert.equal(receipt.result.changed_files_count, 0);
  assert.equal(receipt.result.worker_exit_observed, true);
  assert.equal(receipt.result.validation_diagnostic, null);
  assert.equal(receipt.result.transport_diagnostic, null);
  assert.equal(receipt.redaction.provider_content_retained, false);
  assert.equal(receipt.redaction.credentials_retained, false);
  for (const artifact of Object.values(receipt.artifact_digests)) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(Number.isInteger(artifact.bytes), true);
  }
  const source = fs.readFileSync(output, 'utf8');
  assert.doesNotMatch(source, /secret provider response|Execute one bounded|raw-secret/u);
  assert.equal(run.stdout.trim(), JSON.stringify({
    host: 'codex',
    status: 'passed',
    receipt: output,
  }));

  const hostKeys = fs.readFileSync(hostEnvKeys, 'utf8').split('\n').filter(Boolean);
  assert.ok(hostKeys.includes('PATH'), 'runtime PATH must reach the conformance Host');
  assert.ok(hostKeys.includes('OPENAI_API_KEY'), 'the selected-Host auth input must reach the conformance Host');
  for (const banned of [
    'CLAUDE_CODE_SESSION_TOKEN', 'ANTHROPIC_API_KEY',
    'OPENAI_WEBHOOK_SECRET', 'ANTHROPIC_ADMIN_API_KEY',
    'UBP_DELEGATE_INSTRUCTION_FILE', 'UBP_DELEGATE_PERMISSION_FILE', 'UBP_DELEGATE_WORKTREE',
  ]) {
    assert.ok(!hostKeys.includes(banned), `conformance Host seam leaked ${banned}`);
  }
  for (const item of canaries) {
    assert.ok(!source.includes(item.value), `the receipt retained the ${item.label} canary value`);
    if (item.prohibitName) {
      assert.ok(!source.includes(item.name), `the receipt retained the ${item.label} canary key name`);
    }
  }
});

test('ACP conformance receipts classify failure types without inventing diagnostics', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-conformance-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // `missing_result` and `outcome_unknown` occupy the same receipt branch: a
  // failure_type is copied verbatim and neither diagnostic claims it. The
  // `acp_`-prefixed transport failures are the only ones routed to
  // transport_diagnostic, so an outcome_unknown conformance failure can never
  // masquerade as a provider transport defect.
  const missing = runHarness(root, 'no-result');
  assert.notEqual(missing.run.status, 0, 'a missing terminal result must fail conformance');
  const missingReceipt = JSON.parse(fs.readFileSync(missing.output, 'utf8'));
  assert.equal(missingReceipt.result.status, 'failed');
  assert.equal(missingReceipt.result.failure_type, 'missing_result');
  assert.equal(missingReceipt.result.validation_diagnostic, null);
  assert.equal(missingReceipt.result.transport_diagnostic, null);
  assert.equal(missingReceipt.result.worker_exit_observed, true);

  const malformed = runHarness(root, 'malformed');
  assert.notEqual(malformed.run.status, 0);
  const malformedReceipt = JSON.parse(fs.readFileSync(malformed.output, 'utf8'));
  // Agent-side wire violations are owned by the pinned entry runtime now and
  // surface as one typed failed turn; the property under test is unchanged —
  // an `acp_`-prefixed transport failure with a retained diagnostic.
  assert.equal(malformedReceipt.result.failure_type, 'acp_turn_failed');
  assert.equal(malformedReceipt.result.validation_diagnostic, null);
  assert.equal(typeof malformedReceipt.result.transport_diagnostic, 'string');
  assert.ok(malformedReceipt.result.transport_diagnostic.length > 0);
});

test('ACP conformance consumes the literal outcome_unknown branch without provider content', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-conformance-unknown-'));
  const childPidFile = path.join(root, 'live-descendant.pid');
  let childPid = null;
  t.after(() => {
    if (childPid) {
      try { process.kill(childPid, 'SIGKILL'); } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const result = {
    $schema: 'ultra-delegation-result-v1',
    status: 'finished',
    summary: 'secret provider response must not persist',
    changed_files: [],
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
  };
  const { run, output, canaries } = runHarness(root, 'finish-live-group', {
    result,
    childPidFile,
  });

  // The adapter returned a syntactically valid finished turn, but a
  // same-process-group descendant stayed alive: conformance must fail through
  // the literal outcome_unknown branch, not a provider transport branch.
  assert.notEqual(run.status, 0, 'an unproven writer boundary must fail conformance');
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.result.status, 'failed');
  assert.equal(receipt.result.failure_type, 'outcome_unknown');
  assert.equal(receipt.result.validation_diagnostic, null);
  assert.equal(receipt.result.transport_diagnostic, null);
  assert.equal(receipt.result.stop_reason, 'end_turn');
  childPid = Number(fs.readFileSync(childPidFile, 'utf8'));
  assert.ok(Number.isInteger(childPid) && childPid > 0);
  try { process.kill(childPid, 0); } catch { assert.fail('the live descendant must still be alive'); }

  const source = fs.readFileSync(output, 'utf8');
  assert.doesNotMatch(source, /secret provider response|Execute one bounded|raw-secret/u);
  for (const item of canaries) {
    assert.ok(!source.includes(item.value), `the receipt retained the ${item.label} canary value`);
    if (item.prohibitName) {
      assert.ok(!source.includes(item.name), `the receipt retained the ${item.label} canary key name`);
    }
  }
});

test('worker exit observation accepts only ESRCH-proven death', async () => {
  const { waitForExit } = require(HARNESS);
  assert.equal(typeof waitForExit, 'function');
  const throws = (code) => () => {
    const error = new Error(code || 'signal subsystem unavailable');
    if (code) error.code = code;
    throw error;
  };
  // EPERM and any unprovable signal outcome keep the worker alive-or-unknown:
  // the conformance receipt must fail honestly rather than observe an exit.
  assert.equal(await waitForExit(4242, 10, throws('ESRCH')), true);
  assert.equal(await waitForExit(4242, 10, throws('EPERM')), false);
  assert.equal(await waitForExit(4242, 10, throws(null)), false);
});
