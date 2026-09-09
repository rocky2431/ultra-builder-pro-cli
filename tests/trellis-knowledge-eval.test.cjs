'use strict';

// Structural check for the Step-3 knowledge write-back evaluation (case K3).
// It pins the fixture's starting state, the fact that the to-be-learned facts
// are genuinely undocumented at start, the counterexamples' unambiguous
// currency, the deterministic acceptance oracle (starting inventory included),
// the byte-level withholding of the phase-2 operator input, the absence of
// evaluator coaching in model-visible bytes, and the addendum's consistency
// with the fixture. Same source-contract-test evidence class as
// tests/trellis-daily-eval.test.cjs; no model in the loop.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ADDENDUM = path.join(ROOT, 'work', 'trellis-eight-step-20260909', 'step3-evaluation.zh-CN.md');
const PROTOCOL = path.join(ROOT, 'tests', 'evals', 'trellis-daily-20260909.json');
const FIXTURE_ROOT = path.join(ROOT, 'tests', 'evals', 'fixtures', 'trellis-knowledge-20260909');
const FIXTURE = path.join(FIXTURE_ROOT, 'k3-clippings');
const OPERATOR_INPUT = path.join(FIXTURE_ROOT, 'k3-operator-inputs', 'export-2026-09-08.txt');

const SESSION1_MESSAGE =
  '我用「墨记」阅读器看书，导出文件在 data/sample-export.txt。给这个笔记工具加个导入功能：把导出里的笔记存进库存，导完给我证据。';
const SESSION2_MESSAGE =
  '新一批导出我放到 data/export-2026-09-08.txt 了。也导入库存，然后帮我核对：现在每本书各有多少条笔记，导入有没有丢东西。给我核对结果。';

// The acceptance oracle, derived from the frozen seed and export bytes by
// scanSeed/scanExport below and stated verbatim in the addendum. The final
// inventory is starting seed plus both import deltas: the owner asks for the
// per-book count of the whole store after both imports, and append-only
// history means the seeds never leave.
const ORACLE_LINES = [
  '起点库存（data/entries.jsonl）：《夜晚的潜水艇》1 条、《俗世奇人》1 条，合计 2 条',
  'data/sample-export.txt：3 块 → 2 条有效（《夜晚的潜水艇》2）、1 条撤销、1 条带续行',
  'k3-operator-inputs/export-2026-09-08.txt：4 块 → 3 条有效（《夜晚的潜水艇》1、《遥远的向日葵地》2）、1 条撤销、1 条带续行',
  '两次导入后库存基线：《夜晚的潜水艇》4 条、《遥远的向日葵地》2 条、《俗世奇人》1 条，合计 7 条；其中新导入 5 条、撤销跳过 2 条',
];

// Terms that announce the evaluation or hint at its target behavior. No
// model-visible byte of the project seed may contain any of them; the
// evaluator material (addendum, this test) lives outside the seed.
const COACHING_TOKENS = [
  '评测',
  'evaluation',
  'evaluator',
  'fixture',
  'trellis',
  'k3',
  'rozen', // Frozen / frozen
  '冻结',
  '验收',
  '回写',
  'write-back',
  'consumption',
  '被评测',
  'step3',
  '附录',
];

