'use strict';

/** Build a native OpenCode Ultra Builder Pro plugin. */

const fs = require('node:fs');
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
const { buildMcpRuntime } = require('./_shared/codex-assets.cjs');
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
const COMMAND_NAMES = CORE_PUBLIC_SKILLS.filter((name) => name !== 'ultra-review');

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
  let text = String(input);
  text = text.replaceAll('$CLAUDE_PLUGIN_ROOT/skills', '~/.config/opencode/skills');
  text = text.replaceAll('~/.claude/skills', '~/.config/opencode/skills');
  text = text.replaceAll('~/.claude/hooks', '~/.config/opencode/.ultra-builder-pro/hooks');
  text = text.replaceAll('~/.claude', '~/.config/opencode');
  text = text.replaceAll('CLAUDE.md', 'AGENTS.md');
  text = text.replace(/@skills\/([a-z0-9-]+)\/SKILL\.md/g, '~/.config/opencode/skills/$1/SKILL.md');

  text = text.replaceAll('TaskCreate/TaskUpdate (session-local)', 'the OpenCode plan (session-local)');
  text = text.replaceAll('TaskCreate', 'an OpenCode plan item');
  text = text.replaceAll('TaskUpdate', 'an OpenCode plan update');
  text = text.replaceAll('TaskList', 'the current OpenCode plan');
  text = text.replaceAll('`run_in_background: true`', 'concurrent OpenCode task execution');
  text = text.replaceAll('run_in_background: true', 'concurrent OpenCode task execution');
  text = text.replaceAll('Claude Task tool', 'OpenCode `task` tool');
  text = text.replaceAll('Task tool', 'OpenCode `task` tool');
  text = text.replaceAll('multiple Task calls', 'multiple OpenCode `task` calls');
  text = text.replaceAll('Bash tool', 'OpenCode `bash` tool');
  text = text.replaceAll('Read tool', 'OpenCode `read` tool');
  text = text.replaceAll('Write tool', 'OpenCode `edit` tool');

  text = text.replaceAll('MCP `review.run`', 'OpenCode native review subagents');
  text = text.replaceAll('`review.run`', 'OpenCode native review subagents');
  text = text.replaceAll('review.run', 'OpenCode native review subagents');
  text = text.replaceAll('MCP `ask.question`', 'OpenCode `question` tool');
  text = text.replaceAll('`ask.question`', 'OpenCode `question` tool');
  text = text.replaceAll('ask.question', 'OpenCode question tool');
  text = text.replaceAll('AskUserQuestion', 'OpenCode `question` tool');
  text = text.replaceAll('ultra-tools ask --question … --options …', 'OpenCode `question` tool');
  text = text.replaceAll('ultra-tools ask --question …', 'OpenCode `question` tool');
  text = text.replaceAll('ultra-tools ask …', 'OpenCode `question` tool');
  text = text.replaceAll('Claude runtime', 'OpenCode runtime');
  text = text.replaceAll('Claude-only', 'OpenCode-only');

  if (assetName === 'codex-collab') {
    text = text.replaceAll('within Claude Code', 'from OpenCode');
    text = text.replaceAll('Claude Code remains primary', 'OpenCode remains primary');
    text = text.replaceAll('Claude orchestrates', 'OpenCode remains primary and orchestrates');
    text = text.replaceAll('Claude synthesizes', 'OpenCode verifies and synthesizes');
    text = text.replaceAll("Claude's", "OpenCode's");
    text = text.replaceAll('proceed with Claude-only analysis', 'proceed with OpenCode-only analysis');
  }
  if (assetName === 'ultra-verify') {
    text = text.replaceAll('claude-analysis.md', 'opencode-analysis.md');
    text = text.replaceAll('Claude Code', 'OpenCode');
    text = text.replaceAll('Claude', 'OpenCode');
  }
  if (assetName === 'learn') {
    text = text.replaceAll(
      '~/.config/opencode/skills/learned/<name>_unverified.md',
      '~/.config/opencode/skills/learned-<name>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/.config/opencode/skills/learned/<pattern-slug>_unverified.md',
      '~/.config/opencode/skills/learned-<pattern-slug>-unverified/SKILL.md',
    );
    text = text.replaceAll(
      '~/.config/opencode/skills/learned/<slug>_unverified.md',
      '~/.config/opencode/skills/learned-<slug>-unverified/SKILL.md',
    );
    text = text.replaceAll('append the `_unverified` suffix to the filename', 'append `-unverified` to the skill directory name');
    text = text.replaceAll('Never overwrite an existing unverified file', 'Never overwrite an existing learned skill directory');
    text = text.replaceAll('remove the `_unverified` suffix', 'rename the directory to remove `-unverified` and update the frontmatter name');
    text = text.replaceAll('(`pattern-slug-2_unverified.md`)', '(`learned-pattern-slug-2-unverified/`)');
  }
  return text;
}

