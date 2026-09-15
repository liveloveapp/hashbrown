import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['samples/invoicing/server/src/**/*.spec.ts'],
    environment: 'node',
  },
});
