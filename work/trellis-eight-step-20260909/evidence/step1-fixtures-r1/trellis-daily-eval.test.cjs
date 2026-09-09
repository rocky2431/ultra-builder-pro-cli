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
const REQUIRED_BUCKETS = new Set([
  'entry_not_loaded',
  'wrong_route_selected',
  'material_missing',
  'material_present_unconsumed',
  'material_redundant',
  'closeout_repetitive',
  'undetermined',
]);

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
  return spec.families.flatMap((family) => [
    { family, kind: 'development_case', value: family.development_case },
    { family, kind: 'reserved_case', value: family.reserved_case },
  ]);
}

function turnsOf(evalCase) {
  if (evalCase.owner_messages) return [evalCase.owner_messages];
  return evalCase.sessions.map((session) => session.owner_messages);
}

function runFixtureSuite(name) {
  // Strip the parent runner's NODE_TEST* environment so the child test
  // process actually executes instead of deferring to the parent runner.
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) delete env[key];
  }
  // Name the fixture's test files instead of passing the `test/` directory:
  // a directory positional is not portable across the supported Node range.
  const files = FIXTURE_STATES[name].files;
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
    assert.ok(match, `${name}: ${key} count reported`);
    counts[key] = Number(match[1]);
  }
  return { run, counts };
}

test('the frozen daily-workflow spec is complete and self-consistent', () => {
  const spec = readSpec();
  assert.equal(spec.$schema, 'ultra-daily-workflow-eval-v1');
  assert.equal(spec.eval_id, 'trellis-daily-20260909');
  for (const reference of [spec.handover_doc, spec.authorization, spec.relation_to_prior_eval.prior_entry_doc]) {
    assert.ok(fs.existsSync(path.join(ROOT, reference)), reference);
  }

  for (const metric of REQUIRED_METRICS) {
    assert.ok(spec.metrics.includes(metric), metric);
  }
  assert.deepEqual(Object.keys(spec.metrics_notes).sort(), [...REQUIRED_METRICS].sort());
  for (const evidenceClass of REQUIRED_EVIDENCE_CLASSES) {
    assert.ok(spec.evidence_classes[evidenceClass], evidenceClass);
  }
  assert.deepEqual(Object.keys(spec.diagnosis_buckets).sort(), [...REQUIRED_BUCKETS].sort());
  for (const definition of Object.values(spec.diagnosis_buckets)) {
    assert.ok(definition.length > 40, definition);
  }

  assert.ok(spec.common_environment.record_before_each_run.length >= 5);
  assert.ok(spec.common_environment.record_before_each_run.some((entry) =>
    entry.includes('git rev-parse HEAD')));
  assert.ok(spec.common_environment.abort_rules.length >= 4);
  assert.match(spec.results_policy, /append-only/i);
  assert.match(spec.results_policy, /never supports a general productivity-gain claim/i);
  assert.match(spec.results_policy, /undetermined/);
});

test('the inherited evidence axes stay orthogonal and the claims stay bounded', () => {
  const spec = readSpec();

  // Scripted owner input and actual provider execution are two orthogonal
  // axes that can hold simultaneously; neither is live human judgment.
  assert.match(spec.evidence_classes['scripted-owner-replay'], /Input-source axis/i);
  assert.match(spec.evidence_classes['scripted-owner-replay'], /never as evidence of live human behavior/i);
  assert.match(spec.evidence_classes['live-provider-run'], /Execution-kind axis/i);
  assert.match(spec.evidence_classes['live-provider-run'], /May be driven by frozen scripted inputs/i);
  assert.match(spec.evidence_classes['live-human-observation'], /Never simulated by the scripted inputs/i);
  assert.match(spec.evidence_classes['source-contract-test'], /No model in the loop/i);

  // Authoring fixtures is not a product improvement, and the prior accepted
  // journeys are not rerun or restated here.
  const notClaimed = spec.not_claimed.join('\n');
  assert.match(notClaimed, /Only an executed run/i);
  assert.match(notClaimed, /not statistical sufficiency/i);
  assert.match(notClaimed, /supports no productivity claim/i);
  assert.equal(spec.relation_to_prior_eval.prior_eval_id, 'owner-journeys-2026-09-05');
  assert.match(spec.relation_to_prior_eval.no_rerun, /are not rerun/i);
  assert.match(spec.relation_to_prior_eval.reuse, /No new orchestration harness/i);
});

