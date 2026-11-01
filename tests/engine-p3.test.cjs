'use strict';

// P3 acceptance for the v6 engine (RESULT.md §5 P3, contract in engine/FORMATS.md): the
// shared spec text joins invalidation, and a reduction is refused until the Owner's
// approval is recorded. Black-box: every observation goes through the CLI against a
// throwaway Git fixture.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'engine', 'cli.cjs');
const UBP = path.join(ROOT, 'bin', 'install.js');
const NODE = JSON.stringify(process.execPath);
const OWNER = '可以，删掉吧。';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const SPEC = `# Spec

## Direction
A shared list for one household.

## Interface
Start with \`npm start\`; the port comes from \`PORT\`.

## REQ-001 Add an item
The user adds an item and sees it in the list.

## REQ-002 Remove an item
The user removes an item and it disappears from the list.

## REQ-003 Share the list
The user shares a read-only link to the list.
`;

// The shared text as the contract defines it, computed independently of the engine.
function sharedHash(spec) {
  const kept = [];
  let inRequirement = false;
  for (const raw of spec.replace(/\r\n/gu, '\n').split('\n')) {
    const heading = raw.match(/^ {0,3}(#{1,2})(?:[ \t]+(.*)|[ \t]*)$/u);
    if (heading) inRequirement = heading[1] === '##' && (heading[2] || '').startsWith('REQ-');
    if (!inRequirement && raw.trimEnd()) kept.push(raw.trimEnd());
  }
  return sha256(kept.join('\n'));
}

const PASS_SCRIPT = `const fs = require('node:fs');
const id = process.argv[2];
if (fs.existsSync('.ultra/.runtime/fail-' + id)) {
  console.log('AssertionError: ' + id + ' toggled off');
  process.exit(1);
}
console.log('pass 1');
`;

const check = (id, covers) => ({ id, covers, run: `${NODE} checks/pass.cjs ${id}`,
  expect: 'pass [1-9]' });

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
  git(root, ['commit', '-q', '--allow-empty', '-m', message]);
}

function project(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p3-'));
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
    encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL',
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
const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const ledgerFile = (fx, name) => path.join(fx.root, '.ultra', 'ledger', name);

function ledger(fx, name) {
  const file = ledgerFile(fx, name);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function bytes(fx, name) {
  const file = ledgerFile(fx, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

const spec = (fx) => fs.readFileSync(path.join(fx.root, '.ultra', 'spec.md'), 'utf8');

function editSpec(fx, before, after) {
  const text = spec(fx);
  assert.ok(text.includes(before), before);
  write(fx.root, '.ultra/spec.md', text.replace(before, after));
}

function completeM1(fx) {
  ok(fx, ['gate']);
  ok(fx, ['check']);
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
}

// Removes REQ-002 the way a planner would: spec, milestone, its node, its own check, and
// the requirement from the shared check C-12. N-03 now depends on N-01.
function dropReq002(fx) {
  editSpec(fx, '## REQ-002 Remove an item\nThe user removes an item and it disappears from the list.\n\n', '');
  write(fx.root, '.ultra/checks.json', checksFile([
    check('C-1', ['REQ-001']), check('C-12', ['REQ-001']), check('C-3', ['REQ-003']),
  ]));
  write(fx.root, '.ultra/plan.json', planFile({
    ...PLAN,
    milestones: [{ ...PLAN.milestones[0], requirements: ['REQ-001'] }, PLAN.milestones[1]],
    nodes: [PLAN.nodes[0], { ...PLAN.nodes[2], depends: ['N-01'] }],
  }));
  commitAll(fx.root, 'drop REQ-002');
}

function reductions(result) {
  assert.equal(result.ok, false);
  for (const p of result.problems) {
    assert.deepEqual(Object.keys(p).sort(), ['code', 'hint', 'message']);
    assert.equal(p.code, 'reduction-unapproved', JSON.stringify(p));
    assert.match(p.hint, /ubp approve /u, JSON.stringify(p));
  }
  // The item is the one token of the form <milestone>/<id> in the message.
  return result.problems.map((p) => {
    const items = p.message.match(/\bM[0-9]+\/[A-Za-z0-9._-]+/gu);
    assert.equal(items?.length, 1, p.message);
    assert.ok(p.hint.includes(`ubp approve ${items[0]}`), p.hint);
    return items[0];
  });
}

const approve = (fx, items, extra = [], expectedExit = 0) =>
  json(fx, ['approve', ...items, '--owner', OWNER, ...extra], expectedExit);

// ---------------------------------------------------------------------------------------
// Shared spec text

test('records carry the hash of the shared spec text', (t) => {
  const fx = project(t);
  completeM1(fx);
  const expected = sharedHash(SPEC);
  for (const record of ledger(fx, 'plan-log.jsonl')) assert.equal(record.shared, expected);
  const evidence = ledger(fx, 'evidence.jsonl');
  assert.equal(evidence.length, 4);
  for (const record of evidence) assert.equal(record.shared, expected);
  for (const record of ledger(fx, 'nodes.jsonl')) assert.equal(record.shared, expected);
});

test('editing the shared text makes every check and done node stale, and the gate records it (P3)', (t) => {
  const fx = project(t);
  completeM1(fx);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');

  editSpec(fx, 'the port comes from `PORT`', 'the port comes from `LIST_PORT`');
  commitAll(fx.root, 'rename the port variable');
  const state = status(fx);
  for (const c of state.checks) {
    assert.equal(c.state, 'stale', c.id);
    assert.deepEqual(c.reasons, ['shared-changed'], c.id);
  }
  for (const r of state.requirements) assert.equal(r.state, 'stale', r.id);
  const nodes = byId(state.nodes);
  assert.equal(nodes['N-01'].state, 'stale');
  assert.deepEqual(nodes['N-01'].reasons, ['shared-changed']);
  assert.equal(nodes['N-02'].state, 'stale');
  assert.deepEqual(nodes['N-02'].reasons, ['shared-changed']);
  assert.equal(nodes['N-03'].state, 'blocked');
  assert.equal(state.gate, 'stale');
  assert.equal(state.line, 'M1 · 0/2 绿 · 2 过期 · 下一项 N-01 · 本里程碑计划变更 0 次 · 计划门待重跑');

  assert.deepEqual(json(fx, ['gate']).recorded,
    [{ milestone: 'M1', type: 'change' }, { milestone: 'M2', type: 'change' }]);
  const [m1, m2] = ledger(fx, 'plan-log.jsonl').slice(-2);
  for (const record of [m1, m2]) {
    assert.equal(record.shared, sharedHash(spec(fx)));
    assert.deepEqual(record.diff, {
      added: [], removed: [], modified: [], nodes_added: [], nodes_removed: [],
      checks_added: [], checks_removed: [], checks_modified: [], shared: true,
    });
  }
  assert.equal(status(fx).line, 'M1 · 0/2 绿 · 2 过期 · 下一项 N-01 · 本里程碑计划变更 2 次');

  assert.deepEqual(json(fx, ['check']).runs.map((r) => r.check), ['C-1', 'C-12', 'C-2', 'C-3']);
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 N-01 · 本里程碑计划变更 2 次');
  ok(fx, ['node', 'done', 'N-01']);
  ok(fx, ['node', 'done', 'N-02']);
  assert.equal(ledger(fx, 'nodes.jsonl').at(-1).shared, sharedHash(spec(fx)));
  assert.equal(status(fx).line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 2 次');
});

test('blank lines and trailing spaces in the shared text change nothing', (t) => {
  const fx = project(t);
  completeM1(fx);
  editSpec(fx, '## Direction\nA shared list for one household.\n',
    '\n\n## Direction   \n\nA shared list for one household.\t\n\n\n');
  editSpec(fx, '# Spec\n', '# Spec  \n\n');
  commitAll(fx.root, 'reflow');
  const state = status(fx);
  assert.equal(state.gate, 'pass');
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');
  assert.deepEqual(json(fx, ['gate']).recorded, []);
});

test('a line under a level-1 heading after a requirement is shared text, not requirement text', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/spec.md', `${spec(fx)}\n# Appendix\nGlossary: an item is one line of text.\n`);
  commitAll(fx.root, 'appendix');
  const state = status(fx);
  assert.deepEqual(byId(state.checks)['C-3'].reasons, ['shared-changed']);
  assert.deepEqual(byId(state.nodes)['N-01'].reasons, ['shared-changed']);
});

test('editing one requirement leaves the shared hash and the other requirements alone', (t) => {
  const fx = project(t);
  completeM1(fx);
  editSpec(fx, 'sees it in the list', 'sees it at the top of the list');
  commitAll(fx.root, 'reword REQ-001');
  const state = status(fx);
  assert.deepEqual(byId(state.checks)['C-1'].reasons, ['req-changed:REQ-001']);
  assert.equal(byId(state.checks)['C-2'].state, 'green');
  assert.equal(byId(state.nodes)['N-02'].state, 'done');
  json(fx, ['gate']);
  const change = ledger(fx, 'plan-log.jsonl').at(-1);
  assert.deepEqual(change.diff.modified, ['REQ-001']);
  assert.equal(Object.hasOwn(change.diff, 'shared'), false);
  assert.equal(change.shared, sharedHash(SPEC));
});

test('a fenced line in the shared text is shared text too', (t) => {
  const spec = SPEC.replace('Start with `npm start`; the port comes from `PORT`.\n',
    'Start with `npm start`.\n\n```json\n{ "port": "PORT" }\n```\n');
  const fx = project(t, { '.ultra/spec.md': spec });
  completeM1(fx);
  editSpec(fx, '{ "port": "PORT" }', '{ "port": "LIST_PORT" }');
  const state = status(fx);
  for (const c of state.checks) assert.deepEqual(c.reasons, ['shared-changed'], c.id);
  assert.equal(state.gate, 'stale');
});

test('a node whose requirement and shared text both changed lists shared-changed first', (t) => {
  const fx = project(t);
  completeM1(fx);
  editSpec(fx, 'the port comes from `PORT`', 'the port comes from `LIST_PORT`');
  editSpec(fx, 'sees it in the list', 'sees it at the top of the list');
  assert.deepEqual(byId(status(fx).nodes)['N-01'].reasons,
    ['shared-changed', 'req-changed:REQ-001']);
});

test('records written before P3 lack shared: they are stale and the next gate records the shared text', (t) => {
  const fx = project(t);
  completeM1(fx);
  for (const name of ['evidence.jsonl', 'nodes.jsonl', 'plan-log.jsonl']) {
    const lines = ledger(fx, name).map(({ shared, ...rest }) => JSON.stringify(rest));
    fs.writeFileSync(ledgerFile(fx, name), `${lines.join('\n')}\n`);
  }
  const state = status(fx);
  for (const c of state.checks) assert.deepEqual(c.reasons, ['shared-changed'], c.id);
  assert.deepEqual(byId(state.nodes)['N-01'].reasons, ['shared-changed']);
  assert.equal(state.gate, 'stale');
  assert.deepEqual(json(fx, ['gate']).recorded,
    [{ milestone: 'M1', type: 'change' }, { milestone: 'M2', type: 'change' }]);
  assert.equal(ledger(fx, 'plan-log.jsonl').at(-1).diff.shared, true);
});

test('a malformed shared field is a malformed ledger record', (t) => {
  const fx = project(t);
  completeM1(fx);
  editSpec(fx, 'the port comes from `PORT`', 'the port comes from `LIST_PORT`');
  ok(fx, ['gate']);
  const breakages = [
    ['nodes.jsonl', (r) => { r.shared = 'not-a-hash'; }],
    ['evidence.jsonl', (r) => { r.shared = 7; }],
    ['plan-log.jsonl', (r) => { r.shared = 'ABC'; }],
    ['plan-log.jsonl', (r) => { if (r.diff) r.diff.shared = false; else r.shared = null; }],
  ];
  for (const [name, mutate] of breakages) {
    const original = fs.readFileSync(ledgerFile(fx, name), 'utf8');
    const records = ledger(fx, name);
    const index = records.findIndex((r) => r.diff) >= 0 && name === 'plan-log.jsonl'
      ? records.findIndex((r) => r.diff) : 0;
    mutate(records[index]);
    fs.writeFileSync(ledgerFile(fx, name), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
    const result = run(fx, ['status']);
    assert.equal(result.status, 2, name);
    assert.match(result.stderr, new RegExp(`${name.replace('.', '\\.')}:${index + 1}: malformed ledger record`, 'u'));
    fs.writeFileSync(ledgerFile(fx, name), original);
  }
});

// ---------------------------------------------------------------------------------------
// Reductions

test('a removed requirement is refused until the Owner approves it, item by item (P3 exit)', (t) => {
  const fx = project(t);
  completeM1(fx);
  const planLog = bytes(fx, 'plan-log.jsonl');
  dropReq002(fx);

  const refused = json(fx, ['gate'], 1);
  assert.deepEqual(reductions(refused), ['M1/REQ-002', 'M1/C-2']);
  assert.deepEqual(refused.recorded, []);
  assert.equal(bytes(fx, 'plan-log.jsonl'), planLog, 'a refused gate records nothing');
  const state = status(fx);
  assert.equal(state.gate, 'fail');
  assert.deepEqual(state.problems.map((p) => p.code), ['reduction-unapproved', 'reduction-unapproved']);
  assert.match(state.line, / · 计划门未通过$/u);

  assert.deepEqual(approve(fx, ['M1/REQ-002']), { ok: true, items: ['M1/REQ-002'] });
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-2']);

  approve(fx, ['M1/C-2'], ['--proxy']);
  const passed = json(fx, ['gate']);
  assert.deepEqual(passed.recorded, [{ milestone: 'M1', type: 'change' }]);
  const change = ledger(fx, 'plan-log.jsonl').at(-1);
  assert.deepEqual(change.diff, {
    added: [], removed: ['REQ-002'], modified: [], nodes_added: [], nodes_removed: ['N-02'],
    checks_added: [], checks_removed: ['C-2'], checks_modified: ['C-12'],
  });
  const approvals = ledger(fx, 'approvals.jsonl');
  assert.deepEqual(approvals.map((a) => [a.items, a.owner]), [
    [['M1/REQ-002'], { words: OWNER, proxy: false }],
    [['M1/C-2'], { words: OWNER, proxy: true }],
  ]);
  assert.deepEqual(json(fx, ['gate']).recorded, [], 'the approval was used once');
});

test('an approval given before the edit lets the gate pass at once', (t) => {
  const fx = project(t);
  completeM1(fx);
  approve(fx, ['M1/REQ-002', 'M1/C-2']);
  dropReq002(fx);
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
});

test('an approval older than the milestone\'s latest plan change no longer counts', (t) => {
  const fx = project(t);
  completeM1(fx);
  approve(fx, ['M1/REQ-002', 'M1/C-2']);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS, check('C-1b', ['REQ-001'])]));
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
  dropReq002(fx);
  write(fx.root, '.ultra/checks.json', checksFile([
    check('C-1', ['REQ-001']), check('C-12', ['REQ-001']), check('C-3', ['REQ-003']),
    check('C-1b', ['REQ-001']),
  ]));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/REQ-002', 'M1/C-2']);
});

test('removing a check or narrowing what it covers is a reduction (ratchet)', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.filter((c) => c.id !== 'C-1')));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-1']);

  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.map((c) =>
    (c.id === 'C-12' ? { ...c, covers: ['REQ-001'] } : c))));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-12']);

  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.map((c) =>
    (c.id === 'C-1' ? { ...c, run: `${c.run} --again` } : c))));
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }],
    'editing a check is a modification, not a reduction');
});

