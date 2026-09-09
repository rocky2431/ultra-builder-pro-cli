#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  deriveWriterState,
  processStartIdentity,
  readWriterObservationFile,
  runExecutionDriver,
} = require('./agent-execution-driver.cjs');
const { fenceHeldForLaunch, releaseWorktreeFence } = require('./delegate.cjs');

const RESULT_SCHEMA = 'ultra-delegation-result-v1';
const PROTECTED_ROOT = '.ultra';
const MODEL_FIELDS = new Set([
  '$schema', 'status', 'summary', 'changed_files', 'checks', 'evidence',
  'questions', 'residual_risks',
]);

function writeAtomic(file, payload) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function sha256(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

function git(cwd, args, { binary = false } = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: binary ? 'buffer' : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function zeroSeparated(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function normalizeChangedPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) {
    return null;
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return null;
  }
  return normalized;
}

function changedFiles(spec) {
  const tracked = zeroSeparated(git(spec.cwd, [
    'diff', '--name-only', '-z', spec.base_head, '--',
  ], { binary: true }));
  const untracked = zeroSeparated(git(spec.cwd, [
    'ls-files', '--others', '--exclude-standard', '-z',
  ], { binary: true }));
  return [...new Set([...tracked, ...untracked]
    .map((item) => item.split(path.sep).join('/')))]
    .sort();
}

function parseJson(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1];
  try { return JSON.parse(text); } catch { return null; }
}

function parseFencedJson(value) {
  if (typeof value !== 'string') return [];
  const parsed = [];
  const fences = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  for (const match of value.matchAll(fences)) {
    try { parsed.push(JSON.parse(match[1])); } catch {}
  }
  return parsed;
}

function collectResultCandidates(value, candidates, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const parsed = parseJson(value);
    if (parsed !== null) collectResultCandidates(parsed, candidates, depth + 1);
    for (const fenced of parseFencedJson(value)) {
      collectResultCandidates(fenced, candidates, depth + 1);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectResultCandidates(item, candidates, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (value.$schema === RESULT_SCHEMA) candidates.push(value);
  for (const nested of Object.values(value)) {
    collectResultCandidates(nested, candidates, depth + 1);
  }
}

function extractModelResult(spec) {
  const candidates = [];
  // Pi publishes only the reconciled final assistant message to host_output;
  // an earlier echoed result or tool payload in its native trace is not a result.
  const resultFiles = spec.native_permission === 'pi' ? [spec.host_output] : [spec.host_output, spec.stdout];
  for (const file of resultFiles) {
    if (!file || !fs.existsSync(file) || fs.statSync(file).size === 0) continue;
    const text = fs.readFileSync(file, 'utf8');
    collectResultCandidates(text, candidates);
    const full = parseJson(text);
    if (full !== null) collectResultCandidates(full, candidates);
    for (const line of text.split('\n')) {
      const parsed = parseJson(line);
      if (parsed !== null) collectResultCandidates(parsed, candidates);
    }
  }
  return candidates.at(-1) || null;
}

function validateModelResult(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    return 'result must be a JSON object';
  }
  const extra = Object.keys(payload).filter((key) => !MODEL_FIELDS.has(key));
  const missing = [...MODEL_FIELDS].filter((key) => !(key in payload));
  if (extra.length || missing.length) {
    return `result fields must be exact; missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`;
  }
  if (payload.$schema !== RESULT_SCHEMA) return `$schema must be ${RESULT_SCHEMA}`;
  if (!['finished', 'blocked', 'failed'].includes(payload.status)) {
    return 'status must be finished, blocked, or failed';
  }
  if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
    return 'summary must be a non-empty string';
  }
  if (!Array.isArray(payload.changed_files)) return 'changed_files must be an array';
  const normalized = payload.changed_files.map(normalizeChangedPath);
  if (normalized.some((item) => item === null) || new Set(normalized).size !== normalized.length) {
    return 'changed_files must contain unique normalized repository-relative paths';
  }
  if (!Array.isArray(payload.checks)) return 'checks must be an array';
  for (const check of payload.checks) {
    if (!check || Array.isArray(check) || typeof check !== 'object') return 'checks items must be objects';
    const keys = Object.keys(check);
    if (!keys.every((key) => ['command', 'status', 'output_ref'].includes(key))) {
      return 'checks items contain an unknown field';
    }
    if (typeof check.command !== 'string' || !check.command.trim()) return 'checks.command must be non-empty';
    if (!['passed', 'failed', 'not_run'].includes(check.status)) return 'checks.status is invalid';
    if (check.output_ref !== undefined && (typeof check.output_ref !== 'string' || !check.output_ref.trim())) {
      return 'checks.output_ref must be a non-empty string when present';
    }
  }
  for (const field of ['evidence', 'questions', 'residual_risks']) {
    if (!Array.isArray(payload[field]) || !payload[field].every(
      (item) => typeof item === 'string' && item.trim(),
    )) return `${field} must be an array of non-empty strings`;
  }
  if (payload.status === 'blocked' && payload.questions.length === 0) {
    return 'blocked results require at least one question';
  }
  payload.changed_files = [...normalized].sort();
  return null;
}

