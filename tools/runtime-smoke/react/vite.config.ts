import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: resolve(__dirname, '../../../dist/tools/runtime-smoke/react'),
    emptyOutDir: true,
  },
});