test('a closed milestone keeps its checks: removing one needs approval too', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  ok(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    '.ultra/records/milestones/M1-review.md']);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.filter((c) => c.id !== 'C-2')));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-2']);
});

test('moving a requirement to another milestone is a reduction of the one it left', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/plan.json', planFile({
    ...PLAN,
    milestones: [{ ...PLAN.milestones[0], requirements: ['REQ-001'] },
      { ...PLAN.milestones[1], requirements: ['REQ-002', 'REQ-003'] }],
    nodes: [PLAN.nodes[0], { ...PLAN.nodes[1], milestone: 'M2' }, PLAN.nodes[2]],
  }));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/REQ-002', 'M1/C-2']);
});

test('removing a milestone needs approval for each of its requirements and checks', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  editSpec(fx, '\n## REQ-003 Share the list\nThe user shares a read-only link to the list.\n', '\n');
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.filter((c) => c.id !== 'C-3')));
  write(fx.root, '.ultra/plan.json', planFile({ ...PLAN,
    milestones: [PLAN.milestones[0]], nodes: PLAN.nodes.slice(0, 2) }));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M2/REQ-003', 'M2/C-3']);
  approve(fx, ['M2/REQ-003', 'M2/C-3']);
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M2', type: 'removed' }]);
});

test('reduction problems follow the other plan problems and precede malformed rulings', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.filter((c) => c.id !== 'C-1')));
  write(fx.root, '.ultra/plan.json', planFile({ ...PLAN, nodes: [...PLAN.nodes,
    { id: 'N-09', milestone: 'M1', title: 'Orphan', covers: ['REQ-001'], depends: ['N-99'] }] }));
  write(fx.root, '.ultra/rulings.md', '- not a ruling\n');
  const result = json(fx, ['gate'], 1);
  assert.deepEqual(result.problems.map((p) => p.code),
    ['unknown-dependency', 'reduction-unapproved', 'malformed-ruling']);
});

