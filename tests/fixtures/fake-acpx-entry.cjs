#!/usr/bin/env node
'use strict';

// Test-side stand-in for the installed public ACPX delegate entry
// (`acpx_delegate_entry.cjs` of the agent-delegation runtime). It speaks the
// same wire contract (acpx-delegate-turn-request/v1): one request line in,
// started/event/permission_request/result lines out — the result line
// carrying the actually negotiated protocolVersion beside the typed terminal
// whenever the session established one. It spawns the requested agent argv
// with `{ ...process.env }` exactly like the pinned ACPX runtime, bridges the
// fixture agent's raw ACP JSON-RPC into runtime-shaped events, forwards
// permission requests with their raw options, maps the driver's exact
// optionId decisions back to ACP outcomes, and refuses an unsupported or
// unproven protocol negotiation before any prompt exactly where the real
// entry's session-record observation lets it refuse. Test tooling only —
// never shipped, and never a second protocol implementation in the product.

const path = require('node:path');
const { spawn } = require('node:child_process');

const REQUEST_SCHEMA = 'acpx-delegate-turn-request/v1';
const CANCEL_GRACE_MS = 3000;

// Undefined until session/new establishes the session, mirroring the real
// entry: the pinned runtime persists the negotiated version on the session
// record only after the session exists, and every terminal after that point
// reports the observed value beside the typed result.
let negotiatedProtocolVersion;

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function failTurn(message, code) {
  emit({
    type: 'result',
    result: { status: 'failed', error: { message, code } },
    ...(typeof negotiatedProtocolVersion === 'number'
      ? { protocolVersion: negotiatedProtocolVersion }
      : {}),
  });
  process.exit(1);
}

// One persistent UTF-8 line decoder across the whole stream: both the first
// request line and later permission decisions survive chunk splits,
// including multi-byte characters cut mid-sequence.
function createLineReader(onLine) {
  let buffered = '';
  return (chunk) => {
    buffered += chunk;
    for (;;) {
      const newline = buffered.indexOf('\n');
      if (newline < 0) break;
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      if (line.trim()) onLine(line);
    }
  };
}

async function readRequest() {
  return await new Promise((resolve, reject) => {
    process.stdin.setEncoding('utf8');
    const feed = createLineReader((line) => {
      process.stdin.removeListener('data', feed);
      process.stdin.removeListener('end', onEnd);
      resolve(line);
    });
    const onEnd = () => {
      process.stdin.removeListener('data', feed);
      reject(new Error('stdin closed before a request line arrived'));
    };
    process.stdin.on('data', feed);
    process.stdin.on('end', onEnd);
  });
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('request must be a JSON object');
  }
  if (request.schema !== REQUEST_SCHEMA) {
    throw new Error(`request schema must be ${REQUEST_SCHEMA}`);
  }
  const argv = request.agent_argv;
  if (!Array.isArray(argv) || argv.length === 0
      || !argv.every((item) => typeof item === 'string' && item)) {
    throw new Error('agent_argv must be a non-empty string array');
  }
  if (!path.isAbsolute(argv[0])) {
    throw new Error('agent_argv[0] must be an absolute executable path');
  }
  if (typeof request.cwd !== 'string' || !path.isAbsolute(request.cwd)) {
    throw new Error('cwd must be an absolute directory');
  }
  if (typeof request.prompt !== 'string' || !request.prompt) {
    throw new Error('prompt must be a non-empty string');
  }
  if (!Number.isInteger(request.timeout_ms) || request.timeout_ms < 1) {
    throw new Error('timeout_ms must be a positive integer of milliseconds');
  }
  return request;
}

