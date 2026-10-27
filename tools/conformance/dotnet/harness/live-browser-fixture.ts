import { setTimeout as pollDelay } from 'node:timers/promises';
import { LIVE_BUDGET_MANIFEST } from './live-budget';
import { LIVE_PROJECTS } from './live-configuration';

/** Fixed metadata allowed to reach the live Playwright reporter. */
export interface LiveFailureAnnotation {
  readonly type: string;
  readonly description: string;
}

/** Sanitized native request evidence; authentication values and bodies are never returned. */
export interface LiveNativeWire {
  readonly method: string;
  readonly path: string;
  /** Zero is the internal pending marker before HTTP response headers arrive. */
  readonly status: number;
  readonly authentication: string;
  readonly maxOutputTokens: number;
  readonly store: boolean;
}

/** Safe fixture counters, retaining actual calls and gate cancellation evidence. */
export interface LiveNativeStats {
  readonly calls: number;
  readonly httpCalls: number;
  readonly cancelledCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly stage: string;
  readonly nativeCoEmission?: boolean;
  readonly nativeExactHistory?: boolean;
  readonly wire: readonly LiveNativeWire[];
}

/** Node-owned fixture capability; no provider credentials enter the browser worker. */
export interface LiveBrowserFixture {
  readonly url: string;
  readonly stats: (requestSignal?: AbortSignal) => Promise<LiveNativeStats>;
  readonly release: () => Promise<void>;
}

/** Validates the exact loopback origin before sending the ephemeral coordinator capability. */
function loopbackOrigin(value: string | undefined): string {
  try {
    const url = new URL(value ?? '');
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('LIVE_COORDINATOR_INVALID');
  }
}

/** Reads only the runner's loopback capability, without reading keys, credential files or profiles. */
export function readLiveCoordinator(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const origin = loopbackOrigin(environment['HASHBROWN_LIVE_COORDINATOR']);
  const capability = environment['HASHBROWN_LIVE_CAPABILITY'] ?? '';
  if (!/^[a-f0-9]{64}$/.test(capability))
    throw new Error('LIVE_COORDINATOR_INVALID');
  return Object.freeze({ origin, capability });
}

/**
 * Drains owned work on a deadline and removes all error fields before Playwright's
 * artifact recorder can observe them. The caller must close browser actions when
 * the signal aborts; the fixture coordinator independently kills native children.
 */
export async function withSafeLiveCase<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  annotate: (annotation: LiveFailureAnnotation) => void,
  timeoutMs = 55_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await operation(controller.signal);
    if (controller.signal.aborted) throw new Error();
    return result;
  } catch {
    annotate({ type: 'live-failure', description: 'LIVE_ASSERTION_FAILED' });
    const error = new Error('');
    error.name = '';
    error.stack = '';
    throw error;
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

/** Converts only bounded numeric counters into the public safe fixture contract. */
function counter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('LIVE_STATS_INVALID');
  return value;
}

/** Projects a fixture response into fixed metadata without preserving arbitrary response fields. */
function nativeStats(value: unknown): LiveNativeStats {
  if (!value || typeof value !== 'object')
    throw new Error('LIVE_STATS_INVALID');
  const input = value as Record<string, unknown>;
  const stages = [
    'starting',
    'ready',
    'acquiring',
    'streaming',
    'paused',
    'cancelled',
    'completed',
    'failed',
  ];
  if (
    typeof input['stage'] !== 'string' ||
    !stages.includes(input['stage']) ||
    !Array.isArray(input['wire']) ||
    input['wire'].length > 4
  )
    throw new Error('LIVE_STATS_INVALID');
  const wire = input['wire'].map((entry): LiveNativeWire => {
    if (!entry || typeof entry !== 'object')
      throw new Error('LIVE_STATS_INVALID');
    const row = entry as Record<string, unknown>;
    if (
      row['method'] !== 'POST' ||
      ![
        '/v1/responses',
        '/openai/v1/responses',
        '/openai/deployments/gpt-4.1-mini/chat/completions',
      ].includes(String(row['path'])) ||
      !['api-key', 'bearer', 'missing'].includes(
        String(row['authentication']),
      ) ||
      typeof row['store'] !== 'boolean'
    )
      throw new Error('LIVE_STATS_INVALID');
    const status = counter(row['status']);
    if ((status !== 0 && status < 100) || status > 599)
      throw new Error('LIVE_STATS_INVALID');
    return Object.freeze({
      method: 'POST',
      path: row['path'] as string,
      status,
      authentication: row['authentication'] as string,
      maxOutputTokens: counter(row['maxOutputTokens']),
      store: row['store'],
    });
  });
  return Object.freeze({
    calls: counter(input['calls']),
    httpCalls: counter(input['httpCalls']),
    cancelledCalls: counter(input['cancelledCalls']),
    inputTokens: counter(input['inputTokens']),
    outputTokens: counter(input['outputTokens']),
    stage: input['stage'],
    ...(typeof input['nativeCoEmission'] === 'boolean'
      ? { nativeCoEmission: input['nativeCoEmission'] }
      : {}),
    ...(typeof input['nativeExactHistory'] === 'boolean'
      ? { nativeExactHistory: input['nativeExactHistory'] }
      : {}),
    wire: Object.freeze(wire),
  });
}

