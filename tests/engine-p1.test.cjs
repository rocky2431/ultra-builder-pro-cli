'use strict';

// P1 acceptance for the v6 engine (RESULT.md §5 P1, contract in engine/FORMATS.md).
// Black-box: every observation goes through the CLI against a throwaway Git fixture.

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
const EXPECT = 'pass [1-9]';
const MISSING = 'ubp-no-such-command-for-tests';
const RULING = '- 2026-10-31 L1 裁决：拆分 REQ-002 — 因为 两种删除路径验收不同 — 如果判断错了，代价是 多维护一条检查\n';

const SPEC = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.

## REQ-003 Share the list
The user shares a read-only link to the list.
`;

// Check commands used by the fixtures. Paths given as arguments are relative to the
// project root and live under the ignored `.ultra/.runtime/`, so they never dirty the tree.
const SCRIPTS = {
  'checks/pass.cjs': `const fs = require('node:fs');
if (process.env.RAN_LOG) fs.appendFileSync(process.env.RAN_LOG, process.argv[2] + '\\n');
console.log('pass 1');
`,
  'checks/fail.cjs': `console.log('ok 1 setup');
console.log('AssertionError: expected 1 to equal 2');
console.log("    code: 'ERR_ASSERTION',");
process.exit(1);
`,
  'checks/empty.cjs': "console.log('pass 0');\n",
  'checks/hang.cjs': 'setTimeout(() => {}, 30000);\n',
  'checks/pid-hang.cjs': `const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.dirname(process.argv[2]), { recursive: true });
fs.writeFileSync(process.argv[2], String(process.pid));
setTimeout(() => {}, 30000);
`,
  'checks/background.cjs': `const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
fs.mkdirSync(path.dirname(process.argv[2]), { recursive: true });
fs.writeFileSync(process.argv[2], String(child.pid));
child.unref();
console.log('pass 1');
`,
  'checks/escape.cjs': `const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
  detached: true, stdio: ['ignore', 'inherit', 'inherit'],
});
fs.mkdirSync(path.dirname(process.argv[2]), { recursive: true });
fs.writeFileSync(process.argv[2], String(child.pid));
child.unref();
console.log('pass 1');
if (process.argv[3] === 'hang') setTimeout(() => {}, 30000);
`,
  'checks/toggle.cjs': `const fs = require('node:fs');
if (fs.existsSync('.ultra/.runtime/fail')) {
  if (process.argv[2] === 'report') fs.writeFileSync('failure-report.txt', 'details\\n');
  console.log('AssertionError: toggled off');
  process.exit(1);
}
console.log('pass 1');
`,
  'checks/backtrack.cjs': "console.log('a'.repeat(40) + '!');\n",
  'checks/flood.cjs': `const chunk = ('x'.repeat(1023) + '\\n').repeat(1024);
let left = Number(process.argv[2]);
function write() {
  while (left > 0) {
    left -= 1;
    if (!process.stdout.write(chunk)) {
      process.stdout.once('drain', write);
      return;
    }
  }
  process.stdout.write('pass 1\\n');
}
write();
`,
  'checks/commit.cjs': `const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = (...args) => execFileSync('git', ['-c', 'user.name=UBP Test',
  '-c', 'user.email=ubp@example.invalid', '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=/dev/null', ...args]);
