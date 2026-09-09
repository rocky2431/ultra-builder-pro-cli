'use strict';

/**
 * `ubp run "<goal>"` — the unified Ultra entry.
 *
 * The owner supplies a natural-language goal and, optionally, a host. This command
 * resolves the managed plugin that host would load, renders the packaged entry
 * instructions for it, and starts the host's own interactive session with those
 * instructions plus the goal verbatim. Routing, questions, and execution stay with the
 * host model and the product's Skills; this file owns no workflow state and makes no
 * completion claim of its own.
 */

const fs = require('node:fs');
const { constants } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pkg = require('../package.json');
const claudeAdapter = require('../adapters/claude.js');
const { managedMetadata } = require('../adapters/_shared/file-ops.cjs');
const { validateConfigDir } = require('../adapters/_shared/validate.cjs');

const ENTRY_TEMPLATE = path.join(__dirname, 'unified-entry.md');
const PLACEHOLDERS = Object.freeze(['plugin_version', 'plugin_root', 'route_contract']);

/**
 * Interactive host surfaces this command can actually start. Each entry is limited to
 * what the installed host CLI documents; a host is absent here until its interactive
 * launch is substantiated, and absence is reported rather than approximated.
 */
const HOSTS = Object.freeze({
  claude: Object.freeze({
    binary: 'claude',
    adapter: claudeAdapter,
    // `claude [options] [prompt]` starts an interactive session with that first prompt;
    // `--plugin-dir` loads a plugin directory for the session only.
    argv: ({ pluginRoot, prompt, hostArgs }) => [
      '--plugin-dir', pluginRoot,
      ...hostArgs,
      '--', // Native variadic options must not consume the owner's prompt.
      prompt,
    ],
    resume: 'ubp run --continue "<follow-up>" (keep the same plugin and working directory)',
  }),
});

class RunError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'RunError';
    this.hint = hint || null;
  }
}

function usage() {
  return `  Usage: ubp run [options] "<goal in your own words>"

  Starts Ultra in a native host session with your goal. The host model picks the
  route; you never choose an Ultra mode or Skill.

  Options:
    --host <name>        interactive host to start (default: claude)
    -c, --config-dir <dir>
                         find the managed plugin under this config directory
    --plugin-dir <dir>   use this managed plugin directory
    --continue          continue the last native session in the working directory
    --resume <id>       resume a named native session, loading the same plugin
    --cwd <dir>          working directory for the session (default: current)
    --host-arg <arg>     extra native host argument (repeatable)
    --dry-run            print the exact command and prompt without starting it
    --json               machine-readable output (dry run only)
    -h, --help           show this help
    --                   everything after this is part of the goal

  Examples:
    ubp run "fix the CSV export mojibake in the report writer"
    ubp run --config-dir ./.ubp-isolated "build me something to tidy my notes"
    echo "$GOAL" | ubp run -
    ubp run --dry-run --json "..." | jq .

  Stop and exit stay native. Continue through this command with --continue or
  --resume <id>, keeping the same --config-dir / --plugin-dir and --cwd options.
`;
}

