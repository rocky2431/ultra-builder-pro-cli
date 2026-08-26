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
      allowImplicitInvocation: invocationClasses.includes('grant-continuable'),
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

test('mixed public Skills guard explicit modes after coarse Host discovery', () => {
  const research = read('skills/ultra-research/SKILL.md');
  const change = read('skills/ultra-change/SKILL.md');
  const deliver = read('skills/ultra-deliver/SKILL.md');

  assert.match(research, /model-selected run is valid only for `change-scoped` mode/i);
  assert.match(change, /If model-selected, require `reconcile` mode for the same active Change/i);
  assert.match(deliver, /model-selected Deliver run[\s\S]*MUST stop before finalization/i);
  assert.match(deliver, /Only a current explicit owner invocation[\s\S]*may finalize/i);
});
