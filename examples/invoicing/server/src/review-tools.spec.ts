import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { prepareAllocationUi, reviewTools } from './review-tools';

function setup() {
  const store = createSessionStore();
  const owner = store.createSession();
  const schema = { type: 'object', properties: { ui: { type: 'array' } } };
  const reviews = createReviewCoordinator(store, schema);
  const result = createReviewMiddleware(
    store,
    reviews,
  )({
    headers: { cookie: `invoicing_session=${owner}` },
    method: 'POST',
    routeId: '/review',
    body: {
      threadId: 'tools-thread',
      runId: 'tools-run',
      state: { selectedPaymentId: 'payment-001' },
      hashbrown: { ui: true, responseSchema: schema },
    },
  });
  if (result.action !== 'continue') throw new Error('Expected middleware');
  return { store, owner, middleware: result.context };
}

test('validates middleware functions and response schema before tool access', () => {
  const { middleware } = setup();

  const result = reviewTools({ middleware });

  expect(result).toBe(middleware);
  for (const invalid of [
    undefined,
    {},
    { middleware: {} },
    { middleware: { ...middleware, responseSchema: null } },
    { middleware: { ...middleware, applyAllocation: 'apply' } },
  ]) {
    expect(() => reviewTools(invalid)).toThrow('invalid_review_middleware');
  }
});

test('renders the exact server proposal through the supplied schema without applying it', async () => {
  const { middleware, store, owner } = setup();
  let rendered = false;

  const proposal = await prepareAllocationUi(
    middleware,
    { invoiceId: 'invoice-001' },
    async (schema, expected) => {
      expect(schema).toBe(middleware.responseSchema);
      rendered = true;
      return {
        ui: [
          {
            AllocationProposal: { props: { proposalId: expected.proposalId } },
          },
        ],
      };
    },
  );

  expect(rendered).toBe(true);
  expect(proposal.invoiceId).toBe('invoice-001');
  expect(proposal.amountCents).toBe(240000);
  expect(store.snapshot(owner).allocations).toHaveLength(0);
});

test('rejects generated UI with missing, duplicated, or substituted proposal identity', async () => {
  const { middleware } = setup();

  const proposal = middleware.prepareAllocation({ invoiceId: 'invoice-001' });
  const component = {
    AllocationProposal: { props: { proposalId: proposal.proposalId } },
  };

  for (const ui of [
    [],
    [component, component],
    [{ AllocationProposal: { props: { proposalId: 'forged' } } }],
    [
      {
        AllocationProposal: {
          props: { proposalId: proposal.proposalId, amountCents: 1 },
        },
      },
    ],
  ]) {
    await expect(
      prepareAllocationUi(
        middleware,
        { invoiceId: 'invoice-001' },
        async () => ({ ui }),
      ),
    ).rejects.toThrow('invalid_allocation_ui');
  }
});

test('propagates model failure without applying an allocation', async () => {
  const { middleware, store, owner } = setup();

  await expect(
    prepareAllocationUi(middleware, { invoiceId: 'invoice-001' }, async () => {
      throw new Error('model_unavailable');
    }),
  ).rejects.toThrow('model_unavailable');

  expect(store.snapshot(owner).allocations).toHaveLength(0);
});
