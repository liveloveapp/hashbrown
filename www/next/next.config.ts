import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const nextConfig: NextConfig = {
  // Content, reference JSON and workspace packages live outside www/next.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // The repo keeps its own AGENTS.md; don't let `next dev` write copies here.
  agentRules: false,
  // Ported from the Nitro routeRules in www/analog/vite.config.ts: the
  // migration guides moved to /docs/<sdk>/migrations in #579.
  async redirects() {
    return ['react', 'angular'].map((sdk) => ({
      source: `/docs/${sdk}/start/migration`,
      destination: `/docs/${sdk}/migrations/v0-6`,
      statusCode: 301 as const,
    }));
  },
};

export default nextConfig;
