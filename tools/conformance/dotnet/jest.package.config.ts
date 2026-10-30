module.exports = {
  ...require('./jest.config.ts').default,
  displayName: 'dotnet-conformance-package',
  testMatch: require('./test-suites.ts').dotnetTestSuites.package.map(
    (file: string) => `<rootDir>/${file}`,
  ),
};
