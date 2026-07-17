#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..', '..');
const skillsRoot = path.join(repoRoot, 'skills');
const schemaPath = path.join(__dirname, '..', 'schemas', 'skill-manifest.schema.json');
const {
  CORE_PUBLIC_SKILLS,
  INTERNAL_AGENT_SKILLS,
  SUPPORTED_RUNTIMES,
  skillsForRuntime,
} = require('../../adapters/_shared/runtime-assets.cjs');

const packagedSkills = new Set(SUPPORTED_RUNTIMES.flatMap((runtime) => skillsForRuntime(runtime)));
const neutralSkills = new Set([...CORE_PUBLIC_SKILLS, ...INTERNAL_AGENT_SKILLS]);
const forbiddenPromptPatterns = [
  [/\p{Script=Han}/u, 'Han-script instruction text'],
  [/\bpre-Phase\b|\bPhase\s+\d+\.\d+\b|\bv4\.4\b|\bv4\.5\b/i, 'release or migration history'],
  [/\bContext7\b|mcp__context7|\bExa MCP\b|mcp__exa/i, 'external tool binding'],
  [/\b90%\+?\s+confidence\b|\b80%\s+overall\b|\b100%\s+Functional Core\b/i, 'unsupported global threshold'],
  [/\bFlag as\s+(?:an?\s+)?(?:P[0-3]|orphan|horizontal)|\bRequired Test\b|\/\/\s*(?:Bad|Good):/i, 'mechanical pattern-to-verdict teaching'],
  [/\bFunction\s*>\s*\d+\s+lines\b|\bNesting depth\s*>\s*\d+|\baggregate score\b/i, 'arbitrary design threshold'],
];
const hostBinding = /\bClaude Code\b|\bOpenCode\b|\bCodex\b|\bKimi(?: Code)?\b|AskUserQuestion|TaskCreate|TaskUpdate|TaskList|\$CLAUDE_PLUGIN_ROOT|~\/\.claude|(^|[\s`(>])\/(?:ultra-[a-z-]+|learn)(?=$|[\s`,.;):])/m;

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  return yaml.load(text.slice(3, end));
}

function markdownFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(file));
    else if (file.endsWith('.md')) files.push(file);
  }
  return files;
}

if (!fs.existsSync(schemaPath) || !fs.existsSync(skillsRoot)) {
  console.error('skill schema or skills directory is missing');
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
const failures = [];

const roots = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const unexpected = roots.filter((name) => !packagedSkills.has(name));
const missing = [...packagedSkills].filter((name) => !roots.includes(name)).sort();
if (unexpected.length) failures.push(`unexpected skill roots: ${unexpected.join(', ')}`);
if (missing.length) failures.push(`missing packaged skill roots: ${missing.join(', ')}`);

for (const name of [...packagedSkills].sort()) {
  const root = path.join(skillsRoot, name);
  const skillFile = path.join(root, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    failures.push(`${name}: missing SKILL.md`);
    continue;
  }

  const text = fs.readFileSync(skillFile, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) {
    failures.push(`${name}: missing or invalid YAML frontmatter`);
    continue;
  }
  if (!validate(fm)) {
    failures.push(`${name}: ${validate.errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
  }
  if (fm.name !== name) failures.push(`${name}: frontmatter name must match directory`);
  if (!/\bUse(?: only)? when\b/i.test(String(fm.description || ''))) {
    failures.push(`${name}: description must state when to use the skill`);
  }
  const lines = text.split('\n').length;
  if (lines > 500) failures.push(`${name}: SKILL.md has ${lines} lines; Agent Skills recommends at most 500`);

  for (const file of markdownFiles(root)) {
    const contents = fs.readFileSync(file, 'utf8');
    for (const [pattern, label] of forbiddenPromptPatterns) {
      if (pattern.test(contents)) failures.push(`${path.relative(repoRoot, file)}: contains ${label}`);
    }
    if (neutralSkills.has(name) && hostBinding.test(contents)) {
      failures.push(`${path.relative(repoRoot, file)}: contains host-specific invocation text`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.error(`skills: ${failures.length} authoring contract failure(s)`);
  process.exit(1);
}

console.log(`skills: ${packagedSkills.size}/${packagedSkills.size} passed portable authoring contract`);
