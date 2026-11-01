'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { gitAsync, bindGit } = require('./git-state.cjs');
const { problem } = require('./formats.cjs');
const { status } = require('./states.cjs');
const { execute } = require('./checks.cjs');
const { acquireLock } = require('./ledger.cjs');
const { load } = require('./loading.cjs');
const { planProblems } = require('./plan.cjs');
const INTERRUPTS = require('./signals.cjs');

const passing = (record) => record.outcome === 'pass' && !record.dirty;
const text = (value) => value.toString('utf8').trim();
const paths = (value) => value.toString('utf8').split('\0').filter(Boolean);
const firstError = (error) => String(error.stderr || error.message).split('\n')
  .find((line) => line.trim()) ?? 'Git failed';

async function resolveCommit(run, root, ref) {
  try { return text(await run(root, ['rev-parse', '--verify', `${ref}^{commit}`])); }
  catch (error) {
    if (error.exitCode) throw error;
    throw new Error(`Cannot resolve commit ${ref}. Use a valid Git commit or branch.`);
  }
}

async function ancestor(run, root, before, after) {
  try { await run(root, ['merge-base', '--is-ancestor', before, after]); return true; }
  catch (error) { if (error.code === 1) return false; throw error; }
}

async function mergeInto(run, root, commit, branch) {
  try {
    await run(root, ['merge', '--no-ff', '--no-edit', '-m',
      `Merge ${branch} (ubp merge gate)`, commit]);
    return [];
  } catch (error) {
    if (error.exitCode) throw error;
    const conflicts = paths(await run(root, ['diff', '--name-only', '--diff-filter=U', '-z']));
    if (!conflicts.length) throw error;
    return conflicts;
  }
}

function makeWritable(directory) {
  const entry = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!entry?.isDirectory()) return;
  fs.chmodSync(directory, entry.mode | 0o700);
  for (const child of fs.readdirSync(directory, { withFileTypes: true })) {
    if (child.isDirectory()) makeWritable(path.join(directory, child.name));
  }
}

async function removeTree(root, directory, warnings) {
  try { await gitAsync(root, ['worktree', 'remove', '--force', directory]); return; }
  catch { /* A check may have made directories read-only, or left an unregistered tree. */ }
  try {
    makeWritable(directory);
    fs.rmSync(directory, { recursive: true, force: true });
  } catch (error) { warnings.push(`Could not remove ${directory}: ${error.message}`); }
  try {
    const registered = paths(await gitAsync(root, ['worktree', 'list', '--porcelain', '-z']))
      .includes(`worktree ${directory}`);
    if (registered) await gitAsync(root, ['worktree', 'remove', '--force', directory]);
  } catch (error) { warnings.push(`Could not unregister ${directory}: ${firstError(error)}`); }
}

async function dirtyUltra(run, root) {
  const changed = paths(await run(root, ['diff', '--name-only', '-z', '--', '.ultra']));
  const staged = paths(await run(root,
    ['diff', '--cached', '--name-only', '-z', 'HEAD', '--', '.ultra']));
  const untracked = paths(await run(root,
    ['ls-files', '--others', '--exclude-standard', '-z', '--', '.ultra']));
  return [...new Set([...changed, ...staged, ...untracked])].filter((file) =>
    file !== '.ultra/.runtime' && !file.startsWith('.ultra/.runtime/'));
}

async function firstBad(run, probe, root, head, branch, commits, check) {
  const reset = async () => {
    await run(root, ['reset', '--hard', head]);
    await run(root, ['clean', '-fdx']);
  };
  await reset();
  if (!passing(await probe(check))) return 'not green at HEAD before the merge';
  let left = 0;
  let right = commits.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    await reset();
    const conflicts = await mergeInto(run, root, commits[middle], branch);
    const green = !conflicts.length && passing(await probe(check));
    if (green) left = middle + 1;
    else right = middle;
  }
  const sha = commits[left];
  const subject = text(await run(root, ['show', '-s', '--format=%s', sha]));
  return `first bad commit ${sha} ${subject}`;
}

