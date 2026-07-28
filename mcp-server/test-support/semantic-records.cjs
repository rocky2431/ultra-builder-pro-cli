'use strict';

const RECORDS = Object.freeze({
  '00-problem-validation': ['problem', {
    actor: 'fixture-user', current_workaround: 'manual reconciliation',
    consequence: 'delivery state drifts', evidence_status: 'verified',
  }],
  '01-opportunity-discovery': ['opportunity', {
    actor: 'fixture-user', desired_outcome: 'one recoverable workflow authority',
    evidence_status: 'verified',
  }],
  '02-market-assessment': ['market_constraint', {
    constraint: 'host runtimes expose different extension contracts',
    decision_impact: 'keep host adapters thin', freshness: 'verified-at-run',
  }],
  '03-competitive-landscape': ['alternative', {
    category: 'status-quo', switching_constraint: 'existing project state must survive',
    strategy_implication: 'migrate instead of replace',
  }],
  '04-product-strategy': ['strategy_decision', {
    tradeoff: 'strong authority with bounded host prompts',
    rationale: 'durable recovery requires deterministic state',
  }],
  '05-assumptions-validation': ['assumption', {
    category: 'feasibility', consequence: 'workflow cannot converge',
    validation_signal: 'state can be read back after restart',
    success_rule: 'read-back matches accepted evidence',
    failure_rule: 'missing or stale authority blocks progress',
    ambiguous_rule: 'record an owned unknown and stop convergence',
  }],
  '10-user-personas': ['actor', {
    job: 'ship a verified change', current_workflow: 'manual project maintenance',
    goal: 'resume safely from durable state', constraint: 'no hidden memory dependency',
  }],
  '11-user-scenarios': ['scenario', {
    actor_id: 'semantic-10-user-personas', trigger: 'a requested project change',
    preconditions: ['ready baseline'], flow: ['open change', 'plan', 'verify'],
    success: 'change is archived with reconciled baseline',
    failure: 'a gate reports a stable blocker', recovery: 'resume from the failed gate',
  }],
  '20-user-stories': ['requirement', {
    preconditions: ['ready baseline'], action: 'record an accepted change',
    observable_result: 'the change contract is durable',
    error_recovery: 'invalid contracts are rejected without partial state',
    verification: 'read change state and inspect its artifact',
  }],
  '21-features-scope': ['capability', {
    requirement_ids: ['semantic-20-user-stories'], scope_status: 'included',
    rationale: 'required for the accepted workflow',
  }],
  '22-success-metrics': ['metric', {
    definition: 'accepted changes with complete provenance', source: '.ultra/.runtime/state.db',
    window: 'per change', owner: 'fixture-owner',
    decision_use: 'block delivery when provenance is incomplete',
  }],
  '30-architecture-context': ['architecture_context', {
    boundary: 'host skill to MCP authority', inputs_outputs: 'typed records and digests',
    trust_authority: '.ultra/.runtime/state.db', consumers: ['workflow gates'],
  }],
  '31-solution-strategy': ['architecture_decision', {
    drivers: ['recoverability', 'host portability'], direction: 'model-free MCP transactions',
    consequences: ['host owns judgment', 'MCP owns validation'],
    compatibility: 'additive schema migration', recovery: 'backup before migration',
  }],
  '32-building-blocks': ['runtime_path', {
    entry_point: 'workflow.step', state_side_effects: ['workflow_steps.semantic_records_json'],
    observable_result: 'typed evidence is readable from workflow state',
    failure_recovery: 'transaction rollback and retry', consumers: ['plan gate', 'doctor'],
  }],
  '40-deployment': ['deployment', {
    environment: 'local host plugin', entry_point: 'ubp install',
    config_migration: 'backup-first state schema upgrade', observation: 'ubp --doctor',
    rollback_recovery: 'restore prior package and state backup',
  }],
  '41-quality-risks': ['risk', {
    trigger_condition: 'artifact and DB authority disagree',
    expected_response: 'block convergence', measurement: 'doctor blocker code',
    mitigation: 'digest and semantic validation', recovery: 'recompile or reconcile',
    owner: 'fixture-owner',
  }],
  '99-synthesis': ['synthesis_trace', {
    problem_id: 'semantic-00-problem-validation',
    scenario_id: 'semantic-11-user-scenarios',
    requirement_ids: ['semantic-20-user-stories'],
    architecture_path_ids: ['semantic-32-building-blocks'],
    verification_refs: ['fixture:verification'],
  }],
});

function semanticRecordsForStep(runId, stepId) {
  const definition = RECORDS[stepId];
  if (!definition) throw new Error(`missing semantic fixture for ${stepId}`);
  const [kind, attributes] = definition;
  return [{
    id: `semantic-${stepId}`,
    kind,
    status: 'accepted',
    summary: `Accepted semantic result for ${stepId}.`,
    source_ref: `.ultra/docs/research/${runId}/${stepId}.md#evidence`,
    evidence_refs: [`fixture:${stepId}`],
    attributes,
    links: [],
  }];
}

function researchCoverage(overrides = {}) {
  return Object.keys(RECORDS).map((stepId) => ({
    step_id: stepId,
    disposition: 'execute',
    rationale: 'Fresh semantic evidence is required for this fixture.',
    evidence_refs: [],
    ...(overrides[stepId] || {}),
  }));
}

module.exports = { researchCoverage, semanticRecordsForStep };
