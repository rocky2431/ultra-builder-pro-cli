'use strict';

// M-P6 acceptance (contract: thinking/v6-workflow-review-20261111/RESULT.md, A1–A5; spec:
// REQ-P6-knowledge, REQ-P6-status, REQ-P6-close). The brief carries what the project knows,
// `.ultra/design.md` never stales evidence, the status line tells "to recheck" apart from
// "not green", a milestone closes only on its own review, and `drive --json` reports each
// event on stderr. Black-box: every observation goes through the CLI against a throwaway Git
// fixture.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'engine', 'cli.cjs');
const NODE = JSON.stringify(process.execPath);
const OWNER = '看过演示，放行。';

const DIRECTION = 'North star: one person keeps a short list of items on their own machine.';
const INTERFACE = '`node src/app.cjs` starts the app and prints `ready` when it listens.';

const SPEC = `# Spec

## Direction
${DIRECTION}

## Interface
${INTERFACE}

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.
`;

const DESIGN = `# Design

## System
Plain Node.js, no dependencies. The list lives in memory in \`src/app.cjs\`.

## Decisions
- Items are kept in insertion order (ruling 2026-11-12).
`;

// A check passes unless `.ultra/.runtime/fail-<id>` exists. The runtime directory is ignored
// and engine-owned, so toggling a failure never dirties the tree or changes the code.
const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('.ultra/.runtime/fail-' + id)) {
  console.log('AssertionError: ' + id + ' toggled off');
  process.exit(1);
}
console.log('pass 1');
`;

// A drive writer with nothing to build: the checks already pass, so it runs them and marks
// its node done through the engine the drive hands it.
const WRITER = `const { execSync } = require('node:child_process');
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
sh('eval "$UBP check"');
sh('eval "$UBP node done ' + process.env.UBP_NODE + '"');
`;

const check = (id, covers) => ({ id, covers, run: `${NODE} checks/pass.cjs ${id}`,
  expect: 'pass [1-9]' });

const CHECKS = [check('C-1', ['REQ-001']), check('C-2', ['REQ-002'])];

const PLAN = {
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
}

function run(fx, args) {
  return spawnSync(process.execPath, [CLI, ...args, '--root', fx.root], {
    encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL',
  });
}

function ok(fx, args, expectedExit = 0) {
  const result = run(fx, args);
  assert.equal(result.status, expectedExit,
    `${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

const json = (fx, args, expectedExit = 0) =>
  JSON.parse(ok(fx, [...args, '--json'], expectedExit).stdout);
const status = (fx) => json(fx, ['status']);
const codes = (result) => result.problems.map((p) => p.code);
const checkStates = (state) => Object.fromEntries(state.checks.map((c) => [c.id, c.state]));

// A committed project whose plan baseline is recorded.
function project(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p6-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'UBP Test']);
  git(root, ['config', 'user.email', 'ubp@example.invalid']);
  const base = {
    '.gitignore': '.ultra/.runtime/\n',
    'src/app.cjs': 'module.exports = { items: [] };\n',
    'checks/pass.cjs': PASS_SCRIPT,
    'tools/writer.cjs': WRITER,
    '.ultra/spec.md': SPEC,
    '.ultra/checks.json': `${JSON.stringify({ version: 1, checks: CHECKS }, null, 2)}\n`,
    '.ultra/plan.json': `${JSON.stringify(PLAN, null, 2)}\n`,
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

function review(fx, milestone, name = `${milestone}-review.md`) {
  const file = `.ultra/records/milestones/${name}`;
  write(fx.root, file, `Reviewer: a reviewer who wrote none of ${milestone}\n\nVerdict: accept\n`);
  return file;
}

const close = (fx, milestone, reviewPath, expectedExit = 0) => json(fx,
  ['milestone', 'close', milestone, '--owner', OWNER, '--review', reviewPath], expectedExit);

function closeM1(fx) {
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  assert.equal(close(fx, 'M1', review(fx, 'M1')).ok, true);
}

function section(brief, heading, next) {
  const start = brief.indexOf(`\n${heading}\n`);
  const end = brief.indexOf(`\n${next}\n`);
  assert.ok(start > 0 && end > start, `${heading} before ${next} in:\n${brief}`);
  return brief.slice(start, end);
}

// ---------------------------------------------------------------------------------------
// REQ-P6-knowledge

test('the brief carries the Direction, the Interface and .ultra/design.md before the requirements',
  (t) => {
    const fx = project(t, { '.ultra/design.md': DESIGN });
    const brief = ok(fx, ['context', 'N-01']).stdout;
    assert.match(brief, /^# Node N-01: Add\n\nMilestone M1: Add · node state ready\n\n## Project\n\n/u);
    const known = section(brief, '## Project', '## Requirements');
    for (const line of [DIRECTION, INTERFACE, '### .ultra/design.md',
      'Plain Node.js, no dependencies. The list lives in memory in `src/app.cjs`.',
      '- Items are kept in insertion order (ruling 2026-11-12).']) {
      assert.ok(known.includes(`\n${line}\n`), `${line} in:\n${known}`);
    }
    assert.ok(known.indexOf(INTERFACE) < known.indexOf('### .ultra/design.md'), known);
    // Requirement blocks stay out of the shared text: N-01 sees only its own requirement.
    assert.ok(!brief.includes('REQ-002'), brief);
    assert.ok(brief.includes('## REQ-001 Add an item\nThe user adds an item and sees it in the list.'));
    const rules = brief.slice(brief.indexOf('\n## Rules\n'));
    assert.match(rules.split('\n').find((line) => line.startsWith('- Do not edit')),
      /\.ultra\/design\.md/u);
  });

test('without a design file the brief says so, and the same files give the same bytes', (t) => {
  const fx = project(t);
  const first = ok(fx, ['context', 'N-01']).stdout;
  const known = section(first, '## Project', '## Requirements');
  assert.ok(known.endsWith('\n### .ultra/design.md\n\nNo design written.\n'), known);
  assert.equal(ok(fx, ['context', 'N-01']).stdout, first);
  write(fx.root, '.ultra/design.md', '\r\n\n# Design\r\nOne line.   \r\n\n');
  const known2 = section(ok(fx, ['context', 'N-01']).stdout, '## Project', '## Requirements');
  assert.ok(known2.endsWith('\n### .ultra/design.md\n\n# Design\nOne line.\n'), known2);
});

test('writing or committing .ultra/design.md never dirties the tree or stales a check', (t) => {
  const fx = project(t);
  ok(fx, ['check']);
  const before = checkStates(status(fx));
  assert.deepEqual(before, { 'C-1': 'green', 'C-2': 'green' });
  write(fx.root, '.ultra/design.md', DESIGN);
  let state = status(fx);
  assert.equal(state.dirty, false, state.line);
  assert.deepEqual(checkStates(state), before);
  commitAll(fx.root, 'design');
  state = status(fx);
  assert.equal(state.dirty, false, state.line);
  assert.deepEqual(checkStates(state), before, state.line);
  // A note outside .ultra/ is code, as before: it stales every check.
  write(fx.root, 'notes.md', 'A note.\n');
  commitAll(fx.root, 'note');
  assert.deepEqual(checkStates(status(fx)), { 'C-1': 'stale', 'C-2': 'stale' });
});

test('a design too large for the brief is named in the refusal', (t) => {
  const fx = project(t, { '.ultra/design.md': `# Design\n\n${'A long note. '.repeat(3000)}\n` });
  const result = json(fx, ['context', 'N-01'], 1);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['brief-over-budget']);
  assert.match(result.problems[0].hint, /\.ultra\/design\.md/u);
});

// ---------------------------------------------------------------------------------------
// REQ-P6-status

test('a closed milestone stale only from a commit reads 待复核; one that failed reads 未绿', (t) => {
  const fx = project(t);
  closeM1(fx);
  let state = status(fx);
  assert.equal(state.closed_not_green, 0);
  assert.equal(state.closed_recheck, 0);

  write(fx.root, 'notes.md', 'A note.\n');
  commitAll(fx.root, 'note');
  state = status(fx);
  assert.equal(state.closed_recheck, 1, state.line);
  assert.equal(state.closed_not_green, 0, state.line);
  assert.match(state.line, / · 已关闭里程碑 1 项待复核(?: · |$)/u);
  assert.doesNotMatch(state.line, /未绿/u);

  // The rerun fails, then another commit: the latest run failed, so it is not green.
  write(fx.root, '.ultra/.runtime/fail-C-1', '');
  ok(fx, ['check'], 1);
  write(fx.root, 'notes.md', 'Another note.\n');
  commitAll(fx.root, 'note 2');
  state = status(fx);
  assert.equal(state.closed_not_green, 1, state.line);
  assert.equal(state.closed_recheck, 0, state.line);
  assert.match(state.line, / · 已关闭里程碑 1 项未绿(?: · |$)/u);
  assert.doesNotMatch(state.line, /待复核/u);
});

test('drive --json reports every event on stderr and keeps stdout for the result', (t) => {
  const fx = project(t);
  const result = ok(fx, ['drive', '--writer', `${NODE} tools/writer.cjs`, '--json']);
  const outcome = JSON.parse(result.stdout);
  assert.equal(outcome.stop, 'milestone-gate', result.stderr);
  const lines = result.stderr.split('\n');
  for (const line of [`drive: run ${outcome.run}`, 'drive: writer N-01: done (exit 0)',
    'drive: check all: pass', 'drive: stop milestone-gate']) {
    assert.ok(lines.includes(line), `${line} in:\n${result.stderr}`);
  }
  assert.ok(lines.indexOf('drive: writer N-01: done (exit 0)')
    < lines.indexOf('drive: stop milestone-gate'), result.stderr);
});

// ---------------------------------------------------------------------------------------
// REQ-P6-close

test('a milestone closes only on its own review', (t) => {
  const fx = project(t);
  closeM1(fx);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-02']);
  const milestones = path.join(fx.root, '.ultra', 'ledger', 'milestones.jsonl');
  const closures = () => fs.readFileSync(milestones, 'utf8').trim().split('\n').length;
  assert.equal(closures(), 1);

  for (const other of ['.ultra/records/milestones/M1-review.md', review(fx, 'M2', 'M2-notes.md'),
    review(fx, 'M2', 'M2-review-1.md')]) {
    const refused = close(fx, 'M2', other, 1);
    assert.equal(refused.ok, false);
    assert.deepEqual(codes(refused), ['review-not-for-milestone'], other);
    assert.match(refused.problems[0].hint, /M2-review\.md/u);
  }
  // A missing review is still only missing.
  assert.deepEqual(codes(close(fx, 'M2', '.ultra/records/milestones/M2-review.md', 1)),
    ['review-missing']);
  assert.equal(closures(), 1);

  assert.equal(close(fx, 'M2', `./${review(fx, 'M2')}`).ok, true);
  assert.equal(closures(), 2);
});
