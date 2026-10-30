import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const {
  dotnetTestSuites,
}: {
  dotnetTestSuites: Record<
    'harness' | 'runtime' | 'package',
    readonly string[]
  >;
} = require(join(process.cwd(), 'tools/conformance/dotnet/test-suites'));
import {
  filterUsingGlobPatterns,
  getTargetInputs,
} from 'nx/src/hasher/task-hasher';
import type { ProjectGraphProjectNode } from 'nx/src/config/project-graph';
import type { NxJsonConfiguration } from 'nx/src/config/nx-json';

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const libraries = [
  'core',
  'react',
  'angular',
  'openai',
  'anthropic',
  'azure',
  'bedrock',
  'google',
  'ollama',
  'typesafe',
];
const project = (root: string): ProjectGraphProjectNode => {
  const data = readJson(`${root}/project.json`);
  return { name: data.name, type: 'lib', data: { ...data, root } };
};
const includes = (
  node: ProjectGraphProjectNode,
  target: string,
  files: string[],
) => {
  const nx = readJson('nx.json') as NxJsonConfiguration;
  const { selfInputs } = getTargetInputs(nx, node, target);
  return filterUsingGlobPatterns(
    node.data.root,
    files.map((file) => ({ file, hash: 'test-content' })),
    selfInputs.map((pattern) => pattern.replace('{workspaceRoot}/', '')),
  ).map(({ file }) => file);
};

test('cached library assembly invalidates when compiled sources or install tooling change', () => {
  const files = (name: string) => [
    `packages/${name}/src/index.ts`,
    'tools/growth/install/collector.cjs',
    'tools/growth/install/assemble-package.mjs',
    'tsconfig.base.json',
    'package-lock.json',
    'LICENSE',
  ];

  for (const name of libraries) {
    const node = project(`packages/${name}`);

    expect(node.data.targets?.build.cache).toBe(true);
    expect(includes(node, 'build', files(name))).toEqual(files(name));
  }
});

test('library compiler caches include root compilation inputs and copied license bytes', () => {
  const nx = readJson('nx.json') as NxJsonConfiguration;

  for (const name of libraries) {
    const node = project(`packages/${name}`);
    const target = node.data.targets?.compile;
    const defaults = nx.targetDefaults?.[target?.executor ?? ''];
    const resolved = {
      ...node,
      data: {
        ...node.data,
        targets: {
          ...node.data.targets,
          compile: { ...defaults, ...target },
        },
      },
    };
    const files = [
      `packages/${name}/src/index.ts`,
      'tsconfig.base.json',
      'package-lock.json',
      'LICENSE',
    ];

    expect(resolved.data.targets.compile.cache).toBe(true);
    expect(includes(resolved, 'compile', files)).toEqual(files);
  }
});

test('source .NET test inputs cover the package guard closure and imported client recovery code', () => {
  const node = project('tools/conformance/dotnet');
  const guarded: string[] = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import {listSourceFiles} from './tools/conformance/dotnet/nuget-consumer/verify.mjs'; console.log(JSON.stringify(await listSourceFiles(process.cwd())));",
      ],
      { encoding: 'utf8' },
    ),
  );
  const files = [
    ...new Set([
      ...guarded,
      'packages/core/src/chat-runtime.ts',
      'tools/conformance/hosts/react/src/recovery.ts',
      'tools/conformance/hosts/angular/src/recovery.ts',
      'tools/conformance/harness/app-driver.ts',
      '.github/workflows/pr-main.yml',
      '.github/workflows/nightly.yml',
      'jest.preset.js',
      'tsconfig.base.json',
      'package.json',
      'package-lock.json',
    ]),
  ];

  const covered = includes(node, 'test-package', files);

  expect(files.filter((file) => !covered.includes(file))).toEqual([]);
});

test('source .NET tests do not hash unrelated browser UI and provider packages', () => {
  const node = project('tools/conformance/dotnet');
  const nx = readJson('nx.json') as NxJsonConfiguration;
  const unrelated = [
    'tools/conformance/hosts/react/src/plain-smoke.tsx',
    'tools/conformance/hosts/angular/src/main.ts',
    'packages/react/src/index.ts',
    'packages/ollama/src/index.ts',
    'www/examples/quickstart/runtime/workbench-view.ts',
    'www/content/docs/react/start/workbench.md',
  ];

  const inputs = getTargetInputs(nx, node, 'test-package');

  expect(inputs.dependencyInputs).toEqual([]);
  expect(includes(node, 'test-package', unrelated)).toEqual([]);
});

