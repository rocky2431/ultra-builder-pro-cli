'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { openStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const doctor = require('../../mcp-server/lib/doctor.cjs');

const USAGE = `ultra-tools system doctor [--repair]\n`;

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

async function dispatchDoctor(args) {
  const unknown = args.filter((arg) => !['--repair', '-h', '--help'].includes(arg));
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (unknown.length > 0) {
    emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: `unknown system doctor flag: ${unknown[0]}` } });
    return 1;
  }
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, '.ultra', 'state.db');
  if (!fs.existsSync(dbPath)) {
    emit({ ok: false, error: { code: 'STATE_DB_MISSING', message: `.ultra/state.db not found under ${rootDir}` } });
    return 2;
  }
  const db = openStateDb(dbPath);
  try {
    const data = await doctor.runDoctor(db, { rootDir, repair: args.includes('--repair') });
    emit({ ok: true, data });
    return data.status === 'healthy' ? 0 : 2;
  } catch (error) {
    emit({ ok: false, error: { code: error.code || 'STATE_DB_ERROR', message: error.message } });
    return 2;
  } finally {
    closeStateDb(db);
  }
}

async function dispatch(args) {
  const [verb, ...rest] = args;
  if (!verb || verb === '-h' || verb === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (verb !== 'doctor') {
    emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown system verb: ${verb}` } });
    return 1;
  }
  return dispatchDoctor(rest);
}

module.exports = { USAGE, dispatch, dispatchDoctor };
