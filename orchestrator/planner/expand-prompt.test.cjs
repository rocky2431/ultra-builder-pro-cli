'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
  DEFAULT_SUB_COUNT,
} = require('./expand-prompt.cjs');

test('buildExpandSystemPrompt: mentions sub_count explicitly', () => {
  const s = buildExpandSystemPrompt({ sub_count: 4 });
  assert.match(s, /Exactly 4 children/);
  assert.match(s, /STRICT JSON/);
});

test('buildExpandSystemPrompt: falls back to DEFAULT_SUB_COUNT when omitted', () => {
  const s = buildExpandSystemPrompt({});
  assert.match(s, new RegExp(`Exactly ${DEFAULT_SUB_COUNT} children`));
});

test('buildExpandUserPrompt: serializes parent fields into prompt body', () => {
  const parent = {
    id: 'parent-1',
    title: 'Build search feature',
    type: 'feature',
    priority: 'P1',
    complexity: 8,
    files_modified: ['src/search/index.ts', 'src/search/query.ts'],
    deps: ['infra-1'],
    trace_to: 'spec §3.2',
  };
  const body = buildExpandUserPrompt(parent);
  assert.match(body, /parent-1/);
  assert.match(body, /Build search feature/);
  assert.match(body, /complexity: 8/);
  assert.match(body, /src\/search\/index\.ts/);
  assert.match(body, /infra-1/);
  assert.match(body, /spec §3\.2/);
});

test('buildExpandUserPrompt: omits empty optional fields', () => {
  const parent = {
    id: 'p', title: 'Tiny task', type: 'feature', priority: 'P3',
    complexity: null, files_modified: [], deps: [],
  };
  const body = buildExpandUserPrompt(parent);
  assert.doesNotMatch(body, /files_modified/);
  assert.doesNotMatch(body, /existing deps/);
  assert.doesNotMatch(body, /complexity:/);
});
