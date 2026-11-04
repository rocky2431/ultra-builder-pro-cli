'use strict';

// P2 acceptance for the v6 engine (RESULT.md §5 P2, contract in engine/FORMATS.md): the
// milestone gate, the node brief, `.ultra/records/`, and the P1 carry-overs N1 and N2.
// Black-box: every observation goes through the CLI against a throwaway Git fixture.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'engine', 'cli.cjs');
const UBP = path.join(ROOT, 'bin', 'install.js');
const NODE = JSON.stringify(process.execPath);
const EXPECT = 'pass [1-9]';
const OWNER = '看过演示和旅程结果。\n放行。';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const SPEC = `# Spec

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.

## REQ-003 Share the list
The user shares a read-only link to the list.
`;

// A check passes unless `.ultra/.runtime/fail-<id>` exists. The runtime directory is
// ignored and engine-owned, so toggling a failure never dirties the tree.
const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('.ultra/.runtime/fail-' + id)) {
  console.log('AssertionError: ' + id + ' toggled off');
  process.exit(1);
}
console.log('pass 1');
`;

function check(id, covers) {
  return { id, covers, run: `${NODE} checks/pass.cjs ${id}`, expect: EXPECT };
}

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
    { id: 'N-01', milestone: 'M1', title: 'Add', covers: ['REQ-001'], depends: [],
      scope: ['src/items/', 'test/items.test.cjs'] },
    { id: 'N-02', milestone: 'M1', title: 'Remove', covers: ['REQ-002'], depends: ['N-01'] },
    { id: 'N-03', milestone: 'M2', title: 'Share', covers: ['REQ-003'], depends: ['N-02'] },
  ],
};

const EMPTY_DIFF = {
  added: [], removed: [], modified: [], nodes_added: [], nodes_removed: [],
  checks_added: [], checks_removed: [], checks_modified: [],
};

const checksFile = (checks) => `${JSON.stringify({ version: 1, checks }, null, 2)}\n`;
const planFile = (plan) => `${JSON.stringify(plan, null, 2)}\n`;

function withJourney(milestone, journey) {
  return {
    ...PLAN,
    milestones: PLAN.milestones.map((m) => (m.id === milestone ? { ...m, journey } : m)),
  };
}

function withDepends(node, depends) {
  return { ...PLAN, nodes: PLAN.nodes.map((n) => (n.id === node ? { ...n, depends } : n)) };
}

function git(root, args) {
  const result = spawnSync('git', [
    '-c', 'user.name=UBP Test', '-c', 'user.email=ubp@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function mkfifo(file) {
  const result = spawnSync('mkfifo', [file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `mkfifo ${file}: ${result.stderr}`);
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
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

function run(fx, args, entry = CLI) {
  return spawnSync(process.execPath, [entry, ...args, '--root', fx.root], {
    encoding: 'utf8',
    timeout: 60000,
    // An engine stuck in synchronous code cannot handle SIGTERM.
    killSignal: 'SIGKILL',
  });
}

// Starts the CLI without waiting; `done` resolves with its exit and output.
function start(fx, args) {
  const child = spawn(process.execPath, [CLI, ...args, '--root', fx.root], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output.stdout += chunk; });
  child.stderr.on('data', (chunk) => { output.stderr += chunk; });
  return {
    done: new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal, ...output }));
    }),
  };
}

function ok(fx, args, expectedExit = 0, entry = CLI) {
  const result = run(fx, args, entry);
  assert.equal(result.status, expectedExit,
    `${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  return result;
}

function json(fx, args, expectedExit = 0) {
  return JSON.parse(ok(fx, [...args, '--json'], expectedExit).stdout);
}

const status = (fx) => json(fx, ['status']);
const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const ledgerFile = (fx, name) => path.join(fx.root, '.ultra', 'ledger', name);

