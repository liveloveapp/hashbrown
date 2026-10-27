import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { control, withDurableCluster } from '../harness/durable-fixture';
import { type DotnetFixture, postRun, runInput } from '../harness/http-fixture';

const alice = { 'X-Fixture-Principal': 'alice' };
const environment = {
  FixtureNativeSessions: 'true',
  FixtureNativeApprovals: 'true',
  Workflow: '',
};
const prompt = 'Protected native airport';
const evidenceRun = crypto.randomUUID();

/** Registers strict generic tool-call/output HTTP responses; the native framework creates approval objects. */
function script(fixture: DotnetFixture) {
  fixture.mock.onToolResult('protected-airport', {
    content: 'Protected complete',
  });
  fixture.mock.onMessage(prompt, {
    toolCalls: [
      {
        id: 'protected-airport',
        name: 'lookupAirport',
        arguments: { code: 'PDX' },
      },
    ],
  });
}

/** Reads bounded fixture metadata and actual effect rows independently of journal authority. */
async function state(fixture: DotnetFixture, threadId = 'fixture-thread') {
  const response = await fetch(
    `${fixture.url}/__test/native-approval-state?threadId=${threadId}`,
    { headers: alice },
  );
  expect(response.status).toBe(200);
  const observed = await response.json();
  record({ worker: fixture.url, requests: fixture.requests, observed });
  return observed;
}

/** Derives exact decisions from genuine public interrupts and validates an event accumulator against saved public history. */
async function decisionInput(
  fixture: DotnetFixture,
  input: Omit<ReturnType<typeof runInput>, 'tools'> & { tools: object[] },
  events: ReadonlyArray<Record<string, unknown>>,
  decision: 'approve' | 'decline' | 'cancel',
) {
  const response = await fetch(
    `${fixture.url}/threads/${input.threadId}/native-session`,
    {
      method: 'POST',
      headers: { ...alice, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tools: input.tools,
        forwardedProps: input.forwardedProps,
      }),
    },
  );
  expect(response.status).toBe(200);
  const recovered = await response.json();
  expect(recovered.disposition).toBe('Pending');
  const terminal = events.at(-1) as {
    outcome: { interrupts: Array<{ id: string }> };
  };
  expect(recovered.snapshot.interrupts).toEqual(terminal.outcome.interrupts);
  const starts = events.filter((event) => event.type === 'TOOL_CALL_START');
  const parents = [
    ...new Set(
      starts.map(
        (event) => event.parentMessageId ?? `assistant-${event.toolCallId}`,
      ),
    ),
  ];
  const messages = [
    ...input.messages,
    ...parents.map((parent) => ({
      id: parent,
      role: 'assistant',
      content: '',
      toolCalls: starts
        .filter(
          (event) =>
            (event.parentMessageId ?? `assistant-${event.toolCallId}`) ===
            parent,
        )
        .map((event) => ({
          id: event.toolCallId,
          type: 'function',
          function: {
            name: event.toolCallName,
            arguments: events
              .filter(
                (item) =>
                  item.type === 'TOOL_CALL_ARGS' &&
                  item.toolCallId === event.toolCallId,
              )
              .map((item) => item.delta)
              .join(''),
          },
        })),
    })),
  ];
  expect(messages).toEqual(recovered.snapshot.messages);
  record({
    publicEvents: events,
    publicSnapshot: recovered.snapshot,
    accumulatedMessages: messages,
  });
  const validatedMessages: typeof recovered.snapshot.messages = messages;
  return {
    ...input,
    runId: crypto.randomUUID(),
    messages: validatedMessages,
    resume: terminal.outcome.interrupts.map((interrupt) =>
      decision === 'cancel'
        ? { interruptId: interrupt.id, status: 'cancelled' }
        : {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: { approved: decision === 'approve' },
          },
    ),
  };
}

for (const provider of ['openai', 'azure'] as const)
  for (const api of ['responses', 'chat-completions'] as const)
    for (const decision of ['approve', 'decline', 'cancel'] as const) {
      test(`${provider}/${api} genuine native ${decision} uses a durable public approval`, async () => {
        await withDurableCluster(
          provider,
          async ({ start }) => {
            const owner = await start();
            script(owner);
            const input = runInput(prompt);

            const pending = await postRun(owner, input, alice);

            expect(pending.events.at(-1)).toMatchObject({
              type: 'RUN_FINISHED',
              outcome: {
                interrupts: [
                  expect.objectContaining({ id: expect.any(String) }),
                ],
              },
            });
            expect(owner.requests).toHaveLength(1);
            expect(
              pending.events.filter(
                (event) => event.type === 'TOOL_CALL_START',
              ),
            ).toEqual([
              expect.objectContaining({
                toolCallId: 'protected-airport',
                toolCallName: 'lookupAirport',
              }),
            ]);
            expect(
              pending.events.filter(
                (event) => event.type === 'TOOL_CALL_RESULT',
              ),
            ).toEqual([]);
            const before = await state(owner);
            expect(before.schemaVersion).toBe(2);
            expect(before).toMatchObject({
              session: { state: 'Ready' },
              batches: [{ state: 'Pending', member_count: 1 }],
              members: [{ state: 'Pending', decision: null }],
              invocations: [{ state: 'Captured', dispatch_generation: null }],
              effects: [],
            });
            const callback = await decisionInput(
              owner,
              input,
              pending.events,
              decision,
            );
            await owner.stop();
            const peer = await start();
            script(peer);
            const completed = await postRun(peer, callback, alice);

            expect(completed.events.at(-1)).toMatchObject({
              type: 'RUN_FINISHED',
            });
            expect(
              completed.events.filter(
                (event) => event.type === 'TOOL_CALL_START',
              ),
            ).toEqual([]);
            expect(
              completed.events.filter(
                (event) => event.type === 'TOOL_CALL_RESULT',
              ),
            ).toEqual([
              expect.objectContaining({ toolCallId: 'protected-airport' }),
            ]);
            expect(peer.requests).toHaveLength(1);
            const after = await state(peer);
            expect(after).toMatchObject({
              session: { state: 'Ready' },
              batches: [{ state: 'Settled' }],
              members: [
                {
                  state: 'Settled',
                  decision:
                    decision === 'approve'
                      ? 'Approved'
                      : decision === 'decline'
                        ? 'Declined'
                        : 'Cancelled',
                },
              ],
              invocations: [
                {
                  state:
                    decision === 'approve'
                      ? 'Completed'
                      : decision === 'decline'
                        ? 'Declined'
                        : 'Cancelled',
                  dispatch_generation:
                    decision === 'approve' ? expect.any(Number) : null,
                },
              ],
            });
            expect(after.effects).toHaveLength(decision === 'approve' ? 1 : 0);
            if (decision === 'approve')
              expect(after.effects[0]).toMatchObject({
                session_id: after.session.id,
                call_id: after.members[0].call_id,
                request_id: after.members[0].request_id,
                batch_id: after.members[0].batch_id,
                admitted_generation: after.members[0].admitted_generation,
                admitted_revision: after.members[0].admitted_revision,
                code: 'PDX',
              });
            for (const request of [owner.requests[0], peer.requests[0]])
              schemas(request, api);
            transcript(peer.requests[0], api, [
              {
                id: 'protected-airport',
                code: 'PDX',
                output:
                  decision === 'approve'
                    ? { code: 'PDX', name: 'Portland International Airport' }
                    : decision === 'decline'
                      ? 'Tool call invocation rejected.'
                      : 'Tool call invocation rejected. Cancelled by caller.',
              },
            ]);
            const history = JSON.stringify(peer.requests[0].body);
            expect(history.match(/protected-airport/g)).toHaveLength(2);
            expect(history).not.toMatch(
              /toolApproval|interruptResponse|requiresConfirmation/,
            );
            if (decision !== 'approve')
              expect(history).toContain(
                decision === 'decline'
                  ? 'Tool call invocation rejected.'
                  : 'Tool call invocation rejected. Cancelled by caller.',
              );
            expect((await postRun(peer, callback, alice)).response.status).toBe(
              400,
            );
            expect(peer.requests).toHaveLength(1);
            expect((await state(peer)).effects).toEqual(after.effects);
          },
          { ...environment, ModelApi: api },
        );
      }, 60_000);
    }

