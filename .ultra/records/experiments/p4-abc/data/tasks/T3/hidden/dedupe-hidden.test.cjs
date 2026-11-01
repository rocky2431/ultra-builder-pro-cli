'use strict';

// Hidden check for REQ-dedupe (not shown to the writer).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, visit, submit } = require('./helpers.cjs');

test('hidden: clicks are kept when the link comes back', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/a';
  const first = (await createLink(base, { url })).body;
  await visit(base, first.code);
  const again = await createLink(base, { url });
  assert.equal(again.status, 200);
  assert.equal(again.body.code, first.code);
  assert.equal(again.body.clicks, 1);
});

test('hidden: an existing link that expires is not reused', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/a';
  const expiring = (await createLink(base, { url, expires_in: 3600 })).body;
  const fresh = await createLink(base, { url });
  assert.equal(fresh.status, 201);
  assert.notEqual(fresh.body.code, expiring.code);
  const third = await createLink(base, { url });
  assert.equal(third.status, 200);
  assert.equal(third.body.code, fresh.body.code, 'the never-expiring one is reused');
});

test('hidden: letter case makes a different link', async (t) => {
  const { base } = await start(t);
  await createLink(base, { url: 'https://example.com/A' });
  assert.equal((await createLink(base, { url: 'https://example.com/a' })).status, 201);
});

test('hidden: the web page gives back the existing link', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/form';
  const first = (await createLink(base, { url })).body;
  const sent = await submit(base, { url });
  assert.equal(sent.status, 303);
  assert.equal(sent.location, `/?created=${first.code}`);
  assert.equal((await list(base)).body.length, 1);
});

test('hidden: a deleted link can be created again as a new link', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/a';
  const first = (await createLink(base, { url })).body;
  await fetch(`${base}/api/links/${first.code}`, { method: 'DELETE' });
  const again = await createLink(base, { url });
  assert.equal(again.status, 201);
  assert.equal((await list(base)).body.length, 1);
});

test('hidden: the reuse survives a restart', async (t) => {
  const first = await start(t);
  const url = 'https://example.com/keep';
  const a = (await createLink(first.base, { url })).body;
  await first.stop('SIGKILL');
  const second = await start(t, first.data);
  const again = await createLink(second.base, { url });
  assert.equal(again.status, 200);
  assert.equal(again.body.code, a.code);
});
