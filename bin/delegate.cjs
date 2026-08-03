'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const { hostProfile } = require('../adapters/_shared/host-profile.cjs');
const { writeAtomic } = require('../adapters/_shared/file-ops.cjs');

const PERMISSION_SCHEMA = 'ultra-delegation-permission-v1';
const RECEIPT_SCHEMA = 'ultra-delegation-receipt-v1';
const RESULT_SCHEMA = 'ultra-delegation-result-v1';
const PERMISSION_FIELDS = new Set(['$schema', 'writable_roots', 'external_effects']);
const PROTECTED_ROOT = '.ultra';
const RESULT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    '$schema', 'status', 'summary', 'changed_files', 'checks', 'evidence',
    'questions', 'residual_risks',
  ],
  properties: {
    $schema: { const: RESULT_SCHEMA },
    status: { enum: ['finished', 'blocked', 'failed'] },
    summary: { type: 'string', minLength: 1 },
    changed_files: {
      type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 },
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'status'],
        properties: {
          command: { type: 'string', minLength: 1 },
          status: { enum: ['passed', 'failed', 'not_run'] },
          output_ref: { type: 'string', minLength: 1 },
        },
      },
    },
    evidence: { type: 'array', items: { type: 'string', minLength: 1 } },
    questions: { type: 'array', items: { type: 'string', minLength: 1 } },
    residual_risks: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
});

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function atOrInside(root, candidate) {
  return candidate === root || inside(root, candidate);
}

function projectPath(projectRoot, value, label, { directory = false } = {}) {
  const lexical = path.resolve(projectRoot, value);
  const resolved = fs.existsSync(lexical) ? fs.realpathSync(lexical) : lexical;
  if (!inside(projectRoot, resolved)) throw new Error(`${label} must be inside the current project`);
  if (directory && (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory())) {
    throw new Error(`${label} must be an existing directory`);
  }
  return resolved;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function observedChangedFiles(cwd, baseHead) {
  const run = (args) => execFileSync('git', args, {
    cwd,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8').split('\0').filter(Boolean);
  return [...new Set([
    ...run(['diff', '--name-only', '-z', baseHead, '--']),
    ...run(['ls-files', '--others', '--exclude-standard', '-z']),
  ].map((file) => file.split(path.sep).join('/')))].sort();
}

function validateWorktree(worktree) {
  let top;
  try {
    top = fs.realpathSync(git(worktree, ['rev-parse', '--show-toplevel']));
  } catch {
    throw new Error('worktree must be a real Git worktree');
  }
  if (top !== worktree) throw new Error('worktree must be the root of a real Git worktree');
  const registered = git(worktree, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .some((entry) => {
      try { return fs.realpathSync(entry) === worktree; } catch { return false; }
    });
  if (!registered) throw new Error('worktree is not registered as a Git worktree');
  const dirty = git(worktree, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (dirty) throw new Error('delegated Git worktree must start clean');
  return git(worktree, ['rev-parse', 'HEAD']);
}

function readPermission(file, worktree) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('permission must be valid JSON');
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new Error('permission must be a JSON object');
  }
  for (const key of Object.keys(payload)) {
    if (!PERMISSION_FIELDS.has(key)) throw new Error(`unknown permission field: ${key}`);
  }
  if (payload.$schema !== PERMISSION_SCHEMA) {
    throw new Error(`permission $schema must be ${PERMISSION_SCHEMA}`);
  }
  if (!Array.isArray(payload.writable_roots)) {
    throw new Error('permission writable_roots must be an array');
  }
  const writableRoots = [];
  const writableRootPaths = [];
  for (const value of payload.writable_roots) {
    if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value)) {
      throw new Error('permission writable_roots entries must be relative non-empty paths');
    }
    const resolved = path.resolve(worktree, value);
    if (!atOrInside(worktree, resolved)) {
      throw new Error('permission writable_roots must stay inside the delegated worktree');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`permission writable_roots entry must be an existing directory: ${value}`);
    }
    const real = fs.realpathSync(resolved);
    if (!atOrInside(worktree, real)) {
      throw new Error('permission writable_roots must not escape through symlinks');
    }
    const normalized = path.relative(worktree, real).split(path.sep).join('/') || '.';
    // `.ultra` is the project's memory and has exactly one writer: the primary host.
    // Rejected here so the delegation never starts, and again against the actual diff
    // in the worker, which also covers the `.` grant.
    if (normalized === PROTECTED_ROOT || normalized.startsWith(`${PROTECTED_ROOT}/`)) {
      throw new Error(`permission writable_roots must not include ${PROTECTED_ROOT}; the primary host is its only writer`);
    }
    if (!writableRoots.includes(normalized)) {
      writableRoots.push(normalized);
      writableRootPaths.push(real);
    }
  }
  if (!Array.isArray(payload.external_effects)) {
    throw new Error('permission external_effects must be an array');
  }
  if (payload.external_effects.length !== 0) {
    throw new Error('permission external_effects must be empty; the primary host performs separately authorized effects');
  }
  return { writableRoots, writableRootPaths };
}

