'use strict';

// P4 acceptance for the v6 engine (RESULT.md §3.6–3.7 and §5 P4, contract in
// engine/FORMATS.md): invariants, cleanup nodes and their cadence, the retro view, and the
// merge gate. Black-box: every observation goes through the CLI against a throwaway Git
// fixture.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'engine', 'cli.cjs');
const UBP = path.join(ROOT, 'bin', 'install.js');
const NODE = JSON.stringify(process.execPath);
const FIX = 'Split the file: no source file may exceed 300 lines.';

const SPEC = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.

## REQ-003 Share the list
The user shares a read-only link to the list.
`;

// Fails when `.ultra/.runtime/fail-<id>` exists (toggled without touching code), or when a
// committed file `src/broken-<id>` exists (travels with commits, for the merge gate).
const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('.ultra/.runtime/fail-' + id) || fs.existsSync('src/broken-' + id)) {
  console.log('AssertionError: ' + id + ' toggled off');
  process.exit(1);
}
console.log('pass 1');
`;

const check = (id, covers, extra = {}) => ({ id, covers,
  run: `${NODE} checks/pass.cjs ${id}`, expect: 'pass [1-9]', ...extra });
const invariant = (id, fix = FIX) => check(id, [], { fix });

const CHECKS = [
  check('C-1', ['REQ-001']),
  check('C-12', ['REQ-001', 'REQ-002']),
  check('C-2', ['REQ-002']),
  check('C-3', ['REQ-003']),
];

const PLAN = {
  version: 1,
  milestones: [
    { id: 'M1', title: 'Core list', requirements: ['REQ-001', 'REQ-002'], journey: 'C-12' },
    { id: 'M2', title: 'Sharing', requirements: ['REQ-003'], journey: 'C-3' },
  ],
  nodes: [
    { id: 'N-01', milestone: 'M1', title: 'Add', covers: ['REQ-001'], depends: [] },
    { id: 'N-02', milestone: 'M1', title: 'Remove', covers: ['REQ-002'], depends: ['N-01'] },
    { id: 'N-03', milestone: 'M2', title: 'Share', covers: ['REQ-003'], depends: ['N-02'] },
  ],
};

const checksFile = (checks) => `${JSON.stringify({ version: 1, checks }, null, 2)}\n`;
const planFile = (plan) => `${JSON.stringify(plan, null, 2)}\n`;

function git(root, args) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
    ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '--allow-empty', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

function project(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p4-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'UBP Test']);
  git(root, ['config', 'user.email', 'ubp@example.invalid']);
  const base = {
    '.gitignore': '.ultra/.runtime/\n',
    'src/app.cjs': 'module.exports = { items: [] };\n',
    'checks/pass.cjs': PASS_SCRIPT,
    '.ultra/spec.md': SPEC,
    '.ultra/checks.json': checksFile(CHECKS),
    '.ultra/plan.json': planFile(PLAN),
  };
  for (const [relative, content] of Object.entries({ ...base, ...files })) {
    write(root, relative, content);
  }
  commitAll(root, 'fixture');
  return { root };
}

function run(fx, args, entry = CLI, env = process.env) {
  return spawnSync(process.execPath, [entry, ...args, '--root', fx.root], {
    encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env,
  });
}

