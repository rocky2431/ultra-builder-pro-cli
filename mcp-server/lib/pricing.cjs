'use strict';

// Phase 6.2 — Runtime × model pricing table (USD per token).
//
// Last updated: 2026-04-17. Public rate cards change — re-check before
// trusting the cost panel for billing. Numbers below are per token (not
// per million), so a 1000-token input at 3e-6 costs $0.003.
//
// Sources (2026-04):
//   Claude:  https://www.anthropic.com/pricing
//   OpenAI:  https://platform.openai.com/docs/pricing
//   Gemini:  https://ai.google.dev/pricing
//
// `default` inside each runtime is the fallback when a session did not
// record which specific model it used.

const PRICING = Object.freeze({
  claude: Object.freeze({
    'claude-opus-4-7':      { input: 15e-6, output: 75e-6 },
    'claude-sonnet-4-6':    { input: 3e-6,  output: 15e-6 },
    'claude-haiku-4-5':     { input: 0.8e-6, output: 4e-6 },
    default:                { input: 3e-6,  output: 15e-6 }, // assume sonnet
  }),
  codex: Object.freeze({
    'gpt-5.4':              { input: 2e-6,  output: 10e-6 },
    default:                { input: 2e-6,  output: 10e-6 },
  }),
  opencode: Object.freeze({
    // OpenCode is a frontend over whichever model the user configured;
    // treat as sonnet-equivalent unless a model name is passed in.
    default:                { input: 3e-6,  output: 15e-6 },
  }),
  gemini: Object.freeze({
    'gemini-2.5-pro':       { input: 1.25e-6, output: 10e-6 },
    'gemini-2.5-flash':     { input: 0.15e-6, output: 0.6e-6 },
    default:                { input: 1.25e-6, output: 10e-6 },
  }),
});

function computeCost(runtime, model, tokens_input, tokens_output) {
  const r = PRICING[runtime];
  if (!r) return null;
  const p = (model && r[model]) || r.default;
  if (!p) return null;
  const ti = Number(tokens_input) || 0;
  const to = Number(tokens_output) || 0;
  return ti * p.input + to * p.output;
}

module.exports = {
  PRICING,
  computeCost,
};
