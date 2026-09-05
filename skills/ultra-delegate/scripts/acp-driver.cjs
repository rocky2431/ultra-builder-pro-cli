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
  markWriterLaunching,
  observeWriterStart,
  rewindWriterNotStarted,
  terminateProcessGroup,
} = require('./agent-execution-driver.cjs');

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_AGENT_OUTPUT_BYTES = 1024 * 1024;
const MAX_EVENTS = 512;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_EARLY_SESSION_UPDATES = 32;
const MAX_EARLY_SESSION_UPDATE_BYTES = 256 * 1024;
const STOP_REASONS = new Set([
  'end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled',
]);
const UPDATE_TYPES = new Set([
  'user_message_chunk', 'agent_message_chunk', 'agent_thought_chunk',
  'tool_call', 'tool_call_update', 'plan', 'available_commands_update',
  'current_mode_update', 'config_option_update', 'session_info_update',
  'usage_update',
]);
const EARLY_SESSION_UPDATE_TYPES = new Set([
  'available_commands_update', 'current_mode_update', 'config_option_update',
  'session_info_update',
]);
const TOOL_KINDS = new Set([
  'read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch',
  'switch_mode', 'other',
]);
const TOOL_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed']);
const EVENT_PHASES = new Set(['initialized', 'created', 'cancel_requested', 'cancel_confirmed']);
const EVENT_METHODS = new Set(['ignored_extension', 'unsupported']);
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

class AcpRpcError extends Error {
  constructor(error) {
    super(typeof error?.message === 'string' ? error.message : 'ACP request failed');
    this.code = Number.isInteger(error?.code) ? error.code : null;
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
      decision: 'cancelled',
      scope: scope === 'inside_envelope' ? 'reject_option_unavailable' : scope,
      kind,
    };
  }
  return {
    result: { outcome: { outcome: 'selected', optionId: selected.optionId } },
    allowed,
    decision: selected.kind,
    scope,
    kind,
  };
}

