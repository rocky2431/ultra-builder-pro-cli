#!/usr/bin/env node

/**
 * ultra-tools — runtime-agnostic state engine for Ultra Builder Pro.
 *
 * Maintenance CLI for Ultra initialization, status, database operations,
 * migration, and explicit legacy-memory cleanup. Authoritative task mutations
 * stay on the live MCP server; this CLI is not a task-state fallback.
 *
 * Usage:
 *   ultra-tools <subcommand> [...]
 *   ultra-tools --help
 *   ultra-tools --version
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VERSION = (() => {
  try {
    const pkg = require('../package.json');
    return pkg.version;
  } catch (_err) {
    return '0.1.0';
  }
})();

const USAGE = `ultra-tools v${VERSION}

USAGE:
  ultra-tools <subcommand> [args]

SUBCOMMANDS:
  task      init-project
  session   close | get | list | admission | heartbeat | subscribe | reap
  system    doctor [--repair] | restore | rebaseline
  status    [--cost] [--since <duration>] [--json]
  db        init | checkpoint | vacuum | integrity | backup (Phase 2)
  migrate   --from=<4.4|4.5> --to=<4.5|15.0> [--dry|--rollback]
  legacy-memory inspect | archive | prune --confirm DELETE_ULTRA_LEGACY_MEMORY

  --help / -h      show this message
  --version / -v   show version

All state lives under .ultra/ in the project root.
`;

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (err) {
    fail(`malformed JSON at ${p}: ${err.message}`);
  }
}

function fail(msg, code) {
  process.stderr.write(`ultra-tools: ${msg}\n`);
  process.exit(code || 1);
}

const dbCommand = require('./commands/db.cjs');
const migrateCommand = require('./commands/migrate.cjs');
const taskCommand = require('./commands/task.cjs');
const sessionCommand = require('./commands/session.cjs');
const statusCommand = require('./commands/status.cjs');
const legacyMemoryCommand = require('./commands/legacy-memory.cjs');
const systemCommand = require('./commands/system.cjs');

// Session commands run only against healthy authority and may emit best-effort
// telemetry. Initialization, diagnosis, migration, and recovery commands must
// never open state.db before their own evidence-preserving checks.
const TELEMETRY_SUBCOMMANDS = new Set(['session']);

function emitCliTelemetry(sub, rest) {
  try {
    const dbPath = path.resolve('.ultra', 'state.db');
    if (!fs.existsSync(dbPath)) return;
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    try {
      const telemetry = require('../mcp-server/lib/telemetry.cjs');
      telemetry.appendTelemetry(db, {
        event_type: 'tool_call',
        tool_name: `cli.${sub}`,
        session_id: process.env.UBP_SESSION_ID || null,
        rootDir: process.cwd(),
        payload: { args: Array.isArray(rest) ? rest.slice(0, 4) : [] },
      });
    } finally { db.close(); }
  } catch (_) { /* telemetry is opt-in side channel; never crash the CLI */ }
}

const SUBCOMMANDS = {
  task: (args) => process.exit(taskCommand.dispatch(args)),
  session: (args) => process.exit(sessionCommand.dispatch(args)),
  status: (args) => process.exit(statusCommand.dispatch(args)),
  db: (args) => process.exit(dbCommand.dispatch(args)),
  migrate: (args) => process.exit(migrateCommand.dispatch(args)),
  'legacy-memory': (args) => process.exit(legacyMemoryCommand.dispatch(args)),
  system: (args) => systemCommand.dispatch(args).then((code) => process.exit(code)),
};

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    process.stdout.write(USAGE);
    return;
  }
  if (args[0] === '-v' || args[0] === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  const [sub, ...rest] = args;
  const handler = SUBCOMMANDS[sub];
  if (!handler) fail(`unknown subcommand: ${sub}\n\n${USAGE}`);
  if (TELEMETRY_SUBCOMMANDS.has(sub)) emitCliTelemetry(sub, rest);
  handler(rest);
}

// exports kept for unit tests (Phase 1+)
module.exports = { USAGE, SUBCOMMANDS, readJsonIfExists, VERSION, main };

if (require.main === module) {
  main(process.argv);
}
