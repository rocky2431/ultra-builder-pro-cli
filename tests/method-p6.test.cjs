'use strict';

// M-P6 acceptance for the method (contract: thinking/v6-workflow-review-20261111/RESULT.md,
// A6; spec: REQ-P6-method). Structural only: what the method must contain and where. The
// method's effect is judged by the milestone review and the headless start trials (A7), not
// by these assertions.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'ultra');
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/u, '');
const flat = (text) => text.replace(/\s+/gu, ' ');
const skill = () => read(SKILL_DIR, 'SKILL.md');

function sectionOf(text, heading) {
  const start = text.indexOf(`\n${heading}`);
  assert.ok(start >= 0, `${heading} in the method`);
  const next = text.indexOf('\n## ', start + heading.length + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

// Every stop the drive can return and every refusal of the merge gate that the method
// handled in SKILL.md before M-P6 (engine/FORMATS.md "Drive" and "Merge gate").
const DRIVE_STOPS = ['milestone-gate', 'truth-touched', 'out-of-scope', 'check-touched',
  'ratchet-broken', 'node-not-green', 'history-rewritten', 'writer-left-dirty', 'dirty-tree',
  'attempts-exhausted', 'writer-budget', 'review-exists', 'review-invalid',
  'reviewer-changed-tree', 'scope-missing', 'plan-gate', 'brief-over-budget',
  'checks-not-green', 'blocked', 'drive-running'];
const MERGE_REFUSALS = ['head-moved', 'plan-gate', 'nothing-to-merge', 'merge-busy',
  'merge-conflict', 'truth-changed', 'merged-gate', 'check-not-green', 'fast-forward-failed',
  'dirty-tree'];

test('SKILL.md stays within 395 lines', () => {
  const lines = skill().split('\n');
  const count = lines.length - (lines.at(-1) === '' ? 1 : 0);
  assert.ok(count <= 395, `SKILL.md has ${count} lines`);
});

test('every drive stop and merge refusal is handled in a reference the Skill names', () => {
  const method = skill();
  const named = [...method.matchAll(/`?(references\/[a-z0-9-]+\.md)`?/gu)].map((m) => m[1]);
  for (const file of ['references/drive.md', 'references/merge.md']) {
    assert.ok(named.includes(file), `SKILL.md names ${file}`);
  }
  for (const file of new Set(named)) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, file)), `${file} exists`);
  }
  const drive = read(SKILL_DIR, 'references', 'drive.md');
  const merge = read(SKILL_DIR, 'references', 'merge.md');
  for (const stop of DRIVE_STOPS) assert.ok(drive.includes(`\`${stop}\``), `drive.md: ${stop}`);
  for (const code of MERGE_REFUSALS) assert.ok(merge.includes(`\`${code}\``), `merge.md: ${code}`);
  for (const file of fs.readdirSync(path.join(SKILL_DIR, 'references'))) {
    const text = read(SKILL_DIR, 'references', file);
    assert.ok(!/__UBP_[A-Z_]+__/u.test(text), `${file}: placeholders are replaced only in SKILL.md`);
  }
});

test('the method starts a new or existing project in four steps', () => {
  const method = body(skill());
  assert.match(method, /If `\.ultra\/spec\.md` does not exist[^\n]*"Start"/u);
  const start = flat(sectionOf(method, '## Start'));
  for (const want of ['existing code', '`.ultra/design.md`', '## System', 'invariant',
    'characterization', 'investigat', 'source', 'interview', 'Done when', 'confirm']) {
    assert.ok(start.includes(want), `Start: ${want}`);
  }
  assert.ok(!method.includes('## 0→1 interview'), 'the interview is one step of Start');
});

test('the method says who writes and who reads .ultra/design.md', () => {
  const method = flat(body(skill()));
  const design = flat(sectionOf(body(skill()), '## Project knowledge'));
  for (const want of ['`.ultra/design.md`', 'planner', 'writer', 'brief', 'handoff',
    'ruling', 'cleaner']) {
    assert.ok(design.includes(want), `Project knowledge: ${want}`);
  }
  assert.ok(!method.includes('A brief carries requirement text only'),
    'the brief now carries the shared text and the design');
  const node = flat(sectionOf(body(skill()), '## Node loop'));
  assert.ok(node.includes('`.ultra/design.md`'), 'the controller folds what a node settled into the design');
});

test('the escalation table covers a fact nobody knows', () => {
  const escalation = sectionOf(body(skill()), '## Escalation');
  const rows = escalation.split('\n').filter((line) => line.startsWith('| ')
    && /investigat/u.test(line));
  assert.equal(rows.length, 1, escalation);
  assert.ok(rows[0].includes('`.ultra/design.md`'), rows[0]);
});

test('the milestone review checks the spec against the Owner\'s words and uses the user docs', () => {
  // One set of reviewer instructions, read by the Skill's gate and the example reviewer alike
  // (M-P6 review round 2: three copies had already drifted apart).
  const gate = flat(sectionOf(body(skill()), '## Milestone gate'));
  assert.ok(gate.includes('`references/review.md`'), 'the gate names the review reference');
  const reviewer = read(ROOT, 'docs', 'examples', 'drive', 'claude-reviewer.sh');
  assert.match(reviewer, /cat "\$GUIDE"/u, 'the example reviewer reads the reference');
  assert.match(reviewer, /skills\/ultra\/references\/review\.md/u, reviewer);
  const guide = flat(read(SKILL_DIR, 'references', 'review.md'));
  for (const want of ['.ultra/records/interview.md', 'owner-touches.md', 'documentation',
    '`.ultra/design.md`', 'deliberately broken copies']) {
    assert.ok(guide.includes(want), `review.md: ${want}`);
  }
  const spec = flat(sectionOf(body(skill()), '## Specification and checks'));
  assert.ok(spec.includes('documentation'), 'user documentation is a requirement');
});

