const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const BASE_URL = 'https://hashbrown.invalid';

/**
 * Returns a renderable URL when its protocol is safe for model-generated content.
 *
 * Relative URLs resolve against an inert HTTPS base for protocol validation but
 * retain their original relative form.
 *
 * @param value - Candidate URL from parsed Markdown.
 * @returns The trimmed URL, or `undefined` when the protocol is unsafe or invalid.
 * @internal
 */
export function sanitizeUrl(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized, BASE_URL);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? normalized : undefined;
  } catch {
    return undefined;
  }
}
