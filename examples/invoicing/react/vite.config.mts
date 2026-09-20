import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@hashbrownai/core': fileURLToPath(
        new URL('../../../packages/core/src/index.ts', import.meta.url),
      ),
      '@hashbrownai/react': fileURLToPath(
        new URL('../../../packages/react/src/index.ts', import.meta.url),
      ),
      '@invoicing/contracts': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4326,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4325',
      '/agui': 'http://127.0.0.1:4325',
    },
  },
  build: {
    outDir: '../../../dist/examples/invoicing/react',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
