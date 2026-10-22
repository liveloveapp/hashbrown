import { createHmac } from 'node:crypto';

import { expect, test } from 'vitest';

import {
  createGrowthActionToken,
  createUnsubscribeActionUrl,
  createUnsubscribeActionUrlForJob,
  growthStopEventKey,
  loadGrowthTokenKeyring,
  normalizeGrowthPublicActionOrigin,
  unsubscribeActionUrlValue,
  unsubscribeActionUrlValueForContact,
  verifyGrowthActionToken,
} from './tokens';

const contactId = '3f2b8c1e-9d4a-4e6b-8a1c-5d7e9f0a1b2c';
const otherContactId = '4a3c9d2f-0e5b-4f7c-9b2d-6e8f0a1b2c3d';
const secret = 's'.repeat(32);
const key = { version: 1, secret };
const keyring = { active: key };
const issuedAt = new Date('2026-10-21T12:00:00.000Z');

test('a token round-trips through create and verify with the expected purpose', () => {
  const token = createGrowthActionToken(
    {
      contactId,
      purpose: 'unsubscribe',
      issuedAt,
      eventNonce: 'abc',
      reason: 'bounce',
    },
    key,
  );

  const payload = verifyGrowthActionToken(token, {
    expectedPurpose: 'unsubscribe',
    keyring,
    now: issuedAt,
  });

  expect(payload).toEqual({
    contactId,
    purpose: 'unsubscribe',
    keyVersion: 1,
    issuedAt,
    eventNonce: 'abc',
    reason: 'bounce',
  });
});

test('the signature is an independently computed HMAC over the canonical payload', () => {
  const token = createGrowthActionToken(
    { contactId, purpose: 'founder_stop', issuedAt, eventNonce: 'n1' },
    key,
  );
  const [version, encoded, signature] = token.split('.');

  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = createHmac('sha256', secret)
    .update(`g1.${encoded}`, 'utf8')
    .digest('base64url');

  expect(version).toBe('g1');
  expect(decoded).toBe(
    `{"c":"${contactId}","i":${issuedAt.getTime()},"k":1,"n":"n1","p":"founder_stop"}`,
  );
  expect(signature).toBe(expected);
});

test('verify returns null for a tampered signature, a wrong purpose, an unknown key version, and a future issuedAt beyond 300 s', () => {
  const token = createGrowthActionToken(
    { contactId, purpose: 'unsubscribe', issuedAt },
    key,
  );
  const [version, encoded, signature] = token.split('.');
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
  const otherKey = { version: 2, secret };
  const unknownVersionToken = createGrowthActionToken(
    { contactId, purpose: 'unsubscribe', issuedAt },
    otherKey,
  );
  const options = { expectedPurpose: 'unsubscribe' as const, keyring };

  const tampered = verifyGrowthActionToken(`${version}.${encoded}.${flipped}`, {
    ...options,
    now: issuedAt,
  });
  const wrongPurpose = verifyGrowthActionToken(token, {
    ...options,
    expectedPurpose: 'founder_stop',
    now: issuedAt,
  });
  const unknownVersion = verifyGrowthActionToken(unknownVersionToken, {
    ...options,
    now: issuedAt,
  });
  const withinSkew = verifyGrowthActionToken(token, {
    ...options,
    now: new Date(issuedAt.getTime() - 300_000),
  });
  const beyondSkew = verifyGrowthActionToken(token, {
    ...options,
    now: new Date(issuedAt.getTime() - 301_000),
  });

  expect(tampered).toBeNull();
  expect(wrongPurpose).toBeNull();
  expect(unknownVersion).toBeNull();
  expect(withinSkew).not.toBeNull();
  expect(beyondSkew).toBeNull();
});

test('verify enforces maxAgeSeconds', () => {
  const token = createGrowthActionToken(
    { contactId, purpose: 'founder_stop', issuedAt },
    key,
  );
  const options = {
    expectedPurpose: 'founder_stop' as const,
    keyring,
    maxAgeSeconds: 60,
  };

  const fresh = verifyGrowthActionToken(token, {
    ...options,
    now: new Date(issuedAt.getTime() + 60_000),
  });
  const stale = verifyGrowthActionToken(token, {
    ...options,
    now: new Date(issuedAt.getTime() + 61_000),
  });

  expect(fresh).not.toBeNull();
  expect(stale).toBeNull();
});

