'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const delivery = require('./delivery-transaction.cjs');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-delivery-transaction-'));
  const target = path.join(rootDir, '.ultra', 'specs', 'product.md');
  const overlay = path.join(
    rootDir,
    '.ultra',
    'changes',
    'active',
    'delivery-change',
    'delta',
    'specs',
    'product.md',
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(path.dirname(overlay), { recursive: true });
  fs.writeFileSync(target, '# Product\n\nBefore.\n');
  fs.writeFileSync(overlay, '# Product\n\nAfter.\n');
  return {
    rootDir,
    target,
    overlay,
    entry: {
      kind: 'baseline_specification',
      id: 'product-update',
      action: 'update',
      target_path: '.ultra/specs/product.md',
      overlay_path: '.ultra/changes/active/delivery-change/delta/specs/product.md',
      before_digest: digest('# Product\n\nBefore.\n'),
      after_digest: digest('# Product\n\nAfter.\n'),
    },
  };
}

test('delivery transaction recovers an applied overlay after a process boundary', () => {
  const fx = fixture();
  try {
    const transaction = delivery.beginDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
      entries: [fx.entry],
    });
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nAfter.\n');
    assert.equal(transaction.status, 'applied');

    const recovered = delivery.recoverDeliveryTransactions({
      rootDir: fx.rootDir,
      archivedChangeIds: new Set(),
    });
    assert.equal(recovered.restored, 1);
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nBefore.\n');
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('delivery transaction commit is idempotent and preserves the converged bytes', () => {
  const fx = fixture();
  try {
    const first = delivery.beginDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
      entries: [fx.entry],
    });
    const resumed = delivery.beginDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
      entries: [fx.entry],
    });
    assert.equal(resumed.transaction_id, first.transaction_id);
    assert.equal(resumed.resumed, true);

    delivery.completeDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
    });
    delivery.completeDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
    });
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nAfter.\n');
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('delivery preflight rejects a later conflict before changing any target', () => {
  const fx = fixture();
  try {
    const secondOverlay = path.join(
      fx.rootDir,
      '.ultra',
      'changes',
      'active',
      'delivery-change',
      'documentation',
      'guide.md',
    );
    fs.mkdirSync(path.dirname(secondOverlay), { recursive: true });
    fs.writeFileSync(secondOverlay, '# Guide\n');
    const conflicting = {
      kind: 'documentation',
      id: 'guide-update',
      action: 'update',
      target_path: 'docs/guide.md',
      overlay_path: path.relative(fx.rootDir, secondOverlay),
      before_digest: digest('# Missing guide\n'),
      after_digest: digest('# Guide\n'),
    };

    assert.throws(
      () => delivery.beginDeliveryTransaction({
        rootDir: fx.rootDir,
        changeId: 'delivery-change',
        entries: [fx.entry, conflicting],
      }),
      (error) => error.code === 'DELIVERY_BASELINE_CONFLICT',
    );
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nBefore.\n');
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('delivery preparation removes a partial second-backup failure and retries cleanly', () => {
  const fx = fixture();
  const guideTarget = path.join(fx.rootDir, 'docs', 'guide.md');
  const guideOverlay = path.join(
    fx.rootDir,
    '.ultra',
    'changes',
    'active',
    'delivery-change',
    'documentation',
    'guide.md',
  );
  fs.mkdirSync(path.dirname(guideTarget), { recursive: true });
  fs.mkdirSync(path.dirname(guideOverlay), { recursive: true });
  fs.writeFileSync(guideTarget, '# Guide\n\nBefore.\n');
  fs.writeFileSync(guideOverlay, '# Guide\n\nAfter.\n');
  const entries = [
    fx.entry,
    {
      kind: 'documentation',
      id: 'guide-update',
      action: 'update',
      target_path: 'docs/guide.md',
      overlay_path: path.relative(fx.rootDir, guideOverlay),
      before_digest: digest('# Guide\n\nBefore.\n'),
      after_digest: digest('# Guide\n\nAfter.\n'),
    },
  ];
  const originalCopy = fs.copyFileSync;
  let copies = 0;
  try {
    fs.copyFileSync = (...args) => {
      copies += 1;
      if (copies === 2) {
        const error = new Error('injected second backup failure');
        error.code = 'EIO';
        throw error;
      }
      return originalCopy(...args);
    };
    assert.throws(
      () => delivery.beginDeliveryTransaction({
        rootDir: fx.rootDir,
        changeId: 'delivery-change',
        entries,
      }),
      (error) => error.code === 'EIO',
    );
  } finally {
    fs.copyFileSync = originalCopy;
  }

  try {
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nBefore.\n');
    assert.equal(fs.readFileSync(guideTarget, 'utf8'), '# Guide\n\nBefore.\n');
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);

    const retried = delivery.beginDeliveryTransaction({
      rootDir: fx.rootDir,
      changeId: 'delivery-change',
      entries,
    });
    assert.equal(retried.status, 'applied');
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nAfter.\n');
    assert.equal(fs.readFileSync(guideTarget, 'utf8'), '# Guide\n\nAfter.\n');

    const recovered = delivery.recoverDeliveryTransactions({
      rootDir: fx.rootDir,
      archivedChangeIds: new Set(),
    });
    assert.equal(recovered.restored, 1);
    assert.equal(recovered.failed, 0);
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);
    assert.equal(fs.readFileSync(fx.target, 'utf8'), '# Product\n\nBefore.\n');
    assert.equal(fs.readFileSync(guideTarget, 'utf8'), '# Guide\n\nBefore.\n');
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});

test('delivery recovery discards an interrupted unpublished staging directory idempotently', () => {
  const fx = fixture();
  try {
    const staging = path.join(
      fx.rootDir,
      delivery.TRANSACTION_ROOT,
      '.prepare-delivery-change-crash-fixture',
    );
    fs.mkdirSync(path.join(staging, 'backups'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'backups', '1'), 'partial backup');

    const recovered = delivery.recoverDeliveryTransactions({
      rootDir: fx.rootDir,
      archivedChangeIds: new Set(),
    });
    assert.equal(recovered.found, 1);
    assert.equal(recovered.restored, 1);
    assert.equal(recovered.failed, 0);
    assert.equal(fs.existsSync(staging), false);
    assert.deepEqual(delivery.listDeliveryTransactions(fx.rootDir), []);

    const repeated = delivery.recoverDeliveryTransactions({
      rootDir: fx.rootDir,
      archivedChangeIds: new Set(),
    });
    assert.deepEqual(
      { found: repeated.found, restored: repeated.restored, failed: repeated.failed },
      { found: 0, restored: 0, failed: 0 },
    );
  } finally {
    fs.rmSync(fx.rootDir, { recursive: true, force: true });
  }
});