test('adding a requirement, a check and a node needs no approval (L1 add)', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/spec.md', `${spec(fx)}\n## REQ-004 Rename the list\nThe user renames the list.\n`);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS, check('C-4', ['REQ-004'])]));
  write(fx.root, '.ultra/plan.json', planFile({ ...PLAN,
    milestones: [PLAN.milestones[0], { ...PLAN.milestones[1], requirements: ['REQ-003', 'REQ-004'] }],
    nodes: [...PLAN.nodes, { id: 'N-04', milestone: 'M2', title: 'Rename', covers: ['REQ-004'],
      depends: ['N-01'] }] }));
  commitAll(fx.root, 'add REQ-004');
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M2', type: 'change' }]);
  const diff = ledger(fx, 'plan-log.jsonl').at(-1).diff;
  assert.deepEqual([diff.added, diff.nodes_added, diff.checks_added],
    [['REQ-004'], ['N-04'], ['C-4']]);
  const state = status(fx);
  assert.equal(byId(state.checks)['C-1'].state, 'green');
  assert.equal(byId(state.checks)['C-4'].state, 'unknown');
  assert.equal(byId(state.nodes)['N-01'].state, 'done');
  assert.equal(byId(state.nodes)['N-04'].state, 'ready');
});

test('an approval names its milestone: approving one milestone\'s item leaves the other\'s refused', (t) => {
  const fx = project(t, { '.ultra/checks.json': checksFile([...CHECKS,
    check('C-x', ['REQ-001', 'REQ-003'])]) });
  completeM1(fx);
  approve(fx, ['M2/C-x']);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-x']);
});

