import { expect, test } from 'vitest';
import { createVisitorIdentity } from './visitor';

const key = 'test-signing-key-with-at-least-32-characters';

test('anonymous cookies are signed, stable across continuations, and private', () => {
  const identities = createVisitorIdentity({
    key,
    secure: true,
    now: () => 1_000,
  });

  const first = identities.read(undefined);
  const next = identities.read(first.cookie?.split(';')[0]);
  const other = identities.read(undefined);

  expect(first.cookie).toContain(
    'HttpOnly; SameSite=Lax; Path=/api/run; Max-Age=86400; Secure',
  );
  expect(next.id).toBe(first.id);
  expect(next.cookie).toBeUndefined();
  expect(other.id).not.toBe(first.id);
});

test('forged, duplicate, and expired visitor cookies are replaced', () => {
  let now = 1_000;
  const identities = createVisitorIdentity({
    key,
    secure: false,
    now: () => now,
  });
  const first = identities.read(undefined);
  const cookie = first.cookie?.split(';')[0];
  if (!cookie) throw new Error('Expected a signed visitor cookie');
  const forged = `${cookie.slice(0, -1)}!`;

  const replaced = [
    identities.read(forged),
    identities.read(`${cookie}; ${cookie}`),
  ];
  now += 86_400_000;
  replaced.push(identities.read(cookie));

  replaced.forEach((visitor) => {
    expect(visitor.id).not.toBe(first.id);
    expect(visitor.cookie).toBeDefined();
    expect(visitor.cookie).not.toContain('Secure');
  });
});

test('visitor signatures cannot be reused with a different server signing key', () => {
  const first = createVisitorIdentity({ key, secure: false }).read(undefined);
  const otherServer = createVisitorIdentity({
    key: `${key}-other`,
    secure: false,
  });

  const visitor = otherServer.read(first.cookie?.split(';')[0]);

  expect(visitor.id).not.toBe(first.id);
});

test('weak signing keys are rejected at startup', () => {
  const create = () => createVisitorIdentity({ key: 'short', secure: true });

  expect(create).toThrow('32');
});
