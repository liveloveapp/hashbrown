import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const nextConfig: NextConfig = {
  // Workspace packages (and the monorepo tracing root) live outside www.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // The repo keeps its own AGENTS.md; don't let `next dev` write copies here.
  agentRules: false,
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
    ];
  },
};

export default nextConfig;
