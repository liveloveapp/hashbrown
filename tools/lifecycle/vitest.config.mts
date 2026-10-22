import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    // Tests use top-level test() only, so env stubs and mock calls reset here.
    unstubEnvs: true,
    clearMocks: true,
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    exclude: ['**/*.integration.spec.ts'],
  },
});
