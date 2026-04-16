#!/usr/bin/env node

/**
 * ultra-tools — runtime-agnostic state engine for Ultra Builder Pro.
 *
 * Single CLI that every runtime (Claude / OpenCode / Codex / Gemini) can invoke
 * via Bash. Collapses Claude-only built-in tools into file-backed, portable
 * equivalents so the same commands and agents work everywhere.
 *
 * Subcommands (Phase 1 will implement; Phase 0 = stubs + USAGE):
 *
 *   task create|update|list|get|delete
 *       Reads/writes .ultra/tasks/tasks.json. Replaces TaskCreate/TaskUpdate/
 *       TaskList/TaskGet.
 *
 *   ask --question "<q>" --options "A|B|C" [--header H] [--text-mode]
 *       Native AskUserQuestion on Claude (via stdout JSON sentinel);
 *       text-mode numbered menu + stdin on other runtimes.
 *
 *   memory search <query> [--limit N]
 *   memory save --summary "<s>" [--tags "a,b"]
 *       Wraps .ultra/memory/memory.db (SQLite FTS5). Phase 1 hooks in
 *       Python `memory_db.py` logic via subprocess.
 *
 *   skill invoke <name> [--args "..."]
 *       Loads skills/<name>/SKILL.md and prints it so the outer runtime
 *       can inject it into the prompt. Replaces the native Skill() tool.
 *
 *   subagent run <agent-name> --prompt "..." [--backend auto|claude|codex|gemini|sdk]
 *       Dispatches a sub-agent. Backends:
 *         claude  → emits Task() JSON sentinel for Claude Code
 *         codex   → shells out to `codex exec …` with injected prompt
 *         gemini  → shells out to `gemini --prompt …`
 *         sdk     → uses @anthropic-ai/claude-agent-sdk headless query()
 *         auto    → picks based on env.UBP_RUNTIME
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
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return pkg.version;
  } catch (_err) {
    return '0.1.0';
  }
})();

const USAGE = `ultra-tools v${VERSION}

USAGE:
  ultra-tools <subcommand> [args]

SUBCOMMANDS:
  task      create | update | list | get | delete           (Phase 2-3)
  ask       --question "<q>" --options "A|B|C"              (Phase 3)
  memory    search <query> | save --summary "..."           (Phase 7)
  skill     invoke <name>                                    (Phase 3)
  subagent  run <agent-name> --prompt "..."                 (Phase 3)
  db        init | checkpoint | vacuum | integrity | backup (Phase 2)
  migrate   --from=4.4 --to=4.5 [--dry|--rollback]          (Phase 2)

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

function notImplemented(name) {
  fail(`'${name}' not implemented — scheduled for Phase 1`, 2);
}

const dbCommand = require('./commands/db.cjs');
const migrateCommand = require('./commands/migrate.cjs');

const SUBCOMMANDS = {
  task: (_args) => notImplemented('task'),
  ask: (_args) => notImplemented('ask'),
  memory: (_args) => notImplemented('memory'),
  skill: (_args) => notImplemented('skill'),
  subagent: (_args) => notImplemented('subagent'),
  db: (args) => process.exit(dbCommand.dispatch(args)),
  migrate: (args) => process.exit(migrateCommand.dispatch(args)),
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
  handler(rest);
}

// exports kept for unit tests (Phase 1+)
module.exports = { USAGE, SUBCOMMANDS, readJsonIfExists, VERSION };

if (require.main === module) {
  main(process.argv);
}
