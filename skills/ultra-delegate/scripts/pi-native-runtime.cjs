'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE = '@earendil-works/pi-coding-agent';
const CONFIG_ENV = 'UBP_PI_PERMISSION_CONFIG';
const POLICY_PATH = path.join(__dirname, 'pi-native-permissions.cjs');
const NATIVE_TOOLS = ['bash', 'edit', 'find', 'grep', 'ls', 'powershell', 'read', 'write'];
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileDigest = (file) => digest(fs.readFileSync(file));

function unavailable(message) {
  const error = new Error(`pi_native_unavailable: ${message}`);
  error.code = 'pi_native_unavailable';
  return error;
}

function observePiIdentity(runtimePath, nodePath = process.execPath) {
  const runtime = fs.realpathSync(runtimePath);
  let packageRoot = path.dirname(runtime);
  while (!fs.existsSync(path.join(packageRoot, 'package.json'))) {
    const parent = path.dirname(packageRoot);
    if (parent === packageRoot) throw unavailable('the selected Pi executable has no installed package');
    packageRoot = parent;
  }
  const manifest = path.join(packageRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (pkg.name !== PACKAGE) throw unavailable(`the selected executable is not the installed ${PACKAGE} package`);
  const dist = path.join(packageRoot, 'dist');
  const runtimeFiles = fs.readdirSync(dist, { recursive: true })
    .filter((name) => /\.(?:cjs|mjs|js|json)$/u.test(name)).sort()
    .map((name) => [name.split(path.sep).join('/'), fileDigest(path.join(dist, name))]);
  const policyFiles = ['pi-native-permissions.cjs', 'pi-native-runtime.cjs',
    'acp-driver.cjs', 'agent-execution-driver.cjs', 'cli-driver.cjs',
    'delegate.cjs', 'delegate-worker.cjs']
    .map((name) => [name, fileDigest(path.join(__dirname, name))]);
  return {
    runtime_path: runtime,
    node_path: fs.realpathSync(nodePath),
    package_root: packageRoot,
    policy_path: POLICY_PATH,
    fingerprint: {
      platform: process.platform, runtime_version: pkg.version,
      node_sha256: fileDigest(nodePath), runtime_sha256: fileDigest(runtime),
      package_sha256: fileDigest(manifest),
      runtime_files_sha256: digest(JSON.stringify(runtimeFiles)),
      policy_files_sha256: digest(JSON.stringify(policyFiles)),
    },
  };
}

function selectPiNative(runtimePath, env, profile) {
  try {
    const bound = observePiIdentity(runtimePath);
    const version = spawnSync(bound.node_path, [bound.runtime_path, '--version'], {
      env, encoding: 'utf8', timeout: 5000,
    });
    if (version.status !== 0 || version.stdout.trim() !== bound.fingerprint.runtime_version
        || bound.fingerprint.runtime_version !== profile.cli.candidateIdentity.runtime_version) {
      throw unavailable('the actual Pi version differs from the selected candidate');
    }
    if (profile.enforcement) {
      const expected = profile.enforcement.qualified_identity?.native_cli_identity;
      if (JSON.stringify(expected) !== JSON.stringify(bound.fingerprint)) {
        throw unavailable('the current Pi runtime or permission code does not match its qualification');
      }
    }
    return bound;
  } catch (error) {
    if (error.code === 'pi_native_unavailable') throw error;
    throw unavailable(error.message);
  }
}

function piNativeIdentityDrift(spec) {
  try {
    const bound = spec.native_identity;
    if (!bound || spec.command !== bound.node_path || spec.args[0] !== bound.runtime_path
        || spec.args[spec.args.indexOf('--extension') + 1] !== POLICY_PATH
        || !spec.args.includes('--no-builtin-tools') || !spec.args.includes('--no-extensions')) {
      return 'missing or changed native launch binding';
    }
    const observed = observePiIdentity(bound.runtime_path, bound.node_path);
    if (JSON.stringify(observed) !== JSON.stringify(bound)) return 'native runtime or permission source changed';
    const config = JSON.parse(spec.env?.[CONFIG_ENV] || 'null');
    if (!config || config.schema !== 'ultra-pi-permission-v1'
        || config.cwd !== spec.cwd || config.read_only !== spec.read_only
        || JSON.stringify(config.writable_root_paths) !== JSON.stringify(spec.writable_root_paths)
        || config.native_tools_module !== path.join(bound.package_root, 'dist/core/tools/index.js')) {
      return 'native policy does not match the immutable permission envelope';
    }
    return null;
  } catch (error) { return error.message; }
}

function readLines(text) {
  return text.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function consumePiNative(stdout, stderr, config) {
  let events;
  try {
    events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (events.some((event) => !event || typeof event !== 'object' || Array.isArray(event))) throw new Error('invalid event');
  } catch {
    return { failureType: 'pi_native_incomplete', failureSummary: 'The native Pi event stream is incomplete or malformed.' };
  }
  const policy = readLines(stderr).filter((event) => event?.type === 'ultra_pi_permission');
  const ready = policy.filter((event) => event.phase === 'ready');
  if (ready.length !== 1 || ready[0].config_digest !== digest(config)
      || !Array.isArray(ready[0].tools)
      || JSON.stringify([...ready[0].tools].sort()) !== JSON.stringify(NATIVE_TOOLS)) {
    return { failureType: 'pi_native_policy_unavailable', failureSummary: 'The bound Pi permission handler and complete native tool inventory were not observed.' };
  }
  const decisions = policy.filter((event) => event.phase === 'decision');
  const calls = events.filter((event) => event.type === 'tool_execution_end');
  const starts = events.filter((event) => event.type === 'tool_execution_start');
  // Native Pi emits agent_settled after flushing the terminal extension hooks.
  const terminalEvent = events.at(-1)?.type === 'agent_settled' ? events.at(-2) : events.at(-1);
  if (terminalEvent?.type !== 'agent_end'
      || starts.some((start) => !calls.some((call) => call.toolCallId === start.toolCallId
        && call.toolName === start.toolName && events.indexOf(call) > events.indexOf(start)))) {
    return { failureType: 'pi_native_incomplete', failureSummary: 'Pi ended without completing its latest turn or native tool call.' };
  }
  if (decisions.length !== calls.length
      || decisions.some((event) => typeof event.tool_call_id !== 'string' || !event.tool_call_id)
      || calls.some((event) => typeof event.toolCallId !== 'string' || !event.toolCallId)
      || new Set(decisions.map((event) => event.tool_call_id)).size !== decisions.length
      || new Set(calls.map((event) => event.toolCallId)).size !== calls.length) {
    return { failureType: 'pi_native_permission_unobserved', failureSummary: 'Native Pi requests and completions do not have a one-to-one permission observation.' };
  }
  for (const call of calls) {
    const decision = decisions.find((item) => item.tool_call_id === call.toolCallId && item.tool_name === call.toolName);
    if (!decision || !['allow_once', 'reject_once'].includes(decision.decision)
        || !/^[0-9a-f]{64}$/u.test(decision.input_digest)
        || (decision.decision === 'reject_once' && (call.isError !== true
          || !Array.isArray(call.result?.content)
          || !call.result.content.some((item) => item?.type === 'text'
            && item.text === `ultra_permission_denied: ${decision.scope}`)))) {
      return { failureType: 'pi_native_permission_unobserved', failureSummary: 'A native Pi tool completion has no matching enforced permission decision.' };
    }
  }
  const messages = events.filter((event) => event.type === 'message_end' && event.message?.role === 'assistant');
  const message = messages.at(-1)?.message;
  const terminal = {
    session_id: events.find((event) => event.type === 'session')?.id ?? null,
    provider: message?.provider ?? null, model: message?.model ?? null,
    stop_reason: message?.stopReason ?? null,
  };
  if (!message || message.stopReason !== 'stop' || message.errorMessage || !Array.isArray(message.content)
      || message.content.some((item) => !item || typeof item !== 'object'
        || (item.type === 'text' && typeof item.text !== 'string'))
      || events.some((event) => event.type === 'error')
      || !events.some((event) => event.type === 'agent_end')) {
    return { nativeTerminal: terminal, failureType: 'pi_native_incomplete', failureSummary: message?.errorMessage || 'Pi has no normal terminal for the submitted mission.' };
  }
  const result = {
    nativeTerminal: terminal, permissionEvents: policy,
    assistantText: message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n'),
  };
  if (decisions.some((event) => event.decision === 'reject_once')) {
    return { ...result, failureType: 'permission_denied', failureSummary: 'Pi completed the bounded turn with one or more locally denied effects.' };
  }
  return result;
}

module.exports = { CONFIG_ENV, POLICY_PATH, consumePiNative, observePiIdentity, piNativeIdentityDrift, selectPiNative };
