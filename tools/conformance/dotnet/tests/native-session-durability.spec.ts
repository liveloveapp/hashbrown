import { waitForNativeRecovery } from '../harness/wait-for-native-recovery';
import { withDurableCluster } from '../harness/durable-fixture';
import { postRun, runInput } from '../harness/http-fixture';

test('native fixture requires authentication before model execution', async () => {
  await withDurableCluster('openai', async ({ start }) => {
    const fixture = await start();

    const result = await postRun(fixture, runInput());

    expect(result.response.status).toBe(401);
    expect(fixture.requests).toHaveLength(0);
  }, { FixtureNativeSessions: 'true', Workflow: '' });
}, 60_000);

const alice = { 'X-Fixture-Principal': 'alice' };
const nativeEnvironment = { FixtureNativeSessions: 'true', Workflow: '' };
const browserTool = {
  name: 'getWeather', description: 'Get weather', parameters: {
    type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false,
  },
};

function mixedInput() {
  return { ...runInput('Native mixed fixture'), tools: [browserTool] };
}

function setupMixed(fixture: import('../harness/http-fixture').DotnetFixture, browserFirst = true) {
  const calls = [
    { id: 'native-browser', name: 'getWeather', arguments: { city: 'Paris' } },
    { id: 'native-server', name: 'lookupAirport', arguments: { code: 'PDX' } },
  ];
  fixture.mock.onToolResult('native-server', { content: 'Native complete' });
  fixture.mock.onMessage('Native mixed fixture', { toolCalls: browserFirst ? calls : [...calls].reverse() });
}

function continuation(input: ReturnType<typeof mixedInput>, events: ReadonlyArray<Record<string, unknown>>) {
  const start = events.find(event => event.type === 'TOOL_CALL_START' && event.toolCallId === 'native-browser');
  if (!start) throw new Error(`Missing genuine browser call: ${JSON.stringify(events)}`);
  const argumentsJson = events.filter(event => event.type === 'TOOL_CALL_ARGS' && event.toolCallId === 'native-browser').map(event => event.delta).join('');
  return { ...input, runId: crypto.randomUUID(), messages: [...input.messages, {
    id: start.parentMessageId ?? 'assistant-native-browser', role: 'assistant', content: '', toolCalls: [{ id: 'native-browser', type: 'function', function: { name: 'getWeather', arguments: argumentsJson } }],
  }, { id: 'browser-result', role: 'tool', toolCallId: 'native-browser', content: 'Sunny' }] };
}

