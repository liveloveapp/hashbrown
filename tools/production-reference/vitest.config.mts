import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['www/examples/quickstart/server/production/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts'],
  },
});
