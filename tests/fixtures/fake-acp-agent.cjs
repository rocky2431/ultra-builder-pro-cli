#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

// A delegation-scoped config file keeps fixture behavior reachable when the
// sanitized descendant environment no longer forwards launcher env keys.
const config = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  : null;
const scenario = config?.scenario ?? process.env.FAKE_ACP_SCENARIO ?? 'happy';
const traceFile = config?.trace ?? process.env.FAKE_ACP_TRACE;
const childPidFile = config?.childPidFile ?? process.env.FAKE_ACP_CHILD_PID;
const result = config ? JSON.stringify(config.result ?? {}) : (process.env.FAKE_ACP_RESULT || '{}');
const location = config?.location ?? process.env.FAKE_ACP_LOCATION ?? process.cwd();
const envCapture = config?.envCapture ?? process.env.FAKE_ACP_ENV_CAPTURE;
if (envCapture) fs.writeFileSync(envCapture, `${Object.keys(process.env).sort().join('\n')}\n`);
let promptRequestId = null;
let permissionRequestId = null;

function trace(payload) {
  if (traceFile) fs.appendFileSync(traceFile, `${JSON.stringify(payload)}\n`);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...payload })}\n`);
}

function update(value) {
  send({
    method: 'session/update',
    params: { sessionId: 'fake-session', update: value },
  });
}

function finishPrompt(stopReason = 'end_turn') {
  update({
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: result },
  });
  send({ id: promptRequestId, result: { stopReason } });
}

function requestPermission(kind, requestedLocation) {
  permissionRequestId = 900;
  send({
    id: permissionRequestId,
    method: 'session/request_permission',
    params: {
      sessionId: 'fake-session',
      toolCall: {
        toolCallId: 'tool-1',
        kind,
        status: 'pending',
        title: 'contains-secret-title',
        locations: requestedLocation ? [{ path: requestedLocation }] : [],
        rawInput: { token: 'raw-secret-token' },
      },
      options: [
        { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        { optionId: 'reject-once', name: 'Reject once', kind: 'reject_once' },
      ],
    },
  });
}

function startGrandchild() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  if (childPidFile) fs.writeFileSync(childPidFile, `${child.pid}\n`);
}

function handle(message) {
  trace({ direction: 'client_to_agent', message });
  if (message.method === 'initialize') {
    if (scenario === 'malformed') {
      process.stdout.write('not-json\n');
      return;
    }
    if (scenario === 'invalid-response-shape') {
      send({
        id: message.id,
        result: { protocolVersion: 1 },
        error: { code: -32603, message: 'response cannot be both success and error' },
      });
      return;
    }
    send({
      id: message.id,
      result: {
        protocolVersion: scenario === 'wrong-version' ? 2 : 1,
        agentCapabilities: {},
        authMethods: [],
        agentInfo: { name: 'fake-acp-agent', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'session/new') {
    if (scenario === 'early-exit') process.exit(7);
    if (scenario === 'auth-required') {
      send({ id: message.id, error: { code: -32000, message: 'Authentication required' } });
      return;
    }
    if (scenario === 'early-session-update') {
      update({ sessionUpdate: 'available_commands_update', availableCommands: [] });
    }
    if (scenario === 'early-session-mismatch') {
      send({
        method: 'session/update',
        params: {
          sessionId: 'different-session',
          update: { sessionUpdate: 'available_commands_update', availableCommands: [] },
        },
      });
    }
    if (scenario === 'early-session-message') {
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'must-not-enter-result' },
      });
    }
    if (scenario === 'early-session-flood') {
      for (let index = 0; index < 40; index += 1) {
        update({ sessionUpdate: 'available_commands_update', availableCommands: [] });
      }
    }
    send({ id: message.id, result: { sessionId: 'fake-session' } });
    return;
  }
  if (message.method === 'session/prompt') {
    promptRequestId = message.id;
    if (scenario === 'hang' || scenario === 'cancel') {
      startGrandchild();
      update({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'hidden-cancel-secret' },
      });
      return;
    }
    if (scenario === 'permission-allow') {
      requestPermission('edit', location);
      return;
    }
    if (scenario === 'permission-widening') {
      requestPermission('edit', location);
      return;
    }
    if (scenario === 'no-result') {
      send({ id: promptRequestId, result: { stopReason: 'end_turn' } });
      return;
    }
    if (scenario === 'finish-live-group') {
      // A syntactically valid finished turn whose same-process-group descendant
      // keeps writing after the adapter exits: the boundary is not provable.
      startGrandchild();
      update({
        sessionUpdate: 'plan',
        entries: [{ content: 'Finish while a descendant keeps running', priority: 'high', status: 'in_progress' }],
      });
      finishPrompt();
      return;
    }
    if (scenario === 'env-capture') {
      finishPrompt();
      return;
    }
    if (scenario === 'malformed-update') {
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text' } });
      return;
    }
    if (scenario === 'wrong-session-update') {
      send({
        method: 'session/update',
        params: {
          sessionId: 'different-session',
          update: { sessionUpdate: 'plan', entries: [] },
        },
      });
      return;
    }
    if (scenario === 'event-flood') {
      for (let index = 0; index < 520; index += 1) {
        update({ sessionUpdate: 'plan', entries: [] });
      }
      finishPrompt();
      return;
    }
    update({
      sessionUpdate: 'plan',
      entries: [{ content: 'Inspect the bounded task', priority: 'high', status: 'in_progress' }],
    });
    update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'hidden-reasoning-secret' },
    });
    update({
      sessionUpdate: 'tool_call',
      toolCallId: 'read-1',
      kind: 'read',
      status: 'completed',
      title: 'read secret title',
      rawInput: { token: 'raw-secret-token' },
      rawOutput: 'raw-secret-output',
    });
    finishPrompt();
    return;
  }
  if (message.method === 'session/cancel') {
    trace({ direction: 'agent_observation', cancelled: true });
    if (promptRequestId !== null) send({ id: promptRequestId, result: { stopReason: 'cancelled' } });
    return;
  }
  if (message.id === permissionRequestId && message.result) {
    trace({ direction: 'agent_observation', permission_response: message.result });
    finishPrompt();
  }
}

let buffered = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  for (;;) {
    const newline = buffered.indexOf('\n');
    if (newline < 0) break;
    const line = buffered.slice(0, newline);
    buffered = buffered.slice(newline + 1);
    if (!line.trim()) continue;
    handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(Number(process.env.FAKE_ACP_EXIT_ON_STDIN_END || 0)));
