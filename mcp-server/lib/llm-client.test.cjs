'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLlmClient,
  inferProvider,
  LlmClientError,
  parseCompletionJson,
  stripCodeFence,
  DEFAULT_MODEL,
} = require('./llm-client.cjs');

test('inferProvider: claude family → anthropic', () => {
  assert.equal(inferProvider('claude-sonnet-4-6'), 'anthropic');
  assert.equal(inferProvider('claude-opus-4-7'), 'anthropic');
  assert.equal(inferProvider('sonnet-legacy'), 'anthropic');
  assert.equal(inferProvider('opus-anything'), 'anthropic');
  assert.equal(inferProvider('haiku-4-5'), 'anthropic');
});

test('inferProvider: GPT / o1 / o3 → openai', () => {
  assert.equal(inferProvider('gpt-4o'), 'openai');
  assert.equal(inferProvider('gpt-5.4'), 'openai');
  assert.equal(inferProvider('o1-preview'), 'openai');
  assert.equal(inferProvider('o3-mini'), 'openai');
});

test('inferProvider: unknown prefix → null', () => {
  assert.equal(inferProvider('llama-3'), null);
  assert.equal(inferProvider(''), null);
  assert.equal(inferProvider(null), null);
  assert.equal(inferProvider(undefined), null);
});

test('stripCodeFence: removes ```json ... ``` fence', () => {
  const input = '```json\n{"a":1}\n```';
  assert.equal(stripCodeFence(input).trim(), '{"a":1}');
});

test('stripCodeFence: removes plain ``` ... ``` fence', () => {
  const input = '```\n{"a":1}\n```';
  assert.equal(stripCodeFence(input).trim(), '{"a":1}');
});

test('stripCodeFence: leaves unfenced content alone', () => {
  assert.equal(stripCodeFence('{"a":1}'), '{"a":1}');
  assert.equal(stripCodeFence('   '), '   ');
});

test('stripCodeFence: empty / nullish → empty string', () => {
  assert.equal(stripCodeFence(''), '');
  assert.equal(stripCodeFence(null), '');
  assert.equal(stripCodeFence(undefined), '');
});

test('parseCompletionJson: valid JSON → parsed object', () => {
  const r = parseCompletionJson({
    raw: '{"ok":true,"n":2}',
    usage: { input_tokens: 10, output_tokens: 5 },
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
  });
  assert.deepEqual(r.json, { ok: true, n: 2 });
  assert.equal(r.usage.input_tokens, 10);
  assert.equal(r.model, 'claude-sonnet-4-6');
  assert.equal(r.provider, 'anthropic');
});

test('parseCompletionJson: fenced JSON → parsed object', () => {
  const r = parseCompletionJson({
    raw: '```json\n{"x":42}\n```',
    usage: {},
    model: 'gpt-5',
    provider: 'openai',
  });
  assert.deepEqual(r.json, { x: 42 });
});

test('parseCompletionJson: empty content → LLM_INVALID_JSON', () => {
  assert.throws(
    () => parseCompletionJson({ raw: '', usage: {}, model: 'x', provider: 'anthropic' }),
    (err) => err instanceof LlmClientError && err.code === 'LLM_INVALID_JSON',
  );
});

test('parseCompletionJson: malformed JSON → LLM_INVALID_JSON', () => {
  assert.throws(
    () => parseCompletionJson({ raw: '{not json', usage: {}, model: 'x', provider: 'anthropic' }),
    (err) => err instanceof LlmClientError && err.code === 'LLM_INVALID_JSON',
  );
});

test('createLlmClient: unknown model → LLM_UNSUPPORTED_MODEL', () => {
  assert.throws(
    () => createLlmClient({ model: 'llama-3', apiKey: 'sk-test' }),
    (err) => err instanceof LlmClientError && err.code === 'LLM_UNSUPPORTED_MODEL',
  );
});

test('createLlmClient: missing key → NO_LLM_CREDENTIALS', () => {
  const savedA = process.env.ANTHROPIC_API_KEY;
  const savedO = process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.throws(
      () => createLlmClient({ model: 'claude-sonnet-4-6' }),
      (err) => err instanceof LlmClientError && err.code === 'NO_LLM_CREDENTIALS',
    );
    assert.throws(
      () => createLlmClient({ model: 'gpt-5' }),
      (err) => err instanceof LlmClientError && err.code === 'NO_LLM_CREDENTIALS',
    );
  } finally {
    if (savedA !== undefined) process.env.ANTHROPIC_API_KEY = savedA;
    if (savedO !== undefined) process.env.OPENAI_API_KEY = savedO;
  }
});

test('createLlmClient: explicit apiKey bypasses env check + returns adapter shape', () => {
  const anthropicClient = createLlmClient({ model: 'claude-sonnet-4-6', apiKey: 'sk-test' });
  assert.equal(anthropicClient.provider, 'anthropic');
  assert.equal(anthropicClient.model, 'claude-sonnet-4-6');
  assert.equal(typeof anthropicClient.completeJson, 'function');

  const openaiClient = createLlmClient({ model: 'gpt-5', apiKey: 'sk-test' });
  assert.equal(openaiClient.provider, 'openai');
  assert.equal(openaiClient.model, 'gpt-5');
  assert.equal(typeof openaiClient.completeJson, 'function');
});

test('createLlmClient: defaults model from env UBP_PLANNER_MODEL', () => {
  const saved = process.env.UBP_PLANNER_MODEL;
  process.env.UBP_PLANNER_MODEL = 'gpt-5.4';
  try {
    const c = createLlmClient({ apiKey: 'sk-test' });
    assert.equal(c.model, 'gpt-5.4');
    assert.equal(c.provider, 'openai');
  } finally {
    if (saved === undefined) delete process.env.UBP_PLANNER_MODEL;
    else process.env.UBP_PLANNER_MODEL = saved;
  }
});

test('createLlmClient: falls back to DEFAULT_MODEL when nothing supplied', () => {
  const savedEnv = process.env.UBP_PLANNER_MODEL;
  delete process.env.UBP_PLANNER_MODEL;
  try {
    const c = createLlmClient({ apiKey: 'sk-test' });
    assert.equal(c.model, DEFAULT_MODEL);
  } finally {
    if (savedEnv !== undefined) process.env.UBP_PLANNER_MODEL = savedEnv;
  }
});