fs.writeFileSync('src/during.txt', 'written by a check\\n');
git('add', 'src/during.txt');
git('commit', '-q', '-m', 'commit during a check');
console.log('pass 1');
`,
};

function checksFile(checks) {
  return `${JSON.stringify({ version: 1, checks }, null, 2)}\n`;
}

function cmd(id, covers, run, extra = {}) {
  return { id, covers, run, expect: EXPECT, ...extra };
}

function passCheck(id, covers, extra = {}) {
  return cmd(id, covers, `${NODE} checks/pass.cjs ${id}`, extra);
}

const CHECKS = [
  passCheck('C-1', ['REQ-001']),
  passCheck('C-12', ['REQ-001', 'REQ-002']),
  passCheck('C-2', ['REQ-002']),
  passCheck('C-3', ['REQ-003']),
];

// The fixture registry with C-1 replaced.
function withC1(check) {
  return checksFile([check, ...CHECKS.slice(1)]);
}

const PLAN = {
  version: 1,
  milestones: [
    { id: 'M1', title: 'Core list', requirements: ['REQ-001', 'REQ-002'] },
    { id: 'M2', title: 'Sharing', requirements: ['REQ-003'] },
  ],
  nodes: [
    { id: 'N-01', milestone: 'M1', title: 'Add', covers: ['REQ-001'], depends: [] },
    { id: 'N-02', milestone: 'M1', title: 'Remove', covers: ['REQ-002'], depends: ['N-01'] },
    { id: 'N-03', milestone: 'M2', title: 'Share', covers: ['REQ-003'], depends: ['N-02'] },
  ],
};

function git(root, args) {
  const result = spawnSync('git', [
    '-c', 'user.name=UBP Test', '-c', 'user.email=ubp@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

// Builds a committed fixture project. `files` overrides or adds relative paths.
function project(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  const base = {
    '.gitignore': '.ultra/.runtime/\n',
    'src/app.cjs': 'module.exports = { items: [] };\n',
    ...SCRIPTS,
    '.ultra/spec.md': SPEC,
    '.ultra/checks.json': checksFile(CHECKS),
    '.ultra/plan.json': `${JSON.stringify(PLAN, null, 2)}\n`,
  };
  for (const [relative, content] of Object.entries({ ...base, ...files })) {
    write(root, relative, content);
  }
  commitAll(root, 'fixture');
  const ranLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-ran-')), 'ran.log');
  t.after(() => fs.rmSync(path.dirname(ranLog), { recursive: true, force: true }));
  return { root, ranLog };
}

function run(fx, args, entry = CLI, nodeArgs = [], env = {}) {
  return spawnSync(process.execPath, [...nodeArgs, entry, ...args, '--root', fx.root], {
    encoding: 'utf8',
    env: { ...process.env, RAN_LOG: fx.ranLog, ...env },
    timeout: 60000,
    // An engine stuck in synchronous code cannot handle SIGTERM.
    killSignal: 'SIGKILL',
  });
}

// Starts the CLI without waiting; `done` resolves with its exit and output.
function start(fx, args) {
  const child = spawn(process.execPath, [CLI, ...args, '--root', fx.root], {
    env: { ...process.env, RAN_LOG: fx.ranLog },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output.stdout += chunk; });
  child.stderr.on('data', (chunk) => { output.stderr += chunk; });
  const done = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal, ...output }));
  });
  return { child, done };
}

function ok(fx, args, expectedExit = 0) {
  const result = run(fx, args);
  assert.equal(result.status, expectedExit, `${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function json(fx, args, expectedExit = 0) {
  return JSON.parse(ok(fx, [...args, '--json'], expectedExit).stdout);
}

function status(fx) {
  return json(fx, ['status']);
}

function ran(fx) {
  if (!fs.existsSync(fx.ranLog)) return [];
  return fs.readFileSync(fx.ranLog, 'utf8').split('\n').filter(Boolean);
}

function clearRan(fx) {
  fs.rmSync(fx.ranLog, { force: true });
}

function byId(items) {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function ledgerFile(fx, name) {
  return path.join(fx.root, '.ultra', 'ledger', name);
}

function ledger(fx, name) {
  const file = ledgerFile(fx, name);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function editSpec(fx, from, to) {
  const file = path.join(fx.root, '.ultra', 'spec.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `spec contains ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
}

function setChecks(fx, checks) {
  write(fx.root, '.ultra/checks.json', checksFile(checks));
}

function setPlan(fx, plan) {
  write(fx.root, '.ultra/plan.json', `${JSON.stringify(plan, null, 2)}\n`);
}

// The milestone-gate writer arrives in P2; until then tests append the closure record.
function closeMilestone(fx, id) {
  const record = { v: 1, milestone: id, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(ledgerFile(fx, 'milestones.jsonl')), { recursive: true });
  fs.appendFileSync(ledgerFile(fx, 'milestones.jsonl'), `${JSON.stringify(record)}\n`);
}

// Gate, run every check, and complete N-01 and N-02: M1 fully green and done.
function completeM1(fx) {
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
  clearRan(fx);
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function until(predicate, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'condition not reached in time');
    await pause(50);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readPid(fx, name) {
  const file = path.join(fx.root, '.ultra', '.runtime', name);
  if (!fs.existsSync(file)) return 0;
  return Number(fs.readFileSync(file, 'utf8')) || 0;
}

// Never signal pid 0 or below: that would reach this test's own process group.
function killLater(t, pid) {
  t.after(() => {
    if (!(pid > 0)) return;
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  });
}

test('a fresh project has nothing green: never-run checks are unknown', (t) => {
  const fx = project(t);
  const state = status(fx);
  assert.equal(state.milestone, 'M1');
  assert.deepEqual(state.counts, { total: 2, green: 0, red: 0, stale: 0, unknown: 2, uncovered: 0 });
  for (const check of state.checks) {
    assert.equal(check.state, 'unknown', check.id);
    assert.deepEqual(check.reasons, ['not-run'], check.id);
    assert.equal(check.last_run, null, check.id);
  }
  assert.equal(state.next, 'N-01');
  assert.equal(state.gate, 'stale');
  assert.equal(state.closed_not_green, 0);
  assert.deepEqual(state.warnings, []);
  assert.equal(state.dirty, false);
  assert.equal(state.line, 'M1 · 0/2 绿 · 2 未知 · 下一项 N-01 · 本里程碑计划变更 0 次 · 计划门待重跑');
  const text = ok(fx, ['status']);
  assert.equal(text.stdout, `${state.line}\n`);
});

test('the gate records one baseline per milestone and nothing when the plan is unchanged', (t) => {
  const fx = project(t);
  const first = json(fx, ['gate']);
  assert.equal(first.ok, true);
  assert.deepEqual(first.problems, []);
  assert.deepEqual(first.recorded, [
    { milestone: 'M1', type: 'baseline' },
    { milestone: 'M2', type: 'baseline' },
  ]);
  const second = json(fx, ['gate']);
  assert.deepEqual(second.recorded, []);
  const log = ledger(fx, 'plan-log.jsonl');
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].nodes, ['N-01', 'N-02']);
  assert.deepEqual(Object.keys(log[0].requirements).sort(), ['REQ-001', 'REQ-002']);
  assert.deepEqual(Object.keys(log[0].checks).sort(), ['C-1', 'C-12', 'C-2']);
  assert.deepEqual(log[0].checks['C-12'].covers, ['REQ-001', 'REQ-002']);
  assert.match(log[0].checks['C-12'].fp, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(log[1].checks), ['C-3']);
  const state = status(fx);
  assert.equal(state.gate, 'pass');
  assert.equal(state.plan_changes, 0);
});

test('check runs every unrun check once, records evidence, and turns requirements green', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  const result = json(fx, ['check']);
  assert.equal(result.dirty, false);
  assert.deepEqual(result.runs.map((item) => [item.check, item.outcome, item.reason, item.dirty]), [
    ['C-1', 'pass', 'exit-0', false],
    ['C-12', 'pass', 'exit-0', false],
    ['C-2', 'pass', 'exit-0', false],
    ['C-3', 'pass', 'exit-0', false],
  ]);
  assert.deepEqual(ran(fx), ['C-1', 'C-12', 'C-2', 'C-3']);
  const evidence = ledger(fx, 'evidence.jsonl');
  assert.equal(evidence.length, 4);
  for (const record of evidence) {
    assert.equal(record.v, 1);
    assert.equal(record.dirty, false);
    assert.match(record.code, /^[0-9a-f]{64}$/);
    assert.match(record.check_fp, /^[0-9a-f]{64}$/);
    assert.ok(fs.existsSync(path.join(fx.root, record.log)), record.log);
  }
  const c12 = evidence.find((record) => record.check === 'C-12');
  assert.deepEqual(Object.keys(c12.reqs).sort(), ['REQ-001', 'REQ-002']);
  const state = status(fx);
  assert.deepEqual(state.counts, { total: 2, green: 2, red: 0, stale: 0, unknown: 0, uncovered: 0 });
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 0 次');
  assert.equal(byId(state.checks)['C-3'].last_run, evidence[3].run);
});

test('editing one requirement makes only its linked checks and nodes stale (P1 exit)', (t) => {
  const fx = project(t);
  completeM1(fx);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');

  editSpec(fx, 'sees it in the list', 'sees it at the top of the list');
  commitAll(fx.root, 'narrow wording of REQ-001');
  const state = status(fx);
  const reqs = byId(state.requirements);
  const checks = byId(state.checks);
  const nodes = byId(state.nodes);
  assert.equal(reqs['REQ-001'].state, 'stale');
  assert.deepEqual(reqs['REQ-001'].reasons, ['req-changed:REQ-001']);
  assert.equal(reqs['REQ-002'].state, 'green');
  assert.equal(reqs['REQ-003'].state, 'green');
  assert.equal(checks['C-1'].state, 'stale');
  assert.deepEqual(checks['C-1'].reasons, ['req-changed:REQ-001']);
  assert.equal(checks['C-12'].state, 'stale');
  assert.deepEqual(checks['C-12'].reasons, ['req-changed:REQ-001']);
  assert.equal(checks['C-2'].state, 'green');
  assert.equal(checks['C-3'].state, 'green');
  // C-12 also covers REQ-002, but its evidence still holds for REQ-002.
  assert.deepEqual(byId(reqs['REQ-002'].checks)['C-12'], { id: 'C-12', state: 'green', reasons: [] });
  assert.equal(nodes['N-01'].state, 'stale');
  assert.deepEqual(nodes['N-01'].reasons, ['req-changed:REQ-001']);
  assert.equal(nodes['N-02'].state, 'done');
  assert.equal(nodes['N-03'].state, 'ready');
  assert.equal(state.line, 'M1 · 1/2 绿 · 1 过期 · 下一项 N-01 · 本里程碑计划变更 0 次 · 计划门待重跑');

  const gate = json(fx, ['gate']);
  assert.deepEqual(gate.recorded, [{ milestone: 'M1', type: 'change' }]);
  const change = ledger(fx, 'plan-log.jsonl').at(-1);
  assert.deepEqual(change.diff, {
    added: [], removed: [], modified: ['REQ-001'], nodes_added: [], nodes_removed: [],
    checks_added: [], checks_removed: [], checks_modified: [],
  });
  assert.equal(status(fx).line, 'M1 · 1/2 绿 · 1 过期 · 下一项 N-01 · 本里程碑计划变更 1 次');

  const rerun = json(fx, ['check']);
  assert.deepEqual(rerun.runs.map((item) => item.check), ['C-1', 'C-12']);
  assert.deepEqual(ran(fx), ['C-1', 'C-12']);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 1 次');
  ok(fx, ['node', 'done', 'N-01']);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 1 次');
});

test('a committed code change makes every check stale and the default check reruns all', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: [], version: 2 };\n');
  commitAll(fx.root, 'code change');
  const state = status(fx);
  for (const check of state.checks) {
    assert.equal(check.state, 'stale', check.id);
    assert.deepEqual(check.reasons, ['code-changed'], check.id);
  }
  assert.equal(state.line, 'M1 · 0/2 绿 · 2 过期 · 下一项 检查 · 本里程碑计划变更 0 次');
  ok(fx, ['check']);
  assert.deepEqual(ran(fx), ['C-1', 'C-12', 'C-2', 'C-3']);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');
});

