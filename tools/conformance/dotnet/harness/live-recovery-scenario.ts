import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { ReleaseRecoveryControlMutation } from './live-recovery-control-contract';
import { LIVE_PROJECTS } from './live-configuration';
import type { ReleaseRecoveryCase } from './live-recovery-manifest';
import {
  drainRecoveryCleanup,
  type RecoveryScenarioBudget,
} from './live-recovery-budget';
import type { ReleaseRecoveryPackages } from './live-recovery-package';
import {
  createLiveRecoveryCluster,
  type LiveRecoveryWorker,
} from './live-recovery-fixture';
import { startLiveRecoveryHandlerObserver } from './live-recovery-handler-observer';
import {
  type LiveRecoveryProxy,
  startLiveRecoveryProxy,
} from './live-recovery-transport';
import {
  assertColdRecoveryEvidence,
  assertCompletedRecoveryInert,
  assertDeferredRecoveryPending,
  assertRecoveryProviderHistory,
  assertRecoveryRuntimeAdoption,
  type ColdRecoveryEvidence,
  type CompletedRecoveryObservation,
  type RecoveryCall,
  recoveryDigest,
  recoveryJson,
  recoveryNativeResults,
  type RecoveryResult,
  type RecoveryWorkerEvidence,
} from './live-recovery-evidence';
import {
  assertCandidateContinuation,
  assertCandidatePersistedRecoveryAbsent,
} from './candidate-browser-evidence';

interface NativeHistory {
  readonly role: string;
  readonly text: string;
  readonly calls: readonly RecoveryCall[];
  readonly results: readonly RecoveryResult[];
  readonly unsupported: number;
}
interface NativeCall {
  readonly runId: string;
  readonly history: readonly NativeHistory[];
  readonly outputs: readonly {
    readonly text: string;
    readonly calls: readonly RecoveryCall[];
  }[];
  readonly usageCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly completed: boolean;
  readonly disposed: boolean;
  readonly validUsage: boolean;
  readonly terminal: string;
  readonly wire: null | {
    readonly method: string;
    readonly path: string;
    readonly authentication: string;
    readonly maxOutputTokens: number;
    readonly store: boolean;
    readonly status: number;
    readonly input: readonly Record<string, unknown>[];
  };
}
interface NativeEvidence {
  readonly workerId: string;
  readonly pid: number;
  readonly phase: string;
  readonly healthy: boolean;
  readonly kind: string;
  readonly refusedAcquisitions: number;
  readonly calls: readonly NativeCall[];
  readonly stages: readonly {
    readonly stage: string;
    readonly runId: string;
    readonly threadId: string;
  }[];
}
interface PhysicalState {
  readonly session: null | {
    readonly state: string;
    readonly revision: number;
    readonly generation: number;
    readonly payload: string;
  };
  readonly invocations: readonly {
    readonly call_id: string;
    readonly name: string;
    readonly state: string;
    readonly version: number;
    readonly descriptor: string;
    readonly captured_generation: number;
    readonly dispatch_generation: number | null;
  }[];
  readonly effects: readonly unknown[];
}
interface BrowserStatus {
  readonly pending: null | {
    readonly id: string;
    readonly serverRevision: number;
    readonly toolCalls: readonly { readonly id: string }[];
  };
  readonly recovery: { readonly required: boolean; readonly revision: number };
  readonly messages: readonly Record<string, unknown>[];
  readonly events: readonly {
    readonly type: string;
    readonly runId: string;
    readonly requestId: string;
  }[];
  readonly localError: string | null;
  readonly error: unknown;
  readonly isLoading: boolean;
  readonly isResuming: boolean;
  readonly lastRead: null | {
    readonly disposition: string;
    readonly schemaVersion: number;
    readonly serverRevision: number;
  };
  readonly configuration: unknown;
}
interface RecoveryRead {
  readonly disposition: string;
  readonly schemaVersion: number;
  readonly serverRevision: number;
  readonly snapshot?: {
    readonly messages: readonly Record<string, unknown>[];
    readonly pendingBrowserRecovery?: {
      readonly protocolVersion: number;
      readonly serverRevision: number;
      readonly callIds: readonly string[];
    };
  };
}

