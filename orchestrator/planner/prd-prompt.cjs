'use strict';

// Phase 8A.1 — Prompt templates for PRD → task-list parsing.
//
// Kept in a dedicated module so downstream evaluation (fixture regression,
// prompt A/B testing) can diff the template against commits without touching
// parser logic.

const SYSTEM_PROMPT = `You are an engineering planner. Decompose a product requirement document (PRD) into a topologically ordered task list that a coding agent can execute sequentially or in parallel.

Output STRICT JSON matching this shape — nothing else, no markdown fences, no prose:

{
  "tasks": [
    {
      "id": "task-1",
      "title": "Imperative short title (3-80 chars)",
      "type": "architecture | feature | bugfix",
      "priority": "P0 | P1 | P2 | P3",
      "complexity": 1-10,
      "deps": ["task-2"],
      "files_modified": ["src/path/to/file.ts"]
    }
  ]
}

Rules:
- Every task id matches /^task-[0-9]+$/ and is unique in the list.
- "deps" references other ids in the same list; omit or use [] when none.
- "files_modified" is your best guess of affected paths; use [] when unsure.
- "complexity" 1 = trivial, 10 = multi-day. Tasks at 7+ will be auto-expanded later.
- "priority" — P0 blocks other work, P1 critical path, P2 standard, P3 nice-to-have.
- "type" — architecture for design/scaffolding, feature for new capability, bugfix for correcting existing behaviour.
- Return JSON only. No surrounding text, no trailing explanation.`;

function buildSystemPrompt() {
  return SYSTEM_PROMPT;
}

function buildUserPrompt(prdText) {
  return `PRD:\n\n${prdText}\n\nReturn the task list as JSON following the system schema.`;
}

module.exports = { SYSTEM_PROMPT, buildSystemPrompt, buildUserPrompt };
