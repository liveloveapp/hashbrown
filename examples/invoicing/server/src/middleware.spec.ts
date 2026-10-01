import { randomUUID } from 'node:crypto';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import type { MiddlewareAfterRun, MiddlewareRequest } from '@b4run/sdk';
import { assistantResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from './assistant-middleware';
import { createMemoryRepositories } from './persistence/memory';
import type { Document, ThreadRecord } from './persistence/types';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./persistence/from-env');
});

/**
 * Load the file-convention middleware against memory repositories whose thread
 * reads are scripted: the first read serves the route middleware, later reads
 * serve the ownership guard.
 */
async function setup(
  laterLoads: () => Promise<Document<ThreadRecord> | undefined>,
) {
  const repositories = createMemoryRepositories();
  const load = repositories.threads.load.bind(repositories.threads);
  let reads = 0;
  vi.spyOn(repositories.threads, 'load').mockImplementation(async (threadId) =>
    ++reads === 1 ? load(threadId) : laterLoads(),
  );
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const session = await store.createSession();
  vi.resetModules();
  vi.doMock('./persistence/from-env', () => ({
    repositoriesFromEnv: async () => repositories,
  }));
  const middleware = (await import('./middleware')).default;
  const request: MiddlewareRequest = {
    method: 'POST',
    routeId: '/assistant',
    headers: { cookie: `invoicing_session=${session}` },
    body: {
      threadId: 'conversation',
      runId: 'turn',
      state: {},
      // The client always sends JSON, so pin wire behavior here too.
      hashbrown: {
        ui: true,
        responseSchema: JSON.parse(JSON.stringify(assistantResponseSchema)),
      },
    },
    params: {},
    url: '/agui/%2Fassistant%23agent',
    assistantId: '/assistant#agent',
  };
  return { middleware, request, session };
}

test('a repository failure while claiming the thread is not reported as a client error', async () => {
  const { middleware, request } = await setup(() => {
    throw new Error('boom');
  });

  await expect(middleware.handle(request)).rejects.toThrow('boom');
});

test('a thread already bound to another session is rejected as an invalid thread', async () => {
  const { middleware, request } = await setup(async () => ({
    version: 0,
    value: {
      sessionId: randomUUID(),
      routeId: '/assistant',
      generation: 0,
      tokens: {},
    },
  }));

  await expect(middleware.handle(request)).resolves.toEqual({
    action: 'reject',
    status: 422,
    body: { error: 'invalid_thread' },
  });
});

/**
 * The context an allowed `/assistant` request carries, built the way `handle`
 * builds it, so `after` is exercised against the real marker rather than a
 * hand-written stand-in.
 */
async function assistantContextForRun() {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const session = await store.createSession();
  const assistant = createAssistantMiddleware(store, repositories.threads);
  const result = await assistant({
    method: 'POST',
    routeId: '/assistant',
    headers: { cookie: `invoicing_session=${session}` },
    body: {
      threadId: 'conversation',
      runId: 'turn',
      state: {},
      hashbrown: { ui: true, responseSchema: assistantResponseSchema },
    },
  });
  if (result.action !== 'continue') throw new Error('expected continue');
  return result.context;
}

const afterRun = (
  routeId: string,
  context: Readonly<Record<string, unknown>> | undefined,
  finalMessage = '{"ui":[]}',
): MiddlewareAfterRun => ({
  assistantId: `${routeId}#agent`,
  context,
  finalMessage,
  messages: [{ role: 'user', content: 'Which GBP client owes the most?' }],
  routeId,
  runId: 'turn',
  threadId: 'conversation',
});

test('a run that rendered UI closes with no assistant message of its own', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();
  await context.validateUi({ text: 'Thistle owes the most.', components: [] });

  expect(await middleware.after(afterRun('/assistant', context))).toEqual({
    finalMessage: '',
  });
});

test('a run that never rendered UI fails so the client shows its alert', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();

  expect(await middleware.after(afterRun('/assistant', context))).toEqual({
    action: 'reject',
    status: 502,
    body: { error: 'no_answer' },
  });
});

test('a render the ledger rejected leaves the run without an answer', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();
  await expect(
    context.validateUi({
      text: 'x',
      components: [{ CustomerCard: { customerId: 'nobody' } }],
    }),
  ).rejects.toThrow(/invalid_ui/);

  expect(await middleware.after(afterRun('/assistant', context))).toMatchObject(
    {
      action: 'reject',
    },
  );
});

/**
 * What gpt-5-mini sent on 2026-10-01 for a follow-up question it could answer
 * from the earlier turn's tool results: the production response schema,
 * written as its final message instead of a `render` call.
 */
const structuredAnswer = (children: readonly unknown[]) =>
  JSON.stringify({
    ui: [
      {
        AssistantText: {
          props: {
            text: 'Clients that pay late: Juniper Studio (late-drifting), Pioneer Robotics (late-fixed), and Thistle Retail (late-drifting).',
          },
          children,
        },
      },
    ],
  });

test('an answer given as the final message instead of a render call is validated and kept', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();
  const finalMessage = structuredAnswer([
    { CustomerCard: { props: { customerId: 'juniper' } } },
  ]);

  const result = await middleware.after(
    afterRun('/assistant', context, finalMessage),
  );

  expect(result).toEqual({
    finalMessage: JSON.stringify({
      ui: [
        {
          AssistantText: {
            props: {
              text: 'Clients that pay late: Juniper Studio (late-drifting), Pioneer Robotics (late-fixed), and Thistle Retail (late-drifting).',
            },
            children: [{ CustomerCard: { props: { customerId: 'juniper' } } }],
          },
        },
      ],
    }),
  });
});

test('a final-message answer naming a record the ledger lacks still fails', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();
  const finalMessage = structuredAnswer([
    { CustomerCard: { props: { customerId: 'nobody' } } },
  ]);

  const result = await middleware.after(
    afterRun('/assistant', context, finalMessage),
  );

  expect(result).toEqual({
    action: 'reject',
    status: 502,
    body: { error: 'no_answer' },
  });
});

test('a final message that is not the response schema still fails', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();

  const result = await middleware.after(
    afterRun('/assistant', context, 'Juniper Studio pays late.'),
  );

  expect(result).toEqual({
    action: 'reject',
    status: 502,
    body: { error: 'no_answer' },
  });
});

test('the review route keeps the final message it streamed', async () => {
  const { middleware } = await setup(async () => undefined);

  expect(
    await middleware.after(afterRun('/review', undefined)),
  ).toBeUndefined();
});

test('an allowed run is timed: each tool call and the run total are logged', async () => {
  const { middleware, request } = await setup(async () => undefined);
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  onTestFinished(() => info.mockRestore());
  const result = await middleware.handle(request);
  if (result.action !== 'continue') throw new Error('expected continue');
  const context = result.context as Record<string, unknown> & {
    readonly ledgerSummary: () => Promise<unknown>;
    readonly validateUi: (input: unknown) => Promise<unknown>;
  };

  await context.ledgerSummary();
  await context.validateUi({ text: 'Five payments.', components: [] });
  await middleware.after(afterRun('/assistant', context));

  const lines = info.mock.calls.map(([line]) => JSON.parse(String(line)));
  expect(lines).toEqual([
    expect.objectContaining({
      event: 'invoicing.run.step',
      route: '/assistant',
      runId: 'turn',
      step: 'ledgerSummary',
      ok: true,
    }),
    expect.objectContaining({ step: 'validateUi', ok: true }),
    expect.objectContaining({
      event: 'invoicing.run.done',
      route: '/assistant',
      runId: 'turn',
    }),
  ]);
});
