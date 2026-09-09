'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, fork, spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const slice = require('./run-slice.cjs');
const delegate = require('./delegate.cjs');
const hosts = require('./host-profile.cjs');
const { signalOutcome, executablePath, terminateProcessGroup, DEFAULT_CAPTURE_LIMIT_BYTES } = require('./agent-execution-driver.cjs');
const { selectPiNative } = require('./pi-native-runtime.cjs');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw new Error(code); };
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(value);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sources = ['durable-run.cjs', 'pi-durable-primary.cjs', 'pi-primary.cjs', 'run-slice.cjs', 'host-profile.cjs',
  'pi-native-permissions.cjs', 'pi-native-runtime.cjs', 'delegate.cjs', 'delegate-worker.cjs',
  'agent-execution-driver.cjs', 'acp-driver.cjs', 'cli-driver.cjs', 'slice-channel.cjs', 'slice-workspace.cjs',
  'delegate-profiles/kimi-read-only.md', 'delegate-profiles/kimi-write.md'];
const sourceHashes = () => Object.fromEntries(sources.map((name) => [name, sha(fs.readFileSync(path.join(__dirname, name)))]));

function once(file, value) {
  const result = slice.once(file, value);
  for (const target of [file, path.dirname(file)]) {
    const fd = fs.openSync(target, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  return result;
}

function bound(root, ref) {
  if (!ref || Object.keys(ref).sort().join(',') !== 'path,sha256' || !/^[a-f0-9]{64}$/u.test(ref.sha256)) fail('invalid_reference');
  const file = slice.local(root, ref.path), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) fail('invalid_reference');
  const source = fs.readFileSync(file);
  if (sha(source) !== ref.sha256) fail('input_drift');
  return { file, source };
}

function authority(root, ref) {
  root = fs.realpathSync(root);
  if (!ref?.path?.startsWith('.ultra/decisions/')) fail('invalid_authority_ref');
  const grant = JSON.parse(bound(root, ref).source);
  if (grant.mode !== 'durable work-package') fail('durable_grant_required');
  const keys = ['$schema', 'mode', 'grant_id', 'repository', 'base_revision', 'change_id', 'run_id', 'slice_id',
    'owner_decision', 'intent', 'task_refs', 'permission', 'prompt', 'packet', 'model', 'expires_at', 'revoked_path',
    'max_fresh_turns', 'turn_timeout_seconds'];
  if (Object.keys(grant).filter((key) => key !== 'notification').sort().join(',') !== keys.sort().join(',') || grant.$schema !== 'ultra-durable-grant-v1'
      || ![grant.grant_id, grant.change_id, grant.run_id, grant.slice_id].every(validId)
      || typeof grant.model !== 'string' || !grant.model || grant.model.length > 256
      || !Array.isArray(grant.task_refs) || !grant.task_refs.length || grant.task_refs.length > 32
      || grant.max_fresh_turns !== 1 || !Number.isInteger(grant.turn_timeout_seconds)
      || grant.turn_timeout_seconds < 1 || grant.turn_timeout_seconds > 86400
      || typeof grant.expires_at !== 'string' || !Number.isFinite(Date.parse(grant.expires_at))) fail('invalid_durable_grant');
  if (grant.notification !== undefined && !['none', 'macos'].includes(grant.notification)) fail('invalid_notification');
  if (grant.notification === 'macos' && process.platform !== 'darwin') fail('notification_host_unsupported');
  if (grant.repository !== root || !/^[a-f0-9]{40,64}$/u.test(grant.base_revision)) fail('repository_mismatch');
  if (Date.now() >= Date.parse(grant.expires_at)) fail('grant_expired');
  if (typeof grant.revoked_path !== 'string' || !grant.revoked_path.startsWith('.ultra/decisions/')) fail('invalid_revocation_path');
  if (fs.existsSync(slice.local(root, grant.revoked_path))) fail('grant_revoked');
  if (grant.intent.path !== `.ultra/changes/active/${grant.change_id}/intent.md`
      || !grant.owner_decision.path.startsWith('.ultra/decisions/')) fail('invalid_authority_ref');
  const refs = [ref, grant.owner_decision, grant.intent, grant.permission, grant.prompt, grant.packet, ...grant.task_refs];
  for (const value of refs) bound(root, value);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (head !== grant.base_revision) fail('base_revision_mismatch');
  const envelope = JSON.parse(bound(root, grant.permission).source);
  if (Array.isArray(envelope.writable_roots) && envelope.writable_roots.some((value) => {
    const dir = slice.local(root, value);
    return refs.some((r) => delegate.fencePathsOverlap(dir, slice.local(root, r.path)))
      || delegate.fencePathsOverlap(dir, slice.local(root, '.ultra'))
      || delegate.fencePathsOverlap(dir, slice.local(root, '.git'));
  })) fail('writable_authority');
  const permission = delegate.readPermission(bound(root, grant.permission).file, root);
  return { root, grant, permission, ref };
}

// Boot identity is evidence, not a lease timeout. An unknown/different boot never
// licenses replay. No pid-only inference crosses a machine boundary.
function machine() {
  let boot;
  if (process.platform === 'linux') boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  else if (process.platform === 'darwin') boot = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).trim();
  else fail('durable_host_unsupported');
  if (!boot) fail('machine_identity_unknown');
  return { host: os.hostname(), boot };
}