function ok(fx, args, expectedExit = 0, entry = CLI) {
  const result = run(fx, args, entry);
  assert.equal(result.status, expectedExit,
    `${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

const json = (fx, args, expectedExit = 0) =>
  JSON.parse(ok(fx, [...args, '--json'], expectedExit).stdout);
const status = (fx) => json(fx, ['status']);
const codes = (result) => result.problems.map((p) => p.code);
const breakCheck = (fx, id) => write(fx.root, `.ultra/.runtime/fail-${id}`, '');
const mendCheck = (fx, id) => fs.rmSync(path.join(fx.root, `.ultra/.runtime/fail-${id}`));

function ledgerBytes(fx) {
  return ['evidence', 'plan-log', 'nodes', 'milestones', 'approvals'].map((name) => {
    const file = path.join(fx.root, '.ultra', 'ledger', `${name}.jsonl`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  });
}

function completeM1(fx) {
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
}

// The method commits `.ultra/` after the gate, after node completions and after closures.
function commitUltra(fx, message = 'ultra') {
  git(fx.root, ['add', '.ultra']);
  git(fx.root, ['commit', '-q', '--allow-empty', '-m', message]);
  return git(fx.root, ['rev-parse', 'HEAD']);
}

function closeM1(fx) {
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  ok(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    '.ultra/records/milestones/M1-review.md']);
}

// ---------------------------------------------------------------------------------------
// Invariants

test('an invariant runs with the other checks, and its failure prints how to fix it', (t) => {
  const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS, invariant('I-size')]) });
  ok(fx, ['gate']);
  breakCheck(fx, 'I-size');
  const result = ok(fx, ['check'], 1);
  assert.ok(result.stdout.includes(`I-size: fail (exit-1)\n  fix: ${FIX}\n`), result.stdout);

  let state = status(fx);
  assert.deepEqual(state.invariants, [
    { id: 'I-size', state: 'red', reasons: ['exit-1'], fix: FIX },
  ]);
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 0 次 · 不变量 1 未绿');
  const refused = json(fx, ['node', 'done', 'N-01'], 1);
  assert.deepEqual(codes(refused), ['invariant-not-green']);
  assert.match(refused.problems[0].message, /I-size/u);
  assert.ok(refused.problems[0].hint.includes(FIX), refused.problems[0].hint);

  mendCheck(fx, 'I-size');
  ok(fx, ['check', 'I-size']); // a red check is not stale: rerun it by name
  state = status(fx);
  assert.equal(state.invariants[0].state, 'green');
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 0 次');
  ok(fx, ['node', 'done', 'N-01']);
});

test('an invariant not yet run, or stale, is not green either', (t) => {
  const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS, invariant('I-size')]) });
  ok(fx, ['gate']);
  let state = status(fx);
  assert.deepEqual(state.invariants, [
    { id: 'I-size', state: 'unknown', reasons: ['not-run'], fix: FIX },
  ]);
  assert.match(state.line, / · 不变量 1 未绿$/u);
  ok(fx, ['check', 'C-1', 'C-12', 'C-2', 'C-3']);
  assert.deepEqual(codes(json(fx, ['node', 'done', 'N-01'], 1)), ['invariant-not-green'],
    'an invariant never run blocks too');
  ok(fx, ['check']);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [1] };\n');
  commitAll(fx.root, 'change code');
  state = status(fx);
  assert.equal(state.invariants[0].state, 'stale');
  assert.deepEqual(state.invariants[0].reasons, ['code-changed']);
});

test('with every node done, a red invariant makes the next item 检查, not 里程碑门', (t) => {
  const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS, invariant('I-size')]) });
  completeM1(fx);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');
  breakCheck(fx, 'I-size');
  ok(fx, ['check', 'I-size'], 1);
  assert.equal(status(fx).line,
    'M1 · 2/2 绿 · 下一项 检查 · 本里程碑计划变更 0 次 · 不变量 1 未绿');
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  const refused = json(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    '.ultra/records/milestones/M1-review.md'], 1);
  assert.deepEqual(codes(refused), ['invariant-not-green']);
});

test('the registry rules for invariants', (t) => {
  for (const bad of [
    check('I-x', [], { fix: '' }),
    check('I-x', [], { fix: 7 }),
    check('I-x', ['REQ-001'], { fix: FIX }),
    check('I-x', []),
  ]) {
    const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS, bad]) });
    const result = run(fx, ['status']);
    assert.equal(result.status, 2, JSON.stringify(bad));
    assert.match(result.stderr, /checks\.json/u, JSON.stringify(bad));
  }
});

test('an invariant belongs to no milestone: adding or removing one is not a plan change', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS, invariant('I-size')]));
  assert.equal(status(fx).gate, 'pass');
  assert.deepEqual(json(fx, ['gate']).recorded, []);
});

// ---------------------------------------------------------------------------------------
// Cleanup nodes

const CLEAN = { id: 'N-clean', milestone: 'M1', title: 'Clean up M1', kind: 'cleanup',
  covers: [], depends: ['N-02'] };

test('a cleanup node covers nothing and completes only while the finished work stays green', (t) => {
  const fx = project(t, {
    '.ultra/plan.json': planFile({ ...PLAN, nodes: [...PLAN.nodes.slice(0, 2), CLEAN, PLAN.nodes[2]] }),
  });
  completeM1(fx);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 N-clean · 本里程碑计划变更 0 次');

  const brief = ok(fx, ['context', 'N-clean']).stdout;
  assert.ok(brief.includes('## Requirements\n\nNone.\n'), brief);
  assert.ok(brief.includes('## Checks that must turn green (read-only)\n\nNone.\n'), brief);
  assert.ok(brief.includes('`ubp check --stale`'), brief);

  breakCheck(fx, 'C-1');
  ok(fx, ['check', 'C-1'], 1);
  const refused = json(fx, ['node', 'done', 'N-clean'], 1);
  assert.deepEqual(codes(refused), ['requirement-not-green']);
  assert.match(refused.problems[0].message, /REQ-001/u);

  mendCheck(fx, 'C-1');
  ok(fx, ['check', 'C-1']); // a red check is not stale: rerun it by name
  ok(fx, ['node', 'done', 'N-clean']);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');
});

test('a cleanup node also needs every invariant green and the closed milestones green', (t) => {
  const clean2 = { ...CLEAN, id: 'N-clean2', milestone: 'M2', depends: ['N-03'] };
  const fx = project(t, {
    '.ultra/checks.json': checksFile([...CHECKS, invariant('I-size')]),
    '.ultra/plan.json': planFile({ ...PLAN, nodes: [...PLAN.nodes, clean2] }),
  });
  completeM1(fx);
  closeM1(fx);
  ok(fx, ['node', 'done', 'N-03']);
  breakCheck(fx, 'C-2');
  breakCheck(fx, 'I-size');
  ok(fx, ['check', 'C-2', 'I-size'], 1);
  const refused = json(fx, ['node', 'done', 'N-clean2'], 1);
  assert.deepEqual(codes(refused), ['requirement-not-green', 'invariant-not-green']);
  assert.match(refused.problems[0].message, /REQ-002/u);
  const brief = ok(fx, ['context', 'N-clean2']).stdout;
  assert.ok(brief.includes('## Checks that must turn green (read-only)\n\n- I-size · red · `' +
    `${NODE} checks/pass.cjs I-size\` · fix: ${FIX}\n`), brief);
});

test('a cleanup node waits for every node before it in its milestone', (t) => {
  const early = { ...CLEAN, depends: [] };
  const fx = project(t, {
    '.ultra/plan.json': planFile({ ...PLAN, nodes: [...PLAN.nodes.slice(0, 2), early, PLAN.nodes[2]] }),
  });
  ok(fx, ['gate']);
  ok(fx, ['check']);
  const refused = json(fx, ['node', 'done', 'N-clean'], 1);
  assert.deepEqual(codes(refused), ['dependency-not-done', 'dependency-not-done']);
  assert.match(refused.problems[0].message, /N-01/u);
  assert.match(refused.problems[1].message, /N-02/u);
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
  ok(fx, ['node', 'done', 'N-clean']);
});

test('kind accepts only cleanup, and only a cleanup node may cover nothing', (t) => {
  for (const [nodes, exit] of [
    [[...PLAN.nodes, { ...CLEAN, kind: 'refactor' }], 2],
    [[...PLAN.nodes, { ...CLEAN, covers: ['REQ-001'] }], 2],
    [[...PLAN.nodes, { ...CLEAN, kind: undefined }], 0],
  ]) {
    const fx = project(t, { '.ultra/plan.json': planFile({ ...PLAN, nodes }) });
    const result = run(fx, ['status', '--json']);
    assert.equal(result.status, exit, result.stderr);
    if (exit === 0) assert.ok(JSON.parse(result.stdout).problems.some((p) => p.code === 'empty-node'));
  }
});

test('cleanup_every makes the plan gate require cleanup nodes at that cadence', (t) => {
  const clean = (id, milestone, depends) => ({ id, milestone, title: id, kind: 'cleanup',
    covers: [], depends });
  const cases = [
    [1, PLAN.nodes, ['cleanup-missing', 'cleanup-missing']],
    [1, [PLAN.nodes[0], clean('C1', 'M1', ['N-01']), PLAN.nodes[1], clean('C2', 'M1', ['N-02']),
      PLAN.nodes[2], clean('C3', 'M2', ['N-03'])], []],
    [2, [...PLAN.nodes.slice(0, 2), clean('C1', 'M1', ['N-02']), PLAN.nodes[2]],
      ['cleanup-missing']],
    [2, [...PLAN.nodes.slice(0, 2), clean('C1', 'M1', ['N-02']), PLAN.nodes[2],
      clean('C2', 'M2', ['N-03'])], []],
    [1, [...PLAN.nodes.slice(0, 2), clean('C1', 'M1', ['N-02']), PLAN.nodes[2],
      clean('C2', 'M2', ['N-03'])], ['cleanup-missing']],
  ];
  for (const [every, nodes, expected] of cases) {
    const fx = project(t, { '.ultra/plan.json': planFile({ ...PLAN, cleanup_every: every, nodes }) });
    const result = json(fx, ['gate'], expected.length ? 1 : 0);
    assert.deepEqual(codes(result), expected, `${every} ${nodes.map((n) => n.id)}`);
  }
  for (const bad of [0, 1.5, '2']) {
    const fx = project(t, { '.ultra/plan.json': planFile({ ...PLAN, cleanup_every: bad }) });
    assert.equal(run(fx, ['status']).status, 2, String(bad));
  }
});

