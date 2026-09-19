import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import type { MiddlewareRequest } from '@b4run/sdk';
import { assistantResponseSchema } from '@invoicing/contracts';
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
      hashbrown: { ui: true, responseSchema: assistantResponseSchema },
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

  await expect(middleware(request)).rejects.toThrow('boom');
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

  await expect(middleware(request)).resolves.toEqual({
    action: 'reject',
    status: 422,
    body: { error: 'invalid_thread' },
  });
});