function paths(root, id) {
  if (!validId(id)) fail('invalid_identity');
  return { dir: slice.local(root, `.ultra/.runtime/durable/${id}`),
    anchor: slice.local(root, `.ultra/evidence/durable/${id}/activation.json`) };
}

function register(ref, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  const { grant } = authority(root, ref), packet = JSON.parse(bound(root, grant.packet).source);
  if (!options.sessionId || packet.primary_session_id !== options.sessionId
      || packet.run_id !== grant.run_id || packet.slice_id !== grant.slice_id
      || !Number.isInteger(options.primaryPid) || options.primaryPid <= 0
      || signalOutcome(options.primaryPid) !== 'alive') fail('registration_identity_mismatch');
  const locations = paths(root, grant.grant_id), nonce = crypto.randomUUID();
  const record = { $schema: 'ultra-durable-registration-v1', state: 'registered', grant: ref, nonce,
    primary_session_id: options.sessionId, primary_pid: options.primaryPid, machine: machine(),
    source_hashes: sourceHashes(),
    notification: grant.notification || 'none',
    registered_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(locations.anchor), { recursive: true });
  // This non-disposable observation is not authorization. If the derived cursor
  // disappears, its presence prevents absence from becoming a fresh activation.
  const anchor = once(locations.anchor, { $schema: 'ultra-durable-activation-v1', nonce, grant: ref,
    registration_sha256: sha(JSON.stringify(record)) });
  if (anchor.nonce !== nonce) fail('already_registered');
  fs.mkdirSync(locations.dir, { recursive: true });
  once(path.join(locations.dir, 'registration.json'), record);
  return record;
}

function status(id, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), locations = paths(root, id);
  const file = slice.local(root, path.relative(root, path.join(locations.dir, 'registration.json')));
  if (!fs.existsSync(file)) fail('recovery_history_missing');
  const record = slice.json(file), anchor = slice.json(locations.anchor);
  if (record.nonce !== anchor.nonce || JSON.stringify(record.grant) !== JSON.stringify(anchor.grant)
      || sha(JSON.stringify(record)) !== anchor.registration_sha256) fail('recovery_history_mismatch');
  return record;
}

function claim(root, id) {
  const record = status(id, { projectRoot: root });
  const { grant } = authority(root, record.grant);
  if (JSON.stringify(machine()) !== JSON.stringify(record.machine)) fail('machine_identity_changed');
  const file = slice.local(root, path.relative(root, path.join(paths(root, id).dir, 'claim.json'))), nonce = crypto.randomUUID();
  const eventFile = slice.local(root, `.ultra/evidence/durable/events/${sha(`${grant.run_id}:${grant.slice_id}`)}/claim.json`);
  fs.mkdirSync(path.dirname(eventFile), { recursive: true });
  const value = once(eventFile, { $schema: 'ultra-durable-claim-v1', nonce, registration_nonce: record.nonce,
    state: 'delivery_unknown', pid: process.pid, machine: record.machine, claimed_at: new Date().toISOString() });
  if (value.nonce === nonce) once(file, value);
  return { acquired: value.nonce === nonce, claim: value };
}

