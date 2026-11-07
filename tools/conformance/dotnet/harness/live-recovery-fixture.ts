import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  DOTNET_FIXTURE_CONFIGURATION,
  type DotnetHostSelection,
  resolveDotnetHost,
} from './dotnet-host';
import { publicChildEnvironment } from './live-configuration';
import { createLiveOutputReader } from './live-diagnostics';

/** An actual loaded owned worker; stopping it never drops durable state. */
export interface LiveRecoveryWorker {
  readonly url: string;
  readonly pid: number;
  readonly loaded: Readonly<{ identity: string; sha256: string }>;
  readonly schema: string;
  readonly phase: 'original' | 'replacement' | 'preflight' | 'cleanup';
  readonly stop: () => Promise<void>;
  readonly assertDrained: () => void;
}
/** The exact reviewed recovery-only configuration boundary, excluding runtime identity overrides. */
export function liveRecoveryChildEnvironment(
  selection: DotnetHostSelection,
  environment: Readonly<Record<string, string>>,
  cleanup = false,
): Readonly<Record<string, string>> {
  const host = resolveDotnetHost(selection);
  if (!host.loaded) throw new Error('RECOVERY_PACKAGE_REQUIRED');
  const keys: readonly string[] = cleanup
    ? [
        'ASPNETCORE_URLS',
        'FixtureDropSchemaOnly',
        'InterruptSchema',
        'InterruptConnectionString',
      ]
    : [
        ...DOTNET_FIXTURE_CONFIGURATION,
        'AzureAuthentication',
        'FixtureLiveRecoveryPhase',
        'FixtureLiveRecoveryRemainingMs',
        'FixtureLiveRecoveryControl',
        'FixtureLiveRecoveryMutation',
      ];
  const app = Object.fromEntries(
    keys.flatMap((key) =>
      environment[key] === undefined ? [] : [[key, environment[key]]],
    ),
  );
  if (
    !cleanup &&
    environment['AzureAuthentication'] === 'azure-cli' &&
    environment['AZURE_CONFIG_DIR']
  )
    app['AZURE_CONFIG_DIR'] = environment['AZURE_CONFIG_DIR'];
  if (!cleanup && environment['AzureAuthentication'] === 'azure-cli')
    delete app['ApiKey'];
  return Object.freeze({ ...app, ...host.environment });
}

