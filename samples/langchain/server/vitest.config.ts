/// <reference types="vitest" />

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,mts}'],
    setupFiles: [join(rootDir, 'vitest.setup.ts')],
    coverage: {
      reportsDirectory: join(rootDir, 'coverage/langchain-server'),
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
