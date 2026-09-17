import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: {
      '@hashbrownai/core': fileURLToPath(
        new URL('../../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['examples/invoicing/shared/src/**/*.spec.ts'],
    environment: 'node',
  },
});