async function json<T>(
  worker: LiveRecoveryWorker,
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(worker.url + path, {
    headers: { 'X-Fixture-Principal': 'alice' },
    signal,
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(
    Buffer.byteLength(text) <= 8 * 1024 * 1024,
    'RECOVERY_HTTP_EVIDENCE_LIMIT',
  );
  return JSON.parse(text) as T;
}
async function status(page: Page): Promise<BrowserStatus> {
  return JSON.parse(
    await page.getByTestId('status').innerText(),
  ) as BrowserStatus;
}
function canonical(state: PhysicalState): {
  readonly messages: readonly Record<string, unknown>[];
} {
  assert.ok(state.session?.payload);
  const payload = JSON.parse(state.session.payload);
  assert.equal(typeof payload.publicRequest, 'string');
  return JSON.parse(payload.publicRequest);
}
function canonicalCalls(
  messages: readonly Record<string, unknown>[],
): RecoveryCall[] {
  return messages.flatMap((message) =>
    Array.isArray(message.toolCalls)
      ? message.toolCalls.map((call) => ({
          id: String(call.id),
          name: String(call.function.name),
          arguments: JSON.parse(call.function.arguments),
        }))
      : [],
  );
}
function canonicalResults(
  messages: readonly Record<string, unknown>[],
): RecoveryResult[] {
  return messages.flatMap((message) =>
    message.role === 'tool'
      ? [
          {
            id: String(message.toolCallId),
            result: JSON.parse(String(message.content)),
          },
        ]
      : [],
  );
}
async function until<T>(
  signal: AbortSignal,
  read: () => Promise<T>,
  ready: (value: T) => boolean,
): Promise<T> {
  while (true) {
    signal.throwIfAborted();
    const value = await read();
    if (ready(value)) return value;
    await new Promise<void>((done) => setTimeout(done, 20));
  }
}
function assertNative(
  evidence: NativeEvidence,
  expected: number,
  worker: LiveRecoveryWorker,
  project: string,
  deterministicControl = false,
): void {
  assert.equal(
    evidence.kind,
    deterministicControl ? 'deterministic-control' : 'genuine-provider',
  );
  if (evidence.calls.some((call) => !call.validUsage || call.usageCount !== 1))
    throw new Error('RECOVERY_USAGE_INVALID');
  assert.equal(evidence.refusedAcquisitions, 0);
  assert.equal(evidence.healthy, true);
  assert.equal(evidence.pid, worker.pid);
  assert.equal(evidence.phase, worker.phase);
  assert.equal(evidence.calls.length, expected);
  const selected = LIVE_PROJECTS.find((entry) => entry.name === project)!;
  for (const call of evidence.calls) {
    assert.equal(call.completed, true);
    assert.equal(call.disposed, true);
    assert.equal(call.terminal, 'completed');
    assert.equal(call.validUsage, true);
    assert.equal(call.usageCount, 1);
    assert.ok(Number.isSafeInteger(call.inputTokens) && call.inputTokens >= 0);
    assert.ok(
      Number.isSafeInteger(call.outputTokens) &&
        call.outputTokens >= 0 &&
        call.outputTokens <= 384,
    );
    assert.ok(call.history.every((message) => message.unsupported === 0));
    assert.ok(call.wire);
    assert.equal(call.wire.method, 'POST');
    assert.equal(
      call.wire.path,
      selected.provider === 'openai' ? '/v1/responses' : '/openai/v1/responses',
    );
    assert.equal(call.wire.store, false);
    assert.equal(call.wire.maxOutputTokens, 384);
    assert.ok(call.wire.status >= 200 && call.wire.status < 300);
    assert.ok(['api-key', 'bearer'].includes(call.wire.authentication));
    if (selected.auth === 'azure-cli')
      assert.equal(call.wire.authentication, 'bearer');
  }
}
function workerEvidence(
  evidence: NativeEvidence,
  worker: LiveRecoveryWorker,
): RecoveryWorkerEvidence {
  const begun = evidence.stages
    .filter((record) => record.stage === 'Run.Forward')
    .map((record) => record.runId);
  const disposed = evidence.stages
    .filter((record) => record.stage === 'Context.Disposed')
    .map((record) => record.runId);
  return {
    workerId: evidence.workerId,
    pid: evidence.pid,
    loadedSha256: worker.loaded.sha256,
    drained: true,
    begunRuns: begun,
    disposedRuns: disposed,
    attempts: evidence.calls.length,
    wireCalls: evidence.calls.filter((call) => call.wire !== null).length,
    completedCalls: evidence.calls.filter(
      (call) => call.completed && call.disposed,
    ).length,
    validUsageCalls: evidence.calls.filter(
      (call) => call.validUsage && call.usageCount === 1,
    ).length,
  };
}
function readResponsesInput(call: NativeCall): {
  calls: RecoveryCall[];
  results: RecoveryResult[];
} {
  assert.ok(call.wire);
  const items = call.wire.input;
  assert.ok(
    items.every(
      (item) =>
        !item['type'] ||
        ['message', 'function_call', 'function_call_output'].includes(
          String(item['type']),
        ),
    ),
  );
  return {
    calls: items
      .filter((item) => item['type'] === 'function_call')
      .map((item) => ({
        id: String(item['call_id']),
        name: String(item['name']),
        arguments: JSON.parse(String(item['arguments'])),
      })),
    results: items
      .filter((item) => item['type'] === 'function_call_output')
      .map((item) => ({
        id: String(item['call_id']),
        result: JSON.parse(String(item['output'])),
      })),
  };
}
function assertResultMembership(
  actual: readonly RecoveryResult[],
  expected: readonly RecoveryResult[],
): void {
  const sort = (values: readonly RecoveryResult[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  if (recoveryJson(sort(actual)) !== recoveryJson(sort(expected)))
    throw new Error('RECOVERY_RESULT_BINDING_INVALID');
}
function assertSourceRun(
  proxy: LiveRecoveryProxy,
  threadId: string,
  requestId: string,
): void {
  const source = Buffer.concat(
    proxy
      .records(threadId)
      .filter(
        (entry) =>
          entry.requestId === requestId && entry.kind === 'upstream-body',
      )
      .map((entry) => entry.bytes),
  ).toString();
  assert.match(source, /\r?\n\r?\n$/);
  const events = source
    .split(/\r?\n\r?\n/)
    .filter((frame) => frame.trim())
    .map((frame) =>
      JSON.parse(
        frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n'),
      ),
    );
  assert.equal(events[0].type, 'RUN_STARTED');
  assert.equal(events.at(-1).type, 'RUN_FINISHED');
  assert.equal(
    events.filter((event) => event.type === 'RUN_FINISHED').length,
    1,
  );
  assert.equal(events.filter((event) => event.type === 'RUN_ERROR').length, 0);
}
function runRequests(proxy: LiveRecoveryProxy, threadId: string) {
  return proxy
    .records(threadId)
    .filter(
      (record) => record.kind === 'request' && record.incomingBody.length > 0,
    )
    .flatMap((record) => {
      const input = JSON.parse(record.incomingBody.toString());
      return input.threadId === threadId && Array.isArray(input.messages)
        ? [{ record, input }]
        : [];
    });
}
function latestRead(proxy: LiveRecoveryProxy, threadId: string): RecoveryRead {
  const records = proxy.records(threadId);
  const runs = new Set(
    runRequests(proxy, threadId).map((item) => item.record.requestId),
  );
  const latest = records
    .filter(
      (record) => record.kind === 'request' && !runs.has(record.requestId),
    )
    .at(-1);
  assert.ok(latest);
  const raw = Buffer.concat(
    records
      .filter(
        (record) =>
          record.requestId === latest.requestId &&
          record.kind === 'upstream-body',
      )
      .map((record) => record.bytes),
  );
  return JSON.parse(raw.toString()) as RecoveryRead;
}

/** Runs real framework restore/settle/follow-up against two genuine provider workers sharing one durable schema. */
export async function runLiveRecoveryCase(options: {
  readonly browser: Browser;
  readonly record: ReleaseRecoveryCase;
  readonly packages: ReleaseRecoveryPackages;
  readonly provider: Readonly<Record<string, string>>;
  readonly postgres: string;
  readonly origins: Readonly<{ react: string; angular: string }>;
  readonly budget: RecoveryScenarioBudget;
  readonly deterministicControl?: Readonly<{
    mutation?: ReleaseRecoveryControlMutation;
    replacementGate?: string;
    observeReplacement?: (
      worker: LiveRecoveryWorker,
      proxy: LiveRecoveryProxy,
      threadId: string,
      signal: AbortSignal,
    ) => Promise<void>;
  }>;
}): Promise<
  Readonly<{
    id: string;
    attempts: number;
    wireCalls: number;
    validUsageCalls: number;
    originalWorker: string;
    replacementWorker: string;
    loadedSha256: string;
    historySha256: string;
    cleanup: 'passed';
  }>
> {
  const { record, packages, budget } = options;
  budget.assertActive();
  await packages.assertAnchored();
  budget.assertActive();
  const signal = budget.signal;
  const selected = LIVE_PROJECTS.find(
    (entry) => entry.name === record.project,
  )!;
  const origin = options.origins[selected.framework];
  const origins = Object.values(options.origins);
  const threadId = `release-recovery-${randomUUID()}`;
  const scope = { scenarioId: record.id, threadId };
  const cluster = await createLiveRecoveryCluster({
    selection: packages.selection,
    provider: options.provider,
    postgres: options.postgres,
    origins,
    signal,
    remainingMs: budget.remainingMs,
    deterministicControl: !!options.deterministicControl,
    replacementGate: options.deterministicControl?.replacementGate,
    controlMutation: options.deterministicControl?.mutation,
  });
  const contexts: BrowserContext[] = [];
  const pageErrors: string[] = [];
  const abortContexts = () => {
    for (const context of contexts) void context.close().catch(() => undefined);
  };
  const observer = await startLiveRecoveryHandlerObserver({
    ownedOrigins: origins,
    limits: {
      requestBytes: 16_384,
      resultBytes: 16_384,
      records: 512,
      holdTimeoutMs: Math.max(1, budget.remainingMs()),
    },
  });
  const proxy = await startLiveRecoveryProxy({
    ownedOrigins: origins,
    limits: {
      requestBytes: 1024 * 1024,
      responseBytes: 4 * 1024 * 1024,
      frameBytes: 1024 * 1024,
      records: 2048,
      holdTimeoutMs: Math.max(1, budget.remainingMs()),
    },
  }).catch(async () => {
    await observer.close();
    throw new Error('RECOVERY_PROXY_START');
  });
  signal.addEventListener('abort', abortContexts, { once: true });
  let computations = 0;
  const weather = { city: 'Paris', temperatureC: 21, condition: 'sunny' };
  const registration = observer.register({
    scope,
    operations: [
      {
        correlation: 'Paris',
        toolName: 'getWeather',
        arguments: { city: 'Paris' },
        compute: () => {
          computations++;
          return weather;
        },
      },
    ],
  });
  const configuration = {
    facade: 'chat',
    scenarioId: record.id,
    threadId,
    principal: 'alice',
    endpoint: proxy.origin,
    observer: registration,
    prompt:
      'In one response call BOTH getWeather with city Paris AND lookupAirport with code PDX. Do not answer before both tools. Call each exactly once.',
    nextPrompt:
      'Using the existing tool results, answer briefly: what weather and airport did you find? Do not call any tools.',
    deadlineMs: Math.max(1, budget.remainingMs()),
  };
  const url = `${origin}/?config=${encodeURIComponent(JSON.stringify(configuration))}`;
  const open = async () => {
    budget.assertActive();
    const context = await options.browser.newContext();
    contexts.push(context);
    if (signal.aborted) {
      await context.close();
      budget.assertActive();
    }
    context.setDefaultTimeout(Math.max(1, budget.remainingMs()));
    context.setDefaultNavigationTimeout(Math.max(1, budget.remainingMs()));
    const page = await context.newPage();
    page.on('pageerror', () => pageErrors.push('RECOVERY_BROWSER_RUNTIME'));
    budget.assertActive();
    const response = await page.goto(url, {
      timeout: Math.max(1, budget.remainingMs()),
    });
    assert.ok(response?.ok());
    assert.equal(new URL(page.url()).origin, origin);
    await page.getByTestId('start').waitFor({
      state: 'visible',
      timeout: Math.max(1, budget.remainingMs()),
    });
    return { context, page };
  };
  const request = { signal, maxOutputTokens: 384 };
  let proof: ColdRecoveryEvidence | undefined;
  let finalHistorySha256 = '';
  let failure: unknown;
  const cleanup = {
    workers: false,
    browser: false,
    proxy: false,
    observer: false,
    schemaDrops: 0,
  };
  try {
    const original = await cluster.start('original');
    proxy.registerWorker({
      id: `worker-${original.pid}`,
      origin: original.url,
      loadedIdentityEvidence: packages.anchor,
    });
    proxy.registerThread({
      ...scope,
      workerId: `worker-${original.pid}`,
      recoveryPath: `/threads/${threadId}/native-session`,
      principal: 'alice',
    });
    const initial = await open();
    await budget.dispatch('original', request, async () => {
      await initial.page.getByTestId('start').click();
      await observer.waitForRecord('hold-received', scope, signal);
    });
    const physical = (worker: LiveRecoveryWorker) =>
      json<PhysicalState>(
        worker,
        `/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
        signal,
      );
    const evidence = (worker: LiveRecoveryWorker) =>
      json<NativeEvidence>(
        worker,
        `/__test/live-recovery-evidence?threadId=${encodeURIComponent(threadId)}`,
        signal,
      );
    const effects = (worker: LiveRecoveryWorker) =>
      json<{
        readonly count: number;
        readonly rows: readonly {
          readonly id: number;
          readonly code: string;
        }[];
      }>(worker, '/__test/native-effects', signal);
    const stage = (worker: LiveRecoveryWorker) =>
      json<{ readonly counts: Readonly<Record<string, number>> }>(
        worker,
        '/__test/native-stage',
        signal,
      );
    const pendingPhysical = await until(
      signal,
      () => physical(original),
      (value) => value.session?.state === 'Ready',
    );
    const originalNative = await until(
      signal,
      () => evidence(original),
      (value) =>
        value.stages.filter((entry) => entry.stage === 'Context.Disposed')
          .length === 1,
    );
    assertNative(
      originalNative,
      1,
      original,
      record.project,
      !!options.deterministicControl,
    );
    const prefix = canonical(pendingPhysical).messages;
    const originalCalls = originalNative.calls[0].outputs.flatMap(
      (output) => output.calls,
    );
    const originalEffects = await effects(original);
    const pendingPayload = JSON.parse(pendingPhysical.session!.payload);
    assertDeferredRecoveryPending({
      emitted: originalCalls,
      publicCalls: canonicalCalls(prefix),
      publicResults: canonicalResults(prefix),
      generation: pendingPhysical.session!.generation,
      payload: pendingPayload,
      invocations: pendingPhysical.invocations,
      effects: originalEffects,
    });
    assert.equal(originalCalls.length, 2);
    assert.equal(new Set(originalCalls.map((call) => call.id)).size, 2);
    const browserCall = originalCalls.find(
      (call) => call.name === 'getWeather',
    );
    const serverCall = originalCalls.find(
      (call) => call.name === 'lookupAirport',
    );
    assert.ok(browserCall && serverCall);
    assert.deepEqual(browserCall.arguments, { city: 'Paris' });
    assert.deepEqual(serverCall.arguments, { code: 'PDX' });
    // The genuine SDK defers the invocable server sibling until browser recovery.
    // Its captured descriptor is corroborated above; no result or effect exists yet.
    await observer.bindCanonical(scope, [
      {
        correlation: 'Paris',
        canonicalCallId: browserCall.id,
        toolName: 'getWeather',
        arguments: { city: 'Paris' },
      },
    ]);
    const entry = observer.entries(scope)[0];
    assert.ok(entry);
    assert.deepEqual(entry.result, weather);
    assert.equal(computations, 1);
    const originalRequests = runRequests(proxy, threadId);
    assert.equal(originalRequests.length, 1);
    await proxy.waitFor(
      originalRequests[0].record.requestId,
      'downstream-terminal-write',
      signal,
    );
    await proxy.waitFor(
      originalRequests[0].record.requestId,
      'upstream-complete',
      signal,
    );
    await proxy.waitFor(
      originalRequests[0].record.requestId,
      'complete',
      signal,
    );
    assertSourceRun(proxy, threadId, originalRequests[0].record.requestId);
    await initial.context.close();
    await observer.waitForRecord('downstream-closed', scope, signal);
    observer.release(entry.receiptId);
    if (
      !['reused-worker', 'missing-drain'].includes(
        options.deterministicControl?.mutation ?? '',
      )
    )
      await original.stop();
    const replacement = await cluster.start('replacement');
    assert.notEqual(replacement.pid, original.pid);
    assert.equal(replacement.loaded.sha256, original.loaded.sha256);
    proxy.registerWorker({
      id: `worker-${replacement.pid}`,
      origin: replacement.url,
      loadedIdentityEvidence: packages.anchor,
    });
    await proxy.switchWorker(threadId, `worker-${replacement.pid}`);
    const controlObservation =
      options.deterministicControl?.observeReplacement?.(
        replacement,
        proxy,
        threadId,
        signal,
      );
    void controlObservation?.catch(() => undefined);
    const fresh = await open();
    const untouchedPhysical = await physical(replacement);
    try {
      assert.deepEqual(untouchedPhysical, pendingPhysical);
    } catch {
      throw new Error('RECOVERY_PHYSICAL_STATE_CHANGED');
    }
    const beforeReadNative = await evidence(replacement);
    const beforeReadEffects = await effects(replacement);
    await fresh.page.getByTestId('read').click();
    const pendingUi = await until(
      signal,
      () => status(fresh.page),
      (value) => !!value.pending && value.lastRead?.disposition === 'Pending',
    );
    const rawPending = latestRead(proxy, threadId);
    assert.equal(rawPending.schemaVersion, 2);
    assert.equal(rawPending.disposition, 'Pending');
    assert.equal(rawPending.serverRevision, pendingPhysical.session!.revision);
    assert.deepEqual(rawPending.snapshot?.messages, prefix);
    assert.deepEqual(rawPending.snapshot?.pendingBrowserRecovery, {
      protocolVersion: 1,
      serverRevision: pendingPhysical.session!.revision,
      callIds: [browserCall.id],
    });
    assert.deepEqual(
      pendingUi.pending!.toolCalls.map((call) => call.id),
      [browserCall.id],
    );
    assert.deepEqual(await evidence(replacement), beforeReadNative);
    assert.deepEqual(await physical(replacement), untouchedPhysical);
    assert.deepEqual(await effects(replacement), beforeReadEffects);
    assert.equal(observer.entries(scope).length, 1);
    if (options.deterministicControl?.mutation === 'handler-replay') {
      const response = await fetch(registration.entryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correlation: 'Paris',
          toolName: 'getWeather',
          arguments: { city: 'Paris' },
        }),
        signal,
      });
      assert.equal(response.status, 201);
      assert.equal(observer.entries(scope).length, 2);
      assert.equal(computations, 2);
    }
    await fresh.page
      .getByTestId(`outcome-status-${browserCall.id}`)
      .selectOption('result');
    await fresh.page
      .getByTestId(`outcome-value-${browserCall.id}`)
      .fill(entry.serializedResult);
    let committedPhysical: PhysicalState | undefined;
    if (record.group === 'result-reconciliation')
      proxy.armCommittedLoss(threadId, async () => {
        committedPhysical = await until(
          signal,
          () => physical(replacement),
          (value) =>
            value.session?.state === 'Ready' &&
            value.session.revision > pendingPhysical.session!.revision &&
            JSON.parse(value.session.payload).turnCompleted === true &&
            canonicalResults(canonical(value).messages).length === 2,
        );
        const native = await until(
          signal,
          () => evidence(replacement),
          (value) =>
            value.stages.filter((item) => item.stage === 'Context.Disposed')
              .length === 1,
        );
        assertNative(
          native,
          1,
          replacement,
          record.project,
          !!options.deterministicControl,
        );
        const requests = runRequests(proxy, threadId);
        assert.equal(requests.length, 2);
        assertSourceRun(proxy, threadId, requests[1].record.requestId);
        assertRecoveryProviderHistory(
          native.calls[0],
          requests[1].input.messages,
          originalCalls,
          canonicalResults(canonical(committedPhysical).messages),
        );
        assertCandidateContinuation(
          prefix,
          [
            {
              toolCallId: browserCall.id,
              status: 'result',
              content: entry.serializedResult,
            },
          ],
          pendingPhysical.session!.revision,
          requests[1].input,
          canonical(committedPhysical).messages,
        );
        const wire = readResponsesInput(native.calls[0]);
        assert.equal(
          recoveryJson(wire.calls),
          recoveryJson([browserCall, serverCall]),
        );
        assertResultMembership(
          wire.results,
          canonicalResults(canonical(committedPhysical).messages),
        );
        const before = workerEvidence(native, replacement);
        assert.deepEqual(before.begunRuns, before.disposedRuns);
        assert.equal(
          (await stage(replacement)).counts['cold-acquire-success'],
          1,
        );
      });
    await budget.dispatch('replacement', request, async () => {
      await fresh.page.getByTestId('submit').click();
      if (record.group === 'result-reconciliation') {
        await proxy.waitForThread(threadId, 'post-commit-loss', signal);
        await until(
          signal,
          () => status(fresh.page),
          (value) => value.recovery.required && !value.isResuming,
        );
      } else
        await until(
          signal,
          () => status(fresh.page),
          (value) =>
            !value.isLoading &&
            !value.isResuming &&
            value.pending === null &&
            !value.recovery.required,
        );
    });
    const continued = await until(
      signal,
      () => evidence(replacement),
      (value) =>
        value.stages.filter((item) => item.stage === 'Context.Disposed')
          .length === 1,
    );
    assertNative(
      continued,
      1,
      replacement,
      record.project,
      !!options.deterministicControl,
    );
    const saved = await until(
      signal,
      () => physical(replacement),
      (value) =>
        value.session?.state === 'Ready' &&
        value.session.revision > pendingPhysical.session!.revision,
    );
    if (committedPhysical) assert.deepEqual(saved, committedPhysical);
    const savedMessages = canonical(saved).messages;
    const serverResults = canonicalResults(savedMessages).filter(
      (result) => result.id === serverCall.id,
    );
    assert.equal(serverResults.length, 1);
    const serverResult = serverResults[0];
    assert.deepEqual(serverResult.result, {
      code: 'PDX',
      name: 'Portland International Airport',
    });
    const captured = runRequests(proxy, threadId);
    assert.equal(captured.length, 2);
    if (record.group === 'cold-restore') {
      await proxy.waitFor(
        captured[1].record.requestId,
        'downstream-terminal-write',
        signal,
      );
      await proxy.waitFor(
        captured[1].record.requestId,
        'upstream-complete',
        signal,
      );
      await proxy.waitFor(captured[1].record.requestId, 'complete', signal);
    }
    assertSourceRun(proxy, threadId, captured[1].record.requestId);
    assertRecoveryProviderHistory(
      continued.calls[0],
      captured[1].input.messages,
      originalCalls,
      canonicalResults(savedMessages),
    );
    assert.equal(JSON.parse(saved.session!.payload).turnCompleted, true);
    assertCandidateContinuation(
      prefix,
      [
        {
          toolCallId: browserCall.id,
          status: 'result',
          content: entry.serializedResult,
        },
      ],
      pendingPhysical.session!.revision,
      captured[1].input,
      savedMessages,
    );
    const continuedInput = readResponsesInput(continued.calls[0]);
    assert.equal(
      recoveryJson(continuedInput.calls),
      recoveryJson([browserCall, serverCall]),
    );
    assertResultMembership(
      continuedInput.results,
      canonicalResults(savedMessages),
    );
    assertCandidatePersistedRecoveryAbsent({
      publicRequest: {
        saved: canonical(saved),
        actualProviderRequest: { input: continued.calls[0].wire!.input },
      },
      configuration: (await status(fresh.page)).configuration,
      nativeJson: JSON.parse(saved.session!.payload).nativeJson,
    });
    const observeCompleted = async (
      canonicalHistorySha256: string,
    ): Promise<CompletedRecoveryObservation> => {
      const native = await evidence(replacement);
      const physicalState = await physical(replacement);
      const ui = await status(fresh.page);
      return {
        disposition: 'Completed',
        schemaVersion: 2,
        serverRevision: physicalState.session!.revision,
        canonicalHistorySha256,
        physicalHistorySha256: recoveryDigest(
          canonical(physicalState).messages,
        ),
        nativeHistorySha256: recoveryDigest(
          JSON.parse(JSON.parse(physicalState.session!.payload).nativeJson),
        ),
        attempts: native.calls.length,
        wireCalls: native.calls.filter((call) => call.wire).length,
        effects: (await effects(replacement)).count,
        browserEntries: observer.entries(scope).length,
        nativeRuns: native.stages
          .filter((item) => item.stage === 'Run.Forward')
          .map((item) => item.runId),
        browserEvents: ui.events.map(
          (item) => `${item.requestId}/${item.runId}/${item.type}`,
        ),
      };
    };
    const historyDigest = recoveryDigest(savedMessages);
    const beforeAdoption = await observeCompleted(historyDigest);
    if (
      options.deterministicControl?.mutation === 'malformed-completed-history'
    )
      proxy.armRead(threadId, 'corrupt-completed-history');
    if (options.deterministicControl?.mutation === 'read-induced-work')
      proxy.armReadEffect(threadId, async () => {
        const current = canonical(await physical(replacement));
        const nativeInput = {
          ...JSON.parse(
            JSON.parse((await physical(replacement)).session!.payload)
              .publicRequest,
          ),
          runId: randomUUID(),
          messages: [
            ...current.messages,
            {
              id: randomUUID(),
              role: 'user',
              content:
                'Deterministic read-induced native work. Answer without tools.',
            },
          ],
        };
        const before = await evidence(replacement);
        const response = await fetch(`${replacement.url}/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fixture-Principal': 'alice',
          },
          body: JSON.stringify(nativeInput),
          signal,
        });
        assert.equal(response.status, 200);
        await response.text();
        const after = await until(
          signal,
          () => evidence(replacement),
          (value) =>
            value.stages.filter((item) => item.stage === 'Context.Disposed')
              .length === 2,
        );
        assert.equal(after.calls.length, before.calls.length + 1);
        assert.equal(after.calls.at(-1)?.wire?.status, 200);
      });
    for (let readIndex = 0; readIndex < 2; readIndex++) {
      const responseRead = fresh.page.waitForResponse(
        (response) =>
          response.url() ===
            `${proxy.origin}/threads/${threadId}/native-session` &&
          response.request().method() === 'POST',
        { timeout: Math.max(1, budget.remainingMs()) },
      );
      await fresh.page
        .getByTestId(readIndex === 0 ? 'read' : 'fresh-read')
        .click();
      const response = await responseRead;
      assert.equal(response.status(), 200);
      const received = (await response.json()) as RecoveryRead;
      const adopted = await until(
        signal,
        () => status(fresh.page),
        (value) =>
          value.lastRead?.disposition === 'Completed' &&
          value.pending === null &&
          !value.recovery.required &&
          !value.isResuming &&
          !value.error &&
          !value.localError,
      );
      const envelope = latestRead(proxy, threadId);
      try {
        assert.deepEqual(envelope, received);
      } catch {
        throw new Error('RECOVERY_COMPLETED_HISTORY_INVALID');
      }
      assert.equal(envelope.schemaVersion, 2);
      assert.equal(envelope.disposition, 'Completed');
      try {
        assert.deepEqual(envelope.snapshot?.messages, savedMessages);
      } catch {
        throw new Error('RECOVERY_COMPLETED_HISTORY_INVALID');
      }
      assertRecoveryRuntimeAdoption(
        adopted.messages,
        savedMessages,
        originalCalls,
      );
      const after = await observeCompleted(
        recoveryDigest(envelope.snapshot!.messages),
      );
      assertCompletedRecoveryInert(beforeAdoption, after);
      assert.deepEqual(await physical(replacement), saved);
    }
    await budget.dispatch('replacement', request, async () => {
      await fresh.page.getByTestId('next').click();
      await until(
        signal,
        () => status(fresh.page),
        (value) =>
          !value.isLoading &&
          !value.isResuming &&
          value.events.filter((event) => event.type === 'RUN_FINISHED')
            .length >= (record.group === 'result-reconciliation' ? 1 : 2),
      );
    });
    const finalNative = await until(
      signal,
      () => evidence(replacement),
      (value) =>
        value.stages.filter((item) => item.stage === 'Context.Disposed')
          .length === 2,
    );
    assertNative(
      finalNative,
      2,
      replacement,
      record.project,
      !!options.deterministicControl,
    );
    const ordinaryRequest = runRequests(proxy, threadId);
    assert.equal(ordinaryRequest.length, 3);
    await proxy.waitFor(
      ordinaryRequest[2].record.requestId,
      'downstream-terminal-write',
      signal,
    );
    await proxy.waitFor(
      ordinaryRequest[2].record.requestId,
      'upstream-complete',
      signal,
    );
    await proxy.waitFor(
      ordinaryRequest[2].record.requestId,
      'complete',
      signal,
    );
    assertRecoveryProviderHistory(
      finalNative.calls[1],
      ordinaryRequest[2].input.messages,
      originalCalls,
      canonicalResults(savedMessages),
    );
    assertSourceRun(proxy, threadId, ordinaryRequest[2].record.requestId);
    const followUpInput = readResponsesInput(finalNative.calls[1]);
    assert.equal(
      recoveryJson(followUpInput.calls),
      recoveryJson([browserCall, serverCall]),
    );
    assert.equal(
      recoveryJson(followUpInput.results),
      recoveryJson(continuedInput.results),
    );
    const nativeFollowUp = finalNative.calls[1].history;
    assert.equal(
      recoveryJson(nativeFollowUp.flatMap((message) => message.calls)),
      recoveryJson([browserCall, serverCall]),
    );
    assert.equal(
      recoveryJson(recoveryNativeResults(nativeFollowUp)),
      recoveryJson(continuedInput.results),
    );
    await controlObservation;
    const finalPhysical = await physical(replacement);
    assert.equal(finalPhysical.session?.state, 'Ready');
    if (options.deterministicControl?.mutation === 'effect-replay') {
      const response = await fetch(
        `${replacement.url}/__test/live-recovery-control/replay-effect`,
        { method: 'POST', headers: { 'X-Fixture-Principal': 'alice' }, signal },
      );
      assert.equal(response.status, 200);
    }
    const finalEffects = await effects(replacement);
    assert.equal(finalPhysical.invocations.length, 1);
    const finalInvocation = finalPhysical.invocations[0];
    assert.equal(finalInvocation.call_id, serverCall.id);
    assert.equal(finalInvocation.name, serverCall.name);
    assert.equal(finalInvocation.state, 'Completed');
    assert.equal(
      finalInvocation.captured_generation,
      pendingPhysical.invocations[0].captured_generation,
    );
    assert.equal(
      finalInvocation.dispatch_generation,
      pendingPhysical.session!.generation + 1,
    );
    assert.equal(
      recoveryJson(JSON.parse(finalInvocation.descriptor)),
      recoveryJson(JSON.parse(pendingPhysical.invocations[0].descriptor)),
    );
    try {
      assert.deepEqual(originalEffects, { count: 0, rows: [] });
      assert.equal(finalEffects.count, 1);
      assert.equal(finalEffects.rows.length, 1);
      assert.equal(finalEffects.rows[0].code, 'PDX');
    } catch {
      throw new Error('RECOVERY_EFFECT_REPLAY');
    }
    if (observer.entries(scope).length !== 1 || computations !== 1)
      throw new Error('RECOVERY_BROWSER_REPLAY');
    assert.equal(computations, 1);
    assert.deepEqual(pageErrors, []);
    const finalStage = await stage(replacement);
    assert.equal(finalStage.counts['cold-acquire-attempt'], 1);
    assert.equal(finalStage.counts['cold-acquire-success'], 1);
    assert.equal(
      finalNative.stages.filter((item) => item.stage === 'Public.Admitted')
        .length,
      1,
    );
    finalHistorySha256 = recoveryDigest(canonical(finalPhysical).messages);
    if (options.deterministicControl?.mutation === 'late-dispatch') {
      const before = await evidence(replacement);
      await fresh.page.getByTestId('next').click();
      const after = await until(
        signal,
        () => evidence(replacement),
        (value) =>
          value.stages.filter((item) => item.stage === 'Context.Disposed')
            .length === 3,
      );
      assert.equal(after.refusedAcquisitions, before.refusedAcquisitions + 1);
      assert.equal(after.calls.length, before.calls.length);
      assert.equal(after.calls.filter((call) => call.wire).length, 2);
      throw new Error('RECOVERY_LATE_DISPATCH_BLOCKED');
    }
    if (options.deterministicControl?.mutation === 'cleanup-crash') {
      process.kill(replacement.pid, 'SIGKILL');
      while (true) {
        try {
          process.kill(replacement.pid, 0);
        } catch {
          break;
        }
        signal.throwIfAborted();
        await new Promise<void>((done) => setTimeout(done, 20));
      }
    }
    proof = {
      schema: cluster.schema,
      replacementSchema: replacement.schema,
      original: workerEvidence(originalNative, original),
      replacement: workerEvidence(finalNative, replacement),
      pending: {
        disposition: rawPending.disposition,
        schemaVersion: rawPending.schemaVersion,
        serverRevision: rawPending.serverRevision,
        physicalRevision: pendingPhysical.session!.revision,
        generation: pendingPhysical.session!.generation,
        calls: originalCalls,
      },
      browser: {
        entries: observer.entries(scope).length,
        computations,
        originalClosed: initial.context.pages().length === 0,
        heldReadClosed: observer
          .records()
          .some(
            (value) =>
              value.kind === 'downstream-closed' &&
              value.receiptId === entry.receiptId,
          ),
        canonicalCallId: entry.canonicalCallId!,
        result: entry.result,
      },
      server: {
        originalEffects: originalEffects.count,
        capturedGeneration: pendingPhysical.invocations[0].captured_generation,
        finalCapturedGeneration: finalInvocation.captured_generation,
        dispatchGeneration: finalInvocation.dispatch_generation!,
        finalEffects: finalEffects.count,
        originalDispatches: pendingPhysical.invocations.filter(
          (call) => call.name === 'lookupAirport' && call.state === 'Completed',
        ).length,
        finalDispatches: finalPhysical.invocations.filter(
          (call) => call.name === 'lookupAirport' && call.state === 'Completed',
        ).length,
        result: serverResult.result,
      },
      settlement: {
        count: captured.filter(
          (item) => item.input.forwardedProps?.hashbrown?.recovery,
        ).length,
        revision: pendingPhysical.session!.revision,
        callIds: [browserCall.id],
        result: entry.result,
      },
      continuation: {
        ...continuedInput,
        coldAcquisitions: finalStage.counts['cold-acquire-success'],
        admittedRecoveryRuns: finalNative.stages.filter(
          (item) => item.stage === 'Public.Admitted',
        ).length,
      },
      followUp: followUpInput,
      cleanup,
      provenanceBefore: packages.anchor,
      provenanceAfter: '',
    };
  } catch (error) {
    failure = error;
  } finally {
    signal.removeEventListener('abort', abortContexts);
    for (const context of contexts)
      try {
        await drainRecoveryCleanup(() => context.close());
      } catch {
        failure ??= new Error('RECOVERY_BROWSER_CLEANUP');
      }
    cleanup.browser = contexts.every((context) => context.pages().length === 0);
    try {
      await drainRecoveryCleanup(() => proxy.close());
      cleanup.proxy = true;
    } catch {
      failure ??= new Error('RECOVERY_PROXY_CLEANUP');
    }
    try {
      await drainRecoveryCleanup(() => observer.close());
      cleanup.observer = true;
    } catch {
      failure ??= new Error('RECOVERY_OBSERVER_CLEANUP');
    }
    try {
      await cluster.close();
      cleanup.workers = true;
      cleanup.schemaDrops = cluster.schemaDrops();
    } catch {
      failure ??= new Error('RECOVERY_WORKER_CLEANUP');
    }
  }
  if (failure) throw failure;
  assert.ok(proof);
  budget.assertActive();
  await packages.assertAnchored();
  budget.assertActive();
  const finalProof = {
    ...proof,
    cleanup: { ...cleanup },
    provenanceAfter: packages.anchor,
  };
  assertColdRecoveryEvidence(finalProof);
  return Object.freeze({
    id: record.id,
    attempts: 3,
    wireCalls: 3,
    validUsageCalls: 3,
    originalWorker: proof.original.workerId,
    replacementWorker: proof.replacement.workerId,
    loadedSha256: proof.original.loadedSha256,
    historySha256: finalHistorySha256,
    cleanup: 'passed',
  });
}
