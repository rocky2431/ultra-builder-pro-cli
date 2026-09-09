'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SPEC = path.join(ROOT, 'tests', 'evals', 'trellis-daily-20260909.json');
const FIXTURE_ROOT = path.join(ROOT, 'tests', 'evals', 'fixtures', 'trellis-daily-20260909');

// The metric set is inherited from owner-journeys-2026-09-05 on purpose: this
// step adds task families, not a new evaluator framework.
const REQUIRED_METRICS = [
  'duplicate_questions',
  'missing_necessary_decisions',
  'verified_usable_output',
  'wrong_completion',
  'wrong_refusal',
  'recovery_interruption_observations',
  'machine_wall_time',
  'owner_active_time_or_cost',
];
const REQUIRED_BUCKETS = [
  'entry_not_loaded',
  'wrong_route_selected',
  'material_missing',
  'material_present_unconsumed',
  'material_redundant',
  'closeout_repetitive',
  'undetermined',
];
const FREEZE_FIELDS = [
  'baseline',
  'source_manifest',
  'generated_manifest',
  'verbatim_files',
  'generated_files',
  'ordering',
  'mismatch_action',
];

// Real starting states, measured by running each fixture's own suite.
const FIXTURE_STATES = {
  'f1-csv-quoting': {
    tests: 6,
    pass: 4,
    fail: 2,
    files: ['test/csv-quoting.test.js', 'test/report-consistency.test.js'],
  },
  'f1r-note-slugs': {
    tests: 5,
    pass: 2,
    fail: 3,
    files: ['test/slug.test.js', 'test/filenames.test.js'],
  },
  'f3-money-split': {
    tests: 3,
    pass: 3,
    fail: 0,
    files: ['test/money.test.js'],
  },
  'f3r-utc-events': {
    tests: 3,
    pass: 3,
    fail: 0,
    files: ['test/event-log.test.js'],
  },
};

function readSpec() {
  return JSON.parse(fs.readFileSync(SPEC, 'utf8'));
}

function allCases(spec) {
  return spec.families.flatMap((family) => [family.development_case, family.reserved_case]);
}

function caseByFixtureName(spec) {
  return new Map(
    allCases(spec)
      .filter((evalCase) => evalCase.fixture)
      .map((evalCase) => [path.basename(evalCase.fixture), evalCase]),
  );
}

function turnGroups(evalCase) {
  if (evalCase.owner_messages) return [evalCase.owner_messages];
  return evalCase.sessions.map((session) => session.owner_messages);
}

function runFixtureSuite(name, files = FIXTURE_STATES[name].files) {
  // Strip the parent runner's NODE_TEST* environment so the child test
  // process actually executes instead of deferring to the parent runner.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key];
  }
  // Name the fixture's test files instead of passing the `test/` directory:
  // a directory positional is not portable across the supported Node range
  // (on v25.7.0 it resolves as a module entry and reports MODULE_NOT_FOUND).
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(FIXTURE_ROOT, name, file)), `${name}/${file}`);
  }
  const run = spawnSync(process.execPath, ['--test', ...files], {
    cwd: path.join(FIXTURE_ROOT, name),
    encoding: 'utf8',
    env,
  });
  assert.ok(!/recursively/.test(run.stderr), `${name}: child runner must not defer to the parent`);
  const counts = {};
  for (const key of ['tests', 'pass', 'fail']) {
    const match = new RegExp(`^ℹ ${key} (\\d+)$`, 'm').exec(run.stdout);
    assert.ok(match, `${name}: ${key} count reported — stderr: ${run.stderr}`);
    counts[key] = Number(match[1]);
  }
  return { run, counts };
}

