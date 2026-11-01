'use strict';

// P5 acceptance for the v6 engine (RESULT.md §3.6 and §5 P5, contract in engine/FORMATS.md
// "Drive"): the unattended controller loop. Black-box: every observation goes through the
// CLI against a throwaway Git fixture; writers and reviewers are small Node scripts.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'engine', 'cli.cjs');
const UBP = path.join(ROOT, 'bin', 'install.js');
const NODE = JSON.stringify(process.execPath);

const SPEC = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.
`;

// A check fails while a committed file `src/broken-<id>` exists, or while the runtime toggle
// `.ultra/.runtime/fail-<id>` exists (changes no code).
const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('.ultra/.runtime/fail-' + id) || fs.existsSync('src/broken-' + id)) {
  console.log('AssertionError: ' + id + ' is broken');
  process.exit(1);
}
console.log('pass 1');
`;

// The fake writer. Behaviour is chosen per node and attempt by `.ultra/.runtime/writer.json`
// ({ "<node>": ["work", "idle", ...] }, one entry per attempt; default "work"):
// - work: delete src/broken-<check> for every check covering the node, commit, node done;
// - idle: do nothing;
// - dirty: write src/untracked.txt and stop;
// - outside: work, but also commit docs/outside.md;
// - truth: work, but also change .ultra/checks.json's first check timeout and commit;
// - approve: work, but also append a line to .ultra/ledger/approvals.jsonl and commit;
// - regress: work, but also recreate src/broken-C-1 in the same commit;
// - sleep: write its pid to .ultra/.runtime/writer.pid and sleep for a minute.
// It appends its view of the environment to .ultra/.runtime/writer-env.jsonl.
const WRITER = `const fs = require('node:fs');
const { execSync } = require('node:child_process');
const node = process.env.UBP_NODE;
const attempt = Number(process.env.UBP_ATTEMPT);
fs.appendFileSync('.ultra/.runtime/writer-env.jsonl', JSON.stringify({
  node, attempt, cwd: process.cwd(), root: process.env.UBP_ROOT, brief: process.env.UBP_BRIEF,
  briefText: fs.readFileSync(process.env.UBP_BRIEF, 'utf8'), ubp: process.env.UBP,
  gitDir: process.env.GIT_DIR ?? null, gitWorkTree: process.env.GIT_WORK_TREE ?? null,
}) + '\\n');
const plans = fs.existsSync('.ultra/.runtime/writer.json')
  ? JSON.parse(fs.readFileSync('.ultra/.runtime/writer.json', 'utf8')) : {};
const mode = (plans[node] ?? [])[attempt - 1] ?? 'work';
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const git = (args) => sh('git -c commit.gpgsign=false -c core.hooksPath=/dev/null ' + args);
if (mode === 'idle') process.exit(0);
if (mode === 'dirty') { fs.writeFileSync('src/untracked.txt', 'x'); process.exit(0); }
if (mode === 'sleep') {
  fs.writeFileSync('.ultra/.runtime/writer.pid', String(process.pid));
  setTimeout(() => {}, 60000);
  return;
}
const planFile = JSON.parse(fs.readFileSync('.ultra/plan.json', 'utf8'));
const covers = planFile.nodes.find((n) => n.id === node).covers;
const checks = JSON.parse(fs.readFileSync('.ultra/checks.json', 'utf8')).checks;
for (const c of checks) {
  if (c.covers.some((r) => covers.includes(r))) fs.rmSync('src/broken-' + c.id, { force: true });
}
fs.writeFileSync('src/' + node + '.txt', 'done\\n');
if (mode === 'outside') { fs.mkdirSync('docs', { recursive: true }); fs.writeFileSync('docs/outside.md', 'x\\n'); }
if (mode === 'truth') {
  const registry = JSON.parse(fs.readFileSync('.ultra/checks.json', 'utf8'));
  registry.checks[0].timeout_sec = 77;
  fs.writeFileSync('.ultra/checks.json', JSON.stringify(registry, null, 2) + '\\n');
}
if (mode === 'approve') fs.appendFileSync('.ultra/ledger/approvals.jsonl', '{"forged":true}\\n');
if (mode === 'regress') fs.writeFileSync('src/broken-C-1', 'x\\n');
git('add -A');
git('commit -q -m "work on ' + node + '"');
try { sh(process.env.UBP + ' check'); } catch { /* a red check is the engine's to judge */ }
sh(process.env.UBP + ' node done ' + node);
`;