function delegatePrompt({ instruction, permission, worktree, readOnly }) {
  return [
    'Execute one bounded Ultra Builder Pro delegation in the isolated Git worktree.',
    `Read the immutable instruction file: ${instruction}`,
    `Read the immutable permission file: ${permission}`,
    `Use this worktree as the only filesystem boundary: ${worktree}`,
    readOnly
      ? 'This is read-only delegation. Do not create, modify, or delete any project file.'
      : 'Modify only paths covered by permission.writable_roots.',
    'Do not perform external effects, edit the primary checkout, or change Ultra task authority.',
    `Return exactly one JSON object as the final response using $schema ${RESULT_SCHEMA}.`,
    'The exact fields are status, summary, changed_files, checks, evidence, questions, and residual_risks.',
    'status is finished, blocked, or failed. blocked requires at least one question.',
    'changed_files must exactly list every repository-relative path changed in the worktree.',
    'checks items use command, status (passed, failed, or not_run), and optional output_ref.',
    'Do not write the receipt yourself. The launcher validates structured output, process exit, permissions, and the actual Git diff before publication.',
  ].join('\n');
}

function selectedBinary(runtime, fallback) {
  return process.env[`UBP_DELEGATE_${runtime.toUpperCase()}_BIN`] || fallback;
}

function parsePairs(argv, allowed) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value === '') {
      throw new Error(`invalid delegate argument: ${key || '<missing>'}`);
    }
    if (values[key]) throw new Error(`duplicate delegate argument: ${key}`);
    values[key] = value;
  }
  return values;
}

