import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFile, copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  createLiveBudget,
  LIVE_BUDGET_MANIFEST,
  LIVE_CASE_COUNT,
  type LiveScenarioBudget,
} from './live-budget';
import { createLiveDiagnostics, safeLiveError } from './live-diagnostics';
import {
  LIVE_PROJECTS,
  type LiveConfiguration,
  loadLiveConfiguration,
  publicChildEnvironment,
  nativeLiveChildEnvironment,
} from './live-configuration';
import { startLiveStaticServer } from './live-static-server';
import { createLiveQualificationLedger } from './live-qualification';

/** Validated command shape; no Playwright execution overrides are accepted. */
export interface LiveRunnerArguments {
  readonly list: boolean;
  readonly credentialFile: string;
  readonly consumerMetadata?: string;
}

/** Parses the entire CLI before credential loading or construction of any child process. */
export function parseLiveRunnerArguments(
  args: readonly string[],
): LiveRunnerArguments {
  if (args.length === 1 && args[0] === '--list')
    return { list: true, credentialFile: '' };
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !['--credentials', '--consumer-metadata'].includes(name) ||
      values[name] !== undefined ||
      !value?.trim() ||
      value.startsWith('--')
    )
      throw new Error('LIVE_ARGUMENT_INVALID');
    values[name] = value;
  }
  return {
    list: false,
    credentialFile: values['--credentials'] ?? '',
    ...(values['--consumer-metadata']
      ? { consumerMetadata: values['--consumer-metadata'] }
      : {}),
  };
}

/** Resolves the installed package's declared public CLI bin without unsupported subpath exports. */
export function resolveLivePlaywrightCli(): string {
  const manifestPath = require.resolve('playwright/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bin?: { playwright?: unknown };
  };
  if (typeof manifest.bin?.playwright !== 'string')
    throw safeLiveError('LIVE_CHILD_START_FAILED');
  return resolve(dirname(manifestPath), manifest.bin.playwright);
}