// ---------------------------------------------------------------------------------------
// Retro

test('retro groups the failures since the last closure by their error line', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  breakCheck(fx, 'C-1');
  ok(fx, ['check', 'C-1'], 1);
  ok(fx, ['check', 'C-1'], 1);
  breakCheck(fx, 'C-2');
  ok(fx, ['check', 'C-2'], 1);
  const before = ledgerBytes(fx);

  const retro = json(fx, ['retro']);
  const evidence = fs.readFileSync(path.join(fx.root, '.ultra/ledger/evidence.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const failing = evidence.filter((e) => e.outcome === 'fail').map((e) => e.run);
  assert.deepEqual(retro, {
    since: null,
    classes: [{ class: 'AssertionError: C-# toggled off', count: 3, checks: ['C-1', 'C-2'],
      runs: failing }],
  });
  assert.equal(ok(fx, ['retro']).stdout,
    '3 × AssertionError: C-# toggled off · C-1, C-2\n重复两次及以上：1 类\n');
  assert.deepEqual(ledgerBytes(fx), before, 'retro only reads');
});

test('retro counts only clean runs after the latest closure', (t) => {
  const fx = project(t);
  completeM1(fx);
  closeM1(fx);
  const since = JSON.parse(fs.readFileSync(path.join(fx.root, '.ultra/ledger/milestones.jsonl'),
    'utf8').trim()).at;
  assert.deepEqual(json(fx, ['retro']), { since, classes: [] });
  assert.equal(ok(fx, ['retro']).stdout, '重复两次及以上：0 类\n');

  breakCheck(fx, 'C-3');
  ok(fx, ['check', 'C-3'], 1);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [2] };\n');
  ok(fx, ['check', 'C-3'], 1);
  const retro = json(fx, ['retro']);
  assert.equal(retro.since, since);
  assert.deepEqual(retro.classes.map((c) => [c.class, c.count]),
    [['AssertionError: C-# toggled off', 1]], 'the dirty run is not counted');
});

test('retro starts after the latest of several closures', (t) => {
  const fx = project(t);
  completeM1(fx);
  breakCheck(fx, 'C-3');
  ok(fx, ['check', 'C-3'], 1);
  closeM1(fx);
  mendCheck(fx, 'C-3');
  ok(fx, ['check', 'C-3']);
  ok(fx, ['node', 'done', 'N-03']);
  write(fx.root, '.ultra/records/milestones/M2-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  breakCheck(fx, 'C-1');
  ok(fx, ['check', 'C-1'], 1);
  mendCheck(fx, 'C-1');
  ok(fx, ['check', 'C-1']);
  ok(fx, ['milestone', 'close', 'M2', '--owner', '放行', '--review',
    '.ultra/records/milestones/M2-review.md']);
  assert.deepEqual(json(fx, ['retro']).classes, [], 'failures before the latest closure');
  breakCheck(fx, 'C-2');
  ok(fx, ['check', 'C-2'], 1);
  assert.deepEqual(json(fx, ['retro']).classes.map((c) => [c.class, c.checks]),
    [['AssertionError: C-# toggled off', ['C-2']]]);
});

test('retro counts unknown runs, and classes a silent failure by its reason', (t) => {
  const script = `const id = process.argv[2];
if (id === 'C-1') setTimeout(() => {}, 60000);
else process.exit(3);
`;
  const slow = CHECKS.map((c) => (c.id === 'C-1' ? { ...c, timeout_sec: 1 } : c));
  const fx = project(t, { 'checks/pass.cjs': script, '.ultra/checks.json': checksFile(slow) });
  ok(fx, ['gate']);
  ok(fx, ['check', 'C-1', 'C-2', 'C-3'], 1);
  const classes = json(fx, ['retro']).classes;
  assert.deepEqual(classes.map((c) => [c.class, c.count, c.checks]), [
    ['exit-#', 2, ['C-2', 'C-3']],
    ['timeout', 1, ['C-1']],
  ]);
});

test('retro orders classes by count, then by class, and folds whitespace', (t) => {
  const script = `const id = process.argv[2];
console.log(id === 'C-1' ? 'Error:   timeout   after 30 ms' : id === 'C-2' ? 'Error: timeout after 5 ms' : 'Error: boom');
process.exit(1);
`;
  const fx = project(t, { 'checks/pass.cjs': script });
  ok(fx, ['gate']);
  ok(fx, ['check', 'C-3'], 1);
  ok(fx, ['check', 'C-1', 'C-2'], 1);
  assert.deepEqual(json(fx, ['retro']).classes.map((c) => [c.class, c.count, c.checks]), [
    ['Error: timeout after # ms', 2, ['C-1', 'C-2']],
    ['Error: boom', 1, ['C-3']],
  ]);
});

// ---------------------------------------------------------------------------------------
// Merge gate

// Commits only the named files, so the main tree's uncommitted ledger stays out of the branch.
function branch(fx, name, commits) {
  const home = git(fx.root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  git(fx.root, ['checkout', '-q', '-b', name]);
  const shas = commits.map(([file, content, message]) => {
    write(fx.root, file, content);
    git(fx.root, ['add', '--', file]);
    git(fx.root, ['commit', '-q', '-m', message]);
    return git(fx.root, ['rev-parse', 'HEAD']);
  });
  git(fx.root, ['checkout', '-q', home]);
  return shas;
}

const head = (fx) => git(fx.root, ['rev-parse', 'HEAD']);
const worktrees = (fx) => git(fx.root, ['worktree', 'list', '--porcelain'])
  .split('\n').filter((line) => line.startsWith('worktree ')).length;
const mergeDir = (fx) => {
  const dir = path.join(fx.root, '.ultra', '.runtime', 'merge');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

test('merge fast-forwards to a merge commit when the merged tree keeps every check green', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  const [, tip] = branch(fx, 'feature', [['src/one.txt', '1\n', 'one'], ['src/two.txt', '2\n', 'two']]);
  const before = head(fx);
  const result = json(fx, ['merge', 'feature', '--expect-head', before]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal(head(fx), result.merged);
  assert.deepEqual(git(fx.root, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').slice(1),
    [before, tip]);
  assert.equal(git(fx.root, ['log', '-1', '--format=%s']), 'Merge feature (ubp merge gate)');
  assert.deepEqual(result.warnings, []);
  assert.equal(git(fx.root, ['status', '--porcelain', '--untracked-files=no']), '');
  assert.ok(fs.existsSync(path.join(fx.root, 'src/two.txt')), 'the work tree has the merge');
  assert.equal(worktrees(fx), 1, 'the temporary work tree is gone');
  assert.deepEqual(mergeDir(fx), []);
  assert.equal(status(fx).dirty, false);
});

test('merge in text mode prints the branch and the short merge commit', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const result = ok(fx, ['merge', 'feature', '--expect-head', head(fx)]);
  assert.equal(result.stdout, `merge feature: pass ${head(fx).slice(0, 7)}\n`);
});

test('merge refuses a moved head, a dirty tree and a failing plan gate, and changes nothing', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const first = head(fx);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [3] };\n');
  const second = commitAll(fx.root, 'move head');
  const merge = (expect) => codes(json(fx, ['merge', 'feature', '--expect-head', expect], 1));

  assert.deepEqual(merge(first), ['head-moved']);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [4] };\n');
  assert.deepEqual(merge(second), ['dirty-tree']);
  git(fx.root, ['checkout', '-q', '--', 'src/app.cjs']);
  ok(fx, ['check']);
  assert.deepEqual(merge(second), ['dirty-tree'], 'uncommitted ledger lines');
  const third = commitUltra(fx);
  write(fx.root, '.ultra/plan.json', planFile({ ...PLAN, nodes: PLAN.nodes.slice(0, 2) }));
  assert.deepEqual(merge(third), ['dirty-tree'], 'an uncommitted plan edit');
  const fourth = commitUltra(fx, 'plan edit, not gated');
  assert.deepEqual(merge(fourth), ['plan-gate']);
  assert.equal(head(fx), fourth);
  assert.equal(worktrees(fx), 1);
});

