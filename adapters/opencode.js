'use strict';

/** Build a native OpenCode Ultra Builder Pro plugin. */

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const {
  copyTree,
  ensureDir,
  isManaged,
  markManaged,
  removeTree,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const {
  applyNativeDoctor,
  buildMcpRuntime,
  mcpCommand,
} = require('./_shared/codex-assets.cjs');
const { adaptInteractionGuidance } = require('./_shared/interaction-contract.cjs');
const provenance = require('./_shared/provenance.cjs');
const {
  CORE_PUBLIC_SKILLS,
  skillsForRuntime,
} = require('./_shared/runtime-assets.cjs');
const {
  parse: parseFm,
  serialize: serializeFm,
  lowercaseKeys,
} = require('./_shared/frontmatter.cjs');
const {
  readJsonSafe,
} = require('./_shared/settings-merge.cjs');

const LEGACY_SENTINEL_KEY = '_ubp_manifest';
const MCP_SERVER_NAME = 'ultra-builder-pro';
const SOURCE_TAG = 'ubp';
const BUNDLE_DIR = '.ultra-builder-pro';
const MANAGED_TEXT_MARKER = '<!-- ultra-builder-pro:managed -->';
const PLUGIN_MARKER = '// Managed by Ultra Builder Pro.';
const PROVENANCE_FILE = 'provenance.json';
const COMMAND_NAMES = CORE_PUBLIC_SKILLS;

function discoverableSkillNames() {
  return skillsForRuntime('opencode')
    .filter((name) => !CORE_PUBLIC_SKILLS.includes(name));
}

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return ctx.configDir;
  if (ctx.scope === 'global') {
    if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
    if (process.env.OPENCODE_CONFIG) return path.dirname(process.env.OPENCODE_CONFIG);
    const xdg = process.env.XDG_CONFIG_HOME;
    return path.join(xdg || path.join(ctx.homeDir || os.homedir(), '.config'), 'opencode');
  }
  return path.join(ctx.cwd || process.cwd(), '.opencode');
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function lowercaseFrontmatterTransform(buf, relPath) {
  if (!relPath.endsWith('.md')) return buf;
  const text = buf.toString('utf8');
  const { fm, body } = parseFm(text);
  if (!fm) return buf;
  return Buffer.from(serializeFm(lowercaseKeys(fm), body), 'utf8');
}

function openCodeTextTransform(input, assetName = '') {
  let text = adaptInteractionGuidance(input, 'opencode');
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT/skills', '~/.config/opencode/skills');
  text = text.replaceAll('~/.claude/skills', '~/.config/opencode/skills');
  text = text.replaceAll('~/.claude/hooks', '~/.config/opencode/.ultra-builder-pro/hooks');
  text = text.replaceAll('~/.claude', '~/.config/opencode');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replace(/@skills\/([a-z0-9-]+)\/SKILL\.md/g, '~/.config/opencode/skills/$1/SKILL.md');

  if (assetName === 'codex-collab') {
    text = text.replaceAll('the current host', 'OpenCode');
    text = text.replaceAll('current host', 'OpenCode');
  }
  if (assetName === 'ultra-verify') {
    text = text.replaceAll('the current host', 'OpenCode');
    text = text.replaceAll('current host', 'OpenCode');
    text = text.replaceAll('claude-analysis.md', 'opencode-analysis.md');
    text = text.replaceAll('Claude Code', 'OpenCode');
    text = text.replaceAll('Claude', 'OpenCode');
  }
  if (assetName === 'cc-collab') {
    text = text.replaceAll('the current host', 'OpenCode');
    text = text.replaceAll('current host', 'OpenCode');
  }
  if (assetName === 'ultra-review') {
    text = text.replace(
      /(?:the current host's native|the host-native) bounded-worker\s+mechanism/g,
      'the OpenCode `task` tool using the installed bounded review agents',
    );
  }
  return text;
}

function openCodeCommandTransform(buf, relPath, commandName, workflowFile) {
  if (!relPath.endsWith('.md')) return buf;
  const { fm } = parseFm(buf.toString('utf8'));
  if (!fm) throw new Error(`missing frontmatter in OpenCode command: ${commandName}`);
  const nativeFm = {
    description: openCodeTextTransform(fm.description || `${commandName} workflow`, commandName)
      .replace(/\s+/g, ' ')
      .trim(),
  };
  const body = [
    `# Run ${commandName}`,
    '',
    `Read and follow \`${workflowFile}\` as the only workflow definition.`,
    'This explicit command is the activation boundary; do not substitute a model-discovered',
    'public skill or start another public Ultra workflow automatically.',
    '',
    'Arguments: $ARGUMENTS',
    '',
  ].join('\n');
  return Buffer.from(serializeFm(nativeFm, body), 'utf8');
}

function openCodeSkillAssetTransform(buf, relPath, skillName) {
  if (!relPath.endsWith('.md')) return buf;
  const text = buf.toString('utf8');
  const { fm, body } = parseFm(text);
  if (!fm) return Buffer.from(openCodeTextTransform(text, skillName), 'utf8');
  const nativeFm = {
    name: String(fm.name || skillName),
    description: openCodeTextTransform(fm.description || `${skillName} workflow`, skillName)
      .replace(/\s+/g, ' ')
      .trim(),
  };
  return Buffer.from(serializeFm(nativeFm, openCodeTextTransform(body, skillName)), 'utf8');
}

function withManagedMarker(buf) {
  const text = buf.toString('utf8');
  const { fm, body } = parseFm(text);
  if (!fm) return Buffer.from(`${MANAGED_TEXT_MARKER}\n${text}`, 'utf8');
  const cleanBody = body.replace(`${MANAGED_TEXT_MARKER}\n`, '');
  return Buffer.from(serializeFm(fm, `${MANAGED_TEXT_MARKER}\n${cleanBody}`), 'utf8');
}

function sourceToolSet(value) {
  if (typeof value === 'string') {
    return new Set(value.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean));
  }
  if (Array.isArray(value)) {
    return new Set(value.map((name) => String(name).trim().toLowerCase()).filter(Boolean));
  }
  if (value && typeof value === 'object') {
    return new Set(Object.entries(value)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name.trim().toLowerCase()));
  }
  return new Set();
}

