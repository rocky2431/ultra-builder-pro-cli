'use strict';

// Phase 8A.1 — Unified LLM client over @anthropic-ai/sdk and openai.
//
// Provider is inferred from model prefix (claude/opus/sonnet/haiku → Anthropic,
// gpt/o1/o3 → OpenAI). API keys come from env. The single surface the rest of
// the code depends on is `client.completeJson({ system, user, maxTokens })`,
// which returns `{ json, raw, usage, model, provider }` — the model's reply
// already parsed as JSON (caller handles schema validation on `.json`).

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const PROVIDER_RULES = Object.freeze([
  { pattern: /^(claude|opus|sonnet|haiku)/i, provider: 'anthropic' },
  { pattern: /^(gpt|o1|o3)/i,                provider: 'openai'    },
]);

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

class LlmClientError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'LlmClientError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function inferProvider(model) {
  if (!model || typeof model !== 'string') return null;
  for (const rule of PROVIDER_RULES) {
    if (rule.pattern.test(model)) return rule.provider;
  }
  return null;
}

function resolveProviderKey(provider, apiKey) {
  if (apiKey) return apiKey;
  return provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
}

function createLlmClient({ model, apiKey } = {}) {
  const resolvedModel = model || process.env.UBP_PLANNER_MODEL || DEFAULT_MODEL;
  const provider = inferProvider(resolvedModel);
  if (!provider) {
    throw new LlmClientError(
      'LLM_UNSUPPORTED_MODEL',
      `cannot infer provider from model "${resolvedModel}"`,
    );
  }
  const key = resolveProviderKey(provider, apiKey);
  if (!key) {
    const envName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new LlmClientError('NO_LLM_CREDENTIALS', `${envName} not set`);
  }
  return provider === 'anthropic'
    ? buildAnthropicAdapter({ model: resolvedModel, apiKey: key })
    : buildOpenAiAdapter({ model: resolvedModel, apiKey: key });
}

function buildAnthropicAdapter({ model, apiKey }) {
  const sdk = new Anthropic({ apiKey });
  return {
    provider: 'anthropic',
    model,
    async completeJson({ system, user, maxTokens = DEFAULT_MAX_TOKENS }) {
      let message;
      try {
        message = await sdk.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        });
      } catch (err) {
        throw new LlmClientError('LLM_API_ERROR', `Anthropic API error: ${err.message}`, err);
      }
      const text = extractAnthropicText(message.content);
      const usage = {
        input_tokens: message.usage?.input_tokens ?? 0,
        output_tokens: message.usage?.output_tokens ?? 0,
      };
      return parseCompletionJson({ raw: text, usage, model, provider: 'anthropic' });
    },
  };
}

function buildOpenAiAdapter({ model, apiKey }) {
  const sdk = new OpenAI({ apiKey });
  return {
    provider: 'openai',
    model,
    async completeJson({ system, user, maxTokens = DEFAULT_MAX_TOKENS }) {
      let completion;
      try {
        completion = await sdk.chat.completions.create({
          model,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user',   content: user   },
          ],
        });
      } catch (err) {
        throw new LlmClientError('LLM_API_ERROR', `OpenAI API error: ${err.message}`, err);
      }
      const text = completion.choices?.[0]?.message?.content ?? '';
      const usage = {
        input_tokens:  completion.usage?.prompt_tokens     ?? 0,
        output_tokens: completion.usage?.completion_tokens ?? 0,
      };
      return parseCompletionJson({ raw: text, usage, model, provider: 'openai' });
    },
  };
}

function extractAnthropicText(content) {
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('');
}

function parseCompletionJson({ raw, usage, model, provider }) {
  const trimmed = stripCodeFence(raw).trim();
  if (!trimmed) {
    throw new LlmClientError('LLM_INVALID_JSON', 'LLM returned empty content');
  }
  let json;
  try {
    json = JSON.parse(trimmed);
  } catch (err) {
    throw new LlmClientError(
      'LLM_INVALID_JSON',
      `failed to parse LLM response as JSON: ${err.message}`,
      err,
    );
  }
  return { json, raw, usage, model, provider };
}

function stripCodeFence(s) {
  if (!s || typeof s !== 'string') return '';
  const fenced = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1] : s;
}

module.exports = {
  createLlmClient,
  inferProvider,
  LlmClientError,
  parseCompletionJson,
  stripCodeFence,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
};
