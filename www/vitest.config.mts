import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  // tsconfigPaths: resolve @hashbrownai/* to package source like Next does.
  resolve: {
    tsconfigPaths: true,
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  // tsconfig says "preserve" for Next; tests need JSX compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.{ts,tsx}'],
    // Reset between tests without lifecycle hooks (specs are top-level test() only).
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
