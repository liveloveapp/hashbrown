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
  const records = await result.context.readPayment();
  expect(records.payment.id).toBe('payment-001');
  expect(records.invoices.map((invoice) => invoice.id)).toEqual([
    'invoice-001',
  ]);
  const proposal = await result.context.prepareAllocation({
    invoiceIds: ['invoice-001'],
  });
  expect(proposal.amountCents).toBe(240000);
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

test('middleware tools ignore extra amounts and invalidate reads after reset', async () => {
  const { store, owner, middleware, request } = await setup();
  const result = await middleware(request);
  if (result.action !== 'continue') throw new Error('Expected trusted tools');
  const candidate = {
    invoiceIds: ['invoice-001'],
    amountCents: 1,
    paymentId: 'foreign',
  };

  const proposal = await result.context.prepareAllocation(candidate);
  await store.reset(owner);

  expect(proposal.amountCents).toBe(240000);
  expect(proposal.paymentId).toBe('payment-001');
  await expect(result.context.readPayment()).rejects.toThrow(
    'stale_generation',
  );
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
    invoices: ['i1', 'i2'].map((id) => ({
      id,
      customerId: 'c',
      currency: 'USD',
      amountCents: 10000,
      version: 1,
    })),
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

test('an ambiguous payment requires a chosen invoice and cannot substitute another invoice', async () => {
  const { store, session, request } = await twoInvoices();
  const ambiguous = await request('ambiguous');
  const chosen = await request('chosen', ['i2']);

  await expect(
    ambiguous.prepareAllocation({ invoiceIds: ['i1'] }),
  ).rejects.toThrow('invoice_choice_required');
  await expect(
    ambiguous.prepareAllocation({ invoiceIds: ['i1', 'i2'] }),
  ).rejects.toThrow('invoice_choice_required');
  await expect(
    chosen.prepareAllocation({ invoiceIds: ['i1'] }),
  ).rejects.toThrow('invoice_binding_conflict');
  const proposal = await chosen.prepareAllocation({ invoiceIds: ['i2'] });

  expect(proposal.lines.map((line) => line.invoiceId)).toEqual(['i2']);
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});

test('a review bound to several invoices fills them in order from the payment', async () => {
  const { store, session, request } = await twoInvoices();
  const combined = await request('combined', ['i2', 'i1']);

  const read = await combined.readPayment();
  const reordered = combined.prepareAllocation({ invoiceIds: ['i1', 'i2'] });
  const proposal = await combined.prepareAllocation({
    invoiceIds: ['i2', 'i1'],
  });

  expect(read.selectedInvoiceIds).toEqual(['i2', 'i1']);
  await expect(reordered).rejects.toThrow('invoice_binding_conflict');
  expect(proposal.lines).toEqual([
    { invoiceId: 'i2', amountCents: 10000, expectedInvoiceVersion: 1 },
    { invoiceId: 'i1', amountCents: 5000, expectedInvoiceVersion: 1 },
  ]);
  expect(proposal.amountCents).toBe(15000);
  expect((await store.snapshot(session)).allocations).toHaveLength(0);
});
