import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  test: { environment: 'node', include: ['src/b4run/postgres.integration.ts'] },
});
