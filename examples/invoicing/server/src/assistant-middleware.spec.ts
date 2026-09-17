import { expect, test } from 'vitest';
import { assistantResponseSchema } from '@invoicing/contracts';
import { createSessionStore } from './session-store';
import { createAssistantMiddleware } from './assistant-middleware';
import { createMemoryRepositories } from './persistence/memory';
import { createThreadOwnershipGuard } from './thread-ownership';

async function setup() {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const session = await store.createSession();
  const middleware = createAssistantMiddleware(store, repositories.threads);
  const claimThread = createThreadOwnershipGuard(store, repositories.threads);
  const request = {
    method: 'POST',
    routeId: '/assistant',
    headers: { cookie: `invoicing_session=${session}` },
    body: {
      threadId: 'conversation',
      runId: 'turn',
      state: {},
      hashbrown: { ui: true, responseSchema: assistantResponseSchema },
    },
  };
  return { store, session, middleware, claimThread, request };
}

test('allows questions without selection and only supplies read-only capabilities', async () => {
  const { middleware, request } = await setup();

  const result = await middleware(request);

  expect(result.action).toBe('continue');
  if (result.action !== 'continue') throw new Error('expected continue');
  expect((await result.context.readLedger({})).unappliedPayments).toHaveLength(
    1,
  );
  expect(Object.keys(result.context).sort()).toEqual([
    'readLedger',
    'responseSchema',
    'validatePayment',
  ]);
});

test('rejects missing sessions, wrong schema, resume grants, and foreign conversations', async () => {
  const { store, middleware, claimThread, request } = await setup();
  await middleware(request);
  // The runtime claims thread ownership after the middleware admits a run.
  await claimThread(request.headers, '/assistant', request.body);
  const foreign = await store.createSession();

  expect((await middleware({ ...request, headers: {} })).action).toBe('reject');
  expect(
    (await middleware({ ...request, body: { ...request.body, hashbrown: {} } }))
      .action,
  ).toBe('reject');
  expect(
    (
      await middleware({
        ...request,
        body: { ...request.body, resume: [{ payload: 'once' }] },
      })
    ).action,
  ).toBe('reject');
  expect(
    (
      await middleware({
        ...request,
        headers: { cookie: `invoicing_session=${foreign}` },
      })
    ).action,
  ).toBe('reject');
});

test('read capabilities expire on reset and suggestions cannot reference nonexistent payments', async () => {
  const { store, session, middleware, request } = await setup();
  const result = await middleware(request);
  if (result.action !== 'continue') throw new Error('expected continue');

  await expect(result.context.validatePayment('unknown')).rejects.toThrow(
    'payment_not_found',
  );
  await store.reset(session);

  await expect(result.context.readLedger({})).rejects.toThrow(
    'stale_generation',
  );
});

test('conversation totals are computed by month and currency instead of inferred by the model', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, () => ({
    payments: [
      {
        id: 'p',
        customerId: 'c',
        currency: 'USD',
        amountCents: 15000,
        date: '2026-01-12',
        version: 1,
      },
    ],
    invoices: [
      {
        id: 'i',
        customerId: 'c',
        currency: 'USD',
        amountCents: 25000,
        date: '2026-01-02',
        version: 1,
      },
    ],
    allocations: [],
    activities: [],
  }));
  const session = await store.createSession();
  const result = await createAssistantMiddleware(
    store,
    repositories.threads,
  )({
    method: 'POST',
    routeId: '/assistant',
    headers: { cookie: `invoicing_session=${session}` },
    body: {
      threadId: 'month',
      runId: 'run',
      state: {},
      hashbrown: { ui: true, responseSchema: assistantResponseSchema },
    },
  });
  if (result.action !== 'continue') throw new Error('expected continue');

  const context = await result.context.readLedger({});

  expect(context.monthlyTotals).toEqual([
    {
      month: '2026-01',
      currency: 'USD',
      receivedCents: 15000,
      invoicedCents: 25000,
    },
  ]);
  expect(context.totals).toEqual([
    {
      currency: 'USD',
      receivedCents: 15000,
      invoicedCents: 25000,
      unappliedCents: 15000,
      outstandingCents: 25000,
    },
  ]);
});
