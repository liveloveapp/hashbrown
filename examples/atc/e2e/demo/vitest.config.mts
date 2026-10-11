import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  // Resolve @atc/* from tsconfig paths to their source.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['demo/**/*.test.ts', 'prose/**/*.test.ts'],
  },
});
