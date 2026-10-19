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
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: each stays under Vite's 500 kB
        // warning, they load in parallel, and a redeploy of atc's own code
        // leaves them cached. Leaflet is already split (imported lazily).
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
              name: 'hashbrown',
              test: /packages[\\/](core|react)[\\/]|node_modules[\\/](@ag-ui|@cacheplane|zod|rxjs|fast-json-patch)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
