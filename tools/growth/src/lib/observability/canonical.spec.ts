import { createHmac } from 'node:crypto';

import { expect, test } from 'vitest';

import { canonicalJson } from '../activity.ts';
import { identityDigest, publicDigest } from './canonical.ts';

const oldKey = { version: 1, secret: 'a'.repeat(32) };
const newKey = { version: 2, secret: 'b'.repeat(32) };

test('publicDigest is stable across key order and detects content changes', () => {
  const left = { b: 2, a: { d: 4, c: 3 } };
  const right = { a: { c: 3, d: 4 }, b: 2 };

  const same = publicDigest(left) === publicDigest(right);
  const different = publicDigest({ a: 1 }) === publicDigest({ a: 2 });

  expect(same).toBe(true);
  expect(different).toBe(false);
  expect(publicDigest(left)).toMatch(/^[0-9a-f]{64}$/u);
  expect(canonicalJson(left)).toBe(canonicalJson(right));
});

test('identityDigest uses the active key and fails closed without one', () => {
  const value = { gitEmail: 'developer@example.invalid' };

  const withOld = identityDigest(value, { active: oldKey });
  const rotated = identityDigest(value, { active: newKey, previous: [oldKey] });

  expect(withOld.keyVersion).toBe(1);
  expect(rotated.keyVersion).toBe(2);
  expect(rotated.digest).not.toBe(withOld.digest);
  expect(withOld.digest).toMatch(/^[0-9a-f]{64}$/u);
  expect(identityDigest(value, { active: oldKey })).toEqual(withOld);
  expect(() => identityDigest(value, undefined)).toThrow(
    'identity_key_unavailable',
  );
  expect(() =>
    identityDigest(value, { active: { version: 1, secret: 'short' } }),
  ).toThrow('identity_key_unavailable');
});

test('identityDigest matches an independently computed domain-tagged HMAC', () => {
  const identity = { gitdisplayname: 'dev', gitemail: 'dev@example.invalid' };
  const canonical = '{"gitdisplayname":"dev","gitemail":"dev@example.invalid"}';
  const keyring = { active: newKey, previous: [oldKey] };

  const result = identityDigest(identity, keyring);

  const expected = createHmac('sha256', newKey.secret)
    .update('growth-observation-identity-v1\0')
    .update(canonical)
    .digest('hex');
  const untagged = createHmac('sha256', newKey.secret)
    .update(canonical)
    .digest('hex');
  expect(canonicalJson(identity)).toBe(canonical);
  expect(result.digest).toBe(expected);
  expect(result.keyVersion).toBe(2);
  expect(untagged).not.toBe(result.digest);
});
