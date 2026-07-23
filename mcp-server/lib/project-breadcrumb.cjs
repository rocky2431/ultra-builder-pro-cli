'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const { EXPECTED_VERSION, REQUIRED_TABLES } = require('./state-db.cjs');
const { readBreadcrumb } = require('./context-spine.cjs');

function blockedBreadcrumb(code, {
  allowedTransitions = [],
  requiredTransition = null,
} = {}) {
  return {
    change_id: null,
    task_id: null,
    role: 'plan',
    gate: 'alignment',
    readiness: 'blocked',
    blockers: [code],
    warnings: [],
    allowed_transitions: allowedTransitions,
    required_transition: requiredTransition,
    context_manifest_path: null,
    context_manifest_hash: null,
    git_head: null,
    baseline: null,
  };
}

function migrationBreadcrumb(code) {
  return blockedBreadcrumb(code, {
    allowedTransitions: ['ultra-init', 'ultra-status'],
    requiredTransition: 'ultra-init',
  });
}

function doctorBreadcrumb(code) {
  return blockedBreadcrumb(code, {
    allowedTransitions: ['ultra-doctor', 'ultra-status'],
    requiredTransition: 'ultra-doctor',
  });
}

function latestSchemaVersion(db) {
  return db.prepare(
    'SELECT version FROM schema_version ORDER BY applied_at DESC, rowid DESC LIMIT 1',
  ).get()?.version || null;
}

function tableNames(db) {
  return new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all().map((row) => row.name));
}

function readProjectBreadcrumb(rootDir) {
  const root = path.resolve(rootDir || process.cwd());
  const ultraDir = path.join(root, '.ultra');
  if (!fs.existsSync(ultraDir)) return null;
  const dbPath = path.join(ultraDir, 'state.db');
  if (!fs.existsSync(dbPath)) {
    return blockedBreadcrumb('STATE_DB_MISSING', {
      allowedTransitions: ['ultra-init', 'ultra-status'],
      requiredTransition: 'ultra-init',
    });
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 1000');
    const tables = tableNames(db);
    if (!tables.has('schema_version')) {
      return migrationBreadcrumb('STATE_SCHEMA_MIGRATION_REQUIRED:unknown');
    }
    const version = latestSchemaVersion(db);
    if (version !== EXPECTED_VERSION) {
      return migrationBreadcrumb(`STATE_SCHEMA_MIGRATION_REQUIRED:${version || 'unknown'}`);
    }
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length > 0) {
      return doctorBreadcrumb(`STATE_SCHEMA_INCOMPLETE:${missing.join(',')}`);
    }
    return readBreadcrumb(db, {}, { rootDir: root });
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : 'unknown';
    return doctorBreadcrumb(`STATE_DB_UNREADABLE:${code}`);
  } finally {
    if (db) db.close();
  }
}

function renderProjectBreadcrumb(rootDir, breadcrumb) {
  if (!breadcrumb) return '';
  const root = path.resolve(rootDir || process.cwd());
  const baseline = breadcrumb.baseline || {};
  const task = breadcrumb.task_id || 'none';
  const taskStatus = breadcrumb.task_status || 'none';
  const lines = breadcrumb.change_id ? [
    '[Ultra context spine]',
    `Project: ${root}`,
    `Baseline: ${baseline.id || 'unknown'} (${baseline.mode || 'unknown'}/${baseline.status || 'unknown'})`,
    `Change: ${breadcrumb.change_id} (${breadcrumb.change_status || 'active'})`,
    `Task: ${task} (${taskStatus})`,
    `Role: ${breadcrumb.role || 'plan'}`,
    `Gate: ${breadcrumb.gate || 'alignment'}`,
    `Readiness: ${breadcrumb.readiness || 'blocked'}`,
  ] : [
    '[Ultra baseline]',
    `Project: ${root}`,
    `Baseline: ${baseline.id || 'missing'} (${baseline.mode || 'unknown'}/${baseline.status || 'missing'})`,
    `Readiness: ${breadcrumb.readiness || 'blocked'}`,
  ];
  if (Array.isArray(breadcrumb.blockers) && breadcrumb.blockers.length > 0) {
    lines.push(`Blockers: ${breadcrumb.blockers.join(', ')}`);
  }
  if (Array.isArray(breadcrumb.warnings) && breadcrumb.warnings.length > 0) {
    lines.push(`Warnings: ${breadcrumb.warnings.join(', ')}`);
  }
  if (breadcrumb.workflow) {
    lines.push(
      `Workflow: ${breadcrumb.workflow.id} (${breadcrumb.workflow.kind}/${breadcrumb.workflow.status})`,
      `Step: ${breadcrumb.workflow.current_step || 'finalize'}`,
    );
  }
  if (breadcrumb.decision) {
    const current = breadcrumb.decision.current;
    lines.push(
      `Decision thread: ${breadcrumb.decision.thread_id} (${breadcrumb.decision.status}/${breadcrumb.decision.mode})`,
      current
        ? `Decision: ${current.id} — ${current.question}`
        : 'Decision: checkpoint confirmation required',
    );
  }
  lines.push(`Allowed transitions: ${(breadcrumb.allowed_transitions || []).join(', ') || 'none'}`);
  if (breadcrumb.required_transition) {
    lines.push(`Required transition: ${breadcrumb.required_transition}`);
  }
  if (breadcrumb.context_manifest_path) {
    lines.push(
      `Context: ${breadcrumb.context_manifest_path} sha256=${breadcrumb.context_manifest_hash || 'unknown'}`,
    );
  }
  lines.push('Authority: .ultra/state.db; JSON/Markdown remain projections or evidence artifacts.');
  return lines.join('\n');
}

module.exports = {
  readProjectBreadcrumb,
  renderProjectBreadcrumb,
};