test('a conflicting merge is refused with the conflicting paths', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  commitUltra(fx);
  const [tip] = branch(fx, 'feature', [['src/app.cjs', 'module.exports = { left: 1 };\n', 'left']]);
  write(fx.root, 'src/app.cjs', 'module.exports = { right: 1 };\n');
  const before = commitAll(fx.root, 'right');
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['merge-conflict']);
  assert.match(result.problems[0].message, /src\/app\.cjs/u);
  assert.equal(head(fx), before);
  assert.equal(git(fx.root, ['rev-parse', 'feature']), tip);
  assert.equal(git(fx.root, ['status', '--porcelain', '--untracked-files=no']), '');
  assert.equal(worktrees(fx), 1);
  assert.deepEqual(mergeDir(fx), []);
});

test('a red check after the merge names the first bad commit of the branch', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  const [, bad] = branch(fx, 'feature', [
    ['src/one.txt', '1\n', 'one'],
    ['src/broken-C-2', 'x\n', 'break C-2'],
    ['src/three.txt', '3\n', 'three'],
    ['src/four.txt', '4\n', 'four'],
  ]);
  const before = head(fx);
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.match(result.problems[0].message, /^C-2 is not green: AssertionError: C-2 toggled off; /u);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${bad} break C-2`),
    result.problems[0].message);
  assert.equal(head(fx), before);
  assert.equal(worktrees(fx), 1);
  assert.deepEqual(mergeDir(fx), []);
});

test('checks of later milestones may be red after a merge, as at the milestone gate', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  branch(fx, 'feature', [['src/broken-C-3', 'x\n', 'C-3 not built yet']]);
  const result = json(fx, ['merge', 'feature', '--expect-head', head(fx)]);
  assert.equal(result.ok, true);
});

test('a red invariant after the merge blocks it', (t) => {
  const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS, invariant('I-size')]) });
  completeM1(fx);
  commitUltra(fx);
  branch(fx, 'feature', [['src/broken-I-size', 'x\n', 'too big']]);
  const result = json(fx, ['merge', 'feature', '--expect-head', head(fx)], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.match(result.problems[0].message, /I-size/u);
});

test('merge ignores an inherited GIT_DIR, as a Git hook exports it', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  const env = { ...process.env, GIT_DIR: path.join(fx.root, '.git') };
  const clean = () => git(fx.root, ['status', '--porcelain', '--untracked-files=no']);
  branch(fx, 'broken', [['src/broken-C-2', 'x\n', 'break C-2']]);
  const refused = run(fx, ['merge', 'broken', '--expect-head', before, '--json'], CLI, env);
  assert.equal(refused.status, 1, refused.stderr);
  assert.deepEqual(codes(JSON.parse(refused.stdout)), ['check-not-green']);
  assert.equal(head(fx), before);
  assert.equal(clean(), '');
  branch(fx, 'green', [['src/one.txt', '1\n', 'one']]);
  const merged = run(fx, ['merge', 'green', '--expect-head', before, '--json'], CLI, env);
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(head(fx), JSON.parse(merged.stdout).merged);
  assert.equal(clean(), '');
  assert.equal(worktrees(fx), 1);
});

test('after a closure, the closed and the current milestone\'s checks both decide', (t) => {
  const fx = project(t);
  completeM1(fx);
  closeM1(fx);
  branch(fx, 'old', [['src/broken-C-2', 'x\n', 'break C-2']]);
  assert.deepEqual(codes(json(fx, ['merge', 'old', '--expect-head', head(fx)], 1)),
    ['dirty-tree'], 'the closure is not committed yet');
  const before = commitUltra(fx);
  const closed = json(fx, ['merge', 'old', '--expect-head', before], 1);
  assert.deepEqual(codes(closed), ['check-not-green']);
  assert.match(closed.problems[0].message, /^C-2 /u);
  branch(fx, 'now', [['src/broken-C-3', 'x\n', 'break C-3']]);
  const current = json(fx, ['merge', 'now', '--expect-head', before], 1);
  assert.deepEqual(codes(current), ['check-not-green']);
  assert.match(current.problems[0].message, /^C-3 /u);
  assert.equal(head(fx), before);
});

test('a branch may not change the spec, the checks or the plan', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  const loose = CHECKS.map((c) => (c.id === 'C-2' ? { ...c, run: 'echo pass 1' } : c));
  branch(fx, 'sneaky', [
    ['.ultra/checks.json', checksFile(loose), 'loosen C-2'],
    ['src/broken-C-2', 'x\n', 'break C-2'],
  ]);
  const result = json(fx, ['merge', 'sneaky', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['truth-changed']);
  assert.match(result.problems[0].message, /\.ultra\/checks\.json/u);
  assert.equal(head(fx), before);
  assert.equal(worktrees(fx), 1);
});

test('a branch that carries its own ledger lines merges with the main line\'s', (t) => {
  const fx = project(t, { '.gitattributes': '.ultra/ledger/*.jsonl merge=union\n' });
  completeM1(fx);
  commitUltra(fx);
  git(fx.root, ['checkout', '-q', '-b', 'writer']);
  write(fx.root, 'src/one.txt', '1\n');
  git(fx.root, ['add', '--', 'src/one.txt']);
  git(fx.root, ['commit', '-q', '-m', 'one']);
  const theirs = json(fx, ['check']).runs.map((r) => r.run);
  commitUltra(fx, 'writer ledger');
  git(fx.root, ['checkout', '-q', 'main']);
  const ours = json(fx, ['check', '--all']).runs.map((r) => r.run);
  const before = commitUltra(fx, 'main ledger');
  const result = json(fx, ['merge', 'writer', '--expect-head', before]);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const evidence = fs.readFileSync(path.join(fx.root, '.ultra/ledger/evidence.jsonl'), 'utf8');
  for (const id of [...theirs, ...ours]) assert.ok(evidence.includes(id), id);
  assert.equal(status(fx).dirty, false);
});

test('a check already red at HEAD is not blamed on the branch', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one'], ['src/two.txt', '2\n', 'two']]);
  write(fx.root, 'src/broken-C-2', 'x\n');
  const before = commitAll(fx.root, 'break C-2 on the main line');
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.ok(result.problems[0].message.endsWith('; not green at HEAD before the merge'),
    result.problems[0].message);
});

test('bisect walks first parents, so a merged side branch is blamed as its merge', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  const commitFile = (file, message) => {
    write(fx.root, file, 'x\n');
    git(fx.root, ['add', '--', file]);
    git(fx.root, ['commit', '-q', '-m', message]);
  };
  git(fx.root, ['checkout', '-q', '-b', 'feature']);
  commitFile('src/one.txt', 'one');
  git(fx.root, ['checkout', '-q', '-b', 'side']);
  commitFile('src/broken-C-2', 'side breaks C-2');
  git(fx.root, ['checkout', '-q', 'feature']);
  git(fx.root, ['merge', '-q', '--no-ff', '-m', 'bring side', 'side']);
  const merge = head(fx);
  commitFile('src/three.txt', 'three');
  git(fx.root, ['checkout', '-q', 'main']);
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${merge} bring side`),
    result.problems[0].message);
});