/** Starts only genuine native provider composition, checking loaded bytes before readiness and discarding raw child logs. */
export async function startLiveRecoveryWorker(options: {
  readonly selection: DotnetHostSelection;
  readonly provider: Readonly<Record<string, string>>;
  readonly postgres?: string;
  readonly schema: string;
  readonly origins: readonly string[];
  readonly phase: LiveRecoveryWorker['phase'];
  readonly remainingMs: number;
  readonly deterministicControl?: boolean;
  readonly nativeGate?: string;
  readonly signal: AbortSignal;
}): Promise<LiveRecoveryWorker> {
  if (
    options.signal.aborted ||
    !Number.isSafeInteger(options.remainingMs) ||
    options.remainingMs <= 0 ||
    options.remainingMs > 60_000
  )
    throw new Error('RECOVERY_WORKER_DEADLINE');
  if (
    !/^durable_live_[a-f0-9]{32}$/.test(options.schema) ||
    (options.phase !== 'preflight' && !options.postgres?.trim())
  )
    throw new Error('RECOVERY_WORKER_CONFIGURATION');
  const host = resolveDotnetHost(options.selection);
  if (!host.loaded || !host.command)
    throw new Error('RECOVERY_PACKAGE_REQUIRED');
  const cleanup = options.phase === 'cleanup';
  const environment = liveRecoveryChildEnvironment(
    options.selection,
    {
      ...options.provider,
      ASPNETCORE_URLS: 'http://127.0.0.1:0',
      FixtureOrigins: options.origins.join(','),
      FixtureLiveRecoveryPhase: cleanup ? '' : options.phase,
      FixtureLiveRecoveryRemainingMs: String(options.remainingMs),
      FixtureLiveRecoveryControl: options.deterministicControl
        ? 'true'
        : 'false',
      ...(options.phase === 'preflight'
        ? {}
        : {
            InterruptSchema: options.schema,
            InterruptConnectionString: `${options.postgres};Search Path=${options.schema}`,
            ...(cleanup
              ? { FixtureDropSchemaOnly: 'true' }
              : {
                  FixtureNativeSessions: 'true',
                  NativeGate: options.deterministicControl
                    ? (options.nativeGate ?? '')
                    : '',
                }),
          }),
    },
    cleanup,
  );
  const output = createLiveOutputReader(host.loaded);
  const child = spawn(host.command, [host.executable], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: host.workingDirectory,
    env: environment,
  });
  let exited = false;
  let failed = false;
  let code: number | null = null;
  let terminationRequested = false;
  let unexpectedExit = false;
  let exitSignal: NodeJS.Signals | null = null;
  const exit = new Promise<void>((done) => {
    child.once('error', () => {
      failed = true;
      exited = true;
      done();
    });
    child.once('exit', () => {
      if (!terminationRequested) unexpectedExit = true;
    });
    child.once('close', (value, signal) => {
      code = value;
      exitSignal = signal;
      unexpectedExit ||= !terminationRequested;
      exited = true;
      done();
    });
  });
  const kill = (kind: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(kind);
      else process.kill(-child.pid, kind);
    } catch {
      /* An already exited owned group needs no further action. */
    }
  };
  child.stdout.on('data', (chunk: Buffer) => {
    output.stdout(chunk);
    if (output.failed()) {
      failed = true;
      kill('SIGKILL');
    }
  });
  child.stderr.on('data', output.stderr);
  let stopped: Promise<void> | undefined;
  let physicallyDrained = false;
  const stop = () =>
    (stopped ??= (async () => {
      options.signal.removeEventListener('abort', abort);
      if (!terminationRequested && child.pid) {
        try {
          process.kill(child.pid, 0);
        } catch {
          unexpectedExit = true;
        }
      }
      terminationRequested = true;
      kill('SIGTERM');
      const grace = setTimeout(() => kill('SIGKILL'), 500);
      try {
        await exit;
      } finally {
        clearTimeout(grace);
      }
      if (process.platform !== 'win32' && child.pid) {
        kill('SIGKILL');
        const end = Date.now() + 1000;
        let alive = true;
        while (alive && Date.now() < end) {
          try {
            process.kill(-child.pid, 0);
          } catch {
            alive = false;
            break;
          }
          await new Promise<void>((done) => setTimeout(done, 20));
        }
        if (alive) throw new Error('RECOVERY_WORKER_DRAIN');
      }
      physicallyDrained = true;
      if (
        failed ||
        output.failed() ||
        unexpectedExit ||
        (code !== null && code !== 0 && code !== 143) ||
        (exitSignal !== null && !['SIGTERM', 'SIGKILL'].includes(exitSignal))
      )
        throw new Error('RECOVERY_WORKER_FAILED');
    })());
  const abort = () => {
    terminationRequested = true;
    kill('SIGKILL');
    void stop().catch(() => undefined);
  };
  options.signal.addEventListener('abort', abort, { once: true });
  const started = Date.now();
  try {
    while (!output.url()) {
      if (
        options.signal.aborted ||
        Date.now() - started > Math.min(15_000, options.remainingMs)
      )
        throw new Error('RECOVERY_WORKER_DEADLINE');
      if (exited || failed || output.failed())
        throw new Error('RECOVERY_WORKER_START');
      await new Promise<void>((done) => setTimeout(done, 20));
    }
    if (!child.pid || !output.identityVerified())
      throw new Error('RECOVERY_LOADED_IDENTITY');
    return Object.freeze({
      url: output.url()!,
      pid: child.pid,
      loaded: Object.freeze({
        identity: host.loaded.identity,
        sha256: host.loaded.sha256,
      }),
      schema: options.schema,
      phase: options.phase,
      stop,
      assertDrained: () => {
        if (!physicallyDrained || !exited)
          throw new Error('RECOVERY_WORKER_DRAIN');
        if (process.platform !== 'win32') {
          let alive = true;
          try {
            process.kill(-child.pid!, 0);
          } catch {
            alive = false;
          }
          if (alive) throw new Error('RECOVERY_WORKER_DRAIN');
        }
      },
    });
  } catch {
    await stop();
    throw new Error('RECOVERY_WORKER_START');
  }
}

