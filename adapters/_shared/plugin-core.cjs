'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  copyTree,
  ensureDir,
  isManaged,
  markManaged,
  removeTree,
  writeAtomic,
} = require('./file-ops.cjs');
const { parse, serialize } = require('./frontmatter.cjs');
const provenance = require('./provenance.cjs');
const {
  MODEL_INVOKED_SKILLS,
  WORKFLOW_HOOK_FILES,
  skillPolicy,
  skillsForRuntime,
} = require('./runtime-assets.cjs');

const PROVENANCE_FILE = 'provenance.json';

function titleCase(name) {
  return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function skillFrontmatter(runtime, name, fm) {
  const base = { name, description: String(fm.description || '') };
  const policy = skillPolicy(name);
  if (runtime === 'claude' || runtime === 'grok') {
    return {
      ...base,
      'user-invocable': policy.userInvocable,
      ...(policy.userInvocable ? { 'disable-model-invocation': true } : {}),
    };
  }
  if (runtime === 'kimi') {
    return {
      ...base,
      ...(policy.userInvocable ? { disableModelInvocation: true } : {}),
    };
  }
  return base;
}

function codexMetadata(name, description) {
  const short = String(description).replace(/\s+/g, ' ').trim().slice(0, 64).replace(/[\s.,;:]+$/, '');
  return [
    'interface:',
    `  display_name: ${JSON.stringify(titleCase(name))}`,
    `  short_description: ${JSON.stringify(short || titleCase(name))}`,
    `  default_prompt: ${JSON.stringify(`Use $ultra-builder-pro:${name} and follow its workflow.`)}`,
    'policy:',
    `  allow_implicit_invocation: ${MODEL_INVOKED_SKILLS.includes(name) ? 'true' : 'false'}`,
    '',
  ].join('\n');
}

function copySkills({ runtime, repoRoot, skillRoot }) {
  const installed = [];
  for (const name of skillsForRuntime(runtime)) {
    const source = path.join(repoRoot, 'skills', name);
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`missing allowlisted ${runtime} skill: ${name}`);
    }
    const target = path.join(skillRoot, name);
    copyTree(source, target, {
      transform(buffer, relative) {
        if (relative !== 'SKILL.md') return buffer;
        const { fm, body } = parse(buffer.toString('utf8'));
        if (!fm) throw new Error(`missing frontmatter in ${name}`);
        return Buffer.from(serialize(skillFrontmatter(runtime, name, fm), body));
      },
    });
    if (name === 'ultra-init') {
      const template = path.join(repoRoot, '.ultra-template');
      if (!fs.existsSync(template)) throw new Error('missing canonical .ultra-template');
      copyTree(template, path.join(target, 'assets', 'project-template'));
    }
    if (runtime === 'codex') {
      const { fm } = parse(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'));
      writeAtomic(
        path.join(target, 'agents', 'openai.yaml'),
        codexMetadata(name, fm.description),
      );
    }
    installed.push(name);
  }
  return installed;
}

function copyHooks({ runtime, repoRoot, hookRoot, hooksManifest }) {
  ensureDir(hookRoot);
  for (const name of [...WORKFLOW_HOOK_FILES, '_common.py']) {
    const source = path.join(repoRoot, 'hooks', name);
    if (!fs.existsSync(source)) throw new Error(`missing allowlisted hook: ${name}`);
    fs.copyFileSync(source, path.join(hookRoot, name));
  }
  if (['codex', 'kimi', 'grok'].includes(runtime)) {
    ensureDir(path.join(hookRoot, 'adapters'));
    fs.copyFileSync(
      path.join(repoRoot, 'hooks', 'adapters', `${runtime}.py`),
      path.join(hookRoot, 'adapters', `${runtime}.py`),
    );
  }
  writeAtomic(path.join(hookRoot, 'hooks.json'), `${JSON.stringify(hooksManifest, null, 2)}\n`);
  return [...WORKFLOW_HOOK_FILES];
}

function writePluginProvenance({ adapter, repoRoot, stagingRoot, publishedRoot, contracts = {} }) {
  const source = provenance.packageSource(repoRoot);
  return provenance.writeProvenance({
    file: path.join(stagingRoot, PROVENANCE_FILE),
    adapter,
    ...source,
    roots: { plugin: publishedRoot },
    assetRoots: { plugin: stagingRoot },
    assets: provenance.assetRefsForTree('plugin', stagingRoot, {
      exclude: ['.ubp-managed', PROVENANCE_FILE],
    }),
    contracts,
  });
}

function publishManagedTrees(entries) {
  const transaction = [];
  for (const { source, target, label } of entries) {
    if (fs.existsSync(target) && !isManaged(target)) {
      throw new Error(`refusing to replace unmanaged ${label}: ${target}`);
    }
    ensureDir(path.dirname(target));
  }
  try {
    for (const { source, target } of entries) {
      const backup = `${target}.ubp-backup-${crypto.randomUUID()}`;
      if (fs.existsSync(target)) fs.renameSync(target, backup);
      fs.renameSync(source, target);
      transaction.push({ target, backup });
    }
    for (const { backup } of transaction) {
      if (fs.existsSync(backup)) removeTree(backup);
    }
  } catch (error) {
    for (const { target, backup } of transaction.reverse()) {
      if (fs.existsSync(target)) removeTree(target);
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
    }
    throw error;
  }
}

function inspectPlugin({ adapter, repoRoot, pluginRoot, skillRoot, hookRoot, manifestFile }) {
  const source = provenance.packageSource(repoRoot);
  const report = provenance.inspectProvenance({
    file: path.join(pluginRoot, PROVENANCE_FILE),
    expectedAdapter: adapter,
    expectedPackageVersion: source.packageInfo.version,
  });
  const issue = (code, details = {}) => report.issues.push({ code, ...details });
  if (!fs.existsSync(manifestFile)) issue('PLUGIN_MANIFEST_MISSING', { path: manifestFile });
  for (const name of skillsForRuntime(adapter)) {
    if (!fs.existsSync(path.join(skillRoot, name, 'SKILL.md'))) {
      issue('SKILL_MISSING', { skill: name });
    }
  }
  for (const name of [...WORKFLOW_HOOK_FILES, '_common.py']) {
    if (!fs.existsSync(path.join(hookRoot, name))) issue('HOOK_MISSING', { hook: name });
  }
  for (const retired of ['commands', 'agents', 'runtime', '.mcp.json']) {
    if (fs.existsSync(path.join(pluginRoot, retired))) issue('RETIRED_ASSET_PRESENT', { path: retired });
  }
  report.checks.skill_inventory = {
    status: report.issues.some((entry) => entry.code === 'SKILL_MISSING') ? 'fail' : 'pass',
  };
  report.checks.hook_inventory = {
    status: report.issues.some((entry) => entry.code === 'HOOK_MISSING') ? 'fail' : 'pass',
  };
  report.checks.plugin_manifest = {
    status: fs.existsSync(manifestFile) ? 'pass' : 'fail',
  };
  report.status = report.issues.length === 0 ? 'healthy' : 'degraded';
  return report;
}

function removeManaged(target, label) {
  if (!fs.existsSync(target)) return false;
  if (!isManaged(target)) throw new Error(`refusing to remove unmanaged ${label}: ${target}`);
  removeTree(target);
  return true;
}

module.exports = {
  PROVENANCE_FILE,
  copySkills,
  copyHooks,
  inspectPlugin,
  markManaged,
  publishManagedTrees,
  removeManaged,
  writePluginProvenance,
};
