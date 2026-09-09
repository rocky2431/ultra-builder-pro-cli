'use strict';

const { slugify } = require('./slug');

// Sibling consumer: every note is stored as `<slug>.md`, so two different
// titles must never produce the same filename.
function noteFilename(title) {
  return `${slugify(title)}.md`;
}

function noteFilenames(titles) {
  return titles.map(noteFilename);
}

module.exports = { noteFilename, noteFilenames };
