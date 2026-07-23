'use strict';

const SURFACES = Object.freeze({
  claude: Object.freeze({
    primary: 'AskUserQuestion',
    fallback: 'direct_user_interaction',
  }),
  codex: Object.freeze({
    primary: 'request_user_input',
    fallback: 'direct_user_interaction',
  }),
  opencode: Object.freeze({
    primary: 'question',
    fallback: 'direct_user_interaction',
  }),
  kimi: Object.freeze({
    primary: 'native_question_surface',
    fallback: 'direct_user_interaction',
  }),
});

function interactionContract(runtime) {
  const question = SURFACES[runtime];
  if (!question) throw new Error(`unsupported interaction runtime: ${runtime}`);
  return {
    schema_version: '1.0',
    runtime,
    authority: {
      user: [
        'product_intent',
        'material_scope_and_tradeoffs',
        'destructive_or_external_effect_authorization',
      ],
      host_model: [
        'fact_finding_and_synthesis',
        'reversible_implementation_judgment',
        'coverage_risk_and_route_recommendation',
      ],
      ultra_mcp: [
        'durable_state_and_evidence_refs',
        'digests_freshness_locks_and_recovery',
        'allowed_and_required_transitions',
      ],
    },
    interaction: {
      question_surface: question,
      dependent_decisions: 'one_at_a_time',
      independent_low_load_questions: { maximum: 3 },
      explicit_current_intent: 'normalize_without_reconfirmation',
      unavailable_native_surface: 'use_direct_interaction',
    },
    routing: {
      semantic_recommendation_owner: 'host_model',
      durable_recommendation_authority: false,
      hard_invariant_field: 'required_transition',
      valid_capabilities_field: 'allowed_transitions',
    },
  };
}

module.exports = { SURFACES, interactionContract };
