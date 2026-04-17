'use strict';

// Convert a thin-shell command .md file to a Gemini custom-command TOML.
// Gemini commands live in `~/.gemini/commands/<name>.toml` with shape:
//
//   description = "…"
//   prompt = """
//   <command body>
//   """
//
// Only the description (from frontmatter) and the body text cross over.
// Frontmatter keys like `workflow-ref` are inlined into the prompt so the
// agent still sees the skill reference.

const { parse: parseFrontmatter } = require('./frontmatter.cjs');

function escapeTomlLiteral(str) {
  // Gemini accepts """multi-line""" literals. Escape any triple-quote to be safe.
  return String(str).replace(/"""/g, '\\"\\"\\"');
}

function buildPromptSection(fm, body) {
  const lines = [];
  if (fm && fm['workflow-ref']) {
    lines.push(`[ultra-builder-pro] workflow reference: ${fm['workflow-ref']}`);
  }
  if (fm && Array.isArray(fm.mcp_tools_required) && fm.mcp_tools_required.length > 0) {
    lines.push(`[ultra-builder-pro] MCP tools required: ${fm.mcp_tools_required.join(', ')}`);
  }
  if (fm && fm.cli_fallback) {
    lines.push(`[ultra-builder-pro] CLI fallback: ultra-tools ${fm.cli_fallback}`);
  }
  if (lines.length > 0) lines.push('');
  lines.push(body.trimEnd());
  return lines.join('\n');
}

function mdCommandToToml(mdText) {
  if (typeof mdText !== 'string') throw new TypeError('mdCommandToToml: expects string');
  const { fm, body } = parseFrontmatter(mdText);
  const description = (fm && fm.description) || 'Ultra Builder Pro command';
  const prompt = buildPromptSection(fm, body);

  const tomlLines = [
    `description = ${JSON.stringify(description)}`,
    'prompt = """',
    escapeTomlLiteral(prompt),
    '"""',
    '',
  ];
  return tomlLines.join('\n');
}

module.exports = { mdCommandToToml };