function openCodeCommandTransform(buf, relPath, commandName) {
  if (!relPath.endsWith('.md')) return buf;
  const { fm, body } = parseFm(buf.toString('utf8'));
  if (!fm) return Buffer.from(openCodeTextTransform(buf.toString('utf8'), commandName), 'utf8');
  const nativeFm = {
    description: openCodeTextTransform(fm.description || `${commandName} workflow`, commandName)
      .replace(/\s+/g, ' ')
      .trim(),
  };
  return Buffer.from(serializeFm(nativeFm, openCodeTextTransform(body, commandName)), 'utf8');
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

function copyCommands(repoRoot, target) {
  const output = path.join(target, 'commands');
  ensureDir(output);
  removeStaleManagedFiles(output, COMMAND_NAMES.map((name) => `${name}.md`));
  const copied = [];
  for (const name of COMMAND_NAMES) {
    const file = `${name}.md`;
    const source = path.join(repoRoot, 'commands', file);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted OpenCode command: ${file}`);
    const transformed = withManagedMarker(openCodeCommandTransform(fs.readFileSync(source), file, name));
    writeAtomic(path.join(output, file), transformed);
    copied.push(file);
  }
  return copied;
}

function copySkills(repoRoot, target) {
  const copied = [];
  const names = skillsForRuntime('opencode');
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
  for (const name of skillsForRuntime('opencode')) {
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
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TERMINAL = new Set(["committed", "completed", "done", "cancelled"]);
const TASKS_PROJECTION = ".ultra/tasks/tasks.json";

function gitHead(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function findUltraContext(directory) {
  let current = path.resolve(directory);
  while (true) {
    const ultra = path.join(current, ".ultra");
    const currentHead = gitHead(current);
    const workflowFile = path.join(ultra, "workflow-state.json");
    const statePresent = fs.existsSync(path.join(ultra, "state.db"));
    let workflow = null;
    if (fs.existsSync(workflowFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
        workflow = state && !TERMINAL.has(state.status) ? state : null;
      } catch (error) {
        process.stderr.write(\`[ultra-builder-pro] cannot read \${workflowFile}: \${error.message}\\n\`);
      }
    }
    const changes = [];
    const changeRoot = path.join(ultra, "changes", "active");
    if (fs.existsSync(changeRoot)) {
      for (const entry of fs.readdirSync(changeRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(changeRoot, entry.name, "context-manifest.json");
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          if (manifest?.change) {
            const compiledHead = manifest.git?.head ?? null;
            const legacyContext = manifest.schema_version !== "2.0";
            const headStale = Boolean(compiledHead && currentHead && compiledHead !== currentHead);
            const blockers = Array.isArray(manifest.readiness?.blockers)
              ? [...manifest.readiness.blockers]
              : [];
            if (headStale && !blockers.includes("CONTEXT_HEAD_STALE")) blockers.push("CONTEXT_HEAD_STALE");
            if (legacyContext && !blockers.includes("CONTEXT_SNAPSHOT_UPGRADE_REQUIRED")) {
              blockers.unshift("CONTEXT_SNAPSHOT_UPGRADE_REQUIRED");
            }
            changes.push({
            id: manifest.change.id,
            kind: manifest.change.kind,
            status: manifest.change.status,
            role: manifest.role ?? "plan",
            gate: manifest.gate ?? "alignment",
            nextAction: legacyContext
              ? "Recompile change.context to upgrade this legacy context snapshot."
              : headStale
              ? "Git HEAD changed after context compilation; recompile change.context."
              : (manifest.next_action ?? "Inspect Ultra status."),
            readiness: legacyContext || headStale ? "blocked" : (manifest.readiness?.status ?? "ready"),
            blockers,
            taskId: manifest.selected_task?.id ?? manifest.resume?.task_id ?? null,
            taskStatus: manifest.selected_task?.status ?? manifest.resume?.task_status ?? null,
            tokenEstimate: manifest.context?.token_estimate ?? 0,
            manifestPath: path.relative(current, manifestPath),
          });
          }
        } catch (error) {
          process.stderr.write(\`[ultra-builder-pro] cannot read \${manifestPath}: \${error.message}\\n\`);
        }
      }
    }
    if (statePresent || workflow || changes.length > 0) {
      return { root: current, workflow, changes, statePresent };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function contextText(active) {
  const lines = [];
  if (active.workflow) {
    const state = active.workflow;
    lines.push(
      "[Ultra active workflow]",
      \`Project: \${active.root}\`,
      \`Command: \${state.command ?? "unknown"}\`,
      \`Task: \${state.task_id ?? state.task ?? "unknown"}\`,
      \`Step: \${state.step ?? "unknown"}\`,
      \`Status: \${state.status ?? "active"}\`,
    );
  }
  if (active.changes.length > 0) {
    const change = active.changes[0];
    lines.push(
      "[Ultra context spine]",
      \`Project: \${active.root}\`,
      \`Change: \${change.id} (\${change.kind ?? "unknown"}, \${change.status ?? "active"})\`,
      \`Task: \${change.taskId ?? "none"} (\${change.taskStatus ?? "none"})\`,
      \`Role: \${change.role}\`,
      \`Gate: \${change.gate}\`,
      \`Readiness: \${change.readiness}\`,
      ...(change.blockers.length > 0 ? [\`Blockers: \${change.blockers.join(", ")}\`] : []),
      \`Next: \${change.nextAction}\`,
      \`Context manifest: \${change.manifestPath}\`,
    );
    if (active.changes.length > 1) lines.push(
      \`Active change count: \${active.changes.length}; resolve scope with change.list before mutation.\`,
    );
  }
  if (!active.workflow && active.changes.length === 0) {
    lines.push(
      "[Ultra baseline]",
      \`Project: \${active.root}\`,
      "No active continuous change. Start daily work with the ultra-change workflow.",
    );
  }
  lines.push("Authority: .ultra/state.db; JSON/Markdown remain projections or evidence artifacts.");
  return lines.join("\\n");
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

function isTasksProjection(active, candidate) {
  const target = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(active.root, candidate);
  return target === path.resolve(active.root, TASKS_PROJECTION);
}

export const UltraBuilderProPlugin = async ({ directory, worktree }) => {
  const root = worktree || directory;
  let active = findUltraContext(root);
  const refresh = () => { active = findUltraContext(root); };
  return {
    event: async ({ event }) => {
      if (["session.created", "session.compacted", "session.idle"].includes(event?.type)) refresh();
    },
    "experimental.chat.system.transform": async (_input, output) => {
      refresh();
      if (active) output.system.push(contextText(active));
    },
    "experimental.session.compacting": async (_input, output) => {
      refresh();
      if (active) output.context.push(contextText(active));
    },
    "tool.execute.before": async (input, output) => {
      refresh();
      if (!active) return;
      const tool = String(input?.tool ?? "").toLowerCase();
      if (!["write", "edit", "apply_patch"].includes(tool)) return;
      if (targetPaths(tool, output?.args).some((candidate) => isTasksProjection(active, candidate))) {
        throw new Error(
          "Ultra Builder Pro refused a direct write to .ultra/tasks/tasks.json. " +
          ".ultra/state.db is authoritative; use MCP task tools and run ultra-doctor when state or projection health is degraded."
        );
      }
    },
    "tool.execute.after": async () => { refresh(); },
  };
};
`;
}

function install(ctx = {}) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  ensureDir(target);
  const report = { target, copied: {}, config: { updated: false } };
  preflightAssets(repoRoot, target);
  report.copied.commands = copyCommands(repoRoot, target);
  report.copied.skills = copySkills(repoRoot, target);
  report.copied.agents = copyAgents(repoRoot, target);

  ensureDir(path.join(target, 'plugins'));
  writeAtomic(path.join(target, 'plugins', 'ultra-builder-pro.js'), pluginSource());
  report.copied.plugins = ['ultra-builder-pro.js'];

  const bundleRoot = path.join(target, BUNDLE_DIR);
  if (fs.existsSync(bundleRoot)) removeTree(bundleRoot);
  ensureDir(bundleRoot);
  const runtime = buildMcpRuntime(repoRoot, bundleRoot, { runtime: 'opencode' });
  markManaged(bundleRoot, { adapter: 'opencode', asset: 'runtime-bundle' });
  const configFile = path.join(target, 'opencode.json');
  const existing = readJsonSafe(configFile, { rescue: true });
  const mcp = { ...(existing.mcp || {}) };
  mcp[MCP_SERVER_NAME] = {
    type: 'local',
    enabled: true,
    command: [process.execPath, runtime.launcher],
  };
  const next = { ...existing, mcp };
  delete next[LEGACY_SENTINEL_KEY];
  writeAtomic(configFile, JSON.stringify(next, null, 2) + '\n');
  report.config.updated = true;
  const source = provenance.packageSource(repoRoot);
  const bundleAssets = provenance.assetRefsForTree('config', bundleRoot, {
    exclude: [PROVENANCE_FILE],
  }).map((asset) => ({ ...asset, path: path.join(BUNDLE_DIR, asset.path) }));
  const skillMarkers = skillsForRuntime('opencode').map((name) => ({
    root: 'config', path: path.join('skills', name, '.ubp-managed'),
  }));
  const provenanceFile = path.join(bundleRoot, PROVENANCE_FILE);
  report.provenance = provenance.writeProvenance({
    file: provenanceFile,
    adapter: 'opencode',
    ...source,
    roots: { config: target },
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
    },
  });
  report.provenance.file = provenanceFile;
  return report;
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
    registrationOk = entry?.type === 'local'
      && entry.enabled === true
      && Array.isArray(entry.command)
      && entry.command[0] === process.execPath
      && entry.command[1] === expectedLauncher;
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
  if (report.status !== 'missing') report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
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
