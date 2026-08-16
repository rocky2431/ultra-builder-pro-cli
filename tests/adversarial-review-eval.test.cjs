'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'adversarial-review');
const SEEDS = path.join(__dirname, 'evals', 'adversarial-review-seeds.json');

test('adversarial review fixture stays green while its hidden seeds remain observable', () => {
  const local = spawnSync(process.execPath, ['--test'], { cwd: FIXTURE, encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr || local.stdout);

  const { placeOrder, REQUIRE_SECOND_CONFIRMATION } = require(path.join(FIXTURE, 'src', 'checkout.js'));
  let charges = 0;
  const result = placeOrder({ total: 42 }, () => {
    charges += 1;
    if (charges === 1) throw new Error('timeout-after-charge');
    return `charge-${charges}`;
  });
  assert.equal(result.chargeId, 'charge-2');
  assert.equal(charges, 2);
  assert.equal(REQUIRE_SECOND_CONFIRMATION, true);

  const unit = fs.readFileSync(path.join(FIXTURE, 'test', 'checkout.test.js'), 'utf8');
  assert.doesNotMatch(unit, /placeOrder/u);

  const northStar = fs.readFileSync(path.join(FIXTURE, '.ultra', 'north-star.md'), 'utf8');
  const intent = fs.readFileSync(
    path.join(FIXTURE, '.ultra', 'changes', 'active', 'C-ADV', 'intent.md'),
    'utf8',
  );
  const readme = fs.readFileSync(path.join(FIXTURE, 'README.md'), 'utf8');
  assert.match(northStar, /minimal preventable friction/iu);
  assert.match(intent, /mandatory second confirmation/iu);
  assert.match(intent, /set `REQUIRE_SECOND_CONFIRMATION=false`/iu);
  assert.match(readme, /one-click checkout/iu);
  assert.doesNotMatch(fs.readFileSync(path.join(FIXTURE, 'src', 'checkout.js'), 'utf8'), /process\.env|config|featureFlag/u);

  const seeds = JSON.parse(fs.readFileSync(SEEDS, 'utf8'));
  assert.deepEqual(seeds.map((seed) => seed.id), [
    'ADV-NS-01', 'ADV-CODE-01', 'ADV-TEST-01', 'ADV-RECOVERY-01', 'ADV-DOC-01',
  ]);
  for (const seed of seeds) {
    assert.ok(fs.existsSync(path.join(FIXTURE, seed.evidence_path)), seed.id);
  }
});