for (const boundary of [
  'before-decision-reservation',
  'decision-admitted',
  'before-dispatch-marker',
  'dispatch-marker-committed',
  'effect-persisted',
  'before-session-save',
  'after-save-before-publication',
  'publication-authorized',
  'before-publication-finalization',
])
  for (const failure of ['death', 'abort'] as const) {
    test(`protected ${failure} at ${boundary} preserves the irreversible decision fence`, async () => {
      await withDurableCluster(
        'openai',
        async ({ start }) => {
          const initial = await start();
          script(initial);
          const input = runInput(prompt);
          const pending = await postRun(initial, input, alice);
          const callback = await decisionInput(
            initial,
            input,
            pending.events,
            'approve',
          );
          await initial.stop();
          const owner = await start({ NativeGate: boundary });
          script(owner);
          const peer = await start();
          script(peer);
          const observed = observeRun(owner, callback);
          try {
            await stage(owner, boundary);
            const held = await state(peer);
            record({
              boundary,
              ownerRequests: owner.requests,
              peerRequests: peer.requests,
              held,
            });
            const notStarted = [
              'before-decision-reservation',
              'decision-admitted',
              'before-dispatch-marker',
            ].includes(boundary);
            expect(held.invocations[0]).toMatchObject({
              state: notStarted
                ? 'Captured'
                : ['dispatch-marker-committed', 'effect-persisted'].includes(
                      boundary,
                    )
                  ? 'Started'
                  : 'Completed',
              dispatch_generation: notStarted
                ? null
                : held.members[0].admitted_generation,
            });
            expect(held.effects).toHaveLength(
              [
                'effect-persisted',
                'before-session-save',
                'after-save-before-publication',
                'publication-authorized',
                'before-publication-finalization',
              ].includes(boundary)
                ? 1
                : 0,
            );
            expect(owner.requests).toHaveLength(
              [
                'before-session-save',
                'after-save-before-publication',
                'publication-authorized',
                'before-publication-finalization',
              ].includes(boundary)
                ? 1
                : 0,
            );
            expect(held.members[0]).toMatchObject({
              state:
                boundary === 'before-decision-reservation'
                  ? 'Pending'
                  : [
                        'before-session-save',
                        'after-save-before-publication',
                        'publication-authorized',
                        'before-publication-finalization',
                      ].includes(boundary)
                    ? 'Settled'
                    : 'DecisionAdmitted',
              decision:
                boundary === 'before-decision-reservation' ? null : 'Approved',
            });
            if (boundary !== 'before-publication-finalization')
              expect(observed.body()).not.toContain('RUN_FINISHED');

            if (failure === 'death') await owner.stop();
            else observed.cancel();
            await observed.done;
            await control(peer, 'expire-native-lease');
            const retried = await postRun(peer, callback, alice);

            if (boundary === 'before-decision-reservation') {
              expect(retried.response.status).toBe(200);
              expect(peer.requests).toHaveLength(1);
              expect((await state(peer)).effects).toHaveLength(1);
            } else {
              expect(retried.response.status).toBe(
                boundary === 'after-save-before-publication' ? 400 : 409,
              );
              expect(peer.requests).toHaveLength(0);
              const fenced = await state(peer);
              expect(fenced.effects).toEqual(held.effects);
              if (
                [
                  'publication-authorized',
                  'before-publication-finalization',
                ].includes(boundary)
              )
                expect(['Publishing', 'PublicationUnknown']).toContain(
                  fenced.session.state,
                );
              expect(fenced.members[0].decision).toBe('Approved');
              expect(fenced.members[0].admitted_generation).toBe(
                held.members[0].admitted_generation,
              );
              expect(fenced.invocations[0].dispatch_generation).toBe(
                held.invocations[0].dispatch_generation,
              );
              if (failure === 'death') {
                const inspected = await inspect(peer);
                expect(
                  (
                    await operate(peer, inspected.status, {
                      externalQuiescenceAcknowledged: false,
                    })
                  ).status,
                ).toBe(400);
                expect(
                  (
                    await operate(peer, inspected.status, {
                      expectedRevision: 0,
                    })
                  ).status,
                ).toBe(409);
                expect((await operate(peer, inspected.status)).status).toBe(
                  200,
                );
                expect((await operate(peer, inspected.status)).status).toBe(
                  409,
                );
                expect(
                  (await postRun(peer, callback, alice)).response.status,
                ).toBe(410);
                record({
                  boundary,
                  quiescence: 'owner SIGKILL and awaited exit',
                  retired: await inspect(peer),
                  requests: peer.requests,
                });
              }
            }
          } finally {
            observed.cancel();
            await observed.done;
          }
        },
        environment,
      );
    }, 60_000);
  }