// The fake reviewer writes the review the variable names, with the verdict from
// .ultra/.runtime/verdict (default "accept"), or an invalid one when that file says "none".
const REVIEWER = `const fs = require('node:fs');
const want = fs.existsSync('.ultra/.runtime/verdict')
  ? fs.readFileSync('.ultra/.runtime/verdict', 'utf8').trim() : 'accept';
fs.appendFileSync('.ultra/.runtime/reviewer-env.jsonl', JSON.stringify({
  milestone: process.env.UBP_MILESTONE, review: process.env.UBP_REVIEW,
  root: process.env.UBP_ROOT, ubp: process.env.UBP }) + '\\n');
const body = want === 'none' ? 'Reviewer: fake\\n\\nNo verdict here.\\n'
  : 'Reviewer: fake\\n\\nFindings: none.\\n\\nVerdict: ' + want + '\\n';
fs.writeFileSync(process.env.UBP_REVIEW, body);
`;

const check = (id, covers, extra = {}) => ({ id, covers,
  run: `${NODE} checks/pass.cjs ${id}`, expect: 'pass [1-9]', ...extra });

const CHECKS = [check('C-1', ['REQ-001']), check('C-2', ['REQ-002']),
  check('C-12', ['REQ-001', 'REQ-002'])];

const PLAN = {
  version: 1,
  milestones: [{ id: 'M1', title: 'Core list', requirements: ['REQ-001', 'REQ-002'],
    journey: 'C-12' }],
  nodes: [
    { id: 'N-01', milestone: 'M1', title: 'Add', covers: ['REQ-001'], depends: [],
      scope: ['src/'] },
    { id: 'N-02', milestone: 'M1', title: 'Remove', covers: ['REQ-002'], depends: ['N-01'],
      scope: ['src/'] },
  ],
};

const WRITER_CMD = `${NODE} tools/writer.cjs`;
const REVIEWER_CMD = `${NODE} tools/reviewer.cjs`;

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

function project(t, { plan = PLAN, checks = CHECKS, spec = SPEC, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p5-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'UBP Test']);
  git(root, ['config', 'user.email', 'ubp@example.invalid']);
  const base = {
    '.gitignore': '.ultra/.runtime/\n',
    'checks/pass.cjs': PASS_SCRIPT,
    'tools/writer.cjs': WRITER,
    'tools/reviewer.cjs': REVIEWER,
    '.ultra/spec.md': spec,
    '.ultra/checks.json': `${JSON.stringify({ version: 1, checks }, null, 2)}\n`,
    '.ultra/plan.json': `${JSON.stringify(plan, null, 2)}\n`,
    ...Object.fromEntries(checks.filter((c) => c.covers.length)
      .map((c) => [`src/broken-${c.id}`, 'x\n'])),
  };
  for (const [relative, content] of Object.entries({ ...base, ...files })) {
    write(root, relative, content);
  }
  fs.mkdirSync(path.join(root, '.ultra', '.runtime'), { recursive: true });
  commitAll(root, 'fixture');
  const fx = { root };
  ok(fx, ['gate']);
  commitAll(root, 'gate');
  return fx;
}

function run(fx, args, { entry = CLI, env = process.env, timeout = 180000 } = {}) {
  return spawnSync(process.execPath, [entry, ...args, '--root', fx.root], {
    encoding: 'utf8', timeout, killSignal: 'SIGKILL', env,
  });
}

