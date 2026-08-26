module.exports = {
  displayName: 'runtime-smoke',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/tools/runtime-smoke/e2e',
  testMatch: ['<rootDir>/harness/**/*.spec.ts'],
};
