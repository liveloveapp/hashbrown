import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['samples/invoicing/shared/src/**/*.spec.ts'],
    environment: 'node',
  },
});
