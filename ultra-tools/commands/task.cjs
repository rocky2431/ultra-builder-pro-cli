'use strict';

// CLI dispatcher for the only task-family maintenance command. Runtime task
// reads and writes intentionally remain MCP-only so a Host cannot silently
// bypass the state-authority and projection-conflict gates.

const { initProject, InitProjectError } = require('../../mcp-server/lib/init-project.cjs');

const USAGE = `ultra-tools task <verb> [flags]

VERBS:
  init-project  Initialize or adopt a project with authoritative Ultra state

FLAGS (init-project):
  --target-dir <path>       target project root (default: cwd)
  --project-name <name>     project name (required)
  --project-type <type>     web | api | cli | fullstack | other
  --stack <stack>           tech stack descriptor (comma-separated ok)
  --mode <mode>             auto | greenfield | brownfield (default: auto)
  --git-mode <mode>         auto | initialize | skip (default: auto)
  --scope <path>            baseline scope; repeat for multiple paths (default: .)
  --resume                  preserve existing .ultra/ and install only missing assets
  --overwrite               replace existing .ultra/ (backup created)
  --source-template <path>  override bundled template source
  -h, --help                show this message
`;

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

function parseInitFlags(args) {
  const flags = { _: [], scope: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--target-dir':       flags.target_dir       = args[++i]; break;
      case '--project-name':     flags.project_name     = args[++i]; break;
      case '--project-type':     flags.project_type     = args[++i]; break;
      case '--stack':            flags.stack            = args[++i]; break;
      case '--mode':             flags.mode             = args[++i]; break;
      case '--git-mode':         flags.git_mode         = args[++i]; break;
      case '--scope':            flags.scope.push(args[++i]); break;
      case '--resume':           flags.resume            = true; break;
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
    mode: flags.mode || 'auto',
    git_mode: flags.git_mode || 'auto',
    scope: flags.scope.length > 0 ? flags.scope : undefined,
    resume: !!flags.resume,
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
      emit({ ok: false, error: { code: 'UNKNOWN_VERB', message: `unknown task verb '${verb}'; only init-project is supported by the maintenance CLI` } });
      return 1;
  }
}

module.exports = { dispatch, dispatchInitProject, USAGE };
