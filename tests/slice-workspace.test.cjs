'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const workspace = require('../skills/ultra-delegate/scripts/slice-workspace.cjs');
const delegate = require('../skills/ultra-delegate/scripts/delegate.cjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('real Git workspace lifecycle preserves committed output and refuses dirty, fenced or substituted trees', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-workspace-')));
  try {
    git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git(root, 'add', '.'); git(root, 'commit', '-m', 'test: base');
    const options = { projectRoot: root, sessionId: 'session' }, base = git(root, 'rev-parse', 'HEAD');
    const result = workspace.create('run', 'left', base, options), tree = path.join(root, result.worktree);
    assert.equal(delegate.validateWorktree(tree), base);
    fs.writeFileSync(path.join(tree, '.gitignore'), 'ignored-output.txt\n'); git(tree, 'add', '.gitignore'); git(tree, 'commit', '-m', 'test: ignore output');
    fs.writeFileSync(path.join(tree, 'ignored-output.txt'), 'must survive cleanup');
    assert.throws(() => workspace.cleanup('run', 'left', options), /clean|dirty/);
    assert.equal(workspace.status('run', 'left', options).dirty, true);
    assert.equal(fs.readFileSync(path.join(tree, 'ignored-output.txt'), 'utf8'), 'must survive cleanup');
    fs.unlinkSync(path.join(tree, 'ignored-output.txt'));
    assert.throws(() => workspace.create('run', 'left', base, options), /exists/);
    assert.throws(() => workspace.create('../escape', 'left', base, options), /identity/);
    fs.writeFileSync(path.join(tree, 'result.txt'), 'retained output');
    assert.throws(() => workspace.cleanup('run', 'left', options), /clean|dirty/);
    assert.equal(fs.readFileSync(path.join(tree, 'result.txt'), 'utf8'), 'retained output');
    git(tree, 'add', 'result.txt'); git(tree, 'commit', '-m', 'test: worker output');
    const head = git(tree, 'rev-parse', 'HEAD');
    const held = delegate.acquireWorktreeFence(root, { delegationId: 'unknown-worker', launchId: 'unknown-launch', worktree: tree, writableRootPaths: [tree], pid: null });
    assert.throws(() => workspace.cleanup('run', 'left', options), /fence conflict/);
    assert.ok(fs.existsSync(held.file)); assert.ok(fs.existsSync(tree));
    delegate.releaseWorktreeFence(root, 'unknown-worker', { launchId: 'unknown-launch' });
    assert.throws(() => workspace.cleanup('run', 'left', { ...options, sessionId: 'another' }), /session/);
    const removed = workspace.cleanup('run', 'left', options);
    assert.equal(removed.state, 'removed'); assert.equal(removed.retained_head, head); assert.ok(!fs.existsSync(tree));
    assert.equal(git(root, 'show', `${removed.retained_ref}:result.txt`), 'retained output');
    assert.equal(workspace.status('run', 'left', options).state, 'removed');
    const second = workspace.create('run', 'right', base, options), moved = path.join(root, second.worktree);
    fs.renameSync(moved, `${moved}-saved`); fs.mkdirSync(moved);
    assert.throws(() => workspace.cleanup('run', 'right', options), /identity|worktree/);
    assert.ok(fs.existsSync(`${moved}-saved`));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
