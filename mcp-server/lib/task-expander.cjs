'use strict';

// Phase 8A.3 — Expand a complex task into subtasks via injected llmClient.
//
// expandTask(db, { id, sub_count, strategy, llmClient }) reads the parent,
// asks the LLM for children, and persists them atomically (children rows
// with parent_id set, parent status → 'expanded'). The status transition
// automatically emits task_expanded via state-ops' status→event map.
// Strategy 'manual' is reserved for future CLI interactive flows.

const Ajv = require('ajv/dist/2020');
const ops = require('./state-ops.cjs');
const {
  buildExpandSystemPrompt,
  buildExpandUserPrompt,
} = require('../../orchestrator/planner/expand-prompt.cjs');

const CHILDREN_SHAPE = Object.freeze({
  type: 'object',
  required: ['children'],
  properties: {
    children: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'type', 'priority'],
        properties: {
          id:             { type: 'string', pattern: '^[a-zA-Z0-9_\\-]+$' },
          title:          { type: 'string', minLength: 3, maxLength: 200 },
          type:           { type: 'string', enum: ['architecture', 'feature', 'bugfix'] },
          priority:       { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          complexity:     { type: 'integer', minimum: 1, maximum: 10 },
          deps:           { type: 'array', items: { type: 'string' } },
          files_modified: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
});

const ajv = new Ajv({ allErrors: true, strict: false });
const validateChildren = ajv.compile(CHILDREN_SHAPE);

class TaskExpandError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'TaskExpandError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

async function expandTask(db, { id, sub_count, strategy = 'llm', llmClient } = {}) {
  if (!id) throw new TaskExpandError('VALIDATION_ERROR', 'id required');

  const parent = ops.readTask(db, id);
  if (!parent) throw new TaskExpandError('TASK_NOT_FOUND', `no task ${id}`);
  if (parent.status === 'expanded') {
    throw new TaskExpandError('ALREADY_EXPANDED', `task ${id} is already expanded`);
  }
  if (strategy === 'manual') {
    throw new TaskExpandError('NOT_IMPLEMENTED', 'strategy "manual" not implemented; use "llm"');
  }
  if (strategy !== 'llm') {
    throw new TaskExpandError('VALIDATION_ERROR', `unknown strategy "${strategy}"`);
  }
  if (!llmClient || typeof llmClient.completeJson !== 'function') {
    throw new TaskExpandError('NO_LLM_CLIENT', 'llmClient.completeJson is required');
  }

  const system = buildExpandSystemPrompt({ sub_count });
  const user = buildExpandUserPrompt(parent);

  let reply;
  try {
    reply = await llmClient.completeJson({ system, user });
  } catch (err) {
    throw new TaskExpandError('LLM_CALL_FAILED', `LLM call failed: ${err.message}`, err);
  }
  if (!validateChildren(reply.json)) {
    throw new TaskExpandError(
      'INVALID_OUTPUT',
      `LLM output failed schema: ${ajv.errorsText(validateChildren.errors)}`,
    );
  }

  const seen = new Set();
  const children = reply.json.children.map((c) => {
    if (seen.has(c.id)) {
      throw new TaskExpandError('INVALID_OUTPUT', `duplicate child id "${c.id}"`);
    }
    seen.add(c.id);
    return {
      id: c.id,
      title: c.title,
      type: c.type,
      priority: c.priority,
      complexity: c.complexity ?? null,
      deps: Array.isArray(c.deps) ? c.deps : [],
      files_modified: Array.isArray(c.files_modified) ? c.files_modified : [],
      parent_id: parent.id,
      tag: parent.tag,
    };
  });

  return ops.tx(db, () => {
    for (const child of children) {
      ops.createTask(db, child);
    }
    ops.patchTask(db, parent.id, { status: 'expanded' });
    return {
      parent_id: parent.id,
      children,
    };
  });
}

module.exports = {
  expandTask,
  TaskExpandError,
  CHILDREN_SHAPE,
};
