import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type { Page, Request, TestInfo } from '@playwright/test';

/** Fixed vocabulary prevents diagnostics from accepting private payloads or error text. */
export type RecoveryTimingComponent = 'route' | 'model' | 'worker' | 'browser';
/** Observable boundaries, all timestamped in the same Node worker clock domain. */
export type RecoveryTimingPhase =
  | 'request'
  | 'upstream-headers'
  | 'first-byte'
  | 'end'
  | 'error'
  | 'cancel'
  | 'ready'
  | 'stop'
  | 'route-change'
  | 'backpressure'
  | 'drain';
/** An opaque, fixture-owned request span. */
export type RecoveryRequestTrace = (
  phase: RecoveryTimingPhase,
  status?: number,
) => void;
/** A bounded per-case diagnostic collector. Snapshots never expose internal storage. */
export function createRecoveryTimeline() {
  const started = performance.now();
  const events: Array<{
    elapsedMs: number;
    requestId: string;
    component: RecoveryTimingComponent;
    phase: RecoveryTimingPhase;
    status?: number;
  }> = [];
  let requests = 0;
  let droppedRequests = 0;
  let droppedEvents = 0;
  const request = (
    component: RecoveryTimingComponent,
  ): RecoveryRequestTrace => {
    if (requests === 32) {
      droppedRequests++;
      droppedEvents++;
      return () => {
        droppedEvents++;
      };
    }
    const requestId = `r${++requests}`;
    const trace: RecoveryRequestTrace = (phase, status) => {
      if (events.length === 256) {
        droppedEvents++;
        return;
      }
      events.push({
        elapsedMs: performance.now() - started,
        requestId,
        component,
        phase,
        ...(typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 100 &&
        status <= 599
          ? { status }
          : {}),
      });
    };
    trace('request');
    return trace;
  };
  return {
    request,
    snapshot: () => ({
      events: events.map((event) => ({ ...event })),
      requests,
      droppedRequests,
      droppedEvents,
    }),
  };
}

const scope = new AsyncLocalStorage<
  ReturnType<typeof createRecoveryTimeline>
>();

/** Runs a case with isolated evidence, including overlapping asynchronous cases. */
export function withRecoveryTimeline<T>(
  timeline: ReturnType<typeof createRecoveryTimeline>,
  use: () => Promise<T>,
): Promise<T> {
  return scope.run(timeline, use);
}

/** Begins a span in the current case; does nothing outside an instrumented case. */
export function traceRecoveryRequest(
  component: RecoveryTimingComponent,
): RecoveryRequestTrace {
  return scope.getStore()?.request(component) ?? (() => undefined);
}

/** Captures the case explicitly before callbacks enter HTTP or browser event contexts. */
export function recoveryRequestRecorder(
  component: RecoveryTimingComponent,
): () => RecoveryRequestTrace {
  const timeline = scope.getStore();
  return () => timeline?.request(component) ?? (() => undefined);
}

/** Attaches bounded evidence on failure, or for deliberate repeat runs with DOTNET_RECOVERY_TIMINGS=1. */
export async function withRecoveryEvidence<T>(
  page: Page,
  info: TestInfo,
  use: () => Promise<T>,
): Promise<T> {
  const timeline = createRecoveryTimeline();
  const browserRequests = new WeakMap<Request, RecoveryRequestTrace>();
  const onRequest = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (path !== '/run' && !/^\/threads\/[^/]+\/recovery$/.test(path)) return;
    browserRequests.set(request, timeline.request('browser'));
  };
  const onResponse = (response: import('@playwright/test').Response) =>
    browserRequests.get(response.request())?.(
      'upstream-headers',
      response.status(),
    );
  const onFinished = (request: Request) =>
    browserRequests.get(request)?.('end');
  const onFailed = (request: Request) =>
    browserRequests.get(request)?.('error');
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFailed);
  let failed = false;
  try {
    return await withRecoveryTimeline(timeline, use);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfinished', onFinished);
    page.off('requestfailed', onFailed);
    if (failed || process.env['DOTNET_RECOVERY_TIMINGS'] === '1') {
      await info.attach('recovery-timeline', {
        body: JSON.stringify(timeline.snapshot(), null, 2),
        contentType: 'application/json',
      });
    }
  }
}
