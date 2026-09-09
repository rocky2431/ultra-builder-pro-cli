'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS,
  executionIdentityDrift,
  requiredExecutionIdentity,
} = require('./host-profile.cjs');

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_CAPTURE_LIMIT_BYTES = 4 * 1024 * 1024;
// The one public programming boundary Ultra's ACP transport consumes: the
// thin entry script of an installed agent-delegation runtime whose pinned
// ACPX module owns every generic connection/session/turn concern. Ultra never
// embeds a second ACP protocol implementation; it launches this entry with
// its sanitized descendant environment and answers raw permission requests.
const ACPX_ENTRY_ENV = 'ULTRA_DELEGATE_ACPX_ENTRY';
const WRITER_OBSERVATION_SCHEMA = 'ultra-delegation-writer-v2';
const WRITER_OBSERVATION_PHASES = new Set(['not_started', 'launching', 'started']);
const WRITER_OBSERVATION_FIELDS = Object.freeze([
  '$schema', 'delegation_id', 'launch_id', 'phase', 'pid', 'pgid', 'platform',
  'command', 'argv_digest', 'started_at', 'start_identity',
]);
// Test-scoped deterministic fault injection for the writer-observation
// transition seams. The delegated worker environment is rebuilt from the
// launcher policy and never carries this key, so no installed run path can
// trigger it.
const OBSERVATION_FAULT_ENV = 'UBP_DELEGATE_TEST_FAULT_OBSERVATION';

class AgentExecutionDriver {
  constructor(spec) {
    this.spec = spec;
  }

  async run() {
    throw new Error('AgentExecutionDriver.run() must be implemented by a concrete driver');
  }
}

class BoundedCapture {
  constructor(limitBytes = DEFAULT_CAPTURE_LIMIT_BYTES) {
    if (!Number.isInteger(limitBytes) || limitBytes < 256) {
      throw new Error('capture limit must be an integer of at least 256 bytes');
    }
    this.limitBytes = limitBytes;
    this.buffer = Buffer.alloc(0);
    this.truncated = false;
  }

  append(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (incoming.length >= this.limitBytes) {
      this.buffer = incoming.subarray(incoming.length - this.limitBytes);
      this.truncated = true;
      return;
    }
    if (this.buffer.length + incoming.length <= this.limitBytes) {
      this.buffer = Buffer.concat([this.buffer, incoming]);
      return;
    }
    const keep = this.limitBytes - incoming.length;
    this.buffer = Buffer.concat([this.buffer.subarray(this.buffer.length - keep), incoming]);
    this.truncated = true;
  }

  text() {
    const payload = this.buffer.toString('utf8');
    return this.truncated
      ? `[ultra-delegate: output truncated to ${this.limitBytes} bytes]\n${payload}`
      : payload;
  }

  write(file) {
    fs.writeFileSync(file, this.text(), { mode: 0o600 });
  }
}

