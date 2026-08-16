#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const MAX_STDIN_BYTES = 8 * 1024 * 1024;
const STDIN_CHUNK_BYTES = 64 * 1024;

const REQUIRED_HEADINGS = [
  'Acceptance and Revision',
  'Problem Reality',
  'First-Principle Propositions',
  'Value Causal Chain',
  'North Star Outcomes',
  'Hard Constraints',
  'Explicit Exclusions',
  'Uncertainties and Revisit Triggers',
  'Research Trace',
];

const V2_ONLY_HEADINGS = new Set([
  'Acceptance and Revision',
  'Problem Reality',
  'First-Principle Propositions',
  'Value Causal Chain',
  'North Star Outcomes',
  'Uncertainties and Revisit Triggers',
]);

const LEGACY_V026_HEADINGS = ['Project Direction', 'North Star Outcome', 'Hard Constraints'];
const LEGACY_V026_ALLOWED = new Set([
  ...LEGACY_V026_HEADINGS,
  'Explicit Exclusions',
  'Research Trace',
  'Notes for agents',
]);
const LEGACY_ONE_LINE_ALLOWED = new Set([
  'One-line',
  'Hard Constraints',
  'Explicit Exclusions',
  'Research Trace',
]);

const ENTRY_FIELDS = {
  FP: ['Proposition', 'Evidence', 'Causal consequence', 'Falsifier or revisit trigger', 'Status'],
  NS: ['Outcome', 'Observation method', 'Baseline', 'Target or expected change', 'Horizon', 'Anti-metric'],
  HC: ['Protected value or threat', 'Constraint', 'Authority or evidence', 'Revisit condition'],
};

const OWNER_SECTION = {
  FP: 'First-Principle Propositions',
  NS: 'North Star Outcomes',
  HC: 'Hard Constraints',
};

const UNRESEARCHED_ACCEPTANCE = new Map([
  ['Schema', 'north-star-v2'],
  ['Status', 'unresearched'],
  ['Revision', 'none'],
  ['Owner acceptance source', 'none'],
  ['Acceptance time', 'not-recorded'],
  ['Supersedes', 'none'],
]);

const UNRESEARCHED_SECTION_BODIES = new Map([
  ['Problem Reality', '- Reality: [NEEDS RESEARCH]\n- Evidence: [NEEDS RESEARCH]\n- Unknowns: [NEEDS RESEARCH]'],
  ['First-Principle Propositions', '[NEEDS RESEARCH: Research creates stable proposition IDs only after owner acceptance.]'],
  ['Value Causal Chain', '[NEEDS RESEARCH: map accepted principles through capability and behavior to outcomes.]'],
  ['North Star Outcomes', '[NEEDS RESEARCH: do not create an outcome ID or metric during Init.]'],
  ['Hard Constraints', '[NEEDS RESEARCH: do not create a constraint ID during Init.]'],
  ['Explicit Exclusions', '- [NEEDS RESEARCH]'],
  ['Uncertainties and Revisit Triggers', '- [NEEDS RESEARCH]'],
  ['Research Trace', '- Project Brief: `project-brief.md`\n- Research runs: none\n- Sources and decisions: none'],
]);

// Mechanical checksum of the complete packaged placeholder bytes. The owner-readable
// `.ultra-template/north-star.md` remains canonical; this digest makes every title,
// preamble, field, sentinel, interstitial byte, and trailing newline part of Init's
// exact unresearched grammar.
const UNRESEARCHED_CANONICAL_SHA256 = '7fb743650b3f520eb1880cd0cc5ef31957f0719d24585ca1447cb1e2cc7c3000';

function stripMarkup(value) {
  return value.trim().replace(/^`|`$/g, '');
}

function renderedDocument(rawText) {
  const renderedLines = [];
  let fence = null;
  for (const match of rawText.matchAll(/[^\n]*(?:\n|$)/gu)) {
    if (!match[0]) continue;
    const withoutNewline = match[0].endsWith('\n') ? match[0].slice(0, -1) : match[0];
    const line = withoutNewline.endsWith('\r')
      ? withoutNewline.slice(0, -1)
      : withoutNewline;
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    let rendered = true;
    if (fence) {
      rendered = false;
      if (fenceMatch
          && fenceMatch[1][0] === fence.marker
          && fenceMatch[1].length >= fence.length
          && /^[ \t]*$/u.test(fenceMatch[2])) {
        fence = null;
      }
    } else if (fenceMatch
        && !(fenceMatch[1][0] === '`' && fenceMatch[2].includes('`'))) {
      rendered = false;
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
    }
    renderedLines.push(
      rendered ? match[0] : match[0].replace(/[^\r\n]/g, ' '),
    );
  }
  return {
    raw: rawText,
    rendered: renderedLines.join(''),
  };
}

