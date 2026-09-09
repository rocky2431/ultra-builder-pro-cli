'use strict';
// Independent observation after implementation; does not alter the frozen acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cwd = path.resolve(process.argv[2]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-independent-'));
const header = 'id,date,amount,currency,category,note\n';
const csv = path.join(dir, 'new.csv'), ledger = path.join(dir, 'ledger.json');
const invoke = (...args) => spawnSync(process.execPath, ['cli.cjs', ...args], { cwd, encoding: 'utf8' });
const outcomes = [];
function check(name, fn) { try { fn(); outcomes.push({ name, passed: true }); } catch (error) { outcomes.push({ name, passed: false, error: error.message }); } }
check('malformed-existing-date-type-preserves-bytes', () => {
  const bad = JSON.stringify([{ id: 'old', date: ['2026-09-01'], amount_cents: 100, currency: 'USD', category: 'Food', note: '' }]);
  fs.writeFileSync(ledger, bad); fs.writeFileSync(csv, header + 'new,2026-09-02,2.00,USD,Food,ok\n');
  const r = invoke('import', csv, ledger);
  assert.notEqual(r.status, 0, 'Malformed ledger date array was accepted');
  assert.equal(fs.readFileSync(ledger, 'utf8'), bad);
});
check('quoted-field-at-eof-and-leap-day', () => {
  fs.writeFileSync(ledger, '[]'); fs.writeFileSync(csv, header + 'leap,2024-02-29,0.01,USD,Food,"tail"');
  const r = invoke('import', csv, ledger); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(ledger))[0].note, 'tail');
});
check('invalid-quote-syntax-preserves-bytes', () => {
  const before = fs.readFileSync(ledger, 'utf8');
  for (const note of ['"closed"junk', 'un"quoted']) {
    fs.writeFileSync(csv, header + `bad,2026-09-02,2.00,USD,Food,${note}\n`);
    const r = invoke('import', csv, ledger); assert.notEqual(r.status, 0); assert.equal(fs.readFileSync(ledger, 'utf8'), before);
  }
});
console.log(JSON.stringify({ cwd, outcomes, passed: outcomes.filter(o => o.passed).length, total: outcomes.length }, null, 2));
fs.rmSync(dir, { recursive: true, force: true });
process.exitCode = outcomes.every(o => o.passed) ? 0 : 1;
