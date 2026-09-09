#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const delegate = require('./delegate.cjs');
const hosts = require('./host-profile.cjs');
const { selectExecutionDriver, signalOutcome } = require('./agent-execution-driver.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (code) => { throw new Error(code); };
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const terminal = new Set(['finished', 'blocked', 'failed']);
const states = new Set([...terminal, 'running', 'not_started', 'outcome_unknown']);

function fields(value, keys, optional = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).some((key) => !keys.includes(key) && !optional.includes(key))
      || keys.some((key) => !(key in value))) fail('incompatible_contract');
}

// Resolve every component, including existing parents of a future runtime file.
function local(root, value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)
      || value.split(/[\\/]/u).some((part) => part === '..' || part === '.')) fail('invalid_path');
  const file = path.resolve(root, value), relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) fail('invalid_path');
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try { if (fs.lstatSync(current).isSymbolicLink()) fail('symlink_path'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return file;
}

function bytes(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) fail('invalid_file');
  return fs.readFileSync(file);
}
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
function bound(root, ref) {
  fields(ref, ['path', 'sha256']);
  if (!digest(ref.sha256)) fail('invalid_digest');
  const file = local(root, ref.path), source = bytes(file);
  if (sha(source) !== ref.sha256) fail('input_drift');
  return { file, source };
}

function shape(packet) {
  fields(packet, ['$schema', 'run_id', 'slice_id', 'change_id', 'base_revision', 'primary_session_id', 'intent', 'grant', 'profile', 'task_refs', 'seam', 'attempts', 'budget', 'barrier', 'cancel_policy'], ['experimental_ack']);
  if ('experimental_ack' in packet && typeof packet.experimental_ack !== 'boolean') fail('incompatible_contract');
  if (packet.$schema !== 'ultra-run-slice-v1' || ![packet.run_id, packet.slice_id, packet.change_id].every(id)
      || typeof packet.primary_session_id !== 'string' || !packet.primary_session_id || packet.primary_session_id.length > 256
      || !/^[a-f0-9]{40,64}$/u.test(packet.base_revision) || packet.barrier !== 'all-terminal'
      || packet.cancel_policy !== 'cancel-unfinished') fail('incompatible_contract');
  fields(packet.budget, ['max_concurrency', 'attempt_timeout_seconds', 'deadline_at']);
  const budget = packet.budget;
  if (!Number.isInteger(budget.max_concurrency) || budget.max_concurrency < 1 || budget.max_concurrency > 32
      || !Number.isInteger(budget.attempt_timeout_seconds) || budget.attempt_timeout_seconds < 1 || budget.attempt_timeout_seconds > 86400
      || typeof budget.deadline_at !== 'string' || !Number.isFinite(Date.parse(budget.deadline_at))
      || !Array.isArray(packet.attempts) || !packet.attempts.length || packet.attempts.length > budget.max_concurrency
      || !Array.isArray(packet.task_refs) || !packet.task_refs.length || packet.task_refs.length > 32) fail('incompatible_contract');
  for (const task of packet.task_refs) { fields(task, ['id', 'path', 'sha256']); if (!id(task.id)) fail('incompatible_contract'); }
  for (const attempt of packet.attempts) {
    fields(attempt, ['id', 'role_id', 'task_id', 'host', 'model', 'worktree', 'instruction', 'permission']);
    if (![attempt.id, attempt.role_id, attempt.task_id, attempt.host].every(id)
        || !(attempt.model === null || (typeof attempt.model === 'string' && attempt.model.length > 0 && attempt.model.length <= 256))) fail('incompatible_contract');
  }
  for (const values of [packet.task_refs.map((t) => t.id), packet.attempts.map((a) => a.id)]) {
    if (new Set(values).size !== values.length) fail('duplicate_identity');
  }
}

function inputs(root, packet) {
  const refs = [packet.intent, packet.grant, packet.profile, packet.seam,
    ...packet.task_refs.map(({ path: file, sha256 }) => ({ path: file, sha256 })),
    ...packet.attempts.flatMap((a) => [a.instruction, a.permission])];
  for (const ref of refs) bound(root, ref);
}

