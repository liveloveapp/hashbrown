/// <reference types="vitest" />

import analog from '@analogjs/platform';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import shikiHashbrown from './src/app/themes/shiki-hashbrown';
import { CanonicalReferenceExtension } from './src/extensions/CanonicalReferenceExtension';
import homeCodePlugin from './src/tools/home-code-plugin';
import hashbrownStackblitzPlugin from './src/tools/stackblitz-plugin';
import { normalizeNitroPublicAssetPaths } from './src/tools/nitro-public-assets';
import { angularLinkerDepsPlugin } from './src/tools/angular-linker-deps-plugin';
import { ssrDepsReadyPlugin } from './src/tools/ssr-deps-ready-plugin';
import { contentModulesNoCachePlugin } from './src/tools/content-modules-no-cache-plugin';

export default defineConfig(({ command, mode }) => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vite`,

    environments: {
      client: {
        // Analog alpha.87 never links the client's pre-bundled Angular
        // packages; see angularLinkerDepsPlugin.
        optimizeDeps:
          command === 'serve'
            ? {
                // Compiled templates import these for directives that
                // Material modules re-export (MatSliderModule's Dir and
                // MatTooltipModule's CdkScrollable). The dependency scan
                // reads the uncompiled source and misses them, so a cold
                // first visit re-optimizes and reloads with 504 (Outdated
                // Optimize Dep).
                include: ['@angular/cdk/bidi', '@angular/cdk/scrolling'],
                rolldownOptions: { plugins: [angularLinkerDepsPlugin()] },
              }
            : {},
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
        optimizeDeps: {
          // Analog pre-bundles @angular/platform-browser for SSR but not its
          // animations entry, which would otherwise load its own copy of the
          // shared renderer chunks and fail with NG0201.
          include: [
            'rxjs',
            'rxjs/operators',
            '@angular/platform-browser/animations',
          ],
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
      ssrDepsReadyPlugin(),
      contentModulesNoCachePlugin(),
      angular(),
      analog({
        workspaceRoot: resolve(__dirname, '../..'),
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
      }),
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
      homeCodePlugin(__dirname),
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
