'use strict';

function completeChangeInput(input = {}) {
  const id = input.id || 'fixture-change';
  const kind = input.kind || 'standard';
  return {
    ...input,
    contract: input.contract || {
      outcome: `The observable outcome for ${id} is delivered.`,
      acceptance: [{
        id: `${id}-acceptance`,
        criterion: `The public behavior for ${id} is verifiably correct.`,
        verification: `node --test ${id}.test.cjs`,
      }],
      non_goals: ['Unrelated repository behavior.'],
      public_seams: [`public seam for ${id}`],
      recovery: {
        strategy: `Revert the bounded ${id} change.`,
        verification: `Re-run the pre-change verification for ${id}.`,
      },
      unresolved_decisions: [],
    },
    classification: input.classification || {
      rationale: `${kind} is the smallest profile matching the accepted risk boundary.`,
      risk_flags: [],
    },
    research_disposition: input.research_disposition || {
      status: 'none', mode: null, selected_steps: [],
      rationale: 'The accepted contract is sufficiently evidenced for planning.',
    },
  };
}

module.exports = { completeChangeInput };
