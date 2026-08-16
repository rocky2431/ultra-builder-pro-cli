'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const {
  USER_INVOKED_SKILLS,
  MODEL_INVOKED_SKILLS,
  ROUTER_SKILLS,
  GRANT_CONTINUABLE_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillsForRuntime,
  skillPolicy,
} = require('../adapters/_shared/runtime-assets.cjs');

const USER = [
  'ultra-init',
  'ultra-research',
  'ultra-change',
  'ultra-plan',
  'ultra-dev',
  'ultra-test',
  'ultra-deliver',
  'ultra-delegate',
];

const MODEL = [
  'ultra-grilling',
  'ultra-domain-modeling',
  'ultra-tdd',
  'ultra-review',
  'ultra-think',
];

const ROUTER = ['ultra-status'];
const CONTINUABLE = ['ultra-research', 'ultra-plan', 'ultra-dev', 'ultra-test', 'ultra-deliver'];
const ALL = [...USER, ...MODEL, ...ROUTER].sort();

function readSkill(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function collapseWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

const REVIEW_WORKER_AXES = {
  'review-spec': 'spec_fidelity',
  'review-code': 'engineering_standards',
  'review-tests': 'engineering_standards',
  'review-errors': 'engineering_standards',
  'review-design': 'engineering_standards',
  'review-comments': 'engineering_standards',
};

function parseFencedJsonAfter(markdown, heading) {
  const headingIndex = markdown.indexOf(heading);
  assert.notEqual(headingIndex, -1, `missing ${heading}`);
  const match = markdown.slice(headingIndex).match(/```json\n([\s\S]*?)\n```/u);
  assert.ok(match, `missing JSON example after ${heading}`);
  return JSON.parse(match[1]);
}

function assertCoordinatorSummaryInvariants(summary) {
  const roster = Object.keys(REVIEW_WORKER_AXES);
  assert.equal(summary.$schema, 'ultra-review-summary-v4');
  assert.equal(summary.status, 'complete');
  assert.match(summary.head, /^[0-9a-f]{40}$/u);
  for (const field of [
    'context_digest', 'packet_digest', 'admission_digest', 'subject_digest',
  ]) {
    assert.match(summary[field], /^[0-9a-f]{64}$/u, field);
  }
  assert.equal(summary.worktree_digest, null);
  assert.deepEqual(summary.worker_selection.map((item) => item.worker), roster);

  const selected = summary.worker_selection
    .filter((item) => item.status === 'selected')
    .map((item) => item.worker);
  const skipped = summary.worker_selection
    .filter((item) => item.status === 'skipped')
    .map((item) => item.worker);
  assert.deepEqual(
    selected,
    roster.filter((worker) => [
      ...summary.workers.completed,
      ...summary.workers.failed,
    ].includes(worker)),
  );
  assert.deepEqual(skipped, summary.workers.skipped);
  assert.ok(selected.includes('review-spec'));

  for (const axis of ['spec_fidelity', 'engineering_standards']) {
    const completedRefs = summary.workers.completed
      .filter((worker) => REVIEW_WORKER_AXES[worker] === axis)
      .map((worker) => `${worker}.json`);
    assert.deepEqual(summary.axes[axis].evidence_refs, completedRefs, axis);
    const failed = summary.workers.failed.some(
      (worker) => REVIEW_WORKER_AXES[worker] === axis,
    );
    const blocking = summary.findings.some(
      (finding) => finding.axis === axis && ['P0', 'P1'].includes(finding.severity),
    );
    const expected = failed || completedRefs.length === 0
      ? 'INCOMPLETE'
      : blocking ? 'FAIL' : 'PASS';
    assert.equal(summary.axes[axis].verdict, expected, axis);
  }

  const expectedVerdict = Object.values(summary.axes).some(
    (axis) => axis.verdict === 'INCOMPLETE',
  )
    ? 'INCOMPLETE'
    : Object.values(summary.axes).some((axis) => axis.verdict === 'FAIL')
      ? 'REQUEST_CHANGES'
      : 'APPROVE';
  assert.equal(summary.verdict, expectedVerdict);
  if (summary.findings.length === 0) {
    assert.ok(summary.coverage_refs.length > 0 || summary.limitations.length > 0);
  }
}

test('v0.26 exposes exactly fourteen file-first skills in three roles', () => {
  assert.deepEqual(USER_INVOKED_SKILLS, USER);
  assert.deepEqual(MODEL_INVOKED_SKILLS, MODEL);
  assert.deepEqual(ROUTER_SKILLS, ROUTER);
  assert.deepEqual(GRANT_CONTINUABLE_SKILLS, CONTINUABLE);
  assert.deepEqual(
    fs.readdirSync(SKILLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    ALL,
  );
  for (const runtime of ['claude', 'opencode', 'codex', 'kimi', 'grok', 'zcode']) {
    assert.deepEqual(skillsForRuntime(runtime).sort(), ALL, runtime);
  }
  for (const name of USER) {
    assert.equal(skillPolicy(name).userInvocable, true, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, CONTINUABLE.includes(name), name);
  }
  for (const name of MODEL) {
    assert.equal(skillPolicy(name).userInvocable, false, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, true, name);
  }
  assert.equal(skillPolicy('ultra-status').userInvocable, true);
  assert.equal(skillPolicy('ultra-status').allowImplicitInvocation, false);
});

test('every v0.26 skill is file-first and user workflows restore from repository artifacts', () => {
  const mcpCall = /\bultra\.(?:context|record|checkpoint|sync|session|archive|doctor)\b/;
  for (const name of ALL) {
    assert.doesNotMatch(readSkill(name), mcpCall, name);
  }
  for (const name of USER) {
    const text = readSkill(name);
    for (const anchor of [/`\.ultra\/tasks\.json`/, /context_file/, /`CONTEXT\.md`/, /`\.ultra\/decisions\/`/]) {
      assert.match(text, anchor, `${name} must recover through ${anchor.source}`);
    }
  }
});

test('model-invoked disciplines each have at least two canonical callers', () => {
  const callers = Object.fromEntries(MODEL.map((name) => [name, []]));
  for (const caller of [...USER, ...ROUTER]) {
    const text = readSkill(caller);
    for (const callee of MODEL) {
      if (text.includes(`../${callee}/SKILL.md`) || text.includes(`\`${callee}\``)) {
        callers[callee].push(caller);
      }
    }
  }
  for (const [name, names] of Object.entries(callers)) {
    assert.ok(names.length >= 2, `${name} has only ${names.join(', ') || 'zero'} canonical callers`);
  }
  for (const caller of USER) {
    const text = readSkill(caller);
    for (const callee of USER) {
      if (callee !== caller) {
        assert.doesNotMatch(text, new RegExp(`\\.\\./${callee}/SKILL\\.md`), `${caller} calls user workflow ${callee}`);
      }
    }
  }
});

test('model-invoked review requires owner authority before cross-host delegation', () => {
  const review = readSkill('ultra-review');
  assert.match(
    review,
    /do not\s+(?:invoke|run) `?ultra-delegate`? unless the owner has explicitly/iu,
  );
  assert.match(review, /recommend[^\n]+cross-family recheck[^\n]+wait/iu);
  assert.doesNotMatch(review, /\nDelegate a recheck[^\n]+when the Change profile/iu);
});

test('Plan and Test consume adversarial review with explicit execution evidence', () => {
  const plan = readSkill('ultra-plan');
  const testSkill = readSkill('ultra-test');
  const review = readSkill('ultra-review');
  const schema = fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'unified-schema.md'),
    'utf8',
  );
  const workerPacket = fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'worker-packet.md'),
    'utf8',
  );
  const adversarialContext = fs.readFileSync(
    path.join(ROOT, '.ultra', 'contexts', 'task-v027-adversarial-lifecycle.md'),
    'utf8',
  );
  const lifecyclePlan = fs.readFileSync(
    path.join(ROOT, 'docs', 'V027-LIFECYCLE-CLOSURE.zh-CN.md'),
    'utf8',
  );
  const reportTemplate = JSON.parse(fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'test-report.json'),
    'utf8',
  ));

  assert.match(plan, /\.\.\/ultra-review\/SKILL\.md/u);
  assert.match(plan, /plan mode/iu);
  assert.match(plan, /SUMMARY\.json/u);
  assert.match(testSkill, /\.\.\/ultra-review\/SKILL\.md/u);
  assert.match(testSkill, /aggregate Change review/iu);
  assert.match(testSkill, /review session[\s\S]*packet digest[\s\S]*verdict/iu);
  assert.match(review, /execution_mode/u);
  assert.match(review, /isolated \| sequential-shared-context/u);
  assert.match(review, /finding audit/iu);
  assert.match(review, /blind adversarial probe/iu);
  assert.match(schema, /ultra-review-findings-v4/u);
  assert.match(schema, /ultra-review-summary-v4/u);
  assert.match(schema, /north_star_trace/u);
  for (const field of ['first_principles', 'serves', 'touches']) {
    assert.match(schema, new RegExp(`"${field}"`, 'u'), field);
  }
  assert.match(testSkill, /ultra-review-findings-v4/u);
  assert.match(testSkill, /north_star_trace/u);
  assert.match(testSkill, /validate_review_transport\.cjs/u);
  assert.match(testSkill, /summary_digest/u);
  assert.match(testSkill, /admission digest[\s\S]*subject digest/iu);
  assert.match(testSkill, /non-authoritative derived evidence[\s\S]*fresh review session/iu);
  assert.match(testSkill, /canonical\s+`\.ultra\/test-report\.json`/u);
  assert.match(testSkill, /8 MiB \+ 1/iu);
  assert.match(testSkill, /managed path component[\s\S]*non-symlink/iu);
  assert.match(schema, /exact report bytes[\s\S]*exact summary bytes/iu);
  assert.match(schema, /coverage_refs/u);
  assert.match(schema, /"admission_digest"/u);
  assert.match(schema, /"subject_digest"/u);
  assert.doesNotMatch(schema, /spec-fidelity\.json/u);
  const summaryExample = parseFencedJsonAfter(schema, '## Coordinator summary');
  Object.assign(summaryExample, {
    session: 'summary-example',
    change_id: 'change-example',
    task_ids: ['task-example'],
    head: 'a'.repeat(40),
    context_digest: 'b'.repeat(64),
    packet_digest: 'c'.repeat(64),
    admission_digest: 'd'.repeat(64),
    subject_digest: 'e'.repeat(64),
  });
  assertCoordinatorSummaryInvariants(summaryExample);
  assert.match(workerPacket, /ultra-review-admission-required-v2/u);
  assert.match(workerPacket, /"subject_observations"/u);
  assert.match(workerPacket, /"role": "change"[\s\S]*"role": "acceptance_source"[\s\S]*"role": "decision"[\s\S]*"role": "snapshot"/u);
  assert.match(workerPacket, /create-once[\s\S]*admission_conflict/iu);
  assert.match(workerPacket, /lost[\s\S]*INCOMPLETE[\s\S]*fresh review session/iu);
  assert.match(
    adversarialContext,
    /sequential fallback[\s\S]{0,120}`execution_mode: sequential-shared-context`/iu,
  );
  assert.match(
    adversarialContext,
    /context reuse alone[\s\S]{0,80}does not force[\s\S]{0,80}`INCOMPLETE`/iu,
  );
  assert.match(
    adversarialContext,
    /`INCOMPLETE` only when required[\s\S]{0,100}evidence, worker, or artifact[\s\S]{0,80}missing/iu,
  );
  assert.doesNotMatch(adversarialContext, /sequential fallback as limited\/INCOMPLETE/iu);
  assert.match(
    lifecyclePlan,
    /sequential fallback[\s\S]{0,160}`execution_mode: sequential-shared-context`/iu,
  );
  assert.match(lifecyclePlan, /上下文复用本身不强制[\s\S]{0,80}`INCOMPLETE`/u);
  assert.match(
    lifecyclePlan,
    /只有必需的 (?:evidence、worker、artifact|worker、artifact、evidence)[\s\S]{0,160}`INCOMPLETE`/u,
  );
  assert.doesNotMatch(lifecyclePlan, /标为\s*\n?`limited` 或 `INCOMPLETE`/u);
  assert.ok(reportTemplate.review);
  assert.deepEqual(Object.keys(reportTemplate.review).sort(), [
    'admission_digest', 'context_digest', 'coverage_refs', 'execution_mode',
    'finding_schema', 'limitations', 'packet_digest', 'session', 'subject_digest',
    'summary_digest', 'summary_ref', 'verdict', 'worktree_digest',
  ]);
  assert.equal(reportTemplate.review.finding_schema, 'ultra-review-findings-v4');
  assert.equal(reportTemplate.review.admission_digest, null);
  assert.equal(reportTemplate.review.subject_digest, null);
});

