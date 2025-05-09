/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { join } from 'path';
import { defineConfig } from 'vite';
import { CanonicalReferenceExtension } from './src/extensions/CanonicalReferenceExtension';
import shikiHashbrown from './src/app/themes/shiki-hashbrown';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    cacheDir: `../node_modules/.vite`,

    build: {
      outDir: '../dist/www/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        allow: ['.'],
      },
    },
    plugins: [
      analog({
        apiPrefix: '_',
        content: {
          highlighter: 'shiki',
          shikiOptions: {
            highlight: {
              theme: shikiHashbrown as any,
            },
            highlighter: {
              additionalLangs: ['sh'],
            },
          },
          markedOptions: {
            extensions: [
              {
                extensions: [CanonicalReferenceExtension],
              },
            ],
          },
        },
        nitro: {
          compatibilityDate: '2024-05-07',
        },
      }),
      nxViteTsPaths(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      reporters: ['default'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
  };
});
