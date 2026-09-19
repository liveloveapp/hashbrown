import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@hashbrownai/core': fileURLToPath(
        new URL('../../../packages/core/src/index.ts', import.meta.url),
      ),
      '@invoicing/contracts': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: [
      'examples/invoicing/server/src/**/*.spec.ts',
      'examples/invoicing/server/evals/**/*.spec.ts',
    ],
    environment: 'node',
    // The eval harness boots the B4 runtime in-process, and the runtime
    // imports the app's routes, tools and thread-access policy dynamically.
    // Inlined, those imports run through vitest's resolver (which knows the
    // aliases above); externalized, they would go through B4's own tsx loader,
    // which treats the aliased packages as CommonJS and loses their exports.
    server: { deps: { inline: ['@b4run/cli'] } },
  },
});