test('Execution Grant enables bounded session-local or durable coding without a workflow engine', () => {
  const change = readSkill('ultra-change');
  const contract = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'change-contract.md'),
    'utf8',
  );
  const grant = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'execution-grant.md'),
    'utf8',
  );
  const architecture = fs.readFileSync(path.join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
  const architectureSpec = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'architecture.md'),
    'utf8',
  );
  const decisions = fs.readFileSync(path.join(ROOT, 'docs', 'DECISIONS.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const lifecycle = fs.readFileSync(
    path.join(ROOT, 'docs', 'WORKFLOW-LIFECYCLE.md'),
    'utf8',
  );

  assert.match(
    contract,
    /^\| ID \| Criterion \| Verification type \| Required evidence \|\n\|---\|---\|---\|---\|$/mu,
  );
  assert.match(contract, /^## Execution Grant$/mu);
  for (const field of [
    'Grant', 'Allowed workflows', 'Agent topology', 'Allowed local effects',
    'Budgets and expiry', 'Mandatory reviews', 'Stop conditions', 'Invalidation',
    'Never granted', 'Activation',
  ]) {
    assert.match(contract, new RegExp(`- ${field}:`, 'u'), field);
  }
  assert.match(contract, /`session-local` \(default\) \| `durable work-package`/u);
  assert.match(change, /typed acceptance with named required evidence/u);
  assert.doesNotMatch(change, /executable acceptance/u);
  assert.match(grant, /session-local[\s\S]*only in the current conversation/iu);
  assert.match(grant, /durable work-package`?[\s\S]{0,400}stably verif/iu);
  assert.match(grant, /not inferred from[\s\S]+Resume notes/iu);
  assert.match(grant, /fresh session|different host|compaction/iu);
  assert.match(grant, /one ready task at a time/iu);
  assert.match(grant, /no automatic spawning, delegation/iu);
  assert.match(grant, /hard ceiling[\s\S]+never evidence of\s+semantic completion/iu);
  assert.match(grant, /REDUCTION[\s\S]*North Star[\s\S]*P0\/P1/iu);
  assert.match(grant, /one initial review plus at most two\s+P0\/P1 delta reviews/iu);
  for (const name of CONTINUABLE) {
    const skill = readSkill(name);
    assert.match(skill, /\.\.\/ultra-change\/references\/execution-grant\.md/u, name);
    assert.match(skill, /If model-selected[^\n]+live execution grant[^\n]+without either, stop/iu, name);
  }
  for (const maintainedArchitecture of [architecture, architectureSpec]) {
    assert.match(
      maintainedArchitecture,
      /required Execution Grant \(`session-local`[^)]*inert without current-\s*session activation[^)]*\)/u,
    );
  }
  assert.match(decisions, /same-session|session-local/iu);
  for (const file of [architecture, decisions, grant]) {
    assert.doesNotMatch(file, /\.ultra\/automation\.md|ubp advance/iu);
  }
  // Prose is not a machine input. The mechanical permission contracts are the
  // runtime policy exports (`GRANT_CONTINUABLE_SKILLS`, `skillPolicy`) and
  // their behavior tests here and in
  // `adapters/_shared/tests/runtime-assets.test.cjs`. The maintained docs get
  // a smoke check only: they exist and mention the Execution Grant.
  for (const doc of [readme, lifecycle]) {
    assert.match(doc, /execution grant/iu);
  }
});

test('dual-mode grants stop or continue by mode and never reach finalization without an owner invocation', () => {
  const grantReference = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'execution-grant.md'),
    'utf8',
  );
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const architecture = fs.readFileSync(path.join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
  const architectureSpec = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'architecture.md'), 'utf8');
  const productSpec = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'product.md'), 'utf8');
  const discovery = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'discovery.md'), 'utf8');
  const distillate = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'research-distillate.md'), 'utf8');
  const artifactAuthority = fs.readFileSync(path.join(ROOT, 'docs', 'ARTIFACT-AUTHORITY.md'), 'utf8');
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

  // Mode split: session-local stops on lost activation; durable continues only
  // after exact verification; neither grants finalization or archive.
  assert.match(grantReference, /session-local[\s\S]+stop and ask the owner to re-activate/iu);
  assert.match(grantReference, /durable[\s\S]+stably verify/iu);
  assert.match(grantReference, /(?:neither mode|no mode|never authorizes[\s\S]*?)finalization or archiv/iu);

  // No current-rule surface may keep the superseded blanket claims: a grant
  // never surviving a fresh session, same-session-only continuation, or the
  // pre-3.0 Execution Packet / Autonomy Envelope vocabulary.
  for (const [label, text] of [
    ['README', readme],
    ['ARCHITECTURE', architecture],
    ['architecture spec', architectureSpec],
    ['product spec', productSpec],
    ['discovery', discovery],
    ['research-distillate', distillate],
    ['ARTIFACT-AUTHORITY', artifactAuthority],
    ['CHANGELOG', changelog],
  ]) {
    assert.doesNotMatch(text, /grant does not survive a fresh session/iu, `${label}: blanket no-survival claim`);
    // Historical naming is allowed only where it is explicitly labelled as
    // superseded (accepted design: history stays historical when labelled).
    const packetUses = [...text.matchAll(/Execution Packet[^.]{0,160}/gu)].map((m) => m[0]);
    for (const use of packetUses) {
      assert.match(
        use,
        /superseded name|superseded by|historical naming/iu,
        `${label}: unlabelled Execution Packet reference: ${use.slice(0, 60)}`,
      );
    }
    const envelopeUses = [...text.matchAll(/Autonomy\s+Envelope[^.]{0,160}/gu)].map((m) => m[0]);
    for (const use of envelopeUses) {
      assert.match(
        use,
        /superseded name|superseded by|historical naming|historical,/iu,
        `${label}: unlabelled Autonomy Envelope reference: ${use.slice(0, 60)}`,
      );
    }
    assert.doesNotMatch(text, /only Change-scoped same-session continuation/iu, `${label}: same-session-only continuation`);
    for (const use of [...text.matchAll(/[^.]{0,80}same-session Autonomy[^.]{0,160}/gu)].map((m) => m[0])) {
      assert.match(
        use,
        /superseded name|superseded by|historical naming|historical,/iu,
        `${label}: unlabelled same-session envelope reference: ${use.slice(0, 60)}`,
      );
    }
  }

  // The durable continuation rule is stated where readers decide.
  assert.match(readme, /durable[\s\S]{0,200}fresh (?:session|Agent|host)[\s\S]{0,200}verif/iu);
  assert.match(architectureSpec, /durable work-package`?\s+grant[^.]{0,140}continue only after[^.]{0,60}stably verif/iu);
  assert.match(artifactAuthority, /session-local` default or `durable work-package`/iu);

  // Mode-aware stop/continue wording exists in the maintained docs.
  for (const [label, text] of [
    ['README', readme],
    ['ARCHITECTURE', architecture],
    ['product spec S-08', productSpec],
  ]) {
    assert.match(
      text,
      /session-local[\s\S]{0,300}(?:lost|fresh session|compaction)[\s\S]{0,200}stop|lost[\s\S]{0,40}activation[\s\S]{0,200}stop/iu,
      `${label}: Mode A stop rule`,
    );
  }
});

test('a model-selected Deliver run cannot reach finalization, versioning, packaging, or archive', () => {
  const deliver = readSkill('ultra-deliver');
  const grantReference = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'execution-grant.md'),
    'utf8',
  );

  // The Deliver skill splits its entry: grant-continued work may reconcile,
  // review, and report, then MUST stop before every finalization-only effect.
  assert.match(
    deliver,
    /model-selected Deliver[\s\S]{0,400}(?:reconcile|review|report)/iu,
    'model-selected Deliver scope',
  );
  assert.match(
    deliver,
    /MUST stop before finalization/iu,
    'explicit finalization stop',
  );
  for (const effect of [
    /writing `delivery\.md`/iu,
    /version(?:ing)? (?:decision|posture|bump)/iu,
    /package posture|packaging/iu,
    /archiv(?:e|ing) (?:the )?(?:stable )?(?:Change|change_id)|`git mv`/iu,
  ]) {
    assert.match(deliver, effect, `finalization effect enumerated: ${effect}`);
  }
  assert.match(
    deliver,
    /only a current explicit owner invocation of `ultra-deliver` may finalize/iu,
    'finalization requires a current explicit owner invocation',
  );

  // The same boundary lives in the grant reference so the rule has one
  // canonical contract and a consumer.
  assert.match(grantReference, /reconcile[\s\S]{0,200}stop(?:s)?\s+before finalization/iu);

  // Mutants: removing the stop sentence or claiming grant-covered
  // finalization must fail the contract above.
  const stopRemoved = deliver.replace(/MUST stop before finalization\.?/giu, '');
  assert.notEqual(stopRemoved, deliver, 'stop sentence is present to mutate');
  assert.doesNotMatch(stopRemoved, /MUST stop before finalization/iu);

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.doesNotMatch(
    readme,
    /grant[\s\S]{0,120}(?:may|can) finalize|grant-covered finalization/iu,
    'no surface may claim a grant covers finalization',
  );
});

test('review topology is owner-selected with a one-reviewer default and lens count is never mandatory', () => {
  const review = readSkill('ultra-review');
  const decisions = fs.readFileSync(path.join(ROOT, 'docs', 'DECISIONS.md'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(ROOT, 'docs', 'WORKFLOW-LIFECYCLE.md'), 'utf8');
  const discovery = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'discovery.md'), 'utf8');
  const distillate = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'research-distillate.md'), 'utf8');

  // The skill's own description and title must not hard-wire six lenses.
  assert.doesNotMatch(review, /through six independent lenses/iu);
  assert.doesNotMatch(review, /^# Review through six lenses/miu);

  // No current-rule surface may state an unconditional six-lens requirement.
  for (const [label, text] of [
    ['DECISIONS', decisions],
    ['WORKFLOW-LIFECYCLE', lifecycle],
    ['discovery', discovery],
    ['research-distillate', distillate],
    ['ultra-review', review],
  ]) {
    assert.doesNotMatch(text, /stays six-lens/iu, `${label}: six-lens section title`);
    assert.doesNotMatch(text, /require a complete\s+six-lens review session/iu, `${label}: mandatory complete six-lens session`);
    assert.doesNotMatch(text, /Task review uses six independent lenses/iu, `${label}: unconditional task six-lens rule`);
    assert.doesNotMatch(text, /permanent six-lens roster/iu, `${label}: permanent roster lock`);
  }

  // The accepted topology rule: owner chooses reviewer/provider/count; default
  // one reviewer / current Agent; selection by risk and touched seams; the
  // aggregate default to six stays permissive, never a quality proxy.
  for (const [label, text] of [
    ['ultra-review', review],
    ['DECISIONS', decisions],
  ]) {
    assert.match(text, /owner (?:chooses|selects|decides)[^\n]{0,120}(?:reviewer|lens|count|topology)/iu, `${label}: owner selects review topology`);
    assert.match(text, /default[^\n]{0,120}one reviewer|one reviewer[^\n]{0,80}default/iu, `${label}: one-reviewer default`);
  }
  assert.match(review, /`review-spec` plus (?:only )?the lenses\s+justified by (?:the current )?risk and (?:the )?touched seams/iu);
  assert.match(review, /delta review[\s\S]{0,160}only the (?:lenses|affected lenses)/iu);
  assert.match(
    review,
    /aggregate Change review\*{0,2} may (?:select|default to)[^\n]{0,80}only when (?:the )?(?:justified|cross-task|risk)/iu,
    'aggregate six stays conditional',
  );

  // Lens count is an observation, never a quality verdict or a completion gate.
  assert.match(review, /(?:lens|finding|worker|file) count[\s\S]{0,200}never (?:decides|a quality|semantic)/iu);

  // Mutant: reintroducing mandatory six must fail these assertions.
  const mandatorySix = review.replace(
    /An \*\*initial task review\*\* always selects `review-spec` plus only the lenses\n  justified by the current risk and the touched seams; a major or high-risk task may\n  select the full six-lens roster only with recorded owner approval\./u,
    'Every task review requires the complete six-lens roster as a quality gate.',
  );
  assert.notEqual(mandatorySix, review, 'lens-selection sentence is present to mutate');
  assert.doesNotMatch(mandatorySix, /lenses justified by the current risk and the touched seams/u);
});

test('development convergence preserves typed evidence authority without command-only proxies', () => {
  const plan = readSkill('ultra-plan');
  const dev = readSkill('ultra-dev');
  const contextTemplate = fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'contexts', 'TEMPLATE.md'),
    'utf8',
  );

  assert.match(contextTemplate, /\*\*Change Acceptance IDs\*\*:/u);
  assert.match(plan, /Change Acceptance IDs/u);
  assert.match(plan, /Map every Change acceptance ID[^\n]+task context/iu);
  assert.match(dev, /resolve[^\n]+Change Acceptance IDs[^\n]+active `intent\.md`/iu);
  assert.match(dev, /Verification type/u);
  assert.match(dev, /Required evidence/u);
  for (const verificationType of [
    'command', 'inspection', 'owner-judgment', 'external-observation',
  ]) {
    assert.match(dev, new RegExp(`\\b${verificationType}\\b`, 'u'), verificationType);
  }
  assert.match(dev, /execute only[^\n]+`command`/iu);
  assert.match(dev, /`inspection`[^\n]+cite[^\n]+refresh/iu);
  assert.match(dev, /`owner-judgment`[\s\S]{0,180}owner alone[\s\S]{0,180}cannot proxy/iu);
  assert.match(dev, /`external-observation`[^\n]+preserve[^\n]+without[^\n]+prox/iu);
  assert.match(dev, /missing[^\n]+owner-judgment[^\n]+owner gate/iu);
  assert.match(dev, /missing[^\n]+external-observation[^\n]+external[^\n]+gate/iu);
  assert.match(dev, /best-ever[^\n]+evidence set/iu);
  for (const exit of ['Converged', 'Stalled', 'Unreachable']) {
    assert.match(dev, new RegExp(`\\| ${exit} \\|`, 'u'), exit);
  }
  assert.doesNotMatch(dev, /acceptance commands pass/iu);
  assert.doesNotMatch(dev, /executable `Verification`/iu);
  assert.doesNotMatch(dev, /Every mapped Change verification and task-local command exits zero/iu);
  assert.doesNotMatch(dev, /two consecutive repair rounds|three repair rounds/iu);
});

test('task evidence v2 keeps task status mechanical and removes semantic numeric gates', () => {
  const plan = readSkill('ultra-plan');
  const dev = readSkill('ultra-dev');
  const status = readSkill('ultra-status');
  const change = readSkill('ultra-change');
  const changeContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'change-contract.md'),
    'utf8',
  );
  const review = readSkill('ultra-review');
  const testSkill = readSkill('ultra-test');
  const deliver = readSkill('ultra-deliver');
  const grilling = readSkill('ultra-grilling');
  const reframing = fs.readFileSync(
    path.join(SKILLS, 'ultra-grilling', 'references', 'reframing.md'),
    'utf8',
  );
  const tdd = readSkill('ultra-tdd');

  assert.match(plan, /sole\s+task-status authority/iu);
  assert.match(plan, /ultra-task-ledger-v2/u);
  assert.match(plan, /legacy[\s\S]{0,180}(?:Status|status)[\s\S]{0,120}diagnostic/iu);
  assert.match(plan, /legacy[\s\S]{0,180}\x60complexity\x60[\s\S]{0,120}diagnostic/iu);
  assert.doesNotMatch(plan, /write status to both|context status agree/iu);
  assert.doesNotMatch(plan, /Each task records.*\x60complexity\x60/iu);

  assert.match(dev, /ultra-task-evidence-v2/u);
  assert.match(dev, /ledger.*sole task-status authority/iu);
  assert.match(dev, /task-level review[\s\S]{0,260}refreshed before[\s\S]{0,80}\x60completed\x60/iu);
  assert.match(dev, /owner-judgment[\s\S]+owner alone|owner alone[\s\S]+owner-judgment/iu);
  assert.match(dev, /structural validator[\s\S]{0,800}never[\s\S]{0,180}semantic pass/iu);
  for (const [consumer, label] of [
    [changeContract, 'Change contract'],
    [dev, 'Dev'],
  ]) {
    assert.match(
      consumer,
      /more than one\s+authority[\s\S]{0,180}split[\s\S]{0,180}independent criteria with unique IDs/iu,
      label,
    );
    assert.doesNotMatch(consumer, /combine types|row combines types/iu, label);
  }

  for (const consumer of [testSkill, deliver]) {
    assert.match(consumer, /current Change[\s\S]+\x60ultra-task-evidence-v2\x60/iu);
    assert.match(consumer, /legacy[\s\S]{0,180}diagnostic/iu);
    assert.match(consumer, /owner-judgment[\s\S]+owner/iu);
  }

  const semanticGateCases = [
    [plan, /complexity\s*(?:>|<|=|×|\*)|more than eight target files|more than twenty tasks|above 40%|after every three or four feature tasks/iu, 'plan'],
    [status, /older than 3 days|complexity concentration/iu, 'status'],
    [change, /quick.*one[ -]task/iu, 'change'],
    [changeContract, /\x60quick\x60:.*one low-risk task|maximum tasks, repair rounds, review rounds/iu, 'change contract'],
    [review, /at most 12 findings|P0\s*\+\s*P1 does not decrease between rounds|one file fails three consecutive repairs|three or more files|ARCHITECTURAL_CONCERN/iu, 'review'],
    [grilling, /at most five|two consecutive turns|five framing questions/iu, 'grilling'],
    [reframing, /stop after two rejected reframes|ask at most five/iu, 'reframing'],
    [tdd, /after three or four slices/iu, 'tdd'],
  ];
  for (const [text, pattern, label] of semanticGateCases) {
    assert.doesNotMatch(text, pattern, label);
  }

  for (const lens of ['code', 'design', 'errors', 'tests', 'spec', 'comments']) {
    assert.match(review, new RegExp('references/' + lens + '\\.md', 'u'), lens);
  }
  for (const area of ['Anti-patterns', 'Coverage gaps', 'Wiring Verification', 'E2E', 'Performance', 'Security']) {
    assert.match(testSkill, new RegExp('\\*\\*' + area + '\\*\\*', 'iu'), area);
  }
  for (const dimension of [
    'tests_written', 'tests_passed', 'persistence_real',
    'feature_flags_audit', 'vertical_slice', 'spec_trace',
  ]) {
    assert.match(dev, new RegExp('\\x60' + dimension + '\\x60', 'u'), dimension);
  }
});

test('task evidence consumers independently verify current bindings', () => {
  const testSkill = readSkill('ultra-test');
  const product = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'product.md'),
    'utf8',
  );
  const authority = fs.readFileSync(
    path.join(ROOT, 'docs', 'ARTIFACT-AUTHORITY.md'),
    'utf8',
  );

  for (const [consumer, label] of [
    [testSkill, 'Test'],
    [product, 'product spec'],
    [authority, 'artifact authority'],
  ]) {
    assert.match(
      consumer,
      /JSON shape[\s\S]{0,100}token syntax[\s\S]{0,100}authority designation/iu,
      label,
    );
    assert.match(
      consumer,
      /stable bytes[\s\S]{0,160}recompute[\s\S]{0,120}Acceptance-section SHA-256/iu,
      label,
    );
    assert.match(
      consumer,
      /criterion IDs[\s\S]{0,120}verification types[\s\S]{0,120}current context/iu,
      label,
    );
    assert.match(
      consumer,
      /task-review session[\s\S]{0,120}summary digest[\s\S]{0,160}retained strict summary/iu,
      label,
    );
    assert.match(
      consumer,
      /owner-judgment[\s\S]{0,180}durable owner record[\s\S]{0,180}cited statement[\s\S]{0,100}disposition[\s\S]{0,100}readable/iu,
      label,
    );
    assert.match(consumer, /mismatch[\s\S]{0,160}evidence gap[\s\S]{0,160}(?:Dev|owner)/iu, label);
    assert.doesNotMatch(
      consumer,
      /sensor success proves[^\n]*(?:identity|provenance|freshness)|validators? (?:establish|prove)[^\n]*(?:identity|provenance|freshness)|structural validation checks[^\n]*evidence identity/iu,
      label,
    );
  }
  for (const [consumer, label] of [
    [testSkill, 'Test'],
    [product, 'product spec'],
    [authority, 'artifact authority'],
  ]) {
    const normalized = collapseWhitespace(consumer);
    assert.match(
      consumer,
      /subject[\s\S]{0,180}(?:independent|independently)[\s\S]{0,140}completion-snapshot freshness observation/iu,
      label,
    );
    assert.match(
      consumer,
      /(?:task_review|task-review|task review)[\s\S]{0,160}separately binds?[\s\S]{0,120}retained strict summary/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /\bsubject (?:is |remains |binds |is bound to )?(?:the )?reviewed task snapshot\b/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /align(?:s|ed)? the recorded subject with the retained strict task-review packet and summary|(?:review (?:packet|artifacts?)|task-review packet|summary) (?:cryptographically )?(?:binds|proves) (?:the )?subject/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /aligns? subject HEAD and worktree digest with the current audit subject/iu,
      label,
    );
  }
});

test('first task review admits real pre-review evidence before one final v2 publication', () => {
  const review = readSkill('ultra-review');
  const dev = readSkill('ultra-dev');
  const evidenceContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-plan', 'references', 'task-evidence-v2.md'),
    'utf8',
  );

  assert.match(
    review,
    /task-review admission[\s\S]{0,500}ledger[\s\S]{0,300}context[\s\S]{0,300}immutable packet[\s\S]{0,300}actual pre-review evidence/iu,
  );
  assert.doesNotMatch(review, /For a current task, require its `ultra-task-evidence-v2` record/iu);
  for (const [text, label] of [
    [dev, 'Dev'],
    [evidenceContract, 'task evidence contract'],
  ]) {
    assert.match(
      text,
      /do not (?:create|write)[^\n]+`?evidence\.json`?[^\n]+before[^\n]+validated[^\n]+`?SUMMARY\.json`?/iu,
      label,
    );
    assert.match(
      text,
      /after[^\n]+validated[^\n]+`?SUMMARY\.json`?[^\n]+write[^\n]+one canonical[^\n]+`?ultra-task-evidence-v2`?/iu,
      label,
    );
    assert.doesNotMatch(
      text,
      /(?:draft|provisional|placeholder)[^\n]{0,120}(?:ultra-task-evidence-v2|evidence\.json|task_review)/iu,
      label,
    );
  }
});

test('completion freshness stays distinct from review provenance and aggregate Change identity', () => {
  const dev = readSkill('ultra-dev');
  const testSkill = readSkill('ultra-test');
  const status = readSkill('ultra-status');
  const evidenceContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-plan', 'references', 'task-evidence-v2.md'),
    'utf8',
  );
  const product = fs.readFileSync(path.join(ROOT, '.ultra', 'specs', 'product.md'), 'utf8');
  const architecture = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'architecture.md'),
    'utf8',
  );
  const authority = fs.readFileSync(path.join(ROOT, 'docs', 'ARTIFACT-AUTHORITY.md'), 'utf8');
  const philosophy = fs.readFileSync(path.join(ROOT, 'docs', 'PHILOSOPHY.md'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(ROOT, 'docs', 'WORKFLOW-LIFECYCLE.md'), 'utf8');

  for (const [text, label] of [
    [dev, 'Dev'],
    [testSkill, 'Test'],
    [status, 'Status'],
    [evidenceContract, 'task evidence contract'],
    [product, 'product spec'],
    [architecture, 'architecture spec'],
    [authority, 'artifact authority'],
    [philosophy, 'philosophy'],
    [lifecycle, 'workflow lifecycle'],
  ]) {
    const normalized = collapseWhitespace(text);
    assert.match(
      text,
      /subject[\s\S]{0,180}(?:independent|independently)[\s\S]{0,140}completion-snapshot freshness observation/iu,
      label,
    );
    assert.match(
      text,
      /(?:task_review|task-review|task review)[\s\S]{0,160}separately binds?[\s\S]{0,120}retained strict summary/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /\bsubject (?:is |remains |binds |is bound to )?(?:the )?reviewed task snapshot\b/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /align(?:s|ed)? the recorded subject with the retained strict task-review packet and summary|(?:review (?:packet|artifacts?)|task-review packet|summary) (?:cryptographically )?(?:binds|proves) (?:the )?subject/iu,
      label,
    );
    assert.doesNotMatch(
      normalized,
      /aligns? subject HEAD and worktree digest with the current audit subject/iu,
      label,
    );
  }
  assert.match(
    testSkill,
    /aggregate Change subject[\s\S]{0,220}current whole Change/iu,
  );
  assert.match(
    testSkill,
    /recheck[\s\S]{0,260}current Acceptance-section SHA-256[\s\S]{0,260}criterion IDs[\s\S]{0,260}task-review[\s\S]{0,260}owner record[\s\S]{0,260}cited affected artifacts/iu,
  );
  const devEntryAndRecovery = dev.match(
    /^## Before you start\n([\s\S]*?)(?=^## Definition of done$)/mu,
  );
  assert.ok(devEntryAndRecovery, 'Dev: before-start and recovery section');
  assert.match(
    devEntryAndRecovery[1],
    /a `completed` task[\s\S]{0,120}current\s+invalidation observation[\s\S]{0,120}only for the explicit reopen below[\s\S]{0,120}record\s+and read back that transition before repair/iu,
  );

  for (const [text, label] of [
    [dev, 'Dev'],
    [evidenceContract, 'task evidence contract'],
    [authority, 'artifact authority'],
    [lifecycle, 'workflow lifecycle'],
  ]) {
    assert.match(text, /`completed`[^\n]+`in_progress`/iu, label);
    assert.match(text, /affected criterion IDs[^\n]+reason/iu, label);
    assert.match(text, /Change Log[^\n]+Resume Note/iu, label);
    assert.match(text, /never silently demote|no silent demotion/iu, label);
  }
});

test('product freshness separates evidence publication from exact provenance bindings', () => {
  const surfaces = [
    ['Test', readSkill('ultra-test')],
    ['Status', readSkill('ultra-status')],
    ['Deliver', readSkill('ultra-deliver')],
    ['task evidence contract', fs.readFileSync(
      path.join(SKILLS, 'ultra-plan', 'references', 'task-evidence-v2.md'),
      'utf8',
    )],
    ['artifact authority', fs.readFileSync(
      path.join(ROOT, 'docs', 'ARTIFACT-AUTHORITY.md'),
      'utf8',
    )],
  ];

  for (const [label, text] of surfaces) {
    const normalized = collapseWhitespace(text);
    assert.match(
      normalized,
      /product-worktree digest[^.]{0,320}excludes[^.]{0,160}`?\.ultra\/evidence\/\*\*`?/iu,
      `${label}: fixed product boundary`,
    );
    assert.match(
      normalized,
      /`?\.ultra\/evidence\/\*\*`?[^.]{0,420}`raw_evidence_sha256`[^.]{0,420}`evidence_digest`/iu,
      `${label}: separate raw and record bindings`,
    );
  }

  for (const [label, text] of surfaces.slice(0, 3)) {
    const normalized = collapseWhitespace(text);
    assert.match(
      normalized,
      /`raw_evidence_ref`[\s\S]{0,700}bounded stable repository-contained bytes[\s\S]{0,260}ordinary regular non-symlink file[\s\S]{0,180}nonblocking and no-follow/iu,
      `${label}: bounded raw receipt read`,
    );
    assert.match(
      normalized,
      /(?:compute|recompute)[\s\S]{0,160}`raw_evidence_sha256`[\s\S]{0,320}recompute[\s\S]{0,160}`evidence_digest`/iu,
      `${label}: raw then record digest order`,
    );
  }

  const dev = collapseWhitespace(readSkill('ultra-dev'));
  assert.match(
    dev,
    /before writing[\s\S]{0,180}`evidence\.json`[\s\S]{0,500}`raw_evidence_ref`[\s\S]{0,360}`raw_evidence_sha256`[\s\S]{0,360}read back/iu,
    'Dev: raw digest before record publication and read-back',
  );
});

test('Ultra Test defines one finite cooperative closing protocol and its recovery boundary', () => {
  const testSkill = collapseWhitespace(readSkill('ultra-test'));

  assert.equal(
    (testSkill.match(/one fixed closing protocol/giu) || []).length,
    1,
    'the model-facing contract names exactly one fixed closing protocol',
  );
  assert.match(
    testSkill,
    /one fixed closing protocol[^.]{0,180}one complete primary observation[^.]{0,180}one terminal seal/iu,
  );
  assert.match(
    testSkill,
    /persistent[^.]{0,120}(?:mismatch|drift)[^.]{0,180}(?:inside|before)[^.]{0,100}terminal seal[^.]{0,180}`ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION`/iu,
  );
  assert.match(
    testSkill,
    /after[^.]{0,120}(?:completed|complete) terminal seal[^.]{0,220}next consumer[^.]{0,160}fresh recapture/iu,
  );
  assert.match(
    testSkill,
    /hostile[^.]{0,180}(?:Host sandbox[^.]{0,100}isolated worktree|isolated worktree[^.]{0,100}Host sandbox)/iu,
  );
  assert.match(
    testSkill,
    /never[^.]{0,140}unbounded success-seeking replay/iu,
  );
});

test('Status checks ordered task and strict review transport identities structurally', () => {
  const status = readSkill('ultra-status');

  assert.match(
    status,
    /ordered `task_evidence`[\s\S]{0,300}`evidence_digest`[\s\S]{0,220}`task_review_session`[\s\S]{0,220}`task_review_summary_digest`/iu,
  );
  assert.match(
    status,
    /`packet_digest`[\s\S]{0,220}`admission_digest`[\s\S]{0,220}`subject_digest`[\s\S]{0,220}`summary_digest`/iu,
  );
  assert.match(status, /validate_task_evidence\.cjs/u);
  assert.match(status, /validate_review_transport\.cjs/u);
  assert.match(
    status,
    /structural[^\n]+sensor[^\n]+never[^\n]+semantic/iu,
  );
});

test('change history lookup supports canonical and legacy archive records', () => {
  const change = readSkill('ultra-change');
  assert.match(change, /delivery\.md/u);
  assert.match(change, /archive-summary\.md/u);
  assert.match(change, /verification\.md/u);
  assert.match(change, /missing `delivery\.md`[^\n]+does not mean[^\n]+no history/iu);
  assert.match(change, /abandoned Changes[^\n]+history/iu);
  assert.match(change, /## Abandonment/u);
});

test('the delivery evidence gate stays inside an explicitly invoked workflow', () => {
  const deliver = readSkill('ultra-deliver');
  const scripts = Object.values(JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ).scripts || {});

  assert.match(deliver, /applies only after the owner explicitly invokes `ultra-deliver`/iu);
  assert.match(
    deliver,
    /record the owner's disposition[\s\S]+`\.ultra\/test-report\.json`[\s\S]+carry it into `delivery\.md`/iu,
  );
  assert.ok(scripts.every((command) => !command.includes('.ultra/test-report.json')));
});

test('sequential Changes use stable identity, active-scoped tasks, and disposition-aware routing', () => {
  const change = readSkill('ultra-change');
  const changeContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'change-contract.md'),
    'utf8',
  );
  const plan = readSkill('ultra-plan');
  const dev = readSkill('ultra-dev');
  const tdd = readSkill('ultra-tdd');
  const testSkill = readSkill('ultra-test');
  const deliver = readSkill('ultra-deliver');
  const status = readSkill('ultra-status');
  const hooks = fs.readFileSync(path.join(ROOT, 'hooks', '_common.py'), 'utf8');

  assert.match(changeContract, /^## Research Disposition$/mu);
  assert.match(changeContract, /none \| bounded \| required/iu);
  assert.match(changeContract, /\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*/u);
  assert.match(changeContract, /> \*\*Profile rationale\*\*:/u);
  assert.match(changeContract, /> \*\*Risk flags\*\*:/u);
  assert.match(change, /Every active Change.*`ultra-plan`/iu);
  assert.match(change, /profile[\s\S]{0,80}never fixes task or context[\s\S]{0,30}count/iu);
  assert.doesNotMatch(change, /directly executable one-slice correction/iu);
  assert.match(tdd, /outside the Ultra lifecycle.*no active task context/iu);

  for (const text of [plan, dev, testSkill, deliver, status]) {
    assert.match(text, /change_id/u);
  }
  assert.match(plan, /preserv.*(?:earlier|historical).*tasks/iu);
  assert.doesNotMatch(plan, /change_ref/u);
  assert.match(status, /more than one active Change/iu);
  assert.match(status, /draft.*ultra-change/iu);
  assert.match(status, /Research Disposition.*ultra-research/iu);
  assert.match(status, /tasks whose `change_id` matches/iu);
  assert.match(status, /owner disposition/iu);
  assert.match(testSkill, /tasks whose `change_id` matches/iu);
  assert.match(deliver, /task_ids.*current Change/iu);

  assert.match(hooks, /def active_change_id\(/u);
  assert.match(hooks, /task\.get\("change_id"\) == change_id/u);
});

test('active Change authority resolution is canonical across live intent consumers', () => {
  const changeContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'change-contract.md'),
    'utf8',
  );
  const heading = '## Active Change authority resolution';
  const headingMatches = changeContract.match(
    /^## Active Change authority resolution$/gmu,
  ) || [];

  assert.equal(headingMatches.length, 1, 'one canonical active-authority rule');
  const sectionStart = changeContract.indexOf(heading);
  const sectionTail = changeContract.slice(sectionStart + heading.length);
  const nextHeading = sectionTail.search(/^## /mu);
  const rule = nextHeading === -1 ? sectionTail : sectionTail.slice(0, nextHeading);

  assert.match(
    rule,
    /native host filesystem[\s\S]{0,180}instruction contract[\s\S]{0,160}(?:not|no)[\s\S]{0,80}(?:parser|registry|persisted state)/iu,
  );
  assert.match(
    rule,
    /positively observed absent `\.ultra`[\s\S]{0,180}uninitialized[\s\S]{0,180}`ultra-status`[\s\S]{0,120}`ultra-init`[\s\S]{0,160}writers?[\s\S]{0,80}(?:write|create) nothing/iu,
  );
  assert.match(
    rule,
    /`\.ultra`[\s\S]{0,100}`\.ultra\/changes`[\s\S]{0,100}`\.ultra\/changes\/active`[\s\S]{0,220}stable[\s\S]{0,180}ordinary non-symlink director/iu,
  );
  assert.match(
    rule,
    /only[\s\S]{0,80}`\.gitkeep`[\s\S]{0,120}ordinary regular non-symlink file[\s\S]{0,100}ignore/iu,
  );
  assert.match(
    rule,
    /`\.gitkeep`[\s\S]{0,160}any\s+other type[\s\S]{0,120}malformed[\s\S]{0,160}never[\s\S]{0,80}Change directory[\s\S]{0,180}before[\s\S]{0,80}intent/iu,
  );
  assert.match(
    rule,
    /every other[\s\S]{0,120}(?:non-directory|symlink)[\s\S]{0,180}typed diagnostic[\s\S]{0,120}repair[\s\S]{0,160}before[\s\S]{0,100}intent/iu,
  );
  assert.match(
    rule,
    /active authority exists only when exactly one ordinary non-symlink\s+Change directory/iu,
  );
  assert.match(
    rule,
    /`intent\.md`[\s\S]{0,160}stable regular non-symlink\s+file[\s\S]{0,180}(?:no-follow|without following symlinks)/iu,
  );
  assert.match(
    rule,
    /unavailable observation[\s\S]{0,160}stop[\s\S]{0,220}(?:do not|must not)[\s\S]{0,80}read[\s\S]{0,100}write[\s\S]{0,120}(?:create|open) a new Change/iu,
  );

  const consumers = [
    ['ultra-change', /`references\/change-contract\.md`/u],
    ['ultra-status', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-plan', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-dev', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-test', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-deliver', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-review', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
    ['ultra-tdd', /`\.\.\/ultra-change\/references\/change-contract\.md`/u],
  ];
  for (const [name, reference] of consumers) {
    const skill = readSkill(name);
    assert.match(skill, reference, `${name}: canonical reference`);
    assert.match(
      skill,
      /Before you start[\s\S]{0,900}Active Change\s+authority\s+resolution[\s\S]{0,220}before reading[\s\S]{0,100}(?:active )?`?intent\.md`?/iu,
      `${name}: resolve authority before intent read`,
    );
    assert.doesNotMatch(
      skill,
      /only[\s\S]{0,80}`\.gitkeep`[\s\S]{0,120}ordinary regular non-symlink file/iu,
      `${name}: must reuse rather than duplicate the canonical rule`,
    );
  }
  const review = readSkill('ultra-review');
  assert.match(
    review,
    /task or active-Change review[\s\S]{0,500}Active Change\s+authority\s+resolution[\s\S]{0,400}before[\s\S]{0,180}(?:scope|change_id|task|acceptance|packet)/iu,
    'ultra-review: authority precedes current scope and packet work',
  );
  assert.match(
    review,
    /stable\s+zero[\s\S]{0,160}stop[\s\S]{0,220}typed diagnostic[\s\S]{0,180}(?:non-unique|more than one)[\s\S]{0,180}repair[\s\S]{0,240}(?:packet|\.ultra\/reviews)/iu,
    'ultra-review: non-one authority cannot publish review state',
  );

  const tdd = readSkill('ultra-tdd');
  assert.match(
    tdd,
    /planned Change[\s\S]{0,500}Active Change\s+authority\s+resolution[\s\S]{0,400}before[\s\S]{0,180}(?:change_id|task context|baseline|red.?green)/iu,
    'ultra-tdd: authority precedes planned task and red-green work',
  );
  assert.match(
    tdd,
    /stable\s+zero[\s\S]{0,160}stop[\s\S]{0,220}typed diagnostic[\s\S]{0,180}(?:non-unique|more than one)[\s\S]{0,180}repair[\s\S]{0,240}(?:baseline|red.?green|product)/iu,
    'ultra-tdd: non-one authority cannot start planned edits',
  );
  assert.match(
    tdd,
    /micro edit outside the Ultra lifecycle[\s\S]{0,220}no active task context/iu,
    'ultra-tdd: ordinary micro edits remain reachable without active authority',
  );
  assert.match(
    readSkill('ultra-status'),
    /positively observed absent `\.ultra`[\s\S]{0,160}`ultra-init`/iu,
    'ultra-status: preserve the uninitialized route',
  );
});

test('remaining workflows preserve their accepted v0.26 contracts', () => {
  const research = readSkill('ultra-research');
  assert.match(research, /seventeen|17/i);
  assert.match(research, /04-product-strategy[\s\S]*21-features-scope[\s\S]*99-synthesis/);
  assert.match(research, /\[UNVERIFIED: no web access\]/);
  assert.match(research, /git blob hash/i);

  const review = readSkill('ultra-review');
  for (const lens of ['code', 'design', 'errors', 'tests', 'spec', 'comments']) {
    assert.match(review, new RegExp(`references/${lens}\\.md`), `missing ${lens} lens`);
    assert.ok(fs.existsSync(path.join(SKILLS, 'ultra-review', 'references', `${lens}.md`)));
  }
  assert.match(review, /Zero Context Pollution/i);
  assert.match(review, /parent model judges[\s\S]+actual repair\/evidence history/iu);
  assert.match(review, /finding or file count never decides/iu);
  assert.doesNotMatch(review, /P0\s*\+\s*P1|ARCHITECTURAL_CONCERN|12 findings/i);
  assert.doesNotMatch(review, /confidence[^\n]*(?:threshold|75)/i);
  assert.match(review, /references\/worker-packet\.md/);
  assert.ok(fs.existsSync(path.join(SKILLS, 'ultra-review', 'references', 'worker-packet.md')));

  const think = readSkill('ultra-think');
  for (const marker of ['Fact', 'Inference', 'Speculation', 'Steel Man', 'Pre-Mortem', 'Sensitivity', 'Second-Order', 'What would change my mind']) {
    assert.match(think, new RegExp(marker, 'i'), marker);
  }
  assert.doesNotMatch(think, /fog of war|decision tickets?/i);
  assert.match(think, /one consequential decision/i);
  assert.match(think, /status:\s*open/);

  const deliver = readSkill('ultra-deliver');
  assert.match(deliver, /test-report\.json/);
  assert.match(deliver, /git_commit/);
  assert.match(deliver, /git mv/);
  assert.match(deliver, /commit[\s\S]*push[\s\S]*tag/i);

  const status = readSkill('ultra-status');
  assert.match(status, /\[NEEDS CLARIFICATION\]/);
  assert.match(status, /test-report[\s\S]*git_commit[\s\S]*HEAD/i);
  assert.match(status, /timestamp[\s\S]{0,180}never a staleness or quality verdict/iu);
  assert.match(status, /installation health/i);

  const init = readSkill('ultra-init');
  assert.match(init, /assets\/project-template/);
  assert.match(init, /references\/brownfield-adoption\.md/);
  assert.doesNotMatch(init, /Write no `\.ultra\/specs\/`/);

  const routeRows = status.indexOf('| A new request exists and no active Change exists |');
  const emptyTasksRow = status.indexOf('| An active Change exists and `.ultra/tasks.json`');
  assert.ok(routeRows >= 0 && emptyTasksRow > routeRows, 'new requests must open a Change before planning empty tasks');
});

test('initialization writes only raw intake and an empty research skeleton', () => {
  const init = readSkill('ultra-init');
  const brownfield = fs.readFileSync(
    path.join(SKILLS, 'ultra-init', 'references', 'brownfield-adoption.md'),
    'utf8',
  );

  assert.match(init, /`\.ultra\/project-brief\.md`/u);
  assert.match(init, /raw owner intake/iu);
  assert.match(init, /North Star v2[\s\S]{0,120}specification skeleton/iu);
  assert.doesNotMatch(init, /What counts as success/iu);
  assert.doesNotMatch(init, /Who uses it, and how they cope today/iu);
  assert.doesNotMatch(init, /\.\.\/ultra-domain-modeling\/SKILL\.md/u);
  assert.doesNotMatch(brownfield, /Update `\.ultra\/specs\/(?:product|architecture|discovery)\.md`/u);
  assert.match(brownfield, /`ultra-research`[^\n]+baseline/iu);
});

test('research owns baseline maturation while model disciplines own reusable methods', () => {
  const research = readSkill('ultra-research');
  const wayfinding = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', 'wayfinding.md'),
    'utf8',
  );
  const measurements = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', '22-success-metrics.md'),
    'utf8',
  );
  const synthesis = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', '99-synthesis.md'),
    'utf8',
  );
  const distillateTemplate = fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'specs', 'research-distillate.md'),
    'utf8',
  );

  assert.match(research, /`\.ultra\/project-brief\.md`/u);
  assert.match(research, /`\.ultra\/research\/<run-id>\/brief\.md`/u);
  for (const discipline of ['ultra-grilling', 'ultra-think', 'ultra-domain-modeling']) {
    assert.match(research, new RegExp(`\\.\\./${discipline}/SKILL\\.md`), discipline);
  }
  assert.match(research, /00-problem-validation[^\n]+before[^\n]+01-opportunity-discovery/iu);
  assert.match(research, /02-market-assessment[^\n]+03-alternatives[^\n]+conditional/iu);
  assert.match(research, /04-product-strategy[^\n]+checkpoint/iu);
  assert.match(research, /05-assumptions-validation[^\n]+00[^\n]+04/iu);
  assert.match(research, /scoped Research run[^\n]+only[^\n]+mapped specification/iu);
  assert.doesNotMatch(research, /areas sitting between two checkpoints are independent/iu);
  assert.match(wayfinding, /not semantic authority/iu);
  assert.match(wayfinding, /smallest sufficient coverage/iu);
  assert.match(measurements, /`NS-\*` outcomes[^\n]+when justified/iu);
  assert.match(measurements, /do not force[^\n]+single metric/iu);
  assert.match(synthesis, /atomically replace `\.ultra\/north-star\.md`/iu);
  assert.match(synthesis, /`git hash-object`/u);
  assert.match(distillateTemplate, /^## Source Revisions$/mu);
  assert.match(distillateTemplate, /Git blob hash[^\n]+`git hash-object`/u);

  for (const name of [...USER, ...MODEL, ...ROUTER].filter((name) => name !== 'ultra-research')) {
    assert.doesNotMatch(readSkill(name), /references\/0[0-5]-[^`\s]+\.md/u, `${name} owns a Research lens`);
  }
});

