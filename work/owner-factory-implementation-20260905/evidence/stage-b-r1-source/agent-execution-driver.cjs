'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  runCandidateProbe = spawnSync,
}) {
  const acp = profile?.acp;
  if (!acp) return cliSelection(cliCommand, null, 'acp_not_available');
  if (env.ULTRA_DELEGATE_FORCE_CLI === '1') {
    return cliSelection(cliCommand, acp, 'acp_forced_cli');
  }
  let command;
  let args;
  let candidateValid = true;
  try {
    command = typeof acp.command === 'function'
      ? acp.command({ host, cliCommand, env })
      : acp.command;
    args = typeof acp.argv === 'function'
      ? acp.argv({ host, cliCommand, env })
      : acp.argv;
    candidateValid = typeof command === 'string' && command.trim()
      && Array.isArray(args) && args.every((item) => typeof item === 'string');
  } catch {
    candidateValid = false;
  }
  const probe = {
    candidateValid: !!candidateValid,
    executableAvailable: candidateValid ? !!executablePath(command, env) : false,
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
  probe.acpEntryAvailable = !!resolveAcpEntry(env);
  if (!probe.acpEntryAvailable) {
    return cliSelection(cliCommand, acp, 'acp_entry_unavailable', probe);
  }
  const identity = inspectCandidateIdentity(acp, {
    host, command, args, cliCommand, env,
  }, runCandidateProbe);
  probe.candidateIdentityValid = identity.valid;
  probe.candidateIdentityReason = identity.reason;
  probe.candidateIdentityFallbackReason = identity.fallbackReason;
  if (identity.fallbackReason) {
    return cliSelection(cliCommand, acp, identity.fallbackReason, probe);
  }
  return {
    driver: 'acp',
    command,
    args,
    protocolVersion: ACP_PROTOCOL_VERSION,
    fallbackReason: null,
    acpCapability: capability(acp, probe),
  };
}

// Resolves the public ACPX delegate entry: an explicit absolute override first
// (selection control, tests, and exact-version pinning), then the one default
// install location of the managed agent-delegation runtime. Anything else —
// missing, relative, or unreadable — resolves to null so callers fail closed
// with a typed reason instead of silently widening the transport.
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
  // The managed agent-delegation installer writes one platform-independent
  // share root under HOME; the resolver mirrors that exact location.
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
  deriveWriterState,
  descendantSpawnEnv,
  executablePath,
  inspectCandidateIdentity,
  launchBoundWriterState,
  markWriterLaunching,
  observeWriterStart,
  processStartIdentity,
  probeProcessAlive,
  resolveAcpEntry,
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
