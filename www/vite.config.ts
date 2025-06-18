/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vite';
import shikiHashbrown from './src/app/themes/shiki-hashbrown';
import { CanonicalReferenceExtension } from './src/extensions/CanonicalReferenceExtension';
import hashbrownStackblitzPlugin from './src/tools/stackblitz-plugin';

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
              additionalLangs: ['sh', 'markdown'],
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
      hashbrownStackblitzPlugin(),
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
