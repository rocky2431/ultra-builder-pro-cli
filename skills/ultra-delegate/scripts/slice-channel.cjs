'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const slice = require('./run-slice.cjs');
const hosts = require('./host-profile.cjs');
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function open(action, input, options, { runtime = slice, forkProcess = fork } = {}) {
  if (!['run', 'reconcile', 'cancel'].includes(action)) throw new Error('invalid_channel_action');
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  let packet, admitted;
  if (action === 'run') ({ packet, admitted } = runtime.prepare(input.packet, options));
  else {
    runtime.status(input.run_id, input.slice_id, options);
    packet = runtime.json(path.join(runtime.directory(root, input.run_id, input.slice_id), 'run-slice.json'));
    admitted = packet.attempts.map((a) => ({ host: hosts.hostProfile(a.host) }));
  }
  const env = Object.assign({}, ...admitted.map(({ host }) => hosts.descendantEnvViews(process.env, host).worker));
  // The private IPC descriptor belongs only to this controller. Delegation uses
  // its existing explicit stdio/env boundary, never this parent's channel.
  const child = forkProcess(__filename, ['--controller'], { cwd: root, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let settled = false, timer;
  const cancel = () => { if (child.connected) child.send({ type: 'cancel' }, () => {}); };
  const attention = new Promise((resolve, reject) => {
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { cancel(); reject(error); } else resolve(value);
    };
    child.on('message', (message) => {
      if (settled) return;
      try {
        if (!message || Object.keys(message).sort().join(',') !== '$schema,attention_sha256,primary_session_id,run_id,slice_id,type'
            || message.$schema !== 'ultra-slice-channel-v1' || message.type !== 'attention'
            || message.primary_session_id !== options.sessionId || message.run_id !== packet.run_id || message.slice_id !== packet.slice_id) throw new Error('channel_identity_mismatch');
        const value = runtime.status(packet.run_id, packet.slice_id, options);
        if (value.$schema !== 'ultra-attention-v1' || value.primary_session_id !== options.sessionId
            || value.event_key !== `${packet.run_id}:${packet.slice_id}` || hash(value) !== message.attention_sha256) throw new Error('channel_attention_mismatch');
        finish(null, value);
      } catch (error) { finish(error); }
    });
    child.once('error', () => finish(new Error('channel_delivery_unknown')));
    child.once('exit', () => finish(new Error('channel_delivery_unknown')));
    const remaining = Math.max(1, Math.min(86400000, Date.parse(packet.budget.deadline_at) - Date.now() + 10000));
    timer = setTimeout(() => finish(new Error('channel_delivery_unknown')), remaining);
    child.send({ type: 'start', action, input, root, session_id: options.sessionId }, (error) => { if (error) finish(new Error('channel_delivery_unknown')); });
  });
  return { attention, cancel, pid: child.pid };
}

async function controller() {
  let current = null, cancelling = false;
  const cancel = () => {
    if (!current || cancelling) return;
    cancelling = true;
    slice.cancel(current.packet.run_id, current.packet.slice_id, current.options).catch(() => {});
  };
  process.on('disconnect', cancel);
  process.on('message', (message) => { if (message?.type === 'cancel') cancel(); });
  process.once('message', async (message) => {
    try {
      if (!message || message.type !== 'start' || !['run', 'reconcile', 'cancel'].includes(message.action)
          || typeof message.root !== 'string' || typeof message.session_id !== 'string') throw new Error('invalid_channel_request');
      const options = { projectRoot: fs.realpathSync(message.root), sessionId: message.session_id };
      const packet = message.action === 'run' ? slice.prepare(message.input.packet, options).packet
        : slice.json(path.join(slice.directory(options.projectRoot, message.input.run_id, message.input.slice_id), 'run-slice.json'));
      if (!process.connected) throw new Error('channel_unavailable');
      current = { packet, options };
      const value = await (message.action === 'run' ? slice.begin(message.input.packet, options)
        : (message.action === 'cancel' ? slice.cancel : slice.resume)(packet.run_id, packet.slice_id, options));
      if (process.connected) process.send({ $schema: 'ultra-slice-channel-v1', type: 'attention', run_id: packet.run_id,
        slice_id: packet.slice_id, primary_session_id: options.sessionId, attention_sha256: hash(value) }, () => { if (process.connected) process.disconnect(); });
    } catch { cancel(); if (process.connected) process.disconnect(); process.exitCode = 1; }
  });
}
if (require.main === module) {
  if (process.argv[2] !== '--controller' || !process.send) process.exitCode = 1;
  else controller();
}
module.exports = { open };