test('the spec names its own references, metrics and diagnosis buckets', () => {
  const spec = readSpec();
  assert.equal(spec.$schema, 'ultra-daily-workflow-eval-v1');
  assert.equal(spec.eval_id, 'trellis-daily-20260909');
  assert.equal(spec.relation_to_prior_eval.prior_eval_id, 'owner-journeys-2026-09-05');
  for (const reference of [
    spec.handover_doc,
    spec.authorization,
    spec.relation_to_prior_eval.prior_entry_doc,
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, reference)), reference);
  }

  assert.deepEqual([...spec.metrics].sort(), [...REQUIRED_METRICS].sort());
  assert.deepEqual(Object.keys(spec.metrics_notes).sort(), [...REQUIRED_METRICS].sort());
  assert.deepEqual(Object.keys(spec.diagnosis_buckets).sort(), [...REQUIRED_BUCKETS].sort());
  assert.ok(spec.not_claimed.length >= 3, 'the bounded-claim list is present');
  assert.ok(typeof spec.results_policy === 'string' && spec.results_policy.length > 0);
});

test('the inherited evidence axes stay orthogonal', () => {
  const classes = readSpec().evidence_classes;
  assert.deepEqual(Object.keys(classes).sort(), [
    'live-human-observation',
    'live-provider-run',
    'scripted-owner-replay',
    'source-contract-test',
  ]);
  for (const [name, entry] of Object.entries(classes)) {
    assert.ok(entry.axis && entry.value && entry.definition, `${name}: axis, value, definition`);
  }

  // Scripted owner input and actual provider execution are different axes
  // that can hold at the same time; human observation is neither of them.
  assert.equal(classes['scripted-owner-replay'].axis, 'input-source');
  assert.equal(classes['live-provider-run'].axis, 'execution-kind');
  assert.equal(classes['source-contract-test'].axis, 'execution-kind');
  assert.ok(classes['scripted-owner-replay'].compatible_with.includes('live-provider-run'));
  assert.ok(classes['live-provider-run'].compatible_with.includes('scripted-owner-replay'));
  assert.equal(classes['live-human-observation'].axis, 'input-source-and-judgment');
  assert.notEqual(
    classes['live-human-observation'].axis,
    classes['scripted-owner-replay'].axis,
    'a scripted run is never live human observation',
  );
});

test('candidate identity binds source and generated-install manifests separately', () => {
  const environment = readSpec().common_environment;
  assert.deepEqual(Object.keys(environment.candidate_freeze).sort(), [...FREEZE_FIELDS].sort());
  for (const [field, value] of Object.entries(environment.candidate_freeze)) {
    assert.ok(typeof value === 'string' && value.trim().length > 0, field);
  }
  // The verbatim-copy rule and the adapter-generated rule are distinct, so a
  // normalized SKILL.md is never judged against raw source bytes.
  assert.notEqual(
    environment.candidate_freeze.verbatim_files,
    environment.candidate_freeze.generated_files,
  );

  assert.ok(environment.record_before_each_run.length >= 5);
  assert.ok(environment.abort_rules.length >= 4);
  for (const entry of [...environment.record_before_each_run, ...environment.abort_rules]) {
    assert.ok(typeof entry === 'string' && entry.trim() === entry && entry.length > 4, entry);
  }
  assert.ok(typeof environment.isolation === 'string' && environment.isolation.length > 0);
  assert.ok(typeof environment.same_conditions === 'string' && environment.same_conditions.length > 0);
});

