import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  // tsconfig says "preserve" for Next; tests need JSX compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.{ts,tsx}'],
  },
});
