'use strict';

// Hidden check for REQ-link-detail (not shown to the writer).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, visit, sleep } = require('./helpers.cjs');

const detail = async (base, code) => {
  const res = await fetch(`${base}/api/links/${code}`);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) };
};

test('hidden: looking a link up counts nothing', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  await detail(base, a.code);
  await detail(base, a.code);
  assert.equal((await list(base)).body[0].clicks, 0);
  assert.equal((await detail(base, a.code)).body.clicks, 0);
});

test('hidden: an expired link is still shown, with its expiry', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a', expires_in: 1 })).body;
  await sleep(Math.max(0, Date.parse(a.expires_at) - Date.now()) + 300);
  const res = await detail(base, a.code);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, (await list(base)).body.find((l) => l.code === a.code));
});

test('hidden: a deleted link answers 404', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  assert.equal((await fetch(`${base}/api/links/${a.code}`, { method: 'DELETE' })).status, 204);
  assert.equal((await detail(base, a.code)).status, 404);
});

test('hidden: odd paths answer 404, never 500', async (t) => {
  const { base } = await start(t);
  for (const code of ['%2e%2e', 'a%2Fb', '%E4%B8%AD', 'constructor', '__proto__', 'toString']) {
    const res = await detail(base, code);
    assert.equal(res.status, 404, code);
  }
});
