/** Credential-first sanitization for the explicit, body-free readiness receipt shapes. */
import assert from 'node:assert/strict';
import { createRedactor } from './common.mjs';

const DIAGNOSTIC_FIELDS = new Set([
  'error',
  'message',
  'cause',
  'cleanupErrors',
  'aliasCleanupError',
]);
const BODY_FIELDS = new Set([
  'body',
  'responseBody',
  'requestBody',
  'errorBody',
]);
const MODEL_FIELDS = new Set([
  'responseText',
  'modelText',
  'prompt',
  'marker',
  'text',
  'content',
  'delta',
  'output',
]);

function sanitizeText(value, fragments) {
  let sanitized = '';
  let index = 0;
  while (index < value.length) {
    if (value.startsWith('[REDACTED]', index)) {
      sanitized += '[REDACTED]';
      index += '[REDACTED]'.length;
      continue;
    }
    const fragment = fragments.find((item) => value.startsWith(item, index));
    sanitized += fragment ? '[REDACTED]' : value[index];
    index += fragment?.length ?? 1;
  }
  return sanitized;
}

/**
 * Redact all credential values before scoping model text to fixed diagnostic/model fields.
 * @remarks
 * Authority IDs, digests, provider metadata and numeric usage have no exemption from credentials.
 * Model chunks never rewrite metadata or keys. Raw body fields are suppressed; callers must still
 * construct receipts from explicit safe fields rather than persisting arbitrary transport objects.
 * Getters retain newly observed cookies and model chunks without replacing the redactor function.
 */
export function createReceiptRedactor({
  redactCredentials,
  credentials = () => [],
  modelText = () => [],
}) {
  assert.equal(
    typeof redactCredentials,
    'function',
    'credential redactor required',
  );
  return (value) => {
    const credentialSafe = createRedactor(credentials())(
      redactCredentials(value),
    );
    const fragments = [
      ...new Set(
        modelText().filter((item) => typeof item === 'string' && item.length),
      ),
    ].sort((a, b) => b.length - a.length);
    const sanitize = (item, field) => {
      if (BODY_FIELDS.has(field) && item !== null) return '[REDACTED]';
      if (
        MODEL_FIELDS.has(field) &&
        (typeof item === 'string' || (item && typeof item === 'object'))
      )
        return '[REDACTED]';
      if (typeof item === 'string')
        return DIAGNOSTIC_FIELDS.has(field)
          ? sanitizeText(item, fragments)
          : item;
      if (Array.isArray(item))
        return item.map((child) => sanitize(child, field));
      if (!item || typeof item !== 'object') return item;
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, sanitize(child, key)]),
      );
    };
    return sanitize(credentialSafe);
  };
}

/** Parse model output without retaining parser-generated excerpts, messages or causes. */
export function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw Error('invalid model JSON');
  }
}
