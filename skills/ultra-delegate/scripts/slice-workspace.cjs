'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const delegate = require('./delegate.cjs');
const slice = require('./run-slice.cjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const identity = (file) => { const s = fs.lstatSync(file, { bigint: true }); return `${s.dev}:${s.ino}`; };

function locations(run, tree, options) {
  if (![run, tree].every((v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(v))) throw new Error('invalid_workspace_identity');
  if (typeof options.sessionId !== 'string' || !options.sessionId) throw new Error('session_required');
  const root = fs.realpathSync(options.projectRoot || process.cwd());
  return { root, tree: slice.local(root, `.ultra/.runtime/worktrees/${run}/${tree}`), record: slice.local(root, `.ultra/.runtime/workspaces/${run}/${tree}.json`) };
}
function record(run, tree, options) {
  const paths = locations(run, tree, options), value = slice.json(paths.record);
  if (value.$schema !== 'ultra-workspace-v1' || value.run_id !== run || value.tree_id !== tree
      || value.primary_session_id !== options.sessionId || value.worktree !== path.relative(paths.root, paths.tree)) throw new Error('workspace_session_identity_mismatch');
  return { ...paths, value };
}
function fenced(paths, action) {
  const delegationId = `workspace-${crypto.randomUUID()}`, launchId = crypto.randomUUID();
  delegate.acquireWorktreeFence(paths.root, { delegationId, launchId, worktree: paths.tree, writableRootPaths: [paths.tree], pid: process.pid });
  try { return action(); }
  finally { delegate.releaseWorktreeFence(paths.root, delegationId, { launchId }); }
}
function register(run, tree, options = {}) {
  const paths = locations(run, tree, options);
  if (fs.existsSync(paths.record)) throw new Error('workspace_exists');
  return fenced(paths, () => {
    const head = delegate.validateWorktree(paths.tree);
    if (git(paths.root, 'rev-parse', '--path-format=absolute', '--git-common-dir') !== git(paths.tree, 'rev-parse', '--path-format=absolute', '--git-common-dir')) throw new Error('workspace_repository_mismatch');
    const value = { $schema: 'ultra-workspace-v1', run_id: run, tree_id: tree, primary_session_id: options.sessionId,
      worktree: path.relative(paths.root, paths.tree), filesystem_identity: identity(paths.tree), base_revision: head,
      state: 'registered', observed_at: new Date().toISOString() };
    fs.mkdirSync(path.dirname(paths.record), { recursive: true });
    fs.writeFileSync(paths.record, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return value;
  });
}
function create(run, tree, base, options = {}) {
  const paths = locations(run, tree, options);
  if (fs.existsSync(paths.record) || fs.existsSync(paths.tree)) throw new Error('workspace_exists');
  if (typeof base !== 'string' || !/^[a-f0-9]{40,64}$/u.test(base)
      || git(paths.root, 'rev-parse', '--verify', `${base}^{commit}`) !== base) throw new Error('invalid_base_revision');
  fs.mkdirSync(path.dirname(paths.tree), { recursive: true });
  git(paths.root, 'worktree', 'add', '--detach', paths.tree, base);
  // A registration failure preserves the real Git tree for explicit register/recovery.
  return register(run, tree, options);
}
function status(run, tree, options = {}) {
  const { value, ...paths } = record(run, tree, options);
  if (value.state === 'removed') return value;
  if (identity(paths.tree) !== value.filesystem_identity) throw new Error('workspace_identity_changed');
  return { ...value, head: git(paths.tree, 'rev-parse', 'HEAD'), dirty: !!git(paths.tree, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored') };
}
function cleanup(run, tree, options = {}) {
  const paths = record(run, tree, options);
  if (paths.value.state === 'removed') return paths.value;
  return fenced(paths, () => {
    if (identity(paths.tree) !== paths.value.filesystem_identity) throw new Error('workspace_identity_changed');
    if (git(paths.tree, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored')) throw new Error('workspace_must_be_clean');
    const head = delegate.validateWorktree(paths.tree); // Dirty and untracked output stays in place.
    const ref = `refs/ultra/workspaces/${run}/${tree}`;
    // Retain even an unmerged detached commit before removing its clean working tree.
    const existing = (() => { try { return git(paths.root, 'rev-parse', '--verify', ref); } catch { return null; } })();
    if (existing !== null && existing !== head) throw new Error('retained_workspace_ref_conflict');
    if (existing === null) git(paths.root, 'update-ref', ref, head, '0'.repeat(head.length));
    git(paths.root, 'worktree', 'remove', paths.tree);
    const value = { ...paths.value, state: 'removed', retained_ref: ref, retained_head: head, observed_at: new Date().toISOString() };
    delegate.writeAtomic(paths.record, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  });
}
function handle(argv, options = {}) {
  const [action, ...args] = argv, values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--run', '--tree', '--base', '--session'].includes(args[i]) || args[i] in values || !args[i + 1]) throw new Error('invalid_arguments');
    values[args[i]] = args[i + 1];
  }
  const opts = { ...options, sessionId: values['--session'] };
  if (action === 'create' && values['--base']) return create(values['--run'], values['--tree'], values['--base'], opts);
  if (['register', 'status', 'cleanup'].includes(action) && !values['--base']) return ({ register, status, cleanup })[action](values['--run'], values['--tree'], opts);
  throw new Error('invalid_arguments');
}
module.exports = { create, register, status, cleanup, handle };