test('North Star stays canonical while Research, Change, Plan, and Review carry live trace', () => {
  const research = readSkill('ultra-research');
  const wayfinding = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', 'wayfinding.md'),
    'utf8',
  );
  const strategy = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', '04-product-strategy.md'),
    'utf8',
  );
  const scope = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', '21-features-scope.md'),
    'utf8',
  );
  const synthesis = fs.readFileSync(
    path.join(SKILLS, 'ultra-research', 'references', '99-synthesis.md'),
    'utf8',
  );
  const changeContract = fs.readFileSync(
    path.join(SKILLS, 'ultra-change', 'references', 'change-contract.md'),
    'utf8',
  );
  const plan = readSkill('ultra-plan');
  const workerPacket = fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'worker-packet.md'),
    'utf8',
  );
  const specLens = fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'spec.md'),
    'utf8',
  );
  const projectNorthStar = fs.readFileSync(path.join(ROOT, '.ultra', 'north-star.md'), 'utf8');

  assert.match(research, /north_star_effect: supports \| refines \| contradicts \| independent/u);
  assert.match(research, /north_star_claim:/u);
  assert.match(research, /04-product-strategy[\s\S]*21-features-scope[\s\S]*99-synthesis[\s\S]*adversarial/iu);
  assert.match(wayfinding, /^## North Star Working Candidate$/mu);
  assert.match(wayfinding, /derived navigation[\s\S]*not semantic authority/iu);
  for (const checkpoint of [strategy, scope, synthesis]) {
    assert.match(checkpoint, /adversarial challenge/iu);
  }
  assert.match(synthesis, /only after[\s\S]*owner accepts[\s\S]*atomically replace `\.ultra\/north-star\.md`/iu);

  assert.match(changeContract, /^## North Star Trace$/mu);
  assert.match(changeContract, /- Serves: <NS-/u);
  assert.match(changeContract, /- Touches: <HC-/u);
  assert.match(changeContract, /- Evidence:/u);
  assert.match(changeContract, /- North Star revision:/u);
  assert.match(changeContract, /git hash-object \.ultra\/north-star\.md/u);
  assert.match(plan, /North Star Trace/u);
  assert.match(plan, /revision mismatch[\s\S]*stale observation[\s\S]*not a semantic verdict/iu);
  assert.match(workerPacket, /"north_star_trace"/u);
  assert.match(workerPacket, /"north_star_revision"/u);
  assert.match(specLens, /North Star Trace/u);
  assert.match(specLens, /causal[^\n]+evidence/iu);
  assert.match(projectNorthStar, /Claude Code[\s\S]{0,160}ZCode/iu);
  assert.match(projectNorthStar, /^### HC-1\b/mu);
});

test('architecture verification authority requires current v2 task evidence', () => {
  const architecture = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'architecture.md'),
    'utf8',
  );
  const verification = architecture
    .split('\n')
    .find((line) => line.startsWith('| Verification |')) || '';

  assert.match(verification, /ultra-task-evidence-v2/u);
  assert.match(verification, /strict task review/iu);
  assert.match(verification, /aggregate Test binds ordered evidence identities/iu);
  assert.match(
    verification,
    /v1 task evidence and older review schemas.*historical compatibility only/iu,
  );
  assert.match(verification, /owner-only disposition for owner judgment/iu);
  assert.match(verification, /keep task in progress through blocking review repair/iu);
  assert.doesNotMatch(verification, /\bv3 review sessions\b/iu);
});

