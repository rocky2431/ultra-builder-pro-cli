'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  copyHooks,
  copySkills,
  inspectPlugin,
  markManaged,
  removeManaged,
  writePluginProvenance,
} = require('./_shared/plugin-core.cjs');
const {
  captureAbsent,
  ensureDir,
  isManaged,
  managedMetadata,
  pruneCreatedEmpty,
  removeTree: removePath,
  writeAtomic,
} = require('./_shared/file-ops.cjs');
const { skillsForRuntime } = require('./_shared/runtime-assets.cjs');

const PLUGIN_NAME = 'ultra-builder-pro';
const BUNDLE_DIR = '.ultra-builder-pro';
const PLUGIN_MARKER = '// Managed by Ultra Builder Pro.';
const TEXT_MARKER = '<!-- ultra-builder-pro:managed -->';

function resolveTarget(ctx = {}) {
  if (ctx.configDir) return path.resolve(ctx.configDir);
  if (ctx.scope === 'global') {
    if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
    if (process.env.OPENCODE_CONFIG) return path.dirname(process.env.OPENCODE_CONFIG);
    return path.join(process.env.XDG_CONFIG_HOME || path.join(ctx.homeDir || os.homedir(), '.config'), 'opencode');
  }
  return path.join(ctx.cwd || process.cwd(), '.opencode');
}

function resolveRepoRoot(ctx = {}) {
  return ctx.repoRoot || path.resolve(__dirname, '..');
}

function buildHooksManifest() {
  return {
    SessionStart: ['session_context.py', 'compact_context.py'],
    PreToolUse: ['mid_workflow_recall.py', 'block_dangerous_commands.py'],
    PostToolUse: ['post_edit_guard.py'],
    PreCompact: ['compact_context.py'],
  };
}

function pluginSource() {
  return `${PLUGIN_MARKER}
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOOK_ROOT = path.resolve(PLUGIN_DIR, "..", ${JSON.stringify(BUNDLE_DIR)}, "hooks");

function runHook(name, root, payload) {
  try {
    const stdout = execFileSync("python3", [path.join(HOOK_ROOT, name)], {
      cwd: root,
      input: JSON.stringify({ cwd: root, ...payload }),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    }).trim();
    return stdout ? JSON.parse(stdout) : {};
  } catch (error) {
    return { systemMessage: "Ultra hook failed open: " + String(error?.message || error) };
  }
}

function contextOf(output) {
  return output?.hookSpecificOutput?.additionalContext || output?.systemMessage || "";
}

export const UltraBuilderProPlugin = async ({ directory, worktree }) => {
  const root = worktree || directory;
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const text = contextOf(runHook("session_context.py", root, { hook_event_name: "SessionStart" }));
      if (text) output.system.push(text);
    },
    "experimental.session.compacting": async (_input, output) => {
      runHook("compact_context.py", root, { hook_event_name: "PreCompact" });
      const text = contextOf(runHook("compact_context.py", root, {
        hook_event_name: "SessionStart", source: "compact",
      }));
      if (text) output.context.push(text);
    },
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool || "").toLowerCase();
      if (tool === "bash") {
        const verdict = runHook("block_dangerous_commands.py", root, {
          hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: output?.args || {},
        });
        if (verdict?.decision === "block") throw new Error(verdict.reason);
      }
      if (["write", "edit", "grep", "apply_patch"].includes(tool)) {
        runHook("mid_workflow_recall.py", root, {
          hook_event_name: "PreToolUse", tool_name: input?.tool, tool_input: output?.args || {},
        });
      }
    },
    "tool.execute.after": async (input) => {
      const tool = String(input?.tool || "").toLowerCase();
      if (["write", "edit", "apply_patch"].includes(tool)) {
        runHook("post_edit_guard.py", root, {
          hook_event_name: "PostToolUse", tool_name: input?.tool, tool_input: input?.args || {},
        });
      }
    },
  };
};
`;
}

function planRetiredCleanup(target) {
  const files = [];
  for (const dirName of ['commands', 'agents']) {
    const dir = path.join(target, dirName);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const candidate = path.join(dir, file);
      if (!fs.statSync(candidate).isFile()) continue;
      const text = fs.readFileSync(candidate, 'utf8');
      if (text.includes(TEXT_MARKER)) files.push(candidate);
    }
  }
  const configFile = path.join(target, 'opencode.json');
  let config = null;
  if (fs.existsSync(configFile)) {
    const value = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (value?.mcp?.[PLUGIN_NAME]) {
      delete value.mcp[PLUGIN_NAME];
      if (Object.keys(value.mcp).length === 0) delete value.mcp;
      config = `${JSON.stringify(value, null, 2)}\n`;
    }
  }
  return { config, configFile, files };
}

