'use strict';

// Hidden check for REQ-search (not shown to the writer). Expected results are computed from
// the list itself, so they hold whatever the stored form of a link is.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, submit, page, row } = require('./helpers.cjs');

const search = async (base, raw) => {
  const res = await fetch(`${base}/api/links?q=${raw}`);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { notJson: text.slice(0, 80) }; }
  return { status: res.status, body };
};
const expected = (all, needle) =>
  all.filter((l) => l.url.toLowerCase().includes(needle.toLowerCase())).map((l) => l.code);
const codes = (result) => (Array.isArray(result.body) ? result.body.map((l) => l.code) : result.body);

test('hidden: non-ASCII text matches, encoded as a browser sends it', async (t) => {
  const { base } = await start(t);
  await createLink(base, { url: 'https://example.com/路径/文件' });
  await createLink(base, { url: 'https://example.com/other' });
  await createLink(base, { url: 'https://example.com/café' });
  const all = (await list(base)).body;
  for (const needle of ['路径', 'CAFÉ']) {
    const result = await search(base, encodeURIComponent(needle));
    assert.equal(result.status, 200, needle);
    assert.deepEqual(codes(result), expected(all, needle), needle);
    assert.ok(codes(result).length >= 1, needle);
  }
});

test('hidden: a space arrives as %20 or as + (a GET form sends +)', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a b' })).body;
  await createLink(base, { url: 'https://example.com/ab' });
  const all = (await list(base)).body;
  const match = expected(all, 'a b');
  assert.ok(match.includes(a.code));
  assert.deepEqual(codes(await search(base, 'a%20b')), match);
  assert.deepEqual(codes(await search(base, 'a+b')), match);
});

test('hidden: text is matched literally, and special characters never break the search',
  async (t) => {
    const { base } = await start(t);
    await createLink(base, { url: 'https://example.com/a.b' });
    await createLink(base, { url: 'https://example.com/axb' });
    await createLink(base, { url: 'https://example.com/x?y=(1)&z=[2]' });
    const all = (await list(base)).body;
    for (const needle of ['a.b', '(1)', '[2]', '(', '[', '*', '\\', '?y=', '&z', '.*', '$']) {
      const result = await search(base, encodeURIComponent(needle));
      assert.equal(result.status, 200, needle);
      assert.deepEqual(codes(result), expected(all, needle), needle);
    }
  });

test('hidden: the page escapes the search text and keeps the original link visible',
  async (t) => {
    const { base } = await start(t);
    const a = (await createLink(base, { url: 'https://example.com/q?a=1&b=2' })).body;
    const evil = '"><script>alert(1)</script>';
    const shown = await page(base, `/?q=${encodeURIComponent(evil)}`);
    assert.equal(shown.status, 200);
    assert.ok(!shown.text.includes('<script>alert(1)'), 'no raw markup from q');
    assert.ok(!shown.text.includes('"><script'), 'q cannot close the attribute');
    assert.ok(shown.text.includes('&lt;script&gt;'), 'q is shown back, escaped');
    const amp = await page(base, `/?q=${encodeURIComponent('a=1&b')}`);
    assert.ok(row(amp.text, a.code), 'a match with & in its target is listed');
  });

test('hidden: links created through the web form are found, and the page search agrees',
  async (t) => {
    const { base } = await start(t);
    const made = await submit(base, { url: 'https://example.net/from-form' });
    assert.equal(made.status, 303);
    await createLink(base, { url: 'https://example.com/from-api' });
    const all = (await list(base)).body;
    const api = codes(await search(base, 'FROM-FORM'));
    assert.deepEqual(api, expected(all, 'from-form'));
    assert.equal(api.length, 1);
    const shown = await page(base, '/?q=from-form');
    for (const link of all) {
      assert.equal(Boolean(row(shown.text, link.code)), api.includes(link.code), link.url);
    }
  });

test('hidden: without q, or with an empty q, the page lists every link', async (t) => {
  const { base } = await start(t);
  await createLink(base, { url: 'https://example.com/one' });
  await createLink(base, { url: 'https://example.org/two' });
  const all = (await list(base)).body;
  for (const at of ['/', '/?q=']) {
    const shown = await page(base, at);
    for (const link of all) assert.ok(row(shown.text, link.code), `${at} ${link.url}`);
  }
});
