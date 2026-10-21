import { createHmac } from 'node:crypto';

import { expect, test } from 'vitest';

import {
  compareEmailLookupHmac,
  createEmailLookupCandidates,
  createEmailLookupHmac,
  normalizeEmail,
} from './crypto';

const secretA = 'a'.repeat(32);
const secretB = 'b'.repeat(32);

test('normalizeEmail trims, NFC-normalizes and lowercases', () => {
  const input = ' Jordan@Acme.DEV ';

  const result = normalizeEmail(input);

  expect(result).toBe('jordan@acme.dev');
});

test('normalizeEmail rejects whitespace and multiple @', () => {
  const inputs = ['jo rdan@acme.dev', 'a@b@acme.dev', '@acme.dev', 'a@', ''];

  const attempts = inputs.map((input) => () => normalizeEmail(input));

  for (const attempt of attempts) {
    expect(attempt).toThrow('structurally valid');
  }
});

test('createEmailLookupHmac is base64url sha256 of the normalized email', () => {
  const key = { version: 3, secret: secretA };

  const result = createEmailLookupHmac('Jordan@Acme.dev', key);

  expect(result).toEqual({
    digest: createHmac('sha256', secretA)
      .update('jordan@acme.dev', 'utf8')
      .digest('base64url'),
    keyVersion: 3,
  });
});

test('createEmailLookupHmac rejects short secrets', () => {
  const key = { version: 1, secret: 'short' };

  const attempt = () => createEmailLookupHmac('a@b.dev', key);

  expect(attempt).toThrow('at least 32 bytes');
});

test('createEmailLookupCandidates lists the active key first and rejects duplicate versions', () => {
  const keyring = {
    active: { version: 2, secret: secretB },
    previous: [{ version: 1, secret: secretA }],
  };
  const duplicated = {
    active: { version: 2, secret: secretB },
    previous: [{ version: 2, secret: secretA }],
  };

  const candidates = createEmailLookupCandidates('a@b.dev', keyring);
  const attempt = () => createEmailLookupCandidates('a@b.dev', duplicated);

  expect(candidates.map((candidate) => candidate.keyVersion)).toEqual([2, 1]);
  expect(attempt).toThrow('Duplicate email HMAC key version: 2');
});

test('compareEmailLookupHmac is false for non-canonical digests', () => {
  const { digest } = createEmailLookupHmac('a@b.dev', {
    version: 1,
    secret: secretA,
  });

  const same = compareEmailLookupHmac(digest, digest);
  const padded = compareEmailLookupHmac(digest, `${digest}=`);
  const short = compareEmailLookupHmac(digest, digest.slice(0, 20));
  const other = compareEmailLookupHmac(
    digest,
    createEmailLookupHmac('c@d.dev', { version: 1, secret: secretA }).digest,
  );

  expect([same, padded, short, other]).toEqual([true, false, false, false]);
});
