#!/usr/bin/env node

/**
 * ubp-orchestrator — Phase 5.4 daemon CLI.
 *
 * Subcommands:
 *   run     foreground daemon (debug / test).
 *   start   detached background daemon, writes .ultra/orchestrator.pid.
 *   stop    reads pidfile, SIGTERM the process, deletes pidfile.
 *   status  prints pidfile + running session summary.
 *
 * Opt-in gate: `start` and `run` require settings.json
 * `orchestrator.auto_dispatch: true` — default off per PLAN Phase 5.4 AC.
 *
 * The daemon never launches real runtime children in this phase — session
 * rows + git worktrees are created, external adapters (Phase 4) attach to
 * the worktree out-of-band. command/args can be passed via env for testing.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO_ROOT = process.env.UBP_REPO_ROOT || process.cwd();
const PIDFILE = path.join(REPO_ROOT, '.ultra', 'orchestrator.pid');
const LOGFILE = path.join(REPO_ROOT, '.ultra', 'orchestrator.log');
const SETTINGS_FILES = [
  path.join(REPO_ROOT, 'settings.json'),
  path.join(REPO_ROOT, '.claude', 'settings.json'),
];

function readSettings() {
  for (const f of SETTINGS_FILES) {
    if (fs.existsSync(f)) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; }
      catch { /* fall through */ }
    }
  }
  return {};
}

function optInAllowed(settings) {
  return !!(settings && settings.orchestrator && settings.orchestrator.auto_dispatch === true);
}

function parseRuntimes() {
  const raw = process.env.UBP_ORCH_RUNTIMES || 'claude,opencode,codex,gemini';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function cmdRun(opts = {}) {
  if (!opts.skipOptIn) {
    const settings = readSettings();
    if (!optInAllowed(settings)) {
      process.stderr.write(
        'orchestrator.auto_dispatch is not enabled in settings.json.\n' +
        'Set {"orchestrator":{"auto_dispatch":true}} to opt in.\n',
      );
      process.exit(2);
    }
  }
  const { initStateDb } = require('../mcp-server/lib/state-db.cjs');
  const { runDaemon } = require('../orchestrator/daemon.cjs');
  const { db } = initStateDb(path.join(REPO_ROOT, '.ultra', 'state.db'));
  const handle = runDaemon({
    db,
    repoRoot: REPO_ROOT,
    runtimes: parseRuntimes(),
    pollMs: Number(process.env.UBP_ORCH_POLL_MS || 1000),
    onError: (err) => process.stderr.write(`orchestrator error: ${err.message}\n`),
  });
  const shutdown = (signal) => {
    process.stderr.write(`orchestrator received ${signal}, stopping\n`);
    handle.stop();
    try { db.close(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.stderr.write(`orchestrator running (pollMs=${Number(process.env.UBP_ORCH_POLL_MS || 1000)}, runtimes=${parseRuntimes().join(',')})\n`);
  // Keep process alive while the setInterval is unref'd.
  setInterval(() => {}, 60000);
}

function cmdStart() {
  const settings = readSettings();
  if (!optInAllowed(settings)) {
    process.stderr.write('orchestrator.auto_dispatch is not enabled; refusing to start.\n');
    process.exit(2);
  }
  if (fs.existsSync(PIDFILE)) {
    const existing = Number(fs.readFileSync(PIDFILE, 'utf8'));
    try { process.kill(existing, 0); }
    catch (_) { fs.unlinkSync(PIDFILE); }
    if (fs.existsSync(PIDFILE)) {
      process.stderr.write(`orchestrator already running (pid=${existing}).\n`);
      process.exit(1);
    }
  }
  fs.mkdirSync(path.dirname(PIDFILE), { recursive: true });
  const out = fs.openSync(LOGFILE, 'a');
  const err = fs.openSync(LOGFILE, 'a');
  const child = spawn(process.execPath, [__filename, 'run'], {
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env, UBP_REPO_ROOT: REPO_ROOT },
  });
  child.unref();
  fs.writeFileSync(PIDFILE, String(child.pid));
  process.stdout.write(`orchestrator started (pid=${child.pid}, log=${LOGFILE})\n`);
}

function cmdStop() {
  if (!fs.existsSync(PIDFILE)) {
    process.stderr.write('no pidfile found; orchestrator not running.\n');
    process.exit(1);
  }
  const pid = Number(fs.readFileSync(PIDFILE, 'utf8'));
  try { process.kill(pid, 'SIGTERM'); }
  catch (err) {
    if (err.code === 'ESRCH') {
      process.stderr.write(`pid ${pid} already dead; cleaning pidfile.\n`);
      fs.unlinkSync(PIDFILE);
      return;
    }
    throw err;
  }
  // Wait briefly for the process to exit, then clean up.
  setTimeout(() => {
    try { process.kill(pid, 0); }
    catch (_) { /* dead; good */ }
    if (fs.existsSync(PIDFILE)) fs.unlinkSync(PIDFILE);
    process.stdout.write(`orchestrator stopped (pid=${pid})\n`);
  }, 200);
}

function cmdStatus() {
  const out = { pidfile: PIDFILE, running: false };
  if (fs.existsSync(PIDFILE)) {
    const pid = Number(fs.readFileSync(PIDFILE, 'utf8'));
    try { process.kill(pid, 0); out.pid = pid; out.running = true; }
    catch (_) { out.pid = pid; out.running = false; out.note = 'pidfile stale'; }
  }
  // Session summary.
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(REPO_ROOT, '.ultra', 'state.db');
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      const counts = db.prepare(
        "SELECT status, COUNT(*) AS n FROM sessions GROUP BY status",
      ).all();
      out.sessions = {};
      for (const r of counts) out.sessions[r.status] = r.n;
      db.close();
    }
  } catch (err) {
    out.session_error = err.message;
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function usage() {
  process.stderr.write(
    'usage: ubp-orchestrator <run|start|stop|status>\n' +
    '\n' +
    '  run     foreground daemon (requires opt-in)\n' +
    '  start   detached background daemon (requires opt-in)\n' +
    '  stop    terminate running daemon\n' +
    '  status  print pid + session counts\n',
  );
}

const subcommand = process.argv[2];
switch (subcommand) {
  case 'run':    cmdRun();    break;
  case 'start':  cmdStart();  break;
  case 'stop':   cmdStop();   break;
  case 'status': cmdStatus(); break;
  case '-h':
  case '--help':
  case 'help':
    usage(); process.exit(0);
    break;
  default:
    usage(); process.exit(1);
}