/** Waits for the fixture to observe the exact journal boundary. */
async function stage(fixture: DotnetFixture, expected: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await (
      await fetch(`${fixture.url}/__test/native-stage`)
    ).json();
    if (value.stage === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Missing ${expected}: ${fixture.diagnostics()}`);
}

/** Collects bounded genuine SSE bytes while allowing a withheld terminal or transport abort. */
function observeRun(fixture: DotnetFixture, input: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let body = '';
  const done = (async () => {
    try {
      const response = await fetch(`${fixture.url}/run`, {
        method: 'POST',
        headers: { ...alice, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const decoder = new TextDecoder();
      for await (const bytes of response.body ?? []) {
        body += decoder.decode(bytes, { stream: true });
        if (body.length > 262144)
          throw new Error('Unbounded native fixture response');
      }
      body += decoder.decode();
      return response.status;
    } catch {
      return 0;
    } finally {
      clearTimeout(timeout);
      record({
        worker: fixture.url,
        requests: fixture.requests,
        observedPublicBody: body,
      });
    }
  })();
  return { body: () => body, done, cancel: () => controller.abort() };
}

for (const decision of ['decline', 'cancel'] as const)
  for (const boundary of ['decision-admitted', 'before-session-save'])
    for (const failure of ['death', 'abort'] as const) {
      test(`protected ${decision} ${failure} at ${boundary} retains zero-dispatch consumption`, async () => {
        await withDurableCluster(
          'openai',
          async ({ start }) => {
            const first = await start();
            script(first);
            const input = runInput(prompt);
            const pending = await postRun(first, input, alice);
            const callback = await decisionInput(
              first,
              input,
              pending.events,
              decision,
            );
            await first.stop();
            const owner = await start({ NativeGate: boundary });
            script(owner);
            const peer = await start();
            const observed = observeRun(owner, callback);
            try {
              await stage(owner, boundary);
              const held = await state(peer);
              record({
                boundary,
                ownerRequests: owner.requests,
                peerRequests: peer.requests,
                held,
              });
              expect(held.invocations[0]).toMatchObject({
                state:
                  boundary === 'decision-admitted'
                    ? 'Captured'
                    : decision === 'decline'
                      ? 'Declined'
                      : 'Cancelled',
                dispatch_generation: null,
              });
              expect(held.members[0]).toMatchObject({
                decision: decision === 'decline' ? 'Declined' : 'Cancelled',
                admitted_generation: expect.any(Number),
              });

              if (failure === 'death') await owner.stop();
              else observed.cancel();
              await observed.done;
              await control(peer, 'expire-native-lease');
              const retry = await postRun(peer, callback, alice);

              expect(retry.response.status).toBe(409);
              expect(peer.requests).toHaveLength(0);
              const after = await state(peer);
              expect(after.effects).toEqual([]);
              expect(after.members[0].admitted_generation).toBe(
                held.members[0].admitted_generation,
              );
              expect(after.invocations[0].dispatch_generation).toBeNull();
            } finally {
              observed.cancel();
              await observed.done;
            }
          },
          environment,
        );
      }, 60_000);
    }

for (const rejected of ['decline', 'cancel'] as const)
  for (const winner of ['approve', rejected] as const) {
    test(`opposed approve versus ${rejected} lets controlled ${winner} owner consume once`, async () => {
      await withDurableCluster(
        'openai',
        async ({ start }) => {
          const initial = await start();
          script(initial);
          const input = runInput(prompt);
          const pending = await postRun(initial, input, alice);
          const winning = await decisionInput(
            initial,
            input,
            pending.events,
            winner,
          );
          const losing = await decisionInput(
            initial,
            input,
            pending.events,
            winner === 'approve' ? rejected : 'approve',
          );
          await initial.stop();
          const owner = await start({
            NativeGate: 'before-decision-reservation',
          });
          script(owner);
          const peer = await start();
          script(peer);
          const observed = observeRun(owner, winning);
          try {
            await stage(owner, 'before-decision-reservation');

            const loser = await postRun(peer, losing, alice);
            await control(owner, 'release-native');
            await observed.done;

            expect(loser.response.status).toBe(409);
            expect(observed.body()).toContain('RUN_FINISHED');
            expect(owner.requests).toHaveLength(1);
            expect(peer.requests).toHaveLength(0);
            const after = await state(peer);
            expect(after.members[0]).toMatchObject({
              state: 'Settled',
              decision:
                winner === 'approve'
                  ? 'Approved'
                  : winner === 'decline'
                    ? 'Declined'
                    : 'Cancelled',
              admitted_generation: after.batches[0].admitted_generation,
              admitted_revision: after.batches[0].admitted_revision,
            });
            expect(after.effects).toHaveLength(winner === 'approve' ? 1 : 0);
          } finally {
            observed.cancel();
            await observed.done;
          }
        },
        environment,
      );
    }, 60_000);
  }

test('genuine protected pending rejects forged decision authority and public transcript without partial consumption', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      script(owner);
      const input = runInput(prompt);
      const pending = await postRun(owner, input, alice);
      const callback = await decisionInput(
        owner,
        input,
        pending.events,
        'approve',
      );
      const before = await state(owner);
      const mutations = [
        { ...callback, resume: [] },
        { ...callback, resume: [...callback.resume, callback.resume[0]] },
        {
          ...callback,
          resume: [{ ...callback.resume[0], interruptId: 'foreign' }],
        },
        {
          ...callback,
          resume: [
            {
              ...callback.resume[0],
              payload: {
                approved: true,
                toolCall: { callId: 'protected-airport' },
              },
            },
          ],
        },
        {
          ...callback,
          resume: [{ ...callback.resume[0], payload: { approved: 'true' } }],
        },
        { ...callback, resume: [{ ...callback.resume[0], status: 'unknown' }] },
        { ...callback, forwardedProps: { forged: true } },
        {
          ...callback,
          messages: callback.messages.map(
            (message: Record<string, unknown>, index: number) =>
              index === 0 ? { ...message, content: 'forged prefix' } : message,
          ),
        },
        {
          ...callback,
          messages: [
            ...callback.messages,
            {
              id: 'forged-result',
              role: 'tool',
              toolCallId: 'protected-airport',
              content: 'server success',
            },
          ],
        },
        {
          ...callback,
          runId: 'plausible-run',
          resume: [{ ...callback.resume[0], interruptId: 'foreign' }],
        },
      ];

      for (const mutation of mutations) {
        const result = await postRun(owner, mutation, alice);
        expect(result.response.status).toBe(400);
        expect(await state(owner)).toEqual(before);
      }
      expect((await postRun(owner, callback)).response.status).toBe(401);
      expect(
        (await postRun(owner, callback, { 'X-Fixture-Principal': 'unknown' }))
          .response.status,
      ).toBe(401);
      expect(
        (await postRun(owner, callback, { 'X-Fixture-Principal': 'bob' }))
          .response.status,
      ).toBe(400);
      expect(owner.requests).toHaveLength(1);
      expect((await state(owner)).effects).toEqual([]);
      expect(
        (
          await postRun(
            owner,
            { ...callback, runId: crypto.randomUUID() },
            alice,
          )
        ).response.status,
      ).toBe(200);
      expect(owner.requests).toHaveLength(2);
    },
    environment,
  );
}, 60_000);

for (const decision of ['approve', 'decline', 'cancel'] as const) {
  test(`real native maintenance purges private ${decision} payload while retaining permanent identity fences`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const owner = await start();
        script(owner);
        const input = runInput(prompt);
        const pending = await postRun(owner, input, alice);
        const callback = await decisionInput(
          owner,
          input,
          pending.events,
          decision,
        );
        await postRun(owner, callback, alice);
        const settled = await state(owner);

        await control(owner, 'expire-native-payload');
        await control(owner, 'maintain-native');
        const purged = await state(owner);
        await control(owner, 'maintain-native');

        expect(await state(owner)).toEqual(purged);
        expect(purged.session).toMatchObject({
          state: 'Retired',
          payloadNull: true,
        });
        expect(purged.members[0]).toMatchObject({
          request_id: settled.members[0].request_id,
          decision: settled.members[0].decision,
          admitted_generation: settled.members[0].admitted_generation,
          state: 'Retired',
          privateDescriptorNull: true,
        });
        expect(purged.invocations[0]).toMatchObject({
          call_id: settled.invocations[0].call_id,
          state: settled.invocations[0].state,
          dispatch_generation: settled.invocations[0].dispatch_generation,
          descriptorNull: true,
        });
        expect(purged.effects).toEqual(settled.effects);
        expect((await postRun(owner, callback, alice)).response.status).toBe(
          410,
        );
        expect(owner.requests).toHaveLength(2);
      },
      environment,
    );
  }, 60_000);
}

test('protected renewal loss is observed and cancels the pending gate without reopening admission', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const first = await start();
      script(first);
      const input = runInput(prompt);
      const pending = await postRun(first, input, alice);
      const callback = await decisionInput(
        first,
        input,
        pending.events,
        'approve',
      );
      await first.stop();
      const owner = await start({
        NativeGate: 'decision-admitted',
        NativeLeaseSeconds: '0.6',
      });
      script(owner);
      const peer = await start();
      const observed = observeRun(owner, callback);
      try {
        await stage(owner, 'decision-admitted');

        await control(peer, 'expire-native-lease');
        await observation(owner, (value) => value.renewalFailed > 0);
        await control(owner, 'release-native');
        await observation(owner, (value) => value.cleanupCompleted > 0);
        await observed.done;

        expect((await postRun(peer, callback, alice)).response.status).toBe(
          409,
        );
        expect((await state(peer)).effects).toEqual([]);
        expect(peer.requests).toHaveLength(0);
        expect(owner.requests).toHaveLength(0);
      } finally {
        observed.cancel();
        await observed.done;
      }
    },
    environment,
  );
}, 60_000);

/** Polls a bounded fixture observation until a real completed journal operation is visible. */
async function observation(
  fixture: DotnetFixture,
  predicate: (value: Record<string, number>) => boolean,
) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await (
      await fetch(`${fixture.url}/__test/native-stage`)
    ).json();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Journal observation missing: ${fixture.diagnostics()}`);
}

