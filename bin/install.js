#!/usr/bin/env node

/**
 * ultra-builder-pro-cli — multi-runtime installer.
 *
 * Distributes Ultra Builder Pro assets — commands, agents, skills, hooks,
 * MCP server — to Claude Code, OpenCode, and Codex CLI via
 * runtime-specific adapters under adapters/. Install is idempotent and
 * uses atomic writes; uninstall reverses via sentinel/manifest blocks.
 *
 * Usage:
 *   npx ultra-builder-pro-cli [options]
 *
 *   --claude / --opencode / --codex              select runtime(s)
 *   --all                                         install to all supported runtimes
 *   -g, --global                                  install to runtime's global config dir
 *   -l, --local                                   install into current working directory
 *   -u, --uninstall                               remove installed assets
 *   -d, --doctor                                  inspect installation provenance without mutation
 *   --json                                        emit machine-readable doctor output
 *   -c, --config-dir <path>                       override config directory
 *   -h, --help                                    show help
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const pkg = require('../package.json');
const { validateConfigDir } = require('../adapters/_shared/validate.cjs');
const { SUPPORTED_RUNTIMES } = require('../adapters/_shared/runtime-assets.cjs');

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function paint(color, text) {
  if (!process.stdout.isTTY) return text;
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function printBanner() {
  const banner = [
    '',
    paint('cyan', '  ██╗   ██╗██████╗ ██████╗     ██████╗██╗     ██╗'),
    paint('cyan', '  ██║   ██║██╔══██╗██╔══██╗   ██╔════╝██║     ██║'),
    paint('cyan', '  ██║   ██║██████╔╝██████╔╝   ██║     ██║     ██║'),
    paint('cyan', '  ██║   ██║██╔══██╗██╔═══╝    ██║     ██║     ██║'),
    paint('cyan', '  ╚██████╔╝██████╔╝██║        ╚██████╗███████╗██║'),
    paint('cyan', '   ╚═════╝ ╚═════╝ ╚═╝         ╚═════╝╚══════╝╚═╝'),
    '',
    `  ${paint('bold', 'Ultra Builder Pro CLI')} ${paint('dim', 'v' + pkg.version)}`,
    `  ${paint('dim', 'Multi-runtime installer for Claude Code, OpenCode, and Codex')}`,
    '',
  ];
  console.log(banner.join('\n'));
}

function printHelp() {
  console.log(`  ${paint('yellow', 'Usage:')} npx ultra-builder-pro-cli [options]

  ${paint('yellow', 'Runtime selection (pick ≥1, or --all):')}
    ${paint('cyan', '--claude')}           Claude Code
    ${paint('cyan', '--opencode')}         OpenCode
    ${paint('cyan', '--codex')}            Codex CLI (OpenAI)
    ${paint('cyan', '--all')}              all supported runtimes

  ${paint('yellow', 'Scope:')}
    ${paint('cyan', '-g, --global')}       install to runtime's global config directory
    ${paint('cyan', '-l, --local')}        install to current working directory

  ${paint('yellow', 'Other:')}
    ${paint('cyan', '-u, --uninstall')}    remove installed assets
    ${paint('cyan', '-d, --doctor')}       verify installed version, provenance, managed assets, and live entry points
    ${paint('cyan', '--json')}             emit machine-readable doctor output (doctor only)
    ${paint('cyan', '-c, --config-dir')}   override runtime's config directory (string path)
    ${paint('cyan', '-h, --help')}         show this help
    ${paint('cyan', '-v, --version')}      show CLI version

  ${paint('yellow', 'Examples:')}
    ${paint('dim', '# Install to Claude Code globally')}
    npx ultra-builder-pro-cli --claude --global

    ${paint('dim', '# Install to all supported runtimes locally in this repo')}
    npx ultra-builder-pro-cli --all --local

    ${paint('dim', '# Uninstall from OpenCode')}
    npx ultra-builder-pro-cli --opencode --global --uninstall

    ${paint('dim', '# Verify all host installations without changing them')}
    npx ultra-builder-pro-cli --all --global --doctor
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const runtimes = new Set();
  const flags = {
    global: false,
    local: false,
    uninstall: false,
    doctor: false,
    json: false,
    help: false,
    version: false,
    configDir: null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--claude': runtimes.add('claude'); break;
      case '--opencode': runtimes.add('opencode'); break;
      case '--codex': runtimes.add('codex'); break;
      case '--all':
        SUPPORTED_RUNTIMES.forEach(r => runtimes.add(r));
        break;
      case '-g': case '--global': flags.global = true; break;
      case '-l': case '--local': flags.local = true; break;
      case '-u': case '--uninstall': flags.uninstall = true; break;
      case '-d': case '--doctor': flags.doctor = true; break;
      case '--json': flags.json = true; break;
      case '-h': case '--help': flags.help = true; break;
      case '-v': case '--version': flags.version = true; break;
      case '-c': case '--config-dir':
        flags.configDir = args[++i];
        if (!flags.configDir || flags.configDir.startsWith('-')) {
          bail(`--config-dir requires a path argument`);
        }
        {
          const verdict = validateConfigDir(flags.configDir);
          if (!verdict.ok) bail(verdict.error);
        }
        break;
      default:
        if (a.startsWith('--config-dir=')) {
          flags.configDir = a.split('=')[1];
          const verdict = validateConfigDir(flags.configDir);
          if (!verdict.ok) bail(verdict.error);
        } else if (a.startsWith('-')) {
          bail(`unknown flag: ${a}`);
        } else {
          bail(`unexpected positional argument: ${a}`);
        }
    }
  }

  return { runtimes: Array.from(runtimes), flags };
}

function bail(msg) {
  console.error(`  ${paint('red', '✗')} ${msg}`);
  console.error(`  ${paint('dim', 'Run with --help for usage.')}`);
  process.exit(1);
}

function expandTilde(p) {
  if (p && p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function loadAdapter(runtime) {
  const adapterPath = path.join(__dirname, '..', 'adapters', `${runtime}.js`);
  if (!fs.existsSync(adapterPath)) {
    bail(`adapter not found for runtime: ${runtime}`);
  }
  return require(adapterPath);
}

function resolveScope(flags) {
  if (flags.global && flags.local) bail('cannot use --global and --local together');
  if (!flags.global && !flags.local) return 'local';
  return flags.global ? 'global' : 'local';
}

async function main() {
  const { runtimes, flags } = parseArgs(process.argv);

  if (flags.version) {
    console.log(`ultra-builder-pro-cli v${pkg.version}`);
    return;
  }

  if (flags.help) {
    printBanner();
    printHelp();
    return;
  }

  if (flags.doctor && flags.uninstall) bail('cannot combine --doctor and --uninstall');
  if (flags.json && !flags.doctor) bail('--json is available only with --doctor');

  if (runtimes.length === 0) {
    bail('no runtime selected; use --claude / --opencode / --codex / --all');
  }

  const scope = resolveScope(flags);
  const repoRoot = path.resolve(__dirname, '..');
  const configDir = flags.configDir ? expandTilde(flags.configDir) : null;

  if (!flags.json) printBanner();

  const mode = flags.doctor ? 'doctor' : flags.uninstall ? 'uninstall' : 'install';
  if (!flags.json) {
    console.log(`  ${paint('bold', 'Mode:')}     ${mode}`);
    console.log(`  ${paint('bold', 'Scope:')}    ${scope}`);
    console.log(`  ${paint('bold', 'Runtimes:')} ${runtimes.join(', ')}`);
    if (configDir) console.log(`  ${paint('bold', 'ConfigDir:')} ${configDir}`);
    console.log();
  }

  const ctx = { repoRoot, scope, configDir, homeDir: os.homedir() };

  if (flags.doctor) {
    const reports = [];
    for (const runtime of runtimes) {
      const adapter = loadAdapter(runtime);
      try {
        if (typeof adapter.doctor !== 'function') throw new Error('adapter does not expose doctor()');
        reports.push(await adapter.doctor(ctx));
      } catch (error) {
        reports.push({
          adapter: runtime,
          status: 'degraded',
          manifest_path: null,
          checks: {},
          issues: [{ code: 'DOCTOR_FAILED', message: error.message }],
        });
      }
    }
    const output = {
      status: reports.every((report) => report.status === 'healthy') ? 'healthy' : 'degraded',
      reports,
    };
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
      for (const report of reports) {
        const color = report.status === 'healthy' ? 'green' : 'red';
        console.log(`  ${paint(color, report.status === 'healthy' ? '✓' : '✗')} ${report.adapter}: ${report.status}`);
        for (const finding of report.issues || []) {
          const location = finding.path ? ` (${finding.path})` : '';
          console.log(`      ${finding.code}${location}`);
        }
      }
      console.log();
    }
    if (output.status !== 'healthy') process.exitCode = 2;
    return;
  }

  let failed = 0;
  for (const runtime of runtimes) {
    const adapter = loadAdapter(runtime);
    try {
      console.log(`  ${paint('cyan', '▸')} ${runtime} — starting ${mode}...`);
      await adapter[mode](ctx);
      console.log(`  ${paint('green', '✓')} ${runtime} — ${mode} complete`);
    } catch (err) {
      failed++;
      console.error(`  ${paint('red', '✗')} ${runtime} — ${mode} failed: ${err.message}`);
      if (process.env.UBP_DEBUG) console.error(err.stack);
    }
  }

  console.log();
  if (failed > 0) {
    console.error(`  ${paint('red', `${failed} runtime(s) failed`)}`);
    process.exit(1);
  }

  console.log(`  ${paint('green', 'Done.')}`);
}

main().catch(err => {
  console.error(paint('red', '  Fatal: ') + err.message);
  if (process.env.UBP_DEBUG) console.error(err.stack);
  process.exit(1);
});
