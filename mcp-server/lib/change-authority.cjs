'use strict';

const crypto = require('node:crypto');

function parseJson(value, fallback = {}) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function changeStateDigest(change) {
  if (!change) return null;
  const payload = {
    id: change.id,
    kind: change.kind,
    intent: change.intent,
    docs_impact: change.docs_impact || parseJson(change.docs_impact_json, {}),
    provider_refs: change.provider_refs || parseJson(change.provider_refs_json, {}),
    contract: change.contract || parseJson(change.contract_json, {}),
    classification: change.classification || parseJson(change.classification_json, {}),
    research_disposition: change.research_disposition
      || parseJson(change.research_disposition_json, {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

module.exports = { changeStateDigest };
