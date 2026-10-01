import { expect, test } from 'vitest';
import { createSessionStore } from './session-store';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { reviewTools } from './review-tools';
import { createMemoryRepositories } from './persistence/memory';

async function setup() {
  const repositories = createMemoryRepositories();
  const store = createSessionStore(repositories.sessions);
  const owner = await store.createSession();
  const schema = { type: 'object', properties: { ui: { type: 'array' } } };
  const reviews = createReviewCoordinator(store, repositories.threads, schema);
  const result = await createReviewMiddleware(
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

test('validates middleware functions before tool access', async () => {
  const { middleware } = await setup();

  const result = reviewTools({ middleware });

  expect(result).toBe(middleware);
  for (const invalid of [
    undefined,
    {},
    { middleware: {} },
    { middleware: { ...middleware, applyAllocation: 'apply' } },
    { middleware: { ...middleware, prepareAllocation: undefined } },
  ]) {
    expect(() => reviewTools(invalid)).toThrow('invalid_review_middleware');
  }
});
