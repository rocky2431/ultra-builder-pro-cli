'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');

const DEFAULT_DB_PATH = path.join('.ultra', 'state.db');

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--path') {
      flags.path = args[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function dispatch(args) {
  const [verb, ...rest] = args;
  const flags = parseFlags(rest);

  if (!verb || flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  switch (verb) {
    case 'init':
      return cmdInit(flags);
    default:
      emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `db ${verb} is not implemented yet` } });
      return 1;
  }
}

function cmdInit(flags) {
  const dbPath = path.resolve(flags.path || DEFAULT_DB_PATH);
  try {
    const { db, schema_version, created, tables, path: actualPath } = initStateDb(dbPath);
    closeStateDb(db);
    emit({
      ok: true,
      data: {
        path: actualPath,
        schema_version,
        created,
        tables,
        size_bytes: fs.statSync(actualPath).size,
      },
    });
    return 0;
  } catch (err) {
    emit({
      ok: false,
      error: {
        code: 'INIT_FAILED',
        message: err.message,
        retriable: false,
      },
    });
    return 2;
  }
}

const USAGE = `ultra-tools db <verb> [flags]

Verbs (Phase 2):
  init [--path <db>]   create or open .ultra/state.db, apply schema (default: .ultra/state.db)

Phase 2.5 will add: checkpoint | vacuum | integrity | backup
`;

module.exports = { dispatch, USAGE, DEFAULT_DB_PATH };
