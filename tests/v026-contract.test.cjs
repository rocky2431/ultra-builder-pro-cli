'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
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
const ALL = [...USER, ...MODEL, ...ROUTER].sort();

function readSkill(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function walk(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

test('v0.26 exposes exactly fourteen file-first skills in three roles', () => {
  assert.deepEqual(USER_INVOKED_SKILLS, USER);
  assert.deepEqual(MODEL_INVOKED_SKILLS, MODEL);
  assert.deepEqual(ROUTER_SKILLS, ROUTER);
  assert.deepEqual(
    fs.readdirSync(SKILLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    ALL,
  );
  for (const runtime of ['claude', 'opencode', 'codex', 'kimi', 'grok']) {
    assert.deepEqual(skillsForRuntime(runtime).sort(), ALL, runtime);
  }
  for (const name of USER) {
    assert.equal(skillPolicy(name).userInvocable, true, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, false, name);
  }
  for (const name of MODEL) {
    assert.equal(skillPolicy(name).userInvocable, false, name);
    assert.equal(skillPolicy(name).allowImplicitInvocation, true, name);
  }
  assert.equal(skillPolicy('ultra-status').userInvocable, true);
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

test('development convergence has a task-scoped target and a finite set-based exit', () => {
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
  assert.match(dev, /best-ever passing set/iu);
  assert.match(dev, /three repair rounds/iu);
  assert.match(dev, /two consecutive repair rounds add no new/iu);
  assert.match(dev, /command did not start/iu);
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
  assert.match(change, /quick.*one[ -]task.*ultra-plan/iu);
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
  assert.match(review, /P0\s*\+\s*P1/i);
  assert.match(review, /ARCHITECTURAL_CONCERN/);
  assert.match(review, /12 findings/i);
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
  assert.match(status, /in_progress[^\n]*3 days/i);
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
  assert.match(init, /empty[^\n]+North Star[^\n]+specification skeleton/iu);
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
  assert.match(measurements, /North Star[^\n]+when justified/iu);
  assert.match(measurements, /do not force[^\n]+single metric/iu);
  assert.match(synthesis, /update `\.ultra\/north-star\.md`/iu);
  assert.match(synthesis, /`git hash-object`/u);
  assert.match(distillateTemplate, /^## Source Revisions$/mu);
  assert.match(distillateTemplate, /Git blob hash[^\n]+`git hash-object`/u);

  for (const name of [...USER, ...MODEL, ...ROUTER].filter((name) => name !== 'ultra-research')) {
    assert.doesNotMatch(readSkill(name), /references\/0[0-5]-[^`\s]+\.md/u, `${name} owns a Research lens`);
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
  assert.match(status, /accepted North Star[^\n]+`ultra-research`/u);
  assert.doesNotMatch(status, /Product specification missing or contains `\[NEEDS CLARIFICATION\]`/u);

  assert.match(change, /only the touched specification sections/iu);
  assert.match(change, /does not rebuild the project baseline/iu);
  assert.match(change, /quick.*one[ -]task.*ultra-plan/iu);
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
  assert.match(init, /new skeleton[^\n]+empty North Star/iu);
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
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8')), { tasks: [] });

  const brief = fs.readFileSync(path.join(root, 'project-brief.md'), 'utf8');
  for (const heading of ['One-line', 'Initial Outline', 'Explicit Inputs', 'Open Questions for Research']) {
    assert.match(brief, new RegExp(`^## ${heading}$`, 'm'), `project brief: ${heading}`);
  }
  assert.match(brief, /raw owner intake/i);

  const northStar = fs.readFileSync(path.join(root, 'north-star.md'), 'utf8');
  for (const heading of ['Project Direction', 'North Star Outcome', 'Hard Constraints', 'Explicit Exclusions', 'Research Trace']) {
    assert.match(northStar, new RegExp(`^## ${heading}$`, 'm'), `north star: ${heading}`);
  }
  assert.doesNotMatch(northStar, /^## One-line$/m);
  assert.match(northStar, /established by `ultra-research`/i);

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
