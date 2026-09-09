'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const assets = require('../adapters/_shared/runtime-assets.cjs');

const PUBLIC_MODES = Object.freeze({
  'ultra-init': {
    create: 'explicit-entry',
    recover: 'explicit-entry',
  },
  'ultra-research': {
    baseline: 'explicit-entry',
    'change-scoped': 'grant-continuable',
  },
  'ultra-change': {
    intake: 'explicit-entry',
    'evidence-needed': 'explicit-entry',
    reconcile: 'grant-continuable',
    accepted: 'explicit-entry',
  },
  'ultra-plan': {
    decompose: 'grant-continuable',
    recover: 'grant-continuable',
  },
  'ultra-dev': {
    execute: 'grant-continuable',
    resume: 'grant-continuable',
    reopen: 'grant-continuable',
  },
  'ultra-test': {
    audit: 'grant-continuable',
    reaudit: 'grant-continuable',
  },
  'ultra-deliver': {
    reconcile: 'grant-continuable',
    finalize: 'explicit-entry',
  },
  'ultra-delegate': {
    task: 'explicit-entry',
    research: 'explicit-entry',
    aggregate: 'explicit-entry',
  },
  'ultra-status': {
    route: 'router',
    history: 'router',
    installation: 'router',
    delegation: 'router',
    recovery: 'router',
  },
});

// Coarse Host discovery stays off only for the routes the product requires the Owner to
// name: read-only Status diagnosis and owner-authorized Delegate topology.
const DISCOVERY_WITHHELD = ['ultra-delegate', 'ultra-status'];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('one canonical Route Contract defines the owner-visible card and continuation boundary', () => {
  const contractPath = path.join(
    ROOT,
    'skills',
    'ultra-status',
    'references',
    'route-contract.md',
  );
  assert.ok(fs.existsSync(contractPath), 'missing canonical Route Contract');
  const contract = fs.readFileSync(contractPath, 'utf8');

  for (const heading of [
    '## Route Card',
    '## Material checkpoints',
    '## Continuation',
    '## Recovery and degraded diagnosis',
  ]) {
    assert.match(contract, new RegExp(`^${heading}$`, 'm'), heading);
  }
  for (const field of [
    'Route',
    'Mode',
    'Why',
    'Outcome',
    'Accepted boundary',
    'Position',
    'Exit condition',
    'Delta',
    'Reality',
    'Decision needed',
    'Next',
    'Not done',
  ]) {
    assert.match(contract, new RegExp('^\\| `' + field + '` \\|', 'm'), field);
  }

  assert.match(contract, /derived observation/i);
  assert.match(contract, /valid Execution Grant/);
  assert.match(contract, /^\| `router` \| yes \| no;/m);
  assert.doesNotMatch(contract, /\.ultra\/(?:route|stage|workflow-state)/i);
  assert.doesNotMatch(contract, /completion percentage|percent complete/i);
});

test('every public Skill declares its modes, observable exit, and canonical Route Contract', () => {
  for (const [name, modes] of Object.entries(PUBLIC_MODES)) {
    const source = read(`skills/${name}/SKILL.md`);
    const reference = name === 'ultra-status'
      ? 'references/route-contract.md'
      : '../ultra-status/references/route-contract.md';

    assert.match(source, /^## Route modes$/m, `${name} route modes heading`);
    assert.match(source, /\| Mode \| Entry \| Observable exit \| Next \|/, `${name} route table`);
    assert.ok(source.includes(`\`${reference}\``), `${name} canonical reference`);
    for (const mode of Object.keys(modes)) {
      assert.match(source, new RegExp('^\\| `' + mode + '` \\|', 'm'), `${name}:${mode}`);
    }
  }
});

test('Research is bounded and product evidence gaps return through Change before Plan', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const plan = read('skills/ultra-plan/SKILL.md');

  assert.match(research, /observable stop condition/i);
  assert.match(research, /return route/i);
  assert.match(research, /change-scoped[\s\S]*`ultra-change`/i);
  assert.match(plan, /product or contract evidence gap[\s\S]*`ultra-change(?:\/reconcile)?`/i);
  assert.doesNotMatch(plan, /whole path is still unclear, recommend `ultra-research`/i);
});

test('runtime invocation policy preserves mode distinctions behind coarse Host metadata', () => {
  assert.deepEqual(assets.PUBLIC_SKILL_INVOCATION_MODES, PUBLIC_MODES);
  assert.deepEqual(assets.GRANT_CONTINUABLE_SKILLS, [
    'ultra-research',
    'ultra-change',
    'ultra-plan',
    'ultra-dev',
    'ultra-test',
    'ultra-deliver',
  ]);

  for (const [name, modes] of Object.entries(PUBLIC_MODES)) {
    const policy = assets.skillPolicy(name);
    const invocationClasses = [...new Set(Object.values(modes))];
    assert.deepEqual(policy, {
      userInvocable: true,
      allowImplicitInvocation: !DISCOVERY_WITHHELD.includes(name),
      invocationClasses,
      modes,
    }, name);
  }

  for (const name of assets.MODEL_INVOKED_SKILLS) {
    assert.deepEqual(assets.skillPolicy(name), {
      userInvocable: false,
      allowImplicitInvocation: true,
      invocationClasses: ['model-discipline'],
      modes: {},
    }, name);
  }

  assert.equal(assets.skillPolicy('ultra-status').allowImplicitInvocation, false);
});