test('changing one check definition makes only that check stale', (t) => {
  const fx = project(t);
  completeM1(fx);
  setChecks(fx, CHECKS.map((check) => (check.id === 'C-2' ? { ...check, timeout_sec: 30 } : check)));
  const checks = byId(status(fx).checks);
  assert.equal(checks['C-2'].state, 'stale');
  assert.deepEqual(checks['C-2'].reasons, ['check-changed']);
  for (const id of ['C-1', 'C-12', 'C-3']) assert.equal(checks[id].state, 'green', id);
  ok(fx, ['check']);
  assert.deepEqual(ran(fx), ['C-2']);
});

test('check selectors run exactly the selected checks', (t) => {
  const fx = project(t);
  ok(fx, ['check', '--req', 'REQ-002']);
  assert.deepEqual(ran(fx), ['C-12', 'C-2']);
  clearRan(fx);
  ok(fx, ['check', 'C-3']);
  assert.deepEqual(ran(fx), ['C-3']);
  clearRan(fx);
  ok(fx, ['check', '--all']);
  assert.deepEqual(ran(fx), ['C-1', 'C-12', 'C-2', 'C-3']);
  clearRan(fx);
  const nothing = json(fx, ['check']);
  assert.deepEqual(nothing.runs, []);
  assert.deepEqual(ran(fx), []);
});

test('unknown never counts as green', async (t) => {
  await t.test('a command that cannot run is unknown', (tt) => {
    const fx = project(tt, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], MISSING)) });
    const result = json(fx, ['check', 'C-1'], 1);
    assert.deepEqual(result.runs.map((item) => [item.outcome, item.reason]), [['unknown', 'not-runnable']]);
    ok(fx, ['check', 'C-12', 'C-2']);
    const state = status(fx);
    assert.equal(byId(state.requirements)['REQ-001'].state, 'unknown');
    assert.equal(byId(state.requirements)['REQ-002'].state, 'green');
    assert.equal(state.counts.green, 1);
    assert.equal(state.counts.unknown, 1);
  });

  await t.test('a timed-out check is unknown', (tt) => {
    const fx = project(tt, {
      '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/hang.cjs`, { timeout_sec: 1 })),
    });
    const result = json(fx, ['check', 'C-1'], 1);
    assert.deepEqual(result.runs.map((item) => [item.outcome, item.reason]), [['unknown', 'timeout']]);
    assert.equal(byId(status(fx).requirements)['REQ-001'].state, 'unknown');
  });

  await t.test('a zero exit that misses the expected output is unknown, not a pass', (tt) => {
    const fx = project(tt, {
      '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/empty.cjs`)),
    });
    const result = json(fx, ['check', 'C-1'], 1);
    assert.deepEqual(result.runs.map((item) => [item.outcome, item.reason]), [['unknown', 'expect-unmet']]);
    assert.equal(byId(status(fx).checks)['C-1'].state, 'unknown');
    assert.deepEqual(byId(status(fx).checks)['C-1'].reasons, ['expect-unmet']);
  });

  await t.test('a check killed by a signal is unknown and names the signal', (tt) => {
    const fx = project(tt, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], 'kill -TERM $$')) });
    const result = json(fx, ['check', 'C-1'], 1);
    assert.deepEqual(result.runs.map((item) => [item.outcome, item.reason]), [['unknown', 'signal-SIGTERM']]);
    assert.equal(byId(status(fx).checks)['C-1'].state, 'unknown');
  });

  await t.test('evidence from a dirty tree is recorded and reported but never counts', (tt) => {
    const fx = project(tt);
    write(fx.root, 'src/app.cjs', 'module.exports = { items: ["uncommitted"] };\n');
    const result = json(fx, ['check', '--all'], 1);
    assert.equal(result.dirty, true);
    assert.ok(result.runs.every((item) => item.outcome === 'pass' && item.dirty === true));
    const text = run(fx, ['check', 'C-1']);
    assert.equal(text.status, 1, text.stderr);
    assert.match(text.stdout, /^C-1: pass \(exit-0, dirty: not counted\)$/mu);
    assert.equal(ledger(fx, 'evidence.jsonl').every((record) => record.dirty === true), true);
    const state = status(fx);
    assert.equal(state.dirty, true);
    assert.equal(state.counts.green, 0);
    assert.equal(state.counts.unknown, 2);
    for (const check of state.checks) assert.deepEqual(check.reasons, ['dirty-run'], check.id);
    assert.equal(
      state.line,
      'M1 · 0/2 绿 · 2 未知 · 下一项 N-01 · 本里程碑计划变更 0 次 · 工作区未提交 · 计划门待重跑',
    );
  });

  await t.test('evidence is dirty when the code changes during the run', (tt) => {
    const fx = project(tt, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/commit.cjs`)) });
    const result = json(fx, ['check', 'C-1'], 1);
    assert.deepEqual(result.runs.map((item) => [item.outcome, item.dirty]), [['pass', true]]);
    const state = status(fx);
    assert.equal(state.dirty, false);
    assert.equal(byId(state.checks)['C-1'].state, 'unknown');
    assert.deepEqual(byId(state.checks)['C-1'].reasons, ['dirty-run']);
  });

  await t.test('the latest run decides: a failure that left a stray file hides an older pass', (tt) => {
    const fx = project(tt, {
      '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/toggle.cjs report`)),
    });
    ok(fx, ['check', 'C-1']);
    const [pass] = ledger(fx, 'evidence.jsonl');
    write(fx.root, '.ultra/.runtime/fail', '');
    const failed = run(fx, ['check', 'C-1']);
    assert.equal(failed.status, 1, failed.stderr);
    assert.match(failed.stdout, /^C-1: fail \(exit-1, dirty: not counted\)$/mu);
    fs.rmSync(path.join(fx.root, 'failure-report.txt'));
    const state = status(fx);
    assert.equal(state.dirty, false);
    const check = byId(state.checks)['C-1'];
    assert.equal(check.state, 'unknown');
    assert.deepEqual(check.reasons, ['dirty-run']);
    assert.notEqual(check.last_run, pass.run);
    assert.equal(check.last_run, ledger(fx, 'evidence.jsonl').at(-1).run);
    assert.equal(byId(state.requirements)['REQ-001'].state, 'unknown');
  });

  await t.test('one unknown check keeps a requirement out of green even when another passes', (tt) => {
    const fx = project(tt, {
      '.ultra/checks.json': checksFile([...CHECKS, cmd('C-1b', ['REQ-001'], MISSING)]),
    });
    ok(fx, ['check'], 1);
    const req = byId(status(fx).requirements)['REQ-001'];
    assert.equal(req.state, 'unknown');
    assert.equal(byId(req.checks)['C-1'].state, 'green');
    assert.equal(byId(req.checks)['C-1b'].state, 'unknown');
  });
});

