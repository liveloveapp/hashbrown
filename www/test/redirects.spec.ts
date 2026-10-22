import { existsSync, readFileSync } from 'node:fs';
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

// hashbrown-www is on Vercel Hobby, which rejects a deploy whose cron runs
// more than once a day. The lifecycle tick's scheduler is chosen before
// LIFECYCLE_CRON_ENABLED is turned on: see "Scheduling the tick" in
// docs/superpowers/runbooks/2026-10-21-growth-lifecycle-service.md.
test('www declares no Vercel cron', () => {
  const path = resolve(__dirname, '../vercel.json');

  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};

  expect(config).not.toHaveProperty('crons');
});