function topLevelSections(renderedText) {
  const matches = [...renderedText.matchAll(/^## ([^\n]+)\n/gmu)];
  return matches.map((match, index) => ({
    name: match[1].trim(),
    start: match.index,
    bodyStart: match.index + match[0].length,
    end: index + 1 < matches.length ? matches[index + 1].index : renderedText.length,
    body: renderedText.slice(
      match.index + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : renderedText.length,
    ),
  }));
}

function firstSections(sectionList) {
  const found = new Map();
  for (const section of sectionList) {
    if (!found.has(section.name)) found.set(section.name, section.body);
  }
  return found;
}

function parsedFields(body) {
  const found = new Map();
  const counts = new Map();
  for (const match of body.matchAll(/^- ([^:\n]+):\s*(.*)$/gmu)) {
    const name = match[1].trim();
    counts.set(name, (counts.get(name) || 0) + 1);
    if (!found.has(name)) found.set(name, stripMarkup(match[2]));
  }
  return {
    values: found,
    duplicates: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  };
}

function semanticEntries(body) {
  const headings = [...body.matchAll(/^### ((FP|NS|HC)-[A-Za-z0-9][A-Za-z0-9._-]*)\b[^\n]*\n/gmu)];
  return headings.map((match, index) => ({
    id: match[1],
    kind: match[2],
    body: body.slice(
      match.index + match[0].length,
      index + 1 < headings.length ? headings[index + 1].index : body.length,
    ),
  }));
}

function diagnostic(code, message, location = null, severity = 'error') {
  return { code, severity, message, location };
}

function headingSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-');
}

function renderedHeadings(renderedText) {
  const headings = [];
  for (const match of renderedText.matchAll(/[^\n]*(?:\n|$)/gu)) {
    if (!match[0]) continue;
    const withoutNewline = match[0].endsWith('\n') ? match[0].slice(0, -1) : match[0];
    const line = withoutNewline.endsWith('\r')
      ? withoutNewline.slice(0, -1)
      : withoutNewline;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/u);
    if (heading) {
      headings.push({
        index: match.index,
        bodyStart: match.index + match[0].length,
        level: heading[1].length,
        title: heading[2],
      });
    }
  }
  return headings;
}

function anchoredSections(renderedText, slug) {
  const headings = renderedHeadings(renderedText);
  return headings
    .map((heading, index) => {
      const next = headings.slice(index + 1).find(
        (candidate) => candidate.level <= heading.level,
      );
      return {
        slug: headingSlug(heading.title),
        body: renderedText.slice(
          heading.bodyStart,
          next ? next.index : renderedText.length,
        ),
      };
    })
    .filter((section) => section.slug === slug);
}

function validateOwnerRecord(body, diagnostics) {
  const values = new Map();
  const counts = new Map();
  for (const match of body.matchAll(/^- ([^:\n]+):[ \t]*(.*)$/gmu)) {
    const name = match[1].trim();
    counts.set(name, (counts.get(name) || 0) + 1);
    if (!values.has(name)) values.set(name, stripMarkup(match[2]));
  }
  for (const name of [
    'Conversation scope',
    'Exact raw owner acceptance',
    'Agency boundary',
    'Time boundary',
    'Revision boundary',
  ]) {
    const location = `Owner Record.${name}`;
    if (!values.has(name)) {
      diagnostics.push(diagnostic(
        'owner_record_field_missing',
        `Accepted Owner Record requires ${name}`,
        location,
      ));
    } else if (!values.get(name)) {
      diagnostics.push(diagnostic(
        'owner_record_field_empty',
        `Accepted Owner Record requires nonempty ${name}`,
        location,
      ));
    }
    if ((counts.get(name) || 0) > 1) {
      diagnostics.push(diagnostic(
        'duplicate_owner_record_field',
        `Accepted Owner Record repeats ${name}`,
        location,
      ));
    }
  }
}

function gitBlobDigest(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function pathIsWithin(file, directory) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function acceptedAuthorityContext(file, diagnostics) {
  const canonical = path.resolve(file);
  if (path.basename(canonical) !== 'north-star.md'
      || path.basename(path.dirname(canonical)) !== '.ultra') {
    diagnostics.push(diagnostic(
      'invalid_authority_path',
      'An accepted North Star authority must use the canonical repository path .ultra/north-star.md',
      canonical,
    ));
    return null;
  }
  const root = path.dirname(path.dirname(canonical));
  try {
    const rootReal = fs.realpathSync(root);
    const canonicalReal = fs.realpathSync(canonical);
    const expectedReal = path.join(rootReal, '.ultra', 'north-star.md');
    if (canonicalReal !== expectedReal || !pathIsWithin(canonicalReal, rootReal)) {
      diagnostics.push(diagnostic(
        'authority_path_escape',
        'Canonical .ultra/north-star.md must resolve inside its repository without a symlink escape',
        canonical,
      ));
      return null;
    }
    return { root, rootReal };
  } catch {
    diagnostics.push(diagnostic(
      'authority_path_unresolved',
      'Canonical .ultra/north-star.md could not be resolved for accepted publication',
      canonical,
    ));
    return null;
  }
}

function resolveBoundFile(context, relative, prefix, missingCode, escapeCode, diagnostics) {
  const candidate = path.resolve(context.root, relative);
  try {
    const candidateReal = fs.realpathSync(candidate);
    const expectedBase = path.join(context.rootReal, ...prefix.split('/').filter(Boolean));
    if (!pathIsWithin(candidateReal, expectedBase)) {
      diagnostics.push(diagnostic(
        escapeCode,
        `Bound path resolves outside ${prefix}`,
        relative,
      ));
      return null;
    }
    return candidateReal;
  } catch {
    diagnostics.push(diagnostic(missingCode, 'Bound artifact does not exist', relative));
    return null;
  }
}

function decodeUtf8(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
}

function normalizedRepositoryPath(value, prefix, suffixPattern) {
  if (typeof value !== 'string' || value.includes('\\') || path.posix.normalize(value) !== value) {
    return false;
  }
  return value.startsWith(prefix) && suffixPattern.test(value);
}

function bindingField(renderedDecisionText, name, diagnostics) {
  const expression = new RegExp(`^- ${name}:\\s*` + '`?([^\\n`]+)`?\\s*$', 'gmu');
  const matches = [...renderedDecisionText.matchAll(expression)];
  if (matches.length === 0) {
    diagnostics.push(diagnostic(
      'binding_field_missing',
      `Accepted owner decision requires ${name}`,
      name,
    ));
    return null;
  }
  if (matches.length > 1) {
    diagnostics.push(diagnostic(
      'duplicate_binding_field',
      `Accepted owner decision repeats ${name}`,
      name,
    ));
  }
  return matches[0][1].trim();
}

function validateOwnerDecisionStatus(renderedDecisionText, diagnostics) {
  const matches = [...renderedDecisionText.matchAll(/^> \*\*Status\*\*:\s*([^\n]+?)\s*$/gmu)];
  if (matches.length === 0) {
    diagnostics.push(diagnostic(
      'owner_decision_status_missing',
      'Accepted owner decision requires one authoritative Status field',
      'Status',
    ));
    return;
  }
  if (matches.length > 1) {
    diagnostics.push(diagnostic(
      'duplicate_owner_decision_status',
      'Accepted owner decision must contain exactly one authoritative Status field',
      'Status',
    ));
    return;
  }
  if (stripMarkup(matches[0][1]) !== 'accepted') {
    diagnostics.push(diagnostic(
      'owner_decision_not_accepted',
      'Owner decision Status must be accepted for accepted North Star publication',
      'Status',
    ));
  }
}

function validateAcceptanceBinding(file, bytes, ownerSource, diagnostics, sourceObservations) {
  const binding = {
    source: ownerSource || null,
    content_sha256: null,
    git_blob_digest: null,
    snapshot: null,
  };
  const sourceMatch = typeof ownerSource === 'string'
    ? ownerSource.match(/^(\.ultra\/decisions\/[A-Za-z0-9][A-Za-z0-9._-]*\.md)#([a-z0-9][a-z0-9-]*)$/u)
    : null;
  if (!sourceMatch
      || !normalizedRepositoryPath(sourceMatch[1], '.ultra/decisions/', /\.md$/u)) {
    diagnostics.push(diagnostic(
      'invalid_owner_source',
      'Owner acceptance source must be a normalized repository-relative .ultra/decisions/*.md#anchor reference',
      'Owner acceptance source',
    ));
    return binding;
  }

  const context = acceptedAuthorityContext(file, diagnostics);
  if (!context) return binding;
  const decisionFile = resolveBoundFile(
    context,
    sourceMatch[1],
    '.ultra/decisions',
    'owner_source_missing',
    'owner_source_path_escape',
    diagnostics,
  );
  if (!decisionFile) return binding;
  let decisionText;
  try {
    const decisionBytes = fs.readFileSync(decisionFile);
    sourceObservations.push({
      role: 'decision',
      path: sourceMatch[1],
      sha256: crypto.createHash('sha256').update(decisionBytes).digest('hex'),
      byte_length: decisionBytes.length,
    });
    decisionText = decodeUtf8(decisionBytes);
    if (decisionText === null) {
      diagnostics.push(diagnostic(
        'owner_source_invalid_utf8',
        'Owner acceptance source must be round-trip-safe UTF-8',
        ownerSource,
      ));
      return binding;
    }
  } catch {
    diagnostics.push(diagnostic('owner_source_missing', 'Owner acceptance source does not exist', ownerSource));
    return binding;
  }
  const decisionDocument = renderedDocument(decisionText);
  validateOwnerDecisionStatus(decisionDocument.rendered, diagnostics);
  const ownerSections = anchoredSections(decisionDocument.rendered, sourceMatch[2]);
  if (ownerSections.length !== 1) {
    diagnostics.push(diagnostic(
      'owner_anchor_missing',
      'Owner acceptance source anchor must resolve exactly once',
      ownerSource,
    ));
  } else {
    validateOwnerRecord(ownerSections[0].body, diagnostics);
  }

  const expectedContent = bindingField(
    decisionDocument.rendered,
    'North Star content SHA-256',
    diagnostics,
  );
  const expectedBlob = bindingField(
    decisionDocument.rendered,
    'North Star Git blob digest',
    diagnostics,
  );
  const snapshotRelative = bindingField(
    decisionDocument.rendered,
    'Accepted snapshot',
    diagnostics,
  );
  const contentSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const blobDigest = gitBlobDigest(bytes);
  binding.content_sha256 = expectedContent;
  binding.git_blob_digest = expectedBlob;
  binding.snapshot = snapshotRelative;

  if (expectedContent && !/^[0-9a-f]{64}$/u.test(expectedContent)) {
    diagnostics.push(diagnostic('invalid_binding_digest', 'North Star content SHA-256 must be 64 lowercase hexadecimal characters', 'North Star content SHA-256'));
  } else if (expectedContent && expectedContent !== contentSha) {
    diagnostics.push(diagnostic('content_digest_mismatch', 'Owner decision content SHA-256 does not match the accepted North Star bytes', 'North Star content SHA-256'));
  }
  if (expectedBlob && !/^[0-9a-f]{40}$/u.test(expectedBlob)) {
    diagnostics.push(diagnostic('invalid_binding_digest', 'North Star Git blob digest must be 40 lowercase hexadecimal characters', 'North Star Git blob digest'));
  } else if (expectedBlob && expectedBlob !== blobDigest) {
    diagnostics.push(diagnostic('git_blob_digest_mismatch', 'Owner decision Git blob digest does not match the accepted North Star bytes', 'North Star Git blob digest'));
  }

  if (snapshotRelative
      && !normalizedRepositoryPath(
        snapshotRelative,
        '.ultra/research/',
        /\/[A-Za-z0-9][A-Za-z0-9._-]*\.accepted\.md$/u,
      )) {
    diagnostics.push(diagnostic(
      'invalid_snapshot_path',
      'Accepted snapshot must be a normalized .ultra/research/<run-id>/*.accepted.md path',
      'Accepted snapshot',
    ));
  } else if (snapshotRelative) {
    const snapshotFile = resolveBoundFile(
      context,
      snapshotRelative,
      '.ultra/research',
      'snapshot_missing',
      'snapshot_path_escape',
      diagnostics,
    );
    if (snapshotFile) {
      try {
        const snapshot = fs.readFileSync(snapshotFile);
        sourceObservations.push({
          role: 'snapshot',
          path: snapshotRelative,
          sha256: crypto.createHash('sha256').update(snapshot).digest('hex'),
          byte_length: snapshot.length,
        });
        if (!snapshot.equals(bytes)) {
          diagnostics.push(diagnostic('snapshot_mismatch', 'Accepted snapshot is not byte-identical to the accepted North Star', snapshotRelative));
        }
      } catch {
        diagnostics.push(diagnostic('snapshot_missing', 'Accepted snapshot does not exist', snapshotRelative));
      }
    }
  }
  return binding;
}

function sectionSpans(rawText, sectionList) {
  const indexes = [...new Set(
    sectionList.flatMap((section) => [section.bodyStart, section.end]),
  )].sort((left, right) => left - right);
  const byteOffsets = new Map();
  let cursor = 0;
  let byteOffset = 0;
  for (const index of indexes) {
    byteOffset += Buffer.byteLength(rawText.slice(cursor, index), 'utf8');
    byteOffsets.set(index, byteOffset);
    cursor = index;
  }
  const spans = Object.create(null);
  for (const section of sectionList) {
    if (Object.prototype.hasOwnProperty.call(spans, section.name)) continue;
    spans[section.name] = {
      body_start: byteOffsets.get(section.bodyStart),
      body_end: byteOffsets.get(section.end),
    };
  }
  return spans;
}

function classifyDocument(document) {
  const sections = topLevelSections(document.rendered);
  const names = sections.map((section) => section.name);
  const hasV2Signal = /^- Schema:\s*`?north-star-v2`?\s*$/mu.test(document.rendered)
    || names.some((name) => V2_ONLY_HEADINGS.has(name));
  const hasLegacySignal = names.some((name) => [
    'One-line', 'Project Direction', 'North Star Outcome',
  ].includes(name));
  if (hasV2Signal && hasLegacySignal) return 'mixed';
  if (hasV2Signal) {
    if (names.length !== REQUIRED_HEADINGS.length
        || names.some((name, index) => name !== REQUIRED_HEADINGS[index])) {
      return 'unknown';
    }
    const acceptanceSection = sections[0];
    const parsed = parsedFields(acceptanceSection ? acceptanceSection.body : '');
    if (parsed.duplicates.includes('Schema') || parsed.duplicates.includes('Status')) return 'unknown';
    if (parsed.values.get('Schema') !== 'north-star-v2') return 'unknown';
    const status = parsed.values.get('Status');
    return ['accepted', 'draft', 'unresearched'].includes(status) ? status : 'unknown';
  }

  const unique = new Set(names);
  if (unique.size !== names.length) return 'unknown';
  const oneLineOrder = ['One-line', 'Hard Constraints', 'Explicit Exclusions', 'Research Trace'];
  if (names.length > 0
      && names[0] === 'One-line'
      && names.every((name) => oneLineOrder.includes(name))
      && names.every((name, index) => index === 0 || oneLineOrder.indexOf(name) > oneLineOrder.indexOf(names[index - 1]))) {
    return 'legacy';
  }
  const v026Order = [
    'Project Direction', 'North Star Outcome', 'Hard Constraints',
    'Explicit Exclusions', 'Research Trace', 'Notes for agents',
  ];
  if (LEGACY_V026_HEADINGS.every((name) => names.includes(name))
      && names.every((name) => v026Order.includes(name))
      && names.every((name, index) => index === 0 || v026Order.indexOf(name) > v026Order.indexOf(names[index - 1]))) {
    return 'legacy';
  }
  return 'unknown';
}

function classifyText(text) {
  return classifyDocument(renderedDocument(text));
}

function validateCausalChain(body, definitions, diagnostics) {
  let validRows = 0;
  const rows = body.split(/\r?\n/u).filter((line) => /^\s*\|.*\|\s*$/u.test(line));
  for (const line of rows) {
    const cells = line.trim().slice(1, -1).split('|').map((cell) => stripMarkup(cell));
    if (cells.length === 5 && cells[0] === 'Chain') continue;
    if (cells.length === 5 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    if (cells.length !== 5) {
      diagnostics.push(diagnostic('invalid_causal_chain', 'Causal-chain rows require exactly five cells', 'Value Causal Chain'));
      continue;
    }
    const [chainId, fpId, capability, behavior, nsId] = cells;
    const rowValid = /^VC-[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(chainId)
      && definitions.get(fpId) === 'FP'
      && capability.length > 0
      && behavior.length > 0
      && definitions.get(nsId) === 'NS';
    if (!rowValid) {
      diagnostics.push(diagnostic(
        'invalid_causal_chain',
        'A causal-chain row requires a VC id, resolving FP and NS references, and nonempty capability and behavior',
        chainId || 'Value Causal Chain',
      ));
      continue;
    }
    validRows += 1;
  }
  if (validRows === 0) {
    diagnostics.push(diagnostic(
      'missing_causal_chain',
      'A draft or accepted revision requires at least one valid causal-chain row',
      'Value Causal Chain',
    ));
  }
}

function validateV2(file, document, bytes, initialDiagnostics = []) {
  const diagnostics = [...initialDiagnostics];
  const sectionList = topLevelSections(document.rendered);
  const names = sectionList.map((section) => section.name);
  const byHeading = firstSections(sectionList);

  for (const heading of REQUIRED_HEADINGS) {
    const count = names.filter((name) => name === heading).length;
    if (count === 0) diagnostics.push(diagnostic('missing_heading', `Missing heading: ${heading}`, heading));
    if (count > 1) diagnostics.push(diagnostic('duplicate_heading', `Duplicate heading: ${heading}`, heading));
  }
  for (const name of names) {
    if (!REQUIRED_HEADINGS.includes(name)) {
      diagnostics.push(diagnostic('unexpected_heading', `Unexpected v2 heading: ${name}`, name));
    }
  }
  if (names.length !== REQUIRED_HEADINGS.length
      || names.some((name, index) => name !== REQUIRED_HEADINGS[index])) {
    diagnostics.push(diagnostic(
      'heading_order',
      'North Star v2 top-level headings must appear exactly once in the required order',
    ));
  }

  const parsedAcceptance = parsedFields(byHeading.get('Acceptance and Revision') || '');
  const acceptance = parsedAcceptance.values;
  for (const name of parsedAcceptance.duplicates) {
    diagnostics.push(diagnostic(
      'duplicate_field',
      `Acceptance and Revision repeats ${name}`,
      `Acceptance and Revision.${name}`,
    ));
  }
  for (const name of [
    'Schema', 'Status', 'Revision', 'Owner acceptance source', 'Acceptance time', 'Supersedes',
  ]) {
    if (!acceptance.get(name)) {
      diagnostics.push(diagnostic('missing_field', `Acceptance and Revision requires ${name}`, name));
    }
  }
  if (acceptance.get('Schema') && acceptance.get('Schema') !== 'north-star-v2') {
    diagnostics.push(diagnostic('invalid_schema', 'Schema must be north-star-v2', 'Schema'));
  }
  const status = acceptance.get('Status') || null;
  if (status && !['unresearched', 'draft', 'accepted'].includes(status)) {
    diagnostics.push(diagnostic('invalid_status', 'Status must be unresearched, draft, or accepted', 'Status'));
  }

  const definitions = new Map();
  const ids = { FP: [], NS: [], HC: [] };
  for (const section of sectionList) {
    for (const entry of semanticEntries(section.body)) {
      const { id, kind, body } = entry;
      if (definitions.has(id)) {
        diagnostics.push(diagnostic('duplicate_id', `Duplicate semantic ID: ${id}`, id));
        continue;
      }
      definitions.set(id, kind);
      ids[kind].push(id);
      if (section.name !== OWNER_SECTION[kind]) {
        diagnostics.push(diagnostic(
          'definition_wrong_section',
          `${id} must be defined under ${OWNER_SECTION[kind]}`,
          id,
        ));
      }
      const parsedEntryFields = parsedFields(body);
      const entryFields = parsedEntryFields.values;
      for (const name of parsedEntryFields.duplicates) {
        diagnostics.push(diagnostic('duplicate_field', `${id} repeats ${name}`, `${id}.${name}`));
      }
      for (const name of ENTRY_FIELDS[kind]) {
        if (!entryFields.get(name)) {
          diagnostics.push(diagnostic('missing_field', `${id} requires ${name}`, `${id}.${name}`));
        }
      }
      if (status === 'accepted' && kind === 'FP' && entryFields.get('Status') !== 'accepted') {
        diagnostics.push(diagnostic(
          'unaccepted_proposition',
          `${id} Status must be accepted in an accepted revision`,
          `${id}.Status`,
        ));
      }
    }
  }

  if (status === 'unresearched') {
    if (definitions.size > 0) {
      diagnostics.push(diagnostic(
        'placeholder_has_semantic_ids',
        'An unresearched placeholder must not define FP, NS, or HC IDs',
      ));
    }
    if (acceptance.get('Revision') && acceptance.get('Revision') !== 'none') {
      diagnostics.push(diagnostic('unresearched_revision', 'An unresearched placeholder must use Revision none', 'Revision'));
    }
    if (acceptance.get('Owner acceptance source') && acceptance.get('Owner acceptance source') !== 'none') {
      diagnostics.push(diagnostic('unresearched_owner_source', 'An unresearched placeholder must not claim owner acceptance', 'Owner acceptance source'));
    }
    const exactAcceptance = acceptance.size === UNRESEARCHED_ACCEPTANCE.size
      && [...UNRESEARCHED_ACCEPTANCE].every(([name, value]) => acceptance.get(name) === value);
    const exactSections = [...UNRESEARCHED_SECTION_BODIES].every(
      ([name, body]) => (byHeading.get(name) || '').trim() === body,
    );
    const exactBytes = crypto.createHash('sha256').update(bytes).digest('hex')
      === UNRESEARCHED_CANONICAL_SHA256;
    if (!exactAcceptance || !exactSections || !exactBytes) {
      diagnostics.push(diagnostic(
        'invalid_unresearched_placeholder',
        'An unresearched North Star must preserve the exact packaged placeholder bytes, fields, and sentinels',
      ));
    }
  }
  if (status === 'draft') {
    if (acceptance.get('Owner acceptance source') && acceptance.get('Owner acceptance source') !== 'none') {
      diagnostics.push(diagnostic(
        'draft_claims_owner_acceptance',
        'A mutable draft must use Owner acceptance source none',
        'Owner acceptance source',
      ));
    }
    if (acceptance.get('Acceptance time') && acceptance.get('Acceptance time') !== 'not-recorded') {
      diagnostics.push(diagnostic(
        'draft_claims_owner_acceptance',
        'A mutable draft cannot record an acceptance time',
        'Acceptance time',
      ));
    }
  }
  if (status === 'accepted') {
    if (!acceptance.get('Revision') || acceptance.get('Revision') === 'none') {
      diagnostics.push(diagnostic('accepted_revision_missing', 'An accepted revision must have a non-none Revision', 'Revision'));
    }
    if (!acceptance.get('Owner acceptance source') || acceptance.get('Owner acceptance source') === 'none') {
      diagnostics.push(diagnostic('accepted_owner_source_missing', 'An accepted revision must cite a non-none owner source', 'Owner acceptance source'));
    }
    for (const kind of ['FP', 'NS', 'HC']) {
      if (ids[kind].length === 0) {
        diagnostics.push(diagnostic('missing_definition', `Accepted revision requires at least one ${kind} definition`, kind));
      }
    }
    if (/\[(?:NEEDS CLARIFICATION|NEEDS RESEARCH(?:[^\]]*)?)\]/iu.test(document.rendered)) {
      diagnostics.push(diagnostic('unresolved_placeholder', 'Accepted revision contains an unresolved repository placeholder'));
    }
  }

  if (status === 'draft' || status === 'accepted') {
    validateCausalChain(byHeading.get('Value Causal Chain') || '', definitions, diagnostics);
  }

  const referencePattern = /\b(?:FP|NS|HC)-[A-Za-z0-9][A-Za-z0-9._-]*\b/gu;
  for (const id of new Set(document.rendered.match(referencePattern) || [])) {
    if (!definitions.has(id)) {
      diagnostics.push(diagnostic('dangling_reference', `Unresolved semantic reference: ${id}`, id));
    }
  }

  for (const name of [
    'Problem Reality', 'Value Causal Chain', 'Explicit Exclusions',
    'Uncertainties and Revisit Triggers', 'Research Trace',
  ]) {
    if (byHeading.has(name) && !byHeading.get(name).trim()) {
      diagnostics.push(diagnostic('empty_section', `Section must not be empty: ${name}`, name));
    }
  }

  const sourceObservations = [];
  const acceptanceBinding = status === 'accepted'
    ? validateAcceptanceBinding(
      file,
      bytes,
      acceptance.get('Owner acceptance source'),
      diagnostics,
      sourceObservations,
    )
    : null;

  return {
    $schema: 'ultra-north-star-validation-v1',
    path: file,
    kind: 'north-star-v2',
    status,
    revision: acceptance.get('Revision') || null,
    classification: classifyDocument(document),
    valid: diagnostics.every((item) => item.severity !== 'error'),
    ids,
    sections: sectionSpans(document.raw, sectionList),
    acceptance_binding: acceptanceBinding,
    source_observations: sourceObservations,
    diagnostics,
  };
}

function legacyReport(file, location, document, sectionList) {
  return {
    $schema: 'ultra-north-star-validation-v1',
    path: file,
    kind: 'legacy',
    status: 'legacy_unadopted',
    revision: null,
    classification: 'legacy',
    valid: true,
    ids: { FP: [], NS: [], HC: [] },
    sections: sectionSpans(document.raw, sectionList),
    source_observations: [],
    diagnostics: [diagnostic(
      'legacy_north_star',
      'Legacy authority is preserved; Research must propose an owner-accepted v2 replacement.',
      location,
      'advisory',
    )],
  };
}

function unknownReport(file, message = 'North Star schema is unknown or malformed') {
  return {
    $schema: 'ultra-north-star-validation-v1',
    path: file,
    kind: 'unknown',
    status: null,
    revision: null,
    classification: 'unknown',
    valid: false,
    ids: { FP: [], NS: [], HC: [] },
    sections: {},
    input: null,
    source_observations: [],
    diagnostics: [diagnostic('unknown_schema', message)],
  };
}

function validateDecodedText(file, text, bytes) {
  const resolved = path.resolve(file);
  const document = renderedDocument(text);
  const sectionList = topLevelSections(document.rendered);
  const names = sectionList.map((section) => section.name);
  const hasV2Marker = /^- Schema:\s*`?north-star-v2`?\s*$/mu.test(document.rendered)
    || names.some((name) => V2_ONLY_HEADINGS.has(name));
  const hasLegacySemanticHeading = names.some((name) => ['One-line', 'Project Direction', 'North Star Outcome'].includes(name));

  let report;
  if (hasV2Marker) {
    const initial = [];
    if (hasLegacySemanticHeading) {
      initial.push(diagnostic(
        'mixed_schema',
        'North Star v2 cannot be combined with legacy One-line, Project Direction, or North Star Outcome headings',
      ));
    }
    report = validateV2(resolved, document, bytes, initial);
  } else if (classifyDocument(document) === 'legacy') {
    report = legacyReport(
      resolved,
      names.includes('One-line') ? 'One-line' : 'Project Direction',
      document,
      sectionList,
    );
  } else if (hasLegacySemanticHeading && hasV2Marker) {
    report = unknownReport(resolved, 'North Star combines v2 and legacy schema markers');
    report.kind = 'mixed';
    report.classification = 'mixed';
    report.diagnostics[0].code = 'mixed_schema';
  } else {
    report = unknownReport(resolved);
  }
  report.input = {
    path: resolved,
    byte_length: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
  return report;
}

function validateText(file, text) {
  return validateDecodedText(file, text, Buffer.from(text, 'utf8'));
}

function validateBytes(file, bytes) {
  const resolved = path.resolve(file);
  const text = decodeUtf8(bytes);
  if (text === null) {
    const report = unknownReport(resolved, 'North Star must be round-trip-safe UTF-8');
    report.diagnostics[0].code = 'invalid_utf8';
    report.input = {
      path: resolved,
      byte_length: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
    return report;
  }
  return validateDecodedText(resolved, text, bytes);
}

function inputFailureReport(file, code, message, byteLength = null) {
  const resolved = path.resolve(file);
  const report = unknownReport(resolved, message);
  report.diagnostics[0].code = code;
  report.input = {
    path: resolved,
    byte_length: byteLength,
    sha256: null,
  };
  return report;
}

function sameFileObservation(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readBoundedPath(file) {
  const resolved = path.resolve(file);
  let beforePath;
  try {
    beforePath = fs.lstatSync(resolved, { bigint: true });
  } catch (error) {
    return {
      report: inputFailureReport(
        resolved,
        'read_error',
        `North Star path could not be inspected: ${error.message}`,
      ),
    };
  }
  if (beforePath.isSymbolicLink()) {
    const report = inputFailureReport(
      resolved,
      'input_symlink',
      'North Star path mode requires a regular non-symlink file',
    );
    if (path.basename(resolved) === 'north-star.md'
        && path.basename(path.dirname(resolved)) === '.ultra') {
      report.diagnostics.push(diagnostic(
        'authority_path_escape',
        'Canonical .ultra/north-star.md must not be a symlink',
        resolved,
      ));
    }
    return {
      report,
    };
  }
  if (!beforePath.isFile()) {
    return {
      report: inputFailureReport(
        resolved,
        'input_not_regular',
        'North Star path mode requires a regular non-symlink file',
      ),
    };
  }
  if (beforePath.size > BigInt(MAX_STDIN_BYTES)) {
    return {
      report: inputFailureReport(
        resolved,
        'input_too_large',
        `North Star path exceeds the ${MAX_STDIN_BYTES}-byte snapshot limit`,
        Number(beforePath.size),
      ),
    };
  }

  let descriptor;
  const chunks = [];
  const streamedDigest = crypto.createHash('sha256');
  let observed = 0;
  try {
    descriptor = fs.openSync(
      resolved,
      fs.constants.O_RDONLY
        | fs.constants.O_NONBLOCK
        | (fs.constants.O_NOFOLLOW || 0),
    );
    const beforeDescriptor = fs.fstatSync(descriptor, { bigint: true });
    if (!beforeDescriptor.isFile()
        || !sameFileObservation(beforePath, beforeDescriptor)) {
      return {
        report: inputFailureReport(
          resolved,
          'input_changed',
          'North Star changed before its stable path snapshot could be read; retry after workspace writes settle',
        ),
      };
    }

    while (true) {
      const capacity = Math.min(
        STDIN_CHUNK_BYTES,
        MAX_STDIN_BYTES + 1 - observed,
      );
      const buffer = Buffer.allocUnsafe(capacity);
      const count = fs.readSync(descriptor, buffer, 0, capacity, null);
      if (count === 0) break;
      observed += count;
      if (observed > MAX_STDIN_BYTES) {
        return {
          report: inputFailureReport(
            resolved,
            'input_too_large',
            `North Star path exceeds the ${MAX_STDIN_BYTES}-byte snapshot limit`,
            observed,
          ),
        };
      }
      const chunk = Buffer.from(buffer.subarray(0, count));
      chunks.push(chunk);
      streamedDigest.update(chunk);
    }

    const afterDescriptor = fs.fstatSync(descriptor, { bigint: true });
    const afterPath = fs.lstatSync(resolved, { bigint: true });
    const bytes = Buffer.concat(chunks, observed);
    const streamedSha256 = streamedDigest.digest('hex');
    const retainedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (afterPath.isSymbolicLink()
        || !afterPath.isFile()
        || !sameFileObservation(beforeDescriptor, afterDescriptor)
        || !sameFileObservation(afterDescriptor, afterPath)
        || BigInt(observed) !== afterDescriptor.size
        || streamedSha256 !== retainedSha256) {
      return {
        report: inputFailureReport(
          resolved,
          'input_changed',
          'North Star changed while its stable path snapshot was read; retry after workspace writes settle',
        ),
      };
    }
    return { bytes };
  } catch (error) {
    return {
      report: inputFailureReport(
        resolved,
        'read_error',
        `North Star stable path snapshot could not be read: ${error.message}`,
      ),
    };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function validate(file) {
  const resolved = path.resolve(file);
  const snapshot = readBoundedPath(resolved);
  return snapshot.report || validateBytes(resolved, snapshot.bytes);
}

function readBoundedStdin() {
  const chunks = [];
  const digest = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(STDIN_CHUNK_BYTES);
  let byteLength = 0;
  let oversized = false;
  while (true) {
    const count = fs.readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) break;
    const chunk = buffer.subarray(0, count);
    digest.update(chunk);
    byteLength += count;
    if (!oversized && byteLength <= MAX_STDIN_BYTES) {
      chunks.push(Buffer.from(chunk));
    } else if (!oversized) {
      oversized = true;
      chunks.length = 0;
    }
  }
  return {
    bytes: oversized ? null : Buffer.concat(chunks, byteLength),
    byteLength,
    sha256: digest.digest('hex'),
    oversized,
  };
}

function writeReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

function main(argv) {
  const stdinMode = argv.length === 3
    && argv[0] === '--stdin'
    && argv[1] === '--path'
    && Boolean(argv[2]);
  const pathMode = argv.length === 1 && Boolean(argv[0]);
  if (!stdinMode && !pathMode) {
    process.stderr.write(
      'usage: validate_north_star.cjs <north-star-path>\n'
      + '   or: validate_north_star.cjs --stdin --path <canonical-north-star-path>\n',
    );
    process.exitCode = 2;
    return;
  }
  const file = stdinMode ? argv[2] : argv[0];
  try {
    if (stdinMode) {
      const resolved = path.resolve(file);
      const snapshot = readBoundedStdin();
      if (snapshot.oversized) {
        const report = unknownReport(
          resolved,
          `North Star stdin exceeds the ${MAX_STDIN_BYTES}-byte snapshot limit`,
        );
        report.diagnostics[0].code = 'input_too_large';
        report.input = {
          path: resolved,
          byte_length: snapshot.byteLength,
          sha256: snapshot.sha256,
        };
        writeReport(report);
        return;
      }
      writeReport(validateBytes(resolved, snapshot.bytes));
      return;
    }
    writeReport(validate(file));
  } catch (error) {
    const report = unknownReport(path.resolve(file), error.message);
    report.diagnostics[0].code = 'read_error';
    writeReport(report);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  classifyText,
  validate,
  validateBytes,
  validateText,
};