test('the counter partitions a milestone into exactly five states and the line reports them', (t) => {
  const spec = `# Spec

## REQ-G Green
Passes.

## REQ-R Red
Fails.

## REQ-S Stale
Passes, then its wording changes.

## REQ-U Unknown
Cannot run.

## REQ-C Uncovered
Has no check.
`;
  const plan = {
    version: 1,
    milestones: [{ id: 'M1', title: 'All states', requirements: ['REQ-G', 'REQ-R', 'REQ-S', 'REQ-U', 'REQ-C'] }],
    nodes: [{ id: 'N-01', milestone: 'M1', title: 'All', covers: ['REQ-G', 'REQ-R', 'REQ-S', 'REQ-U', 'REQ-C'], depends: [] }],
  };
  const fx = project(t, {
    '.ultra/spec.md': spec,
    '.ultra/plan.json': `${JSON.stringify(plan)}\n`,
    '.ultra/checks.json': checksFile([
      passCheck('C-G', ['REQ-G']),
      cmd('C-R', ['REQ-R'], `${NODE} checks/fail.cjs`),
      passCheck('C-S', ['REQ-S']),
      cmd('C-U', ['REQ-U'], MISSING),
    ]),
  });
  ok(fx, ['check'], 1);
  editSpec(fx, 'then its wording changes.', 'then its wording changed.');
  const state = status(fx);
  assert.deepEqual(state.counts, { total: 5, green: 1, red: 1, stale: 1, unknown: 1, uncovered: 1 });
  const sum = ['green', 'red', 'stale', 'unknown', 'uncovered'].reduce((total, key) => total + state.counts[key], 0);
  assert.equal(sum, state.counts.total);
  assert.deepEqual(
    state.requirements.map((req) => [req.id, req.state]),
    [['REQ-G', 'green'], ['REQ-R', 'red'], ['REQ-S', 'stale'], ['REQ-U', 'unknown'], ['REQ-C', 'uncovered']],
  );
  assert.equal(state.gate, 'fail');
  assert.equal(
    state.line,
    'M1 · 1/5 绿 · 1 红 · 1 过期 · 1 未知 · 1 未覆盖 · 下一项 N-01 · 本里程碑计划变更 0 次 · 计划门未通过',
  );
  const red = byId(state.checks)['C-R'];
  assert.equal(red.state, 'red');
  assert.deepEqual(red.reasons, ['exit-1']);
  // The first error-looking line wins over later noise such as `code: 'ERR_ASSERTION'`.
  const record = ledger(fx, 'evidence.jsonl').find((item) => item.check === 'C-R');
  assert.equal(record.error_line, 'AssertionError: expected 1 to equal 2');
});

test('requirement aggregation: red outranks unknown, unknown outranks stale, stale outranks green', (t) => {
  const spec = `# Spec

## REQ-A Red and stale
A.

## REQ-B Unknown and stale
B.

## REQ-C Green and stale
C.
`;
  const plan = {
    version: 1,
    milestones: [{ id: 'M1', title: 'Mix', requirements: ['REQ-A', 'REQ-B', 'REQ-C'] }],
    nodes: [{ id: 'N-01', milestone: 'M1', title: 'Mix', covers: ['REQ-A', 'REQ-B', 'REQ-C'], depends: [] }],
  };
  const stalePass = passCheck('C-stale', ['REQ-A', 'REQ-B', 'REQ-C']);
  const others = [
    cmd('C-red', ['REQ-A'], `${NODE} checks/fail.cjs`),
    cmd('C-unknown', ['REQ-B'], MISSING),
    passCheck('C-green', ['REQ-C']),
  ];
  const fx = project(t, {
    '.ultra/spec.md': spec,
    '.ultra/plan.json': `${JSON.stringify(plan)}\n`,
    '.ultra/checks.json': checksFile([stalePass, ...others]),
  });
  ok(fx, ['check'], 1);
  setChecks(fx, [{ ...stalePass, timeout_sec: 30 }, ...others]);
  const reqs = byId(status(fx).requirements);
  assert.equal(reqs['REQ-A'].state, 'red');
  assert.equal(reqs['REQ-B'].state, 'unknown');
  assert.equal(reqs['REQ-C'].state, 'stale');
});

test('the current milestone is the first without a closure record', (t) => {
  const fx = project(t);
  completeM1(fx);
  closeMilestone(fx, 'M1');
  const state = status(fx);
  assert.equal(state.milestone, 'M2');
  assert.deepEqual(state.counts, { total: 1, green: 1, red: 0, stale: 0, unknown: 0, uncovered: 0 });
  assert.equal(state.closed_not_green, 0);
  assert.equal(state.line, 'M2 · 1/1 绿 · 下一项 N-03 · 本里程碑计划变更 0 次');
});

test('closed milestones keep counting: regressions show on the line and their stale nodes come next', (t) => {
  const fx = project(t);
  completeM1(fx);
  closeMilestone(fx, 'M1');
  setChecks(fx, CHECKS.map((check) => (check.id === 'C-1' ? { ...check, run: `${NODE} checks/fail.cjs` } : check)));
  ok(fx, ['check'], 1);
  let state = status(fx);
  assert.equal(byId(state.requirements)['REQ-001'].state, 'red');
  assert.equal(state.closed_not_green, 1);
  // Editing a check of a closed milestone is a plan change of that milestone.
  assert.equal(
    state.line,
    'M2 · 1/1 绿 · 下一项 N-03 · 本里程碑计划变更 0 次 · 已关闭里程碑 1 项未绿 · 计划门待重跑',
  );
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff.checks_modified, ['C-1']);
  assert.equal(status(fx).line, 'M2 · 1/1 绿 · 下一项 N-03 · 本里程碑计划变更 1 次 · 已关闭里程碑 1 项未绿');

  editSpec(fx, 'it disappears from the list', 'it disappears from every list');
  state = status(fx);
  assert.equal(byId(state.nodes)['N-02'].state, 'stale');
  assert.equal(byId(state.nodes)['N-03'].state, 'blocked');
  assert.equal(state.next, 'N-02');
  assert.equal(state.closed_not_green, 2);
  assert.equal(
    state.line,
    'M2 · 1/1 绿 · 下一项 N-02 · 本里程碑计划变更 1 次 · 已关闭里程碑 2 项未绿 · 计划门待重跑',
  );
});

test('node done refuses until the gate passes, the tree is clean, dependencies are done and requirements are green', (t) => {
  const fx = project(t);
  const noGate = json(fx, ['node', 'done', 'N-01'], 1);
  assert.equal(noGate.ok, false);
  assert.ok(noGate.problems.length > 0);
  ok(fx, ['gate']);
  const notGreen = json(fx, ['node', 'done', 'N-01'], 1);
  assert.match(JSON.stringify(notGreen.problems), /REQ-001/);
  ok(fx, ['check']);
  const depNotDone = json(fx, ['node', 'done', 'N-02'], 1);
  assert.match(JSON.stringify(depNotDone.problems), /N-01/);
  write(fx.root, 'src/app.cjs', 'module.exports = { items: ["uncommitted"] };\n');
  json(fx, ['node', 'done', 'N-01'], 1);
  git(fx.root, ['checkout', '--', 'src/app.cjs']);
  assert.deepEqual(ledger(fx, 'nodes.jsonl'), []);
  const done = json(fx, ['node', 'done', 'N-01']);
  assert.deepEqual(done, { ok: true, node: 'N-01', problems: [] });
  const [record] = ledger(fx, 'nodes.jsonl');
  assert.equal(record.node, 'N-01');
  assert.deepEqual(Object.keys(record.reqs), ['REQ-001']);
  assert.ok(record.runs.length >= 2);
  assert.equal(byId(status(fx).nodes)['N-01'].state, 'done');
});