test('Deliver consumes the retained strict review receipt before finalization', () => {
  const deliver = readSkill('ultra-deliver');
  const architecture = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'architecture.md'),
    'utf8',
  );
  const product = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'product.md'),
    'utf8',
  );

  assert.match(
    deliver,
    /validate_review_transport\.cjs --summary <validated-summary-path> --report \.ultra\/test-report\.json/u,
  );
  assert.match(deliver, /exit 0[\s\S]*`"valid": true`/iu);
  assert.match(
    deliver,
    /admission_digest[\s\S]*subject_digest[\s\S]*summary_digest/iu,
  );
  assert.match(
    deliver,
    /missing or\s+invalid[\s\S]*Test claim[\s\S]*`INCOMPLETE`[\s\S]*fresh Review and Test/iu,
  );
  assert.match(deliver, /Do not write `delivery\.md`, archive the Change/iu);
  assert.match(deliver, /receipt evidence is missing or\s+invalid/iu);
  assert.match(deliver, /v3 and pre-admission\s+v4[\s\S]*read-only historical/iu);
  assert.doesNotMatch(
    deliver,
    /validate_review_transport\.cjs[^\n]*--legacy-v4/u,
  );

  for (const contract of [architecture, product]) {
    assert.match(
      contract,
      /retain[\s\S]*ADMISSION\.json[\s\S]*Test and Deliver[\s\S]*garbage collection/iu,
    );
    assert.match(contract, /v3 and pre-admission\s+v4[\s\S]*read-only\s+historical/iu);
  }
});