test('retained protected tombstone consumes selector capacity before another model request', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      script(owner);
      const input = runInput(prompt);
      const pending = await postRun(owner, input, alice);
      const callback = await decisionInput(
        owner,
        input,
        pending.events,
        'decline',
      );
      await postRun(owner, callback, alice);
      await control(owner, 'expire-native-payload');
      await control(owner, 'maintain-native');
      const retained = await state(owner);

      const refused = await postRun(
        owner,
        { ...runInput(), threadId: 'capacity-second' },
        alice,
      );

      expect(refused.response.status).toBe(503);
      expect(owner.requests).toHaveLength(2);
      expect(await state(owner)).toEqual(retained);
    },
    { ...environment, NativePayloadCapacity: '1', NativeSelectorCapacity: '1' },
  );
}, 60_000);

const compatibilityChanges: ReadonlyArray<Readonly<Record<string, string>>> = [
  { NativeAgentName: 'OtherNative' },
  { RegistryVersion: '2' },
  { FixtureNativeApprovals: 'false' },
  { ModelApi: 'responses' },
  { Provider: 'azure' },
  { Model: 'other-model' },
  { ModelEndpoint: 'http://127.0.0.1:1/changed' },
  { NativeTenant: 'beta' },
  { NativeRegion: 'west' },
];
for (const changed of compatibilityChanges) {
  test(`protected authority binds actual server ${Object.keys(changed)[0]}`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const first = await start();
        script(first);
        const input = runInput(prompt);
        const pending = await postRun(first, input, alice);
        const callback = await decisionInput(
          first,
          input,
          pending.events,
          'approve',
        );
        const retained = await state(first);
        const peer = await start(changed);

        const refused = await postRun(peer, callback, alice);

        expect(refused.response.status).toBe(
          Object.keys(changed)[0] === 'NativeAgentName' ||
            Object.keys(changed)[0] === 'NativeTenant' ||
            Object.keys(changed)[0] === 'NativeRegion'
            ? 400
            : 409,
        );
        expect(peer.requests).toHaveLength(0);
        expect(first.requests).toHaveLength(1);
        expect(await state(first)).toEqual(retained);
      },
      { ...environment, NativeTenant: 'alpha', NativeRegion: 'east' },
    );
  }, 60_000);
}

/** Persists bounded qualification observations only when an owned evidence directory is explicitly configured. */
function record(value: unknown) {
  const directory = process.env['DOTNET_NATIVE_APPROVAL_EVIDENCE_DIRECTORY'];
  if (!directory) return;
  const encoded = JSON.stringify({
    runId: evidenceRun,
    test: expect.getState().currentTestName,
    evidence: value,
  });
  if (encoded.length > 1048576)
    throw new Error('Native approval evidence exceeds its bound');
  mkdirSync(directory, { recursive: true });
  appendFileSync(join(directory, 'observations.jsonl'), encoded + '\n');
}

