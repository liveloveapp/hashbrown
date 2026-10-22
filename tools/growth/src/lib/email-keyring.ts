import type { EmailHmacKey, EmailHmacKeyring } from './crypto';

function version(value: string | undefined): number {
  if (!value || !/^\d+$/u.test(value)) {
    throw new Error('Growth email HMAC active version is required');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 32_767) {
    throw new Error('Growth email HMAC active version is invalid');
  }
  return parsed;
}

function previousKey(candidate: unknown): EmailHmacKey {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate)
  ) {
    throw new Error('Growth email HMAC previous key is invalid');
  }
  const record = candidate as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record['version'] !== 'number' ||
    !Number.isSafeInteger(record['version']) ||
    record['version'] < 1 ||
    record['version'] > 32_767 ||
    typeof record['secret'] !== 'string' ||
    Buffer.byteLength(record['secret'], 'utf8') < 32
  ) {
    throw new Error('Growth email HMAC previous key is invalid');
  }
  return { version: record['version'], secret: record['secret'] };
}

/**
 * Builds the email HMAC keyring from `GROWTH_EMAIL_HMAC_ACTIVE_SECRET`,
 * `GROWTH_EMAIL_HMAC_ACTIVE_VERSION` and the optional JSON
 * `GROWTH_EMAIL_HMAC_PREVIOUS_KEYS`.
 *
 * @param environment - Environment to read; defaults to `process.env`.
 * @throws When the active secret is under 32 bytes or versions repeat.
 */
export function parseEmailHmacKeyring(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EmailHmacKeyring {
  const secret = environment['GROWTH_EMAIL_HMAC_ACTIVE_SECRET'];
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Growth email HMAC active secret is required');
  }
  const active = {
    version: version(environment['GROWTH_EMAIL_HMAC_ACTIVE_VERSION']),
    secret,
  };
  const rawPrevious = environment['GROWTH_EMAIL_HMAC_PREVIOUS_KEYS'];
  if (!rawPrevious) return { active };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPrevious) as unknown;
  } catch {
    throw new Error('Growth email HMAC previous keys are invalid');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Growth email HMAC previous keys must be an array');
  }
  const previous = parsed.map(previousKey);
  const versions = new Set([active.version]);
  for (const key of previous) {
    if (versions.has(key.version)) {
      throw new Error('Growth email HMAC key versions must be unique');
    }
    versions.add(key.version);
  }
  return { active, previous };
}
