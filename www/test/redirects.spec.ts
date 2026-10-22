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

// A cron more often than daily needs hashbrown-www on a Vercel Pro team; a
// Hobby team rejects the deploy. See "Scheduling the tick" in
// docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md.
test('vercel.json schedules lifecycle every ten minutes and inbox recovery every five', () => {
  const path = resolve(__dirname, '../vercel.json');

  const config = JSON.parse(readFileSync(path, 'utf8'));

  expect(config.crons).toEqual([
    { path: '/_/cron/lifecycle', schedule: '*/10 * * * *' },
    { path: '/_/cron/inbox-recovery', schedule: '*/5 * * * *' },
  ]);
});