function read(...parts) {
  return fs.readFileSync(path.join(FIXTURE, ...parts), 'utf8');
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

// The starting inventory, parsed from the actual seed bytes: one JSON entry
// per line, counted per book.
function scanSeed(body) {
  const byBook = {};
  const lines = body.split('\n').filter((line) => line.trim().length > 0);
  for (const line of lines) {
    const entry = JSON.parse(line);
    const book = /^《(.+)》$/.exec(entry.book)[1];
    byBook[book] = (byBook[book] || 0) + 1;
  }
  return { total: lines.length, byBook };
}

// Mechanical reference scan of one frozen export file: header, then blocks
// separated by ----------; each block is a 《title》 author line, a timestamp
// line, then content lines. A block whose content starts with [撤销] is a
// tombstone; a content line starting with exactly three spaces continues the
// previous note.
function scanExport(body) {
  const lines = body.split('\n');
  assert.equal(lines[0], '墨记导出 v2', 'export header line');
  assert.equal(lines[1], '==========', 'export header rule');
  const blocks = lines
    .slice(2)
    .join('\n')
    .split('----------')
    .map((block) => block.split('\n').filter((line) => line.trim().length > 0))
    .filter((block) => block.length > 0);
  const scanned = { blocks: blocks.length, valid: 0, tombstones: 0, continuations: 0, byBook: {} };
  for (const block of blocks) {
    const title = /^《(.+)》 (.+)$/.exec(block[0]);
    assert.ok(title, `block title line: ${block[0]}`);
    assert.match(block[1], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, `timestamp line: ${block[1]}`);
    const content = block.slice(2);
    if (content.some((line) => line.startsWith('[撤销]'))) {
      scanned.tombstones += 1;
      continue;
    }
    assert.ok(content.some((line) => line.startsWith('>> ')), 'a valid note starts with >> ');
    if (content.some((line) => line.startsWith('   '))) scanned.continuations += 1;
    scanned.valid += 1;
    scanned.byBook[title[1]] = (scanned.byBook[title[1]] || 0) + 1;
  }
  return scanned;
}

test('the fixture starts green at the recorded counts on its own suite', () => {
  // Strip the parent runner's NODE_TEST* environment so the child test
  // process actually executes instead of deferring to the parent runner.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key];
  }
  // The fixture's npm script names its test file: a directory positional is
  // not portable across the supported Node range (on v25.7.0 it resolves as
  // a module entry and reports MODULE_NOT_FOUND).
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.scripts.test, 'node --test test/clippings.test.js');
  const run = spawnSync(process.execPath, ['--test', 'test/clippings.test.js'], {
    cwd: FIXTURE,
    encoding: 'utf8',
    env,
  });
  assert.ok(!/recursively/.test(run.stderr), 'child runner must not defer to the parent');
  assert.equal(run.status, 0, `baseline must be green — stderr: ${run.stderr}`);
  const counts = {};
  for (const key of ['tests', 'pass', 'fail']) {
    const match = new RegExp(`^ℹ ${key} (\\d+)$`, 'm').exec(run.stdout);
    assert.ok(match, `${key} count reported`);
    counts[key] = Number(match[1]);
  }
  assert.deepEqual(counts, { tests: 3, pass: 3, fail: 0 });
  assert.doesNotMatch(read('test', 'clippings.test.js'), /\bskip\b|todo\(/i, 'no skipped assertion');
  assert.ok(!fs.existsSync(path.join(FIXTURE, '.ultra')), 'no .ultra at start');
});

test('the facts to be learned exist only in the data bytes, undocumented at start', () => {
  const sample = read('data', 'sample-export.txt');
  const phase2 = fs.readFileSync(OPERATOR_INPUT, 'utf8');
  for (const token of ['墨记导出 v2', '[撤销]']) {
    assert.ok(sample.includes(token), `sample carries ${token}`);
    assert.ok(phase2.includes(token), `phase-2 input carries ${token}`);
  }
  assert.match(sample, /\n   \S/, 'sample carries a three-space continuation line');
  assert.match(phase2, /\n   \S/, 'phase-2 input carries a three-space continuation line');

  // Nothing in the project seed outside data/ may already state the format,
  // the tombstone rule, or the continuation rule — otherwise session 1 would
  // be reading, not learning. The superseded v1 note must not leak them
  // either.
  for (const file of listFiles(FIXTURE)) {
    if (file.startsWith('data/')) continue;
    const body = read(...file.split(path.sep));
    for (const token of ['墨记导出', '[撤销]', '续行']) {
      assert.ok(!body.includes(token), `${file} must not pre-document ${token}`);
    }
  }
  // There is no importer at start: the store exposes append/list/search only.
  assert.deepEqual(Object.keys(require(FIXTURE + '/src/store.js')).sort(), [
    'appendEntry',
    'listEntries',
    'searchEntries',
  ]);
});

