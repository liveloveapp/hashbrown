module.exports = {
  ...require('./jest.config.ts').default,
  displayName: 'dotnet-conformance-harness',
  testMatch: require('./test-suites.ts').dotnetTestSuites.harness.map(
    (file: string) => `<rootDir>/${file}`,
  ),
};