function terminateProcessGroup(child, signal = 'SIGTERM', options = {}) {
  if (!child || !child.pid) return;
  const platform = options.platform || process.platform;
  const runSync = options.spawnSync || spawnSync;
  if (platform === 'win32') {
    try {
      const args = ['/PID', String(child.pid), '/T', '/F'];
      const result = runSync('taskkill.exe', args, { stdio: 'ignore', windowsHide: true });
      if (result?.status === 0) return;
    } catch {}
    try { child.kill(signal); } catch {}
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {}
}

function executablePath(command, env = process.env) {
  if (typeof command !== 'string' || !command.trim()) return null;
  const candidates = [];
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    candidates.push(path.resolve(command));
  } else {
    for (const entry of String(env.PATH || '').split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(entry, command));
      if (process.platform === 'win32') {
        for (const extension of String(env.PATHEXT || '.EXE;.CMD;.BAT')
          .split(';').filter(Boolean)) {
          candidates.push(path.join(entry, `${command}${extension.toLowerCase()}`));
          candidates.push(path.join(entry, `${command}${extension.toUpperCase()}`));
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

// Content digests for the execution-identity seam: raw file bytes through the
// standard library, null when the file cannot be read — callers fail closed.
function fileSha256(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

// The file a runtime command actually is: an explicit path must exist as a
// regular file (an interpreted `.cjs` runtime is never required executable);
// a bare command resolves through PATH exactly like the launch does.
function identityFilePath(command, env = process.env) {
  if (typeof command !== 'string' || !command.trim()) return null;
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    try {
      const resolved = path.resolve(command);
      return fs.statSync(resolved).isFile() ? resolved : null;
    } catch {
      return null;
    }
  }
  return executablePath(command, env);
}

// The runtime file a profile declares the adapter itself will consume. Only an
// absolute existing regular file is observable; anything else (a throwing or
// non-path declaration, a file that vanished) is null so the identity seam
// reports it unobserved and fails closed instead of hashing a guess.
function declaredRuntimeFilePath(acp, context) {
  let resolved;
  try {
    resolved = acp.runtimeFilePath(context);
  } catch {
    return null;
  }
  if (typeof resolved !== 'string' || !path.isAbsolute(resolved)) return null;
  try {
    return fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

// The public SDK package the resolved entry actually loads, resolved exactly
// as Node resolves it when the entry runs as the main module: the main script
// is first resolved to its real path (no --preserve-symlinks-main), then
// require('acpx/package.json') walks the node_modules hierarchy upward from
// the entry's real directory, and the located module file is itself realpath'd
// at load time. Mirroring that algorithm binds the package the entry will
// execute — never a sibling that only the lexical spelling suggests. Only
// portable metadata is retained; install absolute paths are not product data.
function resolveAcpxPackage(entryFile) {
  if (typeof entryFile !== 'string' || !entryFile) return null;
  let realEntry;
  try {
    realEntry = fs.realpathSync(entryFile);
  } catch {
    return null;
  }
  let packageJson;
  try {
    packageJson = fs.realpathSync(
      require.resolve('acpx/package.json', { paths: [path.dirname(realEntry)] }),
    );
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  } catch {
    return null;
  }
  return {
    name: payload && typeof payload.name === 'string' ? payload.name : null,
    version: payload && typeof payload.version === 'string' ? payload.version : null,
    package_json_sha256: fileSha256(packageJson),
  };
}

// The Claude SDK package the adapter actually loads, resolved with Node's own
// algorithm from the adapter executable's real directory — the same
// resolution the adapter performs when it requires the SDK. Only portable
// metadata is retained; a package that cannot be resolved observes nothing so
// the identity seam fails closed instead of guessing.
function resolveClaudeSdkPackage(adapterPath) {
  if (typeof adapterPath !== 'string' || !adapterPath) return null;
  let adapterDir;
  try {
    adapterDir = path.dirname(fs.realpathSync(adapterPath));
  } catch {
    return null;
  }
  let modulePath;
  try {
    modulePath = require.resolve('@anthropic-ai/claude-agent-sdk', { paths: [adapterDir] });
  } catch {
    return null;
  }
  let packageDir;
  try {
    packageDir = path.dirname(fs.realpathSync(modulePath));
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  return {
    name: payload && typeof payload.name === 'string' ? payload.name : null,
    version: payload && typeof payload.version === 'string' ? payload.version : null,
    package_json_sha256: fileSha256(path.join(packageDir, 'package.json')),
  };
}

// The actual native permission configuration at one execution root: the
// content digest over the exact declared settings files, read in their fixed
// order. Any missing or unreadable file observes nothing (sha256 null) — an
// execution site without the declared policy never reads as a configuration.
function claudeNativeSettingsObservation(root, relativePaths = CLAUDE_NATIVE_SETTINGS_RELATIVE_PATHS) {
  const files = Array.isArray(relativePaths) ? [...relativePaths] : [];
  if (typeof root !== 'string' || !root || files.length === 0) {
    return { files, sha256: null };
  }
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    try {
      hash.update(fs.readFileSync(path.resolve(root, relative)));
    } catch {
      return { files, sha256: null };
    }
  }
  return { files, sha256: hash.digest('hex') };
}

// The observed execution identity of one selected ACP route: content digests
// of the already-resolved adapter executable, the native runtime file, the
// public entry, and the SDK package the entry actually loads (resolved with
// Node's own algorithm from the entry's real path). Paths may relocate
// between qualification and launch; the content identity is what must match
// the retained qualification facts. A profile that declares additional bound
// components observes them too: the native permission configuration at the
// execution root (`nativeSettingsRoot`, in the fixed file order the contract
// names) and the Claude SDK package resolved from the adapter.
function observeExecutionIdentity({
  adapterPath,
  runtimePath,
  entryPath,
  nativeSettingsRoot,
  claudeSdk,
}) {
  const observed = {
    adapter_sha256: adapterPath ? fileSha256(adapterPath) : null,
    runtime_sha256: runtimePath ? fileSha256(runtimePath) : null,
    acpx_entry_sha256: entryPath ? fileSha256(entryPath) : null,
    acpx_package: entryPath ? resolveAcpxPackage(entryPath) : null,
  };
  if (nativeSettingsRoot !== undefined) {
    const settings = claudeNativeSettingsObservation(nativeSettingsRoot);
    observed.native_settings_files = settings.files;
    observed.native_settings_sha256 = settings.sha256;
  }
  if (claudeSdk) {
    observed.claude_sdk_package = adapterPath ? resolveClaudeSdkPackage(adapterPath) : null;
  }
  return observed;
}

// Launch-time recheck of the execution identity the admission bound into the
// digest-bound worker spec: every component this boundary hands to the OS or
// the adapter — the adapter executable, the native runtime file the adapter
// will consume, the public entry bytes, and the SDK package metadata the entry
// loads — rechecked at the exact resolved paths the selection retained. A
// binding that declares the native permission configuration (the claude
// route) re-derives its digest at the execution `cwd`, and one that declares
// the Claude SDK package re-resolves it from the bound adapter path.
// Returns the drifting component, or null when the observed files still match;
// any non-null result fails the launch closed before a Host effect. A binding
// without the resolved paths is malformed: the launch cannot prove which files
// the OS will consume.
function launchExecutionIdentityDrift(bound, { adapterPath, runtimePath, entryPath, cwd }) {
  if (!bound || typeof bound !== 'object' || Array.isArray(bound)) return 'execution_identity';
  if (typeof bound.adapter_path !== 'string' || !path.isAbsolute(bound.adapter_path)
      || typeof bound.runtime_path !== 'string' || !path.isAbsolute(bound.runtime_path)) {
    return 'execution_identity';
  }
  if (!/^[0-9a-f]{64}$/u.test(String(bound.adapter_sha256 ?? ''))
      || !adapterPath || fileSha256(adapterPath) !== bound.adapter_sha256) return 'adapter';
  if (!/^[0-9a-f]{64}$/u.test(String(bound.runtime_sha256 ?? ''))
      || !runtimePath || fileSha256(runtimePath) !== bound.runtime_sha256) return 'runtime';
  if (!/^[0-9a-f]{64}$/u.test(String(bound.acpx_entry_sha256 ?? ''))
      || fileSha256(entryPath) !== bound.acpx_entry_sha256) return 'acpx_entry';
  const pkg = bound.acpx_package;
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)
      || typeof pkg.name !== 'string' || !pkg.name
      || typeof pkg.version !== 'string' || !pkg.version
      || !/^[0-9a-f]{64}$/u.test(String(pkg.package_json_sha256 ?? ''))) return 'acpx_package';
  const resolved = resolveAcpxPackage(entryPath);
  if (!resolved || resolved.name !== pkg.name || resolved.version !== pkg.version
      || resolved.package_json_sha256 !== pkg.package_json_sha256) return 'acpx_package';
  if (bound.native_settings_sha256 !== undefined) {
    if (!/^[0-9a-f]{64}$/u.test(String(bound.native_settings_sha256 ?? ''))
        || !Array.isArray(bound.native_settings_files)
        || !bound.native_settings_files.every((item) => typeof item === 'string' && item)
        || typeof cwd !== 'string' || !cwd) return 'native_settings';
    const settings = claudeNativeSettingsObservation(cwd, bound.native_settings_files);
    if (!settings.sha256 || settings.sha256 !== bound.native_settings_sha256) {
      return 'native_settings';
    }
  }
  if (bound.claude_sdk_package !== undefined) {
    const sdk = bound.claude_sdk_package;
    if (!sdk || typeof sdk !== 'object' || Array.isArray(sdk)
        || typeof sdk.name !== 'string' || !sdk.name
        || typeof sdk.version !== 'string' || !sdk.version
        || !/^[0-9a-f]{64}$/u.test(String(sdk.package_json_sha256 ?? ''))) return 'claude_sdk_package';
    const resolvedSdk = resolveClaudeSdkPackage(adapterPath);
    if (!resolvedSdk || resolvedSdk.name !== sdk.name || resolvedSdk.version !== sdk.version
        || resolvedSdk.package_json_sha256 !== sdk.package_json_sha256) {
      return 'claude_sdk_package';
    }
  }
  return null;
}

// The final Host environment is rebuilt from the digest-bound spec alone: the
// key names the launcher recorded plus the launcher-authorized spec.env. A
// driver must never merge its own full process.env back into a descendant.
function descendantSpawnEnv(spec) {
  const env = {};
  if (Array.isArray(spec?.env_keys)) {
    for (const key of spec.env_keys) {
      if (typeof key === 'string' && process.env[key] !== undefined) env[key] = process.env[key];
    }
  }
  return Object.assign(env, spec?.env && typeof spec.env === 'object' ? spec.env : {});
}

function writeObservationAtomic(file, payload) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function readWriterObservationFile(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writerIdentity(spec) {
  const delegationId = typeof spec?.delegation_id === 'string' && spec.delegation_id
    ? spec.delegation_id
    : null;
  const launchId = typeof spec?.launch_id === 'string' && spec.launch_id
    ? spec.launch_id
    : null;
  return delegationId && launchId ? { delegationId, launchId } : null;
}

// The exact observation schema plus the delegation/launch identity binding.
// Evidence that does not match this contract proves nothing and must be
// treated as an unknown boundary, never as a stopped one. Each phase also
// carries exact invariants: not_started has no process identity at all,
// launching has command/argv identity but no pid/pgid/start identity, and
// started has a real pid with its detached-POSIX pgid (or a null pgid on
// Windows). An observation in an impossible state proves nothing.
function validateWriterObservation(observation, identity, { platform = process.platform } = {}) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return null;
  const keys = Object.keys(observation);
  if (keys.length !== WRITER_OBSERVATION_FIELDS.length
      || !WRITER_OBSERVATION_FIELDS.every((field) => keys.includes(field))) {
    return null;
  }
  if (observation.$schema !== WRITER_OBSERVATION_SCHEMA) return null;
  if (typeof observation.delegation_id !== 'string' || !observation.delegation_id) return null;
  if (typeof observation.launch_id !== 'string' || !observation.launch_id) return null;
  if (!WRITER_OBSERVATION_PHASES.has(observation.phase)) return null;
  const hasCommandIdentity = typeof observation.command === 'string' && !!observation.command
    && /^[0-9a-f]{64}$/u.test(observation.argv_digest);
  if (observation.phase === 'not_started') {
    if (observation.pid !== null || observation.pgid !== null
        || observation.command !== null || observation.argv_digest !== null
        || observation.start_identity !== null) {
      return null;
    }
  } else if (observation.phase === 'launching') {
    if (observation.pid !== null || observation.pgid !== null
        || observation.start_identity !== null || !hasCommandIdentity) {
      return null;
    }
  } else {
    if (!Number.isInteger(observation.pid) || observation.pid <= 0) return null;
    if (platform === 'win32') {
      if (observation.pgid !== null) return null;
    } else if (observation.pgid !== observation.pid) {
      return null;
    }
    if (!hasCommandIdentity) return null;
  }
  if (!(observation.pgid === null || (Number.isInteger(observation.pgid) && observation.pgid > 0))) {
    return null;
  }
  if (typeof observation.platform !== 'string' || observation.platform !== platform) return null;
  if (!(observation.command === null || typeof observation.command === 'string')) return null;
  if (!(observation.argv_digest === null || /^[0-9a-f]{64}$/u.test(observation.argv_digest))) {
    return null;
  }
  if (typeof observation.started_at !== 'string' || !observation.started_at) return null;
  if (observation.start_identity !== null) {
    const recorded = observation.start_identity;
    if (typeof recorded !== 'object' || Array.isArray(recorded)
        || Object.keys(recorded).length !== 2
        || typeof recorded.type !== 'string' || !recorded.type
        || typeof recorded.value !== 'string' || !recorded.value) {
      return null;
    }
  }
  if (identity) {
    if (observation.delegation_id !== identity.delegationId
        || observation.launch_id !== identity.launchId) {
      return null;
    }
  }
  return observation;
}

// Linux exposes a kernel start time per PID; a stable read makes PID reuse
// distinguishable from a still-running writer. Other platforms carry null and
// rely on the liveness probes alone.
function processStartIdentity(pid, {
  platform = process.platform,
  readFileSync = fs.readFileSync,
} = {}) {
  if (platform === 'linux' && Number.isInteger(pid) && pid > 0) {
    try {
      const stat = String(readFileSync(`/proc/${pid}/stat`, 'utf8'));
      const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const starttime = afterComm[19];
      if (starttime && /^\d+$/.test(starttime)) {
        return { type: 'linux_procfs_starttime', value: starttime };
      }
    } catch {}
  }
  return null;
}

function observationFaultActive(seam) {
  return process.env[OBSERVATION_FAULT_ENV] === seam;
}

function writeObservationPhase(file, {
  identity,
  phase,
  pid = null,
  pgid = null,
  platform = process.platform,
  command = null,
  argv = null,
  startIdentity = null,
  now = () => new Date().toISOString(),
}) {
  const observation = {
    $schema: WRITER_OBSERVATION_SCHEMA,
    delegation_id: identity?.delegationId ?? null,
    launch_id: identity?.launchId ?? null,
    phase,
    pid,
    pgid,
    platform,
    command: typeof command === 'string' ? command : null,
    argv_digest: Array.isArray(argv)
      ? crypto.createHash('sha256').update(JSON.stringify(argv)).digest('hex')
      : null,
    started_at: now(),
    start_identity: startIdentity,
  };
  writeObservationAtomic(file, observation);
  return observation;
}

// The conservative pre-spawn transition: no Host may exist until this phase is
// durably persisted for the exact launch identity. The transition is only
// valid from an existing identity-bound not_started observation — evidence
// from another identity or a skipped phase is refused, never overwritten.
function markWriterLaunching(spec, {
  platform = process.platform,
  now = () => new Date().toISOString(),
} = {}) {
  if (!spec?.writer_observation) return false;
  const identity = writerIdentity(spec);
  if (!identity) return false;
  if (!fs.existsSync(spec.writer_observation)) return false;
  const existing = validateWriterObservation(
    readWriterObservationFile(spec.writer_observation),
    identity,
    { platform },
  );
  if (!existing || existing.phase !== 'not_started') return false;
  if (typeof spec.command !== 'string' || !spec.command
      || !Array.isArray(spec.args) || !spec.args.every((item) => typeof item === 'string')) {
    return false;
  }
  if (observationFaultActive('launching')) return false;
  try {
    const observation = writeObservationPhase(spec.writer_observation, {
      identity,
      phase: 'launching',
      platform,
      command: spec.command,
      argv: spec.args,
      now,
    });
    return validateWriterObservation(observation, identity, { platform }) !== null;
  } catch {
    return false;
  }
}

// The post-spawn transition: once a real child PID exists, the started
// observation must be durably persisted or the caller must treat the launch as
// unobservable. Only a valid identity-bound launching observation may advance.
function observeWriterStart(spec, child, {
  now = () => new Date().toISOString(),
  platform = process.platform,
  readFileSync = fs.readFileSync,
} = {}) {
  if (!spec?.writer_observation || !child || !Number.isInteger(child.pid) || child.pid <= 0) {
    return null;
  }
  const identity = writerIdentity(spec);
  if (!identity) return null;
  if (!fs.existsSync(spec.writer_observation)) return null;
  const existing = validateWriterObservation(
    readWriterObservationFile(spec.writer_observation),
    identity,
    { platform },
  );
  if (!existing || existing.phase !== 'launching') return null;
  if (observationFaultActive('started')) return null;
  try {
    const observation = writeObservationPhase(spec.writer_observation, {
      identity,
      phase: 'started',
      pid: child.pid,
      // Both drivers launch the Host detached, so on POSIX the child is its own
      // process-group leader and the group id equals the pid.
      pgid: platform === 'win32' ? null : child.pid,
      platform,
      command: typeof spec.command === 'string' ? spec.command : null,
      argv: Array.isArray(spec.args) ? spec.args : null,
      startIdentity: processStartIdentity(child.pid, { platform, readFileSync }),
      now,
    });
    return validateWriterObservation(observation, identity, { platform });
  } catch {
    return null;
  }
}

// The explicit proven-safe restoration to not_started: an OS-confirmed spawn
// failure with no child PID, or a proven-stopped boundary before a relaunch.
// It is a caller-owned truth decision, never a default transition.
function rewindWriterNotStarted(spec, {
  platform = process.platform,
  allowedPriorPhases = ['launching'],
  now = () => new Date().toISOString(),
} = {}) {
  if (!spec?.writer_observation) return false;
  const identity = writerIdentity(spec);
  if (!identity) return false;
  if (!fs.existsSync(spec.writer_observation)) return false;
  const existing = validateWriterObservation(
    readWriterObservationFile(spec.writer_observation),
    identity,
    { platform },
  );
  if (!existing || !allowedPriorPhases.includes(existing.phase)) return false;
  try {
    const observation = writeObservationPhase(spec.writer_observation, {
      identity,
      phase: 'not_started',
      platform,
      now,
    });
    return validateWriterObservation(observation, identity, { platform }) !== null;
  } catch {
    return false;
  }
}

// One conservative signal outcome for every liveness consumer: 'alive' when
// the target is signalable or proven to exist (EPERM), 'dead' only for the
// kernel's ESRCH, and 'unknown' for any other unprovable signal outcome. No
// consumer may treat 'unknown' as death, because that would release a writer
// boundary whose target may still exist.
function signalOutcome(target, kill = process.kill) {
  try {
    kill(target, 0);
    return 'alive';
  } catch (error) {
    if (error && error.code === 'ESRCH') return 'dead';
    if (error && error.code === 'EPERM') return 'alive';
    return 'unknown';
  }
}

// Proven death is exactly ESRCH. EPERM proves the target exists but is not
// signalable by us, and any other signal outcome is unprovable; neither may
// ever read as death, because a wrongly-dead probe would release the writer
// boundary while the target may still exist.
function probeProcessAlive(target, kill = process.kill) {
  return signalOutcome(target, kill) !== 'dead';
}

// stopped requires an explicit valid not_started observation or a started
// observation whose writer and process group are gone with a matching start
// identity. Missing, unreadable, invalid, mismatched, or launching evidence is
// unknown — never proof of a stop.
function deriveWriterState(observation, {
  platform = process.platform,
  kill = process.kill,
  readFileSync = fs.readFileSync,
  identity = null,
} = {}) {
  const validated = validateWriterObservation(observation, identity, { platform });
  if (!validated) return 'unknown';
  if (validated.phase === 'not_started') return 'stopped';
  if (validated.phase === 'launching') return 'unknown';
  if (probeProcessAlive(validated.pid, kill)) {
    const recorded = validated.start_identity && typeof validated.start_identity === 'object'
      && !Array.isArray(validated.start_identity)
      ? validated.start_identity
      : null;
    if (recorded) {
      const current = processStartIdentity(validated.pid, { platform, readFileSync });
      if (!current || current.type !== recorded.type || current.value !== recorded.value) {
        return 'unknown';
      }
    }
    return 'alive';
  }
  if (Number.isInteger(validated.pgid) && validated.pgid > 0
      && probeProcessAlive(-validated.pgid, kill)) {
    return 'unknown';
  }
  return 'stopped';
}

function capability(acp, probe = {}) {
  return {
    candidate: !!acp,
    surface: acp?.surface || null,
    transport: acp?.transport || null,
    protocol_versions: Array.isArray(acp?.protocolVersions) ? [...acp.protocolVersions] : [],
    conformance_status: acp?.conformance?.status || 'not_available',
    conformance_evidence: acp?.conformance?.evidence || null,
    conformance_reason: acp?.conformance?.reason || null,
    executable_available: probe.executableAvailable ?? null,
    acp_entry_available: probe.acpEntryAvailable ?? null,
    candidate_valid: probe.candidateValid ?? null,
    candidate_identity_valid: probe.candidateIdentityValid ?? null,
    candidate_identity_reason: probe.candidateIdentityReason ?? null,
    candidate_identity_fallback_reason: probe.candidateIdentityFallbackReason ?? null,
  };
}

function cliSelection(cliCommand, acp, fallbackReason, probe) {
  return {
    driver: 'cli',
    command: cliCommand,
    args: null,
    protocolVersion: null,
    fallbackReason,
    acpCapability: capability(acp, probe),
  };
}

function inspectCandidateIdentity(acp, context, runCandidateProbe) {
  if (typeof acp.identityProbes !== 'function') {
    return { valid: null, reason: null, fallbackReason: null };
  }
  let probes;
  try {
    probes = acp.identityProbes(context);
  } catch {
    return {
      valid: false,
      reason: 'identity_probe_definition',
      fallbackReason: 'acp_candidate_identity_unavailable',
    };
  }
  if (!Array.isArray(probes) || probes.length === 0) {
    return {
      valid: false,
      reason: 'identity_probe_definition',
      fallbackReason: 'acp_candidate_identity_unavailable',
    };
  }
  for (const probe of probes) {
    if (!probe || typeof probe.label !== 'string' || !probe.label
        || typeof probe.command !== 'string' || !probe.command
        || !Array.isArray(probe.args) || !probe.args.every((item) => typeof item === 'string')
        || typeof probe.expectedStdout !== 'string' || !probe.expectedStdout) {
      return {
        valid: false,
        reason: 'identity_probe_definition',
        fallbackReason: 'acp_candidate_identity_unavailable',
      };
    }
    let result;
    try {
      result = runCandidateProbe(probe.command, probe.args, {
        encoding: 'utf8',
        env: context.env,
        maxBuffer: 64 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
        windowsHide: true,
      });
    } catch {
      return {
        valid: false,
        reason: probe.label,
        fallbackReason: 'acp_candidate_identity_unavailable',
      };
    }
    if (result?.error || result?.status !== 0) {
      return {
        valid: false,
        reason: probe.label,
        fallbackReason: 'acp_candidate_identity_unavailable',
      };
    }
    if (String(result.stdout || '').trim() !== probe.expectedStdout) {
      return {
        valid: false,
        reason: probe.label,
        fallbackReason: 'acp_candidate_identity_mismatch',
      };
    }
  }
  return { valid: true, reason: null, fallbackReason: null };
}

function selectExecutionDriver({
  host,
  profile,
  cliCommand,
  env = process.env,
  cwd,
  runCandidateProbe = spawnSync,
}) {
  const acp = profile?.acp;
  if (!acp) {
    const selected = cliSelection(cliCommand, null, 'acp_not_available');
    if (profile?.nativePermission === 'pi') {
      const { selectPiNative } = require('./pi-native-runtime.cjs');
      const native = selectPiNative(executablePath(cliCommand, env), env, profile);
      return { ...selected, command: native.node_path, nativeSelection: native };
    }
    return selected;
  }
  if (env.ULTRA_DELEGATE_FORCE_CLI === '1') {
    return cliSelection(cliCommand, acp, 'acp_forced_cli');
  }
  // One selection resolution per launch: when the profile declares
  // resolveSelection, the registry-backed candidate is resolved exactly once
  // here and every consumer below — the candidate command/argv, the identity
  // probes, the declared runtime file, and the launcher delegate env through
  // the returned binding — reuses this exact result. An ordinary registry
  // update between selection and launch therefore either still executes the
  // originally bound files or refuses typed; it can never mix two bindings
  // (hash one adapter/native pair while launching another).
  let selection;
  let selectionError = null;
  if (typeof acp.resolveSelection === 'function') {
    try {
      selection = acp.resolveSelection({ host, cliCommand, env });
    } catch (error) {
      selectionError = error;
    }
  }
  // A retained qualification whose declared strings match this candidate binds
  // the observed execution bytes. When that binding is engaged, every consumer
  // of the runtime command — the candidate argv the adapter will receive and
  // the identity probes — works over the exact resolved file the selection is
  // about to hash, so a bare or relative command can never resolve to
  // different bytes between selection and the detached launch. Routes without
  // a string-matching record keep the caller's spelling unchanged.
  const requiredIdentity = requiredExecutionIdentity(profile);
  let boundRuntimePath = null;
  if (requiredIdentity) {
    // A profile may declare the native runtime file the adapter itself
    // consumes through its own binding (the managed-registry claude route):
    // that file is what the byte binding must hash, because the
    // PATH-spelled CLI command can name different bytes than the adapter
    // will actually launch. An unresolvable declaration observes nothing
    // and fails closed through the same typed identity seam.
    boundRuntimePath = typeof acp.runtimeFilePath === 'function'
      ? declaredRuntimeFilePath(acp, { host, cliCommand, env, selection })
      : identityFilePath(cliCommand, env);
  }
  const candidateCliCommand = boundRuntimePath ?? cliCommand;
  let command;
  let args;
  let candidateValid = true;
  try {
    if (selectionError) throw selectionError;
    command = typeof acp.command === 'function'
      ? acp.command({ host, cliCommand: candidateCliCommand, env, selection })
      : acp.command;
    args = typeof acp.argv === 'function'
      ? acp.argv({ host, cliCommand: candidateCliCommand, env, selection })
      : acp.argv;
    candidateValid = typeof command === 'string' && command.trim()
      && Array.isArray(args) && args.every((item) => typeof item === 'string');
  } catch {
    candidateValid = false;
  }
  const adapterPath = candidateValid ? executablePath(command, env) : null;
  const probe = {
    candidateValid: !!candidateValid,
    executableAvailable: !!adapterPath,
  };
  if (acp.transport !== 'stdio') {
    return cliSelection(cliCommand, acp, 'acp_stdio_unavailable', probe);
  }
  if (!Array.isArray(acp.protocolVersions) || !acp.protocolVersions.includes(ACP_PROTOCOL_VERSION)) {
    return cliSelection(cliCommand, acp, 'acp_v1_unavailable', probe);
  }
  if (acp.conformance?.status !== 'passed') {
    return cliSelection(cliCommand, acp, 'acp_conformance_not_passed', probe);
  }
  if (typeof acp.conformance.evidence !== 'string' || !acp.conformance.evidence.trim()) {
    return cliSelection(cliCommand, acp, 'acp_conformance_evidence_missing', probe);
  }
  if (!candidateValid) {
    return cliSelection(cliCommand, acp, 'acp_candidate_invalid', probe);
  }
  if (!probe.executableAvailable) {
    return cliSelection(cliCommand, acp, 'acp_command_unavailable', probe);
  }
  // The generic ACP engine is the installed public entry: without it no ACP
  // transport exists at all, and the selection reports the exact typed reason
  // rather than launching a worker that could only fail after the fact.
  const acpEntryPath = resolveAcpEntry(env);
  probe.acpEntryAvailable = !!acpEntryPath;
  if (!probe.acpEntryAvailable) {
    return cliSelection(cliCommand, acp, 'acp_entry_unavailable', probe);
  }
  const identity = inspectCandidateIdentity(acp, {
    host, command, args, cliCommand: candidateCliCommand, env, selection,
  }, runCandidateProbe);
  probe.candidateIdentityValid = identity.valid;
  probe.candidateIdentityReason = identity.reason;
  probe.candidateIdentityFallbackReason = identity.fallbackReason;
  if (identity.fallbackReason) {
    return cliSelection(cliCommand, acp, identity.fallbackReason, probe);
  }
  // The one public entry this selection resolved is bound into the launch by
  // content: the worker reuses and rechecks exactly it instead of resolving
  // anew. An unreadable entry is unavailable, never silently substituted.
  const acpEntrySha256 = fileSha256(acpEntryPath);
  if (!acpEntrySha256) {
    return cliSelection(cliCommand, acp, 'acp_entry_unavailable', probe);
  }
  // A retained qualification whose declared strings match this candidate may
  // admit the ACP route only over the observed execution bytes: every
  // fingerprint the record binds must be observed identically now — including
  // the host-declared components beyond the generic four (the claude route
  // binds the native permission configuration at the execution root and the
  // Claude SDK package the adapter loads), so a site with missing or changed
  // native policy, or a changed SDK inside the same adapter/native versions,
  // never inherits a qualified result. A missing binding, an unreadable file,
  // or drifted content fails closed through the same typed candidate-identity
  // seam — a positive record never rests on two declared strings alone. The
  // verified binding also retains the exact resolved adapter and runtime
  // paths that were hashed, so the detached launch consumes and rechecks
  // those same paths instead of re-resolving a bare or relative command
  // against another cwd.
  let executionIdentity = null;
  if (requiredIdentity) {
    const observed = observeExecutionIdentity({
      adapterPath,
      runtimePath: boundRuntimePath,
      entryPath: acpEntryPath,
      ...(requiredIdentity.native_settings_sha256 !== undefined ? { nativeSettingsRoot: cwd } : {}),
      ...(requiredIdentity.claude_sdk_package !== undefined ? { claudeSdk: true } : {}),
    });
    const drift = executionIdentityDrift(requiredIdentity, observed);
    if (drift) {
      probe.candidateIdentityValid = false;
      probe.candidateIdentityReason = drift.component;
      probe.candidateIdentityFallbackReason = drift.reason === 'mismatch'
        ? 'acp_candidate_identity_mismatch'
        : 'acp_candidate_identity_unavailable';
      return cliSelection(cliCommand, acp, probe.candidateIdentityFallbackReason, probe);
    }
    executionIdentity = Object.freeze({
      ...observed,
      acpx_package: Object.freeze(observed.acpx_package),
      ...(observed.claude_sdk_package ? { claude_sdk_package: Object.freeze(observed.claude_sdk_package) } : {}),
      adapter_path: adapterPath,
      runtime_path: boundRuntimePath,
    });
  }
  return {
    driver: 'acp',
    command,
    args,
    protocolVersion: ACP_PROTOCOL_VERSION,
    fallbackReason: null,
    acpCapability: capability(acp, probe),
    acpEntry: Object.freeze({ path: acpEntryPath, sha256: acpEntrySha256 }),
    // The one selection resolution this launch consumed; the launcher threads
    // it into the worker spec env so spec.env carries the exact native
    // binding these command/argv/probes came from.
    ...(selection !== undefined ? { acpSelection: selection } : {}),
    ...(executionIdentity ? { executionIdentity } : {}),
  };
}

// The managed agent-delegation registry: one JSON object at
// ~/.config/agent-delegation/config.json whose `acpx_delegate_entry` key
// publishes the absolute entry of the runtime generation the installer
// selected. A registry without the key — or one that cannot be read as a JSON
// object at all — carries no binding; a present binding is authoritative and
// must be an absolute path to an existing regular file.
function registryAcpEntry(home) {
  let registry;
  try {
    registry = JSON.parse(
      fs.readFileSync(path.join(home, '.config', 'agent-delegation', 'config.json'), 'utf8'),
    );
  } catch {
    return { bound: false, entry: null };
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return { bound: false, entry: null };
  }
  const value = registry.acpx_delegate_entry;
  if (value === undefined || value === null) return { bound: false, entry: null };
  if (typeof value !== 'string' || !path.isAbsolute(value)) return { bound: true, entry: null };
  try {
    if (fs.statSync(value).isFile()) return { bound: true, entry: value };
  } catch {}
  return { bound: true, entry: null };
}

// Resolves the public ACPX delegate entry: an explicit absolute override first
// (selection control, tests, and exact-version pinning), then the entry the
// managed agent-delegation installer published in its registry, then the one
// legacy fixed install location for runtimes installed before the registry
// binding existed. An invalid explicit selection — or a present but broken
// registry binding — resolves to null so callers fail closed with a typed
// reason instead of silently substituting another runtime.
function resolveAcpEntry(env = process.env, {
  platform = process.platform,
  home = os.homedir(),
  exists = fs.existsSync,
} = {}) {
  const override = env[ACPX_ENTRY_ENV];
  if (typeof override === 'string' && path.isAbsolute(override)) {
    try {
      if (exists(override) && fs.statSync(override).isFile()) return override;
    } catch {}
    return null;
  }
  if (typeof override === 'string' && override) return null;
  const published = registryAcpEntry(home);
  if (published.bound) return published.entry;
  // The pre-registry managed installer wrote one platform-independent share
  // root under HOME; the resolver mirrors that exact location.
  const installed = path.join(
    home, '.local', 'share', 'agent-delegation', 'runtime', 'acpx_delegate_entry.cjs',
  );
  try {
    if (exists(installed) && fs.statSync(installed).isFile()) return installed;
  } catch {}
  return null;
}

// The one launch-bound writer-boundary view consumed by launch decisions
// (the ACP-to-CLI fallback): missing evidence is unknown, never stopped.
function launchBoundWriterState(spec) {
  return spec?.writer_observation && fs.existsSync(spec.writer_observation)
    ? deriveWriterState(readWriterObservationFile(spec.writer_observation), {
      identity: writerIdentity(spec),
    })
    : 'unknown';
}

async function runExecutionDriver(spec) {
  if (spec.execution_driver === 'acp') {
    const { AcpDriver } = require('./acp-driver.cjs');
    const acpResult = await new AcpDriver(spec).run();
    const fallback = spec.cli_fallback;
    // Only an authentication failure proven pre-prompt — the entry's
    // structured ensure_session phase, which means startTurn was never
    // called — may fall back once to the CLI. Any later auth-shaped failure
    // kept its typed result but stays unretried: work may already exist.
    if (acpResult.failureType === 'acp_auth_required'
        && acpResult.failurePhase === 'ensure_session'
        && fallback && typeof fallback.command === 'string'
        && Array.isArray(fallback.args)) {
      // The fallback is a second Host launch on the same root. It may only
      // start once the first ACP boundary is proven stopped; an alive or
      // unprovable boundary keeps the outcome unknown and the fence retained.
      const boundary = launchBoundWriterState(spec);
      if (boundary !== 'stopped') {
        return {
          ...acpResult,
          failureType: 'outcome_unknown',
          failureSummary: `ACP authentication fallback was blocked: the first ACP launch boundary is ${boundary}; the CLI fallback was not started and the worktree fence is retained.`,
        };
      }
      // The proven-stopped first boundary is explicitly restored to
      // not_started so the second launch traverses the full valid transition.
      if (!rewindWriterNotStarted(spec, { allowedPriorPhases: ['started'] })) {
        return {
          ...acpResult,
          failureType: 'outcome_unknown',
          failureSummary: 'ACP authentication fallback was blocked: the stopped first boundary could not be restored to a not_started proof; the CLI fallback was not started and the worktree fence is retained.',
        };
      }
      const { CliDriver } = require('./cli-driver.cjs');
      const cliResult = await new CliDriver({
        ...spec,
        execution_driver: 'cli',
        command: fallback.command,
        args: fallback.args,
      }).run();
      return {
        ...cliResult,
        executionDriver: 'cli',
        fallbackReason: 'acp_auth_required',
        protocolVersion: acpResult.protocolVersion,
        stopReason: acpResult.stopReason,
        adapterExitCode: acpResult.adapterExitCode,
        adapterExitSignal: acpResult.adapterExitSignal,
        acpFallback: {
          reason: 'acp_auth_required',
          prompt_sent: false,
          protocol_version: acpResult.protocolVersion,
          adapter_exit_code: acpResult.adapterExitCode,
          adapter_exit_signal: acpResult.adapterExitSignal,
          transport_surface: spec.transport_surface,
        },
        transportSurface: fallback.transport_surface || spec.transport_surface,
      };
    }
    return acpResult;
  }
  if (spec.execution_driver === 'cli' || spec.execution_driver === undefined) {
    const { CliDriver } = require('./cli-driver.cjs');
    return new CliDriver(spec).run();
  }
  throw new Error(`unsupported execution driver: ${spec.execution_driver}`);
}

module.exports = {
  ACP_PROTOCOL_VERSION,
  ACPX_ENTRY_ENV,
  AgentExecutionDriver,
  BoundedCapture,
  DEFAULT_CAPTURE_LIMIT_BYTES,
  WRITER_OBSERVATION_SCHEMA,
  claudeNativeSettingsObservation,
  deriveWriterState,
  descendantSpawnEnv,
  executablePath,
  fileSha256,
  identityFilePath,
  inspectCandidateIdentity,
  launchBoundWriterState,
  launchExecutionIdentityDrift,
  markWriterLaunching,
  observeExecutionIdentity,
  observeWriterStart,
  processStartIdentity,
  probeProcessAlive,
  resolveAcpEntry,
  resolveAcpxPackage,
  resolveClaudeSdkPackage,
  signalOutcome,
  readWriterObservationFile,
  rewindWriterNotStarted,
  runExecutionDriver,
  selectExecutionDriver,
  terminateProcessGroup,
  validateWriterObservation,
  writeObservationPhase,
  writerIdentity,
};
