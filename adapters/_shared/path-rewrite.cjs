'use strict';

// Path-rewriting helpers for workflow-ref resolution per runtime.
// The canonical form in commands/*.md is `@skills/<name>/SKILL.md`. Each
// runtime stores skills under a different root — this module converts
// the symbolic ref into a concrete path (or leaves it symbolic for
// runtimes that understand the shorthand).

const path = require('node:path');

const SKILL_REF_RE = /^@skills\/([a-z][a-z0-9\-]*)\/SKILL\.md$/;

const RUNTIME_SKILL_ROOT = {
  claude: '.claude/skills',
  opencode: '.config/opencode/skills',
  codex: '.agents/skills',
  gemini: '.gemini/extensions/ultra-builder-pro/skills',
};

function parseSkillRef(ref) {
  if (typeof ref !== 'string') return null;
  const m = ref.match(SKILL_REF_RE);
  if (!m) return null;
  return { name: m[1], filename: 'SKILL.md' };
}

function resolveSkillRef(ref, { runtime, homeDir }) {
  const parsed = parseSkillRef(ref);
  if (!parsed) throw new Error(`invalid skill ref: ${ref}`);
  const root = RUNTIME_SKILL_ROOT[runtime];
  if (!root) throw new Error(`unknown runtime: ${runtime}`);
  return path.join(homeDir, root, parsed.name, parsed.filename);
}

function rewriteWorkflowRefInText(text, { runtime, homeDir }) {
  return text.replace(/@skills\/([a-z][a-z0-9\-]*)\/SKILL\.md/g, (match) => {
    const parsed = parseSkillRef(match);
    if (!parsed) return match;
    return resolveSkillRef(match, { runtime, homeDir });
  });
}

function resolveAssetTarget(srcRel, { runtime, scope, homeDir, cwd }) {
  const base = scope === 'global'
    ? path.join(homeDir, runtimeRoot(runtime))
    : path.join(cwd, localRoot(runtime));
  return path.join(base, srcRel);
}

function runtimeRoot(runtime) {
  switch (runtime) {
    case 'claude': return '.claude';
    case 'opencode': return '.config/opencode';
    case 'codex': return '.agents';
    case 'gemini': return '.gemini/extensions/ultra-builder-pro';
    default: throw new Error(`unknown runtime: ${runtime}`);
  }
}

function localRoot(runtime) {
  switch (runtime) {
    case 'claude': return '.claude';
    case 'opencode': return '.opencode';
    case 'codex': return '.agents';
    case 'gemini': return '.gemini/extensions/ultra-builder-pro';
    default: throw new Error(`unknown runtime: ${runtime}`);
  }
}

module.exports = {
  SKILL_REF_RE,
  RUNTIME_SKILL_ROOT,
  parseSkillRef,
  resolveSkillRef,
  rewriteWorkflowRefInText,
  resolveAssetTarget,
  runtimeRoot,
  localRoot,
};
