'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SURFACES, interactionContract,
} = require('../interaction-contract.cjs');

test('every supported host receives the same authority split with a native question surface', () => {
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi']) {
    const contract = interactionContract(runtime);
    assert.equal(contract.runtime, runtime);
    assert.equal(contract.interaction.question_surface.primary, SURFACES[runtime].primary);
    assert.equal(contract.interaction.question_surface.fallback, 'direct_user_interaction');
    assert.equal(contract.routing.semantic_recommendation_owner, 'host_model');
    assert.equal(contract.routing.durable_recommendation_authority, false);
    assert.equal(contract.routing.hard_invariant_field, 'required_transition');
  }
});

test('unknown hosts fail closed instead of inventing an interaction tool', () => {
  assert.throws(
    () => interactionContract('unknown'),
    /unsupported interaction runtime/,
  );
});
