'use strict';

const { PUBLIC_CAPABILITY_GRAPH } = require('./runtime-assets.cjs');

const SURFACES = Object.freeze({
  claude: Object.freeze({
    primary: 'AskUserQuestion',
    fallback: 'direct_user_interaction',
    availability: 'interactive_session',
  }),
  codex: Object.freeze({
    primary: 'request_user_input',
    fallback: 'direct_user_interaction',
    availability: 'current_mode_exposes_tool',
  }),
  opencode: Object.freeze({
    primary: 'question',
    fallback: 'direct_user_interaction',
    availability: 'question_permission_not_denied',
  }),
  kimi: Object.freeze({
    primary: 'AskUserQuestion',
    fallback: 'direct_user_interaction',
    availability: 'interactive_non_auto_mode',
  }),
});

const GENERIC_QUESTION_GUIDANCE =
  /Use the host-native structured question surface declared by the installed interaction\s+contract(?: when it exists)?\./g;

function interactionContract(runtime) {
  const question = SURFACES[runtime];
  if (!question) throw new Error(`unsupported interaction runtime: ${runtime}`);
  return {
    schema_version: '1.2',
    runtime,
    public_capability_graph: PUBLIC_CAPABILITY_GRAPH,
    authority: {
      user: [
        'product_intent',
        'material_scope_and_tradeoffs',
        'semantic_route_selection',
        'risk_acceptance',
        'destructive_or_external_effect_authorization',
      ],
      host_model: [
        'fact_finding_and_synthesis',
        'reversible_implementation_judgment',
        'semantic_route_recommendation',
        'accepted_intent_normalization',
      ],
      ultra_mcp: [
        'durable_state_and_evidence_refs',
        'digests_freshness_locks_and_recovery',
        'allowed_and_required_transitions',
      ],
    },
    interaction: {
      question_surface: question,
      semantic_selection_flow: [
        'inspect',
        'suggest',
        'host_native_ask',
        'normalize',
        'persist',
        'apply',
        'read_back',
      ],
      adapter_authority: 'none',
      dependent_decisions: 'one_at_a_time',
      independent_low_load_questions: { maximum: 3 },
      explicit_current_intent: 'normalize_without_reconfirmation',
      dismissed_question: 'remain_unanswered',
      unavailable_native_surface: 'use_direct_interaction_if_permitted',
      host_forbids_interaction: 'remain_unanswered',
    },
    persistence: {
      accepted_intent: 'trust_as_current_authority',
      accepted_intent_recall: 'breadcrumb_and_decision_list',
      user_interaction_proof: 'not_required',
      raw_prompt_or_transcript: 'never_store',
      pending_question: 'store_only_when_recovery_requires_it',
      application_evidence: 'record_applied_refs_when_another_authority_changes',
    },
    routing: {
      semantic_recommendation_owner: 'host_model',
      durable_recommendation_authority: false,
      hard_invariant_field: 'required_transition',
      valid_capabilities_field: 'allowed_transitions',
    },
  };
}

function interactionPrompt(runtime) {
  const contract = interactionContract(runtime);
  const surface = contract.interaction.question_surface;
  const host = {
    claude: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    kimi: 'Kimi Code',
  }[runtime];
  const primary = runtime === 'opencode' ? `\`${surface.primary}\`` : surface.primary;
  return `Use ${host} ${primary} when ${surface.availability.replaceAll('_', ' ')} permits it.`;
}

function adaptInteractionGuidance(input, runtime) {
  return String(input).replace(GENERIC_QUESTION_GUIDANCE, interactionPrompt(runtime));
}

module.exports = {
  SURFACES,
  adaptInteractionGuidance,
  interactionContract,
  interactionPrompt,
};
