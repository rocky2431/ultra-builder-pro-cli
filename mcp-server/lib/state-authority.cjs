'use strict';

const fs = require('node:fs');
const path = require('node:path');

class StateAuthorityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.retriable = false;
    this.details = details;
  }
}

function inspectProjection(rootDir) {
  const projectionPath = path.join(rootDir, '.ultra', 'tasks', 'tasks.json');
  if (!fs.existsSync(projectionPath)) return null;
  let projection;
  try {
    projection = JSON.parse(fs.readFileSync(projectionPath, 'utf8'));
  } catch (error) {
    throw new StateAuthorityError(
      'STATE_PROJECTION_INVALID',
      `cannot validate ${projectionPath}: ${error.message}`,
      { projection_path: projectionPath },
    );
  }
  if (!projection || !Array.isArray(projection.tasks)) {
    throw new StateAuthorityError(
      'STATE_PROJECTION_INVALID',
      `${projectionPath} does not contain a tasks array`,
      { projection_path: projectionPath },
    );
  }
  return {
    path: projectionPath,
    version: String(projection.version || projection.schema_version || 'unknown'),
    taskCount: projection.tasks.length,
  };
}

function assertStateAuthority(db, rootDir) {
  const authoritativeCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
  if (authoritativeCount > 0) return;
  const projection = inspectProjection(rootDir);
  if (!projection || projection.taskCount === 0) return;

  const details = {
    authoritative_task_count: authoritativeCount,
    legacy_task_count: projection.taskCount,
    projection_path: projection.path,
    projection_version: projection.version,
  };
  if (projection.version === '4.4') {
    throw new StateAuthorityError(
      'LEGACY_STATE_MIGRATION_REQUIRED',
      `state.db has no tasks but ${projection.path} contains ${projection.taskCount} v4.4 tasks; `
        + 'run ultra-tools migrate --from=4.4 --to=4.5 --source-dir <project-root> before using Ultra MCP tools',
      details,
    );
  }
  throw new StateAuthorityError(
    'STATE_AUTHORITY_CONFLICT',
    `state.db has no tasks but ${projection.path} contains ${projection.taskCount} tasks; refusing projection fallback`,
    details,
  );
}

module.exports = {
  StateAuthorityError,
  inspectProjection,
  assertStateAuthority,
};
