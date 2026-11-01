'use strict';

// P5 acceptance for the v6 engine (RESULT.md §3.6 and §5 P5, contract in engine/FORMATS.md
// "Drive"): the unattended controller loop. Black-box: every observation goes through the
// CLI against a throwaway Git fixture; writers and reviewers are small Node scripts.

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

const SPEC = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.
`;

// A check fails while a committed file `src/broken-<id>` exists, or while the runtime toggle
// `.ultra/.runtime/fail-<id>` exists (changes no code). With SLOW set it writes its pid to
// `.ultra/.runtime/check.pid` and hangs for 90 seconds.
const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (process.env.SLOW) {
  fs.writeFileSync('.ultra/.runtime/check.pid', String(process.pid));
  setTimeout(() => {}, 90000);
} else if (fs.existsSync('.ultra/.runtime/fail-' + id) || fs.existsSync('src/broken-' + id)) {
  console.log('AssertionError: ' + id + ' is broken');
  process.exit(1);
} else {
  console.log('pass 1');
}
`;

// The fake writer. Behaviour is chosen per node and attempt by `.ultra/.runtime/writer.json`
// ({ "<node>": ["work", "idle", ...] }, one entry per attempt; default "work"). It calls the
// engine as `ubp` from PATH, like a headless agent following its brief:
// - work: delete src/broken-<check> for every check covering the node, commit, node done;
// - eval: work, but call the engine as `eval "$UBP ..."`;
// - idle: do nothing;
// - dirty: write src/untracked.txt and stop;
// - outside: work, but also commit docs/outside.md;
// - sibling: work, but also commit src2/x.txt;
// - records: work, but also commit a milestone review and owner-touches.md;
// - weaken-check: work, but also commit an edit of checks/pass.cjs;
// - ruling: work, but also commit a malformed ruling;
// - truth: work, but also change .ultra/checks.json's first check timeout and commit;
// - approve: work, but also append a line to .ultra/ledger/approvals.jsonl and commit;
// - head-only: work, but also commit a closure line that never reaches the work tree;
// - touch:<file>: work, then append a newline to <file> without committing it;
// - weaken: fix nothing; rewrite every check's run to pass, uncommitted; gate, check, done;
// - forge: fix nothing; commit; check; append passing copies of the failing records; done;
// - forge-other: work, then append a copy of the completion naming N-02;
// - regress: work, but also recreate src/broken-C-1 in the same commit;
// - rewrite: work, but first fold the previous commit into its own (git reset --soft HEAD~1);
// - slowcheck: write its pid to .ultra/.runtime/writer.pid and run `ubp check C-1` with SLOW;
// - sleep: write its pid to .ultra/.runtime/writer.pid and sleep for a minute.
// It appends its view of the environment to .ultra/.runtime/writer-env.jsonl.
const WRITER = `const fs = require('node:fs');
const { execSync } = require('node:child_process');
const node = process.env.UBP_NODE;
const attempt = Number(process.env.UBP_ATTEMPT);
fs.appendFileSync('.ultra/.runtime/writer-env.jsonl', JSON.stringify({
  node, attempt, cwd: process.cwd(), root: process.env.UBP_ROOT, brief: process.env.UBP_BRIEF,
  briefText: fs.readFileSync(process.env.UBP_BRIEF, 'utf8'), ubp: process.env.UBP,
  path: process.env.PATH, drive: process.env.UBP_DRIVE ?? null,
  gitDir: process.env.GIT_DIR ?? null, gitWorkTree: process.env.GIT_WORK_TREE ?? null,
}) + '\\n');
const plans = fs.existsSync('.ultra/.runtime/writer.json')
  ? JSON.parse(fs.readFileSync('.ultra/.runtime/writer.json', 'utf8')) : {};
const mode = (plans[node] ?? [])[attempt - 1] ?? 'work';
const sh = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const ubp = (args) => sh(mode === 'eval' ? 'eval "$UBP ' + args + '"' : 'ubp ' + args);
const git = (args) => sh('git -c commit.gpgsign=false -c core.hooksPath=/dev/null ' + args);
const ledger = (name) => '.ultra/ledger/' + name + '.jsonl';
const lines = (name) => fs.existsSync(ledger(name))
  ? fs.readFileSync(ledger(name), 'utf8').split('\\n').filter(Boolean) : [];
if (mode === 'idle') process.exit(0);
if (mode === 'dirty') { fs.writeFileSync('src/untracked.txt', 'x'); process.exit(0); }
if (mode === 'sleep' || mode === 'slowcheck') {
  fs.writeFileSync('.ultra/.runtime/writer.pid', String(process.pid));
  if (mode === 'slowcheck') sh('ubp check C-1', { SLOW: '1' });
  setTimeout(() => {}, 60000);
  return;
}
const planFile = JSON.parse(fs.readFileSync('.ultra/plan.json', 'utf8'));
const covers = planFile.nodes.find((n) => n.id === node).covers;
const checks = JSON.parse(fs.readFileSync('.ultra/checks.json', 'utf8')).checks;
const fixing = !['weaken', 'forge'].includes(mode);
for (const c of checks) {
  if (fixing && c.covers.some((r) => covers.includes(r))) {
    fs.rmSync('src/broken-' + c.id, { force: true });
  }
}
fs.writeFileSync('src/' + node + '.txt', 'done\\n');
const put = (file, text) => {
  fs.mkdirSync(require('node:path').dirname(file), { recursive: true });
  fs.appendFileSync(file, text);
};
if (mode === 'outside') put('docs/outside.md', 'x\\n');
if (mode === 'sibling') put('src2/x.txt', 'x\\n');
if (mode === 'records') {
  put('.ultra/records/owner-touches.md', '- forged touch\\n');
  put('.ultra/records/milestones/M1-review.md', 'Reviewer: me\\n\\nVerdict: accept\\n');
}
if (mode === 'weaken-check') put('checks/pass.cjs', '// weakened\\n');
if (mode === 'ruling') put('.ultra/rulings.md', '- bad ruling\\n');
if (mode === 'truth') {
  const registry = JSON.parse(fs.readFileSync('.ultra/checks.json', 'utf8'));
  registry.checks[0].timeout_sec = 77;
  fs.writeFileSync('.ultra/checks.json', JSON.stringify(registry, null, 2) + '\\n');
}
if (mode === 'approve') put(ledger('approvals'), '{"forged":true}\\n');
if (mode === 'regress') put('src/broken-C-1', 'x\\n');
if (mode === 'rewrite') git('reset -q --soft HEAD~1');
if (mode === 'weaken') {
  git('add src');
  git('commit -q -m "placeholder for ' + node + '"');
  const registry = JSON.parse(fs.readFileSync('.ultra/checks.json', 'utf8'));
  for (const c of registry.checks) c.run = 'node -e "console.log(\\'pass 1\\')"';
  fs.writeFileSync('.ultra/checks.json', JSON.stringify(registry, null, 2) + '\\n');
  ubp('gate');
} else {
  git('add -A');
  if (mode === 'head-only') {
    const blob = execSync('git hash-object -w --stdin', { input: '{"v":1,"milestone":"M1",'
      + '"at":"2026-11-01T00:00:00.000Z"}\\n' }).toString().trim();
    git('update-index --add --cacheinfo 100644,' + blob + ',.ultra/ledger/milestones.jsonl');
  }
  git('commit -q -m "work on ' + node + '"');
}
try { ubp('check'); } catch { /* a red check is the engine's to judge */ }
if (mode === 'forge') {
  for (const line of lines('evidence')) {
    const record = JSON.parse(line);
    if (record.outcome === 'pass') continue;
    put(ledger('evidence'), JSON.stringify({ ...record, run: require('node:crypto').randomUUID(),
      at: '2099-01-01T00:00:00.000Z', outcome: 'pass', reason: 'exit-0', exit_code: 0,
      error_line: null }) + '\\n');
  }
}
ubp('node done ' + node);
if (mode === 'forge-other') {
  put(ledger('nodes'), JSON.stringify({ ...JSON.parse(lines('nodes').at(-1)), node: 'N-02' })
    + '\\n');
}
if (mode.startsWith('touch:')) fs.appendFileSync(mode.slice(6), '\\n');
`;