test('the gate names each plan problem with a fix hint and records nothing', async (t) => {
  const cases = [
    ['unknown-requirement', (plan) => { plan.milestones[0].requirements.push('REQ-404'); }],
    ['unplanned-requirement', (plan) => { plan.milestones[1].requirements = []; }],
    ['requirement-in-multiple-milestones', (plan) => { plan.milestones[1].requirements.push('REQ-001'); }],
    ['empty-plan', (plan) => { plan.milestones = []; plan.nodes = []; }],
    ['empty-milestone', (plan) => { plan.milestones.push({ id: 'M3', title: 'Empty', requirements: [] }); }],
    ['empty-node', (plan) => {
      plan.nodes.push({ id: 'N-09', milestone: 'M1', title: 'Nothing', covers: [], depends: [] });
    }],
    ['requirement-without-node', (plan) => { plan.nodes = plan.nodes.filter((node) => node.id !== 'N-03'); }],
    ['unknown-milestone', (plan) => { plan.nodes[2].milestone = 'M9'; }],
    ['node-outside-milestone', (plan) => { plan.nodes[0].covers.push('REQ-003'); }],
    ['unknown-dependency', (plan) => { plan.nodes[1].depends.push('N-99'); }],
    ['dependency-on-later-milestone', (plan) => { plan.nodes[0].depends.push('N-03'); }],
    ['dependency-cycle', (plan) => { plan.nodes[0].depends.push('N-02'); }],
  ];
  for (const [code, mutate] of cases) {
    await t.test(code, (tt) => {
      const fx = project(tt);
      const plan = structuredClone(PLAN);
      mutate(plan);
      setPlan(fx, plan);
      const result = json(fx, ['gate'], 1);
      assert.equal(result.ok, false);
      const problem = result.problems.find((item) => item.code === code);
      assert.ok(problem, `${code} in ${JSON.stringify(result.problems)}`);
      assert.equal(typeof problem.message, 'string');
      assert.ok(problem.hint.length > 0, `${code} has a hint`);
      assert.deepEqual(result.recorded, []);
      assert.deepEqual(ledger(fx, 'plan-log.jsonl'), []);
      assert.equal(status(fx).gate, 'fail');
    });
  }

  await t.test('uncovered-requirement', (tt) => {
    const fx = project(tt);
    setChecks(fx, CHECKS.filter((check) => check.id !== 'C-3'));
    const result = json(fx, ['gate'], 1);
    assert.ok(result.problems.some((item) => item.code === 'uncovered-requirement' && /REQ-003/.test(item.message)));
  });

  await t.test('check covering an unknown requirement', (tt) => {
    const fx = project(tt);
    setChecks(fx, [...CHECKS, passCheck('C-x', ['REQ-404'])]);
    const result = json(fx, ['gate'], 1);
    assert.ok(result.problems.some((item) => item.code === 'unknown-requirement' && /REQ-404/.test(item.message)));
  });

  await t.test('malformed-ruling', (tt) => {
    const fx = project(tt, {
      '.ultra/rulings.md': `# Rulings\n\n${RULING}- we decided to skip the share link\n`,
    });
    const result = json(fx, ['gate'], 1);
    const problems = result.problems.filter((item) => item.code === 'malformed-ruling');
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /skip the share link/);
  });

  await t.test('a well-formed ruling log passes', (tt) => {
    const fx = project(tt, { '.ultra/rulings.md': `# Rulings\n\nFree text is allowed.\n\n${RULING}` });
    assert.equal(json(fx, ['gate']).ok, true);
  });

  await t.test('only list items outside fences are rulings, and every list marker counts', (tt) => {
    const fx = project(tt, {
      '.ultra/rulings.md': '# Rulings\n\n```text\n- an example, not a ruling\n```\n\n'
        + `${RULING}* a starred note\n  - an indented note\n`,
    });
    const result = json(fx, ['gate'], 1);
    const messages = result.problems
      .filter((item) => item.code === 'malformed-ruling')
      .map((item) => item.message);
    assert.equal(messages.length, 2, JSON.stringify(messages));
    assert.match(messages.join('\n'), /starred note/);
    assert.match(messages.join('\n'), /indented note/);
  });

  await t.test('an unclosed fence in the ruling log is a problem that names its line', (tt) => {
    const fx = project(tt, { '.ultra/rulings.md': '# Rulings\n\n```text\n- inside a fence\n' });
    const result = json(fx, ['gate'], 1);
    assert.ok(
      result.problems.some((item) => item.code === 'malformed-ruling' && /rulings\.md:3:/.test(item.message)),
      JSON.stringify(result.problems),
    );
  });
});

test('a plan without milestones has no current milestone and no next item', (t) => {
  const fx = project(t, { '.ultra/plan.json': JSON.stringify({ version: 1, milestones: [], nodes: [] }) });
  const state = status(fx);
  assert.equal(state.milestone, null);
  assert.equal(state.line, '无 · 0/0 绿 · 下一项 无（受阻） · 本里程碑计划变更 0 次 · 计划门未通过');
});

test('the gate logs a new requirement as a denominator change', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/spec.md', `${SPEC}\n## REQ-004 Rename an item\nThe user renames an item in place.\n`);
  setChecks(fx, [...CHECKS, passCheck('C-4', ['REQ-004'])]);
  const plan = structuredClone(PLAN);
  plan.milestones[0].requirements.push('REQ-004');
  plan.nodes.splice(2, 0, { id: 'N-04', milestone: 'M1', title: 'Rename', covers: ['REQ-004'], depends: ['N-01'] });
  setPlan(fx, plan);
  assert.equal(status(fx).gate, 'stale');
  const gate = json(fx, ['gate']);
  assert.deepEqual(gate.recorded, [{ milestone: 'M1', type: 'change' }]);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff, {
    added: ['REQ-004'], removed: [], modified: [], nodes_added: ['N-04'], nodes_removed: [],
    checks_added: ['C-4'], checks_removed: [], checks_modified: [],
  });
  const state = status(fx);
  assert.equal(state.counts.total, 3);
  assert.equal(state.plan_changes, 1);
});

test('removing a milestone records everything that left the plan', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/spec.md', SPEC.replace('\n## REQ-003 Share the list\nThe user shares a read-only link to the list.\n', ''));
  setChecks(fx, CHECKS.filter((check) => check.id !== 'C-3'));
  const plan = structuredClone(PLAN);
  plan.milestones.pop();
  plan.nodes.pop();
  setPlan(fx, plan);
  // P3: a reduction waits for the Owner's recorded approval.
  assert.equal(status(fx).gate, 'fail');
  ok(fx, ['approve', 'M2/REQ-003', 'M2/C-3', '--owner', '同意去掉 M2。']);
  assert.equal(status(fx).gate, 'stale');
  const gate = json(fx, ['gate']);
  assert.deepEqual(gate.recorded, [{ milestone: 'M2', type: 'removed' }]);
  const removed = ledger(fx, 'plan-log.jsonl').at(-1);
  assert.deepEqual(
    [removed.type, removed.requirements, removed.nodes, removed.checks],
    ['removed', {}, [], {}],
  );
  assert.deepEqual(removed.diff, {
    added: [], removed: ['REQ-003'], modified: [], nodes_added: [], nodes_removed: ['N-03'],
    checks_added: [], checks_removed: ['C-3'], checks_modified: [],
  });
  const state = status(fx);
  assert.equal(state.gate, 'pass');
  assert.equal(state.plan_changes, 1);
  assert.deepEqual(json(fx, ['gate']).recorded, []);
});

