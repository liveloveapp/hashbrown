import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { LIVE_BUDGET_MANIFEST } from './live-budget';
import { publicChildEnvironment } from './live-configuration';
import { createLiveOutputReader, safeLiveError } from './live-diagnostics';

/** Owned native fixture; provider credentials never leave its selected child environment. */
export interface NativeLiveFixture {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

/** Starts the actual native SDK fixture with no upstream proxy, raw log sink, or TLS substitution. */
export async function startNativeLiveFixture(
  environment: Readonly<Record<string, string>>,
  group: string,
  signal: AbortSignal,
  origins: readonly string[],
): Promise<NativeLiveFixture> {
  if (
    group !== 'preflight' &&
    !LIVE_BUDGET_MANIFEST.groups.some((entry) => entry.name === group)
  )
    throw safeLiveError('LIVE_CHILD_START_FAILED');
  if (
    ['mixed-native-tools', 'native-approval'].includes(group) &&
    (environment['FixtureNativeSessions'] !== 'true' ||
      (group === 'native-approval' &&
        (environment['FixtureNativeApprovals'] !== 'true' ||
          environment['NativeGate'] !== '')) ||
      !environment['InterruptConnectionString']?.trim() ||
      environment['InterruptSchema']?.length !== 45 ||
      !/^durable_live_[a-f0-9]{32}$/.test(environment['InterruptSchema'] ?? ''))
  )
    throw safeLiveError('LIVE_CHILD_START_FAILED');
  if (signal.aborted) throw safeLiveError('LIVE_CHILD_TIMEOUT');
  const output = createLiveOutputReader();
  const child = spawn(
    environment['DOTNET_HOST_PATH'] ?? 'dotnet',
    [resolve('dist/tools/conformance/dotnet/Hashbrown.Conformance.dll')],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...environment,
        ASPNETCORE_URLS: 'http://127.0.0.1:0',
        FixtureLive: 'true',
        FixtureLiveGroup: group,
        FixtureOrigins: origins.join(','),
        Workflow: group === 'approval-resume-decline' ? 'confirm' : '',
      },
    },
  );
  child.stdout.on('data', output.stdout);
  child.stderr.on('data', output.stderr);
  let exited = false;
  let failed = false;
  child.once('error', () => {
    failed = true;
    exited = true;
  });
  const exit = new Promise<void>((done) =>
    child.once('close', () => {
      exited = true;
      done();
    }),
  );
  const kill = (kind: NodeJS.Signals) => {
    if (!child.pid || (process.platform === 'win32' && exited)) return;
    try {
      if (process.platform === 'win32') child.kill(kind);
      else process.kill(-child.pid, kind);
    } catch {
      /* An already-exited owned process needs no further action. */
    }
  };
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      signal.removeEventListener('abort', abort);
      kill('SIGTERM');
      const processGroup = child.pid;
      if (process.platform !== 'win32' && processGroup) {
        const groupAlive = () => {
          try {
            process.kill(-processGroup, 0);
            return true;
          } catch {
            return false;
          }
        };
        const grace = Date.now() + 500;
        while (groupAlive() && Date.now() < grace)
          await new Promise<void>((done) => setTimeout(done, 20));
        kill('SIGKILL');
        const boundedDrain = Date.now() + 1_000;
        while (groupAlive() && Date.now() < boundedDrain)
          await new Promise<void>((done) => setTimeout(done, 20));
        if (groupAlive()) throw safeLiveError('LIVE_CHILD_TIMEOUT');
        await exit;
      } else {
        const timer = setTimeout(() => kill('SIGKILL'), 500);
        try {
          await exit;
        } finally {
          clearTimeout(timer);
        }
      }
      if (['mixed-native-tools', 'native-approval'].includes(group)) {
        const cleanupSignal = AbortSignal.timeout(15_000);
        const cleanup = await startNativeLiveFixture(
          {
            ...publicChildEnvironment(environment),
            FixtureDropSchemaOnly: 'true',
            InterruptSchema: environment['InterruptSchema'],
            InterruptConnectionString: environment['InterruptConnectionString'],
          },
          'preflight',
          cleanupSignal,
          [],
        );
        try {
          const response = await fetch(`${cleanup.url}/__test/drop-schema`, {
            method: 'POST',
            signal: AbortSignal.timeout(5_000),
          });
          if (!response.ok) throw safeLiveError('LIVE_CHILD_FAILED');
        } finally {
          await cleanup.stop();
        }
      }
    })());
  const abort = () => {
    void stop().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  const started = Date.now();
  try {
    while (!output.url()) {
      if (signal.aborted || Date.now() - started >= 15_000)
        throw safeLiveError('LIVE_CHILD_TIMEOUT');
      if (failed || exited) throw safeLiveError('LIVE_CHILD_START_FAILED');
      await new Promise<void>((done) => setTimeout(done, 20));
    }
    if (signal.aborted) throw safeLiveError('LIVE_CHILD_TIMEOUT');
    const origin = output.url();
    if (!origin) throw safeLiveError('LIVE_CHILD_START_FAILED');
    return Object.freeze({ url: origin, stop });
  } catch {
    await stop();
    throw safeLiveError(
      signal.aborted ? 'LIVE_CHILD_TIMEOUT' : 'LIVE_CHILD_START_FAILED',
    );
  }
}