test('Init permits native discovery without granting authority', () => {
  assert.deepEqual(assets.HOST_DISCOVERY_WITHHELD_SKILLS, DISCOVERY_WITHHELD);

  // This checks metadata, not whether a host model will actually select the Skill.
  const init = assets.skillPolicy('ultra-init');
  assert.deepEqual(init.invocationClasses, ['explicit-entry']);
  assert.equal(init.allowImplicitInvocation, true);
  assert.equal(assets.skillPolicy('ultra-delegate').allowImplicitInvocation, false);
  assert.equal(assets.skillPolicy('ultra-status').allowImplicitInvocation, false);

  // The now-discoverable route guards its own entry, exactly as the mixed public Skills
  // below already do; nothing on disk may activate work.
  const source = read('skills/ultra-init/SKILL.md');
  assert.match(source, /coarse Host discovery bit never authorizes this route/i);
  assert.match(source, /installation[\s\S]{0,160}never that request/i);
});

test('mixed public Skills guard explicit modes after coarse Host discovery', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const change = read('skills/ultra-change/SKILL.md');
  const deliver = read('skills/ultra-deliver/SKILL.md');

  assert.match(research, /model-selected run is valid only for `change-scoped` mode/i);
  assert.match(change, /If model-selected, require `reconcile` mode for the same active Change/i);
  assert.match(deliver, /model-selected Deliver run[\s\S]*MUST stop before finalization/i);
  assert.match(deliver, /Only a current explicit owner invocation[\s\S]*may finalize/i);
});

