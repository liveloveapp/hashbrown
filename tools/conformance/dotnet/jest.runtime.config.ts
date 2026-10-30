module.exports = {
  ...require('./jest.config.ts').default,
  displayName: 'dotnet-conformance-runtime',
  testMatch: require('./test-suites.ts').dotnetTestSuites.runtime.map(
    (file: string) => `<rootDir>/${file}`,
  ),
};
