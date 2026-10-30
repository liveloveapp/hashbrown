import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'tools/conformance/dotnet';
const base = require(join(process.cwd(), root, 'jest.config')).default;
const {
  dotnetTestSuites,
}: {
  dotnetTestSuites: Record<
    'harness' | 'runtime' | 'package',
    readonly string[]
  >;
} = require(join(process.cwd(), root, 'test-suites'));
const suites = ['harness', 'runtime', 'package'] as const;
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

  const assigned: string[] = suites.flatMap((suite) => manifest[suite] ?? []);

  expect(Object.keys(manifest).sort()).toEqual([...suites].sort());
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

for (const suite of suites) {
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