function ledger(fx, name) {
  const file = ledgerFile(fx, name);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function ledgerBytes(fx) {
  return ['evidence', 'plan-log', 'nodes', 'milestones'].map((name) => {
    const file = ledgerFile(fx, `${name}.jsonl`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  });
}

// Makes check `id` fail on its next run.
function breakCheck(fx, id) {
  write(fx.root, `.ultra/.runtime/fail-${id}`, '');
}

// Gate, run every check, and complete N-01 and N-02: M1 fully green and done.
function completeM1(fx) {
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
}

// Writes a milestone review under the engine-owned records and returns its path.
function review(fx, milestone, verdict = 'Verdict: accept\n') {
  const file = `.ultra/records/milestones/${milestone}-review.md`;
  write(fx.root, file,
    `# ${milestone} review\n\nWhole-branch review by a reviewer who wrote none of it.\n\n${verdict}`);
  return file;
}

function close(fx, milestone, reviewPath, expectedExit = 0, extra = []) {
  return json(fx, ['milestone', 'close', milestone, '--owner', OWNER, '--review', reviewPath,
    ...extra], expectedExit);
}

function refused(result, codes) {
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems.map((p) => p.code), codes, JSON.stringify(result.problems));
  for (const p of result.problems) {
    assert.deepEqual(Object.keys(p).sort(), ['code', 'hint', 'message']);
    assert.ok(typeof p.message === 'string' && p.message.trim(), JSON.stringify(p));
    assert.ok(typeof p.hint === 'string' && p.hint.trim(), JSON.stringify(p));
  }
}

const RULES = (id, checkIds) => [
  '- Do not edit .ultra/spec.md, .ultra/checks.json, .ultra/plan.json, .ultra/ledger/ or the files the checks above run. If a check or a requirement looks wrong, stop and escalate.',
  '- Change only files inside the scope, and commit your work: evidence from an uncommitted tree never counts.',
  `- Run \`ubp check ${checkIds.join(' ') || '--stale'}\` until every check above is green, then \`ubp check\` (every stale check: invariants and finished requirements must stay green), then \`ubp node done ${id}\`.`,
  '- Escalate instead of deciding: a change of direction (L0) and any deletion or narrowing of a requirement go to the Owner.',
  '- Record every other decision you made without asking as one line in .ultra/rulings.md: `- YYYY-MM-DD Lx 裁决：<决定> — 因为 <理由> — 如果判断错了，代价是 <代价>`.',
  `- Before \`ubp node done ${id}\`, write .ultra/records/handoffs/${id}.md: the interfaces you created, what dependent nodes must know, and what is left unfinished.`,
  '- If three attempts leave a check red, stop and report the check, its error line and what you tried.',
].join('\n');

// The brief the contract defines, built independently of the engine.
function brief({ id, title, milestone, state, requirements, checks, scope, handoffs }) {
  return [
    `# Node ${id}: ${title}`, '',
    `Milestone ${milestone} · node state ${state}`, '',
    '## Requirements', '',
    requirements.join('\n\n'), '',
    '## Checks that must turn green (read-only)', '',
    ...(checks.length ? checks.map(([checkId, checkState]) => {
      const { run: command } = CHECKS.find((c) => c.id === checkId);
      return `- ${checkId} · ${checkState} · \`${command}\``;
    }) : ['None.']), '',
    '## Scope', '',
    ...(scope?.length ? scope.map((prefix) => `- ${prefix}`)
      : ['Not declared: change only what the requirements need.']), '',
    '## Handoffs from dependencies', '',
    handoffs.length ? handoffs.map(([dep, text]) => `### ${dep}\n\n${text}`).join('\n\n') : 'None.',
    '',
    '## Rules', '',
    RULES(id, checks.map(([checkId]) => checkId)), '',
  ].join('\n');
}

const REQ_001 = '## REQ-001 Add an item\nThe user adds an item and sees it in the list.';
const REQ_002 = '## REQ-002 Remove an item\nThe user removes an item and it disappears from the list.';
const omittedLine = (dep) => `Omitted to fit the budget: read .ultra/records/handoffs/${dep}.md`;

// ---------------------------------------------------------------------------------------
// Milestone gate

test('milestone close records the closure with its evidence and the Owner\'s words (P2 exit)', (t) => {
  const fx = project(t);
  completeM1(fx);
  const file = review(fx, 'M1');
  const before = status(fx);
  assert.equal(before.line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');

  assert.deepEqual(close(fx, 'M1', file), { ok: true, milestone: 'M1', problems: [] });
  const closures = ledger(fx, 'milestones.jsonl');
  assert.equal(closures.length, 1);
  const [record] = closures;
  assert.deepEqual(Object.keys(record).sort(),
    ['at', 'code', 'journey', 'milestone', 'owner', 'reqs', 'review', 'v']);
  assert.equal(record.v, 1);
  assert.equal(record.milestone, 'M1');
  assert.equal(record.code, ledger(fx, 'evidence.jsonl').at(-1).code);
  const nodes = ledger(fx, 'nodes.jsonl');
  assert.deepEqual(Object.keys(record.reqs).sort(), ['REQ-001', 'REQ-002']);
  assert.deepEqual(record.reqs, { ...nodes[0].reqs, ...nodes[1].reqs });
  assert.deepEqual(record.journey, { check: 'C-12', run: byId(before.checks)['C-12'].last_run });
  assert.deepEqual(record.review,
    { path: file, sha256: sha256(fs.readFileSync(path.join(fx.root, file))) });
  assert.deepEqual(record.owner, { words: OWNER, proxy: false });
  assert.ok(record.at > nodes.at(-1).at);

  const after = status(fx);
  assert.equal(after.milestone, 'M2');
  assert.equal(after.dirty, false);
  assert.equal(after.line, 'M2 · 1/1 绿 · 下一项 N-03 · 本里程碑计划变更 0 次');
});

test('milestone close in text mode, with proxy words and a normalized review path', (t) => {
  const fx = project(t);
  completeM1(fx);
  review(fx, 'M1');
  const result = ok(fx, ['milestone', 'close', 'M1',
    '--review', './.ultra/records/milestones/../milestones/M1-review.md',
    '--proxy', '--owner', '助手代答：放行']);
  assert.equal(result.stdout, 'milestone M1: pass\n');
  const [record] = ledger(fx, 'milestones.jsonl');
  assert.deepEqual(record.owner, { words: '助手代答：放行', proxy: true });
  assert.equal(record.review.path, '.ultra/records/milestones/M1-review.md');
});

test('a review line may carry trailing whitespace and CRLF', (t) => {
  const fx = project(t);
  completeM1(fx);
  assert.equal(close(fx, 'M1', review(fx, 'M1', 'Notes.\r\nVerdict: accept  \r\n')).ok, true);
});

test('only a verdict outside fences counts, after an optional byte order mark', async (t) => {
  const fence = (body) => `Template for the last line:\n\n\`\`\`text\n${body}\n\`\`\`\n`;

  await t.test('a verdict quoted in a fence is not a verdict', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    for (const verdict of [
      `Not finished yet. ${fence('Verdict: accept')}`,
      `Unclosed example:\n\n~~~\nVerdict: accept\n`,
    ]) {
      refused(close(fx, 'M1', review(fx, 'M1', verdict), 1), ['review-not-accepted']);
    }
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('a fenced example does not count against the real verdict', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    assert.equal(close(fx, 'M1', review(fx, 'M1',
      `${fence('Verdict: revise')}\nVerdict: accept\n`)).ok, true);
  });

  await t.test('a review that starts with a UTF-8 byte order mark', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    const file = '.ultra/records/milestones/M1-review.md';
    write(fx.root, file, '\uFEFFVerdict: accept\n\nNo findings.\n');
    assert.equal(close(fx, 'M1', file).ok, true);
    const [record] = ledger(fx, 'milestones.jsonl');
    assert.equal(record.review.sha256, sha256(fs.readFileSync(path.join(fx.root, file))),
      'the hash covers the bytes as written, mark included');
  });
});

test('closing the last milestone shows 全部完成; a closed milestone cannot close again', (t) => {
  const fx = project(t);
  completeM1(fx);
  close(fx, 'M1', review(fx, 'M1'));
  ok(fx, ['node', 'done', 'N-03']);
  close(fx, 'M2', review(fx, 'M2'));
  const state = status(fx);
  assert.equal(state.milestone, 'M2');
  assert.equal(state.next, '全部完成');
  assert.equal(state.line, 'M2 · 1/1 绿 · 下一项 全部完成 · 本里程碑计划变更 0 次');

  refused(close(fx, 'M2', review(fx, 'M2'), 1), ['not-current']);
  refused(close(fx, 'M1', review(fx, 'M1'), 1), ['not-current']);
  assert.equal(ledger(fx, 'milestones.jsonl').length, 2);

  // A regression after everything closed is work again, not 全部完成.
  breakCheck(fx, 'C-3');
  ok(fx, ['check', 'C-3'], 1);
  assert.equal(status(fx).line, 'M2 · 0/1 绿 · 1 红 · 下一项 检查 · 本里程碑计划变更 0 次');
});

test('milestone close refuses, naming each problem, and records nothing', async (t) => {
  await t.test('dirty-tree', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    const file = review(fx, 'M1');
    write(fx.root, 'src/app.cjs', 'module.exports = { items: [1] };\n');
    refused(close(fx, 'M1', file, 1), ['dirty-tree']);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('plan-gate', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    const file = review(fx, 'M1');
    // Editing M2's check changes only M2's snapshot; the gate must be rerun first.
    write(fx.root, '.ultra/checks.json',
      checksFile(CHECKS.map((c) => (c.id === 'C-3' ? { ...c, timeout_sec: 30 } : c))));
    assert.equal(status(fx).gate, 'stale');
    refused(close(fx, 'M1', file, 1), ['plan-gate']);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('not-current', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    ok(fx, ['node', 'done', 'N-03']);
    refused(close(fx, 'M2', review(fx, 'M2'), 1), ['not-current']);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('node-not-done', (tt) => {
    const fx = project(tt);
    ok(fx, ['gate']);
    ok(fx, ['check']);
    ok(fx, ['node', 'done', 'N-01']);
    const result = close(fx, 'M1', review(fx, 'M1'), 1);
    refused(result, ['node-not-done']);
    assert.match(result.problems[0].message, /N-02/);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('requirement-not-green', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    breakCheck(fx, 'C-2');
    ok(fx, ['check', 'C-2'], 1);
    const result = close(fx, 'M1', review(fx, 'M1'), 1);
    refused(result, ['requirement-not-green']);
    assert.match(result.problems[0].message, /REQ-002/);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('a regression in a closed milestone blocks the next closure (ratchet)', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    close(fx, 'M1', review(fx, 'M1'));
    ok(fx, ['node', 'done', 'N-03']);
    breakCheck(fx, 'C-1');
    ok(fx, ['check', 'C-1'], 1);
    const result = close(fx, 'M2', review(fx, 'M2'), 1);
    refused(result, ['requirement-not-green']);
    assert.match(result.problems[0].message, /REQ-001/);
    assert.equal(ledger(fx, 'milestones.jsonl').length, 1);
  });

  await t.test('no-journey', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': planFile(withJourney('M1', undefined)) });
    completeM1(fx);
    refused(close(fx, 'M1', review(fx, 'M1'), 1), ['no-journey']);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('review-missing', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    const file = review(fx, 'M1');
    const link = '.ultra/records/milestones/link.md';
    fs.symlinkSync(path.join(fx.root, file), path.join(fx.root, link));
    // A parent directory that resolves outside the root, holding an accepting review.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p2-outside-'));
    tt.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.writeFileSync(path.join(outside, 'M1-review.md'), 'Verdict: accept\n');
    fs.symlinkSync(outside, path.join(fx.root, '.ultra', 'records', 'elsewhere'));
    // A FIFO must be refused at once, not waited on while the lock is held.
    const fifo = '.ultra/records/milestones/fifo.md';
    mkfifo(path.join(fx.root, fifo));
    for (const missing of [
      '.ultra/records/milestones/none.md', '.ultra/records/milestones', link,
      '.ultra/records/elsewhere/M1-review.md', '.ultra/records/no-such-dir/M1-review.md', fifo,
    ]) {
      refused(close(fx, 'M1', missing, 1), ['review-missing']);
    }
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('journey-not-green', (tt) => {
    // The journey also covers a requirement of M2. Editing that requirement makes the
    // journey stale while its pair for REQ-001 stays green.
    const checks = [...CHECKS, check('C-13', ['REQ-001', 'REQ-003'])];
    const fx = project(tt, {
      '.ultra/checks.json': checksFile(checks),
      '.ultra/plan.json': planFile(withJourney('M1', 'C-13')),
    });
    completeM1(fx);
    const file = review(fx, 'M1');
    write(fx.root, '.ultra/spec.md',
      SPEC.replace('read-only link to the list.', 'read-only link to the list, for a week.'));
    commitAll(fx.root, 'edit REQ-003');
    ok(fx, ['gate']);
    assert.equal(byId(status(fx).checks)['C-13'].state, 'stale');
    const result = close(fx, 'M1', file, 1);
    refused(result, ['journey-not-green']);
    assert.match(result.problems[0].message, /C-13/);
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
    ok(fx, ['check', 'C-13']);
    assert.equal(close(fx, 'M1', file).ok, true);
  });

  await t.test('review-not-accepted', (tt) => {
    const fx = project(tt);
    completeM1(fx);
    for (const verdict of [
      'Verdict: reject\n',
      'Looks fine to me.\n',
      'Verdict: accept\nVerdict: reject\n',
      'Verdict: accept\nVerdict: accept\n',
      'Verdict: accepted\n',
      '  Verdict: accept\n',
    ]) {
      refused(close(fx, 'M1', review(fx, 'M1', verdict), 1), ['review-not-accepted']);
    }
    assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
  });

  await t.test('problems are reported together, in contract order', (tt) => {
    const fx = project(tt);
    ok(fx, ['gate']);
    ok(fx, ['check']);
    ok(fx, ['node', 'done', 'N-01']);
    write(fx.root, 'src/app.cjs', 'module.exports = { items: [1] };\n');
    refused(close(fx, 'M1', '.ultra/records/milestones/none.md', 1),
      ['dirty-tree', 'node-not-done', 'review-missing']);
  });
});

test('text mode prints the refusal and each problem with its hint', (t) => {
  const fx = project(t);
  completeM1(fx);
  const result = ok(fx, ['milestone', 'close', 'M1', '--owner', '放行',
    '--review', review(fx, 'M1', 'Verdict: reject\n')], 1);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'milestone M1: fail');
  assert.equal(lines.length, 2, result.stdout);
  assert.match(lines[1], /^review-not-accepted: .+ — .+$/u);
});

test('two concurrent closes record the milestone once', async (t) => {
  const fx = project(t);
  completeM1(fx);
  const file = review(fx, 'M1');
  const args = ['milestone', 'close', 'M1', '--owner', '放行', '--review', file, '--json'];
  const results = await Promise.all([start(fx, args).done, start(fx, args).done]);
  assert.deepEqual(results.map((r) => r.code).sort(), [0, 1], JSON.stringify(results));
  refused(JSON.parse(results.find((r) => r.code === 1).stdout), ['not-current']);
  assert.equal(ledger(fx, 'milestones.jsonl').length, 1);
  assert.equal(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'engine.lock')), false);
});

test('milestone close usage errors exit 2 and record nothing', (t) => {
  const fx = project(t);
  completeM1(fx);
  const file = review(fx, 'M1');
  const owner = ['--owner', '放行'];
  const cases = [
    ['no --owner', ['milestone', 'close', 'M1', '--review', file]],
    ['a blank --owner', ['milestone', 'close', 'M1', '--owner', '  \n ', '--review', file]],
    ['no --review', ['milestone', 'close', 'M1', ...owner]],
    ['an absolute --review', ['milestone', 'close', 'M1', ...owner,
      '--review', path.join(fx.root, file)]],
    ['a --review outside the root', ['milestone', 'close', 'M1', ...owner,
      '--review', '../outside.md']],
    ['a --review naming the root', ['milestone', 'close', 'M1', ...owner, '--review', '.']],
    ['two --owner', ['milestone', 'close', 'M1', ...owner, '--owner', '放行', '--review', file]],
    ['two --review', ['milestone', 'close', 'M1', ...owner, '--review', file, '--review', file]],
    ['an unknown milestone', ['milestone', 'close', 'M9', ...owner, '--review', file]],
    ['no milestone id', ['milestone', 'close', ...owner, '--review', file]],
    ['two milestone ids', ['milestone', 'close', 'M1', 'M2', ...owner, '--review', file]],
    ['another subcommand', ['milestone', 'open', 'M1', ...owner, '--review', file]],
    ['--budget on milestone close', ['milestone', 'close', 'M1', ...owner, '--review', file,
      '--budget', '100']],
    ['--stale on milestone close', ['milestone', 'close', 'M1', ...owner, '--review', file,
      '--stale']],
    ['--owner on status', ['status', ...owner]],
    ['--proxy on node done', ['node', 'done', 'N-01', '--proxy']],
    ['--review on gate', ['gate', '--review', file]],
    ['--budget on check', ['check', '--budget', '5']],
  ];
  for (const [name, args] of cases) {
    const result = run(fx, args);
    assert.equal(result.status, 2, `${name}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.ok(result.stderr.trim(), name);
  }
  assert.deepEqual(ledger(fx, 'milestones.jsonl'), []);
});

test('the plan gate checks each milestone journey', async (t) => {
  await t.test('unknown-journey', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': planFile(withJourney('M1', 'C-404')) });
    const result = json(fx, ['gate'], 1);
    assert.deepEqual(result.problems.map((p) => p.code), ['unknown-journey']);
    assert.match(result.problems[0].message, /C-404/);
  });

  await t.test('journey-outside-milestone', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': planFile(withJourney('M1', 'C-3')) });
    const result = json(fx, ['gate'], 1);
    assert.deepEqual(result.problems.map((p) => p.code), ['journey-outside-milestone']);
    assert.match(result.problems[0].message, /C-3/);
  });

  await t.test('a journey that is not a string makes the plan malformed', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': planFile(withJourney('M1', 7)) });
    const result = run(fx, ['status']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan\.json/);
  });

  await t.test('a journey is not part of the snapshot', (tt) => {
    const fx = project(tt);
    ok(fx, ['gate']);
    write(fx.root, '.ultra/plan.json', planFile(withJourney('M1', 'C-1')));
    assert.equal(status(fx).gate, 'pass');
  });
});

test('closure records: a bare record stays valid, a wrongly typed field is malformed', async (t) => {
  const bare = { v: 1, milestone: 'M1', at: '2026-10-31T00:00:00.000Z' };
  await t.test('bare record', (tt) => {
    const fx = project(tt);
    write(fx.root, '.ultra/ledger/milestones.jsonl', `${JSON.stringify(bare)}\n`);
    assert.equal(status(fx).milestone, 'M2');
  });
  const hash = 'a'.repeat(64);
  for (const [name, fields] of [
    ['owner as a string', { owner: 'yes' }],
    ['proxy as a string', { owner: { words: 'ok', proxy: 'no' } }],
    ['owner words missing', { owner: { proxy: false } }],
    ['review hash not hex', { review: { path: 'r.md', sha256: 'abc' } }],
    ['journey run as a number', { journey: { check: 'C-12', run: 7 } }],
    ['requirement hash too short', { reqs: { 'REQ-001': 'short' } }],
    ['code not a hash', { code: 'zz', reqs: { 'REQ-001': hash } }],
  ]) {
    await t.test(name, (tt) => {
      const fx = project(tt);
      write(fx.root, '.ultra/ledger/milestones.jsonl', `${JSON.stringify({ ...bare, ...fields })}\n`);
      const result = run(fx, ['status']);
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, /milestones\.jsonl:1:/);
    });
  }
});

// ---------------------------------------------------------------------------------------
// N1: one time floor across the four ledgers

test('record times never go backwards across ledgers (N1)', (t) => {
  const fx = project(t);
  completeM1(fx);
  const baseline = ledger(fx, 'plan-log.jsonl').find((r) => r.milestone === 'M1');
  // A plan change recorded by a machine whose clock ran far ahead; same snapshot.
  const ahead = { ...baseline, type: 'change', at: '2100-01-01T00:00:00.000Z', diff: EMPTY_DIFF };
  fs.appendFileSync(ledgerFile(fx, 'plan-log.jsonl'), `${JSON.stringify(ahead)}\n`);
  let state = status(fx);
  assert.equal(state.gate, 'pass');
  assert.equal(state.plan_changes, 1);

  close(fx, 'M1', review(fx, 'M1'));
  assert.equal(ledger(fx, 'milestones.jsonl')[0].at, '2100-01-01T00:00:00.001Z');
  // The change came before the closure, so the new milestone starts at zero.
  state = status(fx);
  assert.equal(state.line, 'M2 · 1/1 绿 · 下一项 N-03 · 本里程碑计划变更 0 次');

  ok(fx, ['check', 'C-3']);
  assert.equal(ledger(fx, 'evidence.jsonl').at(-1).at, '2100-01-01T00:00:00.002Z');
  ok(fx, ['node', 'done', 'N-03']);
  assert.equal(ledger(fx, 'nodes.jsonl').at(-1).at, '2100-01-01T00:00:00.003Z');
});

test('an append that would write an invalid record writes nothing and exits 2', (t) => {
  const fx = project(t);
  // A closure at the format's last millisecond: the next time floor is past year 9999.
  write(fx.root, '.ultra/ledger/milestones.jsonl',
    `${JSON.stringify({ v: 1, milestone: 'M1', at: '9999-12-31T23:59:59.999Z' })}\n`);
  const result = run(fx, ['check', 'C-1']);
  assert.equal(result.status, 2, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.ok(result.stderr.trim());
  assert.deepEqual(ledger(fx, 'evidence.jsonl'), []);
  ok(fx, ['status'], 0);
});

test('a wall clock that steps back during a check run still records the run', (t) => {
  const fx = project(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p2-clock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preload = path.join(dir, 'clock-back.cjs');
  // Every call to Date.now() returns a time one second earlier than the call before.
  fs.writeFileSync(preload,
    'const real = Date.now;\nlet calls = 0;\nDate.now = () => real() - 1000 * calls++;\n');
  const options = `${process.env.NODE_OPTIONS ?? ''} --require "${preload}"`.trim();
  const result = spawnSync(process.execPath, [CLI, 'check', 'C-1', '--root', fx.root], {
    encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL',
    env: { ...process.env, NODE_OPTIONS: options },
  });
  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const records = ledger(fx, 'evidence.jsonl');
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, 'pass');
  assert.ok(Number.isInteger(records[0].duration_ms) && records[0].duration_ms >= 0,
    String(records[0].duration_ms));
});

// ---------------------------------------------------------------------------------------
// N2: near-miss requirement headings in any letter case

test('near-miss requirement headings in any letter case are malformed (N2)', async (t) => {
  for (const heading of ['## Req-7 Lower case', '## REQ 8 Space before the number',
    '## req_9 Underscore', '### req-10 Nested', '## REQ\t11 Tab']) {
    await t.test(heading, (tt) => {
      const fx = project(tt, { '.ultra/spec.md': `${SPEC}\n${heading}\nShould have been counted.\n` });
      const result = run(fx, ['status']);
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, /spec\.md:12:/);
    });
  }
});

test('headings that only start like a requirement are ordinary sections (N2)', (t) => {
  const fx = project(t, {
    '.ultra/spec.md': `${SPEC}\n## Requirements map\nNotes.\n\n## Req mapping\nMore.\n\n## REQUEST log\nLog.\n`,
  });
  assert.deepEqual(status(fx).requirements.map((r) => r.id), ['REQ-001', 'REQ-002', 'REQ-003']);
});

// ---------------------------------------------------------------------------------------
// Rulings: spaces after 裁决：, 因为 and 代价是 are optional

test('rulings may omit the spaces after 裁决：, 因为 and 代价是', (t) => {
  const tight = '- 2026-10-31 L1 裁决：拆分REQ-002 — 因为两种删除路径验收不同 — 如果判断错了，代价是多维护一条检查\n';
  const spaced = '- 2026-10-31 L2 裁决： 合并门推迟 — 因为 只有一个写者 — 如果判断错了，代价是 补一个门\n';
  const fx = project(t, { '.ultra/rulings.md': `# Rulings\n\n${tight}${spaced}` });
  assert.equal(json(fx, ['gate']).ok, true);
});

test('rulings tolerate separator spacing, dash variants and keyword punctuation', (t) => {
  const examples = [
    '- 2026-11-01 L2 裁决：保留旧路径 — 因为调用方还在用— 如果判断错了，代价是多一条兼容代码',
    '- 2026-11-01 L2 裁决：保留旧路径 — 因为调用方还在用 —如果判断错了，代价是多一条兼容代码',
    '- 2026-11-01 L2 裁决: 保留旧路径 – 因为: 调用方还在用 -- 如果判断错了, 代价是: 多一条兼容代码',
    '- 2026-11-01 L2 裁决：保留旧路径 — 因为调用方还在用 — 代价：多一条兼容代码',
  ];
  for (const dash of ['—', '–', '-', '--', '']) {
    for (const space of ['', ' ', '   ']) {
      for (const punctuation of ['', ':', '：', ',', '，']) {
        const sep = space + dash + space;
        examples.push(`- 2026-11-01${sep}L2${sep}裁决${punctuation}保留旧路径`
          + `${sep}因为${punctuation}调用方还在用${sep}代价${punctuation}多一条兼容代码`);
      }
    }
  }
  const fx = project(t, { '.ultra/rulings.md': examples.join('\n') + '\n' });
  assert.equal(json(fx, ['gate']).ok, true);
});

test('tolerant rulings still reject missing parts and punctuation-only content', async (t) => {
  for (const line of [
    '- 2026-11-01 L2 裁决： — --， 因为理由 代价成本',
    '- 2026-11-01 L2 裁决决定 因为：— --， 如果判断错了，代价成本',
    '- 2026-11-01 L2 裁决决定 因为理由 代价是：— --，。',
    '- 2026-11-01 L2 裁决决定 代价成本',
    '- 2026-11-01 L2 裁决决定 因为理由',
    '- L2 裁决决定 因为理由 代价成本',
    '- 2026-11-01 L5 裁决决定 因为理由 代价成本',
    '- not a ruling',
  ]) {
    await t.test(line, (tt) => {
      const fx = project(tt, { '.ultra/rulings.md': line + '\n' });
      assert.deepEqual(json(fx, ['gate'], 1).problems.map((p) => p.code), ['malformed-ruling']);
    });
  }
});

test('a canonical ruling passes when a part starts with the next keyword', (t) => {
  // The strict reading accepted these; a tolerant one must not read a part as empty.
  const lines = [
    '- 2026-11-04 L2 裁决：不加缓存 — 因为代价太高 — 如果判断错了，代价是慢一点',
    '- 2026-11-04 L2 裁决：保留旧路径 — 因为如果判断错了也能回滚 — 如果判断错了，代价是多一条代码',
    '- 2026-11-04 L2 裁决：因为兼容先留旧路径 — 因为调用方还在用 — 如果判断错了，代价是多一条代码',
  ];
  const fx = project(t, { '.ultra/rulings.md': lines.join('\n') + '\n' });
  assert.equal(json(fx, ['gate']).ok, true);
});

test('a long malformed ruling line is read in bounded time', () => {
  // A separator after each tolerant part made this cubic: 0.9 s at 1820 characters, and
  // `ubp status` reads rulings for the SessionStart hook (2026-11-04).
  const { rulingProblems } = require('../engine/formats.cjs');
  const line = '- 2026-11-04 L2 裁决' + '因为 — '.repeat(600) + '代价' + '，'.repeat(600);
  const start = Date.now();
  assert.equal(rulingProblems(`${line}\n`).length, 1);
  assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
});

test('a ruling still needs its decision, reason and cost', async (t) => {
  for (const [name, line] of [
    ['no decision', '- 2026-10-31 L1 裁决： — 因为两种删除路径验收不同 — 如果判断错了，代价是多维护一条检查'],
    ['no reason', '- 2026-10-31 L1 裁决：拆分REQ-002 — 因为 — 如果判断错了，代价是多维护一条检查'],
    ['no cost', '- 2026-10-31 L1 裁决：拆分REQ-002 — 因为两种删除路径验收不同 — 如果判断错了，代价是'],
    ['a blank cost', '- 2026-10-31 L1 裁决：拆分REQ-002 — 因为两种删除路径验收不同 — 如果判断错了，代价是   '],
  ]) {
    await t.test(name, (tt) => {
      const fx = project(tt, { '.ultra/rulings.md': `# Rulings\n\n${line}\n` });
      const result = json(fx, ['gate'], 1);
      assert.deepEqual(result.problems.map((p) => p.code), ['malformed-ruling']);
    });
  }
});

// ---------------------------------------------------------------------------------------
// Records

test('records under .ultra/records/ never dirty the tree or invalidate evidence', (t) => {
  const fx = project(t);
  completeM1(fx);
  const line = 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次';
  write(fx.root, '.ultra/records/interview.md', '# Interview\n');
  write(fx.root, '.ultra/records/handoffs/N-01.md', 'Exports add(item).\n');
  let state = status(fx);
  assert.equal(state.dirty, false);
  assert.equal(state.line, line);

  commitAll(fx.root, 'records');
  state = status(fx);
  assert.equal(state.line, line);
  for (const c of state.checks) assert.equal(c.state, 'green', c.id);

  // Every other file under .ultra/ stays code.
  write(fx.root, '.ultra/decisions/d1.md', '# Decision\n');
  assert.equal(status(fx).dirty, true);
  commitAll(fx.root, 'decision');
  assert.deepEqual(byId(status(fx).checks)['C-1'].reasons, ['code-changed']);
});

// ---------------------------------------------------------------------------------------
// Node brief

test('context compiles the node brief from the truth files and handoffs (P2 exit)', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  write(fx.root, '.ultra/records/handoffs/N-01.md',
    'Exports `add(item)` from src/items/add.cjs.\r\nNothing unfinished.\n\n  \n');
  const before = ledgerBytes(fx);
  const expected = brief({
    id: 'N-02', title: 'Remove', milestone: 'M1: Core list', state: 'ready',
    requirements: [REQ_002],
    checks: [['C-12', 'green'], ['C-2', 'green']],
    handoffs: [['N-01', 'Exports `add(item)` from src/items/add.cjs.\nNothing unfinished.']],
  });
  assert.equal(ok(fx, ['context', 'N-02']).stdout, expected);
  assert.equal(ok(fx, ['context', 'N-02']).stdout, expected, 'same files, same bytes');
  assert.deepEqual(json(fx, ['context', 'N-02']), {
    ok: true, node: 'N-02', bytes: Buffer.byteLength(expected), omitted: [], brief: expected,
    problems: [],
  });
  assert.equal(ok(fx, ['context', 'N-02'], 0, UBP).stdout, expected, 'reachable as ubp context');
  // A brief reads files and records nothing.
  assert.deepEqual(ledgerBytes(fx), before);
  assert.equal(fs.existsSync(path.join(fx.root, '.ultra', '.runtime', 'engine.lock')), false);
});

test('context for a first node: declared scope, no dependencies, verbatim requirement text', (t) => {
  const spec = SPEC.replace('sees it in the list.\n',
    'sees it in the list.   \n\n```text\n## not a heading\n```\n');
  const fx = project(t, { '.ultra/spec.md': spec });
  const expected = brief({
    id: 'N-01', title: 'Add', milestone: 'M1: Core list', state: 'ready',
    requirements: [`${REQ_001}\n\n\`\`\`text\n## not a heading\n\`\`\``],
    checks: [['C-1', 'unknown'], ['C-12', 'unknown']],
    scope: ['src/items/', 'test/items.test.cjs'],
    handoffs: [],
  });
  assert.equal(ok(fx, ['context', 'N-01']).stdout, expected);
});

test('context names a missing handoff and shows a blocked node as blocked', (t) => {
  const fx = project(t);
  const expected = brief({
    id: 'N-03', title: 'Share', milestone: 'M2: Sharing', state: 'blocked',
    requirements: ['## REQ-003 Share the list\nThe user shares a read-only link to the list.'],
    checks: [['C-3', 'unknown']],
    handoffs: [['N-02', 'No handoff written.']],
  });
  assert.equal(ok(fx, ['context', 'N-03']).stdout, expected);
});

test('context fits its budget by omitting handoffs from the last dependency backwards', async (t) => {
  const plan = planFile(withDepends('N-03', ['N-01', 'N-02']));
  const handoff = (kb) => `${'Interface notes for dependents. '.repeat(32 * kb).trimEnd()}\n`;

  await t.test('the last dependency goes first', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': plan });
    write(fx.root, '.ultra/records/handoffs/N-01.md', handoff(20));
    write(fx.root, '.ultra/records/handoffs/N-02.md', handoff(20));
    const result = json(fx, ['context', 'N-03']);
    assert.equal(result.ok, true);
    assert.deepEqual(result.omitted, ['N-02']);
    assert.equal(result.bytes, Buffer.byteLength(result.brief));
    assert.ok(result.bytes <= 32768, String(result.bytes));
    assert.ok(result.brief.includes(`### N-01\n\n${handoff(20).trimEnd()}\n\n### N-02\n\n${omittedLine('N-02')}\n`));
  });

  await t.test('omission goes on until the brief fits', (tt) => {
    const fx = project(tt, { '.ultra/plan.json': plan });
    write(fx.root, '.ultra/records/handoffs/N-01.md', handoff(20));
    write(fx.root, '.ultra/records/handoffs/N-02.md', handoff(20));
    const result = json(fx, ['context', 'N-03', '--budget', '8192']);
    assert.deepEqual(result.omitted, ['N-02', 'N-01']);
    assert.ok(result.brief.includes(`### N-01\n\n${omittedLine('N-01')}\n\n### N-02\n\n${omittedLine('N-02')}\n`));
  });

  await t.test('a handoff that omission cannot shrink is kept, and a missing one stays named', async (tt) => {
    for (const [name, second, kept] of [
      ['shorter than the omission line', 'Small handoff.\n', 'Small handoff.'],
      ['not written', null, 'No handoff written.'],
    ]) {
      await tt.test(name, (ttt) => {
        const fx = project(ttt, { '.ultra/plan.json': plan });
        write(fx.root, '.ultra/records/handoffs/N-01.md', handoff(40));
        if (second) write(fx.root, '.ultra/records/handoffs/N-02.md', second);
        const result = json(fx, ['context', 'N-03']);
        assert.equal(result.ok, true);
        assert.deepEqual(result.omitted, ['N-01']);
        assert.ok(result.brief.includes(`### N-01\n\n${omittedLine('N-01')}\n\n### N-02\n\n${kept}\n`));
      });
    }
  });

  await t.test('the budget counts UTF-8 bytes', (tt) => {
    const fx = project(tt);
    const full = ok(fx, ['context', 'N-01']).stdout;
    const bytes = Buffer.byteLength(full);
    assert.ok(bytes > full.length, 'the brief holds multi-byte characters');
    assert.equal(ok(fx, ['context', 'N-01', '--budget', String(bytes)]).stdout, full);
    const result = json(fx, ['context', 'N-01', '--budget', String(bytes - 1)], 1);
    assert.deepEqual(result, {
      ok: false, node: 'N-01', bytes, omitted: [], brief: null, problems: result.problems,
    });
    refused(result, ['brief-over-budget']);
  });

  await t.test('a brief that cannot fit is refused', (tt) => {
    const fx = project(tt);
    write(fx.root, '.ultra/records/handoffs/N-01.md', handoff(1));
    const result = json(fx, ['context', 'N-02', '--budget', '300'], 1);
    assert.equal(result.brief, null);
    assert.deepEqual(result.omitted, ['N-01']);
    assert.ok(result.bytes > 300);
    refused(result, ['brief-over-budget']);
    assert.match(result.problems[0].message, new RegExp(`${result.bytes}[\\s\\S]*300|300[\\s\\S]*${result.bytes}`));
    const text = ok(fx, ['context', 'N-02', '--budget', '300'], 1);
    assert.equal(text.stdout, '');
    assert.match(text.stderr, /brief-over-budget/);
  });
});

test('context never reads a file for a dependency that names no node', (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p2-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.md'), 'TOP SECRET OUTSIDE ROOT\n');
  const fx = project(t);
  const handoffs = path.join(fx.root, '.ultra', 'records', 'handoffs');
  const dep = path.relative(handoffs, path.join(outside, 'secret'));
  const plan = withDepends('N-02', [dep]);
  plan.nodes = plan.nodes.map((n) => (n.id === 'N-02' ? { ...n, milestone: 'M9' } : n));
  write(fx.root, '.ultra/plan.json', planFile(plan));
  commitAll(fx.root, 'a crafted plan');
  const result = ok(fx, ['context', 'N-02']);
  assert.ok(!result.stdout.includes('TOP SECRET'), result.stdout);
  assert.ok(result.stdout.includes(`### ${dep}\n\nNot a node in .ultra/plan.json.\n`), result.stdout);
  assert.ok(result.stdout.includes('\nMilestone M9: not in .ultra/plan.json · node state blocked\n'),
    result.stdout);
});

test('context reads a handoff only when it is a regular file inside the project', async (t) => {
  const NOT_READ = 'Not read: not a regular file inside the project.';
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p2-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'N-01.md'), 'TOP SECRET OUTSIDE ROOT\n');
  const handoffs = (fx) => path.join(fx.root, '.ultra', 'records', 'handoffs');
  for (const [name, plant] of [
    ['a symbolic link to a file outside', (fx) => {
      fs.mkdirSync(handoffs(fx), { recursive: true });
      fs.symlinkSync(path.join(outside, 'N-01.md'), path.join(handoffs(fx), 'N-01.md'));
    }],
    ['a handoff directory that links outside', (fx) => {
      fs.mkdirSync(path.dirname(handoffs(fx)), { recursive: true });
      fs.symlinkSync(outside, handoffs(fx));
    }],
    ['a FIFO', (fx) => {
      fs.mkdirSync(handoffs(fx), { recursive: true });
      mkfifo(path.join(handoffs(fx), 'N-01.md'));
    }],
    ['a directory', (fx) => {
      fs.mkdirSync(path.join(handoffs(fx), 'N-01.md'), { recursive: true });
    }],
  ]) {
    await t.test(name, (tt) => {
      const fx = project(tt);
      plant(fx);
      const result = json(fx, ['context', 'N-02']);
      assert.ok(!result.brief.includes('TOP SECRET'), result.brief);
      assert.ok(result.brief.includes(`### N-01\n\n${NOT_READ}\n`), result.brief);
      assert.deepEqual(result.omitted, []);
    });
  }
});

test('context never leaves an empty section', (t) => {
  // N-02 declares an empty scope, and no check covers REQ-002.
  const plan = { ...PLAN, nodes: PLAN.nodes.map((n) => (n.id === 'N-02' ? { ...n, scope: [] } : n)) };
  const checks = CHECKS.filter((c) => !c.covers.includes('REQ-002'));
  for (const [handoffText, shown] of [
    ['\n  \n\nLeading blanks.\n', 'Leading blanks.'],
    [' \r\n\t\n', 'No handoff written.'],
  ]) {
    const fx = project(t, { '.ultra/plan.json': planFile(plan), '.ultra/checks.json': checksFile(checks) });
    write(fx.root, '.ultra/records/handoffs/N-01.md', handoffText);
    const expected = brief({
      id: 'N-02', title: 'Remove', milestone: 'M1: Core list', state: 'blocked',
      requirements: [REQ_002], checks: [], scope: [], handoffs: [['N-01', shown]],
    });
    const actual = ok(fx, ['context', 'N-02']).stdout;
    assert.equal(actual, expected);
    assert.ok(!actual.includes('\n\n\n'), 'never two empty lines in a row');
  }
});

test('context usage errors exit 2', (t) => {
  const fx = project(t);
  for (const [name, args] of [
    ['no node id', ['context']],
    ['two --budget', ['context', 'N-01', '--budget', '9000', '--budget', '9000']],
    ['an unknown node', ['context', 'N-99']],
    ['two node ids', ['context', 'N-01', 'N-02']],
    ['a zero budget', ['context', 'N-01', '--budget', '0']],
    ['a negative budget', ['context', 'N-01', '--budget', '-5']],
    ['a fractional budget', ['context', 'N-01', '--budget', '1.5']],
    ['a word budget', ['context', 'N-01', '--budget', 'lots']],
    ['--owner on context', ['context', 'N-01', '--owner', '放行']],
    ['--all on context', ['context', 'N-01', '--all']],
  ]) {
    const result = run(fx, args);
    assert.equal(result.status, 2, `${name}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    assert.ok(result.stderr.trim(), name);
  }
});

test('ubp reaches milestone close and lists the new commands in its help', (t) => {
  const fx = project(t);
  completeM1(fx);
  const result = ok(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    review(fx, 'M1')], 0, UBP);
  assert.equal(result.stdout, 'milestone M1: pass\n');
  const help = spawnSync(process.execPath, [UBP, '--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /milestone close/);
  assert.match(help.stdout, /context <id>/);
});