function ready(root, id) {
  const record = status(id, { projectRoot: root }), context = authority(root, record.grant);
  if (JSON.stringify(record.source_hashes) !== JSON.stringify(sourceHashes())) fail('durable_source_changed');
  if (JSON.stringify(machine()) !== JSON.stringify(record.machine)) fail('machine_identity_changed');
  const dir = paths(root, id).dir, supervisor = slice.json(slice.local(root, path.relative(root, path.join(dir, 'supervisor.json'))));
  if (!Number.isInteger(supervisor.pid) || supervisor.pid <= 0 || supervisor.registration_nonce !== record.nonce
      || signalOutcome(supervisor.pid) !== 'dead' || signalOutcome(record.primary_pid) !== 'dead') fail('previous_process_not_stopped');
  const packet = JSON.parse(bound(root, context.grant.packet).source);
  const retainedPacket = slice.json(path.join(slice.directory(root, packet.run_id, packet.slice_id), 'run-slice.json'));
  if (JSON.stringify(packet) !== JSON.stringify(retainedPacket)) fail('retained_packet_changed');
  for (const ref of [packet.intent, packet.grant, packet.profile, packet.seam,
    ...packet.task_refs.map(({ path: file, sha256 }) => ({ path: file, sha256 })),
    ...packet.attempts.flatMap((attempt) => [attempt.instruction, attempt.permission])]) bound(root, ref);
  const attention = slice.status(context.grant.run_id, context.grant.slice_id,
    { projectRoot: root, sessionId: record.primary_session_id });
  if (attention.$schema !== 'ultra-attention-v1' || attention.reason !== 'wave_terminal'
      || attention.packet_sha256 !== sha(fs.readFileSync(path.join(slice.directory(root, packet.run_id, packet.slice_id), 'run-slice.json')))
      || attention.event_key !== `${packet.run_id}:${packet.slice_id}`) fail('attention_not_ready');
  const delivery = slice.local(root, path.relative(root, path.join(slice.directory(root, packet.run_id, packet.slice_id), 'delivery.json')));
  if (fs.existsSync(delivery)) fail('prior_delivery_unresolved');
  for (const attempt of packet.attempts) {
    const observation = slice.observe(attempt, { root, packet });
    const retained = attention.attempts.find((value) => value.attempt_id === attempt.id);
    if (!['finished', 'blocked', 'failed'].includes(observation.state)
        || !retained || JSON.stringify(observation.result) !== JSON.stringify(retained.result)) fail('writer_or_result_unknown');
    bound(root, observation.result);
  }
  return { ...context, record, attention, dir };
}

function open(ref, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  const { grant } = authority(root, ref);
  const context = slice.prepare(grant.packet.path, options);
  if (context.packet.run_id !== grant.run_id || context.packet.slice_id !== grant.slice_id
      || context.packet.change_id !== grant.change_id || context.packet.intent.sha256 !== grant.intent.sha256
      || context.packet.base_revision !== grant.base_revision
      || Date.parse(context.packet.budget.deadline_at) > Date.parse(grant.expires_at)
      || context.packet.task_refs.some((task) => !grant.task_refs.some((ref) => ref.path === task.path && ref.sha256 === task.sha256))) fail('grant_packet_mismatch');
  // No auto-discovery: this public operation follows the owner's explicit
  // durable selection. Existing registrations must use observation, not open.
  register(ref, options);
  const child = fork(__filename, ['--operate', grant.grant_id], { cwd: root, detached: true,
    env: hosts.descendantEnvViews(process.env, hosts.hostProfile('pi')).worker,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.disconnect(); child.unref();
  return { status: 'durable_waiting', grant_id: grant.grant_id, conductor_pid: child.pid };
}

async function operate(id, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), record = status(id, { projectRoot: root });
  if (JSON.stringify(record.source_hashes) !== JSON.stringify(sourceHashes())) fail('durable_source_changed');
  const { grant } = authority(root, record.grant), dir = paths(root, id).dir;
  const supervisorNonce = crypto.randomUUID();
  const launch = once(path.join(dir, 'supervisor-claim.json'), { nonce: supervisorNonce, pid: process.pid });
  if (launch.nonce !== supervisorNonce) fail('supervisor_already_claimed');
  const log = fs.openSync(path.join(dir, 'supervisor.log'), 'ax');
  let child, timer, cancelReason = null, cancelling = false;
  try {
    authority(root, record.grant);
    child = spawn(process.execPath, [path.join(__dirname, 'run-slice.cjs'), 'run', '--packet', grant.packet.path,
      '--session', record.primary_session_id], { cwd: root,
      env: hosts.descendantEnvViews(process.env, hosts.hostProfile('pi')).worker, stdio: ['ignore', log, log] });
    once(path.join(dir, 'supervisor.json'), { registration_nonce: record.nonce, pid: child.pid, machine: record.machine });
    timer = setInterval(() => {
      try { authority(root, record.grant); }
      catch (error) {
        cancelReason ||= error.message;
        if (!cancelling) {
          cancelling = true;
          slice.cancel(grant.run_id, grant.slice_id, { projectRoot: root, sessionId: record.primary_session_id })
            .catch(() => { cancelling = false; });
        }
      }
    }, 250);
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  } finally { clearInterval(timer); fs.closeSync(log); }
  if (cancelReason) fail(cancelReason);
  while (signalOutcome(record.primary_pid) === 'alive') {
    authority(root, record.grant);
    await delay(250); // Process observation only; never idle model polling.
  }
  return wake(id, { projectRoot: root });
}

function inspect(id, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), record = status(id, { projectRoot: root });
  const dir = paths(root, id).dir;
  const read = (name) => {
    const file = slice.local(root, path.relative(root, path.join(dir, name)));
    return fs.existsSync(file) ? slice.json(file) : null;
  };
  const outcome = read('outcome.json'), attention = read('attention-required.json');
  let claimed = read('claim.json');
  let currentAuthority = 'valid';
  try { authority(root, record.grant); } catch (error) { currentAuthority = error.message; }
  if (!claimed) {
    try {
      const grant = JSON.parse(bound(root, record.grant).source);
      const eventFile = slice.local(root, `.ultra/evidence/durable/events/${sha(`${grant.run_id}:${grant.slice_id}`)}/claim.json`);
      if (fs.existsSync(eventFile)) claimed = slice.json(eventFile);
    } catch { currentAuthority = currentAuthority === 'valid' ? 'recovery_history_unknown' : currentAuthority; }
  }
  return { grant_id: id, state: outcome?.status || attention?.status
      || (claimed ? 'delivery_unknown' : currentAuthority === 'valid' ? 'registered' : 'owner_attention'),
    authority: currentAuthority, registration: record, outcome, attention, claim: claimed };
}

