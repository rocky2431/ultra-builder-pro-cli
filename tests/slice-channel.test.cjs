'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { test } = require('node:test');
const channel = require('../skills/ultra-delegate/scripts/slice-channel.cjs');
const host = require('../skills/ultra-delegate/scripts/host-profile.cjs');

test('real private process messages bind session, suppress duplicates and retain lost/dead-channel uncertainty', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-channel-')));
  const childFile = path.join(root, 'child.cjs');
  fs.writeFileSync(childFile, `const crypto=require('node:crypto'); process.once('message', m=>{const a=m.attention; if(m.test==='lost')return process.exit(0); if(m.test==='death')return setTimeout(()=>process.exit(0),100); const message={$schema:'ultra-slice-channel-v1',type:'attention',run_id:'run',slice_id:'first',primary_session_id:m.test==='wrong'?'other':'session',attention_sha256:crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex')}; process.send(message);process.send(message);process.disconnect();});`);
  const attention = { $schema: 'ultra-attention-v1', run_id: 'run', slice_id: 'first', primary_session_id: 'session', event_key: 'run:first', counts: { finished: 1 }, attempts: [] };
  const runtime = { prepare: () => ({ root, packet: { ...attention, budget: { deadline_at: new Date(Date.now() + 3000).toISOString() } }, admitted: [{ host: host.hostProfile('pi') }] }), status: () => attention };
  const old = process.env.PRIMARY_CHANNEL_SECRET_CANARY; process.env.PRIMARY_CHANNEL_SECRET_CANARY = 'never-forward-this';
  try {
    for (const mode of ['valid', 'wrong', 'lost', 'death']) {
      let started = 0;
      const forkProcess = (_module, _args, options) => {
        assert.equal(options.env.PRIMARY_CHANNEL_SECRET_CANARY, undefined);
        assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
        const child = fork(childFile, [], options), send = child.send.bind(child); started++;
        child.send = (message, ...args) => send({ ...message, attention, test: mode }, ...args);
        return child;
      };
      const operation = channel.open('run', { packet: 'packet.json' }, { projectRoot: root, sessionId: 'session' }, { runtime, forkProcess });
      if (mode === 'valid') assert.deepEqual(await operation.attention, attention);
      else await assert.rejects(operation.attention, mode === 'wrong' ? /identity/ : /unknown/);
      assert.equal(started, 1, 'loss must not retry or create another controller');
    }
  } finally {
    if (old === undefined) delete process.env.PRIMARY_CHANNEL_SECRET_CANARY; else process.env.PRIMARY_CHANNEL_SECRET_CANARY = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
