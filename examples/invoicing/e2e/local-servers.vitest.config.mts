import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: { include: ['local-servers.test.ts'], environment: 'node' },
});
