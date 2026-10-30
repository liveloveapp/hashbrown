import { expect, test, vi } from 'vitest';

import middleware from './middleware.ts';

test('middleware rejects 401 without the bearer and allows with service hashbrown-www', async () => {
  vi.stubEnv('MARKETING_SERVICE_SECRET', 'shared-secret');
  const run = (authorization?: string) =>
    (middleware as (request: unknown) => unknown)({
      headers: authorization ? { authorization } : {},
    });

  const denied = await run();
  const wrong = await run('Bearer nope');
  const allowed = await run('Bearer shared-secret');
  vi.unstubAllEnvs();

  expect(denied).toMatchObject({
    status: 401,
    body: { error: 'Unauthorized' },
  });
  expect(wrong).toMatchObject({ status: 401 });
  expect(allowed).toMatchObject({ context: { service: 'hashbrown-www' } });
});
