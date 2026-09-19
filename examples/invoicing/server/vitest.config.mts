import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@hashbrownai/core': fileURLToPath(
        new URL('../../../packages/core/src/index.ts', import.meta.url),
      ),
      '@invoicing/contracts': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: [
      'examples/invoicing/server/src/**/*.spec.ts',
      'examples/invoicing/server/evals/**/*.spec.ts',
    ],
    environment: 'node',
  },
});
