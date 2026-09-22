import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { createAssistantMiddleware } from './assistant-middleware';
import { repositoriesFromEnv } from './persistence/from-env';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSampleLedger } from './sample-ledger';
import { createSessionStore } from './session-store';
import { createThreadOwnershipGuard } from './thread-ownership';

export interface Services {
  readonly store: ReturnType<typeof createSessionStore>;
  readonly reviews: ReturnType<typeof createReviewCoordinator>;
  readonly assistant: ReturnType<typeof createAssistantMiddleware>;
  readonly review: ReturnType<typeof createReviewMiddleware>;
  readonly claimThread: ReturnType<typeof createThreadOwnershipGuard>;
}

async function build(): Promise<Services> {
  const repositories = await repositoriesFromEnv();
  const store = createSessionStore(repositories.sessions, createSampleLedger());
  const reviews = createReviewCoordinator(
    store,
    repositories.threads,
    invoicingUiResponseSchema,
  );
  return {
    store,
    reviews,
    assistant: createAssistantMiddleware(store, repositories.threads),
    review: createReviewMiddleware(store, reviews),
    claimThread: createThreadOwnershipGuard(store, repositories.threads),
  };
}

let services: Promise<Services> | undefined;

/**
 * The one place this server is assembled. Both entry points — the agent
 * middleware and the `/api` function — read through here, so they share a
 * session store rather than building one each and relying on the repositories
 * underneath them being the same instance.
 *
 * Built once per process, but a failed cold start is retried by the next
 * request instead of poisoning every later one with the same rejection.
 */
export function getServices(): Promise<Services> {
  services ??= build().catch((error: unknown) => {
    services = undefined;
    throw error;
  });
  return services;
}
