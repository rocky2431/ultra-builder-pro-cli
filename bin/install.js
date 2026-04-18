#!/usr/bin/env node

/**
 * ultra-builder-pro-cli — multi-runtime installer.
 *
 * Distributes Ultra Builder Pro assets — commands, agents, skills, hooks,
 * MCP server — to Claude Code, OpenCode, Codex CLI, and Gemini CLI via
 * runtime-specific adapters under adapters/. Install is idempotent and
 * uses atomic writes; uninstall reverses via sentinel/manifest blocks.
 *
 * Usage:
 *   npx ultra-builder-pro-cli [options]
 *
 *   --claude / --opencode / --codex / --gemini   select runtime(s)
 *   --all                                         install to all supported runtimes
 *   -g, --global                                  install to runtime's global config dir
 *   -l, --local                                   install into current working directory
 *   -u, --uninstall                               remove installed assets
 *   -c, --config-dir <path>                       override config directory
 *       --skip-rtk                                do not detect / install RTK hook
 *   -h, --help                                    show help
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const pkg = require('../package.json');
const { validateConfigDir } = require('../adapters/_shared/validate.cjs');

const SUPPORTED_RUNTIMES = ['claude', 'opencode', 'codex', 'gemini'];

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
    `  ${paint('dim', 'Multi-runtime installer for Claude Code, OpenCode, Codex, Gemini')}`,
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
    ${paint('cyan', '--gemini')}           Gemini CLI (Google)
    ${paint('cyan', '--all')}              all supported runtimes

  ${paint('yellow', 'Scope:')}
    ${paint('cyan', '-g, --global')}       install to runtime's global config directory
    ${paint('cyan', '-l, --local')}        install to current working directory

  ${paint('yellow', 'Other:')}
    ${paint('cyan', '-u, --uninstall')}    remove installed assets
    ${paint('cyan', '-c, --config-dir')}   override runtime's config directory (string path)
    ${paint('cyan', '--skip-rtk')}        skip RTK hook registration (RTK is a soft dependency)
    ${paint('cyan', '-h, --help')}         show this help
    ${paint('cyan', '-v, --version')}      show CLI version

  ${paint('yellow', 'Examples:')}
    ${paint('dim', '# Install to Claude Code globally')}
    npx ultra-builder-pro-cli --claude --global

    ${paint('dim', '# Install to all 4 runtimes locally in this repo')}
    npx ultra-builder-pro-cli --all --local

    ${paint('dim', '# Uninstall from OpenCode')}
    npx ultra-builder-pro-cli --opencode --global --uninstall
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const runtimes = new Set();
  const flags = {
    global: false,
    local: false,
    uninstall: false,
    help: false,
    version: false,
    configDir: null,
    skipRtk: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--claude': runtimes.add('claude'); break;
      case '--opencode': runtimes.add('opencode'); break;
      case '--codex': runtimes.add('codex'); break;
      case '--gemini': runtimes.add('gemini'); break;
      case '--all':
        SUPPORTED_RUNTIMES.forEach(r => runtimes.add(r));
        break;
      case '-g': case '--global': flags.global = true; break;
      case '-l': case '--local': flags.local = true; break;
      case '-u': case '--uninstall': flags.uninstall = true; break;
      case '-h': case '--help': flags.help = true; break;
      case '-v': case '--version': flags.version = true; break;
      case '--skip-rtk': flags.skipRtk = true; break;
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

  printBanner();

  if (flags.help) {
    printHelp();
    return;
  }

  if (runtimes.length === 0) {
    bail('no runtime selected; use --claude / --opencode / --codex / --gemini / --all');
  }

  const scope = resolveScope(flags);
  const repoRoot = path.resolve(__dirname, '..');
  const configDir = flags.configDir ? expandTilde(flags.configDir) : null;

  const mode = flags.uninstall ? 'uninstall' : 'install';
  console.log(`  ${paint('bold', 'Mode:')}     ${mode}`);
  console.log(`  ${paint('bold', 'Scope:')}    ${scope}`);
  console.log(`  ${paint('bold', 'Runtimes:')} ${runtimes.join(', ')}`);
  if (configDir) console.log(`  ${paint('bold', 'ConfigDir:')} ${configDir}`);
  console.log();

  const ctx = { repoRoot, scope, configDir, homeDir: os.homedir() };

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

  // Phase 6.1 — RTK hook (soft dependency; install continues on absence).
  if (mode === 'install') {
    const rtk = require('../adapters/_shared/rtk-detect.cjs');
    const result = rtk.installHook({ skip: flags.skipRtk, scope });
    if (result.skipped) {
      console.log(`  ${paint('dim', '⤼ rtk skipped (--skip-rtk)')}`);
    } else if (result.available && result.initialized) {
      console.log(`  ${paint('green', '✓')} rtk hook registered (${result.version})`);
    } else if (result.available && !result.initialized) {
      console.log(`  ${paint('yellow', '!')} rtk present but init failed: ${result.init_error}`);
    } else {
      console.log(`  ${paint('dim', '⤼ ' + result.hint.replace(/\n/g, '\n    '))}`);
    }
  }

  console.log(`  ${paint('green', 'Done.')}`);
}

main().catch(err => {
  console.error(paint('red', '  Fatal: ') + err.message);
  if (process.env.UBP_DEBUG) console.error(err.stack);
  process.exit(1);
});
