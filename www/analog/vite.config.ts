/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import shikiHashbrown from './src/app/themes/shiki-hashbrown';
import { CanonicalReferenceExtension } from './src/extensions/CanonicalReferenceExtension';
import hashbrownStackblitzPlugin from './src/tools/stackblitz-plugin';
import { normalizeNitroPublicAssetPaths } from './src/tools/nitro-public-assets';

export default defineConfig(({ command, mode }) => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vite`,

    environments: {
      client: {
        build: {
          rollupOptions: {
            input: resolve(__dirname, 'index.html'),
          },
        },
      },
      ssr: {
        resolve: {
          noExternal: [/^@ag-ui\/client$/, /^rxjs(?:\/.*)?$/],
        },
        build: {
          rollupOptions: {
            output: {
              entryFileNames: '[name].mjs',
            },
          },
        },
      },
    },
    build: {
      outDir: '../../dist/www/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        allow: ['.'],
      },
    },
    ssr: {
      noExternal: [/^rxjs(?:\/.*)?$/],
    },
    plugins: [
      angular(),
      analog({
        workspaceRoot: resolve(__dirname, '../..'),
        apiPrefix: '_',
        index:
          command === 'build' && mode === 'production'
            ? resolve(__dirname, '../../dist/www/analog/index.html')
            : undefined,
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
      }),
      ...(mode === 'test'
        ? []
        : nitro({
            preset: 'cloudflare-pages',
            renderer: {
              template: resolve(__dirname, 'index.html'),
            },
            alias: {
              '@hashbrownai/angular': resolve(
                __dirname,
                '../../packages/angular/src/index.ts',
              ),
              '@hashbrownai/core': resolve(
                __dirname,
                '../../packages/core/src/index.ts',
              ),
              '@hashbrownai/openai': resolve(
                __dirname,
                '../../packages/openai/src/index.ts',
              ),
            },
          })),
      normalizeNitroPublicAssetPaths(__dirname),
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