test('package qualification remains fresh and SDK builds retain commit provenance', () => {
  const node = project('tools/conformance/dotnet');
  const sdk = project('packages/dotnet');
  const gates = [
    'package-prepare',
    'package-e2e',
    'package-upgrade',
    'package-acceptance',
    'package-pr-acceptance',
    'check-docs',
  ];

  const cacheable = gates.filter(
    (name) => node.data.targets?.[name].cache !== false,
  );

  expect(cacheable).toEqual([]);
  expect(sdk.data.targets?.build.inputs).toContainEqual({
    runtime: 'git rev-parse HEAD',
  });
});

for (const suite of ['harness', 'runtime']) {
  test(`source .NET ${suite} cache excludes other suites and unrelated documentation`, () => {
    const node = project('tools/conformance/dotnet');
    const unrelated = [
      '.github/workflows/pr-main.yml',
      '.github/workflows/nightly.yml',
      'www/content/docs/react/platform/dotnet.md',
      'tools/conformance/dotnet/tests/package-upgrade.spec.ts',
      ...(suite === 'harness'
        ? [
            'packages/dotnet/src/Hashbrown/Run.cs',
            'packages/core/src/chat-runtime.ts',
            'tools/conformance/dotnet/tests/recovery.spec.ts',
          ]
        : ['tools/conformance/dotnet/tests/live-budget.spec.ts']),
    ];
    const nx = readJson('nx.json') as NxJsonConfiguration;

    const inputs = getTargetInputs(nx, node, `test-${suite}`);

    expect(inputs.dependencyInputs).toEqual([]);
    expect(includes(node, `test-${suite}`, unrelated)).toEqual([]);
  });
}

test('source .NET runtime cache includes SDK, imported recovery and executable fixture dependencies', () => {
  const node = project('tools/conformance/dotnet');
  const files = [
    'tools/conformance/dotnet/tests/recovery.spec.ts',
    'tools/conformance/dotnet/tests/fixtures/native-approval-host.cs.txt',
    'tools/conformance/dotnet/Program.cs',
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
    'tools/conformance/dotnet/packages.lock.json',
    'tools/conformance/dotnet/global.json',
    'tools/conformance/dotnet/harness/http-fixture.ts',
    'tools/conformance/dotnet/harness/dotnet-host.ts',
    'tools/conformance/dotnet/nuget-consumer/role-shape.cjs',
    'packages/dotnet/src/Hashbrown/Run.cs',
    'packages/dotnet/src/Hashbrown/Hashbrown.csproj',
    'packages/core/src/chat-runtime.ts',
    'tools/conformance/hosts/react/src/recovery.ts',
    'tools/conformance/hosts/angular/src/recovery.ts',
    'tools/conformance/harness/app-driver.ts',
    'tools/conformance/harness/event-gate.ts',
    'tools/conformance/dotnet/jest.config.ts',
    'tools/conformance/dotnet/jest.runtime.config.ts',
    'tools/conformance/dotnet/test-suites.ts',
    'tools/conformance/dotnet/tsconfig.spec.json',
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    'jest.preset.js',
  ];

  const covered = includes(node, 'test-runtime', files);

  expect(covered).toEqual(files);
});

test('source .NET harness cache includes its tests, shared utilities and TypeScript fixtures', () => {
  const node = project('tools/conformance/dotnet');
  const files = [
    'tools/conformance/dotnet/tests/live-browser-fixture.spec.ts',
    'tools/conformance/dotnet/tests/fixtures/live-native-approval.ts',
    'tools/conformance/dotnet/harness/live-browser-fixture.ts',
    'tools/conformance/dotnet/jest.config.ts',
    'tools/conformance/dotnet/jest.harness.config.ts',
    'tools/conformance/dotnet/test-suites.ts',
    'tools/conformance/dotnet/tsconfig.spec.json',
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    'jest.preset.js',
  ];

  const covered = includes(node, 'test-harness', files);

  expect(covered).toEqual(files);
});

for (const suite of ['harness', 'runtime', 'package'] as const) {
  test(`source .NET ${suite} cache covers every spec assigned to its manifest group`, () => {
    const node = project('tools/conformance/dotnet');
    const specs = dotnetTestSuites[suite].map(
      (file) => `tools/conformance/dotnet/${file}`,
    );

    const covered = includes(node, `test-${suite}`, specs);

    expect(covered).toEqual(specs);
    if (suite !== 'package') {
      const other = Object.entries(dotnetTestSuites)
        .filter(([name]) => name !== suite)
        .flatMap(([, files]) =>
          files.map((file) => `tools/conformance/dotnet/${file}`),
        );
      expect(includes(node, `test-${suite}`, other)).toEqual([]);
    }
  });
}
