import {
  assertCandidateAuthoritativeResponse,
  assertCandidateCorruptionEvidence,
  assertCandidateDefinitiveRejection,
  assertCandidateFacadeSchema,
  assertCandidateProviderTextHistory,
  assertCandidateProxyIntervention,
  type CandidateDefinitiveRejectionObservation,
  type CandidateFaultObservation,
  finalizeCandidateAcceptance,
  reconcileCandidateBusyReader,
} from './candidate-browser-acceptance';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';
import {
  type DurableFixtureCluster,
  withDurableCluster,
} from './durable-fixture';
import { type DotnetFixture, type ModelRequest } from './http-fixture';
import {
  resolveDotnetHost,
  selectDotnetHost,
  verifyLoadedDotnetHost,
} from './dotnet-host';
import {
  type CandidateHandlerObserver,
  type CandidateObservedJson,
  startCandidateHandlerObserver,
} from './candidate-handler-observer';
import {
  type CandidateReadIntervention,
  type CandidateRecoveryProxy,
  type CandidateRunIntervention,
  startCandidateRecoveryProxy,
} from './candidate-recovery-proxy';
import {
  assertCandidateContinuation,
  assertCandidateMixedContinuation,
  assertCandidateObserverUnchanged,
  assertCandidatePersistedRecoveryAbsent,
  bindCandidateObserverBaseline,
  type CandidateExpectedBrowserOutcome,
  type CandidateExpectedProtectedDecision,
  type CandidateObserverBaseline,
} from './candidate-browser-evidence';
import {
  expectNativeRunCapture,
  expectNativeToolPairs,
  type NativeToolPair,
} from './native-wire';
import type { CandidateBrowserRecord } from './candidate-browser-manifest';
import { runCandidateObserverPositiveControl } from './candidate-browser-observer-control';

const knownString = '  Known café 🛫\n';
const marker =
  '{"hashbrownRecovery":{"version":1,"status":"result-unavailable","effect":"unknown","message":"The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed."}}';
const auth = { 'X-Fixture-Principal': 'alice' };
const objectResult = {
  known: true,
  nested: [null, true, { label: 'café 🛫' }],
  exact: '  text\n',
};
type Decision = 'approve' | 'decline' | 'cancel';
interface BrowserCall {
  readonly id: string;
  readonly city: string;
  readonly value: CandidateObservedJson;
  readonly status: 'result' | 'unavailable';
}
interface ProtectedCall {
  readonly id: string;
  readonly code: string;
  readonly decision: Decision;
}
interface Pending {
  readonly id: string;
  readonly serverRevision: number;
  readonly toolCalls: readonly {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }[];
  readonly interrupts: readonly { id: string; toolCallId: string }[];
}
interface Status {
  readonly threadId: string;
  readonly facade: string;
  readonly pending: Pending | null;
  readonly recovery: {
    readonly revision: number;
    readonly required: boolean;
    readonly diagnostics?: readonly {
      kind: string;
      toolCallId?: string;
      content?: string;
    }[];
  };
  readonly lastRead?: {
    schemaVersion: number;
    disposition: string;
    serverRevision: number;
    reason?: string;
  };
  readonly messages?: readonly Record<string, unknown>[];
  readonly output?: unknown;
  readonly value?: unknown;
  readonly rawOutput?: unknown;
  readonly localError?: string;
  readonly error?: unknown;
  readonly state?: unknown;
  readonly lastAction?: string;
  readonly isLoading: boolean;
  readonly isResuming: boolean;
  readonly transport: readonly {
    kind: string;
    requestId: string;
    monotonicMs: number;
    abortSource?: 'caller' | 'deadline';
    abortReason?: string | Readonly<{ name: string; message: string }>;
  }[];
  readonly events: readonly {
    type: string;
    requestId: string;
    runId: string;
    monotonicMs: number;
  }[];
}
interface NativeState {
  readonly session: {
    id: string;
    state: string;
    revision: number;
    generation: number;
    payload: string;
    claim_revision?: number;
    admitted_request?: string | null;
  } | null;
  readonly batches: readonly {
    batch_id: string;
    state: string;
    published_revision: number;
    admitted_generation: number | null;
    admitted_revision: number | null;
  }[];
  readonly members: readonly {
    call_id: string;
    request_id: string;
    batch_id: string;
    admitted_generation: number | null;
    admitted_revision: number | null;
  }[];
  readonly invocations: readonly { call_id: string; state: string }[];
  readonly effects: readonly {
    session_id: string;
    call_id: string;
    request_id: string;
    batch_id: string;
    admitted_generation: number;
    admitted_revision: number;
    code: string;
  }[];
}
interface Witness {
  readonly workerId: string;
  readonly seq: number;
  readonly threadId: string;
  readonly runId: string;
  readonly callId: string;
  readonly requestId: string;
  readonly batchId: string;
  readonly admittedGeneration: number;
  readonly admittedRevision: number;
  readonly domain: string;
  readonly nativeType: string;
  readonly jsonKind?: string;
  readonly rawJson?: string;
  readonly text?: string;
}
interface Evidence {
  readonly workerId: string;
  readonly faulted: boolean;
  readonly records: readonly Witness[];
}
interface WorkerEvidence {
  readonly fixture: DotnetFixture;
  readonly id: string;
  stages: Record<string, number>;
  evidence: Evidence;
}
interface Phase {
  readonly browsers: readonly BrowserCall[];
  readonly protected: readonly ProtectedCall[];
  readonly prompt: string;
  readonly split: boolean;
}
interface Plan {
  readonly browsers: readonly BrowserCall[];
  readonly protected: readonly ProtectedCall[];
  readonly history: boolean;
  readonly split: boolean;
}
interface Snapshot {
  readonly state: NativeState;
  readonly runs: readonly CapturedRun[];
  readonly providerCount: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly observerAttempts: readonly number[];
}
interface CapturedRun {
  readonly proxyId: string;
  readonly status?: number;
  readonly input: Record<string, unknown>;
}

/** Narrows only parsed structured data; strings are never treated as metadata. */
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function content(call: BrowserCall): string {
  return call.status === 'unavailable'
    ? marker
    : typeof call.value === 'string'
      ? call.value
      : JSON.stringify(call.value);
}
function plans(record: CandidateBrowserRecord): Plan {
  const scenario = record.scenario;
  let values: readonly CandidateObservedJson[] = [knownString];
  let unavailable = scenario.includes('unavailable');
  let decisions: readonly Decision[] = [];
  if (scenario.includes('known-object')) values = [objectResult];
  if (scenario.includes('known-null')) values = [null];
  if (scenario === 'mixed.decline.known') values = [objectResult];
  if (scenario === 'mixed.cancel.known') values = [null];
  if (scenario.startsWith('mixed.'))
    decisions = [
      scenario.includes('.approve.')
        ? 'approve'
        : scenario.includes('.decline.')
          ? 'decline'
          : 'cancel',
    ];
  if (scenario === 'multiple.grouped.history') {
    values = [
      knownString,
      objectResult,
      'Observed unavailable original operation',
    ];
    decisions = ['approve', 'decline', 'cancel'];
    unavailable = false;
  }
  if (scenario === 'multiple.split.history') {
    values = [null, knownString];
    decisions = ['approve', 'approve'];
  }
  if (
    [
      'restart.before-restore',
      'race.same-revision',
      'local.stale-token',
      'local.pending-mutation-gate',
      'failure.ack-disconnect',
      'failure.malformed-ack',
      'failure.timeout',
      'failure.definitive-rejection',
      'version.v1',
      'server.busy',
      'server.expired',
      'server.corrupt',
      'thread.explicit-new',
    ].includes(scenario) ||
    scenario.startsWith('server.unknown-effect.')
  )
    decisions = ['approve'];
  if (
    [
      'replica.before-settlement',
      'failure.preack-disconnect',
      'failure.cancel-after-ack',
      'display.html',
    ].includes(scenario)
  )
    decisions = ['decline'];
  if (scenario === 'local.incomplete-outcomes') {
    values = [knownString, 'Second exact string'];
    decisions = ['approve', 'approve'];
  }
  if (scenario === 'local.incomplete-decisions') {
    values = [null];
    decisions = ['approve', 'decline'];
  }
  if (scenario === 'replica.before-settlement') values = [objectResult];
  if (scenario === 'failure.definitive-rejection')
    values = [{ padding: 'x'.repeat(32_768), exact: true }];
  if (scenario === 'display.html')
    values = [
      'Unicode café <img src=x onerror="fetch(\'/__candidate_html_probe\')">',
    ];
  if (scenario === 'display.reserved-marker') values = [marker];
  if (scenario === 'display.near-marker') values = [marker + ' '];
  if (
    [
      'restart.before-restore',
      'local.pending-mutation-gate',
      'failure.ack-disconnect',
      'failure.malformed-ack',
      'failure.timeout',
      'version.v1',
      'version.downgrade',
      'server.expired',
      'server.corrupt',
      'thread.explicit-new',
    ].includes(scenario) ||
    scenario.startsWith('server.unknown-effect.')
  )
    unavailable = true;
  if (
    scenario === 'sibling.known-object' &&
    record.facade === 'structured-chat'
  )
    decisions = ['approve'];
  if (scenario === 'sibling.known-null') decisions = ['decline'];
  if (scenario === 'sibling.with-message-unavailable-cancel')
    decisions = ['cancel'];
  if (scenario === 'sibling.unavailable') decisions = ['approve'];
  const browsers = values.map((value, index) => ({
    id: `current-browser-${index + 1}`,
    city:
      scenario === 'display.html'
        ? '<img src=x onerror="fetch(\'/__candidate_html_probe\')">'
        : `Owned current city ${index + 1}`,
    value,
    status:
      unavailable || (scenario === 'multiple.grouped.history' && index === 2)
        ? ('unavailable' as const)
        : ('result' as const),
  }));
  return {
    browsers,
    protected: decisions.map((decision, index) => ({
      id: `current-protected-${index + 1}`,
      code: ['PDX', 'SEA', 'SFO'][index],
      decision,
    })),
    history: scenario.startsWith('multiple.'),
    split: scenario === 'multiple.split.history',
  };
}
function terminal(facade: string, text: string): string {
  return facade.startsWith('ui-')
    ? JSON.stringify({ ui: [{ CandidateCard: { props: { text } } }] })
    : facade.startsWith('structured-')
      ? JSON.stringify({ answer: text })
      : text;
}
function publicRequest(
  state: NativeState,
): Record<string, unknown> & { messages: Record<string, unknown>[] } {
  assert.ok(state.session?.payload, 'Actual persisted native payload required');
  const payload = JSON.parse(state.session.payload);
  assert.equal(typeof payload.publicRequest, 'string');
  return JSON.parse(payload.publicRequest);
}

