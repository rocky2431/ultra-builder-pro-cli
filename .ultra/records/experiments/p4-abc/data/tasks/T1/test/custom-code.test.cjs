'use strict';

// Check C-custom-code covers REQ-custom-code.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, visit } = require('./helpers.cjs');

const BAD_CODE = 'code 必须是 4–10 位字母或数字。';
const TAKEN = '这个短码已被使用。';

test('REQ-custom-code: a link gets the code I chose', async (t) => {
  const { base } = await start(t);
  const res = await createLink(base, { url: 'https://example.com/docs', code: 'docs' });
  assert.equal(res.status, 201);
  assert.equal(res.body.code, 'docs');
  assert.equal(res.body.short, `${base}/docs`);
  const hop = await visit(base, 'docs');
  assert.equal(hop.status, 302);
  assert.equal(hop.location, 'https://example.com/docs');
});

test('REQ-custom-code: a code in use is refused with 409', async (t) => {
  const { base } = await start(t);
  assert.equal((await createLink(base, { url: 'https://example.com/a', code: 'docs' })).status, 201);
  const again = await createLink(base, { url: 'https://example.com/b', code: 'docs' });
  assert.equal(again.status, 409);
  assert.deepEqual(again.body, { error: TAKEN });
  assert.equal((await list(base)).body.length, 1);
});

test('REQ-custom-code: a code that is not 4–10 letters or digits is refused with 400', async (t) => {
  const { base } = await start(t);
  for (const code of ['abc', 'abcdefghijk', 'a-b-c', 42]) {
    const res = await createLink(base, { url: 'https://example.com/x', code });
    assert.equal(res.status, 400, JSON.stringify(code));
    assert.deepEqual(res.body, { error: BAD_CODE }, JSON.stringify(code));
  }
  assert.deepEqual((await list(base)).body, []);
});