test('merge clears leftovers and removes a temporary tree a check made read-only', (t) => {
  const ro = `const fs = require('node:fs');
if (process.cwd().includes('/.ultra/.runtime/merge/')) {
  fs.mkdirSync('.ultra/.runtime/ro', { recursive: true });
  fs.writeFileSync('.ultra/.runtime/ro/f', 'x');
  fs.chmodSync('.ultra/.runtime/ro', 0o555);
}
console.log('pass 1');
`;
  const fx = project(t, {
    'checks/ro.cjs': ro,
    '.ultra/checks.json': checksFile([...CHECKS,
      check('C-ro', ['REQ-001'], { run: `${NODE} checks/ro.cjs` })]),
  });
  completeM1(fx);
  const before = commitUltra(fx);
  fs.mkdirSync(path.join(fx.root, '.ultra/.runtime/merge/left-over/x'), { recursive: true });
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const result = json(fx, ['merge', 'feature', '--expect-head', before]);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(mergeDir(fx), []);
  assert.equal(worktrees(fx), 1);
});

test('an interrupt during the merge leaves everything as it was', async (t) => {
  const slow = `if (process.cwd().includes('/.ultra/.runtime/merge/')) setTimeout(() => {}, 60000);
else console.log('pass 1');
`;
  const fx = project(t, { 'checks/pass.cjs': slow });
  completeM1(fx);
  const before = commitUltra(fx);
  const [tip] = branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const child = spawn(process.execPath,
    [CLI, 'merge', 'feature', '--expect-head', before, '--root', fx.root], { stdio: 'ignore' });
  const ended = new Promise((resolve) => child.on('exit', (code, signal) => resolve(code ?? signal)));
  const deadline = Date.now() + 20000;
  while (mergeDir(fx).length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  child.kill('SIGTERM');
  assert.equal(await ended, 143);
  assert.equal(head(fx), before);
  assert.equal(git(fx.root, ['rev-parse', 'feature']), tip);
  assert.equal(worktrees(fx), 1);
  assert.deepEqual(mergeDir(fx), []);
});

test('a branch already in HEAD has nothing to merge', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  git(fx.root, ['branch', 'old']);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [5] };\n');
  const now = commitAll(fx.root, 'ahead');
  assert.deepEqual(codes(json(fx, ['merge', 'old', '--expect-head', now], 1)), ['nothing-to-merge']);
});

