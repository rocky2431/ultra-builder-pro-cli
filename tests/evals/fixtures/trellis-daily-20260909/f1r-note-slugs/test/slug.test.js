'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { slugify } = require('../src/slug');

// Frozen acceptance: existing ASCII slugs must not change, because notes
// already on disk are addressed by them.
test('an ASCII title keeps its current slug', () => {
  assert.equal(slugify('Weekly Review 2026'), 'weekly-review-2026');
  assert.equal(slugify('  Trailing and  spaces '), 'trailing-and-spaces');
});

// Frozen acceptance: a title with no ASCII letters still needs a usable slug.
test('a non-ASCII title produces a non-empty slug', () => {
  assert.notEqual(slugify('季度复盘'), '');
});

test('two different non-ASCII titles produce different slugs', () => {
  assert.notEqual(slugify('季度复盘'), slugify('周会记录'));
});

test('the same title always produces the same slug', () => {
  assert.equal(slugify('季度复盘'), slugify('季度复盘'));
});
