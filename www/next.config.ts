import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Reported as the collectorVersion: the deployed commit, or `www-dev` locally.
const version = `www-${(process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'}`;

const nextConfig: NextConfig = {
  // The website collector reports this as its collectorVersion.
  env: { NEXT_PUBLIC_WWW_VERSION: version },
  // Workspace packages (and the monorepo tracing root) live outside www.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // The collection route checks website content ids against the docs and
  // blog markdown and the API reference JSON at request time; `repoRoot()`
  // finds them through nx.json.
  outputFileTracingIncludes: {
    '/_/growth/collect/v1/*': [
      '../nx.json',
      './content/docs/**/*.md',
      './content/blog/**/*.md',
      './content/reference/**/*.json',
    ],
  },
  // The repo keeps its own AGENTS.md; don't let `next dev` write copies here.
  agentRules: false,
  // PostHog is proxied first-party under /_/ingest; its API paths end in a
  // slash, which Next would otherwise redirect away.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/_/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/_/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  async headers() {
    return [
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
    ];
  },
  async redirects() {
    return [
      // The migration guides moved to /docs/<sdk>/migrations in #579.
      ...['react', 'angular'].map((sdk) => ({
        source: `/docs/${sdk}/start/migration`,
        destination: `/docs/${sdk}/migrations/v0-6`,
        statusCode: 301 as const,
      })),
      // The /samples pages were retired; the example app's docs page
      // describes atc now.
      ...['/samples', '/samples/:path*'].map((source) => ({
        source,
        destination: '/docs/react/start/sample',
        statusCode: 301 as const,
      })),
      // Campaign emails link to hashbrown.dev/call; a temporary redirect
      // lets the calendar page change without touching sent mail.
      {
        source: '/call',
        destination: 'https://calendar.app.google/nK961tWHZd21izKR6',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
