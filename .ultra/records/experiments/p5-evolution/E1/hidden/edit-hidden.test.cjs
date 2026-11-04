'use strict';

// Hidden check for REQ-edit (not shown to the writer).
const test = require('node:test');
const assert = require('node:assert/strict');
const { REJECT, TOO_BIG, tempData, start, createLink, list, visit, page, row } =
  require('./helpers.cjs');

const patch = async (base, code, raw) => {
  const res = await fetch(`${base}/api/links/${code}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: raw,
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { notJson: text.slice(0, 80) }; }
  return { status: res.status, body };
};
const edit = (base, code, body) => patch(base, code, JSON.stringify(body));

test('hidden: an edit survives a restart', async (t) => {
  const data = tempData();
  const first = await start(t, data);
  const a = (await createLink(first.base, { url: 'https://example.com/before' })).body;
  assert.equal((await edit(first.base, a.code, { url: 'https://example.com/after' })).status, 200);
  await first.stop();
  const second = await start(t, data);
  assert.equal((await list(second.base)).body[0].url, 'https://example.com/after');
  assert.equal((await visit(second.base, a.code)).location, 'https://example.com/after');
});

test('hidden: the web page shows the new target, escaped', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/plain' })).body;
  const target = 'https://example.com/?a=1&b="x"&c=<y>';
  assert.equal((await edit(base, a.code, { url: target })).status, 200);
  const html = row((await page(base)).text, a.code);
  assert.ok(html, 'the link is on the page');
  assert.ok(!html.includes('example.com/plain'), 'the old target is gone');
  assert.ok(html.includes('&lt;y&gt;'), 'the new target is shown, escaped');
  assert.ok(!html.includes('<y>'), 'no raw markup from the target');
});

test('hidden: a body without a usable link is refused and changes nothing', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/stay' })).body;
  for (const raw of ['{', 'null', '[]', '{}', '{"url": 5}', '{"url": ["https://example.com/x"]}',
    '"https://example.com/x"', '{"url": "javascript:alert(1)"}']) {
    const res = await patch(base, a.code, raw);
    assert.equal(res.status, 400, raw);
    assert.deepEqual(res.body, { error: REJECT }, raw);
  }
  assert.equal((await list(base)).body[0].url, 'https://example.com/stay');
});

test('hidden: an oversized body answers 413, changes nothing, and the server keeps serving',
  async (t) => {
    const { base } = await start(t);
    const a = (await createLink(base, { url: 'https://example.com/stay' })).body;
    const big = JSON.stringify({ url: `https://example.com/${'x'.repeat(70000)}` });
    const res = await patch(base, a.code, big);
    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { error: TOO_BIG });
    const after = await list(base);
    assert.equal(after.status, 200);
    assert.equal(after.body[0].url, 'https://example.com/stay');
  });

test('hidden: odd codes answer the JSON 404', async (t) => {
  const { base } = await start(t);
  for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const res = await edit(base, code, { url: 'https://example.com/x' });
    assert.equal(res.status, 404, code);
    assert.deepEqual(res.body, { error: '没有这个短链接。' }, code);
  }
});

test('hidden: clicks keep counting after an edit, and the old target is not used again',
  async (t) => {
    const { base } = await start(t);
    const a = (await createLink(base, { url: 'https://example.com/one' })).body;
    await visit(base, a.code);
    await visit(base, a.code);
    await edit(base, a.code, { url: 'https://example.com/two' });
    assert.equal((await visit(base, a.code)).location, 'https://example.com/two');
    assert.equal((await list(base)).body[0].clicks, 3);
  });