test('source and generated-install identity is a dual manifest, not raw-source bytes', () => {
  const environment = readSpec().common_environment;

  assert.match(environment.candidate_freeze, /two bound manifests/i);
  assert.match(environment.candidate_freeze, /raw content hashes/i);
  assert.match(environment.candidate_freeze, /expected generated installed hashes/i);
  assert.match(environment.candidate_freeze, /re-serializes Skill frontmatter/i);
  assert.match(environment.candidate_freeze, /commit follows acceptance — never the reverse/i);

  const manifest = environment.record_before_each_run.find((entry) => entry.includes('git hash-object'));
  assert.ok(manifest, 'hash manifest entry exists');
  assert.match(manifest, /frozen dual manifest/i);
  assert.match(manifest, /must equal the frozen source hash/i);
  assert.match(manifest, /expected generated installed hash for the installed host's adapter/i);

  // The isolated generated install and the host's own discovery output are
  // both recorded, so a same-name duplicate plugin cannot silently win.
  assert.ok(environment.record_before_each_run.some((entry) => entry.includes('--config-dir')));
  assert.ok(environment.record_before_each_run.some((entry) => /discovery output/.test(entry)));
  assert.match(environment.isolation, /not an OS sandbox claim/i);
  assert.match(environment.isolation, /native session\/receipt caches/i);

  const abortRules = environment.abort_rules.join('\n');
  assert.match(abortRules, /unexpected mismatch against the frozen generated manifest/i);
  assert.match(abortRules, /expected generated difference, never drift/i);
  assert.match(abortRules, /credential mutation or disclosure/);
  assert.match(abortRules, /purchase or top-up/);
  assert.match(abortRules, /tests\/evals\/fixtures\/trellis-daily-20260909\//);
  assert.match(abortRules, /reserved case is opened, read, or started/i);
});

test('each family separates one development case from one reserved case', () => {
  const spec = readSpec();
  assert.deepEqual(spec.families.map((family) => family.family_id), ['F1', 'F2', 'F3']);
  assert.match(spec.case_separation.reserved_precondition, /never inspected/i);
  assert.match(spec.case_separation.reserved_exposure, /stops being an un-tuned check/i);

  const seenFixtures = new Set();
  const seenCaseIds = new Set();
  for (const family of spec.families) {
    assert.ok(family.name_zh && family.shape, `${family.family_id}: shape`);
    assert.ok(family.diagnostic_focus.length >= 3, `${family.family_id}: diagnostic focus`);
    for (const bucket of family.diagnostic_focus) {
      assert.ok(REQUIRED_BUCKETS.has(bucket), `${family.family_id}: known bucket ${bucket}`);
    }
    assert.equal(family.development_case.run_status, 'ready-to-run');
    assert.equal(family.reserved_case.run_status, 'reserved-not-run');
    assert.match(family.reserved_case.hold_condition, /until the .*-dev repair is accepted/);
    assert.ok(!('hold_condition' in family.development_case));
  }

  for (const { family, value: evalCase } of allCases(spec)) {
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

    for (const messages of turnsOf(evalCase)) {
      let previousTurn = 0;
      assert.ok(messages.length >= 1, `${evalCase.case_id}: has owner messages`);
      for (const message of messages) {
        assert.ok(Number.isInteger(message.turn) && message.turn > previousTurn,
          `${evalCase.case_id}: turns strictly increasing`);
        assert.ok(message.text.trim().length > 0, `${evalCase.case_id}: turn ${message.turn} text`);
        previousTurn = message.turn;
      }
    }

    if (evalCase.fixture === null) continue;
    assert.ok(!seenFixtures.has(evalCase.fixture), `fixtures are disjoint: ${evalCase.fixture}`);
    seenFixtures.add(evalCase.fixture);
    assert.ok(fs.existsSync(path.join(ROOT, evalCase.fixture)), evalCase.fixture);
  }
  assert.equal(seenFixtures.size, Object.keys(FIXTURE_STATES).length);
});

test('the ambiguous greenfield cases script answers without dictating the method', () => {
  const family = readSpec().families.find((entry) => entry.family_id === 'F2');
  for (const evalCase of [family.development_case, family.reserved_case]) {
    assert.equal(evalCase.fixture, null, `${evalCase.case_id}: greenfield starts empty`);
    assert.match(evalCase.starting_state, /Empty isolated directory/i);
    assert.equal(evalCase.owner_messages.length, 1, `${evalCase.case_id}: one ambiguous opener`);

    assert.ok(evalCase.owner_answer_script.length >= 2, `${evalCase.case_id}: answer script`);
    for (const entry of evalCase.owner_answer_script) {
      assert.ok(entry.resolves && entry.answer.trim().length > 0, `${evalCase.case_id}: answer entry`);
      assert.ok(entry.matches_question_about.length >= 2, `${evalCase.case_id}: match hints`);
    }
    // The first entry resolves the product-use uncertainty and is the one
    // missing_probes holds the run to.
    assert.match(evalCase.owner_answer_script[0].resolves, /product use/i);
    assert.equal(evalCase.missing_probes.length, 1, `${evalCase.case_id}: one required probe`);
    assert.match(evalCase.missing_probes[0], /must reach the owner once, or be recorded as an explicit deferral/);

    // No implementation method is predetermined and no ceremony is forced.
    assert.match(evalCase.out_of_script_policy, /你判断就好，按你觉得合适的做。/);
    assert.match(evalCase.out_of_script_policy, /never supplies a storage format/i);
    assert.match(evalCase.not_scored, /never scored/i);
    const mustNotRequire = evalCase.must_not_require.join('\n');
    assert.match(mustNotRequire, /internal Ultra mode, Skill, route, or workflow phase/);
    assert.match(mustNotRequire, /approval turn for an ordinary local read/);
    assert.match(mustNotRequire, /features the owner never asked for/);
    assert.ok(evalCase.acceptance.some((item) => /nothing in must_not_require occurred/.test(item)));
  }
});

test('the iterative cases carry authoritative facts plus unambiguous counterexamples', () => {
  const family = readSpec().families.find((entry) => entry.family_id === 'F3');
  for (const evalCase of [family.development_case, family.reserved_case]) {
    assert.ok(evalCase.authoritative_source.includes('docs/decisions/'), `${evalCase.case_id}: decision named`);
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
        assert.ok(decision.includes(counterexample.path), `${decisionPath} names the note it supersedes`);
        assert.ok(counterexample.wrong_behavior_it_would_produce, counterexample.path);
      } else {
        assert.match(body, /状态：informational/, counterexample.path);
        assert.match(body, /无关/, counterexample.path);
      }
    }

    // A fresh follow-up session must consume the facts through the files
    // alone, and reading a file is never scored as consumption.
    assert.equal(evalCase.sessions.length, 2, `${evalCase.case_id}: two sessions`);
    for (const session of evalCase.sessions) {
      assert.equal(session.fresh_session, true, `${evalCase.case_id}: session ${session.session} is fresh`);
    }
    assert.match(evalCase.sessions[1].carries_over, /No chat history/i);
    assert.match(evalCase.consumption_observation, /transfer/i);
    assert.match(evalCase.consumption_observation, /material_present_unconsumed/);
    assert.match(evalCase.consumption_observation, /material_missing/);
  }
});

