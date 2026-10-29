import { randomBytes } from 'node:crypto';

import { expect, test } from 'vitest';

import { decryptCredentials, encryptCredentials } from './crypto.ts';

const key = randomBytes(32).toString('base64');
const credentials = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: '2026-12-01T00:00:00.000Z',
};

test('encryptCredentials output decrypts back to the same credentials and never contains the token', () => {
  const ciphertext = encryptCredentials(credentials, key);

  expect(decryptCredentials(ciphertext, key)).toEqual(credentials);
  expect(ciphertext).not.toContain('access-1');
  expect(encryptCredentials(credentials, key)).not.toBe(ciphertext);
});

test('decryptCredentials throws with a different key', () => {
  const ciphertext = encryptCredentials(credentials, key);

  expect(() =>
    decryptCredentials(ciphertext, randomBytes(32).toString('base64')),
  ).toThrow();
});

test('decryptCredentials throws when the ciphertext was altered', () => {
  const bytes = Buffer.from(encryptCredentials(credentials, key), 'base64');
  bytes[bytes.length - 1] ^= 1;

  expect(() => decryptCredentials(bytes.toString('base64'), key)).toThrow();
});

test('a key that is not 32 bytes throws', () => {
  const short = randomBytes(16).toString('base64');

  expect(() => encryptCredentials(credentials, short)).toThrow(/32 bytes/);
  expect(() => decryptCredentials('AAAA', short)).toThrow(/32 bytes/);
});