test('legacy initialization adds the brief without replacing existing authority', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-legacy-brief-'));
  const ultra = path.join(project, '.ultra');
  fs.mkdirSync(ultra);
  const legacy = '# Project North Star\n\n## One-line\nKeep the literal legacy ask.\n\n## Hard Constraints\n- Stay compatible.\n';
  fs.writeFileSync(path.join(ultra, 'north-star.md'), legacy);

  try {
    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-init', 'scripts', 'init_project.cjs'),
      '--project', project,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(report.created.includes('project-brief.md'));
    assert.ok(report.preserved.includes('north-star.md'));
    assert.equal(fs.readFileSync(path.join(ultra, 'north-star.md'), 'utf8'), legacy);
    assert.equal(fs.existsSync(path.join(project, 'CONTEXT.md')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('downstream skills consume the accepted baseline without recreating it', () => {
  const grilling = readSkill('ultra-grilling');
  const think = readSkill('ultra-think');
  const status = readSkill('ultra-status');
  const change = readSkill('ultra-change');
  const plan = readSkill('ultra-plan');

  assert.match(grilling, /`\.ultra\/project-brief\.md`/u);
  assert.match(grilling, /caller owns[^\n]+artifact/iu);
  assert.match(grilling, /caller sets[^\n]+semantic depth/iu);
  assert.match(grilling, /Init[^\n]+raw outline[^\n]+Research/iu);
  assert.doesNotMatch(grilling, /a new project's north star/iu);

  assert.match(think, /one consequential decision/iu);
  assert.doesNotMatch(think, /map one question|decision tickets?|fog of war/iu);

  assert.match(status, /Project Brief[^\n]+`ultra-init`/u);
  assert.match(status, /North Star status[^\n]+`unresearched`[^\n]+`ultra-research`/u);
  assert.doesNotMatch(status, /Product specification missing or contains `\[NEEDS CLARIFICATION\]`/u);

  assert.match(change, /only the touched specification sections/iu);
  assert.match(change, /does not rebuild the project baseline/iu);
  assert.match(change, /Every active Change.*`ultra-plan`/iu);
  assert.match(change, /profile[\s\S]{0,80}never fixes task or context[\s\S]{0,30}count/iu);
  assert.doesNotMatch(change, /directly executable one-slice correction/iu);
  assert.match(change, /evidence gap[^\n]+`ultra-research`/iu);

  assert.doesNotMatch(plan, /fog of war|decision tickets?/iu);
  assert.match(plan, /whole path[^\n]+`ultra-research`/iu);
  assert.match(plan, /one consequential trade-off[^\n]+`\.\.\/ultra-think\/SKILL\.md`/iu);
});

test('workflow entry boundaries remain reachable without a second Change or owner over-routing', () => {
  const change = readSkill('ultra-change');
  const plan = readSkill('ultra-plan');
  const delegate = readSkill('ultra-delegate');
  const deliver = readSkill('ultra-deliver');
  const init = readSkill('ultra-init');

  assert.match(change, /never (?:open|create) a second active\s+Change/iu);
  assert.match(change, /update the same `change_id`/iu);
  assert.match(plan, /model chooses the\s+technical seam/iu);
  assert.match(plan, /owner[\s\S]{0,160}only when[\s\S]{0,160}public contract[\s\S]{0,160}material/iu);
  assert.match(delegate, /task execution or continuation/iu);
  assert.match(delegate, /scoped Research evidence/iu);
  assert.match(delegate, /aggregate Change review or verification/iu);
  assert.match(delegate, /do not require a task/iu);
  assert.match(init, /new skeleton[\s\S]{0,120}North Star v2/iu);
  assert.match(init, /recovery[^\n]+preserv/iu);
  assert.match(deliver, /non-publishing package inspection/iu);
  assert.match(deliver, /release package/iu);
});

test('maintained documentation assigns Init, Research, and Change one non-overlapping authority boundary', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const readme = read('README.md');
  const authority = read('docs/ARTIFACT-AUTHORITY.md');
  const lifecycle = read('docs/WORKFLOW-LIFECYCLE.md');
  const architecture = read('docs/ARCHITECTURE.md');
  const decisions = read('docs/DECISIONS.md');
  const philosophy = read('docs/PHILOSOPHY.md');
  const hooks = read('hooks/README.md');
  const context = read('CONTEXT.md');
  const product = read('.ultra/specs/product.md');
  const architectureSpec = read('.ultra/specs/architecture.md');

  assert.match(readme, /`ultra-init` \| Establish the project skeleton and raw Project Brief/u);
  assert.match(readme, /`ultra-research` \| Establish an accepted North Star/iu);
  assert.match(readme, /├── project-brief\.md/u);
  assert.match(readme, /`brief\.md`[^\n]+derived navigation/iu);
  assert.match(authority, /`\.ultra\/project-brief\.md`[^\n]+raw owner intake[^\n]+`ultra-init`/iu);
  assert.match(authority, /`\.ultra\/north-star\.md`[^\n]+accepted[^\n]+`ultra-research`/iu);
  assert.match(authority, /stable `change_id`/iu);
  assert.match(authority, /append-only task ledger/iu);
  assert.match(lifecycle, /Init[^\n]+raw Project Brief/iu);
  assert.match(lifecycle, /Research[^\n]+accepted North Star/iu);
  assert.match(lifecycle, /Change[^\n]+touched baseline/iu);
  assert.match(lifecycle, /two observable passes/iu);
  assert.match(lifecycle, /one primary writer/iu);
  assert.match(architecture, /`\.ultra\/project-brief\.md`[^\n]+raw owner intake/iu);
  assert.match(architecture, /`\.ultra\/north-star\.md`[^\n]+accepted/iu);
  assert.match(decisions, /^## Intake, baseline, and delta$/mu);
  assert.match(decisions, /Project Brief[^\n]+Research[^\n]+North Star/iu);
  assert.match(philosophy, /accepted North Star[^\n]+Project Brief fallback/iu);
  assert.match(philosophy, /headings `## Project Direction`, `## North Star Outcome`, `## Hard Constraints`/u);
  assert.match(hooks, /accepted North Star[^\n]+Project Brief fallback/iu);
  assert.match(context, /Derived artifact[^\n]+research\/<run-id>\/brief\.md/iu);
  assert.match(product, /`\.ultra\/project-brief\.md`[^\n]+`ultra-init`/u);
  assert.match(product, /`\.ultra\/north-star\.md`[^\n]+`ultra-research`/u);
  assert.match(product, /intent_digest/u);
  assert.match(product, /append-only/iu);
  assert.match(architectureSpec, /Raw owner intake[^\n]+`\.ultra\/project-brief\.md`[^\n]+init/iu);
  assert.match(architectureSpec, /Accepted project baseline[^\n]+`\.ultra\/north-star\.md`[^\n]+research/iu);
  assert.match(architectureSpec, /stable `change_id`/iu);
});

test('public documentation names the exact v2 authority paths and final candidate identity', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const readme = read('README.md');
  const decisions = read('docs/DECISIONS.md');
  const migration = read('.ultra/contexts/task-v027-migration-acceptance.md');
  const adversarial = read('.ultra/contexts/task-v027-adversarial-lifecycle.md');

  assert.match(readme, /├── contexts\/task-<task-id>\.md/u);
  assert.doesNotMatch(readme, /├── contexts\/<task-id>\.md/u);
  assert.match(
    readme,
    /retain the exact current strict review session[\s\S]{0,220}Test and Deliver[\s\S]{0,220}garbage-collected/iu,
  );
  assert.match(
    readme,
    /lost before both consumers[\s\S]{0,180}fresh Review and Test[\s\S]{0,180}(?:never reconstruct|not reconstruct)/iu,
  );

  assert.match(
    decisions,
    /Test-report freshness is governed normatively by[^\n]+Artifact Authority/iu,
  );
  assert.match(decisions, /ordered v2 task-evidence identities/iu);
  assert.match(
    decisions,
    /strict aggregate-review packet, admission, subject, and summary bindings/iu,
  );
  assert.doesNotMatch(
    decisions,
    /Test-report freshness compares Change id, current\s+task ids, intent digest, `git_commit`, and product-worktree digest/iu,
  );

  assert.match(
    migration,
    /Derived output[\s\S]{0,180}`\.ultra\/\.runtime\/candidates\/ultra-builder-pro-cli-0\.27\.0\.tgz`/u,
  );
  assert.match(
    migration,
    /Public Seams[\s\S]{0,220}npm package identity `ultra-builder-pro-cli@0\.27\.0`[\s\S]{0,160}`ultra-builder-pro-cli-0\.27\.0\.tgz`/u,
  );
  assert.match(
    migration,
    /^- `npm exec --yes --package \.\/\.ultra\/\.runtime\/candidates\/ultra-builder-pro-cli-0\.27\.0\.tgz -- ultra-builder-pro-cli --all --global`$/mu,
  );
  assert.match(
    migration,
    /^- `npm exec --yes --package \.\/\.ultra\/\.runtime\/candidates\/ultra-builder-pro-cli-0\.27\.0\.tgz -- ultra-builder-pro-cli --all --global --doctor --json`$/mu,
  );
  assert.doesNotMatch(migration, /ultra-builder-pro(?:@|-)0\.27\.0/u);

  const readOnlyPrerequisites = migration.match(
    /^`READ-ONLY PREREQUISITES`:\n([\s\S]*?)(?=^`CREATE`:$)/mu,
  )?.[1];
  const createInventory = migration.match(
    /^`CREATE`:\n([\s\S]*?)(?=^Derived output \(not tracked\):$)/mu,
  )?.[1];
  assert.ok(readOnlyPrerequisites, 'migration: missing read-only prerequisites');
  assert.ok(createInventory, 'migration: missing create inventory');
  for (const taskId of [
    'v027-north-star-v2',
    'v027-task-acceptance-v2',
    'v027-autonomy-packet',
    'v027-adversarial-lifecycle',
    'v027-delegation-snapshot',
    'v027-host-adapters-hooks',
    'v027-doctor-provenance',
  ]) {
    const evidencePath = `.ultra/evidence/${taskId}/evidence.json`;
    assert.ok(readOnlyPrerequisites.includes(evidencePath), `${taskId}: prerequisite`);
    assert.ok(!createInventory.includes(evidencePath), `${taskId}: not created here`);
  }
  assert.ok(
    createInventory.includes('.ultra/evidence/v027-migration-acceptance/evidence.json'),
    'migration: creates only its own task evidence',
  );
  assert.match(
    migration,
    /invalid prerequisite[\s\S]{0,220}owning task[\s\S]{0,80}explicit reopen[\s\S]{0,220}rebuild[\s\S]{0,80}Execution Packet/iu,
  );

  assert.match(adversarial, /\.ultra\/reviews\/<session-id>\/WORKER-PACKET\.json/u);
  assert.doesNotMatch(adversarial, /\.ultra\/reviews\/<session-id>\/packet\.json/u);
});

test('current task recovery preserves the completion review and closes out without self-invalidation', () => {
  const context = fs.readFileSync(
    path.join(ROOT, '.ultra', 'contexts', 'task-v027-task-acceptance-v2.md'),
    'utf8',
  );
  const changeLog = context.match(/^## Change Log\n([\s\S]*?)(?=^## Open Questions$)/mu)?.[1];
  const resume = context.match(/^## Resume Note\n([\s\S]*?)(?=^## Completion$)/mu)?.[1];
  const completion = context.match(/^## Completion\n([\s\S]*?)(?=^## Task Review$)/mu)?.[1];
  const taskReview = context.match(/^## Task Review\n([\s\S]*)$/mu)?.[1];
  const reviewBinding = taskReview?.match(
    /Review session identity[\s\S]{0,180}retained\s+`([^`]+)`\s*\/\s*`(APPROVE|REQUEST_CHANGES|INCOMPLETE)`\s*\/\s*`([0-9a-f]{64})`/u,
  );
  assert.ok(reviewBinding, 'Task Review: current review binding');
  const [, session, verdict, digest] = reviewBinding;
  const summaryRef = path.join(ROOT, '.ultra', 'reviews', session, 'SUMMARY.json');
  const summaryBytes = fs.readFileSync(summaryRef);
  const summary = JSON.parse(summaryBytes.toString('utf8'));
  assert.equal(summary.session, session);
  assert.equal(summary.verdict, verdict);
  assert.equal(
    crypto.createHash('sha256').update(summaryBytes).digest('hex'),
    digest,
    'Task Review: exact summary digest',
  );
  const currentFindingIds = summary.findings.map((finding) => finding.id);
  const currentBlockingIds = summary.findings
    .filter((finding) => ['P0', 'P1'].includes(finding.severity))
    .map((finding) => finding.id);

  for (const [name, section] of [['Change Log', changeLog], ['Task Review', taskReview]]) {
    assert.ok(section, `${name}: missing section`);
    assert.match(section, new RegExp(session, 'u'), `${name}: review session`);
    assert.match(section, new RegExp(digest, 'u'), `${name}: summary digest`);
    assert.match(section, new RegExp(verdict, 'u'), `${name}: verdict`);
  }

  const currentFindingSet = taskReview.match(
    /Blocking findings[\s\S]*?exact current\s+set is\s+([\s\S]*?)(?=^- Closeout:)/mu,
  )?.[1];
  assert.ok(currentFindingSet, 'Task Review: exact current finding set');
  const recordedFindingIds = [...currentFindingSet.matchAll(
    /`(review-(?:spec|code|tests|errors|design|comments)-[0-9]+)`/gu,
  )].map((match) => match[1]);
  assert.deepEqual(recordedFindingIds, currentFindingIds);
  for (const findingId of currentBlockingIds) {
    assert.ok(recordedFindingIds.includes(findingId), `Task Review: blocking ${findingId}`);
  }

  assert.ok(resume, 'Resume Note: missing section');
  assert.ok(completion, 'Completion: missing section');
  assert.match(completion, /not completed/iu);
  assert.match(
    resume,
    /ADMISSION\.json`? subject equality[\s\S]{0,180}(?:does not|never)[\s\S]{0,120}current-worktree freshness/iu,
  );
  assert.match(
    resume,
    /immutable packet\s+records[\s\S]{0,220}Git HEAD[\s\S]{0,160}Change intent[\s\S]{0,40}SHA-256[\s\S]{0,160}product-worktree digest[\s\S]{0,260}ordered[\s\S]{0,120}pre-review[\s\S]{0,160}ref[\s\S]{0,80}SHA-256/iu,
  );
  assert.match(
    resume,
    /before\s+consuming\s+the verdict[\s\S]{0,180}before any closeout write[\s\S]{0,260}independently\s+recaptur(?:e|es)[\s\S]{0,180}stable-read[\s\S]{0,180}exact\s+equality/iu,
  );
  assert.match(
    resume,
    /missing tuple[\s\S]{0,260}mismatch[\s\S]{0,160}stale[\s\S]{0,220}new immutable\s+packet[\s\S]{0,120}fresh strict Review/iu,
  );
  assert.match(
    resume,
    /matching admission subject alone\s+never permits reuse/iu,
  );
  const requestChangesRecovery = resume.match(
    /If the consumed current-subject summary returns `REQUEST_CHANGES`,([\s\S]*?)(?=\nIf it returns `APPROVE`)/u,
  )?.[1];
  assert.ok(requestChangesRecovery, 'Resume Note: REQUEST_CHANGES recovery');
  assert.match(
    requestChangesRecovery,
    /repair every finding\s+in that exact validated summary[\s\S]{0,180}refresh the affected pre-review evidence[\s\S]{0,180}fresh subject and review/iu,
  );
  assert.doesNotMatch(
    requestChangesRecovery,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)\s+findings?\b/iu,
  );

  const closeoutMarkers = [
    'validate the final `SUMMARY.json`',
    'compare the exact pre-review currency tuple',
    'capture the completion freshness observation',
    'write canonical v2 `evidence.json` and read it back',
    'update `Task Review`, `Completion`, and `Resume Note`, then read all three sections back',
    'write the ledger row to `completed` and read it back',
  ];
  let previous = -1;
  for (const marker of closeoutMarkers) {
    const observed = resume.indexOf(marker);
    assert.ok(observed > previous, `Resume Note: closeout order at ${marker}`);
    previous = observed;
  }
  assert.match(
    resume,
    /prescribed post-review closeout facts[\s\S]{0,180}do not reopen implementation review/iu,
  );
  assert.match(
    resume,
    /only[\s\S]{0,80}reviewed implementation or pre-review evidence[\s\S]{0,180}fresh strict review/iu,
  );
  assert.doesNotMatch(resume, /resume by refreshing[\s\S]{0,120}freezing one new/iu);
});

test('strict review receipts remain retained through Test and Deliver across public recovery surfaces', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const taskIds = [
    'v027-north-star-v2',
    'v027-task-acceptance-v2',
    'v027-autonomy-packet',
    'v027-adversarial-lifecycle',
    'v027-delegation-snapshot',
    'v027-host-adapters-hooks',
    'v027-doctor-provenance',
    'v027-migration-acceptance',
  ];
  const surfaces = [
    ['context template', read('.ultra-template/contexts/TEMPLATE.md')],
    ['artifact authority', read('docs/ARTIFACT-AUTHORITY.md')],
    ['architecture', read('docs/ARCHITECTURE.md')],
    ['v0.27 construction baseline', read('docs/V027-LIFECYCLE-CLOSURE.zh-CN.md')],
    ['workflow lifecycle', read('docs/WORKFLOW-LIFECYCLE.md')],
    ...taskIds.map((id) => [id, read(`.ultra/contexts/task-${id}.md`)]),
  ];

  for (const [label, text] of surfaces) {
    assert.match(
      text,
      /(?:(?:strict\s+review\s+session|strict\s+session|review\s+session)[\s\S]{0,260}retain[\s\S]{0,260}Test\s+and\s+Deliver|retain[\s\S]{0,260}(?:strict\s+review\s+session|strict\s+session|review\s+session)[\s\S]{0,260}Test\s+and\s+Deliver|strict[\s\S]{0,220}必须保留[\s\S]{0,180}Test[\s\S]{0,100}Deliver)/iu,
      label,
    );
    assert.match(text, /premature\s+loss|lost\s+before|lost\s+prematurely|提前丢失/iu, label);
    assert.match(text, /fresh\s+Review\s+(?:and|\+)\s+Test/iu, label);
    assert.match(text, /never\s+reconstruct|not\s+reconstruct|绝不重构/iu, label);
  }
});

test('canonical Hook Boundary keeps ambiguous active authority visible and repairable', () => {
  const architecture = fs.readFileSync(
    path.join(ROOT, '.ultra', 'specs', 'architecture.md'),
    'utf8',
  );
  for (const hook of ['session_context.py', 'mid_workflow_recall.py']) {
    const row = architecture.split('\n').find((line) => line.includes(`\`${hook}\``));
    assert.ok(row, `${hook}: Hook Boundary row`);
    assert.match(row, /silent only outside Ultra/iu, `${hook}: healthy idle boundary`);
    assert.match(
      row,
      /ambiguous active Change[\s\S]{0,120}suppress(?:es)? task content[\s\S]{0,160}`active_change_ambiguous`[\s\S]{0,160}reachable bootstrap recovery/iu,
      `${hook}: typed repair boundary`,
    );
    assert.doesNotMatch(
      row,
      /silent (?:outside Ultra or|for) ambiguous active Change/iu,
      `${hook}: conflict is not silent`,
    );
  }
});

test('project template has one canonical v0.26 artifact layout', () => {
  const expectedFiles = [
    '.gitignore',
    'changes/abandoned/.gitkeep',
    'changes/active/.gitkeep',
    'changes/archive/.gitkeep',
    'contexts/TEMPLATE.md',
    'decisions/.gitkeep',
    'evidence/.gitkeep',
    'north-star.md',
    'project-brief.md',
    'research/.gitkeep',
    'specs/architecture.md',
    'specs/discovery.md',
    'specs/product.md',
    'specs/research-distillate.md',
    'tasks.json',
    'test-report.json',
  ];
  const root = path.join(ROOT, '.ultra-template');
  const files = walk(root).map((file) => path.relative(root, file)).sort();
  assert.deepEqual(files, expectedFiles);
  assert.equal(
    fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
    '.runtime/\nprogress/\nreviews/\n',
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8')), {
    $schema: 'ultra-task-ledger-v2',
    tasks: [],
  });

  const brief = fs.readFileSync(path.join(root, 'project-brief.md'), 'utf8');
  for (const heading of ['One-line', 'Initial Outline', 'Explicit Inputs', 'Open Questions for Research']) {
    assert.match(brief, new RegExp(`^## ${heading}$`, 'm'), `project brief: ${heading}`);
  }
  assert.match(brief, /raw owner intake/i);

  const northStar = fs.readFileSync(path.join(root, 'north-star.md'), 'utf8');
  for (const heading of [
    'Acceptance and Revision', 'Problem Reality', 'First-Principle Propositions',
    'Value Causal Chain', 'North Star Outcomes', 'Hard Constraints',
    'Explicit Exclusions', 'Uncertainties and Revisit Triggers', 'Research Trace',
  ]) {
    assert.match(northStar, new RegExp(`^## ${heading}$`, 'm'), `north star: ${heading}`);
  }
  assert.doesNotMatch(northStar, /^## One-line$/m);
  assert.match(northStar, /`ultra-research` is the first semantic writer/i);
  assert.match(northStar, /^- Status: `unresearched`$/m);
  assert.doesNotMatch(northStar, /^### (?:FP|NS|HC)-[A-Za-z0-9._-]+\b/m);

  const report = JSON.parse(fs.readFileSync(path.join(root, 'test-report.json'), 'utf8'));
  assert.equal(report.git_commit, null);
  assert.equal(report.intent_digest, null);
  assert.equal(report.passed, false);
  assert.deepEqual(report.worktree, { dirty: null, diff_digest: null });
  assert.ok(Object.values(report.areas).every((area) => area.status === 'not_run'));
  assert.equal(fs.existsSync(path.join(ROOT, 'templates', '.ultra')), false);
});

test('worktree digest accepts an explicit project from outside the checkout', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-digest-cwd-'));
  try {
    const result = spawnSync(process.execPath, [
      path.join(SKILLS, 'ultra-test', 'scripts', 'worktree_digest.cjs'),
      '--project', ROOT,
      '--change-id', 'chg-converge',
    ], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.$schema, 'ultra-worktree-digest-v1');
    assert.equal(report.head, execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' },
    ).trim());
    assert.equal(report.change_id, 'chg-converge');
    assert.match(report.intent_digest, /^[0-9a-f]{64}$/u);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

const WORKTREE_DIGEST_SCRIPT = path.join(
  SKILLS,
  'ultra-test',
  'scripts',
  'worktree_digest.cjs',
);
const SNAPSHOT_LIMIT_BYTES = 8 * 1024 * 1024;

function initializeDigestRepository(prefix, state, changeId) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const change = path.join(project, '.ultra', 'changes', state, changeId);
  fs.mkdirSync(change, { recursive: true });
  fs.writeFileSync(path.join(change, 'intent.md'), `# Change ${changeId}\n`);
  fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 1;\n');
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Ultra Test'],
    ['config', 'user.email', 'ultra-test@example.invalid'],
    ['add', '.'],
    ['commit', '-qm', 'baseline'],
  ]) {
    const result = spawnSync('git', args, { cwd: project, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return { change, project };
}

function runDigestProcess(project, changeId, options = {}) {
  return spawnSync(process.execPath, [
    WORKTREE_DIGEST_SCRIPT,
    '--project', project,
    '--change-id', changeId,
  ], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 32 * 1024 * 1024,
    timeout: options.timeout || 10000,
  });
}

function assertSnapshotFailure(result, expectedCode, label) {
  assert.equal(
    result.error,
    undefined,
    `${label}: digest process did not terminate within its physical time bound`,
  );
  assert.equal(result.status, 1, `${label}: ${result.stderr || result.stdout}`);
  assert.match(result.stderr, new RegExp(`^${expectedCode}:`, 'mu'), label);
  assert.match(
    result.stderr,
    /restore[^\n]+ordinary regular[^\n]+retry/iu,
    `${label}: reachable repair and retry`,
  );
}

function writeReplacementPreload(mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-digest-preload-'));
  const preload = path.join(directory, 'replace-before-open.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const originalOpenSync = fs.openSync;
let replaced = false;
fs.openSync = function ultraReplaceBeforeOpen(file, flags, ...rest) {
  const target = process.env.ULTRA_REPLACEMENT_TARGET;
  if (!replaced && typeof file === 'string' && target && path.resolve(file) === path.resolve(target)) {
    replaced = true;
    if (${JSON.stringify(mode)} === 'file') {
      fs.renameSync(target, target + '.before-replacement');
      fs.writeFileSync(target, 'replacement bytes\\n');
    } else if (${JSON.stringify(mode)} === 'fifo') {
      fs.renameSync(target, target + '.before-replacement');
      execFileSync('mkfifo', [target]);
    } else {
      const parent = path.dirname(target);
      fs.renameSync(parent, parent + '.before-replacement');
      fs.symlinkSync(process.env.ULTRA_REPLACEMENT_PARENT, parent, 'dir');
    }
  }
  return originalOpenSync.call(this, file, flags, ...rest);
};
`);
  return { directory, preload };
}

function writeGitBoundaryPreload(mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-git-boundary-preload-'));
  const preload = path.join(directory, 'git-boundary.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const originalExecFileSync = childProcess.execFileSync;
let changed = false;
childProcess.execFileSync = function ultraGitBoundary(command, args, options) {
  if (command === 'git'
      && ${JSON.stringify(mode)} === 'output-limit'
      && (!options || options.maxBuffer !== 64 * 1024 * 1024)) {
    const error = new Error('ULTRA_TEST_GIT_MAX_BUFFER_MISMATCH');
    error.code = 'ULTRA_TEST_GIT_MAX_BUFFER_MISMATCH';
    throw error;
  }
  if (command === 'git'
      && ${JSON.stringify(mode)} === 'physical-timeout'
      && Array.isArray(args)
      && args[0] === 'rev-parse'
      && args[1] === '--show-toplevel') {
    return originalExecFileSync(process.execPath, [
      '-e',
      'setTimeout(() => {}, 60000)',
    ], options);
  }
  if (command === 'git'
      && ${JSON.stringify(mode)} === 'require-timeout'
      && (!options || options.timeout !== 5000)) {
    const error = new Error('ULTRA_TEST_GIT_TIMEOUT_OPTION_MISMATCH');
    error.code = 'ULTRA_TEST_GIT_TIMEOUT_OPTION_MISMATCH';
    throw error;
  }
  if (command === 'git'
      && !changed
      && Array.isArray(args)
      && args[0] === 'rev-parse'
      && args[1] === '--show-toplevel'
      && (${JSON.stringify(mode)} === 'timeout'
        || ${JSON.stringify(mode)} === 'error'
        || ${JSON.stringify(mode)} === 'output-limit')) {
    changed = true;
    const error = new Error(
      ${JSON.stringify(mode)} === 'timeout'
        ? 'injected Git timeout'
        : ${JSON.stringify(mode)} === 'output-limit'
          ? 'injected Git output overflow'
          : 'injected Git failure',
    );
    if (${JSON.stringify(mode)} === 'timeout') {
      error.code = 'ETIMEDOUT';
      error.killed = true;
      error.signal = 'SIGTERM';
    } else if (${JSON.stringify(mode)} === 'output-limit') {
      error.code = 'ENOBUFS';
    } else {
      error.code = 128;
      error.status = 128;
      error.stderr = Buffer.from('fatal: injected Git failure\\n');
    }
    throw error;
  }
  const result = originalExecFileSync.call(this, command, args, options);
  if (command !== 'git' || changed || !Array.isArray(args)) return result;
  const cwd = options && options.cwd;
  if (${JSON.stringify(mode)} === 'late-tracked'
      && args[0] === 'diff'
      && args.includes('--binary')) {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'product.js'), 'module.exports = 2;\\n');
  } else if (${JSON.stringify(mode)} === 'late-untracked'
      && args[0] === 'ls-files'
      && args.includes('--others')) {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'late.txt'), 'late product bytes\\n');
  } else if (${JSON.stringify(mode)} === 'late-head'
      && args[0] === 'rev-parse'
      && args[1] === 'HEAD') {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'head-advance.txt'), 'new committed bytes\\n');
    originalExecFileSync('git', ['add', 'head-advance.txt'], { ...options, encoding: 'utf8' });
    originalExecFileSync('git', ['commit', '-qm', 'advance head'], { ...options, encoding: 'utf8' });
  }
  return result;
};
`);
  return { directory, preload };
}

function writeFinalReplayPreload(mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-final-replay-preload-'));
  const preload = path.join(directory, 'final-replay.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const originalExecFileSync = childProcess.execFileSync;
let headCalls = 0;
let trackedDiffCalls = 0;
let untrackedCalls = 0;
let changed = false;
childProcess.execFileSync = function ultraFinalReplayBoundary(command, args, options) {
  const result = originalExecFileSync.call(this, command, args, options);
  if (command !== 'git' || changed || !Array.isArray(args)) return result;
  const cwd = options && options.cwd;
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') headCalls += 1;
  if (args[0] === 'diff' && args.includes('--binary')) trackedDiffCalls += 1;
  if (args[0] === 'ls-files' && args.includes('--others')) untrackedCalls += 1;

  if (${JSON.stringify(mode)} === 'late-untracked-create' && untrackedCalls === 2) {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'late.txt'), 'late untracked bytes\\n');
  } else if (${JSON.stringify(mode)} === 'late-untracked-content' && headCalls === 2) {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'observed.txt'), 'changed untracked bytes\\n');
  } else if (${JSON.stringify(mode)} === 'late-intent' && headCalls === 2) {
    changed = true;
    fs.writeFileSync(process.env.ULTRA_FINAL_REPLAY_INTENT, '# Changed intent\\n');
  } else if (${JSON.stringify(mode)} === 'late-tracked-content' && trackedDiffCalls === 2) {
    changed = true;
    fs.writeFileSync(path.join(cwd, 'product.js'), 'module.exports = 2;\\n');
  } else if (${JSON.stringify(mode)} === 'late-head' && headCalls === 2) {
    changed = true;
    originalExecFileSync('git', ['commit', '--allow-empty', '-qm', 'late head'], {
      ...options,
      encoding: 'utf8',
    });
  }
  return result;
};
`);
  return { directory, preload };
}

function writeTerminalWindowPreload(mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-terminal-window-preload-'));
  const preload = path.join(directory, 'terminal-window.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const originalExecFileSync = childProcess.execFileSync;
const originalLstatSync = fs.lstatSync;
let headCalls = 0;
let untrackedCalls = 0;
let targetLstatCalls = 0;
let changed = false;

function mutate(cwd) {
  changed = true;
  if (${JSON.stringify(mode)} === 'terminal-untracked-create') {
    fs.writeFileSync(path.join(cwd, 'src', 'late.txt'), 'late untracked bytes\\n');
  } else if (${JSON.stringify(mode)} === 'terminal-untracked-content') {
    fs.writeFileSync(path.join(cwd, 'observed.txt'), 'changed untracked bytes\\n');
  } else if (${JSON.stringify(mode)} === 'terminal-tracked-content') {
    fs.writeFileSync(path.join(cwd, 'product.js'), 'module.exports = 2;\\n');
  } else if (${JSON.stringify(mode)} === 'terminal-intent') {
    fs.writeFileSync(process.env.ULTRA_TERMINAL_WINDOW_INTENT, '# Changed intent\\n');
  }
}

fs.lstatSync = function ultraTerminalPathBoundary(file, options) {
  const result = originalLstatSync.call(this, file, options);
  if (changed || typeof file !== 'string') return result;
  const resolved = path.resolve(file);
  const cwd = process.cwd();
  const target = ${JSON.stringify(mode)} === 'terminal-untracked-content'
    ? path.join(cwd, 'observed.txt')
    : ${JSON.stringify(mode)} === 'terminal-tracked-content'
      ? path.join(cwd, 'product.js')
      : null;
  if (target && resolved === target) {
    targetLstatCalls += 1;
    if (targetLstatCalls === 4) mutate(cwd);
  }
  return result;
};

childProcess.execFileSync = function ultraTerminalGitBoundary(command, args, options) {
  const result = originalExecFileSync.call(this, command, args, options);
  if (command !== 'git' || changed || !Array.isArray(args)) return result;
  const cwd = options && options.cwd;
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') headCalls += 1;
  if (args[0] === 'ls-files' && args.includes('--others')) untrackedCalls += 1;
  if (${JSON.stringify(mode)} === 'terminal-head' && headCalls === 2) {
    changed = true;
    originalExecFileSync('git', ['commit', '--allow-empty', '-qm', 'terminal head'], {
      ...options,
      encoding: 'utf8',
    });
  } else if (${JSON.stringify(mode)} === 'terminal-intent' && headCalls === 3) {
    mutate(cwd);
  } else if (${JSON.stringify(mode)} === 'terminal-untracked-create' && untrackedCalls === 2) {
    mutate(cwd);
  }
  return result;
};
`);
  return { directory, preload };
}

function writeClosingProtocolPreload() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-closing-protocol-preload-'));
  const preload = path.join(directory, 'closing-protocol.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const childProcess = require('node:child_process');
const originalExecFileSync = childProcess.execFileSync;
const calls = { head: 0, tracked: 0, untracked: 0, diff: 0 };

function record() {
  fs.writeFileSync(process.env.ULTRA_CLOSING_PROTOCOL_RECEIPT, JSON.stringify(calls));
}

process.once('exit', record);
childProcess.execFileSync = function ultraClosingProtocol(command, args, options) {
  let operation = null;
  if (command === 'git' && Array.isArray(args)) {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') operation = 'head';
    else if (args[0] === 'diff' && args.includes('--raw')) operation = 'tracked';
    else if (args[0] === 'ls-files' && args.includes('--others')) operation = 'untracked';
    else if (args[0] === 'diff' && args.includes('--binary')) operation = 'diff';
  }
  if (operation) {
    calls[operation] += 1;
    if (calls[operation] > 3) {
      record();
      const error = new Error('ULTRA_TEST_DUPLICATE_CLOSING_PROTOCOL');
      error.stderr = Buffer.from('ULTRA_TEST_DUPLICATE_CLOSING_PROTOCOL\\n');
      throw error;
    }
  }
  return originalExecFileSync.call(this, command, args, options);
};
`);
  return { directory, preload };
}

function writeForbiddenOpenPreload(target) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-open-sentinel-preload-'));
  const preload = path.join(directory, 'forbid-open.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const originalOpenSync = fs.openSync;
fs.openSync = function ultraForbidLateOpen(file, flags, ...rest) {
  if (typeof file === 'string' && path.resolve(file) === path.resolve(${JSON.stringify(target)})) {
    throw new Error('ULTRA_TEST_OPENED_PATH_AFTER_RESOURCE_CEILING');
  }
  return originalOpenSync.call(this, file, flags, ...rest);
};
`);
  return { directory, preload };
}