for (const boundary of [
  'before-pending-save',
  'after-save-before-publication',
  'publication-authorized',
]) {
  test(`protected initial publication at ${boundary} exposes no premature actionable terminal`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const owner = await start({ NativeGate: boundary });
        script(owner);
        const input = runInput(prompt);
        const peer = await start();
        const observed = observeRun(owner, input);
        try {
          await stage(owner, boundary);
          const held = await state(peer);

          expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
          expect((await postRun(peer, input, alice)).response.status).toBe(409);
          const recovery = await (
            await fetch(
              `${peer.url}/threads/${input.threadId}/native-session`,
              {
                method: 'POST',
                headers: { ...alice, 'Content-Type': 'application/json' },
                body: JSON.stringify({ tools: [] }),
              },
            )
          ).json();
          expect(recovery).toMatchObject({ disposition: 'Busy' });
          expect(recovery).not.toHaveProperty('snapshot');
          expect(held.effects).toEqual([]);
          expect(held.members[0]).toMatchObject({
            state: 'Pending',
            decision: null,
            admitted_generation: null,
          });
          expect(held.session.state).toBe(
            boundary === 'before-pending-save'
              ? 'Owned'
              : boundary === 'after-save-before-publication'
                ? 'Saved'
                : 'Publishing',
          );
          expect(held.batches[0].published_revision).toBe(
            boundary === 'before-pending-save'
              ? null
              : held.session.revision -
                  (boundary === 'publication-authorized' ? 1 : 0),
          );
          expect(owner.requests).toHaveLength(1);
          expect(peer.requests).toHaveLength(0);
          record({
            boundary,
            held,
            ownerRequests: owner.requests,
            body: observed.body(),
          });

          await control(owner, 'release-native');
          await observed.done;

          expect(observed.body()).toContain('RUN_FINISHED');
          expect((await state(peer)).effects).toEqual([]);
        } finally {
          observed.cancel();
          await observed.done;
        }
      },
      environment,
    );
  }, 60_000);
}

test('stale pre-reservation owner loses after real lease takeover and late release', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const initial = await start();
      script(initial);
      const input = runInput(prompt);
      const pending = await postRun(initial, input, alice);
      const callback = await decisionInput(
        initial,
        input,
        pending.events,
        'approve',
      );
      await initial.stop();
      const owner = await start({ NativeGate: 'before-decision-reservation' });
      script(owner);
      const peer = await start();
      script(peer);
      const observed = observeRun(owner, callback);
      try {
        await stage(owner, 'before-decision-reservation');
        const held = await state(peer);

        await control(peer, 'expire-native-lease');
        const completed = await postRun(peer, callback, alice);
        const winner = await state(peer);
        await control(owner, 'release-native');
        await observed.done;
        await observation(owner, (value) => value.cleanupCompleted > 0);

        expect(completed.response.status).toBe(200);
        expect(winner.members[0].admitted_generation).toBeGreaterThan(
          held.session.generation,
        );
        expect(await state(peer)).toEqual(winner);
        expect(winner.effects).toHaveLength(1);
        expect(peer.requests).toHaveLength(1);
        expect(owner.requests).toHaveLength(0);
        expect(observed.body()).not.toContain('RUN_FINISHED');
      } finally {
        observed.cancel();
        await observed.done;
      }
    },
    environment,
  );
}, 60_000);

for (const boundary of [
  'effect-persisted',
  'before-session-save',
  'after-save-before-publication',
  'before-publication-finalization',
]) {
  test(`late protected callback at ${boundary} cannot overwrite operator CAS retirement`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const first = await start();
        script(first);
        const input = runInput(prompt);
        const pending = await postRun(first, input, alice);
        const callback = await decisionInput(
          first,
          input,
          pending.events,
          'approve',
        );
        await first.stop();
        const owner = await start({ NativeGate: boundary });
        script(owner);
        const peer = await start();
        const observed = observeRun(owner, callback);
        try {
          await stage(owner, boundary);
          const inspection = await inspect(peer);

          const retired = await operate(peer, inspection.status, {
            reason:
              'Harmless paused local fixture only; tests invalidated authority before allowing the gated callback to return',
            evidenceReference: 'fixture://paused-local-callback',
          });
          const terminal = await inspect(peer);
          await control(owner, 'release-native');
          await observed.done;
          await observation(owner, (value) => value.cleanupCompleted > 0);

          expect(retired.status).toBe(200);
          expect(terminal.status.state).toBe('Retired');
          expect(terminal.audit).toHaveLength(1);
          expect(await inspect(peer)).toEqual(terminal);
          expect((await state(peer)).effects).toHaveLength(1);
          expect((await postRun(peer, callback, alice)).response.status).toBe(
            410,
          );
          expect(peer.requests).toHaveLength(0);
        } finally {
          observed.cancel();
          await observed.done;
        }
      },
      environment,
    );
  }, 60_000);
}

for (const failure of ['failed-save', 'database-outage'] as const) {
  test(`protected final ${failure} retains consumed fence and withholds terminal`, async () => {
    await withDurableCluster(
      'openai',
      async ({ start }) => {
        const initial = await start();
        script(initial);
        const input = runInput(prompt);
        const pending = await postRun(initial, input, alice);
        const callback = await decisionInput(
          initial,
          input,
          pending.events,
          'approve',
        );
        await initial.stop();
        const owner = await start({
          NativeGate: 'before-session-save',
          NativeFailSave: failure === 'failed-save' ? 'true' : 'false',
        });
        script(owner);
        const peer = await start();
        const observed = observeRun(owner, callback);
        try {
          await stage(owner, 'before-session-save');
          const held = await state(peer);

          if (failure === 'database-outage')
            await control(peer, 'native-database-unavailable?enabled=true');
          try {
            await control(owner, 'release-native');
            await observed.done;
          } finally {
            if (failure === 'database-outage')
              await control(peer, 'native-database-unavailable?enabled=false');
          }
          await control(peer, 'expire-native-lease');
          const retry = await postRun(peer, callback, alice);

          expect(retry.response.status).toBe(409);
          expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
          expect((await state(peer)).effects).toEqual(held.effects);
          expect((await state(peer)).members[0].admitted_generation).toBe(
            held.members[0].admitted_generation,
          );
          expect(owner.requests).toHaveLength(1);
          expect(peer.requests).toHaveLength(0);
        } finally {
          observed.cancel();
          await observed.done;
        }
      },
      environment,
    );
  }, 60_000);
}

/** Reads the real scoped operator inspection. */
async function inspect(fixture: DotnetFixture) {
  const response = await fetch(
    `${fixture.url}/native-sessions/alice/fixture-thread`,
    { headers: { 'X-Fixture-Principal': 'operator' } },
  );
  expect(response.status).toBe(200);
  return response.json();
}

/** Sends expected-state/generation/revision CAS to the real scoped operator endpoint. */
async function operate(
  fixture: DotnetFixture,
  status: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return fetch(`${fixture.url}/native-sessions/alice/fixture-thread/retire`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Fixture-Principal': 'operator',
    },
    body: JSON.stringify({
      expectedState: status.state,
      expectedGeneration: status.generation,
      expectedRevision: status.revision,
      externalQuiescenceAcknowledged: true,
      outcome: 'Retired',
      reason: 'Fixture worker was killed and its exit awaited',
      evidenceReference: 'fixture://observed-process-exit',
      ...extra,
    }),
  });
}