// The project's memory has exactly one writer: the primary host. A worker that edits
// `.ultra` in its own worktree collides in the files every later session reads to
// resume, so no permission grants it — not even `writable_roots: ["."]`.
function authorized(spec, file) {
  if (file === PROTECTED_ROOT || file.startsWith(`${PROTECTED_ROOT}/`)) return false;
  return spec.writable_roots.some((root) => (
    root === '.' || file === root || file.startsWith(`${root}/`)
  ));
}

function finalHead(spec) {
  try { return git(spec.cwd, ['rev-parse', 'HEAD']).trim(); } catch { return null; }
}

function mechanical(spec, exitCode, signal) {
  return {
    delegation_id: spec.delegation_id,
    host: spec.host,
    transport_maturity: spec.transport_maturity ?? null,
    transport_surface: spec.transport_surface ?? null,
    execution_driver: spec.execution_driver ?? 'cli',
    driver_fallback_reason: spec.driver_fallback_reason ?? null,
    acp_capability: spec.acp_capability ?? null,
    acp_protocol_version: spec.observed_acp_protocol_version ?? null,
    acp_stop_reason: spec.observed_acp_stop_reason ?? null,
    ...(spec.execution_driver === 'acp' ? {
      acp_adapter_exit_code: spec.observed_acp_adapter_exit_code ?? null,
      acp_adapter_exit_signal: spec.observed_acp_adapter_exit_signal ?? null,
    } : {}),
    ...(spec.observed_acp_fallback ? { acp_fallback: spec.observed_acp_fallback } : {}),
    ...(spec.observed_native_terminal ? { native_terminal: spec.observed_native_terminal } : {}),
    events_file: spec.events ?? null,
    // The explicit experimental acknowledgment travels to every terminal
    // result — finished, failed, cancelled, or interrupted — so no result can
    // imply an undocumented surface was silently launched.
    ...(spec.experimental_ack === true ? { experimental_ack: true } : {}),
    instruction_digest: spec.instruction_digest,
    permission_digest: spec.permission_digest,
    output_schema_digest: spec.output_schema_digest,
    read_only: spec.read_only,
    base_head: spec.base_head,
    final_head: finalHead(spec),
    started_at: spec.started_at,
    finished_at: new Date().toISOString(),
    exit_code: Number.isInteger(exitCode) ? exitCode : null,
    signal: signal || null,
  };
}

function failure(spec, type, summary, exitCode = null, signal = null, files = []) {
  return {
    $schema: RESULT_SCHEMA,
    status: 'failed',
    summary,
    changed_files: files,
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
    failure_type: type,
    ...mechanical(spec, exitCode, signal),
  };
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Boundary truth is derived only from an exact-schema observation bound to
// this delegation and launch identity. Missing, unreadable, invalid,
// mismatched, or still-launching evidence is unknown, never stopped.
async function boundaryProof(spec, { waitMs = 3000, stepMs = 100 } = {}) {
  const identity = { delegationId: spec.delegation_id, launchId: spec.launch_id };
  const deadline = Date.now() + waitMs;
  for (;;) {
    const observation = fs.existsSync(spec.writer_observation)
      ? readWriterObservationFile(spec.writer_observation)
      : null;
    const state = deriveWriterState(observation, { identity });
    if (state === 'stopped' || Date.now() + stepMs >= deadline) return state;
    await delay(stepMs);
  }
}

// The exact launch-bound lock claim: before any Host launch, the worker
// durably binds its own PID and start identity to the lock that already
// carries the delegation/launch identity and spec digest. A lock that does
// not match this exact launch, or a claim that cannot be persisted and read
// back, refuses the Host entirely.
function claimWorkerLock(spec, expectedSpecDigest) {
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(spec.lock, 'utf8'));
  } catch {
    return false;
  }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return false;
  if (lock.delegation_id !== spec.delegation_id) return false;
  if (lock.launch_id !== spec.launch_id) return false;
  if (lock.spec_digest !== expectedSpecDigest) return false;
  if (!(lock.pid === null || lock.pid === undefined || lock.pid === process.pid)) return false;
  const claimed = {
    delegation_id: spec.delegation_id,
    launch_id: spec.launch_id,
    started_at: typeof lock.started_at === 'string' && lock.started_at ? lock.started_at : spec.started_at,
    spec_digest: expectedSpecDigest,
    pid: process.pid,
    worker_start_identity: processStartIdentity(process.pid),
  };
  try {
    writeAtomic(spec.lock, claimed);
    const persisted = JSON.parse(fs.readFileSync(spec.lock, 'utf8'));
    // The readback must prove the exact identity just claimed — including an
    // exact null where the platform records no stronger identity — so a lock
    // replaced or altered between the atomic write and the readback, dropping
    // or changing worker_start_identity, refuses the Host launch.
    const identityProven = claimed.worker_start_identity === null
      ? persisted.worker_start_identity === null
      : !!persisted.worker_start_identity && typeof persisted.worker_start_identity === 'object'
        && !Array.isArray(persisted.worker_start_identity)
        && persisted.worker_start_identity.type === claimed.worker_start_identity.type
        && persisted.worker_start_identity.value === claimed.worker_start_identity.value;
    return persisted && typeof persisted === 'object'
      && persisted.delegation_id === claimed.delegation_id
      && persisted.launch_id === claimed.launch_id
      && persisted.spec_digest === claimed.spec_digest
      && persisted.pid === process.pid
      && identityProven;
  } catch {
    return false;
  }
}

