import { allow, defineMiddleware, reject } from '@b4run/sdk';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from './assistant-middleware';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';

interface Services {
  readonly assistant: ReturnType<typeof createAssistantMiddleware>;
  readonly review: ReturnType<typeof createReviewMiddleware>;
  readonly claimThread: ReturnType<typeof createThreadOwnershipGuard>;
}

/** Errors the ownership guard raises about the request itself, rather than about storage. */
const guardErrors = ['invalid_thread', 'thread_binding_conflict'];

async function build(): Promise<Services> {
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
}

let services: Promise<Services> | undefined;

/** Build once per process, but let a failed cold start be retried by the next request. */
function getServices(): Promise<Services> {
  services ??= build().catch((error: unknown) => {
    services = undefined;
    throw error;
  });
  return services;
}

/** Session-scoped authorization for the assistant and review routes. */
export default defineMiddleware(async (request) => {
  const { assistant, review, claimThread } = await getServices();
  const result =
    request.routeId === '/assistant'
      ? await assistant(request)
      : await review(request);
  if (result.action !== 'continue') return reject(result.status, result.body);
  try {
    await claimThread(request.headers, request.routeId, request.body);
  } catch (error) {
    if (error instanceof Error && guardErrors.includes(error.message))
      return reject(422, { error: 'invalid_thread' });
    throw error;
  }
  return allow(result.context);
});
