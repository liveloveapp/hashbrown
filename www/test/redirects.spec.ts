import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

test('the retired /samples pages redirect to the example app docs', async () => {
  const redirects = await nextConfig.redirects?.();

  expect(redirects).toEqual(
    expect.arrayContaining([
      {
        source: '/samples',
        destination: '/docs/react/start/sample',
        statusCode: 301,
      },
      {
        source: '/samples/:path*',
        destination: '/docs/react/start/sample',
        statusCode: 301,
      },
    ]),
  );
});

test('/call redirects temporarily to the Google Calendar booking page', async () => {
  const redirects = await nextConfig.redirects?.();

  expect(redirects).toEqual(
    expect.arrayContaining([
      {
        source: '/call',
        destination: 'https://calendar.app.google/nK961tWHZd21izKR6',
        permanent: false,
      },
    ]),
  );
});

test('vercel.json schedules /_/cron/lifecycle every 30 minutes', () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'),
  );

  expect(config).toEqual({
    crons: [{ path: '/_/cron/lifecycle', schedule: '*/30 * * * *' }],
  });
});