function ok(fx, args, expectedExit = 0, options) {
  const result = run(fx, args, options);
  assert.equal(result.status, expectedExit,
    `${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

const json = (fx, args, expectedExit = 0, options) =>
  JSON.parse(ok(fx, [...args, '--json'], expectedExit, options).stdout);
const status = (fx) => json(fx, ['status']);
const codes = (result) => result.problems.map((p) => p.code);
const plan = (fx, plans) => write(fx.root, '.ultra/.runtime/writer.json', JSON.stringify(plans));
const drive = (fx, extra = [], expectedExit = 0, options) =>
  json(fx, ['drive', '--writer', WRITER_CMD, ...extra], expectedExit, options);
const writerEnv = (fx) => fs.readFileSync(path.join(fx.root, '.ultra/.runtime/writer-env.jsonl'),
  'utf8').trim().split('\n').map((line) => JSON.parse(line));
const exists = (fx, relative) => fs.existsSync(path.join(fx.root, relative));
const nodeState = (fx, id) => status(fx).nodes.find((n) => n.id === id).state;
const ledgerLines = (fx, name) => {
  const file = path.join(fx.root, '.ultra', 'ledger', `${name}.jsonl`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
};

test('drive runs every node to the milestone gate and stops there without closing', (t) => {
  const fx = project(t);
  const result = drive(fx);
  assert.equal(result.stop, 'milestone-gate');
  assert.equal(result.verdict, null);
  assert.deepEqual(result.problems, []);
  assert.match(result.run, /^[0-9a-f-]{36}$/u);
  const writers = result.steps.filter((s) => s.action === 'writer');
  assert.deepEqual(writers.map((s) => [s.subject, s.attempt, s.result]),
    [['N-01', 1, 'done'], ['N-02', 1, 'done']]);
  assert.equal(nodeState(fx, 'N-01'), 'done');
  assert.equal(nodeState(fx, 'N-02'), 'done');
  const after = status(fx);
  assert.equal(after.next, '里程碑门');
  assert.equal(after.counts.green, 2);
  assert.deepEqual(ledgerLines(fx, 'milestones'), [], 'drive never closes a milestone');
  assert.equal(exists(fx, '.ultra/records/owner-touches.md'), false);
  for (const id of ['N-01', 'N-02']) {
    assert.ok(exists(fx, `.ultra/.runtime/drive/${result.run}/${id}-1.log`), `${id} log`);
  }
});

test('drive text mode prints one line per action and the stop line', (t) => {
  const fx = project(t);
  const result = ok(fx, ['drive', '--writer', WRITER_CMD]);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.every((line) => line.startsWith('drive: ')), result.stdout);
  assert.equal(lines.at(-1), 'drive: stop milestone-gate');
  assert.ok(lines.some((line) => line.startsWith('drive: writer N-01: ')), result.stdout);
});

test('the writer gets the brief, its node, the attempt and a working ubp, without Git location variables',
  (t) => {
    const fx = project(t);
    const env = { ...process.env, GIT_DIR: path.join(fx.root, 'nowhere'),
      GIT_WORK_TREE: path.join(fx.root, 'nowhere') };
    // The engine itself must not be confused by these variables either.
    const result = drive(fx, [], 0, { env });
    assert.equal(result.stop, 'milestone-gate');
    const [first, second] = writerEnv(fx);
    const root = fs.realpathSync(fx.root);
    assert.equal(fs.realpathSync(first.cwd), root);
    assert.equal(fs.realpathSync(first.root), root);
    assert.equal(first.node, 'N-01');
    assert.equal(first.attempt, 1);
    assert.equal(first.gitDir, null);
    assert.equal(first.gitWorkTree, null);
    assert.equal(path.isAbsolute(first.brief), true);
    assert.equal(fs.realpathSync(path.dirname(first.brief)),
      fs.realpathSync(path.join(fx.root, '.ultra/.runtime/briefs')));
    assert.equal(path.basename(first.brief), 'N-01.md');
    assert.match(first.briefText, /^# Node N-01: Add\n/u);
    assert.match(first.briefText, /## Checks that must turn green \(read-only\)/u);
    assert.equal(second.node, 'N-02');
    // The brief is compiled after N-01's handoff could exist, so it is N-02's current brief.
    assert.match(second.briefText, /^# Node N-02: Remove\n/u);
  });

test('drive with a reviewer stops at the gate with the verdict and leaves closing to the Owner',
  (t) => {
    const fx = project(t);
    const result = drive(fx, ['--reviewer', REVIEWER_CMD]);
    assert.equal(result.stop, 'milestone-gate');
    assert.equal(result.verdict, 'accept');
    const review = path.join(fx.root, '.ultra/records/milestones/M1-review.md');
    assert.match(fs.readFileSync(review, 'utf8'), /^Reviewer: fake\n/u);
    const [seen] = fs.readFileSync(path.join(fx.root, '.ultra/.runtime/reviewer-env.jsonl'),
      'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(seen.milestone, 'M1');
    assert.equal(fs.realpathSync(seen.review), fs.realpathSync(review));
    assert.ok(exists(fx, `.ultra/.runtime/drive/${result.run}/review.log`));
    assert.deepEqual(ledgerLines(fx, 'milestones'), []);
    const gate = result.steps.find((s) => s.action === 'reviewer');
    assert.equal(gate.subject, 'M1');
    assert.equal(gate.result, 'accept');
  });

test('a revise verdict is reported, and an invalid or existing review stops the drive', (t) => {
  const fx = project(t);
  write(fx.root, '.ultra/.runtime/verdict', 'revise');
  const revised = drive(fx, ['--reviewer', REVIEWER_CMD]);
  assert.equal(revised.stop, 'milestone-gate');
  assert.equal(revised.verdict, 'revise');

  // The review file now exists: a second drive must not overwrite it.
  const again = drive(fx, ['--reviewer', REVIEWER_CMD], 1);
  assert.equal(again.stop, 'review-exists');
  assert.match(fs.readFileSync(path.join(fx.root, '.ultra/records/milestones/M1-review.md'),
    'utf8'), /Verdict: revise/u);

  const other = project(t);
  write(other.root, '.ultra/.runtime/verdict', 'none');
  const invalid = drive(other, ['--reviewer', REVIEWER_CMD], 1);
  assert.equal(invalid.stop, 'review-invalid');
  assert.equal(invalid.verdict, null);
});

test('a node that is not done gets a fresh attempt, up to --attempts', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['idle', 'work'] });
  const result = drive(fx);
  assert.equal(result.stop, 'milestone-gate');
  const n1 = result.steps.filter((s) => s.action === 'writer' && s.subject === 'N-01');
  assert.deepEqual(n1.map((s) => [s.attempt, s.result]), [[1, 'node-not-done'], [2, 'done']]);
  assert.deepEqual(writerEnv(fx).filter((e) => e.node === 'N-01').map((e) => e.attempt), [1, 2]);

  const stuck = project(t);
  plan(stuck, { 'N-01': ['idle', 'idle', 'idle', 'idle'] });
  const exhausted = drive(stuck, ['--attempts', '2'], 1);
  assert.equal(exhausted.stop, 'attempts-exhausted');
  assert.deepEqual(codes(exhausted), ['node-not-done']);
  assert.equal(writerEnv(stuck).length, 2);
  assert.ok(exists(stuck, `.ultra/.runtime/drive/${exhausted.run}/N-01-2.log`));
  assert.equal(nodeState(stuck, 'N-02') === 'done', false);

  const defaults = project(t);
  plan(defaults, { 'N-01': ['idle', 'idle', 'idle', 'idle'] });
  assert.equal(drive(defaults, [], 1).stop, 'attempts-exhausted');
  assert.equal(writerEnv(defaults).length, 3, 'three attempts by default');
});

test('a writer that leaves the tree dirty stops the drive at once', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['dirty', 'work'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'writer-left-dirty');
  assert.deepEqual(codes(result), ['writer-left-dirty']);
  assert.equal(writerEnv(fx).length, 1, 'no second attempt');
  assert.ok(exists(fx, 'src/untracked.txt'), 'the engine never cleans or reverts');
});

test('a commit outside the scope stops the drive and names the path', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['outside'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'out-of-scope');
  assert.deepEqual(codes(result), ['out-of-scope']);
  assert.match(result.problems[0].message, /docs\/outside\.md/u);
  assert.ok(exists(fx, 'docs/outside.md'), 'nothing is reverted');
});

test('records, rulings and ledger lines are allowed outside the scope', (t) => {
  const anchor = "fs.writeFileSync('src/' + node + '.txt', 'done\\n');";
  assert.ok(WRITER.includes(anchor), 'the fixture edit applies');
  const fx = project(t, { files: { 'tools/writer.cjs': WRITER.replace(
    "fs.writeFileSync('src/' + node + '.txt', 'done\\n');",
    "fs.writeFileSync('src/' + node + '.txt', 'done\\n');\n"
      + "fs.mkdirSync('.ultra/records/handoffs', { recursive: true });\n"
      + "fs.writeFileSync('.ultra/records/handoffs/' + node + '.md', 'handoff\\n');\n"
      + "fs.appendFileSync('.ultra/rulings.md', '- 2026-11-01 L4 裁决：x — 因为 y — 如果判断错了，代价是 z\\n');") } });
  const result = drive(fx);
  assert.equal(result.stop, 'milestone-gate');
  assert.ok(exists(fx, '.ultra/records/handoffs/N-01.md'));
});

test('a writer that edits a truth file or adds an approval stops the drive', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['truth'] });
  const truth = drive(fx, [], 1);
  assert.equal(truth.stop, 'truth-touched');
  assert.deepEqual(codes(truth), ['truth-touched']);
  assert.match(truth.problems[0].message, /\.ultra\/checks\.json/u);

  const forged = project(t);
  plan(forged, { 'N-01': ['approve'] });
  const approval = drive(forged, [], 1);
  assert.equal(approval.stop, 'truth-touched');
  assert.match(approval.problems[0].message, /\.ultra\/ledger\/approvals\.jsonl/u);
});

test('a requirement that was green and turns red stops the drive (ratchet)', (t) => {
  const fx = project(t);
  plan(fx, { 'N-02': ['regress'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'ratchet-broken');
  assert.deepEqual(codes(result), ['ratchet-broken']);
  assert.match(result.problems[0].message, /REQ-001/u);
});

test('a writer past --timeout-sec is stopped with its process group', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['sleep'] });
  const started = Date.now();
  const result = drive(fx, ['--timeout-sec', '2', '--attempts', '1'], 1);
  assert.ok(Date.now() - started < 50000, 'the drive did not wait for the sleeping writer');
  assert.equal(result.stop, 'attempts-exhausted');
  const pid = Number(fs.readFileSync(path.join(fx.root, '.ultra/.runtime/writer.pid'), 'utf8'));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'the writer process was stopped');
});

test('drive stops on a dirty tree, a failing gate, or checks that stay red', (t) => {
  const dirty = project(t);
  write(dirty.root, 'src/scratch.txt', 'x');
  const d = drive(dirty, [], 1);
  assert.equal(d.stop, 'dirty-tree');
  assert.equal(exists(dirty, '.ultra/.runtime/writer-env.jsonl'), false);

  const broken = project(t);
  const p = JSON.parse(JSON.stringify(PLAN));
  p.nodes[1].covers = ['REQ-404'];
  write(broken.root, '.ultra/plan.json', `${JSON.stringify(p, null, 2)}\n`);
  commitAll(broken.root, 'break the plan');
  const g = drive(broken, [], 1);
  assert.equal(g.stop, 'plan-gate');
  assert.equal(exists(broken, '.ultra/.runtime/writer-env.jsonl'), false);

  const invariant = project(t, { checks: [...CHECKS,
    check('C-inv', [], { fix: 'Keep it small.' })] });
  assert.equal(drive(invariant).stop, 'milestone-gate');
  write(invariant.root, '.ultra/.runtime/fail-C-inv', '');
  const i = drive(invariant, [], 1);
  assert.equal(i.stop, 'checks-not-green');
  assert.equal(writerEnv(invariant).length, 2, 'no writer after the gate');
});

test('a stale gate is run by the drive, and a fully closed plan stops all-done', (t) => {
  const fx = project(t);
  const s = fs.readFileSync(path.join(fx.root, '.ultra/spec.md'), 'utf8');
  write(fx.root, '.ultra/spec.md', s.replace('sees it in the list.', 'sees it at the top.'));
  commitAll(fx.root, 'modify REQ-001');
  assert.equal(status(fx).gate, 'stale');
  const result = drive(fx);
  assert.equal(result.stop, 'milestone-gate');
  assert.equal(result.steps[0].action, 'gate');

  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: r\n\nVerdict: accept\n');
  commitAll(fx.root, 'review');
  ok(fx, ['milestone', 'close', 'M1', '--owner', 'ok',
    '--review', '.ultra/records/milestones/M1-review.md']);
  commitAll(fx.root, 'close');
  const done = drive(fx);
  assert.equal(done.stop, 'all-done');
  assert.equal(done.steps.filter((x) => x.action === 'writer').length, 0);
});

test('drive refuses a node whose brief does not fit the default budget', (t) => {
  const big = SPEC.replace('sees it in the list.', `sees it in the list. ${'x'.repeat(40000)}`);
  const fx = project(t, { spec: big });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'brief-over-budget');
  assert.deepEqual(codes(result), ['brief-over-budget']);
  assert.equal(exists(fx, '.ultra/.runtime/writer-env.jsonl'), false);
});

test('drive usage errors exit 2 and run nothing', (t) => {
  const fx = project(t);
  for (const args of [
    ['drive'],
    ['drive', '--writer'],
    ['drive', '--writer', ''],
    ['drive', '--writer', WRITER_CMD, '--writer', WRITER_CMD],
    ['drive', '--writer', WRITER_CMD, '--attempts', '0'],
    ['drive', '--writer', WRITER_CMD, '--attempts', '1.5'],
    ['drive', '--writer', WRITER_CMD, '--timeout-sec', '-1'],
    ['drive', '--writer', WRITER_CMD, '--reviewer', ''],
    ['drive', '--writer', WRITER_CMD, '--owner', 'x'],
    ['status', '--writer', WRITER_CMD],
    ['check', '--attempts', '2'],
  ]) {
    const result = run(fx, args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
  }
  assert.equal(exists(fx, '.ultra/.runtime/writer-env.jsonl'), false);
});

test('bin/install.js dispatches drive and lists it in the help', (t) => {
  const fx = project(t);
  const result = json(fx, ['drive', '--writer', WRITER_CMD], 0, { entry: UBP });
  assert.equal(result.stop, 'milestone-gate');
  const help = spawnSync(process.execPath, [UBP, '--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /\bdrive\b/u);
});
