'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SYSTEM_PROMPT,
  buildSystemPrompt,
  buildUserPrompt,
} = require('./prd-prompt.cjs');

test('buildSystemPrompt returns the module-level template', () => {
  assert.equal(buildSystemPrompt(), SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /engineering planner/i);
  assert.match(SYSTEM_PROMPT, /STRICT JSON/);
  assert.match(SYSTEM_PROMPT, /\/\^task-\[0-9\]\+\$\//);
});

test('buildUserPrompt embeds PRD text verbatim', () => {
  const prd = 'As a user I want to search products by keyword';
  const out = buildUserPrompt(prd);
  assert.ok(out.includes(prd), 'user prompt must contain the PRD text');
  assert.match(out, /JSON/);
});

test('buildUserPrompt tolerates long PRD text without truncation', () => {
  const long = 'line\n'.repeat(500);
  const out = buildUserPrompt(long);
  assert.ok(out.includes(long));
});
