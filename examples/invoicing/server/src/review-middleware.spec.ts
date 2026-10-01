import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createMemoryRepositories } from './persistence/memory';

const body = {
  threadId: 'review-1',
  runId: 'run-1',
  state: { selectedPaymentId: 'payment-001' },
  hashbrown: { ui: true, responseSchema: {} },
};
async function setup() {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const owner = await store.createSession();
  const reviews = createReviewCoordinator(store, repositories.threads, {});
  const middleware = createReviewMiddleware(store, reviews);
  const request = {
    headers: { cookie: `invoicing_session=${owner}` },
    method: 'POST',
    routeId: '/review',
    body,
  };
  return { store, owner, reviews, middleware, request };
}

test('middleware supplies server-owned payment tools without financial writes', async () => {
  const { store, owner, middleware, request } = await setup();

  const result = await middleware(request);

  expect(result.action).toBe('continue');
  if (result.action !== 'continue') throw new Error('Expected trusted tools');
  const proposal = await result.context.prepareAllocation();
  expect(proposal.paymentId).toBe('payment-001');
  expect(proposal.lines.map((line) => line.invoiceId)).toEqual(['invoice-001']);
  expect(proposal.amountCents).toBe(240000);
  expect(Object.keys(result.context).sort()).toEqual([
    'applyAllocation',
    'prepareAllocation',
  ]);
  await expect(
    result.context.applyAllocation({ proposalId: proposal.proposalId }),
  ).rejects.toThrow('approval_required');
  expect((await store.snapshot(owner)).allocations).toHaveLength(0);
});

test('middleware rejects absent, unknown, duplicate, and foreign cookie sessions', async () => {
  const { store, middleware, request } = await setup();
  await middleware(request);
  const other = await store.createSession();

  const absent = await middleware({ ...request, headers: {} });
  const unknown = await middleware({
    ...request,
    headers: {
      cookie: 'invoicing_session=00000000-0000-0000-0000-000000000000',
    },
  });
  const duplicate = await middleware({
    ...request,
    headers: { cookie: `${request.headers.cookie}; ${request.headers.cookie}` },
  });
  const foreign = await middleware({
    ...request,
    headers: { cookie: `invoicing_session=${other}` },
  });

  expect(absent).toMatchObject({ action: 'reject', status: 401 });
  expect(unknown).toMatchObject({ action: 'reject', status: 401 });
  expect(duplicate).toMatchObject({ action: 'reject', status: 401 });
  expect(foreign).toMatchObject({ action: 'reject', status: 422 });
});

test('middleware validates the route and schema before exposing tools', async () => {
  const { middleware, request } = await setup();

  expect(await middleware({ ...request, method: 'GET' })).toMatchObject({
    action: 'reject',
  });
  expect(await middleware({ ...request, routeId: '/other' })).toMatchObject({
    action: 'reject',
  });
  expect(
    await middleware({ ...request, body: { ...body, hashbrown: {} } }),
  ).toMatchObject({ action: 'reject', status: 422 });
});

test('preparing takes nothing from the model, and stops after a reset', async () => {
  const { store, owner, middleware, request } = await setup();
  const result = await middleware(request);
  if (result.action !== 'continue') throw new Error('Expected trusted tools');
  const prepare = result.context.prepareAllocation as (
    input?: unknown,
  ) => Promise<{ readonly amountCents: number; readonly paymentId: string }>;

  const proposal = await prepare({
    invoiceIds: ['foreign'],
    amountCents: 1,
    paymentId: 'foreign',
  });
  await store.reset(owner);
  const stale = await prepare().catch((error: Error) => error);

  expect(proposal.amountCents).toBe(240000);
  expect(proposal.paymentId).toBe('payment-001');
  expect(stale).toBeInstanceOf(Error);
  expect((stale as Error).message).toBe('stale_generation');
});

/** A $150 payment against two open $100 invoices for the same client. */
async function twoInvoices() {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions, {
    payments: [
      {
        id: 'p',
        customerId: 'c',
        currency: 'USD',
        amountCents: 15000,
        version: 1,
      },
    ],
    invoices: [
      ...['i1', 'i2'].map((id) => ({
        id,
        customerId: 'c',
        currency: 'USD',
        amountCents: 10000,
        version: 1,
      })),
      // Open, but another customer's: never part of this payment's review.
      {
        id: 'other',
        customerId: 'd',
        currency: 'USD',
        amountCents: 10000,
        version: 1,
      },
    ],
    customers: [],
    allocations: [],
    activities: [],
  });
  const session = await store.createSession();
  const schema = { type: 'object' };
  const middleware = createReviewMiddleware(
    store,
    createReviewCoordinator(store, repositories.threads, schema),
  );
  const request = async (threadId: string, selectedInvoiceIds?: string[]) => {
    const result = await middleware({
      method: 'POST',
      routeId: '/review',
      headers: { cookie: `invoicing_session=${session}` },
      body: {
        threadId,
        runId: 'run',
        state: {
          selectedPaymentId: 'p',
          ...(selectedInvoiceIds ? { selectedInvoiceIds } : {}),
        },
        hashbrown: { ui: true, responseSchema: schema },
      },
    });
    if (result.action !== 'continue') throw new Error('expected continue');
    return result.context;
  };
  return { store, session, request };
}

test("an ambiguous payment needs the user's choice; a chosen invoice is the one prepared", async () => {
  const { store, session, request } = await twoInvoices();
  const ambiguous = await request('ambiguous');
  const chosen = await request('chosen', ['i2']);

  const refused = await ambiguous
    .prepareAllocation()
    .catch((error: Error) => error);
  const proposal = await chosen.prepareAllocation();

  expect((refused as Error).message).toBe('invoice_choice_required');
  expect(proposal.lines.map((line) => line.invoiceId)).toEqual(['i2']);
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test('a review bound to several invoices fills them in order from the payment', async () => {
  const { store, session, request } = await twoInvoices();
  const combined = await request('combined', ['i2', 'i1']);

  const proposal = await combined.prepareAllocation();

  expect(proposal.lines).toEqual([
    { invoiceId: 'i2', amountCents: 10000, expectedInvoiceVersion: 1 },
    { invoiceId: 'i1', amountCents: 5000, expectedInvoiceVersion: 1 },
  ]);
  expect(proposal.amountCents).toBe(15000);
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test("an invoice of another customer's is not found, and nothing is prepared", async () => {
  const { store, session, request } = await twoInvoices();
  const foreign = await request('foreign', ['i1', 'other']);

  const refused = await foreign
    .prepareAllocation()
    .catch((error: Error) => error);

  expect((refused as Error).message).toBe('invoice_not_found');
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});
