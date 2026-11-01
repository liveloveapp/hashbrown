import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'tools/conformance/dotnet';
const base = require(join(process.cwd(), root, 'jest.config')).default;
const {
  dotnetTestSuites,
}: {
  dotnetTestSuites: Record<
    'harness' | 'runtime' | 'package' | 'recovery-compatibility',
    readonly string[]
  >;
} = require(join(process.cwd(), root, 'test-suites'));
const suites = ['harness', 'runtime', 'package'] as const;
const owners = [...suites, 'recovery-compatibility'] as const;
const discover = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? discover(path)
      : path.endsWith('.spec.ts')
        ? [path.slice(root.length + 1)]
        : [];
  });

test('explicit .NET suite manifest assigns every recursively discovered source spec exactly once', () => {
  const manifest = dotnetTestSuites;

  const assigned: string[] = owners.flatMap((suite) => manifest[suite] ?? []);

  expect(Object.keys(manifest).sort()).toEqual([...owners].sort());
  expect(assigned.length).toBe(new Set(assigned).size);
  expect([...assigned].sort()).toEqual(discover(`${root}/tests`).sort());
});

test('complete .NET entry point aggregates three serial Jest suites and orders runtime before package', () => {
  const project = JSON.parse(readFileSync(`${root}/project.json`, 'utf8'));

  const targets = project.targets;

  expect(targets.test.executor).toBe('nx:noop');
  expect([...targets.test.dependsOn].sort()).toEqual(
    suites.map((suite) => `test-${suite}`).sort(),
  );
  expect(targets['test-runtime'].dependsOn).toContain('build');
  expect(targets['test-package'].dependsOn).toContain('test-runtime');
  for (const suite of suites) {
    expect(targets[`test-${suite}`].executor).toBe('@nx/jest:jest');
    expect(targets[`test-${suite}`].cache).toBe(true);
    expect(targets[`test-${suite}`].options).toEqual({
      jestConfig: `${root}/jest.${suite}.config.ts`,
      runInBand: true,
    });
  }
});

for (const suite of owners) {
  test(`.NET ${suite} Jest configuration preserves the base behavior and selects its explicit specs`, () => {
    const config = require(join(process.cwd(), root, `jest.${suite}.config`));
    const manifest = dotnetTestSuites;

    expect(config).toEqual({
      ...base,
      displayName: `dotnet-conformance-${suite}`,
      testMatch: manifest[suite].map((file: string) => `<rootDir>/${file}`),
    });
  });
}

test('published browser recovery owns a fourth uncached explicit profile outside ordinary source aggregate', () => {
  const project = JSON.parse(readFileSync(`${root}/project.json`, 'utf8'));
  const manifest = dotnetTestSuites as Record<string, readonly string[]>;

  expect(manifest['recovery-compatibility']).toEqual([
    'tests/native-browser-recovery-compatibility.spec.ts',
  ]);
  expect(manifest.runtime).not.toContain(
    'tests/native-browser-recovery-compatibility.spec.ts',
  );
  expect(project.targets['test-recovery-compatibility']).toMatchObject({
    executor: '@nx/jest:jest',
    cache: false,
    dependsOn: ['build'],
    options: {
      jestConfig: `${root}/jest.recovery-compatibility.config.ts`,
      runInBand: true,
    },
  });
  expect(project.targets.test.dependsOn).not.toContain(
    'test-recovery-compatibility',
  );
});

test('PR and full acceptance require the published wrapper within the unchanged phase ledger', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {acceptancePlan} from './tools/conformance/dotnet/nuget-consumer/run.mjs'; console.log(JSON.stringify(['pr','full'].map(profile=>acceptancePlan('/owned/candidate.json','/owned/npm.json',profile))));",
    ],
    { encoding: 'utf8' },
  );
  const profiles = JSON.parse(output) as Array<
    Array<{ name: string; argv: string[] }>
  >;

  for (const [index, phases] of profiles.entries()) {
    expect(phases.map((phase) => phase.name)).toEqual([
      'candidate',
      'npm',
      'initial-qualification',
      'docs',
      'upgrade',
      index === 0 ? 'smoke' : 'matrix',
      'regressions',
      'final-qualification',
      'final-npm-qualification',
    ]);
    expect(
      phases
        .find((phase) => phase.name === 'upgrade')
        ?.argv[0].split('/')
        .at(-1),
    ).toBe('recovery-upgrade-runner.mjs');
  }
});