test('renaming a milestone is a removal plus a baseline, never a silent reset', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/spec.md', SPEC.replace(
    '## REQ-002 Remove an item\nThe user removes an item and it disappears from the list.\n\n',
    '',
  ));
  setChecks(fx, [CHECKS[0], { ...CHECKS[1], covers: ['REQ-001'] }, CHECKS[3]]);
  setPlan(fx, {
    version: 1,
    milestones: [{ id: 'M1b', title: 'Core list', requirements: ['REQ-001'] }, PLAN.milestones[1]],
    nodes: [{ ...PLAN.nodes[0], milestone: 'M1b' }, { ...PLAN.nodes[2], depends: ['N-01'] }],
  });
  // P3: everything that leaves M1 is a reduction until the Owner approves it.
  assert.equal(status(fx).gate, 'fail');
  ok(fx, ['approve', 'M1/REQ-001', 'M1/REQ-002', 'M1/C-1', 'M1/C-12', 'M1/C-2',
    '--owner', '同意改名并去掉 REQ-002。']);
  const gate = json(fx, ['gate']);
  assert.deepEqual(gate.recorded, [
    { milestone: 'M1b', type: 'baseline' },
    { milestone: 'M1', type: 'removed' },
  ]);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff, {
    added: [], removed: ['REQ-001', 'REQ-002'], modified: [], nodes_added: [], nodes_removed: ['N-01', 'N-02'],
    checks_added: [], checks_removed: ['C-1', 'C-12', 'C-2'], checks_modified: [],
  });
  // The renamed milestone is current, and the shrink stays on its counter.
  const state = status(fx);
  assert.equal(state.milestone, 'M1b');
  assert.equal(state.plan_changes, 1);
  assert.match(state.line, / · 本里程碑计划变更 1 次/u);
});

test('removing or narrowing a check is a recorded plan change, never a silent turn to green', (t) => {
  const fx = project(t, {
    '.ultra/checks.json': checksFile([...CHECKS, cmd('C-1-edge', ['REQ-001'], `${NODE} checks/fail.cjs`)]),
  });
  ok(fx, ['gate']);
  ok(fx, ['check'], 1);
  assert.equal(byId(status(fx).requirements)['REQ-001'].state, 'red');

  setChecks(fx, CHECKS);
  let state = status(fx);
  assert.equal(byId(state.requirements)['REQ-001'].state, 'green');
  assert.equal(state.dirty, false);
  // P3: dropping a check is a reduction; the gate fails until the Owner approves it.
  assert.equal(state.gate, 'fail');
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 0 次 · 计划门未通过');
  const refused = json(fx, ['node', 'done', 'N-01'], 1);
  assert.deepEqual(refused.problems.map((item) => item.code), ['plan-gate']);
  assert.deepEqual(ledger(fx, 'nodes.jsonl'), []);

  ok(fx, ['approve', 'M1/C-1-edge', '--owner', '同意去掉 C-1-edge。']);
  assert.equal(status(fx).gate, 'stale');
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff, {
    added: [], removed: [], modified: [], nodes_added: [], nodes_removed: [],
    checks_added: [], checks_removed: ['C-1-edge'], checks_modified: [],
  });
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 1 次');

  setChecks(fx, CHECKS.map((check) => (check.id === 'C-12' ? { ...check, covers: ['REQ-001'] } : check)));
  state = status(fx);
  assert.equal(state.gate, 'fail');
  ok(fx, ['approve', 'M1/C-12', '--owner', '同意 C-12 只管 REQ-001。']);
  assert.equal(status(fx).gate, 'stale');
  ok(fx, ['gate']);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff.checks_modified, ['C-12']);
  assert.equal(status(fx).plan_changes, 2);
});

test('requirement parsing follows the fence and heading rules and ignores trailing whitespace', (t) => {
  const spec = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.
\`\`\`npm test\`\`\` must print the item.

## Notes
Free text that is not part of REQ-001.

\`\`\`markdown
## REQ-999 Not a requirement
\`\`\`

## REQ-002 Remove an item
The user removes an item and it disappears from the list.

\`\`\`text
## Inside a fence, still REQ-002
\`\`\`
Removal is permanent.

## REQ-003 Share the list
The user shares a read-only link to the list.
`;
  const fx = project(t, { '.ultra/spec.md': spec });
  ok(fx, ['gate']);
  ok(fx, ['check']);
  assert.deepEqual(status(fx).requirements.map((req) => req.id), ['REQ-001', 'REQ-002', 'REQ-003']);
  editSpec(fx, 'Free text that is not part of REQ-001.', 'Changed notes.');
  editSpec(fx, 'sees it in the list.', 'sees it in the list.   ');
  editSpec(fx, '## REQ-999 Not a requirement', '## REQ-999 Still not a requirement');
  // P3: the notes are shared text, so every requirement turns stale for that reason alone;
  // none of these edits touches a requirement's own text.
  let reqs = byId(status(fx).requirements);
  for (const id of ['REQ-001', 'REQ-002', 'REQ-003']) {
    assert.deepEqual(reqs[id].reasons, ['shared-changed'], id);
  }
  editSpec(fx, 'Removal is permanent.', 'Removal can be undone.');
  reqs = byId(status(fx).requirements);
  assert.deepEqual(reqs['REQ-001'].reasons, ['shared-changed']);
  assert.deepEqual(reqs['REQ-002'].reasons, ['shared-changed', 'req-changed:REQ-002']);
});

test('malformed truth files exit 2 and name the file', async (t) => {
  const cases = [
    ['invalid plan JSON', { '.ultra/plan.json': '{ not json' }, /plan\.json/],
    ['duplicate requirement id', { '.ultra/spec.md': `${SPEC}\n## REQ-001 Again\nDuplicate.\n` }, /spec\.md/],
    ['malformed requirement heading', { '.ultra/spec.md': `${SPEC}\n## REQ-\nNo id.\n` }, /spec\.md/],
    ['unclosed fence in the spec', { '.ultra/spec.md': `${SPEC}\n\`\`\`text\nnever closed\n` }, /spec\.md:12:/],
    ...['### REQ-004 Nested', '##REQ-004 No space', '##　REQ-004 Ideographic space', '# REQ-004 Top']
      .map((heading) => [`near-miss heading ${JSON.stringify(heading)}`, {
        '.ultra/spec.md': `${SPEC}\n${heading}\nShould have been counted.\n`,
      }, /spec\.md:12:/]),
    ...['^', 'x*', '(?:)'].map((pattern) => [`expect ${JSON.stringify(pattern)} matches empty output`, {
      '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], 'true', { expect: pattern })),
    }, /checks\.json/]),
    ['duplicate check id', { '.ultra/checks.json': checksFile([...CHECKS, CHECKS[0]]) }, /checks\.json/],
    ['check without run', {
      '.ultra/checks.json': checksFile([{ id: 'C-1', covers: ['REQ-001'], expect: EXPECT }]),
    }, /checks\.json/],
    ['check without expect', {
      '.ultra/checks.json': checksFile([{ id: 'C-1', covers: ['REQ-001'], run: 'true' }]),
    }, /checks\.json/],
    ['check with an empty expect', {
      '.ultra/checks.json': checksFile([cmd('C-1', ['REQ-001'], 'true', { expect: '' })]),
    }, /checks\.json/],
    ['invalid expect pattern', {
      '.ultra/checks.json': checksFile([cmd('C-1', ['REQ-001'], 'true', { expect: '(' })]),
    }, /checks\.json/],
    ['duplicate node id', {
      '.ultra/plan.json': JSON.stringify({ ...PLAN, nodes: [...PLAN.nodes, PLAN.nodes[0]] }),
    }, /plan\.json/],
  ];
  for (const [label, files, pattern] of cases) {
    await t.test(label, (tt) => {
      const fx = project(tt, files);
      for (const args of [['status'], ['gate'], ['check'], ['node', 'done', 'N-01']]) {
        const result = run(fx, args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
        assert.match(result.stderr, pattern, args.join(' '));
      }
    });
  }
});

test('ledgers: a torn final line is ignored, reported and repaired before the next append', (t) => {
  const fx = project(t);
  ok(fx, ['check', 'C-1']);
  const file = ledgerFile(fx, 'evidence.jsonl');
  fs.appendFileSync(file, '{"v":1,"run":"torn');
  const state = status(fx);
  assert.equal(byId(state.checks)['C-1'].state, 'green');
  assert.ok(state.warnings.some((warning) => /evidence\.jsonl/.test(warning)), JSON.stringify(state.warnings));
  ok(fx, ['check', 'C-2']);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.endsWith('\n'));
  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  for (const line of lines) JSON.parse(line);
  assert.deepEqual(status(fx).warnings, []);
});