// The fake reviewer writes the review the variable names, with the verdict from
// .ultra/.runtime/verdict (default "accept"), or an invalid one when that file says "none".
// When that file says "meddle" it also leaves src/untracked.txt and edits .ultra/checks.json;
// when it says "sleep" it writes nothing and sleeps for a minute.
const REVIEWER = `const fs = require('node:fs');
const want = fs.existsSync('.ultra/.runtime/verdict')
  ? fs.readFileSync('.ultra/.runtime/verdict', 'utf8').trim() : 'accept';
fs.appendFileSync('.ultra/.runtime/reviewer-env.jsonl', JSON.stringify({
  milestone: process.env.UBP_MILESTONE, review: process.env.UBP_REVIEW,
  root: process.env.UBP_ROOT, ubp: process.env.UBP, path: process.env.PATH,
  drive: process.env.UBP_DRIVE ?? null }) + '\\n');
if (want === 'sleep') {
  setTimeout(() => {}, 60000);
  return;
}
if (want === 'meddle') {
  fs.writeFileSync('src/untracked.txt', 'x');
  fs.appendFileSync('.ultra/checks.json', '\\n');
}
const body = want === 'none' ? 'Reviewer: fake\\n\\nNo verdict here.\\n'
  : 'Reviewer: fake\\n\\nFindings: none.\\n\\nVerdict: '
    + (want === 'meddle' ? 'accept' : want) + '\\n';
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
  // Every check is unknown at the start, so the baseline run comes first; the checks that
  // verify a writer belong to its step; the milestone gate runs every check.
  assert.deepEqual(result.steps.map((s) => [s.action, s.subject, s.result, s.exit]), [
    ['check', 'stale', 'fail', null], ['writer', 'N-01', 'done', 0],
    ['writer', 'N-02', 'done', 0], ['check', 'all', 'pass', null]]);
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

test('drive text mode prints the run, one line per action and the stop line', (t) => {
  const fx = project(t);
  const result = ok(fx, ['drive', '--writer', WRITER_CMD]);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.every((line) => line.startsWith('drive: ')), result.stdout);
  assert.match(lines[0], /^drive: run [0-9a-f-]{36}$/u);
  assert.equal(lines.at(-1), 'drive: stop milestone-gate');
  assert.ok(lines.includes('drive: writer N-01: done (exit 0)'), result.stdout);
  assert.ok(lines.includes('drive: check all: pass'), result.stdout);

  // A stop with problems prints them before the stop line.
  const outside = project(t);
  plan(outside, { 'N-01': ['outside'] });
  const refused = ok(outside, ['drive', '--writer', WRITER_CMD], 1);
  const out = refused.stdout.trim().split('\n');
  assert.equal(out.at(-1), 'drive: stop out-of-scope');
  assert.match(out.at(-2), /^out-of-scope: .*docs\/outside\.md.* — /u);

  // With --json the run line goes to stderr and names the same run.
  const other = project(t);
  const asJson = ok(other, ['drive', '--writer', WRITER_CMD, '--json']);
  const run = JSON.parse(asJson.stdout).run;
  assert.ok(asJson.stderr.split('\n').includes(`drive: run ${run}`), asJson.stderr);
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
    // `ubp` on PATH is this engine (the fake writer only ever calls `ubp`), and so is $UBP.
    assert.equal(first.drive, '1');
    const bin = first.path.split(':')[0];
    assert.equal(fs.realpathSync(bin),
      fs.realpathSync(path.join(fx.root, '.ultra/.runtime/drive', result.run, 'bin')));
    fs.accessSync(path.join(bin, 'ubp'), fs.constants.X_OK);
    assert.match(first.ubp, /^'.+' '.+\/engine\/cli\.cjs'$/u);
  });

test('a writer can call the engine as eval "$UBP ..."', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['eval'], 'N-02': ['eval'] });
  const result = drive(fx);
  assert.equal(result.stop, 'milestone-gate');
  assert.deepEqual(result.steps.filter((s) => s.action === 'writer').map((s) => s.result),
    ['done', 'done']);
});

test('inside a drive, approve, milestone close, merge and drive refuse and change nothing',
  (t) => {
    const fx = project(t);
    const env = { ...process.env, UBP_DRIVE: '1' };
    const head = git(fx.root, ['rev-parse', 'HEAD']);
    for (const args of [
      ['approve', 'M1/REQ-001', '--owner', 'x'],
      ['milestone', 'close', 'M1', '--owner', 'x', '--review', 'r.md'],
      ['merge', 'main', '--expect-head', head],
      ['drive', '--writer', WRITER_CMD],
    ]) {
      const result = run(fx, args, { env });
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /Not allowed inside ubp drive\./u);
    }
    assert.deepEqual(ledgerLines(fx, 'approvals'), []);
    assert.deepEqual(ledgerLines(fx, 'milestones'), []);
    assert.equal(exists(fx, '.ultra/.runtime/writer-env.jsonl'), false);
    assert.equal(git(fx.root, ['rev-parse', 'HEAD']), head);
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
    assert.equal(fs.realpathSync(seen.root), fs.realpathSync(fx.root));
    assert.match(seen.ubp, /^'.+' '.+\/engine\/cli\.cjs'$/u);
    assert.equal(seen.drive, '1');
    assert.equal(fs.realpathSync(seen.path.split(':')[0]),
      fs.realpathSync(path.join(fx.root, '.ultra/.runtime/drive', result.run, 'bin')));
    assert.ok(exists(fx, `.ultra/.runtime/drive/${result.run}/review.log`));
    assert.deepEqual(ledgerLines(fx, 'milestones'), []);
    const gate = result.steps.find((s) => s.action === 'reviewer');
    assert.equal(gate.subject, 'M1');
    assert.equal(gate.result, 'accept');
    assert.equal(gate.exit, 0);
  });

test('a revise verdict exits 1, and an invalid or existing review stops the drive', (t) => {
  const fx = project(t);
  write(fx.root, '.ultra/.runtime/verdict', 'revise');
  const revised = drive(fx, ['--reviewer', REVIEWER_CMD], 1);
  assert.equal(revised.stop, 'milestone-gate');
  assert.equal(revised.verdict, 'revise');

  // The uncommitted review leaves `.ultra/` unclean, so the next drive starts nothing.
  const unclean = drive(fx, ['--reviewer', REVIEWER_CMD], 1);
  assert.equal(unclean.stop, 'dirty-tree');
  assert.deepEqual(unclean.steps, []);

  // Committed, the review file exists: a second drive must not overwrite it.
  commitAll(fx.root, 'review');
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

test('a reviewer that changes the tree or the truth stops the drive', (t) => {
  const fx = project(t);
  write(fx.root, '.ultra/.runtime/verdict', 'meddle');
  const result = drive(fx, ['--reviewer', REVIEWER_CMD], 1);
  assert.equal(result.stop, 'reviewer-changed-tree');
  assert.deepEqual(codes(result), ['reviewer-changed-tree']);
  assert.equal(result.verdict, null);
  assert.ok(exists(fx, 'src/untracked.txt'), 'nothing is reverted');
});

test('a reviewer past --timeout-sec is stopped and its missing review is invalid', (t) => {
  const fx = project(t);
  write(fx.root, '.ultra/.runtime/verdict', 'sleep');
  const started = Date.now();
  const result = drive(fx, ['--reviewer', REVIEWER_CMD, '--timeout-sec', '5'], 1);
  assert.ok(Date.now() - started < 50000, 'the drive did not wait for the sleeping reviewer');
  assert.equal(result.stop, 'review-invalid');
  const step = result.steps.find((s) => s.action === 'reviewer');
  assert.equal(step.exit, 'timeout');
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

  // A closure committed without ever being in the work tree changes HEAD only.
  const headOnly = project(t);
  plan(headOnly, { 'N-01': ['head-only'] });
  const closure = drive(headOnly, [], 1);
  assert.equal(closure.stop, 'truth-touched');
  assert.deepEqual(codes(closure), ['truth-touched']);
  assert.match(closure.problems[0].message, /\.ultra\/ledger\/milestones\.jsonl/u);
});

test('an uncommitted change to any truth file stops the drive, before the dirty tree', (t) => {
  for (const file of ['.ultra/spec.md', '.ultra/checks.json', '.ultra/plan.json',
    '.ultra/ledger/milestones.jsonl', '.ultra/ledger/approvals.jsonl',
    '.ultra/ledger/plan-log.jsonl']) {
    const fx = project(t);
    plan(fx, { 'N-01': [`touch:${file}`] });
    const result = drive(fx, [], 1);
    assert.equal(result.stop, 'truth-touched', file);
    assert.deepEqual(codes(result), ['truth-touched'], file);
    assert.ok(result.problems[0].message.includes(file), `${file}: ${result.problems[0].message}`);
    assert.equal(writerEnv(fx).length, 1, `${file}: no second attempt`);
  }
});

test('weakened checks and the plan change the writer gated are both truth-touched', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['weaken'] });
  const planLog = ledgerLines(fx, 'plan-log').length;
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'truth-touched');
  assert.deepEqual(codes(result), ['truth-touched', 'truth-touched']);
  assert.match(result.problems[0].message, /\.ultra\/checks\.json/u);
  assert.match(result.problems[1].message, /\.ultra\/ledger\/plan-log\.jsonl/u);
  assert.ok(ledgerLines(fx, 'plan-log').length > planLog, 'the writer did record a plan change');
  assert.ok(exists(fx, 'src/broken-C-1'), 'no code was fixed');
});

test('forged evidence or a completion of another node does not finish a node', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['forge'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'node-not-green');
  assert.deepEqual(codes(result), ['node-not-green', 'node-not-green']);
  assert.match(result.problems[0].message, /\bC-1\b/u);
  assert.match(result.problems[1].message, /\bC-12\b/u);
  assert.equal(writerEnv(fx).length, 1, 'no second attempt');

  const other = project(t);
  plan(other, { 'N-01': ['forge-other'] });
  const named = drive(other, [], 1);
  assert.equal(named.stop, 'out-of-scope');
  assert.deepEqual(codes(named), ['out-of-scope']);
  assert.match(named.problems[0].message, /\bN-02\b/u);
});

test('records outside handoffs, check files and paths beside a scope are refused', (t) => {
  const records = project(t);
  plan(records, { 'N-01': ['records'] });
  const r = drive(records, [], 1);
  assert.equal(r.stop, 'out-of-scope');
  assert.deepEqual(codes(r), ['out-of-scope', 'out-of-scope']);
  assert.match(r.problems[0].message, /\.ultra\/records\/milestones\/M1-review\.md/u);
  assert.match(r.problems[1].message, /\.ultra\/records\/owner-touches\.md/u);

  const scoped = JSON.parse(JSON.stringify(PLAN));
  for (const n of scoped.nodes) n.scope = ['src/', 'checks/'];
  const weakened = project(t, { plan: scoped });
  plan(weakened, { 'N-01': ['weaken-check'] });
  const c = drive(weakened, [], 1);
  assert.equal(c.stop, 'check-touched');
  assert.deepEqual(codes(c), ['check-touched']);
  assert.match(c.problems[0].message, /checks\/pass\.cjs/u);

  const bare = JSON.parse(JSON.stringify(PLAN));
  for (const n of bare.nodes) n.scope = ['src'];
  const sibling = project(t, { plan: bare });
  plan(sibling, { 'N-01': ['sibling'] });
  const s = drive(sibling, [], 1);
  assert.equal(s.stop, 'out-of-scope');
  assert.deepEqual(codes(s), ['out-of-scope']);
  assert.match(s.problems[0].message, /src2\/x\.txt/u);
});

test('a node without a scope stops the drive before any writer', (t) => {
  for (const scope of [undefined, []]) {
    const unscoped = JSON.parse(JSON.stringify(PLAN));
    if (scope) unscoped.nodes[0].scope = scope;
    else delete unscoped.nodes[0].scope;
    const fx = project(t, { plan: unscoped });
    const result = drive(fx, [], 1);
    assert.equal(result.stop, 'scope-missing');
    assert.deepEqual(codes(result), ['scope-missing']);
    assert.match(result.problems[0].message, /\bN-01\b/u);
    assert.equal(exists(fx, '.ultra/.runtime/writer-env.jsonl'), false);
  }
});

test('the drive reads the plan gate after a writer but never runs it', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['ruling'] });
  const planLog = ledgerLines(fx, 'plan-log');
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'plan-gate');
  assert.deepEqual(codes(result), ['plan-gate', 'malformed-ruling']);
  assert.deepEqual(ledgerLines(fx, 'plan-log'), planLog);
});

test('a writer that rewrites history stops the drive', (t) => {
  const fx = project(t);
  write(fx.root, 'README.md', 'readme\n');
  commitAll(fx.root, 'readme');
  plan(fx, { 'N-01': ['rewrite'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'history-rewritten');
  assert.deepEqual(codes(result), ['history-rewritten']);
});

test('--max-writers bounds the writer attempts of the whole run', (t) => {
  const fx = project(t);
  const budget = drive(fx, ['--max-writers', '1'], 1);
  assert.equal(budget.stop, 'writer-budget');
  assert.deepEqual(codes(budget), ['writer-budget']);
  assert.deepEqual(writerEnv(fx).map((e) => e.node), ['N-01']);

  const stuck = project(t);
  plan(stuck, { 'N-01': Array(12).fill('idle') });
  const ten = drive(stuck, ['--attempts', '20'], 1);
  assert.equal(ten.stop, 'writer-budget');
  assert.equal(writerEnv(stuck).length, 10, 'ten writers by default');
});

test('a requirement that was green and turns red stops the drive (ratchet)', (t) => {
  const fx = project(t);
  plan(fx, { 'N-02': ['regress'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'ratchet-broken');
  assert.deepEqual(codes(result), ['ratchet-broken']);
  assert.match(result.problems[0].message, /REQ-001/u);
});

test('the ratchet covers closed milestones, not only the current one', (t) => {
  const twoMilestones = {
    version: 1,
    milestones: [
      { id: 'M1', title: 'Add', requirements: ['REQ-001'], journey: 'C-1' },
      { id: 'M2', title: 'Remove', requirements: ['REQ-002'], journey: 'C-2' },
    ],
    nodes: [
      { id: 'N-01', milestone: 'M1', title: 'Add', covers: ['REQ-001'], depends: [],
        scope: ['src/'] },
      { id: 'N-02', milestone: 'M2', title: 'Remove', covers: ['REQ-002'], depends: ['N-01'],
        scope: ['src/'] },
    ],
  };
  const fx = project(t, { plan: twoMilestones,
    checks: [check('C-1', ['REQ-001']), check('C-2', ['REQ-002'])] });
  assert.equal(drive(fx).stop, 'milestone-gate');
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: r\n\nVerdict: accept\n');
  commitAll(fx.root, 'review');
  ok(fx, ['milestone', 'close', 'M1', '--owner', 'ok',
    '--review', '.ultra/records/milestones/M1-review.md']);
  commitAll(fx.root, 'close M1');
  assert.equal(status(fx).milestone, 'M2');
  plan(fx, { 'N-02': ['regress'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'ratchet-broken');
  assert.deepEqual(codes(result), ['ratchet-broken']);
  assert.match(result.problems[0].message, /REQ-001/u);
});

test('stale checks are run before a writer, so the ratchet has a baseline', (t) => {
  const fx = project(t);
  plan(fx, { 'N-02': ['idle'] });
  assert.equal(drive(fx, ['--attempts', '1'], 1).stop, 'attempts-exhausted');
  assert.equal(nodeState(fx, 'N-01'), 'done');
  // An unrelated commit makes every check stale; N-02's writer then breaks REQ-001.
  write(fx.root, 'README.md', 'readme\n');
  commitAll(fx.root, 'readme');
  assert.ok(status(fx).checks.every((c) => c.state === 'stale'));
  plan(fx, { 'N-02': ['regress'] });
  const result = drive(fx, [], 1);
  assert.equal(result.stop, 'ratchet-broken');
  assert.deepEqual(codes(result), ['ratchet-broken']);
  assert.match(result.problems[0].message, /REQ-001/u);
  assert.deepEqual(result.steps.map((s) => [s.action, s.subject]),
    [['check', 'stale'], ['writer', 'N-02']]);
});

test('a writer past --timeout-sec is stopped with its process group', (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['sleep'] });
  const started = Date.now();
  const result = drive(fx, ['--timeout-sec', '2', '--attempts', '1'], 1);
  assert.ok(Date.now() - started < 50000, 'the drive did not wait for the sleeping writer');
  assert.equal(result.stop, 'attempts-exhausted');
  const writer = result.steps.find((s) => s.action === 'writer');
  assert.deepEqual([writer.result, writer.exit], ['node-not-done', 'timeout']);
  const pid = Number(fs.readFileSync(path.join(fx.root, '.ultra/.runtime/writer.pid'), 'utf8'));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert.equal(alive, false, 'the writer process was stopped');
});

// The writer runs `ubp check C-1` with a check that hangs: stopping the writer must stop that
// check too, whose process group is not the writer's.
const pidOf = (fx, name) => Number(fs.readFileSync(path.join(fx.root, '.ultra/.runtime', name),
  'utf8'));
async function gone(pid) {
  for (let i = 0; i < 40; i++) {
    try { process.kill(pid, 0); } catch { return true; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
async function waitFor(fx, name) {
  for (let i = 0; i < 600; i++) {
    if (exists(fx, `.ultra/.runtime/${name}`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`${name} never appeared`);
}

test('a timed-out writer leaves no check running', async (t) => {
  const fx = project(t);
  plan(fx, { 'N-01': ['slowcheck'] });
  const result = drive(fx, ['--timeout-sec', '3', '--attempts', '1'], 1);
  assert.equal(result.stop, 'attempts-exhausted');
  assert.equal(result.steps.find((s) => s.action === 'writer').exit, 'timeout');
  assert.ok(await gone(pidOf(fx, 'check.pid')), 'the inner check was stopped');
  assert.ok(await gone(pidOf(fx, 'writer.pid')), 'the writer was stopped');
});

test('an interrupted drive stops its writer and the writer\'s check, then exits 130', async (t) => {
  for (let round = 0; round < 5; round++) {
    const fx = project(t);
    plan(fx, { 'N-02': ['slowcheck'] });
    const child = spawn(process.execPath, [CLI, 'drive', '--writer', WRITER_CMD,
      '--root', fx.root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
    // A failed assertion must not leave the drive running (stopped by its own pid).
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    await waitFor(fx, 'check.pid');
    child.kill('SIGINT');
    const code = await exited;
    assert.equal(code, 130, `round ${round}: ${stdout}${stderr}`);
    assert.doesNotMatch(stderr, /EPERM/u, `round ${round}`);
    // Text mode prints each step as it ends, so N-01's step is already out.
    assert.match(stdout, /^drive: run [0-9a-f-]{36}\n/u, `round ${round}`);
    assert.ok(stdout.includes('drive: writer N-01: done (exit 0)\n'), `round ${round}: ${stdout}`);
    assert.ok(await gone(pidOf(fx, 'check.pid')), `round ${round}: the inner check was stopped`);
    assert.ok(await gone(pidOf(fx, 'writer.pid')), `round ${round}: the writer was stopped`);
  }
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
    ['drive', '--writer', WRITER_CMD, '--timeout-sec', '86401'],
    ['drive', '--writer', WRITER_CMD, '--max-writers', '0'],
    ['drive', '--writer', WRITER_CMD, '--max-writers', '2', '--max-writers', '3'],
    ['check', '--max-writers', '2'],
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