class JsonRpcConnection {
  constructor(child, { onNotification, onRequest, onFatal }) {
    this.child = child;
    this.onNotification = onNotification;
    this.onRequest = onRequest;
    this.onFatal = onFatal;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.failed = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.consume(chunk));
    child.stdin.on('error', (error) => {
      if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes(error.code)) this.fail(error);
    });
  }

  send(payload) {
    if (this.failed || this.child.stdin.destroyed) return false;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...payload })}\n`);
    return true;
  }

  request(method, params) {
    const id = this.nextId++;
    const pending = deferred();
    this.pending.set(id, pending);
    if (!this.send({ id, method, params })) {
      this.pending.delete(id);
      pending.reject(new AcpFailure('acp_process_exit', 'ACP process closed before request delivery.'));
    }
    return pending.promise;
  }

  notification(method, params) {
    this.send({ method, params });
  }

  consume(chunk) {
    if (this.failed) return;
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_MESSAGE_BYTES && !this.buffer.includes('\n')) {
      this.fail(new AcpFailure('acp_message_too_large', 'ACP message exceeded the physical line limit.'));
      return;
    }
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
        this.fail(new AcpFailure('acp_message_too_large', 'ACP message exceeded the physical line limit.'));
        return;
      }
      let message;
      try { message = JSON.parse(line); } catch {
        this.fail(new AcpFailure('acp_malformed_message', 'ACP emitted malformed JSON.'));
        return;
      }
      try { this.handle(message); } catch (error) { this.fail(error); return; }
    }
  }

  handle(message) {
    if (!isObject(message) || message.jsonrpc !== '2.0') {
      throw new AcpFailure('acp_malformed_message', 'ACP message must be a JSON-RPC 2.0 object.');
    }
    if ('id' in message && !('method' in message) && ('result' in message || 'error' in message)) {
      const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
      const hasError = Object.prototype.hasOwnProperty.call(message, 'error');
      if (hasResult === hasError) {
        throw new AcpFailure(
          'acp_malformed_message',
          'ACP response must contain exactly one of result or error.',
        );
      }
      if (hasError && (!isObject(message.error) || !Number.isInteger(message.error.code)
        || typeof message.error.message !== 'string')) {
        throw new AcpFailure('acp_malformed_message', 'ACP response error is malformed.');
      }
      const pending = this.pending.get(message.id);
      if (!pending) throw new AcpFailure('acp_unknown_response', 'ACP response id was not pending.');
      this.pending.delete(message.id);
      if (hasError) pending.reject(new AcpRpcError(message.error));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string' && 'id' in message) {
      this.onRequest(message);
      return;
    }
    if (typeof message.method === 'string' && !('id' in message)) {
      this.onNotification(message);
      return;
    }
    throw new AcpFailure('acp_malformed_message', 'ACP message has no valid request, response, or notification shape.');
  }

  respond(id, result) {
    this.send({ id, result });
  }

  respondError(id, code, message) {
    this.send({ id, error: { code, message } });
  }

  close(error = new AcpFailure('acp_process_exit', 'ACP process exited before the request completed.')) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  fail(error) {
    if (this.failed) return;
    this.failed = true;
    this.close(error);
    this.onFatal(error instanceof Error ? error : new Error(String(error)));
  }
}

class AcpDriver extends AgentExecutionDriver {
  async run() {
    const spec = this.spec;
    if (!path.isAbsolute(spec.cwd)) {
      return this.failure('acp_invalid_cwd', 'ACP cwd must be absolute.');
    }
    // A Host that cannot be observed must not be launched: without a durable
    // launching observation the writer boundary would stay unknowable.
    if (!markWriterLaunching(spec)) {
      return this.failure(
        'writer_observation_unavailable',
        'The ACP host was not launched because its writer observation could not be persisted.',
      );
    }
    const journal = new DerivedEventJournal(spec.events);
    const stderr = new BoundedCapture(spec.capture_limit_bytes || DEFAULT_CAPTURE_LIMIT_BYTES);
    const protocolStdout = new BoundedCapture(spec.capture_limit_bytes || DEFAULT_CAPTURE_LIMIT_BYTES);
    const childClosed = deferred();
    const fatal = deferred();
    const aborted = deferred();
    let spawnError = null;
    let termination = null;
    let protocolVersion = null;
    let sessionId = null;
    let stopReason = null;
    let agentOutput = '';
    let permissionDenied = null;
    let promptPromise = null;
    let expectedClose = false;
    let sessionCreationPending = false;
    let earlySessionUpdateBytes = 0;
    let earlySessionUpdates = [];
    const pendingPermissions = new Map();
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: descendantSpawnEnv(spec),
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // A real adapter PID that was not durably recorded can never be proven
    // stopped later: the known child boundary is terminated immediately and
    // the driver fails before any protocol handshake or useful Host work.
    if (Number.isInteger(child.pid) && child.pid > 0 && !observeWriterStart(spec, child)) {
      child.on('error', () => {});
      child.stdout.on('data', () => {});
      child.stderr.on('data', (chunk) => stderr.append(chunk));
      child.stdin.on('error', () => {});
      terminateProcessGroup(child, 'SIGKILL');
      try { child.stdin.end(); } catch {}
      protocolStdout.write(spec.stdout);
      stderr.write(spec.stderr);
      return this.failure(
        'writer_start_unobserved',
        'The ACP host PID existed but its started writer observation could not be persisted; the child boundary was terminated and no host work was performed.',
      );
    }
    child.stderr.on('data', (chunk) => stderr.append(chunk));
    child.on('error', (error) => {
      spawnError = error;
      fatal.resolve(new AcpFailure('spawn_error', 'ACP host process failed to start.'));
    });
    child.on('close', (code, signal) => {
      childClosed.resolve({ code, signal });
      if (!expectedClose) connection.close();
    });

    const appendEvent = (event) => journal.append(event);

    const handleUpdate = (message) => {
      const params = message.params;
      const envelopeValid = isObject(params)
        && typeof params.sessionId === 'string'
        && params.sessionId.length > 0
        && isObject(params.update);
      if (!envelopeValid) {
        throw new AcpFailure(
          'acp_malformed_update',
          'ACP session/update envelope is invalid '
            + `(params_object=${isObject(params)}, session_id_type=${typeof params?.sessionId}, `
            + `session_established=${typeof sessionId === 'string'}, `
            + `session_matches=${params?.sessionId === sessionId}, update_object=${isObject(params?.update)}).`,
        );
      }
      if (sessionId === null && sessionCreationPending) {
        const updateType = params.update.sessionUpdate;
        if (!EARLY_SESSION_UPDATE_TYPES.has(updateType)) {
          throw new AcpFailure(
            'acp_early_update_type',
            'ACP emitted a non-metadata session update before session/new completed.',
          );
        }
        const messageBytes = Buffer.byteLength(JSON.stringify(message));
        if (earlySessionUpdates.length >= MAX_EARLY_SESSION_UPDATES
            || earlySessionUpdateBytes + messageBytes > MAX_EARLY_SESSION_UPDATE_BYTES) {
          throw new AcpFailure(
            'acp_early_update_limit',
            'ACP pre-session metadata exceeded its physical buffer limit.',
          );
        }
        earlySessionUpdateBytes += messageBytes;
        earlySessionUpdates.push(message);
        return;
      }
      if (params.sessionId !== sessionId) {
        throw new AcpFailure(
          'acp_malformed_update',
          'ACP session/update envelope is invalid '
            + `(params_object=true, session_id_type=string, `
            + `session_established=${typeof sessionId === 'string'}, `
            + 'session_matches=false, update_object=true).',
        );
      }
      const update = params.update;
      const updateType = update.sessionUpdate;
      if (!UPDATE_TYPES.has(updateType)) {
        throw new AcpFailure('acp_malformed_update', 'ACP session/update type is not part of stable v1.');
      }
      if (updateType === 'agent_thought_chunk') return;
      if (['agent_message_chunk', 'user_message_chunk'].includes(updateType)) {
        if (!isObject(update.content) || update.content.type !== 'text'
          || typeof update.content.text !== 'string') {
          throw new AcpFailure('acp_malformed_update', 'ACP message chunk must contain text content.');
        }
        if (updateType === 'agent_message_chunk') {
          agentOutput += update.content.text;
          if (Buffer.byteLength(agentOutput) > MAX_AGENT_OUTPUT_BYTES) {
            throw new AcpFailure('acp_output_limit', 'ACP agent output exceeded its physical limit.');
          }
        }
        appendEvent({ type: 'update', update_type: updateType, content_type: 'text' });
        return;
      }
      if (['tool_call', 'tool_call_update'].includes(updateType)) {
        if (typeof update.toolCallId !== 'string' || !update.toolCallId) {
          throw new AcpFailure('acp_malformed_update', 'ACP tool update requires a toolCallId.');
        }
        appendEvent({
          type: 'update',
          update_type: updateType,
          tool_kind: TOOL_KINDS.has(update.kind) ? update.kind : null,
          tool_status: typeof update.status === 'string' ? update.status : null,
          location_count: Array.isArray(update.locations) ? update.locations.length : 0,
        });
        return;
      }
      appendEvent({
        type: 'update',
        update_type: updateType,
        ...(updateType === 'plan'
          ? { entry_count: Array.isArray(update.entries) ? update.entries.length : 0 }
          : {}),
      });
    };

    const connection = new JsonRpcConnection(child, {
      onFatal: (error) => fatal.resolve(error),
      onNotification: (message) => {
        try {
          if (message.method === 'session/update') handleUpdate(message);
          else appendEvent({ type: 'notification', method: 'ignored_extension' });
        } catch (error) { fatal.resolve(error); }
      },
      onRequest: (message) => {
        if (message.method !== 'session/request_permission') {
          connection.respondError(message.id, -32601, 'Client method is not available.');
          appendEvent({ type: 'client_request', method: 'unsupported', decision: 'denied' });
          return;
        }
        const pending = { responded: false };
        pendingPermissions.set(message.id, pending);
        try {
          if (message.params?.sessionId !== sessionId) {
            throw new AcpFailure('acp_malformed_permission', 'ACP permission session does not match.');
          }
          const decision = permissionDecision(spec, message.params);
          pending.responded = true;
          connection.respond(message.id, decision.result);
          pendingPermissions.delete(message.id);
          appendEvent({
            type: 'permission',
            tool_kind: decision.kind,
            decision: decision.decision,
            scope: decision.scope,
          });
          if (!decision.allowed) {
            permissionDenied = decision;
            fatal.resolve(new AcpFailure(
              'permission_denied',
              `ACP ${decision.kind} request was denied (${decision.scope}).`,
            ));
          }
        } catch (error) {
          pendingPermissions.delete(message.id);
          fatal.resolve(error);
        }
      },
    });

    const cancelPendingPermissions = () => {
      for (const [id, pending] of pendingPermissions.entries()) {
        if (!pending.responded) {
          pending.responded = true;
          connection.respond(id, { outcome: { outcome: 'cancelled' } });
        }
        pendingPermissions.delete(id);
      }
    };
    const requestTermination = (reason) => {
      if (termination) return;
      termination = reason;
      aborted.resolve(new AcpFailure(reason, `ACP delegation ${reason}.`));
    };
    const cancelPoll = setInterval(() => {
      if (fs.existsSync(spec.cancel)) requestTermination('cancelled');
    }, 50);
    const timeout = setTimeout(() => requestTermination('timeout'), spec.timeout_ms);
    cancelPoll.unref();
    timeout.unref();

    const waitStep = (promise) => Promise.race([
      promise,
      fatal.promise.then((error) => { throw error; }),
      aborted.promise.then((error) => { throw error; }),
    ]);
    const shutdown = async ({ graceful = false, cancel = false } = {}) => {
      if (cancel && sessionId) {
        connection.notification('session/cancel', { sessionId });
        cancelPendingPermissions();
        try { appendEvent({ type: 'protocol', phase: 'cancel_requested' }); } catch {}
        if (promptPromise) {
          try {
            const response = await Promise.race([promptPromise, delay(300).then(() => null)]);
            if (response?.stopReason === 'cancelled') {
              try { appendEvent({ type: 'protocol', phase: 'cancel_confirmed' }); } catch {}
            }
          } catch {}
        }
      }
      expectedClose = true;
      // A Windows process tree cannot be addressed after its root PID exits. For
      // cancellation/timeout, terminate the tree while the adapter is still alive;
      // the earlier ACP cancel handshake has already had its bounded grace period.
      if (!graceful && process.platform === 'win32') {
        terminateProcessGroup(child, 'SIGTERM');
      }
      try { child.stdin.end(); } catch {}
      if (graceful) {
        const closed = await Promise.race([childClosed.promise, delay(750).then(() => null)]);
        if (closed) return closed;
      } else {
        await Promise.race([childClosed.promise, delay(150).then(() => null)]);
      }
      terminateProcessGroup(child, 'SIGTERM');
      const closed = await Promise.race([childClosed.promise, delay(500).then(() => null)]);
      terminateProcessGroup(child, 'SIGKILL');
      return closed || await Promise.race([childClosed.promise, delay(500).then(() => ({ code: null, signal: 'SIGKILL' }))]);
    };

    let outcome;
    try {
      const initialized = await waitStep(connection.request('initialize', {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          auth: { terminal: false },
        },
        clientInfo: { name: 'ultra-builder-pro', version: '5.0.0' },
      }));
      if (!isObject(initialized) || initialized.protocolVersion !== ACP_PROTOCOL_VERSION) {
        throw new AcpFailure('acp_protocol_version', 'ACP agent did not negotiate stable protocol v1.');
      }
      protocolVersion = initialized.protocolVersion;
      appendEvent({
        type: 'protocol', phase: 'initialized', protocol_version: protocolVersion,
        auth_method_count: Array.isArray(initialized.authMethods) ? initialized.authMethods.length : 0,
      });
      let session;
      sessionCreationPending = true;
      try {
        session = await waitStep(connection.request('session/new', {
          cwd: spec.cwd,
          mcpServers: [],
        }));
      } catch (error) {
        if (error instanceof AcpRpcError && (error.code === -32000 || /auth/iu.test(error.message))) {
          throw new AcpFailure('acp_auth_required', 'ACP agent requires authentication outside this delegation.');
        }
        throw error;
      } finally {
        sessionCreationPending = false;
      }
      if (!isObject(session) || typeof session.sessionId !== 'string' || !session.sessionId) {
        throw new AcpFailure('acp_malformed_session', 'ACP session/new returned no sessionId.');
      }
      sessionId = session.sessionId;
      appendEvent({ type: 'session', phase: 'created' });
      const bufferedSessionUpdates = earlySessionUpdates;
      earlySessionUpdates = [];
      earlySessionUpdateBytes = 0;
      for (const message of bufferedSessionUpdates) handleUpdate(message);
      promptPromise = connection.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: spec.prompt }],
      });
      const promptResult = await waitStep(promptPromise);
      if (!isObject(promptResult) || !STOP_REASONS.has(promptResult.stopReason)) {
        throw new AcpFailure('acp_malformed_terminal', 'ACP session/prompt returned an invalid stopReason.');
      }
      stopReason = promptResult.stopReason;
      appendEvent({ type: 'terminal', stop_reason: stopReason });
      if (permissionDenied) {
        outcome = {
          failureType: 'permission_denied',
          failureSummary: `ACP ${permissionDenied.kind} request was denied (${permissionDenied.scope}).`,
        };
      } else if (stopReason === 'cancelled') {
        outcome = { termination: 'cancelled' };
      } else if (agentOutput) {
        fs.writeFileSync(spec.host_output, agentOutput, { mode: 0o600 });
      }
      const closed = await shutdown({ graceful: true });
      outcome = {
        // `session/prompt` is the ACP transport terminal. Closing stdin after
        // that point is client-owned cleanup; adapters differ on the process
        // exit code they use for EOF, so retain it as an observation without
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
        : error instanceof AcpRpcError
          ? new AcpFailure('acp_rpc_error', 'ACP request returned a JSON-RPC error.')
          : new AcpFailure('acp_protocol_error', 'ACP transport failed.');
      const wasTermination = ['cancelled', 'timeout'].includes(failure.failureType);
      if (spawnError && !Number.isInteger(child.pid)) {
        // An OS-confirmed spawn failure with no child PID restores an explicit
        // releasable not_started proof instead of freezing an impossible
        // writer behind an adapter that never existed.
        rewindWriterNotStarted(spec, { allowedPriorPhases: ['launching'] });
      }
      const closed = await shutdown({ cancel: wasTermination || !!sessionId });
      outcome = {
        code: closed?.code ?? null,
        signal: closed?.signal || null,
        adapterExitCode: closed?.code ?? null,
        adapterExitSignal: closed?.signal || null,
        termination: wasTermination ? failure.failureType : null,
        spawnError,
        protocolVersion,
        stopReason,
        ...(wasTermination ? {} : {
          failureType: failure.failureType,
          failureSummary: failure.message,
        }),
      };
      stderr.append(`ultra-delegate ACP failure: ${failure.failureType}\n`);
    } finally {
      clearInterval(cancelPoll);
      clearTimeout(timeout);
      connection.close();
      protocolStdout.write(spec.stdout);
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
