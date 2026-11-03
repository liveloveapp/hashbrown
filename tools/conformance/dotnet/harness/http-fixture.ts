import {
  type DotnetFixtureConfiguration,
  type DotnetHostSelection,
  fixtureChildEnvironment,
  type HistoricalDotnetHostSelection,
  resolveDotnetHost,
  validateHostOverrides,
  verifyLoadedDotnetHost,
} from './dotnet-host';
import { terminateFixture } from './terminate-fixture';
import { EventSchemas } from '@ag-ui/core/schemas';
import { LLMock } from '@copilotkit/aimock';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { StableModelRouter } from './stable-model-router';
import type { createEventGate } from '../../harness/event-gate';
import {
  recoveryRequestRecorder,
  traceRecoveryRequest,
} from './recovery-timings';

/** Test-only gate applied after actual native model text frames have passed through. */
export interface ModelStreamControl {
  readonly pauseAfter: number;
  readonly gate: ReturnType<typeof createEventGate>;
}

/** Native model request captured before aimock normalizes its wire shape. */
export interface ModelRequest {
  readonly path: string;
  readonly body: Record<string, unknown>;
  readonly authentication: 'api-key' | 'bearer' | 'missing';
}

/** Owned real .NET integration and deterministic model upstream for a test. */
export interface DotnetFixture {
  readonly url: string;
  /** Actual spawned OS process and awaited termination evidence. */
  readonly process: {
    readonly pid: number;
    readonly executable: string;
    readonly startedAt: string;
    readonly exited: () =>
      | { code: number | null; signal: NodeJS.Signals | null; at: string }
      | undefined;
  };
  readonly mock: LLMock;
  readonly requests: readonly ModelRequest[];
  readonly diagnostics: () => string;
  readonly upstreamAborted: () => boolean;
  /** Terminates the worker immediately while retaining its durable storage. */
  readonly stop: () => Promise<void>;
}

