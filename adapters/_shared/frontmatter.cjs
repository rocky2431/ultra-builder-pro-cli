'use strict';

// YAML frontmatter parsing / serialization for markdown assets.
// Claude Code and Codex preserve their native metadata contracts.

const yaml = require('js-yaml');

const DELIMITER = '---';

function parse(text) {
  if (typeof text !== 'string') throw new TypeError('parse() expects string');
  if (!text.startsWith(DELIMITER)) {
    return { fm: null, body: text, bodyStart: 0 };
  }
  const end = text.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (end === -1) {
    return { fm: null, body: text, bodyStart: 0 };
  }
  const raw = text.slice(DELIMITER.length, end).trim();
  const fm = yaml.load(raw) || null;
  // end points at "\n---"; skip "\n---" (4 chars) to land on whatever follows the closing delimiter
  const bodyStart = end + DELIMITER.length + 1;
  let body = text.slice(bodyStart);
  // Strip leading blank line(s) separating frontmatter from body (Markdown convention)
  body = body.replace(/^\n+/, '');
  return { fm, body, bodyStart };
}

function serialize(fm, body = '') {
  if (fm == null) return body;
  const yamlBody = yaml.dump(fm, { lineWidth: -1, noRefs: true }).trimEnd();
  return `${DELIMITER}\n${yamlBody}\n${DELIMITER}\n${body}`;
}

module.exports = { parse, serialize };
