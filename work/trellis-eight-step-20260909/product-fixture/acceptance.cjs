'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-acceptance-'));
const ledger = path.join(root, 'ledger.json');
const invoke = (...args) => spawnSync(process.execPath, ['cli.cjs', ...args], { cwd: __dirname, encoding: 'utf8' });
const csv = (name, body) => { const file = path.join(root, name); fs.writeFileSync(file, body); return file; };
const header = 'id,date,amount,currency,category,note\n';
const success = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const reject = (r) => { assert.notEqual(r.status, 0); assert.ok(r.stderr.trim()); };
const checks = [];
function check(name, fn) { try { fn(); checks.push({ name, passed: true }); } catch (e) { checks.push({ name, passed: false, error: e.message }); } }
check('seeded-money-regression', () => {
  const { cents } = require('./src/money.cjs');
  assert.equal(cents('1.13'), 113); assert.equal(cents('-1.13'), -113);
});
check('quoted-unicode-import-and-exact-cents', () => {
  const file = csv('first.csv', '\uFEFF' + header.replace('\n', '\r\n') + 'a,2026-09-01,1.13,USD,餐饮,"lunch, \"\"team\"\"\r\nmeeting"\r\n' + 'b,2026-09-02,-0.10,USD,餐饮,refund\r\n' + 'c,2026-09-03,2.00,EUR,Travel,taxi\r\n' + 'd,2026-08-31,99.00,USD,餐饮,last month\r\n');
  assert.deepEqual(success(invoke('import', file, ledger)), { added: 4, skipped: 0 });
  const rows = JSON.parse(fs.readFileSync(ledger)); assert.equal(rows.length, 4);
  assert.deepEqual(rows.find(r => r.id === 'a'), { id: 'a', date: '2026-09-01', amount_cents: 113, currency: 'USD', category: '餐饮', note: 'lunch, "team"\r\nmeeting' });
  assert.equal(rows.find(r => r.id === 'b').amount_cents, -10);
  assert.deepEqual(success(invoke('import', file, ledger)), { added: 0, skipped: 4 });
});
check('month-currency-category-report', () => assert.deepEqual(success(invoke('report', ledger, '2026-09')), [
  { currency: 'EUR', category: 'Travel', total_cents: 200, count: 1 },
  { currency: 'USD', category: '餐饮', total_cents: 103, count: 2 },
]));
check('batch-duplicate-zero-and-refund', () => {
  const file = csv('duplicate.csv', header + 'e,2026-09-30,0.00,USD,Misc,zero\ne,2026-09-30,0.00,USD,Misc,zero\nf,2026-09-30,-1.13,USD,Misc,refund\n');
  assert.deepEqual(success(invoke('import', file, ledger)), { added: 2, skipped: 1 });
  assert.equal(success(invoke('report', ledger, '2026-09')).find(r => r.category === 'Misc').total_cents, -113);
});
check('conflict-does-not-partially-write', () => {
  const before = fs.readFileSync(ledger, 'utf8');
  const file = csv('conflict.csv', header + 'new,2026-09-01,5.00,USD,Misc,valid\na,2026-09-01,9.00,USD,Misc,conflict\n');
  reject(invoke('import', file, ledger)); assert.equal(fs.readFileSync(ledger, 'utf8'), before);
});
check('malformed-inputs-preserve-ledger', () => {
  const before = fs.readFileSync(ledger, 'utf8');
  const bad = [
    header + 'x,2026-02-29,1.00,USD,Misc,bad date\n',
    header + 'x,2026-09-01,1.001,USD,Misc,bad money\n',
    header + 'x,2026-09-01,90071992547409.92,USD,Misc,unsafe\n',
    header + 'x,2026-09-01,1.00,usd,Misc,bad currency\n',
    header + ',2026-09-01,1.00,USD,Misc,missing id\n',
    header + 'x,2026-09-01,1.00,USD,,missing category\n',
    header + 'x,2026-09-01,1.00,USD,Misc,"unclosed\n',
    header + 'x,2026-09-01,1.00,USD,Misc,extra,column\n',
    'wrong,header\nx,y\n',
  ];
  bad.forEach((body, i) => { reject(invoke('import', csv(`bad-${i}.csv`, body), ledger)); assert.equal(fs.readFileSync(ledger, 'utf8'), before); });
});
check('corrupt-ledger-is-preserved', () => {
  const corrupt = path.join(root, 'corrupt.json'); fs.writeFileSync(corrupt, '{broken');
  reject(invoke('import', csv('empty.csv', header), corrupt)); assert.equal(fs.readFileSync(corrupt, 'utf8'), '{broken');
});
check('empty-report-and-invalid-usage', () => {
  assert.deepEqual(success(invoke('report', ledger, '2025-01')), []);
  reject(invoke('report', ledger, '2026-13')); reject(invoke('report', ledger, '2026-9')); reject(invoke('unknown')); reject(invoke());
});
console.log(JSON.stringify({ checks, passed: checks.filter(c => c.passed).length, total: checks.length }, null, 2));
fs.rmSync(root, { recursive: true, force: true });
process.exitCode = checks.every(c => c.passed) ? 0 : 1;
