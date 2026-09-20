import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
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
): MiddlewareAfterRun => ({
  assistantId: `${routeId}#agent`,
  context,
  finalMessage: '{"ui":[]}',
  messages: [{ role: 'user', content: 'Which GBP client owes the most?' }],
  routeId,
  runId: 'turn',
  threadId: 'conversation',
});

test('a run that rendered UI closes with no assistant message of its own', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();
  await context.validateUi({ text: 'Thistle owes the most.', components: [] });

  expect(middleware.after(afterRun('/assistant', context))).toEqual({
    finalMessage: '',
  });
});

test('a run that never rendered UI fails so the client shows its alert', async () => {
  const { middleware } = await setup(async () => undefined);
  const context = await assistantContextForRun();

  expect(middleware.after(afterRun('/assistant', context))).toEqual({
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

  expect(middleware.after(afterRun('/assistant', context))).toMatchObject({
    action: 'reject',
  });
});

test('the review route keeps the final message it streamed', async () => {
  const { middleware } = await setup(async () => undefined);

  expect(middleware.after(afterRun('/review', undefined))).toBeUndefined();
});
