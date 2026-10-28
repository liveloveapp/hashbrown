import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'www/examples/quickstart/server/production/**/*.integration.spec.ts',
    ],
    testTimeout: 30000,
  },
});
