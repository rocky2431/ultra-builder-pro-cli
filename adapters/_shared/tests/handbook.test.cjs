'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BEGIN_MARKER,
  END_MARKER,
  applyHandbook,
  mergeHandbook,
  renderHandbook,
  resolveHandbookFile,
} = require('../handbook.cjs');

test('renders one common contract with host-native invocation syntax', () => {
  const claude = renderHandbook('claude');
  const codex = renderHandbook('codex');
  const opencode = renderHandbook('opencode');
  const kimi = renderHandbook('kimi');

  assert.match(claude, /\/ultra-plan/);
  assert.match(codex, /\$ultra-builder-pro:ultra-plan/);
  assert.match(opencode, /\/ultra-plan/);
  assert.match(kimi, /\/ultra-builder-pro:ultra-plan/);
  assert.match(kimi, /Kimi Code/);
  assert.match(kimi, /AgentSwarm/);
  for (const rendered of [claude, codex, opencode, kimi]) {
    assert.match(rendered, /\.ultra\/state\.db/);
    assert.match(rendered, /Separately installed providers/);
    assert.match(rendered, /ultra-change/);
    assert.match(rendered, /ultra-doctor/);
    assert.match(rendered, /metadata references/);
    assert.doesNotMatch(rendered, /\.ultra\/memory|memory\.retain|memory\.recall/);
    assert.match(rendered, new RegExp(BEGIN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(rendered, new RegExp(END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('merge preserves user content and is idempotent', () => {
  const existing = '# User rules\n\nKeep this.\n';
  const once = mergeHandbook(existing, 'claude');
  const twice = mergeHandbook(once, 'claude');

  assert.match(once, /^# User rules/m);
  assert.match(once, /Keep this\./);
  assert.equal(once, twice);
  assert.equal(once.split(BEGIN_MARKER).length - 1, 1);
});

test('Codex legacy Ultra section is replaced without touching the next section', () => {
  const existing = [
    '# Handbook',
    '',
    '## Ultra Builder Pro Runtime Contract',
    '',
    'Old memory contract under `.ultra/memory/`.',
    '',
    '## Standard Operating Workflow',
    '',
    'Keep this workflow.',
    '',
  ].join('\n');

  const merged = mergeHandbook(existing, 'codex');
  assert.doesNotMatch(merged, /Old memory contract/);
  assert.match(merged, /## Standard Operating Workflow\n\nKeep this workflow\./);
  assert.equal(merged.split(BEGIN_MARKER).length - 1, 1);
});

test('apply creates a backup and reports a no-op on the second run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-handbook-'));
  const file = path.join(root, 'AGENTS.md');
  fs.writeFileSync(file, '# Existing\n');

  const first = applyHandbook({ runtime: 'codex', file, now: '20260715T120000Z' });
  assert.equal(first.changed, true);
  assert.equal(first.backup, `${file}.ubp-backup-20260715T120000Z`);
  assert.equal(fs.readFileSync(first.backup, 'utf8'), '# Existing\n');

  const second = applyHandbook({ runtime: 'codex', file, now: '20260715T120001Z' });
  assert.equal(second.changed, false);
  assert.equal(second.backup, null);
});

test('default handbook paths are host-specific', () => {
  const homeDir = '/tmp/example-home';
  assert.equal(resolveHandbookFile('claude', { homeDir }), path.join(homeDir, '.claude', 'CLAUDE.md'));
  assert.equal(resolveHandbookFile('codex', { homeDir }), path.join(homeDir, '.codex', 'AGENTS.md'));
  assert.equal(resolveHandbookFile('opencode', { homeDir }), path.join(homeDir, '.config', 'opencode', 'AGENTS.md'));
  assert.equal(resolveHandbookFile('kimi', { homeDir }), path.join(homeDir, '.kimi-code', 'AGENTS.md'));
});