/** Native fixture handle; its owner must abort and drain the process before releasing its budget. */
export interface LiveNativeFixture {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

/** Starts only a fixed manifest group with selected server environment and linked cancellation. */
export type LiveNativeStarter = (
  environment: Readonly<Record<string, string>>,
  group: string,
  signal: AbortSignal,
  origins: readonly string[],
) => Promise<LiveNativeFixture>;

/** Coordinator inputs keep selected credentials closure-owned in the parent runner. */
export interface LiveCoordinatorOptions {
  readonly configuration: LiveConfiguration;
  readonly origins: readonly string[];
  readonly startFixture: LiveNativeStarter;
  readonly diagnostic: (
    record: Readonly<Record<string, unknown>>,
  ) => boolean | void;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
}

/** Owns the sole run reservation and all native children behind an unguessable loopback capability. */
export async function createLiveCoordinator(options: LiveCoordinatorOptions) {
  const budget = createLiveBudget();
  const qualification = createLiveQualificationLedger();
  const diagnostic = (record: Readonly<Record<string, unknown>>) => {
    try {
      if (options.diagnostic(record) === false) return qualification.fail();
      return true;
    } catch {
      return qualification.fail();
    }
  };
  const capability = randomBytes(32).toString('hex');
  const fixtures = new Map<
    string,
    {
      fixture: LiveNativeFixture;
      allocation: LiveScenarioBudget;
      project: string;
      group: string;
    }
  >();
  let closing = false;
  let active = false;
  const pendingStarts = new Set<Promise<void>>();
  const recordStats = async (
    fixture: LiveNativeFixture,
    projectName: string,
    group: string | undefined,
    api = 'responses',
    preflight?: string,
    promoteEvidence = true,
  ) => {
    const project = options.configuration.projects.find(
      (entry) => entry.name === projectName,
    );
    const context = {
      project: projectName,
      group,
      provider: project?.provider,
      auth: project?.auth,
      api,
      model: options.configuration.model,
      preflight,
    };
    const [stats, counters] = await Promise.all([
      fetch(`${fixture.url}/__test/live-stats`, {
        signal: AbortSignal.timeout(1500),
      })
        .then((response) => response.json())
        .catch(() => ({})),
      fetch(`${fixture.url}/__test/counters`, {
        signal: AbortSignal.timeout(1500),
      })
        .then((response) => response.json())
        .catch(() => ({})),
    ]);
    diagnostic({ ...stats, ...context });
    for (const fact of Array.isArray(stats.wire) ? stats.wire : [])
      if (fact && typeof fact === 'object') diagnostic({ ...fact, ...context });
    diagnostic({
      ...context,
      effects: counters.protected,
      serverEffects: counters.server,
      nativeEffects: counters.durableNative,
    });
    const valid =
      promoteEvidence &&
      (group
        ? qualification.recordFixture(projectName, group, stats, counters)
        : !!preflight &&
          qualification.recordPreflight(preflight, stats, counters));
    return { ...stats, validEvidence: valid };
  };
  const stopFixture = async (id: string) => {
    const entry = fixtures.get(id);
    if (!entry) return;
    fixtures.delete(id);
    try {
      await recordStats(entry.fixture, entry.project, entry.group);
    } finally {
      entry.allocation.dispose();
      await entry.fixture.stop();
      active = false;
    }
  };
  const readBody = async (request: import('node:http').IncomingMessage) => {
    let body = '';
    for await (const chunk of request) {
      body += String(chunk);
      if (Buffer.byteLength(body) > 4096) throw new Error();
    }
    return JSON.parse(body);
  };
  const server = createServer(async (request, response) => {
    try {
      const supplied = request.headers['x-live-capability'];
      if (
        typeof supplied !== 'string' ||
        supplied.length !== capability.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(capability))
      ) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (closing || budget.signal.aborted || options.signal?.aborted)
        throw new Error();
      if (request.method === 'POST' && request.url === '/diagnostic') {
        const outcome = await readBody(request);
        const accepted = qualification.recordOutcome(outcome);
        const persisted = diagnostic(outcome);
        if (!accepted || !persisted) throw new Error();
        response.writeHead(204);
        response.end();
        return;
      }
      const requestUrl = request.url ?? '';
      if (
        request.method === 'DELETE' &&
        /^\/fixture\/[a-f0-9]{32}$/.test(requestUrl)
      ) {
        await stopFixture(requestUrl.split('/')[2]);
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method !== 'POST' || request.url !== '/fixture' || active)
        throw new Error();
      const input = (await readBody(request)) as {
        project: string;
        group: string;
      };
      if (
        active ||
        !options.configuration.projects.some(
          (entry) => entry.name === input.project,
        )
      )
        throw new Error();
      const allocation = budget.reserveScenario(input.project, input.group);
      active = true;
      const start = (async () => {
        const fixture = await options.startFixture(
          nativeLiveChildEnvironment(
            options.configuration.providerEnvironment(
              input.project,
              options.environment ?? process.env,
            ),
            options.environment ?? process.env,
            input.group,
            `durable_live_${randomBytes(16).toString('hex')}`,
          ),
          input.group,
          AbortSignal.any([
            allocation.signal,
            ...(options.signal ? [options.signal] : []),
          ]),
          options.origins,
        );
        if (closing || allocation.signal.aborted || options.signal?.aborted) {
          await fixture.stop();
          throw new Error();
        }
        const id = randomBytes(16).toString('hex');
        fixtures.set(id, {
          fixture,
          allocation,
          project: input.project,
          group: input.group,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ id, url: fixture.url }));
      })();
      pendingStarts.add(start);
      try {
        await start;
      } catch {
        active = false;
        allocation.dispose();
        throw new Error();
      } finally {
        pendingStarts.delete(start);
      }
    } catch {
      response.writeHead(400);
      response.end(JSON.stringify({ code: 'LIVE_REQUEST_FAILED' }));
    }
  });
  server.requestTimeout = 5000;
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return Object.freeze({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    capability,
    signal: budget.signal,
    snapshot: qualification.snapshot,
    assertComplete: () => {
      if (active || fixtures.size || pendingStarts.size) qualification.fail();
      qualification.assertComplete();
    },
    preflight: async (
      name: string,
      project: string,
      api: 'responses' | 'chat-completions',
    ) => {
      const allocation = budget.reservePreflight(name);
      const signal = AbortSignal.any([
        allocation.signal,
        ...(options.signal ? [options.signal] : []),
      ]);
      let fixture: LiveNativeFixture | undefined;
      let recorded = false;
      try {
        fixture = await options.startFixture(
          {
            ...options.configuration.providerEnvironment(
              project,
              options.environment ?? process.env,
            ),
            ModelApi: api,
          },
          'preflight',
          signal,
          options.origins,
        );
        const fixtureUrl = fixture.url;
        await allocation.dispatch(
          { signal, maxOutputTokens: 384 },
          async (signal) => {
            const response = await fetch(
              `${fixtureUrl}/__test/live-preflight`,
              { method: 'POST', signal },
            );
            if (!response.ok) throw safeLiveError('LIVE_PROVIDER_FAILED');
          },
        );
        const stats = await recordStats(fixture, project, undefined, api, name);
        recorded = true;
        if (
          !stats.validEvidence ||
          stats.calls !== 1 ||
          stats.httpCalls !== 1 ||
          !Array.isArray(stats.wire) ||
          stats.wire.length !== 1 ||
          stats.wire[0].status < 200 ||
          stats.wire[0].status >= 300
        )
          throw safeLiveError('LIVE_PROVIDER_FAILED');
        if (!diagnostic({ stage: 'completed', preflight: name }))
          throw new Error();
      } catch {
        qualification.fail();
        throw safeLiveError('LIVE_PROVIDER_FAILED');
      } finally {
        try {
          if (fixture && !recorded)
            await recordStats(fixture, project, undefined, api, name, false);
        } catch {
          qualification.fail();
        } finally {
          allocation.dispose();
          await fixture?.stop();
        }
      }
    },
    stop: async () => {
      closing = true;
      budget.dispose();
      server.closeAllConnections();
      await Promise.allSettled([...pendingStarts]);
      const stopped = await Promise.allSettled(
        [...fixtures.keys()].map(stopFixture),
      );
      await new Promise<void>((accept) => server.close(() => accept()));
      if (stopped.some((entry) => entry.status === 'rejected'))
        throw safeLiveError('LIVE_CHILD_FAILED');
    },
  });
}