/** Runs a body with isolated model fixtures, original request evidence, and a .NET process. */
export async function withDotnetFixture<T>(
  provider: 'openai' | 'azure',
  use: (fixture: DotnetFixture) => Promise<T>,
  workflow = '',
  streamControl?: ModelStreamControl,
  environment: DotnetFixtureConfiguration = {},
  modelRouter?: StableModelRouter,
  hostSelection?: DotnetHostSelection | HistoricalDotnetHostSelection,
  packageOrigins?: readonly [string, string],
): Promise<T> {
  const host = resolveDotnetHost(hostSelection);
  if (host.loaded || host.controlled) validateHostOverrides(environment);
  const fixtureOrigins = host.loaded
    ? (
        packageOrigins ?? [
          process.env['HASHBROWN_PACKAGE_REACT_URL'],
          process.env['HASHBROWN_PACKAGE_ANGULAR_URL'],
        ]
      )
        .map((value) => {
          const url = new URL(value ?? '');
          if (
            url.protocol !== 'http:' ||
            url.hostname !== '127.0.0.1' ||
            !url.port ||
            url.origin !== value
          )
            throw new Error('Explicit owned package origin required');
          return url.origin;
        })
        .join(',')
    : (process.env['FixtureOrigins'] ??
      'http://127.0.0.1:4431,http://127.0.0.1:4432');
  const workerTrace = traceRecoveryRequest('worker');
  const beginModelTrace = recoveryRequestRecorder('model');
  const mock = new LLMock({ port: 0, strict: true });
  mock.onMessage('Hello fixture', { content: 'Hello from .NET' });
  await mock.start();
  const requests: ModelRequest[] = [];
  let upstreamAborted = false;
  const proxy = createServer(async (request, response) => {
    const trace = beginModelTrace();
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    requests.push({
      path: request.url ?? '/',
      body: JSON.parse(body.toString('utf8')),
      authentication: request.headers['api-key']
        ? 'api-key'
        : request.headers.authorization?.startsWith('Bearer ')
          ? 'bearer'
          : 'missing',
    });
    const cancellation = new AbortController();
    let completed = false;
    response.once('close', () => {
      if (!completed) {
        upstreamAborted = true;
        trace('cancel');
      }
      cancellation.abort();
    });
    try {
      const upstream = await fetch(`${mock.url}${request.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: cancellation.signal,
      });
      trace('upstream-headers', upstream.status);
      response.writeHead(upstream.status, {
        'Content-Type':
          upstream.headers.get('content-type') ?? 'text/event-stream',
      });
      let firstByte = true;
      response.on('drain', () => trace('drain'));
      let pending = Buffer.alloc(0);
      let characters = 0;
      let paused = false;
      for await (const chunk of upstream.body ?? []) {
        if (firstByte) {
          firstByte = false;
          trace('first-byte');
        }
        if (!streamControl) {
          if (!response.write(chunk)) trace('backpressure');
          continue;
        }
        pending = Buffer.concat([pending, chunk]);
        let boundary = pending.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = pending.subarray(0, boundary + 2);
          pending = pending.subarray(boundary + 2);
          if (!response.write(frame)) trace('backpressure');
          const data = frame.toString('utf8').match(/^data:\s*(\{.*\})/m)?.[1];
          if (data) {
            const payload = JSON.parse(data) as {
              type?: string;
              delta?: string;
              choices?: Array<{ delta?: { content?: string } }>;
            };
            characters +=
              payload.type === 'response.output_text.delta' &&
              typeof payload.delta === 'string'
                ? payload.delta.length
                : (payload.choices?.[0]?.delta?.content?.length ?? 0);
          }
          if (!paused && characters >= streamControl.pauseAfter) {
            paused = true;
            await streamControl.gate.wait(0, cancellation.signal);
          }
          boundary = pending.indexOf('\n\n');
        }
      }
      if (pending.length) response.write(pending);
      completed = true;
      trace('end');
      response.end();
    } catch {
      trace('error');
      response.destroy();
    }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const modelUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const route = modelRouter?.register(modelUrl);
  const endpoint = route?.endpoint ?? modelUrl;
  const child = spawn(
    host.command ?? process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
    [host.executable],
    {
      cwd: host.workingDirectory,
      env: fixtureChildEnvironment(host, {
        ASPNETCORE_URLS: 'http://127.0.0.1:0',
        Provider: provider,
        ModelEndpoint: provider === 'openai' ? `${endpoint}/v1` : endpoint,
        Model:
          provider === 'openai'
            ? 'fixture-openai-model'
            : 'fixture-azure-deployment',
        ApiKey: route?.apiKey ?? 'fixture-only',
        Workflow: workflow,
        FixtureOrigins: fixtureOrigins,
        ...environment,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const startedAt = new Date().toISOString();
  let exit:
    | { code: number | null; signal: NodeJS.Signals | null; at: string }
    | undefined;
  child.once('exit', (code, signal) => {
    exit = { code, signal, at: new Date().toISOString() };
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output = (output + data).slice(-32_000);
  });
  child.stderr.on('data', (data) => {
    output = (output + data).slice(-32_000);
  });
  try {
    const url = await new Promise<string>((resolveReady, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`.NET startup timed out: ${output}`)),
        15_000,
      );
      const check = () => {
        const match = output.match(
          /Now listening on: (http:\/\/127\.0\.0\.1:\d+)/,
        );
        if (match) {
          clearTimeout(timeout);
          resolveReady(match[1]);
        }
      };
      child.stdout.on('data', check);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`.NET exited ${code}: ${output}`));
      });
      check();
    });
    const health = await fetch(`${url}/health`);
    if (!health.ok) throw new Error(`.NET health failed: ${output}`);
    verifyLoadedDotnetHost(host, output);
    if (child.pid === undefined) throw new Error('Spawned fixture PID missing');
    workerTrace('ready');
    return await use({
      url,
      process: {
        pid: child.pid,
        executable: host.executable,
        startedAt,
        exited: () => exit,
      },
      mock,
      requests,
      diagnostics: () => output,
      upstreamAborted: () => upstreamAborted,
      stop: async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        workerTrace('stop');
        child.kill('SIGKILL');
        await exited;
      },
    });
  } catch (error) {
    try {
      const packageMode = Boolean(host.loaded || host.controlled);
      const privateEvidence =
        process.env['HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY'] ??
        process.env['HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY'];
      const privateRoot =
        packageMode && privateEvidence
          ? realpathSync(privateEvidence)
          : undefined;
      const workspace = realpathSync(resolve('.'));
      const directory = packageMode
        ? privateRoot &&
          privateRoot !== workspace &&
          !privateRoot.startsWith(workspace + sep)
          ? resolve(privateRoot, 'fixture-diagnostics')
          : undefined
        : resolve('test-results/conformance/dotnet/diagnostics');
      if (directory) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          resolve(directory, `${provider}-${crypto.randomUUID()}.log`),
          JSON.stringify({ output, requests }, null, 2),
        );
      }
    } catch {
      // Diagnostic failures must not replace the original fixture failure.
    }
    throw error;
  } finally {
    streamControl?.gate.releaseThrough(0);
    if (
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      workerTrace('stop');
      await terminateFixture(child);
    }
    route?.dispose();
    proxy.closeAllConnections();
    await new Promise<void>((resolveClose) =>
      proxy.close(() => resolveClose()),
    );
    await mock.stop();
  }
}

/** Creates a standard run without Hashbrown extensions for HTTP contract tests. */
export function runInput(content = 'Hello fixture') {
  return {
    threadId: 'fixture-thread',
    runId: crypto.randomUUID(),
    messages: [{ id: 'fixture-user', role: 'user', content }],
    tools: [],
    context: [],
    forwardedProps: {},
  };
}

/** Posts a run to the actual .NET endpoint and decodes its SSE data records. */
export async function postRun(
  fixture: DotnetFixture,
  input: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${fixture.url}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...headers,
    },
    body: JSON.stringify(input),
  });
  let body = '';
  const decoder = new TextDecoder();
  try {
    for await (const bytes of response.body ?? [])
      body += decoder.decode(bytes, { stream: true });
    body += decoder.decode();
  } catch (error) {
    throw new Error(
      `Native response read failed: ${String(error)}\n${body}\n${fixture.diagnostics()}\n${JSON.stringify(fixture.requests)}`,
    );
  }
  const events = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line): Record<string, unknown> => JSON.parse(line.slice(5)));
  for (const event of events) EventSchemas.parse(event);
  if (response.ok) {
    const terminals = events.filter(
      (event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR',
    );
    // Upstream may fail before starting a run, emitting only its native error event.
    const failedBeforeStart =
      events.length === 1 && events[0].type === 'RUN_ERROR';
    if (
      (!failedBeforeStart && events[0]?.type !== 'RUN_STARTED') ||
      terminals.length !== 1 ||
      terminals[0] !== events.at(-1)
    )
      throw new Error(`Invalid native AG-UI run lifecycle: ${body}`);
  }
  return { response, events, body };
}
