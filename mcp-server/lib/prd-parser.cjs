'use strict';

// Validate and normalize a task graph derived from a PRD by the current host.
// The MCP runtime is deliberately deterministic: model judgment stays with
// the host that already owns the user interaction, while this module owns the
// machine contract before state.db is mutated.

const Ajv = require('ajv/dist/2020');
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

function parsePrd(tasks, { tag, changeId } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new PrdParseError('NO_INPUT', 'at least one host-derived task is required');
  }
  const input = { tasks };
  if (!validateTaskList(input)) {
    throw new PrdParseError(
      'PARSE_FAILED',
      `task graph failed schema: ${ajv.errorsText(validateTaskList.errors)}`,
    );
  }

  const ids = new Set();
  const normalized = tasks.map((t) => {
    if (ids.has(t.id)) {
      throw new PrdParseError('PARSE_FAILED', `duplicate task id "${t.id}" in task graph`);
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
      change_id: changeId || null,
    };
  });

  return { tasks: normalized };
}

module.exports = {
  parsePrd,
  PrdParseError,
  TASK_LIST_SCHEMA,
};