test('each family separates one development case from one reserved case', () => {
  const spec = readSpec();
  assert.deepEqual(spec.families.map((family) => family.family_id), ['F1', 'F2', 'F3']);

  // The exposure boundary names who may read reserved material and who may
  // not, and does not require inventing a repair before a reserved check.
  for (const field of [
    'rule',
    'reserved_precondition',
    'authorized_readers',
    'withheld_from',
    'exposure_record',
  ]) {
    assert.ok(spec.case_separation[field], `case_separation.${field}`);
  }

  const seenFixtures = new Set();
  const seenCaseIds = new Set();
  for (const family of spec.families) {
    assert.ok(family.name_zh && family.shape, `${family.family_id}: shape`);
    assert.ok(family.diagnostic_focus.length >= 3, `${family.family_id}: diagnostic focus`);
    for (const bucket of family.diagnostic_focus) {
      assert.ok(REQUIRED_BUCKETS.includes(bucket), `${family.family_id}: known bucket ${bucket}`);
    }
    assert.equal(family.development_case.run_status, 'ready-to-run');
    assert.equal(family.reserved_case.run_status, 'reserved-not-run');
    assert.ok(family.reserved_case.hold_condition, `${family.family_id}: reserved hold condition`);
    assert.ok(!('hold_condition' in family.development_case),
      `${family.family_id}: the development case is not held`);
  }

  for (const family of spec.families) {
    for (const evalCase of [family.development_case, family.reserved_case]) {
      assert.ok(evalCase.case_id.startsWith(`${family.family_id}-`), evalCase.case_id);
      assert.ok(!seenCaseIds.has(evalCase.case_id), `unique case id ${evalCase.case_id}`);
      seenCaseIds.add(evalCase.case_id);

      assert.ok(evalCase.starting_state, `${evalCase.case_id}: starting state`);
      assert.ok(evalCase.acceptance.length >= 4, `${evalCase.case_id}: acceptance`);
      assert.ok(evalCase.duplicate_probe.length >= 1, `${evalCase.case_id}: duplicate probe`);
      assert.ok(Array.isArray(evalCase.missing_probes), `${evalCase.case_id}: missing probes`);
      for (const axis of ['scripted-owner-replay', 'live-provider-run']) {
        assert.ok(evalCase.required_evidence.includes(axis), `${evalCase.case_id}: ${axis}`);
      }

      for (const messages of turnGroups(evalCase)) {
        assert.ok(messages.length >= 1, `${evalCase.case_id}: has owner messages`);
        let previousTurn = 0;
        for (const message of messages) {
          assert.ok(Number.isInteger(message.turn) && message.turn > previousTurn,
            `${evalCase.case_id}: turns strictly increasing`);
          assert.ok(message.text.trim().length > 0,
            `${evalCase.case_id}: turn ${message.turn} text`);
          previousTurn = message.turn;
        }
      }

      if (evalCase.fixture === null) continue;
      assert.ok(!seenFixtures.has(evalCase.fixture), `fixtures are disjoint: ${evalCase.fixture}`);
      seenFixtures.add(evalCase.fixture);
      assert.ok(fs.existsSync(path.join(ROOT, evalCase.fixture)), evalCase.fixture);
    }
  }
  assert.equal(seenFixtures.size, Object.keys(FIXTURE_STATES).length);
});

test('the ambiguous greenfield cases score evidence, not question count or method', () => {
  const family = readSpec().families.find((entry) => entry.family_id === 'F2');
  for (const evalCase of [family.development_case, family.reserved_case]) {
    assert.equal(evalCase.fixture, null, `${evalCase.case_id}: greenfield starts empty`);
    assert.equal(evalCase.owner_messages.length, 1, `${evalCase.case_id}: one ambiguous opener`);

    assert.ok(evalCase.owner_answer_script.length >= 2, `${evalCase.case_id}: answer script`);
    for (const entry of evalCase.owner_answer_script) {
      assert.ok(entry.resolves && entry.answer.trim().length > 0, `${evalCase.case_id}: answer entry`);
      assert.ok(entry.matches_question_about.length >= 2, `${evalCase.case_id}: match hints`);
    }
    // The first entry settles the product-use uncertainty and is the one
    // missing_probes holds the run to.
    assert.match(evalCase.owner_answer_script[0].resolves, /product use/i);
    assert.equal(evalCase.missing_probes.length, 1, `${evalCase.case_id}: one required probe`);

    // A "you decide" deflection covers ordinary technical choices only; it
    // never substitutes for an unsettled material owner decision.
    for (const field of [
      'covers',
      'does_not_cover',
      'on_unscripted_material_question',
      'reproducibility',
    ]) {
      assert.ok(evalCase.out_of_script_policy[field], `${evalCase.case_id}: out_of_script.${field}`);
    }

    // Rejected acceptance criteria must not come back: no round threshold,
    // and no interface prohibition while interface choice is unscored.
    assert.ok(evalCase.legitimate_further_questions, `${evalCase.case_id}: further questions allowed`);
    const mustNotRequire = evalCase.must_not_require.join('\n');
    assert.doesNotMatch(mustNotRequire, /clarification round|more than one|web UI|interface/i,
      `${evalCase.case_id}: no question-count or interface criterion`);
    assert.ok(evalCase.not_scored.length > 0, `${evalCase.case_id}: unscored method choices`);
    assert.ok(evalCase.acceptance.some((item) => /must_not_require/.test(item)),
      `${evalCase.case_id}: acceptance binds must_not_require`);
  }
});

