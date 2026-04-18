'use strict';

// CLI fallback for the session.* MCP tool family.
// Phase 4.5.4/4.5.6 scope: list / admission / reap / get / heartbeat / close /
// subscribe. session.spawn is intentionally not in the CLI layer — it
// requires a long-lived parent process (the child's lifecycle tracks the
// caller). orchestrator/session-runner.cjs is the proper entry for spawn.

const path = require('node:path');
const { initStateDb, closeStateDb } = require('../../mcp-server/lib/state-db.cjs');
const ops = require('../../mcp-server/lib/state-ops.cjs');

const DEFAULT_DB_PATH = path.join('.ultra', 'state.db');

const USAGE = `ultra-tools session <verb> [flags]

VERBS:
  list        --status running|completed|crashed|orphan  [--task-id <id>] [--limit <n>]
  admission   --task-id <id>                             admission_check
  reap        [--grace-seconds <n>]                      orphan sweeper (Phase 4.5.6)
  get         --sid <sid>
  heartbeat   --sid <sid>
  close       --sid <sid> --status completed|crashed|orphan
  subscribe   --since-id <n> [--sid <sid>] [--limit <n>]

GLOBAL FLAGS:
  --db <path>  path to state.db (default: .ultra/state.db)
  -h, --help   show this message
`;

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--db':              flags.db = args[++i]; break;
      case '--status':          flags.status = args[++i]; break;
      case '--task-id':         flags.task_id = args[++i]; break;
      case '--sid':             flags.sid = args[++i]; break;
      case '--limit':           flags.limit = Number(args[++i]); break;
      case '--since-id':        flags.since_id = Number(args[++i]); break;
      case '--grace-seconds':   flags.grace_seconds = Number(args[++i]); break;
      case '-h': case '--help': flags.help = true; break;
      default:                  flags._.push(a);
    }
  }
  return flags;
}

function withDb(flags, fn) {
  const dbPath = path.resolve(flags.db || DEFAULT_DB_PATH);
  const { db } = initStateDb(dbPath);
  try { return fn(db); }
  finally { try { closeStateDb(db); } catch (_) { /* ignore */ } }
}

function cmdList(flags) {
  return withDb(flags, (db) => {
    const status = flags.status || 'running';
    let sessions;
    if (status === 'running') {
      sessions = ops.listActiveSessions(db, { task_id: flags.task_id });
    } else {
      sessions = db.prepare(
        "SELECT * FROM sessions WHERE status = ? AND (? IS NULL OR task_id = ?) ORDER BY started_at ASC LIMIT ?",
      ).all(status, flags.task_id || null, flags.task_id || null, Math.min(flags.limit || 100, 500));
    }
    const limit = Math.min(flags.limit || 100, 500);
    const trimmed = sessions.slice(0, limit);
    emit({ ok: true, data: { sessions: trimmed, count: trimmed.length } });
    return 0;
  });
}

function cmdAdmission(flags) {
  if (!flags.task_id) { emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'missing --task-id' } }); return 1; }
  return withDb(flags, (db) => {
    try {
      const v = ops.admissionCheck(db, flags.task_id);
      emit({ ok: true, data: v });
      return 0;
    } catch (err) {
      emit({ ok: false, error: { code: err.code || 'STATE_DB_ERROR', message: err.message, retriable: !!err.retriable } });
      return err.code === 'TASK_NOT_FOUND' ? 1 : 2;
    }
  });
}

function cmdReap(flags) {
  return withDb(flags, (db) => {
    const grace = Number.isFinite(flags.grace_seconds) ? flags.grace_seconds : 300;
    const r = ops.reapOrphanSessions(db, { graceSeconds: grace });
    emit({ ok: true, data: r });
    return 0;
  });
}

function cmdGet(flags) {
  if (!flags.sid) { emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'missing --sid' } }); return 1; }
  return withDb(flags, (db) => {
    const s = ops.readSession(db, flags.sid);
    if (!s) { emit({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: `sid ${flags.sid} not found` } }); return 1; }
    emit({ ok: true, data: { session: s } });
    return 0;
  });
}

function cmdHeartbeat(flags) {
  if (!flags.sid) { emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'missing --sid' } }); return 1; }
  return withDb(flags, (db) => {
    try {
      const r = ops.heartbeatSession(db, flags.sid);
      emit({ ok: true, data: r });
      return 0;
    } catch (err) {
      emit({ ok: false, error: { code: err.code || 'STATE_DB_ERROR', message: err.message } });
      return err.code === 'LEASE_EXPIRED' ? 3 : 2;
    }
  });
}

function cmdClose(flags) {
  if (!flags.sid || !flags.status) { emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'missing --sid or --status' } }); return 1; }
  return withDb(flags, (db) => {
    try {
      ops.updateSession(db, flags.sid, { status: flags.status });
      emit({ ok: true, data: { sid: flags.sid, status: flags.status } });
      return 0;
    } catch (err) {
      emit({ ok: false, error: { code: err.code || 'STATE_DB_ERROR', message: err.message } });
      return 2;
    }
  });
}

function cmdSubscribe(flags) {
  return withDb(flags, (db) => {
    const r = ops.subscribeEventsSince(db, {
      since_id: Number.isFinite(flags.since_id) ? flags.since_id : 0,
      task_id: flags.sid ? undefined : undefined,
      limit: flags.limit,
    });
    emit({ ok: true, data: r });
    return 0;
  });
}

function dispatch(args) {
  const [verb, ...rest] = args;
  if (!verb || verb === '-h' || verb === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }
  const flags = parseFlags(rest);
  if (flags.help) { process.stdout.write(USAGE); return 0; }

  switch (verb) {
    case 'list':       return cmdList(flags);
    case 'admission':  return cmdAdmission(flags);
    case 'reap':       return cmdReap(flags);
    case 'get':        return cmdGet(flags);
    case 'heartbeat':  return cmdHeartbeat(flags);
    case 'close':      return cmdClose(flags);
    case 'subscribe':  return cmdSubscribe(flags);
    case 'spawn': {
      emit({ ok: false, error: { code: 'NOT_SUPPORTED', message: 'session spawn via CLI is not supported; use orchestrator/session-runner.cjs — CLI cannot own the child lifecycle' } });
      return 1;
    }
    default: {
      emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown session verb '${verb}'; see spec/cli-protocol.md for supported session CLI verbs` } });
      return 1;
    }
  }
}

module.exports = { dispatch, USAGE };
