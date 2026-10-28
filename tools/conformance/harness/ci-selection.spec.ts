import { selectCiSetup } from './ci-selection';

test('source-only checks do not provision browsers or PostgreSQL', () => {
  const tasks = ['core:build', 'core:test', 'core:e2e', 'www:lint'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: false, browser: false });
});

test('cached workbench verification still provisions a browser on a cache miss', () => {
  const tasks = ['www:workbench-check', 'www:build'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: false, browser: true });
});

test('a .NET browser smoke needs both browser and database fixtures', () => {
  const tasks = [
    'dotnet-conformance:build',
    'dotnet-conformance:provider-smoke',
  ];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: true });
});

test('a .NET HTTP contract run does not require browser installation', () => {
  const tasks = ['dotnet-conformance:test'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: false });
});

test('all browser suite entry points provision Chromium', () => {
  const tasks = ['atc-e2e:e2e', 'conformance:example-e2e', 'www:workbench-e2e'];

  const results = tasks.map((task) => selectCiSetup([task]));

  expect(results.every((result) => result.browser)).toBe(true);
});

test('packaged PR acceptance provisions PostgreSQL and Chromium', () => {
  const tasks = ['dotnet-conformance:package-pr-acceptance'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: true });
});