/** Owns one actual legal journey's pages, observer, stable route and independently qualified native workers. */
class Journey {
  readonly threadId = `candidate-${crypto.randomUUID()}`;
  readonly scope: { scenarioId: string; threadId: string };
  readonly contexts: BrowserContext[] = [];
  readonly finalFaultObservations: Omit<
    CandidateFaultObservation,
    'records'
  >[] = [];
  readonly finalDefinitiveObservations: Omit<
    CandidateDefinitiveRejectionObservation,
    'records'
  >[] = [];
  readonly workers: WorkerEvidence[] = [];
  readonly pageErrors: { url: string; error: string }[] = [];
  readonly unexpectedRequests: string[] = [];
  readonly records: Record<string, unknown> = {};
  readonly bindings = new Map<
    string,
    {
      correlation: string;
      canonicalCallId: string;
      toolName: string;
      arguments: { city: string };
    }
  >();
  private activeWorker: DotnetFixture | undefined;
  private handler: CandidateHandlerObserver | undefined;
  private route: CandidateRecoveryProxy | undefined;
  private configuration:
    | {
        facade: string;
        scenarioId: string;
        threadId: string;
        principal: string;
        endpoint: string;
        observer: { entryUrl: string; holdBaseUrl: string };
        prompt: string;
        nextPrompt: string;
        deadlineMs: number;
      }
    | undefined;
  private observerBaseline: CandidateObserverBaseline | undefined;
  get active(): DotnetFixture {
    assert.ok(this.activeWorker);
    return this.activeWorker;
  }
  set active(value: DotnetFixture) {
    this.activeWorker = value;
  }
  get observer(): CandidateHandlerObserver {
    assert.ok(this.handler);
    return this.handler;
  }
  set observer(value: CandidateHandlerObserver) {
    this.handler = value;
  }
  get proxy(): CandidateRecoveryProxy {
    assert.ok(this.route);
    return this.route;
  }
  set proxy(value: CandidateRecoveryProxy) {
    this.route = value;
  }
  get config(): NonNullable<Journey['configuration']> {
    assert.ok(this.configuration);
    return this.configuration;
  }
  set config(value: NonNullable<Journey['configuration']>) {
    this.configuration = value;
  }
  get baseline(): CandidateObserverBaseline {
    assert.ok(this.observerBaseline);
    return this.observerBaseline;
  }
  set baseline(value: CandidateObserverBaseline) {
    this.observerBaseline = value;
  }
  observedRecords(): unknown {
    return this.handler?.records();
  }
  routedRecords(): unknown {
    return this.route?.records();
  }
  computations = 0;
  constructor(
    readonly browser: Browser,
    readonly cluster: DurableFixtureCluster,
    readonly record: CandidateBrowserRecord,
    readonly root: string,
    readonly origins: readonly [string, string],
    readonly api: 'chat-completions' | 'responses',
  ) {
    this.scope = { scenarioId: record.id, threadId: this.threadId };
  }
  async start(
    environment: Readonly<Record<string, string>> = {},
  ): Promise<DotnetFixture> {
    const fixture = await this.cluster.start(environment);
    const host = resolveDotnetHost(selectDotnetHost());
    assert.ok(
      host.loaded,
      'Qualified native package required for every worker',
    );
    verifyLoadedDotnetHost(host, fixture.diagnostics());
    const id = `worker-${fixture.process.pid}-${crypto.randomUUID()}`;
    const proof = join(this.root, id + '.json');
    await writeFile(
      proof,
      JSON.stringify(
        {
          process: fixture.process,
          loaded: host.loaded,
          diagnostics: fixture.diagnostics(),
          schema: this.cluster.schema,
        },
        null,
        2,
      ),
    );
    this.workers.push({
      fixture,
      id,
      stages: {},
      evidence: { workerId: '', faulted: false, records: [] },
    });
    if (this.route)
      this.route.registerWorker({
        id,
        origin: fixture.url,
        loadedIdentityEvidence: proof,
      });
    return fixture;
  }
  async initialize(
    plan: Plan,
    environment: Readonly<Record<string, string>>,
  ): Promise<void> {
    this.active = await this.start(environment);
    this.observer = await startCandidateHandlerObserver({
      ownedOrigins: this.origins,
      evidencePath: join(this.root, 'observer.jsonl'),
      limits: {
        requestBytes: 65_536,
        resultBytes: 1024 * 1024,
        records: 16_384,
        holdTimeoutMs: 150_000,
      },
    });
    this.proxy = await startCandidateRecoveryProxy({
      ownedOrigins: this.origins,
      evidencePath: join(this.root, 'proxy.jsonl'),
      limits: {
        requestBytes: 2 * 1024 * 1024,
        responseBytes: 8 * 1024 * 1024,
        frameBytes: 1024 * 1024,
        records: 32_768,
        holdTimeoutMs: 150_000,
      },
    });
    const worker = this.workers[0];
    this.proxy.registerWorker({
      id: worker.id,
      origin: this.active.url,
      loadedIdentityEvidence: join(this.root, worker.id + '.json'),
    });
    this.proxy.registerThread({
      ...this.scope,
      workerId: worker.id,
      recoveryPath: `/threads/${encodeURIComponent(this.threadId)}/native-session`,
      principal: 'alice',
    });
    const previous: readonly BrowserCall[] = plan.history
      ? [
          {
            id: 'prior-browser',
            city: 'Owned prior city',
            value: 'Earlier exact browser result',
            status: 'result',
          },
        ]
      : [];
    const observer = this.observer.register({
      scope: this.scope,
      operations: [...previous, ...plan.browsers].map((call) => ({
        correlation: call.city,
        toolName: 'getWeather',
        arguments: { city: call.city },
        compute: () => {
          this.computations++;
          return call.value;
        },
      })),
    });
    this.config = {
      facade: this.record.facade,
      scenarioId: this.record.id,
      threadId: this.threadId,
      principal: 'alice',
      endpoint: this.proxy.origin,
      observer,
      prompt: plan.history
        ? `Prior ${this.threadId}`
        : `Current ${this.threadId}`,
      nextPrompt: plan.history
        ? `Current ${this.threadId}`
        : `Ordinary ${this.threadId}`,
      deadlineMs: this.record.scenario === 'failure.timeout' ? 5000 : 60_000,
    };
  }
  get origin(): string {
    return this.record.composition.startsWith('react.')
      ? this.origins[0]
      : this.origins[1];
  }
  get url(): string {
    return `${this.origin}/?config=${encodeURIComponent(JSON.stringify(this.config))}`;
  }
  async open(): Promise<{ page: Page; context: BrowserContext }> {
    const context = await this.browser.newContext();
    this.contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', (error) =>
      this.pageErrors.push({ url: page.url(), error: String(error) }),
    );
    page.on('request', (request) => {
      if (request.url().includes('/__candidate_html_probe'))
        this.unexpectedRequests.push(request.url());
    });
    const response = await page.goto(this.url);
    assert.ok(response?.ok(), 'Qualified actual packed facade must load');
    assert.equal(new URL(page.url()).origin, this.origin);
    await expect(page.getByTestId('start')).toBeVisible();
    const current = await this.status(page);
    expect(current.facade).toBe(this.record.facade);
    expect(current.threadId).toBe(this.threadId);
    expect(await page.getByTestId('config-error').count()).toBe(0);
    expect(await page.getByTestId('runtime-error').count()).toBe(0);
    return { page, context };
  }
  async status(page: Page): Promise<Status> {
    return JSON.parse(await page.getByTestId('status').innerText());
  }
  async state(): Promise<NativeState> {
    const response = await fetch(
      `${this.active.url}/__test/native-recovery-state?threadId=${encodeURIComponent(this.threadId)}`,
      { headers: auth, signal: AbortSignal.timeout(5000) },
    );
    assert.equal(response.status, 200);
    return response.json();
  }
  async collect(): Promise<void> {
    for (const worker of this.workers) {
      if (worker.fixture.process.exited()) continue;
      const stage = await fetch(`${worker.fixture.url}/__test/native-stage`, {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(stage.status, 200);
      worker.stages = (
        (await stage.json()) as { counts: Record<string, number> }
      ).counts;
      const evidence = await fetch(
        `${worker.fixture.url}/__test/candidate-native-evidence?threadId=${encodeURIComponent(this.threadId)}`,
        { headers: auth, signal: AbortSignal.timeout(5000) },
      );
      assert.equal(evidence.status, 200);
      worker.evidence = await evidence.json();
      expect(worker.evidence.faulted).toBe(false);
      assert.ok(worker.evidence.workerId);
      for (const record of worker.evidence.records)
        expect(record).toMatchObject({
          workerId: worker.evidence.workerId,
          threadId: this.threadId,
        });
      const seq = worker.evidence.records.map((record) => record.seq);
      expect(seq).toEqual([...seq].sort((a, b) => a - b));
      expect(new Set(seq).size).toBe(seq.length);
    }
  }
  get requests(): readonly ModelRequest[] {
    return this.workers.flatMap((worker) => [...worker.fixture.requests]);
  }
  get witnesses(): readonly Witness[] {
    return this.workers.flatMap((worker) => [...worker.evidence.records]);
  }
  runs(thread = this.threadId): readonly CapturedRun[] {
    const records = this.proxy.records(thread);
    return records
      .filter(
        (record) => record.kind === 'request' && record.incomingBody.length > 0,
      )
      .flatMap((record) => {
        const input = JSON.parse(record.incomingBody.toString('utf8'));
        return input.threadId === thread && Array.isArray(input.messages)
          ? [
              {
                proxyId: record.requestId,
                input,
                status: records.find(
                  (later) =>
                    later.requestId === record.requestId &&
                    later.kind === 'upstream-headers',
                )?.status,
              },
            ]
          : [];
      });
  }
  configurations(): readonly Record<string, unknown>[] {
    return this.proxy
      .records(this.threadId)
      .filter(
        (record) => record.kind === 'request' && record.incomingBody.length > 0,
      )
      .map(
        (record) =>
          JSON.parse(record.incomingBody.toString('utf8')) as Record<
            string,
            unknown
          >,
      )
      .filter(
        (input) => Array.isArray(input.tools) && !Array.isArray(input.messages),
      );
  }
  async snapshot(): Promise<Snapshot> {
    await this.collect();
    const counts: Record<string, number> = {};
    for (const worker of this.workers)
      for (const [name, value] of Object.entries(worker.stages))
        counts[name] = (counts[name] ?? 0) + value;
    return {
      state: await this.state(),
      runs: this.runs(),
      providerCount: this.requests.length,
      counts,
      observerAttempts: this.observer
        .records()
        .filter((record) => record.kind === 'request-received')
        .map((record) => record.seq),
    };
  }
  async unchanged(before: Snapshot): Promise<void> {
    const after = await this.snapshot();
    expect(after.runs).toEqual(before.runs);
    expect(after.providerCount).toBe(before.providerCount);
    expect(after.counts).toEqual(before.counts);
    expect(after.state).toEqual(before.state);
    expect(after.observerAttempts).toEqual(before.observerAttempts);
  }
  async control(name: string, fixture = this.active): Promise<unknown> {
    const response = await fetch(`${fixture.url}/__test/${name}`, {
      method: 'POST',
      headers: auth,
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    const previous = Array.isArray(this.records.controls)
      ? this.records.controls
      : [];
    this.records.controls = [
      ...previous,
      {
        name,
        method: 'POST',
        worker: fixture.process.pid,
        status: response.status,
        headers: Object.fromEntries(response.headers),
        bodyText: body,
        bodyBase64: Buffer.from(body).toString('base64'),
      },
    ];
    assert.ok(response.ok, `Actual fixture control failed: ${name}`);
    return body ? JSON.parse(body) : undefined;
  }
  script(
    fixture: DotnetFixture,
    phase: Phase,
    text = 'Candidate complete',
  ): void {
    // Match only the current real user turn; historical tool results must not shadow a later original run.
    fixture.mock.on(
      { userMessage: phase.prompt, hasToolResult: true },
      { content: terminal(this.record.facade, text) },
    );
    const calls: {
      id: string;
      name: string;
      arguments: Record<string, string>;
    }[] = [
      ...phase.browsers.map((call) => ({
        id: call.id,
        name: 'getWeather',
        arguments: { city: call.city },
      })),
      ...phase.protected.map((call) => ({
        id: call.id,
        name: 'lookupAirport',
        arguments: { code: call.code },
      })),
    ];
    const interleaved = phase.browsers.flatMap((call, index) => [
      calls[index],
      ...(phase.protected[index] ? [calls[phase.browsers.length + index]] : []),
    ]);
    for (const call of phase.protected.slice(phase.browsers.length))
      interleaved.push({
        id: call.id,
        name: 'lookupAirport',
        arguments: { code: call.code },
      });
    if (phase.split)
      fixture.mock.on(
        { userMessage: phase.prompt, hasToolResult: false },
        {
          blocks: [
            { type: 'text', text: 'First actual current announcement café ' },
            ...interleaved
              .slice(0, 2)
              .map((call) => ({ type: 'toolCall' as const, ...call })),
            { type: 'text', text: 'Second actual current announcement 🛫 ' },
            ...interleaved
              .slice(2)
              .map((call) => ({ type: 'toolCall' as const, ...call })),
          ],
        },
      );
    else if (
      this.record.scenario === 'multiple.grouped.history' &&
      phase.browsers[0]?.id.startsWith('current-')
    )
      fixture.mock.on(
        { userMessage: phase.prompt, hasToolResult: false },
        {
          blocks: [
            {
              type: 'text',
              text: 'Grouped actual current announcement café 🛫 ',
            },
            ...interleaved.map((call) => ({
              type: 'toolCall' as const,
              ...call,
            })),
          ],
        },
      );
    else
      fixture.mock.on(
        { userMessage: phase.prompt, hasToolResult: false },
        { toolCalls: interleaved },
      );
  }
  async published(phase: Phase): Promise<NativeState> {
    await expect
      .poll(
        () =>
          this.observer
            .entries(this.scope)
            .filter((entry) =>
              phase.browsers.some((call) => call.city === entry.correlation),
            ).length,
        { timeout: 30_000 },
      )
      .toBe(phase.browsers.length);
    await expect
      .poll(async () => (await this.state()).session?.state, {
        timeout: 30_000,
      })
      .toBe('Ready');
    const state = await this.state();
    const request = publicRequest(state);
    const locations = request.messages
      .flatMap((message, messageIndex) =>
        Array.isArray(message.toolCalls)
          ? (message.toolCalls as Record<string, unknown>[]).map(
              (call, callIndex) => ({
                messageId: message.id,
                messageIndex,
                callIndex,
                call,
              }),
            )
          : [],
      )
      .filter((item) =>
        [...phase.browsers, ...phase.protected].some(
          (call) => call.id === item.call.id,
        ),
      );
    expect(locations.map((item) => item.call.id).sort()).toEqual(
      [...phase.browsers, ...phase.protected].map((call) => call.id).sort(),
    );
    const initialRun = this.runs().at(-1);
    assert.ok(initialRun);
    await this.proxy.waitFor(
      initialRun.proxyId,
      'complete',
      AbortSignal.timeout(30_000),
    );
    const wireRecords = this.proxy
      .records(this.threadId)
      .filter((record) => record.requestId === initialRun.proxyId);
    const body = Buffer.concat(
      wireRecords
        .filter((record) => record.kind === 'upstream-body')
        .map((record) => record.bytes),
    ).toString('utf8');
    const events = expectNativeRunCapture({
      body,
      truncated: wireRecords.some((record) => record.kind === 'fault'),
    });
    if (phase.split) {
      expect(new Set(locations.map((item) => item.messageId)).size).toBe(2);
      const first = locations.find(
        (item) => item.call.id === phase.browsers[0].id,
      );
      const second = locations.find(
        (item) => item.call.id === phase.browsers[1].id,
      );
      assert.ok(first && second);
      expect(first.messageId).not.toBe(second.messageId);
      expect(
        locations.find((item) => item.call.id === phase.protected[0].id)
          ?.messageId,
      ).toBe(first.messageId);
      expect(
        locations.find((item) => item.call.id === phase.protected[1].id)
          ?.messageId,
      ).toBe(second.messageId);
      expect(
        request.messages.find((message) => message.id === first.messageId)
          ?.content,
      ).toBe('First actual current announcement café ');
      expect(
        request.messages.find((message) => message.id === second.messageId)
          ?.content,
      ).toBe('Second actual current announcement 🛫 ');
      for (const location of locations)
        expect(
          events.find(
            (event) =>
              event.type === 'TOOL_CALL_START' &&
              event.toolCallId === location.call.id,
          )?.parentMessageId,
        ).toBe(location.messageId);
    }
    if (
      this.record.scenario === 'multiple.grouped.history' &&
      phase.browsers[0]?.id.startsWith('current-')
    ) {
      expect(new Set(locations.map((item) => item.messageId)).size).toBe(1);
      const parent = locations[0].messageId;
      expect(
        request.messages.find((message) => message.id === parent)?.content,
      ).toBe('Grouped actual current announcement café 🛫 ');
      for (const location of locations)
        expect(
          events.find(
            (event) =>
              event.type === 'TOOL_CALL_START' &&
              event.toolCallId === location.call.id,
          )?.parentMessageId,
        ).toBe(parent);
    }
    for (const call of phase.browsers) {
      const location = locations.find((item) => item.call.id === call.id);
      assert.ok(location);
      const fn = location.call.function as { name: string; arguments: string };
      expect(fn.name).toBe('getWeather');
      expect(JSON.parse(fn.arguments)).toEqual({ city: call.city });
      const entry = this.observer
        .entries(this.scope)
        .find((entry) => entry.correlation === call.city);
      assert.ok(entry);
      expect(entry.result).toEqual(call.value);
      await expect
        .poll(() =>
          this.observer
            .records()
            .some(
              (record) =>
                record.kind === 'hold-received' &&
                record.receiptId === entry.receiptId,
            ),
        )
        .toBe(true);
      this.bindings.set(call.city, {
        correlation: call.city,
        canonicalCallId: call.id,
        toolName: 'getWeather',
        arguments: { city: call.city },
      });
    }
    this.baseline = await bindCandidateObserverBaseline(
      this.observer,
      this.scope,
      [...this.bindings.values()],
    );
    this.records[`publication-${phase.prompt}`] = {
      state,
      locations,
      entries: this.baseline,
      sourceEvents: events,
      sourceBody: body,
    };
    return state;
  }
  async abandon(context: BrowserContext, phase: Phase): Promise<void> {
    const entries = this.observer
      .entries(this.scope)
      .filter((entry) =>
        phase.browsers.some((call) => call.city === entry.correlation),
      );
    await context.close();
    for (const entry of entries) {
      await expect
        .poll(() =>
          this.observer
            .records()
            .some(
              (record) =>
                record.kind === 'downstream-closed' &&
                record.receiptId === entry.receiptId,
            ),
        )
        .toBe(true);
      this.observer.release(entry.receiptId);
    }
  }
  stable(): void {
    expect(this.computations).toBe(this.baseline.boundEntries.length);
    assertCandidateObserverUnchanged(this.observer, this.scope, this.baseline);
    expect(
      this.observer
        .records()
        .filter(
          (record) => record.kind === 'fault' || record.kind === 'rejected',
        ),
    ).toEqual([]);
  }
  async read(
    page: Page,
    expected: 'Pending' | 'Completed' | 'blocked' = 'Pending',
    fresh = false,
  ): Promise<Status> {
    const before = this.runs().length;
    const providers = this.requests.length;
    const previousToken = (await this.status(page)).pending?.id;
    const raw = await rawRead(this, fresh, page);
    if (expected === 'blocked')
      await expect
        .poll(async () => {
          const status = await this.status(page);
          return (
            status.pending === null &&
            (!!status.localError ||
              !!status.error ||
              (!!status.lastRead && status.lastRead.disposition !== 'Pending'))
          );
        })
        .toBe(true);
    else {
      expect(raw.status).toBe(200);
      assert.ok(object(raw.body));
      expect(raw.body.schemaVersion).toBe(2);
      expect(raw.body.disposition).toBe(expected);
      await expect
        .poll(async () => (await this.status(page)).lastRead?.disposition)
        .toBe(expected);
      if (expected === 'Pending') {
        const state = await this.state();
        assert.ok(state.session);
        assert.ok(object(raw.body.snapshot));
        expect(raw.body.serverRevision).toBe(state.session.revision);
        expect(state.session.state).toBe('Ready');
        expect(state.session.revision).toBeGreaterThan(0);
        const capability = raw.body.snapshot.pendingBrowserRecovery;
        assert.ok(object(capability));
        const currentCalls = publicRequest(state)
          .messages.flatMap((message) =>
            Array.isArray(message.toolCalls)
              ? (message.toolCalls as Record<string, unknown>[])
              : [],
          )
          .filter(
            (call) =>
              String(call.id).startsWith('current-browser') ||
              (call.id === 'prior-browser' && this.runs().length === 1),
          );
        expect(capability).toEqual({
          protocolVersion: 1,
          serverRevision: state.session.revision,
          callIds: currentCalls.map((call) => call.id),
        });
        await expect
          .poll(async () => (await this.status(page)).pending?.serverRevision)
          .toBe(state.session.revision);
        if (fresh && previousToken)
          await expect
            .poll(async () => (await this.status(page)).pending?.id)
            .not.toBe(previousToken);
        const pending = (await this.status(page)).pending;
        assert.ok(pending);
        expect(pending.toolCalls.map((call) => call.id)).toEqual(
          capability.callIds,
        );
        for (const interrupt of pending.interrupts) {
          const member = state.members.find(
            (member) => member.call_id === interrupt.toolCallId,
          );
          assert.ok(member);
          expect(member.request_id).toBe(interrupt.id);
        }
        const batches = state.batches.filter(
          (batch) => batch.state === 'Pending',
        );
        if (pending.interrupts.length) {
          expect(batches).toHaveLength(1);
          expect(batches[0].published_revision).toBeGreaterThan(0);
          expect(batches[0].published_revision).toBeLessThanOrEqual(
            state.session.revision,
          );
          const members = state.members.filter(
            (member) => member.batch_id === batches[0].batch_id,
          );
          expect(members.map((member) => member.call_id).sort()).toEqual(
            [
              ...pending.toolCalls.map((call) => call.id),
              ...pending.interrupts.map((interrupt) => interrupt.toolCallId),
            ].sort(),
          );
        }
      }
    }
    const status = await this.status(page);
    expect(this.runs()).toHaveLength(before);
    expect(this.requests).toHaveLength(providers);
    this.stable();
    this.records[`read-${this.configurations().length}`] = { raw, status };
    return status;
  }
  async fill(page: Page, phase: Phase): Promise<Pending> {
    const status = await this.status(page);
    assert.ok(status.pending, 'Actual pending browser recovery required');
    expect(status.pending.toolCalls.map((call) => call.id).sort()).toEqual(
      phase.browsers.map((call) => call.id).sort(),
    );
    expect(
      status.pending.interrupts.map((interrupt) => interrupt.toolCallId).sort(),
    ).toEqual(phase.protected.map((call) => call.id).sort());
    for (const call of phase.browsers) {
      await page
        .getByTestId(`outcome-status-${call.id}`)
        .selectOption(call.status);
      if (call.status === 'result')
        await page
          .getByTestId(`outcome-value-${call.id}`)
          .fill(JSON.stringify(call.value));
    }
    for (const call of phase.protected) {
      const interrupt = status.pending.interrupts.find(
        (entry) => entry.toolCallId === call.id,
      );
      assert.ok(interrupt);
      await page
        .getByTestId(`decision-${interrupt.id}`)
        .selectOption(call.decision);
    }
    return status.pending;
  }
  decisions(
    pending: Pending,
    phase: Phase,
  ): readonly CandidateExpectedProtectedDecision[] {
    return pending.interrupts.map((interrupt) => {
      const call = phase.protected.find(
        (entry) => entry.id === interrupt.toolCallId,
      );
      assert.ok(call);
      return call.decision === 'cancel'
        ? { interruptId: interrupt.id, status: 'cancelled' as const }
        : {
            interruptId: interrupt.id,
            status: 'resolved' as const,
            payload: { approved: call.decision === 'approve' },
          };
    });
  }
  async terminal(
    page: Page,
    text = 'Candidate complete',
    runId?: unknown,
  ): Promise<Status> {
    assert.ok(
      typeof runId === 'string' && runId.length > 0,
      'Actual current run identity required for terminal observation',
    );
    await expect
      .poll(
        async () => {
          const status = await this.status(page);
          if (this.record.facade.startsWith('ui-'))
            return (
              await page.getByTestId('candidate-card').allTextContents()
            ).some((value) => value.includes(text));
          if (this.record.facade === 'completion')
            return status.output === text;
          if (this.record.facade === 'structured-completion')
            return object(status.output) && status.output.answer === text;
          return (
            status.messages?.some(
              (message) =>
                message.role === 'assistant' &&
                (message.content === text ||
                  (object(message.content) && message.content.answer === text)),
            ) ?? false
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect
      .poll(async () =>
        (await this.status(page)).events.some(
          (event) => event.type === 'RUN_FINISHED' && event.runId === runId,
        ),
      )
      .toBe(true);
    await expect
      .poll(async () => (await this.state()).session?.state)
      .toBe('Ready');
    const status = await this.status(page);
    if (this.record.facade.startsWith('ui-')) {
      const expected = { ui: [{ CandidateCard: { props: { text } } }] };
      if (this.record.facade === 'ui-chat')
        expect(
          status.messages?.some(
            (message) =>
              message.role === 'assistant' &&
              object(message.content) &&
              JSON.stringify(message.content) === JSON.stringify(expected),
          ),
        ).toBe(true);
      else {
        assert.ok(object(status.output));
        expect(status.output.role).toBe('assistant');
        expect(status.output.content).toEqual(expected);
        assert.ok(
          typeof status.output.id === 'string' && status.output.id.length > 0,
        );
        if (this.record.composition.startsWith('react.'))
          expect(status.rawOutput).toEqual(expected);
        else {
          assert.ok(object(status.value));
          expect(status.value.content).toEqual(expected);
        }
      }
      await expect(
        page.getByTestId('candidate-card').filter({ hasText: text }).last(),
      ).toBeVisible();
    }
    this.stable();
    return status;
  }
  async switch(fixture: DotnetFixture): Promise<void> {
    const worker = this.workers.find((worker) => worker.fixture === fixture);
    assert.ok(worker);
    await this.proxy.switchWorker(this.threadId, worker.id);
    this.active = fixture;
  }
  async stop(fixture: DotnetFixture): Promise<void> {
    await this.collect();
    await fixture.stop();
    expect(fixture.process.exited()?.signal).toBe('SIGKILL');
  }
  async barrier(stage: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const response = await fetch(
            `${this.active.url}/__test/native-stage`,
            { signal: AbortSignal.timeout(5000) },
          );
          return ((await response.json()) as { stage: string }).stage;
        },
        { timeout: 30_000 },
      )
      .toBe(stage);
  }
  validateFinalFaults(): void {
    for (const observation of this.finalDefinitiveObservations)
      assertCandidateDefinitiveRejection({
        ...observation,
        records: this.proxy.records(this.threadId),
      });
    for (const observation of this.finalFaultObservations)
      assertCandidateProxyIntervention({
        ...observation,
        records: this.proxy.records(this.threadId),
      });
  }
  async close(): Promise<void> {
    const errors: unknown[] = [];
    for (const context of [...this.contexts].reverse())
      try {
        await context.close();
      } catch (error) {
        errors.push(error);
      }
    try {
      await this.route?.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.handler?.close();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        'Candidate journey resource cleanup failed',
      );
  }
}

function expectedOutcomes(
  phase: Phase,
): readonly CandidateExpectedBrowserOutcome[] {
  return phase.browsers.map((call) => ({
    toolCallId: call.id,
    status: call.status,
    content: content(call),
  }));
}
function readCallPairs(
  request: Record<string, unknown>,
  outputs: ReadonlyMap<string, string>,
): readonly NativeToolPair[] {
  assert.ok(Array.isArray(request.messages));
  return (request.messages as Record<string, unknown>[])
    .flatMap((message) =>
      Array.isArray(message.toolCalls)
        ? (message.toolCalls as {
            id: string;
            function: { name: string; arguments: string };
          }[])
        : [],
    )
    .map((call) => {
      const output = outputs.get(call.id);
      assert.notEqual(
        output,
        undefined,
        `Independent original result missing for ${call.id}`,
      );
      assert.ok(typeof output === 'string');
      return {
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        output,
      };
    });
}
async function checkNativeResults(
  journey: Journey,
  phase: Phase,
  submitted: CapturedRun,
  state: NativeState,
): Promise<ReadonlyMap<string, string>> {
  await journey.collect();
  const outputs = new Map<string, string>();
  const records = journey.witnesses.filter(
    (record) => record.runId === submitted.input.runId,
  );
  for (const call of phase.protected) {
    const selected = records.filter((record) => record.callId === call.id);
    const handler = selected.filter(
      (record) => record.domain === 'handler-return',
    );
    const invocation = selected.filter(
      (record) => record.domain === 'native-invocation-return',
    );
    const outward = selected.filter(
      (record) => record.domain === 'native-outward-before-public-projection',
    );
    expect(handler).toHaveLength(call.decision === 'approve' ? 1 : 0);
    expect(invocation).toHaveLength(call.decision === 'approve' ? 1 : 0);
    expect(outward).toHaveLength(1);
    const current = outward[0];
    const member = state.members.find((member) => member.call_id === call.id);
    assert.ok(member);
    for (const record of selected)
      expect(record).toMatchObject({
        threadId: journey.threadId,
        runId: submitted.input.runId,
        requestId: member.request_id,
        batchId: member.batch_id,
        admittedGeneration: member.admitted_generation,
        admittedRevision: member.admitted_revision,
      });
    if (call.decision === 'approve') {
      expect(handler[0].nativeType).not.toBe('System.Text.Json.JsonElement');
      expect(JSON.parse(handler[0].rawJson ?? 'null')).toEqual({
        code: call.code,
        name: 'Portland International Airport',
      });
      expect(JSON.parse(invocation[0].rawJson ?? 'null')).toEqual(
        JSON.parse(handler[0].rawJson ?? 'null'),
      );
      expect(handler[0].seq).toBeLessThan(invocation[0].seq);
      expect(invocation[0].seq).toBeLessThan(current.seq);
      expect(current).toMatchObject({
        nativeType: invocation[0].nativeType,
        jsonKind: invocation[0].jsonKind,
        rawJson: invocation[0].rawJson,
      });
      assert.equal(current.nativeType, 'System.Text.Json.JsonElement');
      assert.ok(current.rawJson);
      outputs.set(call.id, current.rawJson);
      expect(
        state.effects.filter((effect) => effect.call_id === call.id),
      ).toEqual([
        expect.objectContaining({
          session_id: state.session?.id,
          call_id: call.id,
          request_id: member.request_id,
          batch_id: member.batch_id,
          admitted_generation: member.admitted_generation,
          admitted_revision: member.admitted_revision,
          code: call.code,
        }),
      ]);
    } else {
      expect(current).toMatchObject({
        nativeType: 'System.String',
        text:
          call.decision === 'decline'
            ? 'Tool call invocation rejected.'
            : 'Tool call invocation rejected. Cancelled by caller.',
      });
      assert.ok(current.text);
      outputs.set(call.id, current.text);
      expect(
        state.effects.filter((effect) => effect.call_id === call.id),
      ).toEqual([]);
    }
  }
  expect(
    records
      .filter(
        (record) => record.domain === 'native-outward-before-public-projection',
      )
      .map((record) => record.callId)
      .sort(),
  ).toEqual(phase.protected.map((call) => call.id).sort());
  return outputs;
}
async function complete(
  journey: Journey,
  page: Page,
  phase: Phase,
  published: NativeState,
  pending: Pending,
  before: Snapshot,
  historical: ReadonlyMap<string, string> = new Map(),
  attempts = 1,
  text = 'Candidate complete',
): Promise<ReadonlyMap<string, string>> {
  await expect
    .poll(() => journey.runs().length)
    .toBe(before.runs.length + attempts);
  const newRuns = journey.runs().slice(before.runs.length);
  await expect
    .poll(() =>
      newRuns.some((run) =>
        journey.proxy
          .records(journey.threadId)
          .some(
            (record) =>
              record.requestId === run.proxyId &&
              record.kind === 'upstream-headers' &&
              record.status === 200,
          ),
      ),
    )
    .toBe(true);
  const submitted = journey
    .runs()
    .slice(before.runs.length)
    .find((run) => run.status === 200);
  assert.ok(submitted, 'Actual successful recovery request required');
  await journey.terminal(page, text, submitted.input.runId);
  await expect
    .poll(async () =>
      (await journey.status(page)).events.some(
        (event) =>
          event.type === 'RUN_FINISHED' &&
          event.runId === submitted.input.runId,
      ),
    )
    .toBe(true);
  const after = await journey.snapshot();
  const original = publicRequest(published);
  const saved = publicRequest(after.state);
  assert.ok(published.session);
  expect(pending.serverRevision).toBe(published.session.revision);
  const originalForwarded: Record<string, unknown> = object(
    original.forwardedProps,
  )
    ? original.forwardedProps
    : {};
  const originalHashbrown: Record<string, unknown> = object(
    originalForwarded.hashbrown,
  )
    ? originalForwarded.hashbrown
    : {};
  expect(submitted.input.forwardedProps).toEqual({
    ...originalForwarded,
    hashbrown: {
      ...originalHashbrown,
      recovery: {
        version: 1,
        serverRevision: pending.serverRevision,
        outcomes: expectedOutcomes(phase).map((outcome) => ({
          toolCallId: outcome.toolCallId,
          status: outcome.status,
        })),
      },
    },
  });
  expect(saved.forwardedProps).toEqual(original.forwardedProps);
  const decisions = journey.decisions(pending, phase);
  if (decisions.length)
    assertCandidateMixedContinuation(
      original.messages,
      expectedOutcomes(phase),
      pending.serverRevision,
      decisions,
      submitted.input,
      saved.messages,
    );
  else
    assertCandidateContinuation(
      original.messages,
      expectedOutcomes(phase),
      pending.serverRevision,
      submitted.input,
      saved.messages,
    );
  const nativeOutputs = await checkNativeResults(
    journey,
    phase,
    submitted,
    after.state,
  );
  const outputs = new Map(historical);
  for (const call of phase.browsers) outputs.set(call.id, content(call));
  for (const [id, output] of nativeOutputs) outputs.set(id, output);
  for (const [id, output] of outputs)
    expect(
      saved.messages.filter(
        (message) => message.role === 'tool' && message.toolCallId === id,
      ),
    ).toEqual([expect.objectContaining({ content: output })]);
  expect(after.state.effects.length - before.state.effects.length).toBe(
    phase.protected.filter((call) => call.decision === 'approve').length,
  );
  expect(after.providerCount - before.providerCount).toBe(1);
  expect(
    (after.counts['cold-acquire-success'] ?? 0) -
      (before.counts['cold-acquire-success'] ?? 0),
  ).toBe(1);
  expect(
    (after.counts['Run.Forward'] ?? 0) - (before.counts['Run.Forward'] ?? 0),
  ).toBe(1);
  if (phase.protected.length)
    expect(
      (after.counts['reservation-success'] ?? 0) -
        (before.counts['reservation-success'] ?? 0),
    ).toBe(1);
  const provider = journey.requests.at(-1);
  assert.ok(provider);
  expect(provider.authentication).not.toBe('missing');
  expect(provider.path).toContain(
    journey.api === 'responses' ? '/responses' : '/chat/completions',
  );
  expectNativeToolPairs(
    provider,
    journey.api,
    readCallPairs(original, outputs),
  );
  assertCandidateProviderTextHistory(
    provider.body,
    journey.api,
    original.messages,
  );
  const configBefore = journey.configurations()[0];
  assert.ok(configBefore);
  const initialProvider = journey.requests[before.providerCount - 1];
  assert.ok(initialProvider);
  assertCandidateFacadeSchema(
    journey.record.facade,
    journey.api,
    configBefore,
    [initialProvider.body, provider.body],
  );
  await journey.read(page, 'Completed', true);
  const currentConfiguration = journey.configurations().at(-1);
  expect(currentConfiguration).toEqual(configBefore);
  assert.ok(after.state.session);
  assertCandidatePersistedRecoveryAbsent({
    publicRequest: { saved, actualProviderRequest: provider.body },
    configuration: currentConfiguration,
    nativeJson: JSON.parse(after.state.session.payload).nativeJson,
  });
  journey.records[`completed-${phase.prompt}`] = {
    before,
    after,
    submitted,
    pending,
    nativeOutputs: [...nativeOutputs],
    outputs: [...outputs],
    historicalProjection: [...historical].map(
      ([callId, canonicalPublicContent]) => ({
        callId,
        canonicalPublicContent,
        expectedNativeProjectionValue: {
          nativeType: 'System.String',
          text: canonicalPublicContent,
        },
        expectedProviderWireOutput: canonicalPublicContent,
      }),
    ),
    currentConfiguration,
  };
  journey.stable();
  return outputs;
}
async function uncertainty(
  journey: Journey,
  page: Page,
  phase: Phase,
): Promise<void> {
  const diagnostics = (await journey.status(page)).recovery.diagnostics ?? [];
  const expected = phase.browsers
    .filter((call) => call.status === 'unavailable' || content(call) === marker)
    .map((call) => call.id)
    .sort();
  const actual = diagnostics
    .filter(
      (item) =>
        item.kind === 'browser-result-unavailable' &&
        phase.browsers.some((call) => call.id === item.toolCallId),
    )
    .map((item) => item.toolCallId)
    .sort();
  expect(actual).toEqual(expected);
  for (const diagnostic of diagnostics.filter((item) =>
    expected.includes(item.toolCallId ?? ''),
  ))
    expect(diagnostic.content).toBe(marker);
}
async function reloadAndOrdinary(
  journey: Journey,
  context: BrowserContext,
  phase: Phase,
  history: boolean,
): Promise<void> {
  const before = await journey.snapshot();
  await context.close();
  const next = await journey.open();
  await journey.read(next.page, 'Completed');
  await uncertainty(journey, next.page, phase);
  await next.page.getByTestId('rerender').click();
  journey.stable();
  expect(journey.runs()).toHaveLength(before.runs.length);
  const prompt = `Ordinary ${journey.threadId}`;
  journey.active.mock.onMessage(prompt, {
    content: terminal(journey.record.facade, 'Ordinary complete'),
  });
  if (history) {
    await next.page.getByTestId('prompt').fill(prompt);
    await next.page.getByTestId('start').click();
  } else await next.page.getByTestId('next').click();
  await expect.poll(() => journey.runs().length).toBe(before.runs.length + 1);
  const ordinarySubmitted = journey.runs().at(-1);
  assert.ok(ordinarySubmitted);
  await journey.terminal(
    next.page,
    'Ordinary complete',
    ordinarySubmitted.input.runId,
  );
  const after = await journey.snapshot();
  expect(after.runs).toHaveLength(before.runs.length + 1);
  expect(after.providerCount - before.providerCount).toBe(1);
  expect(after.state.effects).toEqual(before.state.effects);
  const configuration = journey.configurations().at(-1);
  const originalConfiguration = journey.configurations()[0];
  assert.ok(originalConfiguration);
  expect(configuration).toEqual(originalConfiguration);
  const ordinaryProvider = journey.requests.at(-1);
  assert.ok(ordinaryProvider);
  assertCandidateFacadeSchema(
    journey.record.facade,
    journey.api,
    originalConfiguration,
    [ordinaryProvider.body],
  );
  assert.ok(Array.isArray(ordinarySubmitted.input.messages));
  assertCandidateProviderTextHistory(
    ordinaryProvider.body,
    journey.api,
    ordinarySubmitted.input.messages as Record<string, unknown>[],
  );
  const ordinaryOutputs = new Map(
    (ordinarySubmitted.input.messages as Record<string, unknown>[])
      .filter((message) => message.role === 'tool')
      .map((message) => {
        assert.ok(
          typeof message.toolCallId === 'string' &&
            typeof message.content === 'string',
        );
        return [message.toolCallId, message.content] as const;
      }),
  );
  expectNativeToolPairs(
    ordinaryProvider,
    journey.api,
    readCallPairs(ordinarySubmitted.input, ordinaryOutputs),
  );
  assert.ok(after.state.session);
  const ordinary = after.runs.at(-1);
  assert.ok(ordinary);
  assertCandidatePersistedRecoveryAbsent({
    publicRequest: ordinary.input,
    configuration,
    nativeJson: JSON.parse(after.state.session.payload).nativeJson,
  });
  assertCandidatePersistedRecoveryAbsent({
    publicRequest: publicRequest(after.state),
    configuration,
    nativeJson: JSON.parse(after.state.session.payload).nativeJson,
  });
  journey.stable();
  expect(journey.unexpectedRequests).toEqual([]);
}
async function localNegative(
  journey: Journey,
  page: Page,
  id: string,
): Promise<void> {
  const before = await journey.snapshot();
  const pending = (await journey.status(page)).pending;
  await page.getByTestId(id).click();
  await expect
    .poll(async () => {
      const status = await journey.status(page);
      return Boolean(status.localError || status.error);
    })
    .toBe(true);
  const after = await journey.status(page);
  expect(after.pending).toEqual(pending);
  await journey.unchanged(before);
}
async function rawRead(
  journey: Journey,
  fresh: boolean,
  page: Page,
): Promise<Record<string, unknown>> {
  const before = journey.proxy
    .records(journey.threadId)
    .filter((record) => record.kind === 'request')
    .map((record) => record.requestId);
  await page.getByTestId(fresh ? 'fresh-read' : 'read').click();
  await expect
    .poll(() =>
      journey.proxy
        .records(journey.threadId)
        .some(
          (record) =>
            record.kind === 'complete' && !before.includes(record.requestId),
        ),
    )
    .toBe(true);
  const records = journey.proxy.records(journey.threadId);
  const request = records.find(
    (record) => record.kind === 'request' && !before.includes(record.requestId),
  );
  assert.ok(request);
  const configuration = JSON.parse(request.incomingBody.toString('utf8'));
  const originalConfiguration = journey.configurations()[0];
  assert.ok(originalConfiguration);
  expect(configuration).toEqual(originalConfiguration);
  const sentHeaders = request.rawHeaders ?? [];
  const versionHeaders: string[] = [];
  for (let index = 0; index < sentHeaders.length; index += 2)
    if (sentHeaders[index].toLowerCase() === 'hashbrown-recovery-version')
      versionHeaders.push(sentHeaders[index + 1]);
  expect(versionHeaders).toEqual(['2']);
  expect(
    records.filter(
      (record) =>
        record.requestId === request.requestId && record.kind === 'request',
    ),
  ).toHaveLength(1);
  const bytes = Buffer.concat(
    records
      .filter(
        (record) =>
          record.requestId === request.requestId &&
          record.kind === 'delivered-body',
      )
      .map((record) => record.bytes),
  );
  const headers = records.find(
    (record) =>
      record.requestId === request.requestId &&
      record.kind === 'delivered-headers',
  );
  assert.ok(headers?.status, 'Actual delivered recovery status required');
  let body: unknown = null;
  if (bytes.length) {
    try {
      body = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      if (headers.status < 400) throw error;
    }
  }
  return {
    requestId: request.requestId,
    deliveredHeaders: headers,
    status: headers.status,
    body,
    bodyText: bytes.toString('utf8'),
    bodyBase64: bytes.toString('base64'),
  };
}
async function blocked(
  journey: Journey,
  page: Page,
  scenario: string,
): Promise<void> {
  const before = await journey.snapshot();
  const beforeUi = await journey.status(page);
  const response = await rawRead(journey, false, page);
  await expect
    .poll(async () => (await journey.status(page)).pending)
    .toBeNull();
  if (scenario.startsWith('version.'))
    await expect
      .poll(async () =>
        Boolean(
          (await journey.status(page)).localError ||
          (await journey.status(page)).error,
        ),
      )
      .toBe(true);
  expect(journey.runs()).toEqual(before.runs);
  expect(journey.requests).toHaveLength(before.providerCount);
  expect((await journey.state()).effects).toEqual(before.state.effects);
  journey.stable();
  const after = await journey.snapshot();
  const afterUi = await journey.status(page);
  expect(afterUi.messages).toEqual(beforeUi.messages);
  expect(afterUi.state).toEqual(beforeUi.state);
  expect(afterUi.recovery.revision).toBe(beforeUi.recovery.revision);
  for (const name of [
    'cold-acquire-success',
    'reservation-success',
    'Run.Forward',
    'Deserialize.Forward',
  ])
    expect(after.counts[name] ?? 0).toBe(before.counts[name] ?? 0);
  journey.records.blockedRead = { response, before, after, status: afterUi };
}

async function authoritative(
  journey: Journey,
  page: Page,
  fresh = true,
): Promise<Record<string, unknown>> {
  const beforeUi = await journey.status(page);
  const previousPendingId = beforeUi.pending?.id;
  const response = await rawRead(journey, fresh, page);
  const session = (await journey.state()).session;
  assertCandidateAuthoritativeResponse(
    { status: response.status, body: response.body },
    session,
  );
  assert.ok(object(response.body));
  const { snapshot, ...metadata } = response.body;
  await expect
    .poll(async () => (await journey.status(page)).lastAction)
    .toBe('read');
  await expect
    .poll(async () => (await journey.status(page)).lastRead)
    .toEqual(metadata);
  await expect
    .poll(async () => (await journey.status(page)).localError)
    .toBeNull();
  if (metadata.disposition === 'Pending') {
    await expect
      .poll(async () => (await journey.status(page)).pending?.serverRevision)
      .toBe(metadata.serverRevision);
    if (previousPendingId)
      await expect
        .poll(async () => (await journey.status(page)).pending?.id)
        .not.toBe(previousPendingId);
  } else expect((await journey.status(page)).pending).toBeNull();
  journey.records[`authoritative-${String(response.requestId)}`] = {
    response,
    session,
    beforeUi,
    adopted: await journey.status(page),
    hasSnapshot: snapshot !== null && snapshot !== undefined,
  };
  journey.stable();
  return response;
}
async function failedAttempt(
  journey: Journey,
  page: Page,
  phase: Phase,
  pending: Pending,
  before: Snapshot,
): Promise<void> {
  await expect.poll(() => journey.runs().length).toBe(before.runs.length + 1);
  const run = journey.runs().at(-1);
  assert.ok(run);
  await expect
    .poll(async () => (await journey.status(page)).recovery.required, {
      timeout: 30_000,
    })
    .toBe(true);
  await journey.proxy.waitFor(
    run.proxyId,
    'downstream-closed',
    AbortSignal.timeout(30_000),
  );
  const failed = await journey.snapshot();
  expect(failed.runs).toHaveLength(before.runs.length + 1);
  expect(failed.providerCount - before.providerCount).toBeLessThanOrEqual(1);
  expect(
    failed.state.effects.length - before.state.effects.length,
  ).toBeLessThanOrEqual(
    phase.protected.filter((call) => call.decision === 'approve').length,
  );
  expect(
    (failed.counts['cold-acquire-success'] ?? 0) -
      (before.counts['cold-acquire-success'] ?? 0),
  ).toBeLessThanOrEqual(1);
  const current = await journey.status(page);
  const began = current.events.filter(
    (event) => event.type === 'RUN_STARTED' && event.runId === run.input.runId,
  );
  assertCandidateProxyIntervention({
    scenario: journey.record.scenario,
    requestId: run.proxyId,
    runId: run.input.runId,
    records: journey.proxy.records(journey.threadId),
    events: current.events,
    transport: current.transport,
  });
  journey.records.ambiguity = {
    before,
    failed,
    rawRun: run,
    pending,
    consumedAcknowledgements: began,
    lifecycle: current.transport,
    proxy: journey.proxy.records(journey.threadId),
  };
  const beforeRepeat = await journey.snapshot();
  await page.getByTestId('negative-repeat-submit').click();
  expect((await journey.status(page)).lastAction).toBe(
    'negative-repeat-submit:resumeConversationRecovery',
  );
  await expect
    .poll(async () => Boolean((await journey.status(page)).localError))
    .toBe(true);
  await journey.unchanged(beforeRepeat);
  await page.getByTestId('negative-send').click();
  await expect
    .poll(async () => Boolean((await journey.status(page)).localError))
    .toBe(true);
  await journey.unchanged(beforeRepeat);
  const read = await authoritative(journey, page);
  journey.records.reconciliation = read;
  const reconciledUi = await journey.status(page);
  assertCandidateProxyIntervention({
    scenario: journey.record.scenario,
    requestId: run.proxyId,
    runId: run.input.runId,
    records: journey.proxy.records(journey.threadId),
    events: reconciledUi.events,
    transport: reconciledUi.transport,
  });
  journey.finalFaultObservations.push({
    scenario: journey.record.scenario,
    requestId: run.proxyId,
    runId: run.input.runId,
    events: reconciledUi.events,
    transport: reconciledUi.transport,
  });
  const reread = await journey.snapshot();
  expect(reread.runs).toHaveLength(before.runs.length + 1);
  expect(
    (reread.counts['cold-acquire-success'] ?? 0) -
      (before.counts['cold-acquire-success'] ?? 0),
  ).toBeLessThanOrEqual(1);
  expect(
    reread.state.effects.length - before.state.effects.length,
  ).toBeLessThanOrEqual(
    phase.protected.filter((call) => call.decision === 'approve').length,
  );
  journey.stable();
}
async function scenario(journey: Journey, plan: Plan): Promise<void> {
  const id = journey.record.scenario;
  const current: Phase = {
    browsers: plan.browsers,
    protected: plan.protected,
    prompt: `Current ${journey.threadId}`,
    split: plan.split,
  };
  journey.script(journey.active, current);
  let historical: ReadonlyMap<string, string> = new Map();
  let original = await journey.open();
  expect(journey.requests).toHaveLength(0);
  expect(journey.runs()).toHaveLength(0);
  if (plan.history) {
    const prior: Phase = {
      browsers: [
        {
          id: 'prior-browser',
          city: 'Owned prior city',
          value: 'Earlier exact browser result',
          status: 'result',
        },
      ],
      protected: [{ id: 'prior-protected', code: 'ATL', decision: 'approve' }],
      prompt: journey.config.prompt,
      split: false,
    };
    journey.script(journey.active, prior, 'Prior complete');
    await original.page.getByTestId('start').click();
    const previous = await journey.published(prior);
    await journey.abandon(original.context, prior);
    original = await journey.open();
    await journey.read(original.page);
    const pending = await journey.fill(original.page, prior);
    const before = await journey.snapshot();
    await original.page.getByTestId('submit').click();
    historical = await complete(
      journey,
      original.page,
      prior,
      previous,
      pending,
      before,
      new Map(),
      1,
      'Prior complete',
    );
    await original.page.getByTestId('next').click();
  } else await original.page.getByTestId('start').click();
  const published = await journey.published(current);
  const publication = await journey.snapshot();
  const currentEffects = published.effects.filter((effect) =>
    current.protected.some((call) => call.id === effect.call_id),
  );
  expect(currentEffects).toEqual([]);
  await journey.abandon(original.context, current);
  if (id === 'restart.before-restore') {
    await journey.stop(journey.active);
    const peer = await journey.start();
    journey.script(peer, current);
    await journey.switch(peer);
  }
  if (id === 'server.expired') {
    await journey.control('expire-native-payload');
    await journey.control('maintain-native');
  }
  if (id === 'server.corrupt') {
    const before = await journey.state();
    const receipt = await journey.control(
      `native-recovery-corruption/missing-browser-binding?threadId=${encodeURIComponent(journey.threadId)}`,
    );
    journey.records.corruption = {
      before,
      after: await journey.state(),
      receipt,
      actualControlReceipt: Array.isArray(journey.records.controls)
        ? journey.records.controls.at(-1)
        : undefined,
    };
  }
  let restored = await journey.open();
  if (
    id === 'version.v1' ||
    id === 'version.downgrade' ||
    id.startsWith('version.malformed.')
  ) {
    const mode: CandidateReadIntervention =
      id === 'version.v1'
        ? 'real-v1'
        : id === 'version.downgrade'
          ? 'downgrade-real-v2'
          : (id.slice(
              'version.malformed.'.length,
            ) as CandidateReadIntervention);
    journey.proxy.armRead(journey.threadId, mode);
    await blocked(journey, restored.page, id);
    const observed = journey.records.blockedRead as {
      response: { body: unknown };
    };
    if (id === 'version.v1' || id === 'version.downgrade') {
      assert.ok(object(observed.response.body));
      expect(observed.response.body.schemaVersion).toBe(1);
    }
    if (id === 'version.v1') {
      await journey.read(restored.page, 'Pending', true);
      const pending = await journey.fill(restored.page, current);
      const before = await journey.snapshot();
      await restored.page.getByTestId('submit').click();
      await complete(
        journey,
        restored.page,
        current,
        published,
        pending,
        before,
      );
    }
    return;
  }
  if (id === 'server.expired' || id === 'server.corrupt') {
    await blocked(journey, restored.page, id);
    const observed = journey.records.blockedRead as {
      response: { status: number; body: unknown };
    };
    if (id === 'server.corrupt') {
      const mutation = journey.records.corruption as {
        before: NativeState;
        after: NativeState;
      };
      assert.ok(mutation.before.session && mutation.after.session);
      assertCandidateCorruptionEvidence(
        mutation.before.session.payload,
        mutation.after.session.payload,
        observed.response,
      );
      expect({
        ...mutation.after,
        session: {
          ...mutation.after.session,
          payload: mutation.before.session.payload,
        },
      }).toEqual(mutation.before);
    }
    if (id === 'server.expired') {
      expect(observed.response.status).toBe(200);
      assert.ok(object(observed.response.body));
      expect(observed.response.body.disposition).toBe('Expired');
    }
    if (
      object(observed.response.body) &&
      object(observed.response.body.snapshot)
    )
      expect(observed.response.body.snapshot.pendingBrowserRecovery).toBeNull();
    return;
  }
  const actualRead = await journey.read(restored.page);
  expect(actualRead.lastRead).toMatchObject({
    schemaVersion: 2,
    disposition: 'Pending',
    serverRevision: published.session?.revision,
  });
  expect(actualRead.pending?.serverRevision).toBe(published.session?.revision);
  if (id === 'replica.before-settlement') {
    const peer = await journey.start();
    journey.script(peer, current);
    await journey.switch(peer);
    expect((await journey.status(restored.page)).pending?.id).toBe(
      actualRead.pending?.id,
    );
  }
  if (id === 'thread.explicit-new') {
    const before = await journey.snapshot();
    await restored.page.getByTestId('new-thread').click();
    await expect
      .poll(async () => (await journey.status(restored.page)).threadId)
      .not.toBe(journey.threadId);
    const newThread = (await journey.status(restored.page)).threadId;
    expect((await journey.status(restored.page)).pending).toBeNull();
    const activeWorker = journey.workers.find(
      (worker) => worker.fixture === journey.active,
    );
    assert.ok(activeWorker);
    journey.proxy.registerThread({
      scenarioId: journey.record.id,
      threadId: newThread,
      workerId: activeWorker.id,
      recoveryPath: `/threads/${encodeURIComponent(newThread)}/native-session`,
      principal: 'alice',
    });
    journey.active.mock.onMessage(journey.config.nextPrompt, {
      content: terminal(journey.record.facade, 'New thread complete'),
    });
    await restored.page.getByTestId('next').click();
    await expect.poll(() => journey.runs(newThread).length).toBe(1);
    await expect
      .poll(async () =>
        (await journey.status(restored.page)).messages?.some(
          (message) =>
            message.role === 'assistant' &&
            message.content === 'New thread complete',
        ),
      )
      .toBe(true);
    expect(journey.runs()).toEqual(before.runs);
    expect((await journey.state()).effects).toEqual(before.state.effects);
    journey.stable();
    const next = journey.runs(newThread)[0];
    expect(next.input.threadId).toBe(newThread);
    assert.ok(
      !object(next.input.forwardedProps) ||
        !object(next.input.forwardedProps.hashbrown) ||
        !Object.hasOwn(next.input.forwardedProps.hashbrown, 'recovery'),
    );
    await expect
      .poll(async () =>
        (await journey.status(restored.page)).events.some(
          (event) =>
            event.type === 'RUN_FINISHED' && event.runId === next.input.runId,
        ),
      )
      .toBe(true);
    expect(journey.requests.length - before.providerCount).toBe(1);
    const newStateResponse = await fetch(
      `${journey.active.url}/__test/native-recovery-state?threadId=${encodeURIComponent(newThread)}`,
      { headers: auth, signal: AbortSignal.timeout(5000) },
    );
    assert.equal(newStateResponse.status, 200);
    const newState: NativeState = await newStateResponse.json();
    expect(newState.session?.state).toBe('Ready');
    expect(newState.effects).toEqual([]);
    const oldIds = new Set(current.browsers.map((call) => call.id));
    assert.ok(Array.isArray(next.input.messages));
    expect(
      (next.input.messages as Record<string, unknown>[]).filter(
        (message) =>
          (message.role === 'tool' && oldIds.has(String(message.toolCallId))) ||
          (Array.isArray(message.toolCalls) &&
            (message.toolCalls as Record<string, unknown>[]).some((call) =>
              oldIds.has(String(call.id)),
            )),
      ),
    ).toEqual([]);
    journey.records.newThread = {
      oldThread: journey.threadId,
      newThread,
      next,
      newState,
    };
    return;
  }
  if (id === 'local.stale-token') {
    const priorToken = actualRead.pending?.id;
    await journey.read(restored.page, 'Pending', true);
    expect((await journey.status(restored.page)).pending?.id).not.toBe(
      priorToken,
    );
    await localNegative(journey, restored.page, 'negative-stale-token');
  }
  if (id === 'local.incomplete-outcomes')
    await localNegative(journey, restored.page, 'negative-incomplete-outcomes');
  if (id === 'local.incomplete-decisions')
    await localNegative(
      journey,
      restored.page,
      'negative-incomplete-decisions',
    );
  if (id === 'local.pending-mutation-gate') {
    for (const action of [
      'negative-send',
      'negative-resume',
      'negative-generate',
      'negative-set-messages',
      'negative-set-state',
    ])
      await localNegative(journey, restored.page, action);
    const before = await journey.snapshot();
    await restored.page.getByTestId('negative-config').click();
    await expect(restored.page.getByTestId('config-error')).toBeVisible();
    const failure = JSON.parse(
      await restored.page.getByTestId('config-error').innerText(),
    ) as {
      classification: string;
      epoch: number;
      error: string;
      stack: string;
    };
    expect(failure.classification).toBe('config-error');
    expect(failure.epoch).toBeGreaterThan(0);
    expect(failure.error).toMatch(/browser recovery is pending/i);
    expect(failure.stack).toBeTruthy();
    await journey.unchanged(before);
    await restored.context.close();
    restored = await journey.open();
    await journey.read(restored.page);
  }
  if (id === 'display.html') {
    await expect(restored.page.getByTestId('pending')).toContainText('<img');
    expect(await restored.page.locator('img[src="x"]').count()).toBe(0);
    expect(journey.unexpectedRequests).toEqual([]);
  }
  const pending = await journey.fill(restored.page, current);
  const before = await journey.snapshot();
  if (id === 'race.same-revision') {
    const second = await journey.open();
    await journey.read(second.page);
    const secondPending = await journey.fill(second.page, current);
    expect(secondPending.id).not.toBe(pending.id);
    expect(secondPending.serverRevision).toBe(pending.serverRevision);
    const firstView = await journey.status(restored.page);
    const secondView = await journey.status(second.page);
    await Promise.all([
      restored.page.getByTestId('submit').click(),
      second.page.getByTestId('submit').click(),
    ]);
    await expect
      .poll(() =>
        journey
          .runs()
          .slice(before.runs.length)
          .map((run) => run.status)
          .sort(),
      )
      .toEqual([200, 409]);
    const winner = journey
      .runs()
      .slice(before.runs.length)
      .find((run) => run.status === 200);
    assert.ok(winner);
    await expect
      .poll(async () =>
        (
          await Promise.all([
            journey.status(restored.page),
            journey.status(second.page),
          ])
        ).some((status) =>
          status.events.some(
            (event) =>
              event.type === 'RUN_FINISHED' &&
              event.runId === winner.input.runId,
          ),
        ),
      )
      .toBe(true);
    const firstWins = (await journey.status(restored.page)).events.some(
      (event) =>
        event.type === 'RUN_FINISHED' && event.runId === winner.input.runId,
    );
    const winning = firstWins ? restored : second;
    const losing = firstWins ? second : restored;
    await complete(
      journey,
      winning.page,
      current,
      published,
      firstWins ? pending : secondPending,
      before,
      historical,
      2,
    );
    const losingView = await journey.status(losing.page);
    expect(losingView.recovery.required).toBe(true);
    // Public ErrorMessage has no canonical ID and is explicitly a synthetic failed-run display item. Keep it in evidence, compare committed message views separately.
    expect(
      losingView.messages?.filter((message) => message.role !== 'error'),
    ).toEqual(
      (firstWins ? secondView : firstView).messages?.filter(
        (message) => message.role !== 'error',
      ),
    );
    journey.records.race = { firstView, secondView, losingView, winner };
    await journey.read(losing.page, 'Completed', true);
    journey.stable();
    return;
  }
  if (id === 'server.busy') {
    await restored.page.getByTestId('submit').click();
    await journey.barrier('cold-acquired');
    const held = await journey.snapshot();
    expect(held.state.effects).toEqual(before.state.effects);
    const blockedPage = await journey.open();
    await blocked(journey, blockedPage.page, id);
    expect((await journey.status(blockedPage.page)).lastRead?.disposition).toBe(
      'Busy',
    );
    await journey.control('release-native');
    await reconcileCandidateBusyReader(
      () =>
        complete(
          journey,
          restored.page,
          current,
          published,
          pending,
          before,
          historical,
        ),
      async () => {
        const beforeRead = await journey.snapshot();
        const response = await authoritative(journey, blockedPage.page);
        assert.ok(object(response.body));
        expect(response.body.disposition).toBe('Completed');
        expect(
          (await journey.status(blockedPage.page)).messages?.some(
            (message) =>
              message.role === 'assistant' &&
              message.content === 'Candidate complete',
          ),
        ).toBe(true);
        await journey.unchanged(beforeRead);
        journey.records.busyReconciled = {
          response,
          before: beforeRead,
          after: await journey.snapshot(),
        };
      },
    );
    return;
  }
  if (id.startsWith('server.unknown-effect.')) {
    const stage = id.slice('server.unknown-effect.'.length);
    await restored.page.getByTestId('submit').click();
    await journey.barrier(stage);
    const held = await journey.snapshot();
    expect(
      held.state.invocations.find(
        (call) => call.call_id === current.protected[0].id,
      )?.state,
    ).toBe('Started');
    expect(held.state.effects.length - before.state.effects.length).toBe(
      stage === 'effect-persisted' ? 1 : 0,
    );
    await journey.stop(journey.active);
    const peer = await journey.start();
    journey.script(peer, current);
    await journey.switch(peer);
    await journey.control('expire-native-lease');
    await journey.control('maintain-native');
    const response = await authoritative(journey, restored.page);
    assert.ok(object(response.body));
    expect(response.body.disposition).toBe('UnknownEffect');
    expect((await journey.status(restored.page)).pending).toBeNull();
    const blockedState = await journey.snapshot();
    await restored.page.getByTestId('negative-repeat-submit').click();
    await journey.unchanged(blockedState);
    const fresh = await journey.open();
    const newRead = await authoritative(journey, fresh.page, false);
    assert.ok(object(newRead.body));
    expect(newRead.body.disposition).toBe('UnknownEffect');
    expect((await journey.status(fresh.page)).pending).toBeNull();
    const final = await journey.snapshot();
    expect(final.state.effects).toEqual(held.state.effects);
    expect(
      (final.counts['cold-acquire-success'] ?? 0) -
        (before.counts['cold-acquire-success'] ?? 0),
    ).toBe(1);
    expect(final.providerCount - before.providerCount).toBe(0);
    journey.records.unknownEffect = { held, final, stage };
    return;
  }
  if (id.startsWith('failure.')) {
    const modes: Readonly<Record<string, CandidateRunIntervention>> = {
      'failure.ack-disconnect': 'disconnect-after-delivered-ack',
      'failure.preack-disconnect': 'disconnect-before-delivered-ack',
      'failure.malformed-ack': 'malform-after-upstream-ack',
      'failure.timeout': 'hold-before-delivery',
      'failure.cancel-after-ack': 'hold-after-delivered-ack',
      'failure.definitive-rejection': 'pass',
    };
    journey.proxy.armRun(journey.threadId, modes[id]);
    await restored.page.getByTestId('submit').click();
    await expect.poll(() => journey.runs().length).toBe(before.runs.length + 1);
    const run = journey.runs().at(-1);
    assert.ok(run);
    if (id === 'failure.definitive-rejection') {
      expect(
        Buffer.byteLength(JSON.stringify(run.input), 'utf8'),
      ).toBeGreaterThan(16_384);
      await expect.poll(() => journey.runs().at(-1)?.status).toBe(413);
      const after = await journey.snapshot();
      expect(after.providerCount).toBe(before.providerCount);
      expect(after.counts).toEqual(before.counts);
      expect(after.state).toEqual(before.state);
      journey.stable();
      await expect
        .poll(async () =>
          Boolean(
            (await journey.status(restored.page)).localError ||
            (await journey.status(restored.page)).error,
          ),
        )
        .toBe(true);
      const reconciliation = await authoritative(journey, restored.page);
      await journey.unchanged(after);
      journey.finalDefinitiveObservations.push({
        requestId: run.proxyId,
        runId: run.input.runId,
      });
      journey.records.definitiveRejection = {
        before,
        after,
        rawRun: run,
        status: await journey.status(restored.page),
        reconciliation,
        bytes: journey.proxy
          .records(journey.threadId)
          .filter((record) => record.requestId === run.proxyId),
      };
      return;
    }
    if (id === 'failure.cancel-after-ack') {
      await journey.proxy.waitFor(
        run.proxyId,
        'downstream-ack-write',
        AbortSignal.timeout(30_000),
      );
      await expect
        .poll(async () =>
          (await journey.status(restored.page)).events.some(
            (event) =>
              event.type === 'RUN_STARTED' && event.runId === run.input.runId,
          ),
        )
        .toBe(true);
      await restored.page.getByTestId('stop').click();
      await expect
        .poll(async () =>
          (await journey.status(restored.page)).transport.some(
            (record) =>
              record.kind === 'aborted' && record.abortSource === 'caller',
          ),
        )
        .toBe(true);
    }
    if (id === 'failure.timeout') {
      await expect
        .poll(
          async () =>
            (await journey.status(restored.page)).transport.some(
              (record) => record.kind === 'deadline',
            ),
          { timeout: 15_000 },
        )
        .toBe(true);
      const lifecycle = (await journey.status(restored.page)).transport;
      const deadline = lifecycle.find((record) => record.kind === 'deadline');
      const started = lifecycle.find(
        (record) =>
          record.kind === 'started' && record.requestId === deadline?.requestId,
      );
      assert.ok(started && deadline);
      expect(deadline.monotonicMs - started.monotonicMs).toBeGreaterThanOrEqual(
        journey.config.deadlineMs,
      );
      expect(deadline).toMatchObject({
        abortSource: 'deadline',
        abortReason: {
          name: 'TimeoutError',
          message: 'Candidate transport deadline exceeded',
        },
      });
      expect(
        lifecycle.find(
          (record) =>
            record.kind === 'deadline' &&
            record.requestId === deadline.requestId,
        ),
      ).toMatchObject({
        abortSource: 'deadline',
        abortReason: deadline.abortReason,
      });
    }
    if (id !== 'failure.preack-disconnect' && id !== 'failure.timeout') {
      await journey.proxy.waitFor(
        run.proxyId,
        'upstream-ack',
        AbortSignal.timeout(30_000),
      );
      await expect
        .poll(async () =>
          (await journey.status(restored.page)).events.some(
            (event) =>
              event.type === 'RUN_STARTED' && event.runId === run.input.runId,
          ),
        )
        .toBe(true);
    }
    await failedAttempt(journey, restored.page, current, pending, before);
    return;
  }
  await restored.page.getByTestId('submit').click();
  await complete(
    journey,
    restored.page,
    current,
    published,
    pending,
    before,
    historical,
  );
  await uncertainty(journey, restored.page, current);
  if (id === 'display.html') {
    expect(await restored.page.locator('img[src="x"]').count()).toBe(0);
    expect(journey.unexpectedRequests).toEqual([]);
  }
  await restored.page.getByTestId('rerender').click();
  journey.stable();
  await reloadAndOrdinary(journey, restored.context, current, plan.history);
  journey.records.publication = publication;
}

/** Executes one exact approved full-matrix row with actual isolated packed facades and native authority. */
export async function runCandidateBrowserJourney(
  browser: Browser,
  record: CandidateBrowserRecord,
): Promise<void> {
  if (record.id === 'react.openai.chat.chat.browser.known-string')
    await runCandidateObserverPositiveControl(browser);
  const base = process.env['HASHBROWN_CANDIDATE_EVIDENCE'];
  const react = process.env['HASHBROWN_PACKAGE_REACT_URL'];
  const angular = process.env['HASHBROWN_PACKAGE_ANGULAR_URL'];
  assert.ok(base && react && angular);
  const [framework, provider, selected] = record.composition.split('.');
  assert.ok(framework === 'react' || framework === 'angular');
  assert.ok(provider === 'openai' || provider === 'azure');
  assert.ok(selected === 'chat' || selected === 'responses');
  const api = selected === 'chat' ? 'chat-completions' : 'responses';
  const plan = plans(record);
  const root = join(base, record.id);
  await mkdir(root);
  const gate =
    record.scenario === 'server.busy'
      ? 'cold-acquired'
      : record.scenario.startsWith('server.unknown-effect.')
        ? record.scenario.slice('server.unknown-effect.'.length)
        : undefined;
  const environment = {
    Workflow: '',
    FixtureNativeSessions: 'true',
    FixtureNativeApprovals: 'true',
    FixtureCandidateRecoveryEvidence: 'true',
    ModelApi: api,
    ...(gate ? { NativeGate: gate } : {}),
    ...(record.scenario === 'failure.definitive-rejection'
      ? { NativePublicBytes: '16384' }
      : {}),
  };
  await withDurableCluster(
    provider,
    async (cluster) => {
      const journey = new Journey(
        browser,
        cluster,
        record,
        root,
        [react, angular],
        api,
      );
      let failure: unknown;
      const errors: unknown[] = [];
      try {
        await journey.initialize(plan, environment);
        await scenario(journey, plan);
        expect(journey.pageErrors).toEqual([]);
        expect(journey.unexpectedRequests).toEqual([]);
      } catch (error) {
        failure = error;
      } finally {
        try {
          await journey.collect();
        } catch (error) {
          errors.push(error);
        }
        try {
          await finalizeCandidateAcceptance(
            () => journey.close(),
            () => journey.validateFinalFaults(),
          );
        } catch (error) {
          errors.push(error);
        }
        try {
          await writeFile(
            join(root, 'journey.json'),
            JSON.stringify(
              {
                kind: 'actual-source-candidate-browser-journey',
                record,
                threadId: journey.threadId,
                plan,
                records: journey.records,
                computations: journey.computations,
                pageErrors: journey.pageErrors,
                unexpectedRequests: journey.unexpectedRequests,
                workers: journey.workers.map((worker) => ({
                  process: worker.fixture.process,
                  stages: worker.stages,
                  evidence: worker.evidence,
                })),
                providerRequests: journey.requests,
                observer: journey.observedRecords(),
                proxy: journey.routedRecords(),
                failure: failure instanceof Error ? failure.stack : failure,
                cleanupErrors: errors.map(String),
              },
              null,
              2,
            ),
          );
        } catch (error) {
          errors.push(error);
        }
      }
      if (failure || errors.length)
        throw new AggregateError(
          [...(failure ? [failure] : []), ...errors],
          `Candidate journey ${record.id} failed: ${failure instanceof Error ? failure.message : String(failure ?? '')}`,
        );
    },
    environment,
  );
}