test('the iterative cases carry authoritative facts plus unambiguous counterexamples', () => {
  const family = readSpec().families.find((entry) => entry.family_id === 'F3');
  for (const evalCase of [family.development_case, family.reserved_case]) {
    const decisionPath = /docs\/decisions\/[\w.-]+\.md/.exec(evalCase.authoritative_source)[0];
    const decision = fs.readFileSync(path.join(ROOT, evalCase.fixture, decisionPath), 'utf8');
    assert.match(decision, /状态：accepted/, `${evalCase.case_id}: decision is accepted`);

    const kinds = evalCase.counterexamples.map((entry) => entry.kind).sort();
    assert.deepEqual(kinds, ['irrelevant', 'outdated'], `${evalCase.case_id}: both counterexamples`);
    for (const counterexample of evalCase.counterexamples) {
      const body = fs.readFileSync(path.join(ROOT, evalCase.fixture, counterexample.path), 'utf8');
      if (counterexample.kind === 'outdated') {
        // Currency is unambiguous in both directions: the note names its
        // successor and the accepted decision names the note it supersedes.
        assert.match(body, /状态：superseded by/, counterexample.path);
        assert.ok(body.includes(decisionPath), `${counterexample.path} names its successor`);
        assert.ok(decision.includes(counterexample.path), `${decisionPath} names what it supersedes`);
        assert.ok(counterexample.wrong_behavior_it_would_produce, counterexample.path);
      } else {
        assert.match(body, /状态：informational/, counterexample.path);
      }
    }

    // A fresh follow-up session must consume the facts through the files
    // alone, and reading a file is never scored as consumption.
    assert.equal(evalCase.sessions.length, 2, `${evalCase.case_id}: two sessions`);
    for (const session of evalCase.sessions) {
      assert.equal(session.fresh_session, true, `${evalCase.case_id}: session ${session.session} is fresh`);
    }
    assert.ok(evalCase.sessions[1].carries_over, `${evalCase.case_id}: what session 2 inherits`);
    for (const bucket of ['material_present_unconsumed', 'material_missing', 'material_redundant']) {
      assert.ok(evalCase.consumption_observation.includes(bucket),
        `${evalCase.case_id}: consumption maps to ${bucket}`);
    }
  }
});

test('the two red fixtures reproduce their seeded defect at the recorded counts', () => {
  const byFixture = caseByFixtureName(readSpec());
  for (const name of ['f1-csv-quoting', 'f1r-note-slugs']) {
    const expected = FIXTURE_STATES[name];
    const { run, counts } = runFixtureSuite(name);
    assert.notEqual(run.status, 0, `${name}: must fail while the defect is present`);
    assert.deepEqual(
      counts,
      { tests: expected.tests, pass: expected.pass, fail: expected.fail },
      `${name}: recorded starting state`,
    );
    assert.match(
      byFixture.get(name).starting_state,
      new RegExp(`${expected.tests} tests, ${expected.pass} pass, ${expected.fail} fail`),
      `${name}: the spec states the measured counts`,
    );
  }
});

test('the two green fixtures start green at the recorded counts', () => {
  const byFixture = caseByFixtureName(readSpec());
  for (const name of ['f3-money-split', 'f3r-utc-events']) {
    const expected = FIXTURE_STATES[name];
    const { run, counts } = runFixtureSuite(name);
    assert.equal(run.status, 0, `${name}: baseline must be green`);
    assert.deepEqual(
      counts,
      { tests: expected.tests, pass: expected.pass, fail: expected.fail },
      `${name}: recorded starting state`,
    );
    assert.match(
      byFixture.get(name).starting_state,
      new RegExp(`${expected.tests} tests, ${expected.pass} pass`),
      `${name}: the spec states the measured counts`,
    );
  }
});

