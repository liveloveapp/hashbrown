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
      // The client always sends JSON, so pin wire behavior here too.
      hashbrown: {
        ui: true,
        responseSchema: JSON.parse(JSON.stringify(assistantResponseSchema)),
      },
    },
  };
  return { store, session, middleware, claimThread, request };
}

test('allows questions without selection and only supplies read-only capabilities', async () => {
  const { middleware, request } = await setup();

  const result = await middleware(request);

  expect(result.action).toBe('continue');
  if (result.action !== 'continue') throw new Error('expected continue');
  expect((await result.context.unappliedPayments({})).payments).toHaveLength(1);
  expect(Object.keys(result.context).sort()).toEqual([
    'aging',
    'customerStatement',
    'findRecords',
    'ledgerSummary',
    'monthlyTotals',
    // Not a capability: the marker `after` reads to learn whether this run
    // validated UI. `assistantTools` never exposes it to the model.
    'rendered',
    'responseSchema',
    'unappliedPayments',
    'validateUi',
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

  await expect(
    result.context.validateUi({
      text: 'x',
      components: [{ ReviewPayment: { paymentId: 'unknown' } }],
    }),
  ).rejects.toThrow('unknown payment unknown');
  await store.reset(session);

  await expect(result.context.ledgerSummary()).rejects.toThrow(
    'stale_generation',
  );
  await expect(result.context.validateUi({ text: 'hi' })).rejects.toThrow(
    'stale_generation',
  );
});

test('conversation totals are computed by month and currency instead of inferred by the model', async () => {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, {
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
    customers: [{ id: 'c', name: 'C', currency: 'USD', profile: 'on-time' }],
    allocations: [],
    activities: [],
  });
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
      // The client always sends JSON, so pin wire behavior here too.
      hashbrown: {
        ui: true,
        responseSchema: JSON.parse(JSON.stringify(assistantResponseSchema)),
      },
    },
  });
  if (result.action !== 'continue') throw new Error('expected continue');

  const rows = (await result.context.monthlyTotals({ currency: 'USD' })).rows;
  const summary = await result.context.ledgerSummary();

  expect(rows.at(-1)).toEqual({
    month: '2026-09',
    invoicedCents: 0,
    invoiced: '$0.00',
    receivedCents: 0,
    received: '$0.00',
  });
  expect(rows.find((r) => r.month === '2026-01')).toEqual({
    month: '2026-01',
    invoicedCents: 25000,
    invoiced: '$250.00',
    receivedCents: 15000,
    received: '$150.00',
  });
  expect(rows).toHaveLength(12);
  expect(summary.currencies).toEqual([
    expect.objectContaining({
      currency: 'USD',
      invoicedCents: 25000,
      receivedCents: 15000,
      unappliedCents: 15000,
      openCents: 25000,
    }),
  ]);
});
