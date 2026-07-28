'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SURFACES, interactionContract,
} = require('../interaction-contract.cjs');

test('every supported host receives the same authority split with a native question surface', () => {
  const expectedSurfaces = {
    claude: 'AskUserQuestion',
    codex: 'request_user_input',
    opencode: 'question',
    kimi: 'AskUserQuestion',
  };
  const expectedAvailability = {
    claude: 'interactive_session',
    codex: 'current_mode_exposes_tool',
    opencode: 'question_permission_not_denied',
    kimi: 'interactive_non_auto_mode',
  };
  for (const runtime of ['claude', 'codex', 'opencode', 'kimi']) {
    const contract = interactionContract(runtime);
    assert.equal(contract.runtime, runtime);
    assert.equal(contract.interaction.question_surface.primary, expectedSurfaces[runtime]);
    assert.equal(contract.interaction.question_surface.primary, SURFACES[runtime].primary);
    assert.equal(contract.interaction.question_surface.fallback, 'direct_user_interaction');
    assert.equal(contract.interaction.question_surface.availability, expectedAvailability[runtime]);
    assert.deepEqual(contract.interaction.semantic_selection_flow, [
      'inspect', 'suggest', 'ask_if_unresolved', 'normalize', 'persist',
    ]);
    assert.equal(contract.interaction.dismissed_question, 'remain_unanswered');
    assert.equal(
      contract.interaction.unavailable_native_surface,
      'use_direct_interaction_if_permitted',
    );
    assert.equal(contract.interaction.host_forbids_interaction, 'remain_unanswered');
    assert.equal(contract.persistence.accepted_intent, 'trust_as_current_authority');
    assert.equal(contract.persistence.user_interaction_proof, 'not_required');
    assert.equal(contract.persistence.raw_prompt_or_transcript, 'never_store');
    assert.ok(contract.authority.user.includes('semantic_route_selection'));
    assert.ok(contract.authority.host_model.includes('semantic_route_recommendation'));
    assert.ok(!contract.authority.host_model.includes('semantic_route_selection'));
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
