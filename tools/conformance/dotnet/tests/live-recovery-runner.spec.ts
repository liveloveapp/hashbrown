import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReleaseRecoveryBudget } from '../harness/live-recovery-budget';
import {
  executeReleaseRecoveryRunner,
  writeReleaseRecoveryReport,
} from '../harness/live-recovery-runner';
import { releaseRecoveryCases } from '../harness/live-recovery-manifest';

test('provider-free listing performs no package, credential, database, worker or browser work', async () => {
  const qualify = jest.fn();
  const loadConfiguration = jest.fn();
  const execute = jest.fn();

  const result = await executeReleaseRecoveryRunner(
    ['--list'],
    {},
    {
      qualify,
      loadConfiguration,
      execute,
    },
  );

  expect(result).toEqual({ exitCode: 0, cases: releaseRecoveryCases() });
  expect(qualify).not.toHaveBeenCalled();
  expect(loadConfiguration).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

test('rejects selection and execution overrides before reading credentials or starting children', async () => {
  const qualify = jest.fn();
  const loadConfiguration = jest.fn();
  const execute = jest.fn();
  const dependencies = { qualify, loadConfiguration, execute };

  for (const args of [
    [],
    ['--mode', 'latest'],
    ['--mode', 'source'],
    ['--mode', 'candidate', '--npm-metadata', 'relative.json'],
    ['--list', '--credentials', '/private/secret.env'],
    ['--workers', '2'],
    ['--retries', '1'],
    ['--repeat-each', '2'],
    ['--grep', 'cold'],
    ['--project', 'react-openai-key'],
    ['--trace', 'on'],
  ])
    await expect(
      executeReleaseRecoveryRunner(args, {}, dependencies),
    ).rejects.toThrow('RECOVERY_ARGUMENT_INVALID');

  expect(qualify).not.toHaveBeenCalled();
  expect(loadConfiguration).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

test('failed physical package qualification prevents credential loading and execution', async () => {
  const qualify = jest.fn(async () => {
    throw new Error('RECOVERY_SELECTION_INVALID');
  });
  const loadConfiguration = jest.fn();
  const execute = jest.fn();

  await expect(
    executeReleaseRecoveryRunner(
      [
        '--mode',
        'candidate',
        '--npm-metadata',
        '/private/npm-pointer.json',
        '--nuget-metadata',
        '/private/nuget-pointer.json',
        '--credentials',
        '/private/root.env',
      ],
      { HASHBROWN_DOTNET_LIVE: '1' },
      { qualify, loadConfiguration, execute },
    ),
  ).rejects.toThrow('RECOVERY_SELECTION_INVALID');

  expect(qualify).toHaveBeenCalledTimes(1);
  expect(loadConfiguration).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

test('initial deep qualification shares the invocation deadline and cannot load credentials after expiry', async () => {
  jest.useFakeTimers();
  const qualify = jest.fn(
    async (
      _request: Parameters<
        typeof import('../harness/live-recovery-package').selectReleaseRecoveryPackages
      >[0],
      deadline?: Parameters<
        typeof import('../harness/live-recovery-package').selectReleaseRecoveryPackages
      >[1],
    ) => {
      expect(deadline?.remainingMs()).toBe(900_000);
      jest.setSystemTime(900_000);
      return {} as Awaited<
        ReturnType<
          typeof import('../harness/live-recovery-package').selectReleaseRecoveryPackages
        >
      >;
    },
  );
  const loadConfiguration = jest.fn();
  const execute = jest.fn();
  jest.setSystemTime(0);

  try {
    await expect(
      executeReleaseRecoveryRunner(
        [
          '--mode',
          'candidate',
          '--npm-metadata',
          '/private/npm.json',
          '--nuget-metadata',
          '/private/nuget.json',
          '--credentials',
          '/private/root.env',
        ],
        { HASHBROWN_DOTNET_LIVE: '1' },
        { qualify, loadConfiguration, execute },
      ),
    ).rejects.toThrow('RECOVERY_RUN_DEADLINE');

    expect(loadConfiguration).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(qualify.mock.calls[0][1]?.remainingMs()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('the final execution result cannot pass after postflight crosses the invocation deadline', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  const qualify = jest.fn(
    async () =>
      ({}) as Awaited<
        ReturnType<
          typeof import('../harness/live-recovery-package').selectReleaseRecoveryPackages
        >
      >,
  );
  const loadConfiguration = jest.fn();
  const execute = jest.fn(async () => {
    jest.setSystemTime(900_000);
    return { exitCode: 0 } as Awaited<
      ReturnType<
        typeof import('../harness/live-recovery-runner').runReleaseRecoveryQualification
      >
    >;
  });

  try {
    await expect(
      executeReleaseRecoveryRunner(
        [
          '--mode',
          'candidate',
          '--npm-metadata',
          '/private/npm.json',
          '--nuget-metadata',
          '/private/nuget.json',
          '--credentials',
          '/private/root.env',
        ],
        { HASHBROWN_DOTNET_LIVE: '1' },
        { qualify, loadConfiguration, execute },
      ),
    ).rejects.toThrow('RECOVERY_RUN_DEADLINE');

    expect(execute).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('a real report write crossing the absolute deadline leaves no authoritative success receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recovery-finalization-'));
  const report = join(directory, 'qualification.json');
  let now = 0;
  const budget = createReleaseRecoveryBudget({
    now: () => {
      if (existsSync(report)) now = 900_000;
      return now;
    },
  });

  try {
    await expect(
      writeReleaseRecoveryReport(
        directory,
        { exitCode: 0, actualPassedCases: 12 },
        budget,
      ),
    ).rejects.toThrow('RECOVERY_RUN_DEADLINE');

    expect(now).toBe(900_000);
    await expect(readFile(report, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    budget.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('expiry at the outer execution handoff invalidates the real successful report', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  const directory = await mkdtemp(join(tmpdir(), 'recovery-handoff-'));
  const report = join(directory, 'qualification.json');
  const qualify = jest.fn(
    async () =>
      ({}) as Awaited<
        ReturnType<
          typeof import('../harness/live-recovery-package').selectReleaseRecoveryPackages
        >
      >,
  );
  const loadConfiguration = jest.fn();
  const execute = jest.fn(async () => {
    await writeFile(
      report,
      JSON.stringify({ exitCode: 0, actualPassedCases: 12 }),
      { flag: 'wx', mode: 0o600 },
    );
    jest.setSystemTime(900_000);
    return { exitCode: 0, reportDirectory: directory } as Awaited<
      ReturnType<
        typeof import('../harness/live-recovery-runner').runReleaseRecoveryQualification
      >
    >;
  });

  try {
    await expect(
      executeReleaseRecoveryRunner(
        [
          '--mode',
          'candidate',
          '--npm-metadata',
          '/private/npm.json',
          '--nuget-metadata',
          '/private/nuget.json',
          '--credentials',
          '/private/root.env',
        ],
        { HASHBROWN_DOTNET_LIVE: '1' },
        { qualify, loadConfiguration, execute },
      ),
    ).rejects.toThrow('RECOVERY_RUN_DEADLINE');

    expect(execute).toHaveBeenCalledTimes(1);
    await expect(readFile(report, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    jest.useRealTimers();
    await rm(directory, { recursive: true, force: true });
  }
});
