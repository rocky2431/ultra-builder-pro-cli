'use strict';

const PROVIDER_KINDS = new Set(['memory', 'code_graph']);
const PROVIDER_FIELDS = new Set([
  'provider', 'project', 'reference', 'revision', 'indexed_head', 'status',
]);

class ProviderRefsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderRefsError';
    this.code = code;
  }
}

function normalizeProviderRefs(value, ErrorClass = ProviderRefsError) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ErrorClass('VALIDATION_ERROR', 'provider_refs must be an object');
  }
  const out = {};
  for (const [kind, ref] of Object.entries(value)) {
    if (!PROVIDER_KINDS.has(kind) || !ref || typeof ref !== 'object' || Array.isArray(ref)) {
      throw new ErrorClass('VALIDATION_ERROR', `invalid external provider reference: ${kind}`);
    }
    for (const key of Object.keys(ref)) {
      if (!PROVIDER_FIELDS.has(key)) {
        throw new ErrorClass(
          'PROVIDER_CONTENT_FORBIDDEN',
          `provider_refs.${kind}.${key} is not metadata; provider content remains external`,
        );
      }
    }
    if (typeof ref.provider !== 'string' || !ref.provider.trim()) {
      throw new ErrorClass('VALIDATION_ERROR', `provider_refs.${kind}.provider required`);
    }
    out[kind] = { ...ref, provider: ref.provider.trim() };
  }
  return out;
}

module.exports = { ProviderRefsError, normalizeProviderRefs };