test('the frozen fixtures assert their acceptance without repairing themselves', () => {
  const read = (...parts) => fs.readFileSync(path.join(FIXTURE_ROOT, ...parts), 'utf8');

  // Seeded defect 1: the row serializer does not treat `"` as needing quotes
  // and never doubles an inner quote.
  const csv = read('f1-csv-quoting', 'src', 'csv.js');
  assert.match(csv, /NEEDS_QUOTES = \/\[,\\n\\r\]\//, 'seeded quote defect must stay');
  assert.doesNotMatch(csv, /replace\(\/"\/g/, 'seeded quote defect must stay unrepaired');
  // The sibling consumer shares the serializer, so one repair fixes both.
  assert.match(read('f1-csv-quoting', 'src', 'report.js'), /require\('\.\/csv'\)/);

  // Seeded defect 2: a fully non-ASCII title collapses to an empty slug.
  const slug = read('f1r-note-slugs', 'src', 'slug.js');
  assert.match(slug, /\[\^a-z0-9\]\+/, 'seeded slug defect must stay');
  assert.doesNotMatch(slug, /createHash|normalize\(/, 'seeded slug defect must stay unrepaired');
  assert.match(read('f1r-note-slugs', 'src', 'filenames.js'), /require\('\.\/slug'\)/);

  for (const [fixture, state] of Object.entries(FIXTURE_STATES)) {
    for (const file of state.files) {
      const body = read(fixture, file);
      assert.match(body, /Frozen/, `${fixture}/${file}: frozen intent stated`);
      assert.doesNotMatch(body, /\bskip\b|todo\(/i, `${fixture}/${file}: no skipped assertion`);
    }
    // The fixture's own npm script names its test files for the same
    // portability reason, so `npm test` inside a copy stays runnable.
    const manifest = JSON.parse(read(fixture, 'package.json'));
    assert.equal(manifest.scripts.test, `node --test ${state.files.join(' ')}`,
      `${fixture}: portable test script`);
  }
});

// The public-entry confirmation copy documented in
// work/trellis-eight-step-20260909/step2-public-entry-evaluation.zh-CN.md.
// It is an explicitly versioned working copy of the F1-res fixture whose
// README drops the evaluator-only preservation instructions that the recorded
// trial showed leaking into the evaluated session. It is a separate case: the
// original fixture, its case id and its criteria stay untouched above.
const WORKCOPY = 'f1r-note-slugs-workcopy-v1';
const WORKCOPY_SOURCE = 'f1r-note-slugs';

test('the public-entry working copy keeps the product surface and the red start', () => {
  const state = FIXTURE_STATES[WORKCOPY_SOURCE];
  const read = (fixture, file) => fs.readFileSync(path.join(FIXTURE_ROOT, fixture, file), 'utf8');

  // Product surface byte-identical: same sources, same frozen assertions, same script.
  for (const file of ['package.json', 'src/slug.js', 'src/filenames.js', ...state.files]) {
    assert.equal(read(WORKCOPY, file), read(WORKCOPY_SOURCE, file),
      `${WORKCOPY}/${file} must be byte-identical to the original`);
  }

  // Only the README differs, and only by dropping the evaluator-only framing
  // while keeping every product constraint.
  const readme = read(WORKCOPY, 'README.md');
  assert.notEqual(readme, read(WORKCOPY_SOURCE, 'README.md'));
  assert.doesNotMatch(readme, /reserved|held back|un-tuned|never repair it in place|frozen|seeded/i,
    'evaluator-only framing must be gone');
  assert.doesNotMatch(readme, /trellis-daily-20260909\.json/, 'no pointer back to the eval spec');
  assert.match(readme, /without editing\s+any assertion/, 'product constraint kept');
  assert.match(readme, /changes existing slugs is not acceptable/, 'product constraint kept');

  // Same measured starting state as the original: 5 tests, 2 pass, 3 fail.
  const { run, counts } = runFixtureSuite(WORKCOPY, state.files);
  assert.notEqual(run.status, 0, `${WORKCOPY}: must start red`);
  assert.deepEqual(
    counts,
    { tests: state.tests, pass: state.pass, fail: state.fail },
    `${WORKCOPY}: recorded starting state`,
  );
});