function parseRun(argv) {
  const values = parsePairs(argv, new Set([
    '--to', '--instruction', '--permission', '--worktree', '--timeout',
  ]));
  for (const key of ['--to', '--instruction', '--permission', '--worktree']) {
    if (!values[key]) throw new Error(`delegate run requires ${key}`);
  }
  const timeout = values['--timeout'] === undefined ? 1800 : Number(values['--timeout']);
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 86400) {
    throw new Error('delegate --timeout must be greater than 0 and at most 86400 seconds');
  }
  return {
    to: values['--to'], instruction: values['--instruction'],
    permission: values['--permission'], worktree: values['--worktree'],
    timeoutMs: Math.ceil(timeout * 1000),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function run(argv, { projectRoot = process.cwd() } = {}) {
  const args = parseRun(argv);
  projectRoot = fs.realpathSync(projectRoot);
  const profile = hostProfile(args.to);
  const instruction = projectPath(projectRoot, args.instruction, 'instruction');
  const permission = projectPath(projectRoot, args.permission, 'permission');
  const worktree = projectPath(projectRoot, args.worktree, 'worktree', { directory: true });
  if (!fs.statSync(instruction).isFile()) throw new Error('instruction must be a file');
  if (!fs.statSync(permission).isFile()) throw new Error('permission must be a file');
  if (path.dirname(instruction) !== path.dirname(permission)) {
    throw new Error('instruction and permission must share one delegation directory');
  }
  const baseHead = validateWorktree(worktree);
  const permissionContract = readPermission(permission, worktree);
  const delegationRoot = path.dirname(instruction);
  const delegationId = path.basename(delegationRoot);
  const result = path.join(delegationRoot, 'result.json');
  const receiptFile = path.join(delegationRoot, 'receipt.json');
  const stdout = path.join(delegationRoot, 'stdout.log');
  const stderr = path.join(delegationRoot, 'stderr.log');
  const spec = path.join(delegationRoot, 'worker-spec.json');
  const outputSchema = path.join(delegationRoot, 'result-schema.json');
  const hostOutput = path.join(delegationRoot, 'host-result.json');
  const lock = path.join(delegationRoot, 'run.lock');
  const cancel = path.join(delegationRoot, 'cancel.request');
  if (fs.existsSync(result)) throw new Error('delegation result.json already exists; use a new delegation id');
  if (fs.existsSync(lock)) throw new Error('delegation is already running');
  if (fs.existsSync(receiptFile) || fs.existsSync(spec) || fs.existsSync(outputSchema) || fs.existsSync(hostOutput)) {
    throw new Error('delegation id already has run artifacts; cancel or use a new delegation id');
  }
  let lockFd;
  try {
    lockFd = fs.openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('delegation is already running');
    throw error;
  }
  const startedAt = new Date().toISOString();
  const instructionDigest = sha256(instruction);
  const permissionDigest = sha256(permission);
  try {
    fs.writeFileSync(lockFd, `${JSON.stringify({ pid: process.pid, started_at: startedAt })}\n`);
    fs.closeSync(lockFd);
    lockFd = undefined;
    writeAtomic(outputSchema, `${JSON.stringify(RESULT_JSON_SCHEMA, null, 2)}\n`);
    fs.chmodSync(outputSchema, 0o600);
    const outputSchemaDigest = sha256(outputSchema);
    const profileOptions = {
      readOnly: permissionContract.writableRoots.length === 0,
      writableRoots: permissionContract.writableRoots,
      schemaFile: outputSchema,
      schemaJson: JSON.stringify(RESULT_JSON_SCHEMA),
      hostOutput,
    };
    const prompt = delegatePrompt({
      instruction, permission, worktree, readOnly: profileOptions.readOnly,
    });
    const workerSpec = {
      $schema: 'ultra-delegation-worker-spec-v1',
      delegation_id: delegationId,
      host: args.to,
      command: selectedBinary(args.to, profile.binary),
      args: profile.delegateArgv(prompt, worktree, profileOptions),
      cwd: worktree,
      instruction,
      permission,
      instruction_digest: instructionDigest,
      permission_digest: permissionDigest,
      output_schema: outputSchema,
      output_schema_digest: outputSchemaDigest,
      host_output: hostOutput,
      read_only: profileOptions.readOnly,
      writable_roots: permissionContract.writableRoots,
      writable_root_paths: permissionContract.writableRootPaths,
      base_head: baseHead,
      started_at: startedAt,
      timeout_ms: args.timeoutMs,
      result,
      stdout,
      stderr,
      lock,
      cancel,
      env: {
        ...(profile.delegateEnv ? profile.delegateEnv(profileOptions) : {}),
        UBP_DELEGATE_INSTRUCTION_FILE: instruction,
        UBP_DELEGATE_PERMISSION_FILE: permission,
        UBP_DELEGATE_WORKTREE: worktree,
      },
    };
    writeAtomic(spec, `${JSON.stringify(workerSpec, null, 2)}\n`);
    fs.chmodSync(spec, 0o600);
    const specDigest = sha256(spec);
    const worker = spawn(process.execPath, [
      path.join(__dirname, 'delegate-worker.cjs'), spec, specDigest,
    ], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    if (!worker.pid) throw new Error('failed to start delegation worker');
    worker.unref();
    const receipt = {
      $schema: RECEIPT_SCHEMA,
      status: 'started',
      delegation_id: delegationId,
      host: args.to,
      worker_pid: worker.pid,
      instruction_digest: instructionDigest,
      permission_digest: permissionDigest,
      output_schema_digest: outputSchemaDigest,
      spec_digest: specDigest,
      base_head: baseHead,
      started_at: startedAt,
      timeout_ms: args.timeoutMs,
      result_file: result,
      read_only: profileOptions.readOnly,
      stdout_file: stdout,
      stderr_file: stderr,
      cancel_command: `ubp delegate cancel --delegation ${delegationRoot}`,
    };
    writeAtomic(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
    writeAtomic(lock, `${JSON.stringify({ pid: worker.pid, started_at: startedAt })}\n`);
    fs.chmodSync(lock, 0o600);
    if (fs.existsSync(result)) {
      try { fs.unlinkSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return receipt;
  } catch (error) {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
    for (const file of [spec, outputSchema, hostOutput]) {
      try { fs.unlinkSync(file); } catch (unlinkError) { if (unlinkError.code !== 'ENOENT') throw unlinkError; }
    }
    throw error;
  }
}

function delegationPath(projectRoot, value) {
  return projectPath(projectRoot, value, 'delegation', { directory: true });
}

function status(argv, { projectRoot = process.cwd() } = {}) {
  const values = parsePairs(argv, new Set(['--delegation']));
  if (!values['--delegation']) throw new Error('delegate status requires --delegation');
  projectRoot = fs.realpathSync(projectRoot);
  const root = delegationPath(projectRoot, values['--delegation']);
  const result = path.join(root, 'result.json');
  if (fs.existsSync(result)) return readJson(result);
  const receiptFile = path.join(root, 'receipt.json');
  const receipt = fs.existsSync(receiptFile) ? readJson(receiptFile) : null;
  const lockFile = path.join(root, 'run.lock');
  const lock = fs.existsSync(lockFile) ? readJson(lockFile) : null;
  const cancelling = fs.existsSync(path.join(root, 'cancel.request'));
  return {
    $schema: 'ultra-delegation-status-v1',
    status: cancelling ? 'cancelling' : lock && processAlive(lock.pid) ? 'running' : receipt ? 'stalled' : 'not_started',
    delegation_id: path.basename(root),
    worker_pid: lock?.pid || receipt?.worker_pid || null,
    result_file: result,
    repair: receipt ? `ubp delegate cancel --delegation ${root}` : null,
  };
}

function failureFromSpec(spec, failureType, summary) {
  let finalHead = null;
  let changedFiles = [];
  try { finalHead = git(spec.cwd, ['rev-parse', 'HEAD']); } catch {}
  try { changedFiles = observedChangedFiles(spec.cwd, spec.base_head); } catch {}
  return {
    $schema: RESULT_SCHEMA,
    status: 'failed',
    summary,
    changed_files: changedFiles,
    checks: [],
    evidence: [],
    questions: [],
    residual_risks: [],
    failure_type: failureType,
    delegation_id: spec.delegation_id,
    host: spec.host,
    instruction_digest: spec.instruction_digest,
    permission_digest: spec.permission_digest,
    output_schema_digest: spec.output_schema_digest,
    base_head: spec.base_head,
    final_head: finalHead,
    started_at: spec.started_at,
    finished_at: new Date().toISOString(),
    exit_code: null,
  };
}

function cancel(argv, { projectRoot = process.cwd() } = {}) {
  const values = parsePairs(argv, new Set(['--delegation']));
  if (!values['--delegation']) throw new Error('delegate cancel requires --delegation');
  projectRoot = fs.realpathSync(projectRoot);
  const root = delegationPath(projectRoot, values['--delegation']);
  const result = path.join(root, 'result.json');
  if (fs.existsSync(result)) return { status: 'already_terminal', result: readJson(result) };
  const specFile = path.join(root, 'worker-spec.json');
  if (!fs.existsSync(specFile)) throw new Error('delegation has no worker spec to cancel');
  const spec = readJson(specFile);
  const request = path.join(root, 'cancel.request');
  writeAtomic(request, `${JSON.stringify({ requested_at: new Date().toISOString() })}\n`);
  const receiptFile = path.join(root, 'receipt.json');
  const receipt = fs.existsSync(receiptFile) ? readJson(receiptFile) : null;
  if (!processAlive(receipt?.worker_pid)) {
    writeAtomic(result, `${JSON.stringify(failureFromSpec(spec, 'cancelled', 'Delegation cancelled after its worker stopped.'), null, 2)}\n`);
    try { fs.unlinkSync(path.join(root, 'run.lock')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return {
    $schema: 'ultra-delegation-cancel-v1',
    status: 'cancel_requested',
    delegation_id: path.basename(root),
    result_file: result,
  };
}

function handle(argv, options) {
  if (argv[0] !== 'delegate') throw new Error('delegate command is required');
  if (argv[1] === 'run') return run(argv.slice(2), options);
  if (argv[1] === 'status') return status(argv.slice(2), options);
  if (argv[1] === 'cancel') return cancel(argv.slice(2), options);
  throw new Error('usage: ubp delegate <run|status|cancel> ...');
}

module.exports = { handle, run, status, cancel };
