'use strict';

/**
 * Codex CLI adapter — Phase 4.4 installer + partial spike.
 *
 * Target config dirs:
 *   global: $CODEX_HOME → ~/.codex
 *   local:  <cwd>/.codex
 *
 * What install does:
 *   - copy skills/**   → <target>/skills/  (open-agent skills standard location)
 *   - copy commands/*.md → <target>/prompts/*.md (prompt files; Codex loads
 *     these as slash-like commands pending AGENTS.md inline alternative)
 *   - copy hooks/*.py  → <target>/hooks/  (wire format TBD — spike R11)
 *   - append to <target>/config.toml:
 *       [mcp_servers.ultra-builder-pro]
 *       command = "node"
 *       args = ["<server.cjs>"]
 *   - block is delimited by marker comments so uninstall can remove it cleanly
 *
 * Scope boundaries (deliberately out of Phase 4.4; tracked in hooks/adapters/codex.py):
 *   - hooks.json runtime wiring awaits the upstream spec; Phase 4.4 spike R11 captures it
 *   - AGENTS.md inline command mode is an alternative to prompts/*.md; current installer
 *     writes prompts/*.md — the AGENTS.md variant lands once the spike confirms format
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  copyTree,
  writeAtomic,
  ensureDir,
  removeTree,
  markManaged,
  isManaged,
  copyFlatByExt,
} = require('./_shared/file-ops.cjs');

const MCP_SERVER_NAME = 'ultra-builder-pro';
const MARKER_BEGIN = '# >>> ultra-builder-pro managed block — do not edit by hand';
const MARKER_END = '# <<< ultra-builder-pro managed block';
const SOURCE_TAG = 'ubp';

function resolveTarget(ctx) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    return process.env.CODEX_HOME || path.join(ctx.homeDir || os.homedir(), '.codex');
  }
  return path.join(ctx.cwd || process.cwd(), '.codex');
}

function resolveRepoRoot(ctx) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

// Codex spawns MCP servers via `spawn(argv)` per the MCP spec — argv is
// passed directly to execve, there is no shell interpolation layer. The
// `_source` tag in our env block is data, not a command, so it cannot be
// re-parsed as a shell fragment. (P2 #5 — no code change needed; left as
// a tripwire comment in case a future contributor worries.)
function tomlEscape(str) {
  // TOML basic-string escape sequences (§https://toml.io/en/v1.0.0#string).
  // Missing escapes silently break the TOML parse when a path contains
  // newlines or control characters — P2 #4 from Phase 4 code review.
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\x08/g, '\\b')   // eslint-disable-line no-control-regex
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f')
    .replace(/\r/g, '\\r')
    // Any remaining C0 control char (0x00–0x1F) rendered as \uXXXX per TOML.
    .replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function buildMcpBlock(repoRoot, target) {
  const serverPath = path.join(repoRoot, 'mcp-server', 'server.cjs');
  const lines = [
    MARKER_BEGIN,
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = "${tomlEscape(process.execPath)}"`,
    `args = ["${tomlEscape(serverPath)}"]`,
    '[mcp_servers.' + MCP_SERVER_NAME + '.env]',
    `UBP_DB_PATH = "${tomlEscape(path.join(target, 'state.db'))}"`,
    `UBP_ROOT_DIR = "${tomlEscape(target)}"`,
    // `_source` moved out of env — for Codex the MARKER_BEGIN / MARKER_END
    // fence is itself the identification predicate; no sibling field needed
    // because Codex config.toml has no nested object shape like JSON runtimes.
    MARKER_END,
    '',
  ];
  return lines.join('\n');
}

function stripManagedBlock(text) {
  const begin = text.indexOf(MARKER_BEGIN);
  if (begin === -1) return text;
  const end = text.indexOf(MARKER_END, begin);
  if (end === -1) return text; // malformed; leave alone
  const endLine = text.indexOf('\n', end);
  const after = endLine === -1 ? text.length : endLine + 1;
  const leading = text.slice(0, begin).replace(/\n+$/, '\n');
  return leading + text.slice(after);
}

function hasManagedBlock(text) {
  return text.includes(MARKER_BEGIN);
}

function install(ctx) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  ensureDir(target);

  const report = { target, copied: {}, config: { updated: false } };

  const skillsSrc = path.join(repoRoot, 'skills');
  if (fs.existsSync(skillsSrc)) {
    report.copied.skills = copyTree(skillsSrc, path.join(target, 'skills'));
    markManaged(path.join(target, 'skills'), { adapter: 'codex' });
  }

  const commandsSrc = path.join(repoRoot, 'commands');
  if (fs.existsSync(commandsSrc)) {
    report.copied.prompts = copyTree(commandsSrc, path.join(target, 'prompts'));
    markManaged(path.join(target, 'prompts'), { adapter: 'codex' });
  }

  const hookFiles = copyFlatByExt(path.join(repoRoot, 'hooks'), path.join(target, 'hooks'), '.py');
  if (hookFiles.length > 0) {
    report.copied.hooks = hookFiles;
    markManaged(path.join(target, 'hooks'), { adapter: 'codex' });
  }

  const configFile = path.join(target, 'config.toml');
  const existing = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  const withoutOld = stripManagedBlock(existing);
  // Normalize trailing whitespace so a second install produces byte-equal output (P1 #2).
  const normalizedBase = withoutOld.length > 0 ? withoutOld.replace(/\n*$/, '\n') : '';
  const managedBlock = buildMcpBlock(repoRoot, target);
  const next = normalizedBase + managedBlock;
  writeAtomic(configFile, next);
  report.config.updated = true;
  return report;
}

function uninstall(ctx) {
  const target = resolveTarget(ctx);
  const report = { target, removed: {}, config: { updated: false } };

  const configFile = path.join(target, 'config.toml');
  if (fs.existsSync(configFile)) {
    const existing = fs.readFileSync(configFile, 'utf8');
    if (hasManagedBlock(existing)) {
      const stripped = stripManagedBlock(existing);
      if (stripped.trim().length === 0) {
        fs.unlinkSync(configFile);
      } else {
        writeAtomic(configFile, stripped);
      }
      report.config.updated = true;
    }
  }

  for (const sub of ['skills', 'prompts', 'hooks']) {
    const dir = path.join(target, sub);
    if (fs.existsSync(dir) && isManaged(dir)) {
      removeTree(dir);
      report.removed[sub] = true;
    }
  }
  return report;
}

module.exports = {
  name: 'codex',
  MCP_SERVER_NAME,
  MARKER_BEGIN,
  MARKER_END,
  SOURCE_TAG,
  resolveTarget,
  install,
  uninstall,
  // Test-only surface. Other adapters don't export internals because their
  // install shape is JSON-diff-testable end-to-end; codex's TOML block uses
  // marker-based string surgery so unit tests need the internal helpers.
  _internal: { stripManagedBlock, hasManagedBlock, buildMcpBlock },
};