function writeForbiddenDeletedOpenPreload(project) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-deletion-open-preload-'));
  const preload = path.join(directory, 'forbid-deletion-open.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const originalOpenSync = fs.openSync;
const project = path.resolve(${JSON.stringify(project)});
fs.openSync = function ultraForbidDeletionOpen(file, flags, ...rest) {
  if (typeof file === 'string') {
    const resolved = path.resolve(file);
    if (path.dirname(resolved) === project && /^deleted-\\d{3}\\.txt$/u.test(path.basename(resolved))) {
      throw new Error('ULTRA_TEST_OPENED_TRACKED_DELETION');
    }
  }
  return originalOpenSync.call(this, file, flags, ...rest);
};
`);
  return { directory, preload };
}

function assertObservationFailure(result, expectedCode, label) {
  assert.equal(
    result.error,
    undefined,
    `${label}: digest process did not terminate within its physical time bound`,
  );
  assert.equal(result.status, 1, `${label}: ${result.stderr || result.stdout}`);
  assert.match(result.stderr, new RegExp(`^${expectedCode}:`, 'mu'), label);
  assert.match(result.stderr, /(?:restore|finish|reduce|repair)[^\n]+retry/iu, `${label}: recovery`);
  assert.doesNotMatch(result.stderr, /ULTRA_TEST_OPENED_PATH_AFTER_RESOURCE_CEILING/u);
}

test('product freshness excludes tracked and untracked derived observations', () => {
  const { project } = initializeDigestRepository(
    'ubp-derived-freshness-',
    'active',
    'C-DERIVED',
  );
  const tracked = [
    '.ultra/reviews/session/SUMMARY.json',
    '.ultra/.runtime/state.json',
    '.ultra/progress/task.json',
  ];

  try {
    for (const relative of tracked) {
      const file = path.join(project, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'baseline\n');
    }
    const forced = spawnSync('git', ['add', '-f', ...tracked], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    const committed = spawnSync('git', ['commit', '-qm', 'track derived observations'], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.equal(committed.status, 0, committed.stderr || committed.stdout);

    const baselineResult = runDigestProcess(project, 'C-DERIVED');
    assert.equal(baselineResult.status, 0, baselineResult.stderr || baselineResult.stdout);
    const baseline = JSON.parse(baselineResult.stdout);
    assert.equal(baseline.dirty, false);
    assert.equal(
      baseline.intent_digest,
      crypto.createHash('sha256').update('# Change C-DERIVED\n').digest('hex'),
      'streaming preserves the canonical intent byte digest',
    );

    for (const relative of tracked) {
      fs.writeFileSync(path.join(project, relative), 'changed tracked observation\n');
      fs.writeFileSync(path.join(project, path.dirname(relative), 'untracked.json'), '{}\n');
    }
    const status = spawnSync('git', ['status', '--porcelain'], {
      cwd: project,
      encoding: 'utf8',
    });
    assert.notEqual(status.stdout.trim(), '', 'fixture must contain Git-visible changes');

    const derivedResult = runDigestProcess(project, 'C-DERIVED');
    assert.equal(derivedResult.status, 0, derivedResult.stderr || derivedResult.stdout);
    const derived = JSON.parse(derivedResult.stdout);
    assert.equal(derived.diff_digest, baseline.diff_digest);
    assert.equal(derived.dirty, false);
    assert.deepEqual(derived.untracked_files, []);

    const ordinaryBytes = Buffer.from('ordinary untracked bytes\n');
    fs.writeFileSync(path.join(project, 'ordinary.txt'), ordinaryBytes);
    const ordinaryResult = runDigestProcess(project, 'C-DERIVED');
    assert.equal(ordinaryResult.status, 0, ordinaryResult.stderr || ordinaryResult.stdout);
    const ordinary = JSON.parse(ordinaryResult.stdout);
    const expected = crypto.createHash('sha256')
      .update('ultra-worktree-digest-v1\0')
      .update(baseline.head)
      .update('\0')
      .update('ordinary.txt')
      .update('\0')
      .update(ordinaryBytes)
      .update('\0')
      .digest('hex');
    assert.equal(ordinary.diff_digest, expected, 'streaming preserves ordinary-file digest bytes');
    assert.deepEqual(ordinary.untracked_files, ['ordinary.txt']);
    fs.rmSync(path.join(project, 'ordinary.txt'));

    fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 2;\n');
    const productResult = runDigestProcess(project, 'C-DERIVED');
    assert.equal(productResult.status, 0, productResult.stderr || productResult.stdout);
    assert.notEqual(JSON.parse(productResult.stdout).diff_digest, baseline.diff_digest);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('tracked manifest preserves exact diff, deletion, mode, and binary-safe path semantics', () => {
  const fixture = initializeDigestRepository(
    'ubp-tracked-manifest-',
    'active',
    'C-TRACKED-MANIFEST',
  );
  const newlinePath = 'tracked\nname.txt';
  try {
    fs.writeFileSync(path.join(fixture.project, 'deleted.txt'), 'delete me\n');
    fs.writeFileSync(path.join(fixture.project, 'mode.sh'), '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(path.join(fixture.project, newlinePath), 'old newline bytes\n');
    for (const args of [
      ['config', 'core.filemode', 'true'],
      ['add', '.'],
      ['commit', '-qm', 'tracked manifest baseline'],
    ]) {
      const result = spawnSync('git', args, { cwd: fixture.project, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    fs.writeFileSync(path.join(fixture.project, 'product.js'), 'module.exports = 2;\n');
    fs.rmSync(path.join(fixture.project, 'deleted.txt'));
    fs.chmodSync(path.join(fixture.project, 'mode.sh'), 0o755);
    fs.writeFileSync(path.join(fixture.project, newlinePath), 'new newline bytes\n');

    const result = runDigestProcess(fixture.project, 'C-TRACKED-MANIFEST');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const observed = JSON.parse(result.stdout);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fixture.project,
      encoding: 'utf8',
    }).trim();
    const exactDiff = execFileSync('git', [
      'diff', '--binary', '--no-ext-diff', head, '--', '.',
      ':(exclude).ultra/test-report.json',
      ':(exclude).ultra/evidence/**',
      ':(exclude).ultra/reviews/**',
      ':(exclude).ultra/.runtime/**',
      ':(exclude).ultra/progress/**',
      ':(exclude).ultra/changes/active/**',
      ':(exclude).ultra/changes/archive/**',
      ':(exclude).ultra/changes/abandoned/**',
    ], { cwd: fixture.project, encoding: 'buffer' });
    const expectedDigest = crypto.createHash('sha256')
      .update('ultra-worktree-digest-v1\0')
      .update(head)
      .update('\0')
      .update(exactDiff)
      .digest('hex');

    assert.equal(observed.diff_digest, expectedDigest);
    assert.equal(Object.hasOwn(observed, 'tracked_files'), false, 'v1 output shape stays stable');
  } finally {
    fs.rmSync(fixture.project, { recursive: true, force: true });
  }
});

test('tracked product snapshots reject unsafe filesystem identities with typed recovery', async (t) => {
  const cases = [
    {
      name: 'symlink',
      code: 'ULTRA_SNAPSHOT_SYMLINK',
      mutate({ project }) {
        const target = path.join(project, 'product.js');
        const external = path.join(project, '..', `${path.basename(project)}-external-tracked`);
        fs.writeFileSync(external, 'external tracked bytes\n');
        fs.rmSync(target);
        fs.symlinkSync(external, target);
        return () => fs.rmSync(external, { force: true });
      },
    },
    {
      name: 'FIFO',
      code: 'ULTRA_SNAPSHOT_NOT_REGULAR',
      mutate({ project }) {
        const target = path.join(project, 'product.js');
        fs.rmSync(target);
        const result = spawnSync('mkfifo', [target], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.stdout);
      },
    },
    {
      name: 'socket',
      code: 'ULTRA_SNAPSHOT_NOT_REGULAR',
      mutate({ project }) {
        const target = path.join(project, 'product.js');
        fs.rmSync(target);
        const result = spawnSync('python3', [
          '-c',
          'import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1]); s.close()',
          target,
        ], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.stdout);
      },
    },
    {
      name: 'oversize regular file',
      code: 'ULTRA_SNAPSHOT_TOO_LARGE',
      mutate({ project }) {
        fs.writeFileSync(
          path.join(project, 'product.js'),
          Buffer.alloc(SNAPSHOT_LIMIT_BYTES + 1, 0x63),
        );
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const fixture = initializeDigestRepository(
        'ubp-tracked-unsafe-',
        'active',
        'C-TRACKED-UNSAFE',
      );
      let cleanupMutation;
      try {
        cleanupMutation = entry.mutate(fixture);
        assertSnapshotFailure(
          runDigestProcess(fixture.project, 'C-TRACKED-UNSAFE', { timeout: 1500 }),
          entry.code,
          `tracked ${entry.name}`,
        );
      } finally {
        cleanupMutation?.();
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('tracked snapshots reject deterministic file and parent replacements', async (t) => {
  for (const mode of ['file', 'parent']) {
    await t.test(mode, () => {
      const fixture = initializeDigestRepository(
        'ubp-tracked-replacement-',
        'active',
        'C-TRACKED-REPLACE',
      );
      const target = path.join(fixture.project, 'product.js');
      const externalParent = path.join(
        fixture.project,
        '..',
        `${path.basename(fixture.project)}-tracked-parent-replacement`,
      );
      const preload = writeReplacementPreload(mode);
      try {
        fs.writeFileSync(target, 'changed tracked bytes\n');
        if (mode === 'parent') {
          fs.mkdirSync(externalParent);
          fs.writeFileSync(path.join(externalParent, 'product.js'), 'external replacement bytes\n');
        }
        assertSnapshotFailure(
          runDigestProcess(fixture.project, 'C-TRACKED-REPLACE', {
            env: {
              NODE_OPTIONS: `--require=${preload.preload}`,
              ULTRA_REPLACEMENT_PARENT: externalParent,
              ULTRA_REPLACEMENT_TARGET: fs.realpathSync(target),
            },
          }),
          'ULTRA_SNAPSHOT_REPLACED',
          `tracked ${mode} replacement`,
        );
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(externalParent, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('late tracked, untracked, and HEAD changes return one typed snapshot retry', async (t) => {
  for (const mode of ['late-tracked', 'late-untracked', 'late-head']) {
    await t.test(mode, () => {
      const fixture = initializeDigestRepository(
        'ubp-late-observation-',
        'active',
        'C-LATE',
      );
      const preload = writeGitBoundaryPreload(mode);
      try {
        assertObservationFailure(
          runDigestProcess(fixture.project, 'C-LATE', {
            env: { NODE_OPTIONS: `--require=${preload.preload}` },
          }),
          'ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION',
          mode,
        );
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('final replay rejects product, intent, and HEAD changes before publishing', async (t) => {
  for (const mode of [
    'late-untracked-create',
    'late-untracked-content',
    'late-intent',
    'late-tracked-content',
    'late-head',
  ]) {
    await t.test(mode, () => {
      const fixture = initializeDigestRepository(
        'ubp-final-replay-',
        'active',
        'C-FINAL-REPLAY',
      );
      const preload = writeFinalReplayPreload(mode);
      try {
        if (mode === 'late-untracked-content') {
          fs.writeFileSync(path.join(fixture.project, 'observed.txt'), 'initial untracked bytes\n');
        }
        assertObservationFailure(
          runDigestProcess(fixture.project, 'C-FINAL-REPLAY', {
            env: {
              NODE_OPTIONS: `--require=${preload.preload}`,
              ULTRA_FINAL_REPLAY_INTENT: path.join(fixture.change, 'intent.md'),
            },
            timeout: 5000,
          }),
          'ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION',
          mode,
        );
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('successful digest capture executes exactly one finite closing protocol', () => {
  const fixture = initializeDigestRepository(
    'ubp-closing-protocol-',
    'active',
    'C-CLOSING-PROTOCOL',
  );
  const preload = writeClosingProtocolPreload();
  const receipt = path.join(preload.directory, 'calls.json');
  try {
    const result = runDigestProcess(fixture.project, 'C-CLOSING-PROTOCOL', {
      env: {
        NODE_OPTIONS: `--require=${preload.preload}`,
        ULTRA_CLOSING_PROTOCOL_RECEIPT: receipt,
      },
    });
    const calls = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    assert.equal(result.status, 0, `${result.stderr || result.stdout}\n${JSON.stringify(calls)}`);
    assert.deepEqual(calls, { head: 3, tracked: 3, untracked: 3, diff: 3 });
  } finally {
    fs.rmSync(preload.directory, { recursive: true, force: true });
    fs.rmSync(fixture.project, { recursive: true, force: true });
  }
});

test('terminal seal rejects persistent writes before the final closing observation', async (t) => {
  for (const mode of [
    'terminal-head',
    'terminal-untracked-create',
    'terminal-untracked-content',
    'terminal-tracked-content',
    'terminal-intent',
  ]) {
    await t.test(mode, () => {
      const fixture = initializeDigestRepository(
        'ubp-terminal-window-',
        'active',
        'C-TERMINAL-WINDOW',
      );
      const preload = writeTerminalWindowPreload(mode);
      try {
        if (mode === 'terminal-untracked-create') {
          fs.mkdirSync(path.join(fixture.project, 'src'));
        } else if (mode === 'terminal-untracked-content') {
          fs.writeFileSync(path.join(fixture.project, 'observed.txt'), 'initial untracked bytes\n');
        } else if (mode === 'terminal-tracked-content') {
          fs.writeFileSync(path.join(fixture.project, 'product.js'), 'module.exports = 1.5;\n');
        }
        const result = runDigestProcess(fixture.project, 'C-TERMINAL-WINDOW', {
          env: {
            NODE_OPTIONS: `--require=${preload.preload}`,
            ULTRA_TERMINAL_WINDOW_INTENT: path.join(fixture.change, 'intent.md'),
          },
        });
        const fresh = runDigestProcess(fixture.project, 'C-TERMINAL-WINDOW');
        assert.equal(fresh.error, undefined, `${mode}: fresh recapture stayed within its bound`);
        assert.equal(fresh.status, 0, fresh.stderr || fresh.stdout);
        if (result.status === 0) {
          const staleTuple = JSON.parse(result.stdout);
          const freshTuple = JSON.parse(fresh.stdout);
          assert.notDeepEqual(
            {
              head: staleTuple.head,
              intent_digest: staleTuple.intent_digest,
              diff_digest: staleTuple.diff_digest,
              untracked_files: staleTuple.untracked_files,
            },
            {
              head: freshTuple.head,
              intent_digest: freshTuple.intent_digest,
              diff_digest: freshTuple.diff_digest,
              untracked_files: freshTuple.untracked_files,
            },
            `${mode}: a legacy success must be proven stale by a fresh recapture`,
          );
        }
        assertObservationFailure(
          result,
          'ULTRA_SNAPSHOT_CHANGED_DURING_OBSERVATION',
          mode,
        );
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('every Git observation is physically bounded and failures have typed recovery', async (t) => {
  for (const entry of [
    { mode: 'require-timeout', code: null },
    { mode: 'timeout', code: 'ULTRA_SNAPSHOT_GIT_TIMEOUT' },
    { mode: 'physical-timeout', code: 'ULTRA_SNAPSHOT_GIT_TIMEOUT' },
    { mode: 'error', code: 'ULTRA_SNAPSHOT_GIT_FAILED' },
  ]) {
    await t.test(entry.mode, () => {
      const fixture = initializeDigestRepository(
        'ubp-git-observation-',
        'active',
        'C-GIT',
      );
      const preload = writeGitBoundaryPreload(entry.mode);
      try {
        const result = runDigestProcess(fixture.project, 'C-GIT', {
          env: { NODE_OPTIONS: `--require=${preload.preload}` },
        });
        if (entry.code === null) {
          assert.equal(result.status, 0, result.stderr || result.stdout);
        } else {
          assertObservationFailure(result, entry.code, entry.mode);
        }
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('Git output ceiling is exact and ENOBUFS has typed bounded recovery', () => {
  const fixture = initializeDigestRepository(
    'ubp-git-output-limit-',
    'active',
    'C-GIT-OUTPUT-LIMIT',
  );
  const preload = writeGitBoundaryPreload('output-limit');
  try {
    const result = runDigestProcess(fixture.project, 'C-GIT-OUTPUT-LIMIT', {
      env: { NODE_OPTIONS: `--require=${preload.preload}` },
      timeout: 1500,
    });
    assertObservationFailure(
      result,
      'ULTRA_SNAPSHOT_GIT_OUTPUT_LIMIT',
      'Git output ceiling',
    );
    assert.equal(result.stdout, '', 'Git output overflow publishes no digest tuple');
    assert.match(
      result.stderr,
      /Reduce or split the physical product observation, then retry worktree_digest/iu,
      'Git output ceiling retains reduce-and-retry recovery',
    );
  } finally {
    fs.rmSync(preload.directory, { recursive: true, force: true });
    fs.rmSync(fixture.project, { recursive: true, force: true });
  }
});

test('aggregate product snapshot file ceiling stops before later paths open', () => {
  const fixture = initializeDigestRepository(
    'ubp-aggregate-files-',
    'active',
    'C-AGGREGATE-FILES',
  );
  const tracked = Array.from({ length: 128 }, (_, index) => `tracked-${String(index).padStart(3, '0')}.txt`);
  const untracked = Array.from({ length: 129 }, (_, index) => `untracked-${String(index).padStart(3, '0')}.txt`);
  const sentinel = path.join(fixture.project, 'zz-after-file-ceiling.txt');
  let preload;
  try {
    for (const relative of tracked) fs.writeFileSync(path.join(fixture.project, relative), 'baseline\n');
    for (const args of [['add', ...tracked], ['commit', '-qm', 'aggregate tracked baseline']]) {
      const result = spawnSync('git', args, { cwd: fixture.project, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    for (const relative of tracked) fs.writeFileSync(path.join(fixture.project, relative), 'changed\n');
    for (const relative of untracked) fs.writeFileSync(path.join(fixture.project, relative), 'untracked\n');
    fs.writeFileSync(sentinel, 'must never open\n');
    preload = writeForbiddenOpenPreload(sentinel);

    assertObservationFailure(
      runDigestProcess(fixture.project, 'C-AGGREGATE-FILES', {
        env: { NODE_OPTIONS: `--require=${preload.preload}` },
        timeout: 5000,
      }),
      'ULTRA_SNAPSHOT_RESOURCE_LIMIT',
      'aggregate file ceiling',
    );
  } finally {
    if (preload) fs.rmSync(preload.directory, { recursive: true, force: true });
    fs.rmSync(fixture.project, { recursive: true, force: true });
  }
});

test('aggregate product snapshot admits 256 tracked deletions and rejects 257', () => {
  for (const count of [256, 257]) {
    const changeId = `C-AGGREGATE-DELETIONS-${count}`;
    const fixture = initializeDigestRepository(
      'ubp-aggregate-deletions-',
      'active',
      changeId,
    );
    const deleted = Array.from(
      { length: count },
      (_, index) => `deleted-${String(index).padStart(3, '0')}.txt`,
    );
    let preload;
    try {
      for (const relative of deleted) fs.writeFileSync(path.join(fixture.project, relative), 'x');
      for (const args of [['add', ...deleted], ['commit', '-qm', 'tracked deletion baseline']]) {
        const setup = spawnSync('git', args, { cwd: fixture.project, encoding: 'utf8' });
        assert.equal(setup.status, 0, setup.stderr || setup.stdout);
      }
      for (const relative of deleted) fs.rmSync(path.join(fixture.project, relative));
      preload = writeForbiddenDeletedOpenPreload(fixture.project);

      const result = runDigestProcess(fixture.project, changeId, {
        env: { NODE_OPTIONS: `--require=${preload.preload}` },
        timeout: 5000,
      });
      if (count === 256) {
        assert.equal(result.error, undefined, '256 deletions terminate within the outer bound');
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const observed = JSON.parse(result.stdout);
        const head = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: fixture.project,
          encoding: 'utf8',
        }).trim();
        const exactDiff = execFileSync('git', [
          'diff', '--binary', '--no-ext-diff', head, '--', '.',
          ':(exclude).ultra/test-report.json',
          ':(exclude).ultra/evidence/**',
          ':(exclude).ultra/reviews/**',
          ':(exclude).ultra/.runtime/**',
          ':(exclude).ultra/progress/**',
          ':(exclude).ultra/changes/active/**',
          ':(exclude).ultra/changes/archive/**',
          ':(exclude).ultra/changes/abandoned/**',
        ], { cwd: fixture.project, encoding: 'buffer' });
        const expectedDigest = crypto.createHash('sha256')
          .update('ultra-worktree-digest-v1\0')
          .update(head)
          .update('\0')
          .update(exactDiff)
          .digest('hex');
        assert.equal(observed.diff_digest, expectedDigest, 'all 256 deletions remain in the digest');
        assert.equal(observed.dirty, true);
        assert.deepEqual(observed.untracked_files, []);
      } else {
        assertObservationFailure(
          result,
          'ULTRA_SNAPSHOT_RESOURCE_LIMIT',
          '257 tracked deletions',
        );
        assert.equal(result.stdout, '', 'resource failure publishes no digest tuple');
        assert.match(
          result.stderr,
          /Reduce or split the included physical product observation, then retry worktree_digest/iu,
          'tracked deletion ceiling retains reduce-and-retry recovery',
        );
      }
      assert.doesNotMatch(result.stderr, /ULTRA_TEST_OPENED_TRACKED_DELETION/u);
    } finally {
      if (preload) fs.rmSync(preload.directory, { recursive: true, force: true });
      fs.rmSync(fixture.project, { recursive: true, force: true });
    }
  }
});

test('aggregate product snapshot byte ceiling applies across tracked and untracked paths', () => {
  const fixture = initializeDigestRepository(
    'ubp-aggregate-bytes-',
    'active',
    'C-AGGREGATE-BYTES',
  );
  const tracked = path.join(fixture.project, 'aggregate-tracked.bin');
  const firstUntracked = path.join(fixture.project, 'aggregate-untracked-a.bin');
  const opensCeiling = path.join(fixture.project, 'aggregate-untracked-b.bin');
  const sentinel = path.join(fixture.project, 'zz-after-byte-ceiling.txt');
  let preload;
  try {
    fs.writeFileSync(tracked, Buffer.alloc(6 * 1024 * 1024, 0x61));
    for (const args of [
      ['add', path.basename(tracked)],
      ['commit', '-qm', 'aggregate byte baseline'],
    ]) {
      const result = spawnSync('git', args, { cwd: fixture.project, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }
    fs.writeFileSync(tracked, Buffer.alloc(6 * 1024 * 1024, 0x62));
    fs.writeFileSync(firstUntracked, Buffer.alloc(6 * 1024 * 1024, 0x63));
    fs.writeFileSync(opensCeiling, Buffer.alloc(6 * 1024 * 1024, 0x64));
    fs.writeFileSync(sentinel, 'must never open\n');
    preload = writeForbiddenOpenPreload(sentinel);

    assertObservationFailure(
      runDigestProcess(fixture.project, 'C-AGGREGATE-BYTES', {
        env: { NODE_OPTIONS: `--require=${preload.preload}` },
        timeout: 5000,
      }),
      'ULTRA_SNAPSHOT_RESOURCE_LIMIT',
      'aggregate byte ceiling',
    );
  } finally {
    if (preload) fs.rmSync(preload.directory, { recursive: true, force: true });
    fs.rmSync(fixture.project, { recursive: true, force: true });
  }
});

test('Change intent snapshots reject unsafe filesystem identities with typed recovery', async (t) => {
  const cases = [
    {
      name: 'active symlink',
      state: 'active',
      code: 'ULTRA_SNAPSHOT_SYMLINK',
      mutate({ change, project }) {
        const external = path.join(project, '..', `${path.basename(project)}-external-intent`);
        fs.writeFileSync(external, 'external intent\n');
        fs.rmSync(path.join(change, 'intent.md'));
        fs.symlinkSync(external, path.join(change, 'intent.md'));
        return () => fs.rmSync(external, { force: true });
      },
    },
    {
      name: 'archive FIFO',
      state: 'archive',
      code: 'ULTRA_SNAPSHOT_NOT_REGULAR',
      mutate({ change }) {
        const intent = path.join(change, 'intent.md');
        fs.rmSync(intent);
        const result = spawnSync('mkfifo', [intent], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.stdout);
      },
    },
    {
      name: 'abandoned oversize file',
      state: 'abandoned',
      code: 'ULTRA_SNAPSHOT_TOO_LARGE',
      mutate({ change }) {
        fs.writeFileSync(
          path.join(change, 'intent.md'),
          Buffer.alloc(SNAPSHOT_LIMIT_BYTES + 1, 0x61),
        );
      },
    },
    {
      name: 'active parent symlink',
      state: 'active',
      code: 'ULTRA_SNAPSHOT_SYMLINK',
      mutate({ change, project }) {
        const external = path.join(project, '..', `${path.basename(project)}-external-change`);
        fs.mkdirSync(external);
        fs.writeFileSync(path.join(external, 'intent.md'), 'external intent\n');
        fs.rmSync(change, { recursive: true });
        fs.symlinkSync(external, change, 'dir');
        return () => fs.rmSync(external, { recursive: true, force: true });
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const changeId = `C-${entry.state.toUpperCase()}`;
      const fixture = initializeDigestRepository(
        `ubp-intent-${entry.state}-`,
        entry.state,
        changeId,
      );
      let cleanupMutation;
      try {
        cleanupMutation = entry.mutate(fixture);
        assertSnapshotFailure(
          runDigestProcess(fixture.project, changeId, { timeout: 1200 }),
          entry.code,
          entry.name,
        );
      } finally {
        cleanupMutation?.();
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('untracked product snapshots reject unsafe filesystem identities with typed recovery', async (t) => {
  const cases = [
    {
      name: 'external symlink',
      code: 'ULTRA_SNAPSHOT_SYMLINK',
      create(project) {
        const external = path.join(project, '..', `${path.basename(project)}-external-product`);
        fs.writeFileSync(external, 'external product\n');
        fs.symlinkSync(external, path.join(project, 'untracked-link'));
        return () => fs.rmSync(external, { force: true });
      },
    },
    {
      name: 'oversize file',
      code: 'ULTRA_SNAPSHOT_TOO_LARGE',
      create(project) {
        fs.writeFileSync(
          path.join(project, 'untracked-large'),
          Buffer.alloc(SNAPSHOT_LIMIT_BYTES + 1, 0x62),
        );
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const fixture = initializeDigestRepository(
        'ubp-untracked-unsafe-',
        'active',
        'C-UNTRACKED',
      );
      let cleanupMutation;
      try {
        cleanupMutation = entry.create(fixture.project);
        assertSnapshotFailure(
          runDigestProcess(fixture.project, 'C-UNTRACKED', { timeout: 1200 }),
          entry.code,
          entry.name,
        );
      } finally {
        cleanupMutation?.();
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('intent and untracked snapshots reject deterministic file and parent replacements', async (t) => {
  const cases = [
    { name: 'intent file', kind: 'intent', mode: 'file' },
    { name: 'intent parent', kind: 'intent', mode: 'parent' },
    { name: 'untracked file', kind: 'untracked', mode: 'file' },
    { name: 'untracked FIFO', kind: 'untracked', mode: 'fifo' },
    { name: 'untracked parent', kind: 'untracked', mode: 'parent' },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const fixture = initializeDigestRepository(
        'ubp-snapshot-replacement-',
        'archive',
        'C-REPLACE',
      );
      const parent = entry.kind === 'intent'
        ? fixture.change
        : path.join(fixture.project, 'untracked-parent');
      const target = entry.kind === 'intent'
        ? path.join(parent, 'intent.md')
        : path.join(parent, 'product.bin');
      const externalParent = path.join(
        fixture.project,
        '..',
        `${path.basename(fixture.project)}-${entry.kind}-replacement`,
      );
      const preload = writeReplacementPreload(entry.mode);
      try {
        if (entry.kind === 'untracked') {
          fs.mkdirSync(parent);
          fs.writeFileSync(target, 'original product bytes\n');
        }
        if (entry.mode === 'parent') {
          fs.mkdirSync(externalParent);
          fs.writeFileSync(
            path.join(externalParent, path.basename(target)),
            'external replacement bytes\n',
          );
        }
        assertSnapshotFailure(
          runDigestProcess(fixture.project, 'C-REPLACE', {
            env: {
              NODE_OPTIONS: `--require=${preload.preload}`,
              ULTRA_REPLACEMENT_PARENT: externalParent,
              ULTRA_REPLACEMENT_TARGET: fs.realpathSync(target),
            },
          }),
          'ULTRA_SNAPSHOT_REPLACED',
          entry.name,
        );
      } finally {
        fs.rmSync(preload.directory, { recursive: true, force: true });
        fs.rmSync(externalParent, { recursive: true, force: true });
        fs.rmSync(fixture.project, { recursive: true, force: true });
      }
    });
  }
});

test('delivery metadata and archive moves do not invalidate a tested product snapshot', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-delivery-freshness-'));
  const active = path.join(project, '.ultra', 'changes', 'active', 'C-02');
  const archive = path.join(project, '.ultra', 'changes', 'archive');
  const script = path.join(SKILLS, 'ultra-test', 'scripts', 'worktree_digest.cjs');
  fs.mkdirSync(active, { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(path.join(active, 'intent.md'), '# Change C-02\n\n## Outcome\nShip it.\n');
  fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 1;\n');

  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: project, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  };
  const digest = () => JSON.parse(run(process.execPath, [
    script, '--project', project, '--change-id', 'C-02',
  ]));

  try {
    run('git', ['init', '-q']);
    run('git', ['config', 'user.name', 'Ultra Test']);
    run('git', ['config', 'user.email', 'ultra-test@example.invalid']);
    run('git', ['add', '.']);
    run('git', ['commit', '-qm', 'baseline']);

    fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 2;\n');
    const tested = digest();
    fs.writeFileSync(path.join(active, 'delivery.md'), '# Delivery C-02\n');
    const withDelivery = digest();
    assert.equal(withDelivery.diff_digest, tested.diff_digest);
    assert.equal(withDelivery.intent_digest, tested.intent_digest);

    fs.renameSync(active, path.join(archive, 'C-02'));
    const archived = digest();
    assert.equal(archived.diff_digest, tested.diff_digest);
    assert.equal(archived.intent_digest, tested.intent_digest);

    fs.appendFileSync(path.join(archive, 'C-02', 'intent.md'), '\nChanged acceptance.\n');
    const changedIntent = digest();
    assert.equal(changedIntent.diff_digest, tested.diff_digest);
    assert.notEqual(changedIntent.intent_digest, tested.intent_digest);

    fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 3;\n');
    assert.notEqual(digest().diff_digest, tested.diff_digest);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('evidence publication does not self-invalidate product worktree freshness', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-evidence-freshness-'));
  const active = path.join(project, '.ultra', 'changes', 'active', 'C-03');
  const evidence = path.join(project, '.ultra', 'evidence', 'T-03');
  const script = path.join(SKILLS, 'ultra-test', 'scripts', 'worktree_digest.cjs');
  fs.mkdirSync(active, { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(active, 'intent.md'), '# Change C-03\n\n## Outcome\nShip it.\n');
  fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(evidence, 'evidence.json'), '{"state":"baseline"}\n');
  fs.writeFileSync(path.join(evidence, 'verification.log'), 'baseline\n');

  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: project, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  };
  const digest = () => JSON.parse(run(process.execPath, [
    script, '--project', project, '--change-id', 'C-03',
  ]));
  const receiptPath = path.join(evidence, 'verification.log');
  const receiptSha256 = () => crypto.createHash('sha256')
    .update(fs.readFileSync(receiptPath))
    .digest('hex');

  try {
    run('git', ['init', '-q']);
    run('git', ['config', 'user.name', 'Ultra Test']);
    run('git', ['config', 'user.email', 'ultra-test@example.invalid']);
    run('git', ['add', '.']);
    run('git', ['commit', '-qm', 'baseline']);

    const observed = digest();
    const observedReceiptSha256 = receiptSha256();
    fs.writeFileSync(
      receiptPath,
      `worktree_digest=${observed.diff_digest}\n`,
    );
    const published = digest();
    assert.equal(published.diff_digest, observed.diff_digest);
    assert.equal(published.dirty, observed.dirty);
    assert.notEqual(
      receiptSha256(),
      observedReceiptSha256,
      'excluded pre-review receipt bytes require their own packet-recorded SHA-256',
    );

    fs.writeFileSync(path.join(evidence, 'evidence.json'), '{"state":"refreshed"}\n');
    fs.writeFileSync(path.join(evidence, 'additional-receipt.log'), 'fresh output\n');
    const refreshed = digest();
    assert.equal(refreshed.diff_digest, observed.diff_digest);
    assert.equal(refreshed.dirty, observed.dirty);
    assert.ok(
      refreshed.untracked_files.every((file) => !file.startsWith('.ultra/evidence/')),
      'evidence publication is not part of the product file set',
    );

    fs.writeFileSync(path.join(project, 'product.js'), 'module.exports = 2;\n');
    assert.notEqual(digest().diff_digest, observed.diff_digest);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('runtime package has no legacy semantic supervisor or duplicate projection', () => {
  for (const retired of ['mcp-server', 'orchestrator', 'ultra-tools', 'commands', 'agents']) {
    assert.equal(fs.existsSync(path.join(ROOT, retired)), false, retired);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.bin), ['ultra-builder-pro-cli', 'ubp']);
  assert.equal(pkg.dependencies['@modelcontextprotocol/server'], undefined);
  assert.equal(pkg.dependencies['better-sqlite3'], undefined);
  assert.ok(!pkg.files.some((entry) => /^(?:mcp-server|orchestrator|ultra-tools|commands|agents)(?:\/|$)/.test(entry)));
});

test('the runtime allowlist contains the five advisory and safety hooks only', () => {
  assert.deepEqual(WORKFLOW_HOOK_FILES, [
    'session_context.py',
    'mid_workflow_recall.py',
    'compact_context.py',
    'post_edit_guard.py',
    'block_dangerous_commands.py',
  ]);
  for (const name of WORKFLOW_HOOK_FILES) {
    const file = path.join(ROOT, 'hooks', name);
    assert.ok(fs.existsSync(file), name);
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /\.ultra/, `${name} lacks the idle guard`);
  }
});

// ---------------------------------------------------------------------------
// v0.27 H0 — Harness Loop Closure incident regressions
// (docs/V027-HARNESS-LOOP-INCIDENT-REMEDIATION.zh-CN.md, HL-01..HL-17)
// ---------------------------------------------------------------------------

const H0_LIVE_CONSUMERS = () => [
  ['review skill', readSkill('ultra-review')],
  ['review schema', fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'unified-schema.md'),
    'utf8',
  )],
  ['worker packet', fs.readFileSync(
    path.join(SKILLS, 'ultra-review', 'references', 'worker-packet.md'),
    'utf8',
  )],
  ['dev skill', readSkill('ultra-dev')],
  ['test skill', readSkill('ultra-test')],
  ['deliver skill', readSkill('ultra-deliver')],
  ['status skill', readSkill('ultra-status')],
  ['task evidence v2', fs.readFileSync(
    path.join(SKILLS, 'ultra-plan', 'references', 'task-evidence-v2.md'),
    'utf8',
  )],
  ['context template', fs.readFileSync(
    path.join(ROOT, '.ultra-template', 'contexts', 'TEMPLATE.md'),
    'utf8',
  )],
  ['hooks readme', fs.readFileSync(path.join(ROOT, 'hooks', 'README.md'), 'utf8')],
  ['artifact authority', fs.readFileSync(
    path.join(ROOT, 'docs', 'ARTIFACT-AUTHORITY.md'),
    'utf8',
  )],
  ['workflow lifecycle', fs.readFileSync(
    path.join(ROOT, 'docs', 'WORKFLOW-LIFECYCLE.md'),
    'utf8',
  )],
];

function h0Read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const flat = (text) => collapseWhitespace(text);

test('task review APPROVE with retained P2/P3 is terminal and REQUEST_CHANGES routes only exact current P0/P1', () => {
  const schema = h0Read('skills/ultra-review/references/unified-schema.md');
  const review = readSkill('ultra-review');
  const dev = readSkill('ultra-dev');

  // HL-01: APPROVE stays terminal while P2/P3 findings are retained.
  assert.match(flat(schema), /An `APPROVE` verdict is terminal for the current task review/iu);
  assert.match(flat(schema), /P2 and P3 findings are non-blocking/iu);
  assert.match(flat(schema), /no fresh review of the same subject after a current `APPROVE`/iu);
  assert.match(
    flat(review),
    /`APPROVE` ends the current task review even when P2 or P3 findings are retained/iu,
  );
  assert.match(
    flat(review),
    /no fresh review of the same subject may be opened after a current `APPROVE`/iu,
  );

  // HL-03: only exact current P0/P1 (or owner-promoted) findings route to repair.
  assert.match(
    flat(schema),
    /`REQUEST_CHANGES` routes only the exact current P0\/P1 finding ids/iu,
  );
  assert.match(flat(schema), /reclassified it as P1/iu);
  assert.match(flat(dev), /one in-scope repair set/iu);
  assert.match(flat(dev), /at most one affected-lens delta review/iu);
  assert.match(flat(dev), /second `REQUEST_CHANGES` returns to the owner checkpoint/iu);
  assert.match(
    flat(review),
    /second `REQUEST_CHANGES`[\s\S]{0,200}owner checkpoint/iu,
  );

  // HL-10: lens selection follows the review kind (initial / delta / aggregate),
  // with the aggregate full-roster default conditional, never mandatory.
  assert.match(flat(review), /An \*\*initial task review\*\* always selects `review-spec` plus only the lenses/iu);
  assert.match(flat(review), /A \*\*delta review\*\* reruns only the lenses/iu);
  assert.match(flat(review), /An \*\*aggregate Change review\*\* may default to all six only when the cross-task/iu);
  assert.match(flat(review), /never a mandatory count or a quality proxy/iu);

  // HL-11: an out-of-scope finding stops at a scope-change proposal, never an edit.
  assert.match(
    flat(review),
    /A finding outside the packet's `diff_files` is a scope-change proposal/iu,
  );
  assert.match(flat(review), /record it, do not edit that path/iu);

  // HL-15 replay: the documented primary path terminates at the first APPROVE
  // or after one blocking repair plus one delta.
  const transitions = {
    'APPROVE+P0P1-free': 'close',
    'APPROVE+P2': 'close',
    'REQUEST_CHANGES': 'repair-once',
    'repair+delta:APPROVE': 'close',
    'repair+delta:REQUEST_CHANGES': 'owner-checkpoint',
    'repair+delta:INCOMPLETE': 'owner-checkpoint',
  };
  assert.equal(transitions['APPROVE+P2'], 'close');
  assert.equal(transitions['repair+delta:REQUEST_CHANGES'], 'owner-checkpoint');

  // HL-02: no zero-finding completion phrasing survives in the review surface.
  for (const text of [schema, review, dev]) {
    assert.doesNotMatch(
      flat(text),
      /zero[- ]find(?:ing|ings) (?:strict )?(?:review|re-?review|loop|gate|completion)/iu,
    );
    assert.doesNotMatch(flat(text), /(?:until|to reach|reach) zero[- ]find(?:ing|ings)/iu);
  }
});

test('Resume Note cannot override authority and never requires a fresh zero-finding review', () => {
  const template = h0Read('.ultra-template/contexts/TEMPLATE.md');
  const authority = h0Read('docs/ARTIFACT-AUTHORITY.md');
  const compactHook = h0Read('hooks/compact_context.py');
  const commonHook = h0Read('hooks/_common.py');

  // HL-06 / RC-04: narrow navigational semantics in the canonical template.
  assert.match(flat(template), /Navigational state only/iu);
  assert.match(
    flat(template),
    /It cannot override current owner authority, approved scope\/budget, task acceptance, or a validated Review verdict/iu,
  );
  assert.doesNotMatch(flat(template), /single most important line/iu);
  assert.match(flat(authority), /## Routing precedence/iu);
  assert.match(
    flat(authority),
    /The Resume Note is navigational context/iu,
  );
  assert.match(
    flat(authority),
    /owner instruction[\s\S]{0,600}Resume Note[\s\S]{0,220}Hooks[\s\S]{0,220}derived observations/iu,
  );

  // RC-04: no Hook text grants Resume verdict/scope/budget override power.
  assert.doesNotMatch(compactHook, /Resume Note remain authoritative/iu);
  assert.match(
    flat(commonHook),
    /Resume Note is navigational context\. It cannot override current owner authority, approved scope\/budget, task acceptance, or a validated Review verdict\./iu,
  );

  // HL-02: zero-finding is not a completion condition in any live consumer.
  for (const [label, text] of H0_LIVE_CONSUMERS()) {
    assert.doesNotMatch(
      flat(text),
      /zero[- ]find(?:ing|ings)\s+(?:is|are|as|becomes|means|equals|implies)\s+(?:a|an|the)?\s*(?:completion|complete|done|converged|goal)/iu,
      `${label}: zero-finding completion`,
    );
    assert.doesNotMatch(
      flat(text),
      /(?:until|to reach|reach) zero[- ]find(?:ing|ings)/iu,
      `${label}: zero-finding target`,
    );
  }
});

test('one blocking delta per task ends at an owner checkpoint and budgets never emit semantic verdicts', () => {
  const review = readSkill('ultra-review');
  const dev = readSkill('ultra-dev');
  const status = readSkill('ultra-status');
  const decision = h0Read('.ultra/decisions/2026-08-16-v027-harness-loop-closure.md');

  // HL-04: one initial + at most one delta review, then the owner checkpoint.
  assert.match(flat(review), /runs at most once per task/iu);
  assert.match(
    flat(review),
    /A second `REQUEST_CHANGES`[\s\S]{0,200}owner checkpoint/iu,
  );

  // HL-05 / RC-02: budget stops execution without any semantic verdict.
  assert.match(
    flat(review),
    /Budget exhaustion returns `owner checkpoint` \/ `budget_exhausted` and keeps the task `in_progress` without disposing findings\./iu,
  );
  assert.match(
    flat(dev),
    /Budget exhaustion stops execution at `owner checkpoint` \/ `budget_exhausted` and keeps the ledger row `in_progress`\./iu,
  );
  for (const [label, text] of [['review', review], ['dev', dev]]) {
    assert.match(
      flat(text),
      /It never yields `APPROVE`, `REQUEST_CHANGES`, `INCOMPLETE`, pass, fail, accept, or abandon/iu,
      `${label}: budget never yields a verdict`,
    );
  }
  assert.match(
    flat(status),
    /budget stop or `owner checkpoint` is displayed as-is/iu,
  );
  assert.match(
    flat(status),
    /never infers continuation, extension, or any semantic verdict from a budget stop/iu,
  );

  // H0 bootstrap grant: the owner-approved exact budget is on durable record.
  assert.match(decision, /max_zcode_active_time: 4h/u);
  assert.match(decision, /max_initial_reviews: 1/u);
  assert.match(decision, /max_delta_reviews: 1/u);
  assert.match(decision, /max_auto_repair_sets: 1/u);
  assert.match(decision, /max_concurrent_writers: 1/u);
  assert.match(decision, /allowed_writer: ZCode/u);
  assert.match(decision, /review_mode: external_manual/u);
  assert.match(
    decision,
    /c39347ca3553175aec06629f710a8541db8a12445e5a17dd90e62e6b75bc2acb/u,
    'decision binds the accepted incident-contract SHA-256',
  );
});

test('self-hosting review requires an owner-accepted baseline and a stable external reviewer boundary', () => {
  const review = readSkill('ultra-review');
  const decision = h0Read('.ultra/decisions/2026-08-16-v027-harness-loop-closure.md');

  // HL-08 / RC-05: touching the review machinery enters a pinned boundary.
  assert.match(flat(review), /## Self-hosting review boundary/iu);
  assert.match(review, /skills\/ultra-review\//u);
  assert.match(review, /review_wait\.py/u);
  assert.match(flat(review), /owner-accepted contract digest/iu);
  assert.match(flat(review), /stable external reviewer boundary/iu);
  assert.match(
    flat(review),
    /never use the local changing `ultra-review` implementation to approve itself/iu,
  );
  assert.match(
    decision,
    /reviewer: Codex root, read-only/u,
    'decision: named read-only reviewer',
  );
});

test('the superseded v0.27 route stays inert history under the 3.0 Mode B work package', () => {
  const ledger = JSON.parse(h0Read('.ultra/tasks.json'));
  const byId = new Map(ledger.tasks.map((task) => [task.id, task]));

  // The v0.27 change is abandoned with an exact closure citing the superseding
  // grant; its rows stay in the append-only ledger as inert history.
  const abandonedIntent = h0Read('.ultra/changes/abandoned/chg-v027-lifecycle-closure/intent.md');
  assert.match(abandonedIntent, /^## Abandonment$/m);
  assert.match(abandonedIntent, /ubp3-mode-b-2026-08-17/u);
  assert.match(abandonedIntent, /a91b563a48889909f80fc61f608a8198edec86c073a9b039ee57788b38483c1f/u);
  assert.match(abandonedIntent, /- Recovery or successor: successor Change `chg-ultra-3-0-mode-b`/u);
  assert.equal(
    fs.existsSync(path.join(ROOT, '.ultra', 'changes', 'active', 'chg-v027-lifecycle-closure')),
    false,
    'the superseded change no longer occupies the active position',
  );

  const h0 = byId.get('v027-harness-loop-closure');
  assert.ok(h0, 'H0 task row exists');
  assert.equal(h0.status, 'completed');
  for (const superseded of [
    'v027-autonomy-packet', 'v027-adversarial-lifecycle', 'v027-delegation-snapshot',
    'v027-host-adapters-hooks', 'v027-doctor-provenance', 'v027-migration-acceptance',
  ]) {
    assert.equal(byId.get(superseded).status, 'pending', `${superseded} stays inert history`);
    assert.equal(byId.get(superseded).change_id, 'chg-v027-lifecycle-closure');
  }

  // The one active change is the 3.0 Mode B work package; its single task row is
  // completed after the accepted Round-5 closeout, and no v0.27 row is
  // re-activated by the supersession.
  const frontier = byId.get('v30-mode-b-local-implementation');
  assert.ok(frontier, '3.0 task row exists');
  assert.equal(frontier.status, 'completed');
  assert.equal(frontier.change_id, 'chg-ultra-3-0-mode-b');
  assert.deepEqual(frontier.dependencies, []);
  assert.ok(fs.existsSync(path.join(ROOT, frontier.context_file)), '3.0 context exists');
  const activeIntent = h0Read('.ultra/changes/active/chg-ultra-3-0-mode-b/intent.md');
  assert.match(activeIntent, /^## Execution Grant$/m);
  assert.match(activeIntent, /`durable work-package` — `ubp3-mode-b-2026-08-17`/u);
  const inProgress = ledger.tasks.filter((task) => task.status === 'in_progress');
  assert.deepEqual(
    inProgress.map((task) => task.id),
    [],
    'no in-progress rows remain after the accepted closeout',
  );
});
