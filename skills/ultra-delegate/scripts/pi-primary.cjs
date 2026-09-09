'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const slice = require('./run-slice.cjs');
const { writeAtomic } = require('./delegate.cjs');
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], details: {} });

module.exports = function register(pi, { runtime = slice } = {}) {
  let live = true, idle = false, busy = false;
  const deliveries = new Map();
  const options = (ctx) => ({ projectRoot: fs.realpathSync(ctx.cwd), sessionId: ctx.sessionManager.getSessionId() });
  const persist = (entry, state) => {
    entry.receipt.state = state;
    entry.receipt.updated_at = new Date().toISOString();
    writeAtomic(runtime.local(entry.root, path.relative(entry.root, entry.file)), `${JSON.stringify(entry.receipt, null, 2)}\n`);
  };
  const dispatch = () => {
    if (!live || !idle) return;
    for (const entry of deliveries.values()) {
      if (entry.receipt.state !== 'pending') continue;
      // Persist uncertainty BEFORE the void-returning native send. A crash can
      // never turn an accepted but unobserved input into a safe resend.
      persist(entry, 'delivery_unknown');
      idle = false;
      try { pi.sendUserMessage(entry.message, { deliverAs: 'followUp' }); }
      catch { persist(entry, 'delivery_unknown'); }
      break;
    }
  };
  const queue = (attention, opts) => {
    const dir = runtime.directory(opts.projectRoot, attention.run_id, attention.slice_id);
    const file = runtime.local(opts.projectRoot, path.relative(opts.projectRoot, path.join(dir, 'delivery.json')));
    const claim = crypto.randomUUID();
    const receipt = runtime.once(file, { $schema: 'ultra-attention-delivery-v1', event_key: attention.event_key,
      primary_session_id: opts.sessionId, claim, state: live ? 'pending' : 'session_unavailable', updated_at: new Date().toISOString() });
    if (receipt.claim !== claim) return; // Observing a retained record never replays it.
    const message = `Ultra completion attention ${claim}\n${JSON.stringify(attention)}\nThese are mechanical observations, not product acceptance. Read the necessary result references, make the next decision within the current owner authority, then call ultra_attention_ack with this event_key after using the attention.`;
    deliveries.set(attention.event_key, { root: opts.projectRoot, file, receipt, message, inputSeen: false, delivered: false });
    dispatch();
  };

  pi.registerTool({
    name: 'ultra_slice', label: 'Ultra finite slice',
    description: 'Run one owner-authorized finite RunSlice packet or explicitly observe/cancel an existing slice. The model selects the packet and delivery mode. wait returns the attention in this tool turn; background returns immediately and sends one causal native input after the current turn settles. Do not poll while waiting. Files never activate execution by themselves.',
    parameters: { type: 'object', additionalProperties: false, required: ['action', 'delivery'], properties: {
      action: { type: 'string', enum: ['run', 'reconcile', 'cancel'] }, delivery: { type: 'string', enum: ['wait', 'background'] },
      packet: { type: 'string' }, run_id: { type: 'string' }, slice_id: { type: 'string' },
    } },
    async execute(_id, params, signal, _update, ctx) {
      if (!live) throw new Error('session_unavailable');
      if (!params || !['wait', 'background'].includes(params.delivery) || !['run', 'reconcile', 'cancel'].includes(params.action)
          || Object.keys(params).some((key) => !['action', 'delivery', 'packet', 'run_id', 'slice_id'].includes(key))) throw new Error('invalid_arguments');
      if (params.action === 'run' ? (!params.packet || params.run_id || params.slice_id) : (!params.run_id || !params.slice_id || params.packet)) throw new Error('invalid_arguments');
      if (params.delivery === 'background' && busy) throw new Error('background_slice_pending');
      const opts = options(ctx);
      let operation;
      if (params.action === 'run') operation = runtime.begin(params.packet, opts);
      else {
        runtime.status(params.run_id, params.slice_id, opts);
        operation = (params.action === 'cancel' ? runtime.cancel : runtime.resume)(params.run_id, params.slice_id, opts);
      }
      if (params.delivery === 'background') {
        busy = true;
        operation.then((attention) => { busy = false; queue(attention, opts); }).catch((error) => {
          busy = false;
          // No fabricated attention or invisible retry on storage/recovery failure.
          ctx.ui?.notify(`Ultra slice requires reconciliation: ${error.message}`, 'error');
        });
        return text({ status: 'waiting_for_attention', delivery: 'background' });
      }
      // Abort stops waiting through the existing explicit cancellation path. A
      // run's retained identity is obtained from the packet, never guessed.
      const abort = () => {
        try {
          const identity = params.action === 'run' ? runtime.json(runtime.local(opts.projectRoot, params.packet)) : params;
          runtime.cancel(identity.run_id, identity.slice_id, opts).catch(() => {});
        } catch { /* Controller observations remain authoritative. */ }
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      try { return text(await operation); }
      finally { signal?.removeEventListener('abort', abort); }
    },
  });
  pi.registerTool({
    name: 'ultra_attention_ack', label: 'Acknowledge Ultra attention',
    description: 'Acknowledge the exact delivered attention after reading its needed results and making the current decision. This records consumption only; it grants no effects and does not mean product acceptance.',
    parameters: { type: 'object', additionalProperties: false, required: ['event_key'], properties: { event_key: { type: 'string' } } },
    async execute(_id, params, _signal, _update, ctx) {
      const entry = deliveries.get(params?.event_key);
      if (!live || !entry?.delivered || !['delivered', 'consumed'].includes(entry.receipt.state)
          || entry.receipt.primary_session_id !== options(ctx).sessionId) throw new Error('attention_not_delivered');
      persist(entry, 'consumed');
      return text({ event_key: params.event_key, status: 'consumed' });
    },
  });

  pi.on('agent_start', () => { idle = false; });
  pi.on('input', (event) => {
    const entry = [...deliveries.values()].find((value) => event.source === 'extension' && event.text === value.message);
    if (!entry) return { action: 'continue' };
    if (entry.inputSeen || !live) return { action: 'handled' };
    entry.inputSeen = true;
    return { action: 'continue' };
  });
  pi.on('message_start', ({ message }) => {
    if (message?.role !== 'user') return;
    const content = typeof message.content === 'string' ? message.content : (message.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
    for (const entry of deliveries.values()) {
      if (entry.inputSeen && !entry.delivered && content === entry.message) {
        entry.delivered = true;
        persist(entry, 'delivered');
      }
    }
  });
  pi.on('agent_settled', () => {
    for (const entry of deliveries.values()) if (entry.receipt.state === 'delivered') {
      persist(entry, 'delivery_unknown');
    }
    idle = true;
    dispatch();
  });
  pi.on('session_shutdown', () => {
    live = false;
    for (const entry of deliveries.values()) if (entry.receipt.state !== 'consumed') persist(entry, 'delivery_unknown');
  });
};
