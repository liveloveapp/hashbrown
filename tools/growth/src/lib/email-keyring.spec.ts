import { expect, test } from 'vitest';

import { parseEmailHmacKeyring } from './email-keyring';

const secret = 'k'.repeat(32);

test('parseEmailHmacKeyring requires a 32-byte active secret and unique versions', () => {
  const valid = {
    GROWTH_EMAIL_HMAC_ACTIVE_SECRET: secret,
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '2',
    GROWTH_EMAIL_HMAC_PREVIOUS_KEYS: JSON.stringify([
      { version: 1, secret: 'p'.repeat(32) },
    ]),
  };
  const short = { ...valid, GROWTH_EMAIL_HMAC_ACTIVE_SECRET: 'short' };
  const duplicate = {
    ...valid,
    GROWTH_EMAIL_HMAC_PREVIOUS_KEYS: JSON.stringify([
      { version: 2, secret: 'p'.repeat(32) },
    ]),
  };

  const keyring = parseEmailHmacKeyring(valid);

  expect(keyring).toEqual({
    active: { version: 2, secret },
    previous: [{ version: 1, secret: 'p'.repeat(32) }],
  });
  expect(() => parseEmailHmacKeyring(short)).toThrow('active secret');
  expect(() => parseEmailHmacKeyring(duplicate)).toThrow('must be unique');
});

test('parseEmailHmacKeyring omits previous keys when none are set', () => {
  const environment = {
    GROWTH_EMAIL_HMAC_ACTIVE_SECRET: secret,
    GROWTH_EMAIL_HMAC_ACTIVE_VERSION: '1',
  };

  const keyring = parseEmailHmacKeyring(environment);

  expect(keyring).toEqual({ active: { version: 1, secret } });
});