/** Owns one schema across exactly two worker lifetimes and drops it once after every worker drains. */
export async function createLiveRecoveryCluster(options: {
  readonly selection: DotnetHostSelection;
  readonly provider: Readonly<Record<string, string>>;
  readonly postgres: string;
  readonly origins: readonly string[];
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
  readonly deterministicControl?: boolean;
  readonly replacementGate?: string;
  readonly controlMutation?: string;
}) {
  const schema = `durable_live_${randomUUID().replaceAll('-', '')}`;
  const workers: LiveRecoveryWorker[] = [];
  const phases = new Set<string>();
  const ownedSchemas = new Set([schema]);
  let closed: Promise<void> | undefined;
  let schemaDrops = 0;
  return Object.freeze({
    schema,
    workers: () => [...workers],
    schemaDrops: () => schemaDrops,
    start: async (phase: 'original' | 'replacement') => {
      if (
        closed ||
        phases.has(phase) ||
        (phase === 'replacement' && !phases.has('original'))
      )
        throw new Error('RECOVERY_WORKER_ORDER');
      phases.add(phase);
      const workerSchema =
        options.deterministicControl &&
        options.controlMutation === 'schema-reset' &&
        phase === 'replacement'
          ? `durable_live_${randomUUID().replaceAll('-', '')}`
          : schema;
      ownedSchemas.add(workerSchema);
      if (
        phase === 'replacement' &&
        !(
          options.deterministicControl &&
          options.controlMutation === 'reused-worker'
        )
      )
        workers[0].assertDrained();
      const worker =
        options.deterministicControl &&
        options.controlMutation === 'reused-worker' &&
        phase === 'replacement'
          ? workers[0]
          : await startLiveRecoveryWorker({
              ...options,
              schema: workerSchema,
              phase,
              nativeGate:
                phase === 'replacement' ? options.replacementGate : '',
              remainingMs: options.remainingMs(),
            });
      if (workers.some((previous) => previous.pid === worker.pid)) {
        await worker.stop();
        throw new Error('RECOVERY_WORKER_REUSED');
      }
      workers.push(worker);
      return worker;
    },
    close: () =>
      (closed ??= (async () => {
        const errors: unknown[] = [];
        for (const worker of [...workers].reverse())
          try {
            await worker.stop();
          } catch (error) {
            errors.push(error);
          }
        // Cleanup has an independent provider-free deadline after all provider-bearing workers have drained.
        const drained = workers.every((worker) => {
          try {
            worker.assertDrained();
            return true;
          } catch {
            return false;
          }
        });
        if (drained)
          for (const cleanupSchema of ownedSchemas) {
            let cleanup: LiveRecoveryWorker | undefined;
            try {
              cleanup = await startLiveRecoveryWorker({
                selection: options.selection,
                provider: publicChildEnvironment(process.env),
                postgres: options.postgres,
                schema: cleanupSchema,
                phase: 'cleanup',
                origins: [],
                remainingMs: 15_000,
                signal: AbortSignal.timeout(15_000),
              });
              const response = await fetch(
                `${cleanup.url}/__test/drop-schema`,
                { method: 'POST', signal: AbortSignal.timeout(5000) },
              );
              if (!response.ok) throw new Error('RECOVERY_SCHEMA_CLEANUP');
              schemaDrops++;
            } catch (error) {
              errors.push(error);
            } finally {
              if (cleanup)
                try {
                  await cleanup.stop();
                } catch (error) {
                  errors.push(error);
                }
            }
          }
        if (errors.length) throw new Error('RECOVERY_CLEANUP_FAILED');
      })()),
  });
}