function prepare(file, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  const packet = json(local(root, path.relative(root, path.resolve(root, file))));
  shape(packet);
  if (options.sessionId !== packet.primary_session_id) fail('session_mismatch');
  const remaining = Date.parse(packet.budget.deadline_at) - Date.now();
  if (remaining <= 0 || remaining > 86400000) fail('invalid_deadline');
  inputs(root, packet);
  if (packet.intent.path !== `.ultra/changes/active/${packet.change_id}/intent.md`
      || !packet.grant.path.startsWith('.ultra/decisions/')) fail('invalid_authority_ref');
  const profile = JSON.parse(bound(root, packet.profile).source);
  fields(profile, ['$schema', 'profile_id', 'roles']);
  if (profile.$schema !== 'ultra-role-profile-v1' || !id(profile.profile_id)
      || !Array.isArray(profile.roles) || !profile.roles.length || profile.roles.length > 32) fail('incompatible_contract');
  const roles = new Map();
  for (const role of profile.roles) {
    fields(role, ['role_id', 'purpose', 'authority', 'host', 'model', 'qualification_sha256']);
    if (!id(role.role_id) || roles.has(role.role_id) || typeof role.purpose !== 'string' || !role.purpose
        || !['scoped-write', 'read-only'].includes(role.authority) || !digest(role.qualification_sha256)) fail('incompatible_contract');
    roles.set(role.role_id, role);
  }
  const admitted = [], trees = [], dirs = new Set();
  for (const attempt of packet.attempts) {
    const role = roles.get(attempt.role_id);
    if (!role || role.host !== attempt.host || role.model !== attempt.model
        || !packet.task_refs.some((task) => task.id === attempt.task_id)) fail('role_mismatch');
    const tree = local(root, attempt.worktree);
    if (trees.some((other) => delegate.fencePathsOverlap(other, tree))) fail('worktree_overlap');
    trees.push(tree);
    if (delegate.validateWorktree(tree) !== packet.base_revision) fail('base_revision_mismatch');
    const instruction = bound(root, attempt.instruction).file, permission = bound(root, attempt.permission).file;
    const dir = path.dirname(instruction);
    if (dir !== path.dirname(permission) || path.basename(dir) !== attempt.id || dirs.has(dir)) fail('delegation_identity_mismatch');
    dirs.add(dir);
    if (fs.readdirSync(dir).some((name) => ![path.basename(instruction), path.basename(permission)].includes(name))) fail('attempt_exists');
    const contract = delegate.readPermission(permission, tree), readOnly = contract.writableRoots.length === 0;
    if (readOnly !== (role.authority === 'read-only')) fail('permission_role_mismatch');
    const host = (options.resolveHostProfile || hosts.hostProfile)(attempt.host);
    if (host.transportMaturity === 'experimental' && packet.experimental_ack !== true) fail('experimental_ack_required');
    if (host.supportsModelSelection && attempt.model === null) fail('model_required');
    if (sha(JSON.stringify(host.enforcement ?? null)) !== role.qualification_sha256) fail('qualification_drift');
    const required = hosts.requiredPacketEnforcementDimensions({ readOnly });
    const qualify = options.qualify || hosts.enforcementAdmission;
    const env = hosts.descendantEnvViews(process.env, host).probe;
    const candidates = env.ULTRA_DELEGATE_FORCE_CLI === '1' ? ['cli'] : ['acp', 'cli'];
    const positive = (decision) => decision.route === 'admitted' && decision.gate === 'enforcement_qualification';
    if (!candidates.some((driver) => positive(qualify(host, { required, driver })))) fail('host_unqualified');
    const selection = (options.chooseExecutionDriver || selectExecutionDriver)({ host: attempt.host, profile: host,
      cliCommand: process.env[`UBP_DELEGATE_${attempt.host.toUpperCase()}_BIN`] || host.binary, cwd: tree, env });
    if (!positive(qualify(host, { required, driver: selection.driver }))) fail('host_unqualified');
    admitted.push({ attempt, host, selection });
  }
  return { root, packet, admitted };
}

