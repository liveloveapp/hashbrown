/// <reference types='vitest' />
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { join } from 'path';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/samples/smart-home/client-react',
  server: {
    port: 5200,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving built vox assets from workspace dist
      allow: [join(__dirname, '../../..'), join(__dirname, '../../../dist')],
    },
  },
  preview: {
    port: 5300,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      allow: [join(__dirname, '../../..'), join(__dirname, '../../../dist')],
    },
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    // Serve built vox assets with correct MIME types
    {
      name: 'serve-vox-assets',
      configureServer(server) {
        server.middlewares.use(
          '/dist/packages/vox/assets',
          (req, res, next) => {
            const filename =
              req.url?.replace('/dist/packages/vox/assets/', '') || '';
            if (!filename) {
              next();
              return;
            }

            const workspaceRoot = join(__dirname, '../../..');
            const filePath = join(
              workspaceRoot,
              'dist/packages/vox/assets',
              filename,
            );

            import('fs')
              .then(({ readFileSync, existsSync }) => {
                if (!existsSync(filePath)) {
                  next();
                  return;
                }
                const content = readFileSync(filePath);
                const ext = filePath.split('.').pop();
                const contentType =
                  ext === 'js'
                    ? 'application/javascript'
                    : ext === 'wasm'
                      ? 'application/wasm'
                      : 'application/octet-stream';

                res.setHeader('Content-Type', contentType);
                res.end(content);
              })
              .catch(() => next());
          },
        );
      },
    },
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../../dist/samples/smart-home/client-react',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/react',
      provider: 'v8' as const,
    },
  },
}));
