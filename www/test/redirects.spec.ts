import { expect, test } from 'vitest';
import nextConfig from '../next.config';

test('keeps the Analog site redirects for the old migration guides', async () => {
  const redirects = await nextConfig.redirects?.();

  expect(redirects).toEqual(
    expect.arrayContaining([
      {
        source: '/docs/react/start/migration',
        destination: '/docs/react/migrations/v0-6',
        statusCode: 301,
      },
      {
        source: '/docs/angular/start/migration',
        destination: '/docs/angular/migrations/v0-6',
        statusCode: 301,
      },
    ]),
  );
});
