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
  // The migration guides moved to /docs/<sdk>/migrations in #579.
  async redirects() {
    return ['react', 'angular'].map((sdk) => ({
      source: `/docs/${sdk}/start/migration`,
      destination: `/docs/${sdk}/migrations/v0-6`,
      statusCode: 301 as const,
    }));
  },
};

export default nextConfig;
