import {
  type HistoricalDotnetHostSelection,
  resolveDotnetHost,
  selectDotnetHost,
} from './dotnet-host';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStableModelRouter } from './stable-model-router';
import { type DotnetFixture, withDotnetFixture } from './http-fixture';

const execute = promisify(execFile);

/** Independent integration processes sharing one isolated PostgreSQL schema. */
export interface DurableFixtureCluster {
  /** Fresh owned PostgreSQL namespace; exposed only to independent test observation. */
  readonly schema: string;
  readonly connectionString: string;
  /** Starts only the explicitly supplied, hash-verified immutable historical test executable. */
  readonly startHistorical: (
    environment?: Readonly<Record<string, string>>,
  ) => Promise<DotnetFixture>;
  readonly start: (
    environment?: Readonly<Record<string, string>>,
  ) => Promise<DotnetFixture>;
}

/** Owns a disposable PostgreSQL 18 server unless an explicit test database is supplied. */
async function postgres() {
  const explicit = process.env['DOTNET_TEST_POSTGRES'];
  if (explicit)
    return { connectionString: explicit, dispose: async () => undefined };
  const name = `hashbrown-durable-${crypto.randomUUID()}`;
  await execute('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--env',
    'POSTGRES_PASSWORD=fixture-only',
    '--publish',
    '127.0.0.1::5432',
    'postgres:18',
  ]);
  const dispose = async () => {
    await execute('docker', ['rm', '--force', name]);
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const ready = await execute('docker', [
        'exec',
        name,
        'pg_isready',
        '--host',
        '127.0.0.1',
        '-U',
        'postgres',
      ]).then(
        () => true,
        () => false,
      );
      if (ready) {
        const { stdout } = await execute('docker', ['port', name, '5432/tcp']);
        const port = stdout.trim().split(':').at(-1);
        return {
          connectionString: `Host=127.0.0.1;Port=${port};Username=postgres;Password=fixture-only;Database=postgres`,
          dispose,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Disposable PostgreSQL 18 did not become ready');
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Runs real independent .NET workers against a fresh, never-reset database schema. */
export async function withDurableCluster<T>(
  provider: 'openai' | 'azure',
  use: (cluster: DurableFixtureCluster) => Promise<T>,
  environment: Readonly<Record<string, string>> = {},
  historicalHost?: HistoricalDotnetHostSelection,
): Promise<T> {
  const hostSelection = selectDotnetHost();
  resolveDotnetHost(hostSelection);
  const database = await postgres();
  const router = await createStableModelRouter().catch(async (error) => {
    await database.dispose();
    throw error;
  });
  const schema = `durable_${crypto.randomUUID().replaceAll('-', '')}`;
  const cleanup: Array<() => void> = [];
  const running: Array<Promise<unknown>> = [];
  const workers: DotnetFixture[] = [];
  const start = async (
    workerEnvironment: Readonly<Record<string, string>> = {},
    selection:
      typeof hostSelection | HistoricalDotnetHostSelection = hostSelection,
  ) => {
    let ready!: (fixture: DotnetFixture) => void;
    let fail!: (error: unknown) => void;
    const started = new Promise<DotnetFixture>((resolve, reject) => {
      ready = resolve;
      fail = reject;
    });
    const release = new Promise<void>((resolve) => cleanup.push(resolve));
    const task = withDotnetFixture(
      provider,
      async (fixture) => {
        workers.push(fixture);
        ready(fixture);
        await release;
      },
      'confirm',
      undefined,
      {
        ...environment,
        ...workerEnvironment,
        InterruptConnectionString: `${database.connectionString};Search Path=${schema}`,
        InterruptSchema: schema,
      },
      router,
      selection,
    );
    running.push(task);
    void task.catch(fail);
    return started;
  };
  let failure: unknown;
  let failed = false;
  let result!: T;
  try {
    result = await use({
      schema,
      connectionString: database.connectionString,
      start,
      startHistorical: (values = {}) => {
        if (!historicalHost)
          throw new Error('Explicit historical test host required');
        resolveDotnetHost(historicalHost);
        return start(values, historicalHost);
      },
    });
  } catch (error) {
    failure = error;
    failed = true;
  }
  {
    const cleanupErrors: unknown[] = [];
    try {
      let owner: DotnetFixture | undefined;
      for (const worker of workers) {
        const alive = await fetch(`${worker.url}/health`).then(
          (response) => response.ok,
          () => false,
        );
        if (alive) {
          owner = worker;
          break;
        }
      }
      owner ??= await start();
      await control(owner, 'drop-schema');
    } catch (error) {
      cleanupErrors.push(error);
    }
    const stopped = await Promise.allSettled(
      workers.map((worker) => Promise.resolve().then(() => worker.stop())),
    );
    for (const result of stopped)
      if (result.status === 'rejected') cleanupErrors.push(result.reason);
    for (const release of cleanup) {
      try {
        release();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const lifecycles = await Promise.allSettled(running);
    for (const result of lifecycles)
      if (result.status === 'rejected') cleanupErrors.push(result.reason);
    try {
      await router.dispose();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await database.dispose();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      const cleanupFailure = new AggregateError(
        cleanupErrors,
        'Durable fixture cleanup failed',
      );
      if (!failed) throw cleanupFailure;
      process.stderr.write(
        `${cleanupFailure.message}: ${cleanupErrors.map(String).join('\n')}\n`,
      );
    }
  }
  if (failed) throw failure;
  return result;
}

/** Executes an explicit deterministic fixture control and rejects missing controls. */
export async function control(fixture: DotnetFixture, name: string) {
  const response = await fetch(`${fixture.url}/__test/${name}`, {
    method: 'POST',
  });
  if (!response.ok)
    throw new Error(`Fixture control ${name} failed: ${response.status}`);
}

/** Waits for an observed backend barrier instead of guessing with a fixed delay. */
export async function waitForStage(fixture: DotnetFixture, stage: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const counters = await (
      await fetch(`${fixture.url}/__test/counters`)
    ).json();
    if (counters.checkpointStage === stage) return counters;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Checkpoint did not reach ${stage}: ${fixture.diagnostics()}`,
  );
}

/** Reads the protected effect count persisted by PostgreSQL across worker lifetimes. */
export async function durableEffects(fixture: DotnetFixture) {
  return (await (await fetch(`${fixture.url}/__test/counters`)).json())
    .durableProtected as number;
}
