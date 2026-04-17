'use strict';

// Phase 8A.3 — Prompt templates for task → subtasks expansion.
//
// Parent context (title, type, priority, complexity, files_modified) is
// serialized into the user prompt so the LLM can produce children aligned
// with the parent's shape. sub_count defaults to 3 when omitted.

const DEFAULT_SUB_COUNT = 3;

function buildExpandSystemPrompt({ sub_count = DEFAULT_SUB_COUNT } = {}) {
  return `You are an engineering task decomposer. Break a single complex task into ${sub_count} smaller subtasks that together deliver the parent's scope.

Output STRICT JSON matching this shape — nothing else, no markdown fences, no prose:

{
  "children": [
    {
      "id": "child-1",
      "title": "Imperative short title (3-80 chars)",
      "type": "architecture | feature | bugfix",
      "priority": "P0 | P1 | P2 | P3",
      "complexity": 1-10,
      "deps": ["child-2"],
      "files_modified": ["src/path/to/file.ts"]
    }
  ]
}

Rules:
- Exactly ${sub_count} children.
- Each id matches /^[a-zA-Z0-9_\\-]+$/ and is unique in the list.
- "deps" references siblings in the same list; omit or use [] when none.
- "files_modified" overlaps with the parent's files_modified where possible.
- Each child's complexity is < parent's complexity; sum should approximate the parent.
- Return JSON only.`;
}

function buildExpandUserPrompt(parent) {
  const files = Array.isArray(parent.files_modified) ? parent.files_modified : [];
  const deps = Array.isArray(parent.deps) ? parent.deps : [];
  return [
    'Parent task to decompose:',
    '',
    `- id: ${parent.id}`,
    `- title: ${parent.title}`,
    `- type: ${parent.type}`,
    `- priority: ${parent.priority}`,
    parent.complexity != null ? `- complexity: ${parent.complexity}` : null,
    files.length ? `- files_modified: ${JSON.stringify(files)}` : null,
    deps.length ? `- existing deps: ${JSON.stringify(deps)}` : null,
    parent.trace_to ? `- trace_to: ${parent.trace_to}` : null,
    '',
    'Return the children list as JSON following the system schema.',
  ].filter((l) => l !== null).join('\n');
}

module.exports = {
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
  DEFAULT_SUB_COUNT,
};
