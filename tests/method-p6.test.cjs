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
  const gate = flat(sectionOf(body(skill()), '## Milestone gate'));
  const reviewer = flat(read(ROOT, 'docs', 'examples', 'drive', 'claude-reviewer.sh'));
  for (const [name, text] of [['method', gate], ['example reviewer', reviewer]]) {
    for (const want of ['.ultra/records/interview.md', 'owner-touches.md', 'documentation']) {
      assert.ok(text.includes(want), `${name}: ${want}`);
    }
  }
  const spec = flat(sectionOf(body(skill()), '## Specification and checks'));
  assert.ok(spec.includes('documentation'), 'user documentation is a requirement');
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