async function revoke(id, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), record = status(id, { projectRoot: root });
  const grant = JSON.parse(bound(root, record.grant).source);
  if (typeof grant.revoked_path !== 'string' || !grant.revoked_path.startsWith('.ultra/decisions/')) fail('invalid_revocation_path');
  once(slice.local(root, grant.revoked_path), { reason: 'explicit_owner_revocation', grant: record.grant, observed_at: new Date().toISOString() });
  try { await slice.cancel(grant.run_id, grant.slice_id, { projectRoot: root, sessionId: record.primary_session_id }); }
  catch { /* The durable observer retains a not-yet-started or unknown slice. */ }
  return inspect(id, { projectRoot: root });
}

function notify(id, result, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd()), record = status(id, { projectRoot: root });
  if (record.notification !== 'macos') return { status: 'not_requested' };
  const file = slice.local(root, `.ultra/evidence/durable/${id}/notification-request.json`), nonce = crypto.randomUUID();
  const request = once(file, { nonce, status: 'delivery_unknown', registration_nonce: record.nonce, observed_at: new Date().toISOString() });
  if (request.nonce !== nonce) return { status: 'already_requested' };
  const message = result.status === 'consumed' ? `Checkpoint ${id} finished its authorized turn.` : `Checkpoint ${id} needs your attention.`;
  let observation;
  try {
    (options.execute || execFileSync)('/usr/bin/osascript', ['-e', 'on run argv\n display notification (item 1 of argv) with title "Ultra Builder Pro"\nend run', message],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    observation = { status: 'os_request_accepted', delivered_to_user: 'unverified' };
  } catch (error) { observation = { status: 'notification_unavailable', error: error.code || 'osascript_failed' }; }
  once(path.join(paths(root, id).dir, 'notification-result.json'), observation);
  return observation;
}

function reportFailure(id, reason, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  const file = slice.local(root, path.relative(root, path.join(paths(root, id).dir, 'attention-required.json')));
  const observation = once(file, { status: 'owner_attention', reason, observed_at: new Date().toISOString() });
  notify(id, observation, { projectRoot: root });
  return observation;
}

function recordConsumption(root, record, dir, outcome, deadline) {
  authority(root, record.grant);
  if (Date.now() >= deadline) fail('fresh_turn_deadline');
  return once(path.join(dir, 'outcome.json'), outcome);
}

