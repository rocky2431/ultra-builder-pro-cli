'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SURFACES, adaptInteractionGuidance, interactionContract,
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
    assert.equal(contract.schema_version, '1.2');
    assert.equal(contract.runtime, runtime);
    assert.equal(contract.interaction.question_surface.primary, expectedSurfaces[runtime]);
    assert.equal(contract.interaction.question_surface.primary, SURFACES[runtime].primary);
    assert.equal(contract.interaction.question_surface.fallback, 'direct_user_interaction');
    assert.equal(contract.interaction.question_surface.availability, expectedAvailability[runtime]);
    assert.deepEqual(contract.interaction.semantic_selection_flow, [
      'inspect', 'suggest', 'host_native_ask', 'normalize', 'persist', 'apply', 'read_back',
    ]);
    assert.equal(contract.interaction.adapter_authority, 'none');
    assert.equal(contract.interaction.dismissed_question, 'remain_unanswered');
    assert.equal(
      contract.interaction.unavailable_native_surface,
      'use_direct_interaction_if_permitted',
    );
    assert.equal(contract.interaction.host_forbids_interaction, 'remain_unanswered');
    assert.equal(contract.persistence.accepted_intent, 'trust_as_current_authority');
    assert.equal(contract.persistence.accepted_intent_recall, 'breadcrumb_and_decision_list');
    assert.equal(contract.persistence.user_interaction_proof, 'not_required');
    assert.equal(contract.persistence.raw_prompt_or_transcript, 'never_store');
    assert.equal(
      contract.persistence.application_evidence,
      'record_applied_refs_when_another_authority_changes',
    );
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

test('installed prompt guidance is rendered from the same native question-surface contract', () => {
  const source = 'Use the host-native structured question surface declared by the installed interaction contract.';
  const expected = {
    claude: 'AskUserQuestion',
    codex: 'request_user_input',
    opencode: '`question`',
    kimi: 'AskUserQuestion',
  };
  for (const [runtime, surface] of Object.entries(expected)) {
    const rendered = adaptInteractionGuidance(source, runtime);
    assert.match(rendered, new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(rendered, /host-native structured question surface declared/);
  }
});