// The published terminal decides retention: a result that parses but carries
// no failure_type is a safe terminal, while an unreadable published result
// counts as frozen because it cannot prove anything safe.
function publishedFailureType(spec, terminal) {
  try {
    if (fs.existsSync(spec.result)) {
      const published = JSON.parse(fs.readFileSync(spec.result, 'utf8'));
      if (!published || typeof published !== 'object') return 'outcome_unknown';
      return typeof published.failure_type === 'string' ? published.failure_type : null;
    }
  } catch {
    return 'outcome_unknown';
  }
  return terminal?.failure_type ?? null;
}

async function main() {
  const specFile = process.argv[2];
  const expectedSpecDigest = process.argv[3];
  if (!specFile || !/^[0-9a-f]{64}$/.test(expectedSpecDigest || '')) {
    throw new Error('worker requires a spec path and digest');
  }
  if (sha256(specFile) !== expectedSpecDigest) throw new Error('worker spec digest mismatch before launch');
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  let terminal;
  let hostOutcome = null;
  let hostFiles = [];
  try {
    if (sha256(spec.instruction) !== spec.instruction_digest) {
      terminal = failure(spec, 'instruction_changed', 'Instruction digest changed before delegation started.');
    } else if (sha256(spec.permission) !== spec.permission_digest) {
      terminal = failure(spec, 'permission_changed', 'Permission digest changed before delegation started.');
    } else if (sha256(spec.output_schema) !== spec.output_schema_digest) {
      terminal = failure(spec, 'output_schema_changed', 'Output schema digest changed before delegation started.');
    } else if (!fenceHeldForLaunch(spec.project_root, spec.delegation_id, spec.launch_id)) {
      // The physical fence is the only barrier against a second writer, so a
      // Host may never run without the matching retained fence.
      terminal = failure(
        spec, 'fence_lost',
        'The delegation worktree fence is missing or does not match this launch; the host was not started.',
      );
    } else if (fs.existsSync(spec.cancel)) {
      terminal = failure(spec, 'cancelled', 'Delegation was cancelled before the host process started.');
    } else if (!claimWorkerLock(spec, expectedSpecDigest)) {
      // No Host may run behind a lock this worker cannot durably claim; the
      // tampered lock itself stays behind as evidence for inspection.
      terminal = failure(
        spec, 'worker_lock_unbound',
        'The worker could not bind its identity to the launch-bound lock; the host was not started.',
      );
    } else {
      const processResult = await runExecutionDriver(spec);
      hostOutcome = processResult;
      spec.execution_driver = processResult.executionDriver || spec.execution_driver;
      spec.driver_fallback_reason = processResult.fallbackReason ?? spec.driver_fallback_reason;
      spec.transport_surface = processResult.transportSurface || spec.transport_surface;
      spec.observed_acp_protocol_version = processResult.protocolVersion ?? null;
      spec.observed_acp_stop_reason = processResult.stopReason ?? null;
      spec.observed_acp_adapter_exit_code = processResult.adapterExitCode ?? null;
      spec.observed_acp_adapter_exit_signal = processResult.adapterExitSignal ?? null;
      spec.observed_acp_fallback = processResult.acpFallback || null;
      spec.observed_native_terminal = processResult.nativeTerminal || null;
      let files = [];
      try { files = changedFiles(spec); } catch {}
      hostFiles = files;
      const unauthorized = files.filter((file) => !authorized(spec, file));
      if (processResult.termination === 'cancelled' || processResult.termination === 'timeout') {
        terminal = failure(
          spec, processResult.termination,
          processResult.termination === 'cancelled'
            ? 'Delegation cancelled by request.'
            : 'Delegation timed out and the host process was terminated.',
          processResult.code, processResult.signal, files,
        );
      } else if (sha256(specFile) !== expectedSpecDigest) {
        terminal = failure(spec, 'worker_spec_changed', 'Worker specification changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.instruction) !== spec.instruction_digest) {
        terminal = failure(spec, 'instruction_changed', 'Instruction digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.permission) !== spec.permission_digest) {
        terminal = failure(spec, 'permission_changed', 'Permission digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.output_schema) !== spec.output_schema_digest) {
        terminal = failure(spec, 'output_schema_changed', 'Output schema digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (unauthorized.length) {
        terminal = failure(
          spec, 'unauthorized_write',
          `Actual Git diff escaped writable_roots: ${unauthorized.join(', ')}`,
          processResult.code, processResult.signal, files,
        );
      } else if (processResult.spawnError) {
        terminal = failure(spec, 'spawn_error', `Host process failed to start: ${processResult.spawnError.message}`, null, null, files);
      } else if (processResult.failureType) {
        terminal = failure(
          spec,
          processResult.failureType,
          processResult.failureSummary || 'Agent execution driver failed.',
          processResult.code,
          processResult.signal,
          files,
        );
      } else if (processResult.code !== 0) {
        terminal = failure(spec, 'process_exit', `Host process exited with code ${processResult.code}.`, processResult.code, processResult.signal, files);
      } else {
        const payload = extractModelResult(spec);
        if (!payload) {
          terminal = failure(
            spec, 'missing_result',
            'Host process exited without a structured Ultra delegation result.',
            processResult.code, processResult.signal, files,
          );
        } else {
          const validation = validateModelResult(payload);
          if (validation) {
            terminal = failure(spec, 'invalid_result', validation, processResult.code, processResult.signal, files);
          } else {
            if (JSON.stringify(payload.changed_files) !== JSON.stringify(files)) {
              terminal = failure(
                spec, 'changed_files_mismatch',
                `Declared changed_files do not match actual Git diff: ${files.join(', ') || 'none'}`,
                processResult.code, processResult.signal, files,
              );
            } else {
              terminal = { ...payload, ...mechanical(spec, processResult.code, processResult.signal) };
            }
          }
        }
      }
    }
    // After any Host launch, every terminal publication that could imply safe
    // completion or retry is gated on the matching boundary proof. A live or
    // unprovable writer overrides success, ordinary failure, timeout, and
    // cancellation with launcher-side outcome_unknown and keeps the fence.
    if (hostOutcome) {
      const boundary = await boundaryProof(spec);
      if (boundary !== 'stopped') {
        terminal = failure(
          spec, 'outcome_unknown',
          `Delegation cannot prove its complete writer boundary stopped (writer state: ${boundary}); the worktree fence is retained.`,
          hostOutcome.code, hostOutcome.signal, hostFiles,
        );
      }
    }
    if (!fs.existsSync(spec.result)) writeAtomic(spec.result, terminal);
  } finally {
    // The lock leaves with the run except in two states: a frozen
    // outcome_unknown terminal retains its launch-bound identity for explicit
    // matching recovery, and an unbound lock stays behind as evidence.
    const published = publishedFailureType(spec, terminal);
    if (published !== 'outcome_unknown' && terminal?.failure_type !== 'worker_lock_unbound') {
      try { fs.unlinkSync(spec.lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (spec.fence) {
      if (published === 'outcome_unknown') {
        // Frozen terminal: neither worker cleanup nor elapsed time may release
        // the fence; only explicit recovery after a current matching stop
        // proof can. The retained lock keeps that repair reachable.
      } else {
        // The worktree fence releases only with a proven-stopped writer
        // boundary, through the derived registry path rather than any
        // spec-named path; an unprovable boundary leaves the root frozen for
        // launcher-side repair.
        const proven = await boundaryProof(spec, { waitMs: 1500 });
        if (proven === 'stopped') {
          try {
            releaseWorktreeFence(spec.project_root, spec.delegation_id, { launchId: spec.launch_id });
          } catch (error) {
            process.stderr.write(`ultra-delegate: fence release refused: ${error.message}\n`);
          }
        }
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
