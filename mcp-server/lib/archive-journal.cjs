'use strict';

const fs = require('node:fs');
const path = require('node:path');

const INTENT_FILE = '.archive-intent.json';
const INTENT_VERSION = '1.0';

class ArchiveJournalError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArchiveJournalError';
    this.code = code;
  }
}

function resolveInside(rootDir, relative, field) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', `${field} must be project-relative`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', `${field} escapes project root`);
  }
  return resolved;
}

function assertIntent(intent, rootDir) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)
    || intent.schema_version !== INTENT_VERSION
    || typeof intent.change_id !== 'string' || !intent.change_id
    || !Array.isArray(intent.baseline_updates)
    || typeof intent.reconciliation_path !== 'string' || !intent.reconciliation_path
    || !/^[0-9a-f]{64}$/.test(String(intent.reconciliation_digest || ''))
    || !intent.reconciliation_manifest || typeof intent.reconciliation_manifest !== 'object'
    || typeof intent.summary !== 'string' || intent.summary.trim().length < 3) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'archive intent shape is invalid');
  }
  const source = resolveInside(rootDir, intent.source, 'source');
  const destination = resolveInside(rootDir, intent.destination, 'destination');
  const activeRoot = path.resolve(rootDir, '.ultra', 'changes', 'active');
  const archiveRoot = path.resolve(rootDir, '.ultra', 'changes', 'archive');
  if (path.dirname(source) !== activeRoot || path.basename(source) !== intent.change_id) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'archive intent source is not the active change root');
  }
  if (path.dirname(destination) !== archiveRoot
    || !path.basename(destination).endsWith(`-${intent.change_id}`)) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'archive intent destination is not the change archive root');
  }
  for (const update of intent.baseline_updates) resolveInside(rootDir, update, 'baseline update');
  resolveInside(rootDir, intent.reconciliation_path, 'reconciliation path');
  if (intent.previous_summary !== null && typeof intent.previous_summary !== 'string') {
    throw new ArchiveJournalError('ARCHIVE_INTENT_INVALID', 'previous_summary must be string or null');
  }
  return { intent, source, destination };
}

function readIntentFile(file, rootDir) {
  let intent;
  try { intent = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    throw new ArchiveJournalError('ARCHIVE_INTENT_CORRUPT', `cannot read ${file}: ${error.message}`);
  }
  return assertIntent(intent, rootDir);
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temp, file);
}

function renderSummary(change, summary, baselineUpdates, noBaselineChangeReason) {
  return [
    `# Archived change: ${change.title}`, '', summary.trim(), '',
    '## Baseline reconciliation', '',
    ...(baselineUpdates.length > 0
      ? baselineUpdates.map((file) => `- ${file}`)
      : [noBaselineChangeReason]), '',
  ].join('\n');
}

function sameOperation(intent, {
  change, summary, baselineUpdates, noBaselineChangeReason, reconciliationPath, reconciliationDigest,
}) {
  return intent.change_id === change.id
    && intent.source === change.artifact_root
    && intent.summary === summary.trim()
    && JSON.stringify(intent.baseline_updates) === JSON.stringify(baselineUpdates)
    && (intent.no_baseline_change_reason || null) === (noBaselineChangeReason || null)
    && intent.reconciliation_path === reconciliationPath
    && intent.reconciliation_digest === reconciliationDigest;
}

