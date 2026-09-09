'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  ACP_PROTOCOL_VERSION,
  AgentExecutionDriver,
  BoundedCapture,
  DEFAULT_CAPTURE_LIMIT_BYTES,
  descendantSpawnEnv,
  executablePath,
  fileSha256,
  launchExecutionIdentityDrift,
  markWriterLaunching,
  observeWriterStart,
  resolveAcpEntry,
  rewindWriterNotStarted,
  terminateProcessGroup,
} = require('./agent-execution-driver.cjs');

const ENTRY_REQUEST_SCHEMA = 'acpx-delegate-turn-request/v1';
const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_AGENT_OUTPUT_BYTES = 1024 * 1024;
const MAX_EVENTS = 512;
const MAX_EVENT_BYTES = 512 * 1024;
// Bounded wait for the entry's own terminal line after a driver-side
// cancel/timeout signal; the driver's typed termination never depends on it.
const TERMINAL_GRACE_MS = 2000;
const STOP_REASONS = new Set([
  'end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled',
]);
const EVENT_PHASES = new Set(['initialized', 'created', 'cancel_requested', 'cancel_confirmed']);
const UPDATE_TYPES = new Set([
  'user_message_chunk', 'agent_message_chunk',
  'tool_call', 'tool_call_update', 'plan', 'available_commands_update',
  'current_mode_update', 'config_option_update', 'session_info_update',
  'usage_update',
]);
const STATUS_TAGS = new Set([
  'plan', 'available_commands_update', 'current_mode_update',
  'config_option_update', 'session_info_update', 'usage_update',
]);
const TOOL_KINDS = new Set([
  'read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch',
  'switch_mode', 'other',
]);
const TOOL_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed']);
const PERMISSION_DECISIONS = new Set([
  'allow_once', 'reject_once', 'reject_always', 'cancelled', 'denied',
]);
const PERMISSION_SCOPES = new Set([
  'inside_envelope', 'outside_envelope', 'operation_denied',
  'allow_once_unavailable', 'reject_option_unavailable',
]);

class AcpFailure extends Error {
  constructor(failureType, message) {
    super(message);
    this.failureType = failureType;
  }
}

function boundedCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

function projectedDerivedEvent(value) {
  if (!isObject(value) || !Number.isInteger(value.sequence)
      || value.sequence < 1 || value.sequence > MAX_EVENTS
      || typeof value.observed_at !== 'string'
      || value.observed_at.length > 32
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value.observed_at)
      || !Number.isFinite(Date.parse(value.observed_at))) {
    return null;
  }
  const event = {
    sequence: value.sequence,
    observed_at: value.observed_at,
    type: value.type,
  };
  if (value.type === 'protocol') {
    if (!EVENT_PHASES.has(value.phase) || value.phase === 'created') return null;
    event.phase = value.phase;
    if (value.phase === 'initialized') {
      if (value.protocol_version !== ACP_PROTOCOL_VERSION
          || !boundedCount(value.auth_method_count)) return null;
      event.protocol_version = value.protocol_version;
      event.auth_method_count = value.auth_method_count;
    }
    return event;
  }
  if (value.type === 'session') {
    if (value.phase !== 'created') return null;
    event.phase = value.phase;
    return event;
  }
  if (value.type === 'update') {
    if (!UPDATE_TYPES.has(value.update_type) || value.update_type === 'agent_thought_chunk') {
      return null;
    }
    event.update_type = value.update_type;
    if (['agent_message_chunk', 'user_message_chunk'].includes(value.update_type)) {
      if (value.content_type !== 'text') return null;
      event.content_type = value.content_type;
    } else if (['tool_call', 'tool_call_update'].includes(value.update_type)) {
      if (!(value.tool_kind === null || TOOL_KINDS.has(value.tool_kind))
          || !(value.tool_status === null || TOOL_STATUSES.has(value.tool_status))
          || !boundedCount(value.location_count)) return null;
      event.tool_kind = value.tool_kind;
      event.tool_status = value.tool_status;
      event.location_count = value.location_count;
    } else if (value.update_type === 'plan') {
      if (!boundedCount(value.entry_count)) return null;
      event.entry_count = value.entry_count;
    }
    return event;
  }
  if (value.type === 'notification') {
    if (value.method !== 'ignored_extension') return null;
    event.method = value.method;
    return event;
  }
  if (value.type === 'client_request') {
    if (value.method !== 'unsupported' || value.decision !== 'denied') return null;
    event.method = value.method;
    event.decision = value.decision;
    return event;
  }
  if (value.type === 'permission') {
    if (!TOOL_KINDS.has(value.tool_kind) || !PERMISSION_DECISIONS.has(value.decision)
        || !PERMISSION_SCOPES.has(value.scope)) return null;
    event.tool_kind = value.tool_kind;
    event.decision = value.decision;
    event.scope = value.scope;
    return event;
  }
  if (value.type === 'terminal') {
    if (!STOP_REASONS.has(value.stop_reason)) return null;
    event.stop_reason = value.stop_reason;
    return event;
  }
  return null;
}

