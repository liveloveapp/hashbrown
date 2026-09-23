/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import shikiHashbrown from './src/app/themes/shiki-hashbrown';
import { CanonicalReferenceExtension } from './src/extensions/CanonicalReferenceExtension';
import { angularLinkerBabel } from './src/tools/angular-linker-babel';
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
        // Dev only; production builds do not run the dependency optimizer.
        // Analog pre-bundles five Angular entry points for SSR, and Vite does
        // not discover the rest, so entries such as `@angular/router` and
        // `@angular/core/rxjs-interop` loaded natively with a second copy of
        // `@angular/core` (NG0203). Discovery bundles them against one core.
        // RxJS is listed because its `node` export condition resolves a
        // CommonJS build the SSR module runner cannot evaluate.
        optimizeDeps: {
          noDiscovery: false,
          include: ['rxjs', 'rxjs/operators'],
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
        // The SSR template must be the built client index.html (hashed asset
        // tags). The Vercel preset writes the client build to the repository
        // root .vercel/output/static, before the server bundle reads it.
        index:
          command === 'build' && mode === 'production'
            ? resolve(__dirname, '../../.vercel/output/static/index.html')
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
      angularLinkerBabel(),
      ...(mode === 'test'
        ? []
        : nitro({
            preset: 'vercel',
            // The migration notes moved into a versioned Migrations section.
            // Keep the old URLs working for links in posts and search results.
            routeRules: {
              '/docs/react/start/migration': {
                redirect: { to: '/docs/react/migrations/v0-6', status: 301 },
              },
              '/docs/angular/start/migration': {
                redirect: { to: '/docs/angular/migrations/v0-6', status: 301 },
              },
            },
            vercel: {
              functions: {
                // Hobby default and ceiling; streamed response time counts.
                maxDuration: 300,
              },
              config: {
                // The client build writes its shell to the deployed static
                // root, and the preset puts `{ handle: "filesystem" }` ahead
                // of the catch-all, so Vercel answered "/" with that
                // unrendered shell and the server function never ran. Every
                // other route has no matching file and renders. These routes
                // are concatenated ahead of the generated ones, so "/" reaches
                // the renderer while the shell stays on disk for the SSR
                // template to read.
                routes: [{ src: '/', dest: '/__server' }],
              },
            },
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
