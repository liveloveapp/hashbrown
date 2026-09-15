import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';

const body = {
  threadId: 'review-1',
  runId: 'run-1',
  state: { selectedPaymentId: 'payment-001' },
  hashbrown: { ui: true, responseSchema: {} },
};
function setup() {
  const store = createSessionStore();
  const owner = store.createSession();
  const reviews = createReviewCoordinator(store, {});
  const middleware = createReviewMiddleware(store, reviews);
  const request = {
    headers: { cookie: `invoicing_session=${owner}` },
    method: 'POST',
    routeId: '/review',
    body,
  };
  return { store, owner, reviews, middleware, request };
}

test('middleware supplies server-owned payment tools without financial writes', () => {
  const { store, owner, middleware, request } = setup();

  const result = middleware(request);

  expect(result.action).toBe('continue');
  if (result.action !== 'continue') throw new Error('Expected trusted tools');
  const records = result.context.readPayment();
  expect(records.payment.id).toBe('payment-001');
  expect(records.invoices.map((invoice) => invoice.id)).toEqual([
    'invoice-001',
  ]);
  const proposal = result.context.prepareAllocation({
    invoiceId: 'invoice-001',
  });
  expect(proposal.amountCents).toBe(240000);
  expect(() =>
    result.context.applyAllocation({ proposalId: proposal.proposalId }),
  ).toThrow('approval_required');
  expect(store.snapshot(owner).allocations).toHaveLength(0);
});

test('middleware rejects absent, unknown, duplicate, and foreign cookie sessions', () => {
  const { store, middleware, request } = setup();
  middleware(request);
  const other = store.createSession();

  const absent = middleware({ ...request, headers: {} });
  const unknown = middleware({
    ...request,
    headers: {
      cookie: 'invoicing_session=00000000-0000-0000-0000-000000000000',
    },
  });
  const duplicate = middleware({
    ...request,
    headers: { cookie: `${request.headers.cookie}; ${request.headers.cookie}` },
  });
  const foreign = middleware({
    ...request,
    headers: { cookie: `invoicing_session=${other}` },
  });

  expect(absent).toMatchObject({ action: 'reject', status: 401 });
  expect(unknown).toMatchObject({ action: 'reject', status: 401 });
  expect(duplicate).toMatchObject({ action: 'reject', status: 401 });
  expect(foreign).toMatchObject({ action: 'reject', status: 422 });
});

test('middleware validates the route and schema before exposing tools', () => {
  const { middleware, request } = setup();

  expect(middleware({ ...request, method: 'GET' })).toMatchObject({
    action: 'reject',
  });
  expect(middleware({ ...request, routeId: '/other' })).toMatchObject({
    action: 'reject',
  });
  expect(
    middleware({ ...request, body: { ...body, hashbrown: {} } }),
  ).toMatchObject({ action: 'reject', status: 422 });
});

test('middleware tools ignore extra amounts and invalidate reads after reset', () => {
  const { store, owner, middleware, request } = setup();
  const result = middleware(request);
  if (result.action !== 'continue') throw new Error('Expected trusted tools');
  const candidate = {
    invoiceId: 'invoice-001',
    amountCents: 1,
    paymentId: 'foreign',
  };

  const proposal = result.context.prepareAllocation(candidate);
  store.reset(owner);

  expect(proposal.amountCents).toBe(240000);
  expect(proposal.paymentId).toBe('payment-001');
  expect(() => result.context.readPayment()).toThrow('stale_generation');
});