test('an approval given before a milestone closed does not count after the closure', (t) => {
  const fx = project(t);
  completeM1(fx);
  approve(fx, ['M1/C-2']);
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  ok(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    '.ultra/records/milestones/M1-review.md']);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS, check('C-3b', ['REQ-003'])]));
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M2', type: 'change' }]);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS.filter((c) => c.id !== 'C-2'),
    check('C-3b', ['REQ-003'])]));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-2']);
});

test('after a closure, an approval still needs to be later than the milestone\'s latest plan change', (t) => {
  const fx = project(t);
  completeM1(fx);
  write(fx.root, '.ultra/records/milestones/M1-review.md', 'Reviewer: test\n\nVerdict: accept\n');
  ok(fx, ['milestone', 'close', 'M1', '--owner', '放行', '--review',
    '.ultra/records/milestones/M1-review.md']);
  approve(fx, ['M1/C-2']);
  editSpec(fx, 'the port comes from `PORT`', 'the port comes from `LIST_PORT`');
  assert.deepEqual(json(fx, ['gate']).recorded,
    [{ milestone: 'M1', type: 'change' }, { milestone: 'M2', type: 'change' }]);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS.filter((c) => c.id !== 'C-2')));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/C-2']);
});

test('ids that name Object properties are ordinary ids in reductions and diffs', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  write(fx.root, '.ultra/checks.json', checksFile([...CHECKS, check('valueOf', ['REQ-001'])]));
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
  assert.deepEqual(ledger(fx, 'plan-log.jsonl').at(-1).diff.checks_added, ['valueOf']);
  write(fx.root, '.ultra/checks.json', checksFile(CHECKS));
  assert.deepEqual(reductions(json(fx, ['gate'], 1)), ['M1/valueOf']);
  approve(fx, ['M1/valueOf']);
  assert.deepEqual(json(fx, ['gate']).recorded, [{ milestone: 'M1', type: 'change' }]);
  const change = ledger(fx, 'plan-log.jsonl').at(-1);
  assert.deepEqual(change.diff.checks_removed, ['valueOf']);
  assert.equal(Object.hasOwn(change.checks, 'valueOf'), false);
  assert.deepEqual(json(fx, ['gate']).recorded, []);
});

