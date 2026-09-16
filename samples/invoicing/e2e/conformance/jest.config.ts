module.exports = {
  displayName: 'invoicing-conformance',
  preset: '../../../../jest.preset.js',
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../provider'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../../coverage/samples/invoicing/e2e/conformance',
  testMatch: [
    '<rootDir>/harness/**/*.spec.ts',
    '<rootDir>/../provider/routes.spec.ts',
  ],
};
