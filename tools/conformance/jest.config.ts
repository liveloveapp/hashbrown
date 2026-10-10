module.exports = {
  displayName: 'conformance',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/tools/conformance',
  testMatch: [
    '<rootDir>/harness/**/*.spec.ts',
    '<rootDir>/provider/routes.spec.ts',
  ],
};