// ---------------------------------------------------------------------------------------
// approve

test('approve records sorted unique items, the words verbatim and the proxy flag', (t) => {
  const fx = project(t);
  completeM1(fx);
  const words = '  可以。\n删掉吧。  ';
  const result = json(fx, ['approve', 'M1/REQ-002', 'M1/C-2', 'M1/REQ-002', '--owner', words,
    '--proxy']);
  assert.deepEqual(result, { ok: true, items: ['M1/C-2', 'M1/REQ-002'] });
  const [record] = ledger(fx, 'approvals.jsonl');
  assert.deepEqual(Object.keys(record).sort(), ['at', 'items', 'owner', 'v']);
  assert.equal(record.v, 1);
  assert.deepEqual(record.items, ['M1/C-2', 'M1/REQ-002']);
  assert.deepEqual(record.owner, { words, proxy: true });
  const others = ['evidence.jsonl', 'plan-log.jsonl', 'nodes.jsonl']
    .flatMap((name) => ledger(fx, name)).map((r) => r.at);
  assert.ok(others.every((at) => record.at > at), 'the approval is later than every record');

  const text = ok(fx, ['approve', 'M2/C-3', '--owner', OWNER]);
  assert.equal(text.stdout, 'approved: M2/C-3\n');
  const state = status(fx);
  assert.equal(state.dirty, false);
  assert.equal(state.line, 'M1 · 2/2 绿 · 下一项 里程碑门 · 本里程碑计划变更 0 次');
});

