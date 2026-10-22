import { expect, test } from 'vitest';

import { loadEmailHmacKeyring } from './email-keyring.ts';

test('loadEmailHmacKeyring reads the active key and never echoes malformed material', () => {
  const secret = 'a'.repeat(32);
  const malformed = 'private-malformed-key-material';
  const environment = {
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '2',
    GROWTH_EMAIL_HMAC_ACTIVE_SECRET: secret,
  };

  const keyring = loadEmailHmacKeyring(environment);
  let caught: unknown;
  try {
    loadEmailHmacKeyring({
      ...environment,
      GROWTH_EMAIL_HMAC_PREVIOUS_KEYS: malformed,
    });
  } catch (error) {
    caught = error;
  }

  expect(keyring).toEqual({ active: { version: 2, secret } });
  expect(() => loadEmailHmacKeyring({})).toThrow(/active secret/u);
  expect(String(caught)).not.toContain(malformed);
});
