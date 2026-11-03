import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { withDurableCluster } from '../harness/durable-fixture';
import { type DotnetFixture, runInput } from '../harness/http-fixture';

const principal = { 'X-Fixture-Principal': 'alice' };
const browserTool = {
  name: 'getWeather',
  description: 'Get weather',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
};
interface ProbeState {
  readonly session: {
    readonly state: string;
    readonly revision: number;
    readonly payload: string;
  } | null;
  readonly members: readonly {
    readonly call_id: string;
    readonly batch_id: string;
  }[];
  readonly effects: readonly unknown[];
}
interface ProbeRecovery {
  readonly schemaVersion: number;
  readonly disposition: string;
  readonly serverRevision: number;
  readonly snapshot: {
    readonly messages: readonly {
      readonly id: string;
      readonly role: string;
      readonly content?: string;
      readonly toolCalls?: readonly {
        readonly id: string;
        readonly function: {
          readonly name: string;
          readonly arguments: string;
        };
      }[];
    }[];
    readonly interrupts: readonly {
      readonly id: string;
      readonly toolCallId: string;
    }[];
    readonly pendingBrowserRecovery: {
      readonly protocolVersion: number;
      readonly serverRevision: number;
      readonly callIds: readonly string[];
    };
  };
}

/** Reads actual scoped PostgreSQL state independently of the public recovery envelope. */
async function state(
  fixture: DotnetFixture,
  threadId: string,
): Promise<ProbeState> {
  const response = await fetch(
    `${fixture.url}/__test/native-recovery-state?threadId=${encodeURIComponent(threadId)}`,
    { headers: principal, signal: AbortSignal.timeout(5000) },
  );
  expect(response.status).toBe(200);
  return response.json();
}

/** Bounds the actual HTTP stream and retains exact received bytes even if the native producer fails closed. */
async function observeRun(
  fixture: DotnetFixture,
  input: unknown,
  observations: Record<string, unknown>,
) {
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new Error('Split producer actual stream deadline')),
    20_000,
  );
  const chunks: Buffer[] = [];
  let response: Response | undefined;
  let bytes = 0;
  try {
    response = await fetch(`${fixture.url}/run`, {
      method: 'POST',
      headers: {
        ...principal,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(input),
      signal: abort.signal,
    });
    for await (const chunk of response.body ?? []) {
      const owned = Buffer.from(chunk);
      bytes += owned.length;
      if (bytes > 1024 * 1024)
        throw new Error('Split producer stream evidence exceeded bound');
      chunks.push(owned);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const events = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)) as Record<string, unknown>);
    return { response, body, events };
  } finally {
    clearTimeout(timer);
    observations.initial = {
      status: response?.status,
      bodyBase64: Buffer.concat(chunks).toString('base64'),
      body: Buffer.concat(chunks).toString('utf8'),
    };
    abort.abort();
  }
}

