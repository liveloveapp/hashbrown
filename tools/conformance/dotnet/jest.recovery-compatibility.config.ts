module.exports = {
  ...require('./jest.config.ts').default,
  displayName: 'dotnet-conformance-recovery-compatibility',
  testMatch: require('./test-suites.ts').dotnetTestSuites[
    'recovery-compatibility'
  ].map((file: string) => `<rootDir>/${file}`),
};