test('ledgers: a malformed line blocks every command and names its physical line', (t) => {
  const fx = project(t);
  ok(fx, ['check', 'C-1']);
  const file = ledgerFile(fx, 'evidence.jsonl');
  const valid = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, `${valid}\n\nnot json\n${valid}`);
  for (const args of [['status'], ['gate'], ['check'], ['node', 'done', 'N-01']]) {
    const result = run(fx, args);
    assert.equal(result.status, 2, args.join(' '));
    assert.match(result.stderr, /evidence\.jsonl:4:/, args.join(' '));
    assert.match(result.stderr, /remove|repair/iu, args.join(' '));
  }
});

test('ledgers: the latest record is the one with the greatest time, not the last line', (t) => {
  const fx = project(t);
  ok(fx, ['check', 'C-1']);
  const [record] = ledger(fx, 'evidence.jsonl');
  const older = {
    ...record,
    run: `${record.run}-older`,
    at: '2000-01-01T00:00:00.000Z',
    outcome: 'fail',
    reason: 'exit-1',
    error_line: 'AssertionError: older',
  };
  fs.appendFileSync(ledgerFile(fx, 'evidence.jsonl'), `${JSON.stringify(older)}\n`);
  const check = byId(status(fx).checks)['C-1'];
  assert.equal(check.state, 'green');
  assert.equal(check.last_run, record.run);
});

test('ledgers: record times never go backwards, so a fast clock cannot hide a later failure', (t) => {
  const fx = project(t, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/toggle.cjs`)) });
  ok(fx, ['check', 'C-1']);
  const file = ledgerFile(fx, 'evidence.jsonl');
  const [pass] = ledger(fx, 'evidence.jsonl');
  // A pass recorded by a machine whose clock ran far ahead.
  fs.writeFileSync(file, `${JSON.stringify({ ...pass, at: '2100-01-01T00:00:00.000Z' })}\n`);
  write(fx.root, '.ultra/.runtime/fail', '');
  ok(fx, ['check', 'C-1'], 1);
  const [, failed] = ledger(fx, 'evidence.jsonl');
  assert.equal(failed.outcome, 'fail');
  assert.equal(failed.at, '2100-01-01T00:00:00.001Z');
  const check = byId(status(fx).checks)['C-1'];
  assert.equal(check.state, 'red');
  assert.equal(check.last_run, failed.run);
});

test('ledgers: a record time in any other form is malformed', (t) => {
  const fx = project(t);
  ok(fx, ['check', 'C-1']);
  const [record] = ledger(fx, 'evidence.jsonl');
  fs.writeFileSync(ledgerFile(fx, 'evidence.jsonl'), `${JSON.stringify({ ...record, at: '2026-10-31' })}\n`);
  const result = run(fx, ['status']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /evidence\.jsonl:1:/);
});

test('concurrent gates record each plan change once', async (t) => {
  const fx = project(t);
  const results = await Promise.all([1, 2, 3, 4].map(() => start(fx, ['gate', '--json']).done));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(ledger(fx, 'plan-log.jsonl').length, 2);
  assert.equal(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'engine.lock')), false);
});

test('a lock left by a dead process is taken over', (t) => {
  const fx = project(t);
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  write(fx.root, '.ultra/.runtime/engine.lock', dead.stdout);
  ok(fx, ['gate']);
  assert.equal(ledger(fx, 'plan-log.jsonl').length, 2);
  assert.equal(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'engine.lock')), false);
});

test('many commands racing to break a dead lock still write each record once', async (t) => {
  const fx = project(t);
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const runtime = path.join(fx.root, '.ultra', '.runtime');
  // The race is timing-dependent, so it is tried many times; a correct lock never fails.
  for (let round = 0; round < 15; round += 1) {
    fs.rmSync(ledgerFile(fx, 'plan-log.jsonl'), { force: true });
    write(fx.root, '.ultra/.runtime/engine.lock', dead.stdout);
    const results = await Promise.all(Array.from({ length: 8 }, () => start(fx, ['gate', '--json']).done));
    for (const result of results) assert.equal(result.code, 0, `round ${round}: ${result.stderr}`);
    assert.equal(ledger(fx, 'plan-log.jsonl').length, 2, `round ${round}`);
    assert.equal(fs.existsSync(path.join(runtime, 'engine.lock')), false, `round ${round}`);
    assert.equal(fs.existsSync(path.join(runtime, 'engine.lock.break')), false, `round ${round}`);
  }
});

test('background children never outlive their check', async (t) => {
  const fx = project(t, {
    '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/background.cjs .ultra/.runtime/background.pid`)),
  });
  const result = json(fx, ['check', 'C-1']);
  const pid = readPid(fx, 'background.pid');
  killLater(t, pid);
  assert.deepEqual(result.runs.map((item) => item.outcome), ['pass']);
  assert.ok(pid > 0, 'the check recorded its background child');
  await until(() => !alive(pid), 5000);
});

test('a descendant that leaves the process group cannot keep the engine waiting', async (t) => {
  const cases = [
    ['after a timeout', 'hang', 1, 1, ['unknown', 'timeout']],
    ['after a normal exit', 'exit', 600, 0, ['pass', 'exit-0']],
  ];
  for (const [label, mode, timeout, exitCode, expected] of cases) {
    await t.test(label, (tt) => {
      const command = `${NODE} checks/escape.cjs .ultra/.runtime/escape.pid ${mode}`;
      const fx = project(tt, {
        '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], command, { timeout_sec: timeout })),
      });
      const started = Date.now();
      const result = run(fx, ['check', 'C-1', '--json']);
      const elapsed = Date.now() - started;
      killLater(tt, readPid(fx, 'escape.pid'));
      assert.ok(elapsed < 10000, `the engine waited ${elapsed} ms`);
      assert.equal(result.status, exitCode, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout).runs.map((item) => [item.outcome, item.reason]), [expected]);
    });
  }
});

test('an interrupted engine kills the running check and records nothing for it', async (t) => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    await t.test(signal, async (tt) => {
      const fx = project(tt, {
        '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/pid-hang.cjs .ultra/.runtime/hang.pid`)),
      });
      const { child, done } = start(fx, ['check', 'C-1']);
      await until(() => readPid(fx, 'hang.pid') > 0);
      const pid = readPid(fx, 'hang.pid');
      killLater(tt, pid);
      child.kill(signal);
      const result = await done;
      assert.equal(result.code, code, result.stderr);
      await until(() => !alive(pid), 5000);
      assert.deepEqual(ledger(fx, 'evidence.jsonl'), []);
    });
  }
});