for (const provider of ['openai', 'azure'] as const)
  for (const api of ['chat-completions', 'responses'] as const)
    for (const shape of ['tool-only', 'ordered-text', 'prefix-text'] as const)
      test(`actual Aimock canonical announcement grouping ${provider}/${api}/${shape}`, async () => {
        const evidence = await createDotnetProbeDirectory(
          'hashbrown-split-producer-',
        );
        const threadId = `split-${crypto.randomUUID()}`;
        const prompt = `Split producer ${threadId}`;
        const textA = 'First actual announcement café ';
        const textB = 'Second actual announcement 🛫 ';
        const calls = [
          {
            id: 'split-browser-one',
            name: 'getWeather',
            arguments: { city: 'First owned city' },
          },
          {
            id: 'split-protected-one',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
          {
            id: 'split-browser-two',
            name: 'getWeather',
            arguments: { city: 'Second owned city' },
          },
          {
            id: 'split-protected-two',
            name: 'lookupAirport',
            arguments: { code: 'SEA' },
          },
        ];
        const response =
          shape === 'tool-only'
            ? { toolCalls: calls }
            : shape === 'prefix-text'
              ? {
                  blocks: [
                    { type: 'text' as const, text: textA },
                    ...calls.map((call) => ({
                      type: 'toolCall' as const,
                      ...call,
                    })),
                  ],
                }
              : {
                  blocks: [
                    { type: 'text' as const, text: textA },
                    ...calls
                      .slice(0, 2)
                      .map((call) => ({ type: 'toolCall' as const, ...call })),
                    { type: 'text' as const, text: textB },
                    ...calls
                      .slice(2)
                      .map((call) => ({ type: 'toolCall' as const, ...call })),
                  ],
                };
        await mkdir(join(evidence, 'observations'));
        await withDurableCluster(
          provider,
          async ({ start }) => {
            const fixture = await start();
            const observations: Record<string, unknown> = {
              provider,
              api,
              shape,
              threadId,
              fixtureDefinition: response,
              worker: fixture.process,
            };
            let failure: unknown;
            try {
              fixture.mock.on(
                { userMessage: prompt, hasToolResult: false },
                response,
              );

              const initial = await observeRun(
                fixture,
                { ...runInput(prompt), threadId, tools: [browserTool] },
                observations,
              );
              const published = await state(fixture, threadId);
              const lookup = await fetch(
                `${fixture.url}/threads/${encodeURIComponent(threadId)}/native-session`,
                {
                  method: 'POST',
                  headers: {
                    ...principal,
                    'Content-Type': 'application/json',
                    'Hashbrown-Recovery-Version': '2',
                  },
                  body: JSON.stringify({
                    tools: [browserTool],
                    forwardedProps: {},
                  }),
                  signal: AbortSignal.timeout(5000),
                },
              );
              const recovery: ProbeRecovery = await lookup.json();
              observations.parsedInitialEvents = initial.events;
              observations.published = published;
              observations.recovery = { status: lookup.status, body: recovery };

              expect(initial.events.at(-1)?.type).toBe('RUN_FINISHED');
              expect(published.session?.state).toBe('Ready');
              expect(published.effects).toEqual([]);
              expect(lookup.status).toBe(200);
              expect(recovery.schemaVersion).toBe(2);
              expect(recovery.disposition).toBe('Pending');
              expect(recovery.serverRevision).toBe(published.session?.revision);
              expect(recovery.snapshot.pendingBrowserRecovery).toMatchObject({
                protocolVersion: 1,
                serverRevision: recovery.serverRevision,
              });
              expect(
                [...recovery.snapshot.pendingBrowserRecovery.callIds].sort(),
              ).toEqual(['split-browser-one', 'split-browser-two']);
              expect(
                recovery.snapshot.interrupts
                  .map((interrupt) => interrupt.toolCallId)
                  .sort(),
              ).toEqual(['split-protected-one', 'split-protected-two']);
              expect(
                published.members.map((member) => member.call_id).sort(),
              ).toEqual(calls.map((call) => call.id).sort());
              const locations = recovery.snapshot.messages.flatMap(
                (message, messageIndex) =>
                  (message.toolCalls ?? []).map((call, callIndex) => ({
                    callId: call.id,
                    name: call.function.name,
                    arguments: JSON.parse(call.function.arguments),
                    messageId: message.id,
                    messageIndex,
                    callIndex,
                  })),
              );
              expect(locations.map((call) => call.callId).sort()).toEqual(
                calls.map((call) => call.id).sort(),
              );
              for (const location of locations)
                expect(location.arguments).toEqual(
                  calls.find((call) => call.id === location.callId)?.arguments,
                );
              const parentIds = [
                ...new Set(locations.map((call) => call.messageId)),
              ];
              observations.actualCanonicalGrouping = {
                locations,
                parentIds,
                parentCount: parentIds.length,
              };
              // This reports the observed grouping. One provider response/item ID is never promoted into a split proof.
              expect(parentIds.length).toBeGreaterThan(0);
              if (shape === 'ordered-text') {
                const text = recovery.snapshot.messages
                  .map((message) => message.content ?? '')
                  .join('');
                expect(text).toContain(textA);
                expect(text).toContain(textB);
              }
              if (shape === 'prefix-text') {
                expect(parentIds).toHaveLength(1);
                const parentId = parentIds[0];
                expect(
                  recovery.snapshot.messages.find(
                    (message) => message.id === parentId,
                  )?.content,
                ).toBe(textA);
                expect(
                  initial.events
                    .filter((event) => event.type === 'TEXT_MESSAGE_START')
                    .map((event) => event.messageId),
                ).toEqual([parentId]);
                expect(
                  initial.events
                    .filter((event) => event.type === 'TOOL_CALL_START')
                    .map((event) => event.parentMessageId),
                ).toEqual(calls.map(() => parentId));
              }
              expect(fixture.requests).toHaveLength(1);
            } catch (error) {
              failure = error;
            } finally {
              observations.providerRequestsBeforeAimockNormalization =
                fixture.requests;
              observations.workerDiagnostics = fixture.diagnostics();
              observations.failure =
                failure instanceof Error ? failure.stack : failure;
              await writeFile(
                join(evidence, 'observations', 'grouping.json'),
                JSON.stringify(observations, null, 2),
              );
              console.error(`CANDIDATE_SPLIT_PRODUCER_EVIDENCE ${evidence}`);
            }
            if (failure) throw failure;
          },
          {
            Workflow: '',
            FixtureNativeSessions: 'true',
            FixtureNativeApprovals: 'true',
            ModelApi: api,
          },
        );
      }, 120_000);
