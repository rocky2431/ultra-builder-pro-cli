'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BEGIN_MARKER,
  END_MARKER,
  FULL_BEGIN_MARKER,
  FULL_END_MARKER,
  applyHandbook,
  applyFullHandbook,
  mergeHandbook,
  mergeFullHandbook,
  previewFullHandbook,
  renderHandbook,
  renderFullHandbook,
  resolveHandbookFile,
} = require('../handbook.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

test('renders one common contract with host-native invocation syntax', () => {
  const claude = renderHandbook('claude');
  const codex = renderHandbook('codex');
  const opencode = renderHandbook('opencode');
  const kimi = renderHandbook('kimi');

  assert.match(claude, /\/ultra-builder-pro:ultra-plan/);
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
    assert.match(rendered, /Context Spine boundary/);
    assert.match(rendered, /Control boundary/);
    assert.match(rendered, /User intent owns goals, acceptance, non-goals/);
    assert.match(rendered, /The host model owns classification, research coverage/);
    assert.match(rendered, /The adapter uses native interaction and tools without becoming another authority/);
    assert.match(rendered, /Hooks do not block ordinary development or choose semantic routes/);
    assert.match(rendered, /budgets are advisory attention signals/);
    assert.match(rendered, /blocks change convergence/);
    assert.match(rendered, /health-checked atomically at archive/);
    assert.match(rendered, /never traps session stop/);
    assert.match(rendered, /change\.breadcrumb/);
    assert.match(rendered, /Specification learning boundary/);
    assert.match(rendered, /Decision boundary/);
    assert.match(rendered, /presents only the earliest unresolved decision/);
    assert.match(rendered, /cannot advance until blocking decisions are resolved/);
    assert.match(rendered, /ubp --all --global --doctor/);
    assert.doesNotMatch(rendered, /`ubp --doctor`/);
    assert.doesNotMatch(rendered, /\.ultra\/memory|memory\.retain|memory\.recall/);
    assert.match(rendered, new RegExp(BEGIN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(rendered, new RegExp(END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('renders one complete engineering handbook with host-native semantics', () => {
  const rendered = new Map([
    ['claude', renderFullHandbook('claude')],
    ['codex', renderFullHandbook('codex')],
    ['opencode', renderFullHandbook('opencode')],
    ['kimi', renderFullHandbook('kimi')],
  ]);

  assert.match(rendered.get('claude'), /# Claude Code User Engineering Handbook/);
  assert.match(rendered.get('codex'), /# Codex User Engineering Handbook/);
  assert.match(rendered.get('opencode'), /# OpenCode User Engineering Handbook/);
  assert.match(rendered.get('kimi'), /# Kimi Code User Engineering Handbook/);

  for (const [runtime, text] of rendered) {
    assert.match(text, /## Instruction Surface Boundaries/);
    assert.match(text, /## Standard Operating Workflow/);
    assert.match(text, /## Human-Agent Collaboration/);
    assert.match(text, /## MCP and Hook Governance/);
    assert.match(text, /## Verification Contract/);
    assert.match(text, /Do not add AI co-author trailers/);
    assert.match(text, new RegExp(FULL_BEGIN_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(text, new RegExp(FULL_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(text.split(BEGIN_MARKER).length - 1, 1, `${runtime} needs one Ultra runtime block`);
    assert.doesNotMatch(
      text,
      /graphify|~\/\.Codex|TaskCreate|TaskUpdate|TaskList|AskUserQuestion|Context7|Exa MCP|noreply@anthropic\.com/i,
      `${runtime} contains an external, retired, or foreign-host binding`,
    );
  }

  assert.match(rendered.get('claude'), /\/ultra-builder-pro:ultra-plan/);
  assert.doesNotMatch(rendered.get('claude'), /\$ultra-builder-pro:/);
  assert.match(rendered.get('codex'), /\$ultra-builder-pro:ultra-plan/);
  assert.doesNotMatch(rendered.get('codex'), /(^|[\s`])\/ultra-plan(?=$|[\s`,.;)])/m);
  assert.match(rendered.get('opencode'), /load `cc-collab` or `codex-collab` through the `skill` tool/);
  assert.doesNotMatch(rendered.get('opencode'), /\/(?:cc|codex)-collab/);
  assert.match(rendered.get('kimi'), /\/ultra-builder-pro:ultra-plan/);
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

test('full merge replaces legacy prompt sediment and preserves other provider blocks', () => {
  const existing = [
    '<!-- codebase-memory-mcp:start -->',
    '# External graph provider',
    'Keep this provider-owned content.',
    '<!-- codebase-memory-mcp:end -->',
    '',
    '# Ultra Builder Pro 6.6.0',
    '',
    'AskUserQuestion and TaskCreate are old host bindings.',
    '',
    renderHandbook('opencode'),
    '',
  ].join('\n');

  const once = mergeFullHandbook(existing, 'opencode');
  const twice = mergeFullHandbook(once, 'opencode');

  assert.match(once, /Keep this provider-owned content/);
  assert.doesNotMatch(once, /Ultra Builder Pro 6\.6\.0|AskUserQuestion|TaskCreate/);
  assert.equal(once, twice);
  assert.equal(once.split(FULL_BEGIN_MARKER).length - 1, 1);
  assert.equal(once.split(BEGIN_MARKER).length - 1, 1);
});

test('full merge preserves every supported external block byte-for-byte and normalizes Ultra blocks', () => {
  const repeated = [
    '<!-- codebase-memory-mcp:start -->',
    'SAME',
    '<!-- codebase-memory-mcp:end -->',
  ].join('\n');
  const beginEnd = [
    '<!-- BEGIN external-provider -->',
    'KEEP_BEGIN_END',
    '<!-- END external-provider -->',
  ].join('\n');
  const nested = [
    '<!-- nested-provider:start -->',
    'KEEP_NESTED',
    '<!-- nested-provider:end -->',
  ].join('\n');
  const oldFull = renderFullHandbook('codex').replace(
    FULL_END_MARKER,
    `${nested}\n${FULL_END_MARKER}`,
  );
  const existing = [
    repeated,
    repeated,
    beginEnd,
    oldFull,
    renderHandbook('codex'),
  ].join('\n\n');

  const once = mergeFullHandbook(existing, 'codex');
  const twice = mergeFullHandbook(once, 'codex');

  assert.equal(once, twice);
  assert.equal(once.split(repeated).length - 1, 2);
  assert.equal(once.split(beginEnd).length - 1, 1);
  assert.equal(once.split(nested).length - 1, 1);
  assert.equal(once.split(FULL_BEGIN_MARKER).length - 1, 1);
  assert.equal(once.split(BEGIN_MARKER).length - 1, 1);
  assert.equal(once.split(END_MARKER).length - 1, 1);
  assert.doesNotThrow(() => mergeHandbook(once, 'codex'));
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

test('full apply creates a backup and reports a no-op on the second run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-full-handbook-'));
  const file = path.join(root, 'AGENTS.md');
  fs.writeFileSync(file, '# Legacy host prompt\n');

  const preview = previewFullHandbook({ runtime: 'codex', file });
  const first = applyFullHandbook({
    runtime: 'codex',
    file,
    confirmation: preview.confirmation,
    now: '20260724T120000Z',
  });
  assert.equal(first.changed, true);
  assert.equal(first.backup, `${file}.ubp-backup-20260724T120000Z`);
  assert.equal(fs.readFileSync(first.backup, 'utf8'), '# Legacy host prompt\n');
  assert.match(fs.readFileSync(file, 'utf8'), /# Codex User Engineering Handbook/);

  const second = applyFullHandbook({ runtime: 'codex', file, now: '20260724T120001Z' });
  assert.equal(second.changed, false);
  assert.equal(second.backup, null);
});

test('full apply requires a current preview confirmation before destructive convergence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-confirmed-handbook-'));
  const file = path.join(root, 'AGENTS.md');
  fs.writeFileSync(file, 'KEEP_UNMARKED_UNTIL_CONFIRMED\n');

  assert.throws(
    () => applyFullHandbook({ runtime: 'codex', file }),
    /requires a confirmation token from a current full preview/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'KEEP_UNMARKED_UNTIL_CONFIRMED\n');

  const preview = previewFullHandbook({ runtime: 'codex', file });
  fs.appendFileSync(file, 'CHANGED_AFTER_PREVIEW\n');
  assert.throws(
    () => applyFullHandbook({ runtime: 'codex', file, confirmation: preview.confirmation }),
    /stale or does not match/,
  );
  assert.match(fs.readFileSync(file, 'utf8'), /CHANGED_AFTER_PREVIEW/);
});

test('full apply follows a handbook symlink without replacing it and preserves target mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-symlink-handbook-'));
  const managed = path.join(root, 'dotfiles', 'AGENTS.md');
  const file = path.join(root, 'AGENTS.md');
  fs.mkdirSync(path.dirname(managed));
  fs.writeFileSync(managed, '# Managed by dotfiles\n', { mode: 0o640 });
  fs.symlinkSync(path.relative(root, managed), file);

  const preview = previewFullHandbook({ runtime: 'codex', file });
  const result = applyFullHandbook({
    runtime: 'codex',
    file,
    confirmation: preview.confirmation,
    now: '20260724T130000Z',
  });

  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
  assert.match(fs.readFileSync(managed, 'utf8'), /# Codex User Engineering Handbook/);
  assert.equal(fs.statSync(managed).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(result.backup, 'utf8'), '# Managed by dotfiles\n');
});

test('handbook CLI exposes full preview and apply without changing default mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-handbook-cli-'));
  const file = path.join(root, 'AGENTS.md');
  const cli = path.join(REPO_ROOT, 'bin', 'handbook.js');
  fs.writeFileSync(file, '# Legacy\n');

  const bounded = execFileSync(
    process.execPath,
    [cli, 'preview', '--runtime', 'codex', '--file', file],
    { encoding: 'utf8' },
  );
  assert.match(bounded, /# Legacy/);
  assert.doesNotMatch(bounded, /# Codex User Engineering Handbook/);

  const full = spawnSync(
    process.execPath,
    [cli, 'preview', '--runtime', 'codex', '--file', file, '--full'],
    { encoding: 'utf8' },
  );
  assert.equal(full.status, 0, full.stderr);
  assert.doesNotMatch(full.stdout, /# Legacy/);
  assert.match(full.stdout, /# Codex User Engineering Handbook/);
  const confirmation = /Full apply confirmation: ([a-f0-9]{64})/.exec(full.stderr)?.[1];
  assert.ok(confirmation, 'full preview must emit a confirmation token on stderr');

  const result = JSON.parse(execFileSync(
    process.execPath,
    [cli, 'apply', '--runtime', 'codex', '--file', file, '--full', '--confirm', confirmation],
    { encoding: 'utf8' },
  ));
  assert.equal(result.mode, 'full');
  assert.equal(result.changed, true);
  assert.ok(fs.existsSync(result.backup));
});

test('handbook CLI rejects missing option values and unconfirmed full apply', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-handbook-cli-errors-'));
  const home = path.join(root, 'home');
  const defaultFile = path.join(home, '.codex', 'AGENTS.md');
  const cli = path.join(REPO_ROOT, 'bin', 'handbook.js');

  const missingFile = spawnSync(
    process.execPath,
    [cli, 'apply', '--runtime', 'codex', '--file'],
    { encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.notEqual(missingFile.status, 0);
  assert.match(missingFile.stderr, /--file requires a value/);
  assert.equal(fs.existsSync(defaultFile), false);

  const swallowedFlag = spawnSync(
    process.execPath,
    [cli, 'apply', '--runtime', 'codex', '--file', '--full'],
    { encoding: 'utf8', env: { ...process.env, HOME: home } },
  );
  assert.notEqual(swallowedFlag.status, 0);
  assert.match(swallowedFlag.stderr, /--file requires a value/);
  assert.equal(fs.existsSync(defaultFile), false);

  const target = path.join(root, 'AGENTS.md');
  fs.writeFileSync(target, 'KEEP_WITHOUT_CONFIRMATION\n');
  const unconfirmed = spawnSync(
    process.execPath,
    [cli, 'apply', '--runtime', 'codex', '--file', target, '--full'],
    { encoding: 'utf8' },
  );
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /--confirm/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'KEEP_WITHOUT_CONFIRMATION\n');
});

test('default handbook paths are host-specific', () => {
  const homeDir = '/tmp/example-home';
  assert.equal(resolveHandbookFile('claude', { homeDir }), path.join(homeDir, '.claude', 'CLAUDE.md'));
  assert.equal(resolveHandbookFile('codex', { homeDir }), path.join(homeDir, '.codex', 'AGENTS.md'));
  assert.equal(resolveHandbookFile('opencode', { homeDir }), path.join(homeDir, '.config', 'opencode', 'AGENTS.md'));
  assert.equal(resolveHandbookFile('kimi', { homeDir }), path.join(homeDir, '.kimi-code', 'AGENTS.md'));
});

test('repository host guides are concise, host-native, and free of external skill declarations', () => {
  const claude = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
  const codex = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');

  for (const [runtime, text] of [['claude', claude], ['codex', codex]]) {
    assert.ok(text.split('\n').length <= 140, `${runtime} repository guide duplicates the user handbook`);
    assert.match(text, /Repository Engineering Guide/);
    assert.match(text, /adapters\/_shared\/handbook\.cjs/);
    assert.match(text, /npm run verify:release/);
    assert.doesNotMatch(
      text,
      /graphify|Ultra Builder Pro 6\.6\.0|~\/\.Codex|TaskCreate|TaskUpdate|TaskList|AskUserQuestion|Context7|Exa MCP|noreply@anthropic\.com/,
      `${runtime} repository guide contains stale or foreign-host prompt text`,
    );
  }
  assert.match(claude, /Claude Code/);
  assert.match(codex, /Codex/);
});