for (const provider of ['openai', 'azure'] as const)
  for (const api of ['responses', 'chat-completions'] as const) {
    test(`${provider}/${api} complete three-member native batch admits one mixed decision epoch and exact schema union`, async () => {
      await withDurableCluster(
        provider,
        async ({ start }) => {
          const owner = await start();
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
          const input = {
            ...runInput('Three protected airports'),
            tools: [browserTool],
          };
          const calls = [
            {
              id: 'multi-a',
              name: 'lookupAirport',
              arguments: { code: 'PDX' },
            },
            {
              id: 'multi-b',
              name: 'lookupAirport',
              arguments: { code: 'LAX' },
            },
            {
              id: 'multi-c',
              name: 'lookupAirport',
              arguments: { code: 'SFO' },
            },
          ];
          mixedScript(owner);
          owner.mock.onMessage('Three protected airports', {
            toolCalls: calls,
          });
          const pending = await postRun(owner, input, alice);
          const callback = await decisionInput(
            owner,
            input,
            pending.events,
            'approve',
          );
          const mixed = {
            ...callback,
            resume: callback.resume.map((entry, index) =>
              index === 0
                ? entry
                : index === 1
                  ? {
                      interruptId: entry.interruptId,
                      status: 'resolved',
                      payload: { approved: false },
                    }
                  : { interruptId: entry.interruptId, status: 'cancelled' },
            ),
          };
          const before = await state(owner);

          expect(
            (
              await postRun(
                owner,
                { ...mixed, resume: mixed.resume.slice(0, 2) },
                alice,
              )
            ).response.status,
          ).toBe(400);
          expect(
            (
              await postRun(
                owner,
                { ...mixed, resume: [...mixed.resume, mixed.resume[0]] },
                alice,
              )
            ).response.status,
          ).toBe(400);
          expect((await postRun(owner, input, alice)).response.status).toBe(
            400,
          );
          expect(await state(owner)).toEqual(before);
          await owner.stop();
          const peer = await start();
          mixedScript(peer);
          const completed = await postRun(peer, mixed, alice);
          record({
            actualResumedStatus: completed.response.status,
            actualResumedEvents: completed.events,
            actualResumedBody: completed.body,
            initialRequests: owner.requests,
            resumedRequests: peer.requests,
            diagnostics: peer.diagnostics(),
          });

          expect(completed.response.status).toBe(200);
          expect(
            completed.events.filter(
              (event) => event.type === 'TOOL_CALL_START',
            ),
          ).toHaveLength(0);
          expect(owner.requests).toHaveLength(1);
          expect(peer.requests).toHaveLength(1);
          const after = await state(peer);
          expect(
            after.members.map((member: Record<string, unknown>) => ({
              state: member.state,
              decision: member.decision,
              generation: member.admitted_generation,
              revision: member.admitted_revision,
            })),
          ).toEqual(
            ['Approved', 'Declined', 'Cancelled'].map((decision) => ({
              state: 'Settled',
              decision,
              generation: after.batches[0].admitted_generation,
              revision: after.batches[0].admitted_revision,
            })),
          );
          expect(after.effects).toEqual([
            expect.objectContaining({ call_id: 'multi-a', code: 'PDX' }),
          ]);
          expect(
            after.invocations.map((call: Record<string, unknown>) => ({
              state: call.state,
              dispatch: call.dispatch_generation,
            })),
          ).toEqual([
            {
              state: 'Completed',
              dispatch: after.batches[0].admitted_generation,
            },
            { state: 'Declined', dispatch: null },
            { state: 'Cancelled', dispatch: null },
          ]);
          for (const request of [owner.requests[0], peer.requests[0]])
            schemas(request, api, browserTool);
          nativeTranscript(peer.requests[0], api, [
            {
              id: 'multi-a',
              code: 'PDX',
              output: { code: 'PDX', name: 'Portland International Airport' },
            },
            {
              id: 'multi-b',
              code: 'LAX',
              output: 'Tool call invocation rejected.',
            },
            {
              id: 'multi-c',
              code: 'SFO',
              output: 'Tool call invocation rejected. Cancelled by caller.',
            },
          ]);
          const recoveryResponse = await fetch(
            `${peer.url}/threads/${input.threadId}/native-session`,
            {
              method: 'POST',
              headers: { ...alice, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tools: input.tools,
                forwardedProps: input.forwardedProps,
              }),
            },
          );
          expect(recoveryResponse.status).toBe(200);
          const recovery = await recoveryResponse.json();
          const next = {
            ...input,
            runId: crypto.randomUUID(),
            messages: [
              ...recovery.snapshot.messages,
              {
                id: crypto.randomUUID(),
                role: 'user',
                content: 'Hello fixture',
              },
            ],
          };
          expect((await postRun(peer, next, alice)).response.status).toBe(200);
          expect(peer.requests).toHaveLength(2);
          expect((await state(peer)).effects).toEqual(after.effects);
          record({
            initialRequests: owner.requests,
            resumedRequests: peer.requests,
            pendingEvents: pending.events,
            completedEvents: completed.events,
            rows: after,
          });
        },
        { ...environment, ModelApi: api },
      );
    }, 60_000);
  }

/** Requires each original native call and result exactly once in the first actual model continuation. */
function transcript(
  request: import('../harness/http-fixture').ModelRequest,
  api: 'responses' | 'chat-completions',
  expected: ReadonlyArray<{
    id: string;
    code: string;
    output: string | object;
  }>,
) {
  const history = request.body[
    api === 'responses' ? 'input' : 'messages'
  ] as Array<Record<string, unknown>>;
  const calls =
    api === 'responses'
      ? history
          .filter((item) => item.type === 'function_call')
          .map((item) => ({
            id: item.call_id,
            name: item.name,
            args: item.arguments,
          }))
      : history
          .flatMap(
            (item) =>
              (item.tool_calls ?? []) as Array<{
                id: string;
                function: { name: string; arguments: string };
              }>,
          )
          .map((item) => ({
            id: item.id,
            name: item.function.name,
            args: item.function.arguments,
          }));
  expect(
    calls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: JSON.parse(call.args as string),
    })),
  ).toEqual(
    expected.map((call) => ({
      id: call.id,
      name: 'lookupAirport',
      arguments: { code: call.code },
    })),
  );
  const outputs =
    api === 'responses'
      ? history
          .filter((item) => item.type === 'function_call_output')
          .map((item) => ({ id: item.call_id, output: item.output }))
      : history
          .filter((item) => item.role === 'tool')
          .map((item) => ({ id: item.tool_call_id, output: item.content }));
  expect(
    outputs.map((item, index) => ({
      id: item.id,
      output:
        typeof expected[index].output === 'string'
          ? item.output
          : JSON.parse(item.output as string),
    })),
  ).toEqual(expected.map((item) => ({ id: item.id, output: item.output })));
  expect(JSON.stringify(history)).not.toMatch(
    /toolApproval|interruptResponse|requiresConfirmation/,
  );
  if (api === 'responses') {
    expect(request.body.store).toBe(false);
    expect(request.body).not.toHaveProperty('previous_response_id');
    expect(request.body).not.toHaveProperty('conversation');
  }
}