function openCodeAgentTransform(buf, relPath) {
  if (!relPath.endsWith('.md')) return buf;
  const text = buf.toString('utf8');
  const { fm, body } = parseFm(text);
  if (!fm) return buf;

  const tools = sourceToolSet(fm.tools);
  const allows = (name) => tools.has(name) ? 'allow' : 'deny';
  const skills = Array.isArray(fm.skills)
    ? fm.skills.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
    : [];
  const skillPermission = skills.length > 0
    ? Object.fromEntries([['*', 'deny'], ...skills.map((name) => [name, 'allow'])])
    : 'deny';
  const permission = {
    read: allows('read'),
    edit: tools.has('write') || tools.has('edit') ? 'allow' : 'deny',
    glob: allows('glob'),
    grep: allows('grep'),
    list: allows('glob'),
    bash: allows('bash'),
    task: 'deny',
    external_directory: 'deny',
    todowrite: 'deny',
    question: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
    codesearch: 'deny',
    lsp: 'deny',
    doom_loop: 'deny',
    skill: skillPermission,
  };
  const nativeFm = {
    description: fm.description,
    mode: 'subagent',
    ...(Number.isInteger(fm.maxTurns) && fm.maxTurns > 0 ? { steps: fm.maxTurns } : {}),
    permission,
  };
  return Buffer.from(
    serializeFm(nativeFm, openCodeTextTransform(body, path.basename(relPath, '.md'))),
    'utf8',
  );
}

function isManagedTextFile(file) {
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').includes(MANAGED_TEXT_MARKER);
}

function assertManagedTextTarget(file, kind) {
  if (fs.existsSync(file) && !isManagedTextFile(file)) {
    throw new Error(`refusing to replace unmanaged OpenCode ${kind}: ${file}`);
  }
}

function removeStaleManagedFiles(dir, expected) {
  if (!fs.existsSync(dir)) return [];
  const keep = new Set(expected);
  const removed = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || keep.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (!isManagedTextFile(file)) continue;
    fs.unlinkSync(file);
    removed.push(entry.name);
  }
  return removed;
}

function removeEmptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function copyCommands(repoRoot, target, publishedTarget = target) {
  const output = path.join(target, 'commands');
  ensureDir(output);
  removeStaleManagedFiles(output, COMMAND_NAMES.map((name) => `${name}.md`));
  const copied = [];
  for (const name of COMMAND_NAMES) {
    const file = `${name}.md`;
    const source = path.join(repoRoot, 'commands', file);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted OpenCode command: ${file}`);
    const workflowFile = path.join(publishedTarget, BUNDLE_DIR, 'workflows', name, 'SKILL.md');
    const transformed = withManagedMarker(
      openCodeCommandTransform(fs.readFileSync(source), file, name, workflowFile),
    );
    writeAtomic(path.join(output, file), transformed);
    copied.push(file);
  }
  return copied;
}

function copySkills(repoRoot, target) {
  const copied = [];
  const names = discoverableSkillNames();
  const skillsRoot = path.join(target, 'skills');
  ensureDir(skillsRoot);
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || names.includes(entry.name)) continue;
    const candidate = path.join(skillsRoot, entry.name);
    if (isManaged(candidate)) removeTree(candidate);
  }
  for (const name of names) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted OpenCode skill: ${name}`);
    }
    const destination = path.join(skillsRoot, name);
    if (fs.existsSync(destination)) removeTree(destination);
    const files = copyTree(source, destination, {
      transform: (buf, relPath) => openCodeSkillAssetTransform(buf, relPath, name),
    });
    markManaged(destination, { adapter: 'opencode', asset: 'skill', name });
    copied.push(...files.map((rel) => path.join(name, rel)));
  }
  return copied;
}

