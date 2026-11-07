import { readFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import controlsConfig from '../live-recovery-controls.playwright.config';
import selectionConfig from '../live-recovery-selection.playwright.config';
import { LIVE_CASE_COUNT } from '../harness/live-budget';
import {
  RELEASE_RECOVERY_MANIFEST,
  releaseRecoveryCases,
} from '../harness/live-recovery-manifest';

const projects = [
  'react-openai-key',
  'react-azure-key',
  'react-azure-cli',
  'angular-openai-key',
  'angular-azure-key',
  'angular-azure-cli',
];

test('lists exactly the twelve recovery identities independently of historical cases', () => {
  const expected = projects.flatMap((project) =>
    ['cold-restore', 'result-reconciliation'].map((group) => ({
      id: `${project}/${group}`,
      project,
      group,
    })),
  );

  const cases = releaseRecoveryCases();

  expect(cases).toEqual(expected);
  expect(new Set(cases.map((entry) => entry.id)).size).toBe(12);
  expect(Object.isFrozen(cases)).toBe(true);
  expect(cases.every(Object.isFrozen)).toBe(true);
  expect(LIVE_CASE_COUNT).toBe(54);
});

test('reserves thirty-nine calls with immutable serial execution and zero retries', () => {
  const actual = RELEASE_RECOVERY_MANIFEST;

  expect(actual).toEqual({
    groups: [
      { name: 'cold-restore', calls: 3 },
      { name: 'result-reconciliation', calls: 3 },
    ],
    preflights: ['openai-responses', 'azure-responses', 'azure-cli-chat'],
    reservedCalls: 39,
    maxRunCalls: 39,
    maxScenarioCalls: 3,
    workerCalls: { original: 1, replacement: 2 },
    maxOutputTokens: 384,
    scenarioTimeoutMs: 60_000,
    runTimeoutMs: 900_000,
    workers: 1,
    retries: 0,
  });
  expect(Object.isFrozen(actual)).toBe(true);
  expect(Object.isFrozen(actual.workerCalls)).toBe(true);
});

const recoveryConfigurations = [
  { name: 'controls', config: controlsConfig, timeout: 300_000 },
  { name: 'selection', config: selectionConfig, timeout: 600_000 },
] as const;

for (const { name, config, timeout } of recoveryConfigurations)
  test(`release recovery ${name} owns an explicit isolated Playwright cleanup directory`, () => {
    const root = resolve(__dirname, '../../../..');
    const expected = resolve(
      root,
      `test-results/conformance/dotnet-live-recovery-${name}`,
    );

    const output = config.outputDir;

    expect(output).toBe(expected);
    expect(typeof output === 'string' && isAbsolute(output)).toBe(true);
    expect(config).toMatchObject({
      workers: 1,
      fullyParallel: false,
      retries: 0,
      repeatEach: 1,
      timeout,
      globalTimeout: 900_000,
    });
    expect(config.use).toMatchObject({
      trace: 'off',
      screenshot: 'off',
      video: 'off',
    });
  });

test('release recovery output cleanup cannot remove another suite or website artifact owner', () => {
  const root = resolve(__dirname, '../../../..');
  const owners = recoveryConfigurations.map(({ config }) =>
    resolve(root, config.outputDir ?? 'test-results'),
  );
  // Reserve a deterministic representative external candidate owner without creating or touching it.
  // Runtime candidate selection is qualified separately; this cached config test reads no selection environment.
  const candidateEvidence = resolve(
    root,
    '../hashbrown-candidate-output-ownership-control',
  );
  const protectedOwners = [
    resolve(root, 'test-results/conformance/dotnet'),
    resolve(root, 'test-results/conformance/package'),
    resolve(root, 'test-results/conformance/local-native-approval'),
    resolve(root, 'test-results/conformance/dotnet-live'),
    resolve(candidateEvidence, 'playwright-output'),
    resolve(root, 'dist/docs-workbench/verification'),
    resolve(root, 'dist/docs-diagrams/ci'),
  ];

  expect(new Set(owners).size).toBe(2);
  for (const [index, owner] of owners.entries())
    for (const other of [...protectedOwners, owners[1 - index]]) {
      const overlaps =
        owner === other ||
        other.startsWith(owner + sep) ||
        owner.startsWith(other + sep);

      expect({ owner, other, overlaps }).toEqual({
        owner,
        other,
        overlaps: false,
      });
    }
});

test('cached harness ownership includes both actual imported recovery Playwright configurations', () => {
  const project = JSON.parse(
    readFileSync(resolve(__dirname, '../project.json'), 'utf8'),
  );
  const configurations = [
    '{projectRoot}/live-recovery-controls.playwright.config.ts',
    '{projectRoot}/live-recovery-selection.playwright.config.ts',
  ];

  const owner = project.targets['test-harness'];
  const inputs = project.namedInputs.harnessTests as string[];

  expect(owner.cache).toBe(true);
  expect(owner.inputs).toContain('harnessTests');
  for (const configuration of configurations)
    expect(inputs.filter((input) => input === configuration)).toEqual([
      configuration,
    ]);
});