// Maps one raw ACP session/update onto the runtime event shape the driver
// projects into the derived journal.
function runtimeEventFromUpdate(update) {
  const tag = update.sessionUpdate;
  if (tag === 'agent_message_chunk' || tag === 'user_message_chunk') {
    const text = update.content?.text;
    if (typeof text !== 'string') {
      throw new Error('session/update chunk must contain text content');
    }
    return { type: 'text_delta', text, stream: 'output', tag };
  }
  if (tag === 'agent_thought_chunk') {
    return {
      type: 'text_delta',
      text: update.content?.text ?? '',
      stream: 'thought',
      tag: 'agent_thought_chunk',
    };
  }
  if (tag === 'tool_call' || tag === 'tool_call_update') {
    return {
      type: 'tool_call',
      tag,
      toolCallId: update.toolCallId,
      status: update.status,
      kind: update.kind,
      locations: update.locations,
    };
  }
  return { type: 'status', text: '', tag };
}

async function main() {
  let request;
  try {
    request = validateRequest(JSON.parse(await readRequest()));
  } catch (error) {
    process.stderr.write(`fake-acpx-entry: invalid request: ${error.message}\n`);
    process.exit(2);
    return;
  }

  // Exactly the pinned runtime's descendant behavior: the agent receives a
  // copy of this process's environment and stays inside its process group.
  const agent = spawn(request.agent_argv[0], request.agent_argv.slice(1), {
    cwd: request.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  agent.on('error', (error) => {
    failTurn(`agent command failed to start: ${error.message}`, 'AGENT_SPAWN_ERROR');
  });

  let nextId = 1;
  let sessionId = null;
  let promptId = null;
  let settled = false;
  const permissionWaiters = new Map();
  let permissionSeq = 0;

  const settle = (result) => {
    if (settled) return;
    settled = true;
    emit({
      type: 'result',
      result,
      ...(typeof negotiatedProtocolVersion === 'number'
        ? { protocolVersion: negotiatedProtocolVersion }
        : {}),
    });
    // The adapter owns closing its direct agent; the agent's own descendants
    // stay in the process group so the driver's boundary proof observes them.
    try { agent.kill('SIGTERM'); } catch {}
    const exitCode = Number(process.env.FAKE_ACPX_ENTRY_EXIT_CODE ?? (
      result.status === 'failed' ? 1 : 0
    ));
    setTimeout(() => process.exit(exitCode), 50).unref();
    process.exitCode = exitCode;
  };

  const pending = new Map();
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const waiter = { resolve, reject };
    agent.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    pending.set(id, waiter);
  });

  const handleAgentLine = (message) => {
    if (!message || typeof message !== 'object') throw new Error('malformed agent message');
    if ('id' in message && !('method' in message) && ('result' in message || 'error' in message)) {
      const waiter = pending.get(message.id);
      if (!waiter) throw new Error('unknown agent response id');
      pending.delete(message.id);
      if ('error' in message) waiter.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === 'session/update') {
      emit({ type: 'event', event: runtimeEventFromUpdate(message.params?.update ?? {}) });
      return;
    }
    if (message.method === 'session/request_permission') {
      permissionSeq += 1;
      const id = permissionSeq;
      emit({
        type: 'permission_request',
        id,
        request: {
          sessionId: typeof message.params?.sessionId === 'string' ? message.params.sessionId : null,
          raw: message.params ?? {},
        },
      });
      permissionWaiters.set(id, (decision) => {
        permissionWaiters.delete(id);
        const options = Array.isArray(message.params?.options) ? message.params.options : [];
        const option = typeof decision?.optionId === 'string'
          ? options.find((item) => item && typeof item === 'object' && item.optionId === decision.optionId)
          : null;
        if (!option) {
          agent.stdin.write(`${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { outcome: { outcome: 'reject_once' } },
          })}\n`);
          return;
        }
        agent.stdin.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { outcome: { outcome: option.kind, optionId: option.optionId } },
        })}\n`);
      });
      return;
    }
    // Unsupported client-adjacent methods are refused like the product does.
    agent.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: 'Client method is not available.' },
    })}\n`);
  };

  process.stdin.on('data', createLineReader((line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'permission_decision' && Number.isInteger(message.id)) {
      const waiter = permissionWaiters.get(message.id);
      if (waiter) waiter({ optionId: message.optionId });
    }
  }));

  const cancelSignal = new Promise((resolve) => {
    const onCancel = () => {
      process.removeListener('SIGTERM', onCancel);
      process.removeListener('SIGINT', onCancel);
      resolve();
    };
    process.on('SIGTERM', onCancel);
    process.on('SIGINT', onCancel);
  });

  agent.stdout.setEncoding('utf8');
  agent.stdout.on('data', createLineReader((line) => {
    try {
      handleAgentLine(JSON.parse(line));
    } catch (error) {
      settle({
        status: 'failed',
        error: { message: `agent protocol failure: ${error.message}`, code: 'AGENT_PROTOCOL_ERROR' },
      });
    }
  }));
  agent.on('close', (code) => {
    if (!settled) failTurn(`agent exited before a terminal result (code ${code ?? 'null'})`, 'AGENT_EARLY_EXIT');
  });

  emit({ type: 'started', pid: process.pid, node: process.version, acpx_version: 'fixture' });

  try {
    const initialized = await rpc('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        auth: { terminal: false },
      },
      clientInfo: { name: 'ultra-builder-pro-test', version: '5.0.0' },
    });
    let session;
    try {
      session = await rpc('session/new', { cwd: request.cwd, mcpServers: [] });
    } catch (error) {
      if (error.code === -32000 || /auth/iu.test(error.message)) {
        // The structured pre-prompt proof: this failure happened strictly
        // around session creation, before startTurn could ever be called.
        settle({
          status: 'failed',
          error: { message: 'Authentication required', code: 'ACP_AUTH_REQUIRED', phase: 'ensure_session' },
        });
        return;
      }
      throw error;
    }
    if (!session || typeof session.sessionId !== 'string' || !session.sessionId) {
      throw new Error('session/new returned no sessionId');
    }
    // The pinned runtime persists the negotiated version on the session
    // record only after the session exists, and the real entry refuses the
    // turn before startTurn unless stable v1 was actually observed; this
    // stand-in mirrors both the observation point and the refusal. A session
    // may already exist at refusal, but no prompt is ever submitted.
    if (initialized && typeof initialized.protocolVersion === 'number') {
      negotiatedProtocolVersion = initialized.protocolVersion;
    }
    if (negotiatedProtocolVersion !== 1) {
      settle({
        status: 'failed',
        error: {
          message: typeof negotiatedProtocolVersion === 'number'
            ? `Agent negotiated ACP protocolVersion ${negotiatedProtocolVersion}; this delegate transport requires 1.`
            : 'No ACP protocolVersion was observed on the initialized session record; this delegate transport requires 1.',
          code: 'unsupported_protocol_version',
          phase: 'ensure_session',
        },
      });
      return;
    }
    sessionId = session.sessionId;
    const cancelGrace = cancelSignal.then(() => new Promise(
      (resolve) => setTimeout(resolve, CANCEL_GRACE_MS, null),
    ));
    cancelSignal.then(() => {
      try {
        agent.stdin.write(`${JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/cancel',
          params: { sessionId },
        })}\n`);
      } catch {}
    });
    const terminal = await Promise.race([
      rpc('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: request.prompt }],
      }).then((result) => result ?? {}),
      cancelGrace,
    ]);
    if (terminal === null) {
      settle({ status: 'cancelled', stopReason: 'cancelled' });
      return;
    }
    if (terminal.stopReason === 'cancelled') {
      settle({ status: 'cancelled', stopReason: 'cancelled' });
      return;
    }
    if (typeof terminal.stopReason !== 'string') {
      throw new Error('session/prompt returned an invalid stopReason');
    }
    settle({ status: 'completed', stopReason: terminal.stopReason });
  } catch (error) {
    settle({
      status: 'failed',
      error: {
        message: error && typeof error.message === 'string' ? error.message : String(error),
        code: error && typeof error.code !== 'undefined' ? String(error.code) : undefined,
      },
    });
  }
}

main().catch((error) => {
  process.stderr.write(`fake-acpx-entry: ${(error && error.stack) || error}\n`);
  process.exitCode = 1;
});
