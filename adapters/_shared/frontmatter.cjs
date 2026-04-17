'use strict';

// YAML frontmatter parsing / serialization for markdown assets.
// Every runtime adapter consumes this — OpenCode lowercases keys,
// Gemini extracts description for toml, Claude preserves verbatim.

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

function lowercaseKeys(obj) {
  if (Array.isArray(obj)) return obj.map(lowercaseKeys);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.toLowerCase()] = lowercaseKeys(v);
  }
  return out;
}

function patch(text, patchFn) {
  const { fm, body } = parse(text);
  const nextFm = patchFn(fm ? { ...fm } : {});
  return serialize(nextFm, body);
}

module.exports = { parse, serialize, lowercaseKeys, patch };
