'use strict';

// Hidden check for REQ-stats (sealed; not shown to the writer).
const test = require('node:test');
const assert = require('node:assert/strict');
const { tempData, start, createLink, list, visit, page, sleep } = require('./helpers.cjs');

const stats = async (base) => {
  const res = await fetch(`${base}/api/stats`);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { notJson: text.slice(0, 80) }; }
  return { status: res.status, body };
};
const total = (html, name) => {
  const match = new RegExp(`data-total-${name}[^>]*>\\s*(\\d+)\\s*<`, 'u').exec(html);
  return match ? Number(match[1]) : null;
};
const del = (base, code) => fetch(`${base}/api/links/${code}`, { method: 'DELETE' });

test('hidden: expired links are counted, and still counted as links', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a', expires_in: 1 })).body;
  await createLink(base, { url: 'https://example.com/b' });
  await visit(base, a.code);
  await sleep(1300);
  assert.deepEqual((await stats(base)).body, { links: 2, clicks: 1, expired: 1 });
  const html = (await page(base)).text;
  assert.equal(total(html, 'expired'), 1);
  assert.equal(total(html, 'links'), 2);
});

test('hidden: deleting a link takes its clicks out of the totals', async (t) => {
  const { base } = await start(t);
  const a = (await createLink(base, { url: 'https://example.com/a' })).body;
  const b = (await createLink(base, { url: 'https://example.com/b' })).body;
  await visit(base, a.code);
  await visit(base, a.code);
  await visit(base, b.code);
  assert.equal((await del(base, a.code)).status, 204);
  assert.deepEqual((await stats(base)).body, { links: 1, clicks: 1, expired: 0 });
  const html = (await page(base)).text;
  assert.equal(total(html, 'clicks'), 1);
});

test('hidden: unknown codes add no clicks, and the totals survive a restart', async (t) => {
  const data = tempData();
  const first = await start(t, data);
  const a = (await createLink(first.base, { url: 'https://example.com/a' })).body;
  await visit(first.base, a.code);
  await visit(first.base, 'zzzzzzzz');
  await visit(first.base, 'constructor');
  assert.deepEqual((await stats(first.base)).body, { links: 1, clicks: 1, expired: 0 });
  await first.stop();
  const second = await start(t, data);
  assert.deepEqual((await stats(second.base)).body, { links: 1, clicks: 1, expired: 0 });
});

test('hidden: the page totals agree with the API after mixed activity', async (t) => {
  const { base } = await start(t);
  const made = [];
  for (const n of [1, 2, 3, 4]) {
    made.push((await createLink(base, { url: `https://example.com/${n}` })).body);
  }
  for (const [i, times] of [[0, 3], [2, 1], [3, 2]]) {
    for (let k = 0; k < times; k += 1) await visit(base, made[i].code);
  }
  await del(base, made[3].code);
  const api = (await stats(base)).body;
  const html = (await page(base)).text;
  assert.deepEqual(api, { links: 3, clicks: 4, expired: 0 });
  assert.deepEqual([total(html, 'links'), total(html, 'clicks'), total(html, 'expired')],
    [api.links, api.clicks, api.expired]);
  const sum = (await list(base)).body.reduce((n, l) => n + l.clicks, 0);
  assert.equal(api.clicks, sum);
});
