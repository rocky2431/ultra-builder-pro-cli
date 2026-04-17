'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mdCommandToToml } = require('../md-to-toml.cjs');

test('mdCommandToToml extracts description from frontmatter', () => {
  const md = [
    '---',
    'description: Initialize project',
    'workflow-ref: "@skills/ultra-init/SKILL.md"',
    '---',
    '',
    '# /ultra-init',
    'body content here',
  ].join('\n');

  const toml = mdCommandToToml(md);
  assert.match(toml, /description = "Initialize project"/);
  assert.match(toml, /prompt = """/);
  assert.match(toml, /body content here/);
  assert.match(toml, /workflow reference: @skills\/ultra-init\/SKILL\.md/);
});

test('mdCommandToToml includes mcp_tools_required and cli_fallback when present', () => {
  const md = [
    '---',
    'description: plan tasks',
    'mcp_tools_required:',
    '  - task.create',
    '  - ask.question',
    'cli_fallback: "task create"',
    '---',
    'body',
  ].join('\n');

  const toml = mdCommandToToml(md);
  assert.match(toml, /MCP tools required: task\.create, ask\.question/);
  assert.match(toml, /CLI fallback: ultra-tools task create/);
});

test('mdCommandToToml defaults description when frontmatter absent', () => {
  const md = '# plain markdown, no frontmatter';
  const toml = mdCommandToToml(md);
  assert.match(toml, /description = "Ultra Builder Pro command"/);
  assert.match(toml, /plain markdown, no frontmatter/);
});
