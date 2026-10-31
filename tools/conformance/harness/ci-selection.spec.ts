import { selectCiSetup } from './ci-selection';

test('source-only checks do not provision browsers or PostgreSQL', () => {
  const tasks = ['core:build', 'core:test', 'core:e2e', 'www:lint'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: false, browser: false, python: false });
});

test('cached workbench verification still provisions a browser on a cache miss', () => {
  const tasks = ['www:workbench-check', 'www:build'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: false, browser: true, python: false });
});

test('a .NET browser smoke needs both browser and database fixtures', () => {
  const tasks = [
    'dotnet-conformance:build',
    'dotnet-conformance:provider-smoke',
  ];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: true, python: false });
});

test('a .NET HTTP contract run does not require browser installation', () => {
  const tasks = ['dotnet-conformance:test'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: false, python: false });
});

test('all browser suite entry points provision Chromium', () => {
  const tasks = ['atc-e2e:e2e', 'conformance:example-e2e', 'www:workbench-e2e'];

  const results = tasks.map((task) => selectCiSetup([task]));

  expect(results.every((result) => result.browser)).toBe(true);
});

test('packaged PR acceptance provisions PostgreSQL and Chromium', () => {
  const tasks = ['dotnet-conformance:package-pr-acceptance'];

  const result = selectCiSetup(tasks);

  expect(result).toEqual({ dotnet: true, browser: true, python: false });
});

test('Pydantic producer and live browser execution require Python', () => {
  const tasks = ['install', 'test', 'consumer-test', 'example-e2e'].map(
    (target) => `pydantic-ai-conformance:${target}`,
  );

  const results = tasks.map((task) => selectCiSetup([task]));

  expect(results.every((result) => result.python)).toBe(true);
  expect(results.at(-1)?.browser).toBe(true);
});

test('Pydantic syntax and data-only report checks do not provision Python', () => {
  const tasks = [
    'pydantic-ai-conformance:lint',
    'pydantic-ai-conformance:build',
    'framework-conformance-program:test',
  ];

  const result = selectCiSetup(tasks);

  expect(result.python).toBe(false);
});

test('Python adapter packaging and all recipe targets provision Python', () => {
  const tasks = [
    ...['build', 'test', 'lint'].map((target) => `pydantic-ai:${target}`),
    ...[
      'install',
      'build',
      'test',
      'lint',
      'consumer-test',
      'example-e2e',
      'compatibility-baseline',
    ].map((target) => `pydantic-ai-recipe-conformance:${target}`),
  ];

  const results = tasks.map((task) => selectCiSetup([task]));

  expect(results.every((result) => result.python)).toBe(true);
  expect(
    selectCiSetup(['pydantic-ai-recipe-conformance:example-e2e']).browser,
  ).toBe(true);
});