test('merge usage errors exit 2 and change nothing', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const now = head(fx);
  for (const args of [
    ['merge', 'feature'],
    ['merge', '--expect-head', now],
    ['merge', 'feature', 'other', '--expect-head', now],
    ['merge', 'feature', '--expect-head', now, '--expect-head', now],
    ['merge', 'no-such-branch', '--expect-head', now],
    ['merge', 'feature', '--expect-head', 'not-a-commit'],
    ['merge', 'feature', '--expect-head', 'HEAD'],
    ['merge', 'feature', '--expect-head', 'main'],
    ['merge', 'feature', '--expect-head', now.slice(0, 12)],
    ['merge', 'feature', '--expect-head', now, '--owner', 'x'],
    ['status', '--expect-head', now],
    ['retro', '--all'],
  ]) {
    const result = run(fx, args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}`);
    assert.ok(result.stderr.trim(), args.join(' '));
  }
  assert.equal(head(fx), now);
});

test('ubp reaches merge and retro and lists them in its help', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  assert.equal(ok(fx, ['retro'], 0, UBP).stdout, '重复两次及以上：0 类\n');
  const help = spawnSync(process.execPath, [UBP, '--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /merge <branch>/u);
  assert.match(help.stdout, /retro/u);
});

// ---------------------------------------------------------------------------------------
// Merge gate after review round 2 (.ultra/records/engine-reviews/P4-engine-round2.md): one
// merge at a time, Git bound to the temporary tree, dirty passes, ignored files, branch-side
// approvals and rulings, interrupts in Git commands, and the gaps the broken copies exposed.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label, ms = 60000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(25);
  }
}
const IN_MERGE = "process.cwd().includes('/.ultra/.runtime/merge/')";
const reflog = (fx) => git(fx.root, ['reflog', '--format=%H %gs']);
const nodeState = (fx, id) => status(fx).nodes.find((n) => n.id === id).state;

// C-1 takes six seconds inside the merge gate's temporary tree; everything else as PASS_SCRIPT.
const SLOW_C1 = `const fs = require('node:fs');
const id = process.argv[2];
const done = () => {
  if (fs.existsSync('.ultra/.runtime/fail-' + id) || fs.existsSync('src/broken-' + id)) {
    console.log('AssertionError: ' + id + ' toggled off');
    process.exit(1);
  }
  console.log('pass 1');
};
if (id === 'C-1' && ${IN_MERGE}) setTimeout(done, 6000);
else done();
`;

function startMerge(fx, name, expect, options = {}) {
  const child = spawn(process.execPath,
    [CLI, 'merge', name, '--expect-head', expect, '--json', '--root', fx.root],
    { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ended = new Promise((resolve) => child.on('close', (code, signal) =>
    resolve({ code: code ?? signal, stdout, stderr })));
  return { child, ended };
}

test('a second merge while one runs is refused merge-busy, and the first is unharmed',
  async (t) => {
    const fx = project(t, { 'checks/pass.cjs': SLOW_C1 });
    completeM1(fx);
    const before = commitUltra(fx);
    branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
    branch(fx, 'other', [['src/two.txt', '2\n', 'two']]);
    const first = startMerge(fx, 'feature', before);
    await until(() => mergeDir(fx).length > 0, 'the first merge\'s temporary tree');
    const mine = 'module.exports = { items: [9] };\n';
    write(fx.root, 'src/app.cjs', mine); // uncommitted work in the main tree
    write(fx.root, '.ultra/.runtime/keep', 'ignored\n');
    for (const name of ['other', 'feature']) {
      assert.deepEqual(codes(json(fx, ['merge', name, '--expect-head', before], 1)),
        ['merge-busy'], name);
    }
    assert.equal(mergeDir(fx).length, 1, 'the refused merges touched nothing under merge/');
    const done = await first.ended;
    assert.equal(done.code, 0, done.stderr);
    assert.equal(head(fx), JSON.parse(done.stdout).merged);
    assert.equal(fs.readFileSync(path.join(fx.root, 'src/app.cjs'), 'utf8'), mine);
    assert.ok(fs.existsSync(path.join(fx.root, '.ultra/.runtime/keep')));
    assert.doesNotMatch(reflog(fx), /reset: /u);
    assert.equal(worktrees(fx), 1);
  });

test('a live merge lock refuses at once and protects its tree; a dead one is broken', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const lock = path.join(fx.root, '.ultra/.runtime/merge.lock');
  const live = path.join(fx.root, '.ultra/.runtime/merge/live/x');
  fs.mkdirSync(live, { recursive: true });
  fs.writeFileSync(lock, String(process.pid));
  const started = Date.now();
  assert.deepEqual(codes(json(fx, ['merge', 'feature', '--expect-head', before], 1)),
    ['merge-busy']);
  assert.ok(Date.now() - started < 10000, 'refused at once, not after a wait');
  assert.ok(fs.existsSync(live), 'a running merge\'s tree is not a leftover');
  assert.equal(fs.readFileSync(lock, 'utf8'), String(process.pid));
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  fs.writeFileSync(lock, String(dead));
  const result = json(fx, ['merge', 'feature', '--expect-head', before]);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(mergeDir(fx), []);
  assert.ok(!fs.existsSync(lock), 'the merge removes its own lock');
  assert.equal(worktrees(fx), 1);
});

test('Git in the temporary tree never reaches the main repository', (t) => {
  const lose = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('src/broken-' + id)) {
  if (${IN_MERGE}) fs.rmSync('.git', { force: true });
  console.log('AssertionError: ' + id + ' toggled off');
  process.exit(1);
}
console.log('pass 1');
`;
  const fx = project(t, { 'checks/pass.cjs': lose });
  completeM1(fx);
  const before = commitUltra(fx);
  const [, , tip] = branch(fx, 'feature', [
    ['src/one.txt', '1\n', 'one'],
    ['src/broken-C-2', 'x\n', 'break C-2'],
    ['src/three.txt', '3\n', 'three'],
  ]);
  write(fx.root, '.ultra/.runtime/keep', 'ignored\n');
  const log = reflog(fx);
  const result = run(fx, ['merge', 'feature', '--expect-head', before, '--json']);
  assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
  assert.equal(head(fx), before);
  assert.equal(git(fx.root, ['rev-parse', 'feature']), tip);
  assert.equal(reflog(fx), log, 'no reset or checkout ran in the main repository');
  assert.ok(fs.existsSync(path.join(fx.root, '.ultra/.runtime/keep')), 'ignored files survive');
  assert.equal(git(fx.root, ['status', '--porcelain']), '');
  assert.equal(worktrees(fx), 1);
  assert.deepEqual(mergeDir(fx), []);
});

test('an ignored file under .ultra does not block a merge; an uncommitted record is named',
  (t) => {
    const fx = project(t, { '.gitignore': '.ultra/.runtime/\n.DS_Store\n' });
    completeM1(fx);
    const before = commitUltra(fx);
    write(fx.root, '.ultra/.DS_Store', 'finder\n');
    write(fx.root, '.ultra/records/.DS_Store', 'finder\n');
    assert.equal(status(fx).dirty, false);
    branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
    write(fx.root, '.ultra/records/notes.md', 'draft\n');
    const refused = json(fx, ['merge', 'feature', '--expect-head', before], 1);
    assert.deepEqual(codes(refused), ['dirty-tree']);
    assert.match(refused.problems[0].message, /\.ultra\/records\/notes\.md/u);
    assert.doesNotMatch(refused.problems[0].message, /DS_Store/u);
    fs.rmSync(path.join(fx.root, '.ultra/records/notes.md'));
    const result = json(fx, ['merge', 'feature', '--expect-head', before]);
    assert.equal(result.ok, true, JSON.stringify(result.problems));
  });