function copyPrivateWorkflows(repoRoot, bundleRoot) {
  const copied = [];
  const workflowsRoot = path.join(bundleRoot, 'workflows');
  for (const name of CORE_PUBLIC_SKILLS) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted OpenCode workflow: ${name}`);
    }
    const files = copyTree(source, path.join(workflowsRoot, name), {
      transform: (buf, relPath) => openCodeSkillAssetTransform(buf, relPath, name),
    });
    copied.push(...files.map((rel) => path.join('workflows', name, rel)));
  }
  return copied;
}

function copyAgents(repoRoot, target) {
  const sourceRoot = path.join(repoRoot, 'agents');
  const output = path.join(target, 'agents');
  const names = fs.readdirSync(sourceRoot).filter((name) => name.endsWith('.md')).sort();
  ensureDir(output);
  removeStaleManagedFiles(output, names);
  for (const name of names) {
    const source = fs.readFileSync(path.join(sourceRoot, name));
    writeAtomic(path.join(output, name), withManagedMarker(openCodeAgentTransform(source, name)));
  }
  return names;
}

function preflightAssets(repoRoot, target) {
  for (const name of COMMAND_NAMES) {
    assertManagedTextTarget(path.join(target, 'commands', `${name}.md`), 'command');
  }
  for (const name of discoverableSkillNames()) {
    const destination = path.join(target, 'skills', name);
    if (fs.existsSync(destination) && !isManaged(destination)) {
      throw new Error(`refusing to replace unmanaged OpenCode skill: ${destination}`);
    }
  }
  for (const name of fs.readdirSync(path.join(repoRoot, 'agents')).filter((entry) => entry.endsWith('.md'))) {
    assertManagedTextTarget(path.join(target, 'agents', name), 'agent');
  }

  const pluginFile = path.join(target, 'plugins', 'ultra-builder-pro.js');
  if (fs.existsSync(pluginFile) && !fs.readFileSync(pluginFile, 'utf8').startsWith(PLUGIN_MARKER)) {
    throw new Error(`refusing to replace unmanaged OpenCode plugin: ${pluginFile}`);
  }
  const bundleRoot = path.join(target, BUNDLE_DIR);
  if (fs.existsSync(bundleRoot) && !isManaged(bundleRoot)) {
    throw new Error(`refusing to replace unmanaged OpenCode runtime bundle: ${bundleRoot}`);
  }
}

function pluginSource() {
  return `// Managed by Ultra Builder Pro. Rebuild through the adapter; do not edit in place.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TEAM_TASK_LEDGER = ".ultra/tasks/tasks.json";
const LIVE_TASK_PROJECTION = ".ultra/.runtime/projections/tasks.json";
const NODE_BINARY = ${JSON.stringify(process.execPath)};
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_CLI = path.resolve(
  PLUGIN_DIR, "..", ${JSON.stringify(BUNDLE_DIR)}, "runtime", "hook-context.cjs",
);

function readUltraContext(directory) {
  try {
    const raw = execFileSync(NODE_BINARY, [CONTEXT_CLI, "--discover", directory], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    const value = JSON.parse(raw);
    const root = value?.root;
    if (typeof root !== "string" || !root) return null;
    if (!value?.context || typeof value.text !== "string" || !value.text) {
      return { root, context: null, text: null };
    }
    return { root, context: value.context, text: value.text };
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error);
    if (/RUNTIME_(?:STATE_CONFLICT|PATH_UNSAFE|ORPHAN_SIDECAR|ROOT_INVALID|AUTHORITY_MISMATCH)|both legacy .*runtime.*state\\.db/i.test(detail)) {
      throw new Error(detail.trim());
    }
    return null;
  }
}

function targetPaths(tool, args) {
  if (!args || typeof args !== "object") return [];
  const paths = [args.file_path, args.filePath, args.filepath, args.path]
    .filter((value) => typeof value === "string" && value.length > 0);
  const patch = args.patch ?? args.command;
  if (String(tool).toLowerCase() === "apply_patch" && typeof patch === "string") {
    const pattern = /^\\*\\*\\* (?:Add|Update|Delete) File: (.+?)\\s*$/gm;
    for (const match of patch.matchAll(pattern)) paths.push(match[1].trim());
  }
  return [...new Set(paths)];
}

function managedTaskRootForTarget(baseRoot, candidate) {
  const target = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(baseRoot, candidate);
  if (target === path.resolve(baseRoot, TEAM_TASK_LEDGER)
      || target === path.resolve(baseRoot, LIVE_TASK_PROJECTION)) return baseRoot;
  if (path.basename(target) !== "tasks.json") return null;
  const parent = path.dirname(target);
  if (path.basename(parent) === "tasks"
      && path.basename(path.dirname(parent)) === ".ultra") {
    return path.dirname(path.dirname(parent));
  }
  if (path.basename(parent) === "projections"
      && path.basename(path.dirname(parent)) === ".runtime"
      && path.basename(path.dirname(path.dirname(parent))) === ".ultra") {
    return path.dirname(path.dirname(path.dirname(parent)));
  }
  return null;
}

function protectsManagedTaskFile(baseRoot, candidate) {
  const targetRoot = managedTaskRootForTarget(baseRoot, candidate);
  if (!targetRoot) return false;
  return Boolean(readUltraContext(targetRoot));
}

export const UltraBuilderProPlugin = async ({ directory, worktree }) => {
  const root = worktree || directory;
  let active = readUltraContext(root);
  const refresh = () => { active = readUltraContext(root); };
  return {
    event: async ({ event }) => {
      if (["session.created", "session.compacted", "session.idle"].includes(event?.type)) refresh();
    },
    "experimental.chat.system.transform": async (_input, output) => {
      refresh();
      if (active?.text) output.system.push(active.text);
    },
    "experimental.session.compacting": async (_input, output) => {
      refresh();
      if (active?.text) output.context.push(active.text);
    },
    "tool.execute.before": async (input, output) => {
      refresh();
      const tool = String(input?.tool ?? "").toLowerCase();
      if (!["write", "edit", "apply_patch"].includes(tool)) return;
      if (targetPaths(tool, output?.args).some(
        (candidate) => protectsManagedTaskFile(root, candidate),
      )) {
        throw new Error(
          "Ultra Builder Pro refused a direct write to an MCP-managed task file. " +
          ".ultra/tasks/tasks.json is the MCP-published team checkpoint and " +
          ".ultra/.runtime/projections/tasks.json is the checkout-local DB view. " +
          "Use the Ultra MCP task or task.ledger tools."
        );
      }
    },
    "tool.execute.after": async () => { refresh(); },
  };
};
`;
}

function createInstallTransaction() {
  const changes = [];
  const backups = [];
  const backupPath = (target) => path.join(
    path.dirname(target),
    `.${path.basename(target)}.ubp-backup-${crypto.randomUUID()}`,
  );
  return {
    replaceFile(source, target) {
      let previous = null;
      try {
        const stat = fs.statSync(target);
        previous = { contents: fs.readFileSync(target), mode: stat.mode & 0o7777 };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      writeAtomic(target, fs.readFileSync(source));
      changes.push({ type: 'file', target, previous });
    },
    replaceTree(source, target) {
      ensureDir(path.dirname(target));
      let backup = null;
      if (fs.existsSync(target)) {
        backup = backupPath(target);
        fs.renameSync(target, backup);
        backups.push(backup);
      }
      try {
        fs.renameSync(source, target);
      } catch (error) {
        if (backup && fs.existsSync(backup)) fs.renameSync(backup, target);
        throw error;
      }
      changes.push({ type: 'tree', target, backup });
    },
    removeFile(target) {
      if (!fs.existsSync(target)) return;
      const stat = fs.statSync(target);
      const previous = { contents: fs.readFileSync(target), mode: stat.mode & 0o7777 };
      fs.unlinkSync(target);
      changes.push({ type: 'file', target, previous });
    },
    removeTree(target) {
      if (!fs.existsSync(target)) return;
      const backup = backupPath(target);
      fs.renameSync(target, backup);
      backups.push(backup);
      changes.push({ type: 'tree', target, backup, removed: true });
    },
    commit() {
      for (const backup of backups) {
        if (fs.existsSync(backup)) removeTree(backup);
      }
      changes.length = 0;
      backups.length = 0;
    },
    rollback() {
      const errors = [];
      for (const change of changes.reverse()) {
        try {
          if (change.type === 'file') {
            if (change.previous) {
              writeAtomic(change.target, change.previous.contents);
              fs.chmodSync(change.target, change.previous.mode);
            } else if (fs.existsSync(change.target)) {
              fs.unlinkSync(change.target);
            }
          } else {
            if (!change.removed && fs.existsSync(change.target)) removeTree(change.target);
            if (change.backup && fs.existsSync(change.backup)) {
              fs.renameSync(change.backup, change.target);
            }
          }
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'OpenCode install rollback failed');
      }
    },
  };
}

function buildStaging(repoRoot, staging, target) {
  const report = { target, copied: {}, config: { updated: false } };
  report.copied.commands = copyCommands(repoRoot, staging, target);
  report.copied.skills = copySkills(repoRoot, staging);
  report.copied.agents = copyAgents(repoRoot, staging);
  ensureDir(path.join(staging, 'plugins'));
  writeAtomic(path.join(staging, 'plugins', 'ultra-builder-pro.js'), pluginSource());
  report.copied.plugins = ['ultra-builder-pro.js'];

  const bundleRoot = path.join(staging, BUNDLE_DIR);
  ensureDir(bundleRoot);
  report.copied.workflows = copyPrivateWorkflows(repoRoot, bundleRoot);
  buildMcpRuntime(repoRoot, bundleRoot, { runtime: 'opencode' });
  markManaged(bundleRoot, { adapter: 'opencode', asset: 'runtime-bundle' });
  const configFile = path.join(target, 'opencode.json');
  const existing = readJsonSafe(configFile, { rescue: true });
  const mcp = { ...(existing.mcp || {}) };
  const command = mcpCommand(path.join(target, BUNDLE_DIR, 'runtime', 'launch.cjs'));
  mcp[MCP_SERVER_NAME] = {
    type: 'local',
    enabled: true,
    command: [command.command, ...command.args],
  };
  const next = { ...existing, mcp };
  delete next[LEGACY_SENTINEL_KEY];
  writeAtomic(path.join(staging, 'opencode.json'), JSON.stringify(next, null, 2) + '\n');
  report.config.updated = true;
  const source = provenance.packageSource(repoRoot);
  const bundleAssets = provenance.assetRefsForTree('config', bundleRoot, {
    exclude: [PROVENANCE_FILE],
  }).map((asset) => ({ ...asset, path: path.join(BUNDLE_DIR, asset.path) }));
  const skillMarkers = discoverableSkillNames().map((name) => ({
    root: 'config', path: path.join('skills', name, '.ubp-managed'),
  }));
  const provenanceFile = path.join(bundleRoot, PROVENANCE_FILE);
  report.provenance = provenance.writeProvenance({
    file: provenanceFile,
    adapter: 'opencode',
    ...source,
    roots: { config: target },
    assetRoots: { config: staging },
    assets: [
      ...report.copied.commands.map((file) => ({ root: 'config', path: path.join('commands', file) })),
      ...report.copied.skills.map((file) => ({ root: 'config', path: path.join('skills', file) })),
      ...skillMarkers,
      ...report.copied.agents.map((file) => ({ root: 'config', path: path.join('agents', file) })),
      { root: 'config', path: path.join('plugins', 'ultra-builder-pro.js') },
      ...bundleAssets,
    ],
    contracts: {
      host_plugin: { root: 'config', path: path.join('plugins', 'ultra-builder-pro.js') },
      mcp_config: { root: 'config', path: 'opencode.json' },
      mcp_launcher: { root: 'config', path: path.join(BUNDLE_DIR, 'runtime', 'launch.cjs') },
      native_runtime: { root: 'config', path: path.join(BUNDLE_DIR, 'runtime', 'native-runtime.json') },
      context_envelope_helper: { root: 'config', path: path.join(BUNDLE_DIR, 'runtime', 'hook-context.cjs') },
      hook_event_helper: { root: 'config', path: path.join(BUNDLE_DIR, 'runtime', 'hook-event.cjs') },
    },
  });
  report.provenance.file = path.join(target, BUNDLE_DIR, PROVENANCE_FILE);
  return report;
}

function managedTextFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isManagedTextFile(path.join(dir, entry.name)))
    .map((entry) => entry.name);
}

function managedSkillDirs(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isManaged(path.join(root, entry.name)))
    .map((entry) => entry.name);
}

function publishStaging(staging, target, report) {
  const transaction = createInstallTransaction();
  const commandNames = report.copied.commands;
  const agentNames = report.copied.agents;
  const skillNames = discoverableSkillNames();
  try {
    for (const file of commandNames) {
      transaction.replaceFile(
        path.join(staging, 'commands', file),
        path.join(target, 'commands', file),
      );
    }
    for (const stale of managedTextFiles(path.join(target, 'commands'))) {
      if (!commandNames.includes(stale)) {
        transaction.removeFile(path.join(target, 'commands', stale));
      }
    }
    for (const name of skillNames) {
      transaction.replaceTree(
        path.join(staging, 'skills', name),
        path.join(target, 'skills', name),
      );
    }
    for (const stale of managedSkillDirs(path.join(target, 'skills'))) {
      if (!skillNames.includes(stale)) {
        transaction.removeTree(path.join(target, 'skills', stale));
      }
    }
    for (const file of agentNames) {
      transaction.replaceFile(
        path.join(staging, 'agents', file),
        path.join(target, 'agents', file),
      );
    }
    for (const stale of managedTextFiles(path.join(target, 'agents'))) {
      if (!agentNames.includes(stale)) {
        transaction.removeFile(path.join(target, 'agents', stale));
      }
    }
    transaction.replaceFile(
      path.join(staging, 'plugins', 'ultra-builder-pro.js'),
      path.join(target, 'plugins', 'ultra-builder-pro.js'),
    );
    transaction.replaceTree(
      path.join(staging, BUNDLE_DIR),
      path.join(target, BUNDLE_DIR),
    );
    transaction.replaceFile(
      path.join(staging, 'opencode.json'),
      path.join(target, 'opencode.json'),
    );
    transaction.commit();
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'OpenCode install and rollback both failed');
    }
    throw error;
  }
}

function install(ctx = {}) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  ensureDir(target);
  preflightAssets(repoRoot, target);
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.ubp-opencode-staging-'));
  try {
    const report = buildStaging(repoRoot, staging, target);
    publishStaging(staging, target, report);
    return report;
  } finally {
    if (fs.existsSync(staging)) removeTree(staging);
  }
}

function doctor(ctx = {}) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const source = provenance.packageSource(repoRoot);
  const report = provenance.inspectProvenance({
    file: path.join(target, BUNDLE_DIR, PROVENANCE_FILE),
    expectedAdapter: 'opencode',
    expectedPackageVersion: source.packageInfo.version,
  });
  const configFile = path.join(target, 'opencode.json');
  const expectedLauncher = path.join(target, BUNDLE_DIR, 'runtime', 'launch.cjs');
  let registrationOk = false;
  try {
    const config = readJsonSafe(configFile);
    const entry = config.mcp && config.mcp[MCP_SERVER_NAME];
    const command = mcpCommand(expectedLauncher);
    registrationOk = entry?.type === 'local'
      && entry.enabled === true
      && Array.isArray(entry.command)
      && JSON.stringify(entry.command) === JSON.stringify([
        command.command,
        ...command.args,
      ]);
  } catch (error) {
    report.issues.push({ code: 'MCP_REGISTRATION_INVALID', message: error.message });
  }
  if (!registrationOk && !report.issues.some((entry) => entry.code === 'MCP_REGISTRATION_INVALID')) {
    report.issues.push({
      code: 'MCP_REGISTRATION_INVALID',
      path: configFile,
      expected_launcher: expectedLauncher,
    });
  }
  report.checks.registration = { status: registrationOk ? 'pass' : 'fail' };
  return applyNativeDoctor(report, path.join(target, BUNDLE_DIR, 'runtime'));
}

function uninstall(ctx = {}) {
  const target = resolveTarget(ctx);
  const report = { target, removed: {}, config: { updated: false } };
  const pluginFile = path.join(target, 'plugins', 'ultra-builder-pro.js');
  const bundleRoot = path.join(target, BUNDLE_DIR);
  const pluginOwned = fs.existsSync(pluginFile)
    && fs.readFileSync(pluginFile, 'utf8').startsWith(PLUGIN_MARKER);
  const bundleOwned = fs.existsSync(bundleRoot) && isManaged(bundleRoot);
  const configFile = path.join(target, 'opencode.json');
  if (fs.existsSync(configFile)) {
    const existing = readJsonSafe(configFile);
    if (pluginOwned || bundleOwned || existing[LEGACY_SENTINEL_KEY]) {
      const mcp = { ...(existing.mcp || {}) };
      delete mcp[MCP_SERVER_NAME];
      const next = { ...existing, mcp };
      delete next[LEGACY_SENTINEL_KEY];
      if (Object.keys(next.mcp || {}).length === 0) delete next.mcp;
      writeAtomic(configFile, JSON.stringify(next, null, 2) + '\n');
      report.config.updated = true;
    }
  }
  if (pluginOwned) {
    fs.unlinkSync(pluginFile);
    report.removed.plugin = true;
  }

  for (const sub of ['commands', 'agents']) {
    const dir = path.join(target, sub);
    const removed = [];
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const file = path.join(dir, entry.name);
        if (!isManagedTextFile(file)) continue;
        fs.unlinkSync(file);
        removed.push(entry.name);
      }
      removeEmptyDir(dir);
    }
    if (removed.length > 0) report.removed[sub] = removed;
  }

  const skillsRoot = path.join(target, 'skills');
  const skills = [];
  if (fs.existsSync(skillsRoot)) {
    for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(skillsRoot, entry.name);
      if (!isManaged(dir)) continue;
      removeTree(dir);
      skills.push(entry.name);
    }
    removeEmptyDir(skillsRoot);
  }
  if (skills.length > 0) report.removed.skills = skills;

  if (bundleOwned) {
    removeTree(bundleRoot);
    report.removed.runtime = true;
  }
  return report;
}

module.exports = {
  name: 'opencode',
  MCP_SERVER_NAME,
  SOURCE_TAG,
  BUNDLE_DIR,
  pluginSource,
  resolveTarget,
  install,
  uninstall,
  doctor,
};