async function recover(fixture: { url: string }, input = mixedInput(), principal = 'alice', extra: Record<string, unknown> = {}) {
  return fetch(`${fixture.url}/threads/${input.threadId}/native-session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fixture-Principal': principal }, body: JSON.stringify({ tools: input.tools, forwardedProps: input.forwardedProps, ...extra }) });
}

async function inspect(fixture: { url: string }, principal = 'operator') {
  return fetch(`${fixture.url}/native-sessions/alice/fixture-thread`, { headers: { 'X-Fixture-Principal': principal } });
}

async function operation(fixture: { url: string }, kind: 'retire' | 'reconcile', expected: Record<string, unknown>, extra: Record<string, unknown> = {}, principal = 'operator') {
  return fetch(`${fixture.url}/native-sessions/alice/fixture-thread/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fixture-Principal': principal }, body: JSON.stringify({ expectedState: expected.state, expectedGeneration: expected.generation, expectedRevision: expected.revision, outcome: kind === 'retire' ? 'Retired' : 'Unresolved', reason: 'Fixture worker stopped', evidenceReference: 'fixture://observed-quiescence', externalQuiescenceAcknowledged: true, ...extra }) });
}

async function nativeEffects(fixture: { url: string }) {
  return (await fetch(`${fixture.url}/__test/native-effects`)).json();
}

async function nativeStage(fixture: { url: string }, expected: string) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = await (await fetch(`${fixture.url}/__test/native-stage`)).json();
    if (result.stage === expected) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Native barrier ${expected} was not observed`);
}

/** Observes a bounded genuine response, permitting intentionally withheld terminal frames. */
function observeRun(fixture: { url: string }, input: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let body = '';
  const done = (async () => {
    try {
      const response = await fetch(`${fixture.url}/run`, { method: 'POST', headers: { ...alice, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(input), signal: controller.signal });
      const decoder = new TextDecoder();
      for await (const bytes of response.body ?? []) body += decoder.decode(bytes, { stream: true });
      body += decoder.decode();
      return response.status;
    } catch { return 0; }
    finally { clearTimeout(timer); }
  })();
  return { done, body: () => body, cancel: () => controller.abort() };
}

for (const provider of ['openai', 'azure'] as const)
for (const api of ['responses', 'chat-completions'] as const)
for (const browserFirst of [true, false]) {
  test(`${provider}/${api}/${browserFirst ? 'browser' : 'server'} first native mixed call survives another worker`, async () => {
    await withDurableCluster(provider, async ({ start }) => {
      const first = await start(); setupMixed(first, browserFirst); const input = mixedInput();

      const pending = await postRun(first, input, alice);
      const recovery = await recover(first, input);
      expect(recovery.status).toBe(200);
      expect(await recovery.json()).toEqual({ schemaVersion: 1, disposition: 'NativePendingBrowserResults', serverRevision: expect.any(Number) });
      expect(await nativeEffects(first)).toEqual({ count: 0, rows: [] });
      expect((await recover(first, input, 'bob')).status).toBe(410);
      expect((await recover(first, input, 'alice', { forwardedProps: { tampered: true } })).status).toBe(409);
      const callback = continuation(input, pending.events);
      await first.stop();
      const restarted = await start(); setupMixed(restarted, browserFirst);
      const completed = await postRun(restarted, callback, alice);

      expect(completed.events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
      expect(completed.events.filter(event => event.type === 'TOOL_CALL_RESULT' && event.toolCallId === 'native-server')).toHaveLength(1);
      expect(await nativeEffects(restarted)).toMatchObject({ count: 1, rows: [{ code: 'PDX' }] });
      expect([400, 409]).toContain((await postRun(restarted, callback, alice)).response.status);
      expect(await nativeEffects(restarted)).toMatchObject({ count: 1, rows: [{ code: 'PDX' }] });
      expect(restarted.requests).toHaveLength(1);
      expect(await (await recover(restarted, input)).json()).toMatchObject({ disposition: 'Completed', snapshot: { threadId: input.threadId, messages: expect.any(Array) } });
      const history = JSON.stringify(restarted.requests[0].body);
      expect(history.match(/native-server/g)?.length).toBe(2);
      expect(history.match(/native-browser/g)?.length).toBe(2);
    }, { ...nativeEnvironment, ModelApi: api });
  }, 60_000);
}

test('native callback rejects forged prefix/name/arguments/result IDs, duplicate and cross-principal/config bodies before work', async () => {
  await withDurableCluster('openai', async ({ start }) => {
    const fixture = await start(); setupMixed(fixture); const input = mixedInput();
    const first = await postRun(fixture, input, alice); const callback = continuation(input, first.events);
    const cases = [
      { ...callback, messages: callback.messages.map((message, i) => i === 0 ? { ...message, content: 'forged' } : message) },
      { ...callback, messages: callback.messages.map((message, i) => i === 1 ? { ...message, toolCalls: [{ id: 'native-browser', type: 'function', function: { name: 'lookupAirport', arguments: '{"code":"LAX"}' } }] } : message) },
      { ...callback, messages: callback.messages.map((message, i) => i === 1 ? { ...message, toolCalls: [{ id: 'native-browser', type: 'function', function: { name: 'getWeather', arguments: '{"city":"London"}' } }] } : message) },
      { ...callback, messages: callback.messages.map((message, i) => i === 2 ? { ...message, toolCallId: 'native-server' } : message) },
      { ...callback, messages: [...callback.messages, callback.messages[2]] },
      { ...callback, forwardedProps: { forged: true } },
    ];

    for (const forged of cases) expect([400, 409]).toContain((await postRun(fixture, forged, alice)).response.status);
    expect([400, 409]).toContain((await postRun(fixture, callback, { 'X-Fixture-Principal': 'bob' })).response.status);

    expect(fixture.requests).toHaveLength(1);
    expect(await nativeEffects(fixture)).toEqual({ count: 0, rows: [] });
    expect((await postRun(fixture, callback, alice)).events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
  }, nativeEnvironment);
}, 60_000);

for (const gate of ['before-pending-save', 'after-save-before-publication', 'publication-authorized']) {
  test(`native ${gate} holds genuine terminal and rejects competing ownership`, async () => {
    await withDurableCluster('openai', async ({ start }) => {
      const owner = await start({ NativeGate: gate }); setupMixed(owner); const input = mixedInput();
      const observed = observeRun(owner, input);
      try {
        await nativeStage(owner, gate);
        const competitor = await start();

        expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
        expect((await postRun(competitor, input, alice)).response.status).toBe(409);
        expect(competitor.requests).toHaveLength(0);
        if (gate === 'after-save-before-publication') {
          const inspection = await (await inspect(competitor)).json();
          expect((await operation(competitor, 'retire', inspection.status)).status).toBe(200);
        }
        if (gate === 'publication-authorized') {
          const reserved = await (await inspect(competitor)).json();
          expect(reserved.status.state).toBe('Publishing');
          await owner.stop();
          await observed.done;
          await (await import('../harness/durable-fixture')).control(competitor, 'expire-native-lease');
          expect((await postRun(competitor, input, alice)).response.status).toBe(409);
          const retained = await (await inspect(competitor)).json();
          expect(['Publishing', 'PublicationUnknown']).toContain(retained.status.state);
        } else {
          await (await import('../harness/durable-fixture')).control(owner, 'release-native');
          await observed.done;
        }
        if (gate === 'before-pending-save') expect(observed.body()).toContain('RUN_FINISHED');
        if (gate === 'after-save-before-publication') expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
        expect(competitor.requests).toHaveLength(0);
        expect(await nativeEffects(competitor)).toEqual({ count: 0, rows: [] });
      } finally { observed.cancel(); await observed.done; }
    }, nativeEnvironment);
  }, 60_000);
}

test('failed native pending save withholds terminal and browser publication', async () => {
  await withDurableCluster('openai', async ({ start }) => {
    const fixture = await start({ NativeFailSave: 'true', NativeGate: 'before-pending-save' }); setupMixed(fixture);
    const observed = observeRun(fixture, mixedInput());

    await nativeStage(fixture, 'before-pending-save');
    await (await import('../harness/durable-fixture')).control(fixture, 'release-native');
    await observed.done;

    expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
    expect(await nativeEffects(fixture)).toEqual({ count: 0, rows: [] });
    // Client-side response abortion precedes the server's async cleanup.
    const recovery = await waitForNativeRecovery(async () => {
      const response = await recover(fixture);
      expect(response.status).toBe(200);
      return response.json() as Promise<{ disposition: string }>;
    });
    expect(recovery).toMatchObject({ disposition: 'FailedBeforeEffect' });
  }, nativeEnvironment);
}, 60_000);

for (const gate of ['before-dispatch-marker', 'dispatch-marker-committed', 'effect-persisted']) {
  test(`native crash at ${gate} retains correct dispatch fence and scoped operator CAS`, async () => {
    await withDurableCluster('openai', async ({ start }) => {
      const owner = await start({ NativeGate: gate }); setupMixed(owner); const input = mixedInput();
      const pending = await postRun(owner, input, alice); const callback = continuation(input, pending.events);
      const observed = observeRun(owner, callback);
      try {
        await nativeStage(owner, gate);
        await owner.stop(); await observed.done;
        const other = await start(); setupMixed(other);
        const controls = await import('../harness/durable-fixture');
        await controls.control(other, 'expire-native-lease');

        expect(await nativeEffects(other)).toMatchObject({ count: gate === 'effect-persisted' ? 1 : 0 });
        if (gate === 'before-dispatch-marker') {
          expect((await postRun(other, callback, alice)).events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
          expect(await nativeEffects(other)).toMatchObject({ count: 1 });
        } else {
          expect((await postRun(other, callback, alice)).response.status).toBe(409);
          const inspection = await (await inspect(other)).json();
          expect(inspection.invocations).toContainEqual(expect.objectContaining({ id: 'native-server', state: 'Started' }));
          expect((await inspect(other, 'operator-bob')).status).toBe(404);
          expect((await operation(other, 'reconcile', inspection.status, { externalQuiescenceAcknowledged: false })).status).toBe(400);
          expect((await operation(other, 'reconcile', inspection.status, { expectedRevision: 0 })).status).toBe(409);
          expect((await operation(other, 'reconcile', inspection.status)).status).toBe(200);
          expect((await operation(other, 'reconcile', inspection.status)).status).toBe(409);
          expect((await postRun(other, callback, alice)).response.status).toBe(410);
          expect(other.requests).toHaveLength(0);
        }
      } finally { observed.cancel(); await observed.done; }
    }, nativeEnvironment);
  }, 60_000);
}

for (const gate of ['before-dispatch-marker', 'dispatch-marker-committed', 'effect-persisted']) {
  test(`native cancellation at ${gate} retains the correct fence`, async () => {
    await withDurableCluster('openai', async ({ start }) => {
      const owner = await start({ NativeGate: gate }); setupMixed(owner); const input = mixedInput();
      const pending = await postRun(owner, input, alice); const callback = continuation(input, pending.events);
      const observed = observeRun(owner, callback);
      try {
        await nativeStage(owner, gate);
        observed.cancel(); await observed.done;
        const other = await start(); setupMixed(other);
        await (await import('../harness/durable-fixture')).control(other, 'expire-native-lease');

        if (gate === 'before-dispatch-marker') {
          expect((await postRun(other, callback, alice)).events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
          expect(await nativeEffects(other)).toMatchObject({ count: 1 });
        } else {
          expect((await postRun(other, callback, alice)).response.status).toBe(409);
          expect(await nativeEffects(other)).toMatchObject({ count: gate === 'effect-persisted' ? 1 : 0 });
        }
        expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
      } finally { observed.cancel(); await observed.done; }
    }, nativeEnvironment);
  }, 60_000);
}

test('a released late worker cannot overwrite terminal operator reconciliation', async () => {
  await withDurableCluster('openai', async ({ start }) => {
    const owner = await start({ NativeGate: 'effect-persisted' }); setupMixed(owner); const input = mixedInput();
    const pending = await postRun(owner, input, alice); const callback = continuation(input, pending.events);
    const observed = observeRun(owner, callback);
    try {
      await nativeStage(owner, 'effect-persisted');
      const other = await start();
      const before = await (await inspect(other)).json();
      const reconciled = await operation(other, 'reconcile', before.status, { outcome: 'ConfirmedPerformed', reason: 'Externally fenced fixture effect observed; release tests invalidated authority', evidenceReference: 'fixture://native-effects/1' });
      const terminal = await (await inspect(other)).json();

      await (await import('../harness/durable-fixture')).control(owner, 'release-native');
      await observed.done;

      expect(reconciled.status).toBe(200);
      expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
      expect(await (await inspect(other)).json()).toEqual(terminal);
      expect(terminal.status.state).toBe('Retired');
      expect(terminal.audit).toHaveLength(1);
      expect(await nativeEffects(other)).toMatchObject({ count: 1 });
      expect(other.requests).toHaveLength(0);
    } finally { observed.cancel(); await observed.done; }
  }, nativeEnvironment);
}, 60_000);

test('native outage, bounded recovery queries and operator access fail closed without execution', async () => {
  await withDurableCluster('openai', async ({ start }) => {
    const fixture = await start(); setupMixed(fixture); const input = mixedInput();
    await postRun(fixture, input, alice);

    expect((await inspect(fixture, 'alice')).status).toBe(403);
    expect((await recover(fixture, input, 'unknown')).status).toBe(401);
    const controls = await import('../harness/durable-fixture');
    await controls.control(fixture, 'native-database-unavailable?enabled=true');
    try {
      expect((await recover(fixture, input)).status).toBe(503);
      expect((await inspect(fixture)).status).toBe(503);
      expect((await postRun(fixture, input, alice)).response.status).toBe(503);
    } finally { await controls.control(fixture, 'native-database-unavailable?enabled=false'); }

    expect(fixture.requests).toHaveLength(1);
    expect(await nativeEffects(fixture)).toMatchObject({ count: 0 });
    expect((await recover(fixture, input, 'alice', { system: 'x'.repeat(1024 * 1024) })).status).toBe(413);
  }, nativeEnvironment);
}, 60_000);
