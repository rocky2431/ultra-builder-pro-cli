'use strict';

// Persist host-derived child tasks atomically. Model judgment stays with the
// current host; this module validates ownership and the database contract.

const Ajv = require('ajv/dist/2020');
const ops = require('./state-ops.cjs');
const changes = require('./change-workflow.cjs');
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
          type:           { type: 'string', minLength: 1, maxLength: 80 },
          priority:       { type: 'string', minLength: 1, maxLength: 80 },
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

function expandTask(db, {
  id, children, rootDir = process.cwd(),
} = {}) {
  if (!id) throw new TaskExpandError('VALIDATION_ERROR', 'id required');

  const parent = ops.readTask(db, id);
  if (!parent) throw new TaskExpandError('TASK_NOT_FOUND', `no task ${id}`);
  if (parent.status === 'expanded') {
    throw new TaskExpandError('ALREADY_EXPANDED', `task ${id} is already expanded`);
  }
  changes.assertTaskCreationAllowed(db, { change_id: parent.change_id }, { rootDir });
  if (!validateChildren({ children })) {
    throw new TaskExpandError(
      'INVALID_OUTPUT',
      `child task graph failed schema: ${ajv.errorsText(validateChildren.errors)}`,
    );
  }

  const seen = new Set();
  const normalized = children.map((c) => {
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
      change_id: parent.change_id,
    };
  });

  return ops.tx(db, () => {
    const admission = changes.assertTaskCreationAllowed(
      db,
      { change_id: parent.change_id },
      { rootDir },
    );
    for (const child of normalized) {
      ops.createTask(db, child);
    }
    ops.patchTask(db, parent.id, { status: 'expanded' });
    return {
      parent_id: parent.id,
      children: normalized,
      diagnostics: admission.diagnostics,
    };
  });
}

module.exports = {
  expandTask,
  TaskExpandError,
  CHILDREN_SHAPE,
};