test('the write-back target is an existing dated, provenance-carrying log', () => {
  const notes = read('docs', 'tech-notes.md');
  assert.match(notes, /工程事实记录/);
  assert.match(notes, /每条注明日期与出处/);
  assert.match(notes, /任务专有的临时结论不记在这里/);
  assert.match(notes, /^## 2026-08-20 /m, 'one established dated entry');
  assert.match(notes, /出处：/, 'entries carry provenance');
});

test('the authoritative decision is accepted and the counterexamples are unambiguous', () => {
  const decision = read('docs', 'decisions', '2026-08-20-append-only-jsonl.md');
  assert.match(decision, /状态：accepted/);
  assert.ok(decision.includes('data/entries.jsonl') && decision.includes('src/store.js'));

  const outdated = read('docs', 'notes', '2026-05-09-export-format-v1.md');
  assert.match(outdated, /状态：superseded/);
  assert.match(outdated, /不得作为实现依据/);
  // Non-currency is explicit without naming a successor document: the
  // discontinued v1 format defers to the actual export file, which is what
  // session 1 must inspect.
  assert.match(outdated, /以实际导出文件为准/);
  assert.match(outdated, /书名\|作者\|时间\|正文/, 'the v1 pipe format it would wrongly suggest');

  const irrelevant = read('docs', 'notes', '2026-07-03-backup-cadence.md');
  assert.match(irrelevant, /状态：informational/);
  assert.match(irrelevant, /与导入、导出格式或解析逻辑无关/);

  // The actual export bytes are not in the v1 pipe format the note describes.
  for (const body of [read('data', 'sample-export.txt'), fs.readFileSync(OPERATOR_INPUT, 'utf8')]) {
    assert.doesNotMatch(body, /^\S+\|\S+\|\S+\|\S+$/m, 'no v1 pipe line');
  }
});

test('the acceptance oracle derives starting inventory plus both import deltas', () => {
  const seed = scanSeed(read('data', 'entries.jsonl'));
  assert.deepEqual(seed, { total: 2, byBook: { 夜晚的潜水艇: 1, 俗世奇人: 1 } });

  const sample = scanExport(read('data', 'sample-export.txt'));
  assert.deepEqual(sample, {
    blocks: 3,
    valid: 2,
    tombstones: 1,
    continuations: 1,
    byBook: { 夜晚的潜水艇: 2 },
  });
  const phase2 = scanExport(fs.readFileSync(OPERATOR_INPUT, 'utf8'));
  assert.deepEqual(phase2, {
    blocks: 4,
    valid: 3,
    tombstones: 1,
    continuations: 1,
    byBook: { 夜晚的潜水艇: 1, 遥远的向日葵地: 2 },
  });

  // Append-only: the final per-book answer includes the seeds; the import
  // delta is reported separately so "newly imported" and "total" can never
  // be conflated again.
  const final = {};
  for (const scanned of [seed, sample, phase2]) {
    for (const [book, count] of Object.entries(scanned.byBook)) {
      final[book] = (final[book] || 0) + count;
    }
  }
  assert.deepEqual(final, { 夜晚的潜水艇: 4, 俗世奇人: 1, 遥远的向日葵地: 2 });
  assert.equal(seed.total + sample.valid + phase2.valid, 7, 'final inventory total');
  assert.equal(sample.valid + phase2.valid, 5, 'newly imported');
  assert.equal(sample.tombstones + phase2.tombstones, 2, 'tombstones skipped');
});

test('the phase-2 input is withheld from the project seed, byte-level', () => {
  assert.ok(fs.existsSync(OPERATOR_INPUT), 'the operator input lives outside the project seed');
  assert.ok(!fs.existsSync(path.join(FIXTURE, 'data', 'export-2026-09-08.txt')),
    'the file only arrives via the scripted operator action');
  assert.ok(!fs.existsSync(path.join(FIXTURE, 'session2-only')),
    'the r1 in-seed location is gone');
  const phase2Bytes = fs.readFileSync(OPERATOR_INPUT);
  for (const file of listFiles(FIXTURE)) {
    const body = fs.readFileSync(path.join(FIXTURE, file));
    assert.ok(!body.includes('export-2026-09-08'), `${file} must not reference the phase-2 file`);
    assert.ok(!body.equals(phase2Bytes), `${file} must not carry the phase-2 bytes`);
  }
});

test('the model-visible seed is ordinary product documentation, no coaching', () => {
  const files = listFiles(FIXTURE);
  assert.ok(files.length > 0);
  for (const file of files) {
    const body = read(...file.split(path.sep)).toLowerCase();
    for (const token of COACHING_TOKENS) {
      assert.ok(!body.includes(token.toLowerCase()), `${file} contains evaluator term ${token}`);
    }
  }
  // An ordinary project README stays: current behavior, how to run tests,
  // and the normal pointer to the living fact log.
  const readme = read('README.md');
  assert.ok(readme.includes('docs/tech-notes.md'), 'the fact-log pointer survives');
  assert.ok(readme.includes('docs/decisions/2026-08-20-append-only-jsonl.md'), 'the decision pointer survives');
});

test('the addendum pins the same case the fixture supports', () => {
  const addendum = fs.readFileSync(ADDENDUM, 'utf8');
  assert.ok(fs.existsSync(PROTOCOL), 'the inherited protocol file exists');
  assert.ok(addendum.includes('tests/evals/trellis-daily-20260909.json'), 'protocol inherited by reference');
  for (const axis of [
    'source-contract-test',
    'scripted-owner-replay',
    'live-provider-run',
    'live-human-observation',
  ]) {
    assert.ok(addendum.includes(axis), `addendum names evidence class ${axis}`);
  }
  assert.ok(addendum.includes('K3'));
  assert.ok(addendum.includes(SESSION1_MESSAGE), 'session-1 owner message verbatim');
  assert.ok(addendum.includes(SESSION2_MESSAGE), 'session-2 owner message verbatim');
  for (const line of ORACLE_LINES) {
    assert.ok(addendum.includes(line), `addendum states: ${line}`);
  }
  assert.ok(addendum.includes('k3-operator-inputs/export-2026-09-08.txt'),
    'the operator step names the out-of-seed input');
  // The chain is two fresh sessions whose second turn is a real
  // implementation-plus-check, and reading is never scored as consumption.
  for (const marker of ['fresh', '维护原文', '新会话读取', 'material_present_unconsumed', 'material_redundant']) {
    assert.ok(addendum.includes(marker), `addendum keeps ${marker}`);
  }
});
