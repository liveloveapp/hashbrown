import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from './assistant-middleware';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';

const services = (async () => {
  const repositories = await repositoriesFromEnv();
  const store = createSessionStore(repositories.sessions, createSampleLedger);
  const reviews = createReviewCoordinator(
    store,
    repositories.threads,
    invoicingUiResponseSchema,
  );
  return {
    assistant: createAssistantMiddleware(store, repositories.threads),
    review: createReviewMiddleware(store, reviews),
    claimThread: createThreadOwnershipGuard(store, repositories.threads),
  };
})();

/** Session-scoped authorization for the assistant and review routes. */
export default defineMiddleware(async (request) => {
  const { assistant, review, claimThread } = await services;
  const result =
    request.routeId === '/assistant'
      ? await assistant(request)
      : await review(request);
  if (result.action !== 'continue') return reject(result.status, result.body);
  try {
    await claimThread(request.headers, request.routeId, request.body);
  } catch {
    return reject(422, { error: 'invalid_thread' });
  }
  return allow(result.context);
});