/** Waits within the existing assertion bound for the exact fresh native invocation to finish enumeration. */
export async function waitForLiveNativeCompletion(
  fixture: Pick<LiveBrowserFixture, 'stats'>,
  calls: number,
): Promise<LiveNativeStats> {
  const signal = AbortSignal.timeout(10_000);
  while (!signal.aborted) {
    let stats: LiveNativeStats;
    try {
      stats = await fixture.stats(signal);
    } catch {
      throw new Error(
        signal.aborted
          ? 'LIVE_NATIVE_COMPLETION_TIMEOUT'
          : 'LIVE_NATIVE_COMPLETION_FAILED',
      );
    }
    if (signal.aborted) throw new Error('LIVE_NATIVE_COMPLETION_TIMEOUT');
    if (
      stats.stage === 'completed' &&
      stats.calls === calls &&
      stats.httpCalls === calls &&
      stats.wire.length === calls
    )
      return stats;
    if (
      stats.stage === 'failed' ||
      stats.calls > calls ||
      (stats.stage === 'cancelled' && stats.calls >= calls)
    )
      throw new Error('LIVE_NATIVE_COMPLETION_FAILED');
    try {
      await pollDelay(20, undefined, { signal });
    } catch {
      throw new Error('LIVE_NATIVE_COMPLETION_TIMEOUT');
    }
  }
  throw new Error('LIVE_NATIVE_COMPLETION_TIMEOUT');
}

/** Starts and drains one fixed project/group through the runner's credential-owning coordinator. */
export async function withLiveBrowserFixture<T>(
  project: string,
  group: string,
  signal: AbortSignal,
  operation: (fixture: LiveBrowserFixture) => Promise<T>,
): Promise<T> {
  if (
    !LIVE_PROJECTS.some((entry) => entry.name === project) ||
    !LIVE_BUDGET_MANIFEST.groups.some((entry) => entry.name === group)
  )
    throw new Error('LIVE_SCENARIO_INVALID');
  const coordinator = readLiveCoordinator(process.env);
  const headers = {
    'Content-Type': 'application/json',
    'X-Live-Capability': coordinator.capability,
  };
  const started = await fetch(`${coordinator.origin}/fixture`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ project, group }),
    signal,
  });
  if (!started.ok) throw new Error('LIVE_FIXTURE_START_FAILED');
  const selected = (await started.json()) as { id?: unknown; url?: unknown };
  if (
    typeof selected.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(selected.id) ||
    typeof selected.url !== 'string'
  )
    throw new Error('LIVE_FIXTURE_START_FAILED');
  const id = selected.id;
  /** Drains fixture ownership even when the operation fails. */
  const cleanup = async () => {
    const stopped = await fetch(`${coordinator.origin}/fixture/${id}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!stopped.ok) throw new Error('LIVE_FIXTURE_STOP_FAILED');
  };
  try {
    const url = loopbackOrigin(selected.url);
    const fixture = Object.freeze({
      url,
      stats: async (requestSignal?: AbortSignal) => {
        const response = await fetch(`${url}/__test/live-stats`, {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(5_000),
            ...(requestSignal ? [requestSignal] : []),
          ]),
        });
        if (!response.ok) throw new Error('LIVE_STATS_FAILED');
        return nativeStats(await response.json());
      },
      release: async () => {
        const response = await fetch(`${url}/__test/live-release`, {
          method: 'POST',
          signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
        });
        if (!response.ok) throw new Error('LIVE_RELEASE_FAILED');
      },
    });
    return await operation(fixture);
  } finally {
    await cleanup();
  }
}
