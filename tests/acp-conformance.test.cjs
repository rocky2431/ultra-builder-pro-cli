'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(
  ROOT, 'skills', 'ultra-delegate', 'scripts', 'acp-conformance.cjs',
);
const FAKE_AGENT = path.join(__dirname, 'fixtures', 'fake-acp-agent.cjs');

test('ACP conformance harness exercises the real delegation path and retains only redacted facts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-acp-conformance-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'receipt.json');
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

  const run = spawnSync(process.execPath, [
    HARNESS,
    '--host', 'codex',
    '--output', output,
    '--timeout', '10',
    '--command', process.execPath,
    '--args-json', JSON.stringify([FAKE_AGENT]),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      FAKE_ACP_SCENARIO: 'happy',
      FAKE_ACP_RESULT: JSON.stringify(result),
    },
  });
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
});
