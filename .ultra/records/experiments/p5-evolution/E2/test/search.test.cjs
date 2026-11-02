'use strict';

// Check C-search covers REQ-search.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, list, page, row } = require('./helpers.cjs');

const search = async (base, query) => {
  const res = await fetch(`${base}/api/links${query}`);
  return { status: res.status, body: await res.json() };
};

test('REQ-search: q finds links by their target, ignoring case, newest first', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/Alpha' })).body;
  const b = (await createLink(base, { url: 'https://example.org/beta' })).body;
  const c = (await createLink(base, { url: 'https://EXAMPLE.com/gamma' })).body;
  const all = (await list(base)).body;
  const found = await search(base, '?q=example.com');
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.map((l) => l.code), [c.code, a.code]);
  assert.deepEqual(found.body, all.filter((l) => l.code !== b.code));
  assert.deepEqual((await search(base, '?q=ALPHA')).body.map((l) => l.code), [a.code]);
  assert.deepEqual((await search(base, '?q=nothing-like-this')).body, []);
  assert.deepEqual((await search(base, '?q=')).body, all);
});

test('REQ-search: the page lists only the matches and shows the search again', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/alpha' })).body;
  const b = (await createLink(base, { url: 'https://example.org/beta' })).body;
  const shown = await page(base, '/?q=beta');
  assert.equal(shown.status, 200);
  assert.ok(row(shown.text, b.code), 'the match is listed');
  assert.equal(row(shown.text, a.code), null, 'the other link is not');
  const input = /<input[^>]*name="q"[^>]*>/u.exec(shown.text);
  assert.ok(input, 'a search field named q');
  assert.match(input[0], /value="beta"/u);
  assert.match(shown.text, /<form[^>]*method="get"/iu);
});