async function merge(project, branch, expected) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(expected)) {
    throw new Error('--expect-head requires a full commit id (40 or 64 hex digits).');
  }
  const root = project.root;
  const warnings = [];
  const refused = (code, message, hint) => ({ ok: false, merged: null,
    problems: [problem(code, message, hint)], warnings });
  const moved = () => refused('head-moved', 'HEAD differs from --expect-head',
    'Review the current HEAD and retry with its full commit id.');
  const release = acquireLock(root, 'merge');
  if (!release) return refused('merge-busy', 'Another merge holds merge.lock',
    'Retry after the running merge finishes.');
  let temporary;
  let unbind;
  let interrupted = 0;
  let forwarding = false;
  const controller = new AbortController();
  const ensureRunning = () => {
    if (interrupted) {
      throw Object.assign(new Error('Merge interrupted.'), { exitCode: interrupted });
    }
  };
  const handlers = Object.entries(INTERRUPTS).map(([signal, exitCode]) => [signal, () => {
    if (!forwarding) { interrupted = exitCode; controller.abort(); }
  }]);
  const run = async (directory, args) => {
    ensureRunning();
    try {
      const result = await gitAsync(directory, args, forwarding
        ? { detached: true } : { signal: controller.signal });
      ensureRunning();
      return result;
    } catch (error) {
      interrupted ||= INTERRUPTS[error.signal] ?? 0;
      ensureRunning();
      throw error;
    }
  };
  for (const [signal, handler] of handlers) process.on(signal, handler);
  try {
    const tip = await resolveCommit(run, root, branch);
    const head = await resolveCommit(run, root, expected);
    const directory = path.join(root, '.ultra', '.runtime', 'merge');
    fs.mkdirSync(directory, { recursive: true });
    const registered = paths(await run(root, ['worktree', 'list', '--porcelain', '-z']))
      .filter((entry) => entry.startsWith('worktree ')).map((entry) => entry.slice(9))
      .filter((entry) => entry.startsWith(`${directory}${path.sep}`));
    const leftovers = new Set([...registered,
      ...fs.readdirSync(directory).map((entry) => path.join(directory, entry))]);
    for (const entry of leftovers) {
      await removeTree(root, entry, warnings);
      ensureRunning();
    }
    const state = status(project);
    if (await resolveCommit(run, root, 'HEAD') !== head) return moved();
    const dirty = await dirtyUltra(run, root);
    if (state.dirty || dirty.length) return refused('dirty-tree',
      `Uncommitted code or .ultra files: ${dirty.join(', ')}`,
      'Commit code and .ultra/ first, then retry.');
    if (state.gate !== 'pass') return refused('plan-gate', `Plan gate is ${state.gate}`,
      'Fix plan problems and rerun gate.');
    if (await ancestor(run, root, tip, head)) return refused('nothing-to-merge',
      `${branch} is already in HEAD`, 'Choose a branch with commits not yet merged.');
    const base = text(await run(root, ['merge-base', head, tip]));
    const truth = ['.ultra/spec.md', '.ultra/checks.json', '.ultra/plan.json',
      '.ultra/ledger/milestones.jsonl', '.ultra/ledger/approvals.jsonl'];
    const changed = paths(await run(root,
      ['diff', '--name-only', '-z', base, tip, '--', ...truth]));
    const problems = truth.filter((file) => changed.includes(file)).map((file) =>
      problem('truth-changed', `${branch} changes ${file}`,
        'Have the planner change and gate truth files on the main line.'));
    if (problems.length) return { ok: false, merged: null, problems, warnings };
    temporary = path.join(directory, randomUUID());
    await run(root, ['worktree', 'add', '--detach', temporary, head]);
    unbind = bindGit(temporary);
    const conflicts = await mergeInto(run, temporary, tip, branch);
    if (conflicts.length) return refused('merge-conflict',
      `Conflicting paths: ${conflicts.join(', ')}`,
      conflicts.some((file) => file.startsWith('.ultra/ledger/'))
        ? 'Add .ultra/ledger/*.jsonl merge=union to .gitattributes on the main line.'
        : 'Resolve conflicts on the branch and retry.');
    const mergedProblems = planProblems(load(temporary));
    if (mergedProblems.length) return refused('merged-gate',
      `Merged plan problems: ${mergedProblems.map((p) => p.code).join(', ')}`,
      'Repair plan problems on the branch and retry.');
    const merged = await resolveCommit(run, temporary, 'HEAD');
    const closed = new Set(project.closures.map((c) => c.milestone));
    const required = new Set(project.milestones.filter((m) => closed.has(m.id)
      || m.id === state.milestone).flatMap((m) => m.requirements));
    const matters = (c) => Object.hasOwn(c, 'fix') || c.covers.some((id) => required.has(id));
    const probe = async (check) => {
      ensureRunning();
      const record = await execute({ ...project, root: temporary }, check);
      ensureRunning();
      return record;
    };
    const failing = [];
    for (const check of project.checks) {
      const record = await probe(check);
      if (matters(check) && !passing(record)) failing.push({ check, record });
    }
    if (failing.length) {
      const history = await run(root,
        ['rev-list', '--first-parent', '--reverse', `${base}..${tip}`]);
      const commits = text(history).split('\n').filter(Boolean);
      for (const { check, record } of failing) {
        const bad = await firstBad(run, probe, temporary, head, branch, commits, check);
        const reason = record.dirty && record.outcome === 'pass'
          ? 'dirty-run' : record.error_line || record.reason;
        problems.push(problem('check-not-green',
          `${check.id} is not green: ${reason}; ${bad}`,
          check.fix ?? 'Repair the failing check on the branch and retry.'));
      }
    }
    ensureRunning();
    if (problems.length) return { ok: false, merged: null, problems, warnings };
    if (await resolveCommit(run, root, 'HEAD') !== head) return moved();
    forwarding = true;
    try { await run(root, ['merge', '--ff-only', merged]); }
    catch (error) {
      if (await resolveCommit(run, root, 'HEAD') !== head) return moved();
      return refused('fast-forward-failed', firstError(error),
        'Restore the main tree and commit .ultra/ before retrying.');
    }
    return { ok: true, merged, problems: [], warnings };
  } catch (error) {
    interrupted ||= INTERRUPTS[error.signal] ?? 0;
    ensureRunning();
    throw error;
  } finally {
    try { if (temporary) await removeTree(root, temporary, warnings); }
    finally {
      unbind?.();
      release();
      const detach = () => {
        for (const [signal, handler] of handlers) process.off(signal, handler);
      };
      // A completed fast-forward stays protected while the CLI flushes its result.
      if (forwarding) process.once('exit', detach);
      else detach();
    }
  }
}

module.exports = { merge };
