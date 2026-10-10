import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  base: '/react/',
  publicDir: '../shared/public',
  plugins: [react()],
  // Resolve @atc/* and @hashbrownai/* from tsconfig paths to their source.
  resolve: { tsconfigPaths: true },
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
