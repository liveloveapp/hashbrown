import { expect, test } from 'vitest';
import nextConfig from '../next.config';

async function rewriteRules() {
  const rewrites = await nextConfig.rewrites?.();
  return Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? []);
}

/** Matches a path against a `:path*`-style source the way these rules use it. */
function matches(source: string, path: string) {
  const prefix = source.replace('/:path*', '');
  return path === prefix || path.startsWith(`${prefix}/`);
}

test('rewrites expose /_/ingest/static and /_/ingest in that order with CORS headers', async () => {
  const rules = await rewriteRules();
  const headers = await nextConfig.headers?.();

  expect(rules).toEqual([
    {
      source: '/_/ingest/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    },
    {
      source: '/_/ingest/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    },
  ]);
  expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  expect(headers).toEqual([
    {
      source: '/_/ingest/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
        {
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type, Authorization',
        },
        { key: 'Access-Control-Max-Age', value: '86400' },
      ],
    },
  ]);
});

test('rewrites do not match /_/chat, /_/cron, /_/growth, /_/unsubscribe, /_/webhooks, /_/search-index', async () => {
  const rules = await rewriteRules();
  const paths = [
    '/_/chat',
    '/_/search-index',
    '/_/growth/collect/v1/website',
    '/_/growth/approve-install',
    '/_/growth/stop',
    '/_/cron/lifecycle',
    '/_/unsubscribe',
    '/_/webhooks/resend',
  ];

  const hits = paths.filter((path) =>
    rules.some((rule) => matches(rule.source, path)),
  );

  expect(hits).toEqual([]);
  expect(matches('/_/ingest/:path*', '/_/ingest/e/')).toBe(true);
});

test('keeps the existing redirects and tracing configuration', async () => {
  const redirects = await nextConfig.redirects?.();

  expect(redirects?.length).toBeGreaterThan(0);
  expect(nextConfig.outputFileTracingIncludes).toBeDefined();
  expect(nextConfig.turbopack?.root).toBeDefined();
});

test('the collector version is the short deploy commit, never a package version', () => {
  const env = nextConfig.env;

  expect(env?.['NEXT_PUBLIC_WWW_VERSION']).toMatch(/^www-(dev|[0-9a-f]{7})$/u);
});
