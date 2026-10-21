import { createHash, createHmac } from 'node:crypto';

import { canonicalJson } from '../activity.ts';
import {
  createEmailLookupCandidates,
  type EmailHmacKeyring,
} from '../crypto.ts';
import { ObservationError } from './contracts.ts';

/** SHA-256 hex digest of a value's canonical JSON. */
export function publicDigest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * HMAC-SHA256 hex digest of an identity's canonical JSON under the active
 * keyring key, with a domain tag. Fails closed without a usable keyring.
 */
export function identityDigest(
  identity: unknown,
  keyring: EmailHmacKeyring | undefined,
): { digest: string; keyVersion: number } {
  if (!keyring) throw new ObservationError('identity_key_unavailable');
  try {
    createEmailLookupCandidates('key-check@example.invalid', keyring);
  } catch {
    throw new ObservationError('identity_key_unavailable');
  }
  return {
    digest: createHmac('sha256', keyring.active.secret)
      .update('growth-observation-identity-v1\0')
      .update(canonicalJson(identity))
      .digest('hex'),
    keyVersion: keyring.active.version,
  };
}
