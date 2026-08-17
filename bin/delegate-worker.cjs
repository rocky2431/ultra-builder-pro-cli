#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

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
  for (const file of [spec.host_output, spec.stdout]) {
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

function terminate(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {}
}

function runChild(spec) {
  return new Promise((resolve) => {
    const stdoutFd = fs.openSync(spec.stdout, 'a');
    const stderrFd = fs.openSync(spec.stderr, 'a');
    let termination = null;
    let spawnError = null;
    let closed = false;
    let hardKill = null;
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      detached: process.platform !== 'win32',
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    const finish = (code, signal) => {
      if (closed) return;
      closed = true;
      clearInterval(cancelPoll);
      clearTimeout(timeout);
      if (hardKill) clearTimeout(hardKill);
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
      resolve({ code, signal, termination, spawnError });
    };
    child.on('error', (error) => { spawnError = error; });
    child.on('close', finish);
    const requestTermination = (reason) => {
      if (termination) return;
      termination = reason;
      terminate(child);
      hardKill = setTimeout(() => terminate(child, 'SIGKILL'), 1500);
      hardKill.unref();
    };
    const cancelPoll = setInterval(() => {
      if (fs.existsSync(spec.cancel)) requestTermination('cancelled');
    }, 100);
    const timeout = setTimeout(() => requestTermination('timeout'), spec.timeout_ms);
    cancelPoll.unref();
    timeout.unref();
  });
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
  try {
    if (sha256(spec.instruction) !== spec.instruction_digest) {
      terminal = failure(spec, 'instruction_changed', 'Instruction digest changed before delegation started.');
    } else if (sha256(spec.permission) !== spec.permission_digest) {
      terminal = failure(spec, 'permission_changed', 'Permission digest changed before delegation started.');
    } else if (sha256(spec.output_schema) !== spec.output_schema_digest) {
      terminal = failure(spec, 'output_schema_changed', 'Output schema digest changed before delegation started.');
    } else if (fs.existsSync(spec.cancel)) {
      terminal = failure(spec, 'cancelled', 'Delegation was cancelled before the host process started.');
    } else {
      const processResult = await runChild(spec);
      let files = [];
      try { files = changedFiles(spec); } catch {}
      if (processResult.termination === 'cancelled') {
        terminal = failure(spec, 'cancelled', 'Delegation cancelled by request.', processResult.code, processResult.signal, files);
      } else if (processResult.termination === 'timeout') {
        terminal = failure(spec, 'timeout', 'Delegation timed out and the host process was terminated.', processResult.code, processResult.signal, files);
      } else if (sha256(specFile) !== expectedSpecDigest) {
        terminal = failure(spec, 'worker_spec_changed', 'Worker specification changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.instruction) !== spec.instruction_digest) {
        terminal = failure(spec, 'instruction_changed', 'Instruction digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.permission) !== spec.permission_digest) {
        terminal = failure(spec, 'permission_changed', 'Permission digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (sha256(spec.output_schema) !== spec.output_schema_digest) {
        terminal = failure(spec, 'output_schema_changed', 'Output schema digest changed during delegation.', processResult.code, processResult.signal, files);
      } else if (processResult.spawnError) {
        terminal = failure(spec, 'spawn_error', `Host process failed to start: ${processResult.spawnError.message}`, null, null, files);
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
            const unauthorized = files.filter((file) => !authorized(spec, file));
            if (unauthorized.length) {
              terminal = failure(
                spec, 'unauthorized_write',
                `Actual Git diff escaped writable_roots: ${unauthorized.join(', ')}`,
                processResult.code, processResult.signal, files,
              );
            } else if (JSON.stringify(payload.changed_files) !== JSON.stringify(files)) {
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
    if (!fs.existsSync(spec.result)) writeAtomic(spec.result, terminal);
  } finally {
    try { fs.unlinkSync(spec.lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