test('previous keys still verify tokens signed before rotation', () => {
  const previous = { version: 1, secret };
  const active = { version: 2, secret: 't'.repeat(32) };
  const token = createGrowthActionToken(
    { contactId, purpose: 'unsubscribe', issuedAt },
    previous,
  );

  const payload = verifyGrowthActionToken(token, {
    expectedPurpose: 'unsubscribe',
    keyring: { active, previous: [previous] },
    now: issuedAt,
  });

  expect(payload?.keyVersion).toBe(1);
});

test('unsubscribe URLs are bound to their contact', () => {
  const origin = 'https://hashbrown.dev';
  const url = createUnsubscribeActionUrl({ contactId, issuedAt }, key, origin);

  const value = unsubscribeActionUrlValue(url);
  const bound = unsubscribeActionUrlValueForContact(url, contactId);
  const mismatch = () =>
    unsubscribeActionUrlValueForContact(url, otherContactId);

  expect(value.startsWith(`${origin}/_/unsubscribe?token=g1.`)).toBe(true);
  expect(bound).toBe(value);
  expect(mismatch).toThrow('contact binding does not match');
  expect(() => unsubscribeActionUrlValue({} as never)).toThrow(
    'constructed unsubscribe action URL',
  );
});

test('normalizeGrowthPublicActionOrigin rejects paths, http, and credentials', () => {
  const rejected = [
    'https://hashbrown.dev/path',
    'https://hashbrown.dev/',
    'http://hashbrown.dev',
    'https://user:pw@hashbrown.dev',
    ' https://hashbrown.dev',
  ];

  const accepted = normalizeGrowthPublicActionOrigin('https://hashbrown.dev');

  expect(accepted).toBe('https://hashbrown.dev');
  for (const value of rejected) {
    expect(() => normalizeGrowthPublicActionOrigin(value)).toThrow(
      'bare HTTPS origin',
    );
  }
});

test('growthStopEventKey includes the nonce when present', () => {
  const base = {
    contactId,
    purpose: 'founder_stop' as const,
    keyVersion: 1,
    issuedAt,
  };

  const without = growthStopEventKey(base);
  const withNonce = growthStopEventKey({ ...base, eventNonce: 'n1' });

  expect(without).toBe(`token:founder_stop:${contactId}:${issuedAt.getTime()}`);
  expect(withNonce).toBe(`${without}:n1`);
});

test('loadGrowthTokenKeyring reads the active and previous keys from the environment', () => {
  const environment = {
    GROWTH_ACTION_TOKEN_ACTIVE_SECRET: 't'.repeat(32),
    GROWTH_ACTION_TOKEN_ACTIVE_VERSION: '2',
    GROWTH_ACTION_TOKEN_PREVIOUS_KEYS: JSON.stringify([{ version: 1, secret }]),
  };

  const loaded = loadGrowthTokenKeyring(environment);
  const missing = () => loadGrowthTokenKeyring({});

  expect(loaded).toEqual({
    active: { version: 2, secret: 't'.repeat(32) },
    previous: [{ version: 1, secret }],
  });
  expect(missing).toThrow('GROWTH_ACTION_TOKEN_ACTIVE_VERSION');
});

test('job unsubscribe URLs use immutable job creation time and nonce across retries', () => {
  const job = { id: 'job-1', contactId, createdAt: issuedAt };
  const origin = 'https://hashbrown.dev';

  const first = unsubscribeActionUrlValue(
    createUnsubscribeActionUrlForJob(job, key, origin),
  );
  const retry = unsubscribeActionUrlValue(
    createUnsubscribeActionUrlForJob(
      { ...job, createdAt: new Date(issuedAt) },
      key,
      origin,
    ),
  );
  const token = new URL(first).searchParams.get('token') ?? '';
  const payload = verifyGrowthActionToken(token, {
    expectedPurpose: 'unsubscribe',
    keyring,
    now: new Date(issuedAt.getTime() + 86400000),
  });

  expect(retry).toBe(first);
  expect(payload).toMatchObject({
    contactId,
    issuedAt,
    eventNonce: 'job:job-1',
  });
  expect(
    unsubscribeActionUrlValue(
      createUnsubscribeActionUrlForJob({ ...job, id: 'job-2' }, key, origin),
    ),
  ).not.toBe(first);
});

test('job unsubscribe URLs reject jobs without a contact', () => {
  const job = { id: 'job-1', contactId: null, createdAt: issuedAt };

  expect(() =>
    createUnsubscribeActionUrlForJob(job, key, 'https://hashbrown.dev'),
  ).toThrow('contact');
});