test('a check that passes but leaves the merged tree dirty blocks, and bisect finds why', (t) => {
  const dirty = `const fs = require('node:fs');
if (fs.existsSync('src/dirty-trigger')) fs.appendFileSync('src/app.cjs', '// touched\\n');
console.log('pass 1');
`;
  const fx = project(t, {
    'checks/dirty.cjs': dirty,
    '.ultra/checks.json': checksFile([...CHECKS,
      check('C-dirty', ['REQ-001'], { run: `${NODE} checks/dirty.cjs` })]),
  });
  completeM1(fx);
  const before = commitUltra(fx);
  const [, trigger] = branch(fx, 'feature', [
    ['src/one.txt', '1\n', 'one'],
    ['src/dirty-trigger', 'x\n', 'dirty trigger'],
    ['src/three.txt', '3\n', 'three'],
  ]);
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.match(result.problems[0].message, /^C-dirty is not green: dirty-run; /u);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${trigger} dirty trigger`),
    result.problems[0].message);
  assert.equal(head(fx), before);
});

test('a branch may not change the spec, close a milestone or approve', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  branch(fx, 'sneaky', [
    ['.ultra/ledger/approvals.jsonl', '{"item":"M1/REQ-001"}\n', 'approve'],
    ['.ultra/spec.md', `${SPEC}\n## REQ-004 Print the list\nThe user prints the list.\n`, 'spec'],
    ['.ultra/ledger/milestones.jsonl', '{"milestone":"M1"}\n', 'close'],
  ]);
  const result = json(fx, ['merge', 'sneaky', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['truth-changed', 'truth-changed', 'truth-changed']);
  assert.deepEqual(result.problems.map((p) => p.message.match(/\.ultra\/\S+/u)[0]),
    ['.ultra/spec.md', '.ultra/ledger/milestones.jsonl', '.ultra/ledger/approvals.jsonl']);
  assert.equal(head(fx), before);
  assert.equal(worktrees(fx), 1);
});

test('a branch whose rulings break the plan gate is refused; a valid ruling merges', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  branch(fx, 'bad', [['src/one.txt', '1\n', 'one'],
    ['.ultra/rulings.md', '# Rulings\n\n- 2026-11-01 L2 裁决：use a map\n', 'bad ruling']]);
  const refused = json(fx, ['merge', 'bad', '--expect-head', before], 1);
  assert.deepEqual(codes(refused), ['merged-gate']);
  assert.match(refused.problems[0].message, /malformed-ruling/u);
  assert.equal(head(fx), before);
  assert.equal(worktrees(fx), 1);
  branch(fx, 'good', [['src/two.txt', '2\n', 'two'], ['.ultra/rulings.md',
    '# Rulings\n\n- 2026-11-01 L2 裁决：use a map — 因为 lookups — 如果判断错了，代价是 a rewrite\n',
    'good ruling']]);
  const merged = json(fx, ['merge', 'good', '--expect-head', before]);
  assert.equal(merged.ok, true, JSON.stringify(merged.problems));
});

test('status agrees with node done: a cleanup node waits for the nodes before it', (t) => {
  const nodes = [
    { ...PLAN.nodes[0], depends: ['N-02'] },
    { ...CLEAN, depends: [] },
    { ...PLAN.nodes[1], depends: [] },
    PLAN.nodes[2],
  ];
  const fx = project(t, { '.ultra/plan.json': planFile({ ...PLAN, nodes }) });
  ok(fx, ['gate']);
  ok(fx, ['check']);
  assert.equal(nodeState(fx, 'N-clean'), 'blocked');
  assert.match(status(fx).line, / · 下一项 N-02 · /u);
  ok(fx, ['node', 'done', 'N-02']);
  assert.equal(nodeState(fx, 'N-clean'), 'blocked');
  assert.match(status(fx).line, / · 下一项 N-01 · /u);
  ok(fx, ['node', 'done', 'N-01']);
  assert.equal(nodeState(fx, 'N-clean'), 'ready');
  assert.match(status(fx).line, / · 下一项 N-clean · /u);
});

test('a cleanup node in the middle of a milestone ignores requirements not built yet', (t) => {
  const middle = { ...CLEAN, depends: ['N-01'] };
  const fx = project(t, {
    '.ultra/plan.json': planFile({ ...PLAN, nodes: [PLAN.nodes[0], middle, ...PLAN.nodes.slice(1)] }),
  });
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  breakCheck(fx, 'C-2');
  ok(fx, ['check', 'C-2'], 1);
  ok(fx, ['node', 'done', 'N-clean']);
});

test('a ledger conflict hints at merge=union', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  git(fx.root, ['checkout', '-q', '-b', 'writer']);
  write(fx.root, 'src/one.txt', '1\n');
  git(fx.root, ['add', '--', 'src/one.txt']);
  git(fx.root, ['commit', '-q', '-m', 'one']);
  ok(fx, ['check']);
  commitUltra(fx, 'writer ledger');
  git(fx.root, ['checkout', '-q', 'main']);
  ok(fx, ['check', '--all']);
  const before = commitUltra(fx, 'main ledger');
  const result = json(fx, ['merge', 'writer', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['merge-conflict']);
  assert.match(result.problems[0].message, /\.ultra\/ledger\/evidence\.jsonl/u);
  assert.match(result.problems[0].hint, /\.ultra\/ledger\/\*\.jsonl merge=union/u);
  assert.equal(head(fx), before);
});

test('merge drops only its own work tree registrations', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p4-wt-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  git(fx.root, ['worktree', 'add', '-q', '--detach', elsewhere, before]);
  fs.rmSync(elsewhere, { recursive: true, force: true }); // now prunable, as on an unmounted disk
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  assert.equal(json(fx, ['merge', 'feature', '--expect-head', before]).ok, true);
  assert.equal(worktrees(fx), 2, 'the other, missing work tree is still registered');
});

test('a check that times out after the merge blocks it', (t) => {
  const slow = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('src/slow-' + id)) setTimeout(() => console.log('pass 1'), 30000);
else console.log('pass 1');
`;
  const fx = project(t, {
    'checks/pass.cjs': slow,
    '.ultra/checks.json': checksFile(CHECKS.map((c) => (c.id === 'C-2'
      ? { ...c, timeout_sec: 1 } : c))),
  });
  completeM1(fx);
  const before = commitUltra(fx);
  const [, bad] = branch(fx, 'feature', [['src/one.txt', '1\n', 'one'],
    ['src/slow-C-2', 'x\n', 'slow C-2']]);
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.match(result.problems[0].message, /^C-2 is not green: /u);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${bad} slow C-2`),
    result.problems[0].message);
});