test('a behavior an existing test pins changes without stalling earlier nodes', () => {
  // M-P6 review round 2, point 1: the pinned test rewritten red inside the invariant refused
  // every node planned before the change (reproduced by hand and under drive).
  const method = body(skill());
  const start = flat(sectionOf(method, '## Start'));
  for (const want of ['out of the invariant', 'rewritten to the new behavior', 'committed red',
    '"kind": "cleanup"', 'git init', 'not a list of files']) {
    assert.ok(start.includes(want), `Start: ${want}`);
  }
  assert.ok(!start.includes('committed red before the node (L1 modify'), start);
  const changes = sectionOf(method, '## Changes after 0→1');
  const row = changes.split('\n').find((line) => line.startsWith('| a behavior changes'));
  assert.ok(row && row.includes('invariant'), row);
});

test('a project with a spec but no design gets one from a survey, never during a drive', () => {
  const method = body(skill());
  const first = flat(method.slice(method.indexOf('1. `ubp status --json`'), method.indexOf('\n2. ')));
  assert.ok(first.includes('`.ultra/design.md` does not'), first);
  for (const want of ['survey', 'drive']) assert.ok(first.includes(want), `step 1: ${want}`);
});

test('a drive\'s progress reaches the Owner once per line, and the watch ends with the drive',
  () => {
    const drive = flat(read(SKILL_DIR, 'references', 'drive.md'));
    for (const want of ['longest timeout', 'not yet relayed', 'stop the monitor',
      'tail -f .ultra/.runtime/drive.err']) {
      assert.ok(drive.includes(want), `drive.md: ${want}`);
    }
    assert.ok(!drive.includes("grep --line-buffered '^drive: '"), 'problem lines are relayed too');
    assert.ok(!drive.includes('Relay each writer line'), 'every line is relayed, as SKILL.md says');
    // The lock procedure lives with drive-running, in one place.
    for (const want of ['ps -o command=', 'treat the drive as running']) {
      assert.ok(drive.includes(want), `drive.md: ${want}`);
    }
  });

test('待复核 names every edit that causes it', () => {
  const method = flat(body(skill()));
  const sentence = method.slice(method.indexOf('`待复核`:'), method.indexOf('`未绿`:'));
  assert.ok(sentence.includes('shared text'), sentence);
  assert.ok(flat(read(ROOT, 'README.md')).includes('shared text'), 'README.md');
  assert.ok(flat(read(ROOT, 'README.zh-CN.md')).includes('共享文字'), 'README.zh-CN.md');
});

test('the README lists every engine command and the review path close takes', () => {
  // REQ-P6-docs: the README is this product's user documentation.
  const help = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'install.js'), '--help'],
    { encoding: 'utf8' }).stdout;
  const progress = help.slice(help.indexOf('Progress:'), help.indexOf('\n\n', help.indexOf('Progress:')));
  const name = (words) => words.slice(0, words.findIndex((w) => /^[<[-]/u.test(w)) >>> 0).join(' ');
  const engine = progress.split('\n').slice(1).map((line) => name(line.trim().split(/\s{2,}/u)[0]
    .split(' ')).trim()).filter(Boolean).sort();
  assert.ok(engine.length >= 10, progress);
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const text = read(ROOT, file);
    const listed = [...text.matchAll(/^\| `ubp ([^`]+)` \|/gmu)]
      .map((m) => name(m[1].split(' '))).sort();
    assert.deepEqual(listed, engine, file);
    assert.ok(text.includes('.ultra/records/milestones/<id>-review.md'), `${file}: review path`);
  }
});

test('the controller reports the status line after every node and gate step', () => {
  const method = flat(body(skill()));
  assert.match(method, /after every node and every (?:milestone )?gate step/u);
});

test('the example writer never edits .ultra/design.md', () => {
  const writer = read(ROOT, 'docs', 'examples', 'drive', 'claude-writer.sh');
  const never = writer.split('\n').filter((line) => line.includes('Never edit')).join(' ');
  assert.ok(flat(writer).includes('.ultra/design.md'), 'the writer prompt names design.md');
  assert.ok(never.length > 0, writer);
});

test('the installed Skill carries its references', (t) => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p6-config-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-p6-home-'));
  t.after(() => {
    fs.rmSync(config, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const result = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'install.js'), '--claude',
    '--global', '--config-dir', config], { encoding: 'utf8', env: { ...process.env, HOME: home },
    timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = walk(config);
  const skillFile = files.find((f) => path.basename(f) === 'SKILL.md');
  assert.ok(skillFile, files.join('\n'));
  for (const name of ['drive.md', 'merge.md']) {
    assert.ok(fs.existsSync(path.join(path.dirname(skillFile), 'references', name)), name);
  }
});