function prepareArchiveMove({
  rootDir, change, summary, baselineUpdates, noBaselineChangeReason,
  reconciliationPath, reconciliationDigest, reconciliationManifest, now = new Date(),
}) {
  const date = now.toISOString().slice(0, 10);
  const source = resolveInside(rootDir, change.artifact_root, 'source');
  const destinationRelative = path.join('.ultra', 'changes', 'archive', `${date}-${change.id}`);
  const destination = resolveInside(rootDir, destinationRelative, 'destination');
  const sourceIntentFile = path.join(source, INTENT_FILE);
  const destinationIntentFile = path.join(destination, INTENT_FILE);

  if (!fs.existsSync(source) && fs.existsSync(destinationIntentFile)) {
    const resumed = readIntentFile(destinationIntentFile, rootDir);
    if (!sameOperation(resumed.intent, {
      change, summary, baselineUpdates, noBaselineChangeReason, reconciliationPath, reconciliationDigest,
    })) {
      throw new ArchiveJournalError('ARCHIVE_INTENT_CONFLICT', 'existing archive intent differs from retry input');
    }
    return { ...resumed, resumed: true };
  }
  if (!fs.existsSync(source)) {
    throw new ArchiveJournalError('ARCHIVE_SOURCE_MISSING', `active change root missing: ${change.artifact_root}`);
  }
  if (fs.existsSync(destination)) {
    throw new ArchiveJournalError('ARCHIVE_EXISTS', `archive already exists: ${destination}`);
  }

  let prepared;
  if (fs.existsSync(sourceIntentFile)) {
    prepared = readIntentFile(sourceIntentFile, rootDir);
    if (!sameOperation(prepared.intent, {
      change, summary, baselineUpdates, noBaselineChangeReason, reconciliationPath, reconciliationDigest,
    })) {
      throw new ArchiveJournalError('ARCHIVE_INTENT_CONFLICT', 'prepared archive intent differs from retry input');
    }
  } else {
    const summaryPath = path.join(source, 'archive-summary.md');
    const previousSummary = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : null;
    const intent = {
      schema_version: INTENT_VERSION,
      change_id: change.id,
      source: change.artifact_root,
      destination: destinationRelative,
      summary: summary.trim(),
      baseline_updates: baselineUpdates,
      no_baseline_change_reason: noBaselineChangeReason || null,
      reconciliation_path: reconciliationPath,
      reconciliation_digest: reconciliationDigest,
      reconciliation_manifest: reconciliationManifest,
      previous_summary: previousSummary,
      created_at: now.toISOString(),
    };
    writeJsonAtomic(sourceIntentFile, intent);
    prepared = assertIntent(intent, rootDir);
  }

  fs.writeFileSync(
    path.join(source, 'archive-summary.md'),
    renderSummary(change, summary, baselineUpdates, noBaselineChangeReason),
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  return { ...prepared, source, destination, resumed: false };
}

function listArchiveIntents(rootDir) {
  const roots = [
    path.join(rootDir, '.ultra', 'changes', 'active'),
    path.join(rootDir, '.ultra', 'changes', 'archive'),
  ];
  const found = [];
  for (const parent of roots) {
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(parent, entry.name, INTENT_FILE);
      if (!fs.existsSync(file)) continue;
      try { found.push({ ...readIntentFile(file, rootDir), file, error: null }); }
      catch (error) { found.push({ file, error }); }
    }
  }
  return found;
}

function completeArchiveIntent(rootDir, intent) {
  const { destination } = assertIntent(intent, rootDir);
  fs.rmSync(path.join(destination, INTENT_FILE), { force: true });
}

function rollbackArchiveIntent(rootDir, intent) {
  const { source, destination } = assertIntent(intent, rootDir);
  if (fs.existsSync(destination) && !fs.existsSync(source)) fs.renameSync(destination, source);
  if (!fs.existsSync(source) || fs.existsSync(destination)) {
    throw new ArchiveJournalError('ARCHIVE_ROLLBACK_FAILED', 'archive roots are not in a recoverable state');
  }
  const summaryPath = path.join(source, 'archive-summary.md');
  if (intent.previous_summary === null) fs.rmSync(summaryPath, { force: true });
  else fs.writeFileSync(summaryPath, intent.previous_summary);
  fs.rmSync(path.join(source, INTENT_FILE), { force: true });
}

module.exports = {
  ArchiveJournalError,
  INTENT_FILE,
  prepareArchiveMove,
  listArchiveIntents,
  completeArchiveIntent,
  rollbackArchiveIntent,
};
