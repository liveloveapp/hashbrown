import { expect, test } from 'vitest';

import { hasExactBearerToken } from './service-auth.ts';

test('hasExactBearerToken accepts only the exact bearer and never a prefix, suffix or empty secret', () => {
  const secret = 'shared-secret';

  const exact = hasExactBearerToken(`Bearer ${secret}`, secret);
  const prefix = hasExactBearerToken('Bearer shared', secret);
  const suffix = hasExactBearerToken(`Bearer ${secret}-x`, secret);
  const bare = hasExactBearerToken(secret, secret);
  const emptySecret = hasExactBearerToken('Bearer ', '');
  const missingHeader = hasExactBearerToken(undefined, secret);
  const missingSecret = hasExactBearerToken(`Bearer ${secret}`, undefined);

  expect(exact).toBe(true);
  expect(prefix).toBe(false);
  expect(suffix).toBe(false);
  expect(bare).toBe(false);
  expect(emptySecret).toBe(false);
  expect(missingHeader).toBe(false);
  expect(missingSecret).toBe(false);
});
