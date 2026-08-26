'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_CAPTURE_LIMIT_BYTES = 4 * 1024 * 1024;

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

async function runExecutionDriver(spec) {
  if (spec.execution_driver === 'acp') {
    const { AcpDriver } = require('./acp-driver.cjs');
    const acpResult = await new AcpDriver(spec).run();
    const fallback = spec.cli_fallback;
    if (acpResult.failureType === 'acp_auth_required'
        && fallback && typeof fallback.command === 'string'
        && Array.isArray(fallback.args)) {
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
  AgentExecutionDriver,
  BoundedCapture,
  DEFAULT_CAPTURE_LIMIT_BYTES,
  executablePath,
  inspectCandidateIdentity,
  runExecutionDriver,
  selectExecutionDriver,
  terminateProcessGroup,
};