async function handle(argv, options = {}) {
  const [action, flag, id, ...rest] = argv;
  if (['help', '--help'].includes(action)) return { usage: 'ubp slice durable status|wake|revoke --grant <grant-id>',
    registration: 'In the selected native Pi session, use ultra_durable with the project-relative owner grant filename. Files alone never register a checkpoint.' };
  if (flag !== '--grant' || !validId(id) || rest.length) fail('invalid_arguments');
  if (action === 'status') return inspect(id, options);
  if (action === 'revoke') return revoke(id, options);
  if (action === 'wake') return wake(id, options);
  fail('invalid_arguments');
}

async function wake(id, options = {}) {
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  const { record, grant, attention, dir } = ready(root, id);
  const profile = hosts.hostProfile('pi'), env = hosts.descendantEnvViews(process.env, profile).worker;
  const identity = selectPiNative(executablePath('pi'), env, profile);
  const acquired = claim(root, id);
  if (!acquired.acquired) {
    const outcome = path.join(dir, 'outcome.json');
    return fs.existsSync(outcome) ? slice.json(outcome) : { status: 'delivery_unknown', grant_id: id };
  }
  const config = { root, grant_id: id, registration_nonce: record.nonce, claim_nonce: acquired.claim.nonce,
    native_tools_module: path.join(identity.package_root, 'dist/core/tools/index.js') };
  const input = `${bound(root, grant.prompt).source.toString('utf8')}\n\nDurable checkpoint ${acquired.claim.nonce}\n${JSON.stringify(attention)}\nVerify the exact owner grant ${record.grant.path} and its cited intent/task references before continuing. Work only inside that grant. The old Primary and finite Supervisor are stopped. This is one fresh Primary turn, not an instruction to repeat workers. Preserve original results and receipts. Finish with one raw JSON object matching ${JSON.stringify({ $schema: "ultra-durable-consumption-v1", event_key: attention.event_key, claim_nonce: acquired.claim.nonce, decision: "Your factual outcome and remaining work as one nonempty string." })}. Keep decision a string, not an object or array, and omit Markdown fences. A final answer records attention consumption only, never product acceptance or permission to finalize.`;
  const log = fs.openSync(path.join(dir, 'native.jsonl'), 'ax'), errors = fs.openSync(path.join(dir, 'native-stderr.log'), 'ax');
  let child, timer, closed, buffer = '', events = [], nativeError = null, capturedBytes = 0;
  const decoder = new StringDecoder('utf8');
  try {
    ready(root, id); // Last boundary before the irreversible native input.
    once(path.join(dir, 'pre-dispatch.json'), { primary_pid: record.primary_pid, primary_state: 'stopped',
      supervisor: slice.json(path.join(dir, 'supervisor.json')), supervisor_state: 'stopped',
      machine: record.machine, observed_at: new Date().toISOString(), claim_nonce: acquired.claim.nonce });
    child = spawn(identity.node_path, [identity.runtime_path, '--print', '--mode', 'json', '--offline', '--no-extensions',
      '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-builtin-tools',
      '--extension', path.join(__dirname, 'pi-durable-primary.cjs'), '--session-dir', path.join(dir, 'sessions'),
      '--model', grant.model, '--', input], { cwd: root, detached: true,
      env: { ...env, PI_TELEMETRY: '0', UBP_PI_DURABLE_CONFIG: JSON.stringify(config) }, stdio: ['ignore', 'pipe', errors] });
    closed = new Promise((resolve) => { child.once('error', (error) => resolve({ error: error.code })); child.once('close', (code, signal) => resolve({ code, signal })); });
    once(path.join(dir, 'native-start.json'), { pid: child.pid, registration_nonce: record.nonce, identity, claim_nonce: acquired.claim.nonce });
    const stop = () => terminateProcessGroup(child, 'SIGKILL');
    const deadline = Math.min(Date.now() + grant.turn_timeout_seconds * 1000, Date.parse(grant.expires_at));
    timer = setInterval(() => {
      try {
        authority(root, record.grant);
        if (Date.now() >= deadline) fail('fresh_turn_deadline');
        if (fs.fstatSync(errors).size > DEFAULT_CAPTURE_LIMIT_BYTES) fail('native_capture_limit');
      }
      catch (error) { nativeError ||= error.message; stop(); }
    }, 100);
    child.stdout.on('data', (chunk) => {
      capturedBytes += chunk.length;
      if (capturedBytes > DEFAULT_CAPTURE_LIMIT_BYTES) { nativeError ||= 'native_capture_limit'; stop(); return; }
      try { fs.writeSync(log, chunk); } catch (error) { nativeError ||= `native_log_${error.code}`; stop(); return; }
      buffer += decoder.write(chunk);
      for (;;) {
        const index = buffer.indexOf('\n'); if (index < 0) break;
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (line.trim()) { try { events.push(JSON.parse(line)); } catch { nativeError ||= 'invalid_native_stream'; } }
      }
    });
    const exit = await closed;
    clearInterval(timer);
    once(path.join(dir, 'native-exit.json'), exit);
    if (buffer.trim() || exit.code !== 0 || nativeError || events.at(-1)?.type !== 'agent_settled'
        || signalOutcome(child.pid) !== 'dead' || signalOutcome(-child.pid) !== 'dead') fail(nativeError || 'fresh_turn_unknown');
    const policy = fs.readFileSync(path.join(dir, 'native-stderr.log'), 'utf8').split('\n').flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    const policyReady = policy.filter((event) => event.type === 'ultra_durable_ready');
    const decisions = policy.filter((event) => event.type === 'ultra_durable_permission');
    const starts = events.filter((event) => event.type === 'tool_execution_start');
    const ends = events.filter((event) => event.type === 'tool_execution_end');
    if (policyReady.length !== 1 || policyReady[0].claim_nonce !== acquired.claim.nonce
        || JSON.stringify([...policyReady[0].tools].sort()) !== JSON.stringify(['bash', 'edit', 'find', 'grep', 'ls', 'powershell', 'read', 'write'])
        || starts.length !== ends.length || ends.length !== decisions.length
        || starts.some((start) => !ends.some((end) => end.toolCallId === start.toolCallId && end.toolName === start.toolName && events.indexOf(end) > events.indexOf(start)))
        || new Set(decisions.map((decision) => decision.tool_call_id)).size !== decisions.length
        || ends.some((end) => !decisions.some((decision) => decision.tool_call_id === end.toolCallId && decision.tool_name === end.toolName
          && ['allow_once', 'reject_once'].includes(decision.decision) && (decision.decision !== 'reject_once' || end.isError === true)))) fail('durable_permission_unobserved');
    const session = events.find((event) => event.type === 'session')?.id;
    const message = events.filter((event) => event.type === 'message_end' && event.message?.role === 'assistant').at(-1)?.message;
    const content = message?.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    let result; try { result = JSON.parse(content); } catch { fail('consumption_unconfirmed'); }
    if (!session || session === record.primary_session_id || policyReady[0].session_id !== session || message.stopReason !== 'stop'
        || result.$schema !== 'ultra-durable-consumption-v1' || result.event_key !== attention.event_key
        || result.claim_nonce !== acquired.claim.nonce || typeof result.decision !== 'string' || !result.decision.trim()) fail('consumption_unconfirmed');
    const outcome = { status: 'consumed', grant_id: id, session_id: session, event_key: attention.event_key,
      claim_nonce: acquired.claim.nonce, result, stopped: true,
      permission_denials: decisions.filter((decision) => decision.decision === 'reject_once').length,
      observed_at: new Date().toISOString() };
    recordConsumption(root, record, dir, outcome, deadline);
    return outcome;
  } finally {
    clearInterval(timer);
    if (child?.pid && signalOutcome(-child.pid) !== 'dead') {
      terminateProcessGroup(child, 'SIGKILL');
      if (closed) await Promise.race([closed, delay(5000)]);
    }
    fs.closeSync(log); fs.closeSync(errors);
  }
}

if (require.main === module) {
  const action = process.argv[2], id = process.argv[3];
  (action === '--operate' ? operate(id) : action === '--wake' ? wake(id) : Promise.reject(new Error('invalid_arguments')))
    .then((value) => { notify(id, value); process.stdout.write(`${JSON.stringify(value)}\n`); }).catch((error) => {
      try {
        reportFailure(id, error.message);
      } catch { /* Missing history is never re-created as permission to launch. */ }
      process.stderr.write(`${error.message}\n`); process.exitCode = 1;
    });
}
module.exports = { authority, bound, register, status, claim, machine, paths, ready, open, operate, wake, sourceHashes, inspect, revoke, notify, reportFailure, recordConsumption, handle };
