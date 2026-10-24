import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  // tsconfigPaths: resolve @hashbrownai/* to package source like Next does.
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Checked examples have a build-output tsconfig; tests use workspace sources.
      '@hashbrownai/core': resolve(
        import.meta.dirname,
        '../packages/core/src/index.ts',
      ),
      '@hashbrownai/react': resolve(
        import.meta.dirname,
        '../packages/react/src/index.ts',
      ),
      '@hashbrownai/typesafe': resolve(
        import.meta.dirname,
        '../packages/typesafe/src/index.ts',
      ),
      // Core's subpath import; its package.json targets are build outputs.
      '#development-install': resolve(
        import.meta.dirname,
        '../packages/core/src/growth/development-install.default.ts',
      ),
    },
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
