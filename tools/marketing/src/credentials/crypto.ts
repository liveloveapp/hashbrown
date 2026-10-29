import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { ChannelCredentials } from './store.ts';

const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyBytes(key: string): Buffer {
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32) {
    throw new Error(
      `MARKETING_CREDENTIALS_KEY must be base64 of 32 bytes (got ${bytes.length} bytes)`,
    );
  }
  return bytes;
}

/**
 * Encrypts credentials with AES-256-GCM under a fresh random nonce.
 *
 * @param key - Base64 of 32 bytes.
 * @returns Base64 of the nonce, the auth tag and the ciphertext.
 * @throws When the key is not 32 bytes.
 */
export function encryptCredentials(
  value: ChannelCredentials,
  key: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

/**
 * Decrypts the output of {@link encryptCredentials}.
 *
 * @param key - Base64 of 32 bytes.
 * @throws When the key is not 32 bytes, or the key or ciphertext is wrong.
 */
export function decryptCredentials(
  ciphertext: string,
  key: string,
): ChannelCredentials {
  const bytes = Buffer.from(ciphertext, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBytes(key),
    bytes.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const decrypted = Buffer.concat([
    decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as ChannelCredentials;
}