function cleanupRetired(target, plan = planRetiredCleanup(target)) {
  for (const file of plan.files) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(TEXT_MARKER)) {
      fs.unlinkSync(file);
    }
  }
  for (const dirName of ['commands', 'agents']) {
    const dir = path.join(target, dirName);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }
  if (plan.config !== null) writeAtomic(plan.configFile, plan.config);
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
      const link = fs.lstatSync(target).isSymbolicLink() ? fs.readlinkSync(target) : null;
      const stat = fs.statSync(target);
      const previous = { contents: fs.readFileSync(target), link, mode: stat.mode & 0o7777 };
      fs.unlinkSync(target);
      changes.push({ type: 'file', target, previous, removed: true });
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
        if (fs.existsSync(backup)) removePath(backup);
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
              if (change.removed && change.previous.link !== null) {
                ensureDir(path.dirname(change.target));
                fs.symlinkSync(change.previous.link, change.target);
              } else {
                writeAtomic(change.target, change.previous.contents);
                fs.chmodSync(resolveTargetFile(change.target), change.previous.mode);
              }
            } else if (fs.existsSync(change.target)) {
              fs.unlinkSync(change.target);
            }
          } else {
            if (!change.removed && fs.existsSync(change.target)) removePath(change.target);
            if (change.backup && fs.existsSync(change.backup)) fs.renameSync(change.backup, change.target);
          }
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, 'OpenCode install rollback failed');
    },
  };
}

function resolveTargetFile(file) {
  return fs.lstatSync(file).isSymbolicLink() ? fs.realpathSync(file) : file;
}

function publishStaging({ staging, target, bundleRoot, skillRoot, pluginFile, skills, retiredCleanup }) {
  const expected = new Set(skills);
  const staleSkills = [];
  if (fs.existsSync(skillRoot)) {
    for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      const candidate = path.join(skillRoot, entry.name);
      if (entry.isDirectory() && !expected.has(entry.name) && isManaged(candidate)) staleSkills.push(candidate);
    }
  }
  if (fs.existsSync(bundleRoot) && !isManaged(bundleRoot)) {
    throw new Error(`refusing to replace unmanaged OpenCode bundle: ${bundleRoot}`);
  }
  for (const name of skills) {
    const candidate = path.join(skillRoot, name);
    if (fs.existsSync(candidate) && !isManaged(candidate)) {
      throw new Error(`refusing to replace unmanaged OpenCode skill: ${candidate}`);
    }
  }

  const stagedConfig = path.join(staging, 'opencode.json');
  const stagedPlugin = path.join(staging, `${PLUGIN_NAME}.js`);
  writeAtomic(stagedPlugin, pluginSource());
  if (retiredCleanup.config !== null) writeAtomic(stagedConfig, retiredCleanup.config);

  const transaction = createInstallTransaction();
  try {
    transaction.replaceTree(path.join(staging, 'bundle'), bundleRoot);
    for (const name of skills) {
      transaction.replaceTree(path.join(staging, 'skills', name), path.join(skillRoot, name));
    }
    for (const candidate of staleSkills) transaction.removeTree(candidate);
    transaction.replaceFile(stagedPlugin, pluginFile);
    for (const file of retiredCleanup.files) transaction.removeFile(file);
    if (retiredCleanup.config !== null) {
      transaction.replaceFile(stagedConfig, retiredCleanup.configFile);
    }
    transaction.commit();
  } catch (error) {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'OpenCode install and rollback both failed');
    }
    throw error;
  }

  for (const dirName of ['commands', 'agents']) {
    const directory = path.join(target, dirName);
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
}

