import { spawn } from 'node:child_process';
import { type DotnetHostSelection, resolveDotnetHost } from './dotnet-host';
import { livePackageChildEnvironment } from './live-package';
import { LIVE_BUDGET_MANIFEST } from './live-budget';
import { publicChildEnvironment } from './live-configuration';
import { createLiveOutputReader, safeLiveError } from './live-diagnostics';

/** Closed validated evidence emitted only after a child proves its actual loaded assembly. */
export interface LivePackageIdentityWitness {
  readonly role: 'fixture' | 'probe' | 'cleanup';
  readonly identity: string;
  readonly sha256: string;
}

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
  selection: DotnetHostSelection,
  onIdentity?: (identity: LivePackageIdentityWitness) => void,
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
  let host;
  try {
    host = resolveDotnetHost(selection);
  } catch {
    throw safeLiveError('LIVE_CHILD_START_FAILED');
  }
  const cleanup = environment['FixtureDropSchemaOnly'] === 'true';
  const output = createLiveOutputReader(host.loaded);
  const child = spawn(
    host.command ?? environment['DOTNET_HOST_PATH'] ?? 'dotnet',
    [host.executable],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: host.workingDirectory,
      env: (host.loaded
        ? livePackageChildEnvironment
        : (_host: typeof host, values: Readonly<Record<string, string>>) =>
            values)(
        host,
        {
          ...environment,
          ASPNETCORE_URLS: 'http://127.0.0.1:0',
          ...(cleanup ? {} : { FixtureLive: 'true' }),
          FixtureLiveGroup: group,
          FixtureOrigins: origins.join(','),
          Workflow: group === 'approval-resume-decline' ? 'confirm' : '',
        },
        cleanup,
      ),
    },
  );
  child.stdout.on('data', (chunk: Buffer) => {
    output.stdout(chunk);
    if (output.failed()) {
      failed = true;
      kill('SIGKILL');
    }
  });
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
          selection,
          onIdentity,
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
      if (output.failed()) throw safeLiveError('LIVE_CHILD_FAILED');
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
      if (failed || exited || output.failed())
        throw safeLiveError('LIVE_CHILD_START_FAILED');
      await new Promise<void>((done) => setTimeout(done, 20));
    }
    if (signal.aborted) throw safeLiveError('LIVE_CHILD_TIMEOUT');
    if (failed || exited || output.failed())
      throw safeLiveError('LIVE_CHILD_START_FAILED');
    const origin = output.url();
    if (!origin) throw safeLiveError('LIVE_CHILD_START_FAILED');
    if (host.loaded)
      onIdentity?.({
        role: cleanup ? 'cleanup' : 'fixture',
        identity: host.loaded.identity,
        sha256: host.loaded.sha256,
      });
    return Object.freeze({ url: origin, stop });
  } catch {
    await stop();
    throw safeLiveError(
      signal.aborted ? 'LIVE_CHILD_TIMEOUT' : 'LIVE_CHILD_START_FAILED',
    );
  }
}

/** Executes the immutable deterministic journal probe without enabling provider access. */
export async function runPublicLiveProbe(
  selection: DotnetHostSelection,
  postgres: string,
  signal: AbortSignal,
  onIdentity?: (identity: LivePackageIdentityWitness) => void,
): Promise<void> {
  if (!postgres.trim() || signal.aborted)
    throw safeLiveError('LIVE_CHILD_FAILED');
  let host;
  try {
    host = resolveDotnetHost(selection, 'probe');
  } catch {
    throw safeLiveError('LIVE_CHILD_START_FAILED');
  }
  const { command, loaded } = host;
  if (!loaded || !command) throw safeLiveError('LIVE_CHILD_START_FAILED');
  const output = createLiveOutputReader(loaded);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  await new Promise<void>((accept, reject) => {
    const child = spawn(command, [host.executable, 'none'], {
      cwd: host.workingDirectory,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...livePackageChildEnvironment(host, {}, true),
        DOTNET_TEST_POSTGRES: postgres,
      },
    });
    let completed = false;
    let partial = '';
    const kill = () => {
      try {
        if (!child.pid) return;
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Owned child has exited. */
      }
    };
    deadline.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      output.stdout(chunk);
      for (const character of chunk.toString('utf8')) {
        if (character === '\n') {
          if (
            partial.trim() ===
            'Live approval real journal and native SDK proof passed; in-memory transport only.'
          )
            completed = true;
          partial = '';
        } else partial = (partial + character).slice(-256);
      }
      if (output.failed()) kill();
    });
    child.stderr.on('data', output.stderr);
    child.once('error', () => {
      deadline.removeEventListener('abort', kill);
      kill();
      reject(safeLiveError('LIVE_CHILD_START_FAILED'));
    });
    child.once('exit', kill);
    child.once('close', async (code) => {
      deadline.removeEventListener('abort', kill);
      kill();
      const groupAlive = () => {
        if (!child.pid || process.platform === 'win32') return false;
        try {
          process.kill(-child.pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      const end = Date.now() + 1000;
      while (groupAlive() && Date.now() < end)
        await new Promise<void>((done) => setTimeout(done, 20));
      if (
        groupAlive() ||
        deadline.aborted ||
        code !== 0 ||
        !completed ||
        !output.identityVerified()
      )
        reject(safeLiveError('LIVE_CHILD_FAILED'));
      else {
        try {
          onIdentity?.({
            role: 'probe',
            identity: loaded.identity,
            sha256: loaded.sha256,
          });
          accept();
        } catch {
          reject(safeLiveError('LIVE_CHILD_FAILED'));
        }
      }
    });
  });
}
