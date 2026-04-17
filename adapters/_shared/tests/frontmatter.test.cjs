'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parse, serialize, lowercaseKeys, patch } = require('../frontmatter.cjs');

test('parse extracts frontmatter and body; degraded inputs survive', () => {
  const withFm = '---\ndescription: hi\nmodel: opus\n---\n\n# Hello\n';
  const out = parse(withFm);
  assert.equal(out.fm.description, 'hi');
  assert.equal(out.fm.model, 'opus');
  assert.ok(out.body.startsWith('# Hello'));

  // no delimiter at all
  const plain = parse('# No frontmatter\n');
  assert.equal(plain.fm, null);
  assert.equal(plain.body, '# No frontmatter\n');

  // delimiter open but never closed — treat as plain text
  const unclosed = parse('---\nfoo: 1\nno closing delimiter\n');
  assert.equal(unclosed.fm, null);
  assert.ok(unclosed.body.includes('no closing delimiter'));

  // type guard
  assert.throws(() => parse(42), /expects string/);
});

test('serialize → parse round-trip preserves data', () => {
  const fm = { description: 'round-trip', tags: ['a', 'b'] };
  const body = '# Body\n\nparagraph\n';
  const text = serialize(fm, body);
  const { fm: got, body: gotBody } = parse(text);
  assert.deepEqual(got, fm);
  assert.equal(gotBody, body);
});

test('lowercaseKeys normalizes nested frontmatter (OpenCode contract)', () => {
  const input = { Name: 'X', TAGS: ['T1'], Nested: { Key: 1 } };
  const out = lowercaseKeys(input);
  assert.deepEqual(out, { name: 'X', tags: ['T1'], nested: { key: 1 } });

  // patch() should let callers transform fm in-place
  const patched = patch('---\nFoo: 1\n---\nbody', (fm) => ({ foo: fm.Foo }));
  const { fm } = parse(patched);
  assert.deepEqual(fm, { foo: 1 });
});
