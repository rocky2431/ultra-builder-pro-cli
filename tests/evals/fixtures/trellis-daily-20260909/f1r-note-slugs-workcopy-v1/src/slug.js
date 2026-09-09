'use strict';

// Build a filesystem- and URL-safe slug for a note title.
// Everything outside [a-z0-9] is treated as a separator, which is why a title
// written entirely in non-ASCII characters collapses to an empty string.
function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
