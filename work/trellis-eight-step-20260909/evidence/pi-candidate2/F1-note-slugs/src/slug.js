'use strict';

// Build a filesystem- and URL-safe slug for a note title.
// Everything outside [a-z0-9] is treated as a separator, which is why a title
// written entirely in non-ASCII characters collapses to an empty string.
function slugify(title) {
  const rawTitle = String(title);
  const slug = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug) return slug;

  // Preserve a deterministic, safe identity when the title has no ASCII
  // characters to keep. Encoding code points avoids collapsing distinct
  // non-ASCII titles to the same empty slug.
  const codePoints = Array.from(rawTitle, (character) =>
    character.codePointAt(0).toString(16),
  );
  return `unicode-${codePoints.join('-') || 'empty'}`;
}

module.exports = { slugify };