/** Requires the exact registered server schema and original browser declaration once each, without extras. */
function schemas(
  request: import('../harness/http-fixture').ModelRequest,
  api: 'responses' | 'chat-completions',
  browser?: object,
) {
  const declarations = (request.body.tools as Array<Record<string, unknown>>)
    .map((tool) =>
      api === 'responses' ? tool : (tool.function as Record<string, unknown>),
    )
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  const server = {
    name: 'lookupAirport',
    description: 'Look up an airport by its IATA code.',
    parameters: {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string' } },
      additionalProperties: false,
    },
  };
  expect(declarations).toEqual(browser ? [server, browser] : [server]);
}

test('raw decision duplicates, casing and public call/parent/argument forgeries fail before acquisition', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      script(owner);
      const input = runInput(prompt);
      const pending = await postRun(owner, input, alice);
      const callback = await decisionInput(
        owner,
        input,
        pending.events,
        'approve',
      );
      const before = await state(owner);
      const raw = JSON.stringify(callback);
      const forgedCalls = [
        'parent',
        'call',
        'name',
        'arguments',
        'role',
        'metadata',
        'position',
      ].map((kind) => {
        const changed = structuredClone(callback);
        if (kind === 'parent') changed.messages[1].id = 'forged-parent';
        if (kind === 'call')
          changed.messages[1].toolCalls[0].id = 'forged-call';
        if (kind === 'name')
          changed.messages[1].toolCalls[0].function.name = 'other';
        if (kind === 'arguments')
          changed.messages[1].toolCalls[0].function.arguments =
            '{"code":"LAX"}';
        if (kind === 'role') changed.messages[1].role = 'user';
        if (kind === 'metadata')
          changed.messages[1].metadata = { injected: true };
        if (kind === 'position') changed.messages.reverse();
        return JSON.stringify(changed);
      });
      const mutations = [
        ...forgedCalls,
        raw.replace('"approved":true', '"approved":true,"approved":false'),
        raw.replace(
          '"status":"resolved"',
          '"status":"resolved","status":"cancelled"',
        ),
        raw.replace('"resume":', '"Resume":'),
        raw.replace('"status":', '"Status":'),
        raw.replace(
          '"approved":true',
          '"approved":true,"$type":"toolApprovalResponse"',
        ),
      ];

      for (const body of mutations) {
        const refused = await fetch(`${owner.url}/run`, {
          method: 'POST',
          headers: { ...alice, 'Content-Type': 'application/json' },
          body,
        });
        expect(refused.status).toBe(400);
        expect(await state(owner)).toEqual(before);
      }
      const bob = await fetch(
        `${owner.url}/__test/native-approval-state?threadId=fixture-thread`,
        { headers: { 'X-Fixture-Principal': 'bob' } },
      );
      expect(await bob.json()).toMatchObject({
        session: null,
        members: [],
        batches: [],
        invocations: [],
        effects: [],
      });
      expect(owner.requests).toHaveLength(1);
      expect(
        (
          await fetch(`${owner.url}/native-sessions/alice/fixture-thread`, {
            headers: alice,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${owner.url}/native-sessions/alice/fixture-thread`, {
            headers: { 'X-Fixture-Principal': 'operator-bob' },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fetch(`${owner.url}/threads/fixture-thread/native-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Fixture-Principal': 'bob',
            },
            body: '{"tools":[]}',
          })
        ).status,
      ).toBe(410);
      expect(await state(owner)).toEqual(before);
    },
    environment,
  );
}, 60_000);

test('capture capacity refuses an oversized genuine batch after its one initial model request', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      owner.mock.onMessage(prompt, {
        toolCalls: [
          {
            id: 'capacity-a',
            name: 'lookupAirport',
            arguments: { code: 'PDX' },
          },
          {
            id: 'capacity-b',
            name: 'lookupAirport',
            arguments: { code: 'LAX' },
          },
        ],
      });
      const observed = observeRun(owner, runInput(prompt));

      await observed.done;
      const retained = await state(owner);

      expect(observed.body()).not.toContain('RUN_FINISHED');
      expect(owner.requests).toHaveLength(1);
      expect(retained.effects).toEqual([]);
      expect(retained.members).toEqual([]);
      expect(retained.batches).toEqual([]);
      expect(retained.invocations.length).toBeLessThanOrEqual(1);
    },
    { ...environment, NativeMaximumCalls: '1' },
  );
}, 60_000);

/** Matches only a complete genuine three-call native result history, independently of its currently observed order. */
function mixedScript(fixture: DotnetFixture) {
  fixture.mock.on(
    {
      predicate: (request) => {
        const results = request.messages.filter(
          (message) => message.role === 'tool',
        );
        return (
          request.messages.at(-1)?.role === 'tool' &&
          results.length === 3 &&
          results
            .map((message) => message.tool_call_id)
            .sort()
            .join(',') === 'multi-a,multi-b,multi-c'
        );
      },
    },
    { content: 'Mixed native complete' },
  );
}

test('unpublished genuine capture with failed initial save is blocked rather than virgin retryable', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start({
        NativeGate: 'before-pending-save',
        NativeFailSave: 'true',
      });
      script(owner);
      const peer = await start();
      const input = runInput(prompt);
      const observed = observeRun(owner, input);
      try {
        await stage(owner, 'before-pending-save');
        const held = await state(peer);
        expect(held.batches[0]).toMatchObject({
          state: 'Pending',
          published_revision: null,
          admitted_generation: null,
        });

        await control(owner, 'release-native');
        await observed.done;
        await observation(owner, (value) => value.cleanupCompleted > 0);
        const blocked = await state(peer);
        const retry = await postRun(peer, input, alice);

        expect(observed.body()).not.toMatch(/RUN_FINISHED|RUN_ERROR/);
        expect(blocked.session.state).toBe('Blocked');
        expect(blocked.members[0].admitted_generation).toBeNull();
        expect(retry.response.status).toBe(409);
        expect(peer.requests).toHaveLength(0);
        expect(owner.requests).toHaveLength(1);
        expect(blocked.effects).toEqual([]);
        await control(peer, 'expire-native-payload');
        await control(peer, 'maintain-native');
        const purged = await state(peer);
        await control(peer, 'maintain-native');
        expect(await state(peer)).toEqual(purged);
        expect(purged.session).toMatchObject({
          state: 'Blocked',
          payloadNull: true,
        });
        expect(purged.members[0]).toMatchObject({
          state: 'Retired',
          decision: null,
          privateDescriptorNull: true,
        });
      } finally {
        observed.cancel();
        await observed.done;
      }
    },
    environment,
  );
}, 60_000);

