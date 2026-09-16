import { expect, test } from 'vitest';
import { assistantResponseSchema } from '@invoicing/contracts';
import { createSessionStore } from './session-store';
import { createAssistantMiddleware } from './assistant-middleware';

function setup() {
  const store = createSessionStore();
  const session = store.createSession();
  const middleware = createAssistantMiddleware(store);
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
  return { store, session, middleware, request };
}

test('allows questions without selection and only supplies read-only capabilities', () => {
  const { middleware, request } = setup();

  const result = middleware(request);

  expect(result.action).toBe('continue');
  if (result.action !== 'continue') throw new Error('expected continue');
  expect(result.context.readLedger({}).unappliedPayments).toHaveLength(1);
  expect(Object.keys(result.context).sort()).toEqual([
    'readLedger',
    'responseSchema',
    'validatePayment',
  ]);
});

test('rejects missing sessions, wrong schema, resume grants, and foreign conversations', () => {
  const { store, middleware, request } = setup();
  middleware(request);
  const foreign = store.createSession();

  expect(middleware({ ...request, headers: {} }).action).toBe('reject');
  expect(
    middleware({ ...request, body: { ...request.body, hashbrown: {} } }).action,
  ).toBe('reject');
  expect(
    middleware({
      ...request,
      body: { ...request.body, resume: [{ payload: 'once' }] },
    }).action,
  ).toBe('reject');
  expect(
    middleware({
      ...request,
      headers: { cookie: `invoicing_session=${foreign}` },
    }).action,
  ).toBe('reject');
});

test('read capabilities expire on reset and suggestions cannot reference nonexistent payments', () => {
  const { store, session, middleware, request } = setup();
  const result = middleware(request);
  if (result.action !== 'continue') throw new Error('expected continue');

  expect(() => result.context.validatePayment('unknown')).toThrow(
    'payment_not_found',
  );
  store.reset(session);

  expect(() => result.context.readLedger({})).toThrow('stale_generation');
});

test('conversation totals are computed by month and currency instead of inferred by the model', () => {
  const store = createSessionStore(() => ({
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
  const session = store.createSession();
  const result = createAssistantMiddleware(store)({
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

  const context = result.context.readLedger({});

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
