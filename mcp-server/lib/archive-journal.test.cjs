'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const journal = require('./archive-journal.cjs');

test('archive journal restores the exact active directory when finalization cannot run', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-archive-journal-'));
  const source = path.join(rootDir, '.ultra', 'changes', 'active', 'change-a');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'intent.md'), '# Change A\n');
  try {
    const prepared = journal.prepareArchiveMove({
      rootDir,
      change: { id: 'change-a', title: 'Change A', artifact_root: '.ultra/changes/active/change-a' },
      summary: 'Archive Change A.', baselineUpdates: [],
      noBaselineChangeReason: 'No baseline content changed.',
      now: new Date('2026-07-18T00:00:00.000Z'),
    });
    assert.equal(fs.existsSync(prepared.source), false);
    assert.equal(journal.listArchiveIntents(rootDir).length, 1);

    journal.rollbackArchiveIntent(rootDir, prepared.intent);
    assert.equal(fs.existsSync(source), true);
    assert.equal(fs.existsSync(path.join(source, 'intent.md')), true);
    assert.equal(fs.existsSync(path.join(source, 'archive-summary.md')), false);
    assert.equal(journal.listArchiveIntents(rootDir).length, 0);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