function install(ctx = {}) {
  const target = resolveTarget(ctx);
  const repoRoot = resolveRepoRoot(ctx);
  const bundleRoot = path.join(target, BUNDLE_DIR);
  const skillRoot = path.join(target, 'skills');
  const pluginFile = path.join(target, 'plugins', `${PLUGIN_NAME}.js`);
  const cleanupAbsent = managedMetadata(bundleRoot)?.cleanup_absent
    || captureAbsent(target, ['.', 'skills', 'plugins']);
  ensureDir(target);

  if (fs.existsSync(pluginFile) && !fs.readFileSync(pluginFile, 'utf8').startsWith(PLUGIN_MARKER)) {
    throw new Error(`refusing to replace unmanaged OpenCode plugin: ${pluginFile}`);
  }
  const retiredCleanup = planRetiredCleanup(target);
  const staging = fs.mkdtempSync(path.join(target, `.${PLUGIN_NAME}-staging-`));
  const stagedBundle = path.join(staging, 'bundle');
  const stagedSkills = path.join(staging, 'skills');
  ensureDir(stagedBundle);
  ensureDir(stagedSkills);
  try {
    const skills = copySkills({ runtime: 'opencode', repoRoot, skillRoot: stagedSkills });
    for (const name of skills) markManaged(path.join(stagedSkills, name), { adapter: 'opencode', asset: 'skill', name });
    copyHooks({
      runtime: 'opencode', repoRoot, hookRoot: path.join(stagedBundle, 'hooks'),
      hooksManifest: buildHooksManifest(),
    });
    markManaged(stagedBundle, { adapter: 'opencode', plugin: PLUGIN_NAME });
    writePluginProvenance({
      adapter: 'opencode', repoRoot, stagingRoot: stagedBundle, publishedRoot: bundleRoot,
      contracts: { hooks_manifest: { root: 'plugin', path: 'hooks/hooks.json' } },
    });
    markManaged(stagedBundle, { cleanup_absent: cleanupAbsent });

    publishStaging({
      staging, target, bundleRoot, skillRoot, pluginFile, skills, retiredCleanup,
    });
    removePath(staging);
    return {
      target: bundleRoot,
      pluginRoot: bundleRoot,
      skillRoot,
      hookRoot: path.join(bundleRoot, 'hooks'),
      pluginFile,
      copied: { skills },
    };
  } catch (error) {
    if (fs.existsSync(staging)) removePath(staging);
    pruneCreatedEmpty(target, cleanupAbsent);
    throw error;
  }
}

function doctor(ctx = {}) {
  const target = resolveTarget(ctx);
  const bundleRoot = path.join(target, BUNDLE_DIR);
  const pluginFile = path.join(target, 'plugins', `${PLUGIN_NAME}.js`);
  const report = inspectPlugin({
    adapter: 'opencode', repoRoot: resolveRepoRoot(ctx), pluginRoot: bundleRoot,
    skillRoot: path.join(target, 'skills'), hookRoot: path.join(bundleRoot, 'hooks'),
    manifestFile: pluginFile,
  });
  let configClean = true;
  try {
    const configFile = path.join(target, 'opencode.json');
    if (fs.existsSync(configFile)) {
      const value = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      configClean = !value?.mcp?.[PLUGIN_NAME];
    }
  } catch { configClean = false; }
  report.checks.no_mcp_registration = { status: configClean ? 'pass' : 'fail' };
  if (!configClean) report.issues.push({ code: 'RETIRED_MCP_REGISTRATION_PRESENT' });
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function uninstall(ctx = {}) {
  const target = resolveTarget(ctx);
  const pluginRoot = path.join(target, BUNDLE_DIR);
  const cleanupAbsent = managedMetadata(pluginRoot)?.cleanup_absent || [];
  const skillRoot = path.join(target, 'skills');
  const removedSkills = [];
  for (const name of skillsForRuntime('opencode')) {
    if (removeManaged(path.join(skillRoot, name), `OpenCode skill ${name}`)) removedSkills.push(name);
  }
  const pluginFile = path.join(target, 'plugins', `${PLUGIN_NAME}.js`);
  if (fs.existsSync(pluginFile) && fs.readFileSync(pluginFile, 'utf8').startsWith(PLUGIN_MARKER)) fs.unlinkSync(pluginFile);
  cleanupRetired(target);
  const removedBundle = removeManaged(pluginRoot, 'OpenCode bundle');
  const cleaned = pruneCreatedEmpty(target, cleanupAbsent);
  return {
    target: pluginRoot, pluginRoot,
    removed: { bundle: removedBundle, skills: removedSkills },
    cleaned,
  };
}

module.exports = {
  name: 'opencode',
  PLUGIN_NAME,
  buildHooksManifest,
  resolveTarget,
  install,
  doctor,
  uninstall,
};
