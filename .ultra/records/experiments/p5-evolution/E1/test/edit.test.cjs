'use strict';

// Check C-edit covers REQ-edit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { REJECT, start, createLink, list, visit } = require('./helpers.cjs');

const edit = async (base, code, body) => {
  const res = await fetch(`${base}/api/links/${code}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('REQ-edit: a link points somewhere new and keeps its code and clicks', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/old' })).body;
  await visit(base, a.code);
  const res = await edit(base, a.code, { url: 'https://example.org/new' });
  assert.equal(res.status, 200);
  const shown = (await list(base)).body.find((l) => l.code === a.code);
  assert.deepEqual(res.body, shown);
  assert.equal(res.body.url, 'https://example.org/new');
  assert.equal(res.body.clicks, 1);
  const go = await visit(base, a.code);
  assert.equal(go.status, 302);
  assert.equal(go.location, 'https://example.org/new');
});

test('REQ-edit: an unknown code answers 404 and a refused link changes nothing', async (t) => {
  const { base } = await start(t);
  const missing = await edit(base, 'zzzzzzzz', { url: 'https://example.org/x' });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: '没有这个短链接。' });
  const a = (await createLink(base, { url: 'https://example.com/keep' })).body;
  const refused = await edit(base, a.code, { url: 'ftp://example.com/x' });
  assert.equal(refused.status, 400);
  assert.deepEqual(refused.body, { error: REJECT });
  assert.equal((await list(base)).body[0].url, 'https://example.com/keep');
});
