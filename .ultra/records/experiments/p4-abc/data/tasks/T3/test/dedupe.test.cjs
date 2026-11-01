'use strict';

// Check C-dedupe covers REQ-dedupe.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list } = require('./helpers.cjs');

test('REQ-dedupe: the same link twice gives the same short link', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/a/very/long/path?q=1';
  const first = await createLink(base, { url });
  assert.equal(first.status, 201);
  const second = await createLink(base, { url });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body);
  assert.equal((await list(base)).body.length, 1);
});

test('REQ-dedupe: a different link, or one that expires, is a new link', async (t) => {
  const { base } = await start(t);
  const url = 'https://example.com/x';
  await createLink(base, { url });
  assert.equal((await createLink(base, { url: `${url}/` })).status, 201);
  assert.equal((await createLink(base, { url, expires_in: 60 })).status, 201);
  assert.equal((await list(base)).body.length, 3);
});
