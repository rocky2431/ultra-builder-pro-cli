'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'tests', 'evals', 'owner-journeys-2026-09-05.json');
const FIXTURE = path.join(ROOT, 'tests', 'evals', 'fixtures', 'journey-c-brownfield');
const REQUIRED_METRICS = new Set([
  'duplicate_questions',
  'missing_necessary_decisions',
  'verified_usable_output',
  'wrong_completion',
  'wrong_refusal',
  'recovery_interruption_observations',
  'machine_wall_time',
  'owner_active_time_or_cost',
]);
const REQUIRED_EVIDENCE_CLASSES = new Set([
  'source-contract-test',
  'scripted-owner-replay',
  'live-provider-run',
  'live-human-observation',
]);

test('the frozen owner-journey spec is complete and self-consistent', () => {
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  assert.equal(spec.$schema, 'ultra-owner-journey-eval-v1');
  assert.equal(spec.eval_id, 'owner-journeys-2026-09-05');
  assert.ok(fs.existsSync(path.join(ROOT, spec.entry_doc)), 'entry doc exists');

  for (const metric of REQUIRED_METRICS) {
    assert.ok(spec.metrics.includes(metric), metric);
  }
  assert.deepEqual(
    Object.keys(spec.metrics_notes).sort(),
    [...REQUIRED_METRICS].sort(),
  );
  for (const evidenceClass of REQUIRED_EVIDENCE_CLASSES) {
    assert.ok(spec.evidence_classes[evidenceClass], evidenceClass);
  }
  for (const record of spec.common_environment.record_before_each_run) {
    assert.ok(record.trim() === record && record.length > 4, record);
  }
  assert.ok(spec.common_environment.record_before_each_run.some((entry) =>
    entry.includes('git rev-parse HEAD')));
  assert.ok(spec.common_environment.abort_rules.length >= 3);
  assert.match(spec.results_policy, /append-only/i);
  assert.match(spec.results_policy, /never supports a general productivity-gain claim|never.*productivity-gain claim/i);

  const journeys = spec.journeys;
  assert.deepEqual(journeys.map((journey) => journey.id), ['A', 'B', 'C']);
  for (const journey of journeys) {
    assert.ok(journey.name_zh, `${journey.id}: name`);
    assert.ok(journey.starting_state, `${journey.id}: starting state`);
    assert.ok(journey.expected_route.length >= 4, `${journey.id}: expected route`);
    assert.ok(journey.acceptance.length >= 4, `${journey.id}: acceptance`);
    assert.ok(journey.duplicate_probe.length >= 1, `${journey.id}: duplicate probe`);
    let previousTurn = 0;
    for (const message of journey.owner_messages) {
      assert.ok(Number.isInteger(message.turn) && message.turn > previousTurn,
        `${journey.id}: turns strictly increasing`);
      assert.ok(message.text.trim().length > 0, `${journey.id}: turn ${message.turn} text`);
      previousTurn = message.turn;
    }
  }
  assert.ok(journeys[1].starting_state.includes("Journey A"), 'journey B chains on A');
  assert.ok(journeys[2].starting_state.includes('journey-c-brownfield'), 'journey C names its fixture');
  assert.deepEqual(journeys[2].missing_probes, []);
});

test('the protocol is runnable before stage acceptance and commit', () => {
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  const environment = spec.common_environment;

  // The frozen object is the uncommitted candidate content, not a commit hash:
  // journeys run before acceptance; the stage commit follows acceptance.
  assert.match(environment.candidate_freeze, /uncommitted/i);
  assert.match(environment.candidate_freeze, /before stage acceptance/i);
  assert.match(environment.candidate_freeze, /commit follows acceptance — never the reverse/i);

  // The content manifest includes the ZCode hook adapter, whose PreToolUse
  // projection the journeys exercise.
  assert.ok(environment.record_before_each_run.some((entry) =>
    entry.includes('hooks/adapters/zcode.py')), 'manifest includes the ZCode adapter');

  // An already configured, owner-authorized provider run — including its
  // native session/receipt caches — is allowed runtime behavior, while the
  // real exclusions stay excluded.
  assert.match(environment.isolation, /native session\/receipt caches/i);
  assert.match(environment.isolation, /not an OS sandbox claim/i);
  const abortRules = environment.abort_rules.join('\n');
  assert.match(abortRules, /already configured provider/);
  assert.match(abortRules, /credential mutation or disclosure/);
  assert.match(abortRules, /purchase or top-up/);
  assert.doesNotMatch(abortRules, /credential use, external spend/i);

  // Scripted owner input and actual provider execution are two orthogonal
  // axes that can hold simultaneously.
  assert.match(spec.evidence_classes['scripted-owner-replay'], /Input-source axis/i);
  assert.match(spec.evidence_classes['scripted-owner-replay'], /Compatible with actual provider execution/i);
  assert.match(spec.evidence_classes['live-provider-run'], /Execution-kind axis/i);
  assert.match(spec.evidence_classes['live-provider-run'], /May be driven by frozen scripted inputs/i);
});