function directory(root, runId, sliceId) {
  if (!id(runId) || !id(sliceId)) fail('invalid_identity');
  return local(root, `.ultra/.runtime/runs/${runId}/${sliceId}`);
}

function once(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try { fs.linkSync(temp, file); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { fs.unlinkSync(temp); }
  return json(file);
}

function observe(attempt, { root, packet }) {
  const dir = path.dirname(local(root, attempt.instruction.path));
  const view = delegate.status(['--delegation', dir], { projectRoot: root });
  if (view.$schema === 'ultra-delegation-status-v1') return {
    state: ['running', 'cancelling'].includes(view.status) ? 'running' : view.status === 'not_started' ? 'not_started' : 'outcome_unknown', result: null,
  };
  const file = local(root, path.relative(root, path.join(dir, 'result.json'))), source = bytes(file), result = JSON.parse(source);
  const receipt = json(local(root, path.relative(root, path.join(dir, 'receipt.json'))));
  if (view.writer_observation?.state !== 'stopped') return { state: 'outcome_unknown', result: null };
  if (Number.isInteger(receipt.worker_pid) && receipt.worker_pid > 0) {
    const outer = signalOutcome(receipt.worker_pid);
    if (outer === 'alive') return { state: 'running', result: null };
    if (outer !== 'dead') return { state: 'outcome_unknown', result: null };
  } else return { state: 'outcome_unknown', result: null };
  if (result.$schema !== 'ultra-delegation-result-v1' || !terminal.has(result.status)
      || result.failure_type === 'outcome_unknown' || result.writer_state === 'outcome_unknown'
      || result.delegation_id !== attempt.id || result.host !== attempt.host
      || result.base_head !== packet.base_revision || result.instruction_digest !== attempt.instruction.sha256
      || result.permission_digest !== attempt.permission.sha256 || typeof result.summary !== 'string'
      || !['changed_files', 'checks', 'evidence', 'questions', 'residual_risks'].every((key) => Array.isArray(result[key]))) {
    return { state: 'outcome_unknown', result: null };
  }
  return { state: result.status, result: { path: path.relative(root, file), sha256: sha(source) } };
}

function stop(attempt, context, options) {
  try {
    if (options.cancelAttempt) options.cancelAttempt(attempt);
    else delegate.cancel(['--delegation', path.dirname(local(context.root, attempt.instruction.path))], { projectRoot: context.root });
  } catch { /* The next observation preserves an unproven writer as unknown. */ }
}

async function wait(context, dir, options) {
  const attentionFile = local(context.root, path.relative(context.root, path.join(dir, 'attention.json')));
  let stoppingAt = null;
  for (;;) {
    if (fs.existsSync(attentionFile)) return json(attentionFile);
    const observations = context.packet.attempts.map((attempt) => {
      let value;
      try { value = (options.observe || observe)(attempt, context); } catch { value = null; }
      if (!value || !states.has(value.state)) value = { state: 'outcome_unknown', result: null };
      return { attempt_id: attempt.id, state: value.state, result: value.result || null };
    });
    const unknown = observations.some((v) => ['not_started', 'outcome_unknown'].includes(v.state));
    const cancelFile = local(context.root, path.relative(context.root, path.join(dir, 'cancel.request')));
    const requested = fs.existsSync(cancelFile) || Date.now() >= Date.parse(context.packet.budget.deadline_at) || unknown;
    if (requested && stoppingAt === null) {
      stoppingAt = Date.now();
      observations.forEach((value, i) => { if (!terminal.has(value.state)) stop(context.packet.attempts[i], context, options); });
    }
    const running = observations.some((value) => value.state === 'running');
    if (!running || (stoppingAt !== null && Date.now() - stoppingAt >= 5000)) {
      for (const value of observations) if (value.state === 'running') value.state = 'outcome_unknown';
      const counts = {};
      for (const value of observations) counts[value.state] = (counts[value.state] || 0) + 1;
      const packet = context.packet;
      return once(attentionFile, { $schema: 'ultra-attention-v1', event_key: `${packet.run_id}:${packet.slice_id}`,
        run_id: packet.run_id, slice_id: packet.slice_id, primary_session_id: packet.primary_session_id,
        packet_sha256: sha(bytes(path.join(dir, 'run-slice.json'))),
        reason: observations.every((value) => terminal.has(value.state)) ? 'wave_terminal' : 'operator_attention',
        counts, attempts: observations, observed_at: new Date().toISOString() });
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs || 250));
  }
}

