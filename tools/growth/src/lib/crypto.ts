import { createHmac, timingSafeEqual } from 'node:crypto';

const EMAIL_MAX_LENGTH = 320;
const RECIPIENT_EMAIL_MAX_LENGTH = 254;
const RECIPIENT_EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const HMAC_BYTE_LENGTH = 32;

/** A versioned HMAC secret for email lookups. */
export interface EmailHmacKey {
  version: number;
  secret: string | Uint8Array;
}

/** The active key plus previous keys kept for rotation. */
export interface EmailHmacKeyring {
  active: EmailHmacKey;
  previous?: readonly EmailHmacKey[];
}

/** A lookup digest and the version of the key that produced it. */
export interface EmailLookupHmac {
  digest: string;
  keyVersion: number;
}

/** Trims, NFC-normalizes and lowercases an email; throws if malformed. */
export function normalizeEmail(email: string): string {
  const normalized = email.trim().normalize('NFC').toLowerCase();
  const separator = normalized.indexOf('@');

  if (
    normalized.length === 0 ||
    normalized.length > EMAIL_MAX_LENGTH ||
    separator <= 0 ||
    separator !== normalized.lastIndexOf('@') ||
    separator === normalized.length - 1 ||
    /\s/u.test(normalized)
  ) {
    throw new Error('A structurally valid email address is required');
  }

  return normalized;
}

/** Normalizes an email and requires a deliverable-looking address. */
export function normalizeRecipientEmail(email: string): string {
  if (typeof email !== 'string') {
    throw new Error('A valid recipient email address is required');
  }
  const normalized = email.trim().normalize('NFC').toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > RECIPIENT_EMAIL_MAX_LENGTH ||
    !RECIPIENT_EMAIL_PATTERN.test(normalized)
  ) {
    throw new Error('A valid recipient email address is required');
  }
  return normalized;
}

function assertKey(key: EmailHmacKey): void {
  if (
    !Number.isSafeInteger(key.version) ||
    key.version <= 0 ||
    key.version > 32_767
  ) {
    throw new Error(
      'Email HMAC key version must be an integer between 1 and 32767',
    );
  }

  const secretByteLength =
    typeof key.secret === 'string'
      ? Buffer.byteLength(key.secret, 'utf8')
      : key.secret.byteLength;
  if (secretByteLength < 32) {
    throw new Error('Email HMAC secret must contain at least 32 bytes');
  }
}

/** Base64url HMAC-SHA256 of the normalized email under one key. */
export function createEmailLookupHmac(
  email: string,
  key: EmailHmacKey,
): EmailLookupHmac {
  assertKey(key);
  const normalized = normalizeEmail(email);

  return {
    digest: createHmac('sha256', key.secret)
      .update(normalized, 'utf8')
      .digest('base64url'),
    keyVersion: key.version,
  };
}

/** Digests for every keyring key, active first; rejects duplicate versions. */
export function createEmailLookupCandidates(
  email: string,
  keyring: EmailHmacKeyring,
): readonly EmailLookupHmac[] {
  const keys = [keyring.active, ...(keyring.previous ?? [])];
  const versions = new Set<number>();

  for (const key of keys) {
    assertKey(key);
    if (versions.has(key.version)) {
      throw new Error(`Duplicate email HMAC key version: ${key.version}`);
    }
    versions.add(key.version);
  }

  return keys.map((key) => createEmailLookupHmac(email, key));
}

function fixedWidthDigest(value: string): {
  bytes: Buffer;
  valid: boolean;
} {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    decoded = Buffer.alloc(0);
  }

  const bytes = Buffer.alloc(HMAC_BYTE_LENGTH);
  decoded.copy(bytes, 0, 0, HMAC_BYTE_LENGTH);
  return {
    bytes,
    valid:
      decoded.length === HMAC_BYTE_LENGTH &&
      value.length === 43 &&
      decoded.toString('base64url') === value,
  };
}

/** Constant-time comparison; false unless both are canonical digests. */
export function compareEmailLookupHmac(left: string, right: string): boolean {
  const leftDigest = fixedWidthDigest(left);
  const rightDigest = fixedWidthDigest(right);
  const equal = timingSafeEqual(leftDigest.bytes, rightDigest.bytes);

  return equal && leftDigest.valid && rightDigest.valid;
}
