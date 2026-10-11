import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  // Resolve @atc/* from tsconfig paths to their source.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