test('the Route Contract defines one compact default progress expression derived from the card', () => {
  const contract = read('skills/ultra-status/references/route-contract.md');
  assert.match(contract, /^### Compact progress expression$/m);
  for (const line of ['Goal', 'Verified result', 'Gap', 'Next action', 'Owner decision needed']) {
    assert.match(contract, new RegExp('^\\| `' + line + '` \\|', 'm'), line);
  }
  assert.match(contract, /rendering of the Route Card, not a second schema/i);
  assert.match(contract, /never a `Verified result`/);
  assert.match(contract, /planned item is a future action, never a result/i);
  assert.match(contract, /unknown\s+stays visibly unknown/i);
  assert.match(contract, /do not invent one to fill the line/i);
  assert.doesNotMatch(contract, /\.ultra\/(?:progress-state|compact-state|route-state)/i);

  // The compact form is the default for ordinary turns, not only between
  // checkpoints: an ordinary Status answer is itself a route entry and exit.
  assert.match(contract, /default at entry, during ordinary progress, at an ordinary exit/iu);
  assert.match(contract, /including\s+an ordinary Status answer/iu);
  assert.match(contract, /transitions covered by the accepted boundary/iu);
  assert.doesNotMatch(contract, /pausing, blocked, or exiting/iu);
  assert.doesNotMatch(contract, /or exiting, and before\s+moving to another public Skill/iu);
  // Compaction never hides substance, and an authorized repair is not a new
  // approval request.
  assert.match(contract, /Compaction never hides substance/iu);
  assert.match(contract, /without manufacturing a new owner decision/iu);

  const status = read('skills/ultra-status/SKILL.md');
  assert.match(status, /default output is its compact progress\s+expression — goal, verified result, gap, next action, owner decision needed/iu);
  assert.match(status, /show the full\s+`UBP Route Card` when the contract\s+requires it/iu);
  assert.match(status, /entry and exit of a read-only route/iu);
  assert.doesNotMatch(status, /pause or block, exit, or public transition/iu);
  assert.match(status, /\| `route` \|.*route answer/iu);
  const change = read('skills/ultra-change/SKILL.md');
  assert.match(change, /compact progress expression/iu);
});

test('Grilling interactions are evidence-triggered and reuse explicit owner answers', () => {
  const grilling = read('skills/ultra-grilling/SKILL.md');
  const reframing = read('skills/ultra-grilling/references/reframing.md');

  assert.match(grilling, /already gave explicitly/iu);
  assert.match(grilling, /explicit\s+owner answer already counts as answered/iu);
  assert.match(grilling, /never restate it for confirmation/iu);
  assert.match(grilling, /Never interaction is asked|Nothing in this loop is asked unconditionally/iu);
  assert.match(grilling, /never\s+broaden a simple deliverable into\s+a\s+grander product by default/iu);
  assert.match(grilling, /rejected a proposed reframing has confirmed their frame/iu);
  assert.match(grilling, /an inference — yours or another agent's — is\s+never an owner answer/iu);

  assert.match(reframing, /^## When not to reframe$/m);
  assert.match(reframing, /Most asks do not need one/iu);
  assert.match(reframing, /never broadened into\s+a\s+grander product by default/iu);
  assert.match(reframing, /already rejected a reframing of this request/iu);
  assert.match(reframing, /^- two readings of the request would lead to materially different builds;$/m);

  // Unconditional restatement/reframe/reconfirmation language must be gone.
  assert.doesNotMatch(reframing, /Most first asks qualify/iu);
  assert.doesNotMatch(grilling, /never skipped because the original wording sounded clear/iu);
  assert.doesNotMatch(grilling, /ask them to confirm the\s+restatement/iu);
});

test('Research exposes the question frontier and defers non-blocking unknowns', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const wayfinding = read('skills/ultra-research/references/wayfinding.md');

  assert.match(research, /question frontier/iu);
  assert.match(research, /known facts already on record with their sources/iu);
  assert.match(research, /safely deferrable/iu);
  assert.match(research, /useful\s+exit/iu);
  assert.match(research, /reuse an answer\s+the owner already gave explicitly/iu);
  assert.match(research, /as explicitly\s+deferred instead of asking it/iu);
  assert.match(research, /create no second registry/iu);
  assert.match(research, /Once the blocking decisions resolve, head for the exit/iu);
  assert.match(wayfinding, /safely deferrable unknowns/iu);
  assert.match(wayfinding, /the useful exit/iu);
});

test('answered owner facts are reused while acceptance of a newly composed candidate is a separate owner act', () => {
  const grilling = read('skills/ultra-grilling/SKILL.md');
  const research = read('skills/ultra-research/SKILL.md');
  const wayfinding = read('skills/ultra-research/references/wayfinding.md');

  // Reuse stays: an explicit owner answer, and a real acceptance of the same
  // displayed unchanged candidate, are settled input with no keyword ceremony.
  assert.match(grilling, /acceptance of a candidate the owner already\s+accepted as displayed/iu);
  assert.match(grilling, /Reuse a real acceptance of the same\s+unchanged candidate\s+wherever it is recorded/iu);
  assert.match(grilling, /no magic keyword and\s+no second approval/iu);
  assert.match(research, /An owner-stated\s+fact is reusable as-is; acceptance of a candidate this run composes is a separate open\s+decision until the owner accepts that displayed candidate/iu);
  assert.match(research, /an acceptance on record for the\s+same unchanged candidate is reused, never\s+re-approved/iu);
  assert.match(wayfinding, /an owner-stated fact, which is reusable input,\s+distinct from acceptance\s+of a candidate this run composes/iu);

  // Intake, a build instruction, workflow permission, an unavailable question
  // channel, and agent reasoning never manufacture candidate acceptance.
  assert.match(grilling, /an instruction to build, permission to\s+use a workflow, an unavailable question channel/iu);
  assert.match(grilling, /your own reasoning that the\s+candidate merely restates the owner's words are neither question nor answer/iu);
  assert.match(research, /The Project Brief, a request to\s+build, permission to run this workflow, an unavailable question channel, and your own\s+conclusion that the candidate traces to the owner's words are not acceptance of the\s+candidate you composed/iu);
  assert.match(grilling, /an unavailable channel or an\s+unanswered question is itself never an owner answer/iu);

  // Missing acceptance keeps the draft beside the last accepted revision,
  // surfaces the open decision once, and never suspends authorized work.
  assert.match(research, /keep the draft beside the last genuinely\s+accepted revision and surface the open acceptance decision once in plain language\s+instead of publishing an acceptance record/iu);
  assert.match(grilling, /hand back the draft or the last\s+genuinely accepted revision, name the open candidate decision once in plain\s+language, and let the caller continue the work its own authority already covers/iu);
  assert.match(research, /A missing North Star acceptance does not\s+suspend authorized work: implementation and\s+verification inside the current boundary proceed/iu);
  assert.match(research, /reported as the open workflow closeout it is — distinct from real product progress,\s+never a completion claim, and never a blanket stop/iu);

  // A rejected or revised candidate never inherits the earlier acceptance.
  assert.match(grilling, /A rejected or revised candidate never inherits an earlier acceptance/iu);
  assert.match(research, /A revised or rejected candidate\s+starts from its own acceptance; it never inherits the earlier candidate's/iu);

  // A model-selected technical default stays a model-owned choice: it is
  // never promoted into a fabricated owner hard constraint or a new gate.
  assert.match(research, /Technical methods and defaults you select inside the authorized scope/iu);
  assert.match(research, /never promote one into an owner-accepted hard constraint, and never turn a\s+trivial implementation choice into a new acceptance gate/iu);

  // The distinction adds semantics, not mechanical gates: no counter, state
  // registry, or required phrase decides acceptance.
  const surface = `${grilling}\n${research}`;
  assert.doesNotMatch(surface, /question count|confirmation count|acceptance counter/iu);
  assert.doesNotMatch(surface, /\.ultra\/(?:acceptance-state|acceptance-registry|candidate-registry)/i);
  assert.doesNotMatch(surface, /must (?:reply|answer|type|say) (?:the (?:exact )?)?(?:word|phrase|keyword)/i);
  assert.doesNotMatch(surface, /stop all work/iu);
});

test('the publish-only-after-owner-acceptance North Star contract is not weakened by the clarification', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const synthesis = read('skills/ultra-research/references/99-synthesis.md');
  const contract = read('skills/ultra-research/references/north-star-v2.md');

  assert.match(research, /Only after\s+the owner accepts the candidate, atomically replace `\.ultra\/north-star\.md`/);
  assert.match(synthesis, /Only after the owner accepts this checkpoint and exact semantic delta/iu);
  assert.match(contract, /Only explicit owner acceptance permits\s+an atomic replacement/iu);
  assert.match(contract, /future revisions do not\s+inherit acceptance/iu);
});

test('a current explicit owner request carries its own execution authority distinct from grant continuation', () => {
  const change = read('skills/ultra-change/SKILL.md');
  const grant = read('skills/ultra-change/references/execution-grant.md');
  const routeContract = read('skills/ultra-status/references/route-contract.md');

  // The owner's current message is itself the current owner invocation for the
  // work it names; neither grant re-activation nor an earlier work package's
  // unfinished closeout is a precondition for executing it.
  assert.match(change, /current explicit owner request already is that invocation for the work it names/iu);
  assert.match(change, /executing it never waits for grant re-activation or for an earlier work package's\s+unfinished closeout/iu);
  assert.match(grant, /A grant is not the authority source for a current explicit owner request/iu);
  assert.match(grant, /governs\s+model-initiated continuation of previously granted work/iu);
  assert.match(grant, /with no grant re-activation, even when an\s+earlier grant expired or an earlier work package's closeout is incomplete/iu);

  // A request arriving while one Change is active keeps the routing options but
  // borrows nothing from the old Change's closeout: implementation and the
  // product questions the request leaves open are not queued behind old
  // workflow approval.
  assert.match(change, /routed by that table, but its\s+execution authority comes from the request itself/iu);
  assert.match(change, /genuine routing choice only when the two scopes cannot share\s+one boundary/iu);
  assert.match(change, /never this\s+request's intake, reconcile, implementation, or the product questions it\s+genuinely leaves open/iu);
  assert.match(change, /do not queue them or the\s+implementation behind re-activation or acceptance of the older work/iu);

  // Route Contract: a request that itself names the delta satisfies its own
  // material checkpoint, and older obligations gate only their own steps.
  assert.match(routeContract, /current explicit owner request that itself names the change or effect is the Owner's\s+current decision for that delta/iu);
  assert.match(routeContract, /do not re-ask confirmation of\s+what was just requested/iu);
  assert.match(routeContract, /The checkpoint still applies to any delta the request does not\s+name/iu);
  assert.match(routeContract, /A current explicit owner request is Owner entry for the work it names even when an\s+active Change, an expired grant, or an unfinished closeout exists/iu);
  assert.match(routeContract, /never preconditions for executing the current request/iu);

  // Real acceptance, formal-review admission, finalization, archive, and
  // effect boundaries stay gated exactly as their own contracts require.
  assert.match(change, /gate only their own review, finalization, archive, and\s+effect steps under their own contracts/iu);
  assert.match(grant, /accepted-North Star admission of formal\s+reviews, finalization, archive, and external\s+effects[\s\S]{0,120}stay gated exactly as\s+their own contracts require/iu);

  // The distinction is semantic only: no request registry, counter, or
  // mechanical current-request gate was added.
  const surface = `${change}\n${grant}\n${routeContract}`;
  assert.doesNotMatch(surface, /current-request (?:registry|counter|gate)/iu);
  assert.doesNotMatch(surface, /\.ultra\/(?:current-request|request-state|request-registry)/i);
  assert.doesNotMatch(surface, /stop all work/iu);
});

test('specification boundaries, exclusions, and guardrails keep their true source', () => {
  const scope = read('skills/ultra-research/references/21-features-scope.md');
  const metrics = read('skills/ultra-research/references/22-success-metrics.md');
  const synthesis = read('skills/ultra-research/references/99-synthesis.md');

  // The spec write path attributes every boundary, exclusion, constraint, and
  // measurement to its true source; a model-selected technical default is
  // never recorded as an owner constraint.
  assert.match(scope, /Attribute every recorded boundary, exclusion, and constraint to its true source/iu);
  assert.match(scope, /owner-stated \(with the owner's actual words cited\), code-observed, or selected for\s+this run/iu);
  assert.match(scope, /never as an owner constraint/iu);
  assert.match(scope, /an owner decision, a current scope choice, or a\s+deferral/iu);
  assert.match(scope, /Never upgrade a current scope choice into a permanent contradiction of the\s+product frame/iu);
  assert.match(metrics, /Attribute every outcome, guardrail, and anti-metric to its true source/iu);
  assert.match(metrics, /owner-set only for a constraint or measure the owner actually stated/iu);
  assert.match(metrics, /model-owned for defaults\s+you selected inside the authorized scope/iu);
  assert.match(metrics, /A technical\s+default promoted into an owner-set constraint is a false record/iu);

  // The synthesis read-back checks the attribution without turning it into a
  // new approval or closeout blocker.
  assert.match(synthesis, /Every recorded boundary, exclusion, guardrail, and measurement keeps its true source/iu);
  assert.match(synthesis, /model-selected technical defaults or per-run implementation restrictions stay\s+model-owned/iu);
  assert.match(synthesis, /never recorded as owner constraints, and never re-submitted as a new\s+technical-choice approval/iu);
  assert.match(synthesis, /a misattributed constraint is a\s+correction to make, not a closeout blocker to escalate/iu);

  // Attribution is a semantic obligation, not new machinery: no source
  // registry, attribution ledger, or mechanical owner-set parser.
  const surface = `${scope}\n${metrics}\n${synthesis}`;
  assert.doesNotMatch(surface, /\.ultra\/(?:fact-sources|attribution-registry|source-ledger)/i);
  assert.doesNotMatch(surface, /attribution (?:counter|score|regex)/iu);
  assert.doesNotMatch(surface, /owner-set checklist/iu);
});

test('an open closeout obligation keeps current owner-authorized work executable through Plan and Dev', () => {
  const contract = read('skills/ultra-status/references/route-contract.md');
  const change = read('skills/ultra-change/SKILL.md');
  const plan = read('skills/ultra-plan/SKILL.md');
  const dev = read('skills/ultra-dev/SKILL.md');
  const research = read('skills/ultra-research/SKILL.md');

  // One shared definition: the missing baseline, unresolvable trace, expired
  // grant, and unfinished formal review gate their own steps and travel in
  // `Not done`, instead of stopping the work the current request covers.
  assert.match(contract, /^### Open closeout obligations$/m);
  assert.match(contract, /An absent or unaccepted North Star, a trace\s+with no accepted revision to resolve against, an expired grant, and an unfinished formal\s+review are open closeout obligations/iu);
  assert.match(contract, /Each gates exactly the step that produces it/iu);
  assert.match(contract, /stays visible in `Not done` and `Gap` while the decomposition,\s+implementation, and verification the current request covers proceed/iu);

  // An already explicit owner decision is covered work; a strategic choice this
  // run composed stays an open decision. Neither is faked to get past a gate.
  assert.match(contract, /Implementing a\s+decision the owner already stated explicitly is that covered work/iu);
  assert.match(contract, /a strategic choice\s+this run composed is an open decision and is surfaced as one, never as settled input/iu);
  assert.match(contract, /fabricating an acceptance, marking a\s+draft accepted, or recording a provisional workflow state to get past it is not/iu);

  // A genuine conflict is still a material checkpoint, and durable
  // authorization is never inferred from files.
  assert.match(contract, /Work that would breach a constraint the owner has\s+actually accepted, or reduce a promise the specifications already made, is the material\s+checkpoint above/iu);
  assert.match(contract, /durable\s+authorization is never inferred from files/iu);
  assert.match(contract, /inactive data until the owner's current message or the\s+grant contract's own verification makes it live/iu);

  // The call chain is complete: Change hands to Plan, Plan decomposes and hands
  // to Dev, Dev edits — each under the request's own authority, with no grant.
  assert.match(change, /Invoke neither without covering authority — the\s+owner's current request for this work, or a valid grant/iu);
  assert.match(plan, /A current explicit owner request naming this work is Owner entry under the Route Contract and needs no grant\./u);
  assert.match(dev, /A current explicit owner request naming this work is Owner entry under the Route Contract and needs no grant\./u);
  assert.match(plan, /When the owner's\s+current request is itself the authority for this work, decompose under that request/iu);
  assert.match(plan, /as the Route\s+Contract's open closeout obligations/iu);
  assert.match(plan, /Never mark the intent or the North Star accepted to get past this\./u);
  assert.match(plan, /With no\s+accepted revision to resolve against, the unresolved ids stay an open closeout\s+obligation rather than a decomposition stop/iu);
  assert.match(plan, /Under covering authority for that exact task — the owner's\s+current request for this work, or a valid grant/iu);
  assert.match(dev, /Otherwise carry the unresolved trace as the Route Contract's open\s+closeout obligation/iu);
  assert.match(dev, /implement the work the current authority covers/iu);
  assert.match(dev, /Continue only when its exact mode and effects remain inside the covering\s+authority/iu);

  // Dev still stops for the real conflict, and never invents the acceptance.
  assert.match(dev, /When this task's\s+edits would breach a constraint that accepted authority actually carries, stop before\s+editing and recommend explicit owner invocation of `ultra-change` to reconcile/iu);
  assert.match(dev, /Never inherit approval, publish an acceptance the owner did not give, or silently\s+rewrite the trace/iu);
  assert.match(research, /A missing North Star acceptance does not\s+suspend authorized work/iu);

  // Independent closeout review and the effect gates are untouched.
  assert.match(plan, /Follow `\.\.\/ultra-review\/SKILL\.md` in plan mode\. Require a validated current\s+`SUMMARY\.json`/u);
  assert.match(dev, /A task-level review runs while the ledger task remains `in_progress`/u);

  // Plan-mode Review is admissible only with an accepted North Star, so the
  // plan consumer must carry both paths. Pin the real dependency in the
  // admission source rather than inferring it from the prompt wording: `plan`
  // is an accepted review mode, admission demands the accepted canonical
  // report, and its branch never consults the mode.
  const waiter = read('skills/ultra-review/scripts/review_wait.py');
  assert.match(waiter, /^REVIEW_MODES = \{"task", "change", "plan"\}$/m);
  const admission = waiter.slice(waiter.indexOf('\ndef validate_packet_admission('));
  const admissionBody = admission.slice(0, admission.indexOf('\ndef ', 1));
  assert.ok(admissionBody.length > 0);
  assert.match(admissionBody, /canonical North Star validator report must describe an accepted v2 authority/u);
  assert.doesNotMatch(admissionBody, /\bmode\b/u);

  // Path A — admitted: the validated summary still governs.
  // Path B — refused: the typed error travels as the open obligation, no
  // `SUMMARY.json` is fabricated, and handoff is not what it gates.
  assert.match(plan, /Plan-mode review admission binds the canonical accepted North Star report, so a\s+Change still carrying that acceptance as an open closeout obligation cannot be admitted\s+at all/iu);
  assert.match(plan, /Keep the exact typed admission error in `## Unresolved Decisions` and the card's\s+`Not done`/u);
  assert.match(plan, /never write, claim, or infer a `SUMMARY\.json` that admission did not produce/u);
  assert.match(plan, /Unavailable admission gates the canonical closeout that needs it, not this handoff/iu);
  assert.match(plan, /real\s+plan-mode Review still has to run on this Change once the North Star is accepted/iu);
  assert.match(plan, /the obligation stays open instead of blocking implementation the current\s+authority already covers/iu);

  // Substantive planning scrutiny is retained without a parallel protocol.
  assert.match(plan, /Apply the same plan-mode scrutiny yourself against the plan files and report what it\s+finds in the plan's own sections — not a second review artifact, schema, or verdict/iu);
  assert.doesNotMatch(plan, /ultra-review-(?:plan|lite|fallback)-|PLAN-SUMMARY\.json|provisional (?:review|summary)/iu);

  // No provisional workflow state, bypass keyword, or new authority store.
  const surface = `${contract}\n${change}\n${plan}\n${dev}`;
  assert.doesNotMatch(surface, /\.ultra\/(?:provisional|obligation-ledger|closeout-state|route-state)/i);
  assert.doesNotMatch(surface, /provisional (?:acceptance|north star|revision|status)/iu);
  assert.doesNotMatch(surface, /(?:assume|infer|treat as) (?:the )?(?:north star|intent) accepted/iu);
});

test('the North Star record binds the answered candidate and splits compound constraint sources', () => {
  const contract = read('skills/ultra-research/references/north-star-v2.md');
  const synthesis = read('skills/ultra-research/references/99-synthesis.md');

  // Per-clause attribution at the field the writer actually fills: an owner
  // quote carries only its own words; every other clause is its own
  // model-owned entry, exactly as a correctly split entry already does.
  assert.match(contract, /Attribution is per clause, not per entry\./u);
  assert.match(contract, /`Authority or evidence: owner-stated` keeps\s+only what the cited owner words actually say/iu);
  assert.match(contract, /storage layout,\s+matching rule, local-first or offline execution/iu);
  assert.match(contract, /is a separate `model-owned` entry, even when it sits beside an owner-stated one in the\s+same sentence/iu);
  assert.match(contract, /Split a compound constraint whose clauses have different sources rather\s+than binding all of them to one owner quote/iu);
  assert.match(contract, /changes who may revise it later, and turns an ordinary in-scope change into a\s+manufactured owner gate/iu);

  // The adoption read-back consumes the same clause-level check.
  assert.match(synthesis, /Read this attribution back clause by clause together with\s+the specifications before reporting convergence/iu);
  assert.match(synthesis, /an entry citing one owner quote keeps\s+only what that quote actually says, and each remaining clause moves to its own entry\s+under its own source/iu);

  // The displayed candidate is the bytes the presentation resolves to; a link
  // is display, and the existing `Revision boundary` field carries which
  // candidate the acceptance covers.
  assert.match(contract, /the displayed\s+candidate is whatever bytes that presentation actually resolves to, inline or by\s+path — a linked candidate is displayed, an unwritten one is not/iu);
  assert.match(contract, /`Revision boundary` carries which candidate this acceptance covers: the path and byte\s+identity of the candidate actually displayed when the owner answered/iu);
  // Publication preserves the answered decision content, not literal bytes:
  // acceptance metadata necessarily changes and is not a new candidate.
  assert.match(contract, /Publish that candidate's decision content as answered;\s+becoming the canonical accepted file changes draft, status, and acceptance-source\s+metadata, and those changes are not a new candidate/iu);

  // Implementing an already explicit owner decision is a cited correction; only
  // a materially new choice becomes a candidate needing its own acceptance.
  assert.match(contract, /A post-answer edit that only carries\s+out a decision the owner already stated explicitly — including repairing the candidate's\s+own contradiction with it — is a correction/iu);
  assert.match(contract, /cite that exact decision as its authority and\s+describe what it changed, rather than recording the displayed text as unmodified or\s+manufacturing a second approval for a technical choice the model already owns/iu);
  assert.match(contract, /An edit\s+deciding anything materially new is a fresh candidate under step 3, so show its delta and\s+take its own acceptance/iu);

  // No second approval of an unchanged candidate, no owner decision just to fix
  // attribution, no new validator field, no inline-reproduction requirement:
  // the five decision fields are unchanged.
  assert.match(contract, /Nothing here asks for a second approval of an unchanged\s+candidate, another owner decision merely to correct attribution, a validator field, or an\s+inline reproduction of the candidate/iu);
  assert.match(contract, /`Conversation scope`, `Exact raw owner acceptance`, `Agency boundary`, `Time boundary`,\s+and `Revision boundary`\. The validator observes only their anchored presence, uniqueness,\s+and nonempty bytes\./u);
  const fields = [...contract.matchAll(/That section carries each of these list fields exactly once/gu)];
  assert.equal(fields.length, 1);
  assert.doesNotMatch(contract, /`Displayed candidate digest`|`Candidate identity`|second acceptance|re-approval ceremony/iu);
  assert.doesNotMatch(contract, /\.ultra\/(?:candidate-registry|acceptance-registry|displayed-candidates)/i);
});

test('a Plan handoff carries its own exact task id into Dev and activates that pending row', () => {
  const plan = read('skills/ultra-plan/SKILL.md');
  const dev = read('skills/ultra-dev/SKILL.md');
  const status = read('skills/ultra-status/SKILL.md');

  // Plan owns the frontier choice, so the handoff carries the exact id it just
  // generated instead of sending the owner back to restate a technical id.
  assert.match(plan, /Carry the one exact\s+task id you selected into that Dev run/u);
  assert.match(plan, /it is this decomposition's own frontier choice,\s+travels as invocation-local selection for that run, and is reported as model-selected/u);
  assert.match(plan, /never written back as a selector and never restated as an id the owner supplied/u);
  assert.match(plan, /Do not\s+send the owner back to name a technical id this decomposition has only just generated/u);

  // Dev's entry, table, and activation text agree on what a carried id is.
  assert.match(dev, /^\| `execute` \| One exact task id carried by this invocation, or a valid Execution Grant covering one dependency-ready pending task \|/mu);
  assert.match(dev, /One exact task id carried into this run supplies\s+invocation-local selection authority for this Dev run only: the owner named it, or\s+the Plan handoff that covering authority already permits selected it as the frontier\s+task/u);
  assert.match(dev, /A model-selected id is reported as the model's selection and never attributed\s+to the owner, and it never resolves an ambiguous ledger/u);
  assert.match(dev, /if none exists, stop and either ask the owner to invoke\s+Dev naming one exact task id or return to `ultra-plan` to select the frontier under\s+covering authority/u);

  // Nothing new activates the row: the existing canonical ledger write does,
  // and the real Hook keeps refusing to activate a `pending` frontier row.
  assert.match(dev, /^When the exact task id this run carries names a dependency-ready `pending` task,$/mu);
  assert.match(dev, /write that row from\s+`pending` to `in_progress` in `\.ultra\/tasks\.json` and read the row back before\s+the first implementation edit/u);
  assert.match(dev, /The activation adds no selector, activation flag,\s+or workflow state — the ledger row is the only authority/u);
  const common = read('hooks/_common.py');
  assert.match(common, /A `pending` row is a frontier candidate only: this selection\s+never auto-activates it without the explicit invocation-local id\./u);
  assert.match(common, /`trusted_task_id` is invocation-local\./u);

  // Ordinary ambiguous-ledger recovery, the single-writer boundary, the
  // read-only router, and the independent task review are untouched.
  assert.match(dev, /An explicit owner invocation with one exact task id supplies invocation-local selection\s+authority for this Dev run even when multiple ledger rows claim `in_progress`/u);
  assert.match(dev, /it must respect\s+the single-writer boundary: resolve any conflicting `in_progress` rows through\s+the recovery below or an owner decision before writing/u);
  assert.match(status, /a pending row is not active work and never auto-selects a route/u);
  assert.match(dev, /A task-level review runs while the ledger task remains `in_progress`/u);

  // No persisted current-task selector is introduced anywhere on this path.
  assert.doesNotMatch(`${plan}\n${dev}`, /\.ultra\/(?:current-task|task-selector|active-task|selection-state)/i);
});

test('a satisfied implementation dependency with open formal closeout binds the Plan-carried invocation', () => {
  const plan = read('skills/ultra-plan/SKILL.md');
  const dev = read('skills/ultra-dev/SKILL.md');

  // Plan selects the frontier on reconciled implementation evidence: a dependency
  // still `in_progress` with current implementation and only formal closeout open is
  // satisfied for selection — its row, owed review, and open closeout are preserved
  // and surface in `Not done`; an unimplemented or invalidated dependency is not.
  assert.match(plan, /Select that\s+frontier on reconciled implementation evidence/u);
  assert.match(plan, /still `in_progress` and its\s+implementation verifies current from its canonical context, evidence, and Git\/worktree\s+state with only formal closeout open/u);
  assert.match(plan, /its row, its owed task review, and its open\s+closeout stay exactly as they are and travel in the transition card's `Not done`/u);
  assert.match(plan, /A\s+dependency without current implementation evidence, or one invalidated after\s+completion, is not satisfied: do not select its dependent; report the gap instead\./u);
  assert.match(plan, /Never write `completed` for such a row, never claim its review ran, and never declare\s+the ledger unique to justify the selection\./u);

  // Dev entry: several `in_progress` rows are not several writers by themselves; the
  // same-authority open-closeout row is preserved, only the unproven row is ambiguous.
  assert.match(dev, /More than one `in_progress`\s+row does not by itself prove more than one live writer/u);
  assert.match(dev, /implementation evidence current, only formal\s+closeout still open — is preserved exactly as it is: never demoted, never written\s+`completed` early, its owed task review unchanged/u);
  assert.match(dev, /Only a row this reconciliation\s+cannot prove — an unknown or overlapping writer, unrelated partial work, or evidence\s+that does not hold — makes the ledger ambiguous for this run/u);
  assert.match(dev, /If any row stays unproven after that reconciliation, do not manufacture a unique\s+current task; use the explicit recovery below or stop with the Hook diagnostic\./u);

  // Dev activation: readiness is reconciled implementation evidence, the preserved
  // dependency stays open, the automatic frontier stays narrower, and the Hook
  // ambiguity observation stays advisory while preserved rows remain.
  assert.match(dev, /Dependency-ready means reconciled implementation\s+evidence, not only a status word/u);
  assert.match(dev, /a satisfied\s+implementation dependency whose row stays `in_progress`, whose owed task review is\s+unchanged, and whose open closeout travels in the card's `Not done`/u);
  assert.match(dev, /The automatic\s+frontier stays narrower — it still requires all-`completed` dependencies\./u);
  assert.match(dev, /Hooks correctly keep their ambiguity observation advisory and stay task-silent\s+toward this run; the run's authority is the invocation-local id it carries, not Hook\s+injection\./u);
  assert.match(dev, /A row the entry\s+reconciliation preserved is not a conflicting row; one it could not prove is\./u);

  // The guards that keep this safe are untouched: the owner-only ambiguous-ledger
  // recovery, the model-selected attribution rule, the canonical activation write,
  // and the owed task review before any `completed` write.
  assert.match(dev, /An explicit owner invocation with one exact task id supplies invocation-local selection\s+authority for this Dev run even when multiple ledger rows claim `in_progress`/u);
  assert.match(dev, /A model-selected id is reported as the model's selection and never attributed\s+to the owner, and it never resolves an ambiguous ledger/u);
  assert.match(dev, /write that row from\s+`pending` to `in_progress` in `\.ultra\/tasks\.json` and read the row back before\s+the first implementation edit/u);
  assert.match(dev, /A task-level review runs while the ledger task remains `in_progress`/u);

  // The Hook stays conservative: trusted-path readiness still requires
  // all-`completed` dependencies, the ambiguity diagnostic still fires, and a
  // `pending` row is still never auto-activated.
  const common = read('hooks/_common.py');
  assert.match(common, /by_id\[dependency\]\.get\("status"\) == "completed"/u);
  assert.match(common, /"code": "task_in_progress_ambiguous"/u);
  assert.match(common, /Hooks stay task-silent/u);
  assert.match(common, /never auto-activates it without the explicit invocation-local id\./u);

  // No new selector, pseudo-status, registry, or workflow state appears on this path.
  assert.doesNotMatch(`${plan}\n${dev}`, /\.ultra\/(?:current-task|task-selector|active-task|selection-state)/i);
  assert.doesNotMatch(`${plan}\n${dev}`, /`(?:closeout-open|implementation-complete|partially-completed|quasi-completed)`/i);
});

test('a model-owned technical choice defaults to the non-destructive form of itself', () => {
  const contract = read('skills/ultra-status/references/route-contract.md');

  // Choosing the shape of a capability is model-owned; choosing that it
  // replaces data someone already has is not the same authority.
  assert.match(contract, /Deciding how something works stays model-owned; deciding that it destroys what someone\s+already has does not\./u);
  assert.match(contract, /this run's own write, or the behavior the delivered code will\s+perform for its users/u);

  // The default permits progress without a question and without destruction.
  assert.match(contract, /take the non-destructive form of the same choice and keep going:\s+create exclusively, write a separate target, or refuse the collision and report it/u);
  assert.match(contract, /That\s+default needs no question, and an effect the owner already authorized for exactly this\s+data stays authorized/u);
  assert.match(contract, /Only when no non-destructive form can deliver the named outcome\s+is the destruction a material trade-off, surfaced as one question with a recommendation\./u);

  // The existing model-owned frontier is narrowed, not converted into a
  // universal ask, and no new gate, registry, or process state appears.
  assert.match(contract, /Do not ask for confirmation when `Decision needed` is `none`\./u);
  assert.doesNotMatch(contract, /destructive-effect (?:gate|registry|validator|checklist)/iu);
  assert.doesNotMatch(contract, /\.ultra\/(?:destructive|effects|write-policy)/i);

  // One canonical home: the rule is not duplicated as a second warning
  // paragraph across the Grilling, Research, Change, Plan, Dev, or autonomy
  // consumers that already read this contract.
  const consumers = [
    'skills/ultra-grilling/SKILL.md',
    'skills/ultra-research/SKILL.md',
    'skills/ultra-change/SKILL.md',
    'skills/ultra-plan/SKILL.md',
    'skills/ultra-dev/SKILL.md',
    'skills/ultra-think/references/autonomy-boundary.md',
  ].map(read).join('\n');
  assert.doesNotMatch(consumers, /non-destructive form of the same choice/iu);
});