test('checks in the temporary tree see no inherited Git variables', (t) => {
  const env = `const bad = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'].filter((n) => process.env[n]);
if (bad.length) { console.log('AssertionError: inherited ' + bad.join(' ')); process.exit(1); }
console.log('pass 1');
`;
  const fx = project(t, {
    'checks/env.cjs': env,
    '.ultra/checks.json': checksFile([...CHECKS,
      check('C-env', ['REQ-001'], { run: `${NODE} checks/env.cjs` })]),
  });
  completeM1(fx);
  const before = commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const vars = { ...process.env, GIT_DIR: path.join(fx.root, '.git'), GIT_WORK_TREE: fx.root,
    GIT_INDEX_FILE: path.join(fx.root, '.git', 'index') };
  const result = run(fx, ['merge', 'feature', '--expect-head', before, '--json'], CLI, vars);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('bisect follows first parents even when a side commit sorts between them by date', (t) => {
  const fx = project(t);
  completeM1(fx);
  const before = commitUltra(fx);
  let clock = Math.floor(Date.now() / 1000) + 60;
  const dated = (args) => {
    clock += 10;
    const date = `@${clock} +0000`;
    const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
      ...args], { cwd: fx.root, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    assert.equal(result.status, 0, result.stderr);
  };
  const commitFile = (file, message) => {
    write(fx.root, file, 'x\n');
    git(fx.root, ['add', '--', file]);
    dated(['commit', '-q', '-m', message]);
  };
  git(fx.root, ['checkout', '-q', '-b', 'feature']);
  commitFile('src/one.txt', 'one');
  git(fx.root, ['checkout', '-q', '-b', 'side']);
  commitFile('src/broken-C-2', 'side breaks C-2');
  git(fx.root, ['checkout', '-q', 'feature']);
  dated(['merge', '-q', '--no-ff', '-m', 'bring side', 'side']);
  const merge = head(fx);
  commitFile('src/three.txt', 'three');
  git(fx.root, ['checkout', '-q', 'main']);
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${merge} bring side`),
    result.problems[0].message);
});

test('a bisect step whose merge conflicts counts as not passing', (t) => {
  const fx = project(t);
  completeM1(fx);
  commitUltra(fx);
  const mainline = 'module.exports = { right: 1 };\n';
  git(fx.root, ['checkout', '-q', '-b', 'feature']);
  write(fx.root, 'src/app.cjs', 'module.exports = { left: 1 };\n');
  write(fx.root, 'src/broken-C-2', 'x\n');
  git(fx.root, ['add', '--', 'src/app.cjs', 'src/broken-C-2']);
  git(fx.root, ['commit', '-q', '-m', 'left edit breaks C-2']);
  const bad = head(fx);
  write(fx.root, 'src/app.cjs', mainline);
  git(fx.root, ['add', '--', 'src/app.cjs']);
  git(fx.root, ['commit', '-q', '-m', 'take the main line app']);
  write(fx.root, 'src/three.txt', '3\n');
  git(fx.root, ['add', '--', 'src/three.txt']);
  git(fx.root, ['commit', '-q', '-m', 'three']);
  git(fx.root, ['checkout', '-q', 'main']);
  write(fx.root, 'src/app.cjs', mainline);
  const before = commitAll(fx.root, 'main line edit');
  const result = json(fx, ['merge', 'feature', '--expect-head', before], 1);
  assert.deepEqual(codes(result), ['check-not-green']);
  assert.ok(result.problems[0].message.endsWith(`first bad commit ${bad} left edit breaks C-2`),
    result.problems[0].message);
});

test('a main tree edit during the checks fails the fast-forward and is kept', async (t) => {
  const fx = project(t, { 'checks/pass.cjs': SLOW_C1 });
  completeM1(fx);
  const before = commitUltra(fx);
  branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
  const merge = startMerge(fx, 'feature', before);
  await until(() => mergeDir(fx).length > 0, 'the temporary tree');
  write(fx.root, 'src/one.txt', 'mine\n'); // untracked here; the merge would overwrite it
  const done = await merge.ended;
  assert.equal(done.code, 1, done.stderr);
  assert.deepEqual(codes(JSON.parse(done.stdout)), ['fast-forward-failed']);
  assert.equal(head(fx), before);
  assert.equal(fs.readFileSync(path.join(fx.root, 'src/one.txt'), 'utf8'), 'mine\n');
  assert.equal(worktrees(fx), 1);
});

test('an interrupt during a Git command of the merge exits 130 and changes nothing',
  async (t) => {
    const fx = project(t);
    completeM1(fx);
    const before = commitUltra(fx);
    const [tip] = branch(fx, 'feature', [['src/one.txt', '1\n', 'one']]);
    const started = path.join(fx.root, '.ultra/.runtime/hook-started');
    const hooks = path.join(fx.root, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, 'post-merge'), '#!/bin/sh\ncase "$PWD" in\n' +
      `  */.ultra/.runtime/merge/*) : > '${started}'; sleep 15 ;;\nesac\nexit 0\n`,
    { mode: 0o755 });
    const merge = startMerge(fx, 'feature', before);
    await until(() => fs.existsSync(started), 'the slow post-merge hook');
    merge.child.kill('SIGINT');
    const done = await merge.ended;
    assert.equal(done.code, 130, done.stderr);
    assert.equal(head(fx), before);
    assert.equal(git(fx.root, ['rev-parse', 'feature']), tip);
    assert.equal(worktrees(fx), 1);
    assert.deepEqual(mergeDir(fx), []);
  });

test('Ctrl-C to the whole process group never exits 2 and never half-merges', async (t) => {
  for (const delay of [0, 200, 500, 900, 1400]) {
    const fx = project(t);
    completeM1(fx);
    const before = commitUltra(fx);
    branch(fx, 'feature', [['src/one.txt', '1\n', 'one'], ['src/two.txt', '2\n', 'two']]);
    const merge = startMerge(fx, 'feature', before, { detached: true });
    await until(() => mergeDir(fx).length > 0, 'the temporary tree');
    await wait(delay);
    try { process.kill(-merge.child.pid, 'SIGINT'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    const done = await merge.ended;
    const label = `delay ${delay}: ${done.code} ${done.stderr}`;
    if (done.code === 0) assert.equal(head(fx), JSON.parse(done.stdout).merged, label);
    else {
      assert.equal(done.code, 130, label);
      assert.equal(head(fx), before, label);
    }
    assert.equal(git(fx.root, ['status', '--porcelain', '--untracked-files=no']), '', label);
    assert.equal(worktrees(fx), 1, label);
    assert.deepEqual(mergeDir(fx), [], label);
  }
});
