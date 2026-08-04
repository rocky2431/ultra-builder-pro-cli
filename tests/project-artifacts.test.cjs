'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ULTRA = path.join(ROOT, '.ultra');

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function headingAnchors(file) {
  return new Set(
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => headingSlug(line.replace(/^#{1,6}\s+/, ''))),
  );
}

function contextStatus(file) {
  const match = fs.readFileSync(file, 'utf8').match(/^> \*\*Status\*\*: ([a-z_]+)/m);
  assert.ok(match, `${path.relative(ROOT, file)} has no status header`);
  return match[1];
}

function changeIntent(changeId) {
  const matches = ['active', 'archive', 'abandoned']
    .map((state) => path.join(ULTRA, 'changes', state, changeId, 'intent.md'))
    .filter((file) => fs.existsSync(file));
  assert.equal(matches.length, 1, `${changeId}: expected exactly one Change intent`);
  return matches[0];
}

test('this repository uses only the canonical v0.26 project layout', () => {
  for (const relative of [
    'project-brief.md',
    'north-star.md',
    'tasks.json',
    'test-report.json',
    'specs/product.md',
    'specs/architecture.md',
    'specs/discovery.md',
    'specs/research-distillate.md',
  ]) {
    assert.ok(fs.existsSync(path.join(ULTRA, relative)), relative);
  }
  const brief = fs.readFileSync(path.join(ULTRA, 'project-brief.md'), 'utf8');
  assert.match(brief, /^## One-line$/m);
  assert.match(brief, /^## Open Questions for Research$/m);
  const northStar = fs.readFileSync(path.join(ULTRA, 'north-star.md'), 'utf8');
  assert.match(northStar, /^## Project Direction$/m);
  assert.match(northStar, /^## North Star Outcome$/m);
  assert.match(northStar, /^## Research Trace$/m);
  assert.doesNotMatch(northStar, /^## One-line$/m);
  assert.ok(fs.existsSync(path.join(ROOT, 'CONTEXT.md')));
  const context = fs.readFileSync(path.join(ROOT, 'CONTEXT.md'), 'utf8');
  for (const heading of ['Language', 'Relationships', 'Flagged ambiguities']) {
    assert.match(context, new RegExp(`^## ${heading}$`, 'm'), heading);
  }
  assert.equal(
    fs.readFileSync(path.join(ULTRA, '.gitignore'), 'utf8'),
    '.runtime/\nprogress/\nreviews/\n',
  );
  for (const directory of ['changes/active', 'changes/archive', 'changes/abandoned', 'contexts', 'decisions', 'evidence', 'research']) {
    assert.ok(fs.statSync(path.join(ULTRA, directory)).isDirectory(), directory);
  }
  for (const retired of ['tasks', 'reports/templates', 'docs/research', '.runtime/state.db']) {
    assert.equal(fs.existsSync(path.join(ULTRA, retired)), false, retired);
  }
  for (const file of [
    path.join(ULTRA, 'specs', 'product.md'),
    path.join(ULTRA, 'specs', 'architecture.md'),
    path.join(ULTRA, 'specs', 'discovery.md'),
    path.join(ULTRA, 'specs', 'research-distillate.md'),
  ]) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /source:\s*\.ultra\/\.runtime\/state\.db|Gap ids? from `?\.ultra\/\.runtime\/state\.db/i);
  }

  const distillate = fs.readFileSync(path.join(ULTRA, 'specs', 'research-distillate.md'), 'utf8');
  const sourceRevisions = [...distillate.matchAll(
    /^\| `(\.ultra\/specs\/(?:product|architecture|discovery)\.md)` \| `([0-9a-f]{40})` \|/gmu,
  )];
  assert.equal(sourceRevisions.length, 3, 'distillate must bind all three baseline specifications');
  for (const [, relative, expected] of sourceRevisions) {
    const actual = execFileSync('git', ['hash-object', relative], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.equal(expected, actual, `${relative}: stale distillate hash`);
  }
});

test('task ledger, contexts, dependencies, traces, and active Change cross-resolve', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  assert.deepEqual(Object.keys(ledger), ['tasks']);
  assert.ok(Array.isArray(ledger.tasks) && ledger.tasks.length > 0);

  const ids = new Set(ledger.tasks.map((task) => task.id));
  assert.equal(ids.size, ledger.tasks.length, 'task ids must be unique');
  const byId = new Map(ledger.tasks.map((task) => [task.id, task]));
  const contextPaths = [];
  for (const task of ledger.tasks) {
    assert.deepEqual(Object.keys(task).sort(), [
      'change_id', 'complexity', 'context_file', 'dependencies', 'id', 'priority',
      'status', 'title', 'trace_to', 'type',
    ]);
    assert.match(task.change_id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, `${task.id}: invalid change_id`);
    assert.ok(['pending', 'in_progress', 'completed'].includes(task.status), task.id);
    assert.ok(task.complexity <= 7, `${task.id}: must split above complexity 7`);
    for (const dependency of task.dependencies) {
      assert.ok(ids.has(dependency), `${task.id}: ${dependency}`);
      assert.equal(
        byId.get(dependency).change_id,
        task.change_id,
        `${task.id}: dependency ${dependency} crosses a Change boundary`,
      );
    }

    const context = path.join(ROOT, task.context_file);
    contextPaths.push(path.resolve(context));
    assert.ok(fs.existsSync(context), `${task.id}: missing context`);
    assert.equal(contextStatus(context), task.status, `${task.id}: ledger/context status mismatch`);
    assert.match(fs.readFileSync(context, 'utf8'), /^## Resume Note$/m, `${task.id}: missing Resume Note`);
    assert.ok(fs.existsSync(changeIntent(task.change_id)), `${task.id}: missing Change`);

    const [tracePath, anchor] = task.trace_to.split('#');
    const traceFile = path.join(ROOT, tracePath);
    assert.ok(fs.existsSync(traceFile), `${task.id}: missing trace file`);
    assert.ok(anchor && headingAnchors(traceFile).has(anchor), `${task.id}: missing trace anchor ${anchor}`);
  }

  const currentContexts = fs.readdirSync(path.join(ULTRA, 'contexts'))
    .filter((name) => name.startsWith('task-') && name.endsWith('.md'))
    .map((name) => path.resolve(path.join(ULTRA, 'contexts', name)))
    .sort();
  assert.deepEqual([...new Set(contextPaths)].sort(), currentContexts, 'orphan or missing task context');

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    assert.equal(visiting.has(id), false, `task dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);

  const activeRoot = path.join(ULTRA, 'changes', 'active');
  const active = fs.readdirSync(activeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(activeRoot, entry.name, 'intent.md'));
  assert.ok(active.length <= 1, 'at most one active Change may exist');
  const changeIds = [...new Set(ledger.tasks.map((task) => task.change_id))];
  for (const changeId of changeIds) {
    const intentPath = changeIntent(changeId);
    const state = path.basename(path.dirname(path.dirname(intentPath)));
    const changeTasks = ledger.tasks.filter((task) => task.change_id === changeId);
    if (state === 'archive') {
      assert.ok(changeTasks.every((task) => task.status === 'completed'), `${changeId}: archived with unfinished tasks`);
      assert.ok(fs.existsSync(path.join(path.dirname(intentPath), 'delivery.md')));
    }
    const intent = fs.readFileSync(intentPath, 'utf8');
    if (state === 'abandoned') assert.match(intent, /^## Abandonment$/m, `${changeId}: Abandonment`);
    for (const heading of [
      'Outcome', 'Acceptance', 'Non-goals', 'Public Seams', 'Reconciliation',
      'Research Disposition', 'Planning Posture', 'Recovery', 'Unresolved Decisions',
    ]) {
      assert.match(intent, new RegExp(`^## ${heading}$`, 'm'), `${changeId}: ${heading}`);
    }
  }
});

test('retired custom-agent methods have explicit portable Skill homes', () => {
  const architecture = fs.readFileSync(path.join(ULTRA, 'specs', 'architecture.md'), 'utf8');
  const mappings = {
    'review-code': 'skills/ultra-review/references/code.md',
    'review-design': 'skills/ultra-review/references/design.md',
    'review-errors': 'skills/ultra-review/references/errors.md',
    'review-tests': 'skills/ultra-review/references/tests.md',
    'review-spec': 'skills/ultra-review/references/spec.md',
    'review-comments': 'skills/ultra-review/references/comments.md',
    debugger: 'skills/ultra-dev/references/debugging.md',
    'tdd-runner': 'skills/ultra-tdd/references/test-execution.md',
  };
  for (const [retired, current] of Object.entries(mappings)) {
    assert.match(architecture, new RegExp(`\\b${retired}\\b`), retired);
    assert.ok(fs.existsSync(path.join(ROOT, current)), current);
  }
  assert.match(architecture, /review-coordinator/);
  assert.match(architecture, /code-reviewer/);
  assert.equal(fs.existsSync(path.join(ROOT, 'agents')), false);
});

test('every completed task has one canonical six-dimension evidence record', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  const dimensions = [
    'feature_flags_audit',
    'persistence_real',
    'spec_trace',
    'tests_passed',
    'tests_written',
    'vertical_slice',
  ];
  const expected = ledger.tasks
    .filter((task) => task.status === 'completed')
    .map((task) => task.id)
    .sort();
  const actual = fs.readdirSync(path.join(ULTRA, 'evidence'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(actual, expected, 'orphan or missing completed-task evidence directory');

  for (const taskId of expected) {
    const relative = path.join('.ultra', 'evidence', taskId, 'evidence.json');
    const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    assert.equal(evidence.$schema, 'ultra-task-evidence-v1', relative);
    assert.equal(evidence.task_id, taskId, relative);
    assert.match(evidence.git_head, /^[0-9a-f]{40}$/, relative);
    assert.ok(Array.isArray(evidence.commands) && evidence.commands.length > 0, relative);
    for (const command of evidence.commands) {
      assert.deepEqual(Object.keys(command).sort(), ['command', 'evidence_ref', 'exit_code'], relative);
      assert.equal(typeof command.command, 'string', relative);
      assert.ok(command.command.length > 0, relative);
      assert.ok(Number.isInteger(command.exit_code), relative);
      assert.equal(typeof command.evidence_ref, 'string', relative);
      assert.ok(command.evidence_ref.length > 0, relative);
    }
    assert.deepEqual(Object.keys(evidence.dimensions).sort(), dimensions, relative);
    for (const dimension of Object.values(evidence.dimensions)) {
      assert.ok(['satisfied', 'gap', 'not_applicable'].includes(dimension.status), relative);
      assert.ok(Array.isArray(dimension.evidence_refs), relative);
      assert.equal(typeof dimension.rationale, 'string', relative);
      assert.ok(dimension.rationale.length > 0, relative);
    }
    assert.ok(Array.isArray(evidence.artifacts) && evidence.artifacts.length > 0, relative);
    for (const artifact of evidence.artifacts) {
      assert.equal(typeof artifact, 'string', relative);
      assert.ok(fs.existsSync(path.join(ROOT, artifact)), `${relative}: missing artifact ${artifact}`);
    }
    assert.ok(Array.isArray(evidence.limitations), relative);
    assert.ok(evidence.limitations.every((item) => typeof item === 'string' && item.length > 0), relative);
    assert.match(evidence.timestamp, /^\d{4}-\d{2}-\d{2}T/, relative);
  }
});

test('the recorded test report has a complete schema and matches its task snapshot', () => {
  const ledger = JSON.parse(fs.readFileSync(path.join(ULTRA, 'tasks.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(ULTRA, 'test-report.json'), 'utf8'));
  assert.equal(report.$schema, 'ultra-test-report-v1');
  assert.equal(report.change_id, 'chg-converge');
  const currentTasks = ledger.tasks.filter((task) => task.change_id === report.change_id);
  assert.deepEqual(report.task_ids, currentTasks.map((task) => task.id));
  assert.match(report.git_commit, /^[0-9a-f]{40}$/);
  assert.match(report.intent_digest, /^[0-9a-f]{64}$/);
  assert.equal(
    report.intent_digest,
    crypto.createHash('sha256').update(fs.readFileSync(changeIntent(report.change_id))).digest('hex'),
  );
  assert.equal(typeof report.worktree.dirty, 'boolean');
  assert.match(report.worktree.diff_digest, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(report.commands) && report.commands.length > 0);
  for (const command of report.commands) {
    assert.deepEqual(Object.keys(command).sort(), ['command', 'evidence_ref', 'exit_code']);
    assert.equal(typeof command.command, 'string');
    assert.ok(Number.isInteger(command.exit_code));
    assert.equal(typeof command.evidence_ref, 'string');
  }
  assert.deepEqual(Object.keys(report.areas).sort(), [
    'anti_patterns', 'coverage_gaps', 'e2e', 'performance', 'security', 'wiring',
  ]);
  const allCompleted = currentTasks.every((task) => task.status === 'completed');
  for (const area of Object.values(report.areas)) {
    assert.ok(['passed', 'gap', 'not_applicable', 'not_run'].includes(area.status));
    assert.ok(Array.isArray(area.evidence_refs));
    assert.ok(Array.isArray(area.omissions));
    if (report.passed) assert.notEqual(area.status, 'not_run');
  }
  for (const field of ['verified_seams', 'findings', 'omissions', 'residual_risks', 'owner_disposition']) {
    assert.ok(Array.isArray(report[field]), field);
  }
  if (report.passed) assert.equal(allCompleted, true);
  assert.ok(Number.isInteger(report.run_count) && report.run_count > 0);
  assert.match(report.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
