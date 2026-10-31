import { runBrowserSuites, selectBrowserSuites } from './run-browser-suites';

const task = (project: string, target: string, configuration?: string) => ({
  target: { project, target, ...(configuration ? { configuration } : {}) },
});

test('selects only example-e2e target metadata and deduplicates project/configuration pairs', () => {
  const graph = {
    tasks: {
      tasks: {
        misleading: task('conformance', 'example-e2e'),
        duplicate: task('conformance', 'example-e2e'),
        configured: task('conformance', 'example-e2e', 'smoke'),
        python: task('pydantic-ai-conformance', 'example-e2e'),
        'extra:example-e2e': task('core', 'test'),
        dependency: task('runtime-smoke-angular', 'build'),
      },
    },
  };
  const before = structuredClone(graph);

  const selected = selectBrowserSuites(graph);

  expect(selected).toEqual([
    { project: 'conformance' },
    { project: 'conformance', configuration: 'smoke' },
    { project: 'pydantic-ai-conformance' },
  ]);
  expect(graph).toEqual(before);
});

test('starts each selected browser suite through a separate serial top-level Nx invocation', () => {
  const graph = {
    tasks: {
      tasks: {
        shared: task('conformance', 'example-e2e'),
        python: task('pydantic-ai-conformance', 'example-e2e', 'ci'),
        ignored: task('another-framework', 'test'),
      },
    },
  };
  const execute = jest.fn(() => ({ status: 0 }));

  const exitCode = runBrowserSuites(graph, execute);

  expect(exitCode).toBe(0);
  expect(execute.mock.calls).toEqual([
    ['npx', ['nx', 'example-e2e', 'conformance']],
    [
      'npx',
      ['nx', 'example-e2e', 'pydantic-ai-conformance', '--configuration=ci'],
    ],
  ]);
});

for (const outcome of [
  { status: 7 },
  { status: null },
  { status: 0, error: new Error('spawn failed') },
]) {
  test(`continues other suites and reports failure after ${JSON.stringify(outcome)}`, () => {
    const graph = {
      tasks: {
        tasks: {
          first: task('conformance', 'example-e2e'),
          second: task('pydantic-ai-conformance', 'example-e2e'),
        },
      },
    };
    const execute = jest
      .fn()
      .mockReturnValueOnce(outcome)
      .mockReturnValueOnce({ status: 0 });

    const exitCode = runBrowserSuites(graph, execute);

    expect(exitCode).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]).toEqual([
      'npx',
      ['nx', 'example-e2e', 'pydantic-ai-conformance'],
    ]);
  });
}

test('continues other suites if an executor throws', () => {
  const graph = {
    tasks: {
      tasks: {
        first: task('conformance', 'example-e2e'),
        second: task('pydantic-ai-conformance', 'example-e2e'),
      },
    },
  };
  const execute = jest
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('spawn failed');
    })
    .mockReturnValueOnce({ status: 0 });

  const exitCode = runBrowserSuites(graph, execute);

  expect(exitCode).toBe(1);
  expect(execute).toHaveBeenCalledTimes(2);
});

test('an affected graph without browser suites starts no frameworks', () => {
  const graph = { tasks: { tasks: { core: task('core', 'test') } } };
  const execute = jest.fn(() => ({ status: 0 }));

  const exitCode = runBrowserSuites(graph, execute);

  expect(exitCode).toBe(0);
  expect(execute).not.toHaveBeenCalled();
});

for (const invalid of [
  null,
  {},
  { tasks: [] },
  { tasks: { tasks: [] } },
  { tasks: { tasks: { broken: {} } } },
  {
    tasks: {
      tasks: {
        broken: { target: { project: '--help', target: 'example-e2e' } },
      },
    },
  },
  {
    tasks: {
      tasks: {
        broken: {
          target: {
            project: 'conformance',
            target: 'example-e2e',
            configuration: '--help',
          },
        },
      },
    },
  },
  {
    tasks: {
      tasks: {
        broken: {
          target: { project: 'conformance other', target: 'example-e2e' },
        },
      },
    },
  },
  {
    tasks: {
      tasks: { broken: { target: { project: '', target: 'example-e2e' } } },
    },
  },
  {
    tasks: {
      tasks: {
        broken: {
          target: {
            project: 'conformance',
            target: 'example-e2e',
            configuration: 1,
          },
        },
      },
    },
  },
]) {
  test(`rejects malformed task graph ${JSON.stringify(invalid)} before execution`, () => {
    const execute = jest.fn(() => ({ status: 0 }));

    expect(() => runBrowserSuites(invalid, execute)).toThrow(
      'Invalid Nx task graph',
    );

    expect(execute).not.toHaveBeenCalled();
  });
}

test('validates all tasks before executing any selected browser suite', () => {
  const graph = {
    tasks: {
      tasks: { first: task('conformance', 'example-e2e'), broken: null },
    },
  };
  const execute = jest.fn(() => ({ status: 0 }));

  expect(() => runBrowserSuites(graph, execute)).toThrow(
    'Invalid Nx task graph',
  );

  expect(execute).not.toHaveBeenCalled();
});