test('published unconsumed pending expiry retains IDs and exposes no executable resurrection', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      script(owner);
      const input = runInput(prompt);
      const pending = await postRun(owner, input, alice);
      const callback = await decisionInput(
        owner,
        input,
        pending.events,
        'approve',
      );
      const retained = await state(owner);

      await control(owner, 'expire-native-payload');
      await control(owner, 'maintain-native');
      const purged = await state(owner);
      await control(owner, 'maintain-native');

      expect(await state(owner)).toEqual(purged);
      expect(purged.session).toMatchObject({
        state: 'Retired',
        payloadNull: true,
      });
      expect(purged.members[0]).toMatchObject({
        request_id: retained.members[0].request_id,
        call_id: retained.members[0].call_id,
        decision: null,
        state: 'Retired',
        privateDescriptorNull: true,
      });
      expect(purged.effects).toEqual([]);
      expect((await postRun(owner, callback, alice)).response.status).toBe(410);
      expect(owner.requests).toHaveLength(1);
    },
    environment,
  );
}, 60_000);

test('duplicate simultaneous genuine resume loses before model while the admitted owner completes once', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const first = await start();
      script(first);
      const input = runInput(prompt);
      const pending = await postRun(first, input, alice);
      const callback = await decisionInput(
        first,
        input,
        pending.events,
        'approve',
      );
      await first.stop();
      const owner = await start({ NativeGate: 'decision-admitted' });
      script(owner);
      const peer = await start();
      const observed = observeRun(owner, callback);
      try {
        await stage(owner, 'decision-admitted');
        const held = await state(peer);

        expect((await postRun(peer, callback, alice)).response.status).toBe(
          409,
        );
        expect(await state(peer)).toEqual(held);
        await control(owner, 'release-native');
        await observed.done;

        expect((await state(peer)).effects).toHaveLength(1);
        expect(owner.requests).toHaveLength(1);
        expect(peer.requests).toHaveLength(0);
      } finally {
        observed.cancel();
        await observed.done;
      }
    },
    environment,
  );
}, 60_000);

/** Checks exact call/result pairs by owned ID while retaining genuine native loop grouping. */
function nativeTranscript(
  request: import('../harness/http-fixture').ModelRequest,
  api: 'responses' | 'chat-completions',
  expected: ReadonlyArray<{
    id: string;
    code: string;
    output: string | object;
  }>,
) {
  const history = request.body[
    api === 'responses' ? 'input' : 'messages'
  ] as Array<Record<string, unknown>>;
  const ids =
    api === 'responses'
      ? history
          .filter((item) => item.type === 'function_call')
          .map((item) => item.call_id as string)
      : history
          .flatMap((item) => (item.tool_calls ?? []) as Array<{ id: string }>)
          .map((item) => item.id);
  expect([...ids].sort()).toEqual(expected.map((item) => item.id).sort());
  const ordered = ids.map((id) => {
    const owned = expected.find((item) => item.id === id);
    if (!owned) throw new Error(`Unexpected native call identity: ${id}`);
    return owned;
  });
  transcript(request, api, ordered);
  record({
    nativeCallOrder: ids,
    ownedPublicOrder: expected.map((item) => item.id),
    request,
  });
}

test('expired protected Publishing remains unknown through maintenance until scoped retirement after process exit', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const first = await start();
      script(first);
      const input = runInput(prompt);
      const pending = await postRun(first, input, alice);
      const callback = await decisionInput(
        first,
        input,
        pending.events,
        'approve',
      );
      await first.stop();
      const owner = await start({ NativeGate: 'publication-authorized' });
      script(owner);
      const peer = await start();
      const observed = observeRun(owner, callback);
      try {
        await stage(owner, 'publication-authorized');
        const held = await state(peer);

        await owner.stop();
        await observed.done;
        await control(peer, 'expire-native-payload');
        await control(peer, 'maintain-native');
        const unknown = await state(peer);
        await control(peer, 'maintain-native');

        expect(await state(peer)).toEqual(unknown);
        expect(unknown.session).toMatchObject({
          state: 'PublicationUnknown',
          payloadNull: true,
        });
        expect(unknown.members[0]).toMatchObject({
          state: 'Retired',
          decision: 'Approved',
          admitted_generation: held.members[0].admitted_generation,
          privateDescriptorNull: true,
        });
        expect(unknown.invocations[0]).toMatchObject({
          state: 'Completed',
          dispatch_generation: held.invocations[0].dispatch_generation,
          descriptorNull: true,
        });
        expect(unknown.effects).toEqual(held.effects);
        expect((await postRun(peer, callback, alice)).response.status).toBe(
          409,
        );
        const current = await inspect(peer);
        expect((await operate(peer, current.status)).status).toBe(200);
        expect((await postRun(peer, callback, alice)).response.status).toBe(
          410,
        );
        expect(peer.requests).toHaveLength(0);
      } finally {
        observed.cancel();
        await observed.done;
      }
    },
    environment,
  );
}, 60_000);

test('retained completed protected call consumes capture capacity on a later genuine model turn', async () => {
  await withDurableCluster(
    'openai',
    async ({ start }) => {
      const owner = await start();
      script(owner);
      const input = runInput(prompt);
      const pending = await postRun(owner, input, alice);
      const callback = await decisionInput(
        owner,
        input,
        pending.events,
        'approve',
      );
      await postRun(owner, callback, alice);
      const before = await state(owner);
      const recoveredResponse = await fetch(
        `${owner.url}/threads/fixture-thread/native-session`,
        {
          method: 'POST',
          headers: { ...alice, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tools: [], forwardedProps: {} }),
        },
      );
      expect(recoveredResponse.status).toBe(200);
      const recovered = await recoveredResponse.json();
      owner.mock.onMessage('Another protected airport', {
        toolCalls: [
          {
            id: 'capacity-later',
            name: 'lookupAirport',
            arguments: { code: 'LAX' },
          },
        ],
      });
      const observed = observeRun(owner, {
        ...input,
        runId: crypto.randomUUID(),
        messages: [
          ...recovered.snapshot.messages,
          {
            id: 'later-user',
            role: 'user',
            content: 'Another protected airport',
          },
        ],
      });

      await observed.done;
      const after = await state(owner);

      expect(observed.body()).not.toContain('RUN_FINISHED');
      expect(owner.requests).toHaveLength(3);
      expect(after.invocations).toEqual(before.invocations);
      expect(after.effects).toEqual(before.effects);
      expect(after.members).toEqual(before.members);
    },
    { ...environment, NativeMaximumCalls: '1' },
  );
}, 60_000);