test('installed-copy comparison binds the frozen dual manifest, not raw-source bytes', () => {
  const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  const environment = spec.common_environment;

  // The freeze records the raw source hashes AND the expected generated
  // installed hashes: the canonical adapter re-serializes Skill frontmatter
  // while installing, so that known difference is not drift.
  assert.match(environment.candidate_freeze, /two bound manifests/i);
  assert.match(environment.candidate_freeze, /raw content hashes/i);
  assert.match(environment.candidate_freeze, /expected generated installed hashes/i);
  assert.match(environment.candidate_freeze, /re-serializes Skill frontmatter/i);
  assert.match(environment.candidate_freeze, /legitimately differs in bytes from its raw source/i);

  const manifest = environment.record_before_each_run.find((entry) =>
    entry.includes('git hash-object'));
  assert.ok(manifest, 'hash manifest entry exists');
  assert.match(manifest, /frozen dual manifest/i);
  assert.match(manifest, /verbatim-copied files \(references, hooks\) must equal the frozen source hash/i);
  assert.match(manifest, /expected generated installed hash for the installed host's adapter/i);

  // Abort on an unexpected mismatch against the frozen generated manifest;
  // the adapter's known frontmatter normalization never aborts the journey.
  const driftRule = environment.abort_rules.find((rule) => rule.includes('mismatch'));
  assert.ok(driftRule, 'drift abort rule exists');
  assert.match(driftRule, /unexpected mismatch against the frozen generated manifest/i);
  assert.match(driftRule, /expected generated difference, never drift/i);
  for (const rule of environment.abort_rules) {
    assert.doesNotMatch(rule, /differ from the frozen source/i,
      'the old single-manifest byte-equality rule is gone');
  }
});

test('the journey C fixture stays red: the seeded bug remains reproducible', () => {
  const fixtureFiles = [
    'package.json',
    'src/filter.js',
    'src/export.js',
    'test/month-filter.test.js',
    'test/export-markdown.test.js',
  ];
  for (const file of fixtureFiles) {
    assert.ok(fs.existsSync(path.join(FIXTURE, file)), file);
  }
  // Strip the parent runner's NODE_TEST* environment so the child test
  // process actually executes instead of deferring to the parent runner.
  const env = { ...process.env, TMPDIR: '/tmp' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key];
  }
  // Name the fixture's test files instead of passing the `test/` directory:
  // directory positionals are not portable across the supported Node range
  // (>=22). On v25.7.0 `--test test/` resolves the directory as a module entry
  // and reports MODULE_NOT_FOUND instead of running the seeded failures.
  const fixtureTests = fixtureFiles.filter((file) => file.startsWith('test/'));
  const run = spawnSync(process.execPath, ['--test', ...fixtureTests], {
    cwd: FIXTURE,
    encoding: 'utf8',
    env,
  });
  assert.notEqual(run.status, 0, 'fixture tests must fail while the bug is present');
  assert.ok(!/recursively/.test(run.stderr), 'child runner must not defer to the parent');
  assert.match(run.stdout, /month filter excludes the first day of the next month/);
  assert.match(run.stdout, /failing tests:/);
  assert.match(run.stdout, /ℹ fail [1-9]/);
  assert.match(run.stdout, /markdown export agrees with the month filter boundary/);
});

test('the frozen fixture asserts the boundary without repairing itself', () => {
  const filter = fs.readFileSync(path.join(FIXTURE, 'src', 'filter.js'), 'utf8');
  assert.match(filter, /time <= end/, 'seeded inclusive-end defect must stay until a journey fixes its copy');
  const boundary = fs.readFileSync(path.join(FIXTURE, 'test', 'month-filter.test.js'), 'utf8');
  assert.match(boundary, /Frozen acceptance/);
  assert.doesNotMatch(boundary, /skip|todo\(/i);
});
