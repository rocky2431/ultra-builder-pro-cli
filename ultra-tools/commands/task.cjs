'use strict';

// CLI dispatcher for the `task` family. Phase 3.1 implements `init-project`
// as the fallback for /ultra-init when MCP is unreachable. Additional verbs
// (create / update / list / ...) will be wired in Phase 3.3+ as each command
// migrates — they share the same stdout envelope contract declared in
// spec/cli-protocol.md §2.

const { initProject, InitProjectError } = require('../../mcp-server/lib/init-project.cjs');

const USAGE = `ultra-tools task <verb> [flags]

VERBS:
  init-project  Bootstrap a fresh .ultra/ skeleton (Phase 3.1)

FLAGS (init-project):
  --target-dir <path>       target project root (default: cwd)
  --project-name <name>     project name (required)
  --project-type <type>     web | api | cli | fullstack | other
  --stack <stack>           tech stack descriptor (comma-separated ok)
  --overwrite               replace existing .ultra/ (backup created)
  --source-template <path>  override bundled template source
  -h, --help                show this message
`;

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function parseInitFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--target-dir':       flags.target_dir       = args[++i]; break;
      case '--project-name':     flags.project_name     = args[++i]; break;
      case '--project-type':     flags.project_type     = args[++i]; break;
      case '--stack':            flags.stack            = args[++i]; break;
      case '--source-template':  flags.source_template  = args[++i]; break;
      case '--overwrite':        flags.overwrite        = true; break;
      case '--no-overwrite':     flags.overwrite        = false; break;
      case '-h': case '--help':  flags.help = true; break;
      default:                   flags._.push(a);
    }
  }
  return flags;
}

function dispatchInitProject(rawArgs) {
  const flags = parseInitFlags(rawArgs);
  if (flags.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!flags.project_name) {
    emit({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'missing required flag: --project-name' } });
    return 1;
  }
  const input = {
    target_dir: flags.target_dir || process.cwd(),
    project_name: flags.project_name,
    project_type: flags.project_type,
    stack: flags.stack,
    overwrite: !!flags.overwrite,
    source_template: flags.source_template,
  };
  try {
    const data = initProject(input);
    emit({ ok: true, data });
    return 0;
  } catch (err) {
    if (err instanceof InitProjectError) {
      emit({ ok: false, error: { code: err.code, message: err.message, retriable: !!err.retriable } });
      return err.code === 'VALIDATION_ERROR' ? 1 : 2;
    }
    emit({ ok: false, error: { code: 'UNKNOWN', message: err.message, retriable: false } });
    return 2;
  }
}

function dispatch(args) {
  const [verb, ...rest] = args;
  if (!verb || verb === '-h' || verb === '--help') {
    process.stdout.write(USAGE);
    return 0;
  }
  switch (verb) {
    case 'init-project': return dispatchInitProject(rest);
    default:
      emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown task verb '${verb}'; see spec/cli-protocol.md for supported task CLI verbs` } });
      return 1;
  }
}

module.exports = { dispatch, dispatchInitProject, USAGE };
