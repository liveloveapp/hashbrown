import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  base: '/react/',
  publicDir: '../shared/public',
  plugins: [react(), nxViteTsPaths()],
  server: {
    host: '127.0.0.1',
    port: 4342,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4340' },
  },
  build: {
    outDir: '../../../dist/examples/atc/react',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