test('the two red fixtures reproduce their seeded defect at the recorded counts', () => {
  const spec = readSpec();
  const byFixture = new Map(
    allCases(spec)
      .filter(({ value }) => value.fixture)
      .map(({ value }) => [path.basename(value.fixture), value]),
  );

  for (const name of ['f1-csv-quoting', 'f1r-note-slugs']) {
    const expected = FIXTURE_STATES[name];
    const { run, counts } = runFixtureSuite(name);
    assert.notEqual(run.status, 0, `${name}: must fail while the defect is present`);
    assert.deepEqual(
      counts,
      { tests: expected.tests, pass: expected.pass, fail: expected.fail },
      `${name}: recorded starting state`,
    );
    assert.match(run.stdout, /failing tests:/, name);
    assert.match(
      byFixture.get(name).starting_state,
      new RegExp(`${expected.tests} tests, ${expected.pass} pass, ${expected.fail} fail`),
      `${name}: spec states the measured counts`,
    );
  }
});

test('the two green fixtures start green at the recorded counts', () => {
  const spec = readSpec();
  const byFixture = new Map(
    allCases(spec)
      .filter(({ value }) => value.fixture)
      .map(({ value }) => [path.basename(value.fixture), value]),
  );

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
      `${name}: spec states the measured counts`,
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
    assert.equal(manifest.scripts.test, `node --test ${state.files.join(' ')}`, `${fixture}: test script`);
  }
});
