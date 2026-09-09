'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { consumePiNative, observePiIdentity, piNativeIdentityDrift, CONFIG_ENV, POLICY_PATH } = require('../skills/ultra-delegate/scripts/pi-native-runtime.cjs');
const { CliDriver } = require('../skills/ultra-delegate/scripts/cli-driver.cjs');
const { hostProfile, enforcementAdmission, requiredPacketEnforcementDimensions } = require('../skills/ultra-delegate/scripts/host-profile.cjs');

const config = '{}';
const ready = {
  type: 'ultra_pi_permission', phase: 'ready',
  config_digest: crypto.createHash('sha256').update(config).digest('hex'),
  tools: ['read', 'bash', 'powershell', 'edit', 'write', 'grep', 'find', 'ls'],
};
const message = { type: 'message_end', message: {
  role: 'assistant', stopReason: 'stop', provider: 'fixture-provider', model: 'fixture-model',
  content: [{ type: 'text', text: '{"status":"finished"}' }],
} };
const lines = (rows) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';

test('Pi CLI results require a real terminal and the complete active policy, not exit zero', () => {
  const events = [{ type: 'session', id: 'fixture-session' }, message, { type: 'agent_end' }];
  const result = consumePiNative(lines(events), lines([ready]), config);
  assert.equal(result.failureType, undefined);
  assert.equal(result.nativeTerminal.model, 'fixture-model');
  assert.equal(result.assistantText, '{"status":"finished"}');
  assert.equal(consumePiNative(lines([...events, { type: 'agent_settled' }]), lines([ready]), config).failureType, undefined);
  for (const policy of [[], [{ ...ready, tools: [] }], [{ ...ready, tools: null }], [ready, ready]]) {
    assert.equal(consumePiNative(lines(events), lines(policy), config).failureType, 'pi_native_policy_unavailable');
  }
  const error = { ...message, message: { ...message.message, stopReason: 'error', errorMessage: 'quota fixture' } };
  assert.equal(consumePiNative(lines([...events, error, { type: 'agent_end' }]), lines([ready]), config).failureType, 'pi_native_incomplete');
  assert.equal(consumePiNative(lines(events) + 'broken-json\n', lines([ready]), config).failureType, 'pi_native_incomplete');
  for (const tail of [[{ type: 'tool_execution_start', toolCallId: 'pending', toolName: 'write' }],
    [{ type: 'agent_start' }], [{ ...message, message: { ...message.message, content: [null] } }]]) {
    assert.equal(consumePiNative(lines([...events, ...tail]), lines([ready]), config).failureType, 'pi_native_incomplete');
  }
});

test('Pi tool completions need matching pre-effect decisions and native denial outcomes', () => {
  const decision = {
    type: 'ultra_pi_permission', phase: 'decision', tool_call_id: 'call-1',
    tool_name: 'bash', tool_kind: 'execute', decision: 'reject_once', scope: 'operation_denied',
    input_digest: 'a'.repeat(64),
  };
  const call = { type: 'tool_execution_end', toolCallId: 'call-1', toolName: 'bash', isError: true,
    result: { content: [{ type: 'text', text: 'ultra_permission_denied: operation_denied' }] } };
  const tail = [message, { type: 'agent_end' }];
  assert.equal(consumePiNative(lines([call, ...tail]), lines([ready, decision]), config).failureType, 'permission_denied');
  assert.equal(consumePiNative(lines([{ ...call, isError: false }, ...tail]), lines([ready, decision]), config).failureType, 'pi_native_permission_unobserved');
  assert.equal(consumePiNative(lines([call, ...tail]), lines([ready]), config).failureType, 'pi_native_permission_unobserved');
  assert.equal(consumePiNative(lines(tail), lines([ready, decision]), config).failureType, 'pi_native_permission_unobserved');
});

test('Pi admits only its retained native CLI identity and never an unobserved ACP transport', () => {
  const profile = hostProfile('pi');
  assert.equal(profile.acp, undefined);
  assert.equal(profile.cli.candidateIdentity.runtime_version, '0.85.1');
  const required = requiredPacketEnforcementDimensions({ readOnly: false });
  assert.equal(enforcementAdmission(profile, { required, driver: 'cli' }).route, 'admitted');
  assert.equal(enforcementAdmission(profile, { required, driver: 'acp' }).route, 'unavailable');
  const changed = { ...profile, cli: { candidateIdentity: { ...profile.cli.candidateIdentity, runtime_version: 'future' } } };
  assert.equal(enforcementAdmission(changed, { required, driver: 'cli' }).route, 'unavailable');
  assert.match(profile.enforcement.qualified_identity.native_cli_identity.policy_files_sha256, /^[a-f0-9]{64}$/);
});

test('Pi launch rechecks actual runtime bytes and the immutable permission configuration before spawning', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-pi-binding-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.85.1' }));
  const runtime = path.join(root, 'dist/cli.js');
  const marker = path.join(root, 'spawned');
  fs.writeFileSync(runtime, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  const identity = observePiIdentity(runtime);
  const config = { schema: 'ultra-pi-permission-v1', cwd: root, read_only: false,
    writable_root_paths: [root], native_tools_module: path.join(root, 'dist/core/tools/index.js') };
  const spec = { native_permission: 'pi', native_identity: identity, command: identity.node_path,
    args: [runtime, '--no-extensions', '--no-builtin-tools', '--extension', POLICY_PATH],
    cwd: root, read_only: false, writable_root_paths: [root], env: { [CONFIG_ENV]: JSON.stringify(config) } };
  assert.equal(piNativeIdentityDrift(spec), null);
  for (const invalid of [null, { ...config, read_only: true }, { ...config, writable_root_paths: [] }]) {
    const outcome = await new CliDriver({ ...spec, env: { [CONFIG_ENV]: JSON.stringify(invalid) } }).run();
    assert.equal(outcome.failureType, 'pi_native_identity_changed');
    assert.equal(fs.existsSync(marker), false);
  }
  fs.appendFileSync(runtime, '\n// changed native runtime\n');
  const outcome = await new CliDriver(spec).run();
  assert.equal(outcome.failureType, 'pi_native_identity_changed');
  assert.equal(fs.existsSync(marker), false);
});
