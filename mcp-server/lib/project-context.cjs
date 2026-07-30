'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Database = require('better-sqlite3');

const contextEnvelope = require('./context-envelope.cjs');
const { EXPECTED_VERSION, REQUIRED_TABLES } = require('./state-db.cjs');
const runtimePaths = require('./runtime-paths.cjs');

function diagnosticEnvelope(rootDir, runtime, code, details = {}) {
  return {
    schema_version: '1.0',
    digest: null,
    detail: 'summary',
    envelope: {
      project: {
        root: '.',
        runtime,
        health: 'needs_attention',
      },
      git: null,
      baseline: null,
      change: null,
      task: null,
      decisions: [],
      checkpoints: [],
      evidence: [],
      execution: { stage: 'project', session: null },
      team_checkpoint: null,
      diagnostics: {
        warnings: [],
        needs_attention: [{
          code,
          severity: 'needs_attention',
          ...details,
        }],
        hard_conflicts: [],
      },
    },
    bytes: 0,
    root: path.resolve(rootDir),
  };
}

function tableNames(db) {
  return new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all().map((row) => row.name));
}

function latestSchemaVersion(db) {
  return db.prepare(
    'SELECT version FROM schema_version ORDER BY applied_at DESC, rowid DESC LIMIT 1',
  ).get()?.version || null;
}

function readProjectContextEnvelope(rootDir, {
  runtime = 'hook',
  stage = 'project',
  scope = {},
} = {}) {
  const root = path.resolve(rootDir || process.cwd());
  if (!fs.existsSync(path.join(root, '.ultra'))) return null;
  const dbPath = runtimePaths.locateStateDb(root);
  if (!fs.existsSync(dbPath)) {
    return diagnosticEnvelope(root, runtime, 'STATE_DB_MISSING');
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 1000');
    const tables = tableNames(db);
    if (!tables.has('schema_version')) {
      return diagnosticEnvelope(root, runtime, 'STATE_SCHEMA_MIGRATION_REQUIRED', {
        version: null,
      });
    }
    const version = latestSchemaVersion(db);
    if (version !== EXPECTED_VERSION) {
      return diagnosticEnvelope(root, runtime, 'STATE_SCHEMA_MIGRATION_REQUIRED', {
        version,
        expected: EXPECTED_VERSION,
      });
    }
    const missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
    if (missing.length > 0) {
      return diagnosticEnvelope(root, runtime, 'STATE_SCHEMA_INCOMPLETE', {
        missing_tables: missing,
      });
    }
    return {
      ...contextEnvelope.buildEnvelope(
        db,
        { detail: 'summary', stage, scope },
        { rootDir: root, runtime },
      ),
      root,
    };
  } catch (error) {
    return diagnosticEnvelope(root, runtime, 'STATE_DB_UNREADABLE', {
      cause: error.code || error.message,
    });
  } finally {
    if (db) db.close();
  }
}

function compact(value, maximum = 240) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 3).trimEnd()}...`;
}

function renderProjectContextEnvelope(rootDir, context) {
  if (!context?.envelope) return '';
  const root = path.resolve(rootDir || context.root || process.cwd());
  const envelope = context.envelope;
  const baseline = envelope.baseline || {};
  const change = envelope.change || {};
  const task = envelope.task || {};
  const lines = [
    '[Ultra Context Envelope]',
    `Project: ${root}`,
    `Stage: ${envelope.execution?.stage || 'project'}`,
    `Baseline: ${baseline.id || 'none'} (${
      baseline.mode ? `${baseline.mode}/` : ''
    }${baseline.status || 'none'})`,
    `Change: ${change.id || 'none'} (${change.status || 'none'})`,
    `Task: ${task.id || 'none'} (${task.status || 'none'})`,
  ];
  for (const decision of (envelope.decisions || []).slice(0, 5)) {
    lines.push(
      `Accepted decision: ${decision.id || 'unknown'} — ${
        compact(decision.decision || decision.summary || decision.question || 'recorded')
      }`,
    );
  }
  for (const checkpoint of (envelope.checkpoints || []).slice(0, 5)) {
    lines.push(
      `Checkpoint: ${checkpoint.stage || 'unknown'} ${
        checkpoint.status || 'recorded'
      } (${checkpoint.id || 'unknown'})`,
    );
  }
  const warnings = envelope.diagnostics?.warnings || [];
  const attention = envelope.diagnostics?.needs_attention || [];
  const conflicts = envelope.diagnostics?.hard_conflicts || [];
  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.map((item) => item.code).join(', ')}`);
  }
  if (attention.length > 0) {
    lines.push(`Needs attention: ${attention.map((item) => item.code).join(', ')}`);
  }
  if (conflicts.length > 0) {
    lines.push(`Hard conflicts: ${conflicts.map((item) => item.code).join(', ')}`);
  }
  if (envelope.team_checkpoint) {
    lines.push(
      `Team checkpoint: ${envelope.team_checkpoint.status || 'unknown'} ${
        envelope.team_checkpoint.state_digest || ''
      }`.trim(),
    );
  }
  lines.push(
    'Authority: digest-bound .ultra documents plus checkout-local .ultra/.runtime/state.db.',
    'Hooks are observational. Use ultra.context for the complete live envelope and public Ultra tools for changes.',
  );
  return lines.join('\n');
}

module.exports = {
  readProjectContextEnvelope,
  renderProjectContextEnvelope,
};