test('check output is bounded in memory and expect reads its tail', (t) => {
  const fx = project(t, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/flood.cjs 640`)) });
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-rss-'));
  t.after(() => fs.rmSync(probe, { recursive: true, force: true }));
  const preload = path.join(probe, 'rss.cjs');
  const report = path.join(probe, 'rss');
  fs.writeFileSync(preload, "process.on('exit', () => require('node:fs')"
    + '.writeFileSync(process.env.UBP_RSS_FILE, String(process.resourceUsage().maxRSS)));\n');
  // Buffers live outside the V8 heap, so the heap flag alone cannot catch an unbounded
  // buffer; the peak resident size of the engine process can.
  const result = run(fx, ['check', 'C-1', '--json'], CLI, ['--max-old-space-size=64', '-r', preload], {
    UBP_RSS_FILE: report,
  });
  assert.equal(result.status, 0, result.stderr.slice(-2000));
  assert.deepEqual(JSON.parse(result.stdout).runs.map((item) => [item.outcome, item.reason]), [['pass', 'exit-0']]);
  const [record] = ledger(fx, 'evidence.jsonl');
  assert.ok(fs.statSync(path.join(fx.root, record.log)).size >= 640 * 1024 * 1024, 'the full output is logged');
  const peak = Number(fs.readFileSync(report, 'utf8')) * 1024; // maxRSS is in KiB
  assert.ok(peak < 320 * 1024 * 1024, `peak RSS ${Math.round(peak / 1048576)} MiB for 640 MiB of output`);
});

test('the code fingerprint does not depend on Git path quoting', (t) => {
  const fx = project(t, { 'src/résumé.txt': 'a non-ASCII path\n' });
  ok(fx, ['check']);
  assert.equal(status(fx).counts.green, 2);
  git(fx.root, ['config', 'core.quotePath', 'false']);
  const state = status(fx);
  assert.equal(state.counts.green, 2);
  for (const check of state.checks) assert.equal(check.state, 'green', check.id);
});

test('a very large top level with every file modified still works', (t) => {
  // Over 1 MiB of `git ls-tree` output and of `git status` output, the default limit of
  // Node's child_process buffers.
  const fx = project(t);
  const names = Array.from({ length: 6000 }, (_, index) => `${'x'.repeat(190)}-${String(index).padStart(6, '0')}.txt`);
  for (const name of names) fs.writeFileSync(path.join(fx.root, name), 'a\n');
  commitAll(fx.root, 'many files');
  ok(fx, ['check', 'C-1']);
  assert.equal(byId(status(fx).checks)['C-1'].state, 'green');
  for (const name of names) fs.writeFileSync(path.join(fx.root, name), 'b\n');
  const state = status(fx);
  assert.equal(state.dirty, true);
  assert.equal(byId(state.checks)['C-1'].state, 'green');
});

test('check scripts kept under .ultra/ are code: changing them invalidates evidence', (t) => {
  const fx = project(t, {
    '.ultra/checks/req1.cjs': "console.log('pass 1');\n",
    '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} .ultra/checks/req1.cjs`)),
  });
  ok(fx, ['check']);
  write(fx.root, '.ultra/checks/req1.cjs', "console.log('pass 1');\nprocess.exit(1);\n");
  assert.equal(status(fx).dirty, true);
  const uncommitted = json(fx, ['check', 'C-1'], 1);
  assert.deepEqual(uncommitted.runs.map((item) => [item.outcome, item.dirty]), [['fail', true]]);
  commitAll(fx.root, 'change a check script');
  for (const check of status(fx).checks.filter((item) => item.id !== 'C-1')) {
    assert.deepEqual([check.state, check.reasons], ['stale', ['code-changed']], check.id);
  }
  ok(fx, ['check'], 1);
  const checks = byId(status(fx).checks);
  assert.equal(checks['C-1'].state, 'red');
  for (const id of ['C-12', 'C-2', 'C-3']) assert.equal(checks[id].state, 'green', id);
});

test('the engine\'s own files never make the tree dirty, even when nothing ignores them', (t) => {
  const fx = project(t, { '.gitignore': '\n' });
  ok(fx, ['gate']);
  ok(fx, ['check']);
  assert.ok(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'checks')));
  assert.ok(ledger(fx, 'evidence.jsonl').every((record) => record.dirty === false));
  const state = status(fx);
  assert.equal(state.dirty, false);
  assert.equal(state.counts.green, 2);
});

test('a pathological expect cannot hang the engine', (t) => {
  const fx = project(t, {
    '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/backtrack.cjs`, { expect: '^(a+)+$' })),
  });
  const started = Date.now();
  const result = json(fx, ['check', 'C-1'], 1);
  assert.ok(Date.now() - started < 30000, `the engine took ${Date.now() - started} ms`);
  assert.deepEqual(result.runs.map((item) => [item.outcome, item.reason]), [['unknown', 'expect-timeout']]);
  assert.equal(byId(status(fx).checks)['C-1'].state, 'unknown');
});

test('the default check never exits 0 while a check is red; a selection answers for itself', (t) => {
  const fx = project(t, { '.ultra/checks.json': withC1(cmd('C-1', ['REQ-001'], `${NODE} checks/fail.cjs`)) });
  ok(fx, ['check'], 1);
  const again = json(fx, ['check'], 1);
  assert.deepEqual(again.runs, []);
  ok(fx, ['check', 'C-3']);
  ok(fx, ['check', '--req', 'REQ-001'], 1);
});

test('usage errors exit 2 with a hint that fits the cause', (t) => {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-plain-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  write(plain, '.ultra/spec.md', SPEC);
  write(plain, '.ultra/checks.json', checksFile(CHECKS));
  write(plain, '.ultra/plan.json', JSON.stringify(PLAN));
  const scratch = { root: plain, ranLog: path.join(plain, 'ran.log') };

  const notTree = run(scratch, ['status']);
  assert.equal(notTree.status, 2);
  assert.match(notTree.stderr, /git init/);

  git(plain, ['init', '-q']);
  const noCommit = run(scratch, ['status']);
  assert.equal(noCommit.status, 2);
  assert.match(noCommit.stderr, /commit/iu);
  assert.doesNotMatch(noCommit.stderr, /git init/);

  const missing = run({ ...scratch, root: path.join(plain, 'missing') }, ['status']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /does not exist/);
  assert.doesNotMatch(missing.stderr, /git init/);

  const fx = project(t);
  assert.equal(run(fx, ['no-such-command']).status, 2);
  assert.equal(run(fx, ['node', 'done', 'N-404']).status, 2);
});

test('the public ubp entry dispatches the engine commands', (t) => {
  const fx = project(t);
  const viaUbp = run(fx, ['status'], UBP);
  assert.equal(viaUbp.status, 0, viaUbp.stderr);
  assert.equal(viaUbp.stdout, ok(fx, ['status']).stdout);
  assert.equal(run(fx, ['gate', '--json'], UBP).status, 0);
  assert.equal(run(fx, ['check'], UBP).status, 0);
  assert.equal(JSON.parse(run(fx, ['node', 'done', 'N-01', '--json'], UBP).stdout).ok, true);
});

test('the engine stays within its budget, has no dependencies, and keeps lines readable', () => {
  const dir = path.join(ROOT, 'engine');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.cjs'));
  assert.ok(files.includes('cli.cjs'));
  let lines = 0;
  for (const name of files) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    const sourceLines = source.split('\n');
    // The Owner's budget counts real lines, as `wc -l` does: the newline that ends a file's last
    // line does not start another one (Owner, 2026-11-04; the old count added one per file).
    lines += sourceLines.length - (sourceLines.at(-1) === '' ? 1 : 0);
    sourceLines.forEach((line, index) => {
      assert.ok(line.length <= 100, `${name}:${index + 1} has ${line.length} characters`);
    });
    for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/gu)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('./'), `${name} requires ${match[1]}`);
    }
  }
  assert.ok(lines <= 2000, `engine has ${lines} lines`);
});
