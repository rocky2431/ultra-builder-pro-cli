'use strict';

// Phase 8A.1 — PRD → task[] parser. Delegates LLM call to an injected
// llmClient (see lib/llm-client.cjs). The parser itself is pure logic:
// prompt assembly → schema validation → id normalization. Keeping the
// llmClient as a parameter makes unit tests a Test Double exercise without
// mocking network I/O.

const Ajv = require('ajv/dist/2020');
const {
  buildSystemPrompt,
  buildUserPrompt,
} = require('../../orchestrator/planner/prd-prompt.cjs');

const TASK_LIST_SCHEMA = Object.freeze({
  type: 'object',
  required: ['tasks'],
  properties: {
    tasks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'type', 'priority'],
        properties: {
          id:          { type: 'string', pattern: '^[a-zA-Z0-9_\\-]+$' },
          title:       { type: 'string', minLength: 3, maxLength: 200 },
          type:        { type: 'string', enum: ['architecture', 'feature', 'bugfix'] },
          priority:    { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          complexity:  { type: 'integer', minimum: 1, maximum: 10 },
          deps:        { type: 'array', items: { type: 'string' } },
          files_modified: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
});

const ajv = new Ajv({ allErrors: true, strict: false });
const validateTaskList = ajv.compile(TASK_LIST_SCHEMA);

class PrdParseError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'PrdParseError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

async function parsePrd(prdText, { llmClient, tag } = {}) {
  if (!prdText || typeof prdText !== 'string' || !prdText.trim()) {
    throw new PrdParseError('NO_INPUT', 'prd text is empty');
  }
  if (!llmClient || typeof llmClient.completeJson !== 'function') {
    throw new PrdParseError('NO_LLM_CLIENT', 'llmClient.completeJson is required');
  }

  const system = buildSystemPrompt();
  const user = buildUserPrompt(prdText);

  let reply;
  try {
    reply = await llmClient.completeJson({ system, user });
  } catch (err) {
    throw new PrdParseError(
      'PARSE_FAILED',
      `LLM call failed: ${err.message}`,
      err,
    );
  }

  if (!validateTaskList(reply.json)) {
    throw new PrdParseError(
      'PARSE_FAILED',
      `LLM output failed schema: ${ajv.errorsText(validateTaskList.errors)}`,
    );
  }

  const ids = new Set();
  const tasks = reply.json.tasks.map((t) => {
    if (ids.has(t.id)) {
      throw new PrdParseError('PARSE_FAILED', `duplicate task id "${t.id}" in LLM output`);
    }
    ids.add(t.id);
    return {
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      complexity: t.complexity ?? null,
      deps: Array.isArray(t.deps) ? t.deps : [],
      files_modified: Array.isArray(t.files_modified) ? t.files_modified : [],
      tag: tag || null,
    };
  });

  return {
    tasks,
    usage: reply.usage || {},
    model: reply.model,
    provider: reply.provider,
  };
}

module.exports = {
  parsePrd,
  PrdParseError,
  TASK_LIST_SCHEMA,
};