function begin(file, options = {}) {
  const context = prepare(file, options), { root, packet } = context;
  const dir = directory(root, packet.run_id, packet.slice_id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try { fs.mkdirSync(dir); } catch (error) { if (error.code === 'EEXIST') fail('slice_exists'); throw error; }
  once(path.join(dir, 'run-slice.json'), packet);
  try {
    for (const { attempt, host, selection } of context.admitted) {
      inputs(root, packet);
      const argv = ['--to', attempt.host, '--instruction', attempt.instruction.path, '--permission', attempt.permission.path,
        '--worktree', attempt.worktree, '--timeout', String(packet.budget.attempt_timeout_seconds)];
      if (attempt.model !== null) argv.push('--model', attempt.model);
      if (packet.experimental_ack === true) argv.push('--ack-experimental');
      (options.launch || delegate.run)(argv, { projectRoot: root, attempt,
        resolveHostProfile: () => host, chooseExecutionDriver: () => selection });
    }
  } catch {
    once(path.join(dir, 'cancel.request'), { reason: 'launch_interrupted' });
    for (const attempt of packet.attempts) stop(attempt, context, options);
  }
  return wait(context, dir, options);
}

async function start(file, options = {}) { return begin(file, options); }

function retained(runId, sliceId, options) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), dir = directory(root, runId, sliceId);
  const packet = json(local(root, path.relative(root, path.join(dir, 'run-slice.json'))));
  shape(packet);
  if (packet.run_id !== runId || packet.slice_id !== sliceId || packet.primary_session_id !== options.sessionId) fail('session_mismatch');
  for (const attempt of packet.attempts) {
    local(root, attempt.instruction.path); local(root, attempt.permission.path); local(root, attempt.worktree);
  }
  return { context: { root, packet }, dir };
}
async function resume(runId, sliceId, options = {}) {
  const { context, dir } = retained(runId, sliceId, options);
  return wait(context, dir, options);
}
async function cancel(runId, sliceId, options = {}) {
  const { context, dir } = retained(runId, sliceId, options);
  once(local(context.root, path.relative(context.root, path.join(dir, 'cancel.request'))), { reason: 'explicit_cancel' });
  for (const attempt of context.packet.attempts) stop(attempt, context, options);
  return wait(context, dir, options);
}

function status(runId, sliceId, options = {}) {
  const { context, dir } = retained(runId, sliceId, options);
  const file = local(context.root, path.relative(context.root, path.join(dir, 'attention.json')));
  return fs.existsSync(file) ? json(file) : { $schema: 'ultra-slice-status-v1', run_id: runId, slice_id: sliceId, status: 'attention_pending' };
}

async function handle(argv, options = {}) {
  const [action, ...args] = argv, values = {};
  if (action === '--help' || action === 'help') return { usage: 'ubp slice run --packet <file> --session <native-id>; ubp slice status|cancel|reconcile --run <id> --slice <id> --session <native-id>' };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--packet', '--session', '--run', '--slice'].includes(key) || key in values || !args[i + 1]) fail('invalid_arguments');
    values[key] = args[i + 1];
  }
  options = { ...options, sessionId: values['--session'] };
  if (action === 'run' && values['--packet'] && !values['--run'] && !values['--slice']) return start(values['--packet'], options);
  if (['status', 'cancel', 'reconcile'].includes(action) && values['--run'] && values['--slice'] && !values['--packet']) {
    return ({ status, cancel, reconcile: resume })[action](values['--run'], values['--slice'], options);
  }
  fail('invalid_arguments');
}

if (require.main === module) handle(process.argv.slice(2)).then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
  .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { prepare, begin, start, resume, cancel, status, handle, directory, local, once, json };
