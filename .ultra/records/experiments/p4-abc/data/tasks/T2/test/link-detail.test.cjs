'use strict';

// Check C-link-detail covers REQ-link-detail.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, visit } = require('./helpers.cjs');

const detail = async (base, code) => {
  const res = await fetch(`${base}/api/links/${code}`);
  return { status: res.status, type: res.headers.get('content-type') ?? '', body: await res.json() };
};

test('REQ-link-detail: one link, as the list shows it', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  await createLink(base, { url: 'https://example.com/b' });
  await visit(base, a.code);
  const res = await detail(base, a.code);
  assert.equal(res.status, 200);
  assert.match(res.type, /^application\/json/);
  const shown = (await list(base)).body.find((l) => l.code === a.code);
  assert.deepEqual(res.body, shown);
  assert.equal(res.body.clicks, 1);
});

test('REQ-link-detail: an unknown code answers 404', async (t) => {
  const { base } = await start(t);
  const res = await detail(base, 'zzzzzzzz');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: '没有这个短链接。' });
});
