process.env['HASHBROWN_DOTNET_HOST_MODE'] ??= 'source';

export default {
  displayName: 'dotnet-conformance',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\/]+$',
    '<rootDir>/nuget-consumer/role-shape\\.cjs$',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30_000,
};
