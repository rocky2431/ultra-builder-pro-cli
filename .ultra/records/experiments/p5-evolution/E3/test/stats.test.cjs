'use strict';

// Check C-stats covers REQ-stats.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, createLink, visit, page } = require('./helpers.cjs');

const stats = async (base) => {
  const res = await fetch(`${base}/api/stats`);
  return { status: res.status, body: await res.json() };
};
const total = (html, name) => {
  const match = new RegExp(`data-total-${name}[^>]*>\\s*(\\d+)\\s*<`, 'u').exec(html);
  return match ? Number(match[1]) : null;
};

test('REQ-stats: the totals count links and clicks', async (t) => {
  const { base } = await start(t);
  assert.deepEqual((await stats(base)).body, { links: 0, clicks: 0, expired: 0 });
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  await createLink(base, { url: 'https://example.com/b' });
  await visit(base, a.code);
  await visit(base, a.code);
  const now = await stats(base);
  assert.equal(now.status, 200);
  assert.deepEqual(now.body, { links: 2, clicks: 2, expired: 0 });
});

test('REQ-stats: the page shows the same three numbers', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  await visit(base, a.code);
  const html = (await page(base)).text;
  assert.equal(total(html, 'links'), 1);
  assert.equal(total(html, 'clicks'), 1);
  assert.equal(total(html, 'expired'), 0);
});