function parseRunArgs(input) {
  const args = input.slice();
  const options = {
    host: 'claude',
    configDir: null,
    pluginDir: null,
    continue: false,
    resume: null,
    cwd: null,
    hostArgs: [],
    dryRun: false,
    json: false,
    help: false,
    goalFromStdin: false,
  };
  const goalWords = [];
  let goalOnly = false;

  const requireValue = (flag, value) => {
    if (value === undefined || value === null) {
      throw new RunError(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (goalOnly) { goalWords.push(arg); continue; }
    switch (arg) {
      case '--': goalOnly = true; break;
      case '-h': case '--help': options.help = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--json': options.json = true; break;
      case '--continue': options.continue = true; break;
      case '--resume': options.resume = requireValue('--resume', args[++i]); break;
      case '--host': options.host = requireValue('--host', args[++i]); break;
      case '--cwd': options.cwd = requireValue('--cwd', args[++i]); break;
      case '--plugin-dir': options.pluginDir = requireValue('--plugin-dir', args[++i]); break;
      case '-c': case '--config-dir': {
        options.configDir = requireValue('--config-dir', args[++i]);
        const verdict = validateConfigDir(options.configDir);
        if (!verdict.ok) throw new RunError(verdict.error);
        break;
      }
      case '--host-arg':
        options.hostArgs.push(requireValue('--host-arg', args[++i]));
        break;
      case '-':
        options.goalFromStdin = true;
        break;
      default:
        if (arg.startsWith('--') && arg.includes('=')) {
          const [flag, ...rest] = arg.split('=');
          args.splice(i, 1, flag, rest.join('='));
          i -= 1;
          break;
        }
        if (arg.startsWith('-') && arg !== '-') {
          throw new RunError(`unknown option for ubp run: ${arg}`, 'ubp run --help');
        }
        goalWords.push(arg);
    }
  }

  if (options.json && !options.dryRun) {
    throw new RunError('--json is available only with --dry-run');
  }
  if (options.pluginDir && options.configDir) {
    throw new RunError('use either --plugin-dir or --config-dir, not both');
  }
  if (options.continue && options.resume !== null) {
    throw new RunError('use either --continue or --resume, not both');
  }
  if (options.continue) options.hostArgs.push('--continue');
  if (options.resume !== null) options.hostArgs.push('--resume', options.resume);
  options.goal = goalWords.join(' ');
  return options;
}

function readStdin(stdin) {
  if (typeof stdin === 'string') return stdin;
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function resolveGoal(options, io) {
  const wantsStdin = options.goalFromStdin || (!options.goal && io.isTTY !== true);
  const raw = options.goal || (wantsStdin ? readStdin(io.stdin) : '');
  // Only the trailing newline a shell or pipe adds is removed; the owner's text,
  // including its internal newlines and spacing, is passed through unchanged.
  const goal = raw.replace(/\r?\n$/u, '');
  if (!goal.trim()) {
    throw new RunError(
      'a goal is required',
      'ubp run "what you want built or fixed, in your own words"',
    );
  }
  return goal;
}

function resolvePlugin(options) {
  const host = HOSTS[options.host];
  const explicit = options.pluginDir
    ? path.resolve(options.pluginDir)
    : host.adapter.resolvePluginRoot({
      configDir: options.configDir ? path.resolve(options.configDir) : undefined,
      scope: 'global',
    });
  const manifestFile = path.join(explicit, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestFile)) {
    throw new RunError(
      `no managed Ultra plugin at ${explicit}`,
      `ubp --${options.host} --global   (or pass --config-dir / --plugin-dir)`,
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (error) {
    throw new RunError(`unreadable plugin manifest at ${manifestFile}: ${error.message}`);
  }
  const managed = managedMetadata(explicit);
  if (manifest.name !== host.adapter.PLUGIN_NAME) {
    throw new RunError(
      `${manifestFile} declares plugin "${manifest.name}", not ${host.adapter.PLUGIN_NAME}`,
    );
  }
  return {
    root: explicit,
    version: manifest.version || 'unknown',
    managedBy: managed?.adapter || null,
    routeContract: path.join(
      explicit, 'skills', 'ultra-status', 'references', 'route-contract.md',
    ),
  };
}

function renderEntryInstructions(plugin, templateFile = ENTRY_TEMPLATE) {
  let template;
  try {
    template = fs.readFileSync(templateFile, 'utf8');
  } catch (error) {
    throw new RunError(`missing packaged entry instructions: ${error.message}`);
  }
  const values = {
    plugin_version: plugin.version,
    plugin_root: plugin.root,
    route_contract: plugin.routeContract,
  };
  let rendered = template.replace(/^<!--[\s\S]*?-->\s*/u, '');
  for (const key of PLACEHOLDERS) {
    if (!rendered.includes(`{{${key}}}`)) {
      throw new RunError(`packaged entry instructions lost the {{${key}}} anchor`);
    }
    rendered = rendered.split(`{{${key}}}`).join(values[key]);
  }
  const leftover = rendered.match(/\{\{[a-z_]+\}\}/u);
  if (leftover) {
    throw new RunError(`packaged entry instructions kept an unrendered ${leftover[0]}`);
  }
  return rendered.trim();
}

function buildLaunch(options, io = {}) {
  const host = HOSTS[options.host];
  if (!host) {
    throw new RunError(
      `ubp run cannot start "${options.host}" yet`,
      `supported now: ${Object.keys(HOSTS).join(', ')}; install any host with ubp --<host>`,
    );
  }
  const goal = resolveGoal(options, io);
  // The plugin is always resolved and verified: the entry instructions name its real
  // path and version, and refusing beats starting a session that has no Ultra in it.
  const plugin = resolvePlugin(options);
  const prompt = `${renderEntryInstructions(plugin)}\n\n${goal}`;
  return {
    host: options.host,
    command: host.binary,
    args: host.argv({
      pluginRoot: plugin.root,
      prompt,
      hostArgs: options.hostArgs,
    }),
    cwd: options.cwd ? path.resolve(options.cwd) : process.cwd(),
    plugin,
    goal,
    prompt,
    resume: host.resume,
  };
}

function describe(launch) {
  const quoted = launch.args
    .map((arg) => (/^[\w./:@=-]+$/u.test(arg) ? arg : `'${arg.replace(/'/gu, "'\\''")}'`))
    .join(' ');
  return [
    `  Host:     ${launch.host} (${launch.command})`,
    `  Plugin:   ${launch.plugin.root} — Ultra Builder Pro ${launch.plugin.version}`,
    `  Cwd:      ${launch.cwd}`,
    `  Resume:   ${launch.resume}`,
    '',
    `  ${launch.command} ${quoted}`,
    '',
    '  Prompt:',
    launch.prompt.split('\n').map((line) => `    ${line}`).join('\n'),
    '',
  ].join('\n');
}

function handle(argv, io = {}) {
  const options = parseRunArgs(argv.slice(1));
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const launch = buildLaunch(options, io);
  if (options.dryRun) {
    process.stdout.write(options.json
      ? `${JSON.stringify({
        host: launch.host,
        command: launch.command,
        args: launch.args,
        cwd: launch.cwd,
        plugin: { root: launch.plugin.root, version: launch.plugin.version },
        goal: launch.goal,
        prompt: launch.prompt,
        resume: launch.resume,
        version: pkg.version,
      }, null, 2)}\n`
      : describe(launch));
    return 0;
  }
  const result = spawnSync(launch.command, launch.args, {
    cwd: launch.cwd,
    stdio: 'inherit',
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new RunError(
        `${launch.command} is not on PATH`,
        `install the ${launch.host} CLI, or pass --host with a supported host`,
      );
    }
    throw new RunError(`${launch.command} could not start: ${result.error.message}`);
  }
  if (result.signal) {
    process.stderr.write(`  ${launch.command} ended on signal ${result.signal}\n`);
    return 128 + (constants.signals[result.signal] || 1);
  }
  return result.status === null ? 1 : result.status;
}

module.exports = {
  ENTRY_TEMPLATE,
  HOSTS,
  RunError,
  buildLaunch,
  describe,
  handle,
  parseRunArgs,
  renderEntryInstructions,
  resolveGoal,
  resolvePlugin,
  usage,
};
