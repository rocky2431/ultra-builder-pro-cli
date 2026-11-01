'use strict';

// Hidden check for REQ-custom-code (not shown to the writer).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, visit } = require('./helpers.cjs');

const BAD_CODE = 'code 必须是 4–10 位字母或数字。';
const TAKEN = '这个短码已被使用。';

test('hidden: non-ASCII letters and digits are refused', async (t) => {
  const { base } = await start(t);
  for (const code of ['路径ab', 'abcé', 'ab١٢', 'ＡＢＣＤ']) {
    const res = await createLink(base, { url: 'https://example.com/x', code });
    assert.equal(res.status, 400, code);
    assert.deepEqual(res.body, { error: BAD_CODE }, code);
  }
});

test('hidden: a present code of the wrong type is refused, null included', async (t) => {
  const { base } = await start(t);
  for (const code of [null, true, ['docs'], { c: 'docs' }, '']) {
    const res = await createLink(base, { url: 'https://example.com/x', code });
    assert.equal(res.status, 400, JSON.stringify(code));
  }
  assert.deepEqual((await list(base)).body, []);
});

test('hidden: the code is kept exactly, letter case included', async (t) => {
  const { base } = await start(t);
  assert.equal((await createLink(base, { url: 'https://example.com/a', code: 'Docs' })).body.code, 'Docs');
  const lower = await createLink(base, { url: 'https://example.com/b', code: 'docs' });
  assert.equal(lower.status, 201, 'Docs and docs are different codes');
  assert.equal((await visit(base, 'Docs')).location, 'https://example.com/a');
  assert.equal((await visit(base, 'docs')).location, 'https://example.com/b');
});

test('hidden: a chosen code that matches a generated one is refused', async (t) => {
  const { base } = await start(t);
  const generated = (await createLink(base, { url: 'https://example.com/a' })).body.code;
  const res = await createLink(base, { url: 'https://example.com/b', code: generated });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: TAKEN });
});

test('hidden: a chosen code survives a restart and works with expiry', async (t) => {
  const first = await start(t);
  const res = await createLink(first.base, { url: 'https://example.com/a', code: 'keep1', expires_in: 3600 });
  assert.equal(res.status, 201);
  assert.ok(res.body.expires_at);
  await first.stop('SIGKILL');
  const second = await start(t, first.data);
  assert.equal((await visit(second.base, 'keep1')).status, 302);
});

test('hidden: a bad code with a bad url reports one 400 and creates nothing', async (t) => {
  const { base } = await start(t);
  const res = await createLink(base, { url: 'ftp://x', code: 'docs' });
  assert.equal(res.status, 400);
  assert.deepEqual((await list(base)).body, []);
});