class DerivedEventJournal {
  constructor(file) {
    this.file = file;
    this.count = 0;
    this.bytes = 0;
    fs.writeFileSync(file, '', { mode: 0o600 });
  }

  append(event) {
    if (this.count + 1 > MAX_EVENTS) {
      throw new AcpFailure('acp_event_limit', 'ACP derived event journal exceeded its physical limit.');
    }
    const payload = {
      sequence: this.count + 1,
      observed_at: new Date().toISOString(),
      ...event,
    };
    const projected = projectedDerivedEvent(payload);
    if (!projected) {
      throw new AcpFailure('acp_event_shape', 'ACP derived event has an invalid safe shape.');
    }
    const line = `${JSON.stringify(projected)}\n`;
    const bytes = Buffer.byteLength(line);
    if (this.bytes + bytes > MAX_EVENT_BYTES) {
      throw new AcpFailure('acp_event_limit', 'ACP derived event journal exceeded its physical limit.');
    }
    fs.appendFileSync(this.file, line);
    this.count += 1;
    this.bytes += bytes;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function isObject(value) {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function atOrInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

function nearestExistingAncestor(candidate) {
  let current = candidate;
  for (;;) {
    if (fs.existsSync(current)) return fs.realpathSync(current);
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function authorizedLocation(spec, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value) {
    return false;
  }
  const protectedRoot = path.join(spec.cwd, '.ultra');
  if (atOrInside(protectedRoot, value)) return false;
  const authorizedRoot = spec.writable_root_paths.find((root) => atOrInside(root, value));
  if (!authorizedRoot) return false;
  const ancestor = nearestExistingAncestor(value);
  let realRoot;
  try { realRoot = fs.realpathSync(authorizedRoot); } catch { return false; }
  return !!ancestor && atOrInside(realRoot, ancestor);
}

function permissionOption(options, kind) {
  return options.find((option) => (
    isObject(option) && typeof option.optionId === 'string' && option.kind === kind
  )) || null;
}

// The one product-owned permission decision. It consumes the raw
// RequestPermissionRequest the entry forwarded (toolCall kind/locations plus
// the exact options the Host offered) and answers with the exact selected
// optionId; the entry maps that optionId back to the matching ACP outcome and
// never upgrades allow_once to allow_always. A denied operation is recorded
// and stays denied while the bounded turn continues toward later probes; the
// final permission_denied terminal is published by the driver.
function permissionDecision(spec, params) {
  if (!isObject(params) || !isObject(params.toolCall) || !Array.isArray(params.options)) {
    throw new AcpFailure('acp_malformed_permission', 'ACP permission request is malformed.');
  }
  const tool = params.toolCall;
  const kind = TOOL_KINDS.has(tool.kind) ? tool.kind : 'other';
  let allowed = false;
  let scope = 'operation_denied';
  if (['read', 'search', 'think'].includes(kind)) {
    allowed = true;
    scope = 'inside_envelope';
  } else if (['edit', 'delete', 'move'].includes(kind)) {
    const locations = Array.isArray(tool.locations) ? tool.locations : [];
    allowed = !spec.read_only && locations.length > 0 && locations.every((location) => (
      isObject(location) && authorizedLocation(spec, location.path)
    ));
    scope = allowed ? 'inside_envelope' : 'outside_envelope';
  }
  let selected = allowed ? permissionOption(params.options, 'allow_once') : null;
  if (!selected) {
    allowed = false;
    if (scope === 'inside_envelope') scope = 'allow_once_unavailable';
    selected = permissionOption(params.options, 'reject_once')
      || permissionOption(params.options, 'reject_always');
  }
  if (!selected) {
    return {
      result: { outcome: { outcome: 'cancelled' } },
      allowed: false,
      optionId: null,
      decision: 'cancelled',
      scope: scope === 'inside_envelope' ? 'reject_option_unavailable' : scope,
      kind,
    };
  }
  return {
    result: { outcome: { outcome: 'selected', optionId: selected.optionId } },
    allowed,
    optionId: selected.optionId,
    decision: selected.kind,
    scope,
    kind,
  };
}

// Projects one ACPX runtime event onto the stable derived-event vocabulary.
// Returns the journal events plus any agent-output text; unknown update tags
// stay a typed protocol failure exactly as the stable-v1 contract requires.
function projectRuntimeEvent(event) {
  if (!isObject(event)) {
    throw new AcpFailure('acp_malformed_update', 'ACP runtime event must be an object.');
  }
  if (event.type === 'text_delta') {
    if (typeof event.text !== 'string') {
      throw new AcpFailure('acp_malformed_update', 'ACP text delta must carry text.');
    }
    if (event.stream === 'thought') return { events: [], text: '' };
    const updateType = event.tag === 'user_message_chunk' ? 'user_message_chunk' : 'agent_message_chunk';
    return {
      events: [{ type: 'update', update_type: updateType, content_type: 'text' }],
      text: updateType === 'agent_message_chunk' ? event.text : '',
    };
  }
  if (event.type === 'tool_call') {
    const tag = event.tag === 'tool_call_update' ? 'tool_call_update' : 'tool_call';
    return {
      events: [{
        type: 'update',
        update_type: tag,
        tool_kind: TOOL_KINDS.has(event.kind) ? event.kind : null,
        tool_status: typeof event.status === 'string' ? event.status : null,
        location_count: Array.isArray(event.locations) ? event.locations.length : 0,
      }],
      text: '',
    };
  }
  if (event.type === 'status') {
    const tag = typeof event.tag === 'string' ? event.tag : null;
    if (tag === null) {
      // Runtime-generated client-operation diagnostics carry no wire tag; they
      // are ignored observations, never a stable-v1 update and never content.
      return {
        events: [{ type: 'notification', method: 'ignored_extension' }],
        text: '',
      };
    }
    if (!STATUS_TAGS.has(tag)) {
      throw new AcpFailure(
        'acp_malformed_update',
        'ACP runtime status event is not part of stable v1.',
      );
    }
    return {
      events: [{
        type: 'update',
        update_type: tag,
        // The public entry surfaces no plan entries at this seam; zero is the
        // honest observation, never a synthesized count.
        ...(tag === 'plan' ? { entry_count: 0 } : {}),
      }],
      text: '',
    };
  }
  throw new AcpFailure(
    'acp_malformed_update',
    `ACP runtime event type is not part of stable v1 (${String(event.type)}).`,
  );
}

// One terminal projection of the entry's typed result line. Authentication
// failures keep their dedicated type so the existing CLI fallback gate can
// consume them, but only a structured `ensure_session` phase proves the
// startTurn call never happened — every later auth-shaped failure stays a
// plain typed failure and is never retried.
function terminalFromResult(result) {
  if (!isObject(result) || !['completed', 'cancelled', 'failed'].includes(result.status)) {
    throw new AcpFailure('acp_malformed_result', 'ACP entry result line has an invalid status.');
  }
  if (result.status === 'failed') {
    const message = isObject(result.error) && typeof result.error.message === 'string'
      ? result.error.message
      : 'ACP turn failed without an error message.';
    const code = isObject(result.error) && typeof result.error.code === 'string'
      ? result.error.code
      : '';
    const phase = isObject(result.error) && result.error.phase === 'ensure_session'
      ? 'ensure_session'
      : null;
    if (/auth/iu.test(message) || /auth/iu.test(code)) {
      throw Object.assign(
        new AcpFailure('acp_auth_required', 'ACP agent requires authentication outside this delegation.'),
        phase ? { failurePhase: phase } : {},
      );
    }
    throw Object.assign(
      new AcpFailure('acp_turn_failed', `ACP entry turn failed: ${message}`),
      phase ? { failurePhase: phase } : {},
    );
  }
  const stopReason = result.status === 'cancelled' ? 'cancelled' : result.stopReason;
  if (!STOP_REASONS.has(stopReason)) {
    throw new AcpFailure('acp_malformed_terminal', 'ACP entry result carried an invalid stopReason.');
  }
  return { stopReason };
}

class AcpDriver extends AgentExecutionDriver {
  async run() {
    const spec = this.spec;
    if (!path.isAbsolute(spec.cwd)) {
      return this.failure('acp_invalid_cwd', 'ACP cwd must be absolute.');
    }
    // The launch consumes the entry selection bound into the digest-bound
    // worker spec: the exact public entry resolved at admission, rechecked by
    // content before any Host process exists. A missing, unreadable, or
    // drifted entry fails closed; only a spec without the binding (built
    // outside the launcher) falls back to resolving the installed entry.
    let entryPath;
    if (spec.acp_entry !== undefined) {
      const bound = spec.acp_entry && typeof spec.acp_entry === 'object' ? spec.acp_entry : null;
      const boundPath = bound && typeof bound.path === 'string' && path.isAbsolute(bound.path)
        ? bound.path
        : null;
      const expected = bound && /^[0-9a-f]{64}$/u.test(String(bound.sha256 ?? ''))
        ? bound.sha256
        : null;
      const actual = boundPath ? fileSha256(boundPath) : null;
      if (!boundPath || !expected || !actual || actual !== expected) {
        return this.failure(
          'acp_execution_identity_mismatch',
          'The launch-bound public ACPX entry is missing, unreadable, or its content changed after admission; no ACP host was launched.',
        );
      }
      entryPath = boundPath;
    } else {
      entryPath = resolveAcpEntry();
      if (!entryPath) {
        return this.failure(
          'acp_entry_unavailable',
          'The public ACPX delegate entry is not installed or readable; no ACP host was launched.',
        );
      }
    }
    const hostEnv = descendantSpawnEnv(spec);
    // The entry requires an absolute executable. When the admission bound an
    // observed execution identity, the launch consumes the exact resolved
    // paths the selection verified — the bound adapter executable launches
    // directly instead of being re-resolved against the worker's PATH or cwd,
    // and every qualified component (adapter, the native runtime file the
    // adapter will consume, the entry bytes, and the SDK package metadata the
    // entry loads) is rechecked at those same paths. Drift after admission —
    // for example an ordinary runtime update between selection and this
    // detached launch — fails closed before any Host effect. Only a spec
    // without the binding (built outside the launcher) resolves the candidate
    // against the same sanitized environment the entry will pass on.
    let agentCommand;
    if (spec.execution_identity !== undefined) {
      const identity = spec.execution_identity && typeof spec.execution_identity === 'object'
        && !Array.isArray(spec.execution_identity)
        ? spec.execution_identity
        : null;
      const boundAdapter = identity
        && typeof identity.adapter_path === 'string' && path.isAbsolute(identity.adapter_path)
        ? identity.adapter_path
        : null;
      const boundRuntime = identity
        && typeof identity.runtime_path === 'string' && path.isAbsolute(identity.runtime_path)
        ? identity.runtime_path
        : null;
      const drift = launchExecutionIdentityDrift(identity, {
        adapterPath: boundAdapter,
        runtimePath: boundRuntime,
        entryPath,
        cwd: spec.cwd,
      });
      if (drift) {
        return this.failure(
          'acp_execution_identity_mismatch',
          `The launch-bound execution identity (${drift}) no longer matches the observed files; no ACP host was launched.`,
        );
      }
      agentCommand = boundAdapter;
    } else {
      agentCommand = executablePath(spec.command, hostEnv);
      if (!agentCommand) {
        return this.failure(
          'acp_command_unavailable',
          `The ACP candidate command ${String(spec.command)} is not executable in the sanitized delegation environment; no ACP host was launched.`,
        );
      }
    }
    // The launched writer-tree root is the entry process; the writer
    // observation therefore binds the real spawn argv, while the agent argv
    // travels digest-bound inside the request line.
    const launchSpec = { ...spec, command: process.execPath, args: [entryPath] };
    // A Host that cannot be observed must not be launched: without a durable
    // launching observation the writer boundary would stay unknowable.
    if (!markWriterLaunching(launchSpec)) {
      return this.failure(
        'writer_observation_unavailable',
        'The ACP host was not launched because its writer observation could not be persisted.',
      );
    }
    const journal = new DerivedEventJournal(spec.events);
    const stderr = new BoundedCapture(spec.capture_limit_bytes || DEFAULT_CAPTURE_LIMIT_BYTES);
    const childClosed = deferred();
    const fatal = deferred();
    const aborted = deferred();
    const terminalLine = deferred();
    let spawnError = null;
    let termination = null;
    let protocolVersion = null;
    let stopReason = null;
    let agentOutput = '';
    let permissionDenied = null;
    let expectedClose = false;
    let sawStarted = false;
    let transportFailed = false;
    let terminalArrived = false;
    // The entry reports the version its session store actually observed at
    // negotiation. This stays null when the entry observed none — an
    // initialization failure — and no typed result line may ever turn it
    // into a constant.
    let observedProtocolVersion = null;
    const child = spawn(process.execPath, [entryPath], {
      cwd: spec.cwd,
      // The entry copies its own process environment onto every Host it
      // starts, so the sanitized descendant view built from the digest-bound
      // spec is the single environment truth for the whole writer tree.
      env: hostEnv,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // A real adapter PID that was not durably recorded can never be proven
    // stopped later: the known child boundary is terminated immediately and
    // the driver fails before any protocol handshake or useful Host work.
    if (Number.isInteger(child.pid) && child.pid > 0 && !observeWriterStart(launchSpec, child)) {
      child.on('error', () => {});
      child.stdout.on('data', () => {});
      child.stderr.on('data', (chunk) => stderr.append(chunk));
      child.stdin.on('error', () => {});
      terminateProcessGroup(child, 'SIGKILL');
      try { child.stdin.end(); } catch {}
      stderr.write(spec.stderr);
      return this.failure(
        'writer_start_unobserved',
        'The ACP host PID existed but its started writer observation could not be persisted; the child boundary was terminated and no host work was performed.',
      );
    }
    child.stderr.on('data', (chunk) => stderr.append(chunk));
    child.stdout.setEncoding('utf8');
    let stdoutBuffer = '';
    const consumeLine = (line) => {
      if (!line.trim()) return;
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
        throw new AcpFailure('acp_message_too_large', 'ACP entry message exceeded the physical line limit.');
      }
      let message;
      try { message = JSON.parse(line); } catch {
        throw new AcpFailure('acp_malformed_message', 'ACP entry emitted malformed JSON.');
      }
      if (!isObject(message) || typeof message.type !== 'string') {
        throw new AcpFailure('acp_malformed_message', 'ACP entry message must be a typed object.');
      }
      if (message.type === 'started') {
        if (sawStarted || message.pid !== child.pid) {
          throw new AcpFailure('acp_entry_identity', 'ACP entry started line does not match the launched boundary.');
        }
        sawStarted = true;
        return;
      }
      if (message.type === 'event') {
        const projected = projectRuntimeEvent(message.event);
        for (const event of projected.events) journal.append(event);
        if (projected.text) {
          agentOutput += projected.text;
          if (Buffer.byteLength(agentOutput) > MAX_AGENT_OUTPUT_BYTES) {
            throw new AcpFailure('acp_output_limit', 'ACP agent output exceeded its physical limit.');
          }
        }
        return;
      }
      if (message.type === 'permission_request') {
        if (!Number.isInteger(message.id) || !isObject(message.request)) {
          throw new AcpFailure('acp_malformed_permission', 'ACP permission request is malformed.');
        }
        const decision = permissionDecision(spec, message.request.raw);
        child.stdin.write(`${JSON.stringify({
          type: 'permission_decision',
          id: message.id,
          optionId: decision.optionId,
        })}\n`);
        journal.append({
          type: 'permission',
          tool_kind: decision.kind,
          decision: decision.decision,
          scope: decision.scope,
        });
        if (!decision.allowed) permissionDenied = decision;
        return;
      }
      if (message.type === 'result') {
        terminalArrived = true;
        // The version is the entry's observed negotiation report beside its
        // typed terminal; absent or non-numeric means unobserved, never a
        // default, so a failed or completed line alone proves no version.
        observedProtocolVersion = typeof message.protocolVersion === 'number'
          ? message.protocolVersion
          : null;
        terminalLine.resolve(message.result);
        return;
      }
      throw new AcpFailure(
        'acp_malformed_message',
        `ACP entry message type is not part of stable v1 (${message.type}).`,
      );
    };
    child.stdout.on('data', (chunk) => {
      if (transportFailed) return;
      stdoutBuffer += chunk;
      if (Buffer.byteLength(stdoutBuffer) > MAX_MESSAGE_BYTES && !stdoutBuffer.includes('\n')) {
        transportFailed = true;
        fatal.resolve(new AcpFailure('acp_message_too_large', 'ACP entry message exceeded the physical line limit.'));
        return;
      }
      try {
        for (;;) {
          const newline = stdoutBuffer.indexOf('\n');
          if (newline < 0) break;
          const line = stdoutBuffer.slice(0, newline);
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          consumeLine(line);
        }
      } catch (error) {
        transportFailed = true;
        fatal.resolve(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code)) {
        fatal.resolve(new AcpFailure('acp_process_exit', 'The ACP entry stdin stream failed.'));
      }
    });
    child.on('error', (error) => {
      spawnError = error;
      fatal.resolve(new AcpFailure('spawn_error', 'ACP host process failed to start.'));
    });
    child.on('close', (code, signal) => {
      childClosed.resolve({ code, signal });
      if (!expectedClose && !termination) {
        fatal.resolve(new AcpFailure(
          'acp_process_exit',
          `The ACP entry exited before a terminal result (code ${code ?? 'null'}, signal ${signal || 'null'}).`,
        ));
      }
    });

    const cancelPoll = setInterval(() => {
      if (fs.existsSync(spec.cancel)) requestTermination('cancelled');
    }, 50);
    const timeout = setTimeout(() => requestTermination('timeout'), spec.timeout_ms);
    cancelPoll.unref();
    timeout.unref();
    function requestTermination(reason) {
      if (termination) return;
      termination = reason;
      aborted.resolve(new AcpFailure(reason, `ACP delegation ${reason}.`));
    }

    child.stdin.write(`${JSON.stringify({
      schema: ENTRY_REQUEST_SCHEMA,
      agent_argv: [agentCommand, ...spec.args],
      cwd: spec.cwd,
      prompt: spec.prompt,
      timeout_ms: spec.timeout_ms,
    })}\n`);

    // The driver owns the typed termination; the entry's own cancelled result
    // is a bounded transport acknowledgment, never the writer-stop proof. The
    // step promises carry permanent swallows so a late signal can never turn
    // into an unhandled rejection after the race has been decided.
    const fatalStep = fatal.promise.then((error) => { throw error; });
    const abortedStep = aborted.promise.then((error) => { throw error; });
    fatalStep.catch(() => {});
    abortedStep.catch(() => {});
    const awaitTerminal = () => Promise.race([
      terminalLine.promise,
      abortedStep,
      fatalStep,
    ]);

    const shutdown = async ({ graceful = false } = {}) => {
      expectedClose = true;
      if (graceful) {
        const closed = await Promise.race([childClosed.promise, delay(750).then(() => null)]);
        if (closed) return closed;
      } else if (!termination) {
        await Promise.race([childClosed.promise, delay(150).then(() => null)]);
      }
      terminateProcessGroup(child, 'SIGTERM');
      const closed = await Promise.race([childClosed.promise, delay(500).then(() => null)]);
      terminateProcessGroup(child, 'SIGKILL');
      return closed || await Promise.race([childClosed.promise, delay(500).then(() => ({ code: null, signal: 'SIGKILL' }))]);
    };

    let outcome;
    try {
      await awaitTerminal();
      // Only the entry's observed negotiation report — carried beside the
      // typed result line — establishes the protocol version; the line
      // itself, whatever terminal status it carries, does not.
      if (terminalArrived) protocolVersion = observedProtocolVersion;
      const terminal = terminalFromResult(await terminalLine.promise);
      stopReason = terminal.stopReason;
      journal.append({ type: 'terminal', stop_reason: stopReason });
      protocolVersion = observedProtocolVersion;
      if (termination) {
        outcome = { termination };
      } else if (stopReason === 'cancelled') {
        outcome = { termination: 'cancelled' };
      } else if (permissionDenied) {
        outcome = {
          failureType: 'permission_denied',
          failureSummary: `ACP ${permissionDenied.kind} request was denied (${permissionDenied.scope}).`,
        };
      } else if (agentOutput) {
        fs.writeFileSync(spec.host_output, agentOutput, { mode: 0o600 });
      }
      const closed = await shutdown({ graceful: true });
      outcome = {
        // The typed result line is the ACP transport terminal. Process exit
        // after that point is client-owned cleanup; adapters differ on the
        // exit code they use for EOF, so it stays an observation without
        // converting a completed turn into a task failure.
        code: 0,
        signal: null,
        adapterExitCode: closed?.code ?? null,
        adapterExitSignal: closed?.signal || null,
        termination: outcome?.termination || null,
        spawnError,
        protocolVersion,
        stopReason,
        ...outcome,
      };
    } catch (error) {
      const failure = error instanceof AcpFailure
        ? error
        : new AcpFailure('acp_protocol_error', 'ACP transport failed.');
      const wasTermination = ['cancelled', 'timeout'].includes(failure.failureType);
      if (spawnError && !Number.isInteger(child.pid)) {
        // An OS-confirmed spawn failure with no child PID restores an explicit
        // releasable not_started proof instead of freezing an impossible
        // writer behind an adapter that never existed.
        rewindWriterNotStarted(launchSpec, { allowedPriorPhases: ['launching'] });
      }
      if (wasTermination) {
        // Ask the entry to cancel its active turn through its own signal
        // handler, then bound how long its terminal line may take. A Windows
        // process tree cannot be addressed after its root PID exits, so the
        // tree is terminated while the entry is still alive there.
        if (process.platform === 'win32') {
          terminateProcessGroup(child, 'SIGTERM');
        } else {
          try { child.kill('SIGTERM'); } catch {}
        }
        await Promise.race([terminalLine.promise, delay(TERMINAL_GRACE_MS).then(() => null)]);
        if (terminalArrived) protocolVersion = observedProtocolVersion;
      }
      const closed = await shutdown({ graceful: false });
      outcome = {
        code: closed?.code ?? null,
        signal: closed?.signal || null,
        adapterExitCode: closed?.code ?? null,
        adapterExitSignal: closed?.signal || null,
        termination: wasTermination ? failure.failureType : null,
        spawnError,
        protocolVersion,
        stopReason,
        // The only pre-prompt proof: a structured ensure_session phase from
        // the entry's failed result, meaning startTurn was never called.
        ...(failure.failurePhase ? { failurePhase: failure.failurePhase } : {}),
        ...(wasTermination ? {} : {
          failureType: failure.failureType,
          failureSummary: failure.message,
        }),
      };
      stderr.append(`ultra-delegate ACP failure: ${failure.failureType}\n`);
    } finally {
      clearInterval(cancelPoll);
      clearTimeout(timeout);
      // Raw entry traffic is never persisted: safe observations live in the
      // derived journal and host_output only, so stdout.log stays empty like
      // the previous engine's protocol transcript artifact.
      fs.writeFileSync(spec.stdout, '', { mode: 0o600 });
      stderr.write(spec.stderr);
    }
    return outcome;
  }

  failure(failureType, failureSummary) {
    return {
      code: null,
      signal: null,
      termination: null,
      spawnError: null,
      protocolVersion: null,
      stopReason: null,
      adapterExitCode: null,
      adapterExitSignal: null,
      failureType,
      failureSummary,
    };
  }
}

module.exports = {
  AcpDriver,
  AcpFailure,
  DerivedEventJournal,
  permissionDecision,
  projectedDerivedEvent,
};
