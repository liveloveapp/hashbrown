import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.{ts,tsx}'],
  },
});