test('approve usage errors exit 2 and record nothing', (t) => {
  const fx = project(t);
  const before = run(fx, ['approve', 'M1/REQ-001', '--owner', OWNER]);
  assert.equal(before.status, 2, 'no plan-log record yet: nothing to approve');
  ok(fx, ['gate']);
  const cases = [
    ['approve', '--owner', OWNER],
    ['approve', 'M1/REQ-002'],
    ['approve', 'M1/REQ-002', '--owner', '   '],
    ['approve', 'M1/REQ-002', '--owner', OWNER, '--owner', OWNER],
    ['approve', 'REQ-002', '--owner', OWNER],
    ['approve', 'M1/', '--owner', OWNER],
    ['approve', '/REQ-002', '--owner', OWNER],
    ['approve', 'M1/REQ-002/x', '--owner', OWNER],
    ['approve', 'M9/REQ-001', '--owner', OWNER],
    ['approve', 'M1/REQ-999', '--owner', OWNER],
    ['approve', 'M1/REQ-003', '--owner', OWNER],
    ['approve', 'M1/N-01', '--owner', OWNER],
    ['approve', 'M1/REQ-002', 'M1/C-9', '--owner', OWNER],
    ['approve', 'M1/REQ-002', '--owner', OWNER, '--review', 'x.md'],
    ['gate', '--proxy'],
  ];
  for (const args of cases) {
    const result = run(fx, args);
    assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}`);
    assert.ok(result.stderr.trim(), args.join(' '));
  }
  assert.equal(bytes(fx, 'approvals.jsonl'), null);
});

test('a malformed approval record stops every command', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  for (const record of [
    { v: 1, items: [], owner: { words: OWNER, proxy: false }, at: '2026-01-01T00:00:00.000Z' },
    { v: 1, items: ['M1/C-2', 'M1/C-12'], owner: { words: OWNER, proxy: false },
      at: '2026-01-01T00:00:00.000Z' },
    { v: 1, items: ['M1-C-2'], owner: { words: OWNER, proxy: false }, at: '2026-01-01T00:00:00.000Z' },
    { v: 1, items: ['M1/C-2'], owner: { words: '', proxy: false }, at: '2026-01-01T00:00:00.000Z' },
    { v: 1, items: ['M1/C-2'], owner: { words: OWNER }, at: '2026-01-01T00:00:00.000Z' },
  ]) {
    write(fx.root, '.ultra/ledger/approvals.jsonl', `${JSON.stringify(record)}\n`);
    const result = run(fx, ['status']);
    assert.equal(result.status, 2, JSON.stringify(record));
    assert.match(result.stderr, /approvals\.jsonl:1: malformed ledger record/u);
  }
});

test('ubp reaches approve and lists it in its help', (t) => {
  const fx = project(t);
  ok(fx, ['gate']);
  const result = ok(fx, ['approve', 'M1/C-2', '--owner', OWNER], 0, UBP);
  assert.equal(result.stdout, 'approved: M1/C-2\n');
  const help = spawnSync(process.execPath, [UBP, '--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /approve /u);
});