/** Runs a child without persisting its stdout/stderr, terminating its owned group on deadline. */
export async function runOwnedChild(
  command: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>>,
  signal: AbortSignal,
  captureLastLine = false,
): Promise<{ code: number; lastLine: string }> {
  if (signal.aborted) throw safeLiveError('LIVE_CHILD_TIMEOUT');
  return new Promise((accept, reject) => {
    const child = spawn(command, [...args], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let lastLine = '';
    let partial = '';
    const abort = () => {
      try {
        if (!child.pid) return;
        if (process.platform === 'win32') {
          if (child.exitCode === null) child.kill('SIGKILL');
        } else process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Already exited. */
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (!captureLastLine) return;
      const lines = (partial + chunk.toString('utf8')).split(/\r?\n/);
      partial = (lines.pop() ?? '').slice(-8192);
      for (const line of lines) if (line.trim()) lastLine = line.slice(-8192);
    });
    child.stderr.on('data', () => undefined);
    child.once('error', () => {
      signal.removeEventListener('abort', abort);
      reject(safeLiveError('LIVE_CHILD_START_FAILED'));
    });
    child.once('exit', abort);
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      void (async () => {
        abort();
        const groupAlive = () => {
          if (!child.pid || process.platform === 'win32') return false;
          try {
            process.kill(-child.pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        const started = Date.now();
        while (groupAlive() && Date.now() - started < 1000)
          await new Promise<void>((done) => setTimeout(done, 20));
        if (groupAlive()) reject(safeLiveError('LIVE_CHILD_FAILED'));
        else if (signal.aborted) reject(safeLiveError('LIVE_CHILD_TIMEOUT'));
        else accept({ code: code ?? 1, lastLine: partial.trim() || lastLine });
      })();
    });
  });
}

/** Installs/builds or revalidates isolated published artifacts under an environment without provider secrets. */
async function prepareArtifacts(
  metadata: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
): Promise<{
  metadataPath: string;
  artifacts: { react: string; angular: string };
}> {
  const result = await runOwnedChild(
    process.execPath,
    [
      resolve(__dirname, '../live-consumer/qualify.mjs'),
      ...(metadata ? [metadata] : []),
    ],
    publicChildEnvironment(environment),
    signal,
    true,
  );
  if (result.code !== 0) throw safeLiveError('LIVE_CHILD_FAILED');
  try {
    const parsed = JSON.parse(result.lastLine);
    if (
      typeof parsed.metadataPath !== 'string' ||
      typeof parsed.artifacts?.react !== 'string' ||
      typeof parsed.artifacts?.angular !== 'string'
    )
      throw new Error();
    return parsed;
  } catch {
    throw safeLiveError('LIVE_CHILD_FAILED');
  }
}

/** Verified execution result includes actual evidence counts and explicit safe report locations. */
export interface LiveExecutionResult {
  readonly exitCode: number;
  readonly plannedCases: number;
  readonly actualPassedCases: number;
  readonly successfulPreflights: number;
  readonly reportDirectory: string;
  readonly verifiedMetadataPath?: string;
  readonly provenancePath?: string;
}

/** Executes the fixed matrix and accepts success only after complete evidence and healthy persistence. */
async function executeQualification(
  configuration: LiveConfiguration,
  args: LiveRunnerArguments,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<LiveExecutionResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    LIVE_BUDGET_MANIFEST.runTimeoutMs,
  );
  const output = await mkdtemp(join(tmpdir(), 'hashbrown-live-run-'));
  await mkdir(output, { recursive: true });
  let writes = Promise.resolve();
  let persistenceFailed = false;
  const diagnostics = createLiveDiagnostics({
    write: (line) => {
      writes = writes
        .then(() => appendFile(join(output, 'safe-diagnostics.jsonl'), line))
        .catch(() => {
          persistenceFailed = true;
        });
    },
  });
  let exitCode = 1;
  let verifiedMetadataPath: string | undefined;
  let provenancePath: string | undefined;
  let react: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
  let angular: Awaited<ReturnType<typeof startLiveStaticServer>> | undefined;
  let coordinator:
    Awaited<ReturnType<typeof createLiveCoordinator>> | undefined;
  try {
    const playwrightCli = resolveLivePlaywrightCli();
    process.stdout.write(JSON.stringify({ reportDirectory: output }) + '\n');
    const metadata = await prepareArtifacts(
      args.consumerMetadata,
      environment,
      controller.signal,
    );
    verifiedMetadataPath = metadata.metadataPath;
    provenancePath = join(output, 'consumer-provenance.json');
    await copyFile(metadata.metadataPath, provenancePath);
    react = await startLiveStaticServer(metadata.artifacts.react);
    angular = await startLiveStaticServer(metadata.artifacts.angular);
    const { startNativeLiveFixture } = await import('./live-fixture');
    coordinator = await createLiveCoordinator({
      configuration,
      origins: [react.url, angular.url],
      startFixture: startNativeLiveFixture,
      diagnostic: diagnostics.record,
      environment,
      signal: controller.signal,
    });
    coordinator.signal.addEventListener('abort', () => controller.abort(), {
      once: true,
    });
    await coordinator.preflight(
      'openai-responses',
      'react-openai-key',
      'responses',
    );
    await coordinator.preflight(
      'azure-responses',
      'react-azure-key',
      'responses',
    );
    await coordinator.preflight(
      'azure-cli-chat',
      'react-azure-cli',
      'chat-completions',
    );
    const result = await runOwnedChild(
      process.execPath,
      [
        playwrightCli,
        'test',
        '--config',
        resolve(__dirname, '../live.playwright.config.ts'),
      ],
      {
        ...publicChildEnvironment(environment),
        PLAYWRIGHT_NO_COPY_PROMPT: '1',
        HASHBROWN_LIVE_COORDINATOR: coordinator.url,
        HASHBROWN_LIVE_CAPABILITY: coordinator.capability,
        HASHBROWN_LIVE_REACT_ORIGIN: react.url,
        HASHBROWN_LIVE_ANGULAR_ORIGIN: angular.url,
        HASHBROWN_LIVE_OUTPUT: join(output, 'playwright'),
      },
      controller.signal,
    );
    if (result.code !== 0) throw new Error('LIVE_QUALIFICATION_INCOMPLETE');
    coordinator.assertComplete();
    exitCode = 0;
  } catch {
    exitCode = 1;
  } finally {
    clearTimeout(timer);
    controller.abort();
    try {
      await coordinator?.stop();
    } catch {
      exitCode = 1;
    }
    const cleanup = await Promise.allSettled([react?.stop(), angular?.stop()]);
    if (cleanup.some((entry) => entry.status === 'rejected')) exitCode = 1;
    diagnostics.record({ stage: exitCode === 0 ? 'completed' : 'failed' });
    await writes;
    try {
      diagnostics.assertHealthy();
    } catch {
      exitCode = 1;
    }
    if (persistenceFailed) exitCode = 1;
  }
  const actual = coordinator?.snapshot();
  return {
    exitCode,
    plannedCases: LIVE_CASE_COUNT,
    actualPassedCases: actual?.actualPassedCases ?? 0,
    successfulPreflights: actual?.successfulPreflights ?? 0,
    reportDirectory: output,
    ...(verifiedMetadataPath ? { verifiedMetadataPath } : {}),
    ...(provenancePath ? { provenancePath } : {}),
  };
}

/** Gated entry point; list mode remains usable without credentials or provider-capable processes. */
export async function executeLiveRunner(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: {
    readonly loadConfiguration?: typeof loadLiveConfiguration;
    readonly execute?: typeof executeQualification;
  } = {},
) {
  const parsed = parseLiveRunnerArguments(args);
  if (parsed.list)
    return {
      exitCode: 0,
      projects: LIVE_PROJECTS.map((entry) => entry.name),
      cases: LIVE_CASE_COUNT,
    };
  if (environment['HASHBROWN_LIVE_OPT_IN'] !== '1')
    throw new Error('LIVE_OPT_IN_REQUIRED');
  const configuration = await (
    dependencies.loadConfiguration ?? loadLiveConfiguration
  )({
    optIn: environment['HASHBROWN_LIVE_OPT_IN'],
    credentialFile: parsed.credentialFile,
    projects: LIVE_PROJECTS.map((entry) => entry.name),
  });
  const result = await (dependencies.execute ?? executeQualification)(
    configuration,
    parsed,
    environment,
  );
  return { ...result, projects: LIVE_PROJECTS.map((entry) => entry.name) };
}

if (require.main === module) {
  executeLiveRunner(process.argv.slice(2), process.env).then(
    (result) => {
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exitCode = result.exitCode;
    },
    () => {
      process.stderr.write('LIVE_RUN_FAILED\n');
      process.exitCode = 1;
    },
  );
}
