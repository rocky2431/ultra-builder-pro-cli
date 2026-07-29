'use strict';

const fs = require('node:fs');
const path = require('node:path');
const taskLedger = require('./task-ledger.cjs');

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
  if (projection.kind === taskLedger.LEDGER_KIND) {
    const ledger = taskLedger.validateLedger(projection, projectionPath);
    return {
      path: projectionPath,
      version: ledger.schema_version,
      kind: ledger.kind,
      taskCount: ledger.tasks.length,
    };
  }
  return {
    path: projectionPath,
    version: String(projection.version || projection.schema_version || 'unknown'),
    kind: 'legacy-task-projection',
    taskCount: projection.tasks.length,
  };
}

function assertStateAuthority(db, rootDir, { importTeamLedger = false } = {}) {
  const authoritativeCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
  const projection = inspectProjection(rootDir);
  if (projection?.kind === taskLedger.LEDGER_KIND) {
    return importTeamLedger
      ? taskLedger.syncTaskLedger(db, { rootDir })
      : taskLedger.inspectTaskLedger(db, { rootDir });
  }
  if (authoritativeCount > 0 || !projection || projection.taskCount === 0) return null;

  const details = {
    authoritative_task_count: authoritativeCount,
    legacy_task_count: projection.taskCount,
    projection_path: projection.path,
    projection_version: projection.version,
    projection_kind: projection.kind,
  };
  const migrationTargets = {
    '4.4': '4.5',
    '4.5': '12.0',
  };
  const migrationTarget = migrationTargets[projection.version];
  if (migrationTarget) {
    throw new StateAuthorityError(
      'LEGACY_STATE_MIGRATION_REQUIRED',
      `state.db has no tasks but ${projection.path} contains ${projection.taskCount} v${projection.version} tasks; `
        + `run ultra-tools migrate --from=${projection.version} --to=${migrationTarget} `
        + '--source-dir <project-root> before using Ultra MCP tools',
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
